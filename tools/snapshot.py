"""Build data/summary.json by running the real price board in a headless browser.

The page already knows how to turn raw scans into the price board; this runs it once on the server so
visitors get the finished board from one small file at once, then the raw scans load behind it.

  python3 tools/snapshot.py SITE_DIR LIVE_DIR OUT.json
SITE_DIR holds index.html and its files (main), LIVE_DIR the data branch checkout. Requests for the
live data URL are answered from LIVE_DIR, so the summary matches the data just committed.
"""
import sys, os, json, time
from playwright.sync_api import sync_playwright

SITE, LIVE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
RAW = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/"
HOST = "https://maplefm.test/"

def ctype(f):
    return "text/html" if f.endswith(".html") else "application/json" if f.endswith(".json") else "application/octet-stream"

WORKER = "https://clubfm-accounts.aaweaver93.workers.dev/"
CORS = {"Access-Control-Allow-Origin": "https://maplefm.test", "Access-Control-Allow-Credentials": "true"}

def answer(route, req):
    url = req.url.split("?")[0]
    if url.startswith(WORKER):
        # the board's signed-in data comes from the Worker; here it is answered from the plain files just built
        if url[len(WORKER):] == "data/live":
            out = {}
            for f in ("watcher.json", "watcher-2.json", "watcher-3.json", "watcher-4.json", "streams.json", "streams-vods.json", "inbox.json"):
                p = os.path.join(LIVE, "data", f)
                if os.path.isfile(p):
                    try: out["data/" + f] = json.load(open(p, encoding="utf-8"))
                    except Exception: pass
            return route.fulfill(status=200, content_type="application/json", headers=CORS, body=json.dumps(out))
        return route.abort()
    if url.startswith(RAW): f = os.path.join(LIVE, url[len(RAW):])
    elif url.startswith(HOST): f = os.path.join(SITE, url[len(HOST):] or "index.html")
    else: return route.abort()
    if os.path.isfile(f): route.fulfill(status=200, content_type=ctype(f), body=open(f, "rb").read())
    else: route.fulfill(status=404, body="")

with sync_playwright() as p:
    b = None
    for kw in ({"channel": "chrome"}, {}):
        try: b = p.chromium.launch(**kw); break
        except Exception as e: print("launch", kw, e)
    if not b: sys.exit(1)
    pg = b.new_page()
    pg.route("**/*", answer)
    pg.goto(HOST + "index.html", wait_until="domcontentloaded")
    s = None
    # wait for the live build (not the preview the page shows first), then for the summary it saves after it
    for i in range(240):
        s = pg.evaluate("(function(){var t=window.FM_T0||{}; if(!t.live) return null; var at=performance.timeOrigin+t.live; try{var x=localStorage.getItem('fm-summary'); return x&&JSON.parse(x).at>=at?x:null}catch(e){return null}})()")
        if s: break
        time.sleep(0.5)
    names = pg.evaluate("(function(){var cn=window.fmNames?window.fmNames():{}, m=window.fmClean?window.fmClean():{cl:{},out:{}}, cl={}, out={}; Object.keys(cn).forEach(function(k){ if(m.cl[k]) cl[k]=m.cl[k]; if(m.out[k]) out[k]=m.out[k]; }); return JSON.stringify({at:Date.now(), v:m.v||0, cl:cl, out:out});})()")
    b.close()
    if not s:
        print("no summary built"); sys.exit(1)
    j = json.loads(s)
    print("summary: %d items, %d scanners, %d bytes" % (len(j.get("rows") or []), len(j.get("who") or []), len(s)))
    json.dump(j, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
    # the public copy: prices only (tools/vault.py decides what stays for signed-in members)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from vault import public_summary
    json.dump(public_summary(j), open(os.path.join(os.path.dirname(OUT) or ".", "summary-public.json"), "w", encoding="utf-8"), separators=(",", ":"))
    # equips that need a hover, for FM Watcher's "hover these" nudge: item names and typical prices only
    hw = j.get("hw") or []
    json.dump({"at": int(time.time()), "items": hw}, open(os.path.join(os.path.dirname(OUT) or ".", "hoverwanted.json"), "w", encoding="utf-8"), separators=(",", ":"))
    print("hover wanted: %d items" % len(hw))
    # the tidied spelling of every raw name, so visitors' first build skips that work
    nj = json.loads(names)
    print("names: %d, %d bytes" % (len(nj.get("cl") or {}), len(names)))
    open(os.path.join(os.path.dirname(OUT) or ".", "names.json"), "w", encoding="utf-8").write(names)
