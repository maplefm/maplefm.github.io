# Build guides: drafts for review (branch build-guides)

Not merged, not published. No site code changed. MeowDB not used in any way.

## Files

| File | What |
|---|---|
| audit.md | Engine audit: 31 formulas, 12 behaviour items, counts, fixes, screenshots that settle the rest |
| sindit.json | Sindit guide: claw and Lucky Seven to 34, SP reset at 35, Double Stab, Savage Blow from 44 |
| spearman-spear.json | Spearman with a spear |
| spearman-polearm.json | Spearman with a polearm |
| hub.json | /builds/ hub plan, titles, search words |
| formulas.md | Every formula with worked examples from the guide builds |
| check-sheet.md, check-sheet.csv | Every number on the pages with source and status; model numbers kept off the pages |
| str-bandit-engine.md | STR Bandit is real; what the engine needs to add it back |
| check/computed.json | Engine run, levels 10 to 100, all three builds plus Typical |
| check/computed-v210.json | Same run with the Nov 24 Lorang and Clang defense |
| check/realcheck.txt | Engine against real on-screen numbers |
| check/spotcheck.json | 56 page numbers fetched fresh from the game files |
| check/review-numbers.json | Model numbers behind the pages |
| tools/ | buildcheck.cjs, makebuilds.py, checksheet.py, realcheck.cjs, spotcheck.py, validate.py, gear-snapshot.json |

## Each build file

header, stat_plan (rule and table), skill_order, gear (game item id, needs, attack, speed, live typical price), advancement, resets, train_ranges, why, mistakes, compare, future, search, phone_tabs. Sindit also has gear_optional.

## Results

1. Game numbers: 325 skill fields, 56 weapons, 6 stars: 0 wrong against MCW 1.2.
2. Formulas: 6 confirmed, 11 supported, 14 unconfirmed, 0 shown wrong.
3. Engine: 4 wrong (Typical gear ignores stat needs, Typical thief leaves 18 SP unspent, Bandit order delays mastery, Lorang and Clang defense missing the Nov 24 patch).
4. Real on-screen numbers: 9 of 9 level 35 thief numbers within 2.5%; 4 of 4 level 52 spearman skill ratios exact.
5. Spot check: 56 of 56 page numbers match the game files (100%). Second pass (validate.py): 2,409 checks, 0 problems.

## Rerun

```
node builds/tools/buildcheck.cjs <live world.json> builds/check/computed.json
WORLD=<live world.json> python3 builds/tools/makebuilds.py
python3 builds/tools/checksheet.py
python3 builds/tools/validate.py
python3 builds/tools/spotcheck.py
node builds/tools/realcheck.cjs
```

## Phones

Each section is a tab (phone_tabs), like the map and training pages: Overview, Stats, Skills, Gear, Job, Resets, Train, Why, Mistakes, Compare, 3rd job.

## Waiting for Adam

1. DEX and STR Bandit, every other 2nd job and variants.
2. Site search: a new "b" list in data/sitesearch.json needs small changes to tools/sitesearch.py and assets/sitesearch.js (hub.json sitesearch_note).
3. Engine fixes E1 to E4 (audit.md).
