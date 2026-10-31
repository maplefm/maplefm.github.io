"""Turn game screen crops into price rows. No Windows-only code in this file."""
import re, json, os, time, difflib
from PIL import Image, ImageChops, ImageOps
from ocrlib import min_channel, ocr_lines
import glyphs

HERE = os.path.dirname(os.path.abspath(__file__))
_d = json.load(open(os.path.join(HERE, "items.json"), encoding="utf-8"))
ITEMS = list(_d["items"])
ALIASES = _d["aliases"]

def norm(s):
    return re.sub(r"[^a-z0-9]+", "", s.lower())

_ITEM_NORM = {norm(n): n for n in ITEMS}

# Items the game added since this release: the watcher fetches the site's full item list once a day
# (data/itemdb.json on the live branch) and keeps the names in items_extra.json, so a new item is known
# the day the site knows it, without waiting for a watcher update.
EXTRA_FILE = os.path.join(HERE, "items_extra.json")
def _add_names(names):
    added = 0
    for n in names:
        n = str(n).strip()
        if not n or len(n) > 60: continue
        k = norm(n)
        if k and k not in _ITEM_NORM:
            _ITEM_NORM[k] = n; ITEMS.append(n); added += 1
    return added
try:
    _add_names(json.load(open(EXTRA_FILE, encoding="utf-8")).get("items") or [])
except (OSError, ValueError, AttributeError):
    pass

def refresh_items(names):
    """Save the site's item names and start matching them now. Returns how many were new to this watcher."""
    names = sorted({str(n).strip() for n in names if str(n).strip()})
    if len(names) < 1000: return 0          # a broken download, not the item list (about 3,000 shop-tradeable names)
    try: json.dump({"at": int(time.time()), "items": names}, open(EXTRA_FILE, "w", encoding="utf-8"), ensure_ascii=False)
    except OSError: pass
    n = _add_names(names)
    _BASE_NORM.update({norm(x): x for x in names})
    return n

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
    if norm(base) == "scroll":
        return None   # "Scroll Crafting Catalyst" and the like: the word Scroll alone is not a scroll's name
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

def scroll_prefix(core):
    """A scroll name cut off before the word Scroll, with a letter or two misread ("Qne-Handed Axe Attack S",
    "Gloves Magic Attack Scrc"): the one scroll kind whose name starts that way. The row's icon then gives the tier."""
    words = re.sub(r"[\s._…]+$", "", core).split()
    for k in (len(words), len(words) - 1):
        if k < 2: break
        v = norm(" ".join(words[:k]))
        if len(v) < 12: break
        sc = sorted(((difflib.SequenceMatcher(None, v, nb[:len(v)]).ratio(), b) for nb, b in _SB_NORM.items()), reverse=True)
        if sc[0][0] >= 0.88 and sc[0][0] - sc[1][0] >= 0.06:
            return sc[0][1]
    return None

def _words_agree(a, b):
    """A misread changes a letter or two. A different word (Blue vs Black) is a different item,
    and so is a longer word that starts with the known one (Lemona is not Lemon)."""
    wa, wb = a.split(), b.split()
    if any(len(x) > len(y) and x.startswith(y) for x, y in zip(wa, wb)):
        return False
    if len(wa) != len(wb):
        return difflib.SequenceMatcher(None, a.replace(" ", ""), b.replace(" ", "")).ratio() >= 0.93
    def one_off(x, y):   # a three-letter word with one letter misread after the first ("Are" for "Arc")
        return len(x) == len(y) == 3 and x[0] == y[0] and sum(p != q for p, q in zip(x, y)) == 1
    return all(x == y or one_off(x, y) or (len(x) >= 4 and difflib.SequenceMatcher(None, x, y).ratio() >= 0.75) for x, y in zip(wa, wb))

# Items the game added after our item list: learned from their tooltips while scanning ("Painting of Zombie
# Mushmom"), kept in learned_items.json, and matched like any other item from then on.
LEARNED_FILE = os.path.join(HERE, "learned_items.json")
_BASE_NORM = dict(_ITEM_NORM)   # the item list as shipped, before anything learned

def misread_of_known(name):
    """A 'new' name that is really a known item misread or cut off: 'One-Handed Sword Altac' (a scroll cut before its
    tier), 'Mystery Paletle Exchange' (Mystery Palette Exchange Coupon), 'Steel Fingerless' (Steel Fingerless Gloves).
    Those are never learned, or the misread would win over the right name from then on."""
    n = norm(name)
    if not n or n in _BASE_NORM: return True
    if re.search(r"scroll", name, re.I) or scroll_prefix(name): return True
    if difflib.get_close_matches(n, list(_BASE_NORM), n=1, cutoff=0.85): return True
    # the start of a longer known name, cut by the shop's width
    if len(n) >= 8 and any(k.startswith(n) for k in _BASE_NORM): return True
    # a known name with a letter or two misread at the end of a cut ("Orihalcon Burgonet He" for Orihalcon Burgonet Helm)
    if len(n) >= 10 and any(difflib.SequenceMatcher(None, n, k[:len(n)]).ratio() >= 0.88 for k in _BASE_NORM if len(k) > len(n)): return True
    return False

LEARNED = {}
try:
    LEARNED = json.load(open(LEARNED_FILE, encoding="utf-8"))
except (OSError, ValueError):
    LEARNED = {}
# learned before this check existed: anything that is a misread of a known item is dropped, real new items stay
_junk = [n for n in LEARNED if misread_of_known(n)]
if _junk:
    for n in _junk: LEARNED.pop(n, None)
    try: json.dump(LEARNED, open(LEARNED_FILE, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    except OSError: pass
for _n in LEARNED: _ITEM_NORM[norm(_n)] = _n

def learn_item(name):
    if norm(name) in _ITEM_NORM or misread_of_known(name): return False
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
    raw = re.sub(r"^[dl]r\.\s*", "Jr. ", raw)   # "Jr." read as "dr."
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
    sp = scroll_prefix(core)
    if sp:
        return sp + " (tier cut off)", True
    # cut by the shop's width with the "..." lost ("Steel Fingerless", "Orihalcon Burgonet He", "lron Hog's Metal"):
    # the one known item whose name starts that way, allowing a misread letter or two
    if len(n) >= 10:
        f = n.replace("l", "i")
        starts = {v for k, v in _BASE_NORM.items() if k.replace("l", "i").startswith(f)}
        if len(starts) == 1:
            return next(iter(starts)), True
        sc = sorted(((difflib.SequenceMatcher(None, n, k[:len(n)]).ratio(), v) for k, v in _BASE_NORM.items() if len(k) > len(n)), reverse=True)[:2]
        if sc and sc[0][0] >= 0.9 and (len(sc) < 2 or sc[0][0] - sc[1][0] >= 0.06):
            return sc[0][1], True
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
    # A popup or the pointer laid over the right of the row: its columns are mostly dark, while a column of text is
    # mostly background. Blank those columns, or their dark pixels set the ink level and pale (sold) text washes out.
    import numpy as np
    a = np.asarray(m, dtype=np.uint8)
    bg0 = int(np.percentile(a, 80))
    colmed = np.median(a, axis=0)
    cover = colmed < bg0 - 60
    if cover.any() and not cover.all():
        idx = np.where(cover)[0]
        # from the first covered column on the right half, everything to its right is the overlay
        start = idx[idx > a.shape[1] * 0.45]
        if len(start):
            a = a.copy(); a[:, max(0, int(start[0]) - 2):] = bg0
            m = Image.fromarray(a)
    # the row borders: a line across the tile, never text
    rowmed = np.median(a, axis=1)
    if (rowmed < bg0 - 60).any():
        a = a.copy(); a[rowmed < bg0 - 60, :] = bg0; m = Image.fromarray(a)
    px = sorted(m.getdata())
    # the ink level from the left of the row, where the name and price always start: the pointer resting on the
    # row's right side is darker than pale (sold) text and would wash it out
    lp = np.sort(a[:, : max(1, int(a.shape[1] * 0.55))], axis=None)
    fg, bg = int(lp[int(len(lp) * 0.01)]), px[int(len(px) * 0.80)]
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

STATS = {"shops": 0, "fast": 0}   # shops read since start, and how many straight off the pixels

def _fold(s):
    return norm(s.replace("I", "l"))
_ITEM_FOLD = None

def glyph_item(text):
    """An item name read off the pixels (capital I comes back as l) to the item list: (name, True) or (None, False)."""
    global _ITEM_FOLD
    if not text:
        return None, False
    if _ITEM_FOLD is None or len(_ITEM_FOLD) < len(_ITEM_NORM):
        _ITEM_FOLD = {}
        for v in _ITEM_NORM.values():
            _ITEM_FOLD.setdefault(_fold(v), set()).add(v)
    cut = text.rstrip().endswith("..")
    core = re.sub(r"[\s.]+$", "", text)
    if not cut:
        hit = _ITEM_FOLD.get(_fold(core))
        if hit and len(hit) == 1:
            return next(iter(hit)), True
    if "Scroll" in core or cut:
        nm, known = clean_item(text)
        if known:
            return nm, True
    if cut:
        f = _fold(core)
        if len(f) >= 8:
            starts = {v for k, vs in _ITEM_FOLD.items() if k.startswith(f) for v in vs}
            if len(starts) == 1:
                return next(iter(starts)), True
    return None, False

def _shop_rows(region):
    S = SHOP; ys = []
    for i in range(S["rows"]):
        y = int(round(S["row0"] + S["pitch"] * i))
        _, has, grey = _stretch(region.crop((S["x0"], y, S["x1"], y + 38)))
        if has: ys.append((y, grey))
    return ys

def read_shop_fast(region):
    """The whole shop read straight off the pixels: every price, name and the seller in the game's own font, scroll
    tiers from their icons. Returns None when anything on it isn't certain, and the text readers take over."""
    S = SHOP
    seller = glyphs.read_seller(region.crop(S["seller"]))
    if not seller or len(seller) < 2:
        return None
    rows = []
    for y, grey in _shop_rows(region):
        tile = region.crop((S["x0"], y, S["x1"], y + 38))
        gp = glyphs.read_price(tile)
        if not gp: return None
        name, known = glyph_item(glyphs.read_name(tile))
        if not known: return None
        rows.append({"i": name, "p": gp[1], "q": gp[0], "so": bool(grey), "known": True, "y": y})
    if not rows:
        return None
    return resolve_tiers(region, {"title": "", "seller": seller, "rows": rows, "dropped": 0, "fast": True})

def read_shop_checked(region):
    """Read the shop. Straight off the pixels when every row is certain; otherwise with two independent text readers,
    keeping a row only when its price is certain (exact pixel read, or both readers agree)."""
    fast = read_shop_fast(region)
    STATS["shops"] += 1
    if fast:
        STATS["fast"] += 1
        return fast
    sh = _sheet(region)
    if not sh:
        return None
    sheet, spans, meta = sh
    S = SHOP
    W, H = sheet.size
    tl = _bucket(ocr_lines(sheet.resize((W * 4, H * 4), Image.BICUBIC), scale=4), spans)
    rl = _bucket(rapid_lines(sheet.resize((W * 3, H * 3), Image.BICUBIC), 3), spans)
    title = " ".join(l["text"] for l in tl[0]).strip() or " ".join(l["text"] for l in rl[0]).strip()
    seller = re.sub(r"[^A-Za-z0-9]", "", "".join(l["text"] for l in rl[1])) or re.sub(r"[^A-Za-z0-9]", "", "".join(l["text"] for l in tl[1]))
    gs = glyphs.read_seller(region.crop(S["seller"]))
    if gs and len(gs) >= 2:
        # exact, except capital I and small l look the same: take the text reader's I/l where it agrees otherwise
        seller = seller if _fold(seller) == _fold(gs) else gs
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
        # The price line drawn in the game's pixel font, read letter by letter against the learned letter shapes:
        # exact or nothing. When it reads, it decides the price and bundle size; the text readers only give the name.
        gp = glyphs.read_price(region.crop((S["x0"], meta[i][2], S["x1"], meta[i][2] + 38)))
        if gp:
            qty, price = gp
            if not tm:
                tname = " ".join(tt[:-1]) if len(tt) > 1 else ""
        else:
            if not tm or not rm:
                out["dropped"] += 1; continue
            qty, price, rprice = _num(tm.group(1)), _num(tm.group(2)), _num(rm.group(1))
            if not qty or not price or price != rprice:
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
        gname, gk = glyph_item(glyphs.read_name(region.crop((S["x0"], meta[i][2], S["x1"], meta[i][2] + 38))))
        name, known = (gname, True) if gk else clean_item(tname)
        if not known and tname:
            # a stray letter or two read off the pointer or the row's edge after the name ("Star Earrings re"):
            # the name without them, only when that is a real item
            t2 = re.sub(r"(\s+\S{1,2})+\s*$", "", tname.strip())
            if t2 != tname.strip():
                n3, k3 = clean_item(t2)
                if k3: name, known = n3, True
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

# The game's small font draws 7 like a slash and 1 like a bar, and the text reader takes them as such: "<7>" came back
# as "</>" on every Free Market 7 shop. Between the < and > of a room number only digits can stand, so the look-alikes
# are turned back into digits there and nowhere else.
_ROOMLIKE = str.maketrans({"/": "7", "|": "1", "l": "1", "I": "1", "i": "1", "!": "1", "O": "0", "o": "0", "D": "0", "S": "5", "s": "5", "B": "8", "Z": "2", "z": "2", "g": "9", "q": "9", "A": "4", "T": "7"})
def _room_digits(t):
    return re.sub(r"<\s*([0-9/|lIi!OoDSsBZzgqAT]{1,2})\s*>", lambda m: "<" + m.group(1).translate(_ROOMLIKE) + ">", t)


def read_room(img):
    """The minimap title is white text: area on line one, map on line two.
    Returns 'FM3' for Free Market rooms, the map name elsewhere, or '' if unreadable."""
    img = _title_bar(img.convert("RGB"))
    m = min_channel(img)
    lo, hi = 150, 225
    k = 255.0 / (hi - lo)
    g = m.point(lambda v: 255 if v <= lo else 0 if v >= hi else int(255 - (v - lo) * k))
    g = g.resize((g.width * 4, g.height * 4), Image.BICUBIC)
    lines = [re.sub(r"[^A-Za-z0-9<>' -]", "", _room_digits(l["text"])).strip() for l in ocr_lines(g, 4, 6)]
    lines = [l for l in lines if len(l) >= 3]
    if not lines:
        return ""
    text = " ".join(lines)
    fm = re.compile(r"(fr)?e\s*e?\s*mark", re.I)       # "ee Market" when the F and r are cut off
    if fm.search(text) and re.search(r"entr", lines[-1], re.I):
        return "FM Entrance"
    if fm.search(text):
        last = _room_digits(lines[-1])
        nums = re.findall(r"<\s*(\d{1,2})\s*>?", last) or re.findall(r"(\d{1,2})\s*>?\s*\S?\s*$", last)
        return "FM" + str(int(nums[0])) if nums and 1 <= int(nums[0]) <= 40 else "FM"
    name = lines[-1]
    return name if re.search(r"[A-Za-z]{4}", name) and len(name) <= 44 else ""


def read_room_bar(img):
    """The minimap minimized to its title bar: one line, "Hidden Street : Free Market <9>", dark text on a light bar at
    the very top left of the game window. Only a room number written between < and > counts (a misread digit
    elsewhere is never a room), and "Entrance" for the Free Market Entrance. Returns 'FM9', 'FM Entrance' or ''."""
    try:
        img = _title_bar(img.convert("RGB"))
        m = min_channel(img)
        best = ""
        for lo, hi in ((90, 170), (120, 200)):
            k = 255.0 / (hi - lo)
            g = m.point(lambda v: 255 if v <= lo else 0 if v >= hi else int(255 - (v - lo) * k))
            g = g.resize((g.width * 4, g.height * 4), Image.BICUBIC)
            for l in ocr_lines(g, 4, 6):
                t = re.sub(r"[^A-Za-z0-9<>:' -]", "", _room_digits(l["text"]))
                if not re.search(r"(fr)?e\s*e?\s*mark", t, re.I):
                    continue
                if re.search(r"entr", t, re.I):
                    return "FM Entrance"
                n = re.findall(r"<\s*(\d{1,2})\s*>", _room_digits(t))
                if len(n) == 1 and 1 <= int(n[0]) <= 40:
                    best = "FM" + str(int(n[0]))
            if best: return best
        return ""
    except Exception:
        return ""


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
        if "y" not in row or "Scroll" not in row["i"]:
            continue
        m = re.match(r"^(.*Scroll)(?:: (Lesser|Intermediate|Greater|Superior|Chaos)| \(tier cut off\))$", row["i"])
        if not m:
            continue
        # the icon is exact for every tiered scroll, sold rows included, and wins over a misread tier word
        if norm(m.group(1)) in _SB_NORM:
            try: t = tier_from_icon(region, row["y"])
            except Exception: t = None
            if t:
                if t != m.group(2): row["tier_from"] = "icon"
                row["i"] = _SB_NORM[norm(m.group(1))] + ": " + t
                continue
        if row.get("so"):
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
    # crit lines: Emerald Earrings carry Critical Damage, Work Gloves Critical Rate ("Critical Darnage" is a common misread)
    ("CRITDMG", r"cri\w*\.?\s*da[mrn]\w*"), ("CRIT", r"cri\w*\.?\s*ra[tl]\w*"),
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

def _tip_panel(img):
    """The tooltip's own dark blue panel: rows and columns mostly that colour. Cropping to it keeps the shop list,
    chat box and players behind it out of the reading."""
    import numpy as np
    a = np.asarray(img.convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    navy = (b > r + 12) & (b < 150) & (r < 95)
    rows = np.where(navy.mean(1) > 0.3 * min(1.0, 320 / max(1, a.shape[1])))[0]
    if len(rows) < 40: return None
    best = (0, -1); st = rows[0]; prev = rows[0]
    for y in list(rows[1:]) + [10 ** 9]:
        if y - prev > 16:
            if prev - st > best[1] - best[0]: best = (st, prev)
            st = y
        prev = y
    y0, y1 = best
    if y1 - y0 < 40: return None
    cols = np.where(navy[y0:y1 + 1].mean(0) > 0.3)[0]
    if len(cols) < 120: return None
    return (max(0, int(cols.min()) - 10), max(0, int(y0) - 30), min(a.shape[1], int(cols.max()) + 6), min(a.shape[0], int(y1) + 8))

TIP_CFG = {"crop": True, "lo": 140, "hi": 215, "scale": 3, "below_type": True, "plusfix": True}
TIP_PASSES = [(100, 170), (140, 215)]

def read_tooltip(img, need_stats=True):
    """Returns {'name', 'stats', 'lines', 'job'} for the item tooltip, or None.
    Crops to the tooltip's own panel, so whatever is behind it (the chat box, other players, the shop list) is
    left out, then reads it at two contrast levels and merges: a line one level misses or misreads, the other
    usually gets. On saved tooltips this took exact reads from 42 of 65 to 61 of 65, and it runs faster."""
    box = _tip_panel(img) if TIP_CFG["crop"] else None
    full = img
    if box: img = img.crop(box)
    # The exact reader first: when every stat line of the popup reads exactly, those are the stats, so one pass of
    # the text reader (for the title and its "(+N)") is all that's left. Saves a whole pass on most popups.
    passes = TIP_PASSES
    try:
        import tipexact
        ex0 = tipexact.read_tip(img)
        if ex0 and not ex0["bad"] and any(l.get("stat") for l in ex0["lines"]): passes = TIP_PASSES[:1]
    except Exception:
        pass
    # both contrast passes at once: the text reader is a separate program, so two run side by side in about the time of one
    reads = None
    if len(passes) > 1:
        try:
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(len(passes)) as ex:
                reads = [r for r in ex.map(lambda p: _read_tip_once(img, need_stats=False, lo=p[0], hi=p[1]), passes) if r]
        except RuntimeError:
            reads = None                    # no threads here (the browser scanner): the same passes one after another
    if reads is None:
        reads = [r for r in (_read_tip_once(img, need_stats=False, lo=lo, hi=hi) for lo, hi in passes) if r]
    if not reads: return None
    base = max(reads, key=lambda r: len(r["stats"]))
    votes = {}
    for r in reads:
        for k, v in r["stats"].items():
            if k.endswith("_b"): continue
            votes.setdefault(k, {}); votes[k][v] = votes[k].get(v, 0) + 1
    stats = {}
    for k, c in votes.items():
        b = next((r["stats"].get(k + "_b") for r in reads if r["stats"].get(k + "_b") is not None), None)
        # most reads agree; on a tie, the value that fits the base in brackets ("+7 (6 +1)")
        stats[k] = max(c.items(), key=lambda x: (x[1], -abs(x[0] - b) if b is not None else 0))[0]
        if b is not None and abs(stats[k] - b) <= 10: stats[k + "_b"] = b
    # The exact reader (tipexact.py): every stat line read pixel for pixel in the game's own font. Where it reads a
    # line, its value replaces the text reader's. When it reads every line of the popup, its stats are the stats:
    # the text reader's extra lines are dropped and the read is marked exact (_ex).
    exact = None
    try:
        import tipexact
        exact = tipexact.read_tip(img)
    except Exception:
        exact = None
    if exact and exact["stats"]:
        es = exact["stats"]
        for k in [k for k in es if not k.endswith("_b")]:
            stats[k] = es[k]
            if k + "_b" in es: stats[k + "_b"] = es[k + "_b"]
            else: stats.pop(k + "_b", None)
        if not exact["bad"] and any(l.get("stat") for l in exact["lines"]):
            stats = dict(es); stats["_ex"] = 1
    if need_stats and not any(not k.endswith("_b") and not k.startswith("_") for k in stats): return None
    # the upgrades line is the bottom one, and the popup is see-through: over a pink or yellow megaphone it fades.
    # When an equip read has no upgrades line, read the bottom of the panel once more by whiteness (white text stays,
    # coloured ground drops out).
    if "SLOTS" not in stats and any(k in stats for k in ("ATT", "MATT", "WDEF", "MDEF", "STR", "DEX", "INT", "LUK", "HP", "ACC")):
        try:
            # the panel's lower edge is found by its border, which a bright megaphone underneath can hide: look a
            # little further down in the uncropped picture too
            sl = _tip_slots_white(img)
            if sl is None and box: sl = _tip_slots_white(full.crop((box[0], box[1] + (box[3] - box[1]) // 2, box[2], min(full.height, box[3] + 70))), top=0)
            if sl is not None: stats["SLOTS"] = sl; stats.pop("_ex", None)   # not read exactly
        except Exception: pass
    out = dict(base); out["stats"] = stats
    if not out.get("name"):
        out["name"] = next((r["name"] for r in reads if r.get("name")), "")
    if not out.get("job"):
        out["job"] = next((r["job"] for r in reads if r.get("job")), "")
    # a scrolled item's name is orange, which the white-text reading drops: read the top of the panel by brightness
    if not _known_name(re.sub(r"\s*\(\+\d+\)\s*$", "", out.get("name") or "")):
        nm = _tip_name_bright(img)
        if nm: out["name"] = nm
    # scrolls passed, from the title's colour and "(+N)": with slots used it tells failed scrolls apart from passed ones
    if "SLOTS" in stats:
        try:
            up = _tip_passed(img)
            if up is not None: stats["UP"] = up
        except Exception: pass
    # a type or stat line is never the name ("Type: Earrings", "Type: Two-handed Sword"): better no name than that
    if re.search(r"\btype\s*[:;.]", out.get("name") or "", re.I): out["name"] = ""
    return out

def _tip_slots_white(img, top=0.45):
    import numpy as np
    a = np.asarray(img.convert("RGB")).astype(int)
    h = a.shape[0]; a = a[int(h * top):]
    mn, mx = a.min(axis=2), a.max(axis=2)
    w = mn - 2 * (mx - mn)                                   # white stays high; any colour sinks
    g = np.where(w >= 205, 0, np.where(w <= 150, 255, (205 - w) * 255 // 55)).astype("uint8")
    im = Image.fromarray(g).resize((g.shape[1] * 4, g.shape[0] * 4), Image.BICUBIC)
    lines = ocr_lines(im, 4, 6)
    for l in lines:
        t = l["text"]
        mm = re.search(r"(?:remaining|enh\w*|[a-z]?nhan\w*|hanc\w*|r?ema[il]n\w*|upgrad\w*)\s*[.:;,]*\s*[+#*]?\s*(\d{1,2})\s*\W{0,2}$", t, re.I)
        if mm and int(mm.group(1)) <= 20 and not re.search(r"damage|rate|crit", t, re.I):
            return int(mm.group(1))
    # the labels are pale blue and can drop out with the background; the values stay white. Every stat value carries
    # a plus sign ("+19"); the upgrades count is the one bare number, on the last line under them.
    plus = [l for l in lines if re.search(r"\+\s*\d", l["text"])]
    bare = [l for l in lines if re.fullmatch(r"\W{0,2}(\d{1,2})\W{0,2}", l["text"].strip()) and "+" not in l["text"] and "%" not in l["text"]]
    if len(plus) >= 2 and bare:
        last = max(bare, key=lambda l: l["y"])
        if last["y"] > max(l["y"] for l in plus) and int(re.sub(r"\D", "", last["text"])) <= 20:
            return int(re.sub(r"\D", "", last["text"]))
    return None

def _tip_name_bright(img):
    """The item name from the top rows of the tooltip, read by brightness so white and orange names both show."""
    from PIL import ImageChops
    top = img.convert("RGB").crop((0, 0, img.width, min(img.height, 80)))
    r, g, b = top.split()
    mx = ImageChops.lighter(ImageChops.lighter(r, g), b)
    gg = mx.point(lambda v: 0 if v >= 200 else 255 if v <= 150 else int((200 - v) * 5.1))
    gg = gg.resize((gg.width * 3, gg.height * 3), Image.BICUBIC)
    best = ""
    for l in ocr_lines(gg, 3, 6):
        t = re.sub(r"\s*\(\+?\d+\)?\s*$", "", re.sub(r"^[^A-Za-z]+", "", l["text"])).strip()
        if not t or re.search(r"'s\b|\b[hn]as (entered|left)|\breq\b|:", t, re.I): continue
        k = _known_name(t)
        if k: return k
        if not best and len(re.sub(r"[^A-Za-z]", "", t)) >= 4: best = t
    return best

def _tip_passed(img):
    """How many scrolls passed, from the title. The game writes an item that took passed scrolls in orange with
    "(+N)" after the name; an item with none keeps a white name and no count. Returns 0, N, or None when unsure."""
    import numpy as np
    top = img.convert("RGB").crop((0, 0, img.width, min(img.height, 80)))
    a = np.asarray(top).astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    from PIL import ImageChops
    r, g, b = top.split()
    mx = ImageChops.lighter(ImageChops.lighter(r, g), b)
    gg = mx.point(lambda v: 0 if v >= 200 else 255 if v <= 150 else int((200 - v) * 5.1))
    gg = gg.resize((gg.width * 3, gg.height * 3), Image.BICUBIC)
    for l in ocr_lines(gg, 3, 6):
        t = re.sub(r"^[^A-Za-z]+", "", l["text"]).strip()
        # brackets read as (, {, [, i or l and ), }, ] or |: "Old Wooden Staff i+1}", "Fairy Wand {+7}"
        nm = re.sub(r"\s*[\(\[{il]\s*(?:[+t4]\s*\d{1,2}|\d{1,2}|I?[FM])\s*[\)\]}|1l]?", " ", t).strip()
        nm = re.sub(r"\s*[\(\[{][^)\]}]*$|\s*[|]\s*$", "", nm).strip()
        if not nm or re.search(r"'s\b|\b[hn]as (entered|left)|\breq\b|:", t, re.I) or not _known_name(nm): continue
        y0, y1 = max(0, int(l["y"]) - 1), min(a.shape[0], int(l["y"] + l["h"]) + 2)
        x0, x1 = max(0, int(l["x"]) - 1), min(a.shape[1], int(l["x"] + l["w"]) + 2)
        sub = (slice(y0, y1), slice(x0, x1))
        orange = int(((R[sub] > 190) & (G[sub] > 110) & (G[sub] < 205) & (B[sub] < 120)).sum())
        white = int(((R[sub] > 205) & (G[sub] > 205) & (B[sub] > 205)).sum())
        # the line's box also takes in the panel's light border, so the call is on orange alone: a white name has none
        if orange < 12 and white >= 25: return 0                 # a white name: no scroll passed
        if orange < 30: return None
        m = re.search(r"[\(\[{il]\s*([+t4]?)\s*(\d{1,2})\s*[\)\]}|]?\s*[|]?\s*$", t)
        if not m: return None
        d = m.group(2)
        # the plus sign is often read as a 4 ("(+4)" as "(44)"): two digits starting with 4 are the plus and one digit
        if not m.group(1) and len(d) == 2 and d[0] == "4": d = d[1]
        n = int(d)
        return n if 1 <= n <= 20 else None
    return None

def _read_tip_once(img, need_stats=True, lo=140, hi=215):
    C = TIP_CFG
    m = min_channel(img)
    k = 255.0 / (hi - lo)
    g = m.point(lambda v: 255 if v <= lo else 0 if v >= hi else int(255 - (v - lo) * k))
    g = g.resize((g.width * C["scale"], g.height * C["scale"]), Image.BICUBIC)
    found = ocr_lines(g, C["scale"], 6)
    # stat lines sit under the "Type:" line; the REQ block above it is requirements, never bonuses
    type_y = None
    if C["below_type"]:
        for l in found:
            if re.search(r"\btype\s*[:;.]", l["text"].replace("：", ":"), re.I): type_y = l["y"]; break
    if type_y is not None:
        found_stats = [l for l in found if l["y"] >= type_y - 2]
    else:
        found_stats = found
    stats, statx, staty = {}, [], []
    for l in found_stats:
        t = l["text"].replace("：", ":")
        for k, rx in _LINE_RE:
            mm = rx.search(t)
            if mm and k in ("STR", "DEX", "INT", "LUK") and re.search(r"re\S?\s*$", t[max(0, mm.start() - 5):mm.start()], re.I):
                continue                              # a requirement line, not a bonus
            if mm and k not in stats:
                stats[k] = int(mm.group(1))
                if C["plusfix"] and mm.group(2) and k != "SLOTS":
                    # "+7 (6 +1)" read as "47 (6 +1)": the plus sign became a 4. The bracket settles it.
                    v, base = stats[k], int(mm.group(2)); dv = int(mm.group(4)) if mm.group(4) else None
                    sv = str(v)
                    if abs(v - base) > 10 and sv[0] == "4" and len(sv) >= 2 and abs(int(sv[1:]) - base) <= 10:
                        stats[k] = int(sv[1:])
                if mm.group(2):
                    # the number in brackets is the base; the sign is often too small to read, so work it out
                    base = int(mm.group(2)); diff = stats[k] - base
                    if 0 < abs(diff) <= 10 and (not mm.group(4) or int(mm.group(4)) == abs(diff)):
                        stats[k + "_b"] = base
                statx.append(l["x"] + (mm.start() / max(1, len(t))) * l["w"]); staty.append(l["y"])
                break
        if re.search(r"\btype\s*[:;.]", t, re.I):
            statx.append(l["x"] + (re.search(r"type", t, re.I).start() / max(1, len(t))) * l["w"]); staty.append(l["y"])
    if stats and "SLOTS" not in stats:
        # the upgrades line reads worst of all ("Seman Enhancements: 5", "Poermaininn Enhanremente 10"): any line with
        # a bent "enhancements" or "remaining" word that ends in a small number is it. Upgrades left decide an equip's
        # price, so it's worth the second look.
        for l in found_stats:
            t = l["text"].replace("：", ":")
            mm = re.search(r"(?:enh\w*|[a-z]?nhan\w*|hanc\w*|r?ema[il]n\w*|upgrad\w*)\s*[.:;,]*\s*[+#*]?\s*(\d{1,2})\s*\W{0,2}$", t, re.I)
            if mm and int(mm.group(1)) <= 20 and not re.search(r"damage|rate|crit", t, re.I):
                stats["SLOTS"] = int(mm.group(1)); break
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
        # the "Type: Two-handed Sword" line names the weapon type, which is also an item ("Two-Handed Sword"):
        # a type or stat line is never the item's name
        if re.match(r"\W{0,3}\w{0,3}\W{0,3}(re[q@]|type|attack speed|weapon|magic|remaining)", t, re.I) or re.search(r"\btype\s*[:;.]", t, re.I):
            continue
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

def _split_merged(spans):
    """Buttons drawn small can lose the thin gap between two of them, leaving one span twice (or three times) as long
    as the rest. Split those back evenly, judged against the usual span length."""
    if len(spans) < 3: return spans
    m = sorted(e - s for s, e in spans)[len(spans) // 2]
    out = []
    for s, e in spans:
        k = round((e - s) / m) if m else 1
        if k >= 2 and abs((e - s) - k * m) <= 0.25 * m * k and k <= 4:
            step = (e - s) / k
            out.extend((int(s + j * step), int(s + (j + 1) * step) - 1) for j in range(k))
        else:
            out.append((s, e))
    return out


def read_channel_dialog(img):
    """The Change Channel window: a grid of grey channel buttons, eight or ten to a row, with the
    highlighted one in blue. Grand launch went to 40 channels, so the grid can be five rows deep.
    Works at any size the game is drawn at (every measure is taken from the buttons themselves, not from
    pixel counts tuned to one screen), and on a game stretched to a wide screen.
    Returns the highlighted channel number, or None if the window is not there or can't be read for sure."""
    import numpy as np
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    grey = (abs(r - g) < 8) & (abs(g - b) < 8) & (r > 160) & (r < 205)
    blue = (b > 195) & (r < 175) & (b - r > 55) & (g > 130)
    cells = grey | blue
    rows = cells.sum(axis=1)
    W = a.shape[1]
    # bands of rows that hold a row of buttons; kept loose here, the row's shape below is what decides
    bands, start = [], None
    for y, n in enumerate(rows):
        on = n > max(90, W * 0.06)
        if on and start is None: start = y
        if not on and start is not None:
            if y - start >= 4: bands.append((start, y))
            start = None
    if start is not None and len(rows) - start >= 4: bands.append((start, len(rows)))
    if not bands:
        return None
    def button_runs(y0, y1):
        col = cells[y0:y1].mean(axis=0) > 0.3        # white button text lowers some columns
        runs, s = [], None
        for x, on in enumerate(col):
            if on and s is None: s = x
            if not on and s is not None:
                if x - s >= 12: runs.append((s, x))
                s = None
        if s is not None and len(col) - s >= 12: runs.append((s, len(col)))
        return _split_merged(runs)
    def even(rr):
        if len(rr) not in (8, 10): return False
        widths = [e - s for s, e in rr]; pitch = (rr[-1][0] - rr[0][0]) / (len(rr) - 1)
        return (max(widths) <= min(widths) * 1.4 and pitch > min(widths)
                and all(abs((rr[k + 1][0] - rr[k][0]) - pitch) <= max(3, pitch * 0.06) for k in range(len(rr) - 1)))
    def header_above(y0, y1, x0, x1):
        # the window's blue title bar ("WINDIA") sits just above the first row of buttons; shop signs, clouds and
        # the second row of buttons don't have it. Measured in button heights, so it holds at any size.
        bh = y1 - y0
        top = a[max(0, int(y0 - 1.7 * bh)):max(0, int(y0 - 0.2 * bh)), x0:x1]
        if top.size == 0: return False
        tr, tb = top[..., 0], top[..., 2]
        return ((tb > 150) & (tr < 130) & (tb - tr > 70)).any(axis=0).mean() >= 0.6
    # Counted from the bottom: the window's orange Cancel button sits just under the last row, so the last full row of
    # buttons above it is row 5, and the lit button's row follows from the row spacing. This holds when the top of the
    # window is hidden or shadowed (another window over the game, like the watcher's own).
    def from_bottom():
        full = [(y0, y1, button_runs(y0, y1)) for y0, y1 in bands]
        full = [f for f in full if even(f[2])]
        if len(full) < 2: return None
        for k in range(len(full) - 1, 0, -1):
            y0, y1, rr = full[k]; bh = y1 - y0
            gx0, gx1 = rr[0][0], rr[-1][1]
            below = a[y1:y1 + int(3 * bh), gx0 + (gx1 - gx0) * 2 // 3:gx1]
            if not below.size: continue
            org = ((below[..., 0] > 200) & (below[..., 1] > 100) & (below[..., 1] < 175) & (below[..., 2] < 120)).sum()
            if org < max(20, 2 * bh): continue
            # the row above this one, with the same buttons, gives the spacing
            py0, py1, prr = full[k - 1]
            if len(prr) != len(rr) or any(abs(p[0] - q[0]) > 3 for p, q in zip(prr, rr)): return None
            pitch = y0 - py0
            if not (bh < pitch <= 1.6 * bh): return None
            lit = []
            for row in range(5):
                ry0 = int(round(y0 - (4 - row) * pitch)); ry1 = ry0 + bh
                if ry0 < 0: continue
                for ci, (x0, x1) in enumerate(rr):
                    if blue[ry0:ry1, x0:x1].mean() > 0.35: lit.append(row * len(rr) + ci + 1)
            return lit[0] if len(lit) == 1 else None
        return None
    fb = from_bottom()
    if fb: return fb
    # the first row of buttons is always full: eight (or ten) buttons the same width, evenly spaced, under the title
    runs, start = None, None
    for i, (y0, y1) in enumerate(bands):
        rr = button_runs(y0, y1)
        if even(rr) and header_above(y0, y1, rr[0][0], rr[-1][1]):
            runs, start = rr, i; break
    if runs is None:
        return None
    # the rows that follow it closely, with the same buttons, are the other channel rows
    bh = bands[start][1] - bands[start][0]
    keep = [bands[start]]
    for y0, y1 in bands[start + 1:]:
        if y0 - keep[-1][1] > max(4, 0.7 * bh) or len(keep) >= 6: break
        if abs((y1 - y0) - bh) > max(3, 0.35 * bh): break
        keep.append((y0, y1))
    if len(keep) != 5:
        return None          # the window is always five rows of eight (40 channels): fewer seen means part of it is hidden
    hits = []
    for bi, (y0, y1) in enumerate(keep):
        for ci, (x0, x1) in enumerate(runs):
            if blue[y0:y1, x0:x1].mean() > 0.35:
                hits.append(bi * len(runs) + ci + 1)
    return hits[0] if len(hits) == 1 else None   # two lit buttons is not a reading we can trust


# ---------------------------------------------------------------- scroll tier from the icon
# Every tiered scroll uses one of four icons: blue (Lesser), red (Intermediate), gold (Greater), grey (Chaos), the
# same for all 52 kinds. The icon at the left of the row settles the tier exactly, even when the name is cut off
# ("Scroll: C...") or the row is faded because it sold (a faded icon is the same picture mixed with the background).
TIER_NAMES = ["Lesser", "Intermediate", "Greater", "Chaos"]
_TIER_ICONS = None

_TIER_SOFT = None
def _tier_icons(soft=False):
    global _TIER_ICONS, _TIER_SOFT
    if _TIER_ICONS is None:
        import numpy as np
        from PIL import ImageFilter
        src = Image.open(os.path.join(HERE, "tiers.png")).convert("RGBA")
        s = np.asarray(src, dtype=float)
        _TIER_ICONS = [(s[:, k * 30:(k + 1) * 30, :3], s[:, k * 30:(k + 1) * 30, 3] > 200) for k in range(4)]
        b = np.asarray(src.convert("RGB").filter(ImageFilter.BoxBlur(1)), dtype=float)
        _TIER_SOFT = [(b[:, k * 30:(k + 1) * 30, :3], _TIER_ICONS[k][1]) for k in range(4)]
    return _TIER_SOFT if soft else _TIER_ICONS

def tier_from_icon(region, y):
    """'Lesser' / 'Intermediate' / 'Greater' / 'Chaos' from a shop row's icon, or None when it isn't a clear match."""
    import numpy as np
    crop = np.asarray(region.crop((2, y - 2, 48, y + 42)).convert("RGB"), dtype=float)
    best = []
    for k, (ic, op) in enumerate(_tier_icons()):
        h, w = op.shape; top = None
        bgc = np.percentile(crop.reshape(-1, 3), 90, axis=0); t = ic[op]; d = t - bgc
        # the icon sits about 9 px in from the crop's corner; a pixel or two of play either way
        for dy in range(5, 12):
            for dx in range(6, 13):
                c = crop[dy:dy + h, dx:dx + w][op]
                # faded rows: the icon mixed with a light background. Fit how faded it is, then measure what's left over.
                e = c - bgc
                f = float((d * e).sum() / max(1e-6, (d * d).sum()))
                if f < 0.15: continue
                # the worst tenth of pixels is left out: the stock number drawn over the icon's corner
                r = np.sort(((e - f * d) ** 2).sum(axis=1))
                err = float(r[: int(len(r) * 0.9)].mean())
                if top is None or err < top: top = err
        best.append((top if top is not None else 1e9, k))
    best.sort()
    (e0, k0), (e1, _) = best[0], best[1]
    if e1 > 2.5 * e0 + 20:
        return TIER_NAMES[k0]
    return None

# ---------------------------------------------------------------- what an item can carry (shared with the browser scanner)
# Which stats an equip can carry: its base stats, plus what a scroll for its slot adds. Attack on earrings, boots or a
# hat means the popup on screen belonged to another item, so its stats are not attached; a big main stat the item
# doesn't have ("LUK 70" on a claw) is a requirement line read as a bonus and is dropped on its own.
_SCROLLABLE = {"Earrings": "STR DEX INT LUK AVOID CRITDMG", "Glove": "ATT MATT ACC CRIT", "Hat": "ACC HP MP", "Cape": "ACC DEX INT LUK MDEF STR WDEF", "Top": "WDEF HP MP",
               "Bottom": "WDEF HP MP", "Overall": "WDEF DEX INT LUK STR", "Shield": "ACC WDEF", "Shoes": "AVOID JUMP SPEED", "Pet Equipment": "JUMP SPEED", "Wand": "MATT", "Staff": "MATT"}
_WEAPON = re.compile(r"Sword|Axe|Blunt|Dagger|Spear|Pole Arm|Bow|Crossbow|Claw|Knuckle|Gun")
_STATS = ["ATT", "MATT", "STR", "DEX", "INT", "LUK", "HP", "MP", "WDEF", "MDEF", "ACC", "AVOID", "SPEED", "JUMP", "CRIT", "CRITDMG"]
_SMALL = {"STR": 15, "DEX": 15, "INT": 15, "LUK": 15, "ACC": 15, "AVOID": 15, "SPEED": 15, "JUMP": 15, "HP": 60, "MP": 60, "WDEF": 40, "MDEF": 40, "CRIT": 15, "CRITDMG": 15}
try:
    _FIT = json.load(open(os.path.join(HERE, "statfit.json"), encoding="utf-8"))
except (OSError, ValueError):
    _FIT = {}
_FIT_LOW = {k.lower(): v for k, v in _FIT.items()}

def exact_fits(name, stats):
    """An exactly read popup, checked against the item (statfit.json): every base stat is there, a value without a
    bracket is exactly the base (the game brackets any stat that differs from it), no stat the item can't have, and
    the upgrades left fit the slots and the scrolls passed. (True, "") or (False, why)."""
    f = _FIT_LOW.get(re.sub(r"\s*\(.*$", "", str(name)).strip().lower())
    if not f: return False, "item not known"
    sub, base, cash = f[0], f[1], f[2]
    vals = f[3] if len(f) > 3 else {}
    allow = set(base) | set((_SCROLLABLE.get(sub) or ("ATT" if _WEAPON.search(sub) else "")).split())
    keys = [k for k in stats if k in _STATS]
    for k in keys:
        if k not in allow: return False, "other item" if k in ("ATT", "MATT") and k not in allow else "stat %s not on this item" % k
        if stats.get(k + "_b") is None:
            if k in vals and stats[k] != vals[k]: return False, "%s %s without a bracket, base is %s" % (k, stats[k], vals[k])
            if k not in vals: return False, "%s without a bracket on a stat the item has no base for" % k
    for k, v in vals.items():
        if k == "SLOTS": continue
        if k in _STATS and k not in stats: return False, "%s line missing" % k
    if "SLOTS" not in stats: return False, "upgrades line missing"
    if vals.get("SLOTS") is not None:
        if stats["SLOTS"] > vals["SLOTS"]: return False, "more slots than the item has"
        if stats.get("UP") is not None and stats["SLOTS"] > vals["SLOTS"] - stats["UP"]: return False, "slots and scrolls passed don't add up"
    return True, ""


