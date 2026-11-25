# Damage engine audit, Nov 25, 2026

Engine: `assets/classic-dmg.js`, `assets/classic-skills.json`, `tools/trainrank.cjs`. Not changed.
Game files: maplestory.io MCW **1.2** (tools/mcwver.py picks it; it holds client v2.0.0). Live game: **v2.1.0** (Nexon notice 49052, Nov 24).
MeowDB: not used in any way. Pages that cite it (ms-classic.com guides, maplestory-classic.com, mmojugg, fullboosts, mapleil.com) were dropped as sources.

## Counts

| Checked | Count | Wrong | Unconfirmed |
|---|---|---|---|
| Skill numbers in classic-skills.json vs MCW 1.2 (90 skills, every level) | 325 fields | 0 | 0 |
| Weapons: level, attack, speed vs MCW 1.2 | 56 | 0 | 0 |
| Throwing star attack vs MCW 1.2 | 6 | 0 | 0 |
| Weapon stat requirements (new, for the guides) | 60 items | n/a | 0 |
| Formulas and rules in the engine | 31 | 0 | 14 (11 more only "supported") |
| Engine behaviour and data | 12 | 4 | 3 |
| dmgtest.cjs on live world.json | 22 cases | 0 differ | 5 no real number |

Formula verdicts: **6 confirmed**, **11 supported**, **14 unconfirmed**, **0 shown wrong**.

1. **Confirmed:** game files say it, or 3 independent sources agree, or exact real numbers prove it.
2. **Supported:** 2 independent sources, or real on-screen numbers fit within 3% with assumed stats.
3. **Unconfirmed:** 1 source, or sources conflict.

## Sources and how many count

| Source | Type | Counts as |
|---|---|---|
| Live-client datamine (github ohmi69/osms_datamine_dashboard, osmsdataexplorer.com) | Classic, read from MapleStory.exe | 1 |
| henesys.gg formulas, ms-classic.com/tools/formulas | Classic, quote the datamine | same as datamine |
| mapleclassic.wiki mechanics pages | Classic, closed test 1 snapshot, tagged "pre-launch" | 1, often stale |
| Game files (maplestory.io MCW 1.2) | Classic numbers, no formulas | confirms numbers |
| Nexon notices 46506, 48255, 49052 | official | confirms cap, patches |
| r/MSClassicWorld posts with on-screen numbers | Classic, real | real data, stats partly missing |
| Old GMS guides (ayumilove, SouthPerry, GameFAQs) | old GMS | support only |

So almost every formula has one live source. The wiki's Damage and Accuracy pages match the datamine's closed test 1 versions, which Nexon changed before launch.

## Real on-screen numbers (builds/tools/realcheck.cjs)

| Case | Model | Real | Off |
|---|---|---|---|
| Lv35 Bandit, Savage Blow 11, Dagger Mastery 4, Halfmoon: average a cast | 551 | 539 | +2.1% |
| same, lowest / highest | 310 / 772 | 314 / 763 | −1.3% / +1.1% |
| Lv35, Lucky Seven 20, Meba + Wolbi: average / low / high | 486 / 352 / 610 | 474 / 349 / 599 | +2.5 / +0.9 / +1.8% |
| Lv35, Lucky Seven 20, level 35 claw + Wolbi: average / low / high | 580 / 421 / 728 | 567 / 417 / 716 | +2.4 / +0.9 / +1.7% |
| Lv52 Spearman: Power Strike ÷ stat window, top and low | 2.60, 2.60 | 2.60, 2.60 | 0 |
| Lv52: Slash Blast ÷ window, Final Attack ÷ window | 1.30, 3.50 | 1.30, 3.50 | 0 |
| Lv52 polearm window 364 to 881: STR that fits | 0.7 constant: 233 to 242 STR | not posted | 0.8 fits no STR 150 to 320 |
| Lv52 Bandit window 216 to 417, Korean Fan 65 attack | 0.7 fits LUK 234, STR+DEX 73 | not posted | 0.8 fits no mix |

1. Stats were not posted for the level 35 cases. The model used Typical stats (LUK 157, DEX 30). All 9 numbers land within 2.5%, all slightly high, which a few LUK less would explain.
2. No allowed source has a full Stats window with every stat. One per build settles most open items (see the end).

## Formulas

| ID | Engine rule | Evidence | Verdict |
|---|---|---|---|
| F1 | Skill % multiplies the whole range | game files %; Lv52 PS, SB, FA ratios exact | Confirmed |
| F2 | MAX = S × WATK × (1 + (P × W + Sec)/100 + AP/50) | datamine; wiki has the same 1 + form; 9 Lv35 numbers within 2.5% | Supported |
| F3 | MIN uses 0.8 and P × mastery | datamine; Lv35 lows within 1.3% | Supported |
| F4 | Mastery = (level/10 + 0.1) × 0.7 | datamine 0.7; wiki 0.8 (closed test); both Lv52 windows fit only 0.7 | Supported |
| F5 | Spear 1.5 swing / 3.5 stab, polearm 3.5 / 1.5 | datamine; Lv52 polearm window fits 3.5 top, 1.5 low | Supported |
| F6 | Dagger 1.0 / 2.0; Double Stab and Savage Blow always stab | datamine; Lv35 Savage Blow fits | Supported |
| F7 | Claw normal attack 2.5 | datamine only | Unconfirmed |
| F8 | Lucky Seven 3.0, mastery 0.5, stars add to WATK, ignores Claw Mastery | game text "regardless of Claw Mastery"; datamine; 6 Lv35 numbers within 2.5% | Supported |
| F9 | Thief secondary = STR + DEX | datamine yes; wiki DEX only, its Dagger page says STR | Unconfirmed |
| F10 | Normal attacks and Power Strike: 60% swing, 40% stab | datamine only (players repeat it) | Unconfirmed |
| F11 | Claw Mastery and Steal attack as the AP/50 term | datamine names them "Attack Power"; placement inferred | Unconfirmed |
| F12 | Base crit 5%, +20% damage | no allowed source; wiki says the client shows no base | Unconfirmed |
| F13 | Crit from Precise Strikes, Critical Throw, Dagger Mastery | game-file fields crtX, crdX and skill text | Confirmed |
| F14 | Crit hit = hit × (1 + crit damage) | datamine only | Unconfirmed |
| F15 | Accuracy per class with a level term | datamine; wiki closed test formula differs | Unconfirmed |
| F16 | Hit chance: ACC × 100/(10 × gap + 255), spread, auto-hit line | datamine only (matches the engine exactly) | Unconfirmed |
| F17 | Defense: damage × 100/(DEF + 100) | datamine; wiki says not verified | Unconfirmed |
| F18 | Level gap: /(1 + gap² × 0.005) under 10, /(1 + gap × 0.05) from 10 | datamine and wiki agree | Supported |
| F19 | Elements 1.25 / 0.75 / 0 | datamine; element codes from game files | Unconfirmed |
| F20 | Clamp 1 to 99,999 | datamine | Unconfirmed |
| F21 | Booster: 2 speed steps from level 1 | game files x = −2 at every level; datamine; wiki | Confirmed |
| F22 | Weapon speed per weapon | game files attackSpeed, 56 of 56 | Confirmed |
| F23 | Swing time 810 / 870 / 900 ms at speed 6 / 7 / 8 | only MeowDB-linked pages; wiki lists 7 = 810, 8 = 870 for 2H stab only | Unconfirmed |
| F24 | 2H stab 750 / 810 / 870 ms at 6 / 7 / 8 | wiki and old GMS agree | Supported |
| F25 | Double Stab 600 ms at speed 2 | old GMS table; engine frames | Supported |
| F26 | Savage Blow 720 ms at speed 2, 900 at 5 | old GMS matches both | Supported |
| F27 | Lucky Seven uses the claw shot time (600 at 2, 810 at 6) | wiki "basic attack time"; old GMS 600 / 810 | Supported |
| F28 | Spear Mastery: 1 to 20% of hits ignore WDEF | game files prop and text; blend is math | Confirmed |
| F29 | Mastery levels 1 to 10 over 20 skill levels | game files | Confirmed |
| F30 | Magic formula (not used by these builds) | datamine = engine; wiki closed test differs | Unconfirmed |
| F31 | Heal on undead | engine flags it itself | Unconfirmed |

## Engine behaviour and data

| ID | Finding | Proof | Fix (not applied) |
|---|---|---|---|
| E1 | **Wrong.** Typical gear ignores stat requirements. A Typical thief has 25 DEX but is given claws that need 30 to 50 DEX and daggers that need 35 to 65 | game files: Mithril Guards DEX 30, Dark Guardian 35, Blood Avarice 40, Gephart 35, Shinkita 45, Deadly Fin 55, Kandine 65. buildcheck: Typical Sindit `can_wear` false at 30, 40, 50, 60, 100 | typicalWeapon() skips weapons the stats can't wear, or Typical DEX follows the weapon (as the guide does). Same for dexless warriors (Forked Spear needs 30 DEX) |
| E2 | **Wrong.** Typical thief spends 43 of 61 1st job SP | ORDER "400claw" and "400dagger" stop at Keen Eyes 8 | add Keen Eyes 15, Disorder 3, Dark Sight; Double Stab for daggers |
| E3 | **Weak default.** Bandit order puts Savage Blow 30 before Dagger Mastery, so the training page's swap level is 41 | the engine itself: mastery first wins at every level 31 to 46; no-reset swap is 40 with Korean Fan | ORDER 420: mastery 5, booster 1, Savage Blow 21, mastery 20, Savage Blow 30, booster 20 |
| E4 | **Wrong data.** Lorang and Clang WDEF 20 in live world.json | Nexon v2.1.0 (49052): "Lorang: 20 → 10, Clang: 20 → 10"; MCW 1.2 is still v2.0.0 | gamepatch.json entry for 2.1.0; changes 2 top-3 maps in the guide runs |
| E5 | Missing: Final Attack (Spearman, Fighter, Page) | game files 260 to 350%, enabled by 25% of attacks for 60 s, then pressed | model it once a video shows how often it can be pressed |
| E6 | Missing: Steal's +5 to +35 attack for 60 s | game files pad | add as AP while kept up |
| E7 | Missing: damage taken, player avoid, HP and MP growth, Max HP Increase (+10 to 25%, game files) | datamine and wiki disagree on damage taken | wait for in-game numbers |
| E8 | Spearman order puts Booster 20 before Final Attack | no damage effect today (E5) | change with E5 |
| E9 | dmgtest's 4 "worked example" cases (59 to 172, 154 to 449, 357 to 449, accuracy 49) come from the old formula source; the same example is on a page that copies MeowDB | they test code against formula, not the game | replace with realcheck.cjs cases |
| E10 | classic-skills.json "source" still says MCW/1 | label only; numbers equal 1.2 | change the string |
| E11 | Lucky Seven x 30, y 5, z 500 not used | meaning unknown | ask for a video |
| E12 | Savage Blow MP and Steal MP not used | game files | not needed for damage |

## dmgtest.cjs on live world.json

17 match, 0 differ, 5 with no real number. Caveat E9: 4 of the 17 compare the code with the formula source's own examples, not with the game.

## What the guides use

1. Game-file numbers (skills, weapons, requirements, ids) go on the pages as they are.
2. Damage comparisons between two attacks of the same build go on the pages. They rest on F1 to F8 and the speed rows, which fit real hits within 2.5%.
3. Hit chance, accuracy, EXP an hour and spear vs polearm damage stay in the check sheet. They rest on F10, F15, F16, F17 and F23, which have one source.

## Screenshots that would settle the rest

1. **Stats window, any thief, with every stat and the weapon:** F4, F7, F9, F12 (crit shown in the window).
2. **Stats window, any spearman, the same:** F5, F10 by checking the range with spear and polearm.
3. **Short video of a spearman with Final Attack lit:** how many presses one proc gives (E5).
4. **Accuracy shown in the Stats window at two levels with the same DEX and LUK:** F15's level term.
5. **A 30-second video of a level 40 Bandit on Jr. Wraiths counting MISS:** F16.
6. **Attack timing video at speed 8 (polearm, no booster) and speed 6 (booster):** F23.
7. **Damage numbers on a Lorang after Nov 24:** E4 and F17.
