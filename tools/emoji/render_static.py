import asyncio, io, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
import static
from playwright.async_api import async_playwright
os.makedirs("out_static", exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 128, "height": 128})
        for n, s in static.STAT.items():
            await pg.set_content('<html><body style="margin:0;background:transparent">' + s + '</body></html>')
            png = await pg.screenshot(omit_background=True, clip={"x": 0, "y": 0, "width": 128, "height": 128})
            open(f"out_static/{n}.png", "wb").write(png)
        await b.close()
asyncio.run(main())
names = list(static.STAT)
cols = 10; sheet = Image.new("RGBA", (cols * 70 + 10, 2 * 140 + 10), (49, 51, 56, 255)); light = Image.new("RGBA", sheet.size, (255, 255, 255, 255))
for k, n in enumerate(names):
    im = Image.open(f"out_static/{n}.png").convert("RGBA")
    x, y = 10 + (k % cols) * 70, 10 + (k // cols) * 140
    for sh in (sheet, light):
        sh.alpha_composite(im.resize((64, 64), Image.LANCZOS), (x, y)); sh.alpha_composite(im.resize((32, 32), Image.LANCZOS), (x + 16, y + 74))
sheet.save("_static_dark.png"); light.save("_static_light.png"); print("ok", len(names))
