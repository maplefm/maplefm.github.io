"""Split the icons cut from shop windows into small files the site loads only when it needs one.
  python tools/icons.py DATA_DIR
Reads data/*-icons.json and writes data/icons/<3 letters>.json, keyed the way the site looks names up (ocr_key).
"""
import sys, os, re, json, glob

def ocr_key(s):
    s = s.lower().replace("ri", "n").replace("rn", "m").replace("vv", "w")
    s = re.sub(r"[^a-z0-9|]", "", s)
    s = re.sub(r"[l1|]", "i", s).replace("t", "f")
    s = re.sub(r"[vy]", "w", s).replace("0", "o").replace("5", "s")
    return s

def main():
    d = sys.argv[1]
    out = {}
    files = sorted(glob.glob(os.path.join(d, "*-icons.json")), key=lambda f: ("streams" in f, f))   # watcher crops first
    for f in files:
        try: icons = json.load(open(f, encoding="utf-8"))
        except Exception: continue
        for name, v in icons.items():
            if not isinstance(v, str) or not v.startswith("data:image/png;base64,") or len(v) > 40000: continue
            clean = re.sub(r"(\.{2,}|…|\((name|tier) cut off\)).*$", "", name).strip()
            k = ocr_key(clean)
            if len(k) < 3: continue
            out.setdefault(k[:3], {}).setdefault(k, v)
    od = os.path.join(d, "icons"); os.makedirs(od, exist_ok=True)
    keep = set()
    for p, m in out.items():
        fn = os.path.join(od, p + ".json"); keep.add(fn)
        body = json.dumps(m, separators=(",", ":"), sort_keys=True)
        try:
            if open(fn, encoding="utf-8").read() == body: continue
        except OSError: pass
        open(fn, "w", encoding="utf-8").write(body)
    for fn in glob.glob(os.path.join(od, "*.json")):
        if fn not in keep: os.remove(fn)
    print(len(out), "files,", sum(len(m) for m in out.values()), "icons")

if __name__ == "__main__":
    main()
