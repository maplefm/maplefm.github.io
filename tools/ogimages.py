"""Share images: one 1200x630 card per item page with its icon and today's typical price, and one for the weekly recap,
so a link pasted in Discord, Reddit or Twitch chat shows the price at a glance.

  python tools/ogimages.py SUMMARY.json OUT_DIR [RECAP.json]

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
    if r.get("hi", 0) > r.get("lo", 0) and itempages.meso(r["lo"]) != itempages.meso(r["hi"]):
        d.text((380, y + 214), f"Most sales between {itempages.meso(r['lo'])} and {itempages.meso(r['hi'])}", font=F("s", 32), fill=(205, 190, 245))
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
    json.dump(state, open(state_p, "w"), separators=(",", ":"))
    print(n, "share images drawn")


if __name__ == "__main__":
    main()
