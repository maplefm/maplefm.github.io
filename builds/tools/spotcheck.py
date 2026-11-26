#!/usr/bin/env python3
"""Spot check: 50 numbers the three guide pages state, each fetched fresh from the game files (maplestory.io, the
version tools/mcwver.py picks) and compared. Nothing here reads the snapshot or the engine's skill file.
    python3 builds/tools/spotcheck.py  ->  builds/check/spotcheck.json"""
import json, os, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(B, "..", "tools")); import mcwver
IO = mcwver.base()
_cache = {}
def get(path):
    if path in _cache: return _cache[path]
    for _ in range(4):
        try:
            r = json.load(urllib.request.urlopen(urllib.request.Request(IO + path, headers={"User-Agent": "maplefm.gg build check"}), timeout=60)); _cache[path] = r; time.sleep(0.15); return r
        except Exception as e: err = e; time.sleep(3)
    raise SystemExit(f"{path}: {err}")
def item(i): return get(f"/item/{i}")["metaInfo"]
def skill(job, sid):
    for s in get(f"/job/{job}/skillbook")["skills"]:
        if s["id"] == sid: return s
def lvl(job, sid, lv, field):
    s = skill(job, sid); rows = sorted(s["levelProperties"], key=lambda l: int(l["hs"][1:]))
    m = dict(s.get("properties") or {}); m.update(rows[lv - 1]); return float(m[field]) if field in m else None

def guide(fn): return json.load(open(os.path.join(B, fn)))
SIN, SP, PO = guide("sindit.json"), guide("spearman-spear.json"), guide("spearman-polearm.json")
checks = []
def chk(what, page, got):
    ok = str(page) == str(got) or (isinstance(got, float) and float(page) == got)
    checks.append({"what": what, "page": page, "game_files": got, "ok": ok})

# gear rows: id is checked by fetching it; attack, speed, level, need
picks = [(SIN, "Korean Fan"), (SIN, "Shinkita"), (SIN, "Kandine"), (SIN, "Mithril Guards"), (SIN, "Meba"),
         (SP, "Zeco"), (SP, "Bamboo Spear"), (SP, "Serpent's Tongue"), (SP, "Redemption"), (PO, "Crescent Polearm"), (PO, "Yellow Mop"), (PO, "The Nine Dragons"), (PO, "The Gold Dragon")]
for g, name in picks:
    r = next((x for x in g["gear"] + g.get("gear_optional", []) if x["item"] == name), None)
    if not r: continue   # dropped from the guide
    m = item(r["id"])
    chk(f"{name} ({r['id']}) attack", r["attack"], m.get("incWAT")); chk(f"{name} speed", r["speed"], m.get("attackSpeed"))
    need = ", ".join(f"{m[k]} {k[3:]}" for k in ("reqSTR", "reqDEX", "reqINT", "reqLUK") if m.get(k)) or "level only"
    if name in ("Korean Fan", "Shinkita", "Bamboo Spear", "The Nine Dragons", "Kandine", "Redemption"): chk(f"{name} needs", r["needs"], need)
# skill numbers the pages state in words
chk("Lucky Seven 20: damage %", 140, lvl(400, 4001003, 20, "damage")); chk("Lucky Seven stars a cast", 2, lvl(400, 4001003, 20, "bulletCount"))
chk("Double Stab 20: damage %", 160, lvl(400, 4001002, 20, "damage")); chk("Double Stab hits", 2, lvl(400, 4001002, 20, "attackCount"))
chk("Savage Blow 21: hits", 6, lvl(420, 4201003, 21, "attackCount")); chk("Savage Blow 21: % a hit", 65, lvl(420, 4201003, 21, "damage"))
chk("Savage Blow 30: % a hit", 75, lvl(420, 4201003, 30, "damage")); chk("Dagger Booster 1: speed steps", -2, lvl(420, 4201000, 1, "x"))
chk("Dagger Mastery 20: mastery", 10, lvl(420, 4200000, 20, "mastery")); chk("Keen Eyes 15: range", 200, lvl(400, 4000001, 15, "range"))
chk("Nimble Body 15: accuracy", 15, lvl(400, 4000000, 15, "accX")); chk("Disorder 6: monster defense down", 2, lvl(400, 4001000, 6, "y"))
chk("Power Strike 20: damage %", 260, lvl(100, 1001001, 20, "damage")); chk("Slash Blast targets", 6, lvl(100, 1001002, 20, "mobCount"))
chk("Precise Strikes 15: accuracy", 20, lvl(100, 1000002, 15, "accX")); chk("Precise Strikes 15: crit %", 5, lvl(100, 1000002, 15, "crtX"))
chk("Max HP Increase 1: max HP %", 10, lvl(100, 1000001, 1, "mhpR")); chk("Final Attack: Spear 30: damage %", 350, lvl(130, 1301000, 30, "damage"))
chk("Final Attack enable chance %", 25, lvl(130, 1301001, 1, "prop")); chk("Spear Mastery 20: ignore WDEF %", 20, lvl(130, 1300000, 20, "prop"))
chk("Polearm Booster 1: speed steps", -2, lvl(130, 1301003, 1, "x")); chk("Rush cooldown s", 2, lvl(130, 1301005, 1, "cooltime"))
s = [r for r in checks]
n, ok = len(s), sum(1 for r in s if r["ok"])
json.dump({"version": IO, "checked": n, "ok": ok, "accuracy_pct": round(ok / n * 100, 1), "rows": s}, open(os.path.join(B, "check", "spotcheck.json"), "w"), indent=1)
for r in s: print("OK " if r["ok"] else "BAD", r["what"], r["page"], r["game_files"])
print(f"{ok} of {n} match ({ok / n * 100:.1f}%) against {IO}")
