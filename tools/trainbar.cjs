// Weekly training check, run with the fact check: picks can't drift below the bar.
//   node tools/trainbar.cjs world.json assets/classic-skills.json assets/training-notes.json out.json
// For every job's typical build at every level from 10 to 100 (and the three thief builds), each of the top 5 maps
// the site recommends must let that build land at least HIT_BAR of its attacks and kill each common monster (a tenth
// of the spawns or more) in KILL_BAR seconds or less. Each "Players recommend" pick in the training notes must pass
// the bar for at least one build in its level range. The damage engine's own checks (tools/dmgtest.cjs) must match.
// Hybrid builds are checked the same way, but a level where no map fits them is listed in "nofit", not failed.
// Writes out.json {at, bar, checked, fail: [...], nofit: {...}} and exits 1 when anything fails, so the watchdog alerts the admins.
const fs = require("fs"), path = require("path"), cp = require("child_process");
const CD = require(path.join(__dirname, "..", "assets", "classic-dmg.js"));
const [WF, SF, NF, OUT] = process.argv.slice(2);
const W = JSON.parse(fs.readFileSync(WF, "utf8")), D = JSON.parse(fs.readFileSync(SF, "utf8")), E = CD.Engine(D);
const NOTES = fs.existsSync(NF) ? JSON.parse(fs.readFileSync(NF, "utf8")) : { brackets: [] };
const fail = []; let checked = 0;
const BUILDS = [["Warrior", null, 10, 29], ["Magician", null, 10, 29], ["Bowman", null, 10, 29], ["Thief", "assassin", 10, 29], ["Thief", "bandit", 10, 29],
  ["Fighter", null, 30, 100], ["Page", null, 30, 100], ["Spearman", null, 30, 100], ["Fire Poison Wizard", null, 30, 100], ["Ice Lightning Wizard", null, 30, 100], ["Cleric", null, 30, 100],
  ["Hunter", null, 30, 100], ["Crossbowman", null, 30, 100], ["Assassin", "assassin", 30, 100], ["Bandit", "bandit", 30, 100], ["Bandit", "sindit", 30, 100],
  // hybrids: their top maps must pass like any build, but a level where none passes is expected (the page says nothing
  // fits) and is listed under "nofit" instead of failing the check
  ["Bandit", "sindit36", 30, 100, 1], ["Bandit", "sinditreset", 30, 100, 1],
  ["Thief", "dexassassin", 10, 29, 1], ["Assassin", "dexassassin", 30, 100, 1], ["Thief", "dexbandit", 10, 29, 1], ["Bandit", "dexbandit", 30, 100, 1],
  ["Warrior", "dexless", 10, 29, 1], ["Fighter", "dexless", 30, 100, 1], ["Page", "dexless", 30, 100, 1], ["Spearman", "dexless", 30, 100, 1],
  ["Magician", "lukmage", 10, 29, 1], ["Fire Poison Wizard", "lukmage", 30, 100, 1], ["Ice Lightning Wizard", "lukmage", 30, 100, 1], ["Cleric", "lukmage", 30, 100, 1]];
const nofit = {};
function passes(b, m) {
  const h = E.mapHour(b, m, W.mobs); if (!h) return { ok: false, why: "no monsters" };
  const bad = h.rows.filter((r) => r.n / h.all >= 0.1 && !(r.r && r.r.hc >= E.HIT_BAR && r.r.kill <= E.KILL_BAR));
  return { ok: !bad.length, why: bad.map((r) => `${r.name} ${r.r ? Math.round(r.r.hc * 100) + "% hit, " + (isFinite(r.r.kill) ? r.r.kill.toFixed(1) + " s" : "can't kill") : "no attack"}`).join("; ") };
}
for (const [job, type, lo, hi, hybrid] of BUILDS) {
  for (let L = lo; L <= hi; L++) {
    const b = E.typical(job, L, type), top = E.rankMaps(b, W).fit.slice(0, 5);
    if (!top.length && hybrid) (nofit[job + " " + type] = nofit[job + " " + type] || []).push(L);
    else if (!top.length) fail.push({ build: job + (type ? " " + type : ""), level: L, map: "", why: "no map passes the bar" });
    for (const h of top) { checked++; const p = passes(b, h.m); if (!p.ok) fail.push({ build: job + (type ? " " + type : ""), level: L, map: h.pg, why: p.why }); }
  }
}
// "Players recommend" picks: each must suit at least one build somewhere in its bracket
for (const br of NOTES.brackets || []) {
  for (const pk of br.picks || []) {
    const m = W.maps[pk.map]; if (!m) { fail.push({ build: "pick", level: br.lo + "-" + br.hi, map: pk.map, why: "map not in the map data" }); continue; }
    checked++; let any = false, last = "";
    for (let L = br.lo; L <= Math.min(br.hi, 100) && !any; L++) for (const [job, type, lo, hi, hybrid] of BUILDS) { if (hybrid || L < lo || L > hi) continue; const p = passes(E.typical(job, L, type), m); if (p.ok) { any = true; break; } last = p.why; }
    if (!any) fail.push({ build: "pick", level: br.lo + "-" + br.hi, map: pk.map, why: "no typical build passes: " + last });
  }
}
let test = "";
try { test = cp.execFileSync("node", [path.join(__dirname, "dmgtest.cjs"), WF], { encoding: "utf8" }); } catch (e) { fail.push({ build: "engine", level: "", map: "", why: "damage checks differ:\n" + (e.stdout || e.message) }); }
const out = { at: Date.now(), bar: { hit: E.HIT_BAR, kill: E.KILL_BAR }, checked, fail, nofit };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`training bar: ${checked} checked, ${fail.length} under the bar`);
Object.keys(nofit).forEach((k) => console.log("  nothing fits (hybrid, expected):", k, "at", nofit[k].join(",")));
fail.slice(0, 40).forEach((f) => console.log(" ", f.build, f.level, f.map, "·", f.why));
process.exit(fail.length ? 1 : 0);
