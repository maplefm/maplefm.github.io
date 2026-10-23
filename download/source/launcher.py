"""Club FM launcher: start.bat runs this. It checks maplefm.gg for a newer watcher, patches this folder
like a game launcher would, then starts the watcher.

What it changes: only the watcher's own program files listed in the download. Your token.txt, your settings in
config.json, your saved prices and the review folder are kept. New settings are added to config.json with their
default values; settings you changed are left alone. Replaced files are copied to update_backup first.

It only downloads from https://maplefm.gg and checks the file's fingerprint (sha256) before using it.
"""
import sys, os, io, json, re, shutil, zipfile, hashlib, subprocess, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
SITE = "https://maplefm.gg"
# never overwritten by an update: personal files, and start.bat because Windows is still reading it while this runs
KEEP = {"token.txt", "config.json", "channel.txt", "anon_id.txt", "inbox_key.txt", "start.bat", "watcher_data_v2.json", "watcher.log"}


def say(*a):
    print("[Club FM]", *a, flush=True)


def ver_tuple(v):
    return tuple(int(x) for x in re.findall(r"\d+", str(v)))


def local_version():
    try:
        m = re.search(r'^VERSION = "([^"]+)"', open(os.path.join(HERE, "watcher.py"), encoding="utf-8").read(), re.M)
        return m.group(1) if m else "0"
    except OSError:
        return "0"


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "fm-launcher", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def merge_config(new_bytes):
    p = os.path.join(HERE, "config.json")
    try:
        new = json.loads(new_bytes.decode("utf-8"))
    except Exception:
        return
    if not os.path.exists(p):
        open(p, "wb").write(new_bytes); return
    try:
        cur = json.load(open(p, encoding="utf-8"))
    except Exception:
        say("config.json could not be read, leaving it as it is"); return
    added = [k for k in new if k not in cur]
    if added:
        for k in added:
            cur[k] = new[k]
        json.dump(cur, open(p, "w", encoding="utf-8"), indent=2)
        pass


# Releases are signed. version.json carries a signature over the version, the zip's sha256 and the pip list,
# made with a key that never leaves Adam's PC; this is the matching public key. Anything unsigned, or signed
# with another key, is not installed, so neither a hijacked site nor a tampered download can push code here.
RELEASE_KEY_N = int("c8a0ad587cd024247e8a7e58f5f8104e5a7b885649f0cd1494ad2021755dc09566cf336f31d48801f10a5bd44e64aa3c77d559509fd30594ccabe3aed99d1f6a86e370a619e4375fc16775929dd9311b33fdfa7f0253b5f11b94ed4c43c11d181fe2254646ed4e7726f6019d2a724eccbc1d8899f872be99370c00a6ca00cf3da37560d1b7651f160455df5238796ee1ce364575d21bd000ae1c8a53cbfa3834f58a7479334490301534eeebf286e1d260fae6c2b71c3474d3889ef9f5f3a00ce11b573337047ad3f67107a196b8a175b730ced511db63ad6f67bc8618c4eb303d45a9d28dc4f1ca07b1a0f269f471557da7f01b3422071641761c5bca39b8c5", 16)
RELEASE_KEY_E = 65537
_SHA256_DI = bytes.fromhex("3031300d060960864801650304020105000420")

def release_ok(info):
    """True when version.json is signed by the release key (RSA PKCS#1 v1.5, SHA-256)."""
    try:
        msg = (str(info["version"]) + "|" + str(info["sha256"]) + "|" + json.dumps(info.get("pip") or [], separators=(",", ":"))).encode()
        sig = int(str(info["sig"]), 16)
        if not (0 < sig < RELEASE_KEY_N): return False
        em = pow(sig, RELEASE_KEY_E, RELEASE_KEY_N).to_bytes(256, "big")
        want = b"\x00\x01" + b"\xff" * (256 - 3 - len(_SHA256_DI) - 32) + b"\x00" + _SHA256_DI + hashlib.sha256(msg).digest()
        return em == want
    except Exception:
        return False

PIP_OK = re.compile(r"^[A-Za-z0-9_.\-]+(==[0-9][0-9A-Za-z.]*)?$")

def update():
    have = local_version()
    try:
        info = json.loads(fetch(SITE + "/download/version.json?nocache=1", 15))
    except Exception as e:
        say("Couldn't check for updates right now. Starting your current version."); return
    want = str(info.get("version", "0"))
    if ver_tuple(want) <= ver_tuple(have):
        say("Club FM Watcher " + have + " is up to date."); return
    say("Updating Club FM Watcher to " + want + "...")
    if info.get("notes"):
        say("Patch notes: " + info["notes"])
    try:
        data = fetch(SITE + "/download/FMWatcher.zip?v=" + want, 120)
    except Exception as e:
        say("The update couldn't download right now. Starting your current version."); return
    if not release_ok(info):
        say("This update isn't signed by Club FM, so it was not installed. Starting your current version."); return
    if hashlib.sha256(data).hexdigest() != str(info.get("sha256")):
        say("The update didn't download correctly. Starting your current version; it will try again next time."); return
    z = zipfile.ZipFile(io.BytesIO(data))
    backup = os.path.join(HERE, "update_backup")
    os.makedirs(backup, exist_ok=True)
    n = 0
    for m in z.infolist():
        if m.is_dir():
            continue
        rel = m.filename.split("/", 1)[1] if m.filename.startswith("FMWatcher/") else m.filename
        rel = rel.replace("\\", "/")
        if not rel or rel.startswith("/") or ".." in rel.split("/"):
            continue
        body = z.read(m)
        name = os.path.basename(rel)
        if name == "config.json" and "/" not in rel:
            merge_config(body); continue
        if name in KEEP and "/" not in rel:
            continue
        dst = os.path.join(HERE, *rel.split("/"))
        if os.path.exists(dst):
            if open(dst, "rb").read() == body:
                continue
            os.makedirs(os.path.dirname(os.path.join(backup, rel)) or backup, exist_ok=True)
            shutil.copy2(dst, os.path.join(backup, rel))
        os.makedirs(os.path.dirname(dst) or HERE, exist_ok=True)
        open(dst, "wb").write(body)
        n += 1
    pip = [str(x) for x in (info.get("pip") or []) if PIP_OK.match(str(x))]   # package names only, never pip options
    if pip:
        say("Installing a few extra parts...")
        subprocess.call([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "-q"] + list(pip))
    say("Update complete. You're on " + want + ". Your settings are kept.")


def main():
    args = [a for a in sys.argv[1:] if a != "--no-update"]
    env = dict(os.environ); env["FM_LAUNCHER"] = "1"
    first = True
    while True:
        if "--no-update" not in sys.argv or not first:
            try:
                update()
            except Exception as e:
                say("Update skipped. Starting your current version.")
        first = False
        try:
            code = subprocess.call([sys.executable, os.path.join(HERE, "watcher.py")] + args, env=env)
        except KeyboardInterrupt:
            return
        if code != 75:              # the watcher asks for 75 when it has seen a newer version and wants patching
            sys.exit(code)
        say("Patching and starting again...")


if __name__ == "__main__":
    main()
