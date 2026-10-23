"""Build data/abbr.json, the search shortcuts the site uses: tools/abbr_curated.json plus the trade chat aliases the
watcher already knows (FMWatcher items.json and chat_names.json, when they're next to this repo).
  python tools/abbr.py [path/to/FMWatcher]
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
def norm(s): return re.sub(r"[^a-z0-9]+", "", s.lower())
db = {r[0].lower(): r[0] for r in json.load(open(os.path.join(ROOT, "data/itemdb.json")))["items"]}
bases = {re.sub(r": \w+$", "", n).lower(): re.sub(r": \w+$", "", n) for n in db.values() if re.search(r"Scroll: \w+$", n)}
out, skipped = {}, []
def add(k, v, strong):
    v2 = db.get(v.lower()) or bases.get(v.lower())
    if not v2: skipped.append((k, v)); return
    nk = norm(k)
    if len(nk) < 2 or nk == norm(v2): return
    if nk in out and not strong: return
    out[nk] = v2
w = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), "watcher")
try:
    for canon, al in json.load(open(os.path.join(w, "items.json")))["aliases"].items():
        for a in al: add(a, canon, False)
    for a, canon in json.load(open(os.path.join(w, "chat_names.json"))).get("abbr", {}).items(): add(a, canon, False)
except OSError:
    pass
for k, v in json.load(open(os.path.join(HERE, "abbr_curated.json"))).items():
    if not k.startswith("_"): add(k, v, True)
json.dump(dict(sorted(out.items())), open(os.path.join(ROOT, "data/abbr.json"), "w"), indent=0, ensure_ascii=False)
print(len(out), "shortcuts;", "not items:", skipped[:20])
