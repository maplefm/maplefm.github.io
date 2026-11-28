#!/usr/bin/env python3
"""Accuracy report on every scanned row, from every source, the partner feed included. It reads the data and never
changes or deletes a scanner's rows. The board already holds the likely-wrong rows back with the same limits used
here (assets/board.js); this report counts them per source, so accuracy is a number, not an assumption.

   python3 tools/accuracy.py report <data dir> <out accuracy.json> [hours]    default: the last 24 hours

Checks, per row:
  low    price each under 15% of typical (not equipment): never Cheapest now, never a deal
  high   price each over 10 times typical (not equipment): a spot holder on the board, never a price
  stack  equipment in a stack (equipment never stacks)
  name   item name not in the item list: the board can't price it
  seller a seller name one character off another seller in the same room and channel within 30 minutes, with the
         same item at the same price: one of the two spellings is a misread (counted, not yet held back)
Likely wrong = low or stack. The target is 99% of rows not likely wrong, per source.
Cross-check: where two scanners saw the same shop within an hour, how many rows the other one saw too."""
import json, os, sys, time, collections

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
SETS = {"hwabi throwing stars", "icicle", "ilbi throwing stars", "kumbi throwing stars", "mokbi throwing stars", "snowball",
        "steely throwing knives", "subi throwing stars", "tobi throwing stars", "wolbi throwing stars", "wooden top"}
# the board's limits (assets/board.js): under 15% of typical never becomes Cheapest now or a deal (a quantity read as
# the price, a frame caught mid-change); over 10 times is a spot holder, hidden unless "Show spot holders" is on
LOW, HIGH = 0.15, 10


def load(data_dir):
    db = json.load(open(os.path.join(data_dir, "itemdb.json")))
    kinds = db["kinds"]
    names = {x[0].lower(): (x[1], kinds[x[5]]) for x in db["items"]}
    typ = {}
    sp = os.path.join(data_dir, "summary.json")
    if os.path.exists(sp):
        try:
            for r in json.load(open(sp)).get("rows", []):
                if r.get("item") and r.get("typ"): typ[r["item"].lower()] = (r["typ"], bool(r.get("equip")))
        except Exception:
            pass
    return names, typ


def row_flags(r, src, names, typ):
    """The reasons a row is likely wrong ([] when it looks right). Pure: the same row always gives the same answer.
    The limits are the board's own (assets/board.js), so the report measures exactly what the board holds back."""
    out = []
    name = str(r.get("i") or ""); low = name.lower()
    chat = "chat" in (src or "")
    hit = names.get(low)
    if not hit:
        return ["name"]
    gid = hit[0]
    q = r.get("q") or 1
    equip = gid < 2000000
    p = r.get("p") or 0
    each = p if low in SETS else (p / q if q else p)
    # price against typical. Equipment is left out: one copy's rolls move its price 10 times or more (a clean Gephart
    # sells for 20K, a good one for 300K), so only its stats can say it's off, and the board checks those itself.
    t = typ.get(low)
    if t and t[0] and p > 0 and r.get("k") != "b" and not equip:
        if each < t[0] * LOW: out.append("low")
        elif each > t[0] * HIGH: out.append("high")
    # equipment never stacks
    if equip and q > 1 and not chat: out.append("stack")
    return out


def edit1(a, b):
    """True when a and b differ by exactly one character (swap, add or drop), case ignored"""
    a, b = a.lower(), b.lower()
    if a == b or abs(len(a) - len(b)) > 1: return False
    if len(a) == len(b): return sum(1 for x, y in zip(a, b) if x != y) == 1
    if len(a) > len(b): a, b = b, a
    i = 0
    while i < len(a) and a[i] == b[i]: i += 1
    return a[i:] == b[i + 1:]


def seller_flags(docs):
    """Rows whose seller looks like a misread: one character off another seller seen in the same room and channel
    within 30 minutes with the same item at the same price. The spelling seen in fewer rows overall is the misread.
    Returns (name, channel, room, half-hour) spots: only the rows there are flagged, never the name everywhere."""
    seen = collections.Counter()
    by_spot = collections.defaultdict(list)
    for d in docs:
        if "chat" in str(d.get("src", "")): continue
        for r in d.get("rows", []):
            s = str(r.get("s") or "")
            if not s or not r.get("r") or not r.get("c"): continue
            seen[s.lower()] += 1
            by_spot[(r.get("c"), r.get("r"), int(r.get("t", 0)) // 1800)].append(r)
    bad = set()
    for spot, rows in by_spot.items():
        sellers = {}
        for r in rows: sellers.setdefault(str(r["s"]), set()).add((str(r.get("i")).lower(), r.get("p"), r.get("q", 1)))
        ss = sorted(sellers)
        for i, a in enumerate(ss):
            for b in ss[i + 1:]:
                if len(a) >= 4 and edit1(a, b) and sellers[a] & sellers[b]:
                    worse = a if seen[a.lower()] < seen[b.lower()] else b if seen[b.lower()] < seen[a.lower()] else None
                    if worse: bad.add((worse.lower(),) + spot)
    return bad


def key(d, r):
    """the row's identity on the board: who saw it and what it was"""
    return "|".join(str(v) for v in (d.get("who") or "", r.get("s") or "", r.get("i") or "", r.get("p") or 0, r.get("q") or 1, r.get("t") or 0))


SOURCES = [("inbox.json", None), ("inbox-zenith.json", None), ("streams.json", "Streams"), ("streams-vods.json", "Streams"),
           ("watcher.json", "Maya"), ("watcher-2.json", "Jack"), ("watcher-3.json", "Matt"), ("watcher-4.json", "Jimmy")]
WRONG = {"low", "stack"}


def all_docs(data_dir, since=0):
    out = []
    for f, who in SOURCES:
        p = os.path.join(data_dir, f)
        if not os.path.exists(p): continue
        try: docs = json.load(open(p))
        except Exception: continue
        for d in docs if isinstance(docs, list) else [docs]:
            if isinstance(d, dict) and isinstance(d.get("rows"), list):
                if who: d = dict(d, who=who)
                if since:
                    rows = [r for r in d["rows"] if int(r.get("t") or 0) >= since]
                    if not rows: continue
                    d = dict(d, rows=rows)
                out.append(d)
    return out


def tool_of(d):
    who = str(d.get("who") or "")
    if who == "Streams": return "streams"
    return "partner" if who == "VioletScanner" else "watcher"


def flag_all(data_dir, since=0):
    names, typ = load(data_dir)
    docs = all_docs(data_dir, since)
    misread = seller_flags(docs)
    flagged, counts = {}, collections.defaultdict(collections.Counter)
    for d in docs:
        src = str(d.get("src") or "")
        for r in d["rows"]:
            why = row_flags(r, src, names, typ)
            if "chat" not in src and (str(r.get("s") or "").lower(), r.get("c"), r.get("r"), int(r.get("t", 0)) // 1800) in misread: why.append("seller")
            who = str(d.get("who") or "?")
            counts[who]["rows"] += 1
            if WRONG & set(why): counts[who]["wrong"] += 1
            if why:
                counts[who]["flagged"] += 1
                for w in why: counts[who][w] += 1
                flagged[key(d, r)] = why
    return flagged, counts, docs


def cross_check(docs, window=3600):
    """Where two scanners saw the same shop (seller, channel, room) within an hour, how many of each one's rows the
    other saw too: same item, price and stack. Shops change between looks (sales, new stock), so this is a floor."""
    shots = collections.defaultdict(list)
    for d in docs:
        if "chat" in str(d.get("src", "")) or str(d.get("who")) == "Streams": continue
        who = str(d.get("who") or "?")
        for r in d["rows"]:
            if r.get("so") or not r.get("s"): continue
            q = r.get("q") or 1   # compared by item and price each: one scanner may read a stack another reads as single copies
            shots[str(r.get("s") or "").lower()].append((int(r.get("t", 0)), who, (str(r.get("i")).lower(), round((r.get("p") or 0) / q))))
    res = collections.defaultdict(lambda: [0, 0])
    for rows in shots.values():
        whos = {w for _, w, _ in rows}
        if len(whos) < 2: continue
        for t, w, item in rows:
            others = {it for t2, w2, it in rows if w2 != w and abs(t2 - t) <= window}
            if not others: continue
            res[w][1] += 1
            if item in others: res[w][0] += 1
    MIN = 50   # fewer rows than this compared: not enough overlap to say anything
    return {w: {"matched": a, "compared": b, "rate": round(a / b, 4) if b >= MIN else None,
                "note": "" if b >= MIN else "not enough overlap yet"} for w, (a, b) in res.items()}


def report(data_dir, hours=24):
    since = int(time.time()) - int(hours * 3600)
    flagged, counts, docs = flag_all(data_dir, since)
    rep = {"made": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "hours": hours, "target": 0.99, "sources": {},
           "cross": cross_check(docs), "off": []}
    for who, c in sorted(counts.items(), key=lambda kv: -kv[1]["rows"]):
        acc = round(1 - c["wrong"] / c["rows"], 4) if c["rows"] else 1
        rep["sources"][who] = dict(c, accuracy=acc)
        # a source is off when it sent enough rows to judge and fewer than 99% of them look right
        if c["rows"] >= 200 and acc < rep["target"]: rep["off"].append(who)
    for who, x in rep["cross"].items():
        if x["rate"] is not None and x["rate"] < 0.5: rep["off"].append(who + " (cross-check)")
    return rep


def main():
    mode, data_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
    if mode != "report": sys.exit("usage: accuracy.py report <data dir> <out> [hours]")
    rep = report(data_dir, float(sys.argv[4]) if len(sys.argv) > 4 else 24)
    json.dump(rep, open(out, "w"), indent=1)
    print("sources", len(rep["sources"]), "off", rep["off"])


if __name__ == "__main__":
    main()
