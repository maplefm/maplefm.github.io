"""Share images: one 1200x630 card per item page with its icon and today's typical price, and one for the weekly recap,
so a link pasted in Discord, Reddit or Twitch chat shows the price at a glance.

  python tools/ogimages.py SUMMARY.json OUT_DIR [RECAP.json] [WORLD.json]

Writes OUT_DIR/og/<slug>.png. An image is only redrawn when what it shows changes, so the data branch isn't rewritten daily.
Icons are cached in OUT_DIR/og/icon/<id>.png.
"""
import json, os, sys, io, urllib.request, time
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import itempages

HERE = os.path.dirname(os.path.abspath(__file__))
F = lambda w, s: ImageFont.truetype(os.path.join(HERE, "fonts", "Inter-ExtraBold.otf" if w == "b" else "Inter-SemiBold.otf"), s)
LOGO = os.path.join(HERE, "..", "assets", "superstar@4x.png")
W, H = 1200, 630


def bg():
    im = Image.new("RGB", (W, H)); d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H; d.line([(0, y), (W, y)], fill=(int(34 + 40 * t), int(24 + 14 * t), int(61 + 120 * t)))
    return im


def wrap(d, text, font, width, lines=2):
    words, out, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=font) <= width: cur = t
        else:
            out.append(cur); cur = w
    out.append(cur); out = [x for x in out if x]
    if len(out) > lines: out = out[:lines]; out[-1] = out[-1].rstrip(".") + "…"
    return out


def footer(im, d):
    try:
        lg = Image.open(LOGO).convert("RGBA"); lg = lg.resize((int(lg.width * 56 / lg.height), 56), Image.NEAREST); im.paste(lg, (60, H - 92), lg)
    except Exception: pass
    d.text((130, H - 84), "Club FM", font=F("b", 38), fill="white")
    d.text((W - 60, H - 78), "maplefm.gg · MapleStory Classic", font=F("s", 28), fill=(220, 205, 255), anchor="ra")


def icon(iid, cache):
    p = os.path.join(cache, f"{iid}.png")
    if not os.path.exists(p):
        try:
            raw = urllib.request.urlopen(urllib.request.Request(f"https://maplestory.io/api/MCW/1/item/{iid}/icon", headers={"User-Agent": "maplefm.gg share images"}), timeout=30).read()
            Image.open(io.BytesIO(raw)); open(p, "wb").write(raw); time.sleep(0.05)
        except Exception:
            return None
    try: return Image.open(p).convert("RGBA")
    except Exception: return None


def item_card(name, r, ic):
    im = bg(); d = ImageDraw.Draw(im)
    d.rounded_rectangle((60, 110, 340, 390), 36, fill=(58, 42, 105), outline=(170, 140, 255), width=4)
    if ic:
        k = max(1, min(240 // max(ic.width, 1), 240 // max(ic.height, 1))); big = ic.resize((ic.width * k, ic.height * k), Image.NEAREST)
        im.paste(big, (200 - big.width // 2, 250 - big.height // 2), big)
    nm = itempages.shown(name); f = F("b", 64)
    lines = wrap(d, nm, f, 780)
    if len(lines) > 1 or d.textlength(nm, font=f) > 780: f = F("b", 54); lines = wrap(d, nm, f, 780)
    y = 100 if len(lines) == 1 else 70
    for ln in lines: d.text((380, y), ln, font=f, fill="white"); y += f.size + 10
    d.text((380, y + 14), "Typical Free Market price", font=F("s", 30), fill=(205, 190, 245))
    price = itempages.full(r["typ"]) + " mesos"
    d.text((380, y + 56), price, font=F("b", 84), fill=(255, 211, 77))
    mv = (r.get("mv") or [None])[0]; sub = f"{r.get('salesN') or 0:,} sales seen"
    if isinstance(mv, (int, float)) and abs(mv) >= 0.01:
        d.text((380, y + 160), ("▲ " if mv > 0 else "▼ ") + f"{abs(round(mv * 100))}% in 24h", font=F("b", 34), fill=(90, 230, 160) if mv > 0 else (255, 130, 115))
        sub = "   " + sub; d.text((380 + d.textlength(("▲ " if mv > 0 else "▼ ") + f"{abs(round(mv * 100))}% in 24h", font=F("b", 34)), y + 162), sub, font=F("s", 32), fill=(205, 190, 245))
    else:
        d.text((380, y + 162), sub, font=F("s", 32), fill=(205, 190, 245))
    more = []
    if r.get("last3"): more.append(f"Last 3 sales avg {itempages.meso(r['last3'])}")
    if r.get("hi", 0) > r.get("lo", 0) and itempages.meso(r["lo"]) != itempages.meso(r["hi"]):
        more.append(f"most {itempages.meso(r['lo'])} to {itempages.meso(r['hi'])}" if more else f"Most sales between {itempages.meso(r['lo'])} and {itempages.meso(r['hi'])}")
    if more: d.text((380, y + 214), " · ".join(more), font=F("s", 32), fill=(205, 190, 245))
    r1 = r.get("r1")
    if r1 and y + 266 < 520: d.text((380, y + 262), f"{itempages.roll_words(r1)} sold around {itempages.meso(r1[1])}", font=F("b", 32), fill=(255, 211, 77))
    footer(im, d)
    return im


def recap_card(rc):
    im = bg(); d = ImageDraw.Draw(im)
    d.text((60, 56), "This week on the Free Market", font=F("b", 58), fill="white")
    d.text((60, 128), rc.get("range", ""), font=F("s", 32), fill=(205, 190, 245))
    y = 190
    for label, rows, col in (("Up", rc.get("up", [])[:3], (90, 230, 160)), ("Down", rc.get("down", [])[:3], (255, 130, 115))):
        for x in rows:
            t = f"{'▲' if label == 'Up' else '▼'} {abs(round(x['chg'] * 100))}%"
            d.text((60, y), t, font=F("b", 36), fill=col)
            nm = wrap(d, itempages.shown(x["item"]), F("s", 36), 640, 1)[0]
            d.text((230, y), nm, font=F("s", 36), fill="white")
            d.text((W - 60, y), itempages.meso(x["now"]), font=F("b", 36), fill=(255, 211, 77), anchor="ra")
            y += 54
        y += 10
    footer(im, d)
    return im


def paste_fit(im, src, box, scale_up=True):
    """put src inside box (x0, y0, x1, y1), centred, pixel art kept sharp"""
    x0, y0, x1, y1 = box; bw, bh = x1 - x0, y1 - y0
    k = min(bw / src.width, bh / src.height)
    if not scale_up: k = min(k, 1)
    k = max(1, int(k)) if k >= 1 else k
    nw, nh = max(1, int(src.width * k)), max(1, int(src.height * k))
    sm = src.resize((nw, nh), Image.NEAREST if k >= 1 else Image.LANCZOS)
    ox, oy = x0 + (bw - nw) // 2, y0 + (bh - nh) // 2
    im.paste(sm, (ox, oy), sm if sm.mode == "RGBA" else None)
    return ox, oy, nw / src.width


def map_card(name, m, mm_img):
    im = bg(); d = ImageDraw.Draw(im)
    d.text((60, 52), wrap(d, name, F("b", 60), 1080, 1)[0], font=F("b", 60), fill="white")
    lv = m.get("lv") or [None, None]; hid = sum(1 for p in m.get("portals", []) if p[1] == "hidden")
    sub = " · ".join(x for x in [m.get("region") or "", (f"Level {lv[0]}–{lv[1]}" if lv[0] and lv[1] else ""), (f"{hid} hidden portal" + ("s" if hid != 1 else "")) if hid else "", f"{len(m.get('portals', []))} exits"] if x)
    d.text((60, 128), sub, font=F("s", 32), fill=(205, 190, 245))
    if mm_img:
        d.rounded_rectangle((60, 186, W - 60, H - 112), 24, fill=(12, 18, 32))
        ox, oy, k = paste_fit(im, mm_img.convert("RGBA"), (76, 200, W - 76, H - 126))
        mm = m["mm"]; sc = 2 ** mm[2]
        for p in m.get("portals", []):
            x, y = ox + (p[2] + mm[0]) / sc * k, oy + (p[3] + mm[1]) / sc * k
            if p[1] == "hidden": d.polygon([(x, y - 13), (x + 13, y), (x, y + 13), (x - 13, y)], fill=(180, 92, 255), outline="white", width=3)
            else: d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(79, 195, 255), outline="white", width=3)
    footer(im, d); return im


def mob_card(name, mb, sp_img, where):
    im = bg(); d = ImageDraw.Draw(im)
    d.rounded_rectangle((60, 90, 400, 430), 36, fill=(58, 42, 105), outline=(170, 140, 255), width=4)
    if sp_img: paste_fit(im, sp_img.convert("RGBA"), (80, 110, 380, 410))
    d.text((440, 90), wrap(d, name, F("b", 64), 700, 1)[0], font=F("b", 64), fill="white")
    d.text((440, 172), f"Level {mb['lv']} monster" + (" · Undead" if mb.get("undead") else ""), font=F("s", 32), fill=(205, 190, 245))
    y = 236
    for k, v in (("HP", f"{mb['hp']:,}"), ("EXP", f"{mb['exp']:,}"), ("Weak to", mb.get("weak") or "Nothing")):
        d.text((440, y), k, font=F("s", 30), fill=(205, 190, 245)); d.text((620, y), v, font=F("b", 34), fill=(255, 211, 77)); y += 52
    if where: d.text((440, y + 10), wrap(d, "Found in " + where, F("s", 28), 700, 2)[0], font=F("s", 28), fill="white")
    footer(im, d); return im


def world_cards(world, live_dir, out, state):
    sys.path.insert(0, HERE); import worldpages
    n = 0; os.makedirs(os.path.join(out, "map"), exist_ok=True); os.makedirs(os.path.join(out, "monster"), exist_ok=True)
    for p, m in world.get("maps", {}).items():
        s = worldpages.slug(p); key = "m|" + json.dumps([m.get("mm"), m.get("lv"), len(m.get("portals", [])), sum(1 for x in m.get("portals", []) if x[1] == "hidden")])
        path = os.path.join(out, "map", s + ".png")
        if state.get("map:" + s) == key and os.path.exists(path): continue
        mi = None; mp = os.path.join(live_dir, "data", "minimap", f"{m['id']}.png")
        if m.get("mm") and os.path.exists(mp):
            try: mi = Image.open(mp)
            except Exception: mi = None
        save(map_card(p, m, mi), path); state["map:" + s] = key; n += 1
    homes = {}
    for p, m in world.get("maps", {}).items():
        for nm, c in m.get("mobs", []): homes.setdefault(nm, []).append((c, p))
    for nm, mb in world.get("mobs", {}).items():
        if not mb.get("id"): continue
        s = worldpages.slug(nm); path = os.path.join(out, "monster", s + ".png")
        where = ", ".join(p for _, p in sorted(homes.get(nm, []), reverse=True)[:2])
        key = "b|" + json.dumps([mb.get("lv"), mb.get("hp"), mb.get("exp"), mb.get("weak"), where])
        if state.get("mob:" + s) == key and os.path.exists(path): continue
        si = None; sp = os.path.join(live_dir, "data", "sprite", f"{mb['id']}.gif")
        if os.path.exists(sp):
            try: si = Image.open(sp); si.seek(0)
            except Exception: si = None
        save(mob_card(nm, mb, si, where), path); state["mob:" + s] = key; n += 1
    return n


def save(im, path):
    im = im.convert("P", palette=Image.ADAPTIVE, colors=256)
    im.save(path, optimize=True)


def main():
    summ = json.load(open(sys.argv[1], encoding="utf-8")); out = os.path.join(sys.argv[2], "og"); cache = os.path.join(out, "icon")
    os.makedirs(cache, exist_ok=True)
    ids = {r[0]: r[1] for r in json.load(open(os.path.join(HERE, "..", "data", "itemdb.json")))["items"]}
    state_p = os.path.join(out, "state.json")
    try: state = json.load(open(state_p))
    except Exception: state = {}
    n = 0
    for r in summ.get("rows") or []:
        if not isinstance(r, dict) or r.get("item") not in ids or (r.get("n") or 0) < 5 or not r.get("typ"): continue
        s = itempages.slug(r["item"]); mv = (r.get("mv") or [None])[0]
        key = f"{itempages.full(r['typ'])}|{round(mv * 100) if isinstance(mv, (int, float)) and abs(mv) >= 0.01 else 0}|{r.get('salesN') or 0}"
        if state.get(s) == key and os.path.exists(os.path.join(out, s + ".png")): continue
        save(item_card(r["item"], r, icon(ids[r["item"]], cache)), os.path.join(out, s + ".png")); state[s] = key; n += 1
    if len(sys.argv) > 3 and os.path.exists(sys.argv[3]):
        rc = json.load(open(sys.argv[3], encoding="utf-8"))
        key = json.dumps([rc.get("range"), rc.get("up", [])[:3], rc.get("down", [])[:3]])
        if state.get("_recap") != key: save(recap_card(rc), os.path.join(out, "recap.png")); state["_recap"] = key; n += 1
    if len(sys.argv) > 4 and os.path.exists(sys.argv[4]):
        n += world_cards(json.load(open(sys.argv[4], encoding="utf-8")), sys.argv[2], out, state)
    json.dump(state, open(state_p, "w"), separators=(",", ":"))
    print(n, "share images drawn")


if __name__ == "__main__":
    main()
