#!/usr/bin/env python3
"""Writes the batch 2 build guides (Spearman spear, Spearman polearm, Assassin, Pure Bandit, Hunter) as builds/<slug>.json
in the shape builds/tools/gwpage.py reads. Stats come from the Classic creation rule (25 points, 4 in each at least, the
sub stat at exactly 5) and each weapon's requirements in the game files (builds/data/weapons.json); skill points from
the job's order below; training maps from the site's damage engine (builds/tools/engrun.cjs on the live world.json);
prices from the board. Run:
    python3 builds/tools/batch2.py
"""
import json, math, os, subprocess, sys, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.dirname(HERE)
ROOT = os.path.dirname(B)
LIVE = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/"
CAP = 70
VERSION = "Classic World v2.1.0 (Nov 24, 2026). Skill numbers: game files MCW 1.2"
WPN = json.load(open(os.path.join(B, "data", "weapons.json")))
SK = json.load(open(os.path.join(ROOT, "assets", "classic-skills.json")))
SKILL = {v["n"] + "|" + str(v["job"]): (int(k), v) for k, v in SK["skills"].items()}
ROWS = {r["item"]: r for r in json.loads(urllib.request.urlopen(LIVE + "summary-public.json", timeout=60).read())["rows"]}
K = ["STR", "DEX", "INT", "LUK"]


def sid(name, job):
    return SKILL[f"{name}|{job}"][0]


def mesos(v):
    if v is None: return None
    if v >= 1e6: return f"{v / 1e6:.1f}M".replace(".0M", "M")
    if v >= 1e4: return f"{round(v / 1000):,}K"
    return f"{int(round(v)):,}"


def price(n):
    r = ROWS.get(n)
    if not r or not r.get("typ"): return {"typical": None, "shown": "not seen on the FM yet", "basis": None}
    return {"typical": int(round(r["typ"])), "shown": mesos(r["typ"]), "basis": r.get("basis"), "sales_seen": r.get("salesN"),
            "rough": any("Rough" in f for f in r.get("flags") or [])}


def needs(n):
    w = WPN[n]
    parts = [f'{w[k]} {k[3:]}' for k in ("reqSTR", "reqDEX", "reqINT", "reqLUK") if w.get(k)]
    return ", ".join(parts) or "level only"


# ------------------------------------------------------------------------------------------------ the five builds
SPEAR = {
    "slug": "spearman-spear", "name": "Spearman, spear", "cls": "Warrior", "job": "Spearman", "w": "Spear", "main": "STR", "sub": "DEX",
    "creation": {"STR": 12, "DEX": 5, "INT": 4, "LUK": 4}, "early": None,
    "weapons": [(10, "Spear"), (15, "Fork on a Stick"), (20, "Fish Spear"), (30, "Forked Spear"), (35, "Nakamaki"), (40, "Zeco"),
                (45, "Bamboo Spear"), (50, "Serpent's Tongue"), (60, "Holy Spear"), (70, "Redemption")],
    "first": [("Power Strike", 20), ("Slash Blast", 20), ("Improved HP Recovery", 3), ("Max HP Increase", 1), ("Precise Strikes", 15), ("Improved HP Recovery", 5)],
    "second": [("Spear Mastery", 5), ("Spear Booster", 1), ("Rush", 1), ("Spear Mastery", 20), ("Final Attack: Spear", 30), ("Spear Booster", 20), ("Rush", 20), ("Iron Will", 30)],
    "jobs": (100, 130), "adv": [(10, "Warrior", "Perion, Dances with Balrog", "Level 10 and 35 STR", "1 SP. Power Strike and Slash Blast open."),
                                (30, "Spearman", "Perion, Dances with Balrog", "Level 30", "Pick Spearman. Spear and polearm skills open.")],
    "third": "Dragon Knight",
}
POLE = dict(SPEAR, slug="spearman-polearm", name="Spearman, polearm", w="Polearm",
            weapons=[(10, "Pole Arm"), (15, "Iron Ball"), (20, "Studded Polearm"), (30, "Mithril Pole Arm"), (35, "Axe Pole Arm"), (40, "Crescent Polearm"),
                     (45, "Yellow Mop"), (50, "The Nine Dragons"), (60, "Skylar"), (70, "The Gold Dragon")],
            second=[("Polearm Mastery", 5), ("Polearm Booster", 1), ("Rush", 1), ("Polearm Mastery", 20), ("Final Attack: Polearm", 30), ("Polearm Booster", 20), ("Rush", 20), ("Iron Will", 30)])
ASSASSIN = {
    "slug": "assassin", "name": "Assassin", "cls": "Thief", "job": "Assassin", "w": "Claw", "main": "LUK", "sub": "DEX",
    "creation": {"STR": 4, "DEX": 5, "INT": 4, "LUK": 12}, "early": 25,
    "weapons": [(10, "Garnier"), (15, "Mithril Titans"), (20, "Adamantium Igor"), (25, "Meba"), (30, "Adamantium Guards"), (35, "Silver Guardian"),
                (40, "Blood Avarice"), (50, "Steel Slain"), (60, "Blood Gigantic"), (70, "Green Scarab")],
    "first": [("Lucky Seven", 20), ("Nimble Body", 15), ("Keen Eyes", 15), ("Disorder", 3), ("Dark Sight", 8)],
    "second": [("Claw Mastery", 5), ("Claw Booster", 1), ("Claw Mastery", 20), ("Critical Throw", 30), ("Haste", 20), ("Drain", 30), ("Claw Booster", 20)],
    "jobs": (400, 410), "adv": [(10, "Thief", "Kerning City, Dark Lord", "Level 10 and 25 DEX", "1 SP. Lucky Seven and Double Stab open."),
                                (30, "Assassin", "Kerning City, Dark Lord", "Level 30", "Pick Assassin. Claw skills open.")],
    "third": "Hermit",
}
BANDIT = {
    "slug": "pure-bandit", "name": "Pure Bandit", "cls": "Thief", "job": "Bandit", "w": "Dagger", "main": "LUK", "sub": "DEX",
    "creation": {"STR": 4, "DEX": 5, "INT": 4, "LUK": 12}, "early": 25,
    "weapons": [(10, "Triangular Zamadar"), (15, "Field Dagger"), (20, "Coconut Knife"), (27, "Forked Dagger"), (30, "Reef Claw"), (40, "Korean Fan"),
                (50, "Shinkita"), (60, "Deadly Fin"), (70, "Kandine")],
    "first": [("Double Stab", 20), ("Nimble Body", 15), ("Disorder", 3), ("Dark Sight", 20), ("Disorder", 6)],
    "second": [("Dagger Mastery", 5), ("Dagger Booster", 1), ("Savage Blow", 21), ("Dagger Mastery", 20), ("Savage Blow", 30), ("Dagger Booster", 20),
               ("Haste", 5), ("Steal", 30), ("Haste", 20)],
    "jobs": (400, 420), "adv": [(10, "Thief", "Kerning City, Dark Lord", "Level 10 and 25 DEX", "1 SP. Lucky Seven and Double Stab open."),
                                (30, "Bandit", "Kerning City, Dark Lord", "Level 30", "Pick Bandit, not Assassin. Dagger skills open.")],
    "third": "Chief Bandit",
}
HUNTER = {
    "slug": "hunter", "name": "Hunter", "cls": "Bowman", "job": "Hunter", "w": "Bow", "main": "DEX", "sub": "STR",
    "creation": {"STR": 5, "DEX": 12, "INT": 4, "LUK": 4}, "early": None,
    "weapons": [(10, "War Bow"), (15, "Composite Bow"), (20, "Hunter's Bow"), (25, "Battle Bow"), (30, "Ryden"), (35, "Red Viper"), (40, "Vaulter 2000"),
                (50, "Olympus"), (60, "Asianic Bow"), (70, "Red Hinkel")],
    "first": [("Arrow Blow", 20), ("Critical Shot", 15), ("Focus", 20), ("Double Shot", 6)],
    "second": [("Bow Mastery", 5), ("Bow Booster", 5), ("Soul Arrow: Bow", 1), ("Bow Mastery", 20), ("Arrow Bomb", 30), ("Final Attack: Bow", 30),
               ("Bow Booster", 20), ("Soul Arrow: Bow", 20)],
    "jobs": (300, 310), "adv": [(10, "Bowman", "Henesys, Athena Pierce", "Level 10 and 25 DEX", "1 SP. Arrow Blow and Double Shot open."),
                                (30, "Hunter", "Henesys, Athena Pierce", "Level 30", "Pick Hunter. Bow skills open.")],
    "third": "Ranger",
}
BUILDS = [SPEAR, POLE, ASSASSIN, BANDIT, HUNTER]


# ------------------------------------------------------------------------------------------------ stats and SP
def plan_stats(b):
    """AP for every level 1 to 70: the sub stat to the job's level 10 need first (thieves), then up to each weapon's
    requirement as late as possible, everything else into the main stat."""
    main, sub = K.index(b["main"]), K.index(b["sub"])
    targets = []   # (first level, last level, value) for the sub stat
    if b["early"]: targets.append((2, 9, b["early"]))
    have = b["creation"][b["sub"]] + (0 if not b["early"] else b["early"] - b["creation"][b["sub"]])
    for lv, n in b["weapons"]:
        need = WPN[n].get("req" + b["sub"]) or 0
        if need > have:
            k = math.ceil((need - have) / 5); targets.append((lv - k + 1, lv, need)); have = need
    st = {1: [b["creation"][x] for x in K]}
    goal = st[1][sub]
    for L in range(2, CAP + 1):
        hit = next((v for a, z, v in targets if a <= L <= z), None)
        if hit: goal = hit
        s = list(st[L - 1]); a = max(0, min(5, goal - s[sub])); s[sub] += a; s[main] += 5 - a; st[L] = s
    assert sum(st[1]) == 25 and min(st[1]) >= 4 and st[1][sub] == 5
    for lv, n in b["weapons"]:   # every weapon wearable the level the guide hands it to you
        w = WPN[n]; s = st[lv]
        assert lv >= (w.get("reqLevel") or 0), (n, lv)
        for i, k in enumerate(K): assert s[i] >= (w.get("req" + k) or 0), (b["slug"], n, lv, k, s)
    rules = [{"levels": "1 to 9", "ap": (f"{b['sub']} to {b['early']}, rest {b['main']}" if b["early"] else f"all {b['main']}"),
              "why": {"Warrior": "Warrior job advance needs 35 STR at 10", "Thief": "Thief job advance needs 25 DEX at 10", "Bowman": "Bowman job advance needs 25 DEX at 10"}[b["cls"]]}]
    for a, z, v in targets:
        if a < 10: continue
        n = next(n for lv, n in b["weapons"] if lv == z)
        rules.append({"levels": f"{a} to {z}" if a != z else str(z), "ap": f"all {b['sub']} (to {v})" if z - a >= 1 or (v - st[a - 1][sub]) >= 5 else f"{b['sub']} to {v}, rest {b['main']}",
                      "why": f"{n} at {z} needs {v} {b['sub']}"})
    rules.append({"levels": "the rest", "ap": f"all {b['main']}", "why": f"{b['main']} is your damage stat"})
    table = [{"level": L, "STR": st[L][0], "DEX": st[L][1], "INT": st[L][2], "LUK": st[L][3]} for L in (10, 20, 30, 40, 50, 60, 70)]
    return st, rules, table


def plan_sp(b):
    """the level each step of the order completes, and each skill's points at every level"""
    order = []
    for book, steps, job, start in (("1st job", b["first"], b["jobs"][0], 10), ("2nd job", b["second"], b["jobs"][1], 30)):
        have, spent = {}, 0
        for n, to in steps:
            i, rec = SKILL[f"{n}|{job}"]
            assert to <= rec["max"], (n, to, rec["max"])
            spent += to - have.get(n, 0); have[n] = to
            pts = lambda L: 1 + 3 * ((min(L, 30) if book == "1st job" else L) - start)
            L = next((L for L in range(start, CAP + 1) if pts(L) >= spent), None)
            assert L, (b["slug"], n, to, "needs more SP than 70 gives")
            order.append({"level": L, "book": book, "skill": n, "id": i, "to": to})
    return order


def skills_at(b, order, L):
    out = {}
    for book, start in (("1st job", 10), ("2nd job", 30)):
        if L < start: continue
        pts = 1 + 3 * ((min(L, 30) if book == "1st job" else L) - start)
        for s in [x for x in order if x["book"] == book]:
            need = s["to"] - out.get(s["id"], 0)
            if need <= 0: continue
            g = min(need, pts); out[s["id"]] = out.get(s["id"], 0) + g; pts -= g
            if pts <= 0: break
    return out


def weapon_at(b, L):
    w = None
    for lv, n in b["weapons"]:
        if lv <= L: w = n
    return w


# ------------------------------------------------------------------------------------------------ engine run
BANDS = [(10, 14), (15, 19), (20, 24), (25, 29), (30, 34), (35, 39), (40, 44), (45, 49), (50, 54), (55, 59), (60, 64), (65, 70)]


def engine(builds, plans):
    chars = {}
    for b in builds:
        st, order = plans[b["slug"]]
        lst = []
        for L in range(10, CAP + 1):
            n = weapon_at(b, L); w = WPN[n]
            job = b["job"] if L >= 30 else b["cls"]
            ammo = {"Claw": ("Wolbi Throwing Stars" if L >= 20 else "Subi Throwing Stars"), "Bow": "Arrows for Bows"}.get(b["w"])
            atk = {"Wolbi Throwing Stars": 17, "Subi Throwing Stars": 15, "Arrows for Bows": 0}.get(ammo, 0)
            c = {"lv": L, "job": job, "type": "bandit" if b["w"] == "Dagger" else "assassin" if b["w"] == "Claw" else "pure",
                 "str": st[L][0], "dex": st[L][1], "int": st[L][2], "luk": st[L][3], "w": b["w"],
                 "gear": {b["w"]: {"name": n, "watk": w["watk"], "spd": w["spd"], "ammo": ammo, "ammoAtk": atk}},
                 "skills": {str(k): v for k, v in skills_at(b, order, L).items()}, "maps": L in [a for a, _ in BANDS] or L == CAP}
            lst.append(c)
        chars[b["slug"]] = lst
    world = os.path.join(tempfile.gettempdir(), "fm-world.json")
    if not os.path.exists(world):
        open(world, "wb").write(urllib.request.urlopen(LIVE + "world.json", timeout=120).read())
    ci, co = os.path.join(tempfile.gettempdir(), "fm-chars.json"), os.path.join(tempfile.gettempdir(), "fm-eng.json")
    json.dump(chars, open(ci, "w"))
    subprocess.run(["node", os.path.join(HERE, "engrun.cjs"), ci, world, co], check=True)
    return json.load(open(co))


# ------------------------------------------------------------------------------------------------ the words
TEXT = {
    "spearman-spear": {
        "pitch": "STR with DEX only to each spear's need. Power Strike and Slash Blast to 30, then Spear Mastery, Final Attack and Rush.",
        "best": ["Slash Blast hits 6 mobs from level 10", "Cheap spears all the way to 50", "Final Attack: Spear hits for 350%"],
        "weak": ["Misses a lot from 30 to 40", "Slow spears, speed 6 to 7", "DEX = your level from 30"],
        "why": [
            "Power Strike 20 hits for 260% and Slash Blast 20 hits 6 mobs at 130%. Max both before anything else and you have a single target attack and a mobbing attack by 23.",
            "Precise Strikes 15 gives +20 accuracy and +5% crit. Warriors miss a lot from 30 to 40, so it goes in before you leave 1st job.",
            "Spear Mastery 5 opens Spear Booster, and Booster 1 already gives the full 2 steps of speed. The other 19 points only make it last longer.",
            "Final Attack: Spear 30 swings again for 350% on 25% of your hits. That's the biggest damage jump in 2nd job, so it comes right after Mastery 20.",
            "Spears need DEX equal to their level from 30. You only buy DEX in the levels right before each new spear, so every other point goes to STR.",
        ],
        "mistakes": [
            "Putting points into Iron Body. It only adds defense and does nothing for your damage or accuracy.",
            "Maxing Spear Booster early. Level 1 is the full speed boost; the rest only stretches it from 100 to 300 seconds, which costs you 19 SP that should be in Final Attack.",
            "Forgetting DEX before 30. Forked Spear needs 30 DEX, so put 26 to 30 into DEX or you hit 30 with a spear you can't wear.",
            "Buying a polearm with a spear build. Spear Mastery and Final Attack: Spear only work with a spear.",
        ],
    },
    "spearman-polearm": {
        "pitch": "STR with DEX only to each polearm's need. Power Strike and Slash Blast to 30, then Polearm Mastery, Final Attack and Rush.",
        "best": ["Slash Blast hits 6 mobs from level 10", "Polearms hit harder than spears at the same level", "Final Attack: Polearm hits for 350%"],
        "weak": ["Slowest weapons, speed 7 to 8", "Misses a lot from 30 to 40", "The Nine Dragons costs a lot at 50"],
        "why": [
            "Power Strike 20 hits for 260% and Slash Blast 20 hits 6 mobs at 130%. Max both before anything else and you have a single target attack and a mobbing attack by 23.",
            "Precise Strikes 15 gives +20 accuracy and +5% crit. Warriors miss a lot from 30 to 40, so it goes in before you leave 1st job.",
            "Polearm Mastery 5 opens Polearm Booster, and Booster 1 already gives the full 2 steps of speed. The other 19 points only make it last longer.",
            "Final Attack: Polearm 30 swings again for 350% on 25% of your hits. That's the biggest damage jump in 2nd job, so it comes right after Mastery 20.",
            "Polearms need DEX from 15 and DEX equal to their level from 30. You only buy DEX in the levels right before each new polearm, so every other point goes to STR.",
        ],
        "mistakes": [
            "Putting points into Iron Body. It only adds defense and does nothing for your damage or accuracy.",
            "Maxing Polearm Booster early. Level 1 is the full speed boost; the rest only stretches it from 100 to 300 seconds, which costs you 19 SP that should be in Final Attack.",
            "Forgetting DEX for Iron Ball at 15. It needs 15 DEX, so put 13 to 15 into DEX first.",
            "Buying a spear with a polearm build. Polearm Mastery and Final Attack: Polearm only work with a polearm.",
        ],
    },
    "assassin": {
        "pitch": "LUK with DEX only to each claw's need. Lucky Seven from 10, then Claw Mastery, Critical Throw and Haste.",
        "best": ["Ranged from level 10", "Hits mobs on other platforms", "Critical Throw adds 15% crit at 35% extra damage"],
        "weak": ["Stars cost mesos to recharge", "DEX = your level for claws", "Steel Slain at 50 is expensive"],
        "why": [
            "Lucky Seven throws 2 stars for 140% each at 20. Max it first and it carries you all the way to 70.",
            "Claw Mastery 5 opens Claw Booster, and Booster 1 already gives the full 2 steps of speed. Mastery to 20 next for the accuracy and steadier damage.",
            "Critical Throw 30 is 15% crit for 35% more damage on every throw. It's the main damage skill of 2nd job.",
            "Haste 20 before Drain. Drain is a single target 240% hit that heals you, but Lucky Seven already does more, and Haste gets you around maps faster.",
            "Claws need DEX equal to their level. You buy DEX only in the levels right before each new claw, everything else goes to LUK.",
        ],
        "mistakes": [
            "Buying Kumbi or Tobi stars to level. Wolbi from Max in Kerning City is 1,000 a set and is all you need; the big stars are a luxury.",
            "Skipping DEX before a new claw. Steel Slain at 50 needs 50 DEX and Blood Gigantic at 60 needs 60.",
            "Maxing Claw Booster early. Level 1 is the full speed boost; the other 19 points only stretch it from 100 to 300 seconds.",
            "Putting SP in Keen Eyes past 15. It's already maxed at 15.",
        ],
    },
    "pure-bandit": {
        "pitch": "LUK with 25 DEX, a dagger from 10. Double Stab in 1st job, then Savage Blow and a Korean Fan at 40.",
        "best": ["Double Stab from level 10", "Savage Blow 6 hits a cast from 21 points", "Korean Fan needs no DEX"],
        "weak": ["Melee: you walk to every mob and take hits", "Single target until Steal", "DEX for daggers from 47"],
        "why": [
            "Double Stab 20 hits twice for 160%. It's your only attack until 30, so max it first.",
            "Dark Sight 20 makes you invisible for longer and needs Disorder 3. The last 3 points finish Disorder at 6.",
            "Dagger Mastery 5 and Booster 1 first, then straight into Savage Blow. At 21 it hits 6 times for 65%, 390% a cast.",
            "Korean Fan at 40 is speed 3 and needs no DEX, so DEX stays at 25 until 47.",
            "Steal 30 hits 2 mobs and stuns. It comes after Savage Blow 30 so your main attack is maxed first.",
        ],
        "mistakes": [
            "Putting SP in Keen Eyes. It only lengthens Lucky Seven's range, and a bandit never throws.",
            "Leveling Haste before Savage Blow. Haste 20 is 20 SP, close to 7 levels of Savage Blow.",
            "Forgetting DEX before 50. Shinkita needs 45 DEX, so put 47 to 49 into DEX.",
            "Maxing Dagger Booster early. Level 1 is the full speed boost; the rest only stretches it from 100 to 300 seconds.",
        ],
    },
    "hunter": {
        "pitch": "DEX with STR only to each bow's need. Arrow Blow in 1st job, then Bow Mastery, Arrow Bomb and Final Attack.",
        "best": ["Ranged from level 10", "Arrow Bomb hits 6 mobs", "Arrows cost almost nothing"],
        "weak": ["STR = your level for bows", "Low HP", "Soul Arrow comes late"],
        "why": [
            "Arrow Blow 20 hits for 240% with one arrow. It's your main attack until 30, so max it first.",
            "Critical Shot 15 is 20% crit, and Focus 20 adds 25 accuracy and avoid. Both help every shot you take.",
            "Bow Mastery 5 opens Bow Booster. Booster 5 and Soul Arrow 1 early so you can stop carrying arrows sooner.",
            "Arrow Bomb 30 hits 6 mobs for 130% and can stun. It's how a Hunter mobs, so it comes right after Mastery 20.",
            "Bows need STR equal to their level from 15. You buy STR only in the levels right before each new bow, everything else goes to DEX.",
        ],
        "mistakes": [
            "Skipping STR before a new bow. Ryden at 30 needs 30 STR, Olympus at 50 needs 50.",
            "Maxing Bow Booster early. The speed is the same at every level; the extra points only make it last longer.",
            "Buying a crossbow. Hunter skills only work with a bow.",
            "Putting 1st job SP into Power Knockback before Arrow Blow is maxed. Arrow Blow is the attack you use the most.",
        ],
    },
}
COMPARE = {
    "spearman-spear": [("Spearman, spear (this guide)", "best", "STR, DEX = weapon level"), ("Spearman, polearm", "harder hits, slower weapons", ""), ("Dexless spearman", "raw damage", "can't wear level 30+ weapons")],
    "spearman-polearm": [("Spearman, polearm (this guide)", "", ""), ("Spearman, spear", "faster spears, cheaper at 50", ""), ("Dexless spearman", "raw damage", "can't wear level 30+ weapons")],
    "assassin": [("Assassin (this guide)", "", ""), ("Sindit", "Lucky Seven to 40, then a dagger", ""), ("Pure Bandit", "dagger from 10", ""), ("Dexless Assassin", "all LUK", "misses more")],
    "pure-bandit": [("Pure Bandit (this guide)", "", ""), ("Sindit", "Lucky Seven to 40, then a dagger", ""), ("Assassin", "claw from 10", ""), ("Dexless Bandit", "all LUK", "misses more")],
    "hunter": [("Hunter (this guide)", "", ""), ("Crossbowman", "crossbow instead of a bow", "")],
}
LINKS = {"Spearman, spear": "spearman-spear", "Spearman, polearm": "spearman-polearm", "Assassin": "assassin", "Pure Bandit": "pure-bandit", "Hunter": "hunter", "Sindit": "sindit"}


def build_json(b, st, rules, table, order, eng):
    t = TEXT[b["slug"]]
    gear = []
    for lv, n in b["weapons"]:
        w = WPN[n]
        gear.append({"level": lv, "slot": b["w"], "item": n, "id": w["id"], "needs": needs(n), "attack": w["watk"], "speed": w["spd"], "price": price(n), "why": ""})
    cost = sum((g["price"]["typical"] or 0) for g in gear if g["level"] <= 50)
    train = []
    for a, z in BANDS:
        e = eng[b["slug"]].get(str(a)) or {}
        maps = [{"map": m["map"], "monsters": m["monsters"][:3]} for m in (e.get("maps") or [])]
        if maps: train.append({"levels": f"{a} to {z}", "maps": maps, "tip": ""})
    comp = []
    for nm, best, weak in COMPARE[b["slug"]]:
        comp.append({"build": nm, "best_at": best or t["best"][0], "weak": weak or t["weak"][0]})
    return {
        "slug": f"/builds/{b['slug']}/",
        "header": {"class": b["cls"], "job_path": f"{b['cls']} (10) → {b['job']} (30)", "build": b["name"], "pitch": t["pitch"],
                   "best_at": t["best"], "weak_spots": t["weak"], "difficulty": "Easy" if b["w"] in ("Claw", "Bow") else "Medium",
                   "level_range": "1 to 70", "game_version": VERSION,
                   "gear_cost": {"to_level_50": {"mesos": cost, "shown": "about " + mesos(cost)}, "note": "weapons to 50 at typical FM prices"}},
        "creation": {"stats": b["creation"], "main": b["main"], "sub": b["sub"], "source": "Classic creation: 25 points, 4 minimum each, sub stat starts at exactly 5 (Adam, Nov 25 2026)"},
        "stat_plan": {"rule": rules, "table": table},
        "skill_order": [dict(s, why="") for s in order],
        "gear": gear, "gear_optional": [],
        "advancement": [{"level": a, "job": j, "where": w, "needs": n, "gets": g} for a, j, w, n, g in b["adv"]] + [{"level": "3rd job", "job": b["third"], "where": "not in Classic World yet", "needs": "", "gets": ""}],
        "resets": [{"what": "SP Reset Scroll", "when": "not needed", "cost": None, "worth_it": "No", "why": "This build never changes its main attack, so there are no dead points to move."},
                   {"what": "AP Reset Scroll", "when": "only to fix a wrong stat", "cost": None, "worth_it": "Rarely", "why": "Gives back all your AP at once. Only worth it if you put AP in the wrong stat."},
                   {"what": "HP washing", "when": "never", "cost": None, "worth_it": "No", "why": "An AP Reset gives back the HP AP too, so washing gains nothing in Classic."}],
        "train_ranges": train,
        "why": t["why"], "mistakes": t["mistakes"], "compare": comp,
        "future": [{"when": "70", "status": "3rd job is not in Classic World yet", "plan": f"Job advance to {b['third']}. This guide gets extended when it releases."}],
        "search": {"title": f"{b['name']} Build Guide: AP and SP | Club FM"[:59], "description": f"MapleStory Classic {b['name'].lower()} build: AP and SP for every level from 1 to 70, weapons and where to get them, and where to train."[:155]},
    }


def main():
    plans, out = {}, {}
    for b in BUILDS:
        st, rules, table = plan_stats(b)
        order = plan_sp(b)
        plans[b["slug"]] = (st, order)
        out[b["slug"]] = (st, rules, table, order)
    eng = engine(BUILDS, plans)
    for b in BUILDS:
        st, rules, table, order = out[b["slug"]]
        d = build_json(b, st, rules, table, order, eng)
        json.dump(d, open(os.path.join(B, b["slug"] + ".json"), "w"), indent=1, ensure_ascii=False)
        e70 = eng[b["slug"]][str(CAP)]
        print(b["slug"], "| lv1", st[1], "lv70", st[CAP], "| attack at 70", e70["attack"], e70["dps"], "| maps", len(d["train_ranges"]))


if __name__ == "__main__":
    main()
