"""Scanner health, per scanner over the last 24 hours and 7 days, so a watcher that stops reading rooms, falls behind
or runs an old version gets noticed in hours, not days.

  python3 tools/health.py DATA_DIR OUT.json [VERSION_JSON]

Reads DATA_DIR/inbox.json (the published uploads; each row's fs is when the pump first saw it) and
DATA_DIR/inbox_state.json (watcher versions and why uploads or rows were dropped), plus the Worker's rejected-upload
counts (/inbox/rejects with INBOX_PULL_KEY). Writes OUT.json:
  {"at", "bars", "scanners": {name: {...}}, "drops", "rejects", "flags": [plain sentences]}
Scanner names are already public (ranks, Earn), so the file is safe to publish; no listings are in it.
The watchdog turns flags into an admin alert.
"""
import json, os, re, sys, time, urllib.request

BARS = {"room": 0.80,        # healthy scanners place 91 to 100% of shops in a room; under 80% means the room reader is failing
        "late": 0.02,        # rows reaching the pump over an hour after the scan; normal is under 1%
        "behind": 2,         # releases behind the current watcher
        "min_rows": 300}     # only judge a scanner with this many shop rows in the last 24 hours
FM = re.compile(r"^FM\d+$")
# Shops also go up outside the Free Market (on Nov 6 a scanner read about 240 shops in Kerning City Construction Site on
# four channels). The watcher only sends a map name the game has, so a known map is a working room read, not a miss.
try: MAPS = set(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scan", "py", "maps.json"), encoding="utf-8")))
except Exception: MAPS = set()
def placed_room(r):
    r = str(r or "")
    return bool(FM.match(r)) or r == "FM Entrance" or r in MAPS


def load(p, d):
    try: return json.load(open(p, encoding="utf-8"))
    except Exception: return d


def rejects():
    key = os.environ.get("INBOX_PULL_KEY") or ""
    if not key: return {}
    try:
        req = urllib.request.Request("https://api.maplefm.gg/inbox/rejects", headers={"Authorization": "Bearer " + key, "User-Agent": "clubfm-pump"})
        return json.load(urllib.request.urlopen(req, timeout=20))
    except Exception:
        return {}


def double_scans(state, now, links_path="/tmp/links.json"):
    """One person running two scanners at once (FM Watcher and the browser, or two PCs) gets paid twice on anything
    counted per scanner. Two signs, last 24 hours:
    1. two scanner ids of the same person (linked to one Discord account, or using one name) reading shops in the
       same 10 minutes, on 3 or more separate 10-minute spans;
    2. any two scanners reading the same sellers on the same channel within 10 minutes, 5 or more times (different
       people never did in a week of data: they spread over channels)."""
    links = load(links_path, {}) if os.path.exists(links_path) else {}
    links = {str(k)[:4]: str(v) for k, v in (links or {}).items() if isinstance(v, str) and not str(k).startswith("stream:")}
    since = now - 86400
    spans, seen, names = {}, {}, {}
    for h, me in (state.get("ids") or {}).items():
        tag = h[:4]; nm = me.get("nm") or tag
        names[tag] = nm
        person = (links.get(tag) or nm).lower()
        for key, doc in (me.get("docs") or {}).items():
            if not key.endswith("|watcher-shop"): continue
            for r in (doc.get("rows") or {}).values():
                t = r.get("t") or 0
                if t < since: continue
                spans.setdefault(person, {}).setdefault(tag, set()).add(int(t // 600))
                if r.get("c"): seen.setdefault((str(r.get("s", "")).lower(), r["c"]), []).append((t, tag))
    out = []
    for person, by in spans.items():
        tags = sorted(by)
        for i in range(len(tags)):
            for j in range(i + 1, len(tags)):
                both = by[tags[i]] & by[tags[j]]
                if len(both) >= 3:
                    out.append(f"{names[tags[i]]}: two scanners ({tags[i]} and {tags[j]}) read shops at the same time in {len(both)} ten-minute spans today. One person running two scanners at once counts twice on anything counted per scanner.")
    pair = {}
    for (seller, ch), hits in seen.items():
        hits.sort()
        for i, (t, a) in enumerate(hits):
            for t2, b in hits[i + 1:]:
                if t2 - t > 600: break
                if a != b: k = tuple(sorted((a, b))); pair.setdefault(k, set()).add((seller, ch))
    for (a, b), shops in pair.items():
        if len(shops) >= 5 and (links.get(a) or names.get(a, a)).lower() != (links.get(b) or names.get(b, b)).lower():
            out.append(f"{names.get(a, a)} ({a}) and {names.get(b, b)} ({b}) read the same {len(shops)} shops on the same channels within minutes today. That looks like one person on two scanners: check before paying either.")
    return out


def main():
    data, out = sys.argv[1], sys.argv[2]
    cur = (load(sys.argv[3], {}) if len(sys.argv) > 3 else {}) or {}
    hist = [h.get("version") for h in cur.get("history", [])] or [cur.get("version")]
    docs = load(os.path.join(data, "inbox.json"), [])
    state = load(os.path.join(data, "inbox_state.json"), {})
    now = time.time(); day, week = now - 86400, now - 7 * 86400
    S = {}
    for d in docs:
        who = d.get("who") or "?"
        s = S.setdefault(who, {"rows24": 0, "room24": 0, "ch24": 0, "rows7": 0, "room7": 0, "late7": 0, "lag": [], "chat24": 0, "last": 0, "ver": d.get("ver") or ""})
        if d.get("ver"): s["ver"] = d["ver"]
        for r in d.get("rows") or []:
            t = r.get("t") or 0
            if t < week: continue
            s["last"] = max(s["last"], t)
            if d.get("src") == "watcher-chat":
                if t >= day: s["chat24"] += 1
                continue
            placed = placed_room(r.get("r")) and bool(r.get("c"))
            s["rows7"] += 1; s["room7"] += placed
            lag = (r.get("fs") or t) - t
            if lag > 3600: s["late7"] += 1
            if t >= day:
                s["rows24"] += 1; s["room24"] += placed; s["ch24"] += bool(r.get("c"))
                if 0 <= lag < 86400: s["lag"].append(lag)
    flags = []
    flags += double_scans(state, now)
    for who, s in S.items():
        lag = sorted(s.pop("lag"))
        s["lag_median_min"] = round(lag[len(lag) // 2] / 60, 1) if lag else None
        s["room_rate24"] = round(s["room24"] / s["rows24"], 3) if s["rows24"] else None
        s["room_rate7"] = round(s["room7"] / s["rows7"], 3) if s["rows7"] else None
        s["late_share7"] = round(s["late7"] / s["rows7"], 3) if s["rows7"] else None
        s["behind"] = hist.index(s["ver"]) if s["ver"] in hist else None
        if s["rows24"] >= BARS["min_rows"]:
            if s["room_rate24"] < BARS["room"]:
                flags.append(f"{who}: {round(s['room_rate24'] * 100)}% of shops placed in a room in the last 24 hours ({s['rows24']} shop rows)")
            if s["late_share7"] and s["late_share7"] > BARS["late"]:
                flags.append(f"{who}: {round(s['late_share7'] * 100, 1)}% of rows reached us over an hour late this week")
            if s["behind"] is not None and s["behind"] >= BARS["behind"]:
                flags.append(f"{who}: watcher {s['ver']}, {s['behind']} releases behind")
    drops = state.get("drops") or {}
    rej = rejects()
    for d, o in sorted(rej.items())[-1:]:
        n = sum(o.values())
        if n >= 20: flags.append(f"Worker turned away {n} uploads on {d}: " + ", ".join(f"{k} {v}" for k, v in o.items()))
    json.dump({"at": int(now * 1000), "bars": BARS, "current": cur.get("version"), "scanners": S,
               "drops": dict(sorted(drops.items())[-7:]), "rejects": rej, "flags": flags}, open(out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("scanner health:", len(S), "scanners,", len(flags), "flags")
    for f in flags: print(" ", f)


if __name__ == "__main__":
    main()
