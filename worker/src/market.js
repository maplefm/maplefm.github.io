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
  ]);
  READY = true;
}
const one = async (env, sql, ...b) => env.INBOX_DB.prepare(sql).bind(...b).first();
const all = async (env, sql, ...b) => ((await env.INBOX_DB.prepare(sql).bind(...b).all()).results || []);
const run = async (env, sql, ...b) => env.INBOX_DB.prepare(sql).bind(...b).run();

// what anyone may see of a listing
function pub(l) {
  return { id: l.id, item: l.item, qty: l.qty, price: l.price, stats: l.stats || "", note: l.note || "", ign: l.ign || "",
    seller: { id: l.seller_id, name: l.seller_name || "", avatar: l.seller_avatar || "" }, created: l.created, updated: l.updated, expires: l.expires,
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
    return j({ signedIn: true, me: { id: me.id, name: me.name || me.username || "", ign: me.ign || "", ok: acctOk(me) === "" , why: acctOk(me) },
      listings: ls.map((l) => Object.assign(pub(l), { buyer: l.buyer_id ? { id: l.buyer_id, name: l.buyer_name, ign: l.buyer_ign } : null, dealPrice: l.deal_price || 0, closed: l.closed_reason || "", offers: offs.filter((o) => o.listing_id === l.id).map(offPub) })),
      offers: made.map((o) => Object.assign(offPub(o), { item: o.item })) });
  }
  const item = url.searchParams.get("item");
  const ls = item
    ? await all(env, "SELECT * FROM market_listings WHERE status IN ('active','pending') AND item = ? ORDER BY price ASC LIMIT 200", item)
    : await all(env, "SELECT * FROM market_listings WHERE status IN ('active','pending') ORDER BY created DESC LIMIT 2000");
  return new Response(JSON.stringify({ at: now(), listings: ls.map(pub) }), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=15" } });
}
const offPub = (o) => ({ id: o.id, listing: o.listing_id, price: o.price, qty: o.qty, created: o.created, status: o.status, buyer: { id: o.buyer_id, name: o.buyer_name, ign: o.buyer_ign } });

async function marketOne(req, env, id, ctx) {
  await expire(env);
  const l = await one(env, "SELECT * FROM market_listings WHERE id = ?", id);
  if (!l || l.status === "deleted") return j({ error: "That listing doesn't exist anymore." }, 404);
  const me = await ctx.whoami(req, env);
  const out = pub(l);
  if (me && String(me.id) === String(l.seller_id)) {
    out.mine = true;
    out.offers = (await all(env, "SELECT * FROM market_offers WHERE listing_id = ? AND status = 'open' ORDER BY price DESC", id)).map(offPub);
    out.buyer = l.buyer_id ? { id: l.buyer_id, name: l.buyer_name, ign: l.buyer_ign } : null;
    out.dealPrice = l.deal_price || 0;
  } else if (me) {
    out.myOffers = (await all(env, "SELECT * FROM market_offers WHERE listing_id = ? AND buyer_id = ? ORDER BY created DESC", id, me.id)).map(offPub);
    out.iAmBuyer = l.buyer_id === me.id;
  }
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
  await run(env, "UPDATE market_listings SET status = ?, updated = ?, closed_reason = ? WHERE id = ?", st, t, (st === "sold" ? "sold" : "cancelled by " + who), l.id);
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

async function forumTag(env) {
  const c = await (await fetch(api(env) + "/channels/" + SELL_FORUM, { headers: H(env) })).json().catch(() => null);
  if (!c || !Array.isArray(c.available_tags) || !c.available_tags.length) return [];
  const t = c.available_tags.find((x) => /sell|wts|sale/i.test(x.name)) || ((c.flags & 16) ? c.available_tags[0] : null);
  return t ? [t.id] : [];
}
async function threadOpen(env, l) {
  if (!env.DISCORD_BOT_TOKEN) return null;
  const body = { name: title(l), message: { content: "", embeds: [embed(l)], allowed_mentions: { parse: [] } }, applied_tags: await forumTag(env) };
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
  return out;
}

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
