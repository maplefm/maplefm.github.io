"""Refresh tools/drops_reported.json: monster drops players reported on MeowDB (used with its owners' permission for
items, drops and mesos), kept when the report's score is 1 or more. Names come from the game data ids, never MeowDB text.
  python3 tools/dropsrefresh.py [world.json]
One request every 1.5 s. Monsters MeowDB has no reports for keep what the file had."""
import json, os, sys, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tools", "drops_reported.json")
UA = {"User-Agent": "ClubFM-drops/1.0 (https://maplefm.gg; weekly, polite)"}
world = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "world.json"), encoding="utf-8"))
names = {int(r[1]): r[0] for r in json.load(open(os.path.join(ROOT, "data", "itemdb.json"), encoding="utf-8"))["items"] if r and r[1]}
old = json.load(open(OUT, encoding="utf-8"))
out, changed = {}, []
for mob, m in sorted(world["mobs"].items()):
    try:
        with urllib.request.urlopen(urllib.request.Request(f"https://meowdb.com/msclassic/api/drops?monsterId={int(m['id'])}", headers=UA), timeout=40) as r:
            rows = json.load(r).get("drops") or []
    except Exception as e:
        print("skipped", mob, e); rows = None
    time.sleep(1.5)
    if rows is None:
        if mob in old: out[mob] = old[mob]
        continue
    d = []
    for x in sorted(rows, key=lambda x: -(x.get("score") or 0)):
        gid = str(x.get("itemIconKey") or "")
        if (x.get("score") or 0) < 1 or not gid.isdigit() or int(gid) not in names: continue
        if [gid, names[int(gid)]] not in d: d.append([gid, names[int(gid)]])
    if not d:
        if mob in old: out[mob] = old[mob]
        continue
    out[mob] = {"lv": m.get("lv", 0), "d": d}
    a, b = {n for _, n in (old.get(mob) or {}).get("d", [])}, {n for _, n in d}
    if a != b: changed.append((mob, sorted(b - a), sorted(a - b)))
for mob in old:
    if mob not in out: out[mob] = old[mob]
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "monsters;", len(changed), "changed")
for c in changed: print(" ", c[0], "| added", c[1], "| gone", c[2])
