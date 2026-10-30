// ---------------------------------------------------------------- stat alerts
// Mega Deals holders (the same hasMega check the watchlist DMs use: Club, 50,000+ sales caught, Ko-fi $100+) save
// alerts like "Work Gloves with 3+ ATT under 2M". Every board upload (/snap) is checked for new listings whose stats
// were read with full confidence (the board's own x, never a set-aside read) and a match gets a Discord DM from the
// Club FM bot. Only exact reads (x._ok: every line read pixel for pixel and checked against the item) can match. 25 alerts per account, one DM per listing, 20 DMs a day. Losing access pauses alerts, nothing is
// deleted. Someone without access can never save one or be sent one.
export const ALERT_MAX = 25, ALERT_DM_DAY = 20;
export const ALERT_STATS = ["ATT", "MATT", "STR", "DEX", "INT", "LUK", "HP", "MP", "WDEF", "MDEF", "ACC", "AVOID", "SPEED", "JUMP", "CRIT", "CRITDMG"];
const FRESH_S = 30 * 60;           // only listings seen in the last 30 minutes can trigger
const DAY = 86400;

// one alert, cleaned: {id, item, stats: [{k, min, rel}], clean, used, max, on}
export function cleanAlert(a) {
  if (!a || typeof a !== "object") return null;
  const item = String(a.item || "").replace(/[^\x20-\x7e]/g, "").trim().slice(0, 80);
  if (item.length < 2) return null;
  const stats = (Array.isArray(a.stats) ? a.stats : []).slice(0, 4).map((s) => ({
    k: ALERT_STATS.includes(String(s && s.k)) ? String(s.k) : "", min: Math.max(-50, Math.min(500, Math.round(Number(s && s.min) || 0))), rel: !!(s && s.rel),
  })).filter((s) => s.k);
  const used = a.used == null || a.used === "" ? null : Math.max(0, Math.min(20, Math.round(Number(a.used))));
  const max = Math.max(0, Math.min(1e11, Math.round(Number(a.max) || 0)));
  if (!stats.length && !a.clean && used == null && !max) return null;   // an alert needs at least one condition
  const id = /^[a-z0-9]{6,12}$/.test(String(a.id || "")) ? String(a.id) : Math.random().toString(36).slice(2, 10);
  return { id, item, stats, clean: !!a.clean, used, max, on: a.on !== false };
}

// slots used, from the read upgrades left and the item's clean slot count
function slotsUsed(x, base) {
  if (!x || x.SLOTS == null || !base || base.SLOTS == null) return null;
  const u = base.SLOTS - x.SLOTS;
  return u >= 0 && u <= base.SLOTS ? u : null;
}
// does a read listing meet an alert? x: the board's trusted stats; base: the item's clean stats from the item list
export function matches(al, row, base) {
  if (al.item.toLowerCase() !== String(row.item).toLowerCase()) return false;
  const x = row.x; if (!x || typeof x !== "object") return false;
  if (al.max && !(row.u > 0 && row.u <= al.max)) return false;
  for (const s of al.stats) {
    const v = x[s.k]; if (typeof v !== "number") return false;
    if (s.rel) { const b = base && base[s.k] != null ? base[s.k] : x[s.k + "_b"]; if (typeof b !== "number" || v - b < s.min) return false; }
    else if (v < s.min) return false;
  }
  if (al.clean || al.used != null) {
    const u = slotsUsed(x, base); if (u == null) return false;          // can't tell how it was scrolled: no match, never a guess
    if (al.clean && u !== 0) return false;
    if (al.used != null && u > al.used) return false;
  }
  return true;
}

// the rows of a board upload that can trigger: equips with trusted stats, still for sale, seen in the last 30 minutes
export function freshRows(snap, since) {
  const c = snap.cols || {}, w = snap.words || {}, T = snap.T || snap.at || Date.now(), out = [];
  const word = (k, i) => (c[k] && c[k][i] && w[k] ? w[k][c[k][i] - 1] : "");
  const nowS = Math.floor(Date.now() / 1000);
  for (let i = 0; i < (snap.n || 0); i++) {
    const x = c.x ? c.x[i] : 0;
    if (!x || typeof x !== "object" || !x._ok) continue;     // only reads FM Watcher made exactly and checked against the item
    if ((c.so && c.so[i]) || (c.b && c.b[i]) || (c.chat && c.chat[i]) || (c.spot && c.spot[i])) continue;
    const st = word("st", i); if (st === "gone" || st === "sold") continue;
    const t = Math.floor((T - (c.t ? c.t[i] || 0 : 0) * 1000) / 1000);
    if (t <= since || nowS - t > FRESH_S) continue;
    const item = word("i", i), s = word("s", i); if (!item || !s) continue;
    out.push({ item, s, x, t, u: (c.u && c.u[i]) || (c.p && c.p[i]) || 0, q: (c.q && c.q[i]) || 1, r: word("r", i), c: (c.c && c.c[i]) || 0, ci: !!(c.ci && c.ci[i]) });
  }
  return out;
}

export function statLine(x) {
  return ALERT_STATS.filter((k) => typeof x[k] === "number" && x[k]).map((k) => k + " " + x[k]).join(" · ") + (x.SLOTS != null ? " · " + x.SLOTS + " slots left" : "");
}
export function alertLabel(al) {
  const p = al.stats.map((s) => (s.rel ? "+" + s.min + " " : s.min + "+ ") + s.k);
  if (al.clean) p.push("clean"); else if (al.used != null) p.push("at most " + al.used + " slots used");
  return al.item + (p.length ? " with " + p.join(", ") : "") + (al.max ? " under " + al.max.toLocaleString("en-US") : "");
}

// run every alert against one board upload. ctx: { hasMega(acct), dm(id, embed) -> status, base(item) -> clean stats, meso(n) }
export async function runAlerts(env, snap, ctx) {
  const idx = (await env.ACCOUNTS.get("alerts:index", "json")) || {};   // item (lower case) -> [account ids]
  if (!Object.keys(idx).length) return { checked: 0, sent: 0 };
  const since = Number(await env.ACCOUNTS.get("alerts:since") || 0) || Math.floor(Date.now() / 1000) - FRESH_S;
  const rows = freshRows(snap, since).filter((r) => idx[r.item.toLowerCase()]);
  let newest = since, sent = 0;
  const day = new Date().toISOString().slice(0, 10), accts = {}, lists = {};
  for (const r of rows) {
    newest = Math.max(newest, r.t);
    const base = await ctx.base(r.item);
    for (const id of idx[r.item.toLowerCase()]) {
      if (!(id in lists)) lists[id] = ((await env.ACCOUNTS.get("alerts:" + id, "json")) || []).filter((a) => a && a.on);
      const hit = lists[id].find((al) => matches(al, r, base));
      if (!hit) continue;
      if (!(id in accts)) { const a = await env.ACCOUNTS.get("acct:" + id, "json"); accts[id] = !!(await ctx.hasMega(a)); }
      if (!accts[id]) continue;                                              // access lost: paused, kept
      const key = "alertdm:" + id + ":" + [r.s, r.item, r.u, statLine(r.x)].join("|").toLowerCase().replace(/[^a-z0-9|.]/g, "").slice(0, 300);
      if (await env.ACCOUNTS.get(key)) continue;                             // one DM per listing
      const dk = "alertday:" + id + ":" + day, n = Number(await env.ACCOUNTS.get(dk) || 0);
      if (n >= ALERT_DM_DAY) continue;
      const where = [r.c ? "CH " + r.c + (r.ci ? " (likely)" : "") : "", /^FM\d+$/.test(r.r || "") ? "Free Market " + r.r.slice(2) : ""].filter(Boolean).join(", ") || "spot not read";
      const emb = { title: "Stat alert: " + r.item.slice(0, 80), color: 0x6d3fd1, url: "https://maplefm.gg/#item=" + encodeURIComponent(r.item),
        description: "**" + statLine(r.x) + "**\nListed at **" + ctx.meso(r.u) + "**" + (r.q > 1 ? " each ×" + r.q : ""),
        fields: [{ name: "Seller", value: String(r.s).slice(0, 24), inline: true }, { name: "Spot", value: where.slice(0, 40), inline: true }, { name: "Seen", value: "<t:" + r.t + ":R>", inline: true }],
        footer: { text: "Your alert: " + alertLabel(hit).slice(0, 180) + ". It may already be gone." } };
      const st = await ctx.dm(id, emb);
      if (st === 403) continue;                                              // DMs closed
      if (st >= 200 && st < 300) { await env.ACCOUNTS.put(key, "1", { expirationTtl: 3 * DAY }); await env.ACCOUNTS.put(dk, String(n + 1), { expirationTtl: 2 * DAY }); sent++; }
    }
  }
  // a 20 minute overlap: rows from a watcher can land late; repeats are already stopped by the one-DM-per-listing key
  await env.ACCOUNTS.put("alerts:since", String(Math.max(since, newest - 1200)));
  return { checked: rows.length, sent };
}

// keep the item -> accounts index in step with one account's alerts
export async function reindex(env, id, alerts) {
  const idx = (await env.ACCOUNTS.get("alerts:index", "json")) || {};
  Object.keys(idx).forEach((k) => { idx[k] = idx[k].filter((x) => x !== id); if (!idx[k].length) delete idx[k]; });
  alerts.forEach((a) => { const k = a.item.toLowerCase(); (idx[k] || (idx[k] = [])).includes(id) || idx[k].push(id); });
  await env.ACCOUNTS.put("alerts:index", JSON.stringify(idx));
}
