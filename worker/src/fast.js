// Fast lane for new listings. A watcher's upload lands in the inbox at once, but the pump folds uploads into the
// board every few minutes (it rebuilds the whole board and commits it). New open shop listings from a verified upload
// are also kept here (D1 table fast) for a few minutes and served with /data/live as data/fast.json, so a deal
// reaches the board within seconds of the watcher sending it. Once the pump has pulled an upload twice it's in the
// board for sure, and its rows stop being served from here.

const KEEP_S = 20 * 60;            // only rows the watcher saw in the last 20 minutes
const SHOW_S = 60 * 60;            // a scanner's fast copy is sent (maybe empty) for an hour, so browsers drop old rows

let made = false;
async function ensure(env) {
  if (made) return;
  await env.INBOX_DB.batch([
    env.INBOX_DB.prepare("CREATE TABLE IF NOT EXISTS fast (h TEXT NOT NULL, k TEXT NOT NULL, posted INTEGER NOT NULL, row TEXT NOT NULL, nm TEXT, PRIMARY KEY (h, k))"),
    env.INBOX_DB.prepare("CREATE TABLE IF NOT EXISTS fastmeta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)"),
  ]);
  made = true;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha(s) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }
async function sigOk(m) {
  const reg = String(m.reg || "");
  if (!/^[0-9a-f]{64}$/.test(reg)) return false;
  const key = await crypto.subtle.importKey("raw", new Uint8Array(reg.match(/../g).map((x) => parseInt(x, 16))), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${m.id}|${m.seq}|${m.k}|${m.n}|${m.z}`)));
  return want === String(m.sig || "");
}
async function inflate(b64) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const txt = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("deflate"))).text();
  if (txt.length > 4e6) throw new Error("too big");
  return JSON.parse(txt);
}
const S = (v, n) => typeof v === "string" && v.length > 0 && v.length <= n;
const I = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
// the same fields and limits the pump keeps (tools/inbox.py clean)
function clean(r) {
  if (!r || !S(r.s, 24) || !S(r.i, 80) || !I(r.p, 1, 1e11) || !I(r.q || 1, 1, 30000) || !I(r.t, 1e9, 4e9)) return null;
  if (r.k === "b") return null;                         // buy posts aren't listings
  const o = { s: r.s, i: r.i, p: r.p, q: r.q || 1, t: r.t };
  if (r.so) o.so = true;
  if (I(r._o, 0, 100)) o._o = r._o;
  if (S(r.r, 40)) o.r = r.r;
  if (I(r.c, 1, 40)) o.c = r.c;
  if (r.x && typeof r.x === "object" && Object.keys(r.x).length <= 30 && Object.entries(r.x).every(([k, v]) => S(k, 12) && (I(v, -9999, 99999) || S(v, 40)))) o.x = r.x;
  return o;
}

// After a post is stored in the inbox: keep its new shop rows. Single-part, signed (v3) posts only; a blocked
// watcher is skipped. Never throws.
export async function fastPut(env, msg, blocked) {
  try {
    const m = JSON.parse(msg);
    if (!m || m.v !== 3 || m.n !== 1 || m.k !== 0 || !/^[0-9a-f]{16}$/.test(String(m.id || "")) || typeof m.z !== "string") return 0;
    const h = (await sha("fm-inbox:" + m.id)).slice(0, 16);
    if (blocked && (blocked.has(h) || blocked.has(m.id))) return 0;
    if (!(await sigOk(m))) return 0;
    const docs = await inflate(m.z);
    if (!Array.isArray(docs)) return 0;
    const now = Math.floor(Date.now() / 1000), rows = [];
    for (const d of docs) {
      if (!d || d.src !== "watcher-shop" || !Array.isArray(d.rows)) continue;
      for (const r of d.rows) { const c = clean(r); if (c && now - c.t <= KEEP_S && c.t <= now + 120) rows.push(c); }
    }
    if (!rows.length) return 0;
    await ensure(env);
    const nm = String(m.nm || m.ign || "").replace(/[^A-Za-z0-9 _.\-]/g, "").slice(0, 16);
    const st = env.INBOX_DB.prepare("INSERT OR REPLACE INTO fast (h, k, posted, row, nm) VALUES (?, ?, ?, ?, ?)");
    const batch = rows.slice(0, 400).map((r) => st.bind(h, JSON.stringify([r.s, r.i, r.p, r.q, r._o || 0]), Date.now(), JSON.stringify(r), nm));
    batch.push(env.INBOX_DB.prepare("DELETE FROM fast WHERE posted < ?").bind(Date.now() - 2 * SHOW_S * 1000));
    await env.INBOX_DB.batch(batch);
    return rows.length;
  } catch (e) { return 0; }
}

// The pump starts each pass with a full pull (after=0): remember when, so rows it has surely folded in stop here.
export async function fastPulled(env) {
  try {
    await ensure(env);
    const prev = await env.INBOX_DB.prepare("SELECT v FROM fastmeta WHERE k = 'pull1'").first();
    await env.INBOX_DB.batch([
      env.INBOX_DB.prepare("INSERT OR REPLACE INTO fastmeta (k, v) VALUES ('pull2', ?)").bind(prev ? prev.v : 0),
      env.INBOX_DB.prepare("INSERT OR REPLACE INTO fastmeta (k, v) VALUES ('pull1', ?)").bind(Date.now()),
    ]);
  } catch (e) {}
}

// data/fast.json: one document per scanner seen in the last hour, holding its rows not yet surely in the board.
// Each keeps the same key (inbox and day) from poll to poll, so a browser's copy is replaced, and empties out.
export async function fastDocs(env) {
  try {
    await ensure(env);
    const p2 = await env.INBOX_DB.prepare("SELECT v FROM fastmeta WHERE k = 'pull2'").first();
    const cut = p2 ? p2.v : 0, nowMs = Date.now();
    const r = await env.INBOX_DB.prepare("SELECT h, posted, row, nm FROM fast WHERE posted > ? ORDER BY posted").bind(nowMs - SHOW_S * 1000).all();
    const by = {}, day = new Date(nowMs - 4 * 3600e3).toISOString().slice(0, 10);
    let ver = 0;
    for (const x of r.results || []) {
      const d = by[x.h] || (by[x.h] = { at: "", src: "watcher-shop", who: x.nm || "Guest-" + x.h.slice(0, 4), inbox: "fast-" + x.h.slice(0, 4), day, fast: 1, rows: [], _m: 0 });
      d._m = Math.max(d._m, x.posted); ver = Math.max(ver, x.posted);
      if (x.posted <= cut) continue;
      let row; try { row = JSON.parse(x.row); } catch (e) { continue; }
      if (nowMs / 1000 - row.t > KEEP_S) continue;
      d.rows.push(row);
    }
    const docs = Object.values(by).map((d) => { d.at = new Date(d._m).toISOString(); d.u = Math.floor(d._m / 1000); delete d._m; return d; });
    return { docs, ver: ver > cut ? ver : 0 };
  } catch (e) { return { docs: [], ver: 0 }; }
}
