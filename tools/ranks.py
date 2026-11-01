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
OLDOWN = "2e55a9a5"   # the owner's old scanner name, as a fingerprint; its days fold into Maya

def fp(name):
    x = 0x811c9dc5
    for c in ("clubfm:" + name.lower()).encode():
        x ^= c; x = (x * 0x01000193) & 0xffffffff
    return format(x, "08x")

def tally(data_dir):
    out = {}
    for f, name in FILES.items():
        try: docs = json.load(open(os.path.join(data_dir, f), encoding="utf-8"))
        except Exception: continue
        if not isinstance(docs, list): continue
        for d in docs:
            who = name or d.get("by") or d.get("who") or "Guest"
            who = str(who)[:24]
            if fp(who) == OLDOWN: who = "Maya"
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
    for k in [k for k in led.get("who", {}) if fp(k) == OLDOWN]:
        m = led["who"].setdefault("Maya", {})
        for day, v in led["who"].pop(k).items():
            m[day] = [max(a, b) for a, b in zip(m.get(day, [0, 0, 0]), v)]   # the same scans logged under both names
    # a linked scanner used to show as "Name-tag" when its account already had another scanner under Name;
    # links.json (scanner tag -> account name) folds those days into Name, the same scans counted once
    links = {}
    if len(sys.argv) > 3:
        try: links = {str(k)[:4]: v for k, v in json.load(open(sys.argv[3])).items() if isinstance(v, str) and not str(k).startswith("stream:")}
        except Exception: links = {}
    for k in list(led.get("who", {})):
        base, _, tag = k.rpartition("-")
        if base and links.get(tag, "").lower() == base.lower():
            m = led["who"].setdefault(links[tag], {})
            for day, v in led["who"].pop(k).items():
                m[day] = [max(a, b) for a, b in zip(m.get(day, [0, 0, 0]), v)]
    # "Name-tag" rows: a scanner id that published under a name another scanner had first. Its days belong to whoever
    # that scanner id is now (its current name in the inbox), and the same days logged under the bare name during the
    # clash are the same scans, so they come off the bare name (Yint showed Zik's PC's first day twice, as Yint and as
    # Yint-3a3a, plus Yint-85ee for Yint's own days)
    try: ids = json.load(open(os.path.join(data_dir, "inbox_state.json"), encoding="utf-8")).get("ids") or {}
    except Exception: ids = {}
    owner = {h[:4]: (links.get(h[:4]) or v.get("nm") or "") for h, v in ids.items()}
    for k in list(led.get("who", {})):
        base, _, tag = k.rpartition("-")
        if not base or tag not in owner or not owner[tag]: continue
        to = owner[tag]
        days = led["who"].pop(k)
        b = led["who"].get(base) or {}
        if to.lower() != base.lower():
            for day, v in days.items():
                if b.get(day) == v: del b[day]
            if base in led["who"] and not led["who"][base]: del led["who"][base]
        m = led["who"].setdefault(to, {})
        for day, v in days.items():
            m[day] = [max(x, y) for x, y in zip(m.get(day, [0, 0, 0]), v)]
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
