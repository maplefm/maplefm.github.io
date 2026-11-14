"""Build the board's minified files and stamp index.html with their hashes, so browsers fetch a fresh copy the
moment either changes. Edit assets/board.css and assets/board.js (the readable sources), then run:
    python tools/bust.py
It writes assets/board.min.css and assets/board.min.js with esbuild (npx); without it, plain copies are used."""
import hashlib, os, re, subprocess, shutil
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
A = os.path.join(R, "assets")
# the stat search loads on demand from board.js: stamp its hash there first, so a change reaches browsers at once
_adv = os.path.join(A, "advsearch.js")
if os.path.exists(_adv):
    _h = hashlib.md5(open(_adv, "rb").read()).hexdigest()[:8]
    _bp = os.path.join(A, "board.js"); _bs = open(_bp, encoding="utf-8").read()
    _bs2 = re.sub(r'var ADVV = "[^"]*"', 'var ADVV = "' + _h + '"', _bs, count=1)
    if _bs2 != _bs: open(_bp, "w", encoding="utf-8").write(_bs2)
for src, dst, loader in (("board.js", "board.min.js", "js"), ("board.css", "board.min.css", "css")):
    s, d = os.path.join(A, src), os.path.join(A, dst)
    try:
        subprocess.run(["npx", "-y", "esbuild@0.24.0", s, "--minify", "--log-level=error", "--target=es2017" if loader == "js" else "--target=chrome80,safari13", "--outfile=" + d], check=True, timeout=120)
    except Exception as e:
        print("esbuild unavailable, using a plain copy:", e); shutil.copyfile(s, d)
p = os.path.join(R, "index.html"); s = open(p, encoding="utf-8").read()
for f in ("board.min.css", "board.min.js"):
    h = hashlib.md5(open(os.path.join(A, f), "rb").read()).hexdigest()[:8]
    s = re.sub(r"/assets/board(?:\.min)?\." + f.split(".")[-1] + r"\?v=[0-9a-f]+", f"/assets/{f}?v={h}", s)
open(p, "w", encoding="utf-8").write(s); print("built and stamped")
