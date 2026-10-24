"""Ko-fi cover, 1400 x 467: the Club FM app tile with the Superstar Crown, the name and the line under it.
  python tools/emoji/kofi_cover.py OUT.png"""
import sys, os
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
import ss_data

W, H = 1400, 467
def font(name, size):
    for p in ["/usr/share/fonts/truetype/inter/" + name, "/usr/share/fonts/opentype/inter/" + name.replace(".ttf", ".otf")]:
        if os.path.exists(p): return ImageFont.truetype(p, size)
    import subprocess
    path = subprocess.run(["fc-match", "-f", "%{file}", name.split(".")[0].replace("-", ":style=")], capture_output=True, text=True).stdout
    return ImageFont.truetype(path, size)

bg = Image.new("RGBA", (W, H)); px = bg.load()
for y in range(H):
    for x in range(W):
        t = x / W; u = y / H
        r = int(26 + 70 * t * (1 - u) + 10 * (1 - u)); g = int(10 + 22 * t * (1 - u)); b = int(60 + 120 * t * (1 - u) + 20 * (1 - u))
        px[x, y] = (min(r, 255), min(g, 255), min(b, 255), 255)
d = ImageDraw.Draw(bg)
# app tile
tile = Image.open("clubfm-icon-512.png").convert("RGBA").resize((250, 250), Image.LANCZOS)
m = Image.new("L", tile.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, 249, 249], 52, fill=255)
tx, ty = 175, (H - 250) // 2
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle([tx + 6, ty + 14, tx + 256, ty + 264], 52, fill=(0, 0, 0, 110))
from PIL import ImageFilter
bg = Image.alpha_composite(bg, sh.filter(ImageFilter.GaussianBlur(14)))
bg.paste(tile, (tx, ty), m)
d = ImageDraw.Draw(bg)
fb = font("Inter-ExtraBold.ttf", 118); fs = font("Inter-SemiBold.ttf", 40)
x0 = tx + 250 + 64; yb = H // 2 - 92
d.text((x0, yb), "Club ", font=fb, fill=(255, 255, 255))
w = d.textlength("Club ", font=fb)
d.text((x0 + w, yb), "FM", font=fb, fill=(255, 217, 102))
d.text((x0 + 4, yb + 150), "Free Market prices for MapleStory Classic", font=fs, fill=(226, 214, 255))
bg.convert("RGB").save(sys.argv[1])
print("ok")
