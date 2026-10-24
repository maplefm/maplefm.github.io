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
import ss_data
SS = ss_data.superstar()
def crown(scale):
    # the Superstar Crown (Cash Shop item 1007750), smaller on the little mobs
    if scale >= 2: return SS
    return SS.resize((round(SS.width * 0.75), round(SS.height * 0.75)), Image.LANCZOS)
def crown_pixel(scale):
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

HEAD = {  # name: (head x share, side view facing left)
    "blue_snail": (.27, True), "red_snail": (.27, True), "snail": (.27, True), "snail_dead": (.22, True),
    "bubbling": (.42, False), "curse_eye": (.30, True), "dark_stump": (.45, False), "drake": (.17, True),
    "evil_eye": (.26, True), "evil_eye_dead": (.20, True), "fire_boar": (.13, True),
    "green_mushroom": (.45, False), "green_mushroom_dead": (.45, False), "horny_mushroom": (.45, False),
    "jrbalrog": (.47, False), "jrbalrog_dead": (.45, False), "jrnecki": (.30, True), "ligator": (.30, True),
    "lorang": (.36, False), "lupin": (.30, True), "mano": (.24, True), "mushmom": (.45, False), "mushmom_dead": (.45, False),
    "octopus": (.45, False), "octopus_dead": (.45, False), "orange_mushroom": (.45, False), "orange_mushroom_dead": (.45, False),
    "pig": (.30, True), "pig_dead": (.32, True), "ribbon_pig": (.30, True), "slime": (.36, False), "slime_dead": (.36, False),
    "stone_golem": (.47, False), "stump": (.45, False), "stump_dead": (.45, False), "wild_boar": (.20, True),
    "zombie_mushmom": (.45, False), "zombie_mushroom": (.45, False),
}
def head_at(fr, share):
    """top of the head: the highest solid pixel in a narrow band of columns around the head"""
    a = fr.getchannel("A"); w, h = fr.size; px = a.load()
    total = sum(1 for y in range(h) for x in range(w) if px[x, y] > 40)
    if not total: return None
    cx = int(round(share * (w - 1))); half = max(3, int(w * 0.06))
    band = range(max(0, cx - half), min(w, cx + half + 1))
    for y in range(h):
        n = sum(1 for x in band if px[x, y] > 40)
        if n >= max(2, len(band) // 3):
            return (cx, y, total)
    return None

for f in sorted(glob.glob(os.path.join(SRC, "*"))):
    name = os.path.basename(f); im = Image.open(f)
    frames, durs = [], []
    for fr in ImageSequence.Iterator(im):
        frames.append(fr.convert("RGBA")); durs.append(fr.info.get("duration", im.info.get("duration", 100)))
    w, h = frames[0].size
    sc = 2 if w >= 60 else 1
    cr = crown(sc); cw, ch = cr.size
    key = os.path.splitext(name)[0]; share, side = HEAD.get(key, (.45, False))
    crw = cr.transpose(Image.FLIP_LEFT_RIGHT) if side else cr
    base_x = crw.width * (13 / 28 if side else 15 / 28)      # middle of the crown's band, not of the picture
    heads = [head_at(fr, share) for fr in frames]
    area0 = max((hd[2] for hd in heads if hd), default=1)
    sink = max(3, ch // 6)                                    # the band sits a little into the head
    pad = max(0, ch - sink - min((hd[1] for hd in heads if hd), default=0))
    padx_l = max(0, int(-(min((hd[0] for hd in heads if hd), default=0) - base_x)))
    padx_r = max(0, int(max((hd[0] for hd in heads if hd), default=0) - base_x + crw.width - w))
    out = []
    for fr, hd in zip(frames, heads):
        cv = Image.new("RGBA", (w + padx_l + padx_r, h + pad), (0, 0, 0, 0)); cv.paste(fr, (padx_l, pad), fr)
        if hd and hd[2] >= area0 * 0.3:
            x = int(round(padx_l + hd[0] - base_x)); y = hd[1] + pad - ch + sink
            cv.alpha_composite(crw, (x, max(0, y)))
        out.append(cv)
    w2, h2 = out[0].size
    dst = os.path.join(OUT, name)
    if len(out) == 1 and name.endswith(".png"):
        out[0].save(dst)
    else:
        # GIF: one shared palette for every frame, index 0 kept for transparent, pixels fully on or off
        masks = [o.getchannel("A").point(lambda v: 255 if v >= 128 else 0) for o in out]
        strip = Image.new("RGB", (w2, h2 * len(out)), (0, 0, 0))
        for i, (o, m) in enumerate(zip(out, masks)): strip.paste(o.convert("RGB"), (0, i * h2), m)
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
