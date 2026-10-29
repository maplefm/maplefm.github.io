// Where every job's typical build should train at every level, from the damage engine (assets/classic-dmg.js).
//   node tools/trainrank.cjs world.json assets/classic-skills.json out.json [print]
// out.json: { "<build key>": { "<level>": [[map, EXP an hour, kills an hour, why], ...top 5], ... }, bar: {...} }
// Used by the static training pages and by the weekly fact check, so the site and the check use one model.
const fs = require("fs"), path = require("path");
const CD = require(path.join(__dirname, "..", "assets", "classic-dmg.js"));
const [WF, SF, OUT, PRINT] = process.argv.slice(2);
const W = JSON.parse(fs.readFileSync(WF, "utf8")), D = JSON.parse(fs.readFileSync(SF, "utf8")), E = CD.Engine(D);

// the builds the site ranks: 1st jobs under 30, every 2nd job from 30, the three thief builds, then the hybrids
const BUILDS = [
  ["Beginner", "Beginner", null, 1, 9],
  ["Warrior", "Warrior", null, 10, 29], ["Magician", "Magician", null, 10, 29], ["Bowman", "Bowman", null, 10, 29],
  ["Thief (claw)", "Thief", "assassin", 10, 29], ["Thief (dagger)", "Thief", "bandit", 10, 29],
  ["Fighter", "Fighter", null, 30, 100], ["Page", "Page", null, 30, 100], ["Spearman", "Spearman", null, 30, 100],
  ["Fire Poison Wizard", "Fire Poison Wizard", null, 30, 100], ["Ice Lightning Wizard", "Ice Lightning Wizard", null, 30, 100], ["Cleric", "Cleric", null, 30, 100],
  ["Hunter", "Hunter", null, 30, 100], ["Crossbowman", "Crossbowman", null, 30, 100],
  ["Assassin", "Assassin", "assassin", 30, 100], ["Bandit", "Bandit", "bandit", 30, 100], ["Sindit", "Bandit", "sindit", 30, 100],
  // hybrids (classic-dmg.js BUILDS): a level where nothing passes the bar gets an empty list, and the page says nothing fits
  ["Sindit (dagger at 36)", "Bandit", "sindit36", 30, 100], ["Sindit (reset at 40)", "Bandit", "sinditreset", 30, 100],
  ["Thief (dexless claw)", "Thief", "dexassassin", 10, 29], ["Dexless Assassin", "Assassin", "dexassassin", 30, 100],
  ["Thief (dexless dagger)", "Thief", "dexbandit", 10, 29], ["Dexless Bandit", "Bandit", "dexbandit", 30, 100],
  ["Warrior (dexless)", "Warrior", "dexless", 10, 29], ["Dexless Fighter", "Fighter", "dexless", 30, 100], ["Dexless Page", "Page", "dexless", 30, 100], ["Dexless Spearman", "Spearman", "dexless", 30, 100],
  ["Magician (LUK)", "Magician", "lukmage", 10, 29], ["LUK Fire Poison Wizard", "Fire Poison Wizard", "lukmage", 30, 100], ["LUK Ice Lightning Wizard", "Ice Lightning Wizard", "lukmage", 30, 100], ["LUK Cleric", "Cleric", "lukmage", 30, 100],
];
const out = { built: new Date().toISOString().slice(0, 10), bar: { hit: E.HIT_BAR, kill: E.KILL_BAR }, builds: {} };
for (const [key, job, type, lo, hi] of BUILDS) {
  const per = (out.builds[key] = { job, type, levels: {} });
  for (let L = lo; L <= hi; L++) {
    const b = E.typical(job, L, type), r = E.rankMaps(b, W);
    const atk = (E.attacks(b).sort((x, y) => y.avgHit * y.lines / y.ms - x.avgHit * x.lines / x.ms)[0] || {}).name || "";
    per.levels[L] = { atk, swap: b.swap || null, top: r.fit.slice(0, 5).map((h) => [h.pg, Math.round(h.eph), Math.round(h.kph), E.why(h)]) };
    if (PRINT && (L % 5 === 0 || L === lo)) console.log(key.padEnd(22), String(L).padStart(3), atk.padEnd(14), r.fit.slice(0, 3).map((h) => `${h.pg} ${Math.round(h.eph / 1000)}K`).join(" | ") || "NOTHING FITS");
  }
}
fs.writeFileSync(OUT, JSON.stringify(out));
