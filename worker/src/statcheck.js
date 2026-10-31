// ---------------------------------------------------------------- daily stat accuracy report
// Once a day, from the board the pump uploads: which items show a base stat our item list doesn't have (so the list
// can be fixed), how many hovers were thrown out as another item's popup, and how many requirement lines were read
// as bonuses. The owner gets a DM only when the report has something new in it.
const STATS = ["ATT", "MATT", "STR", "DEX", "INT", "LUK", "HP", "MP", "WDEF", "MDEF", "ACC", "AVOID", "SPEED", "JUMP"];

let DB = null;
export async function itemdb(env) {
  if (DB) return DB;
  const r = await fetch(env.ITEMDB_URL || "https://maplefm.gg/data/itemdb.json", { cf: { cacheTtl: 86400, cacheEverything: true } }).catch(() => null);
  const d = r && r.ok ? await r.json().catch(() => null) : null;
  DB = {};
  if (d && d.items) d.items.forEach((x) => { DB[String(x[0]).toLowerCase()] = { kind: d.kinds[x[5]] || "", base: x[7] && typeof x[7] === "object" ? x[7] : {} }; });
  return DB;
}

// the board may send a mostly-empty column as gaps and values ({g, v}); spread it back out to one value per row
export function densify(snap) {
  if (!snap || !snap.cols) return snap;
  Object.keys(snap.cols).forEach((k) => {
    const c = snap.cols[k];
    if (!c || Array.isArray(c)) return;
    const a = new Array(snap.n).fill(0); let at = -1;
    for (let q = 0; q < c.g.length; q++) { at += c.g[q]; a[at] = c.v[q]; }
    snap.cols[k] = a;
  });
  return snap;
}
export function auditSnapshot(snap, db) {
  densify(snap);
  const c = snap.cols || {}, w = snap.words || {}, n = snap.n || 0;
  const word = (k, i) => (c[k] && c[k][i] && w[k] ? w[k][c[k][i] - 1] : "");
  const missing = {}, foreign = {}, dropped = {}, byWho = {}, slotsOff = {};
  let withStats = 0;
  for (let i = 0; i < n; i++) {
    const item = word("i", i); if (!item) continue;
    const x = c.x ? c.x[i] : 0, bad = c.xbad ? c.xbad[i] : 0, who = word("who", i);
    const e = db[item.toLowerCase()];
    if (!e || !/^Equip/.test(e.kind)) continue;
    if (x && typeof x === "object") {
      withStats++;
      // a stat kept on the board that our item list doesn't carry as a base: the list may be missing it
      STATS.forEach((k) => {
        if (!x[k] || e.base[k] != null) return;
        const b = x[k + "_b"] != null ? x[k + "_b"] : x[k];
        if (b !== x[k]) return;                       // a roll on top of a base we don't know isn't evidence of the base
        const key = item + "|" + k + "|" + b; missing[key] = (missing[key] || 0) + 1;
      });
    }
    if (bad && typeof bad === "object" && bad._why === "slots") { slotsOff[item] = (slotsOff[item] || 0) + 1; continue; }
    if (bad && typeof bad === "object") {
      if (x == null || x === 0) { foreign[item] = (foreign[item] || 0) + 1; if (who) byWho[who] = (byWho[who] || 0) + 1; }
      else STATS.forEach((k) => { if (bad[k] && !(x && x[k])) { const key = item + "|" + k + " " + bad[k]; dropped[key] = (dropped[key] || 0) + 1; } });
    }
  }
  const top = (o, m) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, m);
  return {
    withStats,
    missing: top(missing, 40).filter((x) => x[1] >= 3).map(([k, v]) => { const [item, stat, b] = k.split("|"); return { item, stat, base: +b, reads: v }; }),
    foreign: top(foreign, 15).map(([item, v]) => ({ item, reads: v })),
    dropped: top(dropped, 15).map(([k, v]) => ({ what: k.replace("|", ": "), reads: v })),
    scanners: top(byWho, 5).map(([who, v]) => ({ who, foreign: v })),
    slotsOff: top(slotsOff, 15).map(([item, v]) => ({ item, reads: v })),
  };
}

export async function statReport(env, opts) {
  opts = opts || {};
  const day = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);
  if (!opts.force && (await env.ACCOUNTS.get("stataudit:day")) === day) return { skipped: "done today" };
  // after 9 AM Eastern, once the night's scans are in
  if (!opts.force && new Date().getUTCHours() < 13) return { skipped: "too early" };
  const gz = await env.ACCOUNTS.get("snap:board.gz", "arrayBuffer");
  const body = gz ? await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).text() : await env.ACCOUNTS.get("snap:board");
  if (!body) return { skipped: "no board" };
  let snap; try { snap = JSON.parse(body); } catch (e) { return { error: "bad board" }; }
  const rep = auditSnapshot(snap, await itemdb(env));
  rep.day = day;
  await env.ACCOUNTS.put("stataudit:day", day);
  await env.ACCOUNTS.put("stataudit:last", JSON.stringify(rep));
  // only what's new since the last report goes in the DM
  const seen = new Set((await env.ACCOUNTS.get("stataudit:seen", "json")) || []);
  const fresh = rep.missing.filter((m) => !seen.has(m.item + "|" + m.stat));
  const foreignN = rep.foreign.reduce((a, f) => a + f.reads, 0);
  const lines = [];
  if (fresh.length) lines.push("**Base stats our item list is missing** (kept on the board because several reads agree):\n" + fresh.slice(0, 12).map((m) => "1. " + m.item + ": " + m.stat + " " + m.base + " (" + m.reads + " reads)").join("\n"));
  if (foreignN >= 5) lines.push("**Hovers thrown out as another item's popup:** " + foreignN + " (" + rep.foreign.slice(0, 5).map((f) => f.item + " " + f.reads).join(", ") + ")" + (rep.scanners.length ? "\nMost from: " + rep.scanners.map((s) => s.who + " " + s.foreign).join(", ") : ""));
  const slotsN = rep.slotsOff.reduce((a, f) => a + f.reads, 0);
  if (slotsN >= 3) lines.push("**Upgrades-left reads that can't be right, set aside:** " + slotsN + " (" + rep.slotsOff.slice(0, 6).map((f) => f.item + " " + f.reads).join(", ") + ")");
  if (!lines.length) return Object.assign({ dm: false }, rep);
  fresh.forEach((m) => seen.add(m.item + "|" + m.stat));
  await env.ACCOUNTS.put("stataudit:seen", JSON.stringify([...seen].slice(-2000)));
  const sent = opts.dm ? await opts.dm("Stat accuracy report, " + day + "\n\n" + lines.join("\n\n") + "\n\nNothing here changes prices on its own: impossible stats are already kept off the board.") : 0;
  return Object.assign({ dm: !!sent }, rep);
}
