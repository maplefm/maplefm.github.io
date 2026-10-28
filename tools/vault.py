"""Keeps the scan data on the public data branch encrypted.

Every data file that holds listings, sellers or pay records is stored as <name>.enc: AES-256-GCM over the
gzipped JSON, keyed by the DATA_KEY secret (base64, 32 bytes). Only the GitHub jobs and the Club FM Worker
hold the key. Public files (the trimmed price summary, ranks, the market report, item data, icons) stay plain.

  python3 tools/vault.py unlock DIR          decrypt DIR/data/*.enc next to themselves (plain copies are gitignored)
  python3 tools/vault.py lock DIR            encrypt every private plain file whose contents changed
  python3 tools/vault.py bundle DIR          write DIR/data/live.json (what signed-in members load) and live.sig
  python3 tools/vault.py cat FILE.enc NAME   print one encrypted file, NAME being its path like data/summary.json
  python3 tools/vault.py key                 print a new random key

File format: b"FMV1" + 12-byte nonce + ciphertext and tag. The file's path (data/x.json) is the associated data,
so one file can't be passed off as another.
"""
import base64, gzip, json, os, sys, time

MAGIC = b"FMV1"
# plain on purpose: what every visitor already sees on the board or the public pages
PUBLIC = {"itemdb.json", "names.json", "summary-public.json", "ranks.json", "report.json", "credits.json",
          "maintenance.json", "nexon_news.json", "live.sig", "hoverwanted.json"}
# what a signed-in member's board loads, in one file
MEMBER = ["watcher.json", "watcher-2.json", "watcher-3.json", "watcher-4.json", "streams.json",
          "streams-vods.json", "inbox.json", "watcher-sell.json", "watcher-2-sell.json", "watcher-3-sell.json",
          "watcher-4-sell.json"]


# the public price summary: prices only. Listings, sellers, the cheapest ask and deals stay for signed-in members.
KEEP = ("last3", "rk", "item", "baseName", "cat", "tier", "n", "kind", "check", "flags", "typ", "lo", "hi", "mv", "daily", "salesN",
        "vol", "equip", "move", "basis", "typWho", "conf", "capped")


def top_roll(r):
    """The roll sold most often above clean, for item pages: [gain, typical price, sales, stat]. Keys are "roll|slots|stat"
    (older ones "roll|slots"). Nothing else of the roll prices leaves the members' summary."""
    best = None
    for k, v in (r.get("rt") or {}).items():
        try:
            parts = str(k).split("|"); g = int(parts[0]); p, n = float(v[0]), int(v[1])
        except Exception: continue
        st = parts[2] if len(parts) > 2 else ""
        if st == "TOTAL": continue
        if g > 0 and n >= 2 and (best is None or n > best[2] or (n == best[2] and g > best[0])): best = [g, round(p), n, st]
    return best

def public_summary(j):
    pub = dict(j); pub["rows"] = [dict({k: r[k] for k in KEEP if k in r}, **({"r1": top_roll(r)} if top_roll(r) else {})) for r in (j.get("rows") or []) if isinstance(r, dict)]
    pub["public"] = True
    return pub


def is_public(name):
    return name in PUBLIC or name.endswith("-icons.json")


def key():
    k = os.environ.get("DATA_KEY", "")
    if not k: sys.exit("DATA_KEY is not set")
    b = base64.b64decode(k)
    if len(b) != 32: sys.exit("DATA_KEY must be 32 bytes, base64")
    return b


def aes():
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    return AESGCM(key())


def seal(plain, name):
    n = os.urandom(12)
    return MAGIC + n + aes().encrypt(n, gzip.compress(plain, 9, mtime=0), name.encode())


def open_(blob, name):
    if blob[:4] != MAGIC: raise ValueError("not a vault file: " + name)
    return gzip.decompress(aes().decrypt(blob[4:16], blob[16:], name.encode()))


def private_plain(d):
    out = []
    for f in sorted(os.listdir(d)):
        if f.endswith(".json") and not is_public(f): out.append(f)
    return out


def unlock(root):
    d = os.path.join(root, "data"); n = 0
    if not os.path.isdir(d): return
    for f in sorted(os.listdir(d)):
        if not f.endswith(".enc"): continue
        name = f[:-4]
        open(os.path.join(d, name), "wb").write(open_(open(os.path.join(d, f), "rb").read(), "data/" + name)); n += 1
    print("unlocked", n)


def lock(root):
    d = os.path.join(root, "data"); changed = []
    for f in private_plain(d):
        p = os.path.join(d, f); e = p + ".enc"
        plain = open(p, "rb").read()
        if os.path.exists(e):
            try:
                if open_(open(e, "rb").read(), "data/" + f) == plain: continue
            except Exception: pass
        open(e, "wb").write(seal(plain, "data/" + f)); changed.append(f)
    print("locked", len(changed), " ".join(changed))


def bundle(root):
    d = os.path.join(root, "data"); out = {}
    for f in MEMBER:
        p = os.path.join(d, f)
        if os.path.exists(p):
            try: out["data/" + f] = json.load(open(p, encoding="utf-8"))
            except Exception: pass
    body = json.dumps(out, separators=(",", ":")).encode()
    old = os.path.join(d, "live.json")
    if os.path.exists(old) and open(old, "rb").read() == body: return
    open(old, "wb").write(body)
    # the public stamp the board checks before asking for the bundle: a time and nothing else
    json.dump({"at": int(time.time() * 1000)}, open(os.path.join(d, "live.sig"), "w"))
    print("bundle", len(body), "bytes")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "unlock": unlock(sys.argv[2])
    elif cmd == "lock": lock(sys.argv[2])
    elif cmd == "bundle": bundle(sys.argv[2])
    elif cmd == "pubsum":
        d = os.path.join(sys.argv[2], "data")
        json.dump(public_summary(json.load(open(os.path.join(d, "summary.json"), encoding="utf-8"))), open(os.path.join(d, "summary-public.json"), "w", encoding="utf-8"), separators=(",", ":"))
    elif cmd == "cat": sys.stdout.buffer.write(open_(open(sys.argv[2], "rb").read(), sys.argv[3]))
    elif cmd == "key": print(base64.b64encode(os.urandom(32)).decode())
    else: sys.exit(__doc__)
