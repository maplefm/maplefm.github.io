"""The in-game world maps for Get somewhere (map.html): the picture and every clickable spot with the maps it holds,
from the Classic World game files on maplestory.io (Map.wz/WorldMap). Players tap where they are and where they're
going instead of typing.
  python3 tools/worldmap.py <world.json> assets/worldmap
Writes <name>.webp per world map and worldmap.json: [{name, img, w, h, spots: [{x, y, town, ids: [map ids]}]}].
Spot x, y are pixels on the picture. Map names come from world.json in the page, so they always match the router.
Run again when maplestory.io gets new game files (a new region on the world map)."""
import base64, io, json, os, sys, urllib.request
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import mcwver; IO = mcwver.base()
except Exception:
    IO = "https://maplestory.io/api/MCW/1"
UA = {"User-Agent": "ClubFM (maplefm.gg)"}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as r: return json.load(r)

W = json.load(open(sys.argv[1])); OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
ids = {m.get("id"): p for p, m in W["maps"].items() if m.get("id")}
out = []
for wm in get(f"{IO}/map/worldmap"):
    if not wm.startswith("WorldMap"): continue
    d = get(f"{IO}/map/worldmap/{wm}")
    base = (d.get("baseImage") or [None])[0]
    if not base or not base.get("image"): continue
    spots = []
    for s in d.get("maps") or []:
        got = [i for i in s.get("mapNumbers") or [] if i in ids]
        if not got: continue
        spots.append({"x": base["origin"]["x"] + s["spot"]["x"], "y": base["origin"]["y"] + s["spot"]["y"], "town": s.get("type") == 0, "ids": got})
    if not spots: continue
    # the world map names itself after the region most of its maps are in (Victoria Island, Maple Island)
    regions = {}
    for s in spots:
        for i in s["ids"]: r = W["maps"][ids[i]].get("region") or ""; regions[r] = regions.get(r, 0) + 1
    name = max(regions, key=regions.get) if regions else wm
    im = Image.open(io.BytesIO(base64.b64decode(base["image"])))
    fn = name.lower().replace(" ", "-") + ".webp"
    im.save(os.path.join(OUT, fn), "WEBP", quality=82, method=6)
    out.append({"name": name, "img": "/assets/worldmap/" + fn, "w": im.width, "h": im.height, "spots": spots})
    print(name, wm, len(spots), "spots", sum(len(s["ids"]) for s in spots), "maps", os.path.getsize(os.path.join(OUT, fn)) // 1024, "KB")
out.sort(key=lambda x: (x["name"] != "Victoria Island", x["name"]))
json.dump(out, open(os.path.join(OUT, "worldmap.json"), "w"), separators=(",", ":"))
