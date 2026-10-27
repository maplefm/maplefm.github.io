// ---------------------------------------------------------------- the player market
// Signed-in members list their own items for mesos. Listings live in D1 (env.INBOX_DB), never in the price data:
// the board's prices come only from shops seen in game, so a fake or silly listing can't move them.
// Each site listing is mirrored as a post in the #selling forum on Discord, and posts made straight in that forum
// come back here as listings. Buy it now and offers reach the seller as a Discord DM from the bot.

export const SELL_FORUM = "1562659132757114990";
const GUILD = "1562552872606892132";
const DAY = 86400;
const LIFE = 7 * DAY;            // a listing runs a week, then can be renewed
const MIN_AGE = 30 * DAY;        // Discord accounts younger than this can't list or buy
const MAX_PRICE = 50e9;
const SITE_URL = "https://maplefm.gg";
const ST_OPEN = ["active", "pending"];

const now = () => Math.floor(Date.now() / 1000);
const api = (env) => env.DISCORD_API || "https://discord.com/api/v10";
const H = (env) => ({ Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" });
function rid() { const b = new Uint8Array(5); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); }
function j(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
const meso = (n) => n >= 999.5e6 ? +(n / 1e9).toFixed(2) + "B" : n >= 999.5e3 ? +(n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + "M" : n >= 999.5 ? Math.round(n / 1e3) + "K" : String(Math.round(n));
const shown = (name) => String(name || "").replace(/ Scroll: (Lesser|Intermediate|Greater)$/, (m, t) => " Scroll " + ({ Lesser: "100%", Intermediate: "60%", Greater: "10%" })[t]);
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f<>@`]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
export const listingUrl = (id) => SITE_URL + "/market.html#l=" + id;

// "15m", "2.5 mil", "800k", "1b", "15,000,000"
export function parseMesos(s) {
  s = String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return NaN;
  const m = /^(\d+(?:[.,]\d+)?)(k|m|mil|mill|million|b|bil|billion)?$/.exec(s.replace(/,(?=\d{3}(\D|$))/g, ""));
  if (!m) return NaN;
  const v = parseFloat(m[1].replace(",", ".")), u = m[2] || "";
  const mul = !u ? 1 : u === "k" ? 1e3 : u[0] === "m" ? 1e6 : 1e9;
  return Math.round(v * mul);
}

let READY = false;
async function ensure(env) {
  if (READY) return;
  await env.INBOX_DB.batch([
    env.INBOX_DB.prepare(`CREATE TABLE IF NOT EXISTS market_listings (id TEXT PRIMARY KEY, seller_id TEXT, seller_name TEXT, seller_avatar TEXT,
      ign TEXT, item TEXT, qty INTEGER, price INTEGER, stats TEXT, note TEXT, created INTEGER, updated INTEGER, expires INTEGER, status TEXT,
      source TEXT, thread_id TEXT, title TEXT, buyer_id TEXT, buyer_name TEXT, buyer_ign TEXT, deal_price INTEGER, closed_reason TEXT, dsc_err TEXT)`),
    env.INBOX_DB.prepare(`CREATE INDEX IF NOT EXISTS market_status ON market_listings (status, item)`),
    env.INBOX_DB.prepare(`CREATE INDEX IF NOT EXISTS market_seller ON market_listings (seller_id)`),
    env.INBOX_DB.prepare(`CREATE INDEX IF NOT EXISTS market_thread ON market_listings (thread_id)`),
    env.INBOX_DB.prepare(`CREATE TABLE IF NOT EXISTS market_offers (id TEXT PRIMARY KEY, listing_id TEXT, buyer_id TEXT, buyer_name TEXT, buyer_ign TEXT,
      price INTEGER, qty INTEGER, created INTEGER, status TEXT)`),
    env.INBOX_DB.prepare(`CREATE INDEX IF NOT EXISTS market_offer_l ON market_offers (listing_id, status)`),
    env.INBOX_DB.prepare(`CREATE TABLE IF NOT EXISTS market_seen (thread_id TEXT PRIMARY KEY, at INTEGER, why TEXT)`),
    env.INBOX_DB.prepare(`CREATE TABLE IF NOT EXISTS market_reports (id TEXT PRIMARY KEY, listing_id TEXT, reporter_id TEXT, why TEXT, created INTEGER)`),
  ]);
  // columns added after launch; adding one that's already there just fails quietly
  for (const c of ["confirmed INTEGER", "seen_at INTEGER", "seen_price INTEGER", "deal_sent INTEGER", "sold_at INTEGER"])
    await env.INBOX_DB.prepare("ALTER TABLE market_listings ADD COLUMN " + c).run().catch(() => {});
  READY = true;
}
const one = async (env, sql, ...b) => env.INBOX_DB.prepare(sql).bind(...b).first();
const all = async (env, sql, ...b) => ((await env.INBOX_DB.prepare(sql).bind(...b).all()).results || []);
const run = async (env, sql, ...b) => env.INBOX_DB.prepare(sql).bind(...b).run();

// trades both sides confirmed, by Discord id: a seller's track record
let TRADES = null;
async function trades(env) {
  if (TRADES && Date.now() - TRADES.at < 60e3) return TRADES.m;
  const m = {};
  (await all(env, "SELECT seller_id AS u, COUNT(*) AS n FROM market_listings WHERE confirmed = 1 GROUP BY seller_id")).forEach((r) => { m[r.u] = (m[r.u] || 0) + r.n; });
  (await all(env, "SELECT buyer_id AS u, COUNT(*) AS n FROM market_listings WHERE confirmed = 1 AND buyer_id IS NOT NULL GROUP BY buyer_id")).forEach((r) => { m[r.u] = (m[r.u] || 0) + r.n; });
  TRADES = { at: Date.now(), m };
  return m;
}
const SEEN_FOR = 3 * DAY;
// what anyone may see of a listing
function pub(l, T) {
  return { id: l.id, item: l.item, qty: l.qty, price: l.price, stats: l.stats || "", note: l.note || "", ign: l.ign || "",
    seller: { id: l.seller_id, name: l.seller_name || "", avatar: l.seller_avatar || "", trades: (T && T[l.seller_id]) || 0 },
    seen: l.seen_at && now() - l.seen_at < SEEN_FOR ? { at: l.seen_at, price: l.seen_price || 0 } : null, created: l.created, updated: l.updated, expires: l.expires,
    status: l.status, source: l.source, thread: l.thread_id ? "https://discord.com/channels/" + GUILD + "/" + l.thread_id : "", url: listingUrl(l.id) };
}

// ---------------------------------------------------------------- routes
// ctx: { whoami, isAdmin, rows (item rows), findRows, abbr, splitRoll }
export async function marketRoute(req, env, url, p, ctx) {
  await ensure(env);
  const m = /^\/market(?:\/([0-9a-f]{10})(?:\/([a-z]+))?(?:\/([0-9a-f]{10})\/([a-z]+))?)?$/.exec(p);
  if (!m) return j({ error: "not found" }, 404);
  const [, id, act, oid, oact] = m;
  if (req.method === "GET" && !id) return marketList(req, env, url, ctx);
  if (req.method === "GET" && id && !act) return marketOne(req, env, id, ctx);
  if (req.method !== "POST") return j({ error: "not found" }, 404);
  const me = await ctx.whoami(req, env);
  if (!me) return j({ error: "Sign in with Discord first." }, 401);
  let b = {}; try { b = await req.json(); } catch (e) { b = {}; }
  if (!b || typeof b !== "object") b = {};
  if (ctx.overLimit("mk:" + me.id, Number(env.MARKET_RATE) || 60, 60)) return j({ error: "Slow down a little and try again in a minute." }, 429);
  if (!id) return create(env, me, b, ctx);
  const l = await one(env, "SELECT * FROM market_listings WHERE id = ?", id);
  if (!l || l.status === "deleted") return j({ error: "That listing doesn't exist anymore." }, 404);
  const owner = String(l.seller_id) === String(me.id), admin = ctx.isAdmin(me, env);
  if (act === "offer" && oid) return offerAct(env, me, l, oid, oact, owner);
  switch (act) {
    case "edit": return owner || admin ? edit(env, l, b, ctx) : j({ error: "Only the seller can change this listing." }, 403);
    case "cancel": case "sold": case "delete": case "renew": case "release":
      return owner || admin ? close(env, l, act, me, owner) : j({ error: "Only the seller can change this listing." }, 403);
    case "buy": return buy(env, me, l, b);
    case "offer": return offer(env, me, l, b);
    case "confirm": return confirm(env, me, l, b, ctx);
    case "report": return report(env, me, l, b, ctx);
  }
  return j({ error: "not found" }, 404);
}

async function marketList(req, env, url, ctx) {
  await expire(env);
  const mine = url.searchParams.get("mine");
  if (mine) {
    const me = await ctx.whoami(req, env);
    if (!me) return j({ signedIn: false, listings: [], offers: [] });
    const ls = await all(env, "SELECT * FROM market_listings WHERE seller_id = ? AND status != 'deleted' ORDER BY updated DESC LIMIT 500", me.id);
    const ids = ls.filter((l) => ST_OPEN.includes(l.status)).map((l) => l.id);
    const offs = ids.length ? await all(env, `SELECT * FROM market_offers WHERE status = 'open' AND listing_id IN (${ids.map(() => "?").join(",")})`, ...ids) : [];
    const made = await all(env, "SELECT o.*, l.item AS item FROM market_offers o JOIN market_listings l ON l.id = o.listing_id WHERE o.buyer_id = ? ORDER BY o.created DESC LIMIT 100", me.id);
    const T = await trades(env);
    return j({ signedIn: true, me: { id: me.id, name: me.name || me.username || "", ign: me.ign || "", ok: acctOk(me) === "" , why: acctOk(me) },
      trades: T[me.id] || 0,
      listings: ls.map((l) => Object.assign(pub(l, T), { buyer: l.buyer_id ? { id: l.buyer_id, name: l.buyer_name, ign: l.buyer_ign } : null, dealPrice: l.deal_price || 0, closed: l.closed_reason || "", offers: offs.filter((o) => o.listing_id === l.id).map(offPub) })),
      offers: made.map((o) => Object.assign(offPub(o), { item: o.item })) });
  }
  const item = url.searchParams.get("item");
  const ls = item
    ? await all(env, "SELECT * FROM market_listings WHERE status IN ('active','pending') AND item = ? ORDER BY price ASC LIMIT 200", item)
    : await all(env, "SELECT * FROM market_listings WHERE status IN ('active','pending') ORDER BY created DESC LIMIT 2000");
  const T = await trades(env);
  return new Response(JSON.stringify({ at: now(), listings: ls.map((l) => pub(l, T)) }), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=15" } });
}
const offPub = (o) => ({ id: o.id, listing: o.listing_id, price: o.price, qty: o.qty, created: o.created, status: o.status, buyer: { id: o.buyer_id, name: o.buyer_name, ign: o.buyer_ign } });

async function marketOne(req, env, id, ctx) {
  await expire(env);
  const l = await one(env, "SELECT * FROM market_listings WHERE id = ?", id);
  if (!l || l.status === "deleted") return j({ error: "That listing doesn't exist anymore." }, 404);
  const me = await ctx.whoami(req, env);
  const out = pub(l, await trades(env));
  if (me && ctx.isAdmin(me, env)) { out.admin = true; out.reports = (await all(env, "SELECT why, created FROM market_reports WHERE listing_id = ? ORDER BY created DESC LIMIT 20", id)); }
  if (me && String(me.id) === String(l.seller_id)) {
    out.mine = true;
    out.offers = (await all(env, "SELECT * FROM market_offers WHERE listing_id = ? AND status = 'open' ORDER BY price DESC", id)).map(offPub);
    out.buyer = l.buyer_id ? { id: l.buyer_id, name: l.buyer_name, ign: l.buyer_ign } : null;
    out.dealPrice = l.deal_price || 0;
  } else if (me) {
    out.myOffers = (await all(env, "SELECT * FROM market_offers WHERE listing_id = ? AND buyer_id = ? ORDER BY created DESC", id, me.id)).map(offPub);
    out.iAmBuyer = l.buyer_id === me.id;
    out.reported = !!(await one(env, "SELECT id FROM market_reports WHERE listing_id = ? AND reporter_id = ?", id, String(me.id)));
  }
  // a sale waits on the buyer saying they got it: 0 waiting, 1 confirmed, -1 the buyer says no
  if (l.status === "sold" && l.buyer_id && me && (out.mine || out.iAmBuyer || out.admin)) { out.confirmed = l.confirmed == null ? null : l.confirmed; out.dealPrice = l.deal_price || l.price; }
  out.closed = l.closed_reason || "";
  return j(out);
}

// accounts must be a month old: throwaway accounts can't spam listings or fake buyers
function acctOk(me) {
  if (me.locked) return "This account can't use the market.";
  const born = me.discordCreated || 0;
  if (born && now() - born < MIN_AGE) return "Your Discord account needs to be at least 30 days old to trade here.";
  return "";
}

function checkFields(b, ctx, l) {
  const out = {};
  if (!l || b.item !== undefined) {
    const it = String(b.item || "").trim();
    const row = ctx.rows.find((r) => r.item === it);
    if (!row) return { err: "Pick the item from the list so it matches the board." };
    out.item = row.item; out.equip = !!row.equip;
  }
  if (!l || b.price !== undefined) {
    const p = typeof b.price === "number" ? Math.round(b.price) : parseMesos(b.price);
    if (!(p >= 1) || p > MAX_PRICE) return { err: "Enter a price in mesos, like 15m or 800k." };
    out.price = p;
  }
  if (!l || b.qty !== undefined) {
    const q = b.qty === undefined || b.qty === "" ? 1 : Number(b.qty);
    if (!Number.isInteger(q) || q < 1 || q > 9999) return { err: "Quantity has to be a whole number from 1 to 9999." };
    out.qty = q;
  }
  if (b.stats !== undefined) out.stats = clean(b.stats, 60);
  if (b.note !== undefined) out.note = clean(b.note, 200);
  if (b.ign !== undefined) {
    const g = String(b.ign == null ? "" : b.ign).trim();
    if (g && !/^[A-Za-z0-9]{2,12}$/.test(g)) return { err: "That doesn't look like a MapleStory name (letters and numbers, up to 12)." };
    out.ign = g;
  }
  return out;
}

async function create(env, me, b, ctx) {
  const bad = acctOk(me); if (bad) return j({ error: bad }, 403);
  const f = checkFields(b, ctx, null); if (f.err) return j({ error: f.err }, 400);
  if (f.ign === undefined || !f.ign) f.ign = clean(me.ign, 20);
  if (!f.ign) return j({ error: "Add your in-game name so buyers can find you." }, 400);
  // no cap on how many, but the same item at the same price twice is a double tap
  const dup = await one(env, "SELECT id FROM market_listings WHERE seller_id = ? AND item = ? AND price = ? AND COALESCE(stats,'') = ? AND status IN ('active','pending')", me.id, f.item, f.price, f.stats || "");
  if (dup) return j({ error: "You already have this listed at that price.", id: dup.id }, 409);
  if (ctx.overLimit("mkc:" + me.id, (Number(env.MARKET_RATE) || 60) / 2, 3600)) return j({ error: "That's a lot of listings in an hour. Try again a little later." }, 429);
  const t = now(), id = rid();
  const l = { id, seller_id: String(me.id), seller_name: clean(me.name || me.username, 40), seller_avatar: me.avatar || "", ign: f.ign, item: f.item, qty: f.qty, price: f.price,
    stats: f.stats || "", note: f.note || "", created: t, updated: t, expires: t + LIFE, status: "active", source: "site", thread_id: null, title: "" };
  await run(env, `INSERT INTO market_listings (id, seller_id, seller_name, seller_avatar, ign, item, qty, price, stats, note, created, updated, expires, status, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, l.id, l.seller_id, l.seller_name, l.seller_avatar, l.ign, l.item, l.qty, l.price, l.stats, l.note, l.created, l.updated, l.expires, l.status, l.source);
  const th = await threadOpen(env, l).catch((e) => ({ err: String(e.message || e) }));
  if (th && th.id) { await run(env, "UPDATE market_listings SET thread_id = ?, title = ? WHERE id = ?", th.id, th.name || "", id); l.thread_id = th.id; }
  else if (th && th.err) await run(env, "UPDATE market_listings SET dsc_err = ? WHERE id = ?", th.err.slice(0, 200), id);
  return j({ ok: true, listing: pub(l) });
}

async function edit(env, l, b, ctx) {
  if (!ST_OPEN.includes(l.status)) return j({ error: "This listing is closed. Renew it to change it." }, 409);
  const f = checkFields(b, ctx, l); if (f.err) return j({ error: f.err }, 400);
  delete f.equip;
  if (f.ign === "") return j({ error: "Add your in-game name so buyers can find you." }, 400);
  const keys = Object.keys(f).filter((k) => ["item", "price", "qty", "stats", "note", "ign"].includes(k) && f[k] !== l[k]);
  if (!keys.length) return j({ ok: true, listing: pub(l), unchanged: true });
  if (keys.includes("price") || keys.includes("item") || keys.includes("stats")) {
    const dup = await one(env, "SELECT id FROM market_listings WHERE seller_id = ? AND item = ? AND price = ? AND COALESCE(stats,'') = ? AND status IN ('active','pending') AND id != ?",
      l.seller_id, f.item || l.item, f.price || l.price, (f.stats !== undefined ? f.stats : l.stats) || "", l.id);
    if (dup) return j({ error: "You already have this listed at that price.", id: dup.id }, 409);
  }
  const old = Object.assign({}, l);
  keys.forEach((k) => { l[k] = f[k]; });
  l.updated = now();
  await run(env, `UPDATE market_listings SET ${keys.map((k) => k + " = ?").join(", ")}, updated = ? WHERE id = ?`, ...keys.map((k) => l[k]), l.updated, l.id);
  // a price cut can make it a deal now: check it again on the next sync
  if (keys.includes("price") && l.price < old.price && !l.deal_sent) await run(env, "UPDATE market_listings SET deal_sent = NULL WHERE id = ?", l.id);
  const what = keys.includes("price") ? "Price changed from " + meso(old.price) + " to " + meso(l.price) + " each." : "Listing details updated.";
  await safe(threadEdit(env, l, what));
  return j({ ok: true, listing: pub(l) });
}

async function close(env, l, act, me, owner) {
  const t = now(), was = l.status;
  const who = owner ? "the seller" : "a Club FM admin";
  if (act === "renew") {
    if (!["active", "expired", "cancelled"].includes(was)) return j({ error: was === "pending" ? "A buyer is on this one. Release it or mark it sold first." : "This listing can't be renewed." }, 409);
    await run(env, "UPDATE market_listings SET status = 'active', expires = ?, updated = ?, closed_reason = NULL WHERE id = ?", t + LIFE, t, l.id);
    Object.assign(l, { status: "active", expires: t + LIFE, updated: t });
    if (was !== "active") {
      if (l.source === "site" && (!l.thread_id || was !== "active")) {
        const th = await threadOpen(env, l).catch(() => null);
        if (th && th.id) await run(env, "UPDATE market_listings SET thread_id = ?, title = ? WHERE id = ?", th.id, th.name || "", l.id);
      }
    }
    return j({ ok: true, listing: pub(l) });
  }
  if (act === "release") {
    if (was !== "pending") return j({ error: "No buyer is holding this listing." }, 409);
    const buyer = l.buyer_id;
    await run(env, "UPDATE market_listings SET status = 'active', buyer_id = NULL, buyer_name = NULL, buyer_ign = NULL, deal_price = NULL, updated = ? WHERE id = ?", t, l.id);
    if (buyer) await safe(dm(env, buyer, "The seller reopened " + label(l) + ". It's for sale again: " + listingUrl(l.id)));
    await safe(threadSay(env, l, "Back on sale. The last buyer didn't go through."));
    return j({ ok: true, listing: pub(Object.assign(l, { status: "active", buyer_id: null, updated: t })) });
  }
  if (act === "delete") {
    await run(env, "UPDATE market_listings SET status = 'deleted', updated = ?, closed_reason = ? WHERE id = ?", t, "removed by " + who, l.id);
    await run(env, "UPDATE market_offers SET status = 'closed' WHERE listing_id = ? AND status = 'open'", l.id);
    if (ST_OPEN.includes(was)) await safe(threadClose(env, l, "This listing was removed by " + who + "."));
    return j({ ok: true, deleted: true });
  }
  if (!ST_OPEN.includes(was)) return j({ error: "This listing is already " + was + "." }, 409);
  const st = act === "sold" ? "sold" : "cancelled";
  await run(env, "UPDATE market_listings SET status = ?, updated = ?, closed_reason = ?, sold_at = ?, confirmed = ? WHERE id = ?", st, t, (st === "sold" ? "sold" : "cancelled by " + who), st === "sold" ? t : null, st === "sold" && l.buyer_id ? 0 : null, l.id);
  if (st === "sold" && l.buyer_id) await safe(dm(env, l.buyer_id, (l.seller_name || "The seller") + " marked " + label(l) + " as sold to you for " + meso(l.deal_price || l.price) +
    ". Did you get it? Confirm here so it counts on their record: " + listingUrl(l.id)));
  await run(env, "UPDATE market_offers SET status = 'closed' WHERE listing_id = ? AND status = 'open'", l.id);
  await safe(threadClose(env, l, st === "sold" ? "Sold. Thanks for trading through Club FM." : "The seller took this listing down."));
  return j({ ok: true, listing: pub(Object.assign(l, { status: st, updated: t })) });
}

async function buy(env, me, l, b) {
  const bad = acctOk(me); if (bad) return j({ error: bad }, 403);
  if (String(l.seller_id) === String(me.id)) return j({ error: "That's your own listing." }, 400);
  if (l.status === "pending") return j({ error: l.buyer_id === me.id ? "You're already the buyer on this one. The seller has your message." : "Someone else is buying this right now. You can still make an offer in case it falls through." }, 409);
  if (l.status !== "active") return j({ error: "This listing isn't for sale anymore." }, 409);
  const ign = clean(b.ign || me.ign, 20);
  if (!/^[A-Za-z0-9]{2,12}$/.test(ign)) return j({ error: "Add your in-game name so the seller can find you." }, 400);
  const t = now();
  // only one buyer wins: the update checks the status is still active
  const r = await run(env, "UPDATE market_listings SET status = 'pending', buyer_id = ?, buyer_name = ?, buyer_ign = ?, deal_price = ?, updated = ? WHERE id = ? AND status = 'active'",
    String(me.id), clean(me.name || me.username, 40), ign, l.price, t, l.id);
  if (!r.meta || !r.meta.changes) return j({ error: "Someone else got to it first." }, 409);
  const sent = await dm(env, l.seller_id, "<@" + me.id + "> (in game: **" + ign + "**) wants to **buy it now**: " + label(l) + " for " + meso(l.price) + (l.qty > 1 ? " each" : "") +
    ".\nMessage them on Discord to set up the trade. When it's done, mark it sold: " + listingUrl(l.id)).catch(() => false);
  await safe(threadSay(env, l, "A buyer used Buy it now. The seller has been messaged."));
  return j({ ok: true, dm: !!sent, seller: { id: l.seller_id, name: l.seller_name, ign: l.ign }, thread: l.thread_id ? "https://discord.com/channels/" + GUILD + "/" + l.thread_id : "" });
}

async function offer(env, me, l, b) {
  const bad = acctOk(me); if (bad) return j({ error: bad }, 403);
  if (String(l.seller_id) === String(me.id)) return j({ error: "That's your own listing." }, 400);
  if (!ST_OPEN.includes(l.status)) return j({ error: "This listing isn't for sale anymore." }, 409);
  const p = typeof b.price === "number" ? Math.round(b.price) : parseMesos(b.price);
  if (!(p >= 1) || p > MAX_PRICE) return j({ error: "Enter your offer in mesos, like 12m." }, 400);
  if (p >= l.price && l.status === "active") return j({ error: "That's at or over the asking price. Use Buy it now instead." }, 400);
  const q = b.qty === undefined || b.qty === "" ? l.qty : Number(b.qty);
  if (!Number.isInteger(q) || q < 1 || q > l.qty) return j({ error: "Quantity has to be from 1 to " + l.qty + "." }, 400);
  const ign = clean(b.ign || me.ign, 20);
  if (!/^[A-Za-z0-9]{2,12}$/.test(ign)) return j({ error: "Add your in-game name so the seller can find you." }, 400);
  if (await (async () => { const n = await one(env, "SELECT COUNT(*) AS n FROM market_offers WHERE buyer_id = ? AND created > ?", me.id, now() - 3600); return n && n.n >= 40; })())
    return j({ error: "That's a lot of offers in an hour. Try again a little later." }, 429);
  // one open offer per buyer per listing: a new one replaces the old
  await run(env, "UPDATE market_offers SET status = 'replaced' WHERE listing_id = ? AND buyer_id = ? AND status = 'open'", l.id, String(me.id));
  const o = { id: rid(), listing_id: l.id, buyer_id: String(me.id), buyer_name: clean(me.name || me.username, 40), buyer_ign: ign, price: p, qty: q, created: now(), status: "open" };
  await run(env, "INSERT INTO market_offers (id, listing_id, buyer_id, buyer_name, buyer_ign, price, qty, created, status) VALUES (?,?,?,?,?,?,?,?,?)",
    o.id, o.listing_id, o.buyer_id, o.buyer_name, o.buyer_ign, o.price, o.qty, o.created, o.status);
  const sent = await dm(env, l.seller_id, "<@" + me.id + "> (in game: **" + ign + "**) offered **" + meso(p) + "**" + (q > 1 ? " each for " + q : "") + " on " + label(l) +
    " (you asked " + meso(l.price) + ").\nAccept or decline it here: " + listingUrl(l.id)).catch(() => false);
  return j({ ok: true, dm: !!sent, offer: offPub(o) });
}

async function offerAct(env, me, l, oid, act, owner) {
  const o = await one(env, "SELECT * FROM market_offers WHERE id = ? AND listing_id = ?", oid, l.id);
  if (!o) return j({ error: "That offer doesn't exist." }, 404);
  if (act === "withdraw") {
    if (o.buyer_id !== String(me.id)) return j({ error: "Only the buyer can withdraw this offer." }, 403);
    if (o.status !== "open") return j({ error: "This offer is already " + o.status + "." }, 409);
    await run(env, "UPDATE market_offers SET status = 'withdrawn' WHERE id = ?", oid);
    return j({ ok: true });
  }
  if (!owner) return j({ error: "Only the seller can answer offers." }, 403);
  if (o.status !== "open") return j({ error: "This offer is already " + o.status + "." }, 409);
  if (act === "decline") {
    await run(env, "UPDATE market_offers SET status = 'declined' WHERE id = ?", oid);
    await safe(dm(env, o.buyer_id, "Your offer of " + meso(o.price) + " on " + label(l) + " was declined. It's still listed at " + meso(l.price) + ": " + listingUrl(l.id)));
    return j({ ok: true });
  }
  if (act === "accept") {
    if (l.status !== "active") return j({ error: l.status === "pending" ? "A buyer is already on this one. Release it first to take this offer." : "This listing isn't open." }, 409);
    const t = now();
    const r = await run(env, "UPDATE market_listings SET status = 'pending', buyer_id = ?, buyer_name = ?, buyer_ign = ?, deal_price = ?, updated = ? WHERE id = ? AND status = 'active'",
      o.buyer_id, o.buyer_name, o.buyer_ign, o.price, t, l.id);
    if (!r.meta || !r.meta.changes) return j({ error: "The listing changed. Reload and try again." }, 409);
    await run(env, "UPDATE market_offers SET status = 'accepted' WHERE id = ?", oid);
    await safe(dm(env, o.buyer_id, "Your offer of " + meso(o.price) + " on " + label(l) + " was **accepted**. The seller is <@" + l.seller_id + "> (in game: **" + l.ign + "**). Message them to set up the trade."));
    await safe(threadSay(env, l, "The seller accepted an offer. On hold for that buyer."));
    return j({ ok: true, buyer: { id: o.buyer_id, name: o.buyer_name, ign: o.buyer_ign } });
  }
  return j({ error: "not found" }, 404);
}

// the buyer says whether the trade really happened; only confirmed trades count on anyone's record
async function confirm(env, me, l, b, ctx) {
  if (l.buyer_id !== String(me.id)) return j({ error: "Only the buyer can confirm this trade." }, 403);
  if (l.status !== "sold") return j({ error: "The seller hasn't marked this sold yet." }, 409);
  if (l.confirmed === 1 || l.confirmed === -1) return j({ error: "You already answered for this trade." }, 409);
  const yes = b.ok === true;
  await run(env, "UPDATE market_listings SET confirmed = ? WHERE id = ?", yes ? 1 : -1, l.id);
  TRADES = null;
  if (yes) await safe(dm(env, l.seller_id, "Your buyer confirmed the trade for " + label(l) + ". It's on your Club FM record now."));
  else await safe(ctx.dmAdmins("A buyer says a market trade didn't happen: " + label(l) + " from <@" + l.seller_id + "> (" + (l.ign || "?") + ") to <@" + me.id + ">. " + listingUrl(l.id)));
  return j({ ok: true, confirmed: yes ? 1 : -1 });
}

async function report(env, me, l, b, ctx) {
  if (String(l.seller_id) === String(me.id)) return j({ error: "That's your own listing." }, 400);
  const why = clean(b.why, 300);
  if (why.length < 3) return j({ error: "Say what's wrong with it, in a few words." }, 400);
  if (await one(env, "SELECT id FROM market_reports WHERE listing_id = ? AND reporter_id = ?", l.id, String(me.id))) return j({ error: "You already reported this one. Thanks, we're on it." }, 409);
  const n = await one(env, "SELECT COUNT(*) AS n FROM market_reports WHERE reporter_id = ? AND created > ?", String(me.id), now() - DAY);
  if (n && n.n >= 10) return j({ error: "That's a lot of reports today. Try again tomorrow." }, 429);
  await run(env, "INSERT INTO market_reports (id, listing_id, reporter_id, why, created) VALUES (?,?,?,?,?)", rid(), l.id, String(me.id), why, now());
  await safe(ctx.dmAdmins("Market report from <@" + me.id + "> on " + label(l) + " at " + meso(l.price) + " by <@" + l.seller_id + "> (" + (l.ign || "?") + "):\n> " + why +
    "\nOpen it and tap Take it down if it's bad: " + listingUrl(l.id)));
  return j({ ok: true });
}

// listings that ran their week
async function expire(env) {
  const t = now();
  const gone = await all(env, "SELECT * FROM market_listings WHERE status = 'active' AND expires < ? LIMIT 50", t);
  if (!gone.length) return;
  await run(env, `UPDATE market_listings SET status = 'expired', updated = ?, closed_reason = 'ran a week' WHERE id IN (${gone.map(() => "?").join(",")})`, t, ...gone.map((l) => l.id));
  for (const l of gone) {
    if (l.source === "site") await safe(threadClose(env, l, "This listing ran its week. The seller can renew it on maplefm.gg."));
    await safe(dm(env, l.seller_id, "Your listing " + label(l) + " at " + meso(l.price) + " ran its week and came down. Renew it any time: " + listingUrl(l.id)));
  }
}

// ---------------------------------------------------------------- Discord side
// Discord hiccups never fail a listing change: the site is the record, Discord is the echo
const safe = (p) => Promise.resolve(p).catch(() => {});

const label = (l) => "**" + shown(l.item) + "**" + (l.stats ? " (" + l.stats + ")" : "") + (l.qty > 1 ? " x" + l.qty : "");
function title(l) { return ("WTS " + shown(l.item) + (l.stats ? " (" + l.stats + ")" : "") + (l.qty > 1 ? " x" + l.qty : "") + " · " + meso(l.price) + (l.qty > 1 ? " ea" : "")).slice(0, 100); }
function embed(l) {
  return { title: shown(l.item) + (l.stats ? " (" + l.stats + ")" : ""), url: listingUrl(l.id), color: 0xffb020,
    description: [l.note || "", "Buy it now or make an offer on maplefm.gg. The seller gets a DM."].filter(Boolean).join("\n\n"),
    fields: [{ name: "Price", value: meso(l.price) + (l.qty > 1 ? " each" : ""), inline: true }, { name: "Quantity", value: String(l.qty), inline: true },
      { name: "Seller", value: "<@" + l.seller_id + ">" + (l.ign ? " · " + l.ign : ""), inline: true }],
    footer: { text: "Listed on maplefm.gg · listings never change the board's prices" } };
}

// #selling sorts posts by tag (Weapon, Armor, Accessory, Scroll, Etc, Sold) and requires one: pick by what the item is
let KINDS = null;
async function kindOf(env, item) {
  if (!KINDS) {
    const r = await fetch(env.ITEMDB_URL || SITE_URL + "/data/itemdb.json", { cf: { cacheTtl: 86400, cacheEverything: true } }).catch(() => null);
    const d = r && r.ok ? await r.json().catch(() => null) : null;
    KINDS = {}; if (d && d.items) d.items.forEach((x) => { KINDS[String(x[0]).toLowerCase()] = x[4] ? "Cash" : d.kinds[x[5]] || ""; });
  }
  return KINDS[String(item).toLowerCase()] || "";
}
const WEAPON = /Sword|Axe|Blunt|Dagger|Wand|Staff|Spear|Pole Arm|Bow|Crossbow|Claw/;
export async function tagName(env, item) {
  const k = await kindOf(env, item);
  if (/ Scroll(:|$| \d)/.test(item) || /scroll/i.test(item)) return "Scroll";
  if (/^Equip:/.test(k) && !/Cash/.test(k)) {
    if (WEAPON.test(k)) return "Weapon";
    if (/Accessory|Eye|Earrings|Ring|Pendant|Face$/.test(k)) return "Accessory";
    return "Armor";
  }
  return "Etc";
}
let FORUM = null;
async function forumTags(env, item, sold) {
  if (!FORUM || Date.now() - FORUM.at > 3600e3) {
    const c = await (await fetch(api(env) + "/channels/" + SELL_FORUM, { headers: H(env) })).json().catch(() => null);
    FORUM = { at: Date.now(), tags: c && Array.isArray(c.available_tags) ? c.available_tags : [] };
  }
  const want = sold ? "Sold" : await tagName(env, item);
  const t = FORUM.tags.find((x) => x.name.toLowerCase() === want.toLowerCase()) || FORUM.tags.find((x) => /^etc/i.test(x.name)) || FORUM.tags.find((x) => !/sold/i.test(x.name));
  return t ? [t.id] : [];
}
async function threadOpen(env, l) {
  if (!env.DISCORD_BOT_TOKEN) return null;
  const body = { name: title(l), message: { content: "", embeds: [embed(l)], allowed_mentions: { parse: [] } }, applied_tags: await forumTags(env, l.item, false) };
  const r = await fetch(api(env) + "/channels/" + SELL_FORUM + "/threads", { method: "POST", headers: H(env), body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("forum post " + r.status + " " + (d.message || ""));
  return { id: d.id, name: d.name };
}
async function threadEdit(env, l, note) {
  if (!env.DISCORD_BOT_TOKEN || !l.thread_id) return;
  if (l.source === "site") {
    // the bot wrote the post, so it can rewrite it
    await fetch(api(env) + "/channels/" + l.thread_id, { method: "PATCH", headers: H(env), body: JSON.stringify({ name: title(l) }) });
    await fetch(api(env) + "/channels/" + l.thread_id + "/messages/" + l.thread_id, { method: "PATCH", headers: H(env), body: JSON.stringify({ embeds: [embed(l)] }) });
    await run(env, "UPDATE market_listings SET title = ? WHERE id = ?", title(l), l.id);
  }
  await threadSay(env, l, note);
}
async function threadSay(env, l, msg) {
  if (!env.DISCORD_BOT_TOKEN || !l.thread_id || !msg) return;
  await fetch(api(env) + "/channels/" + l.thread_id + "/messages", { method: "POST", headers: H(env), body: JSON.stringify({ content: msg, allowed_mentions: { parse: [] } }) });
}
async function threadClose(env, l, msg) {
  if (!env.DISCORD_BOT_TOKEN || !l.thread_id) return;
  await threadSay(env, l, msg);
  // a sale gets the Sold tag first: tags can't change once the post is archived
  if (/^Sold/.test(msg)) await fetch(api(env) + "/channels/" + l.thread_id, { method: "PATCH", headers: H(env), body: JSON.stringify({ applied_tags: await forumTags(env, l.item, true) }) });
  await fetch(api(env) + "/channels/" + l.thread_id, { method: "PATCH", headers: H(env), body: JSON.stringify(l.source === "site" ? { archived: true, locked: true } : { archived: true }) });
}
async function dm(env, id, content) {
  if (!env.DISCORD_BOT_TOKEN || !id) return false;
  const c = await (await fetch(api(env) + "/users/@me/channels", { method: "POST", headers: H(env), body: JSON.stringify({ recipient_id: String(id) }) })).json().catch(() => null);
  if (!c || !c.id) return false;
  const r = await fetch(api(env) + "/channels/" + c.id + "/messages", { method: "POST", headers: H(env), body: JSON.stringify({ content, allowed_mentions: { users: [String(id)] } }) });
  return r.ok;
}

// ---------------------------------------------------------------- posts made straight in #selling
// A post like "WTS Work Gloves 5 att 15m" becomes a site listing for the poster. Posts the bot made itself are
// skipped, and a post that names several prices or no item we know is left alone.
const NOISE = /\b(wts|wtb|selling|sell|s>|fs|for sale|obo|ono|neg|negotiable|c\/o|co|bo|b\/o|offers?|pm|dm|me|price|each|ea|per|pc|pcs|lf|cheap|clean|or best)\b/gi;
export function parseSale(text, rows, abbr, findRows, splitRoll) {
  let t = String(text || "").replace(/\b(?:ign|in game)\s*[:\-]?\s*[A-Za-z0-9]{2,12}\b/gi, " ").replace(/[\[\](){}|•·,;!?*_~]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return { why: "empty" };
  const P = /(?:^|\s)@?\s*(\d+(?:\.\d+)?)\s*(k|m|mil|mill|million|b|bil|billion)\b/gi;
  const prices = [...t.matchAll(P)];
  if (!prices.length) return { why: "no price" };
  if (prices.length > 1) return { why: "several prices" };
  const price = parseMesos(prices[0][1] + prices[0][2]);
  t = t.replace(prices[0][0], " ");
  let qty = 1;
  const qm = /(?:^|\s)(?:x\s?(\d{1,4})|(\d{1,4})\s?x|(\d{1,4})\s?(?:pcs|pc|ea))(?=\s|$)/i.exec(t);
  if (qm) { qty = Number(qm[1] || qm[2] || qm[3]); t = t.replace(qm[0], " "); }
  t = t.replace(/@/g, " ").replace(NOISE, " ").replace(/\s+/g, " ").trim();
  const sr = splitRoll(t); t = sr.q;
  if (t.length < 3) return { why: "no item" };
  const hits = findRows(rows, t, abbr);
  if (!hits.length) return { why: "unknown item" };
  return { item: hits[0].item, price, qty: Math.max(1, Math.min(9999, qty)), stats: sr.roll ? "+" + sr.roll : "" };
}

async function botId(env) {
  let id = await env.ACCOUNTS.get("bot:id");
  if (id) return id;
  const u = await (await fetch(api(env) + "/users/@me", { headers: H(env) })).json().catch(() => null);
  if (u && u.id) { id = u.id; await env.ACCOUNTS.put("bot:id", id); }
  return id || "";
}

export async function marketSync(env, ctx) {
  if (!env.DISCORD_BOT_TOKEN) return { skipped: "no bot" };
  await ensure(env);
  await expire(env);
  const r = await fetch(api(env) + "/guilds/" + GUILD + "/threads/active", { headers: H(env) });
  if (!r.ok) return { error: "threads " + r.status };
  const d = await r.json().catch(() => ({}));
  const threads = (d.threads || []).filter((x) => x.parent_id === SELL_FORUM);
  const me = await botId(env);
  const live = new Set(threads.map((x) => x.id));
  const known = new Map((await all(env, "SELECT id, thread_id, status, source, title, price, seller_id FROM market_listings WHERE thread_id IS NOT NULL AND created > ?", now() - 60 * DAY)).map((l) => [l.thread_id, l]));
  const seen = new Set((await all(env, "SELECT thread_id FROM market_seen WHERE at > ?", now() - 60 * DAY)).map((x) => x.thread_id));
  const out = { threads: threads.length, imported: 0, skipped: 0, closed: 0, repriced: 0 };
  let rows = null, abbr = null, budget = 10;
  for (const th of threads) {
    if (th.owner_id === me) continue;
    const k = known.get(th.id);
    if (k) {
      // the poster retitled it with a new price
      if (k.source === "discord" && ST_OPEN.includes(k.status) && th.name !== k.title) {
        rows = rows || await ctx.rows(); abbr = abbr || await ctx.abbr();
        const ps = parseSale(th.name, rows, abbr, ctx.findRows, ctx.splitRoll);
        if (ps.price && ps.price !== k.price) { await run(env, "UPDATE market_listings SET price = ?, title = ?, updated = ? WHERE id = ?", ps.price, th.name, now(), k.id); out.repriced++; }
        else await run(env, "UPDATE market_listings SET title = ? WHERE id = ?", th.name, k.id);
      }
      continue;
    }
    if (seen.has(th.id) || budget-- <= 0) continue;
    rows = rows || await ctx.rows(); abbr = abbr || await ctx.abbr();
    let body = "";
    const msg = await (await fetch(api(env) + "/channels/" + th.id + "/messages/" + th.id, { headers: H(env) })).json().catch(() => null);
    if (msg && typeof msg.content === "string") body = msg.content;
    let ps = parseSale(th.name, rows, abbr, ctx.findRows, ctx.splitRoll);
    // a vague title ("selling stuff") with the item in the first line of the post
    for (const alt of body ? [body.split("\n")[0], th.name + " " + body.split("\n")[0]] : []) { if (ps.item) break; const p2 = parseSale(alt, rows, abbr, ctx.findRows, ctx.splitRoll); if (p2.item) ps = p2; }
    const why = ps.item ? await importOne(env, th, ps, body) : ps.why;
    await run(env, "INSERT OR REPLACE INTO market_seen (thread_id, at, why) VALUES (?,?,?)", th.id, now(), why || "listed");
    if (why) out.skipped++; else out.imported++;
  }
  // Discord posts that were closed or deleted take their listing down
  for (const [tid, k] of known) {
    if (k.source !== "discord" || !ST_OPEN.includes(k.status) || live.has(tid)) continue;
    await run(env, "UPDATE market_listings SET status = 'cancelled', updated = ?, closed_reason = 'post closed on Discord' WHERE id = ?", now(), k.id);
    await run(env, "UPDATE market_offers SET status = 'closed' WHERE listing_id = ? AND status = 'open'", k.id);
    out.closed++;
  }
  out.deals = await dealAlerts(env, ctx).catch((e) => "error " + (e && e.message || e));
  await env.ACCOUNTS.put("mk:sync", JSON.stringify({ at: now(), out })).catch(() => {});
  return out;
}

// ---------------------------------------------------------------- deal alerts
// A member listing 20% or more under the board's typical goes to #mega-deals right away, and to everyone who stars
// that item on the board. Equips listed with stats aren't compared: their typical is for a clean one.
const DEAL_CUT = 0.8;
async function channelByName(env, name) {
  const k = "ch:" + name; let id = await env.ACCOUNTS.get(k);
  if (id) return id === "-" ? "" : id;
  const cs = await (await fetch(api(env) + "/guilds/" + GUILD + "/channels", { headers: H(env) })).json().catch(() => null);
  const c = Array.isArray(cs) ? cs.find((x) => x.name === name) : null;
  id = c ? c.id : "";
  await env.ACCOUNTS.put(k, id || "-", { expirationTtl: id ? 7 * DAY : 3600 });
  return id;
}
export async function dealAlerts(env, ctx) {
  const cand = await all(env, "SELECT * FROM market_listings WHERE status = 'active' AND deal_sent IS NULL AND updated > ? LIMIT 30", now() - DAY);
  if (!cand.length) return 0;
  const rows = await ctx.rows(), by = {}; rows.forEach((r) => { by[r.item] = r; });
  const deals = [];
  for (const l of cand) {
    const r = by[l.item];
    const isDeal = r && r.typ && !l.stats && l.price <= r.typ * DEAL_CUT;
    await run(env, "UPDATE market_listings SET deal_sent = ? WHERE id = ?", isDeal ? 1 : 0, l.id);
    if (isDeal) deals.push(Object.assign({}, l, { typ: r.typ, off: 1 - l.price / r.typ }));
  }
  if (!deals.length) return 0;
  const ch = await channelByName(env, env.MEGA_CHANNEL || "mega-deals");
  for (const d of deals) {
    const emb = { title: "Member listing: " + shown(d.item) + (d.qty > 1 ? " x" + d.qty : ""), url: listingUrl(d.id), color: 0x2ecc71,
      description: "**" + meso(d.price) + "**" + (d.qty > 1 ? " each" : "") + " · " + Math.round(d.off * 100) + "% under typical " + meso(d.typ) +
        "\nListed on maplefm.gg by " + (d.ign || d.seller_name || "a member") + ". Buy it now or make an offer there; the seller gets a DM.",
      footer: { text: "Member listings never change the board's prices" } };
    if (ch) await safe(fetch(api(env) + "/channels/" + ch + "/messages", { method: "POST", headers: H(env), body: JSON.stringify({ embeds: [emb] }) }));
  }
  // everyone who stars one of these items on the board, except the seller
  const names = new Set(deals.map((d) => d.item.toLowerCase()));
  let cursor, dms = 0;
  do {
    const page = await env.ACCOUNTS.list({ prefix: "settings:", cursor });
    for (const k of page.keys) {
      const id = k.name.slice(9);
      const st = await env.ACCOUNTS.get(k.name, "json");
      let watch = {}; try { watch = JSON.parse((st && st.settings && st.settings["fm-watch"]) || "{}"); } catch (e) {}
      const mine = Object.keys(watch || {}).map((n) => n.toLowerCase()).filter((n) => names.has(n));
      if (!mine.length) continue;
      for (const d of deals) {
        if (d.seller_id === id || !mine.includes(d.item.toLowerCase())) continue;
        const key = "mkdm:" + id + ":" + d.id;
        if (await env.ACCOUNTS.get(key)) continue;
        await env.ACCOUNTS.put(key, "1", { expirationTtl: 7 * DAY });
        if (await dm(env, id, "Watchlist deal from a member: **" + shown(d.item) + "** for **" + meso(d.price) + "**" + (d.qty > 1 ? " each" : "") + ", " + Math.round(d.off * 100) + "% under typical. " + listingUrl(d.id))) dms++;
      }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return { posted: deals.length, dms, channel: ch ? "ok" : "not found" };
}

// ---------------------------------------------------------------- shops, as the scanners saw them
// Every shop the FM Watchers walked past, by owner: what it held on the last visit, for how much, in which FM room and
// channel. Built when the pump uploads the board, kept in KV, read by the shop page and by "Seen in game".
const STATN = { WDEF: "W.DEF", MDEF: "M.DEF", MATT: "MATT", ATT: "ATT", ACC: "ACC", AVOID: "AVOID", SPEED: "SPEED", JUMP: "JUMP", HP: "HP", MP: "MP", STR: "STR", DEX: "DEX", INT: "INT", LUK: "LUK" };
export function statText(x) {
  if (!x || typeof x !== "object") return "";
  const out = [];
  Object.keys(STATN).forEach((k) => { if (typeof x[k] === "number" && typeof x[k + "_b"] === "number" && x[k] !== x[k + "_b"]) { const d = x[k] - x[k + "_b"]; out.push((d > 0 ? "+" : "") + d + " " + STATN[k]); } });
  if (typeof x.SLOTS === "number" && typeof x.SLOTS_b === "number" && x.SLOTS !== x.SLOTS_b) out.push(x.SLOTS + " slots");
  return out.join(", ");
}
// shops only open in Free Market rooms: a minimap title read as something else ("Khe 2 tated") keeps its number
function fmRoom(r) {
  if (!r || /^FM(\d{1,2}| Entrance)?$/.test(r) || r === "chat") return r;
  if (/entr/i.test(r) && /mark/i.test(r)) return "FM Entrance";
  const m = /<\s*(\d{1,2})/.exec(r) || null, lone = String(r).match(/(^|\D)(\d{1,2})(?!\d)/g) || [];
  const n = m ? +m[1] : lone.length === 1 ? +lone[0].replace(/\D/g, "") : 0;
  return n >= 1 && n <= 40 ? "FM" + n : "FM";
}
export function shopIndex(snap) {
  const c = snap.cols, w = snap.words, T = snap.T || snap.at, by = {};
  if (!c || !c.i || !c.s) return by;
  const word = (k, i) => (c[k] && c[k][i] && w[k] ? w[k][c[k][i] - 1] : "");
  const cut = Date.now() / 1000 - SEEN_FOR;
  for (let i = 0; i < snap.n; i++) {
    const item = word("i", i), sel = word("s", i), st = word("st", i);
    if (!item || !sel || st === "gone" || /\u2026$/.test(item)) continue;
    const t = Math.floor((T - (c.t ? c.t[i] || 0 : 0) * 1000) / 1000);
    if (t < cut) continue;
    const k = sel.toLowerCase(), s0 = by[k] || (by[k] = { name: sel, t: 0, room: "", ch: 0, rows: [] });
    const x = c.x ? c.x[i] : 0;
    s0.rows.push([item, (c.u && c.u[i]) || (c.p && c.p[i]) || 0, (c.q && c.q[i]) || 1, statText(x), t]);
    if (t > s0.t) { s0.t = t; s0.room = fmRoom(word("r", i)) || s0.room; s0.ch = (c.c && c.c[i]) || s0.ch; }
  }
  // what the shop held on its latest visit: rows within two hours of the newest, one per item, stats and price
  Object.keys(by).forEach((k) => {
    const s0 = by[k], seen = new Set();
    s0.rows = s0.rows.filter((r) => s0.t - r[4] <= 7200).sort((a, b) => b[4] - a[4]).filter((r) => { const key = r[0] + "|" + r[1] + "|" + r[3]; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 40);
  });
  return by;
}
let SHOPS = null;
async function shops(env) {
  if (SHOPS && Date.now() - SHOPS.at < 60e3) return SHOPS.by;
  const by = (await env.ACCOUNTS.get("snap:shops", "json")) || {};
  SHOPS = { at: Date.now(), by };
  return by;
}
export async function shopGet(env, url) {
  const ign = String(url.searchParams.get("ign") || "").trim().toLowerCase();
  const by = await shops(env);
  const hdr = { "Content-Type": "application/json", "Cache-Control": "public, max-age=30" };
  if (url.searchParams.get("q") != null) {
    const q = String(url.searchParams.get("q")).trim().toLowerCase();
    const names = q.length < 2 ? [] : Object.keys(by).filter((k) => k.startsWith(q)).sort((a, b) => by[b].t - by[a].t).slice(0, 12).map((k) => ({ name: by[k].name, t: by[k].t, n: by[k].rows.length }));
    return new Response(JSON.stringify({ shops: names, total: Object.keys(by).length }), { headers: hdr });
  }
  if (!/^[a-z0-9]{2,12}$/.test(ign)) return new Response(JSON.stringify({ error: "Enter an in-game name." }), { status: 400, headers: hdr });
  const s0 = by[ign];
  if (!s0) return new Response(JSON.stringify({ found: false, ign }), { headers: hdr });
  return new Response(JSON.stringify({ found: true, name: s0.name, t: s0.t, room: s0.room, ch: s0.ch, rows: s0.rows.map((r) => ({ item: r[0], price: r[1], qty: r[2], stats: r[3], t: r[4] })) }), { headers: hdr });
}

// ---------------------------------------------------------------- seen in game
// An open listing whose seller's shop (by in-game name) showed the same item in the last 3 days is marked
// "Seen in game": a scanner saw that shop really holding it.
export async function snapShops(env, snap) {
  const by = shopIndex(snap);
  await env.ACCOUNTS.put("snap:shops", JSON.stringify(by));
  SHOPS = { at: Date.now(), by };
  return marketSeen(env, by);
}
export async function marketSeen(env, by) {
  await ensure(env);
  const open = await all(env, "SELECT id, item, ign FROM market_listings WHERE status IN ('active','pending') AND ign != ''");
  let n = 0;
  for (const l of open) {
    const s0 = by[String(l.ign).toLowerCase()]; if (!s0) continue;
    const r = s0.rows.filter((x) => x[0].toLowerCase() === l.item.toLowerCase()).sort((a, b) => b[4] - a[4])[0];
    if (!r) continue;
    await run(env, "UPDATE market_listings SET seen_at = ?, seen_price = ? WHERE id = ?", r[4], r[1], l.id); n++;
  }
  return n;
}

// ---------------------------------------------------------------- share links
// api.maplefm.gg/l/<id>: a page with the listing's own preview for Discord, Reddit and texts, then on to the listing
export async function marketShare(env, id) {
  await ensure(env);
  const l = /^[0-9a-f]{10}$/.test(id) ? await one(env, "SELECT * FROM market_listings WHERE id = ?", id) : null;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const to = l && l.status !== "deleted" ? listingUrl(l.id) : SITE_URL + "/market.html";
  let title = "Player market · Club FM", desc = "Items Club FM members are selling for mesos.", img = SITE_URL + "/og.png", card = "summary_large_image";
  if (l && l.status !== "deleted") {
    title = shown(l.item) + (l.stats ? " (" + l.stats + ")" : "") + " · " + meso(l.price) + (l.qty > 1 ? " each" : "") + " on Club FM";
    desc = (l.status === "active" ? "For sale" : l.status === "pending" ? "On hold for a buyer" : l.status === "sold" ? "Sold" : "No longer listed") + " by " + (l.ign || l.seller_name || "a member") +
      (l.qty > 1 ? " · " + l.qty + " available" : "") + ". Buy it now or make an offer; the seller gets a Discord DM." + (l.note ? " " + l.note : "");
    const k = await kindId(env, l.item);
    if (k) { img = "https://maplestory.io/api/MCW/1/item/" + k + "/icon"; card = "summary"; }
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(to)}"><meta property="og:site_name" content="Club FM"><meta name="twitter:card" content="${card}"><meta name="theme-color" content="#6d3fd1">
<meta http-equiv="refresh" content="0;url=${esc(to)}"><link rel="canonical" href="${esc(to)}"></head><body><a href="${esc(to)}">Open the listing on maplefm.gg</a></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=120" } });
}
let IDS = null;
async function kindId(env, item) {
  if (!IDS) {
    const r = await fetch(env.ITEMDB_URL || SITE_URL + "/data/itemdb.json", { cf: { cacheTtl: 86400, cacheEverything: true } }).catch(() => null);
    const d = r && r.ok ? await r.json().catch(() => null) : null;
    IDS = {}; if (d && d.items) d.items.forEach((x) => { IDS[String(x[0]).toLowerCase()] = x[1]; });
  }
  return IDS[String(item).toLowerCase()] || 0;
}

// ---------------------------------------------------------------- weekly numbers, for the recap and the watchdog
export async function marketStats(env, days) {
  await ensure(env);
  const since = now() - Math.max(1, Math.min(31, days || 7)) * DAY;
  const n = await one(env, "SELECT SUM(created > ?) AS listed, SUM(status = 'sold' AND sold_at > ?) AS sold, SUM(confirmed = 1 AND sold_at > ?) AS confirmed, SUM(status IN ('active','pending')) AS open, SUM(source = 'discord' AND created > ?) AS fromDiscord, COUNT(DISTINCT CASE WHEN created > ? THEN seller_id END) AS sellers FROM market_listings", since, since, since, since, since);
  const rows = await mkRowsFrom(env);
  const by = {}; rows.forEach((r) => { by[r.item] = r; });
  const open = await all(env, "SELECT id, item, price, qty, stats, ign FROM market_listings WHERE status = 'active' AND created > ?", since);
  const best = open.map((l) => { const r = by[l.item]; return r && r.typ && !l.stats ? { item: shown(l.item), price: l.price, typ: r.typ, off: 1 - l.price / r.typ, url: listingUrl(l.id) } : null; })
    .filter((x) => x && x.off >= 0.1).sort((a, b) => b.off - a.off).slice(0, 5);
  const sync = (await env.ACCOUNTS.get("mk:sync", "json")) || null;
  return { days: days || 7, listed: n.listed || 0, sold: n.sold || 0, confirmed: n.confirmed || 0, open: n.open || 0, fromDiscord: n.fromDiscord || 0, sellers: n.sellers || 0, best, sync };
}
let ROWS_FN = null;
export function setRows(fn) { ROWS_FN = fn; }
const mkRowsFrom = async (env) => (ROWS_FN ? await ROWS_FN(env) : []);

async function importOne(env, th, ps, body) {
  const uid = th.owner_id;
  if (!uid) return "no owner";
  const born = Number((BigInt(uid) >> 22n) + 1420070400000n) / 1000 | 0;
  if (now() - born < MIN_AGE) return "new account";
  const acct = (await env.ACCOUNTS.get("acct:" + uid, "json")) || {};
  if (acct.locked) return "locked";
  let name = acct.name || acct.username || "", avatar = acct.avatar || "";
  if (!name) {
    const m = await (await fetch(api(env) + "/guilds/" + GUILD + "/members/" + uid, { headers: H(env) })).json().catch(() => null);
    if (m && m.user) { name = m.nick || m.user.global_name || m.user.username || ""; if (m.user.avatar) avatar = "https://cdn.discordapp.com/avatars/" + uid + "/" + m.user.avatar + ".png?size=64"; }
  }
  const ignM = /\b(?:ign|in game|igName)\s*[:\-]?\s*([A-Za-z0-9]{2,12})\b/i.exec(body || "");
  const t = now(), id = rid();
  const l = { id, seller_id: String(uid), seller_name: clean(name, 40), seller_avatar: avatar, ign: ignM ? ignM[1] : clean(acct.ign, 20), item: ps.item, qty: ps.qty, price: ps.price,
    stats: ps.stats || "", note: clean((body || "").split("\n").slice(0, 3).join(" "), 200), created: t, updated: t, expires: t + LIFE, status: "active", source: "discord", thread_id: th.id, title: th.name };
  await run(env, `INSERT INTO market_listings (id, seller_id, seller_name, seller_avatar, ign, item, qty, price, stats, note, created, updated, expires, status, source, thread_id, title)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, l.id, l.seller_id, l.seller_name, l.seller_avatar, l.ign, l.item, l.qty, l.price, l.stats, l.note, l.created, l.updated, l.expires, l.status, l.source, l.thread_id, l.title);
  await threadSay(env, l, "Listed on maplefm.gg as " + shown(l.item) + (l.stats ? " (" + l.stats + ")" : "") + " at " + meso(l.price) + (l.qty > 1 ? " each" : "") +
    ": " + listingUrl(id) + "\nBuyers there can buy it now or make an offer, and you'll get a DM. Sign in on the site with this Discord account to change the price or take it down.");
  return "";
}

// for Adam: is the forum set up the way the bot needs it
export async function marketCheck(env) {
  await ensure(env);
  const c = await (await fetch(api(env) + "/channels/" + SELL_FORUM, { headers: H(env) })).json().catch((e) => ({ error: String(e) }));
  const n = await one(env, "SELECT COUNT(*) AS n, SUM(status IN ('active','pending')) AS open, SUM(source = 'discord') AS fromDiscord, SUM(dsc_err IS NOT NULL) AS errs FROM market_listings");
  const errs = await all(env, "SELECT id, dsc_err FROM market_listings WHERE dsc_err IS NOT NULL ORDER BY created DESC LIMIT 5");
  return { forum: { name: c.name, type: c.type, flags: c.flags, tags: (c.available_tags || []).map((t) => t.name), error: c.message || c.error || "" }, bot: await botId(env), listings: n, errs };
}

// ---------------------------------------------------------------- /sell and /market in Discord
// ctx here: { rows: [item rows], findRows, abbr, overLimit, isAdmin }
export async function marketCommand(env, it, ctx) {
  await ensure(env);
  const u = (it.member && it.member.user) || it.user || {};
  const opts = {}; ((it.data && it.data.options) || []).forEach((o) => { opts[o.name] = o.value; });
  const say = (content, pub) => ({ type: 4, data: Object.assign({ content: String(content).slice(0, 1900), allowed_mentions: { parse: [] } }, pub ? {} : { flags: 64 }) });
  if (it.data.name === "market") {
    let item = "";
    if (opts.item) { const ex = ctx.rows.find((r) => r.item === opts.item); item = ex ? ex.item : ((ctx.findRows(ctx.rows, String(opts.item), ctx.abbr)[0] || {}).item || ""); }
    const ls = item
      ? await all(env, "SELECT * FROM market_listings WHERE status = 'active' AND item = ? ORDER BY price ASC LIMIT 8", item)
      : await all(env, "SELECT * FROM market_listings WHERE status = 'active' ORDER BY created DESC LIMIT 8");
    if (!ls.length) return say(item ? "Nobody has **" + shown(item) + "** listed right now. Have one? `/sell` it, or list it at " + SITE_URL + "/market.html#new=" + encodeURIComponent(item) : "Nothing listed right now. Be the first: `/sell`", true);
    const T = await trades(env), by = {}; ctx.rows.forEach((r) => { by[r.item] = r; });
    const lines = ls.map((l) => { const r = by[l.item], off = r && r.typ && !l.stats ? Math.round((1 - l.price / r.typ) * 100) : null;
      return "**" + meso(l.price) + "**" + (l.qty > 1 ? " ea x" + l.qty : "") + " · " + (item ? "" : shown(l.item) + " · ") + (l.stats ? l.stats + " · " : "") + (l.ign || l.seller_name) +
        (T[l.seller_id] ? " (" + T[l.seller_id] + " trades)" : "") + (off != null && off >= 5 ? " · " + off + "% under typical" : "") + " · [view](" + listingUrl(l.id) + ")"; });
    return { type: 4, data: { embeds: [{ title: item ? shown(item) + " for sale by members" : "Newest member listings", url: SITE_URL + "/market.html" + (item ? "#q=" + encodeURIComponent(shown(item)) : ""), color: 0xffb020,
      description: lines.join("\n"), footer: { text: "Buy it now or offer on maplefm.gg · the seller gets a DM" } }], allowed_mentions: { parse: [] } } };
  }
  if (it.data.name === "sell") {
    if (!u.id) return say("Couldn't tell who you are. Try again.");
    const acct = (await env.ACCOUNTS.get("acct:" + u.id, "json")) || {};
    const me = Object.assign({ id: u.id, name: u.global_name || u.username || "", username: u.username || "", ign: "", discordCreated: Number((BigInt(u.id) >> 22n) + 1420070400000n) / 1000 | 0,
      avatar: u.avatar ? "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + ".png?size=64" : "" }, acct, { id: String(u.id) });
    let item = String(opts.item || "");
    const ex = ctx.rows.find((r) => r.item === item);
    if (!ex) { const h = ctx.findRows(ctx.rows, item, ctx.abbr)[0]; if (h) item = h.item; }
    const r = await create(env, me, { item, price: opts.price, qty: opts.qty, stats: opts.stats, note: opts.note, ign: opts.ign }, ctx);
    const d = await r.json();
    if (!d.ok) return say(d.error + (d.id ? " " + listingUrl(d.id) : ""));
    return say("Listed **" + shown(d.listing.item) + "**" + (d.listing.stats ? " (" + d.listing.stats + ")" : "") + " at **" + meso(d.listing.price) + "**" + (d.listing.qty > 1 ? " each x" + d.listing.qty : "") +
      ". It's up on maplefm.gg and in #selling, and you'll get a DM when someone buys or offers.\nChange the price or take it down here: " + d.listing.url);
  }
  return say("Unknown command");
}
