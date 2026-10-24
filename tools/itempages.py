"""Build a static page for every priced item, so a search like "work gloves price maplestory classic" lands on Club FM.

  python tools/itempages.py SUMMARY.json OUT_DIR

Reads the board's own summary (data/summary.json on the live branch) and the item list, and writes
OUT_DIR/item/<slug>/index.html for each item with enough data, an index at OUT_DIR/items/index.html, and
OUT_DIR/sitemap.xml. Pages are plain HTML with the numbers in them, no script needed to read the price.
"""
import json, os, re, sys, html, datetime

SITE = "https://maplefm.gg"
TIER = {"Lesser": "100%", "Intermediate": "60%", "Greater": "10%"}
CATS = {"Cash": "Cash Shop"}


def shown(name):
    m = re.match(r"^(.*Scroll): (Lesser|Intermediate|Greater|Chaos|Superior)$", name)
    return f"{m.group(1)} {TIER.get(m.group(2), m.group(2))}" if m else name


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", shown(name).lower().replace("%", "")).strip("-")


def meso(n):
    n = float(n or 0)
    if n >= 999.5e6: return f"{n / 1e9:.2f}".rstrip("0").rstrip(".") + "B"
    if n >= 999.5e3: return (f"{n / 1e6:.1f}" if n >= 9.95e6 else f"{n / 1e6:.2f}").rstrip("0").rstrip(".") + "M"
    if n >= 1e4: return (f"{n / 1e3:.0f}" if n >= 99.95e3 else f"{n / 1e3:.1f}").rstrip("0").rstrip(".") + "K"
    return f"{n:,.0f}" if n >= 10 else f"{n:.1f}".rstrip("0").rstrip(".")


def full(n): return f"{float(n or 0):,.0f}"


CONF = {"verified": ("Verified", "fresh sales caught by two or more trusted scanners"),
        "watched": ("Watched", "fresh sales caught by one trusted scanner"),
        "lead": ("Lead", "older sales or asking prices; treat as a guide")}

CSS = """:root{--bg:#f7f1ff;--panel:#fff8e7;--panel2:#f3ecff;--ink:#2a1c4a;--muted:#6b5a8c;--line:#e0c08a;--line2:#d9cdf2;--accent:#6d3fd1;--wood:#7a3b0c;--up:#12895f;--down:#d0402f}
@media (prefers-color-scheme:dark){:root{--bg:#1b1430;--panel:#2a2140;--panel2:#352a52;--ink:#f1e9ff;--muted:#b6a7d6;--line:#4a3a6a;--line2:#4a3a6a;--accent:#b89bff;--wood:#c58a4d;--up:#3ccf91;--down:#ff7a6b}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Inter,system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 64px}
a{color:var(--accent)} .top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.top a.brand{font-weight:900;text-decoration:none;font-size:1.1rem}.top a.go{background:var(--accent);color:#fff;padding:8px 14px;border-radius:999px;text-decoration:none;font-weight:800}
.card{background:var(--panel);border:3px solid var(--wood);border-radius:16px;padding:20px 22px}
.hd{display:flex;gap:14px;align-items:center}.hd img{width:56px;height:56px;image-rendering:auto;background:var(--panel2);border-radius:12px;padding:6px;object-fit:contain}
h1{margin:0;font-size:1.6rem;line-height:1.15}.sub{color:var(--muted);font-weight:700;font-size:.9rem;margin:2px 0 0}
.big{font-size:2.2rem;font-weight:900;margin:16px 0 0}.big small{font-size:.95rem;color:var(--muted);font-weight:700;margin-left:8px}
.chg{display:inline-block;font-size:.85rem;font-weight:800;padding:2px 10px;border-radius:999px;margin-left:8px;vertical-align:middle}.chg.up{color:var(--up);background:rgba(18,137,95,.12)}.chg.down{color:var(--down);background:rgba(208,64,47,.12)}
.note{color:var(--muted);font-size:.9rem;margin:6px 0 0}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.grid div{background:var(--panel2);border:1px solid var(--line2);border-radius:12px;padding:10px 12px}.grid b{display:block;font-size:1.2rem}.grid span{color:var(--muted);font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
table{width:100%;border-collapse:collapse;margin-top:6px}td,th{padding:6px 8px;border-bottom:1px solid var(--line2);text-align:left;font-size:.92rem}th{color:var(--muted);font-size:.75rem;text-transform:uppercase}
h2{font-size:1.05rem;margin:22px 0 4px}.rel{display:flex;flex-wrap:wrap;gap:8px}.rel a{background:var(--panel2);border:1px solid var(--line2);border-radius:999px;padding:4px 12px;text-decoration:none;font-weight:700;font-size:.88rem;color:var(--ink)}
.foot{color:var(--muted);font-size:.82rem;margin-top:22px}
@media (max-width:520px){.grid{grid-template-columns:1fr 1fr}.big{font-size:1.8rem}}"""


def page(title, desc, canon, body, ld=None):
    t, d = html.escape(title), html.escape(desc)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{t}</title><meta name="description" content="{d}"><link rel="canonical" href="{canon}">
<meta property="og:title" content="{t}"><meta property="og:description" content="{d}"><meta property="og:url" content="{canon}"><meta property="og:image" content="{SITE}/og.png"><meta property="og:type" content="website">
<link rel="icon" href="/og-icon.png?v=3"><link rel="stylesheet" href="/item/item.css?v=1">{ld or ''}</head><body><main>
<div class="top"><a class="brand" href="/"><img src="/assets/superstar@4x.png" alt="" style="height:1.15em;vertical-align:-0.2em;image-rendering:pixelated"> Club FM</a><a class="go" href="/">Open the live price board</a></div>
{body}
<p class="foot">Prices come from sales that players running FM Watcher saw happen in Free Market shops, updated through the day. Club FM is a fan site and not affiliated with Nexon. <a href="/terms.html">Terms</a></p>
</main></body></html>"""


NX = {}


def main():
    global NX
    try: NX = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "nx_prices.json")))["prices"]
    except Exception: NX = {}
    summ_path, out = sys.argv[1], sys.argv[2]
    summ = json.load(open(summ_path, encoding="utf-8"))
    db = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "itemdb.json")))["items"]
    ids = {r[0]: r[1] for r in db}
    vendor = {r[0]: r[6] for r in db if len(r) > 6}
    rows = [r for r in (summ.get("rows") or []) if isinstance(r, dict) and r.get("item") in ids and (r.get("n") or 0) >= 5 and r.get("typ")]
    when = datetime.datetime.fromtimestamp((summ.get("at") or 0) / 1000, datetime.timezone.utc).strftime("%B %-d, %Y")
    bycat = {}
    for r in rows: bycat.setdefault(r.get("cat") or "Other", []).append(r)
    for c in bycat.values(): c.sort(key=lambda r: -(r.get("vol") or 0))
    made = []
    for r in rows:
        name, s = r["item"], slug(r["item"])
        nm = shown(name); cat = CATS.get(r.get("cat"), r.get("cat") or "Item")
        rng = f"{meso(r['lo'])} to {meso(r['hi'])}" if r.get("hi", 0) > r.get("lo", 0) and meso(r["lo"]) != meso(r["hi"]) else meso(r["typ"])
        mv = (r.get("mv") or [None])[0]
        chg = f'<span class="chg {"up" if mv > 0 else "down"}">{"▲" if mv > 0 else "▼"} {abs(round(mv * 100))}% in 24h</span>' if isinstance(mv, (int, float)) and abs(mv) >= 0.01 else ""
        conf = CONF.get(r.get("conf") or "", None)
        basis = "from sales players watched happen" if r.get("kind") == "sale" else "from asking prices; few sales seen yet"
        icon = f"https://maplestory.io/api/MCW/1/item/{ids[name]}/icon"
        daily = [d for d in (r.get("daily") or []) if d and d[1]][-7:]
        dtab = "".join(f"<tr><td>{datetime.datetime.fromtimestamp(d[0] / 1000, datetime.timezone.utc).strftime('%a %b %-d')}</td><td>{full(d[1])}</td></tr>" for d in reversed(daily))
        vp = vendor.get(name) or 0
        vp = vp if vp > 1 else 0
        nx = NX.get(name)
        rel = [x for x in bycat.get(r.get("cat") or "Other", []) if x["item"] != name][:8]
        rels = "".join(f'<a href="/item/{slug(x["item"])}/">{html.escape(shown(x["item"]))} · {meso(x["typ"])}</a>' for x in rel)
        desc = f"{nm} price in MapleStory Classic: typically {full(r['typ'])} mesos ({rng}) {basis}. {r.get('salesN') or 0} sales seen recently on the Free Market."
        body = f"""<div class="card"><div class="hd"><img src="{icon}" alt="" width="56" height="56" loading="lazy"><div><h1>{html.escape(nm)} price</h1><p class="sub">MapleStory Classic · {html.escape(cat)}</p></div></div>
<p class="big"><span id="rng">{rng}</span>{chg}<small>mesos</small></p>
<p class="note">Typical <span id="typ">{full(r['typ'])}</span> mesos, {basis}.{f' {conf[0]}: {conf[1]}.' if conf else ''}</p>
<div class="grid"><div><span>Typical</span><b id="t2">{meso(r['typ'])}</b></div><div><span>Sales seen</span><b id="sn">{full(r.get('salesN') or 0)}</b></div><div><span>Listings seen</span><b id="ln">{full(r.get('n') or 0)}</b></div>
{f'<div><span>Cheapest ask now</span><b id="ba">{meso(r["best"])}</b></div>' if r.get('best') else ''}{f'<div><span>NPC pays</span><b>{meso(vp)}</b></div>' if vp else ''}{f'<div><span>Cash Shop</span><b>{full(nx)} NX</b></div>' if nx else ''}</div>
{f'<h2>Typical price by day</h2><table><tr><th>Day</th><th>Typical, mesos</th></tr>{dtab}</table>' if dtab else ''}
<p style="margin-top:16px"><a href="/#item={html.escape(name)}">See live listings, rolls and recent sales for {html.escape(nm)} on the board →</a></p>
{f'<h2>More {html.escape(cat)} prices</h2><div class="rel">{rels}</div>' if rels else ''}
<p class="note" id="upd">Updated {when}.</p></div>
<script>window.FM_ITEM={json.dumps(name)};</script><script src="/item/live.js" defer></script>"""
        ld = '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Club FM", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Item prices", "item": SITE + "/items/"},
            {"@type": "ListItem", "position": 3, "name": nm, "item": f"{SITE}/item/{s}/"}]}) + "</script>"
        d = os.path.join(out, "item", s); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page(f"{nm} price · MapleStory Classic · Club FM", desc, f"{SITE}/item/{s}/", body, ld))
        made.append((s, nm, r))
    # the index: every item by category, biggest markets first
    secs = ""
    for cat in sorted(bycat, key=lambda c: -sum(x.get("vol") or 0 for x in bycat[c])):
        items = "".join(f'<a href="/item/{slug(x["item"])}/">{html.escape(shown(x["item"]))} · {meso(x["typ"])}</a>' for x in bycat[cat])
        secs += f'<h2>{html.escape(CATS.get(cat, cat))}</h2><div class="rel">{items}</div>'
    idx = f'<div class="card"><h1>MapleStory Classic item prices</h1><p class="sub">{len(made)} items priced from watched Free Market sales · updated {when}</p>{secs}</div>'
    os.makedirs(os.path.join(out, "items"), exist_ok=True)
    open(os.path.join(out, "items", "index.html"), "w", encoding="utf-8").write(page("MapleStory Classic item prices · Club FM", f"Free Market prices for {len(made)} MapleStory Classic items, from sales players watched happen.", SITE + "/items/", idx))
    # remove pages for items that dropped out, so stale prices don't linger in search
    keep = {s for s, _, _ in made}
    root = os.path.join(out, "item")
    for s in os.listdir(root):
        if s not in keep and s not in ("live.js", "item.css") and os.path.isdir(os.path.join(root, s)):
            p = os.path.join(root, s, "index.html")
            if os.path.exists(p): os.remove(p)
            try: os.rmdir(os.path.join(root, s))
            except OSError: pass
    open(os.path.join(out, "item", "item.css"), "w").write(CSS + "\n")
    today = datetime.date.today().isoformat()
    urls = [f"{SITE}/", f"{SITE}/items/", f"{SITE}/contribute.html", f"{SITE}/report.html", f"{SITE}/shortcuts.html", f"{SITE}/bot/"] + [f"{SITE}/item/{s}/" for s, _, _ in made]
    open(os.path.join(out, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                                                    "".join(f"<url><loc>{u}</loc><lastmod>{today}</lastmod></url>\n" for u in urls) + "</urlset>\n")
    print(len(made), "item pages")


if __name__ == "__main__":
    main()
