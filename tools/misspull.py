"""Bring the watchers' unreadable pictures (popups and room titles they couldn't read) into the private archive.

  python3 tools/misspull.py DATA_DIR

Lists new ones from the Worker (/inbox/miss, INBOX_PULL_KEY), saves each as DATA_DIR/miss/<day>/<scanner>-<kind>-<time>.png
and adds a line to DATA_DIR/miss/index.json (scanner, kind, what was being read, watcher version). Keeps 14 days.
The archive is private; nothing here is published.
"""
import sys, os, json, hashlib, datetime, urllib.request, urllib.parse, shutil

W = "https://clubfm-accounts.aaweaver93.workers.dev"
D = sys.argv[1]
KEY = os.environ.get("INBOX_PULL_KEY") or ""


def get(path):
    req = urllib.request.Request(W + path, headers={"Authorization": "Bearer " + KEY, "User-Agent": "clubfm-pump"})
    return urllib.request.urlopen(req, timeout=30).read()


def names():
    """the watcher's picture id is a hash of its inbox id; map it back to the scanner name"""
    out = {}
    try:
        ids = json.load(open(os.path.join(D, "inbox_state.json"), encoding="utf-8")).get("ids", {})
        for sid, me in ids.items():
            out[hashlib.sha256(("fm-inbox:" + sid).encode()).hexdigest()[:16]] = me.get("nm") or sid[:4]
    except Exception:
        pass
    return out


def main():
    if not KEY:
        print("misspull: no key"); return
    root = os.path.join(D, "miss"); os.makedirs(root, exist_ok=True)
    ip = os.path.join(root, "index.json")
    try: idx = json.load(open(ip, encoding="utf-8"))
    except Exception: idx = {"after": 0, "items": []}
    items = json.loads(get("/inbox/miss?after=" + str(idx.get("after", 0)))).get("items", [])
    nm = names(); got = 0
    for it in items:
        t = int(it["t"]); day = datetime.datetime.utcfromtimestamp(t / 1000).strftime("%Y-%m-%d")
        who = "".join(c for c in str(nm.get(it.get("hid"), it.get("hid", "")[:6])) if c.isalnum() or c in "-_") or "x"
        name = f"{day}/{who}-{it.get('kind')}-{datetime.datetime.utcfromtimestamp(t / 1000).strftime('%H%M%S')}.png"
        try:
            png = get("/inbox/miss/" + urllib.parse.quote(it["key"], safe=""))
        except Exception as e:
            print("misspull", it["key"], e); continue
        os.makedirs(os.path.join(root, day), exist_ok=True)
        open(os.path.join(root, name), "wb").write(png)
        idx["items"].append({"file": name, "who": who, "kind": it.get("kind"), "info": it.get("info", ""), "ver": it.get("ver", ""), "t": t})
        idx["after"] = max(idx.get("after", 0), t); got += 1
    # 14 days kept
    cut = (datetime.datetime.utcnow() - datetime.timedelta(days=14)).strftime("%Y-%m-%d")
    for d in os.listdir(root):
        if len(d) == 10 and d < cut: shutil.rmtree(os.path.join(root, d), ignore_errors=True)
    idx["items"] = [x for x in idx["items"] if x["file"][:10] >= cut]
    json.dump(idx, open(ip, "w", encoding="utf-8"), indent=0)
    print("misspull:", got, "new")


if __name__ == "__main__":
    main()
