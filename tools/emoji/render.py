import asyncio, sys, io, os
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import art
from playwright.async_api import async_playwright
OUT = "out"; os.makedirs(OUT, exist_ok=True)
only = sys.argv[1:] or list(art.ANIMS)

def to_gif(frames, durs, path):
    # GIF has 1-bit transparency: alpha above a threshold keeps the pixel, below drops it. The dark outline
    # around every shape hides the hard edge on both light and dark Discord themes.
    pal = []
    for im in frames:
        a = im.split()[3]
        rgb = Image.new("RGB", im.size, (36, 16, 79)); rgb.paste(im, mask=a)
        p = rgb.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        mask = a.point(lambda v: 255 if v < 110 else 0)
        p.paste(255, mask=mask)
        pal.append(p)
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=durs, loop=0, disposal=2, transparency=255, optimize=False)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 128, "height": 128}, device_scale_factor=1)
        for name in only:
            fn, n, dur = art.ANIMS[name]
            frames = []
            for f in range(n):
                await pg.set_content('<html><body style="margin:0;background:transparent">' + fn(f, n) + '</body></html>')
                png = await pg.screenshot(omit_background=True, clip={"x": 0, "y": 0, "width": 128, "height": 128})
                frames.append(Image.open(io.BytesIO(png)).convert("RGBA"))
            to_gif(frames, [dur] * n, f"{OUT}/{name}.gif")
            frames[n // 3].save(f"{OUT}/{name}_still.png")
            print(name, n, os.path.getsize(f"{OUT}/{name}.gif"))
        await b.close()
asyncio.run(main())
