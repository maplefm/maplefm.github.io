"""Keep a copy of every item icon on the site itself, at /i/<item id>.png.

Icons come from maplestory.io. Serving them from maplefm.gg means one connection the browser already has open, long
caching, and no blank or stand-in icons when maplestory.io is slow or busy. Only icons not yet copied are fetched;
items maplestory.io has no icon for are listed in i/missing.json and asked for again once a week.

  python3 tools/iconmirror.py ITEMDB.json OUT_DIR
"""
import json, os, sys, time, urllib.request, urllib.error, concurrent.futures as cf

DB, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
ids = sorted({r[1] for r in json.load(open(DB, encoding="utf-8"))["items"] if isinstance(r[1], int)})
mp = os.path.join(OUT, "missing.json")
miss = {}
try: miss = json.load(open(mp))
except Exception: miss = {}
if isinstance(miss, list): miss = {str(i): 0 for i in miss}
now = int(time.time())

def get(i):
    p = os.path.join(OUT, f"{i}.png")
    if os.path.exists(p) and os.path.getsize(p) > 0: return None
    if now - miss.get(str(i), 0) < 7 * 86400: return "skip"
    for kind in ("icon", "iconRaw"):
        for t in range(3):
            try:
                r = urllib.request.urlopen(urllib.request.Request(f"https://maplestory.io/api/MCW/1/item/{i}/{kind}", headers={"User-Agent": "maplefm.gg icon copy"}), timeout=20)
                b = r.read()
                if b[:4] == b"\x89PNG":
                    open(p, "wb").write(b); miss.pop(str(i), None); return "new"
                break
            except urllib.error.HTTPError as e:
                if e.code == 404: break
                time.sleep(2 + 3 * t)
            except Exception:
                time.sleep(2 + 3 * t)
    miss[str(i)] = now
    return "missing"

with cf.ThreadPoolExecutor(6) as ex: res = list(ex.map(get, ids))
json.dump(dict(sorted(miss.items())), open(mp, "w"), separators=(",", ":"))
print("icons: %d items, %d new, %d without an icon" % (len(ids), res.count("new"), len(miss)))
