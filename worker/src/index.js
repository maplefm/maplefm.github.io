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

const DISCORD = "https://discord.com/api/v10";
const COOKIE = "fm_session";
const DAY = 86400;
const GUILD = "1562552872606892132";   // the Club FM Discord server
const TIERS = [[100000, "Mythic"], [50000, "Titan"], [25000, "Immortal"], [10000, "Legend"], [5000, "Monarch"], [2500, "Royal"], [1000, "Tycoon"], [400, "Broker"], [150, "Trader"], [50, "Merchant"], [10, "Apprentice"], [0, "Scout"]];
const MEGA_AT = 50000;   // sales caught that earn the Mega Deals role, the same perk the $100 Ko-fi tier gets

export default {
  async scheduled(ev, env, ctx) {
    // every 5 minutes: watchlist DMs; on the hourly run: the role sync too
    ctx.waitUntil(notifyWatchers(env));
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
  if (p === "/me/settings" && req.method === "GET") return getSettings(req, env);
  if (p === "/me/settings" && req.method === "POST") return putSettings(req, env);
  if (p === "/link" && req.method === "POST") return link(req, env);
  if (p === "/twitch/login") return twitchLogin(req, env, url);
  if (p === "/twitch/callback") return twitchCallback(req, env, url);
  if (p === "/twitch/unlink" && req.method === "POST") return twitchUnlink(req, env);
  if (p === "/data/live" && req.method === "GET") return dataLive(req, env);
  if (p === "/inbox" && req.method === "POST") return inboxPost(req, env);
  if (p === "/inbox/pull" && req.method === "GET") return inboxPull(req, env, url);
  if (p === "/public/links") return publicLinks(env);
  if (p === "/public/supporters") return publicSupporters(env);
  if (p === "/public/stats") return publicStats(env);
  if (p === "/public/kofi-income") return kofiIncome(env);
  if (p === "/interactions" && req.method === "POST") return interactions(req, env);
  if (p === "/admin" && req.method === "GET") return admin(req, env);
  if (p === "/admin/note" && req.method === "POST") return adminNote(req, env);
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
  h.append("Set-Cookie", `fm_back=${url.searchParams.get("back") === "home" ? "home" : "earn"}; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax`);
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
  const h = new Headers({ Location: env.SITE + (cookie(req, "fm_back") === "home" ? "/#signed-in" : "/earn.html#signed-in") });
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
  const c = cookie(req, COOKIE);
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
async function archFetch(env, path, ttl = 60) {
  const key = new Request("https://archive.cache/" + path + "?b=" + Math.floor(Date.now() / 1000 / ttl));
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  if (!env.ARCHIVE_READ) return null;
  const r = await fetch(ARCH_RAW + path, { headers: { Authorization: "token " + env.ARCHIVE_READ, "User-Agent": "clubfm-worker" } });
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
  const c = cookie(req, COOKIE); if (!c) return null;
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

async function dataLive(req, env) {
  const id = await sessionId(req, env);
  if (!id) return json({ error: "sign in" }, 401, { "Cache-Control": "no-store" });
  const ip = req.headers.get("CF-Connecting-IP") || "";
  if (overLimit("a:" + id, 30, 600) || overLimit("i:" + ip, 60, 600)) return json({ error: "slow down" }, 429, { "Retry-After": "300" });
  if (env.RL) { try { const ok = await env.RL.limit({ key: "a:" + id }); if (!ok.success) return json({ error: "slow down" }, 429, { "Retry-After": "300" }); } catch (e) {} }
  const parts = await Promise.all(MEMBER_FILES.map((f) => archFetch(env, "data/" + f, 60).catch(() => null)));
  if (!parts.some(Boolean)) return json({ error: "not ready" }, 503);
  const { readable, writable } = new TransformStream();
  (async () => {
    const w = writable.getWriter(), enc = new TextEncoder();
    let first = true;
    await w.write(enc.encode("{"));
    for (let i = 0; i < MEMBER_FILES.length; i++) {
      if (!parts[i]) continue;
      await w.write(enc.encode((first ? "" : ",") + JSON.stringify("data/" + MEMBER_FILES[i]) + ":")); first = false;
      const rd = parts[i].body.getReader();
      for (;;) { const { done, value } = await rd.read(); if (done) break; await w.write(value); }
    }
    await w.write(enc.encode("}")); await w.close();
  })();
  return new Response(readable, { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
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
  luk: "luck", avoid: "avoidability", avo: "avoidability", spd: "speed", jmp: "jump", wep: "weapon", wpn: "weapon", crit: "crit", ohs: "one-handed sword",
  ths: "two-handed sword", glove: "gloves", shoe: "shoes", earrings: "earring", topwear: "topwear", ovr: "overall", ova: "overall" };
function expandQuery(q, abbr) {
  q = String(q || "").toLowerCase().replace(/[%]/g, " ").replace(/\s+/g, " ").trim();
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
async function summaryRows(env) {
  const sm = await vaultJSON(env, "data/summary.json", 300).catch(() => null);
  return sm && Array.isArray(sm.rows) ? sm.rows.filter((r) => r && r.item && !/\u2026$|^scroll: |\|/i.test(r.item)) : [];
}

// scrolls are shown by success rate, as on the board: Lesser 100%, Intermediate 60%, Greater 10%
const shown = (name) => String(name || "").replace(/ Scroll: (Lesser|Intermediate|Greater)$/, (m, t) => " Scroll " + ({ Lesser: "100%", Intermediate: "60%", Greater: "10%" })[t]);
const meso = (n) => n >= 999.5e6 ? (n / 1e9).toFixed(2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + "B" : n >= 999.5e3 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + "M" : n >= 999.5 ? Math.round(n / 1e3) + "K" : String(Math.round(n));

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
    return qw.length >= 2 && k >= qw.length - 1 && k >= 1 ? 5 : 9;
  };
  const exact = (r) => { const words = shown(r.item).toLowerCase().split(/[^a-z0-9%]+/); return qw.filter((w) => words.includes(w)).length; };
  // misread one-off names (a single listing) sort under real items
  const junk = (r) => ((r.n || 0) < 2 ? 1 : 0);
  return rows.map((r) => [score(r), r]).filter((x) => x[0] < 9).sort((a, b) => a[0] - b[0] || junk(a[1]) - junk(b[1]) || exact(b[1]) - exact(a[1]) || a[1].item.length - b[1].item.length || (b[1].n || 0) - (a[1].n || 0)).map((x) => x[1]);
}

async function interactions(req, env) {
  const body = await req.text();
  if (!(await verifyDiscord(req, env, body))) return new Response("bad signature", { status: 401 });
  const it = JSON.parse(body);
  if (it.type === 1) return json({ type: 1 });
  const opt = ((it.data && it.data.options) || []).find((o) => o.name === "item");
  const q = opt ? String(opt.value || "") : "";
  if (it.type === 4) {                                   // autocomplete: the closest item names
    const rows = await summaryRows(env), ab = await abbrMap();
    // nothing typed yet: the busiest items, so the list shows as soon as the box opens
    const pick = q.trim() ? findRows(rows, q, ab) : rows.filter((r) => (r.n || 0) >= 2).sort((a, b) => (b.vol || b.n || 0) - (a.vol || a.n || 0));
    return json({ type: 8, data: { choices: pick.slice(0, 25).map((r) => ({ name: shown(r.item).slice(0, 100), value: r.item.slice(0, 100) })) } });
  }
  if (it.type === 2 && it.data && it.data.name === "price") {
    const rows = await summaryRows(env), ab = await abbrMap();
    const hits = findRows(rows, q, ab);
    if (!hits.length) return json({ type: 4, data: { content: "No listings for **" + q.slice(0, 60) + "** in the last few days. Try a shorter name, or check https://maplefm.gg", flags: 64 } });
    const r = hits[0];
    const link = "https://maplefm.gg/#item=" + encodeURIComponent(r.item);
    const lines = [];
    if (r.typ) lines.push("**Typical: " + meso(r.typ) + "**" + (r.lo && r.hi ? "  (" + meso(r.lo) + " to " + meso(r.hi) + ")" : "") + (r.kind === "sale" ? "  from " + (r.salesN || 0) + " watched sales" : "  from asking prices"));
    if (r.best) lines.push("Cheapest ask now: " + meso(r.best) + "" + (r.deal >= 0.1 ? "  (" + Math.round(r.deal * 100) + "% under typical)" : ""));
    // mv[0] is the last 24 hours against the 24 before; daily is the typical per day, so the week comes from its ends
    const d = Array.isArray(r.daily) ? r.daily.filter((x) => x && x[1] > 0) : [];
    const wk = d.length >= 3 ? d[d.length - 1][1] / d[0][1] - 1 : null;
    if (Array.isArray(r.mv) && typeof r.mv[0] === "number" && Math.abs(r.mv[0]) >= 0.03) lines.push((r.mv[0] > 0 ? "Up " : "Down ") + Math.round(Math.abs(r.mv[0]) * 100) + "% in 24h");
    else if (wk != null && Math.abs(wk) >= 0.03) lines.push((wk > 0 ? "Up " : "Down ") + Math.round(Math.abs(wk) * 100) + "% over " + d.length + " days");
    lines.push(r.n + " listings seen" + (r.cat ? " · " + r.cat : "") + " · [open on the board](" + link + ")");
    const more = hits.slice(1, 4).map((h) => shown(h.item)).join(", ");
    return json({ type: 4, data: { embeds: [{ title: shown(r.item), description: lines.join("\n"), url: link, color: 0x5b4bdb, footer: { text: (more ? "Also matched: " + more + " · " : "") + "Club FM, priced by watched sales · add /price: maplefm.gg/bot" } }] } });
  }
  return json({ type: 4, data: { content: "Unknown command", flags: 64 } });
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
  const crownId = byName["crown"], megaId = byName["mega deals"], membersId = byName["members"];
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
      // anyone signed in on the site who is in the server is a Member: the members-only channels open up
      if (membersId && a.inGuild && !(a.roles || []).includes(membersId)) {
        const r = await fetch(DISCORD + "/guilds/" + GUILD + "/members/" + a.id + "/roles/" + membersId, { method: "PUT", headers: H });
        if (r.ok) { a.roles = (a.roles || []).concat([membersId]); await env.ACCOUNTS.put(k.name, JSON.stringify(a)); }
      }
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
        if (!want.has(id) && have.has(id) && !isAdmin(a, env)) { const r = await fetch(DISCORD + "/guilds/" + GUILD + "/members/" + a.id + "/roles/" + id, { method: "DELETE", headers: H }); if (r.ok) { have.delete(id); changed = true; } else failed++; }
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
    options: [{ type: 3, name: "item", description: "Item name or chat shortcut (gfa 60, wg), start typing for suggestions", required: true, autocomplete: true }] }];
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
  return ok ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" } : {};
}
function json(obj, status = 200, extra = {}) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...extra } }); }
function text(s, status = 200) { return new Response(s, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
function now() { return Math.floor(Date.now() / 1000); }
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
