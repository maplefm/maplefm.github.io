#!/usr/bin/env python3
"""Second pass over the guide files: stats add up, every gear checkpoint can be worn at its level, skill orders respect
the game files' prerequisites and the SP each level has, titles and descriptions fit.   python3 builds/tools/validate.py"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.dirname(HERE)
C = json.load(open(os.path.join(B, "check", "computed.json"))); G = json.load(open(os.path.join(HERE, "gear-snapshot.json")))
PRE = {4000001: (4000000, 3), 4001001: (4001000, 3), 4201000: (4200000, 5), 4201002: (4201001, 5), 1000001: (1000000, 3), 1001002: (1001001, 1),
       1301000: (1300000, 3), 1301001: (1300001, 3), 1301002: (1300000, 5), 1301003: (1300001, 5)}
MAX = {4001003: 20, 4000000: 15, 4000001: 15, 4001000: 20, 4001001: 20, 4001002: 20, 4200000: 20, 4200001: 20, 4201000: 20, 4201001: 20, 4201002: 30, 4201003: 30,
       1001001: 20, 1001002: 20, 1000000: 15, 1000001: 15, 1000002: 15, 1300000: 20, 1300001: 20, 1301000: 30, 1301001: 30, 1301002: 20, 1301003: 20, 1301004: 30, 1301005: 20}
BOOK1 = {4001003, 4000000, 4000001, 4001000, 4001001, 4001002, 1001001, 1001002, 1000000, 1000001, 1000002}
bad = []; n = 0
for key, fn in [("sindit", "sindit.json"), ("spearman_spear", "spearman-spear.json"), ("spearman_polearm", "spearman-polearm.json")]:
    d = json.load(open(os.path.join(B, fn)))
    for L, x in C["builds"][key]["levels"].items():
        L = int(L); n += 1; total = 25 + 5 * (L - 1)
        if x["str"] + x["dex"] + x["luk"] + 4 != total: bad.append((key, L, "stat total"))
        if not x["can_wear"]: bad.append((key, L, "can't wear " + str(x["weapon"])))
        sk = {int(k): v for k, v in x["skills"].items()}
        s1 = sum(v for k, v in sk.items() if k in BOOK1); s2 = sum(v for k, v in sk.items() if k not in BOOK1)
        if s1 > (0 if L < 10 else 1 + 3 * (min(L, 30) - 10)) or s2 > (0 if L < 30 else 1 + 3 * (L - 30)): bad.append((key, L, f"SP {s1}/{s2}"))
        for k, v in sk.items():
            n += 1
            if v > MAX[k]: bad.append((key, L, f"{k} over max"))
            if k in PRE and v > 0 and sk.get(PRE[k][0], 0) < PRE[k][1]: bad.append((key, L, f"{k} without prerequisite {PRE[k]}"))
    for g in d["gear"]:
        n += 1; x = C["builds"][key]["levels"].get(str(max(10, g["level"])))
        r = G[g["item"]]["req"]
        if g["slot"] == "Stars": continue
        stat = {"reqSTR": x["str"], "reqDEX": x["dex"], "reqLUK": x["luk"]}
        for k, v in r.items():
            if stat.get(k, 0) < v: bad.append((key, g["level"], f"{g['item']} needs {k} {v}, has {stat.get(k)}"))
    s = d["search"]; n += 2
    if len(s["title"]) >= 60: bad.append((key, "title", len(s["title"])))
    if len(s["description"]) >= 155: bad.append((key, "description", len(s["description"])))
h = json.load(open(os.path.join(B, "hub.json"))); n += 2
if len(h["title"]) >= 60 or len(h["description"]) >= 155: bad.append(("hub", "title/description"))
print(n, "checks,", len(bad), "problems"); [print(b) for b in bad]
