"""A long name the shop cuts short must never be priced as the shorter item it starts with.
Two checks, run in smoke CI:
 1. FM Watcher's reader (download/source/fmparse.py): "Two-handed Sword A.." is the scroll, not the sword.
 2. The real price board (tools/snapshot.py) on a small made-up market: sword listings read from the scroll at scroll
    prices must not lift the sword's price, and the scroll keeps its own.
Run: python3 tests/cutnames.py  (exit 1 on any failure)
"""
import sys, os, json, time, tempfile, shutil, subprocess
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
fails = []
def ok(name, cond, note=""):
    print(("ok   " if cond else "FAIL ") + name + (" | " + str(note) if note else "")); cond or fails.append(name)

# 1. the reader
sys.path.insert(0, os.path.join(ROOT, "download", "source"))
tmp = tempfile.mkdtemp()
for f in ("items.json", "names.json", "maps.json", "chat_names.json", "glyphs.json", "statfit.json", "tipglyphs.json", "reference.json"):
    p = os.path.join(ROOT, "scan", "py", f)
    if os.path.isfile(p): shutil.copy(p, os.path.join(ROOT, "download", "source", f)) if not os.path.isfile(os.path.join(ROOT, "download", "source", f)) else None
import fmparse
CASES = {
    "Two-handed Sword A..": "Two-handed Sword Attack Scroll (tier cut off)",
    "Two-handed Sword ..": "Two-handed Sword Attack Scroll (tier cut off)",
    "Two-handed Axe A..": "Two-handed Axe Attack Scroll (tier cut off)",
    "Crossbow A..": "Crossbow Attack Scroll (tier cut off)",
    "Black Knucklevest P..": "Black Knucklevest Pants",
    "Teddy Bear Chat ..": "Teddy Bear Chat Ring",
    "Two-Handed Sword": "Two-Handed Sword",
    "Black Knucklevest": "Black Knucklevest",
    "Work Gloves": "Work Gloves",
}
for raw, want in CASES.items():
    got = fmparse.clean_item(raw)[0]
    ok("reader: " + raw, got == want, got)
amb = fmparse.clean_item("Soccer Uniform (No.1")
ok("reader: an ambiguous cut name stays unnamed", not amb[1], amb)
for f in ("items.json", "names.json", "maps.json", "chat_names.json", "glyphs.json", "statfit.json", "tipglyphs.json", "reference.json"):
    p = os.path.join(ROOT, "download", "source", f)
    if os.path.isfile(p) and subprocess.run(["git", "-C", ROOT, "ls-files", "--error-unmatch", p], capture_output=True).returncode: os.remove(p)

# 2. the board on a made-up market
if "--board" in sys.argv:
    live = os.path.join(tmp, "live"); os.makedirs(os.path.join(live, "data"))
    shutil.copy(os.path.join(ROOT, "data", "itemdb.json"), os.path.join(live, "data", "itemdb.json"))
    now = int(time.time()); rows = []; k = 0
    def add(seller, item, p, so=False, x=None, ago=3600):
        global k; k += 1
        r = {"s": seller, "i": item, "p": p, "q": 1, "t": now - ago - k * 60, "r": "FM%d" % (k % 20 + 1), "c": k % 30 + 1, "fs": now - ago}
        if so: r["so"] = True; r["ss"] = now - ago
        if x: r["x"] = x
        rows.append(r)
    for n in range(12):
        add("Swd%d" % n, "Two-Handed Sword", 6000 + n * 300, so=n < 8)                                   # the real sword
        add("Scr%d" % n, "Two-handed Sword Attack Scroll: Intermediate", 140000 + n * 1000, so=n < 8)    # the real scroll
        add("Cut%d" % n, "Two-Handed Sword", 145000 + n * 1000, so=n < 8)                                 # the scroll, cut short
    docs = []
    for w in ("Alpha", "Beta"):
        docs.append({"at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(now)), "src": "watcher-shop", "who": w, "inbox": w[:4].lower(), "day": time.strftime("%Y-%m-%d", time.gmtime(now)), "u": now, "rows": rows})
    json.dump(docs, open(os.path.join(live, "data", "inbox.json"), "w"))
    out = os.path.join(tmp, "out", "summary.json"); os.makedirs(os.path.dirname(out))
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "snapshot.py"), ROOT, live, out], capture_output=True, text=True, timeout=400)
    ok("board built", os.path.isfile(out), (r.stdout + r.stderr)[-300:])
    if os.path.isfile(out):
        by = {x["item"]: x for x in json.load(open(out))["rows"]}
        sw, sc = by.get("Two-Handed Sword") or {}, by.get("Two-handed Sword Attack Scroll: Intermediate") or {}
        ok("board: sword priced as a sword", 0 < (sw.get("typ") or 0) < 20000, sw.get("typ"))
        ok("board: scroll keeps its price", 100000 < (sc.get("typ") or 0) < 200000, sc.get("typ"))
shutil.rmtree(tmp, ignore_errors=True)
sys.exit(1 if fails else 0)
