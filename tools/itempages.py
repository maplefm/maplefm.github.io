"""Build a static page for every priced item, so a search like "work gloves price maplestory classic" lands on Club FM.

  python tools/itempages.py SUMMARY.json OUT_DIR

Reads the board's own summary (data/summary.json on the live branch) and the item list, and writes
OUT_DIR/item/<slug>/index.html for each item with enough data, an index at OUT_DIR/items/index.html, and
OUT_DIR/sitemap.xml. Pages are plain HTML with the numbers in them, no script needed to read the price.
"""
import urllib.parse, json, os, re, sys, html, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nav import nav_html as NAV, foot_html as FOOT

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
@media (max-width:520px){.grid{grid-template-columns:1fr 1fr}.big{font-size:1.8rem}}
td.n{text-align:right;white-space:nowrap;font-weight:800}td small{color:var(--muted)}.rc{margin:6px 0;font-size:.92rem}.src{font-size:.75rem}
.craft{background:var(--panel2);border:1px solid var(--line2);border-radius:12px;padding:8px 12px;margin:8px 0}.craft table{margin:2px 0 0}.craft td{border-bottom:0;padding:3px 4px}
.ch{margin:0;font-size:.95rem}.tag{display:inline-block;background:var(--accent);color:#fff;font-size:.7rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border-radius:6px;padding:1px 7px;vertical-align:1px}
.gi{display:inline-block;width:24px;height:24px;vertical-align:middle;object-fit:contain;margin-right:4px}
#q{width:100%;box-sizing:border-box;font:600 1.05rem Inter,system-ui,sans-serif;padding:12px 14px;margin:14px 0 8px;border:3px solid var(--accent);border-radius:14px;background:var(--bg);color:var(--ink)}
.bar{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.chips{display:flex;gap:6px;flex-wrap:wrap}
.cc{font:700 .82rem Inter,system-ui,sans-serif;border:1px solid var(--line2);background:var(--panel2);color:var(--ink);padding:5px 11px;border-radius:999px;cursor:pointer}.cc.on{background:var(--accent);border-color:var(--accent);color:#fff}
.srt{font-size:.82rem;font-weight:700;color:var(--muted)}.srt select{font:700 .85rem Inter,system-ui,sans-serif;border:1px solid var(--line2);background:var(--panel2);color:var(--ink);border-radius:8px;padding:4px 6px}
.cat h2 small{color:var(--muted);font-size:.8rem}.its{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px}@media (max-width:600px){.its{grid-template-columns:1fr}}
.it{display:grid;grid-template-columns:28px minmax(0,1fr) auto 46px;gap:8px;align-items:center;padding:5px 6px;border-radius:10px;text-decoration:none;color:var(--ink);border-bottom:1px solid var(--line2)}.it:hover{background:var(--panel2)}
.it img{width:28px;height:28px;object-fit:contain}.it .nm{font-weight:600;font-size:.92rem;line-height:1.25;overflow-wrap:anywhere}.it .pr{font-size:.95rem}.mv{font-size:.74rem;font-weight:800;text-align:right}.mv.up{color:var(--up)}.mv.down{color:var(--down)}
.more{margin:8px 0 0;font:700 .85rem Inter,system-ui,sans-serif;border:1px solid var(--line2);background:var(--panel2);color:var(--accent);padding:6px 12px;border-radius:10px;cursor:pointer}
.top .nav{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.top .nav a.sm{font-weight:700;text-decoration:none;font-size:.88rem}"""


OG = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/og/"


def crumbs_html(cr):
    """Prices › All items › Work Gloves: where this page sits, each step a link back"""
    if not cr: return ""
    parts = [f'<a href="{u}">{html.escape(n)}</a>' for n, u in cr[:-1]] + [f'<span aria-current="page">{html.escape(cr[-1][0])}</span>']
    return '<nav class="crumbs" aria-label="You are here">' + ' <i>›</i> '.join(parts) + '</nav>'


def page(title, desc, canon, body, ld=None, og=None, active="items", crumbs=None):
    t, d = html.escape(title), html.escape(desc)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{t}</title><meta name="description" content="{d}"><link rel="canonical" href="{canon}">
<meta property="og:title" content="{t}"><meta property="og:description" content="{d}"><meta property="og:url" content="{canon}"><meta property="og:image" content="{og or SITE + "/og.png"}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="stylesheet" href="/item/item.css?v=4"><link rel="stylesheet" href="/assets/nav.css?v=2">{ld or ''}</head><body><main>
{NAV(active)}
{crumbs_html(crumbs)}{body}
</main>{FOOT()}<script src="/assets/hit.js" defer></script></body></html>"""


NX = {}


IDS = {}


QSLUG, BSLUG, MSLUG, MOBID = {}, {}, {}, {}


def qlink(qn, qid):
    """a quest name that opens its guide page, or the Quest Log when it has none"""
    href = f"/quest/{QSLUG[qid]}/" if qid in QSLUG else f"/quests.html#q-{qid}" if qid else "/quests.html?q=" + urllib.parse.quote(qn)
    return f'<a href="{href}">{html.escape(qn)}</a>'


def guide_html(name, g, page_of):
    """quests, drops, crafting and shops for an item, as plain HTML (data/itemguide.json)"""
    if not g: return ""
    def link(n, c=None):
        t = html.escape(shown(n)) + (f" ×{c:,}" if c is not None else "")
        return f'<a href="/item/{page_of[n]}/">{t}</a>' if n in page_of else f'<a href="/#item={urllib.parse.quote(n)}">{t}</a>'
    def ico(n):
        return f'<img class="gi" src="https://maplestory.io/api/MCW/1/item/{IDS[n]}/icon" alt="" loading="lazy">' if n in IDS else '<span class="gi"></span>'
    out = ""
    if g.get("q"):
        tot = sum(q[2] for q in g["q"])
        rows = "".join(f"<tr><td><b>{qlink(q[0], q[7] if len(q) > 7 else None)}</b><br><small>{html.escape(' · '.join(x for x in [('from ' + q[3]) if q[3] else '', q[4], f'Lv {q[1]}+' if q[1] else '', 'repeatable' if q[5] else ''] if x))}</small></td><td class=n>×{q[2]:,}</td></tr>" for q in g["q"])
        out += f'<h2>Quests that need {html.escape(shown(name))}</h2><p class="note">{len(g["q"])} quest{"s" if len(g["q"]) != 1 else ""}{f", {tot:,} in all" if len(g["q"]) > 1 else ""}. Tap a quest to open it in the <a href="/quests.html">Quest Log</a>.</p><table>{rows}</table>'
    get = ""
    for c in g.get("c") or []:
        rows = "".join(f'<tr><td>{ico(x[0])} {link(x[0])}</td><td class=n>×{x[1]:,}</td></tr>' for x in c[2])
        if c[5]: rows += f'<tr><td>{ico(c[5][0])} {link(c[5][0])} <small>catalyst</small></td><td class=n>×{c[5][1]:,}</td></tr>'
        if c[3]: rows += f'<tr><td><small>Crafting fee</small></td><td class=n>{full(c[3])} mesos</td></tr>'
        get += (f'<div class="craft"><p class="ch"><span class="tag">Crafted</span> <b>{html.escape(c[0])}</b> Lv {c[1]} · makes {c[4]:,} per craft</p>'
                f'<table>{rows}</table></div>')
    if g.get("d"):
        pic = lambda n: f'<img class="mobpic" src="https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/sprite/{MOBID[n]}.gif" alt="" loading="lazy" onerror="this.remove()">' if n in MOBID else ''
        mob = lambda n: (f'<a class="mobl" href="/monster/{BSLUG[n]}/">{pic(n)}{html.escape(n)}</a>' if n in BSLUG else pic(n) + html.escape(n))
        mp = lambda n: f'<a href="/map/{MSLUG[n]}/">{html.escape(n)}</a>' if n in MSLUG else html.escape(n)
        get += "<h3 class=\"dropby\">Dropped by</h3>"
        get += "<table>" + "".join(f"<tr><td><b>{mob(d[0])}</b>{f' (Lv {d[1]})' if d[1] else ''}<br><small>{' · '.join(x for x in [mp(d[4]) if d[4] else '', 'only while on the quest' if d[5] else ''] if x)}</small></td><td class=n>{(str(d[2]) + '%') if d[2] is not None else 'drops'}</td></tr>" for d in g["d"]) + "</table>"
    for x in g.get("g") or []:
        get += f'<p class="rc">{"Given by the NPC during" if x[2] == "given" else "Reward from the quest"} {qlink(x[0], x[1])}</p>'
    if g.get("s"):
        get += "<table>" + "".join(f"<tr><td><b>{html.escape(x[0])}</b><br><small>Sold by NPC{(' · ' + html.escape(x[1])) if x[1] else ''}</small></td><td class=n>{full(x[2])} {html.escape(x[3] or 'mesos')}</td></tr>" for x in g["s"]) + "</table>"
    for x in g.get("r") or []:
        get += f'<p class="rc">From {html.escape(x[0])}{f" ({x[1]}%)" if x[1] is not None else ""}{(" · during " + html.escape(x[2])) if x[2] else ""}</p>'
    if not get and g.get("t"):
        get += f'<p class="rc">Quest item, found while doing the quest. In game: <i>{html.escape(g["t"])}</i></p>'
    if get: out += f"<h2>Where to get {html.escape(shown(name))}</h2>{get}"
    if g.get("u"): out += f'<p class="note">Used in {g["u"]} crafting recipe{"s" if g["u"] != 1 else ""}.</p>'
    if out: out += '<p class="note src">Quests from the game data. Givers, crafting and shops from the <a href="https://mapleclassic.wiki/" rel="noopener">MapleStory Classic Wiki</a> (CC BY-NC-SA 4.0). Drops are reported by players; a rate shows where enough kills were counted.</p>'
    return out


def main():
    global NX
    try: NX = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "nx_prices.json")))["prices"]
    except Exception: NX = {}
    summ_path, out = sys.argv[1], sys.argv[2]
    try: GUIDE = json.load(open(sys.argv[3], encoding="utf-8"))["items"] if len(sys.argv) > 3 else {}
    except Exception: GUIDE = {}
    summ = json.load(open(summ_path, encoding="utf-8"))
    world_paths = []
    if len(sys.argv) > 4 and os.path.exists(sys.argv[4]):
        # map, monster, quest and training pages first, so item pages can link to them
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import worldpages
        notes = json.load(open(sys.argv[5], encoding="utf-8")) if len(sys.argv) > 5 and os.path.exists(sys.argv[5]) else {}
        gfull = json.load(open(sys.argv[3], encoding="utf-8")) if len(sys.argv) > 3 else {}
        wj = json.load(open(sys.argv[4], encoding="utf-8"))
        world_paths, qs, bs, ms = worldpages.build(wj, gfull, summ, notes, out)
        QSLUG.update(qs); BSLUG.update(bs); MSLUG.update(ms)
        MOBID.update({n: m["id"] for n, m in (wj.get("mobs") or {}).items() if m.get("id")})
        print(len(world_paths), "world pages")
    db = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "itemdb.json")))["items"]
    ids = {r[0]: r[1] for r in db}
    IDS.update(ids)
    vendor = {r[0]: r[6] for r in db if len(r) > 6}
    rows = [r for r in (summ.get("rows") or []) if isinstance(r, dict) and r.get("item") in ids and (r.get("n") or 0) >= 5 and r.get("typ")]
    when = datetime.datetime.fromtimestamp((summ.get("at") or 0) / 1000, datetime.timezone.utc).strftime("%B %-d, %Y")
    bycat = {}
    for r in rows: bycat.setdefault(r.get("cat") or "Other", []).append(r)
    for c in bycat.values(): c.sort(key=lambda r: -(r.get("vol") or 0))
    made = []
    page_of = {r["item"]: slug(r["item"]) for r in rows}
    extra = [n for n, g in GUIDE.items() if n not in page_of and n in ids and (g.get("q") or g.get("c") or g.get("d") or g.get("g") or g.get("u"))]
    for n in extra: page_of[n] = slug(n)
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
        desc = (f"{nm} sells for about {full(r['typ'])} mesos in MapleStory Classic" + (f", most sales {rng}" if " to " in rng else "") +
                f". {r.get('salesN') or 0:,} Free Market sales seen, {'from sales players watched happen' if r.get('kind') == 'sale' else 'from asking prices'}, updated daily.")
        body = f"""<div class="card"><div class="hd"><img src="{icon}" alt="" width="56" height="56" loading="lazy"><div><h1>{html.escape(nm)} price</h1><p class="sub">MapleStory Classic · {html.escape(cat)}</p></div></div>
<p class="big"><span id="rng">{rng}</span>{chg}<small>mesos</small></p>
<p class="note">Typical <span id="typ">{full(r['typ'])}</span> mesos, {basis}.{f' {conf[0]}: {conf[1]}.' if conf else ''}</p>
<div class="grid"><div><span>Typical</span><b id="t2">{meso(r['typ'])}</b></div><div><span>Sales seen</span><b id="sn">{full(r.get('salesN') or 0)}</b></div><div><span>Listings seen</span><b id="ln">{full(r.get('n') or 0)}</b></div>
{f'<div><span>Cheapest ask now</span><b id="ba">{meso(r["best"])}</b></div>' if r.get('best') else ''}{f'<div><span>NPC pays</span><b>{meso(vp)}</b></div>' if vp else ''}{f'<div><span>Cash Shop</span><b>{full(nx)} NX</b></div>' if nx else ''}</div>
{f'<h2>Typical price by day</h2><table><tr><th>Day</th><th>Typical, mesos</th></tr>{dtab}</table>' if dtab else ''}
<p style="margin-top:16px"><a href="/#item={html.escape(name)}">See live listings, rolls and recent sales for {html.escape(nm)} on the board →</a></p>
{guide_html(name, GUIDE.get(name), page_of)}
{f'<h2>More {html.escape(cat)} prices</h2><div class="rel">{rels}</div>' if rels else ''}
<p class="note" id="upd">Updated {when}.</p></div>
<script>window.FM_ITEM={json.dumps(name)};</script><script src="/item/live.js" defer></script>"""
        ld = '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Club FM", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Item prices", "item": SITE + "/items/"},
            {"@type": "ListItem", "position": 3, "name": nm, "item": f"{SITE}/item/{s}/"}]}) + "</script>"
        # the share card doubles as the page's picture for search results
        ld += '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@type": "WebPage", "name": f"{nm} price", "url": f"{SITE}/item/{s}/",
            "description": desc, "dateModified": datetime.date.today().isoformat(), "isPartOf": {"@type": "WebSite", "name": "Club FM", "url": SITE + "/"},
            "primaryImageOfPage": {"@type": "ImageObject", "url": OG + s + ".png", "width": 1200, "height": 630}, "image": [OG + s + ".png", icon]}) + "</script>"
        ld += f'<meta name="thumbnail" content="{OG}{s}.png">'

        d = os.path.join(out, "item", s); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page(f"{nm} price · MapleStory Classic · Club FM", desc, f"{SITE}/item/{s}/", body, ld, OG + s + ".png", crumbs=[("Prices", "/"), ("All items", "/items/"), (nm, "")]))
        made.append((s, nm, r))
    for name in extra:
        s = slug(name); nm = shown(name); g = GUIDE[name]
        icon = f"https://maplestory.io/api/MCW/1/item/{ids[name]}/icon"
        qn = len(g.get("q") or [])
        desc = f"{nm} in MapleStory Classic: " + (f"needed for {qn} quest{'s' if qn != 1 else ''}, " if qn else "") + "where it drops, how to craft it and who sells it."
        body = f"""<div class="card"><div class="hd"><img src="{icon}" alt="" width="56" height="56" loading="lazy"><div><h1>{html.escape(nm)}</h1><p class="sub">MapleStory Classic · quests, drops and crafting</p></div></div>
<p class="note">No Free Market price yet: nobody has seen one sell. <a href="/#item={html.escape(name)}">Check the board</a> for listings.</p>
{guide_html(name, g, page_of)}</div>"""
        d = os.path.join(out, "item", s); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page(f"{nm} · quests, drops, crafting · MapleStory Classic · Club FM", desc, f"{SITE}/item/{s}/", body, crumbs=[("Prices", "/"), ("All items", "/items/"), (nm, "")]))
        made.append((s, nm, None))
    # the index: a searchable list, every item by category, biggest markets first; plain links so search engines read it
    secs = ""
    order = sorted(bycat, key=lambda c: -sum(x.get("vol") or 0 for x in bycat[c]))
    chips = '<button type="button" class="cc on" data-c="">All</button>' + "".join(f'<button type="button" class="cc" data-c="{html.escape(c)}">{html.escape(CATS.get(c, c))}</button>' for c in order)
    for cat in order:
        li = ""
        for x in bycat[cat]:
            mv = (x.get("mv") or [None])[0]
            ch = f'<span class="mv {"up" if mv > 0 else "down"}">{"▲" if mv > 0 else "▼"}{abs(round(mv * 100))}%</span>' if isinstance(mv, (int, float)) and abs(mv) >= 0.01 else '<span class="mv"></span>'
            li += (f'<a class="it" href="/item/{slug(x["item"])}/" data-n="{html.escape(shown(x["item"]).lower())}" data-p="{int(x["typ"])}" data-v="{int(x.get("vol") or 0)}" data-m="{round(mv or 0, 3) if isinstance(mv, (int, float)) else 0}" data-k="{html.escape(x["item"])}">'
                   f'<img src="https://maplestory.io/api/MCW/1/item/{ids[x["item"]]}/icon" alt="" width="28" height="28" loading="lazy"><span class="nm">{html.escape(shown(x["item"]))}</span><b class="pr">{meso(x["typ"])}</b>{ch}</a>')
        secs += f'<section class="cat" data-c="{html.escape(cat)}"><h2>{html.escape(CATS.get(cat, cat))} <small>{len(bycat[cat])}</small></h2><div class="its">{li}</div><button type="button" class="more" hidden>Show all {len(bycat[cat])}</button></section>'
    idx = (f'<div class="card"><h1>MapleStory Classic item prices</h1><p class="sub"><span id="cnt">{len(rows)}</span> items priced from Free Market sales players watched · <span id="upd">updated {when}</span></p>'
           f'<input id="q" type="search" placeholder="Find an item: work gloves, GFA 60, white label ring" autocomplete="off" aria-label="Find an item">'
           f'<div class="bar"><div class="chips">{chips}</div><label class="srt">Sort <select id="sort"><option value="v">Most traded</option><option value="m">Biggest movers</option><option value="p">Highest price</option><option value="a">A to Z</option></select></label></div>'
           f'<p class="note" id="none" hidden>No priced item matches that. <a id="board" href="/">Search the live board</a> for listings.</p>{secs}</div>'
           '<script src="/items/index.js" defer></script>')
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
    urls = [f"{SITE}/", f"{SITE}/items/", f"{SITE}/contribute.html", f"{SITE}/report.html", f"{SITE}/shortcuts.html", f"{SITE}/bot/", f"{SITE}/quests.html", f"{SITE}/map.html", f"{SITE}/market.html", f"{SITE}/shop.html", f"{SITE}/recap/", f"{SITE}/streamers.html", f"{SITE}/how-it-works.html"] + [f"{SITE}/item/{s}/" for s, _, _ in made] + [SITE + p for p in world_paths]
    open(os.path.join(out, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                                                    "".join(f"<url><loc>{u}</loc><lastmod>{today}</lastmod></url>\n" for u in urls) + "</urlset>\n")
    print(len(made), "item pages")


if __name__ == "__main__":
    main()
