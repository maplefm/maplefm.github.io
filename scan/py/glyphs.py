"""Exact reader for the shop's price line ("1 for 77,777 mesos").

The game draws shop text in a pixel font with no smoothing, so every digit is always the same few pixels. This file
cuts the price line into letters and looks each one up in a table of letters learned from hand-checked shops
(glyphs.json). A price is only returned when every letter on the line is one the table knows, so it is either exactly
right or nothing: no guessing. The two text readers still read names; this settles prices when they disagree or
when one of them can't read a faded (sold) row.
"""
import json, os, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_TABLE = None

def _table():
    global _TABLE
    if _TABLE is None:
        try: _TABLE = json.load(open(os.path.join(HERE, "glyphs.json"), encoding="utf-8"))
        except Exception: _TABLE = {}
    return _TABLE

def ink_mask(tile):
    """True where a letter is drawn. Works on white, blue (selected) and faded (sold) rows: ink is whatever is much
    darker than the row's own background, judged from the left part where text always starts."""
    a = np.asarray(tile.convert("RGB"), dtype=np.int16).min(axis=2)
    bg = np.percentile(a, 80)
    left = a[:, : max(1, int(a.shape[1] * 0.55))]
    fg = np.percentile(left, 1)
    if bg - fg < 35:
        return None
    m = a < (fg + bg) / 2
    # anything covering the right side (a popup, the pointer) is not text: cut from the first column that is mostly ink
    full = m.mean(axis=0) > 0.6
    if full.any():
        c = int(np.argmax(full))
        if c > a.shape[1] * 0.45: m[:, max(0, c - 2):] = False
    # row borders: a line right across
    m[m.mean(axis=1) > 0.6, :] = False
    return m

def lines_of(m):
    """Split an ink mask into text lines: (top, bottom) row ranges with ink, allowing 1-row gaps (the dot of an i)."""
    # judged on the left part only: the pointer resting on the right can span both lines and join them
    rows = m[:, : max(1, int(m.shape[1] * 0.5))].any(axis=1)
    out, y, H = [], 0, len(rows)
    while y < H:
        if not rows[y]: y += 1; continue
        y0 = y
        while y < H and (rows[y] or (y + 1 < H and rows[y + 1])): y += 1
        if y - y0 >= 5: out.append((y0, y))
    return out

def glyphs_of(m, y0, y1):
    """Letters on one line, left to right: (x0, x1, key). A letter is a run of columns with ink; the key is its pixels
    from the line's top, so a comma (low) and an apostrophe (high) differ."""
    band = m[max(0, y0 - 2): y1 + 3]
    cols = band.any(axis=0)
    runs, x, W = [], 0, len(cols)
    while x < W:
        if not cols[x]: x += 1; continue
        x0 = x
        while x < W and cols[x]: x += 1
        g = band[:, x0:x]
        ys = np.where(g.any(axis=1))[0]
        runs.append((x0, x, int(ys[-1]), g[ys[0]: ys[-1] + 1]))
    if not runs: return []
    # heights are measured from the line's baseline (where most letters end), so a line found a pixel higher or
    # lower reads the same, and so does a word with no tall letters
    bots = [r[2] for r in runs]; ref = max(set(bots), key=lambda b: (bots.count(b), -b))
    _LAST[0] = (band, ref)
    return [(x0, x1, "%d:%d:" % (bot - ref, x1 - x0) + "".join("1" if v else "0" for v in g.ravel())) for x0, x1, bot, g in runs]

_LAST = [None]       # the band and baseline of the line glyphs_of cut last, for splitting letters that touch
_TPL = {}

def _templates(table):
    """Each single letter in a table as (char, pixels, bottom offset), widest first."""
    k = id(table)
    if k not in _TPL:
        out = []
        for key, ch in table.items():
            if not isinstance(ch, str) or len(ch) != 1: continue
            try:
                d, w, bits = key.split(":", 2); d, w = int(d), int(w)
            except ValueError:
                continue
            if not w or len(bits) % w: continue
            g = np.array([c == "1" for c in bits], dtype=bool).reshape(-1, w)
            out.append((ch, g, d))
        out.sort(key=lambda t: -t[1].shape[1])
        _TPL[k] = out
    return _TPL[k]

def split_touching(x0, x1, table):
    """Two or three letters drawn so close they touch ("yw" in Reyw, "wt" in Arrowth, "zy" in Snipzy) come out of
    glyphs_of as one shape no table has. Find the known letters that, laid side by side (a letter may share a column
    with the next), cover exactly those pixels and nothing else. The spelling with the fewest letters wins; if two
    spellings tie, it is None."""
    if _LAST[0] is None: return None
    band, ref = _LAST[0]
    R = band[:, x0:x1]
    H, W = R.shape
    if W > 24: return None
    T = _templates(table)
    found = set()
    def place(x, cov, s, depth):
        if len(found) > 20 or depth > 3: return
        if x >= W:
            if (cov == R).all(): found.add(s)
            return
        if not R[:, x].any() and x > 0:
            place(x + 1, cov, s, depth); return
        for ch, g, d in T:
            h, w = g.shape
            if x + w > W: continue
            bot = ref + d; top = bot - h + 1
            if top < 0 or bot >= H: continue
            win = R[top:bot + 1, x:x + w]
            if not g[:, 0].any() or (g & ~win).any(): continue
            c2 = cov.copy(); c2[top:bot + 1, x:x + w] |= g
            # nothing left uncovered behind this letter: every ink pixel left of its end is explained
            if (R[:, :x + w - 1] & ~c2[:, :x + w - 1]).any(): continue
            for nx in (x + w - 1, x + w):
                if nx >= W or R[:, nx].any() and depth < 3:
                    place(nx, c2, s + ch, depth + 1)
                if nx >= W: break
    place(0, np.zeros_like(R), "", 0)
    # "w" also fits as two "v" sharing a column: the fewest letters that fit is the reading, if only one does
    if not found or len(found) > 20: return None
    n = min(len(x) for x in found); best = [x for x in found if len(x) == n]
    if len(best) != 1 or n < 2: return None
    return best[0]

def text_of(gl):
    """Letters to text, with a space wherever the gap is wider than the font's letter spacing."""
    t = _table(); s = ""
    for x0, x1, key in gl:
        ch = t.get(key)
        if ch is None: return None
        s += ch
    return s

# spaces aren't kept: the line's shape alone says where the words are
_PR = re.compile(r"^(\d+)for(\d{1,3}(?:,\d{3})*)mesos$")

def read_price(tile):
    """(bundle size, price) from one shop row's tile, or None unless every letter of the price line is known."""
    try:
        m = ink_mask(tile)
        if m is None: return None
        ls = lines_of(m)
        if not ls: return None
        y0, y1 = ls[-1]
        gl = glyphs_of(m, y0, y1)
        # the line ends at "mesos"; anything after it (the pointer, a popup's edge) is not part of it
        t = _table(); s = ""
        for g in gl:
            ch = t.get(g[2])
            if ch is None: return None
            s += ch
            if s.endswith("mesos"): break
        p = _PR.match(s)
        if not p: return None
        q, pr = int(p.group(1)), int(p.group(2).replace(",", ""))
        if q < 1 or pr < 1: return None          # nothing in a shop costs 0 or comes 0 at a time: a bad read
        return q, pr
    except Exception:
        return None


# ---------------------------------------------------------------- names and sellers
# Names use the same pixel font. A few letter pairs touch and come out as one shape ("tt", "ff", "ry"); the table has
# those too. Capital I and small l are drawn the same, so names come back with "l" for both and are matched to the
# item list with that folded.
_NAMES = None

def _names():
    global _NAMES
    if _NAMES is None:
        try: _NAMES = json.load(open(os.path.join(HERE, "names.json"), encoding="utf-8"))
        except Exception: _NAMES = {}
    return _NAMES

def decode(gl, table):
    s = ""
    for i, g in enumerate(gl):
        t = table.get(g[2])
        if t is None: t = split_touching(g[0], g[1], table)
        if t is None: return None
        if i and g[0] - gl[i - 1][1] >= 4: s += " "
        s += t
    return s

def read_name(tile):
    """The item name on a shop row (first line), exactly as drawn, or None if any letter isn't one the table knows.
    A cut-off name ends in '...'."""
    try:
        m = ink_mask(tile)
        if m is None: return None
        ls = lines_of(m)
        if len(ls) < 2: return None
        gl = glyphs_of(m, *ls[0]); t = _names()
        s = decode(gl, t)
        if s is not None: return s
        # a stray mark after the name, set apart by a gap (the pointer's tip resting at the row's end): the name
        # without it, only when every letter before the gap is known. The caller still requires a real item name.
        for i in range(len(gl) - 1, 0, -1):
            if gl[i][0] - gl[i - 1][1] >= 4:
                if all(t.get(g[2]) is not None for g in gl[:i]) and any(t.get(g[2]) is None for g in gl[i:]) and len(gl) - i <= 2:
                    return decode(gl[:i], t)
                break
        return None
    except Exception:
        return None

def plate_mask(img):
    """Light letters on the navy seller plate, frame left out."""
    a = np.asarray(img.convert("RGB"), dtype=int).max(axis=2)
    m = a > 150
    m[:6, :] = False; m[-3:, :] = False; m[:, :7] = False; m[:, -6:] = False
    return m

def read_seller(plate):
    try:
        m = plate_mask(plate)
        ls = lines_of(m)
        if len(ls) != 1: return None
        s = decode(glyphs_of(m, *ls[0]), _names())
        if not s: return None
        s = s.replace(" ", "")
        # capital I and small l are the same picture: among capitals (MAIMAI, IGN) it is an I
        def up(c): return c.isupper() or c.isdigit()
        out = list(s)
        for i, c in enumerate(s):
            if c == "l":
                a = s[i - 1] if i else ""; b = s[i + 1] if i + 1 < len(s) else ""
                if (a == "" or up(a)) and (b == "" or up(b)) and (a or b): out[i] = "I"
        return "".join(out)
    except Exception:
        return None
