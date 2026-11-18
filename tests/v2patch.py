"""Patch data newer than maplestory.io (tools/gamepatch.json), checked offline.
Nov 18 2026: v2.0 opened Forgotten Hollow. Its monsters had to reach monster and item pages before the wiki mapped them,
defense Nexon changed without numbers had to stop showing as fact, and drop reports from the closed test had to stay out.
  python3 tests/v2patch.py"""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import gamepatch
gamepatch._live = lambda p: True   # as if maplestory.io still served the old files (no network)
fails = []
def ok(name, cond, extra=""):
    print(("ok   " if cond else "FAIL ") + name + (" | " + str(extra) if extra else ""))
    if not cond: fails.append(name)

rel = gamepatch.released_mobs()
ok("11 Forgotten Hollow monsters released", len(rel) == 11 and rel.get(58) == ("Echopus", "Forgotten Hollow") and rel.get(700003, ("",))[0] == "Rotten Mushmom", rel.get(58))
dc = gamepatch.defense_changed()
ok("Nexon's 18 defense changes plus the region's 11", len(dc) == 29 and all(n in dc for n in ("Lorang", "Malady", "Jr. Necki", "Echopus")))

# world.py's own block, run on a game-file record and a wiki monster
src = open(os.path.join(ROOT, "tools", "world.py")).read()
blk = src[src.index("ELEM = {"):src.index("# mesos a kill:")]
mob = {"Lorang": {"id": 36, "lv": 38, "wdef": 0, "mdef": 30}, "Lorang (Thief 2nd job test)": {"id": 36, "base": "Lorang", "variant": "x"},
       "Stirge": {"id": 17, "lv": 20}}
io_mobs = {58: {"level": 45, "maxHP": 2163, "exp": 107, "physicalDamage": 239, "accuracy": 124, "evasion": 28, "physicalDefense": 10, "magicDefense": 20, "elementalAttributes": "L3", "isUndead": False},
           700003: {"level": 60, "maxHP": 86400, "exp": 844, "physicalDefense": 20, "magicDefense": 10, "elementalAttributes": "S2F3H3", "isUndead": True, "isBoss": True}}
exec(blk, {"mob": mob, "io_mobs": io_mobs, "gamepatch": gamepatch, "re": re, "print": lambda *a: None})
e = mob.get("Echopus") or {}
ok("Echopus added from the game files", e.get("lv") == 45 and e.get("hp") == 2163 and e.get("exp") == 107 and e.get("region") == "Forgotten Hollow" and e.get("weak") == "Lightning", e)
rm = mob.get("Rotten Mushmom") or {}
ok("Rotten Mushmom: boss, undead, weak to fire and holy, resists poison", rm.get("boss") and rm.get("undead") and rm.get("weak") == "Fire, Holy" and rm.get("resist") == "Poison", rm)
ok("a monster missing from the game files is not invented", "Glowshroom" not in mob)
ok("defense flagged on Lorang, its job test copy and the new monsters", mob["Lorang"].get("defnew") == "2026-11-18" and mob["Lorang (Thief 2nd job test)"].get("defnew") and e.get("defnew"))
ok("old defense kept for the math", mob["Lorang"]["mdef"] == 30)

# drop reports: the monster's own drop and launch reports only
since = gamepatch.drops_since()
ok("drop cutoff set for the released monsters only", since.get(58) == 2000 and 17 not in since)
rows = [{"id": 56, "itemIconKey": "4000055", "score": 4}, {"id": 326, "itemIconKey": "1051023", "score": 5}, {"id": 2093, "itemIconKey": "1452007", "score": 5}]
src = open(os.path.join(ROOT, "tools", "dropsrefresh.py")).read()
ok("dropsrefresh keeps the first report and launch reports", "x.get(\"id\") or 0) == first_id or (x.get(\"id\") or 0) >= since" in src)
first_id = min(x["id"] for x in rows); kept = [x["id"] for x in rows if x["id"] == first_id or x["id"] >= since[58]]
ok("closed-test report 326 left out", kept == [56, 2093], kept)

# monster page text for changed defense
wp = open(os.path.join(ROOT, "tools", "worldpages.py")).read()
ok("monster pages say defense changed instead of the old number", "new numbers not out yet" in wp and 'mb.get("defnew")' in wp)
ok("training pages say ranks use the old defense", "ranked on the old defense" in wp)
print(f"\n{'all passed' if not fails else str(len(fails)) + ' failed'}")
sys.exit(1 if fails else 0)
