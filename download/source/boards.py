"""Chat bubbles over players' heads in the Free Market Entrance: "dorai : S> MYSTERY PALETTE 100k @@@@".

Players spam sell posts there all day and the bubbles stay up for a few seconds each, so standing in the
entrance with FM Watcher open reads them like a second trade chat. Every bubble is read at several brightness
cut-offs; a seller name is kept only when most of the readings spell it exactly the same, and a price only when
the readings that found one all agree. Anything doubtful is dropped: a wrong name is worse than a missed post.
"""
import re
from collections import Counter, deque
import numpy as np
from PIL import Image
from ocrlib import ocr_lines
import fmparse

CUTS = (120, 150, 180, 205)
NAME = re.compile(r"(?<![A-Za-z0-9])([A-Za-z0-9]{3,12})\s?[:;]\s?(?=\S)")
JUNK = re.compile(r"\S*[@®©]\S*|[#=]{2,}\S*")
PRICE_AT = re.compile(r"(\d[\d.,]*\s?[kKmM])[@®©]")   # "170k@@@@": the price runs straight into the filler


def find_bubbles(img, scale=1.0):
    """White speech bubbles, as (x0, y0, x1, y1). Two bubbles that overlap side by side read as one wide box
    whose lines interleave, so boxes wider than a single bubble are left out."""
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    mn, mx = a.min(2), a.max(2)
    white = (mn >= 228) & (mx - mn <= 18)
    f = 3
    H, W = white.shape[0] // f, white.shape[1] // f
    s = white[:H * f, :W * f].reshape(H, f, W, f).mean((1, 3)) >= 0.5
    seen = np.zeros((H, W), bool)
    out = []
    ys, xs = np.nonzero(s)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if seen[y, x]:
            continue
        q = deque([(y, x)]); seen[y, x] = True
        y0 = y1 = y; x0 = x1 = x; n = 0
        while q:
            cy, cx = q.popleft(); n += 1
            if cy < y0: y0 = cy
            if cy > y1: y1 = cy
            if cx < x0: x0 = cx
            if cx > x1: x1 = cx
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < H and 0 <= nx < W and s[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        w, h = (x1 - x0 + 1) * f, (y1 - y0 + 1) * f
        if w < 60 * scale or h < 30 * scale or n * f * f / (w * h) < 0.3:
            continue
        if w > 175 * scale:
            continue
        bx = (x0 * f, y0 * f, (x1 + 1) * f, (y1 + 1) * f)
        # a bubble cut by the screen edge has lost the start of its lines (and so the start of the name)
        if bx[0] <= 2 or bx[2] >= img.width - 2 or bx[1] <= 2:
            continue
        out.append(bx)
    return out


def _texts(crop, cuts=CUTS):
    sc = 4
    g = crop.convert("L").resize((crop.width * sc, crop.height * sc), Image.BICUBIC)
    for cut in cuts:
        b = g.point(lambda v, c=cut: 0 if v < c else 255)
        t = " ".join(l["text"] for l in ocr_lines(b, scale=sc, psm=6))
        t = PRICE_AT.sub(r"\1 @", t)
        yield re.sub(r"\s{2,}", " ", JUNK.sub(" ", t)).strip()


def _posts(text):
    """'Dots : B>Mystery Pallet 100k slob : S>Wand MATK 60%' -> [('Dots', 'B>Mystery Pallet 100k'), ('slob', ...)].
    A bubble lying over another reads both, one after the other."""
    marks = [m for m in NAME.finditer(text)]
    out = []
    for k, m in enumerate(marks):
        end = marks[k + 1].start() if k + 1 < len(marks) else len(text)
        out.append((m.group(1), text[m.end():end].strip(" |")))
    return out


def read_bubble(crop):
    """[(player, side, item, price, roll)] the readings agree on."""
    first_read = [_posts(t) for t in _texts(crop, (150,))]
    if not first_read or not first_read[0] or not any(fmparse.parse_chat_message_x(m) for _, m in first_read[0]):
        return []                        # no name or no priced post: not worth three more readings
    reads = first_read + [_posts(t) for t in _texts(crop, tuple(c for c in CUTS if c != 150))]
    first = Counter(r[0][0] for r in reads if r)
    if not first:
        return []
    name, votes = first.most_common(1)[0]
    if votes < 3:                        # the name is spelled the same at three of the four cut-offs, or nothing
        return []
    found = Counter(); clash = set()
    for r in reads:
        if not r or r[0][0] != name:
            continue
        got = {}
        for side, item, price, x in fmparse.parse_chat_message_x(r[0][1]):
            got[(side, item)] = price
        for k, p in got.items():
            found[(k, p)] += 1
    by_item = {}
    for (k, p), n in found.items():
        by_item.setdefault(k, []).append((n, p))
    out = []
    for (side, item), ps in by_item.items():
        ps.sort(reverse=True)
        if len(ps) > 1 or ps[0][0] < 2:  # two readings saw a different price, or only one reading found it
            continue
        out.append((name, side, item, ps[0][1], None))
    return out


def read_boards(img, scale=1.0):
    out = []
    for b in find_bubbles(img, scale):
        out.extend(read_bubble(img.crop((b[0] + 1, b[1] + 1, b[2] - 1, b[3] - 1))))
    return out
