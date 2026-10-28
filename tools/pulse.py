"""The market's pulse, hour by hour: which Free Market room and channel spots a scanner read, how many shops sat in
each, and who was scanning. Feeds the owner's daily scoreboard and the 7-day coverage map.
  python tools/pulse.py DATA_DIR OUT.json
  python tools/pulse.py --seed ARCHIVE_REPO DAYS SEED.json   (once: rebuild past days from the archive's git history)
Run on every pump pass. A shop row's t is the last time anyone read it, so each pass catches the visits since the one
before; the hour's spot sets are the union over passes. Hours and days are Eastern (America/Detroit).
Sets are kept for the last two days so later passes can add to them, then folded into counts.
Private: lives in the archive only. Never copy it to the public branch (it has scanner and seller names).
It also writes covhours.json next to it: the public 7-day coverage by hour, spots and counts only, no names.
"""
import sys, os, re, json, datetime
from zoneinfo import ZoneInfo
ET = ZoneInfo("America/Detroit")
KEEP_DAYS = 35
OPEN_DAYS = 2
FMR = re.compile(r"^FM(\d{1,2})$")


_ETC = {}
def et(t):
    """(Eastern day, hour). Eastern offsets are whole hours, so one lookup per UTC hour."""
    k = int(t) // 3600
    v = _ETC.get(k)
    if v is None:
        d = datetime.datetime.fromtimestamp(k * 3600, ET)
        v = _ETC[k] = (d.date().isoformat(), d.hour)
    return v
_ROOMC = {}


def fm_room(r):
    r = str(r or "")
    v = _ROOMC.get(r, 0)
    if v == 0: v = _ROOMC[r] = _fm_room(r)
    return v


def _fm_room(r):
    """The room number, read the way the board reads it (fixRoom0): shops only open in Free Market rooms, so a
    minimap title misread as something else keeps its lone number. None when no room number can be trusted."""
    r = str(r or "")
    m = FMR.match(r)
    if m: return int(m.group(1))
    if not r or r == "chat" or re.search(r"entr", r, re.I): return None
    if not re.search(r"(fr)?e\s*e?\s*mark|m[ae]rk[ae]t|mar?k[ae]t", r, re.I):
        lone = re.findall(r"(?:^|\D)(\d{1,2})(?!\d)", r)
        return int(lone[0]) if len(lone) == 1 and 1 <= int(lone[0]) <= 40 else None
    m = re.search(r"<\s*(\d{1,2})", r) or re.search(r"(\d{1,2})\D{0,3}$", r)
    return int(m.group(1)) if m and 1 <= int(m.group(1)) <= 30 else None


def rows(data_dir, texts=None):
    """(t, spot, who, seller, stream) for every shop row with a room and channel."""
    for f, stream in (("inbox.json", False), ("streams.json", True)):
        try: docs = json.loads(texts[f]) if texts is not None else json.load(open(os.path.join(data_dir, f), encoding="utf-8"))
        except Exception: continue
        if not isinstance(docs, list): continue
        for d in docs:
            if not isinstance(d, dict): continue
            src = str(d.get("src") or "")
            if not stream and "shop" not in src: continue
            who = str((d.get("by") if stream else d.get("who")) or d.get("inbox") or "Guest")[:24]
            for r in d.get("rows") or []:
                rm = fm_room(r.get("r")); ch = r.get("c")
                ch = ch if isinstance(ch, int) and ch >= 1 else 0
                spot = str(rm) + "|" + str(ch) if rm and ch else "?|" + str(ch)   # counted as a shop, not placed on the map
                s = str(r.get("s") or "").lower()
                for k in ("t", "fs", "ss"):
                    t = r.get(k)
                    if isinstance(t, (int, float)) and t > 1.7e9: yield int(t), spot, who, s, stream


_LIM = {}
def _lim(now):
    k = (int(now) // 3600, OPEN_DAYS)
    if k not in _LIM: _LIM[k] = (datetime.datetime.fromtimestamp(now, ET).date() - datetime.timedelta(days=OPEN_DAYS - 1)).isoformat()
    return _LIM[k]


def add(p, t, spot, who, seller, stream, now):
    day, hr = et(t)
    if t > now + 600: return
    if day < _lim(now): return   # closed days are already folded
    h = p["open"].setdefault(day, {"h": {}, "sel": set(), "shop": set(), "who": set(), "str": set(), "pl": set()})
    hh = h["h"].setdefault(str(hr), {"n": {}, "w": set(), "s": set()})
    if not spot.startswith("?"): hh["n"].setdefault(spot, set()).add(seller)
    (hh["s"] if stream else hh["w"]).add(who)
    (h["str"] if stream else h["who"]).add(who)
    if seller:
        h["sel"].add(seller); h["shop"].add(seller + "|" + spot.split("|")[1])
        if not spot.startswith("?"): h["pl"].add(seller + "|" + spot.split("|")[1])   # shops placed in a room at least once


def fold(day, h):
    """An open day's sets into the counts kept on file."""
    hours = {}
    for hr, x in h["h"].items():
        hours[hr] = {"n": {k: len(v) for k, v in x["n"].items()}, "w": sorted(x["w"]), "s": len(x["s"])}
    return {"hours": hours, "sellers": len(h["sel"]), "shops": len(h["shop"]), "placed": len(h["pl"] & h["shop"]), "who": sorted(h["who"]), "streams": len(h["str"])}


def load(path):
    try: p = json.load(open(path, encoding="utf-8"))
    except Exception: p = {}
    p.setdefault("days", {})
    op = {}
    for day, h in (p.get("open") or {}).items():
        op[day] = {"h": {hr: {"n": {k: set(v) for k, v in x["n"].items()}, "w": set(x["w"]), "s": set(x["s"])} for hr, x in h["h"].items()},
                   "sel": set(h["sel"]), "shop": set(h["shop"]), "who": set(h["who"]), "str": set(h["str"]), "pl": set(h.get("pl") or [])}
    p["open"] = op
    return p


def save(p, path, now):
    today = datetime.datetime.fromtimestamp(now, ET).date()
    lim = (today - datetime.timedelta(days=OPEN_DAYS - 1)).isoformat()
    keep = (today - datetime.timedelta(days=KEEP_DAYS)).isoformat()
    for day in list(p["open"]):
        p["days"][day] = fold(day, p["open"][day])
        if day < lim: del p["open"][day]
    p["days"] = {d: v for d, v in sorted(p["days"].items()) if d >= keep}
    out = {"v": 1, "updated": int(now), "days": p["days"],
           "open": {d: {"h": {hr: {"n": {k: sorted(v) for k, v in x["n"].items()}, "w": sorted(x["w"]), "s": sorted(x["s"])} for hr, x in h["h"].items()},
                        "sel": sorted(h["sel"]), "shop": sorted(h["shop"]), "who": sorted(h["who"]), "str": sorted(h["str"]), "pl": sorted(h["pl"])} for d, h in p["open"].items()}}
    try:
        old = json.load(open(path, encoding="utf-8")); old["updated"] = out["updated"]
        if old == out: return False     # nothing new: leave the file alone so the pump doesn't commit
    except Exception:
        pass
    tmp = path + ".tmp"
    json.dump(out, open(tmp, "w", encoding="utf-8"), separators=(",", ":"), sort_keys=True)
    os.replace(tmp, path)
    return True


def seed(repo, days, outp):
    """Every past version of inbox.json and streams.json in the archive's history, read as if the pump had run then."""
    import subprocess
    global OPEN_DAYS
    OPEN_DAYS = days + 2
    now = datetime.datetime.now(datetime.timezone.utc).timestamp()
    p = {"days": {}, "open": {}}
    done = set()
    for f in ("inbox.json", "streams.json"):
        hs = subprocess.run(["git", "-C", repo, "log", f"--since={days + 1} days ago", "--format=%h", "--", "data/" + f], capture_output=True, text=True).stdout.split()
        for h in hs:
            txt = subprocess.run(["git", "-C", repo, "show", f"{h}:data/{f}"], capture_output=True).stdout
            for x in rows(None, {f: txt}):
                if x in done: continue
                done.add(x); add(p, *x, now)
        print("seed", f, len(hs), "versions", file=sys.stderr)
    p["days"] = {d: fold(d, h) for d, h in p["open"].items()}
    today = datetime.datetime.fromtimestamp(now, ET).date().isoformat()
    p["days"].pop(today, None)   # today is still open; the pump's own file has it
    json.dump({"days": p["days"]}, open(outp, "w", encoding="utf-8"), separators=(",", ":"), sort_keys=True)
    print("seeded", sorted(p["days"]))


def covhours(p, now):
    """The public 7-day coverage file: for each room and channel spot, how many of the last 7 full days had no read
    in each Eastern hour, and how many shops a read usually finds there then. No names in it."""
    today = datetime.datetime.fromtimestamp(now, ET).date()
    days = [(today - datetime.timedelta(days=i)).isoformat() for i in range(1, 8)]
    have = [d for d in days if d in p["days"]]
    seen = {}   # spot -> hour -> [seller counts on days it was read]
    for d in have:
        for hr, x in p["days"][d].get("hours", {}).items():
            for k, n in (x.get("n") or {}).items(): seen.setdefault(k, {}).setdefault(int(hr), []).append(n)
    if not seen: return None
    # how busy each hour is: shops per read spot, against the day's average
    per = [0.0] * 24
    for h in range(24):
        xs = [n for v in seen.values() for n in v.get(h, [])]
        per[h] = sum(xs) / len(xs) if xs else 0
    base = sum(x for x in per if x) / max(1, sum(1 for x in per if x))
    fac = [round(min(1.5, max(0.5, x / base)), 2) if base and x else 1.0 for x in per]   # thin data: keep the hour effect mild
    spots, gaps = {}, []
    for k, v in seen.items():
        allx = [n for xs in v.values() for n in xs]
        avg = sum(allx) / len(allx)
        if avg < 1: continue
        miss, exp = [], []
        for h in range(24):
            xs = v.get(h, [])
            e = sum(xs) / len(xs) if len(xs) >= 2 else avg * fac[h]
            m = len(have) - len(xs)
            miss.append(m); exp.append(round(e, 1))
            if m: gaps.append([k, h, m, round(e, 1), round(m / len(have) * e, 2)])
        spots[k] = {"m": miss, "e": exp}
    gaps.sort(key=lambda g: -g[4])
    return {"v": 1, "updated": int(now), "days": have, "hours": fac, "spots": spots, "gaps": gaps[:300]}


def main():
    if sys.argv[1] == "--seed":
        return seed(sys.argv[2], int(sys.argv[3]), sys.argv[4])
    data_dir, outp = sys.argv[1], sys.argv[2]
    now = datetime.datetime.now(datetime.timezone.utc).timestamp()
    p = load(outp)
    # a one-off rebuild of past days (pulse-seed.json, from --seed) replaces the days before today
    sp = os.path.join(os.path.dirname(os.path.abspath(outp)), "pulse-seed.json")
    if os.path.exists(sp):
        try:
            for d, v in (json.load(open(sp, encoding="utf-8")).get("days") or {}).items():
                if d < datetime.datetime.fromtimestamp(now, ET).date().isoformat():   # the rebuild saw every version of those days
                    p["days"][d] = v; p["open"].pop(d, None)
        except Exception: pass
        os.remove(sp)
    for x in rows(data_dir): add(p, *x, now)
    save(p, outp, now)
    c = covhours(p, now)
    if c:
        cp = os.path.join(os.path.dirname(os.path.abspath(outp)), "covhours.json")
        old = None
        try: old = json.load(open(cp, encoding="utf-8"))
        except Exception: pass
        if not old or old.get("days") != c["days"] or old.get("spots") != c["spots"]:   # changes once a day
            json.dump(c, open(cp, "w", encoding="utf-8"), separators=(",", ":"))
    d = p["days"].get(datetime.datetime.fromtimestamp(now, ET).date().isoformat()) or {}
    print("pulse:", len(d.get("hours", {})), "hours today,", d.get("shops", 0), "shops,", len(d.get("who", [])), "watchers")


if __name__ == "__main__":
    main()
