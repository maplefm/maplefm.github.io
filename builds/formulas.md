# Formulas behind the build guides, with worked examples

Engine: assets/classic-dmg.js (unchanged). Status IDs (F1 to F31, E1 to E12) are in audit.md. Examples use the guide builds; every result below was printed by the engine (/builds/tools/buildcheck.cjs, realcheck.cjs).

## 1. Physical damage (F1 to F6, supported)

```
S    = skill % / 100
Mf   = (mastery level / 10 + 0.1) × 0.7          mastery level: game files, 1 to 10 over 20 skill points
MAX  = S × WATK × (1.0 + (P × W + Sec)/100 + AP/50)
MIN  = S × WATK × (0.8 + (P × Mf × W + Sec)/100 + AP/50)
AVG  = S × WATK × (0.9 + (P × (Mf + 1)/2 × W + Sec)/100 + AP/50)
WATK = weapon attack + scrolls + star attack
```

| Weapon | P | Sec | W swing / stab |
|---|---|---|---|
| Dagger, claw (thief) | LUK | STR + DEX | dagger 1.0 / 2.0; claw 2.5 |
| Spear | STR | DEX | 1.5 / 3.5 |
| Polearm | STR | DEX | 3.5 / 1.5 |

1. Warrior normal attacks and Power Strike roll 60% swing, 40% stab (F10). The average uses W = 0.6 × swing + 0.4 × stab: spear 2.3, polearm 2.7. AVG is linear in W, so blending is exact for the average; it is not a real min or max.
2. Double Stab and Savage Blow always stab: dagger W = 2.0.

**Example A, Double Stab, level 35 Sindit after the reset.** LUK 157, STR 4, DEX 30, Halfmoon Zamadar 53, Double Stab 20 (160%), Dagger Mastery 15 (mastery 7, Mf = 0.56).
1. MAX = 1.6 × 53 × (1 + (157 × 2 + 34)/100) = 84.8 × 4.48 = **379.9** a hit.
2. MIN = 1.6 × 53 × (0.8 + (157 × 0.56 × 2 + 34)/100) = 84.8 × 2.898 = **245.8**.
3. AVG = 1.6 × 53 × (0.9 + (157 × 0.78 × 2 + 34)/100) = **312.8**; with crits (20%, +20%) **325.4**. 2 hits a cast.

## 2. Lucky Seven (F8, supported)

```
MAX = S × (claw + star) × (1 + (LUK × 3.0 + STR + DEX)/100)
MIN = same with LUK × 0.5 × 3.0        fixed mastery 0.5; Claw Mastery never changes it (game text)
```

**Example B, level 35 before the reset.** LUK 157, DEX 30, Mithril Guards 23 + Wolbi 17 = 40, Lucky Seven 20 (140%).
1. MAX = 1.4 × 40 × (1 + (471 + 34)/100) = 56 × 6.05 = **338.8** a star.
2. MIN = 1.4 × 40 × (0.8 + (235.5 + 34)/100) = **195.7**. AVG with crits **269.9**, 2 stars a cast.
3. Checked against a posted level 35 Lucky Seven: model 486 average a cast with Meba, real 474 (realcheck.cjs).

## 3. Speed (F21 to F27)

```
ms = 30 × ceil( Σ floor(frame × (10 + tier)/16) / 30 )
tier = weapon speed (game files) − 2 with the job's Booster (any level)
```

| Frames | Tier 2 | 4 | 6 | 8 |
|---|---|---|---|---|
| Swing 300+150+350 | 600 | 720 | 810 | 900 |
| 2H stab 300+100+350 | 570 | 660 | 750 | 870 |
| 1H stab, Double Stab 350+450 | 600 | 720 | 810 | 900 |
| Savage Blow 8 × 120 | 720 | 840 | 960 | 1080 |
| Claw shot, Lucky Seven 300+150+350 | 600 | 720 | 810 | 900 |

**Example C.** Halfmoon Zamadar is speed 4; Dagger Booster makes it 2: Double Stab 600 ms, Savage Blow 720 ms. Crescent Polearm is speed 8; Polearm Booster makes it 6: 0.6 × 810 + 0.4 × 750 = **786 ms** an attack on average.

## 4. Damage a second

```
dmg/s = AVG with crits × hits a cast / ms × 1000
```

**Example D, why the reset at 35.** Double Stab 325.4 × 2 / 600 = **1,085**. Lucky Seven 269.9 × 2 / 720 = **750**. +45%.

**Example E, Savage Blow takes over at 44.** Double Stab 20 is 160% × 2 = 320% a cast at 600 ms. Savage Blow 21 is 65% × 6 = 390% at 720 ms. Per second 0.533 vs 0.542: Savage Blow wins from 21 points, which the SP plan reaches at 44.

## 5. Crits (F12 to F14)

```
avg with crits = AVG × (1 + rate × extra)
rate = 5% + Precise Strikes (1 to 5) + Dagger Mastery (1 to 20, dagger only) + Critical Throw (claw)
extra = 20% + skills
```
1. Base 5% / 20% has no allowed source (F12). It sits on both sides of every comparison above.
2. Level 50 Sindit, Dagger Mastery 20: 25% rate, +20%: AVG × 1.05.

## 6. Monster defense and level gap (F17, F18)

```
after defense = damage × 100 / (WDEF + 100)
gap = monster level − your level (0 when you are higher)
gap 1 to 9: damage / (1 + gap² × 0.005)   gap 10+: damage / (1 + gap × 0.05)
```
1. Jr. Wraith WDEF 30: 76.9% kept. Lorang WDEF 10 after Nov 24: 90.9% (live world.json still has 20: 83.3%, audit E4).
2. Gap kept: 1 level 99.5%, 3 levels 95.7%, 5 levels 88.9%, 8 levels 75.8%, 10 levels 66.7%, 15 levels 57.1%.

**Spear Mastery (F28).** kept = (1 − p) × 100/(WDEF + 100) + p, p = 1 to 20%. Lupin, WDEF 5, Spear Mastery 20: 0.8 × 0.952 + 0.2 = **96.2%** (polearm 95.2%).

## 7. Accuracy and hit chance (F15, F16, unconfirmed: check sheet only)

```
Common  = 1.2 × DEX + 2 × level + 0.6 × LUK
Warrior = floor(Common / 2.5 + 10)        Thief = floor(Common / 4 + 15)
+ Precise Strikes 5 to 20, Nimble Body 1 to 15, gear
A = ACC × 100 / (10 × gap + 255);  D = A − monster avoid
always hits when D ≥ 25 + gap × (level / 2 + 15)
f = 0.15 + 0.20 / (1 + e^(D/12));  q = avoid / A
hit = 1 if q ≤ 1 − f; 0 if q ≥ 1 + f; else (1 + f − q) / (2f)
```

**Example F, level 35 Sindit on Jr. Wraith** (level 34, avoid 25). Common = 36 + 70 + 94.2 = 200.2; 200.2/4 + 15 = 65; + Nimble Body 15 = **80**. Always-hit needs 82, so hit is **95.3%**. With 64 accuracy it would be 50.8%.

## 8. Stat requirements (game files, confirmed)

| Item | Needs |
|---|---|
| Thief at 10 | 25 DEX |
| Warrior at 10 | 35 STR |
| Claws 30 / 35 / 40 / 50 / 60 | DEX = level, LUK 65 / 75 / 85 / 105 / 125 |
| Halfmoon Zamadar 35 | DEX 30, LUK 70 |
| Korean Fan 40 | LUK 70 |
| Shinkita 50, Deadly Fin 60, Kandine 70 | DEX 45 / 55 / 65 |
| Bazlud 45, Sai 50, Serpent's Coil 60, Golden River 70 | STR 40 / 45 / 55 / 65 |
| Spears and polearms 30 to 70 | DEX = level, STR 65 at 30 to 145 at 70 |
| Bamboo Spear, Yellow / White / Indigo Mop (45) | STR 85, no DEX |

The two job needs (25 DEX, 35 STR) come from players and one guide site, not the game files (players agree).

## 9. HP, MP, avoid and damage taken (not in the engine, not on the pages)

1. **Max HP Increase:** +10% to +25% max HP (game files mhpR). Confirmed.
2. **HP and MP per level:** wiki table, pre-launch: warrior +28 HP +12 MP, thief +22 HP +17 MP; job advance warrior +300 to 350 HP. One source.
3. **AP into HP:** warriors only, "about 20 or more" a point (wiki). One source.
4. **HP washing:** the AP Reset Scroll returns every AP at once, HP and MP included (Nexon Cash Shop text). Washing one point at a time can't be done.
5. **Player avoid (datamine):** floor(LUK/3) + floor(DEX/6) + 5. Level 35 Sindit: 52 + 5 + 5 = 62, plus Nimble Body 15.
6. **Damage taken, datamine:** taken = hit × (1 − DEF/(DEF + 2 × hit + 300)) − DEF/25 − level/10, hit = monster attack × 1.2 to 1.4.
   Example: Lupin (attack 203) on a level 40 spearman with 150 WDEF: average hit 264 → 264 × (1 − 150/978) − 6 − 4 = **213**.
7. **Damage taken, wiki:** reduction = floor(min(WDEF × monster level / 70, WDEF / 5)), roll 1.0 to 1.5. Same case: 30 off. The two disagree, so neither is used.

## 10. SP and AP

1. 1 SP at 10, 3 a level to 30: 61 for 1st job. 1 SP at 30, 3 a level: 121 by 70 for 2nd job. Players agree; the engine uses it.
2. 5 AP a level. The engine assumes 25 total stats at level 1; a different start shifts the main stat a few points, never the DEX targets.
