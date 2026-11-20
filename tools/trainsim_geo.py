"""Game-file geometry for the training map simulator (tools/trainsim.cjs): each map's footholds, ropes, ladders,
portals and spawn points, and each monster's speed and whether it flies, from maplestory.io.
  python3 tools/trainsim_geo.py <world.json> <geo dir>
Files already there are kept. Maps newer than the game files (Forgotten Hollow, Nov 18) have none and stay out."""
import json, os, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import mcwver; IO = mcwver.base()
except Exception:
    IO = "https://maplestory.io/api/MCW/1"
W = json.load(open(sys.argv[1])); OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "ClubFM (maplefm.gg)"}
def get(u):
    for _ in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40) as r: return json.load(r)
        except Exception as e:
            if "404" in str(e): return None
            time.sleep(2)
    return None
maps = [m for m in W["maps"].values() if m.get("mobs") and m.get("id")]
mobs = {W["mobs"][n]["id"] for m in maps for n, _ in m["mobs"] if n in W["mobs"] and W["mobs"][n].get("id")}
got = miss = 0
for m in maps:
    f = os.path.join(OUT, f"map{m['id']}.json")
    if os.path.exists(f): continue
    d = get(f"{IO}/map/{m['id']}"); time.sleep(0.3)
    if not d: miss += 1; continue
    json.dump({k: d.get(k) for k in ("footholds", "ladderRopes", "mobs", "vrBounds", "mobRate", "portals")}, open(f, "w")); got += 1
for i in sorted(mobs):
    f = os.path.join(OUT, f"mob{i}.json")
    if os.path.exists(f): continue
    d = get(f"{IO}/mob/{i}"); time.sleep(0.3)
    if d: json.dump({"meta": d.get("meta"), "fb": list((d.get("framebooks") or {}).keys())}, open(f, "w"))
print("maps fetched", got, "not in the game files", miss)
