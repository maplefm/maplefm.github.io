# Build guides check sheet, Nov 25, 2026

Every number on the three pages, its source and status, is in **check-sheet.csv** (570 rows). Below: counts, then the model numbers that stay off the pages.

## Rows by status

| Build | Status | Rows |
|---|---|---|
| sindit | DEX confirmed; totals unconfirmed | 12 |
| sindit | confirmed | 36 |
| sindit | game files | 2 |
| sindit | live data | 10 |
| sindit | model (fits real hits within 2.5%) | 3 |
| sindit | no price | 2 |
| sindit | supported | 26 |
| sindit | unconfirmed | 103 |
| spearman_polearm | DEX confirmed; totals unconfirmed | 12 |
| spearman_polearm | confirmed | 33 |
| spearman_polearm | game files | 3 |
| spearman_polearm | live data | 8 |
| spearman_polearm | model (fits real hits within 2.5%) | 3 |
| spearman_polearm | no price | 3 |
| spearman_polearm | supported | 14 |
| spearman_polearm | unconfirmed | 106 |
| spearman_polearm | unconfirmed (F10, F23) | 6 |
| spearman_spear | DEX confirmed; totals unconfirmed | 12 |
| spearman_spear | confirmed | 33 |
| spearman_spear | game files | 3 |
| spearman_spear | live data | 9 |
| spearman_spear | model (fits real hits within 2.5%) | 3 |
| spearman_spear | no price | 2 |
| spearman_spear | supported | 14 |
| spearman_spear | unconfirmed | 106 |
| spearman_spear | unconfirmed (F10, F23) | 6 |

## Damage a second: guide build vs the training page's Typical gear

Plain target (no defense, no misses). Typical can_wear false means the Typical build gets a weapon its stats can't equip (audit E1).

| Build | Level | Guide weapon | Guide attack | Guide dmg/s | Typical weapon | Typical dmg/s | Typical can wear |
|---|---|---|---|---|---|---|---|
| sindit | 30 | Mithril Guards | Lucky Seven | 661 | Mithril Guards | 705 | **no** |
| sindit | 40 | Korean Fan | Double Stab | 1446 | Blood Avarice | 1060 | **no** |
| sindit | 50 | Shinkita | Savage Blow | 2334 | Shinkita | 2403 | **no** |
| sindit | 60 | Deadly Fin | Savage Blow | 3091 | Deadly Fin | 3209 | **no** |
| sindit | 100 | Kandine | Savage Blow | 5487 | Kandine | 5665 | **no** |
| spearman_spear | 30 | Forked Spear | Power Strike | 478 | Forked Spear | 478 | yes |
| spearman_spear | 40 | Zeco | Power Strike | 1079 | Zeco | 1079 | yes |
| spearman_spear | 50 | Serpent's Tongue | Power Strike | 1503 | Serpent's Tongue | 1503 | yes |
| spearman_spear | 60 | Holy Spear | Power Strike | 2071 | Holy Spear | 2071 | yes |
| spearman_spear | 100 | Redemption | Power Strike | 3618 | Redemption | 3512 | yes |
| spearman_polearm | 30 | Mithril Pole Arm | Power Strike | 531 | Mithril Pole Arm | 531 | yes |
| spearman_polearm | 40 | Crescent Polearm | Power Strike | 1186 | Crescent Polearm | 1186 | yes |
| spearman_polearm | 50 | The Nine Dragons | Power Strike | 1636 | The Nine Dragons | 1636 | yes |
| spearman_polearm | 60 | Skylar | Power Strike | 2157 | Skylar | 2157 | yes |
| spearman_polearm | 100 | The Gold Dragon | Power Strike | 3898 | The Gold Dragon | 3765 | yes |

## Sindit switch table (model)

Lucky Seven keeps Mithril Guards and Wolbi stars. Reset dagger: Double Stab 20 plus the 2nd job book. No reset: 2nd job book only.

| Level | Lucky Seven dmg/s | EXP/h | Reset dagger | dmg/s | EXP/h | No reset | dmg/s | EXP/h |
|---|---|---|---|---|---|---|---|---|
| 30 | 661 | 54K | Double Stab, Reef Claw | 594 | 49K | Regular attack | 154 | 30K |
| 31 | 679 | 57K | Double Stab, Reef Claw | 632 | 49K | Regular attack | 162 | 30K |
| 32 | 697 | 57K | Double Stab, Reef Claw | 804 | 56K | Savage Blow | 525 | 49K |
| 33 | 714 | 62K | Double Stab, Reef Claw | 853 | 56K | Savage Blow | 560 | 49K |
| 34 | 732 | 64K | Double Stab, Reef Claw | 934 | 67K | Savage Blow | 597 | 61K |
| 35 | 750 | 63K | Double Stab, Halfmoon Zamadar | 1085 | 83K | Savage Blow | 707 | 63K |
| 36 | 767 | 63K | Double Stab, Halfmoon Zamadar | 1181 | 84K | Savage Blow | 805 | 63K |
| 37 | 785 | 64K | Double Stab, Halfmoon Zamadar | 1245 | 85K | Savage Blow | 857 | 64K |
| 38 | 803 | 64K | Double Stab, Halfmoon Zamadar | 1272 | 85K | Savage Blow | 910 | 78K |
| 39 | 821 | 64K | Double Stab, Halfmoon Zamadar | 1298 | 85K | Savage Blow | 1029 | 78K |
| 40 | 838 | 64K | Double Stab, Korean Fan | 1446 | 86K | Savage Blow | 1235 | 81K |
| 41 | 856 | 64K | Double Stab, Korean Fan | 1475 | 86K | Savage Blow | 1353 | 81K |
| 42 | 874 | 64K | Double Stab, Korean Fan | 1504 | 86K | Savage Blow | 1431 | 81K |
| 43 | 891 | 78K | Double Stab, Korean Fan | 1533 | 86K | Savage Blow | 1560 | 81K |
| 44 | 909 | 78K | Savage Blow, Korean Fan | 1669 | 86K | Savage Blow | 1669 | 81K |
| 45 | 927 | 78K | Savage Blow, Korean Fan | 1776 | 86K | Savage Blow | 1776 | 81K |
| 46 | 944 | 78K | Savage Blow, Korean Fan | 1887 | 105K | Savage Blow | 1887 | 105K |
| 47 | 962 | 78K | Savage Blow, Korean Fan | 2001 | 107K | Savage Blow | 2001 | 107K |
| 48 | 980 | 78K | Savage Blow, Korean Fan | 2020 | 111K | Savage Blow | 2020 | 110K |
| 49 | 997 | 82K | Savage Blow, Korean Fan | 2040 | 113K | Savage Blow | 2040 | 112K |
| 50 | 1015 | 85K | Savage Blow, Shinkita | 2334 | 128K | Savage Blow | 2334 | 127K |

## Compare tables (model numbers)

### sindit

| Build | dmg/s 40 | dmg/s 60 | dmg/s 100 | Note |
|---|---|---|---|---|
| Sindit (this guide) | 1446 | 3091 | 5487 |  |
| Sindit, no reset | 1235 | 3091 | 5487 |  |
| Pure Bandit (dagger from 10) | 1045 | 3209 | 5665 | training page Typical build |
| Assassin (claw) | 1366 | 2751 | 4680 | training page Typical build; Typical claws need more DEX than it has |
| Dexless Bandit | 1054 | 3292 | 5759 | training page Typical build |
| STR Bandit | — | — | — | waits for the owner's review; see str-bandit-engine.md |

### spearman_spear

| Build | dmg/s 40 | dmg/s 60 | dmg/s 100 | Note |
|---|---|---|---|---|
| Spearman, spear | 1079 | 2071 | 3618 |  |
| Spearman, polearm | 1186 | 2157 | 3898 |  |
| Dexless spearman | 1163 | 2253 | 3851 | training page Typical build; its weapon needs DEX it doesn't have |

### spearman_polearm

| Build | dmg/s 40 | dmg/s 60 | dmg/s 100 | Note |
|---|---|---|---|---|
| Spearman, spear | 1079 | 2071 | 3618 |  |
| Spearman, polearm | 1186 | 2157 | 3898 |  |
| Dexless spearman | 1163 | 2253 | 3851 | training page Typical build; its weapon needs DEX it doesn't have |

## Hit chance on training monsters (model, unconfirmed F15 and F16)

### sindit

| Level | Accuracy | Monsters: hit %, seconds a kill |
|---|---|---|
| 30 | 73 | Stirge 100% 0.7s, Jr. Necki 100% 0.7s, Wild Boar 100% 1.4s, Evil Eye 100% 1.4s, Ligator 100% 1.4s, Fire Boar 96% 1.5s, Curse Eye 80% 2.7s, Jr. Wraith 48% 4.5s, Lupin 12% 23.2s, Lorang 30% 14.2s |
| 35 | 80 | Stirge 100% 0.6s, Jr. Necki 100% 0.6s, Wild Boar 100% 0.6s, Evil Eye 100% 1.2s, Ligator 100% 1.2s, Fire Boar 100% 1.2s, Curse Eye 100% 1.2s, Jr. Wraith 95% 1.3s, Lupin 65% 2.8s, Lorang 81% 3s, Zombie Lupin 23% 10.3s |
| 40 | 86 | Wild Boar 100% 0.6s, Evil Eye 100% 0.6s, Ligator 100% 1.1s, Fire Boar 100% 1.1s, Curse Eye 100% 1.1s, Jr. Wraith 100% 1.1s, Lupin 95% 1.2s, Lorang 100% 1.7s, Zombie Lupin 73% 2.4s, Skeledog 65% 3.5s, Copper Drake 51% 4.4s, Wraith 5% 53.7s |
| 50 | 101 | Lupin 100% 0.7s, Lorang 100% 1.2s, Zombie Lupin 100% 1.2s, Skeledog 100% 1.4s, Copper Drake 100% 1.4s, Wraith 94% 1.5s, Clang 100% 1.4s, Drake 100% 1.8s, Croco 84% 2.1s, Malady 51% 3.6s, Stone Golem 63% 5.7s, Skeleton Soldier 32% 9s, Dark Stone Golem 44% 8.1s |
| 60 | 115 | Copper Drake 100% 1.2s, Wraith 100% 1.2s, Clang 100% 1.4s, Drake 100% 1.4s, Croco 100% 1.4s, Malady 100% 1.2s, Stone Golem 100% 2.2s, Skeleton Soldier 100% 1.8s, Dark Stone Golem 100% 2.2s, Red Drake 100% 2.2s, Wild Kargo 81% 3.6s, Officer Skeleton 68% 4.3s |
| 70 | 129 | Malady 100% 1.2s, Stone Golem 100% 2.2s, Skeleton Soldier 100% 1.4s, Dark Stone Golem 100% 1.8s, Red Drake 100% 1.8s, Wild Kargo 100% 2.2s, Officer Skeleton 100% 2.2s, Tauromacis 95% 3.8s, Commander Skeleton 65% 6.6s, Taurospear 25% 17.1s |

### spearman_spear

| Level | Accuracy | Monsters: hit %, seconds a kill |
|---|---|---|
| 30 | 69 | Stirge 100% 0.8s, Jr. Necki 100% 0.8s, Wild Boar 100% 1.7s, Evil Eye 100% 1.7s, Ligator 92% 2.8s, Fire Boar 85% 3s, Curse Eye 69% 4.9s, Jr. Wraith 37% 9.2s, Lupin 0% 1253.3s, Lorang 19% 31.6s |
| 35 | 75 | Stirge 100% 0.7s, Jr. Necki 100% 0.7s, Wild Boar 100% 0.7s, Evil Eye 100% 1.5s, Ligator 100% 1.5s, Fire Boar 100% 1.5s, Curse Eye 100% 1.5s, Jr. Wraith 82% 2.7s, Lupin 52% 4.3s, Lorang 68% 4.3s, Zombie Lupin 10% 30.1s |
| 40 | 82 | Wild Boar 100% 0.7s, Evil Eye 100% 0.7s, Ligator 100% 1.4s, Fire Boar 100% 1.4s, Curse Eye 100% 1.4s, Jr. Wraith 100% 1.4s, Lupin 85% 1.6s, Lorang 100% 2.1s, Zombie Lupin 63% 3.3s, Skeledog 56% 5s, Copper Drake 42% 6.7s, Wraith 0% Nones |
| 50 | 94 | Lupin 100% 1.4s, Lorang 100% 1.4s, Zombie Lupin 99% 1.4s, Skeledog 100% 2.1s, Copper Drake 100% 2.1s, Wraith 79% 2.7s, Clang 92% 2.3s, Drake 100% 2.8s, Croco 70% 4s, Malady 36% 7.7s, Stone Golem 49% 10s, Skeleton Soldier 18% 23.7s, Dark Stone Golem 30% 18.5s |
| 60 | 107 | Copper Drake 100% 1.4s, Wraith 100% 1.4s, Clang 100% 2.1s, Drake 100% 2.1s, Croco 100% 2.1s, Malady 100% 2.1s, Stone Golem 100% 3.5s, Skeleton Soldier 94% 2.2s, Dark Stone Golem 100% 2.8s, Red Drake 87% 4s, Wild Kargo 66% 5.3s, Officer Skeleton 53% 6.6s |
| 70 | 120 | Malady 100% 1.5s, Stone Golem 100% 3s, Skeleton Soldier 100% 2.2s, Dark Stone Golem 100% 2.2s, Red Drake 100% 3s, Wild Kargo 100% 3s, Officer Skeleton 100% 3s, Tauromacis 79% 5.6s, Commander Skeleton 51% 11.7s, Taurospear 11% 52s |

### spearman_polearm

| Level | Accuracy | Monsters: hit %, seconds a kill |
|---|---|---|
| 30 | 69 | Stirge 100% 0.9s, Jr. Necki 100% 0.9s, Wild Boar 100% 1.8s, Evil Eye 100% 1.8s, Ligator 92% 2.9s, Fire Boar 85% 3.1s, Curse Eye 69% 3.9s, Jr. Wraith 37% 7.3s, Lupin 0% 1052.4s, Lorang 19% 28.5s |
| 35 | 75 | Stirge 100% 0.8s, Jr. Necki 100% 0.8s, Wild Boar 100% 0.8s, Evil Eye 100% 0.8s, Ligator 100% 1.6s, Fire Boar 100% 1.6s, Curse Eye 100% 1.6s, Jr. Wraith 82% 1.9s, Lupin 52% 4.5s, Lorang 68% 4.6s, Zombie Lupin 10% 32s |
| 40 | 82 | Wild Boar 100% 0.8s, Evil Eye 100% 0.8s, Ligator 100% 1.6s, Fire Boar 100% 0.8s, Curse Eye 100% 1.6s, Jr. Wraith 100% 1.6s, Lupin 85% 1.8s, Lorang 100% 2.4s, Zombie Lupin 63% 3.7s, Skeledog 56% 4.2s, Copper Drake 42% 7.5s, Wraith 0% Nones |
| 50 | 94 | Lupin 100% 1.6s, Lorang 100% 1.6s, Zombie Lupin 99% 1.6s, Skeledog 100% 1.6s, Copper Drake 100% 2.4s, Wraith 79% 3s, Clang 92% 2.6s, Drake 100% 2.4s, Croco 70% 3.4s, Malady 36% 6.5s, Stone Golem 49% 9.6s, Skeleton Soldier 18% 22.3s, Dark Stone Golem 30% 15.7s |
| 60 | 107 | Copper Drake 100% 1.6s, Wraith 100% 1.6s, Clang 100% 1.6s, Drake 100% 2.4s, Croco 100% 2.4s, Malady 100% 1.6s, Stone Golem 100% 3.1s, Skeleton Soldier 94% 2.5s, Dark Stone Golem 100% 3.1s, Red Drake 87% 3.6s, Wild Kargo 66% 4.8s, Officer Skeleton 53% 7.4s |
| 70 | 120 | Malady 100% 1.6s, Stone Golem 100% 2.4s, Skeleton Soldier 100% 2.4s, Dark Stone Golem 100% 2.4s, Red Drake 100% 2.4s, Wild Kargo 100% 3.1s, Officer Skeleton 100% 3.1s, Tauromacis 79% 6s, Commander Skeleton 51% 10.9s, Taurospear 11% 48.5s |

### Precise Strikes 15 vs 5 at level 30 (warrior 1st job)

| Weapon | Accuracy 15 / 5 | Ligator | Fire Boar | Curse Eye | Jr. Wraith |
|---|---|---|---|---|---|
| Spear | 69 / 58 | 92% / 58% | 85% / 51% | 69% / 34% | 37% / 0% |
| Polearm | 69 / 58 | 92% / 58% | 85% / 51% | 69% / 34% | 37% / 0% |

## Training maps with model EXP an hour

### sindit

| Levels | Map | EXP/h | Engine note |
|---|---|---|---|
| 10 to 14 | The Forest of Wisdom | 14K | Lucky Seven: 5 casts per Green Mushroom · 58 spawns |
| 10 to 14 | Tree Dungeon, Forest Up North IV | 14K | Lucky Seven: 5 casts per Green Mushroom · 44 spawns |
| 10 to 14 | Line 1 (Area 1) | 13K | Lucky Seven: 6 casts per Bubbling · 85% hit · 64 spawns |
| 15 to 19 | Line 1 (Area 1) | 27K | Lucky Seven: 2 casts per Bubbling · 64 spawns |
| 15 to 19 | Northern Top of Construction Site | 24K | Lucky Seven: 2 casts per Octopus · 21 spawns |
| 15 to 19 | Caution Falling Down | 23K | Lucky Seven: 2 casts per Octopus · 20 spawns |
| 20 to 29 | The Land of Wild Boar II | 42K | Lucky Seven: 3 casts per Wild Boar · 89% hit · 33 spawns |
| 20 to 29 | Excavation Site III | 41K | Lucky Seven: 3 casts per Rocky Mask · 25 spawns |
| 20 to 29 | Ant Tunnel II | 38K | Lucky Seven: 2 casts per Zombie Mushroom · 47 spawns |
| 30 to 34 | The Land of Wild Boar II | 54K | Lucky Seven: 2 casts per Wild Boar · 33 spawns |
| 30 to 34 | The Burnt Land III | 52K | Lucky Seven: 2 casts per Fire Boar · 96% hit · 37 spawns |
| 30 to 34 | Excavation Site III | 51K | Lucky Seven: 2 casts per Rocky Mask · 25 spawns |
| 35 to 46 | Line 2 (Area 1) | 83K | Double Stab: 2 casts per Jr. Wraith · 95% hit · 97 spawns |
| 35 to 46 | Line 1 (Area 2) | 70K | Double Stab: 2 casts per Jr. Wraith · 95% hit · 90 spawns |
| 35 to 46 | The Land of Wild Boar II | 65K | Double Stab kills Wild Boar in 1 cast · 33 spawns |
| 47 to 49 | Remains (Tomb) I | 107K | Savage Blow: 2 casts per Skeledog · 23 spawns |
| 47 to 49 | Line 2 (Area 1) | 103K | Savage Blow kills Jr. Wraith in 1 cast · 97 spawns |
| 47 to 49 | Hanging Gardens of Rot | 98K | Savage Blow: 2 casts per Aqumander · 69 spawns |
| 50 to 59 | Line 2 (Area 2) | 128K | Savage Blow: 2 casts per Wraith · 94% hit · 107 spawns |
| 50 to 59 | Hot Sand | 126K | Savage Blow: 2 casts per Tortie · 38 spawns |
| 50 to 59 | Line 2 (Area 3) | 115K | Savage Blow: 2 casts per Wraith · 94% hit · 68 spawns |
| 60 to 64 | The Forest of Evil II | 150K | Double Stab: 2 casts per Malady · 39 spawns |
| 60 to 64 | The Forest of Evil I | 145K | Double Stab: 2 casts per Malady · 26 spawns |
| 60 to 64 | Hot Sand | 132K | Double Stab: 2 casts per Tortie · 38 spawns |
| 65 to 74 | Camp 3 | 177K | Savage Blow: 3 casts per Officer Skeleton · 20 spawns |
| 65 to 74 | Camp 2 | 167K | Savage Blow: 2 casts per Skeleton Soldier · 20 spawns |
| 65 to 74 | Camp 1 | 162K | Savage Blow: 2 casts per Skeleton Soldier · 25 spawns |
| 75 to 89 | Remains (Cliff) | 179K | Savage Blow: 5 casts per Commander Skeleton · 100% hit · 17 spawns |
| 75 to 89 | Camp 3 | 177K | Savage Blow: 3 casts per Officer Skeleton · 20 spawns |
| 75 to 89 | Remains (Tomb) IV | 143K | Savage Blow: 3 casts per Officer Skeleton · 14 spawns |
| 90 to 100 | Sanctuary Entrance IV | 230K | Double Stab kills Cold Eye in 1 cast · 12 spawns |
| 90 to 100 | Camp 3 | 202K | Savage Blow: 2 casts per Officer Skeleton · 20 spawns |
| 90 to 100 | Remains (Cliff) | 199K | Savage Blow: 4 casts per Commander Skeleton · 17 spawns |

### spearman_spear

| Levels | Map | EXP/h | Engine note |
|---|---|---|---|
| 10 to 14 | An Empty House | 13K | Power Strike: 2 casts per Orange Mushroom · 6 spawns |
| 10 to 14 | Mushroom Garden (Victoria Island) | 12K | Power Strike: 2 casts per Orange Mushroom · 34 spawns |
| 10 to 14 | The Rain-Forest East of Henesys | 11K | Power Strike: 2 casts per Pig · 9 spawns |
| 15 to 19 | Tree Dungeon, Forest Up North IV | 19K | Power Strike: 2 casts per Green Mushroom · 81% hit · 44 spawns |
| 15 to 19 | Dungeon, Southern Forest III | 17K | Power Strike: 2 casts per Green Mushroom · 81% hit · 26 spawns |
| 15 to 19 | An Empty House | 16K | Power Strike kills Orange Mushroom in 1 cast · 6 spawns |
| 20 to 24 | Line 1 (Area 1) | 25K | Power Strike: 2 casts per Bubbling · 87% hit · 64 spawns |
| 20 to 24 | Tree Dungeon, Forest Up North IV | 20K | Power Strike: 2 casts per Green Mushroom · 44 spawns |
| 20 to 24 | Dungeon, Southern Forest III | 18K | Power Strike: 2 casts per Green Mushroom · 26 spawns |
| 25 to 29 | Tree Dungeon, Forest Up North III | 29K | Power Strike kills Green Mushroom in 1 cast · 44 spawns |
| 25 to 29 | Dungeon, Southern Forest IV | 27K | Power Strike: 2 casts per Horny Mushroom · 81% hit · 25 spawns |
| 25 to 29 | West Rocky Mountain III | 27K | Power Strike kills Green Mushroom in 1 cast · 67 spawns |
| 30 to 34 | The Land of Wild Boar II | 45K | Power Strike: 2 casts per Wild Boar · 33 spawns |
| 30 to 34 | Dark Cave | 42K | Power Strike kills Stirge in 1 cast · 51 spawns |
| 30 to 34 | The Burnt Land III | 40K | Power Strike: 3 casts per Fire Boar · 85% hit · 37 spawns |
| 35 to 46 | The Land of Wild Boar II | 61K | Power Strike kills Wild Boar in 1 cast · 33 spawns |
| 35 to 46 | Line 2 (Area 1) | 57K | Power Strike: 3 casts per Jr. Wraith · 82% hit · 97 spawns |
| 35 to 46 | Tree Dungeon, Forest Up North VIII | 54K | Power Strike: 2 casts per Curse Eye · 17 spawns |
| 47 to 49 | Remains (Tomb) I | 89K | Power Strike: 3 casts per Skeledog · 97% hit · 23 spawns |
| 47 to 49 | Hanging Gardens of Rot | 83K | Power Strike: 3 casts per Aqumander · 97% hit · 69 spawns |
| 47 to 49 | Line 2 (Area 1) | 79K | Power Strike: 2 casts per Jr. Wraith · 97 spawns |
| 50 to 59 | Hot Sand | 104K | Power Strike: 3 casts per Tortie · 38 spawns |
| 50 to 59 | Clang and Lorang | 95K | Power Strike: 3 casts per Clang · 92% hit · 31 spawns |
| 50 to 59 | Remains (Tomb) I | 92K | Power Strike: 3 casts per Skeledog · 23 spawns |
| 60 to 64 | The Forest of Evil II | 120K | Power Strike: 3 casts per Malady · 100% hit · 39 spawns |
| 60 to 64 | Line 2 (Area 3) | 120K | Power Strike: 2 casts per Wraith · 68 spawns |
| 60 to 64 | Hot Sand | 119K | Power Strike: 2 casts per Tortie · 38 spawns |
| 65 to 74 | Camp 1 | 134K | Power Strike: 3 casts per Skeleton Soldier · 25 spawns |
| 65 to 74 | Camp 2 | 132K | Power Strike: 3 casts per Skeleton Soldier · 20 spawns |
| 65 to 74 | Camp 3 | 131K | Power Strike: 5 casts per Officer Skeleton · 84% hit · 20 spawns |
| 75 to 89 | Camp 3 | 151K | Power Strike: 4 casts per Officer Skeleton · 20 spawns |
| 75 to 89 | Remains (Cliff) | 134K | Power Strike: 7 casts per Commander Skeleton · 81% hit · 17 spawns |
| 75 to 89 | Remains (Tomb) IV | 119K | Power Strike: 4 casts per Officer Skeleton · 14 spawns |
| 90 to 100 | Camp 3 | 175K | Power Strike: 3 casts per Officer Skeleton · 20 spawns |
| 90 to 100 | Camp 2 | 166K | Power Strike: 2 casts per Skeleton Soldier · 20 spawns |
| 90 to 100 | Remains (Cliff) | 164K | Power Strike: 6 casts per Commander Skeleton · 17 spawns |

### spearman_polearm

| Levels | Map | EXP/h | Engine note |
|---|---|---|---|
| 10 to 14 | An Empty House | 13K | Power Strike: 2 casts per Orange Mushroom · 6 spawns |
| 10 to 14 | Mushroom Garden (Victoria Island) | 12K | Power Strike: 2 casts per Orange Mushroom · 34 spawns |
| 10 to 14 | The Rain-Forest East of Henesys | 12K | Power Strike: 2 casts per Pig · 9 spawns |
| 15 to 19 | Line 1 (Area 1) | 25K | Power Strike: 2 casts per Bubbling · 99% hit · 64 spawns |
| 15 to 19 | Tree Dungeon, Forest Up North IV | 20K | Power Strike: 2 casts per Green Mushroom · 44 spawns |
| 15 to 19 | Dungeon, Southern Forest III | 17K | Power Strike: 2 casts per Green Mushroom · 26 spawns |
| 20 to 24 | Line 1 (Area 1) | 25K | Power Strike: 2 casts per Bubbling · 64 spawns |
| 20 to 24 | Tree Dungeon, Forest Up North IV | 24K | Power Strike kills Green Mushroom in 1 cast · 44 spawns |
| 20 to 24 | The Blue Mushroom Forest | 23K | Power Strike: 2 casts per Blue Mushroom · 97% hit · 32 spawns |
| 25 to 29 | The Land of Wild Boar II | 42K | Power Strike: 2 casts per Wild Boar · 85% hit · 33 spawns |
| 25 to 29 | Dark Cave | 41K | Power Strike kills Stirge in 1 cast · 51 spawns |
| 25 to 29 | Excavation Site III | 38K | Power Strike: 2 casts per Rocky Mask · 98% hit · 25 spawns |
| 30 to 34 | The Land of Wild Boar II | 44K | Power Strike: 2 casts per Wild Boar · 33 spawns |
| 30 to 34 | Dark Cave | 43K | Power Strike kills Stirge in 1 cast · 51 spawns |
| 30 to 34 | Excavation Site I | 42K | Power Strike kills Ghost Stump in 1 cast · 33 spawns |
| 35 to 46 | Line 2 (Area 1) | 68K | Power Strike: 2 casts per Jr. Wraith · 82% hit · 97 spawns |
| 35 to 46 | The Land of Wild Boar II | 60K | Power Strike kills Wild Boar in 1 cast · 33 spawns |
| 35 to 46 | Line 1 (Area 2) | 59K | Power Strike: 2 casts per Jr. Wraith · 82% hit · 90 spawns |
| 47 to 49 | Remains (Tomb) I | 86K | Power Strike: 3 casts per Skeledog · 97% hit · 23 spawns |
| 47 to 49 | Hanging Gardens of Rot | 81K | Power Strike: 3 casts per Aqumander · 97% hit · 69 spawns |
| 47 to 49 | Line 2 (Area 1) | 77K | Power Strike: 2 casts per Jr. Wraith · 97 spawns |
| 50 to 59 | Remains (Tomb) I | 99K | Power Strike: 2 casts per Skeledog · 23 spawns |
| 50 to 59 | Hot Sand | 97K | Power Strike: 3 casts per Tortie · 38 spawns |
| 50 to 59 | Clang and Lorang | 89K | Power Strike: 3 casts per Clang · 92% hit · 31 spawns |
| 60 to 64 | The Forest of Evil II | 127K | Power Strike: 2 casts per Malady · 100% hit · 39 spawns |
| 60 to 64 | The Forest of Evil I | 123K | Power Strike: 2 casts per Malady · 100% hit · 26 spawns |
| 60 to 64 | Hot Sand | 121K | Power Strike: 2 casts per Tortie · 38 spawns |
| 65 to 74 | Camp 3 | 135K | Power Strike: 4 casts per Officer Skeleton · 84% hit · 20 spawns |
| 65 to 74 | Camp 2 | 132K | Power Strike: 3 casts per Skeleton Soldier · 20 spawns |
| 65 to 74 | Camp 1 | 130K | Power Strike: 3 casts per Skeleton Soldier · 25 spawns |
| 75 to 89 | Camp 3 | 170K | Power Strike: 3 casts per Officer Skeleton · 20 spawns |
| 75 to 89 | Remains (Cliff) | 143K | Power Strike: 6 casts per Commander Skeleton · 81% hit · 17 spawns |
| 75 to 89 | Remains (Tomb) IV | 127K | Power Strike: 3 casts per Officer Skeleton · 14 spawns |
| 90 to 100 | Remains (Cliff) | 172K | Power Strike: 5 casts per Commander Skeleton · 17 spawns |
| 90 to 100 | Camp 3 | 170K | Power Strike: 3 casts per Officer Skeleton · 20 spawns |
| 90 to 100 | Camp 2 | 161K | Power Strike: 2 casts per Skeleton Soldier · 20 spawns |

## Same runs with the Nov 24 defense patch (Lorang, Clang WDEF 10)

1. Spear 49: top 3 becomes Hot Sand, Clang and Lorang, Remains (Tomb) I.
2. Spear 60: Hot Sand moves to first.
3. Every other top 3 in the three guides is unchanged.

## Numbers left out of the guides

1. Accuracy, hit chance, EXP an hour: one source for the formulas (audit F15, F16, F17).
2. Spear vs polearm damage a second: rests on the 60/40 swing split (F10) and swing times at speed 7 and 8 (F23).
3. HP and MP per level (wiki pre-launch table: warrior +28 HP, thief +22 HP): one source.
4. Damage taken: the datamine and the wiki give different formulas.
5. Base crit 5% / +20%: no allowed source (F12). It is in every damage number above, equally for both sides of each comparison.
6. Final Attack damage over time: how often it can be pressed is unknown (E5).

