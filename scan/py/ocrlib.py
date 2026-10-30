import subprocess, csv, io, os, tempfile, shutil
from PIL import Image, ImageChops, ImageOps

TESS = shutil.which("tesseract") or r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def min_channel(im):
    r, g, b = im.convert("RGB").split()
    return ImageChops.darker(ImageChops.darker(r, g), b)

def prep(im, lo, hi, scale=4):
    """Dark text on a light or coloured ground -> clean black on white, upscaled."""
    m = min_channel(im)
    k = 255.0 / max(1, hi - lo)
    m = m.point(lambda v: 0 if v <= lo else 255 if v >= hi else int((v - lo) * k))
    return m.resize((m.width * scale, m.height * scale), Image.BICUBIC)

def ocr_lines(img, scale=4, psm=6):
    """Run tesseract, return [{'text','x','y','w','h'}] in source-pixel units (pre-upscale)."""
    fd, path = tempfile.mkstemp(suffix=".png"); os.close(fd)
    try:
        img.save(path)
        # one thread per tesseract: several readers run side by side, and tesseract's own threading only
        # fights them for the CPU
        env = dict(os.environ); env.setdefault("OMP_THREAD_LIMIT", "1")
        out = subprocess.run([TESS, path, "-", "--psm", str(psm), "tsv"], capture_output=True, text=True, encoding="utf-8", errors="replace",
                             env=env, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout
    finally:
        try: os.remove(path)
        except OSError: pass
    groups = {}
    for r in csv.DictReader(io.StringIO(out), delimiter="\t", quoting=csv.QUOTE_NONE):
        t = (r.get("text") or "").strip()
        if not t: continue
        groups.setdefault((r["block_num"], r["par_num"], r["line_num"]), []).append(r)
    lines = []
    for ws in groups.values():
        x0 = min(int(w["left"]) for w in ws); y0 = min(int(w["top"]) for w in ws)
        x1 = max(int(w["left"]) + int(w["width"]) for w in ws); y1 = max(int(w["top"]) + int(w["height"]) for w in ws)
        lines.append({"text": " ".join(w["text"] for w in ws), "x": x0 / scale, "y": y0 / scale,
                      "w": (x1 - x0) / scale, "h": (y1 - y0) / scale})
    lines.sort(key=lambda l: (l["y"], l["x"]))
    return lines
