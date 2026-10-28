"""Turn the anonymous price inbox (a Google Form whose answers land in a Sheet) into data/inbox.json for the site.

  python tools/inbox.py OUT.json [BLOCK.json] [STATE.json]

Watchers without a token post their new and changed listings, compressed, split into parts when big (older
watchers post whole snapshots; both work). STATE.json is the lasting copy: every upload is folded into it, so the
sheet can be cleared once rows are in. OUT.json is the site's copy, one document per watcher, day and kind.
"""
import sys, os, io, csv, json, re, zlib, base64, datetime, urllib.request, hmac, hashlib

SHEET = "1zRYcSOQPakMtCUQ8dtZX_BcKxVm7YIBbmuEmsi0SG3Q"
GID = "19216923"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET}/export?format=csv&gid={GID}"
CREW = {"maya", "jack", "matt", "jimmy", "streams", "guest"}
KEEP_DAYS = 14
HV_KEYS = {"rest", "brief", "panel", "nopanel", "busy", "shots", "read", "unread", "matched", "nomatch", "got"}
MAX_ROWS_DOC = 25000          # one scanner can read a few thousand shop rows in a day; 19 channels of FM is more
MAX_ROWS_ID = 80000
# names for watchers whose config.json has none, keyed by the hashed id (hid), never the id itself
NAMES = {"85eefd149a011f8f": "Yinisera"}
# watcher tag (first 4 of the hashed id) -> the in-game name of the Discord account that linked it, from the Worker's
# /public/links. A linked watcher shows under that name whatever it read off the screen.
LINKS = {}
# The published state never holds a watcher's real id or key. Ids are stored hashed, and the signing key a
# watcher registers is stored masked with INBOX_KEY, a repository secret the pump has and the public branch doesn't.
INBOX_KEY = os.environ.get("INBOX_KEY") or ""


def hid(sid):
    return hashlib.sha256(("fm-inbox:" + sid).encode()).hexdigest()[:16]


def mask(key_hex, sid):
    """key xor sha256(INBOX_KEY:sid): recoverable only with the secret"""
    pad = hashlib.sha256((INBOX_KEY + ":" + sid).encode()).digest()
    return bytes(a ^ b for a, b in zip(bytes.fromhex(key_hex), pad)).hex()


def sig_ok(key_hex, m):
    want = hmac.new(bytes.fromhex(key_hex), ("%s|%s|%s|%s|%s" % (m["id"], m["seq"], m["k"], m["n"], m["z"])).encode(), "sha256").hexdigest()
    return hmac.compare_digest(want, str(m.get("sig") or ""))


WORKER_INBOX = "https://clubfm-accounts.aaweaver93.workers.dev/inbox/pull"


def fetch_worker_rows():
    """Posts from the Worker's inbox (watchers from 2026.10.23.3 on), read with INBOX_PULL_KEY."""
    key = os.environ.get("INBOX_PULL_KEY") or ""
    if not key: return []
    out, after = [], 0
    for _ in range(50):
        req = urllib.request.Request(WORKER_INBOX + "?after=%d" % after, headers={"User-Agent": "maplefm-inbox", "Authorization": "Bearer " + key})
        with urllib.request.urlopen(req, timeout=60) as r:
            j = json.load(r)
        rows = j.get("rows") or []
        out += [[x[0], x[1]] for x in rows]
        if len(rows) < 2000: break
        after = j.get("last") or after
    return out


def fetch_rows():
    rows = []
    try: rows += fetch_worker_rows()
    except Exception as e: print("worker inbox:", e)
    # the old Google Sheet inbox is private now; watchers older than 2026.10.23.3 must update to be read
    return rows


def clean_name(nm, sid):
    nm = re.sub(r"[^A-Za-z0-9 _.\-]", "", str(nm or "")).strip()[:16]
    if not nm:
        return "Guest-" + sid[:4]
    if nm.lower() in CREW:
        nm = nm + "-" + sid[:4]
    return nm


def s_(v, n):
    return isinstance(v, str) and 0 < len(v) <= n


def i_(v, lo, hi):
    return isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi


def clean_row(r, now):
    if not isinstance(r, dict):
        return None
    if not (s_(r.get("s"), 24) and s_(r.get("i"), 64) and i_(r.get("p"), 1, 10**11) and i_(r.get("q", 1), 1, 32767)):
        return None
    o = {"s": r["s"], "i": r["i"], "p": r["p"], "q": r.get("q", 1)}
    if i_(r.get("t"), now - 86400 * (KEEP_DAYS + 1), now + 86400):
        o["t"] = min(r["t"], now)                           # a row cannot be newer than the moment it arrived
    if r.get("so") is True:
        o["so"] = True
    if r.get("k") == "b":
        o["k"] = "b"
    if s_(r.get("r"), 40):
        o["r"] = r["r"]
    if i_(r.get("c"), 1, 40):
        o["c"] = r["c"]
    if isinstance(r.get("x"), dict) and len(r["x"]) <= 30 and all(
            s_(k, 12) and (i_(v, -9999, 99999) or s_(v, 40)) for k, v in r["x"].items()):
        o["x"] = r["x"]
    if isinstance(r.get("xt"), list) and len(r["xt"]) <= 30 and all(s_(v, 80) for v in r["xt"]):
        o["xt"] = r["xt"]
    if s_(r.get("xj"), 40):
        o["xj"] = r["xj"]
    if s_(r.get("xn"), 64):
        o["xn"] = r["xn"]
    return o


def ident(r):
    """A listing is the same listing when seller, item, price, bundle size and side match; _o tells apart
    identical listings in one shop."""
    return json.dumps([r.get("s"), r.get("i"), r.get("p"), r.get("q", 1), r.get("k", ""), r.get("_o", 0)])


def payloads(rows, block, now):
    """Complete uploads from the sheet, oldest first: [(sid, name, docs)]"""
    parts = {}
    for row in rows:
        if len(row) < 2:
            continue
        try:
            m = json.loads(row[1])
        except Exception:
            continue
        if not isinstance(m, dict) or m.get("v") not in (1, 2, 3):
            continue
        sid, seq, k, n, z = m.get("id"), m.get("seq"), m.get("k"), m.get("n"), m.get("z")
        if not (isinstance(sid, str) and re.fullmatch(r"[0-9a-f]{16}", sid)) or hid(sid) in block or sid in block:
            continue
        if not (i_(seq, 0, (now + 86400) * 1000) and i_(n, 1, 8) and i_(k, 0, n - 1) and isinstance(z, str)):
            continue
        reg = m.get("reg") if m.get("v") == 3 else None
        if m.get("v") == 3:
            if not (isinstance(reg, str) and re.fullmatch(r"[0-9a-f]{64}", reg)) or not sig_ok(reg, m):
                continue                                    # a v3 post that doesn't verify against its own key is junk
        p = parts.setdefault((sid, seq), {"n": n, "nm": m.get("nm") or m.get("ign"), "v": m.get("v"), "k": {}, "reg": reg})
        if p["reg"] != reg:
            continue
        p["k"][k] = z
    out = []
    for (sid, seq), p in sorted(parts.items(), key=lambda x: x[0][1]):
        if len(p["k"]) != p["n"]:
            continue
        try:
            raw = zlib.decompress(base64.b64decode("".join(p["k"][i] for i in range(p["n"]))), bufsize=1 << 20)
            if len(raw) > 8_000_000:
                continue
            docs = json.loads(raw)
        except Exception:
            continue
        if isinstance(docs, list):
            out.append((sid, p["nm"], p["v"], docs, p["reg"]))
    return out


def merge(state, rows, block=()):
    """Fold new uploads into the lasting copy. Uploads only add or refresh listings, so the same upload
    read twice changes nothing, and sheet rows can be cleared once they are in."""
    now = int(datetime.datetime.now(datetime.timezone.utc).timestamp())
    cutoff = (datetime.date.today() - datetime.timedelta(days=KEEP_DAYS)).isoformat()
    ids = state.setdefault("ids", {})
    # older states were keyed by the raw id; move them under the hashed id once
    for sid in [k for k in ids if not ids[k].get("h")]:
        me = ids.pop(sid); me["h"] = 1; ids[hid(sid)] = me
    for h in ids:
        if not ids[h].get("nm") and h in NAMES:
            ids[h]["nm"] = NAMES[h]
    for sid, nm, v, docs, reg in payloads(rows, block, now):
        h = hid(sid)
        me = ids.setdefault(h, {"nm": "", "docs": {}, "h": 1})
        # the first key a watcher registers is pinned; a post under this id with another key, or with none once
        # a key is pinned, is someone else and is dropped. Without INBOX_KEY nothing can be pinned or checked.
        if INBOX_KEY:
            if reg:
                if me.get("key") and not hmac.compare_digest(me["key"], mask(reg, sid)):
                    continue
                if not me.get("key"):
                    me["key"] = mask(reg, sid)
            elif me.get("key"):
                continue
        if nm:                                          # an empty name never wipes the one we already know
            me["nm"] = str(nm)[:16]
        if not me["nm"] and h in NAMES:
            me["nm"] = NAMES[h]
        for d in docs[:20]:
            if not isinstance(d, dict) or d.get("src") not in ("watcher-shop", "watcher-chat"):
                continue
            at = str(d.get("at", ""))
            try:
                t = datetime.datetime.fromisoformat(at)
            except Exception:
                continue
            if at[:10] < cutoff or t.timestamp() > now + 86400:
                continue
            key = at[:10] + "|" + d["src"]
            doc = me["docs"].setdefault(key, {"at": at, "rows": {}})
            if at > doc["at"]:
                doc["at"] = at
            # hover counts for the day (watcher 2026.10.28+): cumulative, so keep the larger of each
            if isinstance(d.get("hv"), dict):
                hvd = doc.setdefault("hv", {})
                for k, n in list(d["hv"].items())[:16]:
                    if k in HV_KEYS and isinstance(n, int) and 0 <= n <= 1000000: hvd[k] = max(hvd.get(k, 0), n)
            occ = {}
            for r in (d.get("rows") or [])[:MAX_ROWS_DOC]:
                c = clean_row(r, now)
                if not c:
                    continue
                if v == 2 and i_(r.get("_o"), 0, 999):
                    c["_o"] = r["_o"]
                else:                                   # old whole-snapshot uploads: number repeats in order
                    k0 = json.dumps([c.get("s"), c.get("i"), c.get("p"), c.get("q", 1), c.get("k", "")])
                    c["_o"] = occ.get(k0, 0); occ[k0] = c["_o"] + 1
                ik = ident(c)
                old = doc["rows"].get(ik)
                if old is None and len(doc["rows"]) >= MAX_ROWS_DOC:
                    continue
                # when the pump first saw this listing, and first saw it sold: a claimed time earlier than that is
                # a watcher's word, and credits trust the pump's clock over it
                c["fs"] = (old or {}).get("fs") or now
                if c.get("so"):
                    c["ss"] = (old or {}).get("ss") or now
                elif old and old.get("ss"):
                    c["ss"] = old["ss"]
                if old is None or c.get("t", 0) >= old.get("t", 0):
                    doc["rows"][ik] = c
    # forget old days and blocked watchers
    for sid in list(ids):
        if sid in block:
            del ids[sid]; continue
        for key in [k for k in ids[sid]["docs"] if k[:10] < cutoff]:
            del ids[sid]["docs"][key]
        if not ids[sid]["docs"]:
            del ids[sid]
    return state


def publish(state):
    """The site's copy: one document per watcher, day and kind, with the watcher's name as who."""
    names, taken = {}, {}
    for sid in sorted(state.get("ids", {})):
        nm = clean_name(LINKS.get(sid[:4]) or state["ids"][sid].get("nm"), sid)
        if nm.lower() in taken and taken[nm.lower()] != sid:
            nm = nm[:11] + "-" + sid[:4]
        taken[nm.lower()] = sid
        names[sid] = nm
    out = []
    for sid, me in state.get("ids", {}).items():
        total = 0
        for key in sorted(me["docs"], reverse=True):
            day, src = key.split("|", 1)
            doc = me["docs"][key]
            rows = []
            for r in doc["rows"].values():
                r = dict(r); r.pop("_o", None); rows.append(r)
            total += len(rows)
            if total > MAX_ROWS_ID:
                break
            o = {"at": doc["at"], "src": src, "rows": rows, "who": names[sid], "inbox": sid[:4]}
            if doc.get("hv"): o["hv"] = doc["hv"]
            out.append(o)
    out.sort(key=lambda d: (d["at"], d["who"], d["src"]))
    return out


def build(rows, block=()):
    """Everything from scratch, from sheet rows alone."""
    return publish(merge({"ids": {}}, rows, block))


def main():
    out = sys.argv[1]
    block = set()
    if len(sys.argv) > 2 and os.path.exists(sys.argv[2]):
        try:
            block = set(json.load(open(sys.argv[2])))
        except Exception:
            pass
    statep = sys.argv[3] if len(sys.argv) > 3 else None
    if len(sys.argv) > 4 and os.path.exists(sys.argv[4]):
        try:
            for k, v in (json.load(open(sys.argv[4])) or {}).items():
                if isinstance(v, str) and v and not str(k).startswith("stream:"): LINKS[str(k)[:4]] = v
        except Exception:
            pass
    state = {"ids": {}}
    if statep and os.path.exists(statep):
        try:
            state = json.load(open(statep, encoding="utf-8"))
        except Exception:
            pass
    state = merge(state, fetch_rows(), block)
    if statep:
        json.dump(state, open(statep, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False, sort_keys=True)
    docs = publish(state)
    json.dump(docs, open(out, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    print(len(docs), "documents,", sum(len(d["rows"]) for d in docs), "rows, from", len(state.get("ids", {})), "watchers")


if __name__ == "__main__":
    main()
