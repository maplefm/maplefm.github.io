// Checks the damage engine against known numbers: skill values from the game files, worked examples published by the
// Classic formula sources, and the attack-speed tables. Cases with nothing real to compare against are listed as such.
//   node tools/dmgtest.cjs [world.json]        exits 1 if a case that has a known number stops matching
const path = require("path"), fs = require("fs");
const CD = require(path.join(__dirname, "..", "assets", "classic-dmg.js"));
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "classic-skills.json"), "utf8"));
const E = CD.Engine(D);
const W = process.argv[2] && fs.existsSync(process.argv[2]) ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : null;
const rows = []; let bad = 0;
function check(name, got, want, src) { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; rows.push([ok ? "MATCH" : "DIFFERS", name, JSON.stringify(got), JSON.stringify(want), src]); }
function none(name, why) { rows.push(["NO REAL NUMBER", name, "", "", why]); }
const sk = (id, f, lv) => { const v = D.skills[id].lv[f]; return Array.isArray(v) ? v[lv - 1] : v; };
// a hand-made build: level 30 warrior, 132 STR, 30 DEX, Gladius (47 attack), the worked example's numbers
function warrior(skills, w) { return { lv: 30, job: "Fighter", type: "pure", str: 132, dex: 30, int: 4, luk: 4, w: w || "1H Sword", gear: { [w || "1H Sword"]: { watk: 47, spd: 4 } }, skills }; }
const pick = (b, id) => E.attacks(b).find((o) => String(o.id) === String(id));
const tr = (o) => [Math.trunc(o.min), Math.trunc(o.max)];

check("Power Strike level 20 damage %", sk("1001001", "d", 20), 260, "game files vs wiki level table");
check("Lucky Seven level 20: damage %, stars", [sk("4001003", "d", 20), sk("4001003", "b", 20)], [140, 2], "game files vs wiki level table");
check("Savage Blow hits at levels 1, 11, 21", [sk("4201003", "h", 1), sk("4201003", "h", 11), sk("4201003", "h", 21)], [4, 5, 6], "game files vs wiki level table");
check("Double Stab level 20: damage %, hits", [sk("4001002", "d", 20), sk("4001002", "h", 20)], [160, 2], "game files vs wiki Damage page");
check("Iron Arrow level 30: damage %, targets", [sk("3201004", "d", 30), sk("3201004", "t", 30)], [180, 6], "game files (wiki infobox says 190 x 4, its level table agrees with the files)");
check("Regular attack, level 30 warrior, Gladius, no mastery", tr(pick(warrior({}), "basic")), [59, 172], "Classic formula source, worked example B");
check("Power Strike 20, same warrior, no mastery", tr(pick(warrior({ 1001001: 20 }), "1001001")), [154, 449], "Classic formula source, worked example C");
check("Power Strike 20 with Sword Mastery 20", tr(pick(warrior({ 1001001: 20, 1100000: 20 }), "1001001")), [357, 449], "Classic formula source, worked example D");
check("Warrior accuracy, level 30, 30 DEX, 4 LUK", E.acc({ lv: 30, job: "Warrior", str: 132, dex: 30, int: 4, luk: 4, w: "1H Sword", skills: {} }), 49, "Classic formula source, worked example A");
check("Swing time by speed tier 1 to 8 (ms)", [1, 2, 3, 4, 5, 6, 7, 8].map((t) => CD.actionMs(CD.FRAMES.swing, t)), [570, 600, 660, 720, 750, 810, 870, 900], "game-file frames vs wiki and formula source tables");
check("Savage Blow time at speed 3, 4 and boosted 1 (ms)", [3, 4, 1].map((t) => CD.actionMs(CD.FRAMES.savage, t)), [780, 840, 660], "game-file frames vs formula source table");
check("Level gap: damage kept at 5, 10, 20 levels (%)", [5, 10, 20].map((g) => Math.round(E.gapMult({ lv: 30 + g }, 30) * 100)), [89, 67, 50], "wiki and formula source agree");
check("Assassin crit with Critical Throw 30 (rate %, extra damage %)", (() => { const b = E.typical("Assassin", 70, "assassin"); b.skills[4100001] = 30; const o = pick(b, "4001003"); return [Math.round(o.crit.rate * 100), Math.round(o.crit.dmg * 100)]; })(), [20, 55], "game files + 5%/20% base vs wiki crit table");
check("Bandit crit with Dagger Mastery 20", (() => { const b = E.typical("Bandit", 70, "bandit"); b.skills[4200000] = 20; const o = pick(b, "4201003"); return [Math.round(o.crit.rate * 100), Math.round(o.crit.dmg * 100)]; })(), [25, 20], "game files + base vs wiki crit table");
if (W) {
  const hog = W.mobs["Iron Hog"];
  check("Iron Hog: physical and magic damage kept (%)", [Math.round(100 / (hog.wdef + 100) * 1000) / 10, Math.round(100 / (hog.mdef + 100) * 1000) / 10], [16.7, 50], "game files WDEF 500, MDEF 100; formula source defense");
  const gm = W.mobs["Green Mushroom"];
  check("Green Mushroom poison immunity", E.elemMult(gm, "Poison"), gm.elem ? 0 : 0.75, gm.elem ? "game files code S1 (immune)" : "wiki says resist; game-file code not in this data yet");
  const zm = W.mobs["Zombie Mushroom"];
  check("Holy on Zombie Mushroom (undead)", E.elemMult(zm, "Holy"), 1.25, "game files H3 and undead flag");
}
none("Magic damage range", "the wiki and the formula source disagree (Energy Bolt 20, INT 200, +50 magic: 435 to 507 vs 854 to 908); no in-game capture yet");
none("Hit chance", "no allowed source has measured hit rates in game; the wiki and the formula source use different formulas");
none("Monster defense reduction", "only the formula source states DEF/(DEF+100); the wiki calls it unconfirmed");
none("Heal damage on undead", "the formula source marks its Heal formula unconfirmed");
none("EXP an hour", "no allowed source publishes measured EXP an hour; the formula source's numbers are models too");
for (const r of rows) console.log(r[0].padEnd(15), r[1].padEnd(58), r[2] ? r[2] + " vs " + r[3] : "", "·", r[4]);
const m = rows.filter((r) => r[0] === "MATCH").length;
console.log(`\n${m} match, ${bad} differ, ${rows.length - m - bad} with no real number yet`);
process.exit(bad ? 1 : 0);
