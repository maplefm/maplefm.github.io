import sys, os, glob
from PIL import Image, ImageSequence
SRC, OUT = sys.argv[1], sys.argv[2]
C = {"K": (58, 30, 8, 255), "G": (246, 196, 52, 255), "Y": (255, 240, 150, 255), "D": (196, 134, 22, 255), "P": (156, 92, 255, 255), "T": (64, 224, 208, 255)}
T = ["K.....K.....K",
     "KYK..KYK..KYK",
     "KGGK.KGK.KGGK",
     "KGGGKGGGKGGGK",
     "KGGGGGPGGGGGK",
     "KGTGGPPPGGTGK",
     "KDGGGGPGGGGDK",
     "KYYYYYYYYYYYK",
     "KKKKKKKKKKKKK"]
def crown(scale):
    im = Image.new("RGBA", (len(T[0]) * scale, len(T) * scale), (0, 0, 0, 0)); px = im.load()
    for y, row in enumerate(T):
        for x, ch in enumerate(row):
            if ch in C:
                for dy in range(scale):
                    for dx in range(scale): px[x * scale + dx, y * scale + dy] = C[ch]
    return im
def head(fr):
    """Top of the body: the first row at least a quarter as wide as the widest row, so an antenna, a string
    or a raised claw doesn't wear the crown."""
    a = fr.getchannel("A"); w, h = fr.size; px = a.load()
    widths = [sum(1 for x in range(w) if px[x, y] > 40) for y in range(h)]
    total = sum(widths)
    if not total: return None
    mxw = max(widths)
    top = next(y for y in range(h) if widths[y] >= mxw * 0.25)
    xs = [x for y in range(top, min(h, top + 4)) for x in range(w) if px[x, y] > 40]
    return (sum(xs) / len(xs), top, total)
for f in sorted(glob.glob(os.path.join(SRC, "*"))):
    name = os.path.basename(f); im = Image.open(f)
    frames, durs = [], []
    for fr in ImageSequence.Iterator(im):
        frames.append(fr.convert("RGBA")); durs.append(fr.info.get("duration", im.info.get("duration", 100)))
    w, h = frames[0].size
    sc = 2 if w >= 60 else 1
    cr = crown(sc); cw, ch = cr.size
    heads = [head(fr) for fr in frames]
    area0 = max((hd[2] for hd in heads if hd), default=1)
    pad = ch - 2 * sc
    out = []
    for fr, hd in zip(frames, heads):
        cv = Image.new("RGBA", (w, h + pad), (0, 0, 0, 0)); cv.paste(fr, (0, pad), fr)
        if hd and hd[2] >= area0 * 0.3:            # a dying mob that has mostly faded loses its crown too
            x = int(round(hd[0] - cw / 2)); x = max(0, min(w - cw, x))
            y = hd[1] + pad - ch + 2 * sc
            cv.alpha_composite(cr, (x, max(0, y)))
        out.append(cv)
    dst = os.path.join(OUT, name)
    if len(out) == 1 and name.endswith(".png"):
        out[0].save(dst)
    else:
        # GIF: one shared palette for every frame, index 0 kept for transparent, pixels fully on or off
        masks = [o.getchannel("A").point(lambda v: 255 if v >= 128 else 0) for o in out]
        strip = Image.new("RGB", (w, (h + pad) * len(out)), (0, 0, 0))
        for i, (o, m) in enumerate(zip(out, masks)): strip.paste(o.convert("RGB"), (0, i * (h + pad)), m)
        pq = strip.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        pal = [255, 0, 255] + pq.getpalette()[:765]
        ref = Image.new("P", (1, 1)); ref.putpalette(pal)
        frs = []
        for o, m in zip(out, masks):
            q = o.convert("RGB").quantize(palette=ref, dither=Image.Dither.NONE)
            # nothing visible may land on index 0; shift those to the nearest other index by re-quantizing against pq
            q2 = o.convert("RGB").quantize(palette=pq, dither=Image.Dither.NONE).point(lambda i: i + 1)
            q2.putpalette(pal)
            q2.paste(0, mask=m.point(lambda v: 255 - v))
            frs.append(q2)
        frs[0].save(dst, save_all=True, append_images=frs[1:], duration=durs, loop=0, disposal=2, transparency=0, optimize=False)
    print(name, out[0].size, len(out), os.path.getsize(dst))
