"""Stamp index.html with the current hash of assets/board.css and assets/board.js, so browsers fetch a fresh copy
the moment either changes. Run after editing either file:  python tools/bust.py"""
import hashlib, os, re
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
p = os.path.join(R, "index.html"); s = open(p, encoding="utf-8").read()
for f in ("board.css", "board.js"):
    h = hashlib.md5(open(os.path.join(R, "assets", f), "rb").read()).hexdigest()[:8]
    s = re.sub(r"/assets/" + re.escape(f) + r"\?v=[0-9a-f]+", f"/assets/{f}?v={h}", s)
open(p, "w", encoding="utf-8").write(s); print("stamped")
