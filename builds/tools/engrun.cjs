// Runs the site's damage engine (assets/classic-dmg.js) on characters a build guide describes, level by level.
//   node builds/tools/engrun.cjs chars.json world.json out.json
// chars.json: { "<build>": [ {lv, job, type, str, dex, int, luk, w, gear: {<class>: {name, watk, spd, ammo, ammoAtk}}, skills: {id: lv}}, ... ] }
// out.json:   { "<build>": { "<lv>": { attack, dps, maps: [{map, exp_h, monsters}] } } }
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const CD = require(path.join(ROOT, "assets", "classic-dmg.js"));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "classic-skills.json"), "utf8"));
const E = CD.Engine(D);
const CH = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const W = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const dps = (o) => o.avgHit * o.lines / o.ms * 1000;
const out = {};
for (const [build, list] of Object.entries(CH)) {
  out[build] = {};
  for (const b of list) {
    b.gearAcc = b.gearAcc || 0;
    const atks = E.attacks(b).sort((a, c) => dps(c) - dps(a)), top = atks[0];
    const r = { attack: top ? top.name : null, dps: top ? Math.round(dps(top)) : 0 };
    if (b.maps) {
      const rk = E.rankMaps(b, W);
      r.maps = rk.fit.slice(0, 3).map((h) => ({ map: h.pg, exp_h: Math.round(h.eph), monsters: ((W.maps[h.pg] || {}).mobs || []).map((m) => m[0]) }));
    }
    out[build][b.lv] = r;
  }
}
fs.writeFileSync(process.argv[4], JSON.stringify(out));
console.log("ran", Object.keys(out).map((k) => k + ":" + Object.keys(out[k]).length).join(" "));
