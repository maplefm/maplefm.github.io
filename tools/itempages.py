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


STAT_WORD = {"ATT": "ATT", "MATT": "MATT", "STR": "STR", "DEX": "DEX", "INT": "INT", "LUK": "LUK", "HP": "HP", "MP": "MP", "ACC": "accuracy",
             "AVOID": "avoid", "SPEED": "speed", "JUMP": "jump", "CRIT": "crit rate", "CRITDMG": "crit damage", "WDEF": "weapon def", "MDEF": "magic def"}


def roll_words(r1):
    """[gain, price, sales, stat, slots used, moves] as a visitor reads it: "Clean +1 crit rate", "Scrolled +6 ATT"."""
    mv = r1[5] if len(r1) > 5 else ""
    parts = []
    for c in (mv or "").split("."):
        m = re.match(r"([A-Z]+)([+-]\d+)$", c)
        if m: parts.append(m.group(2) + " " + STAT_WORD.get(m.group(1), m.group(1)))
    what = ", ".join(parts) or ("+" + str(r1[0]) + ((" " + STAT_WORD.get(r1[3], r1[3])) if len(r1) > 3 and r1[3] else ""))
    return ("Clean " if len(r1) > 4 and r1[4] == 0 else "Scrolled ") + what

def shown(name):
    m = re.match(r"^(.*Scroll): (Lesser|Intermediate|Greater|Chaos|Superior)$", name)
    return f"{m.group(1)} {TIER.get(m.group(2), m.group(2))}" if m else name


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", shown(name).lower().replace("%", "")).strip("-")


def _trim(s):
    # 1.50 -> 1.5, 2.00 -> 2; never touch whole numbers, or 100 would become 1
    return s.rstrip("0").rstrip(".") if "." in s else s


def meso(n):
    n = float(n or 0)
    if n >= 999.5e6: return _trim(f"{n / 1e9:.2f}") + "B"
    if n >= 999.5e3: return _trim(f"{n / 1e6:.1f}" if n >= 9.95e6 else f"{n / 1e6:.2f}") + "M"
    if n >= 1e4: return _trim(f"{n / 1e3:.0f}" if n >= 99.95e3 else f"{n / 1e3:.1f}") + "K"
    return f"{n:,.0f}" if n >= 10 else _trim(f"{n:.1f}")


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
h2{font-size:1.05rem;margin:22px 0 4px}.rel{display:flex;flex-wrap:wrap;gap:8px}.rel a{background:var(--panel2);border:1px solid var(--line2);border-radius:999px;padding:4px 12px 4px 6px;text-decoration:none;font-weight:700;font-size:.88rem;color:var(--ink);display:inline-flex;align-items:center;gap:6px}.rel a img{width:22px;height:22px;object-fit:contain;image-rendering:pixelated}
.foot{color:var(--muted);font-size:.82rem;margin-top:22px}
@media (max-width:520px){.grid{grid-template-columns:1fr 1fr}.big{font-size:1.8rem}}
td.n{text-align:right;white-space:nowrap;font-weight:800}td small{color:var(--muted)}.rc{margin:6px 0;font-size:.92rem}.src{font-size:.75rem}
.craft{background:var(--panel2);border:1px solid var(--line2);border-radius:12px;padding:8px 12px;margin:8px 0}.craft table{margin:2px 0 0}.craft td{border-bottom:0;padding:3px 4px}
.ch{margin:0;font-size:.95rem}.tag{display:inline-block;background:var(--accent);color:#fff;font-size:.7rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border-radius:6px;padding:1px 7px;vertical-align:1px}
.gi{display:inline-block;width:24px;height:24px;vertical-align:middle;object-fit:contain;margin-right:4px}
h2{position:relative;padding-left:12px}h2::before{content:"";position:absolute;left:0;top:.2em;bottom:.2em;width:4px;border-radius:4px;background:var(--accent)}
.days{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.dr{display:grid;grid-template-columns:92px 1fr auto 62px;align-items:center;gap:10px;font-size:.92rem}
.dr .dd{color:var(--muted);font-weight:700}.dr.today .dd{color:var(--ink);font-weight:900}
.dr .track{height:10px;background:var(--panel2);border-radius:999px;overflow:hidden}.dr .track i{display:block;height:100%;background:var(--line2);border-radius:999px}
.dr.today .track i{background:var(--accent)}.dr b{font-size:1rem;font-weight:900;text-align:right}
.dc{font-size:.78rem;font-weight:800;text-align:right;color:var(--muted)}.dc.up{color:var(--up)}.dc.down{color:var(--down)}
.eqhead{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.pill{background:var(--panel2);border:1px solid var(--line2);border-radius:999px;padding:3px 12px;font-weight:800;font-size:.85rem}.pill.lv{background:var(--accent);border-color:var(--accent);color:#fff}
.sgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.sg{background:var(--panel2);border:1px solid var(--line2);border-radius:12px;padding:10px 12px}.sg b{display:block;font-size:1.35rem;font-weight:900;line-height:1.1}.sg span{color:var(--muted);font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
.sg.key{border-color:var(--accent);background:linear-gradient(0deg,rgba(109,63,209,.10),rgba(109,63,209,.10)),var(--panel2)}.sg.key b{color:var(--accent)}
.ctaw{margin:18px 0 4px}.cta{display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#fff;font-weight:800;text-decoration:none;padding:10px 18px;border-radius:999px}.cta span{font-size:1.1rem}
.mobrow{display:flex;align-items:center;gap:10px}.mobpic{width:40px;height:40px;object-fit:contain;flex:none}
@media (max-width:520px){.dr{grid-template-columns:78px 1fr auto 54px;gap:8px;font-size:.85rem}}
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


def fit_title(*parts, cap=60):
    """A title Google shows whole: the full form when it fits, else without the site name, else the main part with
    'MapleStory Classic', else the main part alone. The page's own name always comes first."""
    parts = [x for x in parts if x]
    tries = [parts, parts[:-1], [parts[0], "MapleStory Classic"], parts[:1]]
    for t in tries:
        s = " · ".join(t)
        if t and len(s) <= cap: return s
    return parts[0]

def crumbs_html(cr):
    """Prices › All items › Work Gloves: where this page sits, each step a link back"""
    if not cr: return ""
    parts = [f'<a href="{u}">{html.escape(n)}</a>' for n, u in cr[:-1]] + [f'<span aria-current="page">{html.escape(cr[-1][0])}</span>']
    return '<nav class="crumbs" aria-label="You are here">' + ' <i>›</i> '.join(parts) + '</nav>'


# items with no icon anywhere (i/missing.json, kept by tools/iconmirror.py) get an empty icon box, not a broken image
_NOICON = None
def noicon(text):
    global _NOICON
    if _NOICON is None:
        try: _NOICON = set(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "i", "missing.json"))))
        except Exception: _NOICON = set()
    if not _NOICON: return text
    return re.sub(r'<img ([^>]*?)src="https://maplefm\.gg/i/(\d+)\.png"[^>]*>', lambda m: '<span class="gi"></span>' if m.group(2) in _NOICON else m.group(0), text)

def page(title, desc, canon, body, ld=None, og=None, active="items", crumbs=None):
    return noicon(page0(title, desc, canon, body, ld, og, active, crumbs))

def page0(title, desc, canon, body, ld=None, og=None, active="items", crumbs=None):
    t, d = html.escape(title), html.escape(desc)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{t}</title><meta name="description" content="{d}"><link rel="canonical" href="{canon}">
<meta property="og:title" content="{t}"><meta property="og:description" content="{d}"><meta property="og:url" content="{canon}"><meta property="og:image" content="{og or SITE + "/og.png"}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="stylesheet" href="/item/item.css?v=7"><link rel="stylesheet" href="/assets/nav.css?v=4">{ld or ''}</head><body><main>
{NAV(active)}
{crumbs_html(crumbs)}{body}
</main>{FOOT()}<script src="/assets/hit.js" defer></script></body></html>"""


NX = {}
ABBR = {}
WBUILT = [""]


def facts(name, GUIDE):
    """Short facts from the item guide, leading the description: where it drops, quests and recipes that use it."""
    g = GUIDE.get(name) or {}
    out = []
    mobs = []
    for d in g.get("d") or []:
        if d[0] not in mobs: mobs.append(d[0])
    if mobs: out.append("Dropped by " + ", ".join(mobs[:2]) + (f" and {len(mobs) - 2} more" if len(mobs) > 2 else ""))
    qn = len({q[0] for q in g.get("q") or []})
    if qn: out.append(f"needed for {qn} quest{'s' if qn != 1 else ''}")
    if g.get("u"): out.append(f"used in {g['u']} recipe{'s' if g['u'] != 1 else ''}")
    return out


STATN = {"ATT": "Weapon attack", "MATT": "Magic attack", "STR": "STR", "DEX": "DEX", "INT": "INT", "LUK": "LUK", "HP": "Max HP", "MP": "Max MP",
         "WDEF": "Weapon defense", "MDEF": "Magic defense", "ACC": "Accuracy", "AVOID": "Avoidability", "SPEED": "Speed", "JUMP": "Jump"}


def equip_html(row, kinds):
    """Base stats of a piece of equipment, as it drops: type, level needed, stats and upgrade slots."""
    if not row or len(row) < 6: return ""
    kind = kinds[row[5]] if row[5] < len(kinds) else ""
    if not kind.startswith("Equip:") or row[4]: return ""
    base = row[7] if len(row) > 7 and isinstance(row[7], dict) else {}
    cells = []
    for k, lab in STATN.items():
        if base.get(k): cells.append((f"+{base[k]}", lab, k in ("ATT", "MATT")))
    if base.get("SLOTS") is not None: cells.append((str(base["SLOTS"]), "Upgrade slots", False))
    if not cells and not row[2]: return ""
    head = f'<p class="eqhead"><span class="pill">{html.escape(kind.split(":", 1)[1])}</span>' + (f'<span class="pill lv">Level {row[2]}</span>' if row[2] else "") + "</p>"
    grid = "".join(f'<div class="sg{" key" if key else ""}"><b>{v}</b><span>{lab}</span></div>' for v, lab, key in cells)
    return f'<h2>Item stats</h2>{head}<div class="sgrid">{grid}</div><p class="note">Clean stats before scrolls. The board shows each listing\'s roll.</p>'


def eq_line(row, kinds):
    """A short stat line for search results: level, type and the main stat."""
    if not row or len(row) < 6 or row[4]: return ""
    kind = kinds[row[5]] if row[5] < len(kinds) else ""
    if not kind.startswith("Equip:"): return ""
    base = row[7] if len(row) > 7 and isinstance(row[7], dict) else {}
    main = [f"{v} {k}" for k, v in base.items() if k != "SLOTS" and v][:2]
    return " " + ", ".join(x for x in [f"Level {row[2]} {kind.split(':', 1)[1].lower()}" if row[2] else kind.split(':', 1)[1], *main, f"{base['SLOTS']} slots" if base.get("SLOTS") else ""] if x) + "."


def aliases(name, base):
    """Trade chat shorthand for an item, like GFA 60 for Gloves Attack Scroll 60%."""
    tier = re.search(r" (\d+)%$", shown(name))
    out = [k for k, v in ABBR.items() if v in (name, base) and len(k) <= 12]
    out = sorted(set(out), key=lambda k: (len(k), k))[:5]
    return [(k.upper() if len(k) <= 4 else k) + (" " + tier.group(1) if tier else "") for k in out]


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
        return f'<img class="gi" src="https://maplefm.gg/i/{IDS[n]}.png" onerror="this.onerror=null;this.src=&#39;https://maplestory.io/api/MCW/1/item/{IDS[n]}/icon&#39;" alt="" loading="lazy">' if n in IDS else '<span class="gi"></span>'
    out = ""
    if g.get("q"):
        tot = sum(q[2] for q in g["q"])
        rows = "".join(f"<tr><td><b>{qlink(q[0], q[7] if len(q) > 7 else None)}</b><br><small>{html.escape(' · '.join(x for x in [('from ' + q[3]) if q[3] else '', q[4], f'Lv {q[1]}+' if q[1] else '', 'repeatable' if q[5] else ''] if x))}</small></td><td class=n>×{q[2]:,}</td></tr>" for q in g["q"])
        out += f'<h2>Quests that need {html.escape(shown(name))}</h2><p class="note">{len(g["q"])} quest{"s" if len(g["q"]) != 1 else ""}{f", {tot:,} in all" if len(g["q"]) > 1 else ""}. Tap one to open it in the <a href="/quests.html">Quest Log</a>.</p><table>{rows}</table>'
    get = ""
    for c in g.get("c") or []:
        rows = "".join(f'<tr><td>{ico(x[0])} {link(x[0])}</td><td class=n>×{x[1]:,}</td></tr>' for x in c[2])
        if c[5]: rows += f'<tr><td>{ico(c[5][0])} {link(c[5][0])} <small>catalyst</small></td><td class=n>×{c[5][1]:,}</td></tr>'
        if c[3]: rows += f'<tr><td><small>Crafting fee</small></td><td class=n>{full(c[3])} mesos</td></tr>'
        get += (f'<div class="craft"><p class="ch"><span class="tag">Crafted</span> <b>{html.escape(c[0])}</b> Lv {c[1]} · makes {c[4]:,} per craft</p>'
                f'<table>{rows}</table></div>')
    if g.get("d"):
        pic = lambda n: f'<img class="mobpic" src="https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/sprite/{MOBID[n]}.gif" alt="" loading="lazy" onerror="this.remove()">' if n in MOBID else ''
        mob = lambda n: (f'<a href="/monster/{BSLUG[n]}/">{html.escape(n)}</a>' if n in BSLUG else html.escape(n))
        mp = lambda n: f'<a href="/map/{MSLUG[n]}/">{html.escape(n)}</a>' if n in MSLUG else html.escape(n)
        get += "<h3 class=\"dropby\">Dropped by</h3>"
        get += "<table>" + "".join(f"<tr><td><div class=\"mobrow\">{pic(d[0])}<div><b>{mob(d[0])}</b>{f' <small>Lv {d[1]}</small>' if d[1] else ''}<br><small>{' · '.join(x for x in [mp(d[4]) if d[4] else '', 'only while on the quest' if d[5] else ''] if x)}</small></div></div></td><td class=n>{(str(d[2]) + '%') if d[2] is not None else ''}</td></tr>" for d in g["d"]) + "</table>"
    for x in g.get("g") or []:
        get += f'<p class="rc">{"Given by the NPC during" if x[2] == "given" else "Reward from the quest"} {qlink(x[0], x[1])}</p>'
    if g.get("s"):
        get += "<table>" + "".join(f"<tr><td><b>{html.escape(x[0])}</b><br><small>Sold by NPC{(' · ' + html.escape(x[1])) if x[1] else ''}</small></td><td class=n>{full(x[2])} {html.escape(x[3] or 'mesos')}</td></tr>" for x in g["s"]) + "</table>"
    for x in g.get("r") or []:
        get += f'<p class="rc">From {html.escape(x[0])}{f" ({x[1]}%)" if x[1] is not None else ""}{(" · during " + html.escape(x[2])) if x[2] else ""}</p>'
    if not get and g.get("t"):
        get += f'<p class="rc">Found during the quest. In game: <i>{html.escape(g["t"])}</i></p>'
    if get: out += f"<h2>Where to get {html.escape(shown(name))}</h2>{get}"
    if g.get("u"): out += f'<p class="note">Used in {g["u"]} crafting recipe{"s" if g["u"] != 1 else ""}.</p>'
    if out: out += '<p class="note src">Quests: game data. Givers, crafting and shops: <a href="https://mapleclassic.wiki/" rel="noopener">MapleStory Classic Wiki</a>, CC BY-NC-SA 4.0. Drops reported by players, with rates where enough kills were counted.</p>'
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
        WBUILT[0] = str(wj.get("built") or "")
        QSLUG.update(qs); BSLUG.update(bs); MSLUG.update(ms)
        MOBID.update({n: m["id"] for n, m in (wj.get("mobs") or {}).items() if m.get("id")})
        print(len(world_paths), "world pages")
    db = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "itemdb.json")))["items"]
    try: ABBR.update(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "abbr.json"))))
    except Exception: pass
    ids = {r[0]: r[1] for r in db}
    IDS.update(ids)
    vendor = {r[0]: r[6] for r in db if len(r) > 6}
    dbrow = {}
    for r in db: dbrow.setdefault(r[0], r)
    KINDS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "itemdb.json"))).get("kinds") or []
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
        icon = f"https://maplefm.gg/i/{ids[name]}.png"
        daily = [d for d in (r.get("daily") or []) if d and d[1]][-7:]
        dtab = ""
        if daily:
            top = max(d[1] for d in daily) or 1
            rv = list(reversed(daily))
            for k, d in enumerate(rv):
                prev = rv[k + 1][1] if k + 1 < len(rv) else None
                ch = ""
                if prev:
                    pc = round((d[1] - prev) / prev * 100)
                    if pc: ch = f'<span class="dc {"up" if pc > 0 else "down"}">{"▲" if pc > 0 else "▼"} {abs(pc)}%</span>'
                    else: ch = '<span class="dc">same</span>'
                lab = datetime.datetime.fromtimestamp(d[0] / 1000, datetime.timezone.utc).strftime('%a %b %-d')
                dtab += (f'<div class="dr{" today" if k == 0 else ""}"><span class="dd">{"Today" if k == 0 else lab}</span>'
                         f'<span class="track"><i style="width:{max(4, round(d[1] / top * 100))}%"></i></span><b title="{full(d[1])} mesos">{meso(d[1])}</b>{ch}</div>')
        vp = vendor.get(name) or 0
        vp = vp if vp > 1 else 0
        nx = NX.get(name)
        rel = [x for x in bycat.get(r.get("cat") or "Other", []) if x["item"] != name][:8]
        rels = "".join(f'<a href="/item/{slug(x["item"])}/"><img src="https://maplefm.gg/i/{ids[x["item"]]}.png" onerror="this.onerror=null;this.src=&#39;https://maplestory.io/api/MCW/1/item/{ids[x["item"]]}/icon&#39;" alt="" width="22" height="22" loading="lazy">{html.escape(shown(x["item"]))} · {meso(x["typ"])}</a>' for x in rel)
        # equipment and scrolls are searched for their price; materials, potions and cosmetics for what they are and where they drop
        price_first = bool(r.get("equip")) or "Scroll" in name
        fx = facts(name, GUIDE); al = aliases(name, r.get("baseName") or name)
        # scrolls: the game's own name ("Gloves Attack Scroll: Intermediate") is what many people search, so it goes
        # in the title when it fits with "MapleStory Classic", and always in the description
        tw = re.match(r"^.*Scroll: (Lesser|Intermediate|Greater)$", name)
        if tw and name not in al: al = [name] + al

        price_txt = f"sells for about {full(r['typ'])} mesos" + (f", most sales {rng}" if " to " in rng else "")
        l3 = r.get("last3"); r1 = r.get("r1")
        more_txt = (f" Last 3 sales average {meso(l3)}." if l3 else "") + (f" {roll_words(r1)} has sold around {meso(r1[1])}." if r1 else "")
        if price_first or not fx:
            desc = (f"{nm} {price_txt} in MapleStory Classic.{more_txt} {r.get('salesN') or 0:,} Free Market sales seen, "
                    f"{'from sales players watched happen' if r.get('kind') == 'sale' else 'from asking prices'}, updated daily." + (f" Also called {', '.join(al[:2])}." if al else "") + eq_line(dbrow.get(name), KINDS))
            title = fit_title(f"{nm} price", "MapleStory Classic", "Club FM") if not nx else fit_title(f"{nm} price", "Cash Shop · MapleStory Classic", "Club FM")
            if tw and not nx:
                tt = fit_title(f"{nm} ({tw.group(1)}) price", "MapleStory Classic", "Club FM", cap=66)
                if "MapleStory Classic" in tt: title = tt
        else:
            desc = f"{nm} in MapleStory Classic: {'; '.join(fx)}. On the Free Market it {price_txt}, updated daily."
            title = fit_title(f"{nm} price, drops & quests", "MapleStory Classic", "Club FM") if not nx else fit_title(f"{nm} Cash Shop and FM price", "MapleStory Classic", "Club FM")
        body = f"""<div class="card"><div class="hd"><img src="{icon}" onerror="this.onerror=null;this.src=&#39;https://maplestory.io/api/MCW/1/item/{ids[name]}/icon&#39;" alt="{html.escape(nm)}" width="56" height="56" loading="lazy"><div><h1>{html.escape(nm)} price</h1><p class="sub">MapleStory Classic · {html.escape(cat)}{(" · also called " + html.escape(", ".join(al))) if al else ""}</p></div></div>
<p class="big"><span id="rng">{rng}</span>{chg}<small>mesos</small></p>
<p class="note">Typical <span id="typ">{full(r['typ'])}</span> mesos, {basis}.{f' {conf[0]}: {conf[1]}.' if conf else ''}</p>
<div class="grid"><div><span>Typical</span><b id="t2">{meso(r['typ'])}</b></div><div><span>Sales seen</span><b id="sn">{full(r.get('salesN') or 0)}</b></div><div><span>Listings seen</span><b id="ln">{full(r.get('n') or 0)}</b></div>
{f'<div><span>Cheapest ask now</span><b id="ba">{meso(r["best"])}</b></div>' if r.get('best') else ''}{f'<div><span>NPC pays</span><b>{meso(vp)}</b></div>' if vp else ''}{f'<div><span>Cash Shop</span><b>{full(nx)} NX</b></div>' if nx else ''}</div>
{f'<h2>Typical price by day</h2><div class="days">{dtab}</div>' if dtab else ''}
{equip_html(dbrow.get(name), KINDS)}
<p class="ctaw"><a class="cta" href="/#item={html.escape(name)}">See live listings and recent sales <span>→</span></a></p>
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
            "description": desc, "dateModified": datetime.date.today().isoformat(), **({"alternateName": al} if al else {}), "isPartOf": {"@type": "WebSite", "name": "Club FM", "url": SITE + "/"},
            "primaryImageOfPage": {"@type": "ImageObject", "url": OG + s + ".png", "width": 1200, "height": 630}, "image": [OG + s + ".png", icon]}) + "</script>"
        ld += f'<meta name="thumbnail" content="{OG}{s}.png">'

        d = os.path.join(out, "item", s); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page(title, desc, f"{SITE}/item/{s}/", body, ld, OG + s + ".png", crumbs=[("Prices", "/"), ("All items", "/items/"), (nm, "")]))
        made.append((s, nm, r))
    for name in extra:
        s = slug(name); nm = shown(name); g = GUIDE[name]
        icon = f"https://maplefm.gg/i/{ids[name]}.png"
        qn = len(g.get("q") or [])
        desc = f"{nm} in MapleStory Classic: " + (f"needed for {qn} quest{'s' if qn != 1 else ''}, " if qn else "") + "where it drops, how to craft it and who sells it."
        body = f"""<div class="card"><div class="hd"><img src="{icon}" onerror="this.onerror=null;this.src=&#39;https://maplestory.io/api/MCW/1/item/{ids[name]}/icon&#39;" alt="{html.escape(nm)}" width="56" height="56" loading="lazy"><div><h1>{html.escape(nm)}</h1><p class="sub">MapleStory Classic · quests, drops and crafting</p></div></div>
<p class="note">No Free Market sales seen yet. <a href="/#item={html.escape(name)}">Check the board</a> for listings.</p>
{equip_html(dbrow.get(name), KINDS)}
{guide_html(name, g, page_of)}</div>"""
        d = os.path.join(out, "item", s); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page(fit_title(f"{nm} quests, drops & crafting", "MapleStory Classic", "Club FM"), desc, f"{SITE}/item/{s}/", body, crumbs=[("Prices", "/"), ("All items", "/items/"), (nm, "")]))
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
                   f'<img src="https://maplefm.gg/i/{ids[x["item"]]}.png" onerror="this.onerror=null;this.src=&#39;https://maplestory.io/api/MCW/1/item/{ids[x["item"]]}/icon&#39;" alt="{html.escape(shown(x["item"]))}" width="28" height="28" loading="lazy"><span class="nm">{html.escape(shown(x["item"]))}</span><b class="pr">{meso(x["typ"])}</b>{ch}</a>')
        secs += f'<section class="cat" data-c="{html.escape(cat)}"><h2>{html.escape(CATS.get(cat, cat))} <small>{len(bycat[cat])}</small></h2><div class="its">{li}</div><button type="button" class="more" hidden>Show all {len(bycat[cat])}</button></section>'
    idx = (f'<div class="card"><h1>MapleStory Classic item prices</h1><p class="sub"><span id="cnt">{len(rows)}</span> items priced from Free Market sales players watched · <span id="upd">updated {when}</span></p>'
           f'<input id="q" type="search" placeholder="Find an item: work gloves, GFA 60, white label ring" autocomplete="off" aria-label="Find an item">'
           f'<div class="bar"><div class="chips">{chips}</div><label class="srt">Sort <select id="sort"><option value="v">Most traded</option><option value="m">Biggest movers</option><option value="p">Highest price</option><option value="a">A to Z</option></select></label></div>'
           f'<p class="note" id="none" hidden>No priced item matches that. <a id="board" href="/">Search the live board</a> for listings.</p>{secs}</div>'
           '<script src="/items/index.js" defer></script>')
    # one page per category, so "maplestory classic scroll prices" has a page that is about exactly that
    HUB = {"Scrolls": ("scrolls", "scroll prices", "Every scroll players trade, 10% to 100%, with today's typical price and how many sales back it up."),
           "Equips": ("equipment", "equipment prices", "Hats, tops, gloves, earrings, capes and shoes: what clean and scrolled gear sells for."),
           "Weapons": ("weapons", "weapon prices", "Swords, claws, bows, wands and every other weapon, priced from sales players watched."),
           "Cash": ("cash-shop", "Cash Shop item prices", "NX cosmetics and Cash Shop items sold for mesos on the Free Market."),
           "Etc": ("etc", "etc item and ore prices", "Monster drops, ores and crafting materials: what they sell for and where they drop."),
           "Use": ("potions", "potion and use item prices", "Potions, food and other use items, next to their NPC prices."),
           "Stars": ("throwing-stars", "throwing star prices", "Throwing stars for thieves, from Subis to Ilbis.")}
    hubs = []
    for cat, (hs, what, intro) in HUB.items():
        lst = bycat.get(cat) or []
        if len(lst) < 5: continue
        trs = ""
        for x in lst:
            mv = (x.get("mv") or [None])[0]
            ch = (f'<span class="chg {"up" if mv > 0 else "down"}">{"▲" if mv > 0 else "▼"} {abs(round(mv * 100))}%</span>' if isinstance(mv, (int, float)) and abs(mv) >= 0.01 else "")
            trs += (f'<tr><td><a href="/item/{slug(x["item"])}/"><img src="https://maplefm.gg/i/{ids[x["item"]]}.png" onerror="this.onerror=null;this.src=&#39;https://maplestory.io/api/MCW/1/item/{ids[x["item"]]}/icon&#39;" alt="{html.escape(shown(x["item"]))}" width="24" height="24" loading="lazy"> {html.escape(shown(x["item"]))}</a></td>'
                    f'<td class="n">{meso(x["typ"])} {ch}</td><td class="n">{full(x.get("salesN") or 0)}</td></tr>')
        others = " · ".join(f'<a href="/items/{v[0]}/">{html.escape(v[1][0].upper() + v[1][1:])}</a>' for k, v in HUB.items() if k != cat and len(bycat.get(k) or []) >= 5)
        body = (f'<div class="card"><h1>MapleStory Classic {html.escape(what)}</h1><p class="sub">{len(lst)} items · updated {when}</p><p>{html.escape(intro)} '
                f'Typical prices from watched Free Market sales, most traded first.</p>'
                f'<table><tr><th>Item</th><th>Typical, mesos</th><th>Sales seen</th></tr>{trs}</table>'
                f'<p class="note" style="margin-top:14px">More prices: {others} · <a href="/items/">All items</a> · <a href="/">Live board</a></p></div>')
        d = os.path.join(out, "items", hs); os.makedirs(d, exist_ok=True)
        title = f"MapleStory Classic {what} · Club FM"
        desc = f"{what[0].upper() + what[1:]} in MapleStory Classic, updated {when}: {len(lst)} items with the typical Free Market price from real sales. " + intro
        ld = '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Club FM", "item": SITE + "/"}, {"@type": "ListItem", "position": 2, "name": "Item prices", "item": SITE + "/items/"},
            {"@type": "ListItem", "position": 3, "name": what[0].upper() + what[1:], "item": f"{SITE}/items/{hs}/"}]}) + "</script>"
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page(title, desc, f"{SITE}/items/{hs}/", body, ld, crumbs=[("Prices", "/"), ("All items", "/items/"), (what[0].upper() + what[1:], "")]))
        hubs.append((hs, what))
    hublinks = '<p class="note" style="margin:6px 0 10px">By category: ' + " · ".join(f'<a href="/items/{h}/">{html.escape(w[0].upper() + w[1:])}</a>' for h, w in hubs) + "</p>"
    idx = idx.replace('<input id="q"', hublinks + '<input id="q"', 1)
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
    urls = [f"{SITE}/", f"{SITE}/items/", f"{SITE}/contribute.html", f"{SITE}/report.html", f"{SITE}/shortcuts.html", f"{SITE}/bot/", f"{SITE}/quests.html", f"{SITE}/map.html", f"{SITE}/market.html", f"{SITE}/shop.html", f"{SITE}/recap/", f"{SITE}/streamers.html", f"{SITE}/how-it-works.html"] + [f"{SITE}/items/{h}/" for h, _ in hubs] + [f"{SITE}/item/{s}/" for s, _, _ in made] + [SITE + p for p in world_paths]
    # lastmod only moves when a page's content does: item prices daily, world pages when the game data changed
    wbuilt = (WBUILT[0] or today)[:10]
    world = {SITE + p for p in world_paths}
    open(os.path.join(out, "sitemap.xml"), "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                                                    "".join(f"<url><loc>{u}</loc><lastmod>{wbuilt if u in world else today}</lastmod></url>\n" for u in urls) + "</urlset>\n")
    # the home page is a script-built board; give search engines plain links to the most traded items
    top = sorted(rows, key=lambda r: -(r.get("vol") or 0))[:40]
    links = "".join(f'<a href="/item/{slug(x["item"])}/"><img src="https://maplefm.gg/i/{ids[x["item"]]}.png" onerror="this.onerror=null;this.src=&#39;https://maplestory.io/api/MCW/1/item/{ids[x["item"]]}/icon&#39;" alt="" width="18" height="18" loading="lazy">{html.escape(shown(x["item"]))}</a>' for x in top)
    ip = os.path.join(out, "index.html")
    if os.path.exists(ip):
        h = open(ip, encoding="utf-8").read()
        block = f'<!--toplinks--><nav class="toplinks" aria-label="Most traded items"><h2>Most traded today</h2>{links}<a href="/items/">All item prices →</a></nav><!--/toplinks-->'
        h2 = re.sub(r"<!--toplinks-->.*?<!--/toplinks-->", lambda m: block, h, flags=re.S)
        h2 = noicon(h2)
        if h2 != h: open(ip, "w", encoding="utf-8").write(h2)
    print(len(made), "item pages")


if __name__ == "__main__":
    main()
