"""Branch check for Search by stats: loads the live site with this checkout's board files swapped in (same origin, so
the API answers), as an iPhone in WebKit and a desktop in Chromium. Searches, opens Search by stats, taps a copy.
Fails on any script error. Screenshots go to /tmp/advshots. Temporary: removed before the merge."""
import os, sys, json, time
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs("/tmp/advshots", exist_ok=True)
SWAP = ("/assets/board.min.js", "/assets/board.min.css", "/assets/advsearch.js")
def swap(route):
    from urllib.parse import urlparse
    u = urlparse(route.request.url); path = u.path
    f = "index.html" if path in ("/", "/index.html") else path.lstrip("/")
    ct = "text/javascript" if f.endswith(".js") else "text/css" if f.endswith(".css") else "text/html"
    route.fulfill(status=200, content_type=ct, body=open(os.path.join(R, f), "rb").read())
def run(p, name, browser, ctxargs):
    b = browser.launch(); ctx = b.new_context(**ctxargs)
    ctx.route(lambda u: u.split("?")[0].split("#")[0] in ("https://maplefm.gg/", "https://maplefm.gg/index.html") or any(u.startswith("https://maplefm.gg" + s) for s in SWAP), swap)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    t0 = time.time(); pg.goto("https://maplefm.gg/", wait_until="load"); load = time.time() - t0
    pg.wait_for_timeout(20000)
    out = {"load_s": round(load, 2)}
    for q in ["wg 2 crit", "clean wg", "8 att wg", "steel avarice 28 att"]:
        pg.fill("#q", q); pg.wait_for_timeout(2500)
        out[q] = pg.evaluate("() => { const s = document.getElementById('sres'); return s && !s.hidden ? s.querySelectorAll('li').length + ' rows' + (s.querySelector('.ax-near') ? ', closest shown' : '') : 'hidden' }")
    pg.evaluate("() => document.getElementById('sugg').hidden = true")
    pg.click("#advbtn"); pg.wait_for_timeout(1500)
    out["panel"] = pg.evaluate("() => !document.getElementById('advbox').hidden && document.querySelectorAll('#advbox .ax-stc').length + ' stat chips'")
    pg.screenshot(path=f"/tmp/advshots/{name}-panel.png")
    pg.fill("#q", "wg 2 crit"); pg.wait_for_timeout(2500); pg.evaluate("() => document.getElementById('sugg').hidden = true")
    pg.evaluate("() => window.scrollTo(0, document.getElementById('sres').getBoundingClientRect().top + scrollY - 20)"); pg.wait_for_timeout(500)
    pg.screenshot(path=f"/tmp/advshots/{name}-results.png")
    pg.click("#sres li"); pg.wait_for_timeout(3500)
    out["card"] = pg.evaluate("() => { const o = document.querySelector('.gladder .lg.on'); return location.hash + ' grade ' + (o ? o.querySelector('.lgn').textContent : 'none') }")
    pg.screenshot(path=f"/tmp/advshots/{name}-card.png")
    out["heapMB"] = pg.evaluate("() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null")
    out["errors"] = errs
    print(name, json.dumps(out)); b.close()
    return not errs and out["panel"] and "rows" in out["wg 2 crit"]
with sync_playwright() as p:
    ok1 = run(p, "iphone-webkit", p.webkit, dict(p.devices["iPhone 13"]))
    ok2 = run(p, "desktop-chromium", p.chromium, dict(viewport={"width": 1366, "height": 900}))
sys.exit(0 if ok1 and ok2 else 1)
