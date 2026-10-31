"""Static pages for every map, monster and quest in MapleStory Classic World, plus training guides by level and class,
so searches like "sleepy dungeon hidden portal", "zombie mushroom drops" or "where to train level 30 maplestory classic"
land on Club FM. Built from the same daily data the live pages use:

  python tools/worldpages.py WORLD.json ITEMGUIDE.json SUMMARY.json TRAINING_NOTES.json OUT_DIR

Writes OUT_DIR/map/<slug>/, monster/<slug>/, quest/<slug>/, training/<slug>/ and the hubs maps/, monsters/, quests/,
training/. Returns (from build()) the list of page paths for the sitemap. Plain HTML: the facts are in the page, no script needed.
"""
import html, json, math, os, re, sys, datetime, shutil, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nav import nav_html as NAV, foot_html as FOOT
import itempages

SITE = "https://maplefm.gg"
LIVE = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/"
IO = "https://maplestory.io/api/MCW/1"
E = html.escape

CSS = """.wn{display:flex;gap:10px;flex-wrap:wrap;font-weight:700;font-size:.9rem}
.mmap{position:relative;display:block;max-width:100%;background:#0c1220;border-radius:12px;padding:6px;margin:12px 0;box-sizing:border-box}
.mmap .in{position:relative;margin:0 auto;max-width:100%}.mmap img{display:block;width:100%;height:100%;image-rendering:pixelated}
.mk{position:absolute;transform:translate(-50%,-50%);border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #0008}
.mk.p{width:10px;height:10px;background:#4fc3ff}.mk.h{width:11px;height:11px;border-radius:2px;background:#b45cff;transform:translate(-50%,-50%) rotate(45deg)}
.mk.d{width:10px;height:10px;border-radius:2px;background:#ffb547}.mk.n{width:8px;height:8px;background:#ffe14d;border-width:1.5px}.mk.s{width:6px;height:6px;background:#ff5d5d;border:0;opacity:.8}
.lg{display:flex;gap:12px;flex-wrap:wrap;font-size:.8rem;color:var(--muted)}.lg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;vertical-align:-1px}
.mobs{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px;margin:8px 0}
.mob{display:grid;grid-template-columns:56px minmax(0,1fr);gap:10px;align-items:center;background:var(--panel2);border:1px solid var(--line2);border-radius:12px;padding:6px 10px 6px 6px;text-decoration:none;color:var(--ink)}
.mob img{width:56px;height:56px;object-fit:contain;image-rendering:pixelated}.mob b{display:block}.mob small{color:var(--muted)}
.hid{background:#b45cff22;border-left:4px solid #b45cff;border-radius:10px;padding:8px 12px;margin:8px 0}
.tip{background:var(--panel2);border-left:4px solid var(--line);border-radius:10px;padding:8px 12px;margin:8px 0}
.pick{border:1px solid var(--line2);border-radius:14px;padding:12px 14px;margin:10px 0;background:var(--panel2)}.pick h3{margin:0 0 4px;font-size:1.05rem}
.toc{columns:2;column-gap:20px;padding-left:18px}@media (max-width:560px){.toc{columns:1}}.toc li{break-inside:avoid;margin:2px 0}
.sprite{width:96px;height:96px;object-fit:contain;image-rendering:pixelated;background:var(--panel2);border-radius:14px;padding:6px}
.mk.you{width:14px;height:14px;background:#2ee08a;border:3px solid #fff;box-shadow:0 0 0 2px #0a5}
a.lv{font-size:.72rem;font-weight:800;text-decoration:none;background:var(--panel2);border:1px solid var(--line2);border-radius:999px;padding:1px 7px;margin-left:4px;vertical-align:1px}
.cta{display:block;margin:18px 0 0;padding:12px 14px;border-radius:14px;background:var(--panel2);border:1px solid var(--line2);color:var(--ink)}.cta a{font-weight:800}
.need{border-top:1px solid var(--line2);padding:8px 0}.need:first-of-type{border-top:0}
.nl{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.nl .n{margin-left:auto;font-weight:800;white-space:nowrap}.nl .n small{font-weight:600;color:var(--muted)}
.gi{width:24px;height:24px;object-fit:contain;image-rendering:pixelated;vertical-align:middle;margin-right:4px}
.srcs{font-size:.82rem;color:var(--muted);margin:3px 0 0 30px}.srcs img{width:22px;height:22px;object-fit:contain;image-rendering:pixelated;vertical-align:middle}
.crt{font-size:.8rem;color:var(--muted);margin:2px 0 0 30px}.crt b{color:var(--ink)}
.tk{margin:4px 0 0 18px;padding-left:10px;border-left:2px dashed var(--line2)}
.tk .nl{font-size:.92rem}
.basebox{background:var(--panel2);border:1px solid var(--line2);border-radius:12px;padding:10px 12px;margin:10px 0}.basebox b{display:block;margin-bottom:4px}
.basebox span{display:inline-flex;align-items:center;margin:2px 10px 2px 0;font-weight:700}
.ms{width:40px;height:40px;object-fit:contain;image-rendering:pixelated;vertical-align:middle;margin-right:6px}
.npcpic{width:44px;height:44px;object-fit:contain;image-rendering:pixelated;vertical-align:middle;margin-right:8px;background:var(--panel2);border-radius:10px}
.nextbar{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0}.nextbar a{background:var(--accent);color:#fff;text-decoration:none;font-weight:800;padding:9px 14px;border-radius:999px}.nextbar a.alt{background:var(--panel2);color:var(--accent);border:1px solid var(--line2)}"""

JOBNAME = {0: "Beginner", 1: "Warrior", 2: "Magician", 3: "Bowman", 4: "Thief", 5: "Pirate"}
CLASSES = ["Warrior", "Magician", "Bowman", "Thief"]
GEAR = {"Warrior": (3.5, lambda L: 8 + 0.2 * L), "Magician": (1.2, lambda L: 10 + 0.4 * L), "Bowman": (2.2, lambda L: 15 + 0.6 * L),
        "Thief": (2.2, lambda L: 25 + 1.3 * L), "Beginner": (1.0, lambda L: 6 + 0.2 * L)}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower().replace("'", "")).strip("-") or "x"


def fmt(n): return f"{float(n or 0):,.0f}"


def _trim(s):
    return s.rstrip("0").rstrip(".") if "." in s else s


def mzs(n):
    """A meso amount on the page: the number with the in-game meso coin after it (.mz in nav.css)."""
    return f'<span class="mz">{meso(n)}</span>'


def mzf(n): return f'<span class="mz">{fmt(n)}</span>'


def meso(n):
    n = float(n or 0)
    if n >= 999.5e6: return _trim(f"{n / 1e9:.2f}") + "B"
    if n >= 999.5e3: return _trim(f"{n / 1e6:.1f}" if n >= 9.95e6 else f"{n / 1e6:.2f}") + "M"
    if n >= 1e4: return _trim(f"{n / 1e3:.0f}" if n >= 99.95e3 else f"{n / 1e3:.1f}") + "K"
    return f"{n:,.0f}" if n >= 10 or n == int(n) else _trim(f"{n:.2f}")


def quest_slugs(quests):
    """one stable address per quest: its name, with the id added when two quests share a name"""
    seen, out = {}, {}
    for q in quests: seen[slug(q["n"])] = seen.get(slug(q["n"]), 0) + 1
    for q in quests:
        s = slug(q["n"]); out[q["id"]] = s if seen[s] == 1 else f"{s}-{q['id']}"
    return out


OG = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/og/"


def page(title, desc, path, crumbs, body, og=None):
    canon = SITE + path
    ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + u} for i, (n, u) in enumerate([("Club FM", "/")] + crumbs)]}
    # the trail starts at the section in the menu: Training › Maps › Sleepywood, Quests › Quest guides › ...
    root = ("Quests", "/quests.html") if path.startswith(("/quest", "/quests", "/crafting")) else ("Training", "/map.html")
    trail = ([root] if crumbs and crumbs[0][0] != root[0] else []) + crumbs
    nav = ' <i>›</i> '.join([f'<a href="{u}">{E(n)}</a>' for n, u in trail[:-1]] + ([f'<span aria-current="page">{E(trail[-1][0])}</span>'] if trail else []))
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(title)}</title><meta name="description" content="{E(desc)}"><link rel="canonical" href="{canon}">
<meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}"><meta property="og:url" content="{canon}"><meta property="og:image" content="{og or SITE + "/og.png"}"><meta property="og:type" content="article"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="stylesheet" href="/item/item.css?v=9"><link rel="stylesheet" href="/item/world.css?v=4"><link rel="stylesheet" href="/assets/nav.css?v=6">
<script type="application/ld+json">{json.dumps(ld)}</script>{f'<meta name="thumbnail" content="{og}">' if og else ''}</head><body><main>
{NAV("qlevels" if path.startswith("/quests/") else "quests" if path.startswith("/quest") else "crafting" if path.startswith("/crafting") else "guides" if path.startswith("/training") else "monsters" if path.startswith(("/monster", "/monsters")) else "maps")}

{f'<nav class="crumbs" aria-label="You are here">{nav}</nav>' if nav else ''}<div class="card">{itempages.BRAND}{body}</div>
<p class="foot">MapleStory Classic World facts from the game files and the <a href="https://mapleclassic.wiki/" rel="noopener">MapleStory Classic Wiki</a> (CC BY-NC-SA 4.0), refreshed daily.</p>
</main>{FOOT()}<script src="/assets/hit.js" defer></script>{'<script src="/assets/fmprice.js?v=2" defer></script>' if 'data-fmi=' in body else ''}</body></html>"""


def write(out, path, text):
    d = os.path.join(out, path.strip("/"))
    os.makedirs(d, exist_ok=True)
    import itempages
    open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(itempages.noicon(text))


def build(world, guide, summary, notes, out):
    M, MOB, POTS = world["maps"], world["mobs"], world.get("pots", {})
    QS = guide.get("quests") or []; ITEMS = guide.get("items") or {}; IDS = guide.get("ids") or {}
    PRICE = {r["item"]: r["typ"] for r in (summary.get("rows") or []) if isinstance(r, dict) and r.get("item") and r.get("typ")}
    # the same rule itempages.py uses, so every item link lands on a page that exists
    try: DBIDS = {r[0] for r in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "itemdb.json")))["items"]}
    except Exception: DBIDS = set(IDS)
    ITEMPAGE = {r["item"] for r in (summary.get("rows") or []) if isinstance(r, dict) and r.get("item") in DBIDS and (r.get("n") or 0) >= 5 and r.get("typ")}
    ITEMPAGE |= {n for n, g in ITEMS.items() if n in DBIDS and (g.get("q") or g.get("c") or g.get("d") or g.get("g") or g.get("u"))}
    import itempages
    def ilink(n, c=None):
        t = E(itempages.shown(n)) + (f" ×{c:,}" if c else "")
        ic = f'<img class="gi" src="https://maplefm.gg/i/{IDS[n]}.png" onerror="this.onerror=null;this.src=&#39;https://maplestory.io/api/MCW/1/item/{IDS[n]}/icon&#39;" alt="" loading="lazy">' if n in IDS else ""
        return f'{ic}<a href="/item/{itempages.slug(n)}/">{t}</a>' if n in ITEMPAGE else f'{ic}{t}'
    def live(n):   # straight to the item on the live board: who is selling it right now, and where
        return f' <a class="lv" href="/#item={urllib.parse.quote(n)}" title="Live listings for {E(itempages.shown(n))} on the price board">live</a>' if n in PRICE else ""
    def recipe(n):
        c = (ITEMS.get(n) or {}).get("c"); return c[0] if c else None
    def plan(n, q, seen, acc):
        r = recipe(n); node = {"n": n, "q": q, "r": None, "crafts": 0, "kids": []}
        if r and n not in seen and len(seen) < 5:
            node["r"] = r; node["crafts"] = -(-q // (r[4] or 1)); acc["fee"] += node["crafts"] * (r[3] or 0)
            if r[5]: acc["cat"][r[5][0]] = acc["cat"].get(r[5][0], 0) + r[5][1] * node["crafts"]
            node["kids"] = [plan(i, c * node["crafts"], seen | {n}, acc) for i, c in r[2]]
        else: acc["base"][n] = acc["base"].get(n, 0) + q
        return node
    def srcs(n, k=3):
        g = ITEMS.get(n) or {}; out = []
        for d in (g.get("d") or [])[:k]:
            im = f'<img src="{sprite_url(d[0])}" alt="" loading="lazy">' if sprite_url(d[0]) else ""
            out.append(f"{im}{blink(d[0])}" + (f" {d[2]:g}%" if d[2] is not None else ""))
        if g.get("s"): out.append(f"{E(g['s'][0][0])} sells it for {mzs(g['s'][0][2])}")
        return ('<div class="srcs">' + " · ".join(out) + "</div>") if out else ""
    def craft_line(nd):
        r = nd["r"]
        return (f'<div class="crt"><b>{E(r[0])} Lv {r[1]}</b> · {nd["crafts"]} craft{"s" if nd["crafts"] > 1 else ""}' + (f" of {r[4]}" if (r[4] or 1) > 1 else "")
                + (f" · {mzs(r[3] * nd['crafts'])} in fees" if r[3] else " · no fee") + (f" · catalyst {E(itempages.shown(r[5][0]))} ×{r[5][1] * nd['crafts']}" if r[5] else "") + "</div>")
    def fp(n, q):
        """An FM price that says what it is: about X each on the FM, Y for all N. Today's price is swapped in by
        assets/fmprice.js when the page opens; the built one stands until then."""
        if n not in PRICE: return f'<span class="fp fpn" data-fmi="{E(n)}" data-fmq="{q}">not seen on the FM yet</span>'
        each = PRICE[n]
        txt = f'about <b class="mz">{meso(each)}</b> each on the FM, <b class="mz">{meso(each * q)}</b> for all {q:,}' if q > 1 else f'about <b class="mz">{meso(each)}</b> on the FM'
        return f'<span class="fp" data-fmi="{E(n)}" data-fmq="{q}">{txt}</span>'
    def tree_html(nd):
        h = f'<div class="nl"><span class="nm">{ilink(nd["n"])}</span><span class="n">×{nd["q"]:,}</span>{fp(nd["n"], nd["q"])}</div>'
        if nd["r"]: h += craft_line(nd) + '<div class="tk">' + "".join(tree_html(k) for k in nd["kids"]) + "</div>"
        else: h += srcs(nd["n"], 2)
        return h
    MSLUG = {p: slug(p) for p in M}
    BSLUG = {n: slug(n) for n in MOB}
    QSLUG = quest_slugs(QS)
    QBYID = {q["id"]: q for q in QS}
    MBYID = {m.get("id"): p for p, m in M.items() if m.get("id")}
    try: QWHERE = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "quest_where.json"), encoding="utf-8"))
    except Exception: QWHERE = {}
    def mlink(p): return f'<a href="/map/{MSLUG[p]}/">{E(p)}</a>' if p in M else E(p)
    # Nav here: the route finder from wherever you are (it remembers your last spot) to this map, shortest way first.
    # Next to every map a player has to go to: where a monster lives, where a quest starts or what it hunts.
    def navbtn(p): return f' <a class="navh" href="/map.html#route=|{urllib.parse.quote(p, safe="")}" title="The fastest way to {E(p)} from where you are">Nav here</a>' if p in M else ""
    def mnav(p): return mlink(p) + navbtn(p)
    def blink(n): return f'<a href="/monster/{BSLUG[n]}/">{E(n)}</a>' if n in MOB else E(n)
    def qlink(q): return f'<a href="/quest/{QSLUG[q["id"]]}/">{E(q["n"])}</a>'
    def sprite_url(n): return f"{LIVE}data/sprite/{MOB[n]['id']}.gif" if n in MOB and MOB[n].get("id") else ""
    built = world.get("built") or datetime.date.today().isoformat()
    paths = []
    BOARD_CTA = ('<div class="cta"><b>What does it sell for right now?</b> Every Free Market listing seen today, with channel and room. '
                 '<a href="/">Open the price board</a></div>')

    # mesos a kill from world.json: [min, max, chance %, "wiki" (measured) or "reported" (player reports), kills sampled]
    MESOS = {n: mb["meso"] for n, mb in MOB.items() if mb.get("meso")}
    if not MESOS:   # a world.json from before mesos moved into it: player reports only
        try:
            rp = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "mesos_reported.json"), encoding="utf-8"))
            MESOS = {n: list(v[:3]) + ["reported", None] for n, v in rp.get("mobs", rp).items() if isinstance(v, list)}
        except Exception: pass
    # spawn rows add up per monster (older world.json files list one row per spawn group)
    for m in M.values():
        tot = {}
        for n, c in m.get("mobs") or []: tot[n] = tot.get(n, 0) + c
        m["mobs"] = sorted(([n, c] for n, c in tot.items()), key=lambda x: -x[1])
    # who drops what, where each monster lives, which quests send you after it
    drops = {}
    for item, g in ITEMS.items():
        for d in g.get("d") or []:
            drops.setdefault(d[0], []).append((item, d[2], bool(d[5]) if len(d) > 5 else False))
    homes = {}
    for p, m in M.items():
        for n, c in m["mobs"]: homes.setdefault(n, []).append((p, c))
    qkill, qneed = {}, {}
    for q in QS:
        for k in q.get("kill") or []: qkill.setdefault(k[0], []).append((q, k[1]))
        for k in q.get("need") or []: qneed.setdefault(k[0], []).append((q, k[1]))
    npc_at = {}
    for p, m in M.items():
        for n in m.get("npcs") or []: npc_at.setdefault(n[0], []).append(p)
    nextq = {}
    for q in QS:
        for pre in q.get("pre") or []: nextq.setdefault(pre, []).append(q)

    # ---------------------------------------------------------- damage and potion cost, the same estimate as map.html
    def best_hp():
        best = None
        for n, p in POTS.items():
            if not p.get("hp") or p.get("pct"): continue
            price = min(p.get("npc") or 1e9, PRICE.get(n) or 1e9)
            if price >= 1e9: continue
            per = price / p["hp"]
            if not best or per < best[1]: best = (n, per)
        return best or ("Red Potion", 0.5)
    HP = best_hp()

    def touch(mb, L, cls):
        g = GEAR.get(cls, GEAR["Bowman"]); DEF = g[0] * L; raw = mb["atk"] * 1.3
        dmg = max(1, raw * (1 - DEF / (DEF + 300 + 2 * raw)) - (DEF / 25 + L / 10))
        G = max(0, L - mb["lv"]); A = (mb.get("acc") or 1) * 100 / (5 * (G + 51)); eva = g[1](L); Ev = eva / (1 + eva / 80) / (1 + G / 40)
        f = 0.15 + 0.2 / (1 + math.exp((A - Ev) / 12))
        if Ev > A * (1 + f): c = min(0.03, max(0.02, math.exp((A - Ev) / 18) * 0.03))
        else:
            qq = Ev / A; c = 1 if qq <= 1 - f else 0 if qq >= 1 + f else (1 + f - qq) / (2 * f)
        return dmg, c + (1 - c) * 0.08

    # a spawn point with a long timer (wiki respawn_seconds) can't refill as often as a normal one: map.html counts a normal
    # map as refilling every 7.56 s with 3 of 4 points up solo (0.6 x 3600 / 7.56 kills an hour per point), so a point on an
    # N-second timer counts as min(1, 12.6 / N) of a normal point ("ne" below).
    def stats(m):
        tot = e = hp = lv = 0; maxlv = 0; worst = None; ne = 0
        for n, c, rs in m.get("groups") or [[n, c, None] for n, c in m["mobs"]]:
            mb = MOB.get(n)
            if mb and not mb.get("boss") and not mb.get("variant"): ne += c * min(1.0, 12.6 / rs) if rs else c
        for n, c in m["mobs"]:
            mb = MOB.get(n)
            if not mb or mb.get("boss") or mb.get("variant"): continue
            tot += c; e += mb["exp"] * c; hp += mb["hp"] * c; lv += mb["lv"] * c; maxlv = max(maxlv, mb["lv"])
            if not worst or mb["atk"] > MOB[worst]["atk"]: worst = n
        if not tot or not hp: return None
        return {"n": tot, "ne": ne, "eph": e / hp * 100, "lv": lv / tot, "maxlv": maxlv, "worst": worst}

    def timers(m):
        rs = m.get("respawn") or {}
        return ", ".join(f"{E(n)} every {s} s" for n, s in sorted(rs.items(), key=lambda x: -x[1]))

    # ---------------------------------------------------------- a static minimap with portals, NPCs and spawns
    def minimap(m, spawns=True, hl=None):
        mm = m.get("mm")
        if not mm: return ""
        s = 2 ** mm[2]; w, h = mm[3] / s, mm[4] / s; scale = min(3, 640 / w, 520 / h)
        def pos(x, y): return f"left:{(x + mm[0]) / s / w * 100:.2f}%;top:{(y + mm[1]) / s / h * 100:.2f}%"
        mk = ""
        if spawns:
            for _, x, y in (m.get("mobpos") or [])[:60]: mk += f'<span class="mk s" style="{pos(x, y)}"></span>'
        for n in m.get("npcs") or []: mk += f'<span class="mk n" style="{pos(n[1], n[2])}" title="{E(n[0])}"></span>'
        for p in m["portals"]:
            k = "h" if p[1] == "hidden" else "d" if p[1] == "door" else "p"
            mk += f'<span class="mk {k}" style="{pos(p[2], p[3])}" title="{"Hidden portal to " if k == "h" else "To "}{E(p[0])}"></span>'
        if hl: mk += f'<span class="mk you" style="{pos(hl[0], hl[1])}" title="{E(hl[2])}"></span>'
        return (f'<div class="mmap"><div class="in" style="width:{round(w * scale)}px;aspect-ratio:{w:.1f}/{h:.1f}"><img src="{LIVE}data/minimap/{m["id"]}.png" alt="Minimap of {E(m["name"])}" loading="lazy">{mk}</div></div>'
                '<div class="lg"><span><i style="background:#4fc3ff"></i>Portal</span><span><i style="background:#b45cff"></i>Hidden portal</span><span><i style="background:#ffb547"></i>Door</span><span><i style="background:#ffe14d"></i>NPC</span>' + ('<span><i style="background:#ff5d5d"></i>Monster spawn</span>' if spawns else '') + '</div>')

    def where(m, x, y):
        mm = m.get("mm")
        if not mm: return ""
        fx, fy = (x + mm[0]) / mm[3], (y + mm[1]) / mm[4]
        side = "far left" if fx < .2 else "left side" if fx < .4 else "middle" if fx < .6 else "right side" if fx < .8 else "far right"
        lvl = "up high" if fy < .33 else "halfway up" if fy < .66 else "near the bottom"
        return f"{side}, {lvl}"

    def mobcard(n, extra=""):
        mb = MOB[n]; sp = sprite_url(n)
        return (f'<a class="mob" href="/monster/{BSLUG[n]}/">' + (f'<img src="{sp}" alt="{E(n)}" loading="lazy">' if sp else '<span></span>') +
                f'<span><b>{E(n)}{extra}</b><small>Lv {mb["lv"]} · {fmt(mb["hp"])} HP · {fmt(mb["exp"])} EXP</small></span></a>')

    # ---------------------------------------------------------- map pages
    for p, m in M.items():
        hid = [x for x in m["portals"] if x[1] == "hidden"]
        st = stats(m)
        lv = m.get("lv") or [None, None]
        lvtxt = f"level {lv[0]} to {lv[1]}" if lv[0] and lv[1] else f"level {lv[0]}+" if lv[0] else ""
        mobs_sorted = sorted(m["mobs"], key=lambda x: -x[1])
        desc = (f"{p} in MapleStory Classic World: " + (f"{lvtxt} map, " if lvtxt else "") +
                (f"{', '.join(n for n, _ in mobs_sorted[:3])}, " if mobs_sorted else "") +
                (f"{len(hid)} hidden portal{'s' if len(hid) != 1 else ''}, " if hid else "") + "the in-game minimap and every exit.")
        b = f'<h1>{E(p)}</h1><p class="sub">MapleStory Classic · {E(m.get("region") or "")}{" · " + E(m["type"]) if m.get("type") else ""}{" · " + lvtxt.capitalize() if lvtxt else ""}</p>'
        b += f'<p class="navrow"><a class="navh big" href="/map.html#route=|{urllib.parse.quote(p, safe="")}">Nav here</a> <small>the fastest way here from where you are</small></p>'
        intro = []
        if m.get("near") and m["near"] != p: intro.append(f"Nearest town: {mlink(m['near'])}.")
        if m.get("ret") and m["ret"] != p and m["ret"] != m.get("near"): intro.append(f"Return Scroll goes to {mlink(m['ret'])}.")
        if st: intro.append(f"{st['n']} monster spawn points, average level {st['lv']:.0f}, {st['eph']:.1f} EXP per 100 HP." +
                            (f" Monster rate setting in the game files: {m['rate']:g}." if m.get("rate") is not None else ""))
        if timers(m): intro.append(f"Slow respawns: {timers(m)}.")
        if intro: b += f'<p>{" ".join(intro)}</p>'
        b += minimap(m)
        if hid:
            b += "<h2>Hidden portals</h2>" + "".join(f'<div class="hid"><b>To {mlink(x[0])}</b>: stand on the purple spot ({where(m, x[2], x[3]) or "see the minimap"}) and press up.{f" Needs level {x[5]}." if x[5] else ""}</div>' for x in hid)
        if m["portals"]:
            b += "<h2>Exits</h2><table><tr><th>Goes to</th><th>Kind</th><th>Where on the map</th><th></th></tr>" + "".join(
                f'<tr><td>{mlink(x[0])}</td><td>{"Hidden portal" if x[1] == "hidden" else "Door" if x[1] == "door" else "Portal"}{f" · Lv {x[5]}+" if x[5] else ""}</td><td><small>{where(m, x[2], x[3])}</small></td><td>{navbtn(x[0])}</td></tr>' for x in m["portals"]) + "</table>"
        if mobs_sorted:
            b += "<h2>Monsters</h2><p class=\"note\">×N is the number of spawn points.</p><div class=\"mobs\">" + "".join(mobcard(n, f" ×{c}") for n, c in mobs_sorted if n in MOB) + "</div>"
            dr = []
            for n, _ in mobs_sorted:
                for it, rate, qo in drops.get(n, []):
                    if not qo and it in PRICE and rate: dr.append((rate / 100 * PRICE[it], it, n, rate))
            if dr:
                dr.sort(key=lambda x: -x[0])
                b += "<h2>Most valuable drops here</h2><table><tr><th>Item</th><th>From</th><th>Rate</th><th>Sells for</th></tr>" + "".join(
                    f'<tr><td>{ilink(it)}{live(it)}</td><td>{blink(n)}</td><td>{rate:g}%</td><td class="n">{mzs(PRICE[it])}</td></tr>' for _, it, n, rate in dr[:8]) + "</table>"
        vm = [(n, c) for n, c in m.get("vmobs") or [] if n in MOB]
        if vm:
            b += ("<h2>Party quest and job test monsters</h2><p class=\"note\">Copies made for this map, with their own stats.</p><div class=\"mobs\">" +
                  "".join(f'<div class="mob"><span></span><span><b>{E(n)} ×{c}</b><small>Lv {MOB[n]["lv"]} · {fmt(MOB[n]["hp"])} HP · {fmt(MOB[n]["exp"])} EXP</small></span></div>' for n, c in sorted(vm, key=lambda x: -x[1])) + "</div>")
        if m.get("npcs"):
            b += "<h2>NPCs</h2><ul>" + "".join(f"<li>{E(n[0])}{' · ' + E(n[3]) if n[3] else ''}</li>" for n in m["npcs"]) + "</ul>"
        if m.get("shops"): b += f'<p class="note">Shops here: {E(", ".join(m["shops"]))}.</p>'
        q_here = [q for q in QS if q.get("g") in {n[0] for n in m.get("npcs") or []}]
        if q_here: b += "<h2>Quests that start here</h2><ul>" + "".join(f"<li>{qlink(q)} <small>· {('Lv ' + str(q['lv']) + '+ · ') if q['lv'] else ''}from {E(q['g'])}</small></li>" for q in sorted(q_here, key=lambda q: q["lv"])) + "</ul>"
        b += f'<p style="margin-top:16px"><a href="/map.html#map={E(p)}">Open {E(p)} in the interactive map</a> · <a href="/map.html#route=|{E(p)}">Find the fastest route here</a></p><p class="note">Updated {built}.</p>'
        b += BOARD_CTA
        crumbs = [("Maps", "/maps/"), (p, f"/map/{MSLUG[p]}/")]
        write(out, f"map/{MSLUG[p]}", page(itempages.fit_title(f"{p} map, portals & monsters", "MapleStory Classic", "Club FM"), desc, f"/map/{MSLUG[p]}/", crumbs, b, f"{OG}map/{MSLUG[p]}.png")); paths.append(f"/map/{MSLUG[p]}/")

    # ---------------------------------------------------------- monster pages
    for n, mb in MOB.items():
        if mb.get("variant"): continue
        if not homes.get(n) and not drops.get(n) and not qkill.get(n): continue
        sp = sprite_url(n)
        ev = sum(r / 100 * PRICE[i] for i, r, qo in drops.get(n, []) if not qo and i in PRICE and r)
        desc = (f"{n} in MapleStory Classic World: level {mb['lv']}, {fmt(mb['hp'])} HP, {fmt(mb['exp'])} EXP. " +
                (f"Found in {', '.join(p for p, _ in sorted(homes.get(n, []), key=lambda x: -x[1])[:3])}. " if homes.get(n) else "") +
                ("Drops, drop rates and what they sell for." if drops.get(n) else ""))
        b = f'<div class="hd">' + (f'<img class="sprite" src="{sp}" alt="{E(n)}">' if sp else "") + f'<div><h1>{E(n)}</h1><p class="sub">MapleStory Classic monster · Level {mb["lv"]}{" · Boss" if mb.get("boss") else ""}{" · Undead" if mb.get("undead") else ""}</p></div></div>'
        b += ('<div class="grid">' + "".join(f"<div><span>{k}</span><b>{v}</b></div>" for k, v in [
            ("HP", fmt(mb["hp"])), ("EXP", fmt(mb["exp"])), ("Attack", fmt(mb["atk"])), ("Accuracy", fmt(mb.get("acc"))), ("Avoid", fmt(mb.get("eva"))),
            ("Defense", f'{fmt(mb.get("wdef"))} / {fmt(mb.get("mdef"))} magic'), ("Weak to", E(mb.get("weak") or "Nothing")), ("Resists", E(mb.get("resist") or "Nothing"))]) + "</div>")
        mz = mb.get("meso")
        b += f'<p>{E(n)} gives {mb["exp"] / max(1, mb["hp"]) * 100:.1f} EXP per 100 HP.' + (
            (f" Drops {mz[0]} to {mzf(mz[1])}" + (f" {mz[2]}% of the time" if mz[2] else "") + (f" (measured over {mz[4]} kills on the wiki)." if mz[3] == "wiki" and mz[4] else " (wiki measurement)." if mz[3] == "wiki" else " (player reports).")) if mz else "") + (f" Drops worth about {mzs(ev)} a kill at today's Free Market prices." if ev >= 1 else "") + (" Undead: Heal damages it." if mb.get("undead") else "") + "</p>"
        if homes.get(n):
            b += "<h2>Where to find it</h2><table><tr><th>Map</th><th>Count</th><th>Levels</th><th></th></tr>" + "".join(
                f'<tr><td>{mlink(p)}</td><td>{c}</td><td><small>{(str(M[p]["lv"][0]) + "–" + str(M[p]["lv"][1])) if M[p].get("lv") and M[p]["lv"][0] and M[p]["lv"][1] else ""}</small></td><td>{navbtn(p)}</td></tr>' for p, c in sorted(homes[n], key=lambda x: -x[1])) + "</table>"
        if drops.get(n):
            b += "<h2>Drops</h2><table><tr><th>Item</th><th>Rate</th><th>Sells for</th></tr>" + "".join(
                f'<tr><td>{ilink(i)}{live(i)}{" <small>(only while on the quest)</small>" if qo else ""}</td><td>{f"{r:g}%" if r is not None else ""}</td><td class="n">{mzs(PRICE[i]) if i in PRICE else ""}</td></tr>'
                for i, r, qo in sorted(drops[n], key=lambda x: -(PRICE.get(x[0], 0) * (x[1] or 0)))) + "</table><p class=\"note\">Drop rates measured by players on the wiki.</p>"
        qq = [(q, c, "Hunt") for q, c in qkill.get(n, [])] + [(q, c, "Bring " + i) for i, _, _ in drops.get(n, []) for q, c in qneed.get(i, [])]
        if qq:
            seen = set(); rows = ""
            for q, c, why in sorted(qq, key=lambda x: x[0]["lv"]):
                if (q["id"], why) in seen: continue
                seen.add((q["id"], why)); rows += f"<li>{qlink(q)} <small>· {('Lv ' + str(q['lv']) + '+ · ') if q['lv'] else ''}{E(why)} ×{c:,}</small></li>"
            b += f"<h2>Quests that need it</h2><ul>{rows}</ul>"
        b += f'<p class="note">Updated {built}.</p>'
        b += BOARD_CTA
        crumbs = [("Monsters", "/monsters/"), (n, f"/monster/{BSLUG[n]}/")]
        write(out, f"monster/{BSLUG[n]}", page(itempages.fit_title(f"{n} drops, stats & location", "MapleStory Classic", "Club FM"), desc, f"/monster/{BSLUG[n]}/", crumbs, b, f"{OG}monster/{BSLUG[n]}.png" if mb.get("id") else None)); paths.append(f"/monster/{BSLUG[n]}/")

    # ---------------------------------------------------------- quest pages
    def jobs_text(js):
        fam = sorted({JOBNAME.get(j // 100, "") for j in js if j // 100 in JOBNAME} - {""})
        if not js or len(fam) >= 5 or len(js) > 40: return "Every class"
        return ", ".join(fam)
    # quests that share a name (one per town, one per job) get who gives it, then the level, so every title is its own
    qn = {}
    for q in QS: qn.setdefault(q["n"], []).append(q)
    def qtitle(q):
        same = qn.get(q["n"], [])
        if len(same) < 2: return q["n"]
        t = f'{q["n"]} ({q["g"]})'
        if sum(1 for x in same if x["g"] == q["g"]) > 1: t = f'{q["n"]} ({q["g"]}, Lv {q["lv"]})'
        if sum(1 for x in same if x["g"] == q["g"] and x["lv"] == q["lv"]) > 1: t = f'{q["n"]} ({q["g"]}, #{q["id"]})'
        return t
    for q in QS:
        s = QSLUG[q["id"]]
        # an event NPC is named for the event ("Malady (Halloween)") but stands on the maps under her plain name
        where_g = npc_at.get(q["g"], []) or npc_at.get(re.sub(r"\s*\([^)]*\)\s*$", "", q["g"]), [])
        desc = (f"{q['n']}, a level {q['lv']} MapleStory Classic quest from {q['g']}" + (f" in {where_g[0]}" if where_g else "") + ": " +
                (", ".join(f"{c} {i}" for i, c in q.get("need", [])[:3]) or ", ".join(f"hunt {c} {k}" for k, c, *_ in q.get("kill", [])[:2]) or "what to do") +
                (f", rewards {fmt(q['exp'])} EXP" if q.get("exp") else "") + ".")
        b = f'<h1>{E(q["n"])}</h1><p class="sub">MapleStory Classic quest · Level {q["lv"]}+ · {E(q.get("a") or "")}{" · Repeatable" if q.get("rep") else ""}</p>'
        extra = []
        if q.get("lv2"): extra.append(f"Turn it in at level {q['lv2']}.")
        if q.get("cost"): extra.append(f"Costs {mzf(q['cost'])} to accept.")
        for pr in q.get("prof") or []: extra.append(f"Needs {E(pr[0])} level {pr[1]}.")
        if q.get("ended"): extra.append("This event has ended" + (f" ({E(q['to'][:10])})" if q.get("to") else "") + ". The quest can't be started now.")
        elif q.get("from") or q.get("to"): extra.append("Event quest" + (f", opens {E(q['from'][:10])}" if q.get("from") else "") + (f", ends {E(q['to'][:10])}" if q.get("to") else "") + ".")
        if q.get("start"): extra.append("You're given " + ", ".join(ilink(i, c) for i, c in q["start"]) + " when you start.")
        if q.get("unconfirmed"): extra.append("Sources disagree on: " + E(", ".join(q["unconfirmed"])) + ". Shown from the game data.")
        if extra: b += '<div class="tip">' + "<br>".join(extra) + "</div>"
        b += '<div class="grid">' + "".join(f"<div><span>{k}</span><b>{v}</b></div>" for k, v in [
            ("Start from", E(q["g"])), ("Level", f"{q['lv']}+"), ("Who can do it", jobs_text(q.get("jobs") or [])),
            ("EXP", fmt(q.get("exp"))), ("Mesos", fmt(q.get("meso"))), ("Fame", fmt(q.get("fame")))] if v not in ("0",)).replace(f"<span>Mesos</span><b>{fmt(q.get('meso'))}</b>", f'<span>Mesos</span><b class="mz">{fmt(q.get("meso"))}</b>') + "</div>"
        if where_g:
            npic = f'<img class="npcpic" src="{IO}/npc/{q["gid"]}/icon" alt="" loading="lazy">' if q.get("gid") is not None else ""
            b += f"<p>{npic}{E(q['g'])} stands in {', '.join(mnav(p) for p in where_g[:4])}.</p>"
            gm = next((M[p] for p in where_g if M[p].get("mm")), None)
            if gm:
                np_ = next((n for n in gm.get("npcs") or [] if n[0] == q["g"]), None)
                if np_: b += minimap(gm, spawns=False, hl=(np_[1], np_[2], q["g"] + " is here")) + f'<p class="note">{E(q["g"])} is the green dot{(", " + where(gm, np_[1], np_[2])) if where(gm, np_[1], np_[2]) else ""}, in {E(gm["name"])}.</p>'
        if q.get("pre"):
            pre = [QBYID[i] for i in q["pre"] if i in QBYID]
            if pre: b += "<h2>Finish first</h2><ul>" + "".join(f"<li>{qlink(x)} {('<small>· Lv ' + str(x['lv']) + '+</small>') if x['lv'] else ''}</li>" for x in pre) + "</ul>"
        # the quest window's to-do list, with the map for each step when we know it
        steps = q.get("steps") or []
        qw = QWHERE.get(str(q["id"])) or {}
        if steps and (qw or not (q.get("need") or q.get("kill"))):
            def stepl(t):
                t2 = re.sub(r"\{m:(\d+)\}", lambda mm: MBYID.get(int(mm.group(1)), "") , t)
                hit = qw.get(t.strip()) or qw.get(t2.strip())
                if hit and hit[1] in M:
                    return f"<li>{E(t2)}: {E(hit[0])} in {mnav(hit[1])}" + (f" <small>· {E(hit[2])}</small>" if len(hit) > 2 and hit[2] else "") + "</li>"
                maps = [MBYID[int(x)] for x in re.findall(r"\{m:(\d+)\}", t) if int(x) in MBYID]
                return f"<li>{E(t2)}" + (" " + " ".join(navbtn(x) for x in maps) if maps else "") + "</li>"
            b += "<h2>Steps</h2><ol>" + "".join(stepl(t) for t in steps) + "</ol>"
        if q.get("kill"):
            b += "<h2>Hunt</h2><ul>" + "".join(
                f"<li>" + (f'<img class="ms" src="{sprite_url(k[0])}" alt="" loading="lazy">' if sprite_url(k[0]) else "") + f"{blink(k[0])} ×{k[1]:,}" + (f" <small>· found in {', '.join(mnav(p) for p, _ in sorted(homes.get(k[0], []), key=lambda x: -x[1])[:3])}</small>" if homes.get(k[0]) else "") + "</li>" for k in q["kill"]) + "</ul>"
        if q.get("need"):
            acc = {"fee": 0, "cat": {}, "base": {}}; rows = ""; crafted = 0
            for i, c in q["need"]:
                nd = plan(i, c, frozenset(), acc)
                rows += f'<div class="need"><div class="nl"><span class="nm">{ilink(i)}{live(i)}</span><span class="n">×{c:,}</span>{fp(i, c)}</div>'
                if nd["r"]:
                    crafted += 1
                    rows += craft_line(nd) + '<div class="tk">' + "".join(tree_html(k) for k in nd["kids"]) + "</div>"
                else: rows += srcs(i)
                rows += "</div>"
            b += f'<h2>Bring</h2>{rows}<p class="note fpnote">FM prices change with the market; these are today\'s.</p>'
            if crafted:
                b += ('<div class="basebox"><b>Everything to gather</b>' + "".join(f"<span>{ilink(n, c)}</span>" for n, c in sorted(acc["base"].items(), key=lambda x: -x[1]))
                      + (f"<div>{mzs(acc['fee'])} in crafting fees" + "".join(f" · catalyst {E(itempages.shown(n))} ×{c}" for n, c in acc["cat"].items()) + "</div>" if acc["fee"] or acc["cat"] else "") + "</div>")
            tot = sum(PRICE[i] * c for i, c in q["need"] if i in PRICE)
            if tot: b += f'<p data-fmtot="{E(json.dumps(q["need"]))}">Buy it all on the Free Market: <b>{"about" if all(i in PRICE for i, _ in q["need"]) else "at least"} <span class="mz">{meso(tot)}</span></b>.</p>'
        if q.get("get") or q.get("get2") or q.get("skill") or q.get("exp") or q.get("meso"):
            b += ("<h2>Rewards</h2><ul>" + "".join(f"<li>{ilink(i, c)}</li>" for i, c in q.get("get") or [])
                  + "".join(f"<li>{ilink(x[0], x[1])} <small>· {E(x[2])}</small></li>" for x in q.get("get2") or [])
                  + "".join(f"<li>Skill: {E(n)}</li>" for n in q.get("skill") or [])
                  + ("<li>" + fmt(q["exp"]) + " EXP</li>" if q.get("exp") else "") + ("<li>" + mzf(q["meso"]) + "</li>" if q.get("meso") else "") + "</ul>")
        nx = nextq.get(q["id"], [])
        if nx: b += "<h2>Opens next</h2><ul>" + "".join(f"<li>{qlink(x)} {('<small>· Lv ' + str(x['lv']) + '+</small>') if x['lv'] else ''}</li>" for x in nx) + "</ul>"
        br = next((x for x in (notes or {}).get("brackets") or [] if x["lo"] <= max(q["lv"], 1) < x["hi"]), None)
        b += ('<div class="nextbar">' + f'<a href="/quests.html#q-{q["id"]}">Track it in your Quest Log</a>'
              + "".join(f'<a class="alt" href="/quest/{QSLUG[x["id"]]}/">Next: {E(x["n"])}</a>' for x in nx[:2])
              + (f'<a class="alt" href="/training/level-{br["lo"]}-{br["hi"]}/">Where to train at level {br["lo"]} to {br["hi"]}</a>' if br else "") + "</div>")
        b += f'<p class="note">Updated {built}.</p>'
        b += BOARD_CTA
        crumbs = [("Quest guides", "/quests/"), (q["n"], f"/quest/{s}/")]
        write(out, f"quest/{s}", page(itempages.fit_title(qtitle(q), "MapleStory Classic quest guide", "Club FM"), desc, f"/quest/{s}/", crumbs, b)); paths.append(f"/quest/{s}/")

    # ---------------------------------------------------------- training guides
    # Rankings come from the damage engine (assets/classic-dmg.js through tools/trainrank.cjs), the same one map.html
    # uses: each job's typical build at the level, maps where it hits and kills reliably, ranked by EXP an hour.
    brackets = (notes or {}).get("brackets") or []
    RANK = {}
    try:
        import subprocess, tempfile
        root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
        with tempfile.TemporaryDirectory() as td:
            wf, rf = os.path.join(td, "w.json"), os.path.join(td, "r.json")
            json.dump(world, open(wf, "w", encoding="utf-8"))
            subprocess.run(["node", os.path.join(root, "tools", "trainrank.cjs"), wf, os.path.join(root, "assets", "classic-skills.json"), rf], check=True, timeout=300)
            RANK = json.load(open(rf, encoding="utf-8")).get("builds") or {}
    except Exception as e:  # noqa: BLE001
        print("training ranks unavailable:", e)
    BY_FAM = {"Beginner": ["Beginner"], "Warrior": ["Warrior", "Fighter", "Page", "Spearman"], "Magician": ["Magician", "Fire Poison Wizard", "Ice Lightning Wizard", "Cleric"],
              "Bowman": ["Bowman", "Hunter", "Crossbowman"], "Thief": ["Thief (claw)", "Thief (dagger)", "Assassin", "Bandit", "Sindit"]}
    # hybrid builds (trainrank.cjs): shown on the class pages only, so the level pages stay one list per job
    HYBRIDS = {"Warrior": ["Warrior (dexless)", "Dexless Fighter", "Dexless Page", "Dexless Spearman"],
               "Magician": ["Magician (LUK)", "LUK Fire Poison Wizard", "LUK Ice Lightning Wizard", "LUK Cleric"],
               "Thief": ["Sindit (dagger at 36)", "Sindit (reset at 40)", "Thief (dexless claw)", "Dexless Assassin", "Thief (dexless dagger)", "Dexless Bandit"]}
    def ranked(key, L, n=3):
        lv = ((RANK.get(key) or {}).get("levels") or {}).get(str(L)) or {}
        return lv.get("atk") or "", (lv.get("top") or [])[:n]
    def rank_list(key, L, n=3):
        atk, top = ranked(key, L, n)
        if not top and any(key in v for v in HYBRIDS.values()) and str(L) in ((RANK.get(key) or {}).get("levels") or {}):
            return f'<h3>{E(key)}</h3><p class="note">Nothing near level {L} passes the bar for this build in typical gear.</p>'
        if not top: return ""
        return (f'<h3>{E(key)} <small class="note">· {E(atk)}</small></h3><ol>' +
                "".join(f'<li>{mnav(p)} <small>· {fmt(e)} EXP an hour (est.) · {E(w)}</small></li>' for p, e, k, w in top) + "</ol>")
    def keys_at(L, fams=None):
        out = []
        for f in (["Beginner"] if L < 10 else []) + (fams or ["Warrior", "Magician", "Bowman", "Thief"]):
            for k in BY_FAM[f] + (HYBRIDS.get(f, []) if fams else []):
                info = RANK.get(k) or {}
                if str(L) in (info.get("levels") or {}): out.append(k)
        return out
    def pick_html(p, st, dmg, hit, cost, L, why=""):
        m = M[p]
        mobs = "".join(mobcard(n, f" ×{c}") for n, c in sorted(m["mobs"], key=lambda x: -x[1]) if n in MOB and not MOB[n].get("boss"))
        return (f'<div class="pick"><h3>{mlink(p)}{navbtn(p)}</h3><p class="note">{E(m.get("region") or "")}{" · nearest town " + mlink(m["near"]) if m.get("near") else ""} · {st["n"]} spawn points{(" · slow respawns: " + timers(m)) if timers(m) else ""}</p>'
                + (f"<p>{E(why)}</p>" if why else "") + f'<div class="mobs">{mobs}</div>'
                f'<p class="note">Touch from {blink(st["worst"])}: about {fmt(dmg)} damage at level {L} in typical gear, hits {round(hit * 100)}% of the time, about {mzf(cost)} of {E(HP[0])} each.</p></div>')
    BAR = '<p class="note"><b>Typical gear estimates.</b> Clean shop weapon for the level, usual stats and skill order. Every map shown lets that build land 80% of its attacks or more and kill each common monster in 8 s or less. <a href="/map.html#train">Enter your own build</a> for your numbers.</p>'
    tr_links = []
    for br in brackets:
        lo, hi = br["lo"], br["hi"]; L = (lo + min(hi, lo + 15)) // 2
        picks = {x["map"]: x for x in br.get("picks") or []}
        s = f"level-{lo}-{hi}"
        b = f"<h1>Where to train from level {lo} to {hi} in MapleStory Classic</h1><p class=\"sub\">Training guide · every job · updated {built}</p>"
        b += "".join(f'<div class="tip">{E(t)}</div>' for t in br.get("tips") or [])
        b += "<h2>Players recommend</h2>"
        for x in br.get("picks") or []:
            if x["map"] not in M: continue
            st = stats(M[x["map"]])
            if not st: continue
            dmg, hit = touch(MOB[st["worst"]], L, "Bowman")
            b += pick_html(x["map"], st, dmg, hit, dmg * hit * HP[1], L, x["why"] + (f" Best for: {', '.join(x['classes'])}." if x.get("classes") else ""))
        b += f"<h2>Best maps for each job at level {L}</h2>" + BAR + "".join(rank_list(k, L) for k in keys_at(L))
        b += "<h2>By class</h2><p>" + " · ".join(f'<a href="/training/{c.lower()}/">{c}</a>' for c in CLASSES) + "</p>"
        crumbs = [("Training guide", "/training/"), (f"Level {lo} to {hi}", f"/training/{s}/")]
        desc = f"Best MapleStory Classic training spots from level {lo} to {hi} for every job: " + ", ".join(list(picks)[:3]) + ", with EXP an hour, monsters and potion costs."
        write(out, f"training/{s}", page(itempages.fit_title(f"Where to train level {lo} to {hi}", "MapleStory Classic", "Club FM"), desc, f"/training/{s}/", crumbs, b)); paths.append(f"/training/{s}/")
        tr_links.append((lo, hi, s, list(picks)[:3]))
    for cls in CLASSES:
        b = f"<h1>{cls} training guide for MapleStory Classic</h1><p class=\"sub\">Where a {cls.lower()} should train at every level · updated {built}</p>"
        b += BAR + ("<p class=\"note\">Mages hit magic defense and use elements: maps differ by 2nd job.</p>" if cls == "Magician" else "<p class=\"note\">Physical attacks hit weapon defense: high-defense monsters like Iron Hogs are slow for every physical job.</p>")
        for br in brackets:
            lo, hi = br["lo"], br["hi"]; L = (lo + min(hi, lo + 15)) // 2
            b += f'<h2>Level {lo} to {hi} <small class="note">· shown for level {L}</small></h2>' + "".join(rank_list(k, L) for k in keys_at(L, [cls]))
            b += f'<p class="note"><a href="/training/level-{lo}-{hi}/">All of level {lo} to {hi}</a></p>'
        crumbs = [("Training guide", "/training/"), (cls, f"/training/{cls.lower()}/")]
        write(out, f"training/{cls.lower()}", page(itempages.fit_title(f"{cls} training guide, every level", "MapleStory Classic", "Club FM"),
                                                    f"Where a {cls} should train in MapleStory Classic from level 1 to 100, by 2nd job: the best maps at each level with EXP an hour.", f"/training/{cls.lower()}/", crumbs, b))
        paths.append(f"/training/{cls.lower()}/")

    # ---------------------------------------------------------- hubs
    b = "<h1>MapleStory Classic training guide</h1><p class=\"sub\">Where to train at every level, for every class · updated " + built + "</p>"
    b += "<p>From the game files and the MapleStory Classic Wiki: monsters, spawns, respawn times and elements. Maps ranked by EXP an hour for each job's typical build, only where it hits and kills reliably.</p>"
    b += "<h2>By level</h2><ul>" + "".join(f'<li><a href="/training/{s}/">Level {lo} to {hi}</a> <small>· {E(", ".join(p))}</small></li>' for lo, hi, s, p in tr_links) + "</ul>"
    b += "<h2>By class</h2><ul>" + "".join(f'<li><a href="/training/{c.lower()}/">{c}</a></li>' for c in CLASSES) + "</ul>"
    if notes and notes.get("economy"): b += "<h2>Potions and money</h2><ul>" + "".join(f"<li>{E(t)}</li>" for t in notes["economy"]) + "</ul>"
    if notes and notes.get("party"): b += "<h2>Party play</h2><ul>" + "".join(f"<li>{E(t)}</li>" for t in notes["party"]) + "</ul>"
    b += '<p style="margin-top:16px"><a href="/map.html#train">Your level, your class: get a personal list</a></p>'
    write(out, "training", page("MapleStory Classic training guide · every level · Club FM", "Where to train in MapleStory Classic at every level and for every class: the best maps by job with EXP an hour, monsters and potion costs, updated daily.", "/training/", [("Training guide", "/training/")], b)); paths.append("/training/")

    regions = {}
    for p, m in M.items(): regions.setdefault(m.get("region") or "Other", []).append(p)
    b = "<h1>MapleStory Classic maps</h1><p class=\"sub\">" + f"{len(M)} maps with minimaps, hidden portals, monsters and exits · updated {built}</p>"
    hidc = sum(1 for m in M.values() for x in m["portals"] if x[1] == "hidden")
    b += f"<p>Every map with its in-game minimap. {hidc} hidden portals marked. <a href=\"/map.html#train\">The route finder</a> gives the fastest way and the free way.</p>"
    for r in sorted(regions, key=lambda r: -len(regions[r])):
        b += f"<h2>{E(r)} <small>{len(regions[r])}</small></h2><ul class=\"toc\">" + "".join(
            f'<li>{mlink(p)}{" <small>· Lv " + str(M[p]["lv"][0]) + "+</small>" if M[p].get("lv") and M[p]["lv"][0] else ""}</li>' for p in sorted(regions[r])) + "</ul>"
    write(out, "maps", page("MapleStory Classic maps, hidden portals and monsters · Club FM", f"Every MapleStory Classic map: in-game minimaps, {hidc} hidden portals, monsters, NPCs and exits.", "/maps/", [("Maps", "/maps/")], b)); paths.append("/maps/")

    mons = sorted([n for n in MOB if f"/monster/{BSLUG[n]}/" in paths], key=lambda n: (MOB[n]["lv"], n))
    b = f"<h1>MapleStory Classic monsters</h1><p class=\"sub\">{len(mons)} monsters with stats, drops and where to find them · updated {built}</p><div class=\"mobs\">" + "".join(mobcard(n) for n in mons) + "</div>"
    write(out, "monsters", page("All MapleStory Classic monsters · drops, stats and locations · Club FM", "Every MapleStory Classic monster: level, HP, EXP, drops with rates and Free Market value, and the maps they spawn on.", "/monsters/", [("Monsters", "/monsters/")], b)); paths.append("/monsters/")

    areas = {}
    for q in QS: areas.setdefault(q.get("a") or "Other", []).append(q)
    b = f"<h1>MapleStory Classic quests</h1><p class=\"sub\">{len(QS)} quests with what to bring, what to hunt and the rewards · updated {built}</p>"
    b += '<p><a href="/quests.html">The Quest Log</a> shows what is open at your level and tracks what you have done.</p>'
    for a in sorted(areas, key=lambda a: -len(areas[a])):
        b += f"<h2>{E(a)} <small>{len(areas[a])}</small></h2><ul class=\"toc\">" + "".join(f"<li>{qlink(q)} {('<small>· Lv ' + str(q['lv']) + '</small>') if q['lv'] else ''}</li>" for q in sorted(areas[a], key=lambda q: (q["lv"], q["n"]))) + "</ul>"
    QBANDS = [(1, 10), (10, 20), (20, 30), (30, 40), (40, 50), (50, 70), (70, 200)]
    # only bands that have quests get a page, so only those are linked (level 70 and up had none yet: a dead link)
    QBANDS = [(lo, hi) for lo, hi in QBANDS if any(lo <= max(q["lv"], 1) < hi and not q.get("ended") for q in QS)]
    b = b.replace('<p><a href="/quests.html">', '<p><b>By level:</b> ' + " · ".join(f'<a href="/quests/level-{lo}-{hi}/">{lo} to {hi if hi < 200 else str(lo) + "+"}</a>'.replace(f"{lo} to {lo}+", f"{lo}+") for lo, hi in QBANDS) + ' · <a href="/crafting/">Crafting recipes</a></p><p><a href="/quests.html">', 1)
    write(out, "quests", page("All MapleStory Classic quests · items, monsters and rewards · Club FM", "Every MapleStory Classic quest: level, who gives it, the items to bring, monsters to hunt and the rewards.", "/quests/", [("Quest guides", "/quests/")], b)); paths.append("/quests/")

    # ---------------------------------------------------------- quests by level: what people search for ("maplestory classic quests level 30")
    def qcost(q): return sum(PRICE[i] * c for i, c in q.get("need") or [] if i in PRICE)
    for lo, hi in QBANDS:
        band = sorted([q for q in QS if lo <= max(q["lv"], 1) < hi and not q.get("ended")], key=lambda q: (-(q.get("exp") or 0), q["n"]))
        if not band: continue
        lab = f"level {lo} to {hi}" if hi < 200 else f"level {lo} and up"
        rows = "".join(f'<tr><td>{qlink(q)}<br><small>Lv {q["lv"]} · {E(q["g"])}{(" · " + E(q.get("town"))) if q.get("town") else ""}</small></td><td class="n">{fmt(q.get("exp"))}</td>'
                       f'<td class="n">{"talk only" if not q.get("need") and not q.get("kill") else (mzs(qcost(q)) if qcost(q) else "gather")}</td></tr>' for q in band)
        b = (f"<h1>MapleStory Classic quests for {lab}</h1><p class=\"sub\">{len(band)} quests, most EXP first · updated {built}</p>"
             f'<p>Tap a quest for what to bring, crafted items broken down to base materials, and rewards. <a href="/quests.html">Track them in your Quest Log</a>.</p>'
             f"<table><tr><th>Quest</th><th>EXP</th><th>Buy it all</th></tr>{rows}</table>"
             + '<p class="note">' + " · ".join(f'<a href="/quests/level-{a}-{z}/">Level {a} to {z if z < 200 else str(a) + "+"}</a>'.replace(f"{a} to {a}+", f"{a}+") for a, z in QBANDS if (a, z) != (lo, hi)) + "</p>")
        top = ", ".join(q["n"] for q in band[:3])
        write(out, f"quests/level-{lo}-{hi}", page(itempages.fit_title(f"MapleStory Classic quests for {lab}", "best EXP", "Club FM"),
              f"Every MapleStory Classic quest for {lab}, most EXP first: {top}. Items to bring, crafted materials and rewards.", f"/quests/level-{lo}-{hi}/", [("Quest guides", "/quests/"), (lab.capitalize(), f"/quests/level-{lo}-{hi}/")], b))
        paths.append(f"/quests/level-{lo}-{hi}/")

    # ---------------------------------------------------------- crafting recipes by profession
    profs = {}
    for n, g in ITEMS.items():
        for r in g.get("c") or []: profs.setdefault(r[0], []).append((n, r))
    if profs:
        for pf, recs in profs.items():
            recs.sort(key=lambda x: (x[1][1], x[0]))
            rows = "".join(f'<tr><td>{ilink(n)}{(" ×" + str(r[4])) if (r[4] or 1) > 1 else ""}<br><small>Lv {r[1]}{(" · catalyst " + E(itempages.shown(r[5][0]))) if r[5] else ""}</small></td>'
                           f'<td>{"<br>".join(ilink(i, c) for i, c in r[2])}</td><td class="n">{mzs(r[3]) if r[3] else "free"}</td></tr>' for n, r in recs)
            ps = slug(pf)
            b = (f"<h1>MapleStory Classic {E(pf)} recipes</h1><p class=\"sub\">{len(recs)} recipes by crafting level · updated {built}</p>"
                 f"<table><tr><th>Makes</th><th>Needs</th><th>Fee</th></tr>{rows}</table>"
                 + '<p class="note">' + " · ".join(f'<a href="/crafting/{slug(x)}/">{E(x)}</a>' for x in sorted(profs) if x != pf) + "</p>")
            write(out, f"crafting/{ps}", page(itempages.fit_title(f"{pf} recipes", "MapleStory Classic crafting", "Club FM"),
                  f"Every MapleStory Classic {pf} recipe: what it makes, the materials, crafting level and fee.", f"/crafting/{ps}/", [("Crafting", "/crafting/"), (pf, f"/crafting/{ps}/")], b))
            paths.append(f"/crafting/{ps}/")
        b = (f"<h1>MapleStory Classic crafting recipes</h1><p class=\"sub\">{sum(len(v) for v in profs.values())} recipes in {len(profs)} professions · updated {built}</p><ul>"
             + "".join(f'<li><a href="/crafting/{slug(pf)}/">{E(pf)}</a> <small>· {len(recs)} recipes</small></li>' for pf, recs in sorted(profs.items())) + "</ul>"
             + '<p>Quests that need a crafted item show the whole recipe down to base materials in the <a href="/quests.html">Quest Log</a>.</p>')
        write(out, "crafting", page("MapleStory Classic crafting recipes · every profession · Club FM", "Every MapleStory Classic crafting recipe by profession: materials, crafting level and meso fee.", "/crafting/", [("Crafting", "/crafting/")], b))
        paths.append("/crafting/")

    open(os.path.join(out, "item", "world.css"), "w").write(CSS + "\n")
    # pages for things that left the data go away, so nothing stale sits in search
    keep = {x.strip("/") for x in paths}
    for root in ("map", "monster", "quest", "training"):
        rd = os.path.join(out, root)
        if not os.path.isdir(rd): continue
        for s in os.listdir(rd):
            if f"{root}/{s}" not in keep and os.path.isdir(os.path.join(rd, s)): shutil.rmtree(os.path.join(rd, s))
    # every monster's sprite, level, page and busiest map, small enough for the board to load for "Dropped by"
    mobs_out = {}
    for n, mb in MOB.items():
        if not mb.get("id") or n not in BSLUG: continue
        best = max(homes.get(n, []), key=lambda x: x[1], default=None)
        # 5: mesos a kill [min, max, chance %, "wiki" measured or "reported" by players]; 6: drops with a measured rate [[item, %]]
        if mb.get("variant"): continue
        mz = list(MESOS.get(n) or [])[:4] or 0
        rated = [[i, r] for i, r, qo in drops.get(n, []) if r and not qo and i != "Meso"]
        mrate = [r for i, r, qo in drops.get(n, []) if i == "Meso" and r]
        if mz and not mz[2]: mz[2] = round(mrate[0]) if mrate else 70     # how often mesos drop at all: the wiki's kill counts, else about 70%
        mobs_out[n] = [mb["id"], mb.get("lv") or 0, BSLUG[n], best[0] if best else "", MSLUG.get(best[0], "") if best else "", mz, rated]
    os.makedirs(os.path.join(out, "data"), exist_ok=True)
    json.dump(mobs_out, open(os.path.join(out, "data", "mobs.json"), "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    def _sum(pairs):
        t = {}
        for p, c in pairs: t[p] = t.get(p, 0) + c
        return t
    # data/play.json: what the Quests and Training pages link to (quest guide pages, where monsters live, where NPCs stand)
    play = {"q": {str(q["id"]): QSLUG[q["id"]] for q in QS},
            "mob": {n: [BSLUG[n], [[p, MSLUG[p]] for p, c in sorted(_sum(homes.get(n, [])).items(), key=lambda x: -x[1])[:3]]] for n in MOB if not MOB[n].get("boss") or homes.get(n)},
            "npc": {n: [[p, MSLUG[p]] for p in ps[:2]] for n, ps in npc_at.items()}}
    os.makedirs(os.path.join(out, "data"), exist_ok=True)
    with open(os.path.join(out, "data", "play.json"), "w", encoding="utf-8") as f: json.dump(play, f, separators=(",", ":"), ensure_ascii=False)
    return paths, QSLUG, BSLUG, MSLUG


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    w, g, s, n, out = sys.argv[1:6]
    ld = lambda p, d: json.load(open(p, encoding="utf-8")) if os.path.exists(p) else d
    paths = build(ld(w, {}), ld(g, {}), ld(s, {}), ld(n, {}), out)[0]
    print(len(paths), "world pages")
