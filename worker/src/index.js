// Club FM contributor accounts. Runs on Cloudflare Workers with one KV namespace (ACCOUNTS).
//
// Routes
//   GET  /login            start Discord sign-in
//   GET  /callback         Discord sends the person back here; a signed session cookie is set
//   POST /logout
//   GET  /me               the signed-in account (name, avatar, ign, paypal set?, link code, watchers)
//   POST /me               update ign, paypal email, adult checkbox
//   POST /link             a watcher binds itself to an account with the code the account page shows
//   GET  /twitch/login     connect a Twitch channel to the signed-in account (verified streamers earn)
//   GET  /twitch/callback  Twitch sends the person back here
//   POST /twitch/unlink
//   GET  /public/links     scanner tag -> in-game name, for the earn page's ranking (no other data)
//   GET  /admin            owner only: every account, for review and the weekly statement
//   POST /admin/note       owner only: set a note or lock on an account
//
// Storage (KV): acct:<discord id> -> account JSON; code:<link code> -> discord id; watcher:<hid> -> discord id
// Nothing here holds a watcher's real id or key: the watcher sends hid (its hashed id), and keys are masked.

import { statReport, densify, itemdb } from "./statcheck.js";
import { cleanAlert, runAlerts, reindex, ALERT_MAX } from "./alerts.js";
import { fastPut, fastPulled, fastDocs } from "./fast.js";
import { marketRoute, marketSync, marketCheck, marketShare, marketStats, setRows, snapShops, shopGet, marketCommand } from "./market.js";
const DISCORD = "https://discord.com/api/v10";
const COOKIE = "fm_session";
const DAY = 86400;
const GUILD = "1562552872606892132";   // the Club FM Discord server
const TIERS = [[100000, "Mythic"], [50000, "Titan"], [25000, "Immortal"], [10000, "Legend"], [5000, "Monarch"], [2500, "Royal"], [1000, "Tycoon"], [400, "Broker"], [150, "Trader"], [50, "Merchant"], [10, "Apprentice"], [0, "Scout"]];
const MEGA_AT = 50000;   // sales caught that earn the Mega Deals role, the same perk the $100 Ko-fi tier gets

export default {
  async scheduled(ev, env, ctx) {
    // Reddit watch runs on its own trigger so it gets its own budget of outside requests
    if (ev.cron === REDDIT_CRON) { ctx.waitUntil(redditWatch(env).catch((e) => env.ACCOUNTS.put("reddit:err", String(e && e.stack || e).slice(0, 500)))); return; }
    // every 5 minutes: watchlist DMs; on the hourly run: the role sync too
    ctx.waitUntil(notifyWatchers(env));
    ctx.waitUntil(watchdogAlert(env).catch(() => {}));
    ctx.waitUntil(dealFeedPublic(env).catch(() => {}));
    ctx.waitUntil(kofiRoleWatch(env).catch(() => {}));
    ctx.waitUntil(trafficPost(env).catch(() => {}));
    ctx.waitUntil(marketSync(env, mkCtx(env)).catch(() => {}));
    ctx.waitUntil(statReport(env, { dm: (m) => mkCtx(env).dmAdmins(m, "Club FM stat check") }).catch(() => {}));
    if (!ev.cron || /^17 /.test(ev.cron)) ctx.waitUntil(syncRoles(env));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const cors = corsHeaders(env, origin);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const r = await route(req, env, url);
      for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
      return r;
    } catch (e) {
      return json({ error: "server", detail: String(e && e.message || e) }, 500, cors);
    }
  },
};

async function route(req, env, url) {
  const p = url.pathname.replace(/\/+$/, "") || "/";
  if (p === "/" ) return json({ ok: true, service: "clubfm-accounts" });
  if (p === "/login") return login(req, env, url);
  if (p === "/callback") return callback(req, env, url);
  if (p === "/logout" && req.method === "POST") return logout(env);
  if (p === "/me" && req.method === "GET") return me(req, env);
  if (p === "/me" && req.method === "POST") return updateMe(req, env);
  if (p === "/me/quests" && req.method === "GET") return getQuests(req, env);
  if (p === "/me/quests" && req.method === "POST") return putQuests(req, env);
  if (p === "/me/build" && req.method === "GET") return getBuild(req, env);
  if (p === "/me/build" && req.method === "POST") return putBuild(req, env);
  if (p === "/watcher/quests" && req.method === "POST") return watcherQuests(req, env);
  if (p === "/me/alerts" && req.method === "GET") return alertsGet(req, env);
  if (p === "/me/alerts" && req.method === "POST") return alertsPut(req, env);
  if (p === "/me/settings" && req.method === "GET") return getSettings(req, env);
  if (p === "/me/settings" && req.method === "POST") return putSettings(req, env);
  if (p === "/link" && req.method === "POST") return link(req, env);
  if (p === "/twitch/login") return twitchLogin(req, env, url);
  if (p === "/twitch/callback") return twitchCallback(req, env, url);
  if (p === "/twitch/unlink" && req.method === "POST") return twitchUnlink(req, env);
  if (p === "/market/stats" && req.method === "GET") return json(await marketStats(env, Number(url.searchParams.get("days") || 7)), 200, { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" });
  if (p.startsWith("/l/") && req.method === "GET") return marketShare(env, p.slice(3));
  if (p === "/shop" && req.method === "GET") return shopGet(env, url);
  if (p === "/market" || p.startsWith("/market/")) return marketRoute(req, env, url, p, Object.assign(mkCtx(env), { rows: await mkRows(env) }));
  if (p === "/admin/stats-report") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await statReport(env, { force: true, dm: url.searchParams.get("dm") ? (m) => mkCtx(env).dmAdmins(m, "Club FM stat check") : null }), 200, { "Cache-Control": "no-store" }); }
  if (p === "/admin/market" && req.method === "GET") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await marketCheck(env), 200, { "Cache-Control": "no-store" }); }
  if (p === "/admin/market/sync" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await marketSync(env, mkCtx(env))); }
  if (p === "/data/live" && req.method === "GET") return dataLive(req, env);
  if (p === "/data/snap" && req.method === "GET") return dataSnap(env);
  if (p === "/data/snap-status" && req.method === "GET") return json((await env.ACCOUNTS.get("snap:last", "json")) || {}, 200, { "Cache-Control": "no-store" });
  if (p === "/snap" && req.method === "POST") return snapPut(req, env);
  if (p === "/data/sig" && req.method === "GET") return dataSig(env);
  if (p === "/inbox" && req.method === "POST") return inboxPost(req, env);
  if (p === "/tipimg" && req.method === "POST") return tipImgPut(req, env);
  if (p.startsWith("/tipimg/") && req.method === "GET") return tipImgGet(p, env);
  if (p === "/missimg" && req.method === "POST") return missPut(req, env);
  if (p === "/inbox/miss" && req.method === "GET") return missList(req, env, url);
  if (p.startsWith("/inbox/miss/") && req.method === "GET") return missGet(req, env, p);
  if (p === "/wrongprice" && req.method === "POST") return wrongPut(req, env);
  if (p === "/inbox/wrong" && req.method === "GET") return wrongList(req, env, url);
  if (p === "/inbox/pull" && req.method === "GET") return inboxPull(req, env, url);
  if (p === "/inbox/fast" && req.method === "GET") return inboxFast(req, env);
  if (p === "/inbox/rejects" && req.method === "GET") return inboxRejects(req, env);
  if (p === "/chat/price" && req.method === "GET") return chatPrice(req, env, url);
  if (p === "/hit" && req.method === "POST") return hit(req, env);
  if (p === "/reddit/push" && req.method === "POST") return redditPush(req, env);
  if (p === "/admin/reddit" && req.method === "GET") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); const st = (await env.ACCOUNTS.get("reddit:state", "json")) || {}; if (url.searchParams.get("log")) return json((await env.ACCOUNTS.get("reddit:log", "json")) || []); return json({ at: st.at, lastOk: st.lastOk, status: st.status, fails: st.fails, seen: (st.seen || []).length }, 200, { "Cache-Control": "no-store" }); }
  if (p === "/admin/traffic" && req.method === "GET") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); const h = Number(url.searchParams.get("h") || 24); return json(await trafficStats(env, Date.now() - h * 3600e3, Date.now()), 200, { "Cache-Control": "no-store" }); }
  if (p === "/me/digest/test" && req.method === "POST") { const me = await whoami(req, env); if (!me) return json({ error: "sign in" }, 401); if (overLimit("dg:" + me.id, 3, 3600)) return json({ error: "slow down" }, 429); return json(await watchDigest(env, String(me.id))); }
  if (p === "/admin/score/post" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await morningScore(env, true)); }
  if (p === "/admin/weekly/post" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); const n = Date.now(); await env.ACCOUNTS.delete("weekly:sent:" + etParts(n).day); await weeklyTraffic(env, n); return json({ ok: true }); }
  if (p === "/admin/rdraft/post" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); await env.ACCOUNTS.delete("rdraft:sent:" + etParts(Date.now()).day); await redditDraft(env); return json(JSON.parse((await env.ACCOUNTS.get("rdraft:last")) || "{}")); }
  if (p === "/admin/traffic/post" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); { const n = Date.now(), e = etParts(n); return json(await trafficSend(env, n - 3600e3, n, "Traffic, last hour (test)", n - (e.hour * 60 + e.minute) * 60e3)); } }
  if (p === "/r" && req.method === "POST") return refHit(req, env, url);
  if (p === "/twitchbot/connect") return tbConnect(req, env, url);
  if (p === "/twitchbot/callback") return tbCallback(req, env, url);
  if (p === "/twitchbot/eventsub" && req.method === "POST") return tbEventsub(req, env);
  if (p === "/admin/twitchbot" && req.method === "GET") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await tbStatus(env), 200, { "Cache-Control": "no-store" }); }
  if (p === "/admin/refs" && req.method === "GET") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await refStats(env, url), 200, { "Cache-Control": "no-store" }); }
  if (p === "/public/links") return publicLinks(env);
  if (p === "/public/supporters") return publicSupporters(env);
  if (p === "/public/stats") return publicStats(env);
  if (p === "/public/scanners") return publicScanners(env);
  if (p === "/public/popular") return publicPopular(env);
  if (p === "/gone" && req.method === "POST") return gonePost(req, env);
  if (p === "/public/gone") return goneList(env);
  if (p === "/admin/gone-need" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); const n = Math.max(1, Math.min(20, Number(url.searchParams.get("n")) || 3)); await env.ACCOUNTS.put("gone:need", String(n)); return json({ need: n }); }
  if (p === "/public/kofi-income") return kofiIncome(env);
  if (p === "/interactions" && req.method === "POST") return interactions(req, env);
  if (p === "/admin" && req.method === "GET") return admin(req, env);
  if (p === "/admin/note" && req.method === "POST") return adminNote(req, env);
  if (p === "/admin/markcheck" && req.method === "POST") return markCheck(req, env);
  if (p === "/admin/channels" && req.method === "GET") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await channelAccess(env), 200, { "Cache-Control": "no-store" }); }
  if (p === "/admin/chanperm" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); let b = null; try { b = await req.json(); } catch (e) {} if (!b || !/^\d+$/.test(String(b.channel)) || !/^\d+$/.test(String(b.target))) return json({ error: "bad" }, 400); const r = await fetch(DISCORD + "/channels/" + b.channel + "/permissions/" + b.target, { method: "PUT", headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ type: b.type === 1 ? 1 : 0, allow: String(b.allow || "0"), deny: String(b.deny || "0") }) }); return json({ status: r.status, body: r.ok ? null : await r.text() }); }
  if (p === "/admin/channel-intros" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await channelIntros(env)); }
  if (p === "/admin/watchdog/test" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await watchdogTest(me, env)); }
  if (p === "/admin/brand/fix" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await brandFix(req, env)); }
  if (p === "/admin/brand" && req.method === "GET") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await brandAudit(env), 200, { "Cache-Control": "no-store" }); }
  if (p === "/admin/voice" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await privateVoice(req, env)); }
  if (p === "/kofi" && req.method === "POST") return kofi(req, env);
  if (p === "/admin/setup-commands" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await setupCommands(env)); }
  if (p === "/admin/setup-roles" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await setupRoles(env)); }
  if (p === "/admin/hooks" && req.method === "GET") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); return json(await hookPack(env), 200, { "Cache-Control": "no-store" }); }
  if (p === "/admin/sync-roles" && req.method === "POST") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); await syncRoles(env); return json({ ok: true }); }
  return json({ error: "not found" }, 404);
}

// ---------------------------------------------------------------- sign-in
function login(req, env, url) {
  const state = randomHex(16);
  const back = new URL(DISCORD.replace("/api/v10", "") + "/oauth2/authorize");
  back.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  back.searchParams.set("redirect_uri", url.origin + "/callback");
  back.searchParams.set("response_type", "code");
  back.searchParams.set("scope", "identify guilds.members.read");
  back.searchParams.set("state", state);
  back.searchParams.set("prompt", "none");
  const h = new Headers({ Location: back.toString() });
  h.append("Set-Cookie", `fm_state=${state}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax`);
  h.append("Set-Cookie", `fm_back=${["home", "quests", "market", "shop", "scan"].includes(url.searchParams.get("back")) ? url.searchParams.get("back") : "earn"}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax`);
  return new Response(null, { status: 302, headers: h });
}

async function callback(req, env, url) {
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  const want = cookie(req, "fm_state");
  if (!code || !state || state !== want) return text("Sign-in didn't complete. Go back to maplefm.gg/earn and try again.", 400);
  const body = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: url.origin + "/callback" });
  const tok = await (await fetch(DISCORD + "/oauth2/token", { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } })).json();
  if (!tok.access_token) return text("Discord didn't accept the sign-in. Try again.", 400);
  const u = await (await fetch(DISCORD + "/users/@me", { headers: { Authorization: "Bearer " + tok.access_token } })).json();
  if (!u.id) return text("Couldn't read your Discord account.", 400);
  const key = "acct:" + u.id;
  const acct = (await env.ACCOUNTS.get(key, "json")) || { id: u.id, created: now(), watchers: [], ign: "", paypal: "", adult: false, paypalChanged: 0, locked: false, note: "" };
  acct.name = u.global_name || u.username || "";
  acct.username = u.username || "";
  acct.avatar = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : "";
  acct.discordCreated = snowflakeTime(u.id);
  acct.lastSeen = now();
  // roles in the Club FM server: the Club role unlocks club features on the site, no key needed
  try {
    const m = await (await fetch(DISCORD + "/users/@me/guilds/" + GUILD + "/member", { headers: { Authorization: "Bearer " + tok.access_token } })).json();
    acct.roles = Array.isArray(m.roles) ? m.roles : [];
    if (m.user) acct.inGuild = true;
    else if (m.code === 10004) acct.inGuild = false;   // Unknown Guild: not a member; anything else (old scope, hiccup) leaves it unknown
    else delete acct.inGuild;
  } catch (e) { acct.roles = acct.roles || []; }
  if (!acct.code) acct.code = await newCode(env, u.id);
  await env.ACCOUNTS.put(key, JSON.stringify(acct));
  const session = await sign(env.SESSION_SECRET, u.id + "|" + (now() + 30 * DAY));
  const h = new Headers({ Location: env.SITE + ({ home: "/#signed-in", quests: "/quests.html#signed-in", market: "/market.html#signed-in", shop: "/shop.html#signed-in", scan: "/scan/#signed-in" }[cookie(req, "fm_back")] || "/earn.html#signed-in") + "&fmt=" + encodeURIComponent(session) });
  h.append("Set-Cookie", `${COOKIE}=${session}; Path=/; Max-Age=${30 * DAY}; Secure; HttpOnly; SameSite=None`);
  h.append("Set-Cookie", `fm_state=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);
  return new Response(null, { status: 302, headers: h });
}

function logout() {
  const h = new Headers({ "Content-Type": "application/json" });
  h.append("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=None`);
  return new Response(JSON.stringify({ ok: true }), { headers: h });
}

async function whoami(req, env) {
  const c = sessTok(req);
  if (!c) return null;
  const payload = await verify(env.SESSION_SECRET, c);
  if (!payload) return null;
  const [id, exp] = payload.split("|");
  if (!id || Number(exp) < now()) return null;
  return env.ACCOUNTS.get("acct:" + id, "json");
}

// ---------------------------------------------------------------- site settings, kept with the account
// The price board's own settings (watchlist, positions, filters, theme...) as one small JSON blob, so a
// cleared browser or a second PC gets them back after signing in.
async function getSettings(req, env) {
  const a = await whoami(req, env);
  if (!a) return json({ signedIn: false });
  const s = (await env.ACCOUNTS.get("settings:" + a.id, "json")) || { settings: {}, updated: 0 };
  return json({ signedIn: true, settings: s.settings || {}, updated: s.updated || 0 });
}

async function putSettings(req, env) {
  const a = await whoami(req, env);
  if (!a) return json({ error: "sign in first" }, 401);
  const raw = await req.text();
  if (raw.length > 60000) return json({ error: "too big" }, 413);
  let b; try { b = JSON.parse(raw); } catch (e) { return json({ error: "bad json" }, 400); }
  if (!b || typeof b.settings !== "object") return json({ error: "bad body" }, 400);
  const updated = now();
  await env.ACCOUNTS.put("settings:" + a.id, JSON.stringify({ settings: b.settings, updated }));
  return json({ ok: true, updated });
}

// ---------------------------------------------------------------- the account page
// Club access on the site comes from one Discord role only: the one named "Club". Nothing else counts,
// not Crown, not the tier roles the bot hands out. Who holds that role is up to the server owner.
// Two roles open the deals: "Club" (the owner's door, handed out by hand) and "Mega Deals" (earned at
// MEGA_AT sales caught, or the $100 Ko-fi tier through Ko-fi's Discord link). Nothing else counts.
async function clubRoleIds(env) {
  const cached = await env.ACCOUNTS.get("clubroles2", "json");
  if (cached) return cached;
  if (!env.DISCORD_BOT_TOKEN) return [];
  const roles = await (await fetch(DISCORD + "/guilds/" + GUILD + "/roles", { headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN } })).json().catch(() => null);
  const ids = Array.isArray(roles) ? roles.filter(x => ["club", "mega deals"].includes(x.name.toLowerCase())).map(x => x.id) : [];
  if (ids.length) await env.ACCOUNTS.put("clubroles2", JSON.stringify(ids), { expirationTtl: 3600 });
  return ids;
}

async function isClub(a, env) {
  if (!a) return false;
  if (isAdmin(a, env)) return true;
  const ids = await clubRoleIds(env);
  return (a.roles || []).some(r => ids.includes(r));
}

function publicView(a) {
  return { id: a.id, name: a.name, avatar: a.avatar, ign: a.ign, paypalSet: !!a.paypal, paypalHint: a.paypal ? maskEmail(a.paypal) : "", adult: !!a.adult,
           code: a.code, watchers: (a.watchers || []).map(w => ({ tag: w.hid.slice(0, 4), linked: w.at })), created: a.created, locked: !!a.locked,
           payoutHold: a.paypalChanged && now() - a.paypalChanged < 7 * DAY ? a.paypalChanged + 7 * DAY : 0,
           twitch: a.twitch ? { login: a.twitch.login, name: a.twitch.name } : null };
}

async function me(req, env) {
  const a = await whoami(req, env);
  if (!a) return json({ signedIn: false });
  const v = publicView(a); v.club = await isClub(a, env); v.inGuild = a.inGuild === undefined ? null : !!a.inGuild;
  await logSignin(env, a.id).catch(() => {});
  return json({ signedIn: true, account: v });
}

async function updateMe(req, env) {
  const a = await whoami(req, env);
  if (!a) return json({ error: "sign in first" }, 401);
  const b = await req.json().catch(() => ({}));
  if (typeof b.ign === "string") a.ign = b.ign.replace(/[^A-Za-z0-9]/g, "").slice(0, 13);
  if (typeof b.paypal === "string") {
    const v = b.paypal.trim().toLowerCase();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return json({ error: "That doesn't look like an email address." }, 400);
    if (v !== a.paypal) { a.paypal = v; a.paypalChanged = now(); }   // a changed handle holds payouts for 7 days
  }
  if (typeof b.adult === "boolean") a.adult = b.adult;
  a.updated = now();
  await env.ACCOUNTS.put("acct:" + a.id, JSON.stringify(a));
  return json({ ok: true, account: publicView(a) });
}

// ---------------------------------------------------------------- Twitch verification
// A streamer signs in with Discord first, then connects Twitch here. Only the Twitch login and id are kept.
// The Stream Reader's captures from that channel then earn like a watcher's scans (credits.py reads
// /public/links, where the stream shows up as "stream:<login>").
async function twitchLogin(req, env, url) {
  const a = await whoami(req, env);
  if (!a) return text("Sign in with Discord on maplefm.gg first, then connect Twitch.", 401);
  if (!env.TWITCH_CLIENT_ID) return text("Twitch connect isn't switched on yet.", 503);
  const state = randomHex(16);
  const back = new URL("https://id.twitch.tv/oauth2/authorize");
  back.searchParams.set("client_id", env.TWITCH_CLIENT_ID);
  back.searchParams.set("redirect_uri", url.origin + "/twitch/callback");
  back.searchParams.set("response_type", "code");
  back.searchParams.set("scope", "");
  back.searchParams.set("state", state);
  const h = new Headers({ Location: back.toString() });
  h.append("Set-Cookie", `fm_tstate=${state}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax`);
  return new Response(null, { status: 302, headers: h });
}

async function twitchCallback(req, env, url) {
  const a = await whoami(req, env);
  if (!a) return text("Sign in with Discord on maplefm.gg first, then connect Twitch.", 401);
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (!code || !state || state !== cookie(req, "fm_tstate")) return text("Twitch connect didn't complete. Go back to maplefm.gg/earn and try again.", 400);
  const body = new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: url.origin + "/twitch/callback" });
  const tok = await (await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } })).json();
  if (!tok.access_token) return text("Twitch didn't accept the connection. Try again.", 400);
  const u = await (await fetch("https://api.twitch.tv/helix/users", { headers: { Authorization: "Bearer " + tok.access_token, "Client-Id": env.TWITCH_CLIENT_ID } })).json();
  const me = u && u.data && u.data[0];
  if (!me || !me.login) return text("Couldn't read your Twitch account.", 400);
  // one Twitch channel belongs to one account
  const owner = await env.ACCOUNTS.get("twitch:" + me.login.toLowerCase());
  if (owner && owner !== a.id) return text("That Twitch channel is already connected to another account.", 409);
  if (a.twitch && a.twitch.login && a.twitch.login !== me.login.toLowerCase()) await env.ACCOUNTS.delete("twitch:" + a.twitch.login);
  a.twitch = { login: me.login.toLowerCase(), id: me.id, name: me.display_name || me.login, at: now() };
  await env.ACCOUNTS.put("acct:" + a.id, JSON.stringify(a));
  await env.ACCOUNTS.put("twitch:" + a.twitch.login, a.id);
  const h = new Headers({ Location: env.SITE + "/earn.html#signed-in" });
  h.append("Set-Cookie", `fm_tstate=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`);
  return new Response(null, { status: 302, headers: h });
}

async function twitchUnlink(req, env) {
  const a = await whoami(req, env);
  if (!a) return json({ error: "sign in first" }, 401);
  if (a.twitch && a.twitch.login) await env.ACCOUNTS.delete("twitch:" + a.twitch.login);
  delete a.twitch;
  await env.ACCOUNTS.put("acct:" + a.id, JSON.stringify(a));
  return json({ ok: true, account: publicView(a) });
}

// ---------------------------------------------------------------- watcher linking
async function link(req, env) {
  const b = await req.json().catch(() => ({}));
  const code = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const hid = String(b.hid || "");
  if (code.length !== 6 || !/^[0-9a-f]{16}$/.test(hid)) return json({ error: "bad request" }, 400);
  const id = await env.ACCOUNTS.get("code:" + code);
  if (!id) return json({ error: "That code isn't valid. Open your account page on maplefm.gg/earn for the current one." }, 404);
  const a = await env.ACCOUNTS.get("acct:" + id, "json");
  if (!a) return json({ error: "account missing" }, 404);
  const owner = await env.ACCOUNTS.get("watcher:" + hid);
  if (owner && owner !== id) return json({ error: "This watcher is already linked to another account." }, 409);
  a.watchers = a.watchers || [];
  if (!a.watchers.some(w => w.hid === hid)) a.watchers.push({ hid, at: now() });
  a.code = await newCode(env, id, code);   // a code works once
  await env.ACCOUNTS.put("acct:" + id, JSON.stringify(a));
  await env.ACCOUNTS.put("watcher:" + hid, id);
  return json({ ok: true, name: a.name, ign: a.ign });
}

async function newCode(env, id, old) {
  if (old) await env.ACCOUNTS.delete("code:" + old);
  const code = randomCode();
  await env.ACCOUNTS.put("code:" + code, id, { expirationTtl: 30 * DAY });
  return code;
}

async function publicLinks(env) {
  // scanner tag (first 4 of the hashed watcher id) -> in-game name the person chose to show
  const out = {};
  let cursor;
  do {
    const page = await env.ACCOUNTS.list({ prefix: "acct:", cursor });
    for (const k of page.keys) {
      const a = await env.ACCOUNTS.get(k.name, "json");
      if (!a || !a.ign) continue;
      // the owner's and site names can't be claimed by typing them in: only an admin account links under them
      if (["maya", "streams", "guest", "clubfm"].includes(a.ign.toLowerCase()) && !isAdmin(a, env)) continue;
      for (const w of a.watchers || []) out[w.hid.slice(0, 4)] = a.ign;
      if (a.twitch && a.twitch.login) out["stream:" + a.twitch.login] = a.ign;   // a verified streamer's captures earn under this name
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return json(out, 200, { "Cache-Control": "public, max-age=300" });
}

// Who supports Club FM on Ko-fi, by in-game name: the highest tier role each account holds in the Discord, plus
// lifetime supporters. For the heart on the ranks board and the supporters wall. Nothing else leaves here.
const KOFI_TIERS = ["beta tester", "fangblade", "tiger", "curryishott", "suuushi"];
function tierLabel(t) { return t.replace(/\b\w/g, c => c.toUpperCase()).replace("Fangblade", "FangBlade").replace("Curryishott", "curryishott"); }
async function publicSupporters(env) {
  const out = [], seen = new Set();
  if (env.DISCORD_BOT_TOKEN) {
    const roles = await (await fetch(DISCORD + "/guilds/" + GUILD + "/roles", { headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN }, cf: { cacheTtl: 600 } })).json().catch(() => []);
    const byId = {}; if (Array.isArray(roles)) for (const r of roles) byId[r.id] = r.name.toLowerCase();
    let cursor;
    do {
      const page = await env.ACCOUNTS.list({ prefix: "acct:", cursor });
      for (const k of page.keys) {
        const a = await env.ACCOUNTS.get(k.name, "json");
        if (!a || !a.inGuild) continue;
        const names = (a.roles || []).map(id => byId[id]).filter(Boolean);
        const tier = KOFI_TIERS.find(t => names.includes(t));
        const lifetime = Number(a.kofiTotal || 0) >= KOFI_MEGA;
        if (!tier && !lifetime) continue;
        seen.add(a.id);
        out.push({ ign: a.ign || "", name: a.name || "", tier: tier ? tierLabel(tier) : "", lifetime });
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
    // supporters who haven't signed in on the site yet go up under their Discord name; signing in swaps in their IGN
    let after = "0";
    for (let pg = 0; pg < 5; pg++) {
      const ms = await (await fetch(DISCORD + "/guilds/" + GUILD + "/members?limit=1000&after=" + after, { headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN } })).json().catch(() => null);
      if (!Array.isArray(ms) || !ms.length) break;
      for (const m of ms) {
        if (!m.user || m.user.bot || seen.has(m.user.id)) continue;
        const names = (m.roles || []).map(id => byId[id]).filter(Boolean);
        const tier = KOFI_TIERS.find(t => names.includes(t));
        if (!tier) continue;
        out.push({ ign: "", name: m.nick || m.user.global_name || m.user.username || "", tier: tierLabel(tier), lifetime: false });
      }
      after = ms[ms.length - 1].user.id;
      if (ms.length < 1000) break;
    }
  }
  return json(out, 200, { "Cache-Control": "public, max-age=600" });
}

// Numbers for the header: Discord members and how many are online, cached ten minutes. Nothing per person.
async function publicStats(env) {
  const cached = await env.ACCOUNTS.get("stats", "json");
  if (cached && now() - (cached.at || 0) < 600) return json(cached, 200, { "Cache-Control": "public, max-age=300" });
  const out = { at: now(), members: 0, online: 0, accounts: 0 };
  if (env.DISCORD_BOT_TOKEN) {
    const g = await (await fetch(DISCORD + "/guilds/" + GUILD + "?with_counts=true", { headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN } })).json().catch(() => null);
    if (g) { out.members = g.approximate_member_count || 0; out.online = g.approximate_presence_count || 0; }
  }
  let cursor, n = 0;
  do { const page = await env.ACCOUNTS.list({ prefix: "acct:", cursor }); n += page.keys.length; cursor = page.list_complete ? null : page.cursor; } while (cursor);
  out.accounts = n;
  await env.ACCOUNTS.put("stats", JSON.stringify(out), { expirationTtl: 3600 });
  return json(out, 200, { "Cache-Control": "public, max-age=300" });
}

// Ko-fi income over the last four weeks, totals only. The pump reads it so the weekly Earn budget can follow support.
async function kofiIncome(env) {
  const since = now() - 28 * DAY, months = new Set();
  for (let k = 0; k < 2; k++) { const d = new Date(Date.now() - k * 28 * DAY * 1000); months.add(d.toISOString().slice(0, 7)); }
  let total = 0, n = 0; const weeks = [0, 0, 0, 0];
  for (const m of months) {
    const log = (await env.ACCOUNTS.get("kofi-log:" + m, "json")) || [];
    for (const e of log) { if (e.t < since) continue; total += e.a; n++; weeks[Math.min(3, Math.floor((now() - e.t) / (7 * DAY)))] += e.a; }
  }
  return json({ days: 28, total: Math.round(total * 100) / 100, payments: n, weeks: weeks.map((w) => Math.round(w * 100) / 100) }, 200, { "Cache-Control": "public, max-age=600" });
}

// ---------------------------------------------------------------- Discord slash commands
// /price <item>: typical price, the asks and the latest sale from the board's summary, in any channel the bot is in.
// Discord signs every request with the app's Ed25519 key (DISCORD_PUBLIC_KEY var); anything unsigned is refused.
// ---------------------------------------------------------------- the private data
// Listings, sellers and pay records live in the private maplefm/clubfm-archive repository. This Worker reads them
// with ARCHIVE_READ (a read-only GitHub token) and hands signed-in members their listings from /data/live.
const ARCH_RAW = "https://raw.githubusercontent.com/maplefm/clubfm-archive/live/";
const LIVE_RAW = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/";
// one cached copy per file for ttl seconds, shared by every member on this Cloudflare location
// The archive's newest commit, checked at most every 10 seconds. Files are then read at that exact commit, so a
// watcher's upload reaches the site within seconds instead of waiting out GitHub's 5-minute raw file cache.
async function archSig(env) {
  const key = new Request("https://archive.cache/sig?b=" + Math.floor(Date.now() / 10000));
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return (await hit.text()) || null;
  if (!env.ARCHIVE_READ) return null;
  const r = await fetch("https://api.github.com/repos/maplefm/clubfm-archive/commits/live", { headers: { Authorization: "token " + env.ARCHIVE_READ, Accept: "application/vnd.github.sha", "User-Agent": "clubfm-worker" } }).catch(() => null);
  const sha = r && r.ok ? (await r.text()).trim().slice(0, 40) : "";
  if (!/^[0-9a-f]{40}$/.test(sha)) return null;
  await cache.put(key, new Response(sha, { headers: { "Cache-Control": "public, max-age=10" } }));
  return sha;
}
async function dataSig(env) {
  const sha = await archSig(env).catch(() => null);
  // the fast lane's newest row moves the stamp too, so open boards fetch a new deal as soon as it lands
  const f = await fastStamp(env);
  return json({ v: (sha ? sha.slice(0, 12) : "") + (f ? "-" + f : ""), at: Date.now() }, 200, { "Cache-Control": "no-store" });
}
async function fastStamp(env) {
  const key = new Request("https://archive.cache/faststamp?b=" + Math.floor(Date.now() / 5000));
  const hit = await caches.default.match(key);
  if (hit) return Number(await hit.text()) || 0;
  const v = (await fastDocs(env)).ver;
  await caches.default.put(key, new Response(String(v), { headers: { "Cache-Control": "public, max-age=5" } })).catch(() => {});
  return v;
}
async function archFetch(env, path, ttl = 60, ref = null) {
  const key = new Request("https://archive.cache/" + path + (ref ? "?ref=" + ref : "?b=" + Math.floor(Date.now() / 1000 / ttl)));
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  if (!env.ARCHIVE_READ) return null;
  const r = await fetch((ref ? ARCH_RAW.replace("/live/", "/" + ref + "/") : ARCH_RAW) + path, { headers: { Authorization: "token " + env.ARCHIVE_READ, "User-Agent": "clubfm-worker" } });
  if (!r.ok) return null;
  const res = new Response(r.body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=" + ttl } });
  await cache.put(key, res.clone());
  return res;
}
async function vaultJSON(env, path, ttl) {
  const r = await archFetch(env, path, ttl || 60);
  return r ? r.json().catch(() => null) : null;
}
// what a member's board loads: the raw scans, joined into one object without parsing them
const MEMBER_FILES = ["watcher.json", "watcher-2.json", "watcher-3.json", "watcher-4.json", "streams.json", "streams-vods.json", "inbox.json",
  "watcher-sell.json", "watcher-2-sell.json", "watcher-3-sell.json", "watcher-4-sell.json"];
// Per-account and per-address limits on the member bundle: the board asks about once every five minutes, a
// script pulling it in a loop gets cut off. Counted per Worker instance, with Cloudflare's limiter on top when bound.
const HITS = new Map();
function overLimit(key, max, windowSec) {
  const t = Math.floor(Date.now() / 1000 / windowSec), k = key + "|" + t, n = (HITS.get(k) || 0) + 1;
  HITS.set(k, n);
  if (HITS.size > 5000) for (const x of HITS.keys()) { if (!x.endsWith("|" + t)) HITS.delete(x); }
  return n > max;
}
async function sessionId(req, env) {
  const c = sessTok(req); if (!c) return null;
  const payload = await verify(env.SESSION_SECRET, c); if (!payload) return null;
  const [id, exp] = payload.split("|");
  return id && Number(exp) >= now() ? id : null;
}
// ---------------------------------------------------------------- the price inbox
// Watchers without a GitHub key post their listings here (signed, compressed, in parts; tools/inbox.py checks
// them). Posts sit in D1 for 15 days and only the pump can read them back, with INBOX_PULL_KEY.
async function inboxPost(req, env) {
  if (!env.INBOX_DB) return json({ error: "inbox offline" }, 503);
  const ip = req.headers.get("CF-Connecting-IP") || "";
  if (overLimit("p:" + ip, 200, 600)) { await inboxReject(env, "slow down"); return json({ error: "slow down" }, 429, { "Retry-After": "120" }); }
  const body = await req.text();
  if (body.length > 60000) { await inboxReject(env, "too big"); return json({ error: "too big" }, 413); }
  let msg = "";
  try { msg = /json/.test(req.headers.get("Content-Type") || "") ? String(JSON.parse(body).m || "") : String(new URLSearchParams(body).get("m") || ""); } catch (e) {}
  let m = null; try { m = JSON.parse(msg); } catch (e) {}
  if (!m || ![1, 2, 3].includes(m.v) || !/^[0-9a-f]{16}$/.test(String(m.id || "")) || typeof m.z !== "string") { await inboxReject(env, "bad post"); return json({ error: "bad post" }, 400); }
  await env.INBOX_DB.prepare("INSERT INTO posts (t, msg) VALUES (?, ?)").bind(Date.now(), msg).run();
  // new shop rows also go to the fast lane, so a deal reaches the board in seconds instead of at the next pump pass
  const blocked = await blockedIds(env);
  await fastPut(env, msg, blocked);
  await scannerSeen(env, m, blocked, new URL(req.url).searchParams.get("via") === "browser" ? "b" : "w");
  return json({ ok: true });
}
// Scanners active right now, FM Watcher and the browser scanner alike: one row per scanner with its last upload
// time. A named scanner counts once even when it runs both; guests count by their hashed id. Blocked ids never count.
let seenMade = false;
async function sha256hex(x) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function scannerSeen(env, m, blocked, via) {
  try {
    const h = (await sha256hex("fm-inbox:" + m.id)).slice(0, 16);
    if (blocked && (blocked.has(h) || blocked.has(m.id))) return;
    const nm = String(m.nm || m.ign || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
    const k = nm && nm !== "guest" ? "n:" + nm : "h:" + h;
    if (!seenMade) {
      await env.INBOX_DB.batch([
        env.INBOX_DB.prepare("CREATE TABLE IF NOT EXISTS seen (k TEXT PRIMARY KEY, t INTEGER NOT NULL)"),
        // one row per scanner, tool (w FM Watcher, b browser) and hour, for the traffic report's scanner counts
        env.INBOX_DB.prepare("CREATE TABLE IF NOT EXISTS scanhr (k TEXT NOT NULL, via TEXT NOT NULL, hr INTEGER NOT NULL, PRIMARY KEY (k, via, hr))"),
      ]);
      seenMade = true;
    }
    await env.INBOX_DB.batch([
      env.INBOX_DB.prepare("INSERT OR REPLACE INTO seen (k, t) VALUES (?, ?)").bind(k, Date.now()),
      env.INBOX_DB.prepare("INSERT OR IGNORE INTO scanhr (k, via, hr) VALUES (?, ?, ?)").bind(k, via || "w", Math.floor(Date.now() / 3600e3)),
    ]);
  } catch (e) {}
}
let liveCache = null;
async function publicScanners(env) {
  if (!liveCache || Date.now() - liveCache.at > 30e3) {
    let live = 0;
    try { const r = await env.INBOX_DB.prepare("SELECT COUNT(*) AS n FROM seen WHERE t > ?").bind(Date.now() - 15 * 60e3).first(); live = r ? r.n : 0; } catch (e) {}
    liveCache = { at: Date.now(), live };
  }
  return json({ live: liveCache.live, window: 15 }, 200, { "Cache-Control": "public, max-age=30" });
}
// Watchers the owner blocked (the archive's data/inbox_block.json, hashed ids), checked again every 10 minutes
async function blockedIds(env) {
  try {
    const r = await archFetch(env, "data/inbox_block.json", 600);
    const a = r ? await r.json() : [];
    return new Set(Array.isArray(a) ? a.map(String) : []);
  } catch (e) { return new Set(); }
}
// Rejected uploads, counted per UTC day and reason (KV inbox:rej:<day>, kept 15 days) for the daily scanner check.
async function inboxReject(env, why) {
  try {
    const k = "inbox:rej:" + new Date().toISOString().slice(0, 10), o = (await env.ACCOUNTS.get(k, "json")) || {};
    o[why] = (o[why] || 0) + 1;
    await env.ACCOUNTS.put(k, JSON.stringify(o), { expirationTtl: 15 * 86400 });
  } catch (e) {}
}
// In-game popups for expensive equips: FM Watcher uploads a small picture of the item's popup the moment it reads it
// (items listed at 500K and up), keyed by the picture's own hash, and puts that hash in the listing's stats. The site
// shows the real popup on hover. Only PNGs the size of a popup are taken; they expire after 30 days.
async function tipImgPut(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || "";
  if (overLimit("ti:" + ip, 120, 600)) return json({ error: "slow down" }, 429);
  if (!/^[0-9a-f]{16}$/.test(req.headers.get("X-Watcher") || "")) return json({ error: "no" }, 403);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length < 200 || buf.length > 160000) return json({ error: "size" }, 413);
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => buf[i] === v);
  const dv = new DataView(buf.buffer), w = png ? dv.getUint32(16) : 0, h = png ? dv.getUint32(20) : 0;
  if (!png || w < 120 || w > 420 || h < 80 || h > 800) return json({ error: "not a popup" }, 400);
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  await env.ACCOUNTS.put("tipimg:" + hash, buf, { expirationTtl: 30 * 86400, metadata: { w, h, t: Date.now() } });
  return json({ ok: true, h: hash });
}
// Readings the watcher couldn't make (an item popup it couldn't read, a room title it couldn't place), sent as small
// pictures so the readers can be fixed without asking scanners for their review folders. Never public: only the
// pump (INBOX_PULL_KEY) lists and fetches them, into the private archive. 40 a day per watcher, kept 14 days.
async function missPut(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || "", hid = req.headers.get("X-Watcher") || "", kind = req.headers.get("X-Kind") || "";
  if (overLimit("mi:" + ip, 60, 600)) return json({ error: "slow down" }, 429);
  if (!/^[0-9a-f]{16}$/.test(hid) || !/^(tip|room|bar)$/.test(kind)) return json({ error: "no" }, 403);
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length < 200 || buf.length > 300000) return json({ error: "size" }, 413);
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => buf[i] === v);
  const dv = new DataView(buf.buffer), w = png ? dv.getUint32(16) : 0, h = png ? dv.getUint32(20) : 0;
  if (!png || w < 20 || w > 1000 || h < 8 || h > 1000) return json({ error: "not a picture" }, 400);
  const day = new Date().toISOString().slice(0, 10), ck = "misscnt:" + day + ":" + hid, n = Number(await env.ACCOUNTS.get(ck) || 0);
  if (n >= 40) return json({ ok: true, full: true });
  await env.ACCOUNTS.put(ck, String(n + 1), { expirationTtl: 2 * DAY });
  const info = String(req.headers.get("X-Info") || "").replace(/[^\x20-\x7e]/g, "").slice(0, 300), t = Date.now();
  await env.ACCOUNTS.put("miss:" + t + ":" + hid + ":" + kind, buf, { expirationTtl: 14 * DAY, metadata: { w, h, t, hid, kind, info, ver: String(req.headers.get("User-Agent") || "").slice(0, 40) } });
  return json({ ok: true });
}
// Report a wrong price, from the item card: the item, what the card showed and an optional note. No sign-in. 10 a day
// per visitor (a daily hash of the address, never the address itself), kept 30 days, pulled into the private archive
// by the pump. Admins get a DM for the first 30 reports a day so a broken price is seen the same day.
async function wrongPut(req, env) {
  const ip = req.headers.get("CF-Connecting-IP") || "", day = new Date().toISOString().slice(0, 10);
  if (overLimit("wp:" + ip, 10, 600)) return json({ error: "slow down" }, 429);
  let b; try { b = JSON.parse(await req.text()); } catch (e) { return json({ error: "bad" }, 400); }
  const item = String(b && b.i || "").replace(/[^\x20-\x7e]/g, "").slice(0, 80).trim();
  if (item.length < 2) return json({ error: "bad" }, 400);
  const vh = (await hmac(env.SESSION_SECRET || "x", "wrong|" + day + "|" + ip)).slice(0, 12), ck = "wrongcnt:" + day + ":" + vh;
  const n = Number(await env.ACCOUNTS.get(ck) || 0);
  if (n >= 10) return json({ error: "limit" }, 429);
  await env.ACCOUNTS.put(ck, String(n + 1), { expirationTtl: 2 * DAY });
  const num = (v) => Math.max(0, Math.min(1e11, Math.round(Number(v) || 0)));
  const rec = { t: Date.now(), v: vh, i: item, typ: num(b.typ), best: num(b.best), last3: num(b.last3), ls: num(b.ls), note: String(b.note || "").replace(/[\u0000-\u001f]/g, " ").slice(0, 300) };
  while (new TextEncoder().encode(JSON.stringify(rec)).length > 1000 && rec.note) rec.note = rec.note.slice(0, -20);   // KV metadata holds 1 KB
  await env.ACCOUNTS.put("wrong:" + rec.t + ":" + vh, "1", { expirationTtl: 30 * DAY, metadata: rec });
  const dk = "wrongdm:" + day, dn = Number(await env.ACCOUNTS.get(dk) || 0);
  if (dn < 30) {
    await env.ACCOUNTS.put(dk, String(dn + 1), { expirationTtl: 2 * DAY });
    try { await mkCtx(env).dmAdmins("**" + item + "**\nCard showed: typical " + meso(rec.typ) + (rec.best ? " · cheapest " + meso(rec.best) : "") + (rec.last3 ? " · last 3 avg " + meso(rec.last3) : "") + (rec.note ? "\nNote: " + rec.note.replace(/[*_`~|<>@]/g, "") : "\nNo note"), "Wrong price report"); } catch (e) {}
  }
  return json({ ok: true });
}
async function wrongList(req, env, url) {
  if (!(await pullOK(req, env))) return json({ error: "no" }, 403);
  const after = Math.max(0, parseInt(url.searchParams.get("after") || "0", 10) || 0), out = [];
  let cursor;
  do {
    const l = await env.ACCOUNTS.list({ prefix: "wrong:", cursor, limit: 1000 });
    for (const k of l.keys) if (k.metadata && k.metadata.t > after) out.push(k.metadata);
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  out.sort((a, b) => a.t - b.t);
  return json({ items: out.slice(0, 1000) }, 200, { "Cache-Control": "no-store" });
}
async function pullOK(req, env) {
  const want = env.INBOX_PULL_KEY || "", got = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  return !!want && got.length === want.length && (await same(got, want));
}
async function missList(req, env, url) {
  if (!(await pullOK(req, env))) return json({ error: "no" }, 403);
  const after = Math.max(0, parseInt(url.searchParams.get("after") || "0", 10) || 0), out = [];
  let cursor;
  do {
    const l = await env.ACCOUNTS.list({ prefix: "miss:", cursor, limit: 1000 });
    for (const k of l.keys) if (k.metadata && k.metadata.t > after) out.push({ key: k.name, ...k.metadata });
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor && out.length < 400);
  out.sort((a, b) => a.t - b.t);
  return json({ items: out.slice(0, 400) }, 200, { "Cache-Control": "no-store" });
}
async function missGet(req, env, p) {
  if (!(await pullOK(req, env))) return json({ error: "no" }, 403);
  const key = decodeURIComponent(p.slice("/inbox/miss/".length));
  if (!/^miss:\d+:[0-9a-f]{16}:(tip|room|bar)$/.test(key)) return json({ error: "no" }, 400);
  const v = await env.ACCOUNTS.get(key, "arrayBuffer");
  return v ? new Response(v, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } }) : json({ error: "gone" }, 404);
}
async function tipImgGet(p, env) {
  const m = /^\/tipimg\/([0-9a-f]{16})\.png$/.exec(p);
  const v = m ? await env.ACCOUNTS.get("tipimg:" + m[1], "arrayBuffer") : null;
  if (!v) return new Response("not found", { status: 404, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } });
  return new Response(v, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*" } });
}
async function inboxPull(req, env, url) {
  const want = env.INBOX_PULL_KEY || "", got = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!want || got.length !== want.length || !(await same(got, want))) return json({ error: "no" }, 403);
  const after = Math.max(0, parseInt(url.searchParams.get("after") || "0", 10) || 0);
  if (!after) await fastPulled(env);       // a pump pass starts: what it pulls now is in the board after this pass
  const r = await env.INBOX_DB.prepare("SELECT id, t, msg FROM posts WHERE id > ? ORDER BY id LIMIT 2000").bind(after).all();
  const rows = (r.results || []).map((x) => [new Date(x.t).toISOString(), x.msg, x.id]);
  if (!after) await env.INBOX_DB.prepare("DELETE FROM posts WHERE t < ?").bind(Date.now() - 15 * DAY * 1000).run();
  return json({ rows, last: rows.length ? rows[rows.length - 1][2] : after }, 200, { "Cache-Control": "no-store" });
}
// the fast lane's rows for the pump's quick deal check between passes (same key as /inbox/pull)
async function inboxFast(req, env) {
  const want = env.INBOX_PULL_KEY || "", got = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!want || got.length !== want.length || !(await same(got, want))) return json({ error: "no" }, 403);
  return json((await fastDocs(env)).docs, 200, { "Cache-Control": "no-store" });
}
// the last 7 days of rejected uploads, for the pump's daily scanner check (same key as /inbox/pull)
async function inboxRejects(req, env) {
  const want = env.INBOX_PULL_KEY || "", got = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!want || got.length !== want.length || !(await same(got, want))) return json({ error: "no" }, 403);
  const out = {};
  for (let i = 0; i < 7; i++) { const d = new Date(Date.now() - i * DAY * 1000).toISOString().slice(0, 10); const o = await env.ACCOUNTS.get("inbox:rej:" + d, "json"); if (o) out[d] = o; }
  return json(out, 200, { "Cache-Control": "no-store" });
}
async function same(a, b) {
  const h = async (x) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(x)));
  const x = await h(a), y = await h(b); let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0;
}

// The finished price board, built by the pump running the page itself (tools/snapshot.py), so a first visit shows
// live listings at once instead of building them on the phone. Same public view as /data/live.
async function snapPut(req, env) {
  const want = env.INBOX_PULL_KEY || "", got = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  const note = (r) => env.ACCOUNTS.put("snap:last", JSON.stringify(Object.assign({ at: Date.now() }, r))).catch(() => {});
  if (!want || got !== want) { await note({ error: "key" }); return json({ error: "no" }, 403); }
  const body = await req.text();
  // the board is kept gzipped (about a fifth of its size), so it has room to grow far past KV's 25 MiB value limit
  if (body.length < 1000 || body.length > 95e6) { await note({ error: "size", bytes: body.length }); return json({ error: "size" }, 400); }
  let sj = null;
  try { sj = JSON.parse(body); if ((sj.v !== 2 && sj.v !== 3) || !sj.cols) throw 0; densify(sj); } catch (e) { await note({ error: "bad", bytes: body.length }); return json({ error: "bad" }, 400); }
  const gz = await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  if (gz.byteLength > 24e6) { await note({ error: "size", bytes: body.length, gz: gz.byteLength }); return json({ error: "size" }, 400); }
  await env.ACCOUNTS.put("snap:board.gz", gz);
  await env.ACCOUNTS.delete("snap:board").catch(() => {});
  // shops by owner for the shop pages, and "Seen in game" on market listings
  const shopsN = await snapShops(env, sj).catch((e) => "error " + (e && e.message || e));
  // stat alerts: new listings with read stats against members' alerts
  await runAlerts(env, sj, alertCtx(env)).catch((e) => env.ACCOUNTS.put("alerts:err", String(e && e.stack || e).slice(0, 500)));
  await note({ ok: true, bytes: body.length, seen: shopsN });
  return json({ ok: true, bytes: body.length });
}
// the stored board as text: the gzipped copy, or a plain one from before it was kept gzipped
export async function snapText(env) {
  const gz = await env.ACCOUNTS.get("snap:board.gz", "arrayBuffer");
  if (gz) return await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return await env.ACCOUNTS.get("snap:board");
}
async function dataSnap(env) {
  const ck = new Request("https://archive.cache/snap?b=" + Math.floor(Date.now() / 30000));
  let hit = await caches.default.match(ck);
  if (!hit) {
    const body = await snapText(env);
    if (!body) return json({ error: "not ready" }, 404, { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
    hit = new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=30" } });
    await caches.default.put(ck, hit.clone()).catch(() => {});
  }
  return new Response(hit.body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=30", "Access-Control-Allow-Origin": "*" } });
}

// Mega Deals holders see a deal first; everyone else gets it 10 minutes later. The board hides those listings on
// the page too, but the raw data now leaves them out as well, so nobody can read them out of the download.
const HOLD_S = 600, HOLD_CUT = 0.8;
async function holdPrices(env) {
  const rows = await summaryRows(env).catch(() => []), m = {};
  rows.forEach((r) => { if (r.typ > 0) { m[r.item.toLowerCase()] = r.typ; m[shown(r.item).toLowerCase()] = r.typ; } });
  return m;
}
function holdDeals(arr, typ) {
  if (!Array.isArray(arr)) return arr;
  const nowS = Math.floor(Date.now() / 1000), recent = Date.now() - 20 * 6e4;
  for (const d of arr) {
    if (!d || !Array.isArray(d.rows) || !(Date.parse(d.at) > recent)) continue;
    d.rows = d.rows.filter((r) => {
      if (!r || nowS - (r.t || 0) >= HOLD_S) return true;
      const ty = typ[String(r.i || "").toLowerCase()]; if (!ty) return true;
      const unit = (r.p || 0) / Math.max(1, r.q || 1);
      return !(unit > 0 && unit < ty * HOLD_CUT);
    });
  }
  return arr;
}

async function dataLive(req, env) {
  // Open to everyone: the board shows every listing without signing in. Discord sign-in is for contributing and
  // earning. Bulk pulling is still held back per address (and per account when signed in), and every copy carries
  // timestamp marks: the account's when signed in, the address's otherwise.
  const id = await sessionId(req, env);
  const acct = id ? await env.ACCOUNTS.get("acct:" + id, "json") : null;
  if (acct && acct.locked) return json({ error: "locked" }, 403, { "Cache-Control": "no-store" });
  const ip = req.headers.get("CF-Connecting-IP") || "";
  const club = acct ? await isClub(acct, env) : false;     // Club and Mega Deals refresh every 15 seconds for deals
  if ((id && overLimit("a:" + id, club ? 90 : 30, 600)) || overLimit("i:" + ip, club ? 120 : id ? 60 : 24, 600)) return json({ error: "slow down" }, 429, { "Retry-After": "300" });
  if (env.RL && !club) { try { const ok = await env.RL.limit({ key: id ? "a:" + id : "i:" + ip }); if (!ok.success) return json({ error: "slow down" }, 429, { "Retry-After": "300" }); } catch (e) {} }
  const ref = await archSig(env).catch(() => null);
  const parts = await Promise.all(MEMBER_FILES.map((f) => archFetch(env, "data/" + f, 60, ref).catch(() => null)));
  if (!parts.some(Boolean)) return json({ error: "not ready" }, 503);
  const mk = await markKey(env, id || "ip:" + ip);
  // ?after=<ms>: only the uploads newer than that, so an open board refreshes with a few KB instead of the whole bundle
  const after = Number(new URL(req.url).searchParams.get("after")) || 0;
  if (after > 0) {
    // the cut is rounded down to 10 minutes and kept per archive version, so first visits share one filtered copy
    const ak = Math.floor(after / 6e5) * 6e5;
    const ck = new Request("https://archive.cache/live-after?ref=" + (ref || "x") + "&after=" + ak);
    let body = null; const hit = ref ? await caches.default.match(ck) : null;
    if (hit) body = await hit.text();
    else {
      let out = "{", first = true;
      for (let i = 0; i < MEMBER_FILES.length; i++) {
        if (!parts[i]) continue;
        let arr; try { arr = JSON.parse(await parts[i].text()); } catch (e) { continue; }
        out += (first ? "" : ",") + JSON.stringify("data/" + MEMBER_FILES[i]) + ":" + JSON.stringify(Array.isArray(arr) ? arr.filter((d) => d && (Date.parse(d.at) > ak || (d.u || 0) * 1000 > ak)) : []); first = false;
      }
      body = out + "}";
      if (ref) await caches.default.put(ck, new Response(body, { headers: { "Cache-Control": "public, max-age=900" } })).catch(() => {});
    }
    const o = JSON.parse(body); o["data/fast.json"] = (await fastDocs(env)).docs;
    if (!club) { const hp = await holdPrices(env); Object.keys(o).forEach((k) => holdDeals(o[k], hp)); }
    body = JSON.stringify(o);
    return new Response(mk === null ? body : markTimes(body, mk), { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Delta": hit ? "cached" : "1" } });
  }
  const hp = club ? null : await holdPrices(env);
  const { readable, writable } = new TransformStream();
  (async () => {
    const w = writable.getWriter(), enc = new TextEncoder();
    let first = true;
    await w.write(enc.encode("{"));
    for (let i = 0; i < MEMBER_FILES.length; i++) {
      if (!parts[i]) continue;
      await w.write(enc.encode((first ? "" : ",") + JSON.stringify("data/" + MEMBER_FILES[i]) + ":")); first = false;
      if (hp) {   // everyone but deal holders: fresh deals stay out for their first 10 minutes
        let t = await parts[i].text();
        try { const arr = JSON.parse(t); holdDeals(arr, hp); t = JSON.stringify(arr); } catch (e) {}
        await w.write(enc.encode(mk === null ? t : markTimes(t, mk)));
      }
      else if (mk === null) { const rd = parts[i].body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; await w.write(value); } }
      else await w.write(enc.encode(markTimes(await parts[i].text(), mk)));
    }
    // the fast lane: new rows the pump hasn't folded in yet
    const fd = (await fastDocs(env)).docs; if (hp) holdDeals(fd, hp);
    const ft = JSON.stringify(fd);
    await w.write(enc.encode((first ? "" : ",") + '"data/fast.json":' + (mk === null ? ft : markTimes(ft, mk))));
    await w.write(enc.encode("}")); await w.close();
  })();
  return new Response(readable, { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
}

// ---------------------------------------------------------------- server channel access (admin)
// Who can see each channel: the server's roles and members run through Discord's permission rules
// (base role permissions, Administrator, then the channel's @everyone, role and member overwrites).
const P_ADMIN = 8n, P_VIEW = 1024n, P_CONNECT = 1048576n, P_SPEAK = 2097152n, P_SEND = 2048n;
// Every place the Club FM look shows up in Discord: server art, bot and app avatars, emojis, role icons, webhooks.
async function brandAudit(env) {
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN };
  const get = async (u) => { const r = await fetch(DISCORD + u, { headers: H }); return r.ok ? r.json() : { error: r.status }; };
  const [guild, me, app, emojis, roles, chans] = await Promise.all([get("/guilds/" + GUILD), get("/users/@me"), get("/applications/@me"), get("/guilds/" + GUILD + "/emojis"), get("/guilds/" + GUILD + "/roles"), get("/guilds/" + GUILD + "/channels")]);
  const cdn = "https://cdn.discordapp.com";
  const hooks = await get("/guilds/" + GUILD + "/webhooks");
  return {
    server: { name: guild.name, icon: guild.icon && `${cdn}/icons/${GUILD}/${guild.icon}.png?size=256`, banner: guild.banner, splash: guild.splash },
    bot: { name: me.username, avatar: me.avatar && `${cdn}/avatars/${me.id}/${me.avatar}.png?size=256` },
    app: { name: app.name, icon: app.icon && `${cdn}/app-icons/${app.id}/${app.icon}.png?size=256` },
    emojis: Array.isArray(emojis) ? emojis.map((e) => ({ name: e.name, id: e.id, url: `${cdn}/emojis/${e.id}.${e.animated ? "gif" : "png"}` })) : emojis,
    roles: Array.isArray(roles) ? roles.filter((r) => r.icon || r.unicode_emoji || /crown/i.test(r.name)).map((r) => ({ name: r.name, unicode: r.unicode_emoji, icon: r.icon && `${cdn}/role-icons/${r.id}/${r.icon}.png` })) : roles,
    channels: Array.isArray(chans) ? chans.map((c) => c.name).filter((n) => /👑|crown/i.test(n)) : chans,
    webhooks: Array.isArray(hooks) ? hooks.map((w) => ({ name: w.name, id: w.id, channel: w.channel_id, avatar: w.avatar && `${cdn}/avatars/${w.id}/${w.avatar}.png?size=256` })) : hooks,
  };
}

// Swap brand art in place: {appIcon: url} sets the Discord app icon; {emojis: [{name, url}]} replaces guild emojis by name.
async function brandFix(req, env) {
  const body = await req.json().catch(() => ({}));
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" };
  const dataUri = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error("fetch " + u + " " + r.status); const b = new Uint8Array(await r.arrayBuffer()); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); const t = /\.gif(\?|$)/.test(u) ? "image/gif" : "image/png"; return "data:" + t + ";base64," + btoa(s); };
  const out = {};
  if (body.appIcon) { const r = await fetch(DISCORD + "/applications/@me", { method: "PATCH", headers: H, body: JSON.stringify({ icon: await dataUri(body.appIcon) }) }); out.appIcon = r.status + " " + (r.ok ? "" : (await r.text()).slice(0, 200)); }
  if (Array.isArray(body.emojis)) {
    const list = await (await fetch(DISCORD + "/guilds/" + GUILD + "/emojis", { headers: H })).json();
    out.emojis = [];
    for (const e of body.emojis.slice(0, 12)) {
      const img = await dataUri(e.url);
      const old = Array.isArray(list) ? list.find((x) => x.name === e.name) : null;
      if (old) { const d = await fetch(DISCORD + "/guilds/" + GUILD + "/emojis/" + old.id, { method: "DELETE", headers: { Authorization: H.Authorization } }); if (!d.ok) { out.emojis.push(e.name + " delete " + d.status + " " + (await d.text()).slice(0, 120)); continue; } }
      const c = await fetch(DISCORD + "/guilds/" + GUILD + "/emojis", { method: "POST", headers: H, body: JSON.stringify({ name: e.name, image: img }) });
      out.emojis.push(e.name + " " + c.status + (c.ok ? "" : " " + (await c.text()).slice(0, 160)));
    }
  }
  return out;
}

async function channelAccess(env) {
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN };
  const get = async (u) => { const r = await fetch(DISCORD + u, { headers: H }); return r.ok ? r.json() : { error: r.status, body: (await r.text()).slice(0, 200) }; };
  const [chans, roles, guild] = await Promise.all([get("/guilds/" + GUILD + "/channels"), get("/guilds/" + GUILD + "/roles"), get("/guilds/" + GUILD)]);
  let members = await get("/guilds/" + GUILD + "/members?limit=1000");
  if (!Array.isArray(chans) || !Array.isArray(roles)) return { error: "discord", chans, roles };
  const memberErr = Array.isArray(members) ? null : members;
  if (!Array.isArray(members)) {
    // no Server Members intent: look up everyone who has a site account, one by one
    members = []; let cursor; const ids = [];
    do { const l = await env.ACCOUNTS.list({ prefix: "acct:", cursor }); cursor = l.list_complete ? null : l.cursor; for (const k of l.keys) ids.push(k.name.slice(5)); } while (cursor);
    for (let i = 0; i < ids.length; i += 10) {
      const got = await Promise.all(ids.slice(i, i + 10).map((id) => fetch(DISCORD + "/guilds/" + GUILD + "/members/" + id, { headers: H }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
      for (const m of got) if (m && m.user) members.push(m);
    }
  }
  const roleHolders = {}; for (const m of members) for (const id of m.roles || []) (roleHolders[id] || (roleHolders[id] = [])).push(m.nick || m.user.global_name || m.user.username);
  const rp = {}, rn = {}; for (const r of roles) { rp[r.id] = BigInt(r.permissions); rn[r.id] = r.name; }
  const ev = GUILD, owner = guild && guild.owner_id;
  const parent = {}; for (const c of chans) parent[c.id] = c;
  const canSee = (c, roleIds, uid) => {
    if (uid && uid === owner) return true;
    let base = rp[ev] || 0n; for (const id of roleIds) base |= rp[id] || 0n;
    if (base & P_ADMIN) return true;
    const ow = c.permission_overwrites || [];
    const e = ow.find((o) => o.id === ev); if (e) { base &= ~BigInt(e.deny); base |= BigInt(e.allow); }
    let a = 0n, d = 0n; for (const o of ow) if (o.type === 0 && o.id !== ev && roleIds.includes(o.id)) { a |= BigInt(o.allow); d |= BigInt(o.deny); }
    base &= ~d; base |= a;
    const m = uid && ow.find((o) => o.type === 1 && o.id === uid); if (m) { base &= ~BigInt(m.deny); base |= BigInt(m.allow); }
    return !!(base & P_VIEW);
  };
  const out = chans.filter((c) => c.type !== 4).sort((a, b) => ((parent[a.parent_id] || {}).position || 0) - ((parent[b.parent_id] || {}).position || 0) || a.position - b.position).map((c) => {
    const everyone = canSee(c, [], null);
    const rolesIn = roles.filter((r) => r.id !== ev && canSee(c, [r.id], null)).map((r) => r.name);
    const who = members.filter((m) => canSee(c, m.roles || [], m.user.id)).map((m) => (m.nick || m.user.global_name || m.user.username) + (m.user.bot ? " (bot)" : ""));
    return { name: c.name, type: c.type === 2 ? "voice" : c.type === 0 ? "text" : c.type === 5 ? "announcement" : c.type === 15 ? "forum" : String(c.type), category: (parent[c.parent_id] || {}).name || "", everyone, roles: rolesIn, members: everyone ? null : who };
  });
  const holders = {}; for (const r of roles) if (roleHolders[r.id]) holders[r.name] = roleHolders[r.id];
  return { members: members.length, memberErr: memberErr ? "member list needs the Server Members intent; showing members with site accounts" : null, ids: roles.reduce((o, r) => (o[r.name] = r.id, o), {}), chanIds: chans.reduce((o, c) => (o[c.name] = c.id, o), {}), holders, channels: out };
}
// a voice channel only the listed members (and admins) can see and join
async function privateVoice(req, env) {
  let b = null; try { b = await req.json(); } catch (e) {}
  const ids = (b && Array.isArray(b.users) ? b.users : []).filter((x) => /^\d{15,21}$/.test(String(x))).slice(0, 10);
  const name = String((b && b.name) || "private").slice(0, 60);
  if (!ids.length) return { error: "no users" };
  const allow = String(P_VIEW | P_CONNECT | P_SPEAK | P_SEND);
  const body = { name, type: 2, permission_overwrites: [{ id: GUILD, type: 0, deny: String(P_VIEW | P_CONNECT), allow: "0" }].concat(ids.map((id) => ({ id, type: 1, allow, deny: "0" }))) };
  if (b && b.parent) body.parent_id = String(b.parent);
  const r = await fetch(DISCORD + "/guilds/" + GUILD + "/channels", { method: "POST", headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, id: j.id, name: j.name } : { error: r.status, body: j };
}

// ---------------------------------------------------------------- quest log
// Each account keeps its quest progress: done and started quests by name, and the character's level.
// The site sets them by hand; a linked FM Watcher reports what it reads in the game's quest window.
const QKEY = (id) => "quests:" + id;
async function loadQ(env, id) { return (await env.ACCOUNTS.get(QKEY(id), "json")) || { done: {}, doing: {}, level: 0, updated: 0 }; }
function cleanName(n) { return String(n || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80); }
async function getQuests(req, env) {
  const a = await whoami(req, env);
  if (!a) return json({ signedIn: false });
  return json(Object.assign({ signedIn: true }, await loadQ(env, a.id)), 200, { "Cache-Control": "no-store" });
}
async function putQuests(req, env) {
  const a = await whoami(req, env);
  if (!a) return json({ error: "sign in first" }, 401);
  const raw = await req.text(); if (raw.length > 40000) return json({ error: "too big" }, 413);
  let b; try { b = JSON.parse(raw); } catch (e) { return json({ error: "bad json" }, 400); }
  const q = await loadQ(env, a.id), t = now();
  // set: {"Quest name": "done" | "doing" | null}
  for (const [k0, v] of Object.entries(b.set || {}).slice(0, 400)) {
    const k = cleanName(k0); if (!k) continue;
    delete q.done[k]; delete q.doing[k];
    if (v === "done") q.done[k] = t; else if (v === "doing") q.doing[k] = t;
  }
  if (b.level != null) { const lv = Math.max(0, Math.min(250, parseInt(b.level, 10) || 0)); q.level = lv; }
  q.updated = t;
  await env.ACCOUNTS.put(QKEY(a.id), JSON.stringify(q));
  return json(Object.assign({ ok: true }, q));
}
// the training build: level, job, build type, stats, weapons and skill levels. Only known fields, only numbers and
// short names, so nothing else can be stored under it.
const BKEY = (id) => "build:" + id;
const BJOBS = ["Beginner", "Warrior", "Fighter", "Page", "Spearman", "Magician", "Fire Poison Wizard", "Ice Lightning Wizard", "Cleric", "Bowman", "Hunter", "Crossbowman", "Thief", "Assassin", "Bandit"];
const BTYPES = ["pure", "assassin", "bandit", "sindit", "sindit36", "sinditreset", "dexassassin", "dexbandit", "dexless", "lukmage"];
const BWEAP = ["1H Sword", "2H Sword", "1H Axe", "2H Axe", "1H Blunt", "2H Blunt", "Spear", "Polearm", "Dagger", "Claw", "Bow", "Crossbow", "Wand", "Staff"];
function cleanBuild(b) {
  const n = (v, lo, hi) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : null; };
  const o = {};
  if (BJOBS.includes(b.job)) o.job = b.job;
  if (BTYPES.includes(b.type)) o.type = b.type;
  for (const [k, lo, hi] of [["lv", 1, 200], ["swap", 1, 200], ["str", 4, 999], ["dex", 4, 999], ["int", 4, 999], ["luk", 4, 999], ["matk", 0, 999], ["accTotal", 0, 999], ["gearAcc", 0, 999]]) { const v = n(b[k], lo, hi); if (v != null) o[k] = v; }
  if (Array.isArray(b.range) && b.range.length === 2) { const a = n(b.range[0], 0, 99999), c = n(b.range[1], 0, 99999); if (a != null && c != null) o.range = [a, c]; }
  if (BWEAP.includes(b.rangeW) || b.rangeW === "magic") o.rangeW = b.rangeW;
  for (const k of ["w", "w2"]) if (BWEAP.includes(b[k])) o[k] = b[k];
  o.gear = {};
  for (const [w, g] of Object.entries(b.gear || {}).slice(0, 3)) {
    if (!BWEAP.includes(w) || !g || typeof g !== "object") continue;
    o.gear[w] = { watk: n(g.watk, 0, 999) || 0, matk: n(g.matk, 0, 999) || 0, spd: n(g.spd, 2, 9) || 6, ammoAtk: n(g.ammoAtk, 0, 99) || 0, name: cleanName(String(g.name || "")).slice(0, 40), ammo: cleanName(String(g.ammo || "")).slice(0, 40) };
  }
  o.skills = {};
  for (const [k, v] of Object.entries(b.skills || {}).slice(0, 60)) { if (/^\d{7}$/.test(k)) { const x = n(v, 0, 30); if (x) o.skills[k] = x; } }
  return o;
}
async function getBuild(req, env) {
  const a = await whoami(req, env);
  if (!a) return json({ signedIn: false });
  const raw = await env.ACCOUNTS.get(BKEY(a.id));
  return json({ signedIn: true, build: raw ? JSON.parse(raw) : null }, 200, { "Cache-Control": "no-store" });
}
async function putBuild(req, env) {
  const a = await whoami(req, env);
  if (!a) return json({ error: "sign in first" }, 401);
  if (overLimit("bd:" + a.id, 60, 3600)) return json({ error: "slow down" }, 429);
  const raw = await req.text(); if (raw.length > 8000) return json({ error: "too big" }, 413);
  let b; try { b = JSON.parse(raw); } catch (e) { return json({ error: "bad json" }, 400); }
  const o = cleanBuild(b || {}); o.updated = now();
  await env.ACCOUNTS.put(BKEY(a.id), JSON.stringify(o));
  return json({ ok: true, build: o });
}
// a linked watcher: {hid, done: [...], doing: [...], level}. The watcher id is the credential, as for linking.
async function watcherQuests(req, env) {
  let b; try { b = await req.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  const hid = String((b && b.hid) || "");
  if (!/^[0-9a-f]{16}$/.test(hid)) return json({ error: "bad watcher" }, 400);
  const ip = req.headers.get("CF-Connecting-IP") || "";
  if (overLimit("wq:" + hid, 60, 600) || overLimit("wqi:" + ip, 120, 600)) return json({ error: "slow down" }, 429);
  const id = await env.ACCOUNTS.get("watcher:" + hid);
  if (!id) return json({ error: "not linked" }, 404);
  const q = await loadQ(env, id), t = now();
  for (const n of (Array.isArray(b.done) ? b.done : []).slice(0, 400)) { const k = cleanName(n); if (k) { delete q.doing[k]; q.done[k] = q.done[k] || t; } }
  for (const n of (Array.isArray(b.doing) ? b.doing : []).slice(0, 100)) { const k = cleanName(n); if (k && !q.done[k]) q.doing[k] = q.doing[k] || t; }
  if (b.level != null) { const lv = parseInt(b.level, 10); if (lv > 0 && lv <= 250) q.level = lv; }
  q.updated = t; q.fromWatcher = t;
  await env.ACCOUNTS.put(QKEY(id), JSON.stringify(q));
  return json({ ok: true, done: Object.keys(q.done).length, doing: Object.keys(q.doing).length });
}

// ---------------------------------------------------------------- timestamp marks
// Every member's copy of the listings carries its own invisible mark: each row time ("t", in seconds) is nudged by
// 0, 1 or 2 seconds, picked from the account and the time itself. Nothing on the board reads seconds, so members see
// no difference, but a copy that turns up somewhere else matches exactly one account's pattern (/admin/markcheck).
// Off until MARK_KEY is set (rewriting the files needs more CPU than the free plan allows).
async function markKey(env, id) {
  if (!env.MARK_KEY) return null;
  return parseInt((await hmac(env.MARK_KEY, "mark|" + id)).slice(0, 8), 16) >>> 0;
}
function markShift(k, t) {
  let h = (k ^ Math.imul(t >>> 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; h = (h ^ (h >>> 16)) >>> 0;
  return h % 3;
}
function markTimes(text, k) {
  return text.replace(/"t":(1[6-9]\d{8})(?=[,}])/g, (m, t) => '"t":' + (Number(t) + markShift(k, Number(t))));
}
// pairs of [archive time, time in the found copy] for the same rows; returns the accounts whose marks fit best
async function markCheck(req, env) {
  const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403);
  if (!env.MARK_KEY) return json({ error: "marks off" }, 503);
  let body = null; try { body = await req.json(); } catch (e) {}
  const pairs = (body && Array.isArray(body.pairs) ? body.pairs : []).filter((x) => Array.isArray(x) && x.length === 2 && x[1] - x[0] >= 0 && x[1] - x[0] <= 2).slice(0, 20000);
  if (pairs.length < 20) return json({ error: "need at least 20 matched rows" }, 400);
  const out = []; let cursor;
  do {
    const l = await env.ACCOUNTS.list({ prefix: "acct:", cursor }); cursor = l.list_complete ? null : l.cursor;
    for (const key of l.keys) {
      const id = key.name.slice(5), k = await markKey(env, id);
      let hit = 0; for (const [a, b] of pairs) if (markShift(k, a) === b - a) hit++;
      out.push({ id, hit, of: pairs.length });
    }
  } while (cursor);
  out.sort((a, b) => b.hit - a.hit);
  // chance alone fits about a third of rows; a real match fits all of them
  return json({ top: out.slice(0, 5), chance: Math.round(pairs.length / 3) }, 200, { "Cache-Control": "no-store" });
}

const hex2buf = (h) => new Uint8Array(h.match(/../g).map((b) => parseInt(b, 16)));

async function verifyDiscord(req, env, body) {
  const sig = req.headers.get("X-Signature-Ed25519"), ts = req.headers.get("X-Signature-Timestamp");
  if (!sig || !ts || !env.DISCORD_PUBLIC_KEY) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hex2buf(env.DISCORD_PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, hex2buf(sig), new TextEncoder().encode(ts + body));
  } catch (e) { return false; }
}

let ABBR = null;
async function abbrMap() {
  if (ABBR) return ABBR;
  const r = await fetch("https://maplefm.gg/data/abbr.json", { cf: { cacheTtl: 3600, cacheEverything: true } }).catch(() => null);
  ABBR = r && r.ok ? await r.json().catch(() => ({})) : {};
  return ABBR;
}
// "gfa 60" is Gloves Attack Scroll 60%: chat shortcuts from the board's list, and the rate words the board uses
// trade-chat words the item names spell out: "glove for att 60" is Gloves Attack Scroll 60%
const FILLER = new Set(["for", "of", "the", "a", "an", "to", "scroll", "scrolls", "scr"]);
const SYN = { earing: "earring", earings: "earrings", att: "attack", atk: "attack", attk: "attack", matt: "magic attack", matk: "magic attack", ma: "magic attack", acc: "accuracy",
  luck: "luk", avoid: "avoidability", avo: "avoidability", spd: "speed", jmp: "jump", wep: "weapon", wpn: "weapon", crit: "crit", ohs: "one-handed sword",
  ths: "two-handed sword", glove: "gloves", shoe: "shoes", earrings: "earring", topwear: "topwear", ovr: "overall", ova: "overall" };
function expandQuery(q, abbr) {
  q = String(q || "").toLowerCase().replace(/[%]/g, " ").replace(/\s+/g, " ").trim();
  // "10 int earring" and "60 gfa": the rate can lead too
  const lead = /^(100|60|10)\s+(.+)$/.exec(q); if (lead && !/\d$/.test(lead[2])) q = lead[2] + " " + lead[1];
  const m = /^(.*?)\s*(100|60|10)$/.exec(q);
  let base = m ? m[1].trim() : q, tier = m ? { "100": "lesser", "60": "intermediate", "10": "greater" }[m[2]] : "";
  if (abbr[base]) base = String(abbr[base]).toLowerCase();
  else if (abbr[q]) { base = String(abbr[q]).toLowerCase(); tier = ""; }
  else {
    // "scroll for gloves for att" keeps the words that name the item, in the board's spelling
    const w = base.split(" ").filter((x) => x && !FILLER.has(x)).map((x) => SYN[x] || x);
    const joined = w.join(" ");
    base = abbr[joined] ? String(abbr[joined]).toLowerCase() : joined || base;
  }
  return tier ? base.replace(/\s*scroll:?.*$/, "") + " scroll: " + tier : base;
}
// what the market needs from here: the item list it checks names against, and the chat matcher for #selling posts
function mkCtx(env) { return { whoami, isAdmin, overLimit, findRows, splitRoll, expandQuery, rows: () => mkRows(env), abbr: abbrMap,
  dmAdmins: async (m, title) => wdDM(env, await wdAdmins(env), [{ description: String(m).slice(0, 3900), color: 0xe74c3c, title: title || "Club FM market" }]) }; }
setRows((env) => mkRows(env));
let MKROWS = null, MKAT = 0;
async function mkRows(env) {
  if (MKROWS && Date.now() - MKAT < 600e3) return MKROWS;
  let rows = env ? await summaryRows(env).catch(() => []) : [];
  if (!rows.length) {
    const r = await fetch((env && env.MARKET_ROWS_URL) || "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/summary-public.json", { cf: { cacheTtl: 600, cacheEverything: true } }).catch(() => null);
    const d = r && r.ok ? await r.json().catch(() => null) : null;
    rows = d && Array.isArray(d.rows) ? d.rows.filter((x) => x && x.item && !/\u2026$|^scroll: |\|/i.test(x.item)) : [];
  }
  if (rows.length) { MKROWS = rows.map((x) => ({ item: x.item, typ: x.typ, n: x.n, equip: x.equip, vol: x.vol })); MKAT = Date.now(); }
  return MKROWS || [];
}
// every item name in the game, for telling "nobody sold one lately" apart from "no such item"
let DBN = null, DBS = {};   // item names, and each item's base stats ({ATT: 57, SLOTS: 7})
async function knownItem(env, q) {
  if (!DBN) {
    const r = await fetch((env && env.ITEMDB_URL) || "https://maplefm.gg/data/itemdb.json", { cf: { cacheTtl: 86400, cacheEverything: true } }).catch(() => null);
    const d = r && r.ok ? await r.json().catch(() => null) : null;
    DBN = d && d.items ? d.items.map((x) => String(x[0])) : [];
    if (d && d.items) for (const x of d.items) if (x[7] && typeof x[7] === "object") DBS[String(x[0]).toLowerCase()] = x[7];
  }
  q = String(q || "").toLowerCase().replace(/-/g, " ").trim();
  if (q.length < 3) return "";
  const norm = (n) => n.toLowerCase().replace(/-/g, " ");
  const exact = DBN.find((n) => norm(n) === q);
  if (exact) return exact;
  // every word starts a word of exactly one item: "zakum helm" is Zakum Helmet
  const qw = q.split(/\s+/).filter((w) => w.length >= 2);
  if (qw.length < 2) return "";
  const m = DBN.filter((n) => { const ws = norm(n).split(/[^a-z0-9%]+/); return qw.every((w) => ws.some((x) => x.startsWith(w))); });
  return m.length === 1 ? m[0] : "";
}
async function summaryRows(env) {
  // two copies of the board: the vault's has roll prices and cheapest asks, the public one is sometimes a pump pass
  // newer. Answers use whichever is newer, with the vault's extra fields kept, so /price and !price match the site.
  const [v, pub] = await Promise.all([
    vaultJSON(env, "data/summary.json", 300).catch(() => null),
    fetch(env.MARKET_ROWS_URL || "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/summary-public.json", { cf: { cacheTtl: 120, cacheEverything: true } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  let sm = v && Array.isArray(v.rows) ? v : pub;
  if (v && Array.isArray(v.rows) && pub && Array.isArray(pub.rows) && (pub.at || 0) > (v.at || 0)) {
    const extra = {}; v.rows.forEach((r) => { if (r && r.item) extra[r.item] = r; });
    sm = { at: pub.at, rows: pub.rows.map((r) => { const x = extra[r && r.item]; if (!x) return r; const o = Object.assign({}, r); for (const k of ["rt", "ra", "rk", "best", "bestS", "deal", "equip"]) if (o[k] == null && x[k] != null) o[k] = x[k]; return o; }) };
  }
  return sm && Array.isArray(sm.rows) ? sm.rows.filter((r) => r && r.item && !/\u2026$|^scroll: |\|/i.test(r.item)) : [];
}

// scrolls are shown by success rate, as on the board: Lesser 100%, Intermediate 60%, Greater 10%
const shown = (name) => String(name || "").replace(/ Scroll: (Lesser|Intermediate|Greater)$/, (m, t) => " Scroll " + ({ Lesser: "100%", Intermediate: "60%", Greater: "10%" })[t]);
// exact under 10K (1,888 not 2K), then 12.5K, 790K, 1.15M, 1.2B
const meso = (n) => n > 0 && n < 1 ? n.toFixed(2) : n >= 999.5e6 ? (n / 1e9).toFixed(2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + "B" : n >= 999.5e3 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + "M" : n >= 99.95e3 ? Math.round(n / 1e3) + "K" : n >= 9999.5 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : Math.round(n).toLocaleString("en-US");

function findRows(rows, q, abbr) {
  q = expandQuery(String(q || "").replace(/[^\p{L}\p{N}\s%:'+.&-]/gu, " "), abbr || {});   // emoji and symbols out
  if (q.replace(/[^a-z0-9]/g, "").length < 2 || FILLER.has(q)) return [];   // "a", "the": no item
  const qw = q.split(/[\s:]+/).filter((w) => w && !FILLER.has(w));
  const tierQ = /scroll: (lesser|intermediate|greater)$/.exec(q);
  // a typo or two in a word ("wrok", "lable", "crusadr")
  const near = (a, b) => { if (Math.abs(a.length - b.length) > 2) return false; const d = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
    // a swap of two letters ("wrok", "lable") counts as one typo
    let swap = false; if (a.length === b.length) { const diff = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i); swap = diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]; }
    return swap || d[b.length] <= (a.length >= 7 ? 2 : 1); };
  const score = (r) => {
    const raw = String(r.item || "").toLowerCase(), n = shown(r.item).toLowerCase(), words = (n + " " + raw).split(/[^a-z0-9%]+/);
    if (tierQ && !raw.endsWith(": " + tierQ[1])) return 9;
    if (n === q || raw === q) return 0; if (n.startsWith(q) || raw.startsWith(q)) return 1; if (n.includes(q) || raw.includes(q)) return 2;
    const hit = (w) => words.some((x) => x.startsWith(w) || (x.length >= 3 && w.startsWith(x)));
    if (qw.every((w) => n.includes(w) || raw.includes(w))) return 3;
    // each query word is the start of some word in the name, so "gloves magical" finds "Gloves Magic Attack Scroll"
    if (qw.every(hit)) return 4;
    // a typo or an extra word: most of the words still land
    const k = qw.filter(hit).length;
    // one word off is fine in a longer name ("dark crusadr chainmail"), but two words where only one lands
    // ("zakum helm", "maple claw") is a different item, not a typo
    // ...and the word that missed must still be close to a word in the name ("helmet int 60" is not a cape scroll)
    return qw.length >= 3 && k >= qw.length - 1 && qw.every((w) => hit(w) || (w.length >= 4 && words.some((x) => near(w, x)))) ? 5 : 9;
  };
  const exact = (r) => { const words = shown(r.item).toLowerCase().split(/[^a-z0-9%]+/); return qw.filter((w) => words.includes(w)).length; };
  // misread one-off names (a single listing) sort under real items
  const junk = (r) => ((r.n || 0) < 2 ? 1 : 0);
  const out = rows.map((r) => [score(r), r]).filter((x) => x[0] < 9);
  // nothing landed: allow a typo or two in each word ("wrok gloves", "nakamaky", "white lable")
  if (!out.length && qw.length) {
    for (const r of rows) {
      const words = (shown(r.item) + " " + r.item).toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean);
      const k = qw.filter((w) => words.some((x) => x === w || x.startsWith(w) || (w.length >= 4 && near(w, x)))).length;
      if (k === qw.length) out.push([6, r]);
    }
  }
  return out.sort((a, b) => a[0] - b[0] || junk(a[1]) - junk(b[1]) || exact(b[1]) - exact(a[1]) ||
    // tiers of one scroll: the most traded first, so "gfa" is the 60% people mean
    (a[1].item.replace(/: \w+$/, "") === b[1].item.replace(/: \w+$/, "") ? (b[1].n || 0) - (a[1].n || 0) : 0) || a[1].item.length - b[1].item.length || (b[1].n || 0) - (a[1].n || 0)).map((x) => x[1]);
}

async function interactions(req, env) {
  const body = await req.text();
  if (!(await verifyDiscord(req, env, body))) return new Response("bad signature", { status: 401 });
  const it = JSON.parse(body);
  if (it.type === 1) return json({ type: 1 });
  const opt = ((it.data && it.data.options) || []).find((o) => o.name === "item");
  const q = opt ? String(opt.value || "") : "";
  if (it.type === 4) {                                   // autocomplete: the closest item names
    const rows = await mkRows(env), ab = await abbrMap();
    // nothing typed yet: the busiest items, so the list shows as soon as the box opens
    let pick = q.trim() ? findRows(rows, q, ab) : rows.filter((r) => (r.n || 0) >= 2).sort((a, b) => (b.vol || b.n || 0) - (a.vol || a.n || 0));
    if (!pick.length && /\s\d{1,2}$/.test(q.trim())) pick = findRows(rows, q.trim().replace(/\s+\d{1,2}$/, ""), ab);   // "gfa 6" on the way to "gfa 60"
    return json({ type: 8, data: { choices: pick.slice(0, 25).map((r) => ({ name: shown(r.item).slice(0, 100), value: r.item.slice(0, 100) })) } });
  }
  if (it.type === 2 && it.data && (it.data.name === "market" || it.data.name === "sell"))
    return json(await marketCommand(env, it, Object.assign(mkCtx(env), { rows: await mkRows(env), abbr: await abbrMap() })));
  if (it.type === 2 && it.data && it.data.name === "price") {
    logHit(env, "#dprice", String(it.guild_id || "dm"), "", "dc:" + String((it.member && it.member.user && it.member.user.id) || (it.user && it.user.id) || "")).catch(() => {});
    return json(await discordPrice(env, q));
  }
  return json({ type: 4, data: { content: "Unknown command", flags: 64 } });
}

// /price in Discord: the embed for one item, with the roll's own sales when a roll is asked for
async function discordPrice(env, q) {
  const rows = await summaryRows(env), ab = await abbrMap(), sr = splitRoll(q);
  // the same checks as !price: a bare slot word is a scroll search, and a real item nobody sold lately says so
  if (sr.roll && SLOT_ONLY.test(sr.q.trim()) && !sr.plus) { sr.q = q; sr.roll = ""; }
  else if (sr.roll && SLOT_ONLY.test(sr.q.trim())) return ({ type: 4, data: { content: "Which " + sr.q.trim().toLowerCase() + "? Try `/price emerald earrings " + (sr.g || 5) + " " + (sr.stat || "int").toLowerCase() + "`", flags: 64 } });
  const hits = findRows(rows, sr.q, ab);
  const kn = await knownItem(env, expandQuery(sr.q, ab));
  if (kn && (!hits.length || hits[0].item.toLowerCase() !== kn.toLowerCase())) return ({ type: 4, data: { content: "**" + shown(kn) + "**: no sales caught in the last few days, so no price yet. Star it on https://maplefm.gg to get told when one shows up.", flags: 64 } });
  if (!hits.length) return ({ type: 4, data: { content: "No listings for **" + q.slice(0, 60) + "** in the last few days. Try a shorter name, or check https://maplefm.gg", flags: 64 } });
  const r = hits[0], rawG = sr.g;
  const link = "https://maplefm.gg/?ref=discord#item=" + encodeURIComponent(r.item);
  const lines = [];
  // equips: the grades from the item card's price ladder in place of one typical that mixes clean and scrolled copies
  const ladL = Array.isArray(r.lad) && Array.isArray(r.lad[0]) ? (r.lad[0][1] || []).filter((g) => g[1] === "sold" || g[1] === "asking") : [];
  const ladRange = (g) => (meso(g[2]) === meso(g[3]) ? meso(g[2]) : meso(g[2]) + " to " + meso(g[3])) + (g[1] === "sold" ? "  from " + g[5] + " sales" : "  asking, " + g[6] + " listed");
  if (ladL.length && !sr.roll) {
    ladL.slice(0, 6).forEach((g) => lines.push((g[7] ? "**" : "") + g[0] + ": " + ladRange(g) + (g[7] ? "**" : "")));
    if (r.lad.length > 1) lines.push("Also priced by " + r.lad.slice(1, 5).map((x) => x[0]).join(", ") + " on the [item's card](" + link + ")");
  }
  else if (r.typ) lines.push("**Typical: " + meso(r.typ) + "**" + (r.lo && r.hi ? "  (" + meso(r.lo) + " to " + meso(r.hi) + ")" : "") + (r.kind === "sale" && !/^ask/.test(r.basis || "") ? "  from " + (r.salesN || 0) + " watched sales" : "  from asking prices"));
  if (r.best) lines.push("Cheapest ask now: " + meso(r.best) + "" + (r.deal >= 0.1 ? "  (" + Math.round(r.deal * 100) + "% under typical)" : ""));
  // where to find it: the seller, channel and room of that cheapest listing, when they were read
  if (r.best && r.bestS && r.bestW) lines.push("Where: " + String(r.bestS).replace(/[*_`~|<>@]/g, "").slice(0, 20) + " · " + String(r.bestW).replace(/[*_`~|<>@]/g, "").slice(0, 40) + (r.bestT > 0 ? " · <t:" + Math.floor(r.bestT / 1000) + ":R>" : ""));
  // mv[0] is the last 24 hours against the 24 before; daily is the typical per day, so the week comes from its ends
  const d = Array.isArray(r.daily) ? r.daily.filter((x) => x && x[1] > 0) : [];
  const wk = d.length >= 3 ? d[d.length - 1][1] / d[0][1] - 1 : null;
  if (Array.isArray(r.mv) && typeof r.mv[0] === "number" && Math.abs(r.mv[0]) >= 0.03) lines.push((r.mv[0] > 0 ? "Up " : "Down ") + Math.round(Math.abs(r.mv[0]) * 100) + "% in 24h");
  else if (wk != null && Math.abs(wk) >= 0.03) lines.push((wk > 0 ? "Up " : "Down ") + Math.round(Math.abs(wk) * 100) + "% over " + d.length + " days");
  const lgD = sr.roll ? ladderGrade(r, sr, rawG) : null;
  if (lgD) { lines.unshift("**" + lgD.g[0] + ": " + ladRange(lgD.g) + "**"); }
  else if (sr.roll && sr.g != null) {
    // the exact roll and scroll state: "work gloves clean 2 crit" is a clean pair with crit rate 1 above base
    await knownItem(env, "");
    const b0 = DBS[String(r.item).toLowerCase()] || {};
    if (/^CRIT/.test(sr.stat || "")) {
      if (!b0[sr.stat] && b0[sr.stat === "CRIT" ? "CRITDMG" : "CRIT"]) sr.stat = sr.stat === "CRIT" ? "CRITDMG" : "CRIT";
      const v = parseInt(sr.g, 10), bs = b0[sr.stat] || 0; if (!sr.plus && bs && v >= bs) sr.g = String(v - bs);
    }
    if ((sr.stat === "ATT" || sr.stat === "MATT") && b0[sr.stat]) { const v = parseInt(sr.g, 10); if (v >= 15 && v >= b0[sr.stat] - 15) sr.g = String(v - b0[sr.stat]); }
    const rq = rollQuote(r, sr), rl = rq.label.charAt(0).toUpperCase() + rq.label.slice(1);
    if (/^CRIT/.test(sr.stat || "") && !b0.CRIT && !b0.CRITDMG) lines.push(shown(r.item) + " has no crit line of its own, so crit on one only comes from scrolls.");
    if (rq.sale) lines.push("**" + rl + ": " + meso(rq.sale.p) + "** from " + rq.sale.n + " sales" + (rq.sale.su > 0 ? " (" + slotsTxt(rq.sale.su) + ")" : "") + (rq.ask ? " · cheapest up now " + meso(rq.ask.pr) : ""));
    else if (rq.ask) lines.push("**" + rl + "**: no sales caught yet · cheapest up now " + meso(rq.ask.pr));
    else lines.push(rl + ": no sales caught at that roll lately.");
    if (!rq.sale && rq.near.length) lines.push("Closest rolls that sold: " + rq.near.map((x) => x.label + " **" + meso(x.p) + "** (" + x.n + " sales)").join(" · "));
    if (!rq.sale) lines.push("Every roll's price is on the [item's card](" + link + ")");
  } else if (r.rk && r.equip && !ladL.length) lines.push("Typical is for clean copies. Rolls are priced by **" + statLabel(r.rk) + "** on the [item's card](" + link + ")");
  lines.push(r.n + " listings seen" + (r.cat ? " · " + r.cat : "") + " · [open on the board](" + link + ")");
  const more = hits.slice(1, 4).map((h) => shown(h.item)).join(", ");
  return ({ type: 4, data: { embeds: [{ title: shown(r.item), description: lines.join("\n"), url: link, color: 0x5b4bdb, footer: { text: (more ? "Also matched: " + more + " · " : "") + "Club FM, priced by watched sales · add /price: maplefm.gg/bot" } }] } });
}

// ---------------------------------------------------------------- !price for Twitch chat
// Plain text for chat bots (Nightbot, StreamElements, Fossabot): one line under 400 characters.
// Nightbot: !commands add !price $(urlfetch https://clubfm-accounts.aaweaver93.workers.dev/chat/price?q=$(querystring))
async function chatPrice(req, env, url) {
  const ip = req.headers.get("CF-Connecting-IP") || "";
  const txt = (t) => new Response(t.slice(0, 390), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
  if (overLimit("cp:" + ip, 120, 60)) return txt("Club FM: slow down a little, try again in a minute.");
  // Nightbot says which channel asked (Nightbot-Channel: name=...&provider=twitch...), StreamElements doesn't
  let chan = ""; try { chan = (new URLSearchParams(req.headers.get("Nightbot-Channel") || "").get("name") || "").toLowerCase().slice(0, 40); } catch (e) {}
  logHit(env, "!price", chan, "", ip).catch(() => {});
  return txt(await priceLine(env, String(url.searchParams.get("q") || "")));
}
// "5 att wg", "work gloves +3 att": the roll comes off before the name is matched, and the answer points at the
// board's price-by-attack table for that item
// Stat words a player might use for a roll, and the label the answer shows
const ROLL_STATS = [
  [/^(magic ?attack|m\.? ?att(ack)?|matt|matk|ma)$/i, "MATT"], [/^(w\.? ?att(ack)?|watk|watt|attack|attk|atk|att|a)$/i, "ATT"],
  [/^(str|strength)$/i, "STR"], [/^(dex|dexterity)$/i, "DEX"], [/^(int|intelligence|intel)$/i, "INT"], [/^(luk|luck|lk)$/i, "LUK"],
  [/^(acc|accuracy)$/i, "ACC"], [/^(avoid|avoidability|avo|eva)$/i, "AVOID"], [/^(speed|spd)$/i, "SPEED"], [/^(jump|jmp)$/i, "JUMP"],
  [/^(hp|maxhp)$/i, "HP"], [/^(mp|maxmp)$/i, "MP"], [/^(wdef|w\.?def|def)$/i, "WDEF"], [/^(mdef|m\.?def)$/i, "MDEF"],
  [/^(crit ?rate|cr|crit)$/i, "CRIT"], [/^(crit ?dmg|crit ?damage|cd|cdmg)$/i, "CRITDMG"]];
// how a roll's stat reads in a reply: "+1 crit damage", "+6 LUK"
const STAT_LABEL = { ATT: "ATT", MATT: "MATT", STR: "STR", DEX: "DEX", INT: "INT", LUK: "LUK", HP: "HP", MP: "MP", ACC: "ACC", AVOID: "avoid", SPEED: "speed", JUMP: "jump",
  WDEF: "W.DEF", MDEF: "M.DEF", CRIT: "crit rate", CRITDMG: "crit damage", TOTAL: "total stats" };
const statLabel = (k) => STAT_LABEL[k] || k || "";
// Roll prices in the members' summary. rt: sold typical per "roll|slots used|stat|moves" ([price, sales]), where moves
// is every paid-for stat that moved, "CRIT+1" or "ATT+1.CRIT+1" ("" is base). ra: cheapest listed per
// "roll|stat|moves|slots used". Older summaries stop after the stat or the slots. rk is the stat most rolls are about.
function parseMoves(t) { const o = {}; for (const c of String(t || "").split(".")) { const m = /^([A-Z]+)([+-]\d+)$/.exec(c); if (m) o[m[1]] = Number(m[2]); } return o; }
function movesLabel(o, su) { const ks = Object.keys(o || {}).filter((k) => o[k]); return ks.length ? ks.map((k) => (o[k] > 0 ? "+" : "") + o[k] + " " + statLabel(k)).join(", ") : su > 0 ? "no gain" : "base"; }
const slotsTxt = (n) => n + (n === 1 ? " slot" : " slots") + " used";
function rollEntries(r) {
  const out = [];
  for (const [key, v] of Object.entries((r && r.rt) || {})) {
    if (!Array.isArray(v)) continue;
    const [a, b, c, d] = key.split("|"), g = Number(a);
    out.push({ g, su: Number(b) || 0, k: c || "", mv: d !== undefined ? parseMoves(d) : (g && c ? { [c]: g } : {}), p: v[0], n: v[1] });
  }
  return out;
}
function askEntries(r) {
  const out = [];
  for (const [key, pr] of Object.entries((r && r.ra) || {})) {
    const [a, c, d, e] = String(key).split("|"), g = Number(a);
    out.push({ g, k: c || "", mv: d !== undefined ? parseMoves(d) : (g && c ? { [c]: g } : {}), su: e === undefined || e === "" ? null : Number(e), pr });
  }
  return out;
}
function rollSales(r, g, stat) { return rollEntries(r).filter((x) => x.g === Number(g) && (!stat || !x.k || x.k === stat)).sort((x, y) => (x.su > 0) - (y.su > 0) || y.n - x.n); }
function rollAsks(r, stat) { return askEntries(r).filter((x) => !stat || !x.k || x.k === stat); }
// What a roll goes for. sr: { g, stat, clean }. With a stat, the match is that stat moved by g and nothing else
// ("+1 crit": crit rate +1, attack at base); clean means no scrolls used. Without a stat, the item's usual roll stat.
// No sale of that exact roll: the closest rolls that did sell, same scroll state, are returned as near.
function rollQuote(r, sr) {
  const g = parseInt(sr.g, 10), clean = !!sr.clean, stat = sr.stat || (g ? "" : "");
  const same = (mv) => {
    const ks = Object.keys(mv).filter((k) => mv[k]);
    if (!g) return ks.length === 0;
    if (stat) return ks.length === 1 && mv[stat] === g;
    return ks.length >= 1 && ks.some((k) => mv[k] === g) && (!r.rk || mv[r.rk] === g || ks.length === 1);
  };
  const okSu = (su) => !clean || su === 0;
  const sales = rollEntries(r).filter((x) => okSu(x.su) && same(x.mv)).sort((x, y) => (x.su > 0) - (y.su > 0) || y.n - x.n);
  const asks = askEntries(r).filter((x) => (!clean || x.su === 0 || x.su == null) && same(x.mv)).sort((x, y) => x.pr - y.pr);
  const sale = sales[0] || null, ask = asks[0] || null;
  const mv0 = sale ? sale.mv : ask ? ask.mv : stat ? { [stat]: g } : {};
  const label = (clean || (sale && sale.su === 0) ? "clean, " : "") + (g && !stat && !sale && !ask ? "+" + g : g || stat ? movesLabel(mv0) : "base");
  let near = [];
  if (!sale) {
    const want = stat ? { [stat]: g } : mv0, dist = (mv) => { const ks = new Set([...Object.keys(mv), ...Object.keys(want)]); let d = 0; for (const k of ks) d += Math.abs((mv[k] || 0) - (want[k] || 0)); return d; };
    near = rollEntries(r).filter((x) => (clean ? x.su === 0 : true) && (!stat || Object.keys(x.mv).length === 0 || x.mv[stat] != null))
      .sort((x, y) => dist(x.mv) - dist(y.mv) || (x.su > 0) - (y.su > 0) || y.n - x.n).slice(0, 2)
      .map((x) => ({ label: (x.su === 0 ? "clean, " : "") + movesLabel(x.mv, x.su) + (x.su > 0 ? " (" + slotsTxt(x.su) + ")" : ""), p: x.p, n: x.n }));
  }
  return { label, sale, ask, near };
}
const ROLL_WORD = "(crit ?damage|crit ?dmg|crit ?rate|cdmg|crit|magic ?attack|m\\.? ?att(?:ack)?|matt|matk|w\\.? ?att(?:ack)?|watk|watt|attack|attk|atk|att|str|strength|dex|dexterity|int|intelligence|intel|luk|luck|acc|accuracy|avoid|avoidability|speed|spd|jump|jmp|hp|mp|w\\.?def|m\\.?def|wdef|mdef|def)";
// "7 att wg", "wg 7 attack", "bandana +3 str", "luk 5 earring" (with +), "clean wg", "7a wg": the roll comes off the
// front so the rest can name the item. Anything with scroll or % stays a scroll search.
function splitRoll(q0) {
  if (/scroll|%/i.test(q0)) return { q: q0, roll: "" };
  // "clean 2 crit work gloves": clean means no scrolls used, and the rest is the roll
  const cm = /(^|\s)(clean|stock|unscrolled)(?=\s|$)/i.exec(q0);
  const q = cm ? q0.replace(cm[0], " ").replace(/\s+/g, " ").trim() : q0;
  const sr = splitRoll0(q);
  if (cm) { if (sr.roll) { sr.clean = true; sr.roll = "clean " + sr.roll; return sr; } return q ? { q, roll: "clean", g: "0", stat: "", plus: true, clean: true } : { q: q0, roll: "" }; }
  return sr;
}
function splitRoll0(q) {
  const lab = (w) => { for (const [re, l] of ROLL_STATS) if (re.test(String(w).trim())) return l; return ""; };
  const tidy = (m) => q.replace(m, " ").replace(/\s+/g, " ").trim();
  let m = new RegExp("(^|\\s)\\+?(\\d{1,2})\\s*" + ROLL_WORD + "(?=\\s|$)", "i").exec(q);
  if (m) { const rest = tidy(m[0]); return rest ? { q: rest, roll: m[2] + " " + statLabel(lab(m[3])), g: m[2], stat: lab(m[3]), plus: /\+/.test(m[0]) } : { q, roll: "" }; }
  m = new RegExp("(^|\\s)" + ROLL_WORD + "\\s*\\+(\\d{1,2})(?=\\s|$)", "i").exec(q);
  if (m) { const rest = tidy(m[0]); return rest ? { q: rest, roll: m[3] + " " + statLabel(lab(m[2])), g: m[3], stat: lab(m[2]), plus: true } : { q, roll: "" }; }
  m = /(^|\s)(\d{1,2})a(?=\s|$)/i.exec(q);                       // "7a wg"
  if (m) { const rest = tidy(m[0]); if (rest) return { q: rest, roll: m[2] + " ATT", g: m[2], stat: "ATT" }; }
  m = /(^|\s)\+(\d{1,2})(?=\s|$)/.exec(q);                       // "nakamaki +3": the item's main stat
  if (m) { const rest = tidy(m[0]); if (rest) return { q: rest, roll: "+" + m[2], g: m[2], stat: "", plus: true }; }
  m = /(^|\s)(clean|stock|unscrolled|base)(?=\s|$)/i.exec(q);     // "clean wg": no scroll taken
  if (m) { const rest = tidy(m[0]); if (rest) return { q: rest, roll: "clean", g: "0", stat: "", plus: true }; }
  return { q, roll: "" };
}
// Words that only name an equip slot: "10 int earring" is the scroll, "emerald earrings 5 int" is a roll
const SLOT_ONLY = /^(the |a |an )?(earrings?|ear|hat|helm|helmet|cap|gloves?|glove|cape|capes|shoes?|boots?|top|tops|topwear|bottom|bottoms|pants|overall|ova|ovr|shield|weapon|wep|claw|bow|crossbow|xbow|cbow|dagger|spear|polearm|pole|wand|staff|sword|axe|blunt|bw|ohs|ths|1h|2h|1hs|2hs|1ha|2ha|1hbw|2hbw|knuckle|gun|face|eye|accessory|ring|pendant|belt)$/i;
// A typed roll on the item's price ladder (summary row lad), matched the way the board's search matches it:
// "wg 4 att" is the +4 ATT grade, "wg 1 crit" the clean +1 crit rate grade, "clean wg" Clean, "steel avarice 28 att"
// Clean 28 ATT. Grades without a price are passed over, so the exact-roll answer below still covers them.
const LAD_STAT = { CRIT: ["crit rate", "crit damage"], CRITDMG: ["crit damage", "crit rate"] };
function ladderGrade(r, sr, rawG) {
  if (!r || !Array.isArray(r.lad)) return null;
  const v = parseInt(rawG, 10), want = (LAD_STAT[sr.stat] || [sr.stat ? statLabel(sr.stat) : ""]).map((x) => String(x).toLowerCase());
  const priced = (g) => g[1] === "sold" || g[1] === "asking";
  for (const lab of want) {
    for (const sv of r.lad) {
      for (const g of sv[1] || []) {
        const name = String(g[0]), lo = name.toLowerCase();
        if (!priced(g)) continue;
        if (sr.clean && !sr.stat && !v && name === "Clean") return { g };
        let m = /^(clean|scrolled) (\d+) (m?att)( or more| or less)?$/.exec(lo);
        if (m && lab && m[3] === lab.toLowerCase() && (!sr.clean || m[1] === "clean") && (+m[2] === v || (m[4] === " or more" && v >= +m[2]) || (m[4] === " or less" && v <= +m[2]))) return { g };
        m = /^clean, \+(\d+) (.+)$/.exec(lo);
        if (m && lab && m[2] === lab && +m[1] === v) return { g };
        m = /^\+(\d+) (.+?)( or more)?$/.exec(lo);
        if (m && lab && !sr.clean && m[2] === lab && (+m[1] === v || (m[3] && v >= +m[1]))) return { g };
      }
    }
  }
  return null;
}
async function priceLine(env, raw) {
  let q = String(raw || "");
  // the query arrives decoded already; decode again only when it still looks encoded ("work%20gloves")
  if (/%[0-9a-f]{2}/i.test(q) && !/%25/i.test(q) && !/\s/.test(q)) { try { q = decodeURIComponent(q); } catch (e) {} }
  q = q.replace(/[\u0000-\u001f\u200b-\u200d\ufeff]/g, " ").replace(/^!?(price|pc|fm)\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!q) return "Usage: !price item name, like !price work gloves or !price claw 60. Prices from real FM sales at maplefm.gg";
  const full = q, rows = await summaryRows(env), ab = await abbrMap();
  let sr = splitRoll(q), hits;
  const rawG = sr.g;   // the number as typed: grades on the site read "+1 crit rate" and "Clean 28 ATT" the same way
  if (sr.roll) {
    hits = findRows(rows, sr.q, ab);
    const isEquip = (r) => r && (r.equip || /^(weapons|equips)$/i.test(r.cat || "")) && !/scroll/i.test(r.item);
    // a bare slot word ("10 int earring", "gloves 10 att") is a scroll search; "+5 int earring" needs an item name
    if (SLOT_ONLY.test(sr.q.trim()) && !sr.plus) { sr = { q: full, roll: "" }; }
    else if (SLOT_ONLY.test(sr.q.trim())) return "Which " + sr.q.trim().toLowerCase() + "? Try !price emerald earrings " + (sr.g || 5) + " " + (sr.stat || "int").toLowerCase() + ", or check maplefm.gg";
    else if (!hits.length) {
      // a real equip nobody has sold lately: say so for the item, not "no listings for red markers 2 att"
      const kn = await knownItem(env, expandQuery(sr.q, ab));
      if (kn) return shown(kn) + " " + sr.roll + ": no sales caught lately, so no price yet. Star it on maplefm.gg to get told when one shows up.";
      sr = { q: full, roll: "" };
    }
    else if (!isEquip(hits[0])) sr = { q: full, roll: "" };
    // "crit" is whichever crit line the item has; "2 crit" on 1 crit gloves is the total, so +1
    if (sr.roll && hits.length && /^CRIT/.test(sr.stat || "")) {
      await knownItem(env, "");
      const b0 = DBS[String(hits[0].item).toLowerCase()] || {};
      if (!b0[sr.stat] && b0[sr.stat === "CRIT" ? "CRITDMG" : "CRIT"]) sr.stat = sr.stat === "CRIT" ? "CRITDMG" : "CRIT";
      const v = parseInt(sr.g, 10), bs = b0[sr.stat] || 0;
      if (!sr.plus && bs && v >= bs) sr.g = String(v - bs);
      sr.roll = (sr.clean ? "clean " : "") + (sr.plus || !bs ? "+" + sr.g : v) + " " + statLabel(sr.stat);
    }
    // weapons are listed by total attack: "nakamaki 60 att" is base 57 plus 3
    if (sr.roll && hits.length && (sr.stat === "ATT" || sr.stat === "MATT")) {
      await knownItem(env, "");
      const base = (DBS[String(hits[0].item).toLowerCase()] || {})[sr.stat];
      const v = parseInt(sr.g, 10);
      if (base && v >= 15 && v >= base - 15) { sr.g = String(v - base); sr.roll = v + " " + sr.stat + " (" + (v - base >= 0 ? "+" : "") + (v - base) + ")"; }
    }
  }
  q = sr.q;
  if (!sr.roll) hits = findRows(rows, q, ab);
  if (hits.length && sr.roll) {
    // the item card's price ladder first, read the way the site's search reads it, so chat and the card agree
    const lg = ladderGrade(hits[0], sr, rawG);
    if (lg) {
      const slugG = shown(hits[0].item).toLowerCase().replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const g0 = lg.g, price = g0[1] === "sold" || g0[1] === "asking" ? (meso(g0[2]) === meso(g0[3]) ? meso(g0[2]) : meso(g0[2]) + " to " + meso(g0[3])) + (g0[1] === "sold" ? " from " + g0[5] + " sales" : " asking, " + g0[6] + " listed") : "not enough sales yet";
      return (shown(hits[0].item) + " " + g0[0].replace(/^Clean, /, "clean ").replace(/^Clean$/, "clean").replace(/^Slots used, no gain$/, "no gain") + ": " + price + " · maplefm.gg/item/" + slugG).slice(0, 390);
    }
    const r0 = hits[0], g = String(parseInt(sr.g, 10)), slug0 = shown(r0.item).toLowerCase().replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    // the exact roll (every paid-for stat that moved) and scroll state; without a sale, the closest rolls that sold
    const rq = rollQuote(r0, sr), b00 = DBS[String(r0.item).toLowerCase()] || {};
    const head = shown(r0.item) + " " + rq.label + ":" + (/^CRIT/.test(sr.stat || "") && !b00.CRIT && !b00.CRITDMG ? " (it has no crit line of its own, so crit only comes from scrolls)" : "");
    if (rq.sale || rq.ask) {
      const b1 = [head];
      if (rq.sale) b1.push("typical " + meso(rq.sale.p) + " from " + rq.sale.n + " sales" + (rq.sale.su > 0 ? " (" + slotsTxt(rq.sale.su) + ")" : ""));
      if (rq.ask) b1.push((rq.sale ? "· " : "") + "cheapest up now " + meso(rq.ask.pr));
      if (!rq.sale && rq.near.length) b1.push("· no sales of this exact roll yet, closest: " + rq.near.map((x) => x.label + " " + meso(x.p)).join(", "));
      b1.push("· maplefm.gg/item/" + slug0);
      return b1.join(" ").slice(0, 390);
    }
    if (rq.near.length) return (head + " no sales of this exact roll yet. Closest that sold: " + rq.near.map((x) => x.label + " " + meso(x.p) + " (" + x.n + " sales)").join(", ") + ". Every roll: maplefm.gg/item/" + slug0).slice(0, 390);
    const b0 = [shown(r0.item) + " " + sr.roll + ": no sales caught at that roll lately."];
    if (r0.rk && sr.stat && sr.stat !== r0.rk && /DEF$/.test(sr.stat)) b0.push("Defense isn't what this sells by: rolls go by " + statLabel(r0.rk) + ".");
    if (r0.typ) b0.push("Clean ones typical " + meso(r0.typ) + ".");
    b0.push("Every roll's price: maplefm.gg/item/" + slug0);
    return b0.join(" ").slice(0, 390);
  }
  // a real item nobody has sold lately ("ilbi", "zakum helm"): say so, instead of answering with a different item
  const known = await knownItem(env, expandQuery(q, ab));
  if (known && (!hits.length || hits[0].item.toLowerCase() !== known.toLowerCase())) {
    return shown(known) + ": no sales caught in the last few days, so no price yet. Star it on maplefm.gg to get told when one shows up.";
  }
  // asked for a scroll, don't answer with a robe
  if (hits.length && /\bscr(oll)?s?\b/i.test(q) && !/scroll/i.test(hits[0].item)) return "No recent listings for " + q + ". Try the full name, like gloves attack scroll 60, or check maplefm.gg";
  if (!hits.length) return "No recent listings for " + q + ". Check maplefm.gg";
  const r = hits[0], bits = [shown(r.item) + ":"];
  // equips answer with their price ladder (the grades on the item card), busiest stat first, so a chat doesn't get one
  // number that mixes clean and scrolled copies
  const lad = Array.isArray(r.lad) && Array.isArray(r.lad[0]) && Array.isArray(r.lad[0][1]) ? r.lad[0][1].filter((g) => g[1] === "sold" || g[1] === "asking") : [];
  if (lad.length) {
    const slugL = shown(r.item).toLowerCase().replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const parts = lad.slice(0, 4).map((g) => g[0].replace(/^Clean, /, "clean ").replace(/^Clean$/, "clean").replace(/^Slots used, no gain$/, "no gain") + " " + (meso(g[2]) === meso(g[3]) ? meso(g[2]) : meso(g[2]) + " to " + meso(g[3])) + (g[1] === "sold" ? " (" + g[5] + " sold)" : " (asking)"));
    return (shown(r.item) + ": " + parts.join(" · ") + (r.lad.length > 1 ? " · by " + r.lad.slice(1, 4).map((x) => x[0]).join(", ") + " too" : "") + " · maplefm.gg/item/" + slugL).slice(0, 390);
  }
  if (r.typ) bits.push("typical " + meso(r.typ) + (r.lo && r.hi && meso(r.lo) !== meso(r.hi) ? " (" + meso(r.lo) + " to " + meso(r.hi) + ")" : "") + (r.kind === "sale" && !/^ask/.test(r.basis || "") ? " from " + (r.salesN || 0) + " sales" : " from asks"));
  if (r.best) bits.push("· cheapest now " + meso(r.best) + (r.bestS && r.bestW ? " (" + String(r.bestS).replace(/[^A-Za-z0-9]/g, "").slice(0, 20) + ", " + String(r.bestW).replace(/[^A-Za-z0-9 ,()]/g, "").slice(0, 40) + ")" : ""));
  if (Array.isArray(r.mv) && typeof r.mv[0] === "number" && Math.abs(r.mv[0]) >= 0.03) bits.push("· " + (r.mv[0] > 0 ? "up " : "down ") + Math.round(Math.abs(r.mv[0]) * 100) + "% today");
  const slug = shown(r.item).toLowerCase().replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  bits.push("· maplefm.gg/item/" + slug);
  return bits.join(" ").slice(0, 390);
}

// ---------------------------------------------------------------- Club FM Twitch chat bot
// Our own bot in a streamer's chat, no Nightbot needed. Built on Twitch's chat bot model:
// 1. The owner connects the bot account once (/twitchbot/connect?as=bot): scopes user:read:chat user:write:chat user:bot.
// 2. A streamer clicks "Add the Club FM bot" (/twitchbot/connect?as=channel): scope channel:bot. That subscribes an
//    EventSub webhook (channel.chat.message) for their chat, delivered to /twitchbot/eventsub.
// 3. !price, !pc and !fm get answered with the same line as /chat/price, sent through Helix Send Chat Message
//    with an app token, as a reply to the asker. 3 second cooldown per channel, 20 answers a minute per channel.
// KV: tb:bot {id, login}, tb:ch:<broadcaster id> {login, name, at, sub}, tb:apptoken {t, exp}.
// Needs Worker secrets TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET, and the redirect URL
// https://clubfm-accounts.aaweaver93.workers.dev/twitchbot/callback added to the Twitch app.
const TB_CMDS = /^!(price|pc|fm)\b/i;
const TBLAST = new Map();   // last answer per channel: 3 seconds between answers
async function tbSecret(env) { return (await hmac(env.SESSION_SECRET || "x", "eventsub-secret")).slice(0, 48); }
async function tbAppToken(env) {
  const c = await env.ACCOUNTS.get("tb:apptoken", "json");
  if (c && c.exp > now() + 600) return c.t;
  const body = new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: "client_credentials" });
  const t = await (await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body })).json();
  if (!t.access_token) throw new Error("twitch app token: " + JSON.stringify(t).slice(0, 200));
  await env.ACCOUNTS.put("tb:apptoken", JSON.stringify({ t: t.access_token, exp: now() + (t.expires_in || 3600) }));
  return t.access_token;
}
async function helix(env, method, path, body) {
  const tok = await tbAppToken(env);
  const r = await fetch("https://api.twitch.tv/helix" + path, { method, headers: { Authorization: "Bearer " + tok, "Client-Id": env.TWITCH_CLIENT_ID, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}
async function tbConnect(req, env, url) {
  if (!env.TWITCH_CLIENT_ID) return text("The Club FM bot isn't switched on yet.", 503);
  const as = url.searchParams.get("as") === "bot" ? "bot" : "channel";
  if (as === "bot") { const me = await whoami(req, env); if (!isAdmin(me, env)) return text("Admin only. Sign in on maplefm.gg first.", 403); }
  const state = as + "." + randomHex(16);
  const u = new URL("https://id.twitch.tv/oauth2/authorize");
  u.searchParams.set("client_id", env.TWITCH_CLIENT_ID);
  u.searchParams.set("redirect_uri", url.origin + "/twitchbot/callback");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", as === "bot" ? "user:read:chat user:write:chat user:bot" : "channel:bot");
  u.searchParams.set("force_verify", "true");
  u.searchParams.set("state", state);
  const h = new Headers({ Location: u.toString() });
  h.append("Set-Cookie", `fm_tbstate=${state}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax`);
  return new Response(null, { status: 302, headers: h });
}
async function tbCallback(req, env, url) {
  const code = url.searchParams.get("code"), state = url.searchParams.get("state") || "";
  const done = (msg, ok) => new Response(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Club FM bot</title><body style="font:16px system-ui;background:#140f22;color:#efe9ff;display:grid;place-items:center;min-height:90vh;margin:0;padding:16px"><div style="max-width:460px;text-align:center"><h1 style="font-size:1.5rem">${ok ? "Club FM bot is in" : "Not connected"}</h1><p>${msg}</p><p><a style="color:#a78bfa" href="${env.SITE}/streamers.html">Back to Club FM</a></p></div>`, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": "fm_tbstate=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax" } });
  if (!code || !state || state !== cookie(req, "fm_tbstate")) return done("The Twitch sign-in didn't complete. Try the button again.", false);
  const as = state.split(".")[0];
  const body = new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, client_secret: env.TWITCH_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: url.origin + "/twitchbot/callback" });
  const tok = await (await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body })).json();
  if (!tok.access_token) return done("Twitch didn't accept the connection. Try again.", false);
  const u = await (await fetch("https://api.twitch.tv/helix/users", { headers: { Authorization: "Bearer " + tok.access_token, "Client-Id": env.TWITCH_CLIENT_ID } })).json();
  const me = u && u.data && u.data[0];
  if (!me) return done("Couldn't read the Twitch account.", false);
  if (as === "bot") {
    const a = await whoami(req, env); if (!isAdmin(a, env)) return done("Admin only.", false);
    await env.ACCOUNTS.put("tb:bot", JSON.stringify({ id: me.id, login: me.login, name: me.display_name, at: now() }));
    return done("Bot account set to " + me.display_name + ". Streamers can now add it from maplefm.gg/streamers.html.", true);
  }
  const bot = await env.ACCOUNTS.get("tb:bot", "json");
  if (!bot) return done("The bot account isn't set up yet. Message Maya in the Club FM Discord.", false);
  const sub = await tbSubscribe(env, url.origin, me.id, bot.id);
  if (!sub.ok) return done("Twitch wouldn't start the chat feed (" + sub.why + "). Message Maya in the Club FM Discord.", false);
  await env.ACCOUNTS.put("tb:ch:" + me.id, JSON.stringify({ login: me.login, name: me.display_name, at: now(), sub: sub.id }));
  return done(me.display_name + ": type !price work gloves in your chat to try it. Prices come from real Free Market sales on maplefm.gg. Remove it anytime under Twitch Settings, Connections.", true);
}
async function tbSubscribe(env, origin, broadcasterId, botId) {
  const r = await helix(env, "POST", "/eventsub/subscriptions", { type: "channel.chat.message", version: "1", condition: { broadcaster_user_id: broadcasterId, user_id: botId }, transport: { method: "webhook", callback: origin + "/twitchbot/eventsub", secret: await tbSecret(env) } });
  if (r.status === 202) return { ok: true, id: r.j.data[0].id };
  if (r.status === 409) return { ok: true, id: "existing" };
  return { ok: false, why: (r.j && r.j.message) || String(r.status) };
}
async function tbEventsub(req, env) {
  const raw = await req.text();
  const id = req.headers.get("Twitch-Eventsub-Message-Id") || "", ts = req.headers.get("Twitch-Eventsub-Message-Timestamp") || "";
  const sig = req.headers.get("Twitch-Eventsub-Message-Signature") || "";
  if ("sha256=" + await hmac(await tbSecret(env), id + ts + raw) !== sig) return new Response("bad signature", { status: 403 });
  if (Math.abs(Date.now() - Date.parse(ts)) > 10 * 60 * 1000) return new Response("old", { status: 403 });
  const kind = req.headers.get("Twitch-Eventsub-Message-Type");
  let m; try { m = JSON.parse(raw); } catch (e) { return new Response("bad json", { status: 400 }); }
  if (kind === "webhook_callback_verification") return new Response(m.challenge, { headers: { "Content-Type": "text/plain" } });
  if (kind === "revocation") { const b = m.subscription && m.subscription.condition && m.subscription.condition.broadcaster_user_id; if (b) await env.ACCOUNTS.delete("tb:ch:" + b); return new Response("ok"); }
  if (kind !== "notification") return new Response("ok");
  const e = m.event || {}, said = String(e.message && e.message.text || "").trim();
  if (!TB_CMDS.test(said)) return new Response("ok");
  if (await env.ACCOUNTS.get("tbseen:" + id)) return new Response("ok");
  const b = e.broadcaster_user_id;
  const bot = await env.ACCOUNTS.get("tb:bot", "json");
  if (!bot || e.chatter_user_id === bot.id) return new Response("ok");   // its own replies never use up the cooldown
  if (Date.now() - (TBLAST.get(b) || 0) < 3000 || overLimit("tbmin:" + b, 20, 60)) return new Response("ok");
  TBLAST.set(b, Date.now());
  await env.ACCOUNTS.put("tbseen:" + id, "1", { expirationTtl: 900 });
  const line = await priceLine(env, said);
  await logHit(env, "!price bot", e.broadcaster_user_login || "", "", "tb:" + e.chatter_user_id).catch(() => {});
  await helix(env, "POST", "/chat/messages", { broadcaster_id: b, sender_id: bot.id, message: line, reply_parent_message_id: e.message_id });
  const day = new Date().toISOString().slice(0, 10), k = "tbuse:" + b + ":" + day;
  await env.ACCOUNTS.put(k, String(Number(await env.ACCOUNTS.get(k) || 0) + 1), { expirationTtl: 400 * 86400 });
  return new Response("ok");
}
async function tbStatus(env) {
  const bot = await env.ACCOUNTS.get("tb:bot", "json"), out = { switchedOn: !!env.TWITCH_CLIENT_ID, bot, channels: [] };
  const l = await env.ACCOUNTS.list({ prefix: "tb:ch:" });
  for (const k of l.keys) { const c = await env.ACCOUNTS.get(k.name, "json"); const b = k.name.slice(6); const use = await env.ACCOUNTS.list({ prefix: "tbuse:" + b + ":" }); let n = 0; for (const u of use.keys) n += Number(await env.ACCOUNTS.get(u.name) || 0); out.channels.push({ ...c, id: b, answers: n }); }
  return out;
}

// ---------------------------------------------------------------- partner links (maplefm.gg/niru)
// A partner's link pings here once per visitor per day; visits, unique visitors and sign-ins are counted per day.
const PARTNERS = ["niru"];
async function refHit(req, env, url) {
  const who = String(url.searchParams.get("p") || "").toLowerCase();
  if (!PARTNERS.includes(who)) return json({ ok: false }, 404);
  const ip = req.headers.get("CF-Connecting-IP") || "", day = new Date().toISOString().slice(0, 10);
  if (overLimit("ref:" + ip, 20, 600)) return json({ ok: true });
  const vh = (await hmac(env.SESSION_SECRET || "x", "ref|" + day + "|" + ip)).slice(0, 16);
  const seenKey = "refseen:" + who + ":" + day + ":" + vh;
  const k = "ref:" + who + ":" + day, c = (await env.ACCOUNTS.get(k, "json")) || { visits: 0, uniques: 0 };
  c.visits++;
  if (!(await env.ACCOUNTS.get(seenKey))) { c.uniques++; await env.ACCOUNTS.put(seenKey, "1", { expirationTtl: 2 * 86400 }); }
  await env.ACCOUNTS.put(k, JSON.stringify(c), { expirationTtl: 400 * 86400 });
  return json({ ok: true }, 200, { "Cache-Control": "no-store" });
}
async function refStats(env, url) {
  const out = {};
  for (const who of PARTNERS) {
    const l = await env.ACCOUNTS.list({ prefix: "ref:" + who + ":" });
    let tv = 0, tu = 0; const days = {};
    for (const k of l.keys) { const c = (await env.ACCOUNTS.get(k.name, "json")) || {}; days[k.name.split(":")[2]] = c; tv += c.visits || 0; tu += c.uniques || 0; }
    out[who] = { visits: tv, uniques: tu, days };
  }
  return out;
}

// ---------------------------------------------------------------- Reddit watch
// Every 5 minutes: new posts on the Classic subreddits that talk prices or the Free Market get DMed to the admins,
// so Maya can answer while the post is fresh. Reads Reddit's public feeds only; nothing is posted or voted.
const REDDIT_CRON = "2-59/5 * * * *";
const REDDIT_SUBS = ["MSClassicWorld", "MapleStoryClassic"];
// What counts as a price or Free Market post. One loose word ("scroll", "shop", "worth", "pc", "deal") used to be enough,
// which flagged build questions, cash shop chatter and "is it worth it" posts. Now a post needs one clear market signal
// (price check, WTS/WTB, how much is, free market, an amount in mesos next to a trade word...) or two weaker ones
// together with an amount. Talk about classes, bosses, training and the game client is left out.
const RD_STRONG = [
  [/\b(price ?check|pc ?(pls|please|plz|\?))|^\s*\[?pc\]?\s*[:\-]/i, "price check"],
  [/\b(wts|wtb|wtt|lf seller|lf buyer)\b/i, "WTS/WTB"],
  [/\bhow much (is|are|for|would|do|does|should|to|can|did)\b/i, "how much"],
  [/\bwhat(?:'s| is| are|s)? (?:the |a |an )?(?:going |market |fair |current )?(?:price|rate|value)\b/i, "what's the price"],
  [/\b(fair|good|bad|current|market|going|fm|average|typical|asking|selling|buying|sale|sold for|lowball|low ?ball)\s+price[sd]?\b/i, "price"],
  [/\bprice[sd]?\s+(check|of|for|on|range|history|trend|drop|crash|went|go(ing)? (up|down))\b/i, "price"],
  [/\b(pricing|overpriced|underpriced|price ?gouging)\b/i, "pricing"],
  [/\bfree ?market\b|\bin (the )?fm\b|\bfm (price|prices|shop|shops|room|merch|flipping|sniping)\b/i, "free market"],
  [/\b(merch(ing|ant)?s?|flipp(ing|ed|er)|snip(ing|ed)|hired merchant|player shops?)\b/i, "merching"],
  [/\b(economy|inflation|deflation|meso (market|value|price|rate)|mesos? per (nx|hour)|nx (rate|to mesos?)|mesos? (crash|inflat))/i, "economy"],
  [/\b\d+(\.\d+)?\s?(k|m|mil|mill|million|b|bil)\b[^.?!\n]{0,40}\b(each|ea|for it|offer|sold|selling|buy|bought|asking|price)\b|\b(sold|bought|selling|buying|offer(ed)?|asking)\b[^.?!\n]{0,40}\b\d+(\.\d+)?\s?(k|m|mil|mill|million|b|bil)\b/i, "amount"],
  [/\b(going|goes|go|sells?|selling|sold|worth|priced)\s+(for\s+|at\s+|around\s+|about\s+)?\d+(\.\d+)?\s?(k|m|mil|mill|million|b|bil|mesos?)\b/i, "amount"],
  [/\b(make|making|farm(ing)?|earn(ing)?)\s+(more\s+|some\s+|good\s+)?mesos?\b|\bmesos?\s+(making|farm(ing)?|per hour|an hour|\/\s?h(ou)?r)\b/i, "making mesos"],
  [/\b(maplefm|club ?fm|fm watcher)\b/i, "Club FM"]
];
const RD_WEAK = /\b(sell(ing|s)?|buy(ing|s)?|trad(e|ing|ed)|worth|value|cheap|expensive|deal|market|mesos?|scroll(s|ed)?|\d+% ?scroll|gfa|gfdex|ggl?|clean|slots?|att(ack)?|nx)\b/gi;
const RD_AMOUNT = /\b\d+(\.\d+)?\s?(k|m|mil|mill|million|b|bil|mesos?)\b/i;
// "worth it", "worth leveling", cash-shop-only and game-client posts read like market talk but aren't
const RD_NOT = /\b(worth (it|playing|leveling|levell?ing|the grind|maining|trying|getting into|returning)|is (it|this|classic) worth(?! anything| much| selling)|cash shop (sale|update|items? (are|is) (back|out))|pc (specs?|build|crash(es)?|lag|requirements?|version|client|players?|gaming)|on (my|a|the) pc|gaming pc|new pc|mac|steam deck|controller)\b/i;
// A post is worth a ping when someone is asking what gear is worth, or selling or buying it, or talking about the
// site. Market words alone ("economy", "merchants", "in the FM", a meso amount) are not enough: they caught tier
// lists and server-lock rants. Rules, in order:
// 1. a market flair; 2. the site or the watcher named; 3. a price question (how much, price check, what's it worth,
// WTS/WTB) anywhere; 4. a price word in the title with gear in the post; 5. a sell or buy word in the title with gear
// and an amount.
const RD_ASK = /\b(how much|price ?check|pc (pls|please|plz)|what(?:'s| is| are|s)? (?:it|this|that|they|these|my \w+|a \w+)? ?(?:worth|going for|selling for)|worth anything|any idea (?:what|how much)|wts|wtb|wtt|lf (?:seller|buyer)|taking offers|accepting offers|best offer|lowball(?:ed|ing)?|fair price|good price|going rate|market value|sells? for how much|(?:what|where) (?:does|do) (?:it|they|this|these) drop|drop(?:s|ped)? from|where (?:can|do|would) i (?:get|find|buy)|seen (?:any|one) (?:in the fm|for sale)|anyone (?:selling|have one|got one))\b/i;
const RD_PRICEW = /\b(price[sd]?|pricing|worth|value[ds]?|cost[s]?|overpriced|underpriced|sell(?:ing|s)?|sold|buy(?:ing)?|offer)\b/i;
const RD_SELLW = /\b(sell(?:ing|s)?|sold|buy(?:ing)?|bought|trade|trading|offer)\b/i;
const RD_GEAR = /(^|[\s(])[+-]\d{1,2}\b|\b\d\/\d{1,2}\b|\bclean\b|\b\d{1,3}\s?(?:att|attack|matk|m\.?att|wa|ma|str|dex|int|luk|acc|avoid|slots?)\b|\b(?:gfa|gfdex|gfluk|gfint|gfstr|wg|bwg|ggl?|nlc|zhelm|pac|sauna|gach|tgh)\b|\b(?:weapons?|claw|glove|gloves|scroll|scrolls|wand|staff|bow|crossbow|xbow|helm|hat|cape|earrings?|shoes?|overall|top|bottom|shield|spear|polearm|pole ?arm|axe|sword|dagger|mace|knuckle|fan|throwing stars?|stars|wings|ring|pendant|coupon|chair)\b/i;
const RD_SITE = /\b(maplefm|club ?fm|fm ?watcher)\b/i;
function redditScore(title, flair, body) {
  const head = (title || "") + " " + (flair || ""), text = head + " " + String(body || "").slice(0, 3000);
  if (/\b(price ?check|market|trading|economy|buying|selling|wts|wtb)\b/i.test(flair || "")) return { hit: true, why: "flair: " + flair };
  let m = RD_SITE.exec(text); if (m) return { hit: true, why: "mentions " + m[0] };
  if (RD_NOT.test(head)) return { hit: false, why: "off topic: " + (RD_NOT.exec(head) || [""])[0] };
  m = RD_ASK.exec(text); if (m) return { hit: true, why: "asks: " + m[0].trim().slice(0, 40) };
  const g = RD_GEAR.exec(text), p = RD_PRICEW.exec(head);
  if (p && g) return { hit: true, why: "price " + p[0] + " + " + g[0].trim() };
  const sw = RD_SELLW.exec(head);
  if (sw && g && RD_AMOUNT.test(text)) return { hit: true, why: sw[0] + " + " + g[0].trim() + " + amount" };
  return { hit: false, why: [p && p[0], g && g[0].trim()].filter(Boolean).join(", ") };
}
// every post the watch looked at, with the call it made, for /admin/reddit (the last 200)
async function redditLog(env, rows) {
  if (!rows.length) return;
  const cur = (await env.ACCOUNTS.get("reddit:log", "json")) || [];
  await env.ACCOUNTS.put("reddit:log", JSON.stringify(rows.concat(cur).slice(0, 200)));
}
async function redditFeed(sub) {
  const H = { "User-Agent": "web:gg.maplefm.redditwatch:v1 (by Club FM)", Accept: "application/json" };
  for (const u of ["https://www.reddit.com/r/" + sub + "/new.json?limit=25&raw_json=1", "https://old.reddit.com/r/" + sub + "/new.json?limit=25&raw_json=1"]) {
    const r = await fetch(u, { headers: H, cf: { cacheTtl: 0 } }).catch(() => null);
    if (r && r.ok) { const j = await r.json().catch(() => null); if (j && j.data) return { ok: true, posts: j.data.children.map((c) => c.data) }; }
    if (r && r.status === 404) return { ok: true, posts: [] };
    var last = r ? r.status : 0;
  }
  // the RSS feed answers when the JSON one is refused
  const r = await fetch("https://www.reddit.com/r/" + sub + "/new/.rss?limit=25", { headers: { "User-Agent": H["User-Agent"] } }).catch(() => null);
  if (!r || !r.ok) return { ok: false, status: r ? r.status : last };
  const x = await r.text(), posts = [];
  for (const m of x.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1], g = (t) => { const k = new RegExp("<" + t + "[^>]*>([\\s\\S]*?)</" + t + ">").exec(e); return k ? k[1] : ""; };
    const link = (/<link href="([^"]+)"/.exec(e) || [])[1] || "", id = (g("id").split("_")[1] || g("id"));
    const un = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    posts.push({ id, title: un(g("title")), selftext: un(g("content")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), permalink: link.replace("https://www.reddit.com", ""), author: (g("name").replace("/u/", "")), created_utc: Date.parse(g("published") || g("updated")) / 1000, link_flair_text: "" });
  }
  return { ok: true, posts };
}
// Reddit refuses requests from Cloudflare (429), so the stream reader on Maya's PC reads the feeds and pushes new
// posts here; the matching and the DMs stay in one place.
async function redditPush(req, env) {
  const k = req.headers.get("X-Push-Key") || "";
  if (!env.REDDIT_PUSH_KEY || k !== env.REDDIT_PUSH_KEY) return json({ error: "no" }, 403);
  const body = await req.json().catch(() => null);
  const posts = body && Array.isArray(body.posts) ? body.posts.slice(0, 60) : [];
  const st = (await env.ACCOUNTS.get("reddit:state", "json")) || { seen: [] };
  const seen = new Set(st.seen || []), first = !(st.seen || []).length, hits = [], log = [];
  for (const p of posts) {
    if (!p || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    if (first || Date.now() / 1000 - (Number(p.created_utc) || 0) > 6 * 3600) continue;
    const text = (p.title || "") + " " + (p.link_flair_text || "") + " " + String(p.selftext || "").slice(0, 3000);
    const sub = String(p.sub || "MSClassicWorld");
    if (/^maplestory$/i.test(sub) && !/\b(classic|mscw|classic ?world)\b/i.test(text)) { log.push({ t: Date.now(), sub, title: String(p.title || "").slice(0, 140), hit: false, why: "modern game sub" }); continue; }   // the main sub is mostly the modern game
    const sc = redditScore(p.title, p.link_flair_text, p.selftext);
    log.push({ t: Date.now(), sub, id: p.id, title: String(p.title || "").slice(0, 140), hit: sc.hit, why: sc.why });
    if (sc.hit) hits.push({ sub, p, why: sc.why });
  }
  await redditLog(env, log);
  st.seen = [...seen].slice(-600); st.at = Date.now(); st.lastOk = Date.now(); st.status = 200; st.fails = 0; st.via = "pc";
  await env.ACCOUNTS.put("reddit:state", JSON.stringify(st));
  for (const h of hits) h.reply = await redditReply(env, h.p).catch(() => "");
  if (hits.length) {
    // the post as a card, then the reply as a plain message under it: Discord on a phone can copy a message, not a card
    const ids = await wdAdmins(env), embs = redditEmbeds(hits);
    for (let i = 0; i < Math.min(hits.length, 10); i++) {
      await wdDM(env, ids, [embs[i]]);
      if (hits[i].reply) await wdText(env, ids, hits[i].reply);
    }
  }
  return json({ ok: true, new: hits.length });
}
// A reply ready to paste: for each item the post names, what it sells for, what's listed, where it drops, and the link.
// Written plain and lowercase like a player would. Never says who runs the site.
// An item's link: its own page when it has one (Discord and Reddit show that page's picture and price), else the board
function itemUrl(name, priced) {
  const m = /^(.*Scroll): (Lesser|Intermediate|Greater|Chaos|Superior)$/.exec(String(name));
  const shown = m ? m[1] + " " + ({ Lesser: "100%", Intermediate: "60%", Greater: "10%", Chaos: "Chaos", Superior: "Superior" })[m[2]] : String(name);
  const slug = shown.toLowerCase().replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return priced && slug ? "https://maplefm.gg/item/" + slug + "/" : "https://maplefm.gg/#item=" + encodeURIComponent(name);
}
async function redditReply(env, p) {
  const LIVE = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/";
  const [sum, guide] = await Promise.all([
    fetch(LIVE + "summary-public.json", { cf: { cacheTtl: 600, cacheEverything: true } }).then((r) => r.json()).catch(() => null),
    fetch(LIVE + "itemguide.json", { cf: { cacheTtl: 3600, cacheEverything: true } }).then((r) => r.json()).catch(() => null)]);
  const rows = {}; for (const r of (sum && sum.rows) || []) if (r && r.item) rows[r.item.toLowerCase()] = r;
  const gi = (guide && guide.items) || {};
  // "michael's wings" finds Michael Wings: apostrophes and possessive s don't count on either side
  const flat = (x) => " " + String(x).toLowerCase().replace(/[\u2019']s\b/g, "").replace(/[\u2019']/g, "").replace(/[^a-z0-9%+ ]+/g, " ").replace(/\s+/g, " ").trim() + " ";
  const text = flat((p.title || "") + " " + (p.selftext || ""));
  const names = new Set(Object.keys(rows).concat(Object.keys(gi).map((n) => n.toLowerCase())));
  const found = [];
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    if (n.length < 5 || /cut off|\u2026/.test(n) || !text.includes(flat(n))) continue;
    if (found.some((f) => f.includes(n))) continue;
    found.push(n); if (found.length >= 2) break;
  }
  const k = (v) => (v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M" : v >= 1000 ? Math.round(v / 1000) + "K" : String(Math.round(v)));
  // roll prices live in the members' summary: rt = sold typical per "roll|slots", ra = cheapest listed per roll
  const vault = found.length ? await vaultJSON(env, "data/summary.json", 600).catch(() => null) : null;
  const vrows = {}; for (const r of (vault && vault.rows) || []) if (r && r.item) vrows[r.item.toLowerCase()] = r;
  // the roll: a popup's "(0 +10)" is the stat gain and wins; "Star Earrings (+5)" is how many scrolls passed, not a
  // roll; otherwise "+3 steel avarice" is the gain
  const raw = String((p.title || "") + " " + (p.selftext || ""));
  const gains = [...raw.matchAll(/\(\s*\d+\s*\+\s*(\d{1,2})\s*\)/g)].map((m2) => Number(m2[1]));
  const upg = /[a-z]\s*\(\+\d{1,2}\)/i.test(raw);
  const rollM = /(?:^|\s)\+(\d{1,2})\b/.exec(text);
  const roll = gains.length ? Math.max(...gains) : upg ? null : rollM ? Number(rollM[1]) : null;
  const asksDrop = /\b(drop|drops|dropped|farm|where (?:can|do|would) i (?:get|find))\b/.test(text);
  const lines = [];
  let plug = "";
  for (const n of found) {
    const r = rows[n], v = vrows[n] || {}, gk = Object.keys(gi).find((x) => x.toLowerCase() === n), g = gk ? gi[gk] : null, name = (r && r.item) || gk || n, low = name.toLowerCase();
    const url = itemUrl(name, !!(r && r.typ));
    if (r && r.typ && (r.salesN || 0) >= 3) lines.push((roll != null ? "Clean " + name : name) + " has been selling for around " + k(r.typ) + (r.lo && r.hi && k(r.lo) !== k(r.hi) ? " (" + k(r.lo) + " to " + k(r.hi) + ")" : "") + ", from " + r.salesN + " sales.");
    else if (r && r.typ) lines.push("Not many " + name + " have sold yet. The ones listed go for around " + k(r.typ) + ".");
    if (roll != null) {
      // the stat the post names ("+5 int"), else the stat this item's rolls are usually about
      const sm = /\+\d{1,2}\s*(str|dex|int|luk|att|matt|crit)/i.exec(raw), stat = sm ? { str: "STR", dex: "DEX", int: "INT", luk: "LUK", att: "ATT", matt: "MATT", crit: "CRITDMG" }[sm[1].toLowerCase()] : "";
      const s0 = rollSales(v, roll, stat)[0], sold = s0 ? [null, [s0.p, s0.n]] : null, sk = statLabel((s0 && s0.k) || stat || v.rk);
      if (sold) lines.push("A +" + roll + (sk ? " " + sk : "") + " has sold for around " + k(sold[1][0]) + " (" + sold[1][1] + " sales).");
      else lines.push("No +" + roll + (sk ? " " + sk : "") + " " + name + " has sold yet, so there's no exact comp.");
      const ra = rollAsks(v, stat).filter((x) => x.g > 0 && Math.abs(x.g - roll) <= 3).sort((x, y) => x.g - y.g || x.pr - y.pr).map((x) => [x.g, x.pr, x.k]);
      if (ra.length) lines.push("Listed right now: " + ra.slice(0, 4).map(([g2, pr, kk]) => "+" + g2 + (kk ? " " + statLabel(kk) : "") + " at " + k(pr)).join(", ") + ".");
      // no sale at this roll: the same kind of gear at about the same roll, listed now (earrings for earrings)
      if (!sold && v.cat) {
        const idb = await fetch(LIVE + "itemdb.json", { cf: { cacheTtl: 3600, cacheEverything: true } }).then((r2) => r2.json()).catch(() => null);
        const meta = {}; for (const row of (idb && idb.items) || []) meta[String(row[0]).toLowerCase()] = { lv: row[2] || 0, kind: row[5] };
        const me = meta[low];
        const sim = me ? Object.values(vrows).filter((x) => { const m2 = meta[x.item.toLowerCase()]; return x.item !== name && m2 && m2.kind === me.kind && Math.abs(m2.lv - me.lv) <= 10; })
          .flatMap((x) => rollAsks(x, "").map((a2) => ({ n: x.item.toLowerCase(), nm: x.item, g: a2.g, k: a2.k, pr: a2.pr, typ: x.typ || 0 })))
          .filter((x) => Math.abs(x.g - roll) <= 2 && x.g > 0 && x.pr >= Math.max(3 * x.typ, 50000) && (!x.typ || x.pr <= 30 * x.typ))
          .sort((x, y) => Math.abs(x.g - roll) - Math.abs(y.g - roll) || y.pr - x.pr).slice(0, 3) : [];
        if (sim.length) lines.push("Similar ones listed: " + sim.map((x) => x.nm + " +" + x.g + (x.k ? " " + statLabel(x.k) : "") + " at " + k(x.pr)).join(", ") + ".");
      }
      plug = "You can see what's listed and sold by roll here: " + url;
    } else if (!plug) plug = "Every sale and what's listed right now is here: " + url;
    const drops = g && g.d ? g.d.slice().sort((x, y) => (y[6] || 0) - (x[6] || 0)).slice(0, 2).map((d) => d[0] + (d[1] ? " (Lv. " + d[1] + ")" : "")) : [];
    if (drops.length && (asksDrop || !(r && r.typ))) lines.push(name + " drops from " + drops.join(" and ") + ".");
  }
  if (!found.length) plug = "You can look up what things actually sold for and what's listed right now at https://maplefm.gg";
  if (plug) lines.push("", plug);
  return lines.join("\n").slice(0, 900);
}
function redditEmbeds(hits) {
  return hits.slice(0, 10).map(({ sub, p, why, reply }) => ({
    title: String(p.title || "New post").slice(0, 250), url: "https://www.reddit.com" + String(p.permalink || "").replace(/^https:\/\/www\.reddit\.com/, ""), color: 0x6d3fd1,
    description: String(p.selftext || "").replace(/\s+/g, " ").slice(0, 300),
    fields: [{ name: "Where", value: "r/" + sub + (p.link_flair_text ? " · " + p.link_flair_text : ""), inline: true }, { name: "By", value: "u/" + (p.author || "?"), inline: true }, { name: "Matched", value: why, inline: true }]
      .concat(reply ? [{ name: "Reply to paste", value: "In the next message. Press and hold it, then Copy Text.", inline: false }] : []),
    footer: { text: "Reddit watch · reply while it's fresh" }, timestamp: new Date((Number(p.created_utc) || Date.now() / 1000) * 1000).toISOString()
  }));
}
async function redditWatch(env) {
  const st = (await env.ACCOUNTS.get("reddit:state", "json")) || { seen: [], fails: 0 };
  if (st.via === "pc" && Date.now() - (st.lastOk || 0) < 30 * 60e3) return { ok: 0, hits: 0, pc: true };   // the PC is feeding it
  const seen = new Set(st.seen || []), first = !(st.seen || []).length, hits = [];
  let ok = 0, status = 0;
  for (const sub of REDDIT_SUBS) {
    const f = await redditFeed(sub);
    if (!f.ok) { status = f.status; continue; }
    ok++;
    for (const p of f.posts) {
      if (!p.id || seen.has(p.id)) continue;
      seen.add(p.id);
      if (first || Date.now() / 1000 - (p.created_utc || 0) > 6 * 3600) continue;   // the first run only learns what is already there
      const sc = redditScore(p.title, p.link_flair_text, p.selftext);
      if (sc.hit) hits.push({ sub, p, why: sc.why });
    }
  }
  st.seen = [...seen].slice(-400); st.at = Date.now(); st.lastOk = ok ? Date.now() : st.lastOk; st.status = ok ? 200 : status;
  st.fails = ok ? 0 : (st.fails || 0) + 1;
  // tell the admins once if Reddit keeps refusing, then stay quiet
  if (st.fails === 12) await wdDM(env, await wdAdmins(env), [{ title: "Reddit watch can't reach Reddit", description: "Reddit has refused the last hour of checks (status " + status + "). New posts won't be flagged until it answers again.", color: 0xe74c3c }]);
  await env.ACCOUNTS.put("reddit:state", JSON.stringify(st));
  if (!hits.length) return { ok, hits: 0 };
  const embeds = redditEmbeds(hits);
  await wdDM(env, await wdAdmins(env), embeds);
  return { ok, hits: hits.length };
}
// ---------------------------------------------------------------- traffic
// Every page loads /assets/hit.js, which posts the page, the referring site and a ?ref= tag here. Stored in D1 with a
// daily scrambled visitor id (hmac of the day and address); the address itself is never kept. Bots are skipped.
// Reports go to a private Discord channel only the owner sees: hourly 9 AM to 11 PM Eastern, overnight at 8 AM.
const TRAFFIC_CH = "1563607619468394537";
let HITS_READY = false;
async function hitsTable(env) {
  if (HITS_READY || !env.INBOX_DB) return;
  await env.INBOX_DB.prepare("CREATE TABLE IF NOT EXISTS hits (t INTEGER, p TEXT, r TEXT, q TEXT, v TEXT)").run();
  await env.INBOX_DB.prepare("CREATE INDEX IF NOT EXISTS hits_t ON hits (t)").run();
  // ret: 1 when this browser first came on an earlier day (a date kept in its own storage, never sent), 0 on a first day
  await env.INBOX_DB.prepare("ALTER TABLE hits ADD COLUMN ret INTEGER").run().catch(() => {});
  // who opened the site signed in with Discord, one row per account per day (Eastern), the time of the latest visit
  await env.INBOX_DB.prepare("CREATE TABLE IF NOT EXISTS signin (id TEXT, day TEXT, t INTEGER, PRIMARY KEY (id, day))").run();
  await env.INBOX_DB.prepare("CREATE INDEX IF NOT EXISTS signin_t ON signin (t)").run();
  HITS_READY = true;
}
async function logHit(env, page, ref, tag, who, ret) {
  if (!env.INBOX_DB) return;
  await hitsTable(env);
  const day = new Date().toISOString().slice(0, 10), v = (await hmac(env.SESSION_SECRET || "x", "v|" + day + "|" + who)).slice(0, 12);
  await env.INBOX_DB.prepare("INSERT INTO hits (t, p, r, q, v, ret) VALUES (?, ?, ?, ?, ?, ?)").bind(Date.now(), page, ref, tag, v, ret == null ? null : ret ? 1 : 0).run();
}
async function logSignin(env, id) {
  if (!env.INBOX_DB || !id) return;
  await hitsTable(env);
  const t = Date.now();
  await env.INBOX_DB.prepare("INSERT INTO signin (id, day, t) VALUES (?, ?, ?) ON CONFLICT (id, day) DO UPDATE SET t = excluded.t").bind(String(id), etParts(t).day, t).run();
}
async function hit(req, env) {
  const ok = new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
  const ua = req.headers.get("User-Agent") || "", ip = req.headers.get("CF-Connecting-IP") || "";
  if (/bot|crawl|spider|slurp|headless|preview|lighthouse|playwright|python|curl/i.test(ua) || !ua) return ok;
  if (overLimit("hit:" + ip, 60, 60)) return ok;
  let b = {}; try { b = JSON.parse(await req.text()); } catch (e) { return ok; }
  let page = String(b.p || "/").slice(0, 120), ref = String(b.r || "").toLowerCase().replace(/^www\./, "").slice(0, 80), tag = String(b.q || "").replace(/[^\w-]/g, "").slice(0, 24);
  if (/(^|\.)maplefm\.gg$/.test(ref)) ref = "";
  await logHit(env, page, ref, tag, ip, b.ret === 1 ? 1 : b.ret === 0 ? 0 : null);
  return ok;
}
// Sold buttons: players mark a listing in Where to buy as sold. One vote per person per listing (a scrambled
// address, never the address itself). The site hides a listing once enough people mark it and no scan has seen it
// since. How many it takes lives in KV gone:need (default 3), changed with POST /admin/gone-need?n=3.
let GONE_READY = false;
async function goneTable(env) {
  if (GONE_READY || !env.INBOX_DB) return;
  await env.INBOX_DB.prepare("CREATE TABLE IF NOT EXISTS gone (k TEXT, v TEXT, t INTEGER, PRIMARY KEY (k, v))").run();
  await env.INBOX_DB.prepare("CREATE INDEX IF NOT EXISTS gone_t ON gone (t)").run();
  GONE_READY = true;
}
async function gonePost(req, env) {
  const h = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  const ua = req.headers.get("User-Agent") || "", ip = req.headers.get("CF-Connecting-IP") || "";
  if (!ua || /bot|crawl|spider|headless|python|curl/i.test(ua)) return json({ ok: false }, 200, h);
  if (overLimit("gone:" + ip, 20, 600)) return json({ ok: false, error: "slow down" }, 429, h);
  let b = {}; try { b = JSON.parse(await req.text()); } catch (e) { return json({ ok: false }, 400, h); }
  const k = String(b.k || "").toLowerCase().slice(0, 160);
  if (!/^[^|]{1,40}\|[^|]{1,100}\|\d{1,12}$/.test(k) || !env.INBOX_DB) return json({ ok: false }, 400, h);
  await goneTable(env);
  const v = (await hmac(env.SESSION_SECRET || "x", "gone|" + ip)).slice(0, 16);
  await env.INBOX_DB.prepare("INSERT INTO gone (k, v, t) VALUES (?, ?, ?) ON CONFLICT (k, v) DO UPDATE SET t = excluded.t").bind(k, v, Date.now()).run();
  const r = await env.INBOX_DB.prepare("SELECT COUNT(*) n FROM gone WHERE k = ? AND t >= ?").bind(k, Date.now() - 48 * 3600e3).first();
  return json({ ok: true, n: (r && r.n) || 1 }, 200, h);
}
async function goneList(env) {
  const h = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=30" };
  const need = Number(await env.ACCOUNTS.get("gone:need")) || 3, out = { need, items: {} };
  if (env.INBOX_DB) {
    await goneTable(env);
    const r = await env.INBOX_DB.prepare("SELECT k, COUNT(*) n, MIN(t) t FROM gone WHERE t >= ? GROUP BY k").bind(Date.now() - 48 * 3600e3).all().catch(() => ({ results: [] }));
    (r.results || []).forEach((x) => { out.items[x.k] = [x.n, x.t]; });
  }
  return json(out, 200, h);
}
// Popular right now: items people opened on the board in the last two days, one vote per visitor per item.
// Feeds the quick picks under the search. Cached for 10 minutes; the site falls back to sales volume when it is thin.
async function publicPopular(env) {
  const h = { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" };
  const c = await env.ACCOUNTS.get("popular", "json");
  if (c && now() - (c.at || 0) < 600) return json(c, 200, h);
  const out = { at: now(), items: [] };
  if (env.INBOX_DB) {
    await hitsTable(env);
    const r = await env.INBOX_DB.prepare("SELECT substr(p, 7) i, COUNT(DISTINCT v) n FROM hits WHERE t >= ? AND p LIKE '#open:%' GROUP BY i ORDER BY n DESC LIMIT 20").bind(Date.now() - 48 * 3600e3).all().catch(() => ({ results: [] }));
    out.items = (r.results || []).map((x) => [x.i, x.n]);
  }
  await env.ACCOUNTS.put("popular", JSON.stringify(out), { expirationTtl: 3600 });
  return json(out, 200, h);
}
function pageLabel(p) {
  if (p === "/" || p === "/index.html") return "Price board";
  const m = p.match(/^\/item\/([^/]+)/); if (m) return "Item: " + m[1].replace(/-/g, " ");
  return p.replace(/^\//, "").replace(/\.html$/, "").replace(/\/$/, "") || "Price board";
}
async function trafficStats(env, from, to) {
  await hitsTable(env);
  const q = (sql, ...a) => env.INBOX_DB.prepare(sql).bind(...a).all().then((r) => r.results || []);
  const web = "p NOT LIKE '!%' AND p NOT LIKE '#%'";
  const [tot] = await q(`SELECT COUNT(*) n, COUNT(DISTINCT v) u FROM hits WHERE t >= ? AND t < ? AND ${web}`, from, to);
  const pages = await q(`SELECT p, COUNT(*) n FROM hits WHERE t >= ? AND t < ? AND ${web} GROUP BY p ORDER BY n DESC LIMIT 40`, from, to);
  const refs = await q(`SELECT r, COUNT(DISTINCT v) n FROM hits WHERE t >= ? AND t < ? AND ${web} AND r != '' GROUP BY r ORDER BY n DESC LIMIT 6`, from, to);
  const tags = await q(`SELECT q, COUNT(DISTINCT v) n FROM hits WHERE t >= ? AND t < ? AND q != '' GROUP BY q ORDER BY n DESC LIMIT 6`, from, to);
  const price = await q(`SELECT p, COUNT(*) n FROM hits WHERE t >= ? AND t < ? AND p LIKE '!%' GROUP BY p`, from, to);
  const opens = await q(`SELECT substr(p, 7) i, COUNT(DISTINCT v) n FROM hits WHERE t >= ? AND t < ? AND p LIKE '#open:%' GROUP BY i ORDER BY n DESC LIMIT 3`, from, to);
  const [ev] = await q(`SELECT SUM(p LIKE '#find:%') f, SUM(p LIKE '#pick:%') k FROM hits WHERE t >= ? AND t < ?`, from, to);
  const [rt] = await q(`SELECT COUNT(DISTINCT CASE WHEN ret = 1 THEN v END) back, COUNT(DISTINCT CASE WHEN ret IS NOT NULL THEN v END) known FROM hits WHERE t >= ? AND t < ? AND ${web}`, from, to);
  const [si] = await q(`SELECT COUNT(DISTINCT id) n FROM signin WHERE t >= ? AND t < ?`, from, to);
  // scanners that sent listings in the window, by tool; someone running both counts once in the total
  let scan = null;
  try {
    const h0 = Math.floor(from / 3600e3), h1 = Math.ceil(to / 3600e3);
    const [sc] = await q(`SELECT COUNT(DISTINCT k) n, COUNT(DISTINCT CASE WHEN via = 'w' THEN k END) w, COUNT(DISTINCT CASE WHEN via = 'b' THEN k END) b FROM scanhr WHERE hr >= ? AND hr < ?`, h0, h1);
    scan = { n: (sc && sc.n) || 0, w: (sc && sc.w) || 0, b: (sc && sc.b) || 0 };
  } catch (e) {}
  const by = {}; pages.forEach((r) => { const k = pageLabel(r.p).startsWith("Item: ") ? "Item pages" : pageLabel(r.p); by[k] = (by[k] || 0) + r.n; });
  const items = pages.filter((r) => /^\/item\//.test(r.p)).slice(0, 3).map((r) => pageLabel(r.p).slice(6) + " " + r.n);
  return { scan, returning: (rt && rt.back) || 0, retKnown: (rt && rt.known) || 0, signedIn: (si && si.n) || 0, views: (tot && tot.n) || 0, visitors: (tot && tot.u) || 0, pages: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6), items, refs, tags, price, opens, finds: (ev && ev.f) || 0, picks: (ev && ev.k) || 0 };
}
function totalsLine(t) { const pc = t.price.reduce((s, r) => s + r.n, 0); return "**" + t.visitors + "** visitors · **" + t.returning + "** returning · **" + t.signedIn + "** signed in · **" + t.views + "** views · **" + pc + "** !price" + (t.scan ? " · **" + t.scan.n + "** scanners (" + t.scan.w + " FM Watcher, " + t.scan.b + " browser)" : ""); }
function trafficEmbed(st, prev, title, from, to, extra) {
  // change against the same hours yesterday, as a count and a percent: "(+12, ▲ 25% vs yesterday)"
  const d = (a, b) => {
    if (b == null) return "";
    if (a === b) return " (same as yesterday)";
    const pct = b > 0 ? Math.round((a - b) / b * 100) : null;
    return " (" + (a > b ? "+" : "") + (a - b) + (pct == null ? ", new" : ", " + (pct >= 0 ? "▲ " : "▼ ") + Math.abs(pct) + "%") + " vs yesterday)";
  };
  const f = [];
  f.push({ name: "Visitors", value: "**" + st.visitors + "**" + d(st.visitors, prev && prev.visitors), inline: true });
  f.push({ name: "Page views", value: "**" + st.views + "**" + d(st.views, prev && prev.views), inline: true });
  const pc = st.price.reduce((s, r) => s + r.n, 0);
  const ppc = prev && prev.price ? prev.price.reduce((s, r) => s + r.n, 0) : null;
  f.push({ name: "!price answers", value: "**" + pc + "**" + d(pc, ppc), inline: true });
  // returning: came back from an earlier day; new: first day on the site. Counted from browsers that report it.
  f.push({ name: "Returning visitors", value: "**" + st.returning + "**" + d(st.returning, prev && prev.returning) + (st.retKnown ? "\n" + Math.max(0, st.retKnown - st.returning) + " new" : ""), inline: true });
  f.push({ name: "Signed in with Discord", value: "**" + st.signedIn + "**" + d(st.signedIn, prev && prev.signedIn) + (st.accounts != null ? "\n" + st.accounts + " accounts all time" : ""), inline: true });
  if (st.scan) f.push({ name: "Scanners", value: "**" + st.scan.n + "**" + d(st.scan.n, prev && prev.scan && prev.scan.n) + "\n⬇ FM Watcher " + st.scan.w + " · 🌐 Browser " + st.scan.b, inline: true });
  if (st.pages.length) f.push({ name: "Top pages", value: st.pages.map((x) => x[0] + " · " + x[1]).join("\n") + (st.items.length ? "\nMost viewed items: " + st.items.join(", ") : "") });
  if (st.opens && st.opens.length) f.push({ name: "Most opened on the board", value: st.opens.map((x) => x.i + " · " + x.n).join("\n") + "\nSearches " + st.finds + " · quick picks clicked " + st.picks });
  if (st.refs.length) f.push({ name: "Came from", value: st.refs.map((x) => x.r + " · " + x.n).join("\n"), inline: true });
  if (st.tags.length) f.push({ name: "Partner links", value: st.tags.map((x) => x.q + " · " + x.n).join("\n"), inline: true });
  (extra || []).forEach((x) => f.push({ name: x[0], value: totalsLine(x[1]), inline: false }));
  return { title, color: 0x6d3fd1, fields: f, description: "<t:" + Math.floor(from / 1000) + ":t> to <t:" + Math.floor(to / 1000) + ":t>", footer: { text: "Visitors are counted once a day each. No cookies, no IPs kept." } };
}
// Visitors in a total are counted once per day each (the id changes daily), so "all time" visitors are visitor-days.
// accounts made with Discord sign-in, all time (a KV listing, kept for an hour)
async function accountCount(env) {
  const c = await env.ACCOUNTS.get("acctcount", "json");
  if (c && Date.now() - c.at < 3600e3) return c.n;
  let n = 0, cursor;
  do { const r = await env.ACCOUNTS.list({ prefix: "acct:", cursor }); n += r.keys.length; cursor = r.list_complete ? null : r.cursor; } while (cursor);
  await env.ACCOUNTS.put("acctcount", JSON.stringify({ n, at: Date.now() }));
  return n;
}
async function trafficSend(env, from, to, title, dayStart) {
  const st = await trafficStats(env, from, to), prev = await trafficStats(env, from - 864e5, to - 864e5);
  st.accounts = await accountCount(env).catch(() => null);
  const extra = [];
  if (dayStart != null && dayStart < from) extra.push(["Today so far", await trafficStats(env, dayStart, to)]);
  extra.push(["All time (since Oct 24)", await trafficStats(env, 0, to)]);
  const r = await fetch(DISCORD + "/channels/" + TRAFFIC_CH + "/messages", { method: "POST", headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [trafficEmbed(st, prev, title, from, to, extra)] }) });
  return { status: r.status, st };
}
function etParts(ms) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const o = {}; f.formatToParts(new Date(ms)).forEach((x) => { o[x.type] = x.value; });
  return { day: o.year + "-" + o.month + "-" + o.day, hour: Number(o.hour) % 24, minute: Number(o.minute) };
}
async function trafficPost(env) {
  if (!env.DISCORD_BOT_TOKEN || !env.INBOX_DB ) return;
  const nowMs = Date.now(), et = etParts(nowMs);
  if (et.minute > 14) return;
  const top = nowMs - et.minute * 60e3 - (new Date(nowMs).getUTCSeconds()) * 1e3;   // the top of this hour
  const key = "traffic:posted:" + et.day + ":" + et.hour;
  if (await env.ACCOUNTS.get(key)) return;
  const midnight = top - et.hour * 3600e3;
  if (et.hour === 0) {
    // end of day: the whole day that just finished, plus all time
    await env.ACCOUNTS.put(key, "1", { expirationTtl: 2 * DAY });
    const y = etParts(top - 3600e3).day;
    await trafficSend(env, top - 24 * 3600e3, top, "End of day " + y + ": full day's traffic");
  } else if (et.hour === 8) {
    await env.ACCOUNTS.put(key, "1", { expirationTtl: 2 * DAY });
    await trafficSend(env, top - 9 * 3600e3, top, "Overnight traffic, 11 PM to 8 AM", midnight);
  } else if (et.hour >= 9 && et.hour <= 23) {
    await env.ACCOUNTS.put(key, "1", { expirationTtl: 2 * DAY });
    const h = et.hour - 1, lab = (x) => (x % 12 || 12) + (x < 12 ? " AM" : " PM");
    await trafficSend(env, top - 3600e3, top, "Traffic, " + lab(h) + " to " + lab(et.hour), midnight);
  }
  if (et.hour === 10) await watchDigest(env).catch((e) => env.ACCOUNTS.put("digest:err", String(e && e.stack || e).slice(0, 500)));
  if (et.hour === 8) await morningScore(env).catch((e) => env.ACCOUNTS.put("score:err", String(e && e.stack || e).slice(0, 500)));
  if (et.hour === 4) await env.INBOX_DB.prepare("DELETE FROM hits WHERE t < ?").bind(nowMs - 120 * 864e5).run();
  const dow = new Date(top - 4 * 3600e3).getUTCDay();   // 0 Sunday, Eastern near enough at these hours
  if (dow === 1 && et.hour === 9) await weeklyTraffic(env, top).catch((e) => env.ACCOUNTS.put("weekly:err", String(e && e.stack || e).slice(0, 500)));
  if (dow === 0 && et.hour === 22) await redditDraft(env).catch((e) => env.ACCOUNTS.put("rdraft:err", String(e && e.stack || e).slice(0, 500)));
  await kofiWeekDraft(env).catch((e) => env.ACCOUNTS.put("kofiweek:err", String(e && e.stack || e).slice(0, 500)));
  await ghSchedule(env, et, dow).catch((e) => env.ACCOUNTS.put("ghsched:err", String(e && e.stack || e).slice(0, 500)));
  await partnerMarket(env).catch((e) => env.ACCOUNTS.put("partnermkt:err", String(e && e.stack || e).slice(0, 500)));
}

// ---------------------------------------------------------------- the day's market in partner servers
// Once Club FM's own #nightly-report has the day's market close (the archive marks report_day), the bot posts the
// same day to each partner channel here. Gainers and losers only count items seen often enough to mean something.
const PARTNER_MARKET = [{ guild: "125395305725165569", channel: "1564670451727474808", ref: "theclub" }];
async function partnerMarket(env) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const st = await vaultJSON(env, "data/discord_report.json", 300);
  const day = st && st.report_day; if (!day) return;
  const todo = [];
  for (const p of PARTNER_MARKET) if (!(await env.ACCOUNTS.get("partnermkt:" + p.channel + ":" + day))) todo.push(p);
  if (!todo.length) return;
  const LIVE = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/";
  const rep = await fetch(LIVE + "report.json?b=" + Date.now()).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!rep || rep.day !== day || !rep.market) return;
  const idb = await fetch(LIVE + "itemdb.json", { cf: { cacheTtl: 3600, cacheEverything: true } }).then((r) => r.json()).catch(() => null);
  const ids = {}; for (const r of (idb && idb.items) || []) ids[String(r[0]).toLowerCase()] = r[1];
  const k = (v) => (v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M" : v >= 1000 ? Math.round(v / 1000) + "K" : String(Math.round(v || 0)));
  const pct = (x) => (x >= 0 ? "+" : "") + (Math.abs(x) <= 5 ? x * 100 : x).toFixed(1).replace(/\.0$/, "") + "%";
  const real = (x) => x && x.item && (x.seen || 0) >= 5 && Math.max(x.price || 0, x.was || 0) >= 5000;
  const g = (rep.gainers || []).filter(real).slice(0, 4), l = (rep.losers || []).filter(real).slice(0, 4);
  const m = rep.market, s2 = rep.stats || {}, b = rep.biggest_sale || {};
  const fields = [
    { name: "FM index", value: Number(m.value || 0).toFixed(2) + " (" + pct(m.chg || 0) + ")", inline: true },
    { name: "Sales caught", value: (s2.sales || 0).toLocaleString("en-US") + " for " + k(s2.volume) + " meso", inline: true },
    { name: "For sale", value: (s2.listings || 0).toLocaleString("en-US") + " listings", inline: true }];
  if (g.length) fields.push({ name: "📈 Up", value: g.map((x) => x.item + " " + pct(x.chg) + " (" + k(x.price) + ")").join("\n"), inline: true });
  if (l.length) fields.push({ name: "📉 Down", value: l.map((x) => x.item + " " + pct(x.chg) + " (" + k(x.price) + ")").join("\n"), inline: true });
  if (b.item) fields.push({ name: "Biggest sale", value: b.item + " for " + k(b.price) + " meso", inline: false });
  const cats = (rep.categories || []).filter((c) => c && c.name);
  if (cats.length) fields.push({ name: "By category", value: cats.map((c) => c.name + " " + pct(c.chg || 0)).join(" · ").slice(0, 1000), inline: false });
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" };
  for (const p of todo) {
    const url = "https://maplefm.gg/report.html?ref=" + p.ref;
    const emb = { title: "Classic market close · " + day, url, color: (m.chg || 0) >= 0 ? 0x2ecc71 : 0xe74c3c, fields,
      ...(b.item && ids[String(b.item).toLowerCase()] ? { thumbnail: { url: "https://maplefm.gg/i/" + ids[String(b.item).toLowerCase()] + ".png" } } : {}),
      footer: { text: "From real FM sales caught by Club FM scanners · full report and every item at maplefm.gg" } };
    const r = await fetch(DISCORD + "/channels/" + p.channel + "/messages", { method: "POST", headers: H, body: JSON.stringify({ embeds: [emb], allowed_mentions: { parse: [] } }) });
    if (r.ok) await env.ACCOUNTS.put("partnermkt:" + p.channel + ":" + day, "1", { expirationTtl: 30 * DAY });
    else {
      const why = r.status + " " + (await r.text()).slice(0, 200);
      await env.ACCOUNTS.put("partnermkt:err", p.channel + " " + why, { expirationTtl: 7 * DAY });
      if (!(await env.ACCOUNTS.get("partnermkt:told:" + p.channel))) {
        await env.ACCOUNTS.put("partnermkt:told:" + p.channel, "1", { expirationTtl: DAY });
        await wdDM(env, await wdAdmins(env), [{ title: "Couldn't post the market close in The Club", color: 0xe74c3c, description: "Discord said " + why + ". The Club FM bot needs View Channel, Send Messages and Embed Links in #classic-market." }]);
      }
    }
  }
}

// ---------------------------------------------------------------- on-time GitHub jobs
// GitHub's own schedule runs hours late, so the Worker starts the jobs people see at the Eastern hour they belong
// to (workflow_dispatch, token GH_DISPATCH: a fine-grained token with Actions write on maplefm.github.io only).
// GitHub's crons stay as a fallback; every job skips work it already did that day.
const GH_JOBS = [
  { wf: "report.yml", hour: 0 },        // the market close, right after midnight Eastern (GitHub's own cron runs hours late)
  { wf: "itempages.yml", hour: 6 },
  { wf: "seo.yml", hour: 7, dow: 1 },
  { wf: "news.yml", hour: 18, inputs: { mode: "digest" } },
  { wf: "weekly.yml", hour: 18, dow: 0 },
  { wf: "weeklyrecap.yml", hour: 21, dow: 0 },
  { wf: "watchdog.yml", every: 1 },     // GitHub runs its 15-minute cron only every 4 to 6 hours; this makes it hourly
  { wf: "covmap.yml", every: 2 },       // the coverage map picture for #scanners
];
async function ghSchedule(env, et, dow) {
  if (!env.GH_DISPATCH) return;
  for (const j of GH_JOBS) {
    if (j.every ? et.hour % j.every !== 0 : et.hour !== j.hour || (j.dow != null && j.dow !== dow)) continue;
    const key = "ghsched:" + j.wf + ":" + et.day + (j.every ? ":" + et.hour : "");
    if (await env.ACCOUNTS.get(key)) continue;
    const r = await fetch("https://api.github.com/repos/maplefm/maplefm.github.io/actions/workflows/" + j.wf + "/dispatches", {
      method: "POST", headers: { Authorization: "Bearer " + env.GH_DISPATCH, Accept: "application/vnd.github+json", "User-Agent": "clubfm-worker", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: j.inputs || {} }) });
    await env.ACCOUNTS.put(key, String(r.status), { expirationTtl: 3 * DAY });
    if (!r.ok) await env.ACCOUNTS.put("ghsched:err", j.wf + " " + r.status + " " + (await r.text()).slice(0, 300), { expirationTtl: 7 * DAY });
  }
}

// ---------------------------------------------------------------- Ko-fi weekly update, for the owner to approve
// Sunday's site digest leaves the week's update in the archive (data/shots/kofi-week.json and .png: the pages that
// changed, before and now, and a numbered list). The first hourly run after it lands DMs it to the admins with the
// picture, ready to post on Ko-fi. Nothing is posted on Ko-fi by itself.
async function kofiWeekDraft(env) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const j = await vaultJSON(env, "data/shots/kofi-week.json", 300);
  if (!j || !j.day) return;
  const key = "kofiweek:sent:" + j.day;
  if (await env.ACCOUNTS.get(key)) return;
  await env.ACCOUNTS.put(key, "1", { expirationTtl: 30 * DAY });
  const r = j.png ? await archFetch(env, "data/shots/kofi-week.png", 300) : null;
  const png = r ? await r.arrayBuffer() : null;
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN };
  for (const id of await wdAdmins(env)) {
    const c = await (await fetch((env.DISCORD_API || DISCORD) + "/users/@me/channels", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, H), body: JSON.stringify({ recipient_id: id }) })).json().catch(() => null);
    if (!c || !c.id) continue;
    const fd = new FormData();
    fd.append("payload_json", JSON.stringify({ embeds: [{ title: "Ko-fi update for the week", color: 0xf6c94a, url: "https://ko-fi.com/manage/posts",
      description: ("Ready for a Ko-fi post (ko-fi.com, Your page, Post an update). Nothing has been posted. Tell Claude \"post it\" or paste it yourself.\n\n**Title**\n```" + j.title + "```\n**Text**\n```" + j.text + "```").slice(0, 4000),
      ...(png ? { image: { url: "attachment://club-fm-week.png" } } : {}) }] }));
    if (png) fd.append("files[0]", new Blob([png], { type: "image/png" }), "club-fm-week.png");
    await fetch((env.DISCORD_API || DISCORD) + "/channels/" + c.id + "/messages", { method: "POST", headers: H, body: fd });
  }
}

// ---------------------------------------------------------------- Monday report: the week, and search health
// Monday 9 AM Eastern, a DM to the admins: this week against last week by source and page type, the top pages, and the
// weekly search check the seo workflow writes to the live branch (data/seo.json).
async function weeklyTraffic(env, top) {
  const key = "weekly:sent:" + etParts(top).day;
  if (await env.ACCOUNTS.get(key)) return;
  await env.ACCOUNTS.put(key, "1", { expirationTtl: 8 * DAY });
  await hitsTable(env);
  const q = (sql, ...a) => env.INBOX_DB.prepare(sql).bind(...a).all().then((r) => r.results || []);
  const web = "p NOT LIKE '!%' AND p NOT LIKE '#%'";
  const src = "CASE WHEN r LIKE '%google%' THEN 'Google' WHEN r LIKE '%bing%' OR r LIKE '%duckduckgo%' OR r LIKE '%brave%' OR r LIKE '%yahoo%' THEN 'Other search' WHEN r LIKE '%reddit%' THEN 'Reddit' WHEN r LIKE '%discord%' OR q = 'discord' THEN 'Discord' WHEN r LIKE '%twitch%' THEN 'Twitch' WHEN r LIKE '%youtube%' THEN 'YouTube' WHEN q != '' THEN 'Tagged links' WHEN r = '' THEN 'Direct or app' ELSE 'Other sites' END";
  const kind = "CASE WHEN p = '/' OR p = '/index.html' THEN 'Home (board)' WHEN p LIKE '/item/%' OR p LIKE '/items/%' THEN 'Item pages' WHEN p LIKE '/map%' THEN 'Maps' WHEN p LIKE '/monster%' THEN 'Monsters' WHEN p LIKE '/quest%' THEN 'Quests' WHEN p LIKE '/training%' THEN 'Training' ELSE 'Other pages' END";
  // visitors are counted once a day each, so a week is the sum of its days
  const week = async (from, to) => {
    const [t] = await q(`SELECT COUNT(*) views, COUNT(DISTINCT v || (t / 86400000)) vis FROM hits WHERE t >= ? AND t < ? AND ${web}`, from, to);
    const bySrc = await q(`SELECT ${src} k, COUNT(DISTINCT v || (t / 86400000)) n FROM hits WHERE t >= ? AND t < ? AND ${web} GROUP BY k`, from, to);
    const byKind = await q(`SELECT ${kind} k, COUNT(DISTINCT v || (t / 86400000)) n FROM hits WHERE t >= ? AND t < ? AND ${web} GROUP BY k`, from, to);
    return { views: (t && t.views) || 0, vis: (t && t.vis) || 0, src: Object.fromEntries(bySrc.map((r) => [r.k, r.n])), kind: Object.fromEntries(byKind.map((r) => [r.k, r.n])) };
  };
  const now = week(top - 7 * 864e5, top), before = week(top - 14 * 864e5, top - 7 * 864e5);
  const [a, b] = await Promise.all([now, before]);
  const ch = (x, y) => (y ? " (" + (x >= y ? "▲ " : "▼ ") + Math.abs(Math.round((x - y) / y * 100)) + "%)" : y === 0 && x ? " (new)" : "");
  const lines = (o, p) => Object.entries(o).sort((m, n) => n[1] - m[1]).map(([k, n]) => k + ": **" + n + "**" + ch(n, (p || {})[k] || 0)).join("\n") || "none";
  const pages = await q(`SELECT p, COUNT(DISTINCT v) n FROM hits WHERE t >= ? AND t < ? AND ${web} AND p != '/' GROUP BY p ORDER BY n DESC LIMIT 8`, top - 7 * 864e5, top);
  const [pc] = await q("SELECT COUNT(*) n FROM hits WHERE t >= ? AND t < ? AND p LIKE '!%'", top - 7 * 864e5, top);
  const f = [
    { name: "Visitors", value: "**" + a.vis + "**" + ch(a.vis, b.vis), inline: true },
    { name: "Page views", value: "**" + a.views + "**" + ch(a.views, b.views), inline: true },
    { name: "!price answers", value: "**" + ((pc && pc.n) || 0) + "**", inline: true },
    { name: "Where they came from", value: lines(a.src, b.src).slice(0, 1000), inline: true },
    { name: "What they opened", value: lines(a.kind, b.kind).slice(0, 1000), inline: true },
    { name: "Top pages", value: pages.map((r) => r.p + " · " + r.n).join("\n").slice(0, 1000) || "none" },
  ];
  // the scoreboard's numbers summed over the last 7 full days against the 7 before, as what grew and what didn't
  try {
    const today = etParts(top).day, pulse = await vaultJSON(env, "data/pulse.json", 300);
    const sum = async (off) => {
      const o = {};
      for (let i = 1; i <= 7; i++) {
        const d = dayShift(today, -i - off), sd = await siteDay(env, d), sc = scanDay(pulse, d) || {};
        for (const k of ["visitors", "returning", "fresh", "signedIn", "bang", "dprice", "dl"]) o[k] = (o[k] || 0) + (sd[k] || 0);
        for (const k of ["watchers", "shops", "sellers", "full"]) o[k] = (o[k] || 0) + (sc[k] || 0);
        (sc.who || []).forEach((w) => { (o.who || (o.who = new Set())).add(w.toLowerCase()); });
      }
      o.people = o.who ? o.who.size : 0; return o;
    };
    const [cw, pw] = [await sum(0), await sum(7)];
    const lab = { visitors: "Visitor-days", returning: "Returning visitor-days", fresh: "New visitors", signedIn: "Signed-in member-days", bang: "!price answers", dprice: "Discord /price", dl: "Watcher downloads", people: "Different people scanning", shops: "Shops seen (daily, summed)", sellers: "Sellers seen (daily, summed)", full: "Fully covered hours" };
    const up = [], down = [];
    Object.keys(lab).forEach((k) => { const a1 = cw[k] || 0, b1 = pw[k] || 0, line = lab[k] + " " + a1 + (b1 ? " (" + (a1 >= b1 ? "+" : "") + Math.round((a1 - b1) / b1 * 100) + "%)" : " (no week before)"); (a1 > b1 ? up : down).push(line); });
    f.push({ name: "Grew", value: (up.map((x, i) => (i + 1) + ". " + x).join("\n") || "Nothing").slice(0, 1000) });
    f.push({ name: "Flat or down", value: (down.map((x, i) => (i + 1) + ". " + x).join("\n") || "Nothing").slice(0, 1000) });
  } catch (e) { await env.ACCOUNTS.put("weekly:err", String(e && e.stack || e).slice(0, 500)); }
  const seo = await fetch("https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/seo.json?b=" + Date.now()).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (seo && seo.pages) {
    const iss = Object.entries(seo.issues || {}).filter(([, n]) => n).map(([k, n]) => k + " " + n);
    f.push({ name: "Search check (" + (seo.day || "") + ")", value: (seo.pages + " pages in the sitemap · median load " + seo.ms + " ms\n" + (iss.length ? "Needs a look: " + iss.join(", ") : "All pages pass: titles, descriptions, canonicals, no errors")).slice(0, 1000) });
  }
  await wdDM(env, await wdAdmins(env), [{ title: "Club FM, the week to Monday 9 AM", color: 0x6d3fd1, fields: f, footer: { text: "Compared with the week before. Visitors counted once a day each." } }]);
}

// ---------------------------------------------------------------- daily watchlist DM
// Free for anyone signed in with Discord who turns on "Daily DM" next to the board's Watchlist button (fm-digest in
// their synced settings). Once a day at 10 AM Eastern: each watched item's typical price, the change since the day
// before, and its page. Mega Deals keeps the instant alerts; this is the once-a-day look. At most 15 items per DM.
async function watchDigest(env, onlyId) {
  if (!env.DISCORD_BOT_TOKEN) return { error: "offline" };
  const day = etParts(Date.now()).day;
  const sum = await fetch("https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/summary-public.json?b=" + Date.now()).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!sum || !Array.isArray(sum.rows)) return { error: "no prices" };
  const by = {}; sum.rows.forEach((x) => { if (x && x.item) by[String(x.item).toLowerCase()] = x; });
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" };
  let cursor, sent = 0, people = 0;
  do {
    const page = await env.ACCOUNTS.list({ prefix: "settings:", cursor });
    for (const k of page.keys) {
      const id = k.name.slice(9);
      if (onlyId && id !== onlyId) continue;
      const st = await env.ACCOUNTS.get(k.name, "json"), s = (st && st.settings) || {};
      if (s["fm-digest"] !== "true") continue;
      let watch = {}; try { watch = JSON.parse(s["fm-watch"] || "{}") || {}; } catch (e) {}
      const names = Object.keys(watch); if (!names.length) continue;
      people++;
      const key = "digest:" + id + ":" + day;
      if (!onlyId && (await env.ACCOUNTS.get(key))) continue;
      const lines = names.slice(0, 15).map((n) => {
        const r = by[n.toLowerCase()];
        const slug = shown(n).toLowerCase().replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        if (!r || !r.typ) return "**" + shown(n) + "**: no recent sales";
        const d = Array.isArray(r.daily) ? r.daily.filter((x) => Array.isArray(x) && x[1] > 0) : [];
        const a = d.length >= 2 ? d[d.length - 1][1] : 0, b = d.length >= 2 ? d[d.length - 2][1] : 0;
        const ch = a && b ? Math.round((a - b) / b * 100) : null;
        const under = watch[n] && watch[n].under ? " · your alert under " + meso(watch[n].under) : "";
        return "**[" + shown(n) + "](https://maplefm.gg/item/" + slug + "/?ref=digest)** " + meso(r.typ) + (ch == null || ch === 0 ? "" : " (" + (ch > 0 ? "▲ " : "▼ ") + Math.abs(ch) + "% vs the day before)") + under;
      });
      const c = await (await fetch((env.DISCORD_API || DISCORD) + "/users/@me/channels", { method: "POST", headers: H, body: JSON.stringify({ recipient_id: id }) })).json().catch(() => null);
      if (!c || !c.id) continue;
      const r = await fetch((env.DISCORD_API || DISCORD) + "/channels/" + c.id + "/messages", { method: "POST", headers: H, body: JSON.stringify({ embeds: [{ title: "Your watchlist today", url: "https://maplefm.gg/?ref=digest", color: 0x6d3fd1, description: lines.join("\n").slice(0, 4000) + (names.length > 15 ? "\n…and " + (names.length - 15) + " more on the board" : ""), footer: { text: "Typical sale price on maplefm.gg right now. Turn this off with Daily DM next to Watchlist on the board." } }], allowed_mentions: { parse: [] } }) });
      if (r.ok) { sent++; await env.ACCOUNTS.put(key, "1", { expirationTtl: 3 * DAY }); }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  await env.ACCOUNTS.put("digest:last", JSON.stringify({ day, people, sent }), { expirationTtl: 40 * DAY });
  return { day, people, sent };
}

// ---------------------------------------------------------------- morning scoreboard
// 8 AM Eastern, a DM to the admins: yesterday as a full day against the day before and the same day last week.
// Site numbers come from D1 (hits, signin); scanning numbers from the pulse file the pump keeps in the archive
// (tools/pulse.py). Anything down 10% or more is flagged with the reason the data shows. Test: POST /admin/score/post.
function etMidnight(day) {
  for (const off of [4, 5]) { const t = Date.parse(day + "T00:00:00Z") + off * 3600e3; const e = etParts(t); if (e.day === day && e.hour === 0) return t; }
  return Date.parse(day + "T04:00:00Z");
}
function dayShift(day, n) { return new Date(Date.parse(day + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10); }
const SRC_SQL = "CASE WHEN r LIKE '%google%' THEN 'Google' WHEN r LIKE '%bing%' OR r LIKE '%duckduckgo%' OR r LIKE '%brave%' OR r LIKE '%yahoo%' THEN 'Other search' WHEN r LIKE '%reddit%' THEN 'Reddit' WHEN r LIKE '%discord%' OR q = 'discord' THEN 'Discord' WHEN r LIKE '%twitch%' THEN 'Twitch' WHEN r LIKE '%youtube%' THEN 'YouTube' WHEN q != '' THEN 'Tagged links' WHEN r = '' THEN 'Direct or app' ELSE 'Other sites' END";
async function siteDay(env, day) {
  await hitsTable(env);
  const from = etMidnight(day), to = etMidnight(dayShift(day, 1));
  const q = (sql, ...a) => env.INBOX_DB.prepare(sql).bind(...a).all().then((r) => r.results || []);
  const web = "p NOT LIKE '!%' AND p NOT LIKE '#%'";
  const [t] = await q(`SELECT COUNT(DISTINCT v) vis, COUNT(DISTINCT CASE WHEN ret = 1 THEN v END) back, COUNT(DISTINCT CASE WHEN ret = 0 THEN v END) fresh FROM hits WHERE t >= ? AND t < ? AND ${web}`, from, to);
  const [pc] = await q("SELECT SUM(p LIKE '!%') bang, SUM(p = '#dprice') dc, COUNT(DISTINCT CASE WHEN p = '#dl' THEN v END) dl, COUNT(DISTINCT CASE WHEN p = '/contribute.html' THEN v END) earn FROM hits WHERE t >= ? AND t < ?", from, to);
  const [si] = await q("SELECT COUNT(*) n FROM signin WHERE day = ?", day);
  const src = await q(`SELECT ${SRC_SQL} k, COUNT(DISTINCT v) n FROM hits WHERE t >= ? AND t < ? AND ${web} GROUP BY k`, from, to);
  const chans = await q("SELECT r k, COUNT(*) n FROM hits WHERE t >= ? AND t < ? AND p LIKE '!%' GROUP BY r", from, to);
  return { visitors: (t && t.vis) || 0, returning: (t && t.back) || 0, fresh: (t && t.fresh) || 0, signedIn: (si && si.n) || 0,
    bang: (pc && pc.bang) || 0, dprice: (pc && pc.dc) || 0, dl: (pc && pc.dl) || 0, earn: (pc && pc.earn) || 0,
    src: Object.fromEntries(src.map((r) => [r.k, r.n])), chans: Object.fromEntries(chans.map((r) => [r.k || "Nightbot and others", r.n])) };
}
// the spots that matter: read with shops in them on 3 or more of the 7 days before. An hour is fully covered when
// every one of them was read in that hour.
function coreSpots(pulse, day) {
  const cnt = {};
  for (let i = 1; i <= 7; i++) { const d = pulse.days[dayShift(day, -i)]; if (!d) continue; const s = new Set(); Object.values(d.hours || {}).forEach((h) => Object.keys(h.n || {}).forEach((k) => s.add(k))); s.forEach((k) => { cnt[k] = (cnt[k] || 0) + 1; }); }
  return Object.keys(cnt).filter((k) => cnt[k] >= 3);
}
function scanDay(pulse, day) {
  const d = pulse && pulse.days && pulse.days[day];
  if (!d) return null;
  const core = coreSpots(pulse, day), hrs = {};
  let full = 0, read = 0;
  for (let h = 0; h < 24; h++) {
    const n = (d.hours[String(h)] || {}).n || {}, got = core.filter((k) => n[k] != null).length;
    hrs[h] = { got, w: (d.hours[String(h)] || {}).w || [] };
    read += got; if (core.length && got === core.length) full++;
  }
  const before = new Set(); for (let i = 1; i <= 14; i++) ((pulse.days[dayShift(day, -i)] || {}).who || []).forEach((x) => before.add(x.toLowerCase()));
  const fresh = (d.who || []).filter((x) => !before.has(x.toLowerCase()));
  return { watchers: (d.who || []).length, who: d.who || [], newWatchers: fresh.length, newNames: fresh, placedPct: d.shops ? Math.round((d.placed || 0) / d.shops * 100) : 0, streams: d.streams || 0, shops: d.shops || 0, sellers: d.sellers || 0, full, core: core.length, pct: core.length ? Math.round(read / (core.length * 24) * 100) : 0, hrs,
    active: Object.values(d.hours || {}).filter((h) => (h.w || []).length || h.s).length };
}
function scoreWhy(key, y, p, sy, sp) {
  // the biggest losers behind a drop, from the day's own breakdowns
  const diff = (a, b) => Object.keys(Object.assign({}, a, b)).map((k) => [k, (a[k] || 0) - (b[k] || 0)]).filter((x) => x[1] < 0).sort((m, n) => m[1] - n[1]).slice(0, 2).map((x) => x[0] + " " + x[1]).join(", ");
  if (["visitors", "fresh", "returning"].includes(key)) { const w = diff(y.src, p.src); return w ? "by source: " + w : ""; }
  if (key === "bang") { const w = diff(y.chans, p.chans); return w ? "by channel: " + w : ""; }
  if (!sy || !sp) return "";
  const gone = sp.who.filter((w) => !sy.who.includes(w));
  if (key === "watchers") return gone.length ? "not seen: " + gone.slice(0, 5).join(", ") : "";
  if (key === "shops" || key === "sellers") return (gone.length ? "not seen: " + gone.slice(0, 4).join(", ") + ". " : "") + "hours with a scanner " + sy.active + " vs " + sp.active;
  if (key === "full" || key === "pct") {
    const lost = []; for (let h = 0; h < 24; h++) if (sy.hrs[h].got < sp.hrs[h].got) lost.push(h);
    const lab = (x) => (x % 12 || 12) + (x < 12 ? "a" : "p");
    return lost.length ? "thinner at " + lost.slice(0, 8).map(lab).join(" ") + (gone.length ? "; not seen: " + gone.slice(0, 4).join(", ") : "") : "";
  }
  return "";
}
async function morningScore(env, force) {
  if (!env.DISCORD_BOT_TOKEN || !env.INBOX_DB) return { error: "offline" };
  const today = etParts(Date.now()).day, Y = dayShift(today, -1), P = dayShift(Y, -1), W = dayShift(Y, -7);
  const key = "score:sent:" + today;
  if (!force && (await env.ACCOUNTS.get(key))) return { skipped: true };
  await env.ACCOUNTS.put(key, "1", { expirationTtl: 3 * DAY });
  const [y, p, w] = await Promise.all([siteDay(env, Y), siteDay(env, P), siteDay(env, W)]);
  const pulse = await vaultJSON(env, "data/pulse.json", 300);
  const sy = scanDay(pulse, Y), sp = scanDay(pulse, P), sw = scanDay(pulse, W);
  const rows = [
    ["Visitors", "visitors", y, p, w], ["Returning", "returning", y, p, w], ["New", "fresh", y, p, w], ["Signed in", "signedIn", y, p, w],
    ["!price answers", "bang", y, p, w], ["Discord /price", "dprice", y, p, w],
    ["Earn page visitors", "earn", y, p, w], ["Watcher downloads", "dl", y, p, w],
    ["Watchers active", "watchers", sy, sp, sw], ["First-day watchers", "newWatchers", sy, sp, sw], ["Shops seen", "shops", sy, sp, sw], ["Unique sellers", "sellers", sy, sp, sw], ["Shops placed in a room", "placedPct", sy, sp, sw],
    ["Fully covered hours", "full", sy, sp, sw], ["Core spots read per hour", "pct", sy, sp, sw]];
  const ch = (a, b) => (b == null ? "n/a" : a === b ? "=" : (a > b ? "▲" : "▼") + (b ? Math.abs(Math.round((a - b) / b * 100)) + "%" : " new"));
  const lines = [], flags = [];
  for (const [lab, k, a, b, c] of rows) {
    if (!a) { lines.push(lab + ": no data yet"); continue; }
    const v = a[k], vb = b ? b[k] : null, vc = c ? c[k] : null, unit = k === "pct" || k === "placedPct" ? "%" : k === "full" ? "/24" : "";
    lines.push("**" + lab + "** " + v + unit + " · " + ch(v, vb) + " vs day before · " + ch(v, vc) + " vs last " + new Date(Date.parse(W + "T12:00:00Z")).toLocaleDateString("en-US", { weekday: "short" }));
    const small = ["watchers", "signedIn", "dl", "full"].includes(k);   // counts where losing one matters
    const drop = (x) => k !== "newWatchers" && x != null && x > 0 && (x - v) / x >= 0.1 && x - v >= (k === "pct" || k === "placedPct" ? 5 : small ? 1 : 2);
    if (drop(vb) || drop(vc)) {
      const why = (k === "placedPct" ? "the FM room couldn't be read off the minimap for most shops" : scoreWhy(k, a, b || c, k in (sy || {}) ? sy : null, drop(vb) ? sp : sw)) || "";
      flags.push(lab + " down " + (drop(vb) ? "vs day before" : "vs last week") + (why ? ": " + why : ""));
    }
  }
  if (sy && sy.newNames && sy.newNames.length) lines.push("New watchers: " + sy.newNames.slice(0, 8).join(", "));
  if (sy && sy.core) lines.push("Core spots: " + sy.core + " room and channel spots with shops on 3 of the last 7 days.");
  const num = lines.map((x, i) => (/^\*\*/.test(x) ? (i + 1) + ". " : "") + x), cut = 8;   // site lines, then scanning
  const f = [{ name: Y + " site (full day, Eastern)", value: num.slice(0, cut).join("\n").slice(0, 1024) }, { name: "Scanning", value: num.slice(cut).join("\n").slice(0, 1024) || "no data yet" }];
  f.push({ name: flags.length ? "Flagged" : "Nothing dropped 10% or more", value: flags.length ? flags.map((x, i) => (i + 1) + ". " + x).join("\n").slice(0, 1024) : "All steady or up." });
  const sent = await wdDM(env, await wdAdmins(env), [{ title: "Club FM scoreboard", color: flags.length ? 0xe67e22 : 0x2ecc71, fields: f, footer: { text: "Visitors once a day each. Coverage from the pulse file; hours Eastern." } }]);
  await env.ACCOUNTS.put("score:last", JSON.stringify({ day: Y, y, sy: sy && Object.assign({}, sy, { hrs: undefined }), flags, sent }), { expirationTtl: 40 * DAY });
  return { day: Y, sent, flags, y, sy: sy && Object.assign({}, sy, { hrs: undefined }) };
}

// ---------------------------------------------------------------- Sunday: the weekly recap for Reddit
// Sunday 10 PM Eastern, a DM to the admins: the week's market report as a picture and a PDF (made at 9 PM by the
// weeklyrecap workflow into data/weekly/ on the live branch) with a title, ready for an r/MSClassicWorld image post.
// Nothing is posted anywhere; the owner posts it.
async function redditDraft(env) {
  const day = etParts(Date.now()).day, key = "rdraft:sent:" + day;
  if (await env.ACCOUNTS.get(key)) return;
  const RAW = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/", b = "?b=" + Date.now();
  const rep = await fetch(RAW + "report.json" + b).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [png, pdf] = await Promise.all(["weekly/club-fm-weekly.png", "weekly/club-fm-weekly.pdf"].map((f) => fetch(RAW + f + b).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null)));
  const wk = rep && rep.ranges && rep.ranges.week;
  if (!wk || !png) return;
  await env.ACCOUNTS.put(key, "1", { expirationTtl: 8 * DAY });
  const pct = (x) => (x > 0 ? "+" : "") + Math.round(x) + "%";
  // the title names movers people care about: seen often and worth something, not a 200 meso shirt
  const real = (x) => x && (x.seen || 0) >= 20 && Math.max(x.price || 0, x.was || 0) >= 10000;
  const g = (wk.gainers || []).find(real), l = (wk.losers || []).find(real), st = wk.stats || {};
  const chg = (x) => (x && x.chg != null ? pct(Math.abs(x.chg) <= 5 ? x.chg * 100 : x.chg) : "");
  const title = "FM market recap for the week: " + [g && shown(g.item) + " " + chg(g), l && shown(l.item) + " " + chg(l)].filter(Boolean).join(", ");
  const comment = "weekly recap from " + (st.sales ? st.sales.toLocaleString("en-US") + " " : "") + "real FM sales. every item and category is on maplefm.gg/report.html?ref=reddit#week";
  const fd = new FormData();
  fd.append("payload_json", JSON.stringify({ embeds: [{ title: "Weekly recap for r/MSClassicWorld", color: 0xff4500, description: ("Post the picture as an image post with this title, then the comment under it. Nothing has been posted.\n\n**Title**\n```" + title + "```\n**First comment**\n```" + comment + "```").slice(0, 4000) }] }));
  fd.append("files[0]", new Blob([png], { type: "image/png" }), "club-fm-weekly-" + day + ".png");
  if (pdf) fd.append("files[1]", new Blob([pdf], { type: "application/pdf" }), "Club FM Market Week " + day + ".pdf");
  await env.ACCOUNTS.put("rdraft:last", JSON.stringify({ day, title, comment }), { expirationTtl: 30 * DAY });
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN };
  for (const id of await wdAdmins(env)) {
    const c = await (await fetch((env.DISCORD_API || DISCORD) + "/users/@me/channels", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, H), body: JSON.stringify({ recipient_id: id }) })).json().catch(() => null);
    if (c && c.id) await fetch((env.DISCORD_API || DISCORD) + "/channels/" + c.id + "/messages", { method: "POST", headers: H, body: fd });
  }
}

// ---------------------------------------------------------------- #deal-feed: Mega Deals, 30 minutes later
// Every deal the board posts to #mega-deals shows up in the public #deal-feed 30 minutes after, so everyone sees
// what the site catches while Mega Deals members keep first look. At most 6 a run, each deal once.
const DEAL_FEED = "1562554135126216804", PRICE_CHECK = "1563559723540815924", PARTNER_LOUNGE = "1563560597864583248";
async function dealFeedPublic(env) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const feed = await vaultJSON(env, FEED, 60).catch(() => null);
  if (!Array.isArray(feed) || !feed.length) return;
  const t = now(), due = feed.filter((d) => d && d.item && d.key && d.t <= t - 30 * 60 && d.t > t - 75 * 60).sort((a, b) => a.t - b.t);
  if (!due.length) return;
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" };
  let n = 0;
  for (const d of due) {
    if (n >= 6) break;
    const k = "dealfeed:" + d.key;
    if (await env.ACCOUNTS.get(k)) continue;
    await env.ACCOUNTS.put(k, "1", { expirationTtl: 3 * DAY });
    const emb = { title: String(d.item).slice(0, 80), color: 0xf5c542, url: "https://maplefm.gg/#item=" + encodeURIComponent(d.item),
      description: "Listed at **" + meso(d.p) + "**" + (d.q > 1 ? " each ×" + d.q : "") + " · " + Math.round((d.off || 0) * 100) + "% under typical " + meso(d.typ) + (d.flip ? "\n**+" + meso(d.flip) + "** to flip" : "") + (d.roll ? " · " + d.roll : ""),
      fields: [{ name: "Spot", value: String(d.where || "?").slice(0, 40), inline: true }, { name: "Caught by", value: String(d.by || "?").slice(0, 24), inline: true }, { name: "Spotted", value: "<t:" + d.t + ":R>", inline: true }],
      footer: { text: "Mega Deals members saw this 30 minutes ago, so it may be gone." } };
    const r = await fetch(DISCORD + "/channels/" + DEAL_FEED + "/messages", { method: "POST", headers: H, body: JSON.stringify({ embeds: [emb] }) });
    if (!r.ok) break;
    n++;
  }
}
// One-time intro posts for #deal-feed, #price-check and #partner-lounge, pinned when the bot can pin.
async function channelIntros(env) {
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" };
  const posts = [
    [DEAL_FEED, { embeds: [{ title: "What this channel is", color: 0xf5c542, description: "Every deal Club FM catches in the Free Market lands here **30 minutes after** Mega Deals members see it. Some will be gone by the time you look, and that's the point: it shows what the site finds every day.\n\nWant them the moment they're caught? Mega Deals unlocks by climbing the Scanner Ranks with FM Watcher: https://maplefm.gg/contribute.html" }] }],
    [PRICE_CHECK, { embeds: [{ title: "Price check here", color: 0x6d3fd1, description: "Type **/price** and an item, like `/price work gloves` or `/price claw 60`. The bot answers with the typical sale price, the cheapest listing up right now and today's move, from real Free Market sales.\n\nShort names work: wg, gfa 60, 10 int earring. Full list: https://maplefm.gg/shortcuts.html\nQuestions about a price? Ask in #market-talk." }] }],
    [PARTNER_LOUNGE, { embeds: [{ title: "Welcome, partners", color: 0x9b59b6, description: "This is the private room for streamers who partner with Club FM.\n\n1. Feature requests for your stream go here first.\n2. Setup help for !price and the chat bot: https://maplefm.gg/streamers.html\n3. Your channel's numbers and anything else you need, just ask Maya." }] }],
  ];
  const out = [];
  for (const [ch, body] of posts) {
    const r = await fetch(DISCORD + "/channels/" + ch + "/messages", { method: "POST", headers: H, body: JSON.stringify(body) });
    const m = r.ok ? await r.json() : null;
    let pin = "";
    if (m) { const p = await fetch(DISCORD + "/channels/" + ch + "/pins/" + m.id, { method: "PUT", headers: { Authorization: H.Authorization } }); pin = p.status === 204 ? "pinned" : "pin " + p.status; }
    out.push(ch + " " + r.status + " " + pin);
  }
  return out;
}

// ---------------------------------------------------------------- watchdog DMs
// The Watchdog workflow writes data/watchdog.json on the live branch every 15 minutes. When the set of failing
// checks changes, or it repaired something, every admin gets one DM: what broke, what it fixed, what still needs a hand.
const WD_URL = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/watchdog.json";
function wdEmbeds(wd, prev) {
  const failing = wd.failing || [], was = (prev && prev.failing) || [], fixed = (wd.repairs || []).filter((r) => r.ok);
  const byName = {}; (wd.checks || []).forEach((c) => { byName[c.name] = c; });
  const when = "Checked <t:" + wd.at + ":t>";
  if (failing.length) {
    const lines = failing.map((n) => "**" + n + "**: " + ((byName[n] && byName[n].detail) || "failing"));
    const fields = [{ name: "What's wrong", value: lines.join("\n").slice(0, 1000) }];
    if (fixed.length) fields.push({ name: "Already tried", value: fixed.map((r) => r.what).join("\n").slice(0, 1000) });
    fields.push({ name: "Next", value: fixed.length ? "Watching to see if the fix holds. The daily check-up picks up anything still broken." : "Can't fix this one on its own. The daily check-up will look at it, or ask Claude now." });
    return [{ title: "\u26a0\ufe0f Club FM: " + failing.length + (failing.length === 1 ? " check failing" : " checks failing"), color: 0xe5484d, fields, footer: { text: "Watchdog" }, description: when }];
  }
  const back = was.filter((n) => !failing.includes(n));
  const fields = [];
  if (back.length) fields.push({ name: "Back up", value: back.join(", ").slice(0, 1000) });
  if (fixed.length) fields.push({ name: "Fixed on its own", value: fixed.map((r) => r.what).join("\n").slice(0, 1000) });
  fields.push({ name: "All checks", value: (wd.checks || []).length + " of " + (wd.checks || []).length + " passing" });
  return [{ title: "\u2705 Club FM is healthy", color: 0x2ecc71, fields, footer: { text: "Watchdog" }, description: when }];
}
async function wdAdmins(env) {
  const ids = String(env.ADMIN_IDS || "").split(",").map((x) => x.trim()).filter((x) => /^\d{15,}$/.test(x));
  const saved = (await env.ACCOUNTS.get("wd:admins", "json")) || [];
  return [...new Set(ids.concat(saved))];
}
async function wdText(env, ids, content) {
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" };
  for (const id of ids) {
    const c = await (await fetch((env.DISCORD_API || DISCORD) + "/users/@me/channels", { method: "POST", headers: H, body: JSON.stringify({ recipient_id: id }) })).json().catch(() => null);
    if (c && c.id) await fetch((env.DISCORD_API || DISCORD) + "/channels/" + c.id + "/messages", { method: "POST", headers: H, body: JSON.stringify({ content: String(content).slice(0, 1900), allowed_mentions: { parse: [] }, flags: 4 }) });
  }
}
async function wdDM(env, ids, embeds) {
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" };
  let sent = 0;
  for (const id of ids) {
    const c = await (await fetch((env.DISCORD_API || DISCORD) + "/users/@me/channels", { method: "POST", headers: H, body: JSON.stringify({ recipient_id: id }) })).json().catch(() => null);
    if (!c || !c.id) continue;
    const r = await fetch((env.DISCORD_API || DISCORD) + "/channels/" + c.id + "/messages", { method: "POST", headers: H, body: JSON.stringify({ embeds }) });
    if (r.ok) sent++;
  }
  return sent;
}
async function watchdogAlert(env) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const r = await fetch(WD_URL + "?b=" + Math.floor(Date.now() / 60000), { headers: { "User-Agent": "clubfm-worker" } });
  if (!r.ok) return;
  const wd = await r.json().catch(() => null);
  if (!wd || !wd.at) return;
  const prev = (await env.ACCOUNTS.get("wd:last", "json")) || null;
  if (prev && prev.at >= wd.at) return;
  const sig = (wd.failing || []).join("|") + "#" + (wd.repairs || []).map((x) => x.what).join("|");
  const prevSig = prev ? (prev.failing || []).join("|") + "#" + (prev.repairs || []).map((x) => x.what).join("|") : null;
  await env.ACCOUNTS.put("wd:last", JSON.stringify({ at: wd.at, failing: wd.failing || [], repairs: wd.repairs || [] }));
  if (prevSig === null || sig === prevSig) return;
  if (!(wd.failing || []).length && !(prev.failing || []).length && !(wd.repairs || []).some((x) => x.ok)) return;
  await wdDM(env, await wdAdmins(env), wdEmbeds(wd, prev));
}
async function watchdogTest(me, env) {
  const saved = (await env.ACCOUNTS.get("wd:admins", "json")) || [];
  if (!saved.includes(String(me.id))) await env.ACCOUNTS.put("wd:admins", JSON.stringify(saved.concat([String(me.id)])));
  const r = await fetch(WD_URL + "?b=" + Date.now(), { headers: { "User-Agent": "clubfm-worker" } });
  const live = r.ok ? await r.json().catch(() => null) : null;
  const at = Math.floor(Date.now() / 1000);
  const broken = { at, failing: ["Fresh prices", "!price (api.maplefm.gg)"], repairs: [{ what: "restarted the live pump (prices were stale)", ok: true }],
    checks: [{ name: "Fresh prices", detail: "updated 52 min ago" }, { name: "!price (api.maplefm.gg)", detail: "status 522" }] };
  const healed = { at: at + 900, failing: [], repairs: [], checks: (live && live.checks) || new Array(14).fill({}) };
  const embeds = [{ title: "Sample alerts", description: "This is a test. Here's what the watchdog sends when something breaks, then when it's fixed.", color: 0x6d3fd1 }]
    .concat(wdEmbeds(broken, { failing: [] })).concat(wdEmbeds(healed, broken));
  if (live) embeds.push({ title: "Right now", color: live.ok ? 0x2ecc71 : 0xe5484d, description: (live.ok ? "All " + live.checks.length + " checks passing. " : "Failing: " + live.failing.join(", ") + ". ") + "Last check <t:" + live.at + ":R>." });
  return { sent: await wdDM(env, [String(me.id)], embeds) };
}

// ---------------------------------------------------------------- watchlist DMs
// Mega Deals holders get a Discord DM when a deal lands on an item they star on the board. The board's notifier
// writes the deals it posted to data/discord_dealfeed.json on the live branch; every account's watchlist is in
// its synced settings (fm-watch). At most 10 DMs an account a day, one per deal.
const FEED = "data/discord_dealfeed.json";
async function hasMega(a, env) {
  if (!a) return false;
  if ((a.kofiTotal || 0) >= KOFI_MEGA || isAdmin(a, env)) return true;
  const ids = await clubRoleIds(env);
  return Array.isArray(a.roles) && a.roles.some((r) => ids.includes(r));
}
async function notifyWatchers(env) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const feed = await vaultJSON(env, FEED, 60).catch(() => null);
  if (!Array.isArray(feed) || !feed.length) return;
  const since = now() - 20 * 60, fresh = feed.filter((d) => d && d.t >= since && d.item);
  if (!fresh.length) return;
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" };
  let cursor;
  do {
    const page = await env.ACCOUNTS.list({ prefix: "settings:", cursor });
    for (const k of page.keys) {
      const id = k.name.slice(9);
      const st = await env.ACCOUNTS.get(k.name, "json");
      let watch = {}; try { watch = JSON.parse((st && st.settings && st.settings["fm-watch"]) || "{}"); } catch (e) {}
      const names = Object.keys(watch || {}).map((n) => n.toLowerCase());
      if (!names.length) continue;
      const hits = fresh.filter((d) => names.includes(String(d.item).toLowerCase()));
      if (!hits.length) continue;
      const a = await env.ACCOUNTS.get("acct:" + id, "json");
      if (!(await hasMega(a, env))) continue;
      const dayKey = "dm-day:" + id + ":" + new Date().toISOString().slice(0, 10);
      let sent = Number(await env.ACCOUNTS.get(dayKey) || 0);
      let dm = null;
      for (const d of hits) {
        if (sent >= 10) break;
        const seenKey = "dm:" + id + ":" + d.key;
        if (await env.ACCOUNTS.get(seenKey)) continue;
        if (!dm) { const c = await (await fetch(DISCORD + "/users/@me/channels", { method: "POST", headers: H, body: JSON.stringify({ recipient_id: id }) })).json().catch(() => null); dm = c && c.id; if (!dm) break; }
        const emb = { title: "Watchlist deal: " + String(d.item).slice(0, 80), color: 0x2ecc71,
          description: "**" + String(d.item).slice(0, 64) + "** listed at **" + meso(d.p) + "**" + (d.q > 1 ? " each ×" + d.q : "") + "\n**+" + meso(d.flip) + "** to flip · " + Math.round(d.off * 100) + "% under typical " + meso(d.typ) + (d.roll ? " · " + d.roll : ""),
          fields: [{ name: "Seller", value: String(d.s || "?").slice(0, 24), inline: true }, { name: "Spot", value: String(d.where || "?").slice(0, 40), inline: true }, { name: "Caught by", value: String(d.by || "?").slice(0, 24), inline: true }],
          url: "https://maplefm.gg/#item=" + encodeURIComponent(d.item), footer: { text: "You star this item on maplefm.gg. Listed in the last 20 minutes; it may already be gone." } };
        const r = await fetch(DISCORD + "/channels/" + dm + "/messages", { method: "POST", headers: H, body: JSON.stringify({ embeds: [emb] }) });
        if (r.status === 403) break;   // DMs closed; try again another day
        await env.ACCOUNTS.put(seenKey, "1", { expirationTtl: 2 * DAY }); sent++;
      }
      await env.ACCOUNTS.put(dayKey, String(sent), { expirationTtl: 2 * DAY });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
}

// stat alerts (alerts.js): saved per account, only for Mega Deals holders
async function alertsGet(req, env) {
  const a = await whoami(req, env);
  if (!a) return json({ signedIn: false, allowed: false, alerts: [] });
  const allowed = await hasMega(a, env);
  return json({ signedIn: true, allowed, max: ALERT_MAX, alerts: allowed ? ((await env.ACCOUNTS.get("alerts:" + a.id, "json")) || []) : [] }, 200, { "Cache-Control": "no-store" });
}
async function alertsPut(req, env) {
  const a = await whoami(req, env);
  if (!a) return json({ error: "sign in first" }, 401);
  if (!(await hasMega(a, env))) return json({ error: "Stat alerts are for Mega Deals: Club members, scanners with 50,000 sales caught, and Ko-fi supporters at $100." }, 403);
  const b = await req.json().catch(() => ({}));
  const list = (Array.isArray(b.alerts) ? b.alerts : []).map(cleanAlert).filter(Boolean);
  if (list.length > ALERT_MAX) return json({ error: "Up to " + ALERT_MAX + " alerts." }, 400);
  const seen = new Set(), out = list.filter((x) => !seen.has(x.id) && seen.add(x.id));
  await env.ACCOUNTS.put("alerts:" + a.id, JSON.stringify(out));
  await reindex(env, String(a.id), out);
  return json({ ok: true, alerts: out });
}
function alertCtx(env) {
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" }, chans = {};
  return {
    hasMega: (acct) => hasMega(acct, env), meso,
    base: async (item) => { const d = await itemdb(env); return (d[String(item).toLowerCase()] || {}).base || null; },
    dm: async (id, emb) => {
      if (!env.DISCORD_BOT_TOKEN) return 0;
      if (!chans[id]) { const c = await (await fetch(DISCORD + "/users/@me/channels", { method: "POST", headers: H, body: JSON.stringify({ recipient_id: id }) })).json().catch(() => null); chans[id] = c && c.id; }
      if (!chans[id]) return 403;
      return (await fetch(DISCORD + "/channels/" + chans[id] + "/messages", { method: "POST", headers: H, body: JSON.stringify({ embeds: [emb] }) })).status;
    },
  };
}

// ---------------------------------------------------------------- admin
function isAdmin(a, env) {
  const ids = String(env.ADMIN_IDS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!a && (ids.includes(String(a.id)) || ids.includes(String(a.username || "").toLowerCase()));
}

async function admin(req, env) {
  const me = await whoami(req, env);
  if (!isAdmin(me, env)) return json({ error: "admin only" }, 403);
  const rows = [];
  let cursor;
  do {
    const page = await env.ACCOUNTS.list({ prefix: "acct:", cursor });
    for (const k of page.keys) {
      const a = await env.ACCOUNTS.get(k.name, "json");
      if (a) rows.push({ ...publicView(a), username: a.username, paypal: a.paypal, kofiTotal: a.kofiTotal || 0, roles: a.roles || [], rolesSynced: a.rolesSynced || 0, rolesFailed: a.rolesFailed || 0, inGuild: a.inGuild, discordCreated: a.discordCreated, lastSeen: a.lastSeen, note: a.note || "" });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  rows.sort((x, y) => (y.created || 0) - (x.created || 0));
  return json({ accounts: rows });
}

async function adminNote(req, env) {
  const me = await whoami(req, env);
  if (!isAdmin(me, env)) return json({ error: "admin only" }, 403);
  const b = await req.json().catch(() => ({}));
  const a = await env.ACCOUNTS.get("acct:" + String(b.id || ""), "json");
  if (!a) return json({ error: "no such account" }, 404);
  if (typeof b.note === "string") a.note = b.note.slice(0, 500);
  if (typeof b.locked === "boolean") a.locked = b.locked;
  await env.ACCOUNTS.put("acct:" + a.id, JSON.stringify(a));
  return json({ ok: true });
}

// ---------------------------------------------------------------- Discord roles from the ranks
// Hourly, with the bot token set: every account that set an in-game name gets the tier role its sales
// caught earn (Scout up to Mythic), the number one scanner gets Crown. Roles are matched by name, so
// renaming a role in Discord is enough to change what is handed out. Nothing is removed from the owner.
async function syncRoles(env) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" };
  const roles = await (await fetch(DISCORD + "/guilds/" + GUILD + "/roles", { headers: H })).json();
  if (!Array.isArray(roles)) return;
  const byName = {}; for (const r of roles) byName[r.name.toLowerCase()] = r.id;
  const tierIds = TIERS.map(t => byName[t[1].toLowerCase()]).filter(Boolean);
  const crownId = byName["crown"], megaId = byName["mega deals"];
  const ranks = await (await fetch("https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/ranks.json", { cf: { cacheTtl: 300 } })).json().catch(() => null);
  if (!ranks || !ranks.who) return;
  const sales = {}; for (const [n, days] of Object.entries(ranks.who)) { let t = 0; for (const v of Object.values(days)) t += v[0] || 0; const k = n.toLowerCase(); sales[k] = Math.max(sales[k] || 0, t); }
  const top = Object.entries(sales).sort((a, b) => b[1] - a[1])[0];
  let cursor;
  do {
    const page = await env.ACCOUNTS.list({ prefix: "acct:", cursor });
    for (const k of page.keys) {
      const a = await env.ACCOUNTS.get(k.name, "json");
      if (!a || a.inGuild === false) continue;
      // refresh what Discord says about this member, so a role taken away shows on the site within the hour
      const mr = await fetch(DISCORD + "/guilds/" + GUILD + "/members/" + a.id, { headers: H });
      if (mr.ok) { const m = await mr.json(); a.roles = Array.isArray(m.roles) ? m.roles : []; a.inGuild = true; await env.ACCOUNTS.put(k.name, JSON.stringify(a)); }
      else if (mr.status === 404) { a.inGuild = false; a.roles = []; await env.ACCOUNTS.put(k.name, JSON.stringify(a)); continue; }
      if (!a.ign || !a.inGuild) continue;
      const n = sales[a.ign.toLowerCase()] || 0;
      const tier = TIERS.find(t => n >= t[0]);
      const want = new Set(); if (tier && byName[tier[1].toLowerCase()]) want.add(byName[tier[1].toLowerCase()]);
      if (crownId && top && top[0] === a.ign.toLowerCase() && n > 0) want.add(crownId);
      const have = new Set(a.roles || []);
      // Mega Deals is earned by scanning; a Ko-fi supporter who holds it keeps it (Ko-fi takes it back itself)
      const lifetime = Number(await env.ACCOUNTS.get("kofi:" + a.id) || 0);
      if (megaId && (n >= MEGA_AT || lifetime >= KOFI_MEGA)) want.add(megaId);
      let changed = false, failed = 0;
      const managed = tierIds.concat(crownId ? [crownId] : []).concat(megaId && want.has(megaId) ? [megaId] : []);
      for (const id of managed) {
        if (want.has(id) && !have.has(id)) { const r = await fetch(DISCORD + "/guilds/" + GUILD + "/members/" + a.id + "/roles/" + id, { method: "PUT", headers: H }); if (r.ok) { have.add(id); changed = true; } else failed++; }
        if (!want.has(id) && have.has(id) && !isAdmin(a, env)) { const r = await fetch(DISCORD + "/guilds/" + GUILD + "/members/" + a.id + "/roles/" + id, { method: "DELETE", headers: { Authorization: H.Authorization } }); if (r.ok) { have.delete(id); changed = true; } else failed++; }
      }
      a.roles = [...have]; a.rolesSynced = now(); a.rolesFailed = failed;   // a failed call (bot role below the tier roles, say) is retried next hour
      if (changed || failed !== (a.rolesFailedBefore || 0)) { a.rolesFailedBefore = failed; await env.ACCOUNTS.put(k.name, JSON.stringify(a)); }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
}

// The roles the site and Ko-fi hand out, created once if missing. Tier roles come from TIERS; the rest are
// the Ko-fi tiers (Famed, Chill Guy, Scroll Boomer, Whale, Jimothy) and the two deal doors (Club, Mega Deals).
const ROLE_COLORS = { Immortal: 0x4b3ad1, Titan: 0x1fa3a3, "Mega Deals": 0xff5c5c, Suuushi: 0x61d4f0, curryishott: 0x3ddc84, Tiger: 0xf6c94a, FangBlade: 0x7c4dff, "Beta Tester": 0xf0c040 };
// the Ko-fi tier roles, a nod to the first GMS #1 race; older names fold into the new ones so Ko-fi's mapping holds
const ROLE_RENAMES = { Famed: "Suuushi", "Chill Guy": "curryishott", "Scroll Boomer": "Tiger", Whale: "FangBlade", Jimothy: "Beta Tester" };
// Registers the slash commands on the Club FM server. Run once, and again whenever a command changes.
const APP_ID = "1562655420441694289";
// /price everywhere: a global command that any server can add (guild install) and any player can carry into any
// chat or DM (user install). The guild-only copy on the Club FM server is cleared so it doesn't show twice.
async function setupCommands(env) {
  if (!env.DISCORD_BOT_TOKEN) return { error: "no bot token" };
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" };
  const cmds = [{ name: "price", description: "Price check a MapleStory Classic item from Club FM's watched sales",
    integration_types: [0, 1], contexts: [0, 1, 2],
    options: [{ type: 3, name: "item", description: "Item name or chat shortcut (gfa 60, wg), start typing for suggestions", required: true, autocomplete: true }] },
    { name: "market", description: "What Club FM members are selling, cheapest first", integration_types: [0, 1], contexts: [0, 1, 2],
      options: [{ type: 3, name: "item", description: "An item, or leave empty for the newest listings", required: false, autocomplete: true }] },
    { name: "sell", description: "List an item for sale on maplefm.gg and in #selling", integration_types: [0], contexts: [0],
      options: [{ type: 3, name: "item", description: "The item, start typing for suggestions", required: true, autocomplete: true },
        { type: 3, name: "price", description: "Price each in mesos, like 15m or 800k", required: true },
        { type: 4, name: "qty", description: "How many (default 1)", required: false, min_value: 1, max_value: 9999 },
        { type: 3, name: "ign", description: "Your in-game name (saved from the site if you set one)", required: false },
        { type: 3, name: "stats", description: "Equip stats, like +5 ATT", required: false },
        { type: 3, name: "note", description: "Anything a buyer should know", required: false }] }];
  const g = await fetch(DISCORD + "/applications/" + APP_ID + "/commands", { method: "PUT", headers: H, body: JSON.stringify(cmds) });
  const clear = await fetch(DISCORD + "/applications/" + APP_ID + "/guilds/" + GUILD + "/commands", { method: "PUT", headers: H, body: "[]" });
  const inst = { scopes: ["applications.commands"], permissions: "0" };
  const app = await fetch(DISCORD + "/applications/@me", { method: "PATCH", headers: H, body: JSON.stringify({
    integration_types_config: { "0": { oauth2_install_params: inst }, "1": { oauth2_install_params: inst } },
    description: "Price checks for the MapleStory Classic Free Market. /price any item, from sales players watched happen. maplefm.gg" }) });
  return { global: g.status, guildCleared: clear.status, app: app.status, appResult: app.ok ? "ok" : await app.text() };
}

// The webhooks on the Club FM server, as the GitHub secrets want them (DISCORD_HOOKS is a JSON map by kind).
const HOOK_KIND = { "big sales": "big_sales", "ranks": "ranks", "market close": "market_close", "site updates": "site", "maple news": "news" };
async function hookPack(env) {
  const r = await fetch(DISCORD + "/guilds/" + GUILD + "/webhooks", { headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN } });
  if (!r.ok) return { error: "discord " + r.status, detail: await r.text() };
  const list = await r.json(), map = {}, out = { found: [] };
  for (const w of list) {
    if (!w.token) continue;
    const url = "https://discord.com/api/webhooks/" + w.id + "/" + w.token, n = String(w.name || "").toLowerCase();
    out.found.push(w.name);
    if (HOOK_KIND[n]) map[HOOK_KIND[n]] = url;
    if (n === "mega deals") out.DISCORD_HOOK_DEALS = url;
    if (n === "weekly digest") out.DISCORD_HOOK_DIGEST = url;
  }
  out.DISCORD_HOOKS = JSON.stringify(map);
  return out;
}

async function setupRoles(env) {
  if (!env.DISCORD_BOT_TOKEN) return { error: "no bot token" };
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" };
  const roles = await (await fetch(DISCORD + "/guilds/" + GUILD + "/roles", { headers: H })).json();
  if (!Array.isArray(roles)) return { error: "couldn't list roles", detail: roles };
  const made = [], failed = [], renamed = [];
  for (const r of roles) {
    const to = ROLE_RENAMES[r.name]; if (!to) continue;
    const body = { name: to, hoist: to === "Beta Tester" || to === "FangBlade" }; if (ROLE_COLORS[to]) body.color = ROLE_COLORS[to];
    const x = await fetch(DISCORD + "/guilds/" + GUILD + "/roles/" + r.id, { method: "PATCH", headers: H, body: JSON.stringify(body) });
    if (x.ok) { r.name = to; renamed.push(to); } else failed.push([r.name + " -> " + to, x.status]);
  }
  const have = new Set(roles.map(r => r.name.toLowerCase()));
  const want = TIERS.map(t => t[1]).concat(["Crown", "Club", "Mega Deals", "Suuushi", "curryishott", "Tiger", "FangBlade", "Beta Tester"]);
  for (const name of want) {
    if (have.has(name.toLowerCase())) continue;
    const body = { name, hoist: name === "Mega Deals" || name === "FangBlade" || name === "Beta Tester", mentionable: false };
    if (ROLE_COLORS[name]) body.color = ROLE_COLORS[name];
    const r = await fetch(DISCORD + "/guilds/" + GUILD + "/roles", { method: "POST", headers: H, body: JSON.stringify(body) });
    if (r.ok) made.push(name); else failed.push([name, r.status]);
  }
  await env.ACCOUNTS.delete("clubroles2");
  return { made, renamed, failed };
}

// ---------------------------------------------------------------- Ko-fi
// Ko-fi posts every payment here (Settings, API, webhook URL). Tips and memberships from a supporter who linked
// Discord on Ko-fi add up under their Discord id; at KOFI_MEGA lifetime dollars they get the Mega Deals role for
// good. Ko-fi hands it to the Tiger tier and up while the membership runs. Nothing but the running total is kept.
const KOFI_MEGA = 100;
async function kofi(req, env) {
  if (!env.KOFI_TOKEN) return json({ error: "not set up" }, 503);
  let d;
  try {
    const ct = req.headers.get("Content-Type") || "";
    if (ct.includes("application/json")) d = await req.json();
    else { const f = await req.formData(); d = JSON.parse(f.get("data") || "{}"); }
  } catch (e) { return json({ error: "bad body" }, 400); }
  if (!d || d.verification_token !== env.KOFI_TOKEN) return json({ error: "bad token" }, 403);
  const id = String(d.discord_userid || "");
  // one payment is at most $500 and in USD: the token is a shared secret, not a signature, so the amounts are bounded
  const amount = Math.min(500, Number(d.amount || 0));
  if (d.currency && String(d.currency).toUpperCase() !== "USD") return json({ ok: true, skipped: "currency" });
  const seenKey = "kofi-tx:" + String(d.kofi_transaction_id || d.message_id || "");
  if (!(amount > 0) || await env.ACCOUNTS.get(seenKey)) return json({ ok: true, dup: true });
  // no more than 30 payments an hour, whatever ids they claim
  const hourKey = "kofi-hour:" + Math.floor(now() / 3600), hn = Number(await env.ACCOUNTS.get(hourKey) || 0);
  if (hn >= 30) return json({ ok: true, skipped: "rate" });
  await env.ACCOUNTS.put(hourKey, String(hn + 1), { expirationTtl: 7200 });
  await env.ACCOUNTS.put(seenKey, "1", { expirationTtl: 90 * DAY });
  // a running log of every payment by month, so the public income total can be summed without any names
  const mon = new Date().toISOString().slice(0, 7), logKey = "kofi-log:" + mon;
  const log = (await env.ACCOUNTS.get(logKey, "json")) || [];
  log.push({ t: now(), a: amount, m: d.is_subscription_payment ? "sub" : "tip" });
  await env.ACCOUNTS.put(logKey, JSON.stringify(log.slice(-5000)), { expirationTtl: 400 * DAY });
  await kofiAlert(env, d, amount, id).catch(() => {});
  if (!id) return json({ ok: true, unlinked: true });   // a tip without Discord linked on Ko-fi can't earn a role
  const key = "kofi:" + id;
  const total = Number(await env.ACCOUNTS.get(key) || 0) + amount;
  await env.ACCOUNTS.put(key, String(total));
  const a = await env.ACCOUNTS.get("acct:" + id, "json");
  if (a) { a.kofiTotal = total; await env.ACCOUNTS.put("acct:" + id, JSON.stringify(a)); }
  if (total >= KOFI_MEGA && env.DISCORD_BOT_TOKEN) {
    const ids = await clubRoleIds(env);
    const roles = await (await fetch(DISCORD + "/guilds/" + GUILD + "/roles", { headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN } })).json().catch(() => []);
    const mega = Array.isArray(roles) ? roles.find(r => r.name.toLowerCase() === "mega deals") : null;
    if (mega) await fetch(DISCORD + "/guilds/" + GUILD + "/members/" + id + "/roles/" + mega.id, { method: "PUT", headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN } });
  }
  await kofiWelcome(env, d, id, total).catch(() => {});
  return json({ ok: true });
}

// What each Ko-fi tier gets, word for word with the tier list on ko-fi.com/maplefm/tiers. A tier includes every
// tier below it, so the welcome lists the whole stack.
const KOFI_PERKS = [
  ["Suuushi", "Suuushi role in the Club FM Discord, with a name color", ["Supporter heart next to your name on the ranks board at maplefm.gg", "Your name on the supporters wall"]],
  ["curryishott", "curryishott role in the Club FM Discord, with a name color, sitting above Suuushi", ["A vote on every new custom server emoji"]],
  ["Tiger", "Tiger role in the Club FM Discord, with a name color", ["Mega Deals: underpriced listings the moment a watcher catches them, on maplefm.gg and in the private #mega-deals channel, while your membership runs", "One custom server emoji of your choosing", "Your name in the nightly market close once a month"]],
  ["FangBlade", "FangBlade role, shown at the top of the member list", ["A server sticker of your character", "A shoutout in #announcements"]],
  ["Beta Tester", "Beta Tester role, at the very top of the member list", ["Your character featured on the supporters wall at maplefm.gg", "Mega Deals for good: $100 of lifetime support keeps it even after you cancel"]],
];
function kofiTier(d) {
  const n = String(d.tier_name || "").replace(/\s*tier$/i, "").trim().toLowerCase();
  return KOFI_PERKS.findIndex(t => t[0].toLowerCase() === n);
}
// Ko-fi's own bot hands out the tier role when a supporter connects Discord, which can be well after they paid (the
// webhook then had no Discord id to thank). Every 5 minutes: anyone holding a Ko-fi tier role who hasn't been thanked
// for that tier gets the thank-you DM and Mega Deals for Tiger and up. The first run only records who already holds one.
async function kofiRoleWatch(env) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN };
  const roles = await (await fetch(DISCORD + "/guilds/" + GUILD + "/roles", { headers: H })).json().catch(() => null);
  if (!Array.isArray(roles)) return;
  const tierOf = {}; for (const r of roles) { const i = KOFI_PERKS.findIndex(t => t[0].toLowerCase() === r.name.toLowerCase()); if (i >= 0) tierOf[r.id] = i; }
  const megaId = (roles.find(r => r.name.toLowerCase() === "mega deals") || {}).id;
  const seeded = await env.ACCOUNTS.get("kofi-rolewatch:seeded");
  let after = "0", sent = 0;
  for (let page = 0; page < 10; page++) {
    const ms = await (await fetch(DISCORD + "/guilds/" + GUILD + "/members?limit=1000&after=" + after, { headers: H })).json().catch(() => null);
    if (!Array.isArray(ms) || !ms.length) break;
    for (const m of ms) {
      if (!m.user || m.user.bot) continue;
      const ti = Math.max(-1, ...(m.roles || []).map(r => (r in tierOf ? tierOf[r] : -1)));
      if (ti < 0) continue;
      const key = "kofi-welcomed:" + m.user.id + ":" + KOFI_PERKS[ti][0];
      if (await env.ACCOUNTS.get(key)) continue;
      await env.ACCOUNTS.put(key, "1", { expirationTtl: 400 * DAY });
      if (!seeded || sent >= 5) continue;
      const mega = ti >= 2;
      if (mega && megaId && !(m.roles || []).includes(megaId)) await fetch(DISCORD + "/guilds/" + GUILD + "/members/" + m.user.id + "/roles/" + megaId, { method: "PUT", headers: H });
      await kofiThanks(env, m.user.id, ti, mega);
      await wdDM(env, await wdAdmins(env), [{ title: "💛 Ko-fi supporter connected Discord", color: 0xf6c94a, description: "<@" + m.user.id + "> now holds the " + KOFI_PERKS[ti][0] + " role. The Club FM bot sent them the thank-you and perks" + (mega ? " and Mega Deals." : ".") }]);
      sent++;
    }
    after = ms[ms.length - 1].user.id;
    if (ms.length < 1000) break;
  }
  if (!seeded) await env.ACCOUNTS.put("kofi-rolewatch:seeded", String(now()));
}
// The owner hears about every payment right away: who, how much, which tier, and whether the supporter can be reached.
async function kofiAlert(env, d, amount, id) {
  if (!env.DISCORD_BOT_TOKEN) return;
  const ti = kofiTier(d), tier = ti >= 0 ? KOFI_PERKS[ti][0] : "";
  const kind = d.is_subscription_payment ? (d.is_first_subscription_payment ? "New member" : "Membership renewed") : "New tip";
  const lines = [
    "**" + String(d.from_name || "Someone").slice(0, 60) + "**, $" + amount + (tier ? ", " + tier + " tier" : ""),
    id ? "Discord linked: <@" + id + ">. The Club FM bot sent the thank-you and perks, and gave the roles." : "Discord not linked on Ko-fi, so the bot can't reach them. Ko-fi showed them the tier's welcome message; a personal note goes through ko-fi.com, Messages.",
  ];
  if (d.message) lines.push("Their message: " + String(d.message).slice(0, 300));
  await wdDM(env, await wdAdmins(env), [{ title: "💛 " + kind + " on Ko-fi", color: 0xf6c94a, description: lines.join("\n"), url: "https://ko-fi.com/manage/supportreceived" }]);
}
// A supporter who linked Discord on Ko-fi gets a thank-you DM from the bot with every perk of their tier, and their
// roles straight away (Ko-fi's own bot hands out the tier roles too; this covers a slow or missed hand-off). Once per
// supporter per tier, on the first payment, so renewals don't repeat it.
async function kofiWelcome(env, d, id, total) {
  if (!env.DISCORD_BOT_TOKEN || !id) return;
  const ti = kofiTier(d), sub = !!d.is_subscription_payment;
  if (sub && ti < 0) return;
  const seen = "kofi-welcomed:" + id + ":" + (sub ? KOFI_PERKS[ti][0] : "tip");
  if (await env.ACCOUNTS.get(seen)) return;
  await env.ACCOUNTS.put(seen, "1", { expirationTtl: 400 * DAY });
  const H = { Authorization: "Bot " + env.DISCORD_BOT_TOKEN };
  const roles = await (await fetch(DISCORD + "/guilds/" + GUILD + "/roles", { headers: H })).json().catch(() => []);
  const rid = (n) => (Array.isArray(roles) ? (roles.find(r => r.name.toLowerCase() === n.toLowerCase()) || {}).id : null);
  const mega = sub ? ti >= 2 : total >= KOFI_MEGA;
  const give = sub ? [KOFI_PERKS[ti][0]] : []; if (mega) give.push("Mega Deals");
  for (const n of give) { const r = rid(n); if (r) await fetch(DISCORD + "/guilds/" + GUILD + "/members/" + id + "/roles/" + r, { method: "PUT", headers: H }); }
  await kofiThanks(env, id, sub ? ti : -1, mega);
}
// The thank-you DM: the tier's whole perk list, with the Mega Deals congrats when it comes with it. ti -1 is a tip.
async function kofiThanks(env, id, ti, mega) {
  const sub = ti >= 0;
  let desc;
  if (sub) {
    const t = KOFI_PERKS[ti], perks = [];
    // the tier's own role, then its perks, then every lower tier's perks (one role: the tier's own)
    perks.push(t[1]);
    for (let i = ti; i >= 0; i--) for (const p of KOFI_PERKS[i][2]) if (!(/^Mega Deals/.test(p) && perks.some(x => /^Mega Deals/.test(x)))) perks.push(p);
    desc = "Thank you so much for joining the **" + t[0] + " tier**. It keeps the FM Watchers scanning, and it honestly means a lot.\n\n" +
      (mega ? "🔔 **Congrats, you just unlocked Mega Deals.** Open the private #mega-deals channel, or sign in with Discord on maplefm.gg to see them on the board.\n\n" : "") +
      "**Everything you get**\n" + perks.map((p, i) => (i + 1) + ". " + p).join("\n") +
      (ti >= 2 ? "\n\nReply here or DM Maya with the emoji you want added" + (ti >= 3 ? " and a picture of your character for the sticker" : "") + "." : "") +
      "\n\nYour roles are on now. Thanks again, see you in the FM.\nMaya";
  } else {
    desc = "Thank you so much for the support on Ko-fi. It keeps the FM Watchers scanning, and it honestly means a lot." +
      (mega ? "\n\n🔔 **Congrats, your support passed $100, so Mega Deals is yours for good.** Open the private #mega-deals channel, or sign in with Discord on maplefm.gg to see them on the board." : "") +
      "\n\nSee you in the FM.\nMaya";
  }
  await wdDM(env, [id], [{ title: "💛 Thank you from Club FM", color: 0xf6c94a, description: desc.slice(0, 4000), url: "https://maplefm.gg/?ref=kofi" }]);
}

// ---------------------------------------------------------------- helpers
function corsHeaders(env, origin) {
  const ok = origin === env.SITE || origin === "https://maplefm.github.io";
  return ok ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Watcher, X-Kind, X-Info", "Vary": "Origin" } : {};
}
function json(obj, status = 200, extra = {}) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...extra } }); }
function text(s, status = 200) { return new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
function now() { return Math.floor(Date.now() / 1000); }
// the session: the cookie, or the same signed token sent as a header. Browsers that block cross-site cookies
// (Safari, iPhones, Chrome with third-party cookies off) keep the sign-in through the header instead.
function sessTok(req) {
  const c = cookie(req, COOKIE); if (c) return c;
  const m = /^Bearer\s+(\S+)$/.exec(req.headers.get("Authorization") || ""); return m ? m[1] : "";
}
function cookie(req, name) { const m = (req.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : ""; }
function randomHex(n) { const b = new Uint8Array(n); crypto.getRandomValues(b); return [...b].map(x => x.toString(16).padStart(2, "0")).join(""); }
function randomCode() { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = new Uint8Array(6); crypto.getRandomValues(b); return [...b].map(x => A[x % A.length]).join(""); }
function maskEmail(e) { const [u, d] = e.split("@"); return (u.slice(0, 2) + "***@" + d); }
function snowflakeTime(id) { try { return Number((BigInt(id) >> 22n) + 1420070400000n) / 1000 | 0; } catch (e) { return 0; } }
async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function sign(secret, payload) { return btoa(payload) + "." + await hmac(secret, payload); }
async function verify(secret, token) {
  const i = token.lastIndexOf("."); if (i < 0) return null;
  let payload; try { payload = atob(token.slice(0, i)); } catch (e) { return null; }
  const want = await hmac(secret, payload);
  const got = token.slice(i + 1);
  if (want.length !== got.length) return null;
  let diff = 0; for (let k = 0; k < want.length; k++) diff |= want.charCodeAt(k) ^ got.charCodeAt(k);
  return diff ? null : payload;
}
