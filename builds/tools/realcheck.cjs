// Real on-screen numbers players posted (r/MSClassicWorld, Nov 2026) against the engine. None of the posts gives every
// stat, so each case states what is assumed (the training page's Typical stats for the level) and how far off we land.
//   node builds/tools/realcheck.cjs
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const CD = require(path.join(ROOT, "assets", "classic-dmg.js")), D = require(path.join(ROOT, "assets", "classic-skills.json")), E = CD.Engine(D);
const W = Object.fromEntries(Object.values(D.weapons).flat().map((w) => [w[0], w]));
const pick = (b, id) => E.attacks(b).find((o) => String(o.id) === String(id));
const off = (a, b) => Math.round((a / b - 1) * 1000) / 10;
const rows = [];
function add(name, model, real, note) { rows.push({ name, model: Math.round(model), real, off_pct: off(model, real), note }); }

// 1. Level 35 Bandit, Halfmoon Zamadar, Dagger Mastery 4, Savage Blow 11: "average 539 (from 314 to 763)" a cast
{ const b = { lv: 35, job: "Bandit", type: "bandit", str: 4, dex: 30, int: 4, luk: 162 - 5, w: "Dagger", gear: { Dagger: { watk: W["Halfmoon Zamadar"][2], spd: 4 } }, skills: { 4200000: 4, 4201003: 11, 4201000: 1 } };
  const o = pick(b, 4201003); add("Lv35 Savage Blow 11, average a cast (5 hits)", o.avgHit * 5, 539, "assumed LUK 157, DEX 30 (Typical minus the DEX for the dagger); crits included");
  add("Lv35 Savage Blow 11, lowest a cast", o.min * 5, 314, "no crit on the low end"); add("Lv35 Savage Blow 11, highest a cast", o.max * 5, 763, "non-crit top; a crit top would be 20% higher"); }
// 2. Same player, Lucky Seven 20 with Meba and Wolbi: 474 (349 to 599); with a level 35 claw (Dark Guardian 26) 567 (417 to 716)
for (const [claw, star, avg, lo, hi] of [["Meba", 17, 474, 349, 599], ["Dark Guardian", 17, 567, 417, 716]]) {
  const b = { lv: 35, job: "Bandit", type: "sindit", str: 4, dex: 30, int: 4, luk: 157, w: "Claw", gear: { Claw: { watk: W[claw][2], spd: W[claw][4], ammoAtk: star } }, skills: { 4001003: 20 } };
  const o = pick(b, 4001003); add(`Lv35 Lucky Seven, ${claw} + Wolbi, average a cast`, o.avgHit * 2, avg, "same stat guess; the post says a level 35 claw, Dark Guardian assumed");
  add(`Lv35 Lucky Seven, ${claw} + Wolbi, lowest`, o.min * 2, lo, ""); add(`Lv35 Lucky Seven, ${claw} + Wolbi, highest`, o.max * 2, hi, "");
}
// 3. Level 52 polearm spearman, Polearm Mastery 20: range 364 to 881, Power Strike 946 to 2291, Slash Blast 473 to 1145, Final Attack 1274 to 3085
add("Lv52 Power Strike top / range top (skill 260%)", 2291 / 881 * 100, 260, "pure game-file check: skill % times the stat window range");
add("Lv52 Power Strike low / range low", 946 / 364 * 100, 260, "");
add("Lv52 Slash Blast top / range top (130%)", 1145 / 881 * 100, 130, "");
add("Lv52 Final Attack top / range top (350%)", 3085 / 881 * 100, 350, "");
// stat window: the top uses the swing multiplier 3.5, the low end the stab 1.5 with mastery 10. Solve STR from the ratio.
{ const want = 364 / 881; let best = null;
  for (const k of [0.7, 0.8]) for (let s = 150; s <= 320; s++) { const dex = 52, mf = (1 + 0.1) * k, mx = 1 + (s * 3.5 + dex) / 100, mn = 0.8 + (s * mf * 1.5 + dex) / 100; const r = mn / mx; if (Math.abs(r - want) < 0.0015) { best = best || {}; (best[k] = best[k] || []).push(s); } }
  rows.push({ name: "Lv52 polearm stat window low/high ratio 0.413: STR that fits", model: JSON.stringify(Object.fromEntries(Object.entries(best || {}).map(([k, v]) => [k, [v[0], v[v.length - 1]]]))), real: "STR not posted", off_pct: null,
    note: "Typical level 52 STR is 220 base plus gear: the 0.7 constant fits 233 to 242 STR; the 0.8 constant fits no STR from 150 to 320" }); }
// 4. Level 52 bandit, Korean Fan with 65 attack, maxed Savage Blow: stat window 216 to 417
{ const top = (luk, sec) => 65 * (1 + (luk * 2 + sec) / 100), low = (luk, sec, k) => 65 * (0.8 + (luk * 1.1 * k * 1.0 + sec) / 100);
  const out = {};
  for (const k of [0.7, 0.8]) { for (let luk = 180; luk <= 300; luk++) for (let sec = 29; sec <= 120; sec++) if (Math.abs(top(luk, sec) - 417) < 1 && Math.abs(low(luk, sec, k) - 216) < 1) { (out[k] = out[k] || []).push([luk, sec]); } }
  rows.push({ name: "Lv52 bandit stat window 216 to 417 (top stab 2.0, low swing 1.0)", model: JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v[0]]))), real: "LUK, STR, DEX not posted", off_pct: null,
    note: "only the 0.7 constant fits (first fit shown as [LUK, STR+DEX]); 0.8 fits no mix with STR+DEX of 29 or more" }); }
for (const r of rows) console.log((r.off_pct == null ? "fit" : (Math.abs(r.off_pct) <= 5 ? "OK " : "OFF")).padEnd(4), r.name.padEnd(62), String(r.model).padEnd(22), "real", String(r.real).padEnd(16), r.off_pct == null ? "" : (r.off_pct > 0 ? "+" : "") + r.off_pct + "%", "·", r.note);
module.exports = rows;
