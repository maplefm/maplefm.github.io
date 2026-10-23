"""Keep a lasting ledger of what every scanner has caught, so ranks and tiers never drop when old prices age out.
  python tools/ranks.py DATA_DIR OUT.json
Per scanner and per day (Eastern): sales caught, shops opened, rows read. A day already in the ledger keeps the
bigger of the old and new counts, so a file that has trimmed its old days never lowers anyone.
"""
import sys, os, json, datetime
ET = datetime.timezone(datetime.timedelta(hours=-4))
FILES = {"watcher.json": "Maya", "watcher-2.json": "Jack", "watcher-3.json": "Matt", "watcher-4.json": "Jimmy",
         "streams.json": None, "streams-vods.json": None, "inbox.json": None}
OWNH = {"a4959daa", "bd22ad91", "6d3b4a44", "5b5738ce", "7528a716"}   # club members' own shops, as fingerprints

def own(name):
    x = 0x811c9dc5
    for c in ("clubfm:" + name.lower()).encode():
        x ^= c; x = (x * 0x01000193) & 0xffffffff
    return format(x, "08x") in OWNH

STREAMS = set()

def tally(data_dir):
    out = {}
    for f, name in FILES.items():
        try: docs = json.load(open(os.path.join(data_dir, f), encoding="utf-8"))
        except Exception: continue
        if not isinstance(docs, list): continue
        for d in docs:
            who = name or d.get("by") or d.get("who") or "Guest"
            who = str(who)[:24]
            if f.startswith("streams"): STREAMS.add(who)
            try: st = datetime.datetime.fromisoformat(d["at"]).timestamp()
            except Exception: continue
            chat = "chat" in str(d.get("src", ""))
            for r in d.get("rows") or []:
                if own(str(r.get("s", ""))): continue
                t = r.get("t") or st
                day = datetime.datetime.fromtimestamp(t, ET).date().isoformat()
                c = out.setdefault(who, {}).setdefault(day, {"s": 0, "r": 0, "h": set()})
                c["r"] += 1
                if r.get("so") and r.get("k") != "b": c["s"] += 1
                if not chat: c["h"].add(str(r.get("s")) + "|" + d["at"])
    return out

def main():
    data_dir, outp = sys.argv[1], sys.argv[2]
    try: led = json.load(open(outp, encoding="utf-8"))
    except Exception: led = {"who": {}}
    before = json.dumps(led.get("who"), sort_keys=True)
    for who, days in tally(data_dir).items():
        w = led["who"].setdefault(who, {})
        for day, c in days.items():
            new = [c["s"], len(c["h"]), c["r"]]
            old = w.get(day, [0, 0, 0])
            w[day] = [max(a, b) for a, b in zip(old, new)]
    led["stream"] = sorted(set(led.get("stream", [])) | STREAMS)
    if json.dumps(led["who"], sort_keys=True) == before:
        print("no change"); return
    led["updated"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    json.dump(led, open(outp, "w", encoding="utf-8"), separators=(",", ":"), sort_keys=True)
    tot = sorted(((sum(v[0] for v in d.values()), k) for k, d in led["who"].items()), reverse=True)
    print(len(tot), "scanners;", tot[:5])

if __name__ == "__main__":
    main()
