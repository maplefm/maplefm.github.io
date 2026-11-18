"""Zenith (Nov 18 2026) has its own economy: its scans must never reach Windia's prices, posts or bots.
1. The watcher tags rows scanned with "world": "Zenith" and leaves Windia's untagged.
2. tools/inbox.py writes tagged rows to data/inbox-zenith.json only; an unknown world is dropped, never mixed in.
3. tools/discord.py big sales (reads the data folder) never posts a Zenith sale.
Run: python3 tests/worlds.py   (exit 1 on any failure)"""
import sys, os, json, time, tempfile, shutil, importlib.util
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
fails = []
def ok(name, cond, note=""):
    print(("ok   " if cond else "FAIL ") + name + (" | " + str(note) if note else "")); cond or fails.append(name)
def load(path, name):
    s = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
tmp = tempfile.mkdtemp(); now = int(time.time())

# 1. the watcher
src = os.path.join(tmp, "w"); shutil.copytree(os.path.join(ROOT, "download", "source"), src)
for f in ("items.json", "names.json", "maps.json", "reference.json"):
    p = os.path.join(ROOT, "scan", "py", f)
    if os.path.isfile(p) and not os.path.isfile(os.path.join(src, f)): shutil.copy(p, src)
sys.path.insert(0, src); cwd = os.getcwd(); os.chdir(src)
w = load(os.path.join(src, "watcher.py"), "watcher")
st = w.Store(os.path.join(tmp, "store.json"), 14)
shop = lambda seller, item, p: {"seller": seller, "rows": [{"i": item, "p": p, "q": 1, "known": True, "so": False}]}
w.WORLD[0] = "Windia"; [st.add_shop(shop("WindiaGuy", "Elixir", 600)) for _ in range(2)]
w.WORLD[0] = "Zenith"; [st.add_shop(shop("ZenithGal", "Elixir", 4400)) for _ in range(2)]
rows = [r for d in st.published_docs() for r in d["rows"]]
ok("watcher: Windia rows untagged", any(r["s"] == "WindiaGuy" and "w" not in r for r in rows))
ok("watcher: Zenith rows tagged", any(r["s"] == "ZenithGal" and r.get("w") == "Zenith" for r in rows))
ok("watcher: world setting", (w.norm_world("zenith"), w.norm_world(None), w.norm_world("Bera")) == ("Zenith", "Windia", "Windia"))
os.chdir(cwd); sys.path.remove(src)

# 1b. the browser scanner runs the same watcher through scan/py/scanglue.py; its World choice tags rows the same way
import types
bs = os.path.join(tmp, "b"); shutil.copytree(os.path.join(ROOT, "scan", "py"), bs)
js = types.ModuleType("js"); js.grab_rect = js.frame_info = lambda *a: None; sys.modules["js"] = js
for k in ("watcher", "fmparse", "boards", "ocrlib", "glyphs", "tipexact"): sys.modules.pop(k, None)
sys.path.insert(0, bs); os.chdir(bs)
import watcher as bw, scanglue
bw.HERE = bs; scanglue.init("Tester", "")
bst = scanglue.ST["store"]; [bst.add_shop(shop("WindiaGuy", "Elixir", 600)) for _ in range(2)]
ok("browser scanner: switches to Zenith, deal lines off", scanglue.set_world("Zenith") == "Zenith" and not bw.CFG_DEALS[0])
[bst.add_shop(shop("ZenithGal", "Elixir", 4400)) for _ in range(2)]
brows = [(r["s"], r.get("w")) for d in bst.published_docs() for r in d["rows"]]
ok("browser scanner: rows carry the world they were read in", ("WindiaGuy", None) in brows and ("ZenithGal", "Zenith") in brows, brows)
ok("browser scanner: an unknown world falls back to Windia", scanglue.set_world("Bera") == "Windia" and bw.CFG_DEALS[0])
os.chdir(cwd); sys.path.remove(bs)

# 2. the inbox
ib = load(os.path.join(ROOT, "tools", "inbox.py"), "inbox")
ok("inbox: keeps the Zenith tag", (ib.clean_row({"s": "Z", "i": "Elixir", "p": 4400, "t": now, "w": "Zenith"}, now) or {}).get("w") == "Zenith")
ok("inbox: an unknown world is dropped", ib.clean_row({"s": "Z", "i": "Elixir", "p": 4400, "t": now, "w": "Bera"}, now) is None)
state = {"ids": {"aaaa000000000000": {"nm": "Tester", "docs": {time.strftime("%Y-%m-%d", time.gmtime(now)) + "|watcher-shop": {"at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(now)), "rows": {
    "1": {"s": "WindiaGuy", "i": "Elixir", "p": 600, "q": 1, "t": now, "so": True},
    "2": {"s": "ZenithGal", "i": "Elixir", "p": 4400, "q": 1, "t": now, "so": True, "w": "Zenith"},
    "3": {"s": "ZenithRich", "i": "Work Gloves", "p": 9000000, "q": 1, "t": now, "so": True, "w": "Zenith"}}}}}}}
win = [r for d in ib.publish(state) for r in d["rows"]]; zen = [r for d in ib.publish(state, "Zenith") for r in d["rows"]]
ok("inbox: Windia file has only Windia rows", [r["s"] for r in win] == ["WindiaGuy"], [r["s"] for r in win])
ok("inbox: Zenith file has only Zenith rows", sorted(r["s"] for r in zen) == ["ZenithGal", "ZenithRich"], [r["s"] for r in zen])

# 3. Discord big sales from a data folder holding both files
data = os.path.join(tmp, "data"); os.makedirs(data)
docs = lambda rows: [{"at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(now)), "src": "watcher-shop", "who": "Maya", "inbox": "aaaa", "rows": rows}]   # a club scanner: one sighting is enough to post
json.dump(docs(win), open(os.path.join(data, "inbox.json"), "w"))
# the Worker's fast lane carries every new upload, Zenith's too, before the pump splits them: as a fast doc and mixed
# into a Windia file, a Zenith-tagged row must still never post
fastp = os.path.join(tmp, "fast.json"); json.dump(docs(zen), open(fastp, "w")); os.environ["FAST_DOCS"] = fastp
json.dump(docs(win) + docs(zen), open(os.path.join(data, "watcher.json"), "w")); json.dump(docs(zen), open(os.path.join(data, "inbox-zenith.json"), "w"))
json.dump({"rows": [{"item": "Work Gloves", "kind": "sale", "typ": 2000000, "salesN": 50, "conf": "verified", "equip": True}]}, open(os.path.join(data, "summary.json"), "w"))
dc = load(os.path.join(ROOT, "tools", "discord.py"), "discord"); sent = []
dc.post = lambda *a, **k: sent.append([a, k]) or True
os.environ.pop("DISCORD_HOOKS", None)
stp = os.path.join(tmp, "s.json"); json.dump({"sales_mark": now - 3600}, open(stp, "w"))
try: dc.job_sales(data, stp)
except Exception as e: ok("discord: big sales job runs", False, e)
ok("discord: the big sales job looked at the docs", json.load(open(stp)).get("sales_mark", 0) > now - 3600)
ok("discord: no Zenith sale posted", not any("ZenithRich" in json.dumps(s) or "9,000,000" in json.dumps(s) or "9M" in json.dumps(s) for s in sent), sent[:1])
# 4. the daily market report reads every file in the data folder: Zenith's file and any tagged row stay out
import subprocess
rd = os.path.join(tmp, "rep"); os.makedirs(rd)
sold = lambda s_, p, w=None: dict({"s": s_, "i": "Elixir", "p": p, "q": 1, "t": now - 600, "so": True}, **({"w": w} if w else {}))
json.dump(docs([sold("A", 600), sold("B", 610), sold("C", 590), sold("T", 4400, "Zenith")]), open(os.path.join(rd, "inbox.json"), "w"))
json.dump(docs([sold("Z%d" % i, 4400, "Zenith") for i in range(9)]), open(os.path.join(rd, "inbox-zenith.json"), "w"))
out = os.path.join(tmp, "report.json")
r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "report.py"), rd, os.path.join(ROOT, "data", "itemdb.json"), out], capture_output=True, text=True)
rep = open(out).read() if os.path.isfile(out) else ""
ok("report: runs", r.returncode == 0 and rep, (r.stderr or "")[-200:])
ok("report: no Zenith price in Windia's report", rep and "4400" not in rep and "4,400" not in rep, [m for m in ("4400",) if m in rep])
shutil.rmtree(tmp, ignore_errors=True)
sys.exit(1 if fails else 0)
