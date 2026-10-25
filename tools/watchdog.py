"""Club FM watchdog: checks the public site, the price API and the data pipeline every 15 minutes, repairs what can
repair itself, and writes data/watchdog.json on the live branch. The Worker reads that file and DMs the admins when
something breaks or comes back.

Repairs it can make on its own:
1. A scheduled workflow that failed in the last 3 hours gets its failed jobs re-run, once.
2. The live pump gets restarted when the price data has gone stale and no pump is running.
3. Item pages get rebuilt when an item page or the sitemap is missing.
Anything else is reported for the daily check-up to fix by hand."""
import calendar, json, os, sys, time, urllib.request, urllib.error

REPO = os.environ.get("GITHUB_REPOSITORY", "maplefm/maplefm.github.io")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
SITE = "https://maplefm.gg"
UA = {"User-Agent": "clubfm-watchdog", "Cache-Control": "no-cache"}
OUT = sys.argv[1] if len(sys.argv) > 1 else "data/watchdog.json"
NOW = time.time()


def get(url, timeout=25):
    t = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)
        return r.status, r.read().decode("utf-8", "replace"), int((time.time() - t) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, "", int((time.time() - t) * 1000)
    except Exception as e:
        return 0, str(e)[:120], int((time.time() - t) * 1000)


def gh(path, method="GET", body=None):
    req = urllib.request.Request("https://api.github.com/repos/" + REPO + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + TOKEN, "Accept": "application/vnd.github+json", "User-Agent": "clubfm-watchdog"})
    try:
        r = urllib.request.urlopen(req, timeout=25)
        txt = r.read().decode()
        return r.status, json.loads(txt) if txt.strip() else {}
    except urllib.error.HTTPError as e:
        return e.code, {}
    except Exception:
        return 0, {}


checks, repairs = [], []


def check(name, ok, detail="", ms=None, fix=None):
    checks.append({"name": name, "ok": bool(ok), "detail": detail, "ms": ms, "fix": fix})
    return ok


# 1. Pages people land on: right status and the words that prove the page rendered
PAGES = [
    ("Price board", "/", "Club FM"),
    ("For streamers", "/streamers.html", "Pick your chat bot"),
    ("How it works", "/how-it-works.html", "How Club FM works"),
    ("Quest log", "/quests.html", "Quest"),
    ("Earn by scanning", "/contribute.html", "Earn by"),
    ("Maps and training", "/map.html", "Maps and Training"),
    ("Player market", "/market.html", "Player market"),
    ("Shops", "/shop.html", "Shops"),
    ("Training guide", "/training/", "training guide"),
    ("Map page", "/map/sleepywood/", "Sleepywood"),
    ("Weekly recap", "/recap/", "This week on the"),
    ("Item list", "/items/", "Work Gloves"),
    ("Item page", "/item/work-gloves/", "Work Gloves"),
    ("Sitemap", "/sitemap.xml", "<urlset"),
    ("Partner link", "/niru/", "niru"),
]
for name, path, must in PAGES:
    st, body, ms = get(SITE + path)
    ok = st == 200 and must in body
    check(name, ok, "loads" if ok else f"status {st}" + ("" if st != 200 else f", missing '{must}'"), ms,
          "itempages" if not ok and path in ("/items/", "/item/work-gloves/", "/sitemap.xml") else None)

# 2. The !price answer on both addresses chat bots use
for name, base in (("!price (api.maplefm.gg)", "https://api.maplefm.gg"), ("!price (old address)", "https://clubfm-accounts.aaweaver93.workers.dev")):
    st, body, ms = get(base + "/chat/price?q=work%20gloves")
    ok = st == 200 and body.startswith("Work Gloves:")
    check(name, ok, body[:90] if ok else f"status {st} {body[:60]}", ms)

# 2b. The server-built board first visits load: uploaded by the pump within the last half hour
st, body, ms = get("https://api.maplefm.gg/data/snap-status")
try:
    sj = json.loads(body); sage = (NOW * 1000 - sj.get("at", 0)) / 60000
    ok = bool(sj.get("ok")) and sage < 60
    check("Server-built board", ok, f"uploaded {sage:.0f} min ago" if ok else f"last upload {sage:.0f} min ago, {sj.get('error') or 'not ok'}", ms, None if ok else "pump")
except Exception:
    check("Server-built board", False, f"no status (status {st})", ms)

# 2c. The player market: listings answer, and the #selling sync has run in the last half hour
st, body, ms = get("https://api.maplefm.gg/market/stats")
try:
    mj = json.loads(body); sy = mj.get("sync") or {}; mage = (NOW - sy.get("at", 0)) / 60
    err = (sy.get("out") or {}).get("error")
    ok = st == 200 and mage < 30 and not err
    check("Player market", ok, f"{mj.get('open', 0)} open listings, #selling synced {mage:.0f} min ago" if ok else (f"#selling sync: {err}" if err else f"#selling last synced {mage:.0f} min ago"), ms)
except Exception:
    check("Player market", False, f"no answer (status {st})", ms)

# 3. Fresh prices: the live pump signs the data every few minutes
st, body, ms = get("https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/live.sig?t=" + str(int(NOW)))
age = None
try:
    age = (NOW * 1000 - json.loads(body)["at"]) / 60000
except Exception:
    pass
fresh = age is not None and age < 45
check("Fresh prices", fresh, f"updated {age:.0f} min ago" if age is not None else f"no signature (status {st})", ms, None if fresh else "pump")

st, body, ms = get("https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/summary-public.json?t=" + str(int(NOW)))
try:
    n = len(json.loads(body).get("rows") or json.loads(body))
except Exception:
    n = 0
check("Price data", n > 100, f"{n} items" if n else f"unreadable (status {st})", ms)

# 4. Workflows: failed scheduled jobs get one automatic re-run; the pump gets restarted when prices go stale
if TOKEN:
    st, runs = gh("/actions/runs?per_page=60")
    runs = runs.get("workflow_runs", []) if isinstance(runs, dict) else []
    recent = [r for r in runs if NOW - calendar.timegm(time.strptime(r["created_at"], "%Y-%m-%dT%H:%M:%SZ")) < 3 * 3600]
    latest = {}
    for r in runs:
        latest.setdefault(r["name"], r)
    bad = [r for r in latest.values() if r.get("conclusion") in ("failure", "timed_out", "startup_failure") and r in recent]
    for r in bad:
        if r.get("run_attempt", 1) == 1 and r["name"] != "Watchdog":
            s, _ = gh(f"/actions/runs/{r['id']}/rerun-failed-jobs", "POST")
            repairs.append({"what": f"re-ran failed job: {r['name']}", "ok": s in (201, 204)})
    check("Scheduled jobs", not bad, "all passing" if not bad else "failed: " + ", ".join(sorted({r["name"] for r in bad})))

    def running(wf_name):
        return any(r["name"] == wf_name and r["status"] in ("queued", "in_progress", "waiting", "pending") for r in runs)

    def dispatch(file, why):
        s, _ = gh(f"/actions/workflows/{file}/dispatches", "POST", {"ref": "main"})
        repairs.append({"what": why, "ok": s == 204})

    if not fresh and not running("Live pump"):
        dispatch("pump.yml", "restarted the live pump (prices were stale)")
    if any(c["fix"] == "itempages" and not c["ok"] for c in checks) and not running("Item pages"):
        dispatch("itempages.yml", "rebuilt the item pages")

# 5. Status, plus a short incident history so the Worker and the daily check-up can see what happened
failing = sorted(c["name"] for c in checks if not c["ok"])
try:
    old = json.load(open(OUT))
except Exception:
    old = {}
hist = old.get("history", [])
if failing != old.get("failing", []) or repairs:
    hist.append({"at": int(NOW), "failing": failing, "repairs": repairs})
beat = old.get("beat", 0)
changed = failing != old.get("failing", []) or bool(repairs) or NOW - beat > 6 * 3600
out = {"at": int(NOW), "ok": not failing, "failing": failing, "checks": checks, "repairs": repairs, "history": hist[-60:],
       "beat": int(NOW) if changed else beat}
json.dump(out, open(OUT, "w"), indent=1, ensure_ascii=False)
if changed:
    open("/tmp/wd_changed", "w").write("1")
print(("OK" if not failing else "FAILING: " + ", ".join(failing)) + (" | repairs: " + "; ".join(r["what"] for r in repairs) if repairs else ""))
for c in checks:
    print(("  ok  " if c["ok"] else "  BAD ") + c["name"] + ": " + c["detail"])
