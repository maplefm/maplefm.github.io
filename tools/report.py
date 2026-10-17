"""Daily market report, like an end-of-day stock market summary.

Reads every watcher and stream data file, works out each item's price for each day (Eastern time),
and builds a chained price index for the whole market (the Guild FM index) and for each category:
Commodity (ores, gems, drops), Scroll, Weapon, Armor, Potion (potions and food), Cosmetic (Cash Shop)
and Stars. Each index starts at 100 on its first day; a day's move is the geometric mean of the
day-over-day price change of every item seen on both days.

Usage: python3 report.py <data dir> <itemdb.json> <out report.json>
The output keeps its own history, so the index survives old raw data rolling off.
"""
import json, os, sys, glob, math, datetime, statistics
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
DATA, DB, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
CATS = ["Commodity", "Scroll", "Weapon", "Armor", "Potion", "Cosmetic", "Stars"]
BLURB = {"Commodity": "ores, gems and drops", "Scroll": "scrolls", "Weapon": "weapons", "Armor": "armor pieces",
         "Potion": "potions and foods", "Cosmetic": "Cash Shop cosmetics", "Stars": "stars and bullets"}

db = {}
for r in json.load(open(DB, encoding="utf-8"))["items"]:
    db.setdefault(r[0].lower(), r)

def category(name):
    r = db.get(name.lower())
    if not r:
        return None
    i, cash = r[1], r[4]
    t, sub = i // 1000000, i // 10000
    if t == 1:
        if cash or sub >= 170: return "Cosmetic"
        return "Weapon" if sub >= 130 else "Armor"
    if t == 2:
        if sub in (207, 233): return "Stars"
        if sub == 204: return "Scroll"
        if sub in (200, 201, 202): return "Potion"
        return None
    if t == 4: return "Commodity"
    if t == 5: return "Cosmetic"
    return None

# ---- every shop row, as (day, item, unit price, sold)
obs = {}
for f in glob.glob(os.path.join(DATA, "*.json")):
    b = os.path.basename(f)
    if any(x in b for x in ("icons", "sell", "maintenance", "report", "itemdb")):
        continue
    try:
        scans = json.load(open(f, encoding="utf-8"))
    except Exception:
        continue
    if isinstance(scans, dict):
        scans = scans.get("scans") or []
    seen = set()
    for s in scans if isinstance(scans, list) else []:
        if not isinstance(s, dict) or "chat" in (s.get("src") or ""):
            continue
        try:
            st = datetime.datetime.fromisoformat(s["at"]).timestamp()
        except Exception:
            st = None
        for r in s.get("rows") or []:
            if r.get("k") == "b" or not r.get("p"):
                continue
            name = (r.get("i") or "").strip()
            cat = category(name)
            if not cat:
                continue
            t = r.get("t") or st
            if not t:
                continue
            key = (r.get("s"), name, r["p"], r.get("q", 1), int(t // 3600))
            if key in seen:
                continue
            seen.add(key)
            q = 1 if cat == "Stars" else max(1, r.get("q") or 1)
            day = datetime.datetime.fromtimestamp(t, ET).date().isoformat()
            obs.setdefault(name, []).append((day, r["p"] / q, bool(r.get("so")), r["p"], r.get("s") or "", t))

# ---- each item's price per day, junk and spot-holder prices left out
daily, sales = {}, {}
for name, rows in obs.items():
    med = statistics.median(u for _, u, *_ in rows)
    by = {}
    for day, u, so, p, s, t in rows:
        if med and (u > med * 5 or u < med / 5):
            continue
        by.setdefault(day, []).append(u)
        if so:
            sales.setdefault(day, []).append((name, u, p, s, t))
    daily[name] = {d: (statistics.median(v), len(v)) for d, v in by.items() if len(v) >= 2}

days = sorted({d for v in daily.values() for d in v})
if not days:
    print("no data"); sys.exit(0)

def prev_day(d):
    """The last earlier day with data, up to 4 days back (nobody may have scanned on a given day)."""
    for k in range(1, 5):
        p = (datetime.date.fromisoformat(d) - datetime.timedelta(days=k)).isoformat()
        if p in days:
            return p
    return (datetime.date.fromisoformat(d) - datetime.timedelta(days=1)).isoformat()

def move(d, cat=None):
    """Geometric mean of each item's change from the day before, and how many rose and fell."""
    p = prev_day(d); logs = []; rose = fell = 0; movers = []
    for name, v in daily.items():
        if cat and category(name) != cat:
            continue
        if d in v and p in v:
            r = max(0.5, min(2.0, v[d][0] / v[p][0]))
            logs.append(math.log(r))
            if r > 1.02: rose += 1
            elif r < 0.98: fell += 1
            if min(v[d][1], v[p][1]) >= 3:
                movers.append((name, r - 1, v[d][0], v[p][0], v[d][1]))
    if not logs:
        return None
    return {"f": math.exp(sum(logs) / len(logs)), "n": len(logs), "rose": rose, "fell": fell, "movers": movers}

try:
    old = json.load(open(OUT, encoding="utf-8"))
except Exception:
    old = {}
hist = old.get("history", {})       # day -> {index name -> value}

series = {}
for key in ["Market"] + CATS:
    cat = None if key == "Market" else key
    val = None; out = {}
    all_days = sorted(set(days) | {d for d, h in hist.items() if key in h})
    for d in all_days:
        m = move(d, cat) if d in days else None
        if m and val is not None and prev_day(d) in out:      # chained from the previous day with data
            val = val * m["f"]
        elif d in hist and key in hist[d] and d not in days:
            val = hist[d][key]
        elif val is None:
            val = 100.0
        out[d] = round(val, 2)
    series[key] = out

for d in sorted({d for s in series.values() for d in s}):
    hist[d] = {k: s[d] for k, s in series.items() if d in s}

# ---- one report per day with data; the newest is the headline (the job runs just before midnight Eastern)
def make(today):
    def card(key):
        s = series[key]; ds = [d for d in sorted(s) if d <= today]
        cur = s.get(today); prv = s.get(prev_day(today))
        m = move(today, None if key == "Market" else key)
        n_items = sum(1 for name in daily if (key == "Market" or category(name) == key) and today in daily[name])
        return {"name": key, "value": cur, "chg": (cur / prv - 1) if cur and prv else None,
                "series": [[d, s[d]] for d in ds[-30:]], "rose": m["rose"] if m else 0, "fell": m["fell"] if m else 0,
                "items": n_items, "blurb": BLURB.get(key, "items")}
    mk = move(today)
    movers = sorted(mk["movers"], key=lambda x: x[1]) if mk else []
    fmt = lambda x: {"item": x[0], "chg": round(x[1], 4), "price": round(x[2]), "was": round(x[3]), "seen": x[4], "cat": category(x[0])}
    day_sales = sales.get(today, [])
    vol = {}
    for name, u, p, sl, t in day_sales:
        v = vol.setdefault(name, [0, 0]); v[0] += 1; v[1] += p
    return {
        "day": today,
        "market": card("Market"),
        "categories": [card(c) for c in CATS],
        "gainers": [fmt(x) for x in movers[::-1][:8] if x[1] > 0],
        "losers": [fmt(x) for x in movers[:8] if x[1] < 0],
        "most_traded": [{"item": k, "sales": v[0], "volume": v[1], "cat": category(k)} for k, v in sorted(vol.items(), key=lambda kv: -kv[1][1])[:8]],
        "biggest_sale": (lambda b: {"item": b[0], "price": b[2], "seller": b[3]} if b else None)(max(day_sales, key=lambda x: x[2]) if day_sales else None),
        "stats": {"sales": len(day_sales), "volume": sum(x[2] for x in day_sales),
                  "listings": sum(1 for v in obs.values() for r in v if r[0] == today),
                  "items": sum(1 for v in daily.values() if today in v)},
    }

past = old.get("days", {})
for d in days:
    past[d] = make(d)          # recomputed while the raw data is still around; older days are kept as they were
# the day being closed: today in Eastern time, or yesterday if the job runs in the first hours after midnight
now = datetime.datetime.now(ET)
close = (now.date() - datetime.timedelta(days=1 if now.hour < 4 else 0)).isoformat()
latest = close if close in past else max(d for d in past if d <= close) if any(d <= close for d in past) else days[-1]
report = dict(past[latest])
report["generated"] = datetime.datetime.now(ET).isoformat(timespec="seconds")
report["history"] = hist
report["days"] = {d: past[d] for d in sorted(past)[-45:]}
json.dump(report, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
print(latest, "market", report["market"]["value"], report["market"]["chg"], "items", report["stats"]["items"], "days", len(report["days"]))
