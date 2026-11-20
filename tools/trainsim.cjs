// Training map simulator: plays an hour on a map with real platforms, ropes and spawn points, monsters that walk,
// a character that walks, jumps, drops and climbs to the next monster, and the server refilling spawns on a timer.
// It checks the training model (assets/classic-dmg.js mapHour: kills an hour = min(3600 / (kill + walk), refill cap))
// against what the geometry allows, for every map the site ranks.
//
//   node tools/trainsim.cjs <world.json> <classic-skills.json> <geo dir> <out.json> <trainrank out.json> [sweep]
//
// geo dir: map<id>.json (maplestory.io map: footholds, ladderRopes, mobs) and mob<id>.json ({meta, fb}) per map and
// monster, written by tools/trainsim_geo.py. Without a map's file the map is reported as not simulated.
//
// Movement values are the client's (mapleclassic.wiki "Movement"): walk 125 px/s, jump 555 px/s up, gravity 2000,
// fall cap 670 px/s (a standing jump peaks at 77 px and covers 69 px of ground). Not in the client and so swept as
// assumptions: rope climbing speed, monster walking speed, attack reach, how many spawn points are up at once solo
// and the refill timer (7.0 or 7.56 s).
"use strict";
const fs = require("fs"), path = require("path");
const CD = require(path.join(__dirname, "..", "assets", "classic-dmg.js"));

const WALK = 125, JUMP_UP = 75, JUMP_REACH = 69, STEP = 40;
function fallTime(h) { h = Math.max(0, h); return h <= 112 ? Math.sqrt(2 * h / 2000) : 0.335 + (h - 112) / 670; }

// ------------------------------------------------------------------ geometry
function buildMap(g, mapId) {
  const fh = g.footholds || {}, segs = {};
  for (const k in fh) { const f = fh[k]; if (f.x1 === f.x2) continue; segs[f.id] = f; }      // walls are not ground
  // platforms: footholds chained by prev/next
  const plat = {}, plats = [];
  for (const id in segs) {
    if (plat[id] !== undefined) continue;
    let s = segs[id], guard = 0;
    while (s.prev && segs[s.prev] && plat[s.prev] === undefined && guard++ < 5000) s = segs[s.prev];
    const p = { i: plats.length, segs: [] }; let c = s; guard = 0;
    while (c && plat[c.id] === undefined && guard++ < 5000) { plat[c.id] = p.i; p.segs.push(c); c = segs[c.next]; }
    p.x0 = Math.min(...p.segs.map(f => Math.min(f.x1, f.x2))); p.x1 = Math.max(...p.segs.map(f => Math.max(f.x1, f.x2)));
    plats.push(p);
  }
  function yAt(p, x) {
    for (const f of p.segs) { const a = Math.min(f.x1, f.x2), b = Math.max(f.x1, f.x2); if (x >= a && x <= b) return f.y1 + (f.y2 - f.y1) * (x - f.x1) / ((f.x2 - f.x1) || 1); }
    return null;
  }
  // the first platform under (x, y)
  function below(x, y, not) {
    let best = null, by = Infinity;
    for (const p of plats) { if (p.i === not || x < p.x0 || x > p.x1) continue; const py = yAt(p, x); if (py !== null && py > y + 1 && py < by) { by = py; best = p; } }
    return best ? { p: best, y: by } : null;
  }
  // nodes every STEP px along every platform
  const nodes = [], byPlat = plats.map(() => []);
  for (const p of plats) {
    const xs = []; for (let x = p.x0; x < p.x1; x += STEP) xs.push(x); xs.push(p.x1);
    for (const x of xs) { const y = yAt(p, x); if (y === null) continue; byPlat[p.i].push(nodes.length); nodes.push({ p: p.i, x, y }); }
  }
  const adj = nodes.map(() => []);
  const edge = (a, b, c) => { if (a !== b && a >= 0 && b >= 0) adj[a].push([b, c]); };
  const nearOn = (pi, x) => { let best = -1, bd = Infinity; for (const n of byPlat[pi]) { const d = Math.abs(nodes[n].x - x); if (d < bd) { bd = d; best = n; } } return best; };
  for (const p of plats) {
    const ns = byPlat[p.i];
    for (let k = 1; k < ns.length; k++) { const a = nodes[ns[k - 1]], b = nodes[ns[k]]; const c = Math.hypot(b.x - a.x, b.y - a.y) / WALK; edge(ns[k - 1], ns[k], c); edge(ns[k], ns[k - 1], c); }
    for (const n of ns) {
      const a = nodes[n];
      // drop down (down-jump anywhere, or walk off an end)
      const bl = below(a.x, a.y, p.i); if (bl) edge(n, nearOn(bl.p.i, a.x), 0.2 + fallTime(bl.y - a.y));
      // jump up onto a platform just above
      for (const q of plats) {
        if (q.i === p.i || a.x < q.x0 - 30 || a.x > q.x1 + 30) continue;
        const qy = yAt(q, Math.min(Math.max(a.x, q.x0), q.x1)); if (qy === null) continue;
        if (a.y - qy > 0 && a.y - qy <= JUMP_UP) edge(n, nearOn(q.i, a.x), 0.6);
      }
    }
    // jump or walk off the ends across a gap
    for (const end of [ns[0], ns[ns.length - 1]]) {
      if (end === undefined) continue; const a = nodes[end], dir = end === ns[0] ? -1 : 1;
      for (const q of plats) {
        if (q.i === p.i) continue;
        const tx = a.x + dir * JUMP_REACH; if (tx < q.x0 - 5 || tx > q.x1 + 5) { if (!(a.x >= q.x0 && a.x <= q.x1)) continue; }
        const xx = Math.min(Math.max(tx, q.x0), q.x1), qy = yAt(q, xx); if (qy === null) continue;
        const dy = qy - a.y;   // + is lower
        if (dy >= -JUMP_UP && Math.abs(xx - a.x) <= JUMP_REACH + 5) edge(end, nearOn(q.i, xx), 0.55 + (dy > 0 ? fallTime(dy) : 0));
        else if (dy > 0 && Math.abs(xx - a.x) <= JUMP_REACH + 5) edge(end, nearOn(q.i, xx), fallTime(dy) + 0.2);
      }
    }
  }
  // ropes and ladders: bottom to top, climbed at the swept speed
  const ropes = [];
  // a rope or ladder: grab it from the ground under or beside it, get off onto any platform it passes (or whose end
  // is within a jump of it); each stretch between two stops is climbed at the swept speed
  for (const r of g.ladderRopes || []) {
    if (!r) continue;
    const stops = [];
    for (const q of plats) {
      const xx = Math.min(Math.max(r.x, q.x0), q.x1); if (Math.abs(xx - r.x) > JUMP_REACH) continue;
      const qy = yAt(q, xx); if (qy === null) continue;
      if (qy >= r.y1 - 20 && qy <= r.y2 + JUMP_UP) stops.push({ y: Math.min(Math.max(qy, r.y1), r.y2), n: nearOn(q.i, xx), off: Math.abs(xx - r.x) });
    }
    stops.sort((u, v) => u.y - v.y);
    for (let k = 1; k < stops.length; k++) if (stops[k].n !== stops[k - 1].n) ropes.push({ a: stops[k].n, b: stops[k - 1].n, len: stops[k].y - stops[k - 1].y, off: stops[k].off + stops[k - 1].off });
  }
  // portals inside the map (tree and tower maps join their floors this way): step in, press up
  const onGround = (x, y) => { let best = null, bd = Infinity; for (const q of plats) { if (x < q.x0 - 10 || x > q.x1 + 10) continue; const qy = yAt(q, Math.min(Math.max(x, q.x0), q.x1)); if (qy === null) continue; const d = qy - y; if (d >= -30 && d < bd) { bd = d; best = q; } } return best ? nearOn(best.i, x) : -1; };
  const byName = {}; for (const pt of g.portals || []) if (pt && pt.portalName) byName[pt.portalName] = pt;
  let inner = 0;
  for (const pt of g.portals || []) {
    if (!pt || !mapId || pt.toMap !== mapId || !pt.toName || !byName[pt.toName]) continue;
    const a = onGround(pt.x, pt.y), b = onGround(byName[pt.toName].x, byName[pt.toName].y); if (a >= 0 && b >= 0) { edge(a, b, 0.8); inner++; }
  }
  return { plats, nodes, adj, ropes, yAt, nearOn, byPlat, segPlat: plat, inner };
}

// all-pairs travel times for one climbing speed (Dijkstra from every node)
function allPairs(G, climb) {
  const n = G.nodes.length, D = new Float32Array(n * n).fill(Infinity);
  const adj = G.adj.map(a => a.slice());
  for (const r of G.ropes) { const c = r.len / climb + 0.4 + (r.off ? 0.3 : 0); adj[r.a].push([r.b, c]); adj[r.b].push([r.a, c * 0.8]); }
  for (let s = 0; s < n; s++) {
    const d = new Float64Array(n).fill(Infinity), done = new Uint8Array(n); d[s] = 0;
    const heap = [[0, s]];
    while (heap.length) {
      // binary heap pop
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } }
      const [du, u] = top; if (done[u]) continue; done[u] = 1;
      for (const [v, c] of adj[u]) { const nd = du + c; if (nd < d[v]) { d[v] = nd; heap.push([nd, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } } }
    }
    for (let k = 0; k < n; k++) D[s * n + k] = d[k];
  }
  return D;
}

// ------------------------------------------------------------------ one run
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function simulate(G, D, spawns, kinds, cfg, seed) {
  const R = rng(seed), n = G.nodes.length, T_END = cfg.minutes * 60, WARM = 120;
  const mobs = spawns.map((s, i) => ({ i, k: kinds[s.name], s, alive: false, x: s.x, y: s.y, p: s.p, dir: R() < 0.5 ? -1 : 1, until: 0 }));
  const cap = Math.max(1, Math.round(spawns.length * cfg.capfrac));
  function revive(t) {
    let alive = mobs.filter(m => m.alive).length;
    const dead = mobs.filter(m => !m.alive); for (let i = dead.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [dead[i], dead[j]] = [dead[j], dead[i]]; }
    for (const m of dead) { if (alive >= cap) break; m.alive = true; m.x = m.s.x; m.y = m.s.y; m.p = m.s.p; m.until = t; alive++; }
  }
  // monsters wander their platform: walk a while, stand a while; fliers keep their height
  function moveMobs(t0, t1) {
    if (cfg.mobSpeed <= 0) return;
    for (const m of mobs) {
      if (!m.alive || m.held) continue;
      const sp = cfg.mobSpeed * Math.max(0.1, (100 + (m.k.speed || 0)) / 100);
      let t = t0;
      while (t < t1) {
        if (t >= m.until) { m.walking = R() < 0.6; m.dir = R() < 0.5 ? -1 : 1; m.until = t + 1 + R() * 3; }
        const dt = Math.min(t1, m.until) - t;
        if (m.walking && m.p !== null) {
          const pl = G.plats[m.p]; let nx = m.x + m.dir * sp * dt;
          const lo = Math.max(pl.x0, m.s.ax0), hi = Math.min(pl.x1, m.s.ax1);
          if (nx < lo) { nx = lo; m.dir = 1; } if (nx > hi) { nx = hi; m.dir = -1; }
          m.x = nx; if (!m.k.fly) { const yy = G.yAt(pl, nx); if (yy !== null) m.y = yy; }
        }
        t += dt;
      }
    }
  }
  // the nodes a character can hit this monster from
  function attackFrom(m, reach, band) {
    const out = [];
    for (let k = 0; k < n; k++) { const nd = G.nodes[k]; if (Math.abs(nd.x - m.x) <= reach && Math.abs(nd.y - m.y) <= band) out.push(k); }
    return out;
  }
  let t = 0, at = cfg.start >= 0 ? cfg.start : G.nearOn(spawns[0].p, spawns[0].x), kills = 0, exp = 0, travel = 0, fighting = 0, idle = 0, nextTick = 0;
  // only places the character can also get back from (a pit our map reading can't climb out of is left alone)
  const home = new Uint8Array(n); for (let k = 0; k < n; k++) home[k] = D[at * n + k] < 1e9 && D[k * n + at] < 1e9 ? 1 : 0;
  const camp = cfg.policy === "camp" ? campNodes(G, spawns.filter(sp => home[sp.home]), D) : null;
  revive(0); nextTick = cfg.tick;
  while (t < T_END) {
    // pick the monster that is quickest to reach
    let best = null, bt = Infinity, bn = -1;
    for (const m of mobs) {
      if (!m.alive || !m.k.ok) continue;
      if (camp && !camp.has(m.s.home)) continue;
      const reach = m.k.ranged ? cfg.rangeFar : cfg.rangeNear, band = m.k.ranged ? cfg.bandFar : cfg.bandNear;
      for (const k of attackFrom(m, reach, band)) { if (!home[k]) continue; const c = D[at * n + k]; if (c < bt) { bt = c; best = m; bn = k; } }
    }
    if (!best) {   // nothing up that can be reached: wait for the next refill
      const dt = Math.max(0.1, nextTick - t); moveMobs(t, t + dt); t += dt; if (t >= WARM) idle += dt;
      while (t >= nextTick) { revive(nextTick); nextTick += cfg.tick; }
      continue;
    }
    // walk there (the world keeps moving), then check it is still in reach; if it wandered off, pick again from here
    moveMobs(t, t + bt); if (t >= WARM) travel += bt; t += bt;
    while (t >= nextTick) { revive(nextTick); nextTick += cfg.tick; }
    at = bn;
    const reach = best.k.ranged ? cfg.rangeFar : cfg.rangeNear, band = best.k.ranged ? cfg.bandFar : cfg.bandNear;
    const nd = G.nodes[at]; if (!best.alive || Math.abs(nd.x - best.x) > reach || Math.abs(nd.y - best.y) > band) continue;
    // fight: the monster stands while it is hit (knockback and aggro keep it close)
    best.held = true; const ks = best.k.kill;
    moveMobs(t, t + ks); if (t >= WARM) fighting += ks; t += ks; best.held = false;
    while (t >= nextTick) { revive(nextTick); nextTick += cfg.tick; }
    best.alive = false; if (t >= WARM) { kills++; exp += best.k.exp; }
  }
  const hrs = (T_END - WARM) / 3600;
  return { kph: kills / hrs, eph: exp / hrs, travel: travel / Math.max(1, kills), fighting: fighting / Math.max(1, kills), idleShare: idle / (T_END - WARM) };
}

// "camp": stay in the busiest part of the map, the spawn points within 6 s of the densest spot
function campNodes(G, spawns, D) {
  const n = G.nodes.length; let bestK = -1, bestC = -1;
  for (const s of spawns) { const c = spawns.filter(o => D[s.home * n + o.home] <= 6 && D[o.home * n + s.home] <= 6).length; if (c > bestC) { bestC = c; bestK = s.home; } }
  return new Set(spawns.filter(o => D[bestK * n + o.home] <= 6 && D[o.home * n + bestK] <= 6).map(o => o.home));
}

// ------------------------------------------------------------------ main
if (require.main === module) main();
function main() {
  const [WF, SF, GEO, OUT, MODE, SWEEP] = process.argv.slice(2);
  const W = JSON.parse(fs.readFileSync(WF, "utf8")), E = CD.Engine(JSON.parse(fs.readFileSync(SF, "utf8")));
  const RANKS = MODE && MODE.endsWith(".json") ? JSON.parse(fs.readFileSync(MODE, "utf8")) : null;
  if (MODE === "table") { fs.writeFileSync(OUT, JSON.stringify(walkTable(W, GEO, SWEEP ? JSON.parse(SWEEP) : {}))); console.log("table written"); return; }
  const sweep = SWEEP === "sweep";
  const BASE = { minutes: sweep ? 22 : 32, tick: 7.56, capfrac: 0.75, mobSpeed: 40, climb: 100, rangeNear: 90, bandNear: 40, rangeFar: 380, bandFar: 60, policy: "greedy" };
  const GRID = sweep ? {
    tick: [7.0, 7.56], capfrac: [0.6, 0.75, 1.0], mobSpeed: [0, 40, 80], climb: [70, 125], rangeNear: [60, 110], rangeFar: [300, 420], policy: ["greedy", "camp"] } : {};
  // which builds to try on each map: where the site ranks it in a top 3 (trainrank.cjs output), else a few typical ones
  const rk = RANKS ? RANKS.builds : null;
  const mapsWanted = new Map();
  if (rk) for (const key in rk) for (const L in rk[key].levels) (rk[key].levels[L].top || []).slice(0, 3).forEach((x, i) => {
    const arr = mapsWanted.get(x[0]) || []; arr.push({ key, job: rk[key].job, type: rk[key].type, L: +L, model: x[1], rank: i + 1 }); mapsWanted.set(x[0], arr);
  });
  const out = { built: new Date().toISOString(), base: BASE, grid: GRID, maps: {} };
  const mobByName = W.mobs;
  for (const [pg, list0] of mapsWanted) {
    const m = W.maps[pg]; const gf = path.join(GEO, `map${m.id}.json`);
    if (!fs.existsSync(gf)) { out.maps[pg] = { simulated: false, why: "no map geometry in the game files (newer than MCW/1)" }; continue; }
    const g = JSON.parse(fs.readFileSync(gf, "utf8")), G = buildMap(g, m.id);
    if (!G.nodes.length) { out.maps[pg] = { simulated: false, why: "no ground found" }; continue; }
    // spawn points: the game file's placements, by monster id
    const idName = {}; for (const nm in mobByName) idName[mobByName[nm].id] = nm;
    const spawns = [];
    for (const l of g.mobs || []) {
      const nm = idName[l.id]; if (!nm || !(m.mobs || []).some(x => x[0] === nm)) continue;
      const mf = path.join(GEO, `mob${l.id}.json`), mi = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, "utf8")) : { meta: {}, fb: [] };
      let p = G.segPlat[l.footholdId]; let x = l.x, y = l.y;
      const fly = (mi.fb || []).includes("fly");
      if (p === undefined || p === null) { const bl = (() => { let best = null, by = Infinity; for (const q of G.plats) { if (x < q.x0 || x > q.x1) continue; const qy = G.yAt(q, x); if (qy !== null && qy >= y - 5 && qy < by) { by = qy; best = q; } } return best; })(); p = bl ? bl.i : null; }
      if (p === null) continue;
      const pl = G.plats[p]; if (!fly) { const yy = G.yAt(pl, Math.min(Math.max(x, pl.x0), pl.x1)); if (yy !== null) y = yy; }
      spawns.push({ name: nm, x, y, p, ax0: l.walkAreaX1 ?? -1e9, ax1: l.walkAreaX2 ?? 1e9, home: G.nearOn(p, x), fly, speed: (mi.meta || {}).speed || 0 });
    }
    if (!spawns.length) { out.maps[pg] = { simulated: false, why: "no spawn points placed" }; continue; }
    const combos = [{}];
    for (const k in GRID) { const nx = []; for (const c of combos) for (const v of GRID[k]) nx.push(Object.assign({}, c, { [k]: v })); combos.splice(0, combos.length, ...nx); }
    const Dc = {};
    // a few builds per map: its best three placements from the ranks, by distinct job
    const seen = new Set(), list = list0.filter(x => { const k = x.job; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, sweep ? 1 : 4);
    const res = [];
    for (const it of list) {
      const b = E.typical(it.job, it.L, it.type), h = E.mapHour(b, m, W.mobs); if (!h || !h.fit) continue;
      const kinds = {};
      for (const row of h.rows) {
        const sp = spawns.find(s => s.name === row.name) || {};
        const atk = row.r && row.r.atk; const ranged = !!atk && (atk.kind === "m" || /^(Bow|Crossbow|Claw)$/.test(atk.w || ""));
        kinds[row.name] = { ok: row.count, kill: row.ok ? row.r.kill : Math.min(row.r && isFinite(row.r.kill) ? row.r.kill : CD.BLOCK || 12, 12), exp: row.ok || (row.r && row.r.kill <= 12) ? row.mob.exp : 0, ranged, fly: sp.fly, speed: sp.speed };
      }
      const runs = [];
      for (const c of combos) {
        const cfg = Object.assign({}, BASE, c); cfg.capfrac = cfg.capfrac * (m.spawnf > 0 ? m.spawnf : 1);
        const D = Dc[cfg.climb] || (Dc[cfg.climb] = allPairs(G, cfg.climb));
        if (!D.__start) {   // start where the most spawn points can be reached and returned from
          const n = G.nodes.length; let best = -1, bc = -1;
          for (let k = 0; k < n; k += 2) { let c = 0; for (const sp of spawns) if (D[k * n + sp.home] < 1e9 && D[sp.home * n + k] < 1e9) c++; if (c > bc) { bc = c; best = k; } }
          D.__start = best; D.__reach = bc;
        }
        cfg.start = D.__start;
        const seeds = sweep ? [1] : [1, 2, 3];
        const r = seeds.map(s => simulate(G, D, spawns, kinds, cfg, s * 7919 + it.L));
        const avg = (f) => r.reduce((a, x) => a + x[f], 0) / r.length;
        runs.push({ cfg: c, kph: Math.round(avg("kph")), eph: Math.round(avg("eph")), travel: +avg("travel").toFixed(2), fight: +avg("fighting").toFixed(2), idle: +avg("idleShare").toFixed(3) });
      }
      res.push({ key: it.key, L: it.L, rank: it.rank, model: { kph: Math.round(h.kph), eph: Math.round(h.eph), walk: +h.walk.toFixed(2), ks: +h.ks.toFixed(2), capped: h.capped, cap: Math.round(h.cap) }, runs });
    }
    const D0 = Dc[BASE.climb] || Object.values(Dc)[0];
    out.maps[pg] = { simulated: true, reachable: D0 ? D0.__reach : null, nodes: G.nodes.length, plats: G.plats.length, ropes: G.ropes.length, spawns: spawns.length, spawnf: m.spawnf || 1, res };
    process.stdout.write(".");
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log("\nmaps", Object.keys(out.maps).length, "simulated", Object.values(out.maps).filter(x => x.simulated).length);
}
// spawn points from the game file, placed on the ground (fliers keep their height)
function readSpawns(G, g, m, W, GEO) {
  const idName = {}; for (const nm in W.mobs) idName[W.mobs[nm].id] = nm;
  const spawns = [];
  for (const l of g.mobs || []) {
    const nm = idName[l.id]; if (!nm || !(m.mobs || []).some(x => x[0] === nm)) continue;
    const mf = path.join(GEO, `mob${l.id}.json`), mi = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, "utf8")) : { meta: {}, fb: [] };
    let p = G.segPlat[l.footholdId], x = l.x, y = l.y; const fly = (mi.fb || []).includes("fly");
    if (p === undefined || p === null) { let best = null, by = Infinity; for (const q of G.plats) { if (x < q.x0 || x > q.x1) continue; const qy = G.yAt(q, x); if (qy !== null && qy >= y - 5 && qy < by) { by = qy; best = q; } } p = best ? best.i : null; }
    if (p === null) continue;
    const pl = G.plats[p]; if (!fly) { const yy = G.yAt(pl, Math.min(Math.max(x, pl.x0), pl.x1)); if (yy !== null) y = yy; }
    spawns.push({ name: nm, x, y, p, ax0: l.walkAreaX1 ?? -1e9, ax1: l.walkAreaX2 ?? 1e9, home: G.nearOn(p, x), fly, speed: (mi.meta || {}).speed || 0 });
  }
  return spawns;
}
function startNode(G, D, spawns) {
  const n = G.nodes.length; let best = -1, bc = -1;
  for (let k = 0; k < n; k += 2) { let c = 0; for (const sp of spawns) if (D[k * n + sp.home] < 1e9 && D[sp.home * n + k] < 1e9) c++; if (c > bc) { bc = c; best = k; } }
  return { start: best, reach: bc };
}
// seconds of moving between kills on every map, for a melee and a ranged attacker that kill anything in KILL s
function walkTable(W, GEO, over) {
  const KILL = over.kill || 1.5, cfg0 = Object.assign({ minutes: 32, tick: 7.56, capfrac: 0.75, mobSpeed: 40, climb: 100, rangeNear: 90, bandNear: 40, rangeFar: 380, bandFar: 60, policy: "greedy" }, over);
  const out = { built: new Date().toISOString().slice(0, 10), cfg: cfg0, kill: KILL, maps: {} };
  for (const pg of Object.keys(W.maps)) {
    const m = W.maps[pg]; if (!m.mobs || !m.mobs.length) continue;
    const gf = path.join(GEO, `map${m.id}.json`); if (!fs.existsSync(gf)) continue;
    const g = JSON.parse(fs.readFileSync(gf, "utf8")), G = buildMap(g, m.id); if (!G.nodes.length) continue;
    const spawns = readSpawns(G, g, m, W, GEO); if (spawns.length < 2) continue;
    const D = allPairs(G, cfg0.climb), st = startNode(G, D, spawns);
    const row = { spawns: spawns.length, reach: st.reach };
    for (const far of [false, true]) {
      const kinds = {}; for (const s of spawns) kinds[s.name] = { ok: true, kill: KILL, exp: 1, ranged: far, fly: s.fly, speed: s.speed };
      const cfg = Object.assign({}, cfg0, { start: st.start, capfrac: cfg0.capfrac * (m.spawnf > 0 ? m.spawnf : 1) });
      const r = [1, 2, 3].map(sd => simulate(G, D, spawns, kinds, cfg, sd * 104729));
      row[far ? "far" : "near"] = +(r.reduce((a, x) => a + x.travel, 0) / r.length).toFixed(2);
      row[far ? "farIdle" : "nearIdle"] = +(r.reduce((a, x) => a + x.idleShare, 0) / r.length).toFixed(3);
    }
    out.maps[pg] = row; process.stdout.write(".");
  }
  return out;
}
module.exports = { buildMap, allPairs, simulate, fallTime, readSpawns, walkTable };
