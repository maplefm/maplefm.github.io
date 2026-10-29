#!/usr/bin/env python3
"""Skill numbers for the training model, straight from the Classic World game files on maplestory.io.

    python3 tools/skilldata.py assets/classic-skills.json [itemdb.json]

Keeps only what the damage math needs: every attack skill's damage %, hits, targets and mastery by level, and the
passives and buffs that change damage, accuracy, crits or attack speed. Values are per skill level (index 0 = level 1).
"""
import json, sys, time, urllib.request

IO = "https://maplestory.io/api/MCW/1"
JOBS = [100, 110, 120, 130, 200, 210, 220, 230, 300, 310, 320, 400, 410, 420]
FIELDS = {"damage": "d", "mad": "m", "attackCount": "h", "mobCount": "t", "bulletCount": "b", "mastery": "ms",
          "accX": "acc", "evaX": "eva", "crtX": "cr", "crdX": "cd", "indiePad": "pad", "indieMad": "mad",
          "indieAcc": "acc", "indieEva": "eva", "x": "x", "y": "y", "prop": "p", "time": "time", "dot": "dot",
          "mpCon": "mp", "cooltime": "cd_s"}
# hidden skills that carry the real damage of their parent (Poison Breath explodes, Arrow Bomb splashes)
HIDDEN = {2101005: 2101004, 3101005: 3101004}
ELEM = {"f": "Fire", "i": "Ice", "l": "Lightning", "s": "Poison", "h": "Holy"}


def get(url):
    for _ in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Club FM skill data)"})
            return json.load(urllib.request.urlopen(req, timeout=60))
        except Exception as e:  # noqa: BLE001
            err = e; time.sleep(3)
    raise SystemExit(f"could not read {url}: {err}")


def num(v):
    try:
        f = float(v); return int(f) if f == int(f) else f
    except (TypeError, ValueError):
        return None


def levels(s):
    props = s.get("properties") or {}
    rows = sorted(s.get("levelProperties") or [], key=lambda l: int(str(l.get("hs", "h0"))[1:] or 0))
    out = {}
    for i, l in enumerate(rows):
        m = dict(props); m.update(l)
        for k, short in FIELDS.items():
            v = num(m.get(k))
            if v is None: continue
            out.setdefault(short, [None] * len(rows))[i] = v
    # a value that never changes is stored once
    return {k: (v[0] if len(set(v)) == 1 else v) for k, v in out.items()}


# weapon class by the item id's first four digits (game data numbering)
WCLASS = {130: "1H Sword", 131: "1H Axe", 132: "1H Blunt", 133: "Dagger", 137: "Wand", 138: "Staff", 140: "2H Sword",
          141: "2H Axe", 142: "2H Blunt", 143: "Spear", 144: "Polearm", 145: "Bow", 146: "Crossbow", 147: "Claw"}


def weapons(itemdb):
    """Shop and drop weapons by class: [name, required level, weapon attack, magic attack, speed tier], from the
    site's item data (the same game-file numbers). Event and starter copies are left out."""
    if not itemdb: return {}
    out = {}
    for it in json.load(open(itemdb, encoding="utf-8"))["items"]:
        if len(it) < 8 or not isinstance(it[-1], dict): continue
        c = WCLASS.get(it[1] // 10000)
        if not c or it[0].startswith("Beginner's") or it[6] == 1: continue   # price 1: event copies
        s = it[-1]
        out.setdefault(c, []).append([it[0], it[2], s.get("ATT") or 0, s.get("MATT") or 0, s.get("ASPD") or 6])
    for c in out: out[c].sort(key=lambda w: (w[1], w[2]))
    return out


def ammo():
    """Throwing stars and arrows: [name, weapon attack]. The attack is only in the item's description text."""
    out = {"Claw": [], "Bow": [], "Crossbow": []}
    for i, kind in [(i, "Claw") for i in range(2070000, 2070008)] + [(i, "Bow") for i in range(2060000, 2060004)] + [(i, "Crossbow") for i in range(2061000, 2061004)]:
        d = get(f"{IO}/item/{i}"); desc = d.get("description", {})
        import re
        m = re.search(r"Weapon Attack \+(\d+)", desc.get("description") or "")
        out[kind].append([desc.get("name"), int(m.group(1)) if m else 0])
        time.sleep(0.1)
    return out


def main(path, itemdb=None):
    skills, hidden = {}, {}
    for j in JOBS:
        book = get(f"{IO}/job/{j}/skillbook")
        for s in book.get("skills", []):
            sid = s["id"]; lv = levels(s)
            rec = {"n": s.get("description", {}).get("name") or str(sid), "job": j, "max": s.get("masterLevel") or len(s.get("levelProperties") or []),
                   "act": (s.get("actions") or [None])[0], "w": s.get("weapons") or [], "lv": lv}
            el = (s.get("properties") or {}).get("elemAttr") or s.get("elementalAttribute") or s.get("elemAttr")
            if el: rec["el"] = ELEM.get(str(el).lower()[:1], str(el))
            if sid in HIDDEN: hidden[sid] = rec
            else: skills[sid] = rec
        time.sleep(0.3)
    for hid, parent in HIDDEN.items():
        if hid in hidden and parent in skills:
            p = skills[parent]; h = hidden[hid]
            for k, v in h["lv"].items(): p["lv"].setdefault(k, v)
            if "d" in h["lv"]: p["lv"]["d"] = h["lv"]["d"]
            if "m" in h["lv"]: p["lv"]["m"] = h["lv"]["m"]
            if "t" in h["lv"]: p["lv"]["t"] = h["lv"]["t"]
            if h.get("el") and not p.get("el"): p["el"] = h["el"]
    out = {"source": "MapleStory Classic World game data via maplestory.io (MCW/1)", "built": time.strftime("%Y-%m-%d"),
           "skills": {str(k): v for k, v in sorted(skills.items())}, "weapons": weapons(itemdb), "ammo": ammo()}
    with open(path, "w", encoding="utf-8") as f: json.dump(out, f, separators=(",", ":"))
    print(len(skills), "skills ->", path)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "assets/classic-skills.json", sys.argv[2] if len(sys.argv) > 2 else None)
