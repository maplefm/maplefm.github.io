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
.cta{margin:18px 0 0;padding:12px 14px;border-radius:14px;background:var(--panel2);border:1px solid var(--line2)}.cta a{font-weight:800}"""

JOBNAME = {0: "Beginner", 1: "Warrior", 2: "Magician", 3: "Bowman", 4: "Thief", 5: "Pirate"}
CLASSES = ["Warrior", "Magician", "Bowman", "Thief"]
GEAR = {"Warrior": (3.5, lambda L: 8 + 0.2 * L), "Magician": (1.2, lambda L: 10 + 0.4 * L), "Bowman": (2.2, lambda L: 15 + 0.6 * L),
        "Thief": (2.2, lambda L: 25 + 1.3 * L), "Beginner": (1.0, lambda L: 6 + 0.2 * L)}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower().replace("'", "")).strip("-") or "x"


def fmt(n): return f"{float(n or 0):,.0f}"


def meso(n):
    n = float(n or 0)
    if n >= 999.5e6: return f"{n / 1e9:.2f}".rstrip("0").rstrip(".") + "B"
    if n >= 999.5e3: return (f"{n / 1e6:.1f}" if n >= 9.95e6 else f"{n / 1e6:.2f}").rstrip("0").rstrip(".") + "M"
    if n >= 1e4: return (f"{n / 1e3:.0f}" if n >= 99.95e3 else f"{n / 1e3:.1f}").rstrip("0").rstrip(".") + "K"
    return f"{n:,.0f}"


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
    root = ("Quests", "/quests.html") if path.startswith(("/quest", "/quests")) else ("Training", "/map.html")
    trail = ([root] if crumbs and crumbs[0][0] != root[0] else []) + crumbs
    nav = ' <i>›</i> '.join([f'<a href="{u}">{E(n)}</a>' for n, u in trail[:-1]] + ([f'<span aria-current="page">{E(trail[-1][0])}</span>'] if trail else []))
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{E(title)}</title><meta name="description" content="{E(desc)}"><link rel="canonical" href="{canon}">
<meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}"><meta property="og:url" content="{canon}"><meta property="og:image" content="{og or SITE + "/og.png"}"><meta property="og:type" content="article"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="stylesheet" href="/item/item.css?v=4"><link rel="stylesheet" href="/item/world.css?v=2"><link rel="stylesheet" href="/assets/nav.css?v=2">
<script type="application/ld+json">{json.dumps(ld)}</script>{f'<meta name="thumbnail" content="{og}">' if og else ''}</head><body><main>
{NAV("quests" if path.startswith(("/quest", "/quests")) else "maps")}

{f'<nav class="crumbs" aria-label="You are here">{nav}</nav>' if nav else ''}<div class="card">{body}</div>
<p class="foot">MapleStory Classic World facts from the game files and the <a href="https://mapleclassic.wiki/" rel="noopener">MapleStory Classic Wiki</a> (CC BY-NC-SA 4.0), refreshed daily.</p>
</main>{FOOT()}<script src="/assets/hit.js" defer></script></body></html>"""


def write(out, path, text):
    d = os.path.join(out, path.strip("/"))
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(text)


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
        ic = f'<img class="gi" src="{IO}/item/{IDS[n]}/icon" alt="" loading="lazy">' if n in IDS else ""
        return f'{ic}<a href="/item/{itempages.slug(n)}/">{t}</a>' if n in ITEMPAGE else f'{ic}{t}'
    def live(n):   # straight to the item on the live board: who is selling it right now, and where
        return f' <a class="lv" href="/#item={urllib.parse.quote(n)}" title="Live listings for {E(itempages.shown(n))} on the price board">live</a>' if n in PRICE else ""
    MSLUG = {p: slug(p) for p in M}
    BSLUG = {n: slug(n) for n in MOB}
    QSLUG = quest_slugs(QS)
    QBYID = {q["id"]: q for q in QS}
    def mlink(p): return f'<a href="/map/{MSLUG[p]}/">{E(p)}</a>' if p in M else E(p)
    def blink(n): return f'<a href="/monster/{BSLUG[n]}/">{E(n)}</a>' if n in MOB else E(n)
    def qlink(q): return f'<a href="/quest/{QSLUG[q["id"]]}/">{E(q["n"])}</a>'
    def sprite_url(n): return f"{LIVE}data/sprite/{MOB[n]['id']}.gif" if n in MOB and MOB[n].get("id") else ""
    built = world.get("built") or datetime.date.today().isoformat()
    paths = []
    BOARD_CTA = ('<div class="cta"><b>What does it sell for right now?</b> The live price board shows every Free Market listing players have seen today, '
                 'with the channel and room to buy it in. <a href="/">Open the price board</a></div>')

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

    def stats(m):
        tot = e = hp = lv = 0; maxlv = 0; worst = None
        for n, c in m["mobs"]:
            mb = MOB.get(n)
            if not mb or mb.get("boss"): continue
            tot += c; e += mb["exp"] * c; hp += mb["hp"] * c; lv += mb["lv"] * c; maxlv = max(maxlv, mb["lv"])
            if not worst or mb["atk"] > MOB[worst]["atk"]: worst = n
        if not tot or not hp: return None
        return {"n": tot, "eph": e / hp * 100, "lv": lv / tot, "maxlv": maxlv, "worst": worst}

    def rank(L, cls, picks):
        out = []
        for p, m in M.items():
            if m.get("type") == "Town" or not m["mobs"]: continue
            st = stats(m)
            if not st: continue
            if (st["lv"] < L - 9 or st["lv"] > L + 4 or st["maxlv"] > L + 12) and p not in picks: continue
            dmg, hit = touch(MOB[st["worst"]], L, cls); cost = dmg * hit * HP[1]
            sc = st["eph"] * math.sqrt(st["n"]) / (1 + cost / 120) * (1.6 if p in picks else 1) * (0.8 if st["lv"] > L + 2 else 1)
            out.append((sc, p, st, dmg, hit, cost))
        out.sort(key=lambda x: -x[0]); return out

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
        intro = []
        if m.get("near") and m["near"] != p: intro.append(f"The nearest town is {mlink(m['near'])}.")
        if m.get("ret") and m["ret"] != p and m["ret"] != m.get("near"): intro.append(f"A Return Scroll to the nearest town takes you to {mlink(m['ret'])}.")
        if st: intro.append(f"It holds {st['n']} monsters at once, averaging level {st['lv']:.0f}, worth {st['eph']:.1f} EXP for every 100 HP you chew through.")
        if intro: b += f'<p>{" ".join(intro)}</p>'
        b += minimap(m)
        if hid:
            b += "<h2>Hidden portals</h2>" + "".join(f'<div class="hid"><b>To {mlink(x[0])}</b>: nothing glows here. Stand on the purple spot ({where(m, x[2], x[3]) or "see the minimap"}) and press up.{f" Needs level {x[5]}." if x[5] else ""}</div>' for x in hid)
        if m["portals"]:
            b += "<h2>Exits</h2><table><tr><th>Goes to</th><th>Kind</th><th>Where on the map</th></tr>" + "".join(
                f'<tr><td>{mlink(x[0])}</td><td>{"Hidden portal" if x[1] == "hidden" else "Door" if x[1] == "door" else "Portal"}{f" · Lv {x[5]}+" if x[5] else ""}</td><td><small>{where(m, x[2], x[3])}</small></td></tr>' for x in m["portals"]) + "</table>"
        if mobs_sorted:
            b += "<h2>Monsters</h2><div class=\"mobs\">" + "".join(mobcard(n, f" ×{c}") for n, c in mobs_sorted if n in MOB) + "</div>"
            dr = []
            for n, _ in mobs_sorted:
                for it, rate, qo in drops.get(n, []):
                    if not qo and it in PRICE and rate: dr.append((rate / 100 * PRICE[it], it, n, rate))
            if dr:
                dr.sort(key=lambda x: -x[0])
                b += "<h2>Most valuable drops here</h2><table><tr><th>Item</th><th>From</th><th>Rate</th><th>Sells for</th></tr>" + "".join(
                    f'<tr><td>{ilink(it)}{live(it)}</td><td>{blink(n)}</td><td>{rate:g}%</td><td class="n">{meso(PRICE[it])}</td></tr>' for _, it, n, rate in dr[:8]) + "</table>"
        if m.get("npcs"):
            b += "<h2>NPCs</h2><ul>" + "".join(f"<li>{E(n[0])}{' · ' + E(n[3]) if n[3] else ''}</li>" for n in m["npcs"]) + "</ul>"
        if m.get("shops"): b += f'<p class="note">Shops here: {E(", ".join(m["shops"]))}.</p>'
        q_here = [q for q in QS if q.get("g") in {n[0] for n in m.get("npcs") or []}]
        if q_here: b += "<h2>Quests that start here</h2><ul>" + "".join(f"<li>{qlink(q)} <small>· {('Lv ' + str(q['lv']) + '+ · ') if q['lv'] else ''}from {E(q['g'])}</small></li>" for q in sorted(q_here, key=lambda q: q["lv"])) + "</ul>"
        b += f'<p style="margin-top:16px"><a href="/map.html#map={E(p)}">Open {E(p)} in the interactive map</a> · <a href="/map.html#route=|{E(p)}">Find the fastest route here</a></p><p class="note">Updated {built}.</p>'
        b += BOARD_CTA
        crumbs = [("Maps", "/maps/"), (p, f"/map/{MSLUG[p]}/")]
        write(out, f"map/{MSLUG[p]}", page(f"{p} · MapleStory Classic map, portals and monsters · Club FM", desc, f"/map/{MSLUG[p]}/", crumbs, b, f"{OG}map/{MSLUG[p]}.png")); paths.append(f"/map/{MSLUG[p]}/")

    # ---------------------------------------------------------- monster pages
    for n, mb in MOB.items():
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
        b += f'<p>{E(n)} gives {mb["exp"] / max(1, mb["hp"]) * 100:.1f} EXP per 100 HP.' + (f" Its drops are worth about {meso(ev)} mesos a kill at today's Free Market prices, counting only drops that sell." if ev >= 1 else "") + (" Heal damages it, since it is undead." if mb.get("undead") else "") + "</p>"
        if homes.get(n):
            b += "<h2>Where to find it</h2><table><tr><th>Map</th><th>How many</th><th>Level range</th></tr>" + "".join(
                f'<tr><td>{mlink(p)}</td><td>{c}</td><td><small>{(str(M[p]["lv"][0]) + "–" + str(M[p]["lv"][1])) if M[p].get("lv") and M[p]["lv"][0] and M[p]["lv"][1] else ""}</small></td></tr>' for p, c in sorted(homes[n], key=lambda x: -x[1])) + "</table>"
        if drops.get(n):
            b += "<h2>Drops</h2><table><tr><th>Item</th><th>Rate</th><th>Sells for</th></tr>" + "".join(
                f'<tr><td>{ilink(i)}{live(i)}{" <small>(only while on the quest)</small>" if qo else ""}</td><td>{f"{r:g}%" if r is not None else ""}</td><td class="n">{meso(PRICE[i]) if i in PRICE else ""}</td></tr>'
                for i, r, qo in sorted(drops[n], key=lambda x: -(PRICE.get(x[0], 0) * (x[1] or 0)))) + "</table><p class=\"note\">Drop rates are measured by players on the wiki.</p>"
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
        write(out, f"monster/{BSLUG[n]}", page(f"{n} · MapleStory Classic drops, stats and location · Club FM", desc, f"/monster/{BSLUG[n]}/", crumbs, b, f"{OG}monster/{BSLUG[n]}.png" if mb.get("id") else None)); paths.append(f"/monster/{BSLUG[n]}/")

    # ---------------------------------------------------------- quest pages
    def jobs_text(js):
        fam = sorted({JOBNAME.get(j // 100, "") for j in js if j // 100 in JOBNAME} - {""})
        if not js or len(fam) >= 5 or len(js) > 40: return "Every class"
        return ", ".join(fam)
    for q in QS:
        s = QSLUG[q["id"]]
        where_g = npc_at.get(q["g"], [])
        desc = (f"{q['n']}, a level {q['lv']} MapleStory Classic quest from {q['g']}" + (f" in {where_g[0]}" if where_g else "") + ": " +
                (", ".join(f"{c} {i}" for i, c in q.get("need", [])[:3]) or ", ".join(f"hunt {c} {k}" for k, c, *_ in q.get("kill", [])[:2]) or "what to do") +
                (f", rewards {fmt(q['exp'])} EXP" if q.get("exp") else "") + ".")
        b = f'<h1>{E(q["n"])}</h1><p class="sub">MapleStory Classic quest · Level {q["lv"]}+ · {E(q.get("a") or "")}{" · Repeatable" if q.get("rep") else ""}</p>'
        b += '<div class="grid">' + "".join(f"<div><span>{k}</span><b>{v}</b></div>" for k, v in [
            ("Start from", E(q["g"])), ("Level", f"{q['lv']}+"), ("Who can do it", jobs_text(q.get("jobs") or [])),
            ("EXP", fmt(q.get("exp"))), ("Mesos", fmt(q.get("meso"))), ("Fame", fmt(q.get("fame")))] if v not in ("0",)) + "</div>"
        if where_g:
            b += f"<p>{E(q['g'])} stands in {', '.join(mlink(p) for p in where_g[:4])}.</p>"
            gm = next((M[p] for p in where_g if M[p].get("mm")), None)
            if gm:
                np_ = next((n for n in gm.get("npcs") or [] if n[0] == q["g"]), None)
                if np_: b += minimap(gm, spawns=False, hl=(np_[1], np_[2], q["g"] + " is here")) + f'<p class="note">{E(q["g"])} is the green dot{(", " + where(gm, np_[1], np_[2])) if where(gm, np_[1], np_[2]) else ""}, in {E(gm["name"])}.</p>'
        if q.get("pre"):
            pre = [QBYID[i] for i in q["pre"] if i in QBYID]
            if pre: b += "<h2>Finish first</h2><ul>" + "".join(f"<li>{qlink(x)} {('<small>· Lv ' + str(x['lv']) + '+</small>') if x['lv'] else ''}</li>" for x in pre) + "</ul>"
        if q.get("kill"):
            b += "<h2>Hunt</h2><ul>" + "".join(
                f"<li>{blink(k[0])} ×{k[1]:,}" + (f" <small>· found in {', '.join(mlink(p) for p, _ in sorted(homes.get(k[0], []), key=lambda x: -x[1])[:3])}</small>" if homes.get(k[0]) else "") + "</li>" for k in q["kill"]) + "</ul>"
        if q.get("need"):
            rows = ""
            for i, c in q["need"]:
                g = ITEMS.get(i) or {}
                src = ", ".join(f"{blink(d[0])} {d[2]:g}%" if d[2] is not None else blink(d[0]) for d in (g.get("d") or [])[:3])
                rows += f'<tr><td>{ilink(i)}{live(i)}<br><small>{("Dropped by " + src) if src else ""}</small></td><td class="n">×{c:,}</td><td class="n">{meso(PRICE[i] * c) if i in PRICE else ""}</td></tr>'
            b += f"<h2>Bring</h2><table><tr><th>Item</th><th>Need</th><th>Buy it all for</th></tr>{rows}</table>"
        if q.get("get"):
            b += "<h2>Rewards</h2><ul>" + "".join(f"<li>{ilink(i, c)}</li>" for i, c in q["get"]) + ("<li>" + fmt(q["exp"]) + " EXP</li>" if q.get("exp") else "") + ("<li>" + fmt(q["meso"]) + " mesos</li>" if q.get("meso") else "") + "</ul>"
        nx = nextq.get(q["id"], [])
        if nx: b += "<h2>Opens next</h2><ul>" + "".join(f"<li>{qlink(x)} {('<small>· Lv ' + str(x['lv']) + '+</small>') if x['lv'] else ''}</li>" for x in nx) + "</ul>"
        b += f'<p style="margin-top:16px"><a href="/quests.html#q-{q["id"]}">Track it in your Quest Log</a>, which shows what you can take at your level and what to do next.</p><p class="note">Updated {built}.</p>'
        b += BOARD_CTA
        crumbs = [("Quest guides", "/quests/"), (q["n"], f"/quest/{s}/")]
        write(out, f"quest/{s}", page(f"{q['n']} · MapleStory Classic quest guide · Club FM", desc, f"/quest/{s}/", crumbs, b)); paths.append(f"/quest/{s}/")

    # ---------------------------------------------------------- training guides
    brackets = (notes or {}).get("brackets") or []
    def pick_html(sc, p, st, dmg, hit, cost, cls, L, why=""):
        m = M[p]
        mobs = "".join(mobcard(n, f" ×{c}") for n, c in sorted(m["mobs"], key=lambda x: -x[1]) if n in MOB and not MOB[n].get("boss"))
        return (f'<div class="pick"><h3>{mlink(p)}</h3><p class="note">{E(m.get("region") or "")}{" · nearest town " + mlink(m["near"]) if m.get("near") else ""} · {st["n"]} monsters · {st["eph"]:.1f} EXP per 100 HP</p>'
                + (f"<p>{E(why)}</p>" if why else "") + f'<div class="mobs">{mobs}</div>'
                f'<p class="note">A touch from {blink(st["worst"])} hits a level {L} {cls.lower()} in typical gear for about {fmt(dmg)}, landing {round(hit * 100)}% of the time: about {fmt(cost)} mesos of {E(HP[0])} each time. Your own gear changes it.</p></div>')
    tr_links = []
    for br in brackets:
        lo, hi = br["lo"], br["hi"]; L = (lo + min(hi, lo + 15)) // 2
        picks = {x["map"]: x for x in br.get("picks") or []}
        s = f"level-{lo}-{hi}"
        b = f"<h1>Where to train from level {lo} to {hi} in MapleStory Classic</h1><p class=\"sub\">Training guide · every class · updated {built}</p>"
        b += "".join(f'<div class="tip">{E(t)}</div>' for t in br.get("tips") or [])
        b += "<h2>What players recommend</h2>"
        for x in br.get("picks") or []:
            if x["map"] not in M: continue
            st = stats(M[x["map"]])
            if not st: continue
            dmg, hit = touch(MOB[st["worst"]], L, "Bowman")
            b += pick_html(0, x["map"], st, dmg, hit, dmg * hit * HP[1], "Bowman", L, x["why"] + (f" Best for: {', '.join(x['classes'])}." if x.get("classes") else ""))
        b += f"<h2>Best maps by the numbers at level {L}</h2><p>Ranked by EXP for the HP you have to get through, how many monsters the map holds, and what getting hit costs in potions.</p><ol>"
        for sc, p, st, dmg, hit, cost in rank(L, "Bowman", picks)[:10]:
            b += f'<li>{mlink(p)} <small>· {st["eph"]:.1f} EXP per 100 HP · {st["n"]} monsters · about {fmt(cost)} mesos of potions a touch</small></li>'
        b += "</ol><h2>By class</h2><p>" + " · ".join(f'<a href="/training/{c.lower()}/">{c}</a>' for c in CLASSES) + "</p>"
        b += '<p style="margin-top:16px"><a href="/map.html#train">Put in your exact level and class</a> for a personal list, with the route from where you stand.</p>'
        crumbs = [("Training guide", "/training/"), (f"Level {lo} to {hi}", f"/training/{s}/")]
        desc = f"Best MapleStory Classic training spots from level {lo} to {hi}: " + ", ".join(list(picks)[:3]) + ", with monsters, EXP per HP and potion cost for each class."
        write(out, f"training/{s}", page(f"Where to train level {lo} to {hi} · MapleStory Classic training guide · Club FM", desc, f"/training/{s}/", crumbs, b)); paths.append(f"/training/{s}/")
        tr_links.append((lo, hi, s, list(picks)[:3]))
    for cls in CLASSES:
        b = f"<h1>{cls} training guide for MapleStory Classic</h1><p class=\"sub\">Where a {cls.lower()} should train at every level · updated {built}</p>"
        b += f"<p>The top maps for a {cls.lower()} at each stage, ranked by EXP for the HP you chew through, monster count, and what getting hit costs a {cls.lower()} in typical gear. Spots players recommend for {cls}s get a boost.</p>"
        for br in brackets:
            lo, hi = br["lo"], br["hi"]; L = (lo + min(hi, lo + 15)) // 2
            picks = {x["map"]: x for x in br.get("picks") or [] if not x.get("classes") or cls in x["classes"]}
            b += f'<h2>Level {lo} to {hi}</h2>'
            for sc, p, st, dmg, hit, cost in rank(L, cls, picks)[:3]:
                b += pick_html(sc, p, st, dmg, hit, cost, cls, L, picks[p]["why"] if p in picks else "")
            b += f'<p class="note"><a href="/training/level-{lo}-{hi}/">All of level {lo} to {hi}</a></p>'
        crumbs = [("Training guide", "/training/"), (cls, f"/training/{cls.lower()}/")]
        write(out, f"training/{cls.lower()}", page(f"{cls} training guide · where to train at every level · MapleStory Classic · Club FM",
                                                    f"Where a {cls} should train in MapleStory Classic from level 1 to 100: the best maps at each level with monsters, EXP per HP and potion cost.", f"/training/{cls.lower()}/", crumbs, b))
        paths.append(f"/training/{cls.lower()}/")

    # ---------------------------------------------------------- hubs
    b = "<h1>MapleStory Classic training guide</h1><p class=\"sub\">Where to train at every level, for every class · updated " + built + "</p>"
    b += "<p>Built from the game's own monster and spawn data and what players report, re-checked every week. Every spot shows the monsters, EXP for the HP you have to chew through, and what getting hit costs in potions at today's Free Market prices.</p>"
    b += "<h2>By level</h2><ul>" + "".join(f'<li><a href="/training/{s}/">Level {lo} to {hi}</a> <small>· {E(", ".join(p))}</small></li>' for lo, hi, s, p in tr_links) + "</ul>"
    b += "<h2>By class</h2><ul>" + "".join(f'<li><a href="/training/{c.lower()}/">{c}</a></li>' for c in CLASSES) + "</ul>"
    if notes and notes.get("economy"): b += "<h2>Potions and money</h2><ul>" + "".join(f"<li>{E(t)}</li>" for t in notes["economy"]) + "</ul>"
    if notes and notes.get("party"): b += "<h2>Party play</h2><ul>" + "".join(f"<li>{E(t)}</li>" for t in notes["party"]) + "</ul>"
    b += '<p style="margin-top:16px"><a href="/map.html#train">Your level, your class: get a personal list</a></p>'
    write(out, "training", page("MapleStory Classic training guide · where to train at every level · Club FM", "Where to train in MapleStory Classic at every level and for every class: the best maps, monsters, EXP per HP and potion costs, updated daily.", "/training/", [("Training guide", "/training/")], b)); paths.append("/training/")

    regions = {}
    for p, m in M.items(): regions.setdefault(m.get("region") or "Other", []).append(p)
    b = "<h1>MapleStory Classic maps</h1><p class=\"sub\">" + f"{len(M)} maps with minimaps, hidden portals, monsters and exits · updated {built}</p>"
    hidc = sum(1 for m in M.values() for x in m["portals"] if x[1] == "hidden")
    b += f"<p>Every map in MapleStory Classic World with its in-game minimap. {hidc} hidden portals are marked, so you know where to press up when nothing glows. Need directions? <a href=\"/map.html#train\">The route finder</a> gives you the fastest way and the free way.</p>"
    for r in sorted(regions, key=lambda r: -len(regions[r])):
        b += f"<h2>{E(r)} <small>{len(regions[r])}</small></h2><ul class=\"toc\">" + "".join(
            f'<li>{mlink(p)}{" <small>· Lv " + str(M[p]["lv"][0]) + "+</small>" if M[p].get("lv") and M[p]["lv"][0] else ""}</li>' for p in sorted(regions[r])) + "</ul>"
    write(out, "maps", page("All MapleStory Classic maps · minimaps, hidden portals and monsters · Club FM", f"Every MapleStory Classic map: in-game minimaps, {hidc} hidden portals, monsters, NPCs and exits.", "/maps/", [("Maps", "/maps/")], b)); paths.append("/maps/")

    mons = sorted([n for n in MOB if f"/monster/{BSLUG[n]}/" in paths], key=lambda n: (MOB[n]["lv"], n))
    b = f"<h1>MapleStory Classic monsters</h1><p class=\"sub\">{len(mons)} monsters with stats, drops and where to find them · updated {built}</p><div class=\"mobs\">" + "".join(mobcard(n) for n in mons) + "</div>"
    write(out, "monsters", page("All MapleStory Classic monsters · drops, stats and locations · Club FM", "Every MapleStory Classic monster: level, HP, EXP, drops with rates and Free Market value, and the maps they spawn on.", "/monsters/", [("Monsters", "/monsters/")], b)); paths.append("/monsters/")

    areas = {}
    for q in QS: areas.setdefault(q.get("a") or "Other", []).append(q)
    b = f"<h1>MapleStory Classic quests</h1><p class=\"sub\">{len(QS)} quests with what to bring, what to hunt and the rewards · updated {built}</p>"
    b += '<p>Want the ones open at your level? <a href="/quests.html">The Quest Log</a> reads your level from classicrank.com and tracks what you have done.</p>'
    for a in sorted(areas, key=lambda a: -len(areas[a])):
        b += f"<h2>{E(a)} <small>{len(areas[a])}</small></h2><ul class=\"toc\">" + "".join(f"<li>{qlink(q)} {('<small>· Lv ' + str(q['lv']) + '</small>') if q['lv'] else ''}</li>" for q in sorted(areas[a], key=lambda q: (q["lv"], q["n"]))) + "</ul>"
    write(out, "quests", page("All MapleStory Classic quests · items, monsters and rewards · Club FM", "Every MapleStory Classic quest: level, who gives it, the items to bring, monsters to hunt and the rewards.", "/quests/", [("Quest guides", "/quests/")], b)); paths.append("/quests/")

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
        mobs_out[n] = [mb["id"], mb.get("lv") or 0, BSLUG[n], best[0] if best else "", MSLUG.get(best[0], "") if best else ""]
    os.makedirs(os.path.join(out, "data"), exist_ok=True)
    json.dump(mobs_out, open(os.path.join(out, "data", "mobs.json"), "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    return paths, QSLUG, BSLUG, MSLUG


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    w, g, s, n, out = sys.argv[1:6]
    ld = lambda p, d: json.load(open(p, encoding="utf-8")) if os.path.exists(p) else d
    paths = build(ld(w, {}), ld(g, {}), ld(s, {}), ld(n, {}), out)[0]
    print(len(paths), "world pages")
