"""Check a blurred seller plate (stream video) against candidate spellings by drawing each one in the game's own
plate font (glyphs' names.json), blurring it the way video does, and comparing it with the picture. A text reader
mixes up g and a, y and v, a missing letter; drawn letters don't: g and y hang below the line, and every letter has
its own width, so the right spelling fits the picture and a wrong one doesn't."""
import json, os, re
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
UP = 4                      # drawing resolution: quarter pixels, for shifts smaller than a pixel
PLATE = (10, 125, 106, 149)  # the seller plate in a shop at real size
_F = None


def _font():
    global _F
    if _F is not None: return _F
    try: t = json.load(open(os.path.join(HERE, "names.json"), encoding="utf-8"))
    except Exception: t = {}
    try: gaps = json.load(open(os.path.join(HERE, "plategaps.json"), encoding="utf-8"))
    except Exception: gaps = {}
    g = {}
    for key, ch in t.items():
        if not isinstance(ch, str) or not ch: continue
        try:
            d, w, bits = key.split(":", 2); d, w = int(d), int(w)
        except ValueError:
            continue
        if not w or len(bits) % w: continue
        g[ch] = (np.array([c == "1" for c in bits], dtype=np.float32).reshape(-1, w), d)
    if "l" in g: g.setdefault("I", g["l"])          # capital I and small l are the same picture
    _F = (g, gaps, max((len(k) for k in g), default=1))
    return _F


def render(name):
    """The name drawn as the plate draws it: a 0/1 array (rows from 12 above the baseline to 5 below), or None when
    a letter isn't in the font."""
    g, gaps, mx = _font()
    parts, i = [], 0
    while i < len(name):
        for n in range(min(mx, len(name) - i), 0, -1):
            if name[i:i + n] in g:
                parts.append(name[i:i + n]); i += n; break
        else:
            return None
    TOP, BOT = 13, 5
    W = sum(g[p][0].shape[1] for p in parts) + 2 * len(parts)
    out = np.zeros((TOP + BOT, W), dtype=np.float32)
    x = 0
    for k, p in enumerate(parts):
        a, d = g[p]
        h, w = a.shape
        y1 = TOP + d; y0 = y1 - h
        if y0 < 0 or y1 > TOP + BOT: return None
        out[y0:y1, x:x + w] = np.maximum(out[y0:y1, x:x + w], a)
        x += w
        if k + 1 < len(parts):
            nxt = parts[k + 1]
            x += gaps.get(p[-1] + nxt[0], gaps.get("L" + p[-1], 2))
    return out[:, :max(1, x)]


def ink(plate):
    """How much each pixel of the plate is letter (0 navy to 1 white)."""
    a = np.asarray(plate.convert("RGB")).astype(np.float32)
    lum = a.mean(axis=2)
    inner = lum[5:21, 6:90]
    bg = np.percentile(inner, 35); fg = np.percentile(inner, 99.3)
    if fg - bg < 30: return None
    return np.clip((lum - bg) / (fg - bg), 0, 1)


def _blurred(r, sig):
    big = np.kron(r, np.ones((UP, UP), dtype=np.float32))
    pad = 40 * UP
    big = np.pad(big, pad)
    if sig > 0:
        im = Image.fromarray((big * 255).astype(np.uint8))
        big = np.asarray(im.filter(ImageFilter.GaussianBlur(sig * UP)), dtype=np.float32) / 255.0
    return big, pad


def score(obs, name, sigs=(0.7, 1.0, 1.4), hint=None):
    """How well the name drawn and blurred fits the plate picture: (correlation, (sigma, x, y)). hint narrows the
    search to the place and blur another spelling fitted best."""
    r = render(name)
    if r is None: return -1.0, None
    H, W = obs.shape
    rh, rw = r.shape
    # the letters' area of the plate: rows 3 to 22, columns 4 to 92
    oy0, oy1, ox0, ox1 = 7, 21, 7, 90
    o = obs[oy0:oy1, ox0:ox1]
    o = o - o.mean(); on = np.sqrt((o * o).sum()) or 1.0
    best = (-1.0, None)
    for sig in ([hint[0]] if hint else sigs):
        big, pad = _blurred(r, sig)
        # place: centred on the plate (column 48.5), baseline near row 17; search around it
        cx = 48.5 - rw / 2.0
        xs = [int(round(hint[1] - rw * UP / 2.0)) + d for d in range(-2, 3)] if hint else range(int((cx - 3) * UP), int((cx + 3) * UP) + 1)
        ys = [hint[2]] if hint else range((17 - 13 - 2) * UP, (17 - 13 + 3) * UP + 1, 2)
        for qy in ys:
            for qx in xs:
                # the drawing's top-left lands at plate (qx/UP, qy/UP); cut the plate's letter area out of it
                sx = pad + (ox0 * UP - qx); sy = pad + (oy0 * UP - qy)
                if sx < 0 or sy < 0: continue
                cut = big[sy:sy + (oy1 - oy0) * UP, sx:sx + (ox1 - ox0) * UP]
                if cut.shape != ((oy1 - oy0) * UP, (ox1 - ox0) * UP):
                    full = np.zeros(((oy1 - oy0) * UP, (ox1 - ox0) * UP), dtype=np.float32)
                    full[:cut.shape[0], :cut.shape[1]] = cut; cut = full
                m = cut.reshape(oy1 - oy0, UP, ox1 - ox0, UP).mean(axis=(1, 3))
                m = m - m.mean(); mn = np.sqrt((m * m).sum()) or 1.0
                c = float((m * o).sum() / (mn * on))
                if c > best[0]: best = (c, (sig, qx + rw * UP / 2.0, qy))
    return best


CONF = [("g", "a"), ("g", "q"), ("q", "a"), ("y", "v"), ("y", "u"), ("v", "u"), ("f", "t"), ("f", "r"), ("t", "r"),
        ("e", "c"), ("e", "o"), ("o", "a"), ("o", "c"), ("n", "h"), ("h", "b"), ("h", "k"), ("rn", "m"), ("vv", "w"),
        ("cl", "d"), ("ri", "n"), ("ii", "u"), ("O", "0"), ("O", "D"), ("o", "0"), ("B", "8"), ("S", "5"), ("Z", "2"),
        ("l", "i"), ("I", "i"), ("l", "1"), ("I", "1"), ("p", "q"), ("j", "i"), ("y", "g"), ("s", "z"), ("C", "G"),
        ("E", "F"), ("P", "F"), ("R", "B"), ("U", "V"), ("X", "Y"), ("M", "N"), ("w", "v"), ("x", "k"), ("Q", "O"),
        ("d", "a"), ("b", "6"), ("g", "9"), ("T", "Y"), ("u", "a"), ("r", "n"), ("t", "l"), ("f", "l")]


def variants(s, depth=2):
    """Spellings a text reader could have confused with s: one or two swapped look-alike letters."""
    out = {s}
    frontier = {s}
    for _ in range(depth):
        nxt = set()
        for t in frontier:
            for a, b in CONF:
                for x, y in ((a, b), (b, a)):
                    i = t.find(x)
                    while i >= 0:
                        v = t[:i] + y + t[i + len(x):]
                        if v not in out: nxt.add(v)
                        i = t.find(x, i + 1)
                # the same letter in the other case (sOme readers get the case of o, s, v, w, x, z, c wrong)
            for i, c in enumerate(t):
                if c.lower() in "cosuvwxz" and c.isalpha():
                    v = t[:i] + c.swapcase() + t[i + 1:]
                    if v not in out: nxt.add(v)
        out |= nxt; frontier = nxt
        if len(out) > 3000: break
    return out


def edits(s):
    """One letter dropped or one added (a blurred pair read as one letter, or a letter lost)."""
    al = "abcdefghiklmnopqrstuvwxyzABCDEFGHJKLMNOPQRSTUVWXYZ0123456789"
    out = set()
    for i in range(len(s)): out.add(s[:i] + s[i + 1:])
    for i in range(len(s) + 1):
        for c in al: out.add(s[:i] + c + s[i:])
    return out


def best_name(plate, reads, known=()):
    """The spelling that fits the plate picture best among the text reads, their look-alike swaps and the names
    in known that are close to a read. Returns (name, fit, margin) or None; margin is how much better it fits
    than the best spelling that isn't the same name with I and l swapped."""
    obs = ink(plate)
    if obs is None: return None
    reads = [r for r in dict.fromkeys(reads) if r and re.fullmatch(r"[A-Za-z0-9]{2,13}", r)]
    if not reads: return None
    # first pass: the reads themselves, to find where the name sits and how blurred it is
    sc = {r: score(obs, r) for r in reads}
    top = max(sc, key=lambda r: sc[r][0])
    hint = sc[top][1]
    if hint is None: return None
    cands = set()
    for r in reads: cands |= variants(r, 2 if r == top else 1)
    cands |= set(known)
    for c in cands:
        if c not in sc: sc[c] = score(obs, c, hint=hint)
    order = sorted(sc, key=lambda c: -sc[c][0])
    # second pass: one letter more or less on the best few
    for r in order[:2]:
        for c in edits(r):
            if c not in sc and re.fullmatch(r"[A-Za-z0-9]{2,13}", c): sc[c] = score(obs, c, hint=hint)
    order = sorted(sc, key=lambda c: -sc[c][0])
    best = order[0]
    fold = lambda x: x.replace("I", "l")
    second = next((c for c in order[1:] if fold(c) != fold(best)), None)
    margin = sc[best][0] - (sc[second][0] if second else -1)
    # among I/l twins, keep the reads' spelling (players swap I and l when whispering anyway)
    for r in reads:
        if fold(r) == fold(best): best = r; break
    return best, sc[best][0], margin, second
