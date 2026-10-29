// Weekly training check, run with the fact check: picks can't drift below the bar.
//   node tools/trainbar.cjs world.json assets/classic-skills.json assets/training-notes.json out.json
// For every job's typical build at every level from 10 to 100 (and the three thief builds), each of the top 5 maps
// the site recommends must let that build land at least HIT_BAR of its attacks and kill each common monster (a tenth
// of the spawns or more) in KILL_BAR seconds or less. Each "Players recommend" pick in the training notes must pass
// the bar for at least one build in its level range. The damage engine's own checks (tools/dmgtest.cjs) must match.
// Writes out.json {at, bar, checked, fail: [...]} and exits 1 when anything fails, so the watchdog alerts the admins.
const fs = require("fs"), path = require("path"), cp = require("child_process");
const CD = require(path.join(__dirname, "..", "assets", "classic-dmg.js"));
const [WF, SF, NF, OUT] = process.argv.slice(2);
const W = JSON.parse(fs.readFileSync(WF, "utf8")), D = JSON.parse(fs.readFileSync(SF, "utf8")), E = CD.Engine(D);
const NOTES = fs.existsSync(NF) ? JSON.parse(fs.readFileSync(NF, "utf8")) : { brackets: [] };
const fail = []; let checked = 0;
const BUILDS = [["Warrior", null, 10, 29], ["Magician", null, 10, 29], ["Bowman", null, 10, 29], ["Thief", "assassin", 10, 29], ["Thief", "bandit", 10, 29],
  ["Fighter", null, 30, 100], ["Page", null, 30, 100], ["Spearman", null, 30, 100], ["Fire Poison Wizard", null, 30, 100], ["Ice Lightning Wizard", null, 30, 100], ["Cleric", null, 30, 100],
  ["Hunter", null, 30, 100], ["Crossbowman", null, 30, 100], ["Assassin", "assassin", 30, 100], ["Bandit", "bandit", 30, 100], ["Bandit", "sindit", 30, 100]];
function passes(b, m) {
  const h = E.mapHour(b, m, W.mobs); if (!h) return { ok: false, why: "no monsters" };
  const bad = h.rows.filter((r) => r.n / h.all >= 0.1 && !(r.r && r.r.hc >= E.HIT_BAR && r.r.kill <= E.KILL_BAR));
  return { ok: !bad.length, why: bad.map((r) => `${r.name} ${r.r ? Math.round(r.r.hc * 100) + "% hit, " + (isFinite(r.r.kill) ? r.r.kill.toFixed(1) + " s" : "can't kill") : "no attack"}`).join("; ") };
}
for (const [job, type, lo, hi] of BUILDS) {
  for (let L = lo; L <= hi; L++) {
    const b = E.typical(job, L, type), top = E.rankMaps(b, W).fit.slice(0, 5);
    if (!top.length) fail.push({ build: job + (type ? " " + type : ""), level: L, map: "", why: "no map passes the bar" });
    for (const h of top) { checked++; const p = passes(b, h.m); if (!p.ok) fail.push({ build: job + (type ? " " + type : ""), level: L, map: h.pg, why: p.why }); }
  }
}
// "Players recommend" picks: each must suit at least one build somewhere in its bracket
for (const br of NOTES.brackets || []) {
  for (const pk of br.picks || []) {
    const m = W.maps[pk.map]; if (!m) { fail.push({ build: "pick", level: br.lo + "-" + br.hi, map: pk.map, why: "map not in the map data" }); continue; }
    checked++; let any = false, last = "";
    for (let L = br.lo; L <= Math.min(br.hi, 100) && !any; L++) for (const [job, type, lo, hi] of BUILDS) { if (L < lo || L > hi) continue; const p = passes(E.typical(job, L, type), m); if (p.ok) { any = true; break; } last = p.why; }
    if (!any) fail.push({ build: "pick", level: br.lo + "-" + br.hi, map: pk.map, why: "no typical build passes: " + last });
  }
}
let test = "";
try { test = cp.execFileSync("node", [path.join(__dirname, "dmgtest.cjs"), WF], { encoding: "utf8" }); } catch (e) { fail.push({ build: "engine", level: "", map: "", why: "damage checks differ:\n" + (e.stdout || e.message) }); }
const out = { at: Date.now(), bar: { hit: E.HIT_BAR, kill: E.KILL_BAR }, checked, fail };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`training bar: ${checked} checked, ${fail.length} under the bar`);
fail.slice(0, 40).forEach((f) => console.log(" ", f.build, f.level, f.map, "·", f.why));
process.exit(fail.length ? 1 : 0);
