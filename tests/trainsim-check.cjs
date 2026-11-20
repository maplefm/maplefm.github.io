// Checks the training map simulator (tools/trainsim.cjs) on hand-made maps whose answers are known.
//   node tests/trainsim-check.cjs
const S = require("../tools/trainsim.cjs");
let fails = 0;
const ok = (name, cond, extra) => { console.log((cond ? "ok   " : "FAIL ") + name + (extra !== undefined ? " | " + extra : "")); if (!cond) fails++; };
const fh = (id, x1, y1, x2, y2, prev, next) => ({ id, x1, y1, x2, y2, prev: prev || 0, next: next || 0 });

// 1. physics: a 77 px jump peak, fall cap 670 px/s reached after 112 px
ok("fall 112 px takes 0.335 s", Math.abs(S.fallTime(112) - 0.335) < 0.002, S.fallTime(112).toFixed(3));
ok("fall 782 px takes 1.335 s", Math.abs(S.fallTime(782) - 1.335) < 0.002, S.fallTime(782).toFixed(3));

// 2. one flat 2000 px floor: walking end to end takes 16 s at 125 px/s
const flat = { footholds: { 1: fh(1, 0, 0, 1000, 0, 0, 2), 2: fh(2, 1000, 0, 2000, 0, 1, 0) }, ladderRopes: [], portals: [] };
let G = S.buildMap(flat, 1), D = S.allPairs(G, 100), n = G.nodes.length;
const a = G.nearOn(0, 0), b = G.nearOn(0, 2000);
ok("2000 px of floor walked in 16 s", Math.abs(D[a * n + b] - 16) < 0.01, D[a * n + b].toFixed(2));

// 3. two floors 400 px apart joined by a rope: up is the climb, down is a drop (faster)
const two = { footholds: { 1: fh(1, 0, 400, 1000, 400), 2: fh(2, 0, 0, 1000, 0) }, ladderRopes: [{ x: 500, y1: 0, y2: 400, isLadder: false }], portals: [] };
G = S.buildMap(two, 1); D = S.allPairs(G, 100); n = G.nodes.length;
const lo = G.nearOn(G.segPlat[1], 500), hi = G.nearOn(G.segPlat[2], 500);
ok("climb 400 px at 100 px/s plus grab: 4.4 s", Math.abs(D[lo * n + hi] - 4.4) < 0.05, D[lo * n + hi].toFixed(2));
ok("drop 400 px: 0.2 + 0.765 s", Math.abs(D[hi * n + lo] - (0.2 + S.fallTime(400))) < 0.05, D[hi * n + lo].toFixed(2));

// 4. a floor 60 px up can be jumped onto; 120 px up can't without a rope
const step = { footholds: { 1: fh(1, 0, 100, 1000, 100), 2: fh(2, 400, 40, 600, 40), 3: fh(3, 700, -20, 900, -20) }, ladderRopes: [], portals: [] };
G = S.buildMap(step, 1); D = S.allPairs(G, 100); n = G.nodes.length;
const f = G.nearOn(G.segPlat[1], 500), p60 = G.nearOn(G.segPlat[2], 500), p120 = G.nearOn(G.segPlat[3], 800);
ok("60 px ledge reachable by jumping", D[f * n + p60] < 2, D[f * n + p60].toFixed(2));
ok("120 px ledge from the floor needs the 60 px one first or nothing", D[f * n + p60] <= D[f * n + p120], D[f * n + p120]);

// 5. the hour: one monster type, a fixed kill time, nothing to walk to beyond reach: kills = 3600 / kill time
const one = { footholds: { 1: fh(1, 0, 0, 300, 0) }, ladderRopes: [], portals: [] };
G = S.buildMap(one, 1); D = S.allPairs(G, 100);
const spawns = [0, 50, 100, 150, 200, 250].map(x => ({ name: "Snail", x, y: 0, p: 0, ax0: -1e9, ax1: 1e9, home: G.nearOn(0, x) }));
const r = S.simulate(G, D, spawns, { Snail: { ok: true, kill: 2, exp: 1, ranged: true } }, { minutes: 32, tick: 7.56, capfrac: 1, mobSpeed: 0, climb: 100, rangeNear: 90, bandNear: 40, rangeFar: 400, bandFar: 60, policy: "greedy", start: G.nearOn(0, 150) }, 1);
// six spawns refill every 7.56 s, a kill takes 2 s: the respawn caps it at about 6 / 7.56 s = 2,857 an hour, and 1,800 by kill time
ok("ranged with all in reach: limited by kill time, about 1,800 an hour", Math.abs(r.kph - 1800) < 40, Math.round(r.kph));

console.log(fails ? fails + " failed" : "all passed"); process.exit(fails ? 1 : 0);
