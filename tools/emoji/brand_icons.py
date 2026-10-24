"""Club FM's logo crown is the Superstar Crown (Cash Shop item 1007750). Redraws every logo file with it:
the favicon, the app icon, the 512 server icon, the social card and the static :crown: emoji.
  python tools/emoji/brand_icons.py      (run from the repo root)"""
import os, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
import ss_data
SS = ss_data.superstar()                     # 28 x 24, pixel art

def big(n):
    """the crown at a whole-number pixel scale, so it stays crisp"""
    return SS.resize((SS.width * n, SS.height * n), Image.NEAREST)

def grad(w, h, a=(139, 92, 246), b=(59, 26, 122)):
    g = Image.new("RGBA", (w, h)); px = g.load()
    for y in range(h):
        for x in range(w):
            t = (x + y) / (w + h - 2)
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)
    return g

def rounded(im, r):
    m = Image.new("L", im.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], r, fill=255)
    out = Image.new("RGBA", im.size, (0, 0, 0, 0)); out.paste(im, (0, 0), m); return out

def tile(size, radius, scale, dy=0):
    t = grad(size, size); c = big(scale)
    t.alpha_composite(c, ((size - c.width) // 2, (size - c.height) // 2 + dy))
    return rounded(t, radius) if radius else t

# assets the pages use
os.makedirs("assets", exist_ok=True)
SS.save("assets/superstar.png")
big(4).save("assets/superstar@4x.png")
tile(64, 14, 2).save("og-icon.png")
tile(180, 0, 5).save("apple-touch-icon.png")

# 512 server and bot icon: the crown over FM, the FM lettering kept from the old icon
old = Image.open("clubfm-icon-512.png").convert("RGBA")
ic = grad(512, 512, (139, 92, 246), (82, 38, 170)); c = big(10)
ic.alpha_composite(c, ((512 - c.width) // 2, 34))
ic.alpha_composite(old.crop((0, 300, 512, 512)), (0, 300)) if False else None
fm = old.crop((110, 305, 402, 470))
m = Image.new("L", fm.size, 0); fpx = fm.load(); mpx = m.load()
for y in range(fm.height):
    for x in range(fm.width):
        r, g, b, a = fpx[x, y]
        if (r > 200 and g > 200) or (r < 70 and g < 60 and b < 110): mpx[x, y] = 255   # cream letters and their dark outline
ic.paste(fm, (110, 305), m)
ic.save("clubfm-icon-512.png")

# social card: the crown inside the square on the left
og = Image.open("og.png").convert("RGBA")
inner = (92, 207, 308, 423)                           # inside the gold border
box = grad(inner[2] - inner[0], inner[3] - inner[1], (78, 44, 168), (96, 56, 196))
c = big(6); box.alpha_composite(c, ((box.width - c.width) // 2, (box.height - c.height) // 2))
og.paste(rounded(box, 22), inner[:2], rounded(box, 22))
og.convert("RGB").save("og.png")

# the static :crown: emoji
e = Image.new("RGBA", (128, 128), (0, 0, 0, 0)); c = big(4)
e.alpha_composite(c, ((128 - c.width) // 2, (128 - c.height) // 2)); e.save("assets/emoji/crown.png")
print("done")
