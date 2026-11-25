# STR Bandit: is it real, and what the engine needs

## Verdict: real, and different from the build the engine removed on Oct 29

1. **What players mean:** LUK is still the main stat. STR replaces DEX only to meet the needs of the STR daggers. DEX stays at 25.
2. **What the engine had (strbandit, removed Oct 29):** STR as the main stat with LUK 4. Nobody plays that; it rightly found no map from about 69.
3. **Evidence:** 8+ player posts on r/MSClassicWorld (one estimates 40% or more of top-ranked bandits are STR), plus the game files: every second dagger tier needs STR instead of DEX.

| Level | DEX dagger | Needs | Speed | STR dagger | Needs | Speed |
|---|---|---|---|---|---|---|
| 30 | Reef Claw 48 | DEX 25, LUK 60 | 4 | Cass 47 | STR 25, LUK 60 | 3 |
| 40 / 45 | Gephart 58 | DEX 35, LUK 80 | 4 | Bazlud 62 (45) | STR 40, LUK 90 | 3 |
| 50 | Shinkita 68 | DEX 45, LUK 100 | 4 | Sai 67 | STR 45, LUK 100 | 3 |
| 60 | Deadly Fin 78 | DEX 55, LUK 120 | 4 | Serpent's Coil 77 | STR 55, LUK 120 | 3 |
| 70 | Kandine 88 | DEX 65, LUK 140 | 4 | Golden River 87 | STR 65, LUK 140 | 3 |

Korean Fan (40, 55 attack, speed 3, LUK 70 only) suits both.

## First numbers from the current engine (no engine change; builds/tools stats only)

Same skills both sides (Double Stab 20, Dagger Mastery 20, Booster, Savage Blow 30), DEX build at the guide's DEX, STR build at DEX 25 with STR = need.

| Level | DEX build dmg/s | STR build dmg/s | STR vs DEX | Accuracy DEX / STR |
|---|---|---|---|---|
| 45 | 1,931 (Korean Fan) | 2,071 (Bazlud) | +7.2% | 92 / 86 |
| 50 | 2,334 (Shinkita) | 2,431 (Sai) | +4.2% | 101 / 91 |
| 60 | 3,091 (Deadly Fin) | 3,240 (Serpent's Coil) | +4.8% | 115 / 102 |
| 70 | 3,954 (Kandine) | 4,164 (Golden River) | +5.3% | 129 / 113 |
| 100 | 5,487 | 5,817 | +6.0% | 166 / 151 |

1. STR daggers are one speed step faster: Savage Blow 660 ms vs 720 with Booster. That outweighs the slightly lower attack.
2. STR gives no accuracy; DEX gives 1.2 a point. The STR build sits 6 to 16 accuracy lower.
3. Prices: Bazlud 125K vs Gephart 24K; Sai 410K vs Shinkita 322K (live, Nov 25).

## What the engine needs to add it back

1. **Stat requirements (audit E1).** typicalWeapon() has to skip weapons the stats can't wear. Without it the STR and DEX builds both "wear" every dagger and look the same. Needs reqSTR, reqDEX, reqLUK per weapon in classic-skills.json (skilldata.py can read them from MCW item metaInfo, as builds/tools/gear-snapshot.json does).
2. **A build type** `strbandit`: thief stats with DEX fixed at 25, STR raised to the next STR dagger's need (backward pass as in buildcheck.cjs dexPlan), the rest LUK. Weapon list: Cass, Korean Fan, Bazlud, Sai, Serpent's Coil, Golden River.
3. **Weapon choice by build:** a weapon filter per build (STR daggers for strbandit, DEX daggers for bandit and sindit), so Typical doesn't pick across lines.
4. **The Bandit skill order fix (E3)** so both lines use mastery first.
5. **Worker BTYPES and map.html picker:** add strbandit back (the Worker cleans unknown types to Bandit today).
6. **Open item it rests on:** F9, the thief secondary stat. The datamine says STR + DEX; the wiki's closed test page says DEX only. If DEX only were true, the STR build would lose its 40 to 65 STR as damage (about 3% at 50). One Stats window from a STR Bandit with gear off and on settles it.
