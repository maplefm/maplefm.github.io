// Build guide check: runs the site's damage engine (assets/classic-dmg.js, unchanged) on the three guide builds
// (Sindit, Spearman spear, Spearman polearm) level by level, plus the training page's Typical builds for comparison.
//   node builds/tools/buildcheck.cjs <world.json from the live branch> [out.json]
// Weapon requirements and item ids: builds/tools/gear-snapshot.json (maplestory.io MCW 1.2 item metaInfo, Nov 25 2026)
// with live typical prices from data/summary-public.json (live branch) at the time of the snapshot.
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const CD = require(path.join(ROOT, "assets", "classic-dmg.js"));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "classic-skills.json"), "utf8"));
const E = CD.Engine(D);
const W = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const G = JSON.parse(fs.readFileSync(path.join(__dirname, "gear-snapshot.json"), "utf8"));
const OUT = process.argv[3];
const CAP = 100;

const ALLW = Object.values(D.weapons).flat();
function wpn(name) { const w = ALLW.find((x) => x[0] === name); const g = G[name] || {}; if (!w) throw new Error("no weapon " + name); return { name, id: g.id, lv: w[1], watk: w[2], spd: w[4], req: g.req || {} }; }
const STAR = Object.fromEntries(D.ammo.Claw.map((a) => [a[0].split(" ")[0], a[1]]));
function alloc(order, pts) { const out = {}; for (const [id, n] of order) { if (pts <= 0) break; const have = out[id] || 0, add = Math.min(n - have, pts); if (add > 0) { out[id] = have + add; pts -= add; } } return out; }
function sp1(L) { return L < 10 ? 0 : 1 + 3 * (Math.min(L, 30) - 10); }
function sp2(L) { return L < 30 ? 0 : 1 + 3 * (L - 30); }
const dps = (o) => o.avgHit * o.lines / o.ms * 1000;
function bestOf(b, only) { return E.attacks(b).filter((o) => !only || only.includes(String(o.id))).sort((a, c) => dps(c) - dps(a))[0]; }
// DEX needed by the weapon plan, raised in the levels before a new weapon (5 AP a level), never lowered
function dexPlan(sched, base, from) {
  const need = {}; for (let L = 1; L <= CAP; L++) { const cur = sched.filter((s) => s[0] <= L).pop(); need[L] = Math.max(base(L), cur ? (wpn(cur[1]).req.reqDEX || 0) : 0); }
  for (let L = CAP - 1; L >= from; L--) need[L] = Math.max(need[L], need[L + 1] - 5);
  for (let L = 2; L <= CAP; L++) need[L] = Math.max(need[L], need[L - 1]);
  return need;
}
const at = (sched, L) => (sched.filter((s) => s[0] <= L).pop() || [])[1];

// ------------------------------------------------------------------ Sindit (reset route, the guide build)
const SIN = {
  claws: [[10, "Garnier"], [15, "Steel Titans"], [20, "Bronze Igor"], [25, "Meba"], [30, "Mithril Guards"]],
  stars: [[10, "Subi"], [20, "Wolbi"]],
  daggers: [[35, "Halfmoon Zamadar"], [40, "Korean Fan"], [50, "Shinkita"], [60, "Deadly Fin"], [70, "Kandine"]],
  reset: 35,
  first: [[4001003, 20], [4000000, 15], [4000001, 15], [4001000, 3], [4001001, 8]],
  firstAfter: { 4001002: 20, 4000000: 15, 4001000: 6, 4001001: 20 },
  secondBefore: [[4201001, 20]],
  second: [[4200000, 5], [4201000, 1], [4200000, 20], [4201003, 21], [4201003, 30], [4201000, 20], [4201001, 5], [4201002, 30], [4201001, 20], [4200001, 20]],
};
// the same character without an SP reset: Bandit points go straight into the dagger book, swap at 40
const SIN_NR = { ...SIN, reset: null, swap: 40, daggers: [[40, "Korean Fan"], [50, "Shinkita"], [60, "Deadly Fin"], [70, "Kandine"]],
  second: [[4200000, 5], [4201000, 1], [4201003, 21], [4200000, 20], [4201003, 30], [4201000, 20], [4201001, 5], [4201002, 30], [4201001, 20], [4200001, 20]] };
function sinDex(P) { return dexPlan([[10, P.claws[0][1]], ...P.claws, ...P.daggers].sort((a, b) => a[0] - b[0]), (L) => (L >= 10 ? 25 : Math.min(25, 4 + 5 * (L - 1) + 21)), 30); }
function sindit(L, P, opt = {}) {
  P = P || SIN; const DX = sinDex(P); const total = 25 + 5 * (L - 1), dex = L < 10 ? Math.min(25, total - 12) : DX[L];
  const swapL = P.reset || P.swap, swapped = L >= swapL;
  const b = { lv: L, job: L >= 30 ? "Bandit" : "Thief", type: "sindit", str: 4, int: 4, dex, luk: total - dex - 8, w: "Claw", w2: "Dagger", swap: swapped ? L : 999, gear: {}, skills: {}, gearAcc: 0 };
  const c = wpn(at(P.claws, L) || "Garnier"), st = opt.stars || at(P.stars, L) || "Subi";
  b.gear.Claw = { name: c.name, watk: c.watk, spd: c.spd, ammo: st + " Throwing Stars", ammoAtk: STAR[st] };
  const dg = at(P.daggers, L); if (dg) { const d = wpn(dg); b.gear.Dagger = { name: d.name, watk: d.watk, spd: d.spd }; }
  if (P.reset && swapped) { Object.assign(b.skills, P.firstAfter); Object.assign(b.skills, alloc(P.second, sp2(L))); }
  else { Object.assign(b.skills, alloc(P.first, sp1(L))); Object.assign(b.skills, alloc(P.reset ? P.secondBefore : P.second, sp2(L))); }
  b.weapon = swapped ? b.gear.Dagger.name : c.name; b.ammo = swapped ? null : b.gear.Claw.ammo;
  return b;
}

// ------------------------------------------------------------------ Spearman, spear or polearm
const SPEAR = [[10, "Spear"], [15, "Fork on a Stick"], [20, "Fish Spear"], [30, "Forked Spear"], [35, "Nakamaki"], [40, "Zeco"], [45, "Bamboo Spear"], [50, "Serpent's Tongue"], [60, "Holy Spear"], [70, "Redemption"]];
const POLE = [[10, "Pole Arm"], [15, "Iron Ball"], [20, "Studded Polearm"], [25, "Janitor's Mop"], [30, "Mithril Pole Arm"], [35, "Axe Pole Arm"], [40, "Crescent Polearm"], [45, "Yellow Mop"], [50, "The Nine Dragons"], [60, "Skylar"], [70, "The Gold Dragon"]];
const WAR1 = [[1001001, 20], [1001002, 20], [1000000, 3], [1000001, 1], [1000002, 15], [1000000, 5]];
const WAR1_COMMUNITY = [[1001001, 20], [1001002, 20], [1000000, 3], [1000001, 1], [1000002, 5], [1000000, 15]];
function war2(cls) { const M = cls === "Spear" ? 1300000 : 1300001, B = cls === "Spear" ? 1301002 : 1301003, FA = cls === "Spear" ? 1301000 : 1301001;
  return [[M, 5], [B, 1], [1301005, 1], [M, 20], [FA, 30], [B, 20], [1301005, 20], [1301004, 30]]; }
function spearman(L, cls, opt = {}) {
  const sched = cls === "Spear" ? SPEAR : POLE, total = 25 + 5 * (L - 1);
  const DX = opt.dexless ? null : dexPlan(sched, () => 4, 10);
  const dex = opt.dexless ? 4 : DX[L], str = total - dex - 8;
  const x = wpn(at(sched, L) || sched[0][1]);
  const b = { lv: L, job: L >= 30 ? "Spearman" : "Warrior", type: "pure", str, dex, int: 4, luk: 4, w: cls, gear: { [cls]: { name: x.name, watk: x.watk, spd: x.spd } }, skills: {}, gearAcc: 0 };
  Object.assign(b.skills, alloc(opt.first || WAR1, sp1(L))); Object.assign(b.skills, alloc(war2(cls), sp2(L)));
  b.weapon = x.name; return b;
}
function polearmTypical(L) { const b = E.typical("Spearman", L); if (L < 10) return b; b.w = "Polearm"; const ws = D.weapons.Polearm.filter((x) => x[1] <= L).sort((a, c) => c[2] - a[2] || a[4] - c[4])[0]; b.gear = { Polearm: { name: ws[0], watk: ws[2], spd: ws[4] } }; b.skills = E.typicalSkills(b, L); return b; }

// ------------------------------------------------------------------ numbers for one build at one level
function row(b) {
  const o = bestOf(b), w = E.weaponAt(b, b.lv), g = b.gear[w] || {};
  const req = g.name && G[g.name] ? G[g.name].req : {};
  const wear = (!req.reqSTR || b.str >= req.reqSTR) && (!req.reqDEX || b.dex >= req.reqDEX) && (!req.reqLUK || b.luk >= req.reqLUK);
  return { lv: b.lv, str: b.str, dex: b.dex, luk: b.luk, acc: E.acc(b), weapon: g.name, ammo: g.ammo || null, attack: o.name, avg_line: Math.round(o.avgHit), lines: o.lines, ms: o.ms,
    dps: Math.round(dps(o)), min: Math.round(o.min), max: Math.round(o.max), crit: [Math.round(o.crit.rate * 100), Math.round(o.crit.dmg * 100)], can_wear: wear, skills: b.skills };
}
const TRAIN = ["Stirge", "Jr. Necki", "Wild Boar", "Evil Eye", "Ligator", "Fire Boar", "Curse Eye", "Jr. Wraith", "Lupin", "Lorang", "Zombie Lupin", "Skeledog", "Copper Drake", "Wraith", "Clang", "Drake", "Croco", "Malady", "Stone Golem", "Skeleton Soldier", "Dark Stone Golem", "Red Drake", "Wild Kargo", "Officer Skeleton", "Tauromacis", "Commander Skeleton", "Taurospear"];
function vsMobs(b) {
  const out = [];
  for (const n of TRAIN) { const m = W.mobs[n]; if (!m || m.lv > b.lv + 8 || m.lv < b.lv - 15) continue; const r = E.best(b, m); if (!r) continue;
    out.push({ mob: n, mlv: m.lv, hp: m.hp, wdef: m.wdef, eva: m.eva, hit: Math.round(r.hc * 100), casts: r.casts, kill_s: Math.round(r.kill * 10) / 10, attack: r.atk.name }); }
  return out;
}
function maps(b) { const r = E.rankMaps(b, W); return r.fit.slice(0, 3).map((h) => ({ map: h.pg, exp_h: Math.round(h.eph), kills_h: Math.round(h.kph), why: E.why(h) })); }

const KEY = [30, 40, 50, 60, CAP];
const res = { built: new Date().toISOString(), world_at: W.at || W.built, cap: CAP, builds: {} };
function run(key, make, typ) {
  const per = { levels: {}, key: {}, typical: {} };
  for (let L = 10; L <= CAP; L++) { const b = make(L); const r = row(b); if (L % 5 === 0 || L === 10 || KEY.includes(L) || [34, 35, 36, 39, 41, 43, 44, 47, 49].includes(L)) { r.mobs = vsMobs(b); r.maps = maps(b); } per.levels[L] = r; }
  if (typ) for (const L of KEY) { const t = typ(L), r = row(t); per.typical[L] = { weapon: r.weapon, ammo: r.ammo, stats: [t.str, t.dex, t.luk], attack: r.attack, dps: r.dps, acc: r.acc, can_wear: r.can_wear, maps: maps(t).slice(0, 1) }; }
  res.builds[key] = per;
}
run("sindit", (L) => sindit(L, SIN), (L) => E.typical("Bandit", L, "sindit"));
run("sindit_noreset", (L) => sindit(L, SIN_NR));
run("spearman_spear", (L) => spearman(L, "Spear"), (L) => E.typical("Spearman", L));
run("spearman_polearm", (L) => spearman(L, "Polearm"), polearmTypical);
// other builds of the same classes, engine typical only (compare tables)
const typOnly = { assassin: (L) => E.typical(L < 30 ? "Thief" : "Assassin", L, "assassin"), bandit: (L) => E.typical(L < 30 ? "Thief" : "Bandit", L, "bandit"), dexbandit: (L) => E.typical(L < 30 ? "Thief" : "Bandit", L, "dexbandit"),
  dexless_spearman: (L) => E.typical(L < 30 ? "Warrior" : "Spearman", L, "dexless"), sindit36: (L) => E.typical("Bandit", L, "sindit36") };
res.compare_typical = {};
for (const [k, f] of Object.entries(typOnly)) { res.compare_typical[k] = {}; for (const L of KEY) { const b = f(L), r = row(b), m = maps(b)[0]; res.compare_typical[k][L] = { weapon: r.weapon, attack: r.attack, dps: r.dps, acc: r.acc, can_wear: r.can_wear, best_map: m ? m.map : null, exp_h: m ? m.exp_h : 0 }; } }
// switch-level table for the Sindit: claw and Lucky Seven against the dagger, with and without the reset
res.switch = [];
for (let L = 30; L <= 50; L++) {
  const claw = sindit(L, { ...SIN, reset: 999, daggers: [] }), cr = row(claw), cm = maps(claw)[0];
  const rs = sindit(L, { ...SIN, reset: L, daggers: [[30, "Reef Claw"], [35, "Halfmoon Zamadar"], [40, "Korean Fan"], [50, "Shinkita"]] }), rr = row(rs), rm = maps(rs)[0];
  const nr = sindit(L, { ...SIN_NR, swap: L, daggers: [[30, "Reef Claw"], [35, "Halfmoon Zamadar"], [40, "Korean Fan"], [50, "Shinkita"]] }), nn = row(nr), nm = maps(nr)[0];
  res.switch.push({ lv: L, claw: [cr.attack, cr.dps, cm && cm.exp_h, cr.weapon], reset_dagger: [rr.attack, rr.dps, rm && rm.exp_h, rr.weapon], noreset_dagger: [nn.attack, nn.dps, nm && nm.exp_h, nn.weapon] });
}
// accuracy check for the warrior 1st job: Precise Strikes 15 (guide) against 5 (common advice)
res.precise = {};
for (const L of [30, 35, 40]) for (const cls of ["Spear", "Polearm"]) res.precise[cls + L] = { p15: vsMobs(spearman(L, cls)), p5: vsMobs(spearman(L, cls, { first: WAR1_COMMUNITY })), acc15: E.acc(spearman(L, cls)), acc5: E.acc(spearman(L, cls, { first: WAR1_COMMUNITY })) };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
for (const k of Object.keys(res.builds)) for (const L of KEY) { const r = res.builds[k].levels[L], t = res.builds[k].typical[L]; console.log(k.padEnd(17), L, r.weapon, r.attack, "dps", r.dps, "acc", r.acc, "wear", r.can_wear, (r.maps || []).map((m) => m.map + " " + Math.round(m.exp_h / 1000) + "K").join(" | "), t ? `|| typical ${t.weapon} ${t.dps} wear ${t.can_wear}` : ""); }
for (const s of res.switch) console.log("switch", s.lv, JSON.stringify(s.claw), JSON.stringify(s.reset_dagger), JSON.stringify(s.noreset_dagger));
