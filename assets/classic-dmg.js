// MapleStory Classic damage engine: how hard a character hits a monster, how often it lands and how fast it kills.
// Numbers come from the Classic World game files (assets/classic-skills.json: skills, weapons, stars and arrows).
// Formulas are the Classic models in claude/classic-mechanics.md; none has an in-game capture yet, so every result
// is an estimate. Works in the browser (window.ClassicDmg) and in node (require) for the tests and the fact check.
(function (root) {
  "use strict";

  // ------------------------------------------------------------------ jobs and builds
  // fam: the 1st job family. base: the 1st job book. job: the 2nd job book. w: weapon classes the job uses.
  var JOBS = {
    Beginner: { fam: "Beginner", w: ["1H Sword", "Dagger", "Claw", "Bow", "Wand"] },
    Warrior: { fam: "Warrior", base: 100, w: ["2H Sword", "1H Sword", "2H Axe", "1H Axe", "2H Blunt", "1H Blunt", "Spear", "Polearm"] },
    Fighter: { fam: "Warrior", base: 100, job: 110, w: ["2H Sword", "1H Sword", "2H Axe", "1H Axe"] },
    Page: { fam: "Warrior", base: 100, job: 120, w: ["2H Sword", "1H Sword", "2H Blunt", "1H Blunt"] },
    Spearman: { fam: "Warrior", base: 100, job: 130, w: ["Spear", "Polearm"] },
    Magician: { fam: "Magician", base: 200, w: ["Wand", "Staff"] },
    "Fire Poison Wizard": { fam: "Magician", base: 200, job: 210, w: ["Wand", "Staff"] },
    "Ice Lightning Wizard": { fam: "Magician", base: 200, job: 220, w: ["Wand", "Staff"] },
    Cleric: { fam: "Magician", base: 200, job: 230, w: ["Wand", "Staff"] },
    Bowman: { fam: "Bowman", base: 300, w: ["Bow", "Crossbow"] },
    Hunter: { fam: "Bowman", base: 300, job: 310, w: ["Bow"] },
    Crossbowman: { fam: "Bowman", base: 300, job: 320, w: ["Crossbow"] },
    Thief: { fam: "Thief", base: 400, w: ["Claw", "Dagger"] },
    Assassin: { fam: "Thief", base: 400, job: 410, w: ["Claw"] },
    Bandit: { fam: "Thief", base: 400, job: 420, w: ["Dagger", "Claw"] }
  };
  // build types. A sindit is a Bandit who keeps a claw and Lucky Seven, then swaps to a dagger and Savage Blow.
  // base: the saved type the account Worker knows (a hybrid saves as its base). stats: how typical() splits points.
  // swap: a fixed level the claw goes away. reset: at the swap, Lucky Seven's points move into the Bandit book.
  // desc: the plain line under the build picker. stat: the "Typical:" stat note when it differs from the job's.
  var BUILDS = {
    pure: { name: "Standard", jobs: null, desc: "The usual build for the job." },
    assassin: { name: "Assassin (claw)", jobs: ["Thief", "Assassin"], w: "Claw", desc: "Claw and Lucky Seven. LUK with 25 DEX." },
    bandit: { name: "Pure Bandit (dagger)", jobs: ["Thief", "Bandit"], w: "Dagger", desc: "Dagger from the start: Double Stab, then Savage Blow. LUK with 25 DEX." },
    sindit: { name: "Sindit (claw, then dagger)", jobs: ["Thief", "Bandit"], w: "Claw", w2: "Dagger", desc: "Bandit who kept Lucky Seven and throws until a dagger and Savage Blow hit harder, then swaps." },
    sindit36: { name: "Sindit (dagger at 36)", base: "sindit", jobs: ["Thief", "Bandit"], w: "Claw", w2: "Dagger", swap: 36, desc: "Sindit who swaps to a dagger and Savage Blow at level 36." },
    sinditreset: { name: "Sindit (reset at 40)", base: "sindit", jobs: ["Thief", "Bandit"], w: "Claw", w2: "Dagger", swap: 40, reset: true, desc: "Throws Lucky Seven to 40, then resets those points into Savage Blow and plays as a Bandit." },
    strbandit: { name: "STR Bandit (dagger)", base: "bandit", jobs: ["Thief", "Bandit"], w: "Dagger", stats: "str", desc: "Bandit with STR as the damage stat: LUK stays at 4, 25 DEX, the rest STR.", stat: "STR, 25 DEX, LUK 4" },
    dexassassin: { name: "Dexless Assassin (claw)", base: "assassin", jobs: ["Thief", "Assassin"], w: "Claw", stats: "dexless", desc: "Assassin with no DEX past the base 4: all LUK. Hits harder, misses more.", stat: "all LUK, DEX 4" },
    dexbandit: { name: "Dexless Bandit (dagger)", base: "bandit", jobs: ["Thief", "Bandit"], w: "Dagger", stats: "dexless", desc: "Bandit with no DEX past the base 4: all LUK. Hits harder, misses more.", stat: "all LUK, DEX 4" },
    dexless: { name: "Dexless warrior", base: "pure", jobs: ["Warrior", "Fighter", "Page", "Spearman"], stats: "dexless", desc: "Warrior with DEX left at 4: all STR. Hits harder, misses more.", stat: "all STR, DEX 4" },
    lukmage: { name: "LUK mage", base: "pure", jobs: ["Magician", "Fire Poison Wizard", "Ice Lightning Wizard", "Cleric"], stats: "luk", desc: "Mage who raises LUK with the level (for thief gear): less INT, a little more accuracy.", stat: "LUK = level, rest INT" }
  };
  // the build types a job can pick, in picker order (Standard first for non-thieves)
  function buildTypes(job) {
    var fam = (JOBS[job] || {}).fam, out = fam === "Thief" ? [] : ["pure"];
    Object.keys(BUILDS).forEach(function (k) { if (BUILDS[k].jobs && BUILDS[k].jobs.indexOf(job) >= 0) out.push(k); });
    return out;
  }
  function isSwap(type) { return !!(BUILDS[type] && BUILDS[type].w2); }
  function baseType(type) { return (BUILDS[type] && BUILDS[type].base) || type; }
  // classicrank job names to ours
  var JOB_ALIAS = { "Fire/Poison Wizard": "Fire Poison Wizard", "Fire/Poison": "Fire Poison Wizard", "F/P Wizard": "Fire Poison Wizard", "Wizard (Fire, Poison)": "Fire Poison Wizard", "Wizard (Fire/Poison)": "Fire Poison Wizard",
    "Ice/Lightning Wizard": "Ice Lightning Wizard", "Ice/Lightning": "Ice Lightning Wizard", "I/L Wizard": "Ice Lightning Wizard", "Wizard (Ice, Lightning)": "Ice Lightning Wizard", "Wizard (Ice/Lightning)": "Ice Lightning Wizard",
    Swordman: "Warrior", Swordsman: "Warrior", Archer: "Bowman", Rogue: "Thief", Mage: "Magician" };
  function jobName(s) { if (!s) return ""; s = String(s).trim(); if (JOBS[s]) return s; if (JOB_ALIAS[s]) return JOB_ALIAS[s]; var k = Object.keys(JOBS).filter(function (j) { return j.toLowerCase() === s.toLowerCase(); })[0]; return k || ""; }

  // weapon multiplier on the primary stat. Ordinary attacks roll 60% swing, 40% stab.
  var WMULT = { "1H Sword": [1.8, 1.8], "2H Sword": [2.5, 2.5], "1H Axe": [2.4, 1.2], "1H Blunt": [2.4, 1.2], "2H Axe": [3.0, 2.0], "2H Blunt": [3.0, 2.0],
    Spear: [1.5, 3.5], Polearm: [3.5, 1.5], Dagger: [1.0, 2.0], Wand: [1.8, 1.8], Staff: [1.8, 1.8] };
  var RANGED = { Bow: 1, Crossbow: 1, Claw: 1 };
  // the stat-window weapon class for each skill's weapon codes in the game files
  var WCODE = { 30: "1H Sword", 31: "1H Axe", 32: "1H Blunt", 33: "Dagger", 40: "2H Sword", 41: "2H Axe", 42: "2H Blunt", 43: "Spear", 44: "Polearm", 45: "Bow", 46: "Crossbow", 47: "Claw" };
  // mastery skill and booster for each weapon class (skill ids)
  var MASTERY = { "1H Sword": [1100000, 1200000], "2H Sword": [1100000, 1200000], "1H Axe": [1100001], "2H Axe": [1100001], "1H Blunt": [1200001], "2H Blunt": [1200001],
    Spear: [1300000], Polearm: [1300001], Bow: [3100000], Crossbow: [3200000], Claw: [4100000], Dagger: [4200000] };
  var BOOSTER = { "1H Sword": [1101002, 1201002], "2H Sword": [1101002, 1201002], "1H Axe": [1101003], "2H Axe": [1101003], "1H Blunt": [1201003], "2H Blunt": [1201003],
    Spear: [1301002], Polearm: [1301003], Bow: [3101001], Crossbow: [3201001], Claw: [4101000], Dagger: [4201000] };
  // animation frames (ms) from the game files; the time an attack takes is these, scaled by the speed tier
  var FRAMES = { swing: [300, 150, 350], stabO: [350, 450], stabT: [300, 100, 350], shoot1: [300, 150, 350], shoot2: [160, 160, 250, 100, 150],
    savage: [120, 120, 120, 120, 120, 120, 120, 120], alert2: [200, 200, 200], rush: [100, 300] };
  function actionMs(frames, tier) {
    tier = Math.max(0, Math.min(10, tier)); var s = 0;
    frames.forEach(function (d) { s += Math.floor(Math.abs(d) * (10 + tier) / 16); });
    return 30 * Math.ceil(s / 30);
  }

  // attack skills the model knows how to use. kind p = physical, m = magic.
  // w: weapon classes it needs (null: any the job holds). mult: fixed multiplier (Lucky Seven 3.0 with mastery 0.5).
  var ATTACKS = {
    basic: { name: "Regular attack", kind: "p" },
    1001001: { kind: "p" }, // Power Strike
    1001002: { kind: "p", targets: 6 }, // Slash Blast (no target count in the files; the description says 6)
    2001002: { kind: "m" }, // Energy Bolt
    2001003: { kind: "m" }, // Magic Claw
    2101003: { kind: "m" }, // Fire Arrow
    2101004: { kind: "m" }, // Poison Breath (explosion)
    2201003: { kind: "m" }, // Cold Beam
    2201004: { kind: "m" }, // Thunder Bolt
    2301004: { kind: "m" }, // Holy Arrow
    2301001: { kind: "heal" }, // Heal, hurts undead
    3001001: { kind: "p", w: ["Bow", "Crossbow"] }, // Arrow Blow
    3001002: { kind: "p", w: ["Bow", "Crossbow"] }, // Double Shot
    3101004: { kind: "p", w: ["Bow"] }, // Arrow Bomb (explosion)
    3201004: { kind: "p", w: ["Crossbow"] }, // Iron Arrow
    4001002: { kind: "p", w: ["Dagger"], stab: true }, // Double Stab: always a stab
    4001003: { kind: "p", w: ["Claw"], mult: 3.0, mf: 0.5 }, // Lucky Seven
    4101002: { kind: "p", w: ["Claw"] }, // Drain
    4201003: { kind: "p", w: ["Dagger"], stab: true, frames: "savage" }, // Savage Blow
    1101005: { kind: "p", frames: "rush", cd: 2 }, 1201005: { kind: "p", frames: "rush", cd: 2 }, 1301005: { kind: "p", frames: "rush", cd: 2 } // Rush
  };

  // typical skill order by job (where skill points go first). Points: 1 at level 10 then 3 a level; again at 30.
  var ORDER = {
    100: [[1001001, 20], [1000002, 15], [1001002, 20], [1000000, 10]],
    110: [["mastery", 20], ["booster", 20], [1101004, 30], [1101005, 20]],
    120: [["mastery", 20], ["booster", 20], [1201005, 20]],
    130: [["mastery", 20], ["booster", 20], [1301005, 20]],
    200: [[2001002, 1], [2001003, 20], [2000000, 10], [2001001, 15]],
    210: [[2101003, 30], [2101000, 20], [2101004, 30]],
    220: [[2201003, 30], [2201004, 30], [2201000, 20]],
    230: [[2301001, 30], [2301004, 30], [2301003, 20]],
    300: [[3001001, 20], [3000000, 15], [3001000, 20], [3001002, 20]],
    310: [["mastery", 20], ["booster", 20], [3101004, 30]],
    320: [["mastery", 20], ["booster", 20], [3201004, 30]],
    "400claw": [[4001003, 20], [4000000, 15], [4000001, 8]],
    "400dagger": [[4001002, 20], [4000000, 15], [4000001, 8]],
    410: [["mastery", 20], ["booster", 20], [4100001, 30], [4101002, 30]],
    420: [[4201003, 30], ["mastery", 20], ["booster", 20]]
  };
  // stars and arrows a typical player uses by level (an assumption, shown on the page)
  function typicalAmmo(D, cls, L) {
    var a = D.ammo[cls] || []; if (!a.length) return [null, 0];
    if (cls !== "Claw") return a[Math.min(a.length - 1, 1)];
    return a[Math.min(a.length - 1, L < 20 ? 0 : L < 30 ? 1 : L < 40 ? 2 : L < 50 ? 3 : L < 60 ? 4 : 5)];
  }
  // the best clean weapon for the level: the most attack (magic attack for mages), the faster one on a tie
  function typicalWeapon(D, cls, L, mage) {
    var best = null;
    (D.weapons[cls] || []).forEach(function (w) {
      if (w[1] > L) return; var v = mage ? w[3] : w[2], b = best && (mage ? best[3] : best[2]);
      if (!best || v > b || (v === b && w[4] < best[4])) best = w;
    });
    return best;
  }

  function lvOf(sk, field, lv) { var v = sk && sk.lv[field]; if (v == null || !lv) return 0; return Array.isArray(v) ? (v[Math.min(lv, v.length) - 1] || 0) : v; }

  function Engine(D) {
    var S = D.skills;
    function sk(id) { return S[String(id)]; }
    function jobBooks(job) { var j = JOBS[job] || JOBS.Beginner, b = []; if (j.base) b.push(j.base); if (j.job) b.push(j.job); return b; }
    // weapon class this build uses at level L
    function weaponAt(b, L) { var bt = BUILDS[b.type] || {}; if (bt.w2 && L >= (b.swap || 999)) return b.w2 || bt.w2; return b.w || bt.w || (JOBS[b.job] || JOBS.Beginner).w[0]; }

    // ---------------------------------------------------------------- a typical character (generic mode)
    function typical(job, L, type, swap) {
      job = jobName(job) || "Beginner"; if (L < 10) job = job === "Beginner" ? "Beginner" : job;
      var J = JOBS[job], fam = J.fam, total = 25 + 5 * (L - 1);
      var b = { lv: L, job: job, type: type || (fam === "Thief" ? (job === "Bandit" ? "bandit" : "assassin") : "pure"), generic: true, gearAcc: 0, notes: [] };
      var bt = BUILDS[b.type] || BUILDS.pure; b.w = bt.w || J.w[0]; if (bt.w2) { b.w2 = bt.w2; b.swap = bt.swap || swap || null; }
      // stats: an assumption per family and build, shown on the page
      if (fam === "Warrior") { b.dex = bt.stats === "dexless" ? 4 : Math.max(4, Math.min(L, total - 12)); b.int = 4; b.luk = 4; b.str = total - b.dex - 8; }
      else if (fam === "Magician") { b.str = 4; b.dex = 4; b.luk = bt.stats === "luk" ? Math.max(4, Math.min(L, total - 12)) : 4; b.int = total - 8 - b.luk; }
      else if (fam === "Bowman") { b.str = 4; b.int = 4; b.luk = 4; b.dex = total - 12; }
      else if (fam === "Thief" && bt.stats === "str") { b.luk = 4; b.int = 4; b.dex = Math.min(25, total - 8); b.str = total - b.dex - 8; }
      else if (fam === "Thief") { b.str = 4; b.int = 4; b.dex = bt.stats === "dexless" ? 4 : Math.min(25, total - 8); b.luk = total - b.dex - 8; }
      else { b.str = Math.max(4, total - 12); b.dex = 4; b.int = 4; b.luk = 4; }
      // gear for each weapon the build will hold
      b.gear = {};
      [b.w, b.w2].forEach(function (c) {
        if (!c) return; var w = typicalWeapon(D, c, L, fam === "Magician"), a = typicalAmmo(D, c, L);
        b.gear[c] = { name: w ? w[0] : "no weapon", watk: w ? w[2] : 0, matk: w ? w[3] : 0, spd: w ? w[4] : 6, ammo: a[0], ammoAtk: a[1] || 0 };
      });
      b.skills = typicalSkills(b, L);
      if (bt.w2 && !b.swap) b.swap = swapLevel(b);
      return b;
    }
    // where skill points go: the job's usual order, at the level given
    function typicalSkills(b, L) {
      var out = {}, J = JOBS[b.job];
      function spend(order, pts, w) {
        order.forEach(function (o) {
          if (pts <= 0) return; var id = o[0];
          if (id === "mastery" || id === "booster") { var ids = (id === "mastery" ? MASTERY : BOOSTER)[w] || []; id = ids.filter(function (x) { return sk(x) && Math.floor(x / 10000) === J.job; })[0]; if (!id) return; }
          if (!sk(id)) return; var n = Math.min(o[1], sk(id).max, pts); out[id] = n; pts -= n;
        });
      }
      var moved = 0;
      if (L >= 10 && J.base) {
        var key = J.base === 400 ? (b.w === "Dagger" ? "400dagger" : "400claw") : J.base;
        // a sindit or Bandit keeps Lucky Seven from the claw days; a pure bandit learns Double Stab
        spend(ORDER[key], 1 + 3 * (Math.min(L, 30) - 10));
        // a reset sindit: from the swap level, Lucky Seven's points go into the Bandit book (Savage Blow first)
        if ((BUILDS[b.type] || {}).reset && J.job && L >= (b.swap || 999) && out[4001003]) { moved = out[4001003]; delete out[4001003]; }
      }
      if (L >= 30 && J.job) spend(ORDER[J.job], 1 + 3 * (L - 30) + moved, b.w2 && L >= (b.swap || 999) ? b.w2 : b.w2 || b.w);
      return out;
    }

    // ---------------------------------------------------------------- the character's numbers
    function acc(b) {
      var fam = (JOBS[b.job] || JOBS.Beginner).fam, L = b.lv, c = 1.2 * b.dex + 2 * L + 0.6 * b.luk, a;
      if (fam === "Magician") a = Math.floor((1.2 * b.int + 2 * L + 0.6 * b.luk) / 5.1 + 20);
      else if (fam === "Warrior") a = Math.floor(c / 2.5 + 10);
      else if (fam === "Bowman") a = Math.floor(c / 4.8 + 20);
      else if (fam === "Thief") a = Math.floor(c / 4 + 15);
      else a = Math.floor(c / 2.5 + 5);
      // passives: Precise Strikes, Nimble Body, Sword Mastery; Focus counted as kept up
      [1000002, 4000000].forEach(function (id) { a += lvOf(sk(id), "acc", b.skills[id] || 0); });
      var w = weaponAt(b, L); [1100000, 1200000].forEach(function (id) { if ((w === "1H Sword" || w === "2H Sword") && b.skills[id]) a += lvOf(sk(id), "x", b.skills[id]); });
      if (b.skills[3001000]) a += lvOf(sk(3001000), "acc", b.skills[3001000]);
      if (b.accTotal) return b.accTotal;   // the player's own stat-window number wins
      return a + (b.gearAcc || 0);
    }
    function crit(b, w) {
      var r = 5, d = 20, s = b.skills;
      if (s[1000002]) r += lvOf(sk(1000002), "cr", s[1000002]);
      if (s[3000000] && (w === "Bow" || w === "Crossbow")) { r += lvOf(sk(3000000), "cr", s[3000000]); d += lvOf(sk(3000000), "cd", s[3000000]); }
      if (s[3100000] && w === "Bow") r += lvOf(sk(3100000), "x", s[3100000]);
      if (s[3200000] && w === "Crossbow") d += lvOf(sk(3200000), "x", s[3200000]);
      if (s[1200001] && (w === "1H Blunt" || w === "2H Blunt")) d += lvOf(sk(1200001), "x", s[1200001]);
      if (s[4100001] && w === "Claw") { r += lvOf(sk(4100001), "cr", s[4100001]); d += lvOf(sk(4100001), "cd", s[4100001]); }
      if (s[4200000] && w === "Dagger") r += lvOf(sk(4200000), "x", s[4200000]);
      return { rate: Math.min(100, r) / 100, dmg: d / 100 };
    }
    function masteryLv(b, w) { var ids = MASTERY[w] || []; for (var i = 0; i < ids.length; i++) if (b.skills[ids[i]]) return lvOf(sk(ids[i]), "ms", b.skills[ids[i]]); return 0; }
    function tier(b, w, g) { var t = g.spd || 6; (BOOSTER[w] || []).forEach(function (id) { if (b.skills[id]) t -= 2; }); return t; }

    // every attack this build can use at its level with the weapon it holds then
    function attacks(b) {
      var L = b.lv, w = weaponAt(b, L), g = (b.gear || {})[w] || {}, out = [], fam = (JOBS[b.job] || JOBS.Beginner).fam;
      Object.keys(b.skills).forEach(function (id) {
        var A = ATTACKS[id], s = sk(id), lv = b.skills[id]; if (!A || !s || !lv) return;
        if (A.w && A.w.indexOf(w) < 0) return;
        out.push(attack(b, id, lv, w, g));
      });
      if (fam !== "Magician") out.push(attack(b, "basic", 1, w, g));
      return out.filter(Boolean);
    }
    function attack(b, id, lv, w, g) {
      var A = ATTACKS[id], s = sk(id) || { n: "Regular attack", lv: {} }, fam = (JOBS[b.job] || JOBS.Beginner).fam;
      var o = { id: id, name: A.name || s.n, lv: lv, kind: A.kind, el: s.el || "", w: w, weapon: g.name, ammo: g.ammo };
      var hits = lvOf(s, "h", lv) || 1, proj = lvOf(s, "b", lv) || 1;
      o.lines = hits * (proj > 1 ? proj : 1);   // damage lines per cast: Lucky Seven throws 2 stars
      o.targets = lvOf(s, "t", lv) || A.targets || 1;
      if (A.kind === "p") {
        var P, Sec;
        if (w === "Claw" || w === "Dagger") { P = b.luk; Sec = b.str + b.dex; }
        else if (w === "Bow" || w === "Crossbow") { P = b.dex; Sec = b.str; }
        else { P = b.str; Sec = b.dex; }
        var M = A.mult || (RANGED[w] ? 2.5 : WMULT[w] ? (A.stab ? WMULT[w][1] : 0.6 * WMULT[w][0] + 0.4 * WMULT[w][1]) : 1.0);
        var mf = A.mf != null ? A.mf : (masteryLv(b, w) / 10 + 0.1) * 0.7;
        var ap = w === "Claw" && b.skills[4100000] ? lvOf(sk(4100000), "x", b.skills[4100000]) : 0;
        var watk = (g.watk || 0) + (g.scroll || 0) + (RANGED[w] ? g.ammoAtk || 0 : 0);
        var S = (id === "basic" ? 100 : lvOf(s, "d", lv)) / 100;
        o.max = S * watk * (1.0 + (P * M + Sec) / 100 + ap / 50);
        o.min = S * watk * (0.8 + (P * mf * M + Sec) / 100 + ap / 50);
        o.avg = S * watk * (0.9 + (P * (mf + 1) / 2 * M + Sec) / 100 + ap / 50);
        // the stat-window range the player typed: scale the model to it, keeping the skill % and weapon mix
        if (b.range && b.range[1] > 0 && b.rangeW === w) {
          var bMax = watk * (1.0 + (P * M + Sec) / 100 + ap / 50), k = b.range[1] / bMax;
          o.max *= k; o.avg *= k; o.min *= k; o.fromRange = true;
        }
        var c = crit(b, w); o.crit = c; o.avgHit = o.avg * (1 + c.rate * c.dmg);
        var fr = A.frames ? FRAMES[A.frames] : w === "Bow" ? FRAMES.shoot1 : w === "Crossbow" ? FRAMES.shoot2 : (A.stab ? FRAMES.stabO : FRAMES.swing);
        if (!A.frames && !A.stab && WMULT[w] && w !== "Wand" && w !== "Staff") { var st = /2H|Spear|Polearm/.test(w) ? FRAMES.stabT : FRAMES.stabO; o.ms = Math.round(0.6 * actionMs(FRAMES.swing, tier(b, w, g)) + 0.4 * actionMs(st, tier(b, w, g))); }
        else o.ms = actionMs(fr, tier(b, w, g));
        if (A.cd) o.ms = Math.max(o.ms, A.cd * 1000);
        o.def = "wdef";
      } else {
        var MT = Math.floor(b.int / 2) + (b.matk != null ? b.matk : g.matk || 0), msl = lvOf(s, "ms", lv), mfm = (msl / 10 + 0.1) * 0.7;
        if (A.kind === "heal") {
          // Heal on undead (Classic model, unconfirmed): average roll, one monster plus you
          var x = lvOf(s, "x", lv) / 100, pool = ((b.int * 0.65 + b.luk) / 1000 + 2.5) * MT * x;
          o.avg = pool * 1.5 / 2 / 1.5; o.max = o.avg * 1.3; o.min = o.avg * 0.4; o.undeadOnly = true; o.el = "Holy"; o.unconfirmed = true;
        } else {
          var Sm = lvOf(s, "m", lv) / 100;
          o.max = Sm * MT * (1 + b.int / 125); o.min = Sm * MT * (1 + b.int * mfm / 125); o.avg = (o.max + o.min) / 2;
        }
        if (b.range && b.range[1] > 0 && b.rangeW === "magic") { var k2 = b.range[1] / (MT * (1 + b.int / 125)); o.max *= k2; o.avg *= k2; o.min *= k2; o.fromRange = true; }
        o.crit = { rate: 0.05, dmg: 0.2 }; o.avgHit = o.avg * 1.01;
        o.ms = A.kind === "heal" ? actionMs(FRAMES.alert2, 6) : actionMs(FRAMES.swing, 6);   // spells cast at a fixed speed
        o.def = "mdef";
      }
      return o;
    }

    // ---------------------------------------------------------------- against one monster
    // element: the monster's game-file code (F3 = weak to fire, 2 = resists, 1 = immune), or the wiki's weak/resist names
    function elemMult(mob, el) {
      if (!el) return 1;
      var code = mob.elem || "", L = { Fire: "F", Ice: "I", Lightning: "L", Poison: "S", Holy: "H" }[el], m = code.match(new RegExp(L + "(\\d)"));
      if (m) return m[1] === "1" ? 0 : m[1] === "2" ? 0.75 : m[1] === "3" ? 1.25 : 1;
      if (el === "Holy" && mob.undead) return 1.25;
      if ((mob.immune || "").indexOf(el) >= 0) return 0;
      if ((mob.weak || "").indexOf(el) >= 0) return 1.25;
      if ((mob.resist || "").indexOf(el) >= 0) return 0.75;
      return 1;
    }
    function gapMult(mob, L) { var g = mob.lv - L; return g >= 10 ? 1 / (1 + g * 0.05) : g > 0 ? 1 / (1 + g * g * 0.005) : 1; }
    function hitChance(a, L, mob, kind) {
      var G = Math.max(0, mob.lv - L), A = a * 100 / (10 * G + 255), av = mob.eva || 0, D = A - av;
      if (!av || D >= 25 + G * (L / 2 + 15)) return 1;
      var f = 0.15 + 0.2 / (1 + Math.exp(D / 12)), q = av / A;
      return q <= 1 - f ? 1 : q >= 1 + f ? 0 : (1 + f - q) / (2 * f);
    }
    function accNeeded(L, mob) { for (var a = 1; a < 500; a++) if (hitChance(a, L, mob) >= 1) return a; return 500; }
    // one attack on one monster: damage that lands, casts to kill, seconds to kill
    function onMob(b, o, mob) {
      if (o.undeadOnly && !mob.undead) return null;
      var r = { atk: o, defMult: 100 / ((mob[o.def] || 0) + 100), gap: gapMult(mob, b.lv), el: elemMult(mob, o.el) };
      // Spear Mastery: a chance to ignore weapon defense entirely
      if (o.kind === "p" && o.w === "Spear" && b.skills[1300000]) { var gi = lvOf(sk(1300000), "p", b.skills[1300000]) / 100; r.defMult = (1 - gi) * r.defMult + gi; }
      r.line = Math.max(1, o.avgHit * r.defMult * r.gap * r.el);
      r.lineMin = Math.max(1, o.min * r.defMult * r.gap * r.el); r.lineMax = Math.max(1, o.max * (1 + o.crit.dmg) * r.defMult * r.gap * r.el);
      if (r.el === 0) { r.line = 0; r.lineMin = 0; r.lineMax = 0; }
      r.hc = hitChance(acc(b), b.lv, mob, o.kind);
      r.perCast = r.line * o.lines;
      r.casts = r.perCast > 0 ? Math.ceil(mob.hp / r.perCast) : Infinity;
      r.kill = r.hc > 0 && isFinite(r.casts) ? r.casts * o.ms / 1000 / r.hc : Infinity;
      return r;
    }
    // the attack that kills this monster fastest, single target
    function best(b, mob) {
      var top = null;
      attacks(b).forEach(function (o) { var r = onMob(b, o, mob); if (r && (!top || r.kill < top.kill)) top = r; });
      return top;
    }
    // the level a sindit's dagger and Savage Blow start beating a claw and Lucky Seven on a plain monster
    function swapLevel(b0) {
      var dummy = { lv: 1, hp: 1e6, wdef: 0, mdef: 0, eva: 0 };
      for (var L = 31; L <= 100; L++) {
        var b = typical("Bandit", L, "sindit", 999), c = best(b, dummy);   // the swap only exists with the Bandit book
        var d = typical("Bandit", L, "sindit", L), e = best(d, dummy);
        if (c && e && e.atk.w === "Dagger" && e.perCast / e.atk.ms > c.perCast / c.atk.ms) return L;
      }
      return 100;
    }

    // ---------------------------------------------------------------- an hour on one map
    // Every monster type that makes up a tenth or more of the spawns must pass the bar, or the map isn't ranked:
    // land at least HIT_BAR of attacks and kill one in KILL_BAR seconds or less. Monsters under the bar that are rarer
    // than that are walked past and leave the hour.
    var HIT_BAR = 0.8, KILL_BAR = 8;
    function mapHour(b, m, mobs) {
      var rows = [], all = 0;
      (m.mobs || []).forEach(function (x) { var mb = mobs[x[0]]; if (!mb || mb.boss || !mb.hp) return; all += x[1]; rows.push({ name: x[0], n: x[1], mob: mb, r: best(b, mb) }); });
      if (!all) return null;
      var tot = 0, exp = 0, ks = 0, fit = true, why = [];
      rows.forEach(function (row) {
        var r = row.r; row.ok = !!r && r.hc >= HIT_BAR && r.kill <= KILL_BAR;
        if (!row.ok) { if (row.n / all >= 0.1) { fit = false; why.push(row); } return; }
        tot += row.n; exp += row.mob.exp * row.n; ks += r.kill * row.n;
      });
      var out = { rows: rows, all: all, fit: fit && tot > 0, fail: why };
      if (!tot) return out;
      exp /= tot; ks /= tot;
      // walking between monsters: shorter on busy maps (an estimate). Refill: most maps every 7.5 s with 3 of 4 spawn
      // points reachable solo; monsters with their own timer in the wiki refill no faster than it.
      var walk = 0.8 + 12 / Math.sqrt(all), cap = 0;
      rows.forEach(function (row) { if (!row.ok) return; var rt = m.respawn && typeof m.respawn === "object" ? m.respawn[row.name] : 0; cap += rt ? row.n * 3600 / Math.max(rt, 7.56) : row.n * 0.75 * 3600 / 7.56; });
      var kph = Math.min(3600 / (ks + walk), cap * 0.8);
      out.exp = exp; out.ks = ks; out.walk = walk; out.cap = cap * 0.8; out.capped = 3600 / (ks + walk) > cap * 0.8; out.kph = kph; out.eph = kph * exp; out.reach = tot;
      return out;
    }

    // every training map near the level, ranked by EXP an hour. Maps that fail the bar come back in "skip" with why.
    // Not training spots: towns, boss rooms and quest maps (a boss or a test monster spawns there).
    function rankMaps(b, W, o) {
      o = o || {}; var L = b.lv, fit = [], skip = [];
      // maps no portal leads to are only reached through an NPC (party quest stages, quest rooms): not training spots
      if (!W.__inc) { W.__inc = {}; Object.keys(W.maps).forEach(function (p) { (W.maps[p].portals || []).forEach(function (x) { if (x[0] !== p) W.__inc[x[0]] = 1; }); }); }
      Object.keys(W.maps).forEach(function (pg) {
        var m = W.maps[pg]; if (m.type === "Town" || !m.mobs || !m.mobs.length || !W.__inc[pg]) return;
        if (m.mobs.some(function (x) { var mb = W.mobs[x[0]]; return !mb || mb.boss || mb.lv >= 150 || !mb.hp; })) return;
        var n = 0, lv = 0; m.mobs.forEach(function (x) { var mb = W.mobs[x[0]]; n += x[1]; lv += mb.lv * x[1]; }); lv /= n;
        if (lv < L - (o.below || 15) || lv > L + (o.above || 10)) return;
        var h = mapHour(b, m, W.mobs); if (!h) return; h.pg = pg; h.m = m; h.lv = lv;
        (h.fit ? fit : skip).push(h);
      });
      fit.sort(function (a, c) { return c.eph - a.eph; });
      // past the highest maps in the game, look further down rather than show nothing
      if (!fit.length && !o.below) return rankMaps(b, W, { below: 35, above: o.above });
      return { fit: fit, skip: skip };
    }
    // a few words on why a map suits this build
    function why(h) {
      var main = null; h.rows.forEach(function (r) { if (r.ok && (!main || r.n > main.n)) main = r; });
      if (!main) return "";
      var r = main.r, a = r.atk.name + (r.casts === 1 ? " kills " + main.name + " in 1 cast" : ": " + r.casts + " casts per " + main.name);
      var el = r.el > 1 ? " · weak to " + r.atk.el.toLowerCase() : r.el < 1 && r.el > 0 ? " · resists " + r.atk.el.toLowerCase() : "";
      return a + el + (r.hc < 1 ? " · " + Math.round(r.hc * 100) + "% hit" : "") + " · " + h.all + " spawns" + (h.capped ? " · respawn-limited" : "");
    }

    return { JOBS: JOBS, BUILDS: BUILDS, buildTypes: buildTypes, isSwap: isSwap, baseType: baseType, jobName: jobName, typical: typical, mapHour: mapHour, rankMaps: rankMaps, why: why, HIT_BAR: HIT_BAR, KILL_BAR: KILL_BAR, HIT_BAR: HIT_BAR, KILL_BAR: KILL_BAR, typicalSkills: typicalSkills, acc: acc, attacks: attacks, onMob: onMob, best: best,
      hitChance: hitChance, accNeeded: accNeeded, elemMult: elemMult, gapMult: gapMult, actionMs: actionMs, FRAMES: FRAMES, weaponAt: weaponAt, swapLevel: swapLevel, skill: sk };
  }

  var API = { Engine: Engine, JOBS: JOBS, BUILDS: BUILDS, buildTypes: buildTypes, isSwap: isSwap, baseType: baseType, jobName: jobName, actionMs: actionMs, FRAMES: FRAMES };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.ClassicDmg = API;
})(typeof window !== "undefined" ? window : this);
