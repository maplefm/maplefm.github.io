"""Megaphones and smegas (Nov 25 2026): read off stream pictures, counted once however many read them, used as
asking prices only.
  python3 tests/megaphones.py              logic checks, no text reader needed (runs in smoke)
  python3 tests/megaphones.py --board      also the real price board on a made-up market (needs Playwright)
  python3 tests/megaphones.py SET_DIR      also reads every saved megaphone line in SET_DIR (L*.png and truth.json,
                                           kept in the private archive, branch megatest) with the stream reader and
                                           scores it: priced posts right, wrong and missed, sender names. Exit 1 when
                                           item and price are under 99% right or any sure name is wrong.
Checks:
1. The stream reader finds megaphone lines by their colour (pink, teal, gold), splits a band of several lines.
2. il_rule spells I and l the way the watcher's exact chat names do.
3. A line one stream already read is never read again, by that stream or another; both streams still post it.
4. Posts go out as stream-chat documents with the megaphone kind; an unsure name is marked; no instant publish.
5. Discord: a smega read by a stream and a scanner with the same spelling posts once; one reader alone does not.
6. Pulse and inbox: megaphone posts are no shops; the inbox keeps the kind.
7. The board (--board): one smega read by a scanner and two streams is one listing; chat asks price an item only
   when no shop has it, an outlier is left out, sales are never moved by chat, and a sure megaphone post shows in
   For sale now only when no shop listing is up."""
import sys, os, json, time, tempfile, shutil, zipfile, subprocess, importlib.util
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
fails = []
def ok(name, cond, note=""):
    print(("ok   " if cond else "FAIL ") + name + (" | " + str(note) if note != "" else "")); cond or fails.append(name)
def load(path, name):
    s = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
tmp = tempfile.mkdtemp(); now = int(time.time())

# the stream server's own setup: the FM Watcher release, with download/stream on top
app = os.path.join(tmp, "app")
with zipfile.ZipFile(os.path.join(ROOT, "download", "FMWatcher.zip")) as z: z.extractall(tmp)
shutil.move(os.path.join(tmp, "FMWatcher"), app)
for f in os.listdir(os.path.join(ROOT, "download", "stream")):
    if f.endswith((".py", ".json", ".png")): shutil.copy(os.path.join(ROOT, "download", "stream", f), app)
json.dump({"publish": False, "keep_days": 14, "name": "streams", "streams": {}}, open(os.path.join(app, "config.json"), "w"))
cwd = os.getcwd(); sys.path.insert(0, app); argv = sys.argv; sys.argv = [argv[0]]
SR = load(os.path.join(app, "stream_reader.py"), "stream_reader")
sys.argv = argv; os.chdir(cwd)
W = SR.W
HOVER_WANTED = W.hover_wanted
W.hover_wanted = lambda: {}          # no network in the logic checks

# 1. finding the lines: a picture with a pink smega, then two teal item megaphone lines touching (one band)
rng = np.random.default_rng(1)
fr = rng.integers(0, 120, (1080, 1920, 3)).astype(np.uint8)
fr[900:922, 400:1160] = SR.MEGA_BG["sm"]; fr[922:966, 400:1160] = SR.MEGA_BG["im"]
fr[905:917, 420:470] = 30; fr[928:940, 420:470] = 30; fr[950:962, 420:470] = 30      # some letters
lines, pitch = SR.mega_lines(fr)
want = [("sm", 900, 922), ("im", 922, 944), ("im", 944, 966)]
ok("three megaphone lines found", len(lines) == 3 and all(a[0] == b[0] and abs(a[1] - b[1]) <= 1 and abs(a[2] - b[2]) <= 1 for a, b in zip(lines, want)), (lines, pitch))
ok("box edges", all(x0 == 400 and x1 == 1160 for _, _, _, x0, x1 in lines), lines)
ok("nothing found in a picture without megaphones", SR.mega_lines(rng.integers(0, 120, (1080, 1920, 3)).astype(np.uint8))[0] == [])

# the reader restarts itself into new code (it never did on Linux before Nov 25: py_compile refused /dev/null)
SR._BOOT = tuple(0 for _ in SR._CODE)
ok("a code change is seen and the new code compiles", SR.code_changed() is True)

# 2. I and l
ok("I and l like the watcher's exact names", [SR.il_rule(n) for n in ("lindenhan", "NeckSIice", "KatnissF", "XlV", "Ilovemaple")] == ["Iindenhan", "NeckSlice", "KatnissF", "XIV", "Ilovemaple"],
   [SR.il_rule(n) for n in ("lindenhan", "NeckSIice", "KatnissF", "XlV", "Ilovemaple")])

# 3 and 4. one reading per line, every stream posts it, stored as stream chat
cfg = SR.load_config(); cfg["publish"] = False
os.chdir(tmp); stores = SR.Stores(cfg, sub="st"); os.chdir(cwd)
reads = []
def fake_read(crop):
    reads.append(crop.size)
    return {"name": "Trifold", "sure": True, "msgs": [], "rows": [("S", "Blue Arten", 3400000, None)], "ch": None, "badge": False}
SR.read_mega_line = fake_read
mr = SR.MegaReader(stores)
class Ch: pass
a, b = Ch(), Ch(); a.login, a.name, b.login, b.name = "streama", "StreamA", "streamb", "StreamB"
one = rng.integers(0, 120, (1080, 1920, 3)).astype(np.uint8); one[960:982, 400:1160] = SR.MEGA_BG["ig"]; one[965:977, 420:600] = 40
mr.look(a, one); mr.q.join()
two = rng.integers(0, 120, (1080, 1920, 3)).astype(np.uint8); two[900:922, 380:1140] = SR.MEGA_BG["ig"]; two[905:917, 400:580] = 40
mr.look(b, two); mr.q.join(); mr.look(a, one)
ok("a line is read once for every stream that shows it", len(reads) == 1, reads)
ok("both streams posted it", getattr(a, "megas", 0) >= 1 and getattr(b, "megas", 0) >= 1, (getattr(a, "megas", 0), getattr(b, "megas", 0)))
st = stores.get("streama")
for o in st.d["chat"].values(): o["last_read"] -= 5                                  # a second look seconds later
stores.add_mega("streama", "Trifold", True, [("S", "Blue Arten", 3400000, None)], "im", None)
stores.add_mega("streamb", "Nordic", False, [("S", "Blue Arten", 3000000, None), ("S", "Blue Arten", 3000000, None)], "sm", None)
for o in stores.get("streamb").d["chat"].values(): o["last_read"] -= 5
stores.add_mega("streamb", "Nordic", False, [("S", "Blue Arten", 3000000, None)], "sm", None)
ok("chat posts never trigger an instant publish", not stores.hot())
docs = stores.docs({"streama": "StreamA", "streamb": "StreamB"})
chat = [d for d in docs if d["src"] == "stream-chat"]
rows = {d["by"]: d["rows"] for d in chat}
ok("stream chat documents", sorted(rows) == ["StreamA", "StreamB"], [(d["src"], d.get("by")) for d in docs])
ra, rb = (rows.get("StreamA") or [{}])[0], (rows.get("StreamB") or [{}])[0]
ok("row: seller, item, price, kind", (ra.get("s"), ra.get("i"), ra.get("p"), ra.get("mg"), ra.get("ns")) == ("trifold", "Blue Arten", 3400000, "im", None), ra)
ok("unsure name marked", rb.get("ns") == 1 and rb.get("mg") == "sm", rb)

# 5. Discord: once, and only with two readers
sys.path.insert(0, os.path.join(ROOT, "tools"))
os.environ.pop("DISCORD_HOOKS", None); os.environ.pop("DISCORD_HOOK_DEALS", None)
D = load(os.path.join(ROOT, "tools", "discord.py"), "discord_t")
sent = []
D.post = lambda kind, content=None, embeds=None: sent.append(embeds[0]) or True
D.icon_url = lambda i: None
dd = os.path.join(tmp, "dd"); os.makedirs(dd)
summ = os.path.join(dd, "summary.json")
json.dump({"rows": [{"item": "Mushmom Spore", "kind": "sale", "typ": 400000, "salesN": 9, "basis": "24h", "conf": "verified", "typWho": ["laclac", "zik"]}],
           "who": [{"name": "laclac", "sales": 500}, {"name": "zik", "sales": 500}, {"name": "StreamA", "stream": True}, {"name": "StreamB", "stream": True}]}, open(summ, "w"))
post = lambda s: {"s": s, "i": "Mushmom Spore", "p": 150000, "q": 1, "t": now - 60, "mg": "sm", "c": 7}
def run(docs):
    D.scan_docs = lambda data_dir: iter(docs); D.job_deals(dd, summ, os.path.join(dd, "deals.json"))
run([("StreamA", {"src": "stream-chat", "by": "StreamA", "rows": [post("chewys")]})])
ok("one stream alone does not post a chat deal", len(sent) == 0, len(sent))
run([("StreamA", {"src": "stream-chat", "by": "StreamA", "rows": [post("chewys")]}), ("zik", {"src": "watcher-chat", "who": "zik", "rows": [post("chewys")]}),
     ("StreamB", {"src": "stream-chat", "by": "StreamB", "rows": [post("chewys")]})])
ok("stream and scanner agree: posted once", len(sent) == 1, len(sent))
ok("post says smega and channel", bool(sent) and "smega" in sent[0]["title"] and any(f["value"] == "Smega, CH 7" for f in sent[0]["fields"]), sent and (sent[0]["title"], sent[0]["fields"]))
run([("StreamA", {"src": "stream-chat", "by": "StreamA", "rows": [post("chewys")]}), ("zik", {"src": "watcher-chat", "who": "zik", "rows": [post("chewys")]})])
ok("never twice", len(sent) == 1, len(sent))

# 6. pulse and inbox
P = load(os.path.join(ROOT, "tools", "pulse.py"), "pulse_t")
pd = os.path.join(tmp, "pd"); os.makedirs(pd)
json.dump([{"src": "stream-chat", "by": "StreamA", "rows": [dict(post("chewys"), t=now)]}, {"src": "stream-shop", "by": "StreamA", "rows": [{"s": "Shopper", "i": "Elixir", "p": 600, "q": 1, "t": now, "r": "FM3", "c": 2}]}], open(os.path.join(pd, "streams.json"), "w"))
json.dump([], open(os.path.join(pd, "inbox.json"), "w"))
ok("pulse: a smega is no shop", [x[3] for x in P.rows(pd)] == ["shopper"], list(P.rows(pd)))
I = load(os.path.join(ROOT, "tools", "inbox.py"), "inbox_t")
c = I.clean_row({"s": "chewys", "i": "Mushmom Spore", "p": 150000, "q": 1, "t": now, "mg": "sm", "c": 7}, now)
ok("inbox keeps the megaphone kind", c and c.get("mg") == "sm" and c.get("c") == 7, c)
ok("inbox drops a made-up kind", "mg" not in (I.clean_row({"s": "x1y", "i": "Elixir", "p": 600, "q": 1, "t": now, "mg": "zz"}, now) or {}))

# 7. the real board on a made-up market
def snap_listings(snap):
    """The board's listings and items out of a snapshot (format v3)."""
    n, T = snap["n"], snap["T"]; L = [dict() for _ in range(n)]
    for k, col in snap["cols"].items():
        kind, words = snap["kinds"][k], snap["words"].get(k)
        if isinstance(col, dict):
            at = -1; pairs = []
            for g, v in zip(col["g"], col["v"]): at += g; pairs.append((at, v))
        else: pairs = [(i, v) for i, v in enumerate(col) if v != 0]
        for i, v in pairs: L[i][k] = words[v - 1] if kind == "w" else T - v * 1000 if kind == "t" else v
    items = {}
    for it in snap["D"]["list"]:
        it["buyL"] = [L[x["@"]] for x in (it.get("buy") or []) if isinstance(x, dict) and "@" in x]
        it["allL"] = [L[x["@"]] for x in (it.get("all") or []) if isinstance(x, dict) and "@" in x]
        items[it["item"]] = it
    return items
if "--board" in sys.argv:
    live = os.path.join(tmp, "live"); os.makedirs(os.path.join(live, "data"))
    shutil.copy(os.path.join(ROOT, "data", "itemdb.json"), os.path.join(live, "data", "itemdb.json"))
    day = time.strftime("%Y-%m-%d", time.gmtime(now)); at = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime(now))
    shop, chat = [], []
    k = [0]
    def sh(seller, item, p, so=False, ago=3600):
        k[0] += 1; r = {"s": seller, "i": item, "p": p, "q": 1, "t": now - ago - k[0] * 30, "r": "FM%d" % (k[0] % 20 + 1), "c": k[0] % 20 + 1, "fs": now - ago}
        if so: r["so"] = True; r["ss"] = now - ago
        shop.append(r)
    def ct(seller, item, p, ago=600, mg="sm", ns=False):
        r = {"s": seller, "i": item, "p": p, "q": 1, "t": now - ago, "mg": mg}
        if ns: r["ns"] = 1
        return r
    # Gold Ore: shop asks only at 100-110 each, chat asks at 500 must not move it
    for n in range(4): sh("Ore%d" % n, "Gold Ore", 100 + n * 3)
    chat += [ct("orechat", "Gold Ore", 500)]
    # Dark Crystal Ore: sold 6 times today near 300k; a misread chat ask at 30k must not move it
    for n in range(6): sh("Dc%d" % n, "Dark Crystal Ore", 300000 + n * 1000, so=True)
    chat += [ct("dcmisread", "Dark Crystal Ore", 30000)]
    # Topaz: no shop at all. Three smegas near 50k and one outlier at 900k: priced from the three
    chat += [ct("topa", "Topaz", 50000), ct("topb", "Topaz", 52000), ct("topc", "Topaz", 48000), ct("topd", "Topaz", 900000)]
    # Mushmom Spore: one smega read by a scanner, StreamA and StreamB: one listing, seen by 3
    sm = ct("chewys", "Mushmom Spore", 150000)
    # Unagi: a megaphone with an unsure name, no shop: not in For sale now for everyone
    chat += [ct("unagiguy", "Unagi", 2000, ns=True)]
    docs = [{"at": at, "src": "watcher-shop", "who": w, "inbox": w[:4].lower(), "day": day, "u": now, "rows": shop} for w in ("Alpha", "Beta")]
    docs.append({"at": at, "src": "watcher-chat", "who": "Alpha", "inbox": "alph", "day": day, "u": now, "rows": chat + [sm]})
    json.dump(docs, open(os.path.join(live, "data", "inbox.json"), "w"))
    json.dump([{"at": at, "src": "stream-chat", "by": "StreamA", "rows": [sm]}, {"at": at, "src": "stream-chat", "by": "StreamB", "rows": [dict(sm, ns=1)]}], open(os.path.join(live, "data", "streams.json"), "w"))
    if os.environ.get("MEGA_LIVE_OUT"): shutil.copytree(live, os.environ["MEGA_LIVE_OUT"], dirs_exist_ok=True)   # for looking at it by hand
    out = os.path.join(tmp, "out", "summary.json"); os.makedirs(os.path.dirname(out))
    env = dict(os.environ, SNAP_OUT=os.path.join(tmp, "snap.json"))
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "snapshot.py"), ROOT, live, out], capture_output=True, text=True, timeout=400, env=env)
    ok("board built", os.path.isfile(out) and os.path.isfile(env["SNAP_OUT"]), (r.stdout + r.stderr)[-300:])
    if os.path.isfile(env["SNAP_OUT"]):
        it = snap_listings(json.load(open(env["SNAP_OUT"])))
        g, dc, tz, mm, un = (it.get(x) or {} for x in ("Gold Ore", "Dark Crystal Ore", "Topaz", "Mushmom Spore", "Unagi"))
        ok("shop asks price the item, chat asks don't move it", 100 <= (g.get("typ") or 0) <= 110 and g.get("basis") == "ask", (g.get("typ"), g.get("basis")))
        ok("a chat ask never moves a sale price", 300000 <= (dc.get("typ") or 0) <= 306000, dc.get("typ"))
        ok("chat-only item priced from its chat asks, outlier left out", 48000 <= (tz.get("typ") or 0) <= 52000 and tz.get("basis") == "chat", (tz.get("typ"), tz.get("basis")))
        mml = [l for l in mm.get("allL", []) if l.get("s") == "chewys"]
        ok("one smega, three readers: one listing", len(mml) == 1, len(mml))
        ok("seen by 3, sure name, kind kept", bool(mml) and (mml[0].get("sn"), mml[0].get("ns"), mml[0].get("mg")) == (3, None, "sm"), mml and mml[0])
        ok("sure megaphone post fills For sale now when no shop has it", [l.get("s") for l in mm.get("buyL", [])] == ["chewys"], [l.get("s") for l in mm.get("buyL", [])])
        ok("Topaz For sale now: the three agreeing posts and the outlier, all sure", len(tz.get("buyL", [])) >= 3, len(tz.get("buyL", [])))
        ok("an unsure name stays out of For sale now", un.get("buyL", []) == [], un.get("buyL"))
        ok("shop item's For sale now is shops only", all(not l.get("chat") for l in g.get("buyL", [])) and len(g.get("buyL", [])) >= 1, [l.get("s") for l in g.get("buyL", [])])

# 8. accuracy on saved megaphone lines
sets = [a for a in sys.argv[1:] if not a.startswith("--")]
if sets:
    sd = sets[0]; truth = json.load(open(os.path.join(sd, "truth.json")))
    SR2 = load(os.path.join(app, "stream_reader.py"), "stream_reader2")
    import fmparse
    W.hover_wanted = HOVER_WANTED     # the board's item names, as the server has them
    try: W.hover_wanted()
    except Exception: pass
    st = {"lines": 0, "posts_true": 0, "right": 0, "wrong": 0, "missed": 0, "extra": 0, "names": 0, "sure_right": 0, "sure_wrong": 0, "unsure": 0, "name_wrong": 0}
    bad = []
    for t in truth:
        crop = Image.open(os.path.join(sd, t["file"]))
        if crop.height < SR2.MEGA_MIN_H: st["skipped_small"] = st.get("skipped_small", 0) + 1; continue   # never read live
        arr = np.asarray(crop.convert("RGB")); med = np.median(arr.reshape(-1, 3), axis=0)
        kind = min(SR2.MEGA_BG, key=lambda k: np.abs(med - np.array(SR2.MEGA_BG[k])).sum())
        if SR2._line_end(arr, kind)[1]: st["skipped_open"] = st.get("skipped_open", 0) + 1; continue      # cut or runs on: never read live
        r = SR2.read_mega_line(crop)
        want = {(s, i, p) for s, i, p, *_ in fmparse.parse_chat_message_x(t["text"])} if t.get("text") is not None else set()
        got = {(s, i, p) for s, i, p, _ in r["rows"]} if r["name"] else set()     # a post goes up only with a name
        # what Stores.add_mega keeps: a price 3x off the board's typical for the item is left out (unless a roll is written)
        kept = set()
        for s_, i_, p_, x_ in (r["rows"] if r["name"] else []):
            i2, p2 = W.chat_price(i_, p_); ref = W.BOARD_TYP.get(i2)
            if not ref or x_ or ref / 3 <= p2 <= ref * 3: kept.add((s_, i_, p_))
        st["kept_right"] = st.get("kept_right", 0) + len(want & kept); st["kept_wrong"] = st.get("kept_wrong", 0) + len(kept - want)
        st["lines"] += 1; st["posts_true"] += len(want)
        st["right"] += len(want & got); st["missed"] += len(want - got); st["extra"] += len(got - want)
        if got - want: bad.append((t["file"], "wrong post", sorted(got - want), t["text"]))
        if t.get("name") and r["name"]:
            st["names"] += 1
            same = SR2.il_rule(t["name"]).lower() == r["name"].lower()
            if r["sure"]: st["sure_right" if same else "sure_wrong"] += 1
            else: st["unsure"] += 1
            if not same: st["name_wrong"] += 1
            if r["sure"] and not same: bad.append((t["file"], "wrong sure name", r["name"], t["name"]))
    got_n = st["right"] + st["extra"]
    prec = st["right"] / got_n if got_n else 1.0
    print(json.dumps(st))
    for b in bad: print("   ", b)
    ok("posts read: item and price right on %d of %d (%.1f%%), %d missed" % (st["right"], got_n, prec * 100, st["missed"]), prec >= 0.99)
    ok("no wrong sure name (%d sure right, %d unsure)" % (st["sure_right"], st["unsure"]), st["sure_wrong"] == 0)
    kr, kw = st.get("kept_right", 0), st.get("kept_wrong", 0)
    ok("posts kept after the board check: %d right, %d wrong" % (kr, kw), kw == 0 or kr / (kr + kw) >= 0.99)

shutil.rmtree(tmp, ignore_errors=True)
print("all passed" if not fails else "%d failed" % len(fails)); sys.exit(1 if fails else 0)
