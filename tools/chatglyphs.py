"""Learn the chat font's letter shapes from name samples watchers send (kind "name" in the archive's miss folder).
  python3 tools_chatglyphs.py ARCHIVE_DATA_DIR [out=chatglyphs.json]
Each sample is a sender's name as the game drew it plus what the text readers made of it. Samples with the same
letter shapes are the same name: their readings are pooled, and a group whose leading spelling is clear and has as
many letters as shapes teaches each shape its letter. A shape goes in the table only when 2+ different names agree
on it (90%+). Letters the readers mix up (0 O, I l 1, m rn, w vv) are printed for a person to check."""
import json, os, sys, collections
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fmparse

def main():
    D = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "chatglyphs.json")
    idx = json.load(open(os.path.join(D, "miss", "index.json")))["items"]
    groups = collections.defaultdict(lambda: collections.Counter())
    n = 0
    for it in idx:
        if it.get("kind") != "name": continue
        try:
            info = json.loads(it.get("info") or "{}")
            m = np.asarray(Image.open(os.path.join(D, "miss", it["file"])).convert("L")) < 128
        except Exception:
            continue
        keys = tuple(fmparse.chat_name_keys(m))
        if not keys: continue
        n += 1
        g = groups[keys]
        for sp, v in (info.get("votes") or {}).items(): g[sp] += v
        if info.get("line"): g[info["line"]] += 2
    teach = collections.defaultdict(collections.Counter)
    labelled = 0
    for keys, c in groups.items():
        if not c: continue
        (lab, top), = c.most_common(1)
        if top / sum(c.values()) < 0.6 or len(lab) != len(keys): continue
        labelled += 1
        for k, ch in zip(keys, lab): teach[k][ch] += 1
    table, unsure = {}, []
    for k, c in teach.items():
        (ch, top), = c.most_common(1)
        if top >= 2 and top / sum(c.values()) >= 0.9: table[k] = ch
        elif set(c) <= {"I", "l"} and sum(c.values()) >= 3: table[k] = "Il"     # drawn the same: told apart by the letters around it
        elif top >= 2: unsure.append((k, dict(c)))
    # held-out check: each labelled group read back with a table built without it
    ok = bad = miss = 0
    for keys, c in groups.items():
        if not c: continue
        (lab, top), = c.most_common(1)
        if top / sum(c.values()) < 0.6 or len(lab) != len(keys): continue
        t2 = dict(table)
        for k, ch in zip(keys, lab):
            if teach[k][ch] <= 1: t2.pop(k, None)
        s = fmparse.chat_name_exact(list(keys), t2) or "\0"
        if "\0" in s: miss += 1
        elif s == lab: ok += 1
        else: bad += 1; print("HELD-OUT WRONG", lab, "read", s)
    json.dump(table, open(out, "w"), indent=0, ensure_ascii=False)
    print(f"{n} samples, {len(groups)} name shapes, {labelled} labelled, {len(table)} letters learned -> {out}")
    print(f"held-out: {ok} right, {bad} wrong, {miss} not all letters known")
    conf = set("0OIl1mnrwvu")
    for k, ch in sorted(table.items(), key=lambda kv: kv[1]):
        if ch in conf:
            d, w, bits = k.split(":", 2); w = int(w)
            print(f"check '{ch}' ({teach[k][ch]} names):"); [print("   " + "".join("#" if b == "1" else "." for b in bits[i:i + w])) for i in range(0, len(bits), w)]
    for k, c in unsure: print("disagreeing shape", c)

if __name__ == "__main__":
    main()
