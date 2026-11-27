"""Refresh tools/drops_reported.json: monster drops players reported on MeowDB (used with its owners' permission for
items, drops and mesos), kept when the report's score is 1 or more. Names come from the game data ids, never MeowDB text.
  python3 tools/dropsrefresh.py [world.json]
One request every 1.5 s. Monsters MeowDB has no reports for keep what the file had."""
import json, os, sys, time, urllib.request
# MeowDB blocked our requests on Nov 19 2026 and withdrew earlier permission; no calls until the owner has it again.
if os.environ.get("MEOWDB_FETCH") != "1":
    sys.exit("MeowDB calls are paused (blocked Nov 19 2026, permission withdrawn). Set MEOWDB_FETCH=1 only once permission is back.")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tools", "drops_reported.json")
UA = {"User-Agent": "ClubFM-drops/1.0 (https://maplefm.gg; weekly, polite)"}
world = json.load(open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "world.json"), encoding="utf-8"))
names = {int(r[1]): r[0] for r in json.load(open(os.path.join(ROOT, "data", "itemdb.json"), encoding="utf-8"))["items"] if r and r[1]}
old = json.load(open(OUT, encoding="utf-8"))
out, changed = {}, []
# monsters a patch released before the wiki lists them (tools/gamepatch.json), so their drops reach the item pages
sys.path.insert(0, os.path.join(ROOT, "tools")); import gamepatch
mobs = dict(world["mobs"])
for gid, (nm, _) in gamepatch.released_mobs().items():
    if nm in mobs: continue
    lv = 0
    try:
        import mcwver
        with urllib.request.urlopen(urllib.request.Request(f"{mcwver.base()}/mob/{gid}", headers=UA), timeout=40) as r:
            lv = (json.load(r).get("meta") or {}).get("level") or 0
    except Exception as e:
        print("no game-file level for", nm, e)
    mobs[nm] = {"id": gid, "lv": lv}
for mob, m in sorted(mobs.items()):
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
    since = gamepatch.drops_since().get(int(m["id"]))
    if since and rows:
        # a monster that was only on a test server before its patch: its own drop (the first report) and launch reports
        first_id = min(x.get("id") or 0 for x in rows)
        rows = [x for x in rows if (x.get("id") or 0) == first_id or (x.get("id") or 0) >= since]
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
