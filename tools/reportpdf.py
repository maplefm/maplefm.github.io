"""Make the market close PDF the same way the report page's Export PDF button does, in a headless browser.

  python3 tools/reportpdf.py SITE_DIR REPORT.json OUT.pdf

SITE_DIR holds report.html and its files (main). The page's request for the live report is answered from
REPORT.json, so the PDF matches the report just built. Exits 1 (and writes nothing) when the PDF can't be made;
the market close post then goes out without it.
"""
import sys, os, base64, time
from playwright.sync_api import sync_playwright

SITE, REPORT, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
RAW = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/"
HOST = "https://maplefm.test/"
FONTS = ("https://fonts.googleapis.com/", "https://fonts.gstatic.com/")
TYPES = {".html": "text/html", ".json": "application/json", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2"}


def answer(route, req):
    url = req.url.split("?")[0]
    if url.startswith(FONTS): return route.continue_()
    if url == RAW + "data/report.json": f = REPORT
    elif url.startswith(HOST): f = os.path.join(SITE, url[len(HOST):] or "index.html")
    else: return route.abort()
    if os.path.isfile(f): route.fulfill(status=200, content_type=TYPES.get(os.path.splitext(f)[1], "application/octet-stream"), body=open(f, "rb").read())
    else: route.fulfill(status=404, body="")


def main():
    with sync_playwright() as p:
        b = None
        for kw in ({"channel": "chrome"}, {}):
            try: b = p.chromium.launch(**kw); break
            except Exception as e: print("launch", kw, e)
        if not b: return 1
        pg = b.new_page(viewport={"width": 900, "height": 1200}, color_scheme="light")
        pg.route("**/*", answer)
        # the page's own export saves the file; here it hands the bytes back instead, and says why if it fails
        pg.add_init_script("""
          window.alert = function (m) { window.__pdferr = String(m); };
          localStorage.setItem('fm-night', 'false');
          (function hook() {
            if (window.jspdf && jspdf.jsPDF) { jspdf.jsPDF.API.save = function (n) { window.__pdfname = n; window.__pdf = this.output('datauristring'); return this; }; return; }
            setTimeout(hook, 50);
          })();
        """)
        pg.goto(HOST + "report.html", wait_until="domcontentloaded")
        pg.wait_for_function("document.querySelector('#body .panel.loading') === null", timeout=60000)
        pg.wait_for_timeout(1500)
        pg.evaluate("document.getElementById('pdf').hidden = false; document.getElementById('pdf').click()")
        for _ in range(240):
            st = pg.evaluate("[window.__pdf || '', window.__pdferr || '']")
            if st[0] or st[1]: break
            time.sleep(0.5)
        b.close()
        if not st[0]:
            print("pdf failed:", st[1] or "timed out"); return 1
        data = base64.b64decode(st[0].split(",", 1)[1])
        open(OUT, "wb").write(data)
        print("pdf", OUT, len(data), "bytes")
        return 0


if __name__ == "__main__":
    sys.exit(main())
