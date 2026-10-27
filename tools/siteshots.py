"""Screenshots of maplefm.gg pages, for the daily #site-updates digest and the weekly Ko-fi update.

Each page that changed today is shot on the live site; yesterday's shot of it sits beside it as "Before". Every
shot is kept by date in the archive (data/shots/<day>/<page>.png), so the whole story of the site builds up there.

  python3 tools/siteshots.py shoot <shots dir> <page> [<page> ...]      shoot pages now (names from PAGES)
  python3 tools/siteshots.py timeline <out.png> <img> [<img> ...]       one picture from older shots, oldest first
"""
import io, json, os, sys, datetime

SITE = "https://maplefm.gg"
# page name -> (path on the site, label, files that change it)
PAGES = {
    "board": ("/", "Price board", ("index.html", "assets/board.js", "assets/board.css", "assets/style.css", "fmengine.js")),
    "report": ("/report.html", "Market report", ("report.html",)),
    "contribute": ("/contribute.html", "Contribute and earn", ("contribute.html", "earn.html")),
    "quests": ("/quests.html", "Quest helper", ("quests.html",)),
    "market": ("/market.html", "Market", ("market.html",)),
    "shop": ("/shop.html", "Shop", ("shop.html",)),
    "map": ("/map.html", "FM map", ("map.html",)),
    "training": ("/training/", "Training guide", ("training/index.html", "tools/trainingpages.py")),
    "streamers": ("/streamers.html", "Streamers", ("streamers.html",)),
    "how": ("/how-it-works.html", "How it works", ("how-it-works.html",)),
}
W, H = 1440, 900

def pages_for(files):
    out = []
    for name, (_, _, owns) in PAGES.items():
        if any(f == o or (o.endswith("/") and f.startswith(o)) for f in files for o in owns):
            out.append(name)
    return out

def shoot(pages):
    """{page: png bytes} of the live site, desktop size, after the data has loaded."""
    from playwright.sync_api import sync_playwright
    shots = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, color_scheme="dark")
        for name in pages:
            path = PAGES[name][0]
            pg = ctx.new_page()
            try:
                pg.goto(SITE + path + ("&" if "?" in path else "?") + "ref=shot", wait_until="load", timeout=45000)
            except Exception as e:
                print("shot", name, e)
            pg.wait_for_timeout(7000)
            shots[name] = pg.screenshot(type="png")
            pg.close()
        b.close()
    return shots

def _font(n):
    from PIL import ImageFont
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"):
        if os.path.exists(f): return ImageFont.truetype(f, n)
    return ImageFont.load_default(size=n)

def labeled(img, text, w):
    """The shot scaled to width w with a label bar on top."""
    from PIL import Image, ImageDraw
    s = img.resize((w, int(img.height * w / img.width)))
    out = Image.new("RGB", (w, s.height + 44), (24, 22, 34))
    out.paste(s, (0, 44))
    ImageDraw.Draw(out).text((16, 9), text, fill=(246, 201, 74), font=_font(24))
    return out

def before_after(before_png, after_png, title):
    """One picture: before on the left, now on the right, under the page's name. No before: just now."""
    from PIL import Image, ImageDraw
    a = Image.open(io.BytesIO(after_png)).convert("RGB")
    if before_png:
        b = Image.open(io.BytesIO(before_png)).convert("RGB")
        L, R = labeled(b, "Before", 900), labeled(a, "Now", 900)
        out = Image.new("RGB", (1820, max(L.height, R.height) + 64), (16, 15, 24))
        out.paste(L, (0, 64)); out.paste(R, (920, 64))
    else:
        R = labeled(a, "Now", 1440)
        out = Image.new("RGB", (1440, R.height + 64), (16, 15, 24))
        out.paste(R, (0, 64))
    ImageDraw.Draw(out).text((16, 14), title, fill=(255, 255, 255), font=_font(32))
    buf = io.BytesIO(); out.save(buf, "PNG", optimize=True)
    return buf.getvalue()

def grid(items, title):
    """Up to four (label, png) in a 2x2 grid under a title: the week on one picture."""
    from PIL import Image, ImageDraw
    items = items[:4]
    cells = [labeled(Image.open(io.BytesIO(p)).convert("RGB"), lab, 900) for lab, p in items]
    if not cells: return None
    cols = 1 if len(cells) == 1 else 2
    rows = (len(cells) + cols - 1) // cols
    ch = max(c.height for c in cells)
    out = Image.new("RGB", (cols * 900 + (cols - 1) * 20, rows * ch + (rows - 1) * 20 + 72), (16, 15, 24))
    for i, c in enumerate(cells):
        out.paste(c, ((i % cols) * 920, 72 + (i // cols) * (ch + 20)))
    ImageDraw.Draw(out).text((16, 16), title, fill=(255, 255, 255), font=_font(36))
    buf = io.BytesIO(); out.save(buf, "PNG", optimize=True)
    return buf.getvalue()

def latest(shots_dir, name, before_day):
    """The newest kept shot of a page from before the given day."""
    if not os.path.isdir(shots_dir): return None
    days = sorted(d for d in os.listdir(shots_dir) if d[:4].isdigit() and d < before_day and os.path.exists(os.path.join(shots_dir, d, name + ".png")))
    if not days: return None
    return open(os.path.join(shots_dir, days[-1], name + ".png"), "rb").read()

def keep(shots_dir, day, name, png):
    d = os.path.join(shots_dir, day); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, name + ".png"), "wb").write(png)

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "shoot":
        day = datetime.date.today().isoformat()
        for n, png in shoot(sys.argv[3:]).items():
            keep(sys.argv[2], day, n, png); print("kept", n, len(png))
    elif cmd == "timeline":
        imgs = [(os.path.basename(os.path.dirname(f)), open(f, "rb").read()) for f in sys.argv[3:]]
        open(sys.argv[2], "wb").write(grid(imgs, "Club FM, then and now"))
