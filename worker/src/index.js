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
//   GET  /admin            Adam only: every account, for review and the weekly statement
//   POST /admin/note       Adam only: set a note or lock on an account
//
// Storage (KV): acct:<discord id> -> account JSON; code:<link code> -> discord id; watcher:<hid> -> discord id
// Nothing here holds a watcher's real id or key: the watcher sends hid (its hashed id), and keys are masked.

import { statReport, densify } from "./statcheck.js";
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
  if (p === "/watcher/quests" && req.method === "POST") return watcherQuests(req, env);
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
  if (p === "/inbox/pull" && req.method === "GET") return inboxPull(req, env, url);
  if (p === "/chat/price" && req.method === "GET") return chatPrice(req, env, url);
  if (p === "/hit" && req.method === "POST") return hit(req, env);
  if (p === "/reddit/push" && req.method === "POST") return redditPush(req, env);
  if (p === "/admin/reddit" && req.method === "GET") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); const st = (await env.ACCOUNTS.get("reddit:state", "json")) || {}; if (url.searchParams.get("log")) return json((await env.ACCOUNTS.get("reddit:log", "json")) || []); return json({ at: st.at, lastOk: st.lastOk, status: st.status, fails: st.fails, seen: (st.seen || []).length }, 200, { "Cache-Control": "no-store" }); }
  if (p === "/admin/traffic" && req.method === "GET") { const me = await whoami(req, env); if (!isAdmin(me, env)) return json({ error: "admin only" }, 403); const h = Number(url.searchParams.get("h") || 24); return json(await trafficStats(env, Date.now() - h * 3600e3, Date.now()), 200, { "Cache-Control": "no-store" }); }
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
  h.append("Set-Cookie", `fm_back=${["home", "quests", "market", "shop"].includes(url.searchParams.get("back")) ? url.searchParams.get("back") : "earn"}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax`);
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
  const h = new Headers({ Location: env.SITE + ({ home: "/#signed-in", quests: "/quests.html#signed-in", market: "/market.html#signed-in", shop: "/shop.html#signed-in" }[cookie(req, "fm_back")] || "/earn.html#signed-in") + "&fmt=" + encodeURIComponent(session) });
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
async function publicSupporters(env) {
  const out = [];
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
        out.push({ ign: a.ign || "", name: a.name || "", tier: tier ? tier.replace(/\b\w/g, c => c.toUpperCase()).replace("Fangblade", "FangBlade").replace("Curryishott", "curryishott") : "", lifetime });
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
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
  return json({ v: sha ? sha.slice(0, 12) : "", at: Date.now() }, 200, { "Cache-Control": "no-store" });
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
  if (overLimit("p:" + ip, 200, 600)) return json({ error: "slow down" }, 429, { "Retry-After": "120" });
  const body = await req.text();
  if (body.length > 60000) return json({ error: "too big" }, 413);
  let msg = "";
  try { msg = /json/.test(req.headers.get("Content-Type") || "") ? String(JSON.parse(body).m || "") : String(new URLSearchParams(body).get("m") || ""); } catch (e) {}
  let m = null; try { m = JSON.parse(msg); } catch (e) {}
  if (!m || ![1, 2, 3].includes(m.v) || !/^[0-9a-f]{16}$/.test(String(m.id || "")) || typeof m.z !== "string") return json({ error: "bad post" }, 400);
  await env.INBOX_DB.prepare("INSERT INTO posts (t, msg) VALUES (?, ?)").bind(Date.now(), msg).run();
  return json({ ok: true });
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
  const r = await env.INBOX_DB.prepare("SELECT id, t, msg FROM posts WHERE id > ? ORDER BY id LIMIT 2000").bind(after).all();
  const rows = (r.results || []).map((x) => [new Date(x.t).toISOString(), x.msg, x.id]);
  if (!after) await env.INBOX_DB.prepare("DELETE FROM posts WHERE t < ?").bind(Date.now() - 15 * DAY * 1000).run();
  return json({ rows, last: rows.length ? rows[rows.length - 1][2] : after }, 200, { "Cache-Control": "no-store" });
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
  if (body.length < 1000 || body.length > 24e6) { await note({ error: "size", bytes: body.length }); return json({ error: "size" }, 400); }
  let sj = null;
  try { sj = JSON.parse(body); if ((sj.v !== 2 && sj.v !== 3) || !sj.cols) throw 0; densify(sj); } catch (e) { await note({ error: "bad", bytes: body.length }); return json({ error: "bad" }, 400); }
  await env.ACCOUNTS.put("snap:board", body);
  // shops by owner for the shop pages, and "Seen in game" on market listings
  const shopsN = await snapShops(env, sj).catch((e) => "error " + (e && e.message || e));
  await note({ ok: true, bytes: body.length, seen: shopsN });
  return json({ ok: true, bytes: body.length });
}
async function dataSnap(env) {
  const ck = new Request("https://archive.cache/snap?b=" + Math.floor(Date.now() / 30000));
  let hit = await caches.default.match(ck);
  if (!hit) {
    const body = await env.ACCOUNTS.get("snap:board");
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
        out += (first ? "" : ",") + JSON.stringify("data/" + MEMBER_FILES[i]) + ":" + JSON.stringify(Array.isArray(arr) ? arr.filter((d) => d && Date.parse(d.at) > ak) : []); first = false;
      }
      body = out + "}";
      if (ref) await caches.default.put(ck, new Response(body, { headers: { "Cache-Control": "public, max-age=900" } })).catch(() => {});
    }
    if (!club) { const hp = await holdPrices(env); const o = JSON.parse(body); Object.keys(o).forEach((k) => holdDeals(o[k], hp)); body = JSON.stringify(o); }
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
const SYN = { att: "attack", atk: "attack", attk: "attack", matt: "magic attack", matk: "magic attack", ma: "magic attack", acc: "accuracy",
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
function mkCtx(env) { return { whoami, isAdmin, overLimit, findRows, splitRoll, rows: () => mkRows(env), abbr: abbrMap,
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
  let sm = await vaultJSON(env, "data/summary.json", 300).catch(() => null);
  // the vault copy is a few minutes fresher; the public copy keeps answers coming if the vault can't be read
  if (!sm || !Array.isArray(sm.rows)) {
    const r = await fetch(env.MARKET_ROWS_URL || "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/summary-public.json", { cf: { cacheTtl: 300, cacheEverything: true } }).catch(() => null);
    sm = r && r.ok ? await r.json().catch(() => null) : null;
  }
  return sm && Array.isArray(sm.rows) ? sm.rows.filter((r) => r && r.item && !/\u2026$|^scroll: |\|/i.test(r.item)) : [];
}

// scrolls are shown by success rate, as on the board: Lesser 100%, Intermediate 60%, Greater 10%
const shown = (name) => String(name || "").replace(/ Scroll: (Lesser|Intermediate|Greater)$/, (m, t) => " Scroll " + ({ Lesser: "100%", Intermediate: "60%", Greater: "10%" })[t]);
// exact under 10K (1,888 not 2K), then 12.5K, 790K, 1.15M, 1.2B
const meso = (n) => n >= 999.5e6 ? (n / 1e9).toFixed(2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + "B" : n >= 999.5e3 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + "M" : n >= 99.95e3 ? Math.round(n / 1e3) + "K" : n >= 9999.5 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : Math.round(n).toLocaleString("en-US");

function findRows(rows, q, abbr) {
  q = expandQuery(q, abbr || {});
  if (!q) return [];
  const qw = q.split(/[\s:]+/).filter((w) => w && !FILLER.has(w));
  const tierQ = /scroll: (lesser|intermediate|greater)$/.exec(q);
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
    return qw.length >= 3 && k >= qw.length - 1 ? 5 : 9;
  };
  const exact = (r) => { const words = shown(r.item).toLowerCase().split(/[^a-z0-9%]+/); return qw.filter((w) => words.includes(w)).length; };
  // misread one-off names (a single listing) sort under real items
  const junk = (r) => ((r.n || 0) < 2 ? 1 : 0);
  const out = rows.map((r) => [score(r), r]).filter((x) => x[0] < 9);
  // nothing landed: allow a typo or two in each word ("wrok gloves", "nakamaky", "white lable")
  if (!out.length && qw.length) {
    const near = (a, b) => { if (Math.abs(a.length - b.length) > 2) return false; const d = Array.from({ length: b.length + 1 }, (_, i) => i);
      for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
      // a swap of two letters ("wrok", "lable") counts as one typo
      let swap = false; if (a.length === b.length) { const diff = []; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i); swap = diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]; }
      return swap || d[b.length] <= (a.length >= 7 ? 2 : 1); };
    for (const r of rows) {
      const words = (shown(r.item) + " " + r.item).toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean);
      const k = qw.filter((w) => words.some((x) => x === w || x.startsWith(w) || (w.length >= 4 && near(w, x)))).length;
      if (k === qw.length) out.push([6, r]);
    }
  }
  return out.sort((a, b) => a[0] - b[0] || junk(a[1]) - junk(b[1]) || exact(b[1]) - exact(a[1]) || a[1].item.length - b[1].item.length || (b[1].n || 0) - (a[1].n || 0)).map((x) => x[1]);
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
    const pick = q.trim() ? findRows(rows, q, ab) : rows.filter((r) => (r.n || 0) >= 2).sort((a, b) => (b.vol || b.n || 0) - (a.vol || a.n || 0));
    return json({ type: 8, data: { choices: pick.slice(0, 25).map((r) => ({ name: shown(r.item).slice(0, 100), value: r.item.slice(0, 100) })) } });
  }
  if (it.type === 2 && it.data && (it.data.name === "market" || it.data.name === "sell"))
    return json(await marketCommand(env, it, Object.assign(mkCtx(env), { rows: await mkRows(env), abbr: await abbrMap() })));
  if (it.type === 2 && it.data && it.data.name === "price") {
    const rows = await summaryRows(env), ab = await abbrMap(), sr = splitRoll(q);
    const hits = findRows(rows, sr.q, ab);
    if (!hits.length) return json({ type: 4, data: { content: "No listings for **" + q.slice(0, 60) + "** in the last few days. Try a shorter name, or check https://maplefm.gg", flags: 64 } });
    const r = hits[0];
    const link = "https://maplefm.gg/?ref=discord#item=" + encodeURIComponent(r.item);
    const lines = [];
    if (r.typ) lines.push("**Typical: " + meso(r.typ) + "**" + (r.lo && r.hi ? "  (" + meso(r.lo) + " to " + meso(r.hi) + ")" : "") + (r.kind === "sale" ? "  from " + (r.salesN || 0) + " watched sales" : "  from asking prices"));
    if (r.best) lines.push("Cheapest ask now: " + meso(r.best) + "" + (r.deal >= 0.1 ? "  (" + Math.round(r.deal * 100) + "% under typical)" : ""));
    // mv[0] is the last 24 hours against the 24 before; daily is the typical per day, so the week comes from its ends
    const d = Array.isArray(r.daily) ? r.daily.filter((x) => x && x[1] > 0) : [];
    const wk = d.length >= 3 ? d[d.length - 1][1] / d[0][1] - 1 : null;
    if (Array.isArray(r.mv) && typeof r.mv[0] === "number" && Math.abs(r.mv[0]) >= 0.03) lines.push((r.mv[0] > 0 ? "Up " : "Down ") + Math.round(Math.abs(r.mv[0]) * 100) + "% in 24h");
    else if (wk != null && Math.abs(wk) >= 0.03) lines.push((wk > 0 ? "Up " : "Down ") + Math.round(Math.abs(wk) * 100) + "% over " + d.length + " days");
    if (sr.roll) lines.push(sr.roll + " ones: see **Price by " + sr.roll.split(" ")[1] + "** on the item's card, [open it here](" + link + ")");
    lines.push(r.n + " listings seen" + (r.cat ? " · " + r.cat : "") + " · [open on the board](" + link + ")");
    const more = hits.slice(1, 4).map((h) => shown(h.item)).join(", ");
    return json({ type: 4, data: { embeds: [{ title: shown(r.item), description: lines.join("\n"), url: link, color: 0x5b4bdb, footer: { text: (more ? "Also matched: " + more + " · " : "") + "Club FM, priced by watched sales · add /price: maplefm.gg/bot" } }] } });
  }
  return json({ type: 4, data: { content: "Unknown command", flags: 64 } });
}

// ---------------------------------------------------------------- !price for Twitch chat
// Plain text for chat bots (Nightbot, StreamElements, Fossabot): one line under 400 characters.
// Nightbot: !commands add !price $(urlfetch https://clubfm-accounts.aaweaver93.workers.dev/chat/price?q=$(querystring))
async function chatPrice(req, env, url) {
  const ip = req.headers.get("CF-Connecting-IP") || "";
  const txt = (t) => new Response(t.slice(0, 390), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
  if (overLimit("cp:" + ip, 120, 60)) return txt("Club FM: slow down a little, try again in a minute.");
  logHit(env, "!price", "", "", ip).catch(() => {});
  return txt(await priceLine(env, String(url.searchParams.get("q") || "")));
}
// "5 att wg", "work gloves +3 att": the roll comes off before the name is matched, and the answer points at the
// board's price-by-attack table for that item
// Stat words a player might use for a roll, and the label the answer shows
const ROLL_STATS = [
  [/^(magic ?attack|m\.? ?att(ack)?|matt|matk|ma)$/i, "MATT"], [/^(w\.? ?att(ack)?|watk|watt|attack|attk|atk|att|a)$/i, "ATT"],
  [/^(str|strength)$/i, "STR"], [/^(dex|dexterity)$/i, "DEX"], [/^(int|intelligence|intel)$/i, "INT"], [/^(luk|luck|lk)$/i, "LUK"],
  [/^(acc|accuracy)$/i, "ACC"], [/^(avoid|avoidability|avo|eva)$/i, "AVOID"], [/^(speed|spd)$/i, "SPEED"], [/^(jump|jmp)$/i, "JUMP"],
  [/^(hp|maxhp)$/i, "HP"], [/^(mp|maxmp)$/i, "MP"], [/^(wdef|w\.?def|def)$/i, "W.DEF"], [/^(mdef|m\.?def)$/i, "M.DEF"]];
const ROLL_WORD = "(magic ?attack|m\\.? ?att(?:ack)?|matt|matk|w\\.? ?att(?:ack)?|watk|watt|attack|attk|atk|att|str|strength|dex|dexterity|int|intelligence|intel|luk|luck|acc|accuracy|avoid|avoidability|speed|spd|jump|jmp|hp|mp|w\\.?def|m\\.?def|wdef|mdef|def)";
// "7 att wg", "wg 7 attack", "bandana +3 str", "luk 5 earring" (with +), "clean wg", "7a wg": the roll comes off the
// front so the rest can name the item. Anything with scroll or % stays a scroll search.
function splitRoll(q) {
  if (/scroll|%/i.test(q)) return { q, roll: "" };
  const lab = (w) => { for (const [re, l] of ROLL_STATS) if (re.test(String(w).trim())) return l; return ""; };
  const tidy = (m) => q.replace(m, " ").replace(/\s+/g, " ").trim();
  let m = new RegExp("(^|\\s)\\+?(\\d{1,2})\\s*" + ROLL_WORD + "(?=\\s|$)", "i").exec(q);
  if (m) { const rest = tidy(m[0]); return rest ? { q: rest, roll: m[2] + " " + lab(m[3]), g: m[2], stat: lab(m[3]), plus: /\+/.test(m[0]) } : { q, roll: "" }; }
  m = new RegExp("(^|\\s)" + ROLL_WORD + "\\s*\\+(\\d{1,2})(?=\\s|$)", "i").exec(q);
  if (m) { const rest = tidy(m[0]); return rest ? { q: rest, roll: m[3] + " " + lab(m[2]), g: m[3], stat: lab(m[2]), plus: true } : { q, roll: "" }; }
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
async function priceLine(env, raw) {
  let q = raw; try { q = decodeURIComponent(raw); } catch (e) {}
  q = q.replace(/^!?(price|pc|fm)\s*/i, "").trim().slice(0, 80);
  if (!q) return "Usage: !price item name, like !price work gloves or !price claw 60. Prices from real FM sales at maplefm.gg";
  const full = q, rows = await summaryRows(env), ab = await abbrMap();
  let sr = splitRoll(q), hits;
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
    const r0 = hits[0], g = String(parseInt(sr.g, 10)), slug0 = shown(r0.item).toLowerCase().replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    // roll sales are kept per roll and slots used ("7|5"); quote the slots group with the most sales
    let best = null;
    for (const [k, v] of Object.entries(r0.rt || {})) if (k.split("|")[0] === g && Array.isArray(v) && (!best || v[1] > best.v[1])) best = { su: Number(k.split("|")[1]), v };
    const ask = r0.ra && r0.ra[g];
    if (best || ask) {
      const b1 = [shown(r0.item) + " " + sr.roll + ":"];
      if (best) b1.push("typical " + meso(best.v[0]) + " from " + best.v[1] + " sales" + (best.su > 0 ? " (" + best.su + " slots used)" : ""));
      if (ask) b1.push((best ? "· " : "") + "cheapest up now " + meso(ask));
      b1.push("· maplefm.gg/item/" + slug0);
      return b1.join(" ").slice(0, 390);
    }
    const b0 = [shown(r0.item) + " " + sr.roll + ": no sales caught at that roll lately."];
    if (r0.typ) b0.push("All rolls typical " + meso(r0.typ) + ".");
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
  if (r.typ) bits.push("typical " + meso(r.typ) + (r.lo && r.hi && meso(r.lo) !== meso(r.hi) ? " (" + meso(r.lo) + " to " + meso(r.hi) + ")" : "") + (r.kind === "sale" ? " from " + (r.salesN || 0) + " sales" : " from asks"));
  if (r.best) bits.push("· cheapest now " + meso(r.best));
  if (Array.isArray(r.mv) && typeof r.mv[0] === "number" && Math.abs(r.mv[0]) >= 0.03) bits.push("· " + (r.mv[0] > 0 ? "up " : "down ") + Math.round(Math.abs(r.mv[0]) * 100) + "% today");
  const slug = shown(r.item).toLowerCase().replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  bits.push("· maplefm.gg/item/" + slug);
  return bits.join(" ").slice(0, 390);
}

// ---------------------------------------------------------------- Club FM Twitch chat bot
// Our own bot in a streamer's chat, no Nightbot needed. Built on Twitch's chat bot model:
// 1. Adam connects the bot account once (/twitchbot/connect?as=bot): scopes user:read:chat user:write:chat user:bot.
// 2. A streamer clicks "Add the Club FM bot" (/twitchbot/connect?as=channel): scope channel:bot. That subscribes an
//    EventSub webhook (channel.chat.message) for their chat, delivered to /twitchbot/eventsub.
// 3. !price, !pc and !fm get answered with the same line as /chat/price, sent through Helix Send Chat Message
//    with an app token, as a reply to the asker. 3 second cooldown per channel, 20 answers a minute per channel.
// KV: tb:bot {id, login}, tb:ch:<broadcaster id> {login, name, at, sub}, tb:apptoken {t, exp}.
// Needs Worker secrets TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET, and the redirect URL
// https://clubfm-accounts.aaweaver93.workers.dev/twitchbot/callback added to the Twitch app.
const TB_CMDS = /^!(price|pc|fm)\b/i;
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
  if (overLimit("tbcd:" + b, 1, 3) || overLimit("tbmin:" + b, 20, 60)) return new Response("ok");
  const bot = await env.ACCOUNTS.get("tb:bot", "json");
  if (!bot || e.chatter_user_id === bot.id) return new Response("ok");
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
const RD_NOT = /\b(worth (it|playing|leveling|levell?ing|the grind|maining|trying|getting into|returning)|is (it|this|classic) worth|cash shop (sale|update|items? (are|is) (back|out))|pc (specs?|build|crash(es)?|lag|requirements?|version|client|players?|gaming)|on (my|a|the) pc|gaming pc|new pc|mac|steam deck|controller)\b/i;
function redditScore(title, flair, body) {
  const head = (title || "") + " " + (flair || ""), text = head + " " + String(body || "").slice(0, 3000);
  if (/\b(price ?check|market|trading|economy|buying|selling|wts|wtb)\b/i.test(flair || "")) return { hit: true, why: "flair: " + flair };
  for (const [re, why] of RD_STRONG) {
    const m = re.exec(text); if (!m) continue;
    // a strong word only in the body of a post whose title says it's about something else still counts, unless the
    // only hit is a "worth it"-type phrase
    if (RD_NOT.test(head) && !re.test(head)) continue;
    return { hit: true, why: why + ": " + m[0].trim().slice(0, 40) };
  }
  const weak = new Set((text.match(RD_WEAK) || []).map((w) => w.toLowerCase()));
  if (weak.size >= 2 && RD_AMOUNT.test(text) && !RD_NOT.test(head)) return { hit: true, why: [...weak].slice(0, 3).join(", ") + " + amount" };
  return { hit: false, why: weak.size ? [...weak].slice(0, 3).join(", ") : "" };
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
  if (hits.length) await wdDM(env, await wdAdmins(env), redditEmbeds(hits));
  return json({ ok: true, new: hits.length });
}
function redditEmbeds(hits) {
  return hits.slice(0, 10).map(({ sub, p, why }) => ({
    title: String(p.title || "New post").slice(0, 250), url: "https://www.reddit.com" + String(p.permalink || "").replace(/^https:\/\/www\.reddit\.com/, ""), color: 0x6d3fd1,
    description: String(p.selftext || "").replace(/\s+/g, " ").slice(0, 300),
    fields: [{ name: "Where", value: "r/" + sub + (p.link_flair_text ? " · " + p.link_flair_text : ""), inline: true }, { name: "By", value: "u/" + (p.author || "?"), inline: true }, { name: "Matched", value: why, inline: true }],
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
// Reports go to a private Discord channel only Adam sees: hourly 9 AM to 11 PM Eastern, overnight at 8 AM.
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
  const by = {}; pages.forEach((r) => { const k = pageLabel(r.p).startsWith("Item: ") ? "Item pages" : pageLabel(r.p); by[k] = (by[k] || 0) + r.n; });
  const items = pages.filter((r) => /^\/item\//.test(r.p)).slice(0, 3).map((r) => pageLabel(r.p).slice(6) + " " + r.n);
  return { returning: (rt && rt.back) || 0, retKnown: (rt && rt.known) || 0, signedIn: (si && si.n) || 0, views: (tot && tot.n) || 0, visitors: (tot && tot.u) || 0, pages: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 6), items, refs, tags, price, opens, finds: (ev && ev.f) || 0, picks: (ev && ev.k) || 0 };
}
function totalsLine(t) { const pc = t.price.reduce((s, r) => s + r.n, 0); return "**" + t.visitors + "** visitors · **" + t.returning + "** returning · **" + t.signedIn + "** signed in · **" + t.views + "** views · **" + pc + "** !price"; }
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
  if (et.hour === 4) await env.INBOX_DB.prepare("DELETE FROM hits WHERE t < ?").bind(nowMs - 120 * 864e5).run();
  const dow = new Date(top - 4 * 3600e3).getUTCDay();   // 0 Sunday, Eastern near enough at these hours
  if (dow === 1 && et.hour === 9) await weeklyTraffic(env, top).catch((e) => env.ACCOUNTS.put("weekly:err", String(e && e.stack || e).slice(0, 500)));
  if (dow === 0 && et.hour === 22) await redditDraft(env).catch((e) => env.ACCOUNTS.put("rdraft:err", String(e && e.stack || e).slice(0, 500)));
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
  const seo = await fetch("https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/seo.json?b=" + Date.now()).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (seo && seo.pages) {
    const iss = Object.entries(seo.issues || {}).filter(([, n]) => n).map(([k, n]) => k + " " + n);
    f.push({ name: "Search check (" + (seo.day || "") + ")", value: (seo.pages + " pages in the sitemap · median load " + seo.ms + " ms\n" + (iss.length ? "Needs a look: " + iss.join(", ") : "All pages pass: titles, descriptions, canonicals, no errors")).slice(0, 1000) });
  }
  await wdDM(env, await wdAdmins(env), [{ title: "Club FM, the week to Monday 9 AM", color: 0x6d3fd1, fields: f, footer: { text: "Compared with the week before. Visitors counted once a day each." } }]);
}

// ---------------------------------------------------------------- Sunday: the weekly recap for Reddit
// Sunday 10 PM Eastern, a DM to the admins: the week's market report as a picture and a PDF (made at 9 PM by the
// weeklyrecap workflow into data/weekly/ on the live branch) with a title, ready for an r/MSClassicWorld image post.
// Nothing is posted anywhere; Adam posts it himself.
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
  return json({ ok: true });
}

// ---------------------------------------------------------------- helpers
function corsHeaders(env, origin) {
  const ok = origin === env.SITE || origin === "https://maplefm.github.io";
  return ok ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Vary": "Origin" } : {};
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
