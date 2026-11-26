#!/usr/bin/env python3
"""The Stars page (/items/stars/): every throwing star, and the arrows for bows and crossbows, in the build guides'
game window look. Attack, set size and level come from the game files (builds/data/ammo.json, written by the Skill
icons GitHub job from maplestory.io); NPC shops from the item guide; FM prices from the board, refreshed live in the
page. Nothing here recommends buying stars past the NPC ones.
    python3 builds/tools/starspage.py
"""
import json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import worldpages as W  # noqa: E402
sys.path.insert(0, HERE)
import gwpage as G  # noqa: E402

E = G.E


def mesos(v):
    if v is None: return None
    if v >= 1e6: return f"{v / 1e6:.1f}M".replace(".0M", "M")
    if v >= 1e5: return f"{round(v / 1000):,}K"
    return f"{round(v):,}" if v >= 10 else f"{v:g}"


CSS = G.CSS + r"""
.st-hero{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:end;margin:4px 0 14px}.st-hero h1{margin:0;font-size:clamp(26px,4vw,36px)}.st-hero p{margin:4px 0 0;color:var(--muted);max-width:640px}
.stt{width:100%;border-collapse:collapse;font-size:14px}
.gw .stt th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9fb0e8;padding:8px;border-bottom:1px solid rgba(255,255,255,.15);white-space:nowrap}
.gw .stt td{padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:middle;color:#eef2ff;text-align:left}
.stt .snm{display:flex;align-items:center;gap:10px;font-weight:700;white-space:nowrap}.gw .stt td.sit{min-width:280px}.stt .snm img{width:32px;height:32px;image-rendering:pixelated;flex:none}
.stt .snm small{display:block;font-weight:500;color:#9fb0e8}
.stt .atk{font-weight:900;color:#fde047;font-size:16px}.stt small{color:#9fb0e8}
.stt .npc{color:#eef2ff}.stt .none{color:#9fb0e8}
.stt tr.lux td{background:rgba(245,158,11,.06)}
.pill{display:inline-block;font-size:10px;font-weight:900;letter-spacing:.06em;border-radius:5px;padding:2px 6px;margin-left:6px;vertical-align:middle}
.pill.buy{background:#34d399;color:#06281c}.pill.lux{background:#f8d977;color:#3b2a06}
.note{display:flex;gap:12px;align-items:flex-start}.gw .note p{color:#dbe2ff;font-size:15px;line-height:1.55}.note b{color:#fde047}
.stw{overflow-x:auto}
@media(max-width:1000px){.gw .stt td.sit{min-width:0}.stt .snm{white-space:normal}.stt,.stt tbody,.stt tr,.stt td{display:block;width:auto}.stt tr:first-child{display:none}
.stt tr{border-bottom:1px solid rgba(255,255,255,.12);padding:10px 0;display:grid;grid-template-columns:repeat(3,auto);gap:6px 14px;justify-content:start}
.gw .stt td{border:0;padding:0}.stt td.sit{grid-column:1/-1}.stt td[data-l="NPC"],.stt td[data-l="Free Market"]{grid-column:1/-1}
.stt tr.lux{background:rgba(245,158,11,.06)}.stt tr.lux td{background:none}.stt td[data-l]:before{content:attr(data-l);display:block;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9fb0e8}}
"""


def build():
    ammo = json.load(open(os.path.join(ROOT, "builds", "data", "ammo.json")))
    guide = G.load("itemguide.json")["items"]
    rows = {r["item"]: r for r in json.loads(urllib.request.urlopen(G.LIVE + "summary-public.json", timeout=60).read())["rows"]}

    def shops(n):
        home = "Henesys" if "Arrow" in n else "Kerning City"   # archers start in Henesys, thieves in Kerning City
        return sorted({(s[0], s[1], s[2]) for s in (guide.get(n) or {}).get("s", []) if s[2]}, key=lambda s: (s[2], s[1] != home, s[0]))

    def fm(n):
        r = rows.get(n) or {}
        if not r.get("typ"): return None
        sales = r.get("salesN") or 0
        from_asks = (r.get("basis") or "").startswith("ask") or sales < 3
        per = 1000 if "Arrow" in n else 1   # arrows trade in bundles; a price for one arrow reads as nonsense
        return {"shown": mesos(r["typ"] * per) + (" per 1,000" if per > 1 else ""), "v": r["typ"], "sales": sales, "asks": from_asks, "flags": r.get("flags") or []}

    def table(kind, unit):
        out = []
        for n, a in ammo.items():
            if a["kind"] != kind: continue
            sh, f = shops(n), fm(n)
            slug = W.slug(n)
            link = os.path.exists(os.path.join(ROOT, "item", slug, "index.html"))
            nl = G.npc_link(sh[0][0]) if sh else ""
            npc = (f'<span class="npc">{("<a href=" + chr(34) + nl + chr(34) + ">" + E(sh[0][0]) + "</a>") if nl else E(sh[0][0])}, {E(sh[0][1])}<br><b>{mesos(sh[0][2] * (1000 if unit == "each" else 1))}</b> {"per 1,000" if unit == "each" else unit}</span>'
                   + (f'<br><small>also {len(sh) - 1} more NPC{"s" if len(sh) > 2 else ""}</small>' if len(sh) > 1 else "")) if sh else '<span class="none">not sold by NPCs</span>'
            if f:
                note = "asking prices only" if not f["sales"] else f'{f["sales"]} sale{"s" if f["sales"] != 1 else ""} seen' + (", mostly asking prices" if f["asks"] else "")
                if sh and f["v"] > sh[0][2] and "Arrow" not in n: note += ", the NPC is cheaper"
                if any("bundle" in x for x in f["flags"]): note += ", bundle sizes vary"
                live = "" if "Arrow" in n else f' data-fmi="{E(n)}"'   # the live swap would show the price of one arrow
                fmh = f'<span{live}><b class="mz">{E(f["shown"])}</b></span><br><small>{note}</small>'
            else:
                fmh = '<span class="none">not seen on the FM yet</span>'
            lux = kind == "Claw" and not sh
            name = f'<img src="/i/{a["id"]}.png" alt="" width="32" height="32"><span>{E(n)}' + (
                '<span class="pill buy">NPC</span>' if sh else '<span class="pill lux">Luxury</span>' if lux else "") + "</span>"
            name = f'<a class="snm" href="/item/{slug}/">{name}</a>' if link else f'<span class="snm">{name}</span>'
            out.append((lux, f'<tr class="{"lux" if lux else ""}"><td class="sit">{name}</td><td class="atk" data-l="Attack">+{a["atk"]}</td><td data-l="Set size">{a["slotMax"]:,}</td>'
                             f'<td data-l="Level">{a.get("reqLevel") or "any"}</td><td data-l="NPC">{npc}</td><td data-l="Free Market">{fmh}</td></tr>'))
        head = '<div class="stw"><table class="stt"><tr><th>Item</th><th>Attack</th><th>Set size</th><th>Level</th><th>NPC</th><th>Free Market</th></tr>'
        return head + "".join(r for _, r in out) + "</table></div>"

    def price_of(n):
        f = fm(n); return f["shown"] if f else None
    stars = [n for n, a in ammo.items() if a["kind"] == "Claw"]
    npc_stars = [n for n in stars if shops(n)]
    lux = [n for n in stars if not shops(n) and fm(n)]
    lux_txt = ", ".join(f"{n.split()[0]} about {price_of(n)}" + (" from asking prices" if fm(n)["sales"] < 3 else "") for n in lux)
    first = shops(npc_stars[0])[0] if npc_stars else None

    body = (f'<style>{CSS}</style><div class="gw"><div class="st-hero"><div><h1>Throwing stars and arrows</h1>'
            '<p>Every star, and the arrows for bows and crossbows, with attack, set size, where an NPC sells them and what they go for on the Free Market.</p></div></div>'
            '<div class="win"><h2>What to buy</h2><div class="in note"><div>'
            + (f'<p style="margin:0 0 8px">Buy {" and ".join(n.split()[0] for n in npc_stars)} from an NPC and recharge them there. {E(first[0])} in {E(first[1])} sells Subi for {mesos(first[2])} a set.</p>' if first else "")
            + f'<p style="margin:0">Everything past that comes from drops and the Free Market, and the price climbs fast: {E(lux_txt)}. They\'re a luxury for bossing or endgame, not part of any build, and no Club FM guide tells you to buy them.</p>'
            '</div></div></div>'
            '<div class="win"><h2>Throwing stars</h2><div class="in">' + table("Claw", "a set") + '<div class="wtip">Attack is added to your claw\'s attack while you throw. Set size is how many stars one set holds. FM prices are typical prices from scanned shops and update when the page opens.</div></div></div>'
            '<div class="win"><h2>Arrows for bows</h2><div class="in">' + table("Bow", "each") + "</div></div>"
            '<div class="win"><h2>Arrows for crossbows</h2><div class="in">' + table("Crossbow", "each") + "</div></div>"
            '<div class="win"><h2>Build guides that use them</h2><div class="in"><div class="cmp"><a href="/builds/assassin/"><b>Assassin</b><small>Lucky Seven with a claw, all the way to 70</small><div class="go">Open the guide →</div></a><a href="/builds/sindit/"><b>Sindit</b><small>Lucky Seven to 39, then a dagger</small><div class="go">Open the guide →</div></a><a href="/builds/hunter/"><b>Hunter</b><small>Arrows for bows</small><div class="go">Open the guide →</div></a></div></div></div>'
            '</div><script src="/assets/fmprice.js?v=2" defer></script>')
    title = "Throwing Star and Arrow Prices | MapleStory Classic"
    desc = "Every MapleStory Classic throwing star and arrow: attack, set size, which NPC sells it and today's Free Market price."
    assert len(title) < 60 and len(desc) < 155
    text = W.page(title, desc, "/items/stars/", [("All items", "/items/"), ("Stars and arrows", "/items/stars/")], body)
    # it lives under Prices, not Training: take the menu from an existing items page and point the trail at Prices
    ref = open(os.path.join(ROOT, "items", "index.html"), encoding="utf-8").read()
    nav = lambda t: re.search(r"<nav class=\"sitenav.*?<!--/nav-->", t, re.S)
    if nav(ref) and nav(text):
        text = text[:nav(text).start()] + nav(ref).group(0) + text[nav(text).end():]
    text = text.replace('<a href="/map.html">Training</a> <i>›</i> ', '<a href="/">Prices</a> <i>›</i> ', 1)
    text = text.replace('<div class="card">', '<div class="card wide">', 1)   # use the full width on desktop
    W.write(ROOT, "/items/stars/", text)
    return lux_txt


if __name__ == "__main__":
    print("wrote /items/stars/ |", build())
