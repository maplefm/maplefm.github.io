"""Pack the browser scanner's reading files from the FM Watcher download, so the browser reads exactly like the
watcher: same fmparse.py, glyph tables, exact popup reader and item list. Run after every watcher release.
  python3 tools/scanpack.py            -> scan/py/*  (from download/FMWatcher.zip) + scan/py/manifest.json
  python3 tools/scanpack.py --src DIR  (from a watcher source folder, for testing before a release)
"""
import zipfile, json, os, hashlib, shutil, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "scan", "py")
FILES = ["fmparse.py", "glyphs.py", "ocrlib.py", "tipexact.py", "items.json", "glyphs.json", "names.json", "chat_names.json",
         "tiers.png", "statfit.json", "tipglyphs.json", "watcher.py", "boards.py", "reference.json"]
os.makedirs(OUT, exist_ok=True)
SRC = sys.argv[sys.argv.index("--src") + 1] if "--src" in sys.argv else None
z = None if SRC else zipfile.ZipFile(os.path.join(ROOT, "download", "FMWatcher.zip"))
import re
ver = re.search(r'^VERSION = "([^"]+)"', open(os.path.join(SRC, "watcher.py")).read(), re.M).group(1) if SRC else json.load(open(os.path.join(ROOT, "download", "version.json")))["version"]
man = {"version": ver, "files": {}}
for f in FILES:
    data = open(os.path.join(SRC, f), "rb").read() if SRC else z.read("FMWatcher/" + f)
    open(os.path.join(OUT, f), "wb").write(data)
    man["files"][f] = hashlib.sha256(data).hexdigest()[:12]
for f in ("scanglue.py", "cursor.json"):
    data = open(os.path.join(ROOT, "scan", "src", f), "rb").read()
    open(os.path.join(OUT, f), "wb").write(data); man["files"][f] = hashlib.sha256(data).hexdigest()[:12]
json.dump(man, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
print("scan/py from watcher", man["version"], len(man["files"]), "files")
