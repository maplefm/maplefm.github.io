"""Build data/itemdb.json: a compact list of every MapleStory Classic World item from maplestory.io.

Each row is [name, id, required level, job bitmask, cash 0/1, kind]. Job bits: 1 warrior, 2 magician,
4 bowman, 8 thief, 16 pirate, 0 anyone. Kind is an index into "kinds" (overall category: sub category).
The price site uses it for icons, classes, levels and to tidy up names read off the screen.
"""
import json, sys, urllib.request

URL = "https://maplestory.io/api/MCW/1/item"   # MapleStory Classic World: Classic names, ids and icons
JOBS = {"Warrior": 1, "Magician": 2, "Bowman": 4, "Thief": 8, "Pirate": 16}

req = urllib.request.Request(URL, headers={"User-Agent": "maplefm-itemdb"})
data = json.load(urllib.request.urlopen(req, timeout=120))
kinds, rows = [], []
for it in data:
    name = (it.get("name") or "").strip()
    if not name:
        continue
    ti = it.get("typeInfo") or {}
    k = (ti.get("overallCategory") or "") + ":" + (ti.get("subCategory") or "")
    if k not in kinds:
        kinds.append(k)
    m = 0
    for j in it.get("requiredJobs") or []:
        m |= JOBS.get(j, 0)
    rows.append([name, it["id"], it.get("requiredLevel") or 0, m, 1 if it.get("isCash") else 0, kinds.index(k)])
out = sys.argv[1] if len(sys.argv) > 1 else "data/itemdb.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump({"source": "maplestory.io MCW 1, MapleStory Classic World", "kinds": kinds, "items": rows}, f, separators=(",", ":"), ensure_ascii=False)
print(len(rows), "items,", len(kinds), "kinds")
