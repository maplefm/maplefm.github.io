"""Every link on the built item, monster, map, quest, training and hub pages goes to a page that exists: in the build
directory (the pages tools/itempages.py just made) or in this checkout. Nov 19 2026: 11 links went to job test and party
quest monsters that have no page of their own; they now link to the monster they copy.
  python3 tests/links.py [build dir]   (default /tmp/ip; exit 1 on any broken link)"""
import os, re, sys, urllib.parse
B = sys.argv[1] if len(sys.argv) > 1 else "/tmp/ip"
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def exists(p):
    p = urllib.parse.unquote(p).lstrip("/")
    if not p: return True
    for base in (B, R):
        f = os.path.join(base, p)
        if os.path.isfile(f) or os.path.isfile(os.path.join(f, "index.html")): return True
    return p.startswith(("i/", "favicon", "apple-touch"))   # icons are mirrored by their own job
bad, n = {}, 0
for root in ("item", "monster", "map", "quest", "training", "maps", "monsters", "quests", "crafting", "items", "guides"):
    for dp, _, fn in os.walk(os.path.join(B, root)):
        if "index.html" not in fn: continue
        for h in re.findall(r'href="(/[^"#?]*)', open(os.path.join(dp, "index.html"), encoding="utf-8").read()):
            n += 1
            if not exists(h): bad.setdefault(h, []).append(os.path.relpath(dp, B))
print(f"{n:,} links checked, {len(bad)} broken")
for h, v in list(bad.items())[:20]: print(" ", h, "on", len(v), "pages, like", v[0])
sys.exit(1 if bad else 0)
