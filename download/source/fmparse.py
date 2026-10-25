"""Turn game screen crops into price rows. No Windows-only code in this file."""
import re, json, os, time, difflib
from PIL import Image, ImageChops, ImageOps
from ocrlib import min_channel, ocr_lines

HERE = os.path.dirname(os.path.abspath(__file__))
_d = json.load(open(os.path.join(HERE, "items.json"), encoding="utf-8"))
ITEMS = list(_d["items"])
ALIASES = _d["aliases"]

def norm(s):
    return re.sub(r"[^a-z0-9]+", "", s.lower())

_ITEM_NORM = {norm(n): n for n in ITEMS}

# ---------------------------------------------------------------- names

# Every tiered scroll in MapleStory Classic World (from the maplestory.io MCW item list).
SCROLL_BASES = ["Bottomwear DEF Scroll", "Bottomwear HP Scroll", "Bottomwear MP Scroll", "Bow Attack Scroll", "Cape Accuracy Scroll", "Cape DEX Scroll", "Cape INT Scroll", "Cape LUK Scroll", "Cape Magic Def. Scroll", "Cape STR Scroll", "Cape Weapon Def. Scroll", "Claw Attack Scroll", "Crossbow Attack Scroll", "Dagger Attack Scroll", "Earring Crit. Damage Scroll", "Earring DEX Scroll", "Earring Evasion Scroll", "Earring INT Scroll", "Earring LUK Scroll", "Earring STR Scroll", "Gloves Accuracy Scroll", "Gloves Attack Scroll", "Gloves Crit. Rate Scroll", "Gloves Magic Attack Scroll", "Hat Accuracy Scroll", "Hat HP Scroll", "Hat MP Scroll", "One-Handed Axe Attack Scroll", "One-Handed Blunt Weapon Attack Scroll", "One-Handed Sword Attack Scroll", "Overall Armor DEF Scroll", "Overall Armor DEX Scroll", "Overall Armor INT Scroll", "Overall Armor LUK Scroll", "Overall Armor STR Scroll", "Pet Equip Jump Scroll", "Pet Equip Speed Scroll", "Polearm Attack Scroll", "Shield Accuracy Scroll", "Shield DEF Scroll", "Shoes Evasion Scroll", "Shoes Jump Scroll", "Shoes Speed Scroll", "Spear Attack Scroll", "Staff Magic Attack Scroll", "Topwear DEF Scroll", "Topwear HP Scroll", "Topwear MP Scroll", "Two-handed Axe Attack Scroll", "Two-handed Blunt Weapon Attack Scroll", "Two-handed Sword Attack Scroll", "Wand Magic Attack Scroll"]
_SB_NORM = {norm(b): b for b in SCROLL_BASES}

def snap_scroll_base(base):
    """'Statt Magic Attack Scroll' -> 'Staff Magic Attack Scroll'. Unknown bases come back unchanged."""
    n = norm(base)
    if n in _SB_NORM:
        return _SB_NORM[n]
    best = difflib.get_close_matches(n, list(_SB_NORM), n=2, cutoff=0.8)
    if best:
        r0 = difflib.SequenceMatcher(None, n, best[0]).ratio()
        r1 = difflib.SequenceMatcher(None, n, best[1]).ratio() if len(best) > 1 else 0
        if r0 >= 0.9 or r0 - r1 >= 0.06:
            return _SB_NORM[best[0]]
    return base

TOWNS = ["Ellinia", "Henesys", "Kerning City", "Perion", "Lith Harbor", "Sleepywood", "Nautilus", "Orbis", "El Nath", "Ludibrium"]

def scroll_name(raw):
    """Shop list scroll names get cut off. Return the canonical name or None if not a scroll."""
    m = re.match(r"^(.*?Scroll)\b[:;.,]?\s*(.*)$", raw, re.I)
    if not m:
        m2 = re.match(r"^(.*(?:Attack|Attac|Atta|Att|Weap\w*|Magic\s+A\w*))\s*[._…]+\s*$", raw)
        if m2 and re.search(r"Sword|Axe|Blunt|Dagger|Spear|Pole|Bow|Claw|Wand|Staff|Glove", raw):
            return None  # too cut off to tell even the item type
        return None
    base = re.sub(r"\s+", " ", m.group(1)).strip()
    base = re.sub(r"scroll$", "Scroll", base, flags=re.I)
    if base.lower() != "return scroll":
        base = snap_scroll_base(base)
    if base.lower() == "return scroll" or re.match(r"\s*to\b", m.group(2), re.I):
        # town scrolls are separate items, not tiers
        dest = re.sub(r"^\s*to\b", "", m.group(2), flags=re.I)
        dest = re.sub(r"[^A-Za-z ]", "", dest).strip().lower()
        if len(dest) >= 3:
            hits = [t for t in TOWNS if t.lower().startswith(dest)]
            if len(hits) == 1:
                return f"{base} to {hits[0]}"
        return f"{base} (name cut off)"
    # need at least two letters of the tier word: a lone "I" or "l" is usually the "..." misread,
    # and then the row's icon colour decides the tier instead
    tier = re.sub(r"[^A-Za-z]", "", m.group(2))[:2].lower()
    t = {"le": "Lesser", "in": "Intermediate", "ln": "Intermediate", "gr": "Greater", "su": "Superior"}.get(tier)
    return f"{base}: {t}" if t else f"{base} (tier cut off)"

def _words_agree(a, b):
    """A misread changes a letter or two. A different word (Blue vs Black) is a different item,
    and so is a longer word that starts with the known one (Lemona is not Lemon)."""
    wa, wb = a.split(), b.split()
    if any(len(x) > len(y) and x.startswith(y) for x, y in zip(wa, wb)):
        return False
    if len(wa) != len(wb):
        return difflib.SequenceMatcher(None, a.replace(" ", ""), b.replace(" ", "")).ratio() >= 0.93
    return all(x == y or (len(x) >= 4 and difflib.SequenceMatcher(None, x, y).ratio() >= 0.75) for x, y in zip(wa, wb))

# Items the game added after our item list: learned from their tooltips while scanning ("Painting of Zombie
# Mushmom"), kept in learned_items.json, and matched like any other item from then on.
LEARNED_FILE = os.path.join(HERE, "learned_items.json")
LEARNED = {}
try:
    LEARNED = json.load(open(LEARNED_FILE, encoding="utf-8"))
except (OSError, ValueError):
    LEARNED = {}
for _n in LEARNED: _ITEM_NORM[norm(_n)] = _n

def learn_item(name):
    if norm(name) in _ITEM_NORM: return False
    LEARNED[name] = int(time.time())
    _ITEM_NORM[norm(name)] = name
    try: json.dump(LEARNED, open(LEARNED_FILE, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    except OSError: pass
    return True

def learned_match(core):
    """A misread or cut-off shop name that starts like a learned item ("Painting of Zombie Mu ba")."""
    nc = norm(core)
    if len(nc) < 10: return None
    hits = [n for n in LEARNED if difflib.SequenceMatcher(None, nc, norm(n)[:len(nc)]).ratio() >= 0.85]
    return hits[0] if len(hits) == 1 else None

def tooltip_title(img, prefix):
    """The full name of an item we don't know yet, off its tooltip: the line that starts the way the shop row's
    cut-off name does ("Painting of Zombie Mush..." -> "Painting of Zombie Mushmom"). None when unsure."""
    pw = [w.lower() for w in re.findall(r"[A-Za-z']+", prefix)]
    if len(pw) < 2: return None
    m = min_channel(img)
    g = m.point(lambda v: 255 if v <= 140 else 0 if v >= 215 else int(255 - (v - 140) * 3.4))
    g = g.resize((g.width * 3, g.height * 3), Image.BICUBIC)
    for l in ocr_lines(g, 3, 6):
        words = re.findall(r"[A-Za-z][A-Za-z'-]*", l["text"])
        lw = [w.lower() for w in words]
        for k in range(len(lw)):
            # every whole word of the prefix matches, and its last (maybe cut) word starts the next one
            if lw[k:k + len(pw) - 1] == pw[:-1] and k + len(pw) - 1 < len(lw) and lw[k + len(pw) - 1].startswith(pw[-1][:3]):
                full = words[k:]
                while full and (len(full[-1]) < 3 or full[-1].islower() and len(full) > len(pw)):
                    full = full[:-1]                  # stray letters after the name ("Mushmom re")
                if len(full) >= len(pw) and len(full) <= len(pw) + 3 and len(full[-1]) >= 3:
                    return " ".join(full)
    return None

def clean_item(raw):
    """Snap an OCR'd shop item name to a known item where it is clearly the same one."""
    raw = re.sub(r"^[^A-Za-z0-9\[]+", "", raw).strip()
    raw = re.sub(r"\s+", " ", raw)
    raw = raw.replace("VV", "W").replace("vv", "w")
    raw = raw.replace("Â", "")
    raw = re.sub(r"(^|[\s-])(?:[VY¥][VvWwYy¥]+|v[VvWw]+|W[WwVv]+|¥)(?=[a-z])", r"\1W", raw)   # W read as VW, Vv, YV or a yen sign
    raw = re.sub(r"^\d{1,4}\s+(?=[A-Za-z])", "", raw)   # a stock number from the icon read as part of the name
    cut = bool(re.search(r"(\.\s*\.+|…|_)\s*$", raw))
    core = re.sub(r"[\s._…]+$", "", raw)
    core = re.sub(r"\s[^A-Za-z0-9)]{1,2}$", "", core).strip()
    if len(core) < 3 or not re.search(r"[A-Za-z]{3}", core):
        return None, False
    if re.search(r"scroll", core, re.I):
        s = scroll_name(raw)
        if s:
            return s, True
    n = norm(core)
    if n in _ITEM_NORM:
        return _ITEM_NORM[n], True
    best = difflib.get_close_matches(n, list(_ITEM_NORM), n=2, cutoff=0.78)
    if best:
        r0 = difflib.SequenceMatcher(None, n, best[0]).ratio()
        r1 = difflib.SequenceMatcher(None, n, best[1]).ratio() if len(best) > 1 else 0
        if (r0 >= 0.88 or r0 - r1 >= 0.08) and _words_agree(core.lower(), _ITEM_NORM[best[0]].lower()):
            return _ITEM_NORM[best[0]], True
    if len(n) >= 12:
        # a scroll name cut off before the word Scroll ("One-Handed Blunt Weapon Att...")
        sb = [v for k, v in _SB_NORM.items() if k.startswith(n)]
        if len(sb) == 1:
            return sb[0] + " (tier cut off)", True
    lm = learned_match(core)
    if lm:
        return lm, True
    if cut:
        # a cut-off name that is the start of exactly one known item is that item
        starts = [v for k, v in _ITEM_NORM.items() if k.startswith(n) and len(n) >= 10]
        if len(starts) == 1:
            return starts[0], True
        return core + " (name cut off)", False
    return core, False

# ---------------------------------------------------------------- shop window

# Geometry of the shop list inside the capture region, in screen pixels at the game's native size.
SHOP = {"row0": 150.0, "pitch": 40.4, "rows": 6, "x0": 46, "x1": 208,
        "title": (18, 2, 240, 21), "seller": (10, 125, 106, 149), "plate": (15, 127, 102, 147)}

_PRICE = re.compile(r"(\d[\d,.\s]*)\s*[ft1l][o0]r\s*(\d[\d,.\s]*\d|\d)\s*m[ea]s[o0]s?", re.I)

def _num(s):
    s = re.sub(r"[^\d]", "", s)
    return int(s) if s else None

def _stretch(tile):
    """Normalise one row so its text is black on white. Returns (image, has_text, greyed)."""
    m = min_channel(tile)
    px = sorted(m.getdata())
    fg, bg = px[int(len(px) * 0.01)], px[int(len(px) * 0.80)]
    if bg - fg < 35:
        return None, False, False
    greyed = fg > 118
    lo, hi = fg + (bg - fg) * 0.15, fg + (bg - fg) * 0.80
    k = 255.0 / max(1.0, hi - lo)
    out = m.point(lambda v: 0 if v <= lo else 255 if v >= hi else int((v - lo) * k))
    return out, True, greyed

def looks_like_shop(region):
    """Cheap check: the seller name plate is a dark navy bar at a fixed spot."""
    x0, y0, x1, y1 = SHOP["plate"]
    if region.width < x1 or region.height < y1:
        return False
    px = list(region.crop((x0, y0, x1, y1)).convert("RGB").getdata())
    navy = sum(1 for r, g, b in px if b > r + 20 and b > 70 and r < 110)
    return navy > len(px) * 0.45

_rapid = None
def rapid_lines(img, scale):
    """Second, independent reader (RapidOCR). Returns lines like ocr_lines."""
    global _rapid
    import numpy as np
    if _rapid is None:
        from rapidocr_onnxruntime import RapidOCR
        _rapid = RapidOCR()
    res, _ = _rapid(np.array(img.convert("RGB")))
    out = []
    for box, txt, conf in (res or []):
        ys = [p[1] for p in box]; xs = [p[0] for p in box]
        out.append({"text": txt, "x": min(xs) / scale, "y": min(ys) / scale, "w": (max(xs) - min(xs)) / scale, "h": (max(ys) - min(ys)) / scale})
    out.sort(key=lambda l: (round(l["y"] / 6), l["x"]))
    return out

def _sheet(region):
    S = SHOP
    tiles, meta = [], []
    t = min_channel(region.crop(S["title"])).point(lambda v: 0 if v < 110 else 255)
    tiles.append(t); meta.append(("title", None))
    r, g, b = region.crop(S["seller"]).convert("RGB").split()
    mx = ImageChops.lighter(ImageChops.lighter(r, g), b)
    s = ImageOps.invert(mx).point(lambda v: 0 if v < 70 else 255 if v > 150 else int((v - 70) * 3.19))
    tiles.append(s); meta.append(("seller", None))
    for i in range(S["rows"]):
        y = int(round(S["row0"] + S["pitch"] * i))
        img, has, grey = _stretch(region.crop((S["x0"], y, S["x1"], y + 38)))
        if has:
            tiles.append(img); meta.append(("row", grey, y))
    if len(tiles) <= 2:
        return None
    gap = 16
    W = max(t.width for t in tiles) + 24
    H = sum(t.height + gap for t in tiles) + gap
    sheet = Image.new("L", (W, H), 255)
    spans, y = [], gap
    for t in tiles:
        sheet.paste(t, (12, y)); spans.append((y - gap / 2, y + t.height + gap / 2)); y += t.height + gap
    return sheet, spans, meta

def _bucket(lines, spans):
    per = [[] for _ in spans]
    for l in lines:
        cy = l["y"] + l["h"] / 2
        for i, (a, b) in enumerate(spans):
            if a <= cy < b:
                per[i].append(l); break
    return per

_RPRICE = re.compile(r"(\d[\d,.]*)\s*m[ea]?[s5][o0][s5]?", re.I)

def read_shop_checked(region):
    """Read the shop with two independent engines. Keep a row only when both agree on the price."""
    sh = _sheet(region)
    if not sh:
        return None
    sheet, spans, meta = sh
    W, H = sheet.size
    tl = _bucket(ocr_lines(sheet.resize((W * 4, H * 4), Image.BICUBIC), scale=4), spans)
    rl = _bucket(rapid_lines(sheet.resize((W * 3, H * 3), Image.BICUBIC), 3), spans)
    title = " ".join(l["text"] for l in tl[0]).strip() or " ".join(l["text"] for l in rl[0]).strip()
    seller = re.sub(r"[^A-Za-z0-9]", "", "".join(l["text"] for l in rl[1])) or re.sub(r"[^A-Za-z0-9]", "", "".join(l["text"] for l in tl[1]))
    out = {"title": title, "seller": seller, "rows": [], "dropped": 0}
    for i in range(2, len(spans)):
        tt = [l["text"] for l in tl[i]]; rt = [l["text"] for l in rl[i]]
        tm = None
        for k, line in enumerate(tt):
            tm = _PRICE.search(line)
            if tm:
                tname = " ".join(tt[:k]); break
        rjoin = " ".join(rt)
        rm = None
        for m in _RPRICE.finditer(rjoin):
            rm = m
        if not tm or not rm:
            out["dropped"] += 1; continue
        qty, price, rprice = _num(tm.group(1)), _num(tm.group(2)), _num(rm.group(1))
        if not qty or price is None or price != rprice:
            out["dropped"] += 1; continue
        # The bundle size must agree too: one engine reading "1 for" as "4 for" turns 133,333 into 33,333 each.
        rq = None
        for m in _PRICE.finditer(rjoin):
            if _num(m.group(2)) == price: rq = _num(m.group(1))
        if rq is None:
            if qty != 1:
                out["dropped"] += 1; continue
        elif rq != qty:
            out["dropped"] += 1; continue
        name, known = clean_item(tname)
        if not known:
            rname = re.split(r"\d+\s*[ft1l]?[o0]?r?\s*\d", rjoin)[0]
            n2, k2 = clean_item(rname)
            if k2:
                name, known = n2, True
            elif not name or not n2 or difflib.SequenceMatcher(None, norm(name), norm(n2)).ratio() < 0.8:
                out["dropped"] += 1; continue
        out["rows"].append({"i": name, "p": price, "q": qty, "so": bool(meta[i][1]), "known": known, "y": meta[i][2]})
    return resolve_tiers(region, out)

# ---------------------------------------------------------------- chat

_ALIAS = []
for canon, al in ALIASES.items():
    _ALIAS.append((norm(canon), canon))
    for a in al:
        _ALIAS.append((norm(a), canon))
# every non-cash item name, so trade chat can name any equip, not only the hand-made list above
try:
    _cn = json.load(open(os.path.join(HERE, "chat_names.json"), encoding="utf-8"))
    for _n in _cn.get("names", []): _ALIAS.append((norm(_n), _n))
    for _a, _n in _cn.get("abbr", {}).items(): _ALIAS.append((norm(_a), _n))
except (OSError, ValueError):
    pass
_ALIAS = sorted(set(_ALIAS), key=lambda t: -len(t[0]))

def extend_aliases(names):
    """Every item on the price board, cash items included ("SuperstarHoodie 40k"), learned at run time."""
    global _ALIAS
    have = {k for k, _ in _ALIAS}
    add = [(norm(n), n) for n in names if n and len(norm(n)) >= 5 and norm(n) not in have and ":" not in n
           and "\u2026" not in n and norm(n) not in ("scroll", "scrolls", "coupon", "earring", "earrings")]
    if add:
        _ALIAS = sorted(set(_ALIAS + add), key=lambda t: -len(t[0]))
    return len(add)

_SIDE = re.compile(r"(?<![A-Za-z])(S\s?[>»<]|B\s?[>»<-]|WTS|WTB|Sell(?:ing|in)?\b|Buy(?:ing)?\b|T\s?[>»]|WTT|L\s?[>»]|LF\s?[>»]?)", re.I)
_CPRICE = re.compile(
    r"(?<![A-Za-z0-9.+\-])(\d{1,3}(?:[.,]\d{1,3})?)\s?([kK]|[mM](?:il)?)(?![A-Za-z])(?:\d)?"      # 26k 1.5k 1m 3k5
    r"|(?<![A-Za-z0-9.+\-])(\d{2,3}(?:,\d{3})+|\d{3,6})(?=\s*(?:mesos?|ea\b|each|/e))"            # 250 each, 800mesos
    r"|(?:for|=)\s*(\d{3,6})(?![%\d])", re.I)                                                     # for 6969
_SCROLL_BASES = [
    ("Polearm Attack Scroll", ["polearm", "pole arm"]), ("Claw Attack Scroll", ["claw"]),
    ("Crossbow Attack Scroll", ["crossbow", "xbow"]), ("Dagger Attack Scroll", ["dagger"]),
    ("Spear Attack Scroll", ["spear"]), ("Staff Magic Attack Scroll", ["staff"]),
    ("Wand Magic Attack Scroll", ["wand"]), ("Gloves Magic Attack Scroll", ["glove m", "glove for m", "gma"]),
    ("Earring STR Scroll", ["ear str", "earring 60% str", "earring 10% str", "earring 100% str", "earstr", "earrings str", "earings str", "earring str", "earing str", "erring str", "str earring", "earrings for str", "earring for str"]),
    ("Earring DEX Scroll", ["ear dex", "earring 60% dex", "earring 10% dex", "earring 100% dex", "eardex", "earrings dex", "earings dex", "earring dex", "earing dex", "erring dex", "dex earring", "earringdex"]),
    ("Earring INT Scroll", ["ear int", "earring 60% int", "earring 10% int", "earring 100% int", "earint", "earrings int", "earings int", "earring int", "earing int", "int earring", "earring for int"]),
    ("Earring LUK Scroll", ["ear luk", "earring 60% luk", "earring 10% luk", "earring 100% luk", "earluk", "earrings luk", "earings luk", "earring luk", "earing luk", "earning luk", "earing luck", "earring luck", "luk earring"]),
    ("Hat Accuracy Scroll", ["hat acc", "helm acc"]), ("Cape STR Scroll", ["cape str"]),
    ("Pet Equip Speed Scroll", ["pet equip speed", "pet speed"]), ("Bow Attack Scroll", ["bow"]),
    ("Two-handed Sword Attack Scroll", ["2hsword", "2h sword", "2hs", "two handed sword", "two hand sword", "2 hand sword"]),
]
_TIER = {"10": "Greater", "60": "Intermediate", "100": "Lesser"}

def _price_val(m):
    if m.group(1):
        v = float(m.group(1).replace(",", "."))
        mult = 1000 if m.group(2).lower() == "k" else 1000000
        val = v * mult
        tail = m.group(0)[-1]
        if tail.isdigit() and m.group(2).lower() == "k" and "." not in m.group(1):   # 3k5 -> 3500
            val += int(tail) * 100
        return int(round(val))
    s = m.group(3) or m.group(4)
    return int(s.replace(",", ""))

def _find_items(text):
    """Return [(start, end, canonical)] for known items mentioned in a stretch of chat text."""
    low = text.lower()
    # map from normalised index back to raw index
    idx = [i for i, ch in enumerate(low) if ch.isalnum()]
    n = "".join(low[i] for i in idx)
    taken, found = [False] * len(n), []
    for key, canon in _ALIAS:
        if len(key) < 4:
            continue
        start = 0
        while True:
            j = n.find(key, start)
            if j < 0:
                break
            start = j + 1
            if any(taken[j:j + len(key)]):
                continue
            a, b = idx[j], idx[j + len(key) - 1] + 1
            # whole words only
            if (a > 0 and low[a - 1].isalnum()) or (b < len(low) and low[b].isalpha() and not low[b:b + 1] == "s"):
                continue
            for q in range(j, j + len(key)):
                taken[q] = True
            found.append((a, b, canon))
    # scrolls: a percent plus a known scroll type
    # The scroll a percent belongs to is the one named closest to it, in the same stretch of the message:
    # the window stops at an item link [..], a price, a separator or the next side marker, so a linked
    # [Claw Attack Scroll] after "60% EARRING LUK SCROLL 140K" can never take the earring's price.
    stops = [0, len(low)]
    for sm in re.finditer(r"[\[\]|/;]|\b(?:s|b)\s?[>»<]|\bwt[sb]\b", low): stops.append(sm.start()); stops.append(sm.end())
    for pm in _CPRICE.finditer(text): stops.append(pm.start()); stops.append(pm.end())
    stops.sort()
    for m in re.finditer(r"(?<!\d)(100|60|10)\s?%", low):
        tier = _TIER[m.group(1)]
        seg_a = max([x for x in stops if x <= m.start()] or [0]); seg_b = min([x for x in stops if x >= m.end()] or [len(low)])
        win_a, win_b = max(seg_a, m.start() - 40), min(seg_b, m.end() + 40)
        win = low[win_a:win_b]
        best = None
        for base, keys in _SCROLL_BASES:
            if base == "Bow Attack Scroll" and ("crossbow" in win or "xbow" in win):
                continue
            for kw in keys:
                for km in re.finditer(re.escape(kw), win):
                    p = km.start()
                    if p > 0 and win[p - 1].isalpha():
                        continue
                    pa = win_a + p; dist = m.start() - (pa + len(kw)) if pa < m.start() else pa - m.end()
                    if best is None or dist < best[0]:
                        best = (dist, pa, len(kw), base)
        if best:
            _, pa, kl, base = best
            found.append((min(pa, m.start()), max(m.end(), pa + kl), f"{base}: {tier}"))
    found.sort()
    return found

_BAD_CTX = re.compile(r"\bc\s?/\s?o\b|\bco\b|current offer|\bb/o\b|\bbo\b", re.I)

def parse_chat_message(msg):
    """msg: one chat message (player part removed). Returns [(side, item, price)]."""
    return [r[:3] for r in parse_chat_message_x(msg)]

# only a grade in brackets counts: "(+3)" is a roll, a bare "+7" is usually how many scrolls passed
_GRADE = re.compile(r"\(\s*([+-])\s?(\d{1,2})\s*\)()()"
                    r"|()()(?:(?<=^)|(?<=[\s>/]))([+])\s?(\d{1,2})(?![\d%kKmM.,])"          # "+2 pan lid", "S>+2 wand"
                    r"|()()(?<=[A-Za-z])([+-])(\d{1,2})(?![\d%kKmM.,])")                    # "pan lid+2", "wand-3"
_STATV = re.compile(r"(?<![\d.])(\d{2,3})\s?(m\.?\s?att|matt|magic\s?att(?:ack)?|m\s?atk|w?att(?:ack)?|w?atk)\b|\b(m\.?\s?att|matt|magic\s?att(?:ack)?|w?att|w?atk)\s?:?\s?(\d{2,3})(?![\d%])", re.I)

def chat_roll(text):
    """The roll people write next to an equip: "(+3)", "-3", "55 att", "att65", "56 Magic Attack".
    Returns a dict like {"ATT": 65, "g": 3}, or None. Grade g is how far above or below an average roll."""
    x = {}
    t = re.sub(r"\b(?:lv|lvl|level)\s?\d+", " ", text, flags=re.I)
    g = _GRADE.search(t)
    av = re.search(r"(\d{1,2})\s?(?:[a-z]{2,5}\s?)?(above|over|below|under)\s?(?:the\s)?av(?:g|e|erage)\b", t, re.I)
    if av and int(av.group(1)) <= 15:
        x["g"] = int(av.group(1)) * (1 if av.group(2).lower() in ("above", "over") else -1)
    elif g:
        gs = [v for v in g.groups() if v]; sign, n = gs[0], gs[1]
        if int(n) <= 15: x["g"] = int(n) * (1 if sign == "+" else -1)
    m = _STATV.search(t)
    if m:
        v, k = (m.group(1), m.group(2)) if m.group(1) else (m.group(4), m.group(3))
        k = "MATT" if re.match(r"m|magic", k, re.I) else "ATT"
        if 5 <= int(v) <= 200: x[k] = int(v)
    if re.search(r"\bclean\b", t, re.I): x["clean"] = 1
    # a bare "+7" next to a weapon with its attack written out is the upgrade count, not a grade
    if "g" in x and g and not g.group(1) and not av and ("ATT" in x or "MATT" in x): del x["g"]
    return x or None

def parse_chat_message_x(msg):
    """Like parse_chat_message, with a fourth field: the roll written next to an equip, or None."""
    out = []
    marks = [(m.start(), m.end(), m.group(1)) for m in _SIDE.finditer(msg)]
    if not marks:
        return out
    marks.append((len(msg), len(msg), ""))
    for k in range(len(marks) - 1):
        tok = re.sub(r"\s", "", marks[k][2]).upper()
        side = "S" if tok[0] == "S" or tok == "WTS" else "B" if tok[0] == "B" or tok == "WTB" else None
        if not side:
            continue
        clause = msg[marks[k][1]:marks[k + 1][0]]
        # "(2)" or "x2" is how many they have, never part of the price: "60% (2) 65k ea" is 65k each
        clause = re.sub(r"\(\s*\d{1,3}\s*\)|\b[xX]\s?\d{1,2}\b(?=\s*[-:/]?\s*\d)", "  ", clause)
        items = _find_items(clause)
        # "polearm atk 60%": the scroll, not the Pole Arm it's named after
        scrolls = [it for it in items if "Scroll" in it[2]]
        items = [it for it in items if "Scroll" in it[2] or not any(it[0] < sc[1] and sc[0] < it[1] for sc in scrolls)]
        prices = [(m.start(), m.end(), _price_val(m)) for m in _CPRICE.finditer(clause)]
        if not items or not prices:
            continue
        used_until = 0
        for pi, (ps, pe, val) in enumerate(prices):
            if val < 10 or val > 50_000_000:
                continue
            before = clause[max(0, ps - 14):ps]
            if before.endswith("(") and ")" not in clause[pe:pe + 2]:
                continue      # "(265k": a quantity in brackets that lost its ")" ran into the price, so it can't be trusted
            if _BAD_CTX.search(before) or re.search(r"(?:^|[^+\-\d])\d\s$", before):
                continue      # "c/o 5k" is a bid, and "1 6k" is a decimal point the reader lost
            each = bool(re.match(r"\s*(?:mesos?\s*)?(?:each|ea\b|/e)", clause[pe:pe + 14], re.I))
            prev_end = prices[pi - 1][1] if pi else 0
            cand = [it for it in items if prev_end <= it[0] < ps]
            if not cand and pi == 0 and ps <= 4:
                # "[10k] fork on a stick": price first
                nxt = [it for it in items if pe <= it[0] <= pe + 6]
                cand = nxt[:1]
            if not cand:
                continue
            # "NX decos for your aurora stamps": the item they want, not the one they sell
            if re.search(r"\bfor\s+(?:your|ur|ya)\s*$", clause[max(0, cand[-1][0] - 12):cand[-1][0]], re.I):
                continue
            between = clause[cand[-1][1]:ps]
            lead = clause[max(0, cand[-1][0] - 12):cand[-1][0]]
            statty = len(between) <= 40 and chat_roll(between) and not re.search(r"\b(?:trade|for|or)\b", between, re.I)
            if (len(between) > 22 and not statty) or re.search(r"\b(?:lv|lvl|level|trade|for)\b|\bor\b", between, re.I) or re.search(r"\b(?:lv|lvl|level|m)\s?\d+\s*$", lead, re.I):
                continue
            chosen = cand if (each and len(cand) <= 4 and all(len(clause[a[1]:b[0]]) <= 12 for a, b in zip(cand, cand[1:]))) else cand[-1:]
            for it in chosen:
                x = None
                if "Scroll" not in it[2] and len(chosen) == 1:
                    x = chat_roll(clause[max(prev_end, it[0] - 12):pe])
                out.append((side, it[2], val, x))
    return out

def read_chat(region, scale=4):
    """region: PIL image of the chat box. Returns [(player, message)] with wrapped lines joined."""
    m = min_channel(region)
    img = m.point(lambda v: 0 if v <= 60 else 255 if v >= 200 else int((v - 60) * 1.82))
    img = img.resize((img.width * scale, img.height * scale), Image.BICUBIC)
    lines = ocr_lines(img, scale=scale)
    msgs = []
    for l in lines:
        t = l["text"].strip()
        if l["x"] > 14 and msgs:                      # wrapped continuation line is indented
            msgs[-1][1] += " " + t; continue
        m2 = re.match(r"^\W*([A-Za-z0-9]{3,14})\b(.*)$", t)
        if not m2:
            continue
        player, rest = m2.group(1), m2.group(2)
        # drop the channel badge junk before the colon when there is one
        c = re.search(r"[:;]", rest[:16])
        rest = rest[c.end():] if c else rest
        msgs.append([player, rest.strip()])
    return [(p, t) for p, t in msgs if not p.lower().startswith("notice")]

def _badge_channel(region, y0, y1):
    """Megaphone lines carry a small white badge with the sender's channel in red, like CH16."""
    band = region.crop((0, max(0, int(y0) - 1), min(region.width, 260), min(region.height, int(y1) + 2))).convert("RGB")
    px = band.load(); xs = []; ys = []
    for y in range(band.height):
        for x in range(band.width):
            r, g, b = px[x, y]
            if r > 180 and g < 40 and b < 40:
                xs.append(x); ys.append(y)
    if len(xs) < 20:
        return None
    x0, x1 = min(xs), max(xs)
    if x1 - x0 > 40 or x1 - x0 < 12:
        return None
    crop = band.crop((x0 - 2, min(ys) - 2, x1 + 3, max(ys) + 3))
    bw = Image.new("L", crop.size, 255); cp = crop.load(); bp = bw.load()
    for y in range(crop.height):
        for x in range(crop.width):
            r, g, b = cp[x, y]
            if r > 180 and g < 40 and b < 40: bp[x, y] = 0
    bw = bw.resize((bw.width * 6, bw.height * 6), Image.NEAREST)
    pad = Image.new("L", (bw.width + 40, bw.height + 40), 255); pad.paste(bw, (20, 20))
    text = "".join(l["text"] for l in ocr_lines(pad, 6, 7)).upper().replace(" ", "")
    text = text.replace("O", "0").replace("I", "1").replace("L", "1").replace("S", "5").replace("B", "8")
    m = re.search(r"(\d{1,2})$", text)
    if not m or not (1 <= int(m.group(1)) <= 40):
        return None
    return int(m.group(1))

def read_chat_channels(region, scale=4):
    """Like read_chat, but returns [(player, message, channel or None)]."""
    m = min_channel(region)
    img = m.point(lambda v: 0 if v <= 60 else 255 if v >= 200 else int((v - 60) * 1.82))
    img = img.resize((img.width * scale, img.height * scale), Image.BICUBIC)
    msgs = []
    for l in ocr_lines(img, scale=scale):
        t = l["text"].strip()
        if l["x"] > 14 and msgs:
            msgs[-1][1] += " " + t; continue
        m2 = re.match(r"^\W*([A-Za-z0-9]{3,14})\b(.*)$", t)
        if not m2:
            continue
        player, rest = m2.group(1), m2.group(2)
        c = re.search(r"[:;]", rest[:16])
        rest = rest[c.end():] if c else rest
        try: ch = _badge_channel(region, l["y"], l["y"] + l["h"])
        except Exception: ch = None
        msgs.append([player, rest.strip(), ch])
    return [(p, t, ch) for p, t, ch in msgs if not p.lower().startswith("notice")]


# ---------------------------------------------------------------- room (minimap title)

def _title_bar(img):
    """The capture is wider than most minimaps. Keep only the part that is still title bar."""
    px = img.load(); w, h = img.size
    counts = {}
    for x in range(min(40, w)):
        for y in range(h):
            counts[px[x, y]] = counts.get(px[x, y], 0) + 1
    bg = max(counts, key=counts.get)
    def bar(x):
        n = 0
        for y in range(h):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < 60 or min(r, g, b) > 215:
                n += 1
        return n >= h * 0.45
    miss = 0; end = w
    for x in range(40, w):
        miss = 0 if bar(x) else miss + 1
        if miss >= 4:
            end = x - 3; break
    return img.crop((0, 0, max(40, end), h))

def read_room(img):
    """The minimap title is white text: area on line one, map on line two.
    Returns 'FM3' for Free Market rooms, the map name elsewhere, or '' if unreadable."""
    img = _title_bar(img.convert("RGB"))
    m = min_channel(img)
    lo, hi = 150, 225
    k = 255.0 / (hi - lo)
    g = m.point(lambda v: 255 if v <= lo else 0 if v >= hi else int(255 - (v - lo) * k))
    g = g.resize((g.width * 4, g.height * 4), Image.BICUBIC)
    lines = [re.sub(r"[^A-Za-z0-9<>' -]", "", l["text"]).strip() for l in ocr_lines(g, 4, 6)]
    lines = [l for l in lines if len(l) >= 3]
    if not lines:
        return ""
    text = " ".join(lines)
    fm = re.compile(r"(fr)?e\s*e?\s*mark", re.I)       # "ee Market" when the F and r are cut off
    if fm.search(text) and re.search(r"entr", lines[-1], re.I):
        return "FM Entrance"
    if fm.search(text):
        nums = re.findall(r"<\s*(\d{1,2})\s*>?", lines[-1]) or re.findall(r"(\d{1,2})\s*>?\s*\S?\s*$", lines[-1])
        return "FM" + str(int(nums[0])) if nums and 1 <= int(nums[0]) <= 40 else "FM"
    name = lines[-1]
    return name if re.search(r"[A-Za-z]{4}", name) and len(name) <= 44 else ""


# Scroll tiers have their own icon colours: Lesser blue, Intermediate red-brown, Greater light tan.
# When the tier word is cut off, the row's icon decides it. Colours seen next to a readable tier
# word are remembered per scroll, so a scroll whose colours differ is still matched to itself.
TIER_SEEN = {}

def icon_colour(icon):
    """Median colour of the saturated, bright pixels of an icon, or None for a greyed or empty one."""
    import numpy as np
    a = np.asarray(icon.convert("RGB")).reshape(-1, 3).astype(float)
    hsv = np.asarray(icon.convert("HSV")).reshape(-1, 3)
    m = (hsv[:, 1] > 60) & (hsv[:, 2] > 80)
    if m.sum() < 40:
        return None
    return tuple(float(v) for v in np.median(a[m], axis=0))

def tier_from_colour(base, c):
    if c is None:
        return None
    seen = TIER_SEEN.get(base) or {}
    if seen:
        d = sorted((sum((x - y) ** 2 for x, y in zip(c, ref)) ** 0.5, t) for t, ref in seen.items())
        if d[0][0] < 25 and (len(d) == 1 or d[1][0] - d[0][0] > 15):
            return d[0][1]
    r, g, b = c
    if b > r + 15:
        return "Lesser"
    if r > b + 60:
        return "Greater" if g / r > 0.68 else "Intermediate"
    return None

def resolve_tiers(region, res):
    """Fill in cut-off scroll tiers from the row icon; remember colours of rows whose tier was read."""
    for row in res.get("rows") or []:
        if "y" not in row or "Scroll" not in row["i"] or row.get("so"):
            continue
        m = re.match(r"^(.*Scroll)(?:: (Lesser|Intermediate|Greater|Superior)| \(tier cut off\))$", row["i"])
        if not m:
            continue
        try:
            c = icon_colour(crop_icon(region, row["y"]))
        except Exception:
            continue
        if m.group(2):
            if c is not None:
                TIER_SEEN.setdefault(m.group(1), {})[m.group(2)] = c
        else:
            t = tier_from_colour(m.group(1), c)
            if t:
                row["i"] = m.group(1) + ": " + t; row["tier_from"] = "icon"
    return res

def crop_icon(region, y):
    """The item icon at the left of a shop row, scaled up for the site."""
    return region.crop((6, y + 1, 44, y + 39)).resize((76, 76), Image.NEAREST)


# ---------------------------------------------------------------- item tooltip

def _tip_box(img):
    """Find the tooltip by its thin light border: the left edge gives the height, the top edge the width."""
    import numpy as np
    a = np.asarray(img.convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    edge = (r > 165) & (g > 165) & (b > 155) & (abs(r - b) < 40) & (abs(r - g) < 30)
    H, W = edge.shape
    def longest(v):
        best = (0, 0); run = 0; st = 0
        for i, on in enumerate(v):
            if on:
                if run == 0: st = i
                run += 1
                if run > best[1]: best = (st, run)
            else:
                run = 0
        return best
    for x in range(min(W, 120)):
        st, n = longest(edge[:, x])
        if n < 70:
            continue
        y0, y1 = st, st + n
        tx, tn = longest(edge[y0, :]) if edge[y0, x] else (0, 0)
        if tn < 120:
            # the top line can sit one or two pixels below where the side line starts
            for dy in (1, 2, 3):
                if y0 + dy < H:
                    tx, tn = longest(edge[y0 + dy, :])
                    if tn >= 120: break
        if tn >= 120 and abs(tx - x) <= 4:
            return (x + 1, y0 + 1, tx + tn - 1, y1 - 1)
    return None

_LABELS = [
    ("ATT", r"[wvy]{1,2}eapon\s*att\w*"), ("MATT", r"(?:m|hi|rn)agic\s*att\w*"), ("WDEF", r"[wvy]{1,2}eapon\s*de[ft]\w*\.?"), ("MDEF", r"(?:m|hi|rn)agic\s*de[ft]\w*\.?"),
    ("HP", r"max\s*hp"), ("MP", r"max\s*mp"), ("ACC", r"accura\w*"), ("AVOID", r"evasion|avoid\w*"),
    ("SPEED", r"speed"), ("JUMP", r"jump"), ("STR", r"\bstr"), ("DEX", r"\bdex"), ("INT", r"\bint"), ("LUK", r"\bluk"),
    ("SLOTS", r"remaining\s*enhanc\w*|upgrades?\s*avail\w*"), ("SUCCESS", r"success\s*rate"),
]
_VAL = r"\s*(?:[.:;]+\s*[+#*]?|[+#*])\s*(\d{1,4})\s*%?(?:\s*[\(\[{]\s*(\d{1,4})(?:\s*([+\-~]?)\s*(\d{1,3}))?)?"
_LINE_RE = [(k, re.compile(r"(?<![a-z])(?<!req )(?<!req)(?:" + rx + r")" + _VAL, re.I)) for k, rx in _LABELS]
_JOBS = ["BEGINNER", "WARRIOR", "MAGICIAN", "BOWMAN", "THIEF", "PIRATE"]

_TIP_NAMES = None

def _tip_names():
    """Every item name the watcher knows: the small reference list plus the full item list chat uses."""
    global _TIP_NAMES
    if _TIP_NAMES is None:
        _TIP_NAMES = dict(_ITEM_NORM)
        try:
            for n in json.load(open(os.path.join(HERE, "chat_names.json"), encoding="utf-8")).get("names", []):
                _TIP_NAMES.setdefault(norm(n), n)
        except (OSError, ValueError):
            pass
        for b in SCROLL_BASES:
            for t in ("Lesser", "Intermediate", "Greater"):
                _TIP_NAMES.setdefault(norm(b + ": " + t), b + ": " + t)
    return _TIP_NAMES

def _known_name(text):
    """The known item name a tooltip title line spells, if any. A scrap of another window or a chat line
    can sit in front of the name ("ad Red Silky Boots"), so a word or two at the start may be dropped."""
    if re.search(r"has entered|has left|:\s*\S+\s*$", text, re.I) and not re.search(r"scroll", text, re.I):
        return None
    names = _tip_names()
    words = re.sub(r"\(\+\d+\)", "", text).split()
    for drop in range(0, min(3, max(1, len(words) - 1))):
        part = " ".join(words[drop:])
        n = norm(part)
        if len(n) < 4:
            break
        if n in names:
            return names[n]
        if drop:
            continue                     # with words dropped, only an exact name counts ("Silky Boots" could be any colour)
        best = difflib.get_close_matches(n, list(names), n=2, cutoff=0.86)
        if best:
            r0 = difflib.SequenceMatcher(None, n, best[0]).ratio()
            r1 = difflib.SequenceMatcher(None, n, best[1]).ratio() if len(best) > 1 else 0
            if r0 >= 0.93 or r0 - r1 >= 0.05:
                return names[best[0]]
    return None

def looks_like_tooltip(img):
    """Cheap check before reading: a dark see-through box with some bright text, right below the pointer."""
    import numpy as np
    a = np.asarray(img.convert("RGB")).astype(int)
    h, w = a.shape[:2]
    a = a[min(h - 1, 40):min(h, 160), min(w - 1, 15):min(w, 200)]
    if a.size == 0:
        return False
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    dark = (np.maximum(np.maximum(r, g), b) < 150) & (b - r > 10)
    bright = np.minimum(np.minimum(r, g), b) > 200
    return dark.mean() > 0.55 and 0.01 < bright.mean() < 0.3

def read_tooltip(img, need_stats=True):
    """Returns {'name', 'stats', 'lines', 'job'} for the item tooltip, or None.
    Classic World prints rolls as 'Weapon Attack: +35 (32 +3)': value, base and the difference."""
    m = min_channel(img)
    g = m.point(lambda v: 255 if v <= 140 else 0 if v >= 215 else int(255 - (v - 140) * 3.4))
    g = g.resize((g.width * 3, g.height * 3), Image.BICUBIC)
    found = ocr_lines(g, 3, 6)
    stats, statx, staty = {}, [], []
    for l in found:
        t = l["text"].replace("：", ":")
        for k, rx in _LINE_RE:
            mm = rx.search(t)
            if mm and k in ("STR", "DEX", "INT", "LUK") and re.search(r"re\S?\s*$", t[max(0, mm.start() - 5):mm.start()], re.I):
                continue                              # a requirement line, not a bonus
            if mm and k not in stats:
                stats[k] = int(mm.group(1))
                if mm.group(2):
                    # the number in brackets is the base; the sign is often too small to read, so work it out
                    base = int(mm.group(2)); diff = stats[k] - base
                    if 0 < abs(diff) <= 10 and (not mm.group(4) or int(mm.group(4)) == abs(diff)):
                        stats[k + "_b"] = base
                statx.append(l["x"] + (mm.start() / max(1, len(t))) * l["w"]); staty.append(l["y"])
                break
        if re.search(r"\btype\s*[:;.]", t, re.I):
            statx.append(l["x"] + (re.search(r"type", t, re.I).start() / max(1, len(t))) * l["w"]); staty.append(l["y"])
    if not stats:
        if need_stats:
            return None
        # items without stat lines (ores, potions, scrolls without a rate): settle for a known name near the pointer
        for l in found:
            if l["x"] < 300 and l["y"] < 120:
                k = _known_name(re.sub(r"^[^A-Za-z]+", "", l["text"]))
                if k:
                    return {"name": k, "stats": {}, "lines": [k], "job": ""}
        return None
    left = min(statx) - 20; bottom = max(staty) + 20
    col = [l for l in found if left - 10 <= l["x"] + l["w"] and l["x"] <= left + 250 and l["y"] <= bottom]
    lines = []
    for l in col:
        t = re.sub(r"\s+", " ", l["text"]).strip()
        # keep only the part of the line inside the tooltip
        if l["x"] < left - 4 and l["w"] > 0:
            cut = int((left - 4 - l["x"]) / l["w"] * len(t)); t = t[max(0, cut):].strip()
        t = re.sub(r"^[^A-Za-z0-9+]+", "", t)
        if len(re.sub(r"[^A-Za-z0-9]", "", t)) >= 3:
            lines.append(t)
    name = ""
    for t in lines:
        k = _known_name(t)
        if k:
            name = k; break
    if not name:
        for t in lines:
            if re.match(r"(re[q@]|type|attack speed|weapon|magic|max|remaining|accur|evasion|speed|jump|str|dex|int|luk|knock|success|beginner)", t, re.I) or re.search(r"'s\b", t):
                continue
            # a chat line showing through ("Maya has entered.") or a stat label is never the item's name
            if re.search(r"\b[hn]as (entered|left|lemt)|the room|:\s*$|critical|damage|darnage", t, re.I):
                continue
            words = [w for w in re.findall(r"[A-Za-z][A-Za-z'\-:.]*", t)]
            while words and len(words[-1]) <= 3 and len(words) > 1: words.pop()
            while words and len(words[0]) == 1 and len(words) > 1: words.pop(0)
            cand = " ".join(words)
            if len(re.sub(r"[^A-Za-z]", "", cand)) >= 4:
                name = cand; break
    # which class wears it: the job name shown in colour in the job row
    a = img.convert("RGB").crop((max(0, int(left) - 5), 0, min(img.width, int(left) + 260), min(img.height, int(bottom)))); px = a.load()
    orange = Image.new("L", a.size, 255); op = orange.load()
    for y in range(a.size[1]):
        for x in range(a.size[0]):
            r_, g_, b_ = px[x, y]
            if r_ > 190 and 90 <= g_ <= 200 and b_ < 110: op[x, y] = 0
    orange = orange.resize((orange.width * 3, orange.height * 3), Image.NEAREST)
    otext = " ".join(l["text"] for l in ocr_lines(orange, 3, 11)).upper()
    jobs = [j for j in _JOBS if j in otext]
    return {"name": name, "stats": stats, "lines": lines[:18], "job": jobs[0] if len(jobs) == 1 else ""}

# ---------------------------------------------------------------- channel window

def read_channel_dialog(img):
    """The Change Channel window: a grid of grey channel buttons, eight or ten to a row, with the
    highlighted one in blue. Grand launch went to 40 channels, so the grid can be five rows deep.
    Returns the highlighted channel number, or None if the window is not there."""
    import numpy as np
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    grey = (abs(r - g) < 8) & (abs(g - b) < 8) & (r > 160) & (r < 205)
    blue = (b > 195) & (r < 175) & (b - r > 55) & (g > 130)
    cells = grey | blue
    rows = cells.sum(axis=1)
    W = a.shape[1]
    # bands of rows that are mostly buttons
    bands, start = [], None
    for y, n in enumerate(rows):
        on = n > max(150, W * 0.18)
        if on and start is None: start = y
        if not on and start is not None:
            if y - start >= 8: bands.append((start, y))
            start = None
    if start is not None and len(rows) - start >= 8: bands.append((start, len(rows)))
    if not bands:
        return None
    def button_runs(y0, y1):
        col = cells[y0:y1].mean(axis=0) > 0.3        # white button text lowers some columns
        runs, s = [], None
        for x, on in enumerate(col):
            if on and s is None: s = x
            if not on and s is not None:
                if x - s >= 25: runs.append((s, x))
                s = None
        if s is not None and len(col) - s >= 25: runs.append((s, len(col)))
        return runs
    # the first row of buttons is always full: eight (or ten) buttons the same width, evenly spaced. Other bright
    # strips on screen (clouds, shop signs) can sit above it, so look for that row instead of trusting the first strip.
    runs, start = None, None
    for i, (y0, y1) in enumerate(bands):
        rr = button_runs(y0, y1)
        if len(rr) in (8, 10):
            widths = [e - s for s, e in rr]
            if max(widths) <= min(widths) * 1.4 and all(abs((rr[k + 1][0] - rr[k][0]) - (rr[1][0] - rr[0][0])) <= 4 for k in range(len(rr) - 1)):
                runs, start = rr, i; break
    if runs is None:
        return None
    # the rows that follow it closely are the other channel rows
    keep = [bands[start]]
    for y0, y1 in bands[start + 1:]:
        if y0 - keep[-1][1] > 14 or len(keep) >= 6: break
        keep.append((y0, y1))
    if len(keep) < 2:
        return None
    bands = keep
    # the window's blue title bar ("WINDIA") sits just above the buttons; shop signs and clouds don't have it
    y0 = bands[0][0]; x0, x1 = runs[0][0], runs[-1][1]
    top = a[max(0, y0 - 50):max(0, y0 - 8), x0:x1]
    if top.size == 0:
        return None
    tr, tg, tb = top[..., 0], top[..., 1], top[..., 2]
    hdr = ((tb > 150) & (tr < 130) & (tb - tr > 70)).any(axis=0).mean()
    if hdr < 0.6:
        return None
    for bi, (y0, y1) in enumerate(bands):
        for ci, (x0, x1) in enumerate(runs):
            cell = blue[y0:y1, x0:x1]
            if cell.mean() > 0.35:
                return bi * len(runs) + ci + 1
    return None
