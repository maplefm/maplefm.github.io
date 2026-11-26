#!/usr/bin/env python3
"""Checks what each guide page actually shows against the game's rules and the game files, level by level.
Reads the data built into builds/<slug>/index.html, so it tests the page, not the plan behind it.
   python3 builds/tools/checkguides.py [slug ...]      exit 1 on any problem

Rules: creation 25 points, 4 minimum, sub stat exactly 5; 5 AP a level; stats never go down; every weapon wearable
at the level the guide equips it (builds/data/weapons.json, game files); SP 1 + 3 a level from 10 (1st job, to 30)
and from 30 (2nd job); every level's points all spent except what the page calls spare; never past a skill's max
(game files); every prerequisite met (builds/data/prereqs.json, game files); points only taken back at an SP Reset;
every skill has its icon in sk/."""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.dirname(HERE); ROOT = os.path.dirname(B)
WEAP = json.load(open(os.path.join(B, "data", "weapons.json")))
PRE = {int(k): {int(a): n for a, n in v.items()} for k, v in json.load(open(os.path.join(B, "data", "prereqs.json")))["skills"].items() if v}
GAMEMAX = {int(k): int(v.get("masterLevel") or 0) for k, v in json.load(open(os.path.join(B, "data", "skilltext.json"))).items()}
CAP = 70


def page_data(slug):
    s = open(os.path.join(B, slug, "index.html"), encoding="utf-8").read()
    m = re.search(r"<script>const D=(\{.*?\});D\.icon", s, re.S)
    return json.loads(m.group(1).replace("<\\/", "</"))


def check(slug):
    D = page_data(slug); bad = []; n = 0
    st = {r["l"]: r["t"] for r in D["stats"]}
    # stats
    c = st[1]; n += 1
    if sum(c) != 25 or min(c) < 4 or sorted(c) != [4, 4, 5, 12]: bad.append((1, f"creation {c}: needs 25 points, 4 minimum, sub stat 5"))
    for L in range(1, CAP + 1):
        n += 1
        if L not in st: bad.append((L, "no stats row")); continue
        if sum(st[L]) != 25 + 5 * (L - 1): bad.append((L, f"stat total {sum(st[L])}"))
        if L > 1 and any(a < b for a, b in zip(st[L], st[L - 1])): bad.append((L, "a stat went down"))
    # weapons
    for g in D["gear"]:
        n += 1; w = WEAP.get(g["item"])
        if not w: bad.append((g["level"], f"{g['item']} not in the game files")); continue
        L = g["level"]; t = st.get(max(L, 1))
        if w["reqLevel"] > L: bad.append((L, f"{g['item']} needs level {w['reqLevel']}"))
        for i, k in enumerate(("reqSTR", "reqDEX", "reqINT", "reqLUK")):
            if (w.get(k) or 0) > t[i]: bad.append((L, f"{g['item']} needs {w[k]} {k[3:]}, page has {t[i]}"))
        shown = {a: int(b) for a, b in g["needs"]}
        want = {"LV": w["reqLevel"], **{k[3:]: w[k] for k in ("reqSTR", "reqDEX", "reqINT", "reqLUK") if w.get(k)}}
        if shown != {k: v for k, v in want.items() if v}: bad.append((L, f"{g['item']} needs badges {shown} vs game {want}"))
        want_atk = (w.get("incMAD") or 0) if g.get("akind", "attack") != "attack" else w["watk"]
        if g["attack"] != want_atk: bad.append((L, f"{g['item']} {g.get('akind', 'attack')} {g['attack']} vs game {want_atk}"))
    # skill points
    sid = D["sid"]; book1 = set(D["book"]["1st job"]); reset = D.get("reset")
    reset = {"level": reset} if isinstance(reset, int) else (reset or {})
    prev = {}
    for L in range(1, CAP + 1):
        n += 1; row = D["sp"][str(L)]; have = row["have"]
        a1 = 0 if L < 10 else 1 + 3 * (min(L, 30) - 10); a2 = 0 if L < 30 else 1 + 3 * (L - 30)
        s1 = sum(v for k, v in have.items() if k in book1); s2 = sum(v for k, v in have.items() if k not in book1)
        if s1 > a1 or s2 > a2: bad.append((L, f"SP used {s1}/{a1} and {s2}/{a2}"))
        if (a1 - s1) + (a2 - s2) != row["spare"]: bad.append((L, f"unspent {(a1 - s1) + (a2 - s2)} but page says spare {row['spare']}"))
        for k, v in have.items():
            i = int(sid[k]); n += 1
            if v > GAMEMAX.get(i, 0): bad.append((L, f"{k} {v} over the game max {GAMEMAX.get(i)}"))
            for need, lv in PRE.get(i, {}).items():
                got = next((have[x] for x in have if int(sid[x]) == need), 0)
                if v > 0 and got < lv: bad.append((L, f"{k} without skill {need} at {lv}"))
        if L != (reset.get("level") or 0):
            for k, v in prev.items():
                if have.get(k, 0) < v: bad.append((L, f"{k} went down without an SP Reset"))
        prev = have
    if D["sp"][str(CAP)]["spare"] and not any(r.get("spare") for r in D["spLevels"] if r["l"] == CAP):
        bad.append((CAP, "spare points at 70 not shown"))
    for k, i in sid.items():
        n += 1
        if not os.path.exists(os.path.join(ROOT, "sk", f"{i}.png")): bad.append((0, f"no icon for {k}"))
    return n, bad


if __name__ == "__main__":
    slugs = sys.argv[1:] or sorted(d for d in os.listdir(B) if os.path.exists(os.path.join(B, d, "index.html")) and os.path.exists(os.path.join(B, d + ".json")))
    tot = 0; probs = 0
    for s in slugs:
        n, bad = check(s); tot += n; probs += len(bad)
        print(f"{s}: {n} checks, {len(bad)} problems")
        for b in bad[:15]: print("   ", b)
    print(f"all: {tot} checks, {probs} problems")
    sys.exit(1 if probs else 0)
