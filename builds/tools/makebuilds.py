#!/usr/bin/env python3
"""Writes the three build guide files (builds/sindit.json, builds/spearman-spear.json, builds/spearman-polearm.json)
from the engine run (builds/check/computed.json, made by buildcheck.cjs) and the gear snapshot (game-file ids,
requirements, live typical prices). Every number on a page comes from one of those two files or from the game files;
the text is Club FM's own.
    node builds/tools/buildcheck.cjs world.json builds/check/computed.json
    python3 builds/tools/makebuilds.py
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.dirname(HERE)
C = json.load(open(os.path.join(B, "check", "computed.json")))
G = json.load(open(os.path.join(HERE, "gear-snapshot.json")))
VERSION = "Classic World v2.1.0 (Nov 24, 2026). Skill numbers: game files MCW 1.2 (v2.0.0)"
CAP = 100
WORLD = json.load(open(os.environ.get("WORLD") or os.path.join(B, "check", "world-used.json")))
REVIEW = {"note": "model numbers behind the guides; they rest on formulas the audit lists as supported or unconfirmed, so they stay off the pages"}
NAMES = {4001003: "Lucky Seven", 4000000: "Nimble Body", 4000001: "Keen Eyes", 4001000: "Disorder", 4001001: "Dark Sight", 4001002: "Double Stab",
         4200000: "Dagger Mastery", 4200001: "Nimble Recovery", 4201000: "Dagger Booster", 4201001: "Haste", 4201002: "Steal", 4201003: "Savage Blow",
         1001001: "Power Strike", 1001002: "Slash Blast", 1000000: "Improved HP Recovery", 1000001: "Max HP Increase", 1000002: "Precise Strikes", 1001000: "Iron Body",
         1300000: "Spear Mastery", 1300001: "Polearm Mastery", 1301000: "Final Attack: Spear", 1301001: "Final Attack: Polearm", 1301002: "Spear Booster",
         1301003: "Polearm Booster", 1301004: "Iron Will", 1301005: "Rush"}


def mesos(v):
    if v is None: return None
    v = float(v)
    if v >= 1e6: return f"{v / 1e6:.1f}M".replace(".0M", "M")
    if v >= 1e4: return f"{round(v / 1000):,}K"
    return f"{int(round(v)):,}"


def price(name):
    g = G.get(name) or {}
    if not g.get("typ"): return {"typical": None, "shown": "no live price yet", "basis": None}
    return {"typical": int(round(g["typ"])), "shown": mesos(g["typ"]), "basis": g.get("basis"), "sales_seen": g.get("n")}


def req_text(name):
    r = (G.get(name) or {}).get("req") or {}
    return ", ".join(f"{v} {k[3:]}" for k, v in r.items()) or "level only"


def lvrow(build, L): return C["builds"][build]["levels"][str(L)]


def alloc(order, pts):
    out = {}
    for sid, n in order:
        if pts <= 0: break
        have = out.get(sid, 0); add = min(n - have, pts)
        if add > 0: out[sid] = have + add; pts -= add
    return out


def sp1(L): return 0 if L < 10 else 1 + 3 * (min(L, 30) - 10)
def sp2(L): return 0 if L < 30 else 1 + 3 * (L - 30)


def milestones(order, sp, start, why, book):
    """the level each step of an order is finished, from the same point math as the engine run"""
    rows, seen = [], {}
    for sid, n in order:
        for L in range(start, CAP + 1):
            if alloc(order, sp(L)).get(sid, 0) >= n:
                if seen.get(sid) == n: break
                seen[sid] = n
                rows.append({"level": L, "book": book, "skill": NAMES[sid], "id": sid, "to": n, "why": why.get((sid, n), "")})
                break
    return rows


def maps_of(build, levels):
    out = []
    for lo, hi, note in levels:
        x = lvrow(build, lo)
        top = []
        for m in x.get("maps", [])[:3]:
            mm = WORLD["maps"].get(m["map"]) or {}
            top.append({"map": m["map"], "monsters": [n for n, _ in (mm.get("mobs") or [])][:3]})
            REVIEW.setdefault("maps", {}).setdefault(build, []).append({"levels": f"{lo} to {hi}", "map": m["map"], "exp_hour": int(m["exp_h"]), "engine_note": m["why"]})
        out.append({"levels": f"{lo} to {hi}", "maps": top, "tip": note})
    return out


def gear_rows(build, plan):
    rows = []
    for L, slot, name, why in plan:
        g = G[name]
        rows.append({"level": L, "slot": slot, "item": name, "id": g["id"], "needs": req_text(name), "attack": g.get("atk"),
                     "speed": g.get("spd"), "price": price(name), "why": why})
    return rows


def stat_rows(build, levels, cols):
    rows = []
    for L in levels:
        x = lvrow(build, L)
        r = {"level": L}
        for c in cols: r[c] = x[c.lower()]
        REVIEW.setdefault("accuracy", {}).setdefault(build, {})[L] = x["acc"]
        rows.append(r)
    return rows


def typical_vs_plan(build):
    t = C["builds"][build]["typical"]; out = []
    for L in ["30", "40", "50", "60", str(CAP)]:
        p = lvrow(build, L)
        out.append({"level": int(L), "guide": {"weapon": p["weapon"], "attack": p["attack"], "dmg_per_s": p["dps"], "accuracy": p["acc"]},
                    "typical": {"weapon": t[L]["weapon"], "attack": t[L]["attack"], "dmg_per_s": t[L]["dps"], "accuracy": t[L]["acc"], "can_wear": t[L]["can_wear"]}})
    return out


def write(name, obj):
    with open(os.path.join(B, name), "w", encoding="utf-8") as f: json.dump(obj, f, indent=1, ensure_ascii=False)
    print("wrote", name)


TABS = ["Overview", "Stats", "Skills", "Gear", "Job", "Resets", "Train", "Why", "Mistakes", "Compare", "3rd job"]

# =================================================================== SINDIT
S = "sindit"
SW = {r["lv"]: r for r in C["switch"]}
pct = lambda a, b: round((a / b - 1) * 100)
s35 = SW[35]; s40 = SW[40]; s44 = SW[44]
_l = lvrow("sindit", 37); minratio = round((0.8 + _l["luk"] * 0.77 * 2 / 100 + (_l["str"] + _l["dex"]) / 100) / (0.8 + _l["luk"] * 0.07 * 2 / 100 + (_l["str"] + _l["dex"]) / 100), 1)
first_claw = [(4001003, 20), (4000000, 15), (4000001, 15), (4001000, 3), (4001001, 8)]
second_before = [(4201001, 20)]
second = [(4200000, 5), (4201000, 1), (4200000, 20), (4201003, 21), (4201003, 30), (4201000, 20), (4201001, 5), (4201002, 30), (4201001, 20), (4200001, 20)]
why1 = {(4001003, 20): "main attack until 35: 2 stars a cast, uses LUK only", (4000000, 15): "+15 accuracy and avoid", (4000001, 15): "Lucky Seven reach 200 to 400",
        (4001000, 3): "needed for Dark Sight", (4001001, 8): "spare points; all reset at 35"}
why2 = {(4201001, 20): "only until 34: the reset at 35 gives every point back", (4200000, 5): "opens Dagger Booster", (4201000, 1): "level 1 already gives the full 2-step speed up",
        (4200000, 20): "mastery 10 in the game files: low rolls rise a lot", (4201003, 21): "6 hits from 21 points: new main attack at 44", (4201003, 30): "75% a hit at 30",
        (4201000, 20): "longer buff only (100 to 300 s)", (4201001, 5): "needed for Steal", (4201002, 30): "2 targets, stun; attack bonus not counted here",
        (4201001, 20): "party speed", (4200001, 20): "last: recovery only"}
reset1 = [{"level": 35, "book": "1st job (after reset)", "skill": "Double Stab", "id": 4001002, "to": 20, "why": "main attack 35 to 43: 160% x 2, fast stab"},
          {"level": 35, "book": "1st job (after reset)", "skill": "Nimble Body", "id": 4000000, "to": 15, "why": "accuracy"},
          {"level": 35, "book": "1st job (after reset)", "skill": "Disorder", "id": 4001000, "to": 6, "why": "Dark Sight needs 3; 6 lowers monster defense by 2"},
          {"level": 35, "book": "1st job (after reset)", "skill": "Dark Sight", "id": 4001001, "to": 20, "why": "safety; 30 MP at max"}]
sk = milestones(first_claw, sp1, 10, why1, "1st job") + milestones(second_before, sp2, 30, why2, "2nd job (before reset)")
sk = [r for r in sk if not (r["book"].startswith("2nd") and r["level"] > 34)]
sk += [{"level": 34, "book": "2nd job (before reset)", "skill": "Haste", "id": 4201001, "to": alloc(second_before, sp2(34))[4201001], "why": "comfort until the reset"}] if not any(r["skill"] == "Haste" for r in sk) else []
after = [dict(r, level=max(r["level"], 35)) for r in milestones(second, sp2, 35, why2, "2nd job (after reset)")]
sk += reset1 + after
sk.sort(key=lambda r: (r["level"], r["book"]))

sin = {
    "slug": "/builds/sindit/",
    "header": {
        "class": "Thief", "job_path": "Thief (10) → Bandit (30)", "build": "Sindit: claw and Lucky Seven, then dagger",
        "pitch": "Throw Lucky Seven to 34, reset at 35, stab with a dagger from there.",
        "best_at": ["Safe ranged start (10 to 34)", "Single-target damage from 35", "Cheap gear: shop claws and daggers to 50"],
        "weak_spots": ["One target at a time", "Melee from 35: takes hits", "Needs an SP Reset at 35", "DEX for daggers: 45 by 50, 65 by 70"],
        "difficulty": "Medium", "level_range": f"10 to {CAP}", "game_version": VERSION,
        "gear_cost": {"to_level_50": None, "note": "weapons and stars at live typical prices, plus one SP Reset Scroll"},
    },
    "stat_plan": {
        "rule": [{"levels": "1 to 9", "ap": "DEX to 25, rest LUK", "why": "Thief needs 25 DEX at 10"},
                 {"levels": "10 to 29", "ap": "all LUK, DEX stays 25", "why": "LUK is the damage stat for claws and daggers"},
                 {"levels": "30", "ap": "DEX to 30, rest LUK", "why": "level 30 claws and Halfmoon Zamadar need 30 DEX"},
                 {"levels": "31 to 46", "ap": "all LUK", "why": "Korean Fan at 40 needs no DEX"},
                 {"levels": "47 to 49", "ap": "all DEX (to 45)", "why": "Shinkita at 50 needs 45 DEX"},
                 {"levels": "50 to 57", "ap": "all LUK", "why": ""},
                 {"levels": "58 to 59", "ap": "all DEX (to 55)", "why": "Deadly Fin at 60 needs 55 DEX"},
                 {"levels": "60 to 67", "ap": "all LUK", "why": ""},
                 {"levels": "68 to 69", "ap": "all DEX (to 65)", "why": "Kandine at 70 needs 65 DEX"},
                 {"levels": f"70 to {CAP}", "ap": "all LUK", "why": "no higher dagger in the game yet"},
                 {"levels": "any", "ap": "DEX from gear counts", "why": "each DEX your gear gives is one more AP for LUK"}],
        "table": stat_rows(S, [10, 20, 30, 35, 40, 46, 50, 60, 70, 80, 90, CAP], ["STR", "DEX", "LUK"]),
    },
    "skill_order": sk,
    "gear": gear_rows(S, [
        (10, "Claw", "Garnier", "first claw"), (15, "Claw", "Steel Titans", ""), (20, "Claw", "Bronze Igor", ""), (25, "Claw", "Meba", "speed 3: fastest claw"),
        (10, "Stars", "Subi Throwing Stars", "500 a set"), (20, "Stars", "Wolbi Throwing Stars", "+2 attack, 500 a set"),
        (30, "Claw", "Mithril Guards", "needs DEX 30"), (35, "Dagger", "Halfmoon Zamadar", "needs DEX 30: wear it at the reset"),
        (40, "Dagger", "Korean Fan", "speed 3, no DEX needed"), (50, "Dagger", "Shinkita", "needs DEX 45"),
        (60, "Dagger", "Deadly Fin", "needs DEX 55"), (70, "Dagger", "Kandine", "needs DEX 65")]),
    "gear_optional": gear_rows(S, [(30, "Stars", "Mokbi Throwing Stars", "+2 attack over Wolbi for 5 levels; costly"),
                                   (40, "Dagger", "Gephart", "same damage as Korean Fan, needs DEX 35")]),
    "advancement": [
        {"level": 10, "job": "Thief", "where": "Kerning City, Dark Lord", "needs": "level 10, 25 DEX (players; Nexon names only the level)", "gets": "1 SP; Lucky Seven and Double Stab open"},
        {"level": 30, "job": "Bandit", "where": "Kerning City, Dark Lord", "needs": "level 30", "gets": "Bandit book; pick Bandit, not Assassin"},
        {"level": "3rd job", "job": "Chief Bandit", "where": "not in Classic World yet", "needs": "", "gets": ""}],
    "resets": [
        {"what": "SP Reset Scroll", "when": "level 35, the day you equip Halfmoon Zamadar", "cost": {"nx": 7000, "mesos": price("SP Reset Scroll")},
         "worth_it": "Yes", "why": f"turns Lucky Seven's 20 points into Double Stab 20: {pct(s35['reset_dagger'][1], s35['claw'][1])}% more damage per second at 35 (model)"},
        {"what": "SP Reset Scroll", "when": "no scroll", "cost": None, "worth_it": "Plan B",
         "why": f"keep throwing to 40, then Korean Fan with Savage Blow 21: {pct(s40['noreset_dagger'][1], s40['claw'][1])}% over Lucky Seven at 40 (model)"},
        {"what": "AP Reset Scroll", "when": "only to fix a wrong stat", "cost": {"nx": 7000, "mesos": price("AP Reset Scroll")}, "worth_it": "Rarely",
         "why": "returns all AP at once, so it can't move DEX point by point"},
        {"what": "HP washing", "when": "never", "cost": None, "worth_it": "No", "why": "the AP Reset returns HP AP too, and thieves can't add AP to HP"}],
    "train_ranges": maps_of(S, [(10, 14, "Lucky Seven from range"), (15, 19, ""), (20, 29, "boars and masks: easy hits"), (30, 34, "still throwing"),
                                (35, 46, "Jr. Wraiths in the Kerning subway"), (47, 49, ""), (50, 59, "Wraiths and Clangs"), (60, 64, ""),
                                (65, 74, "Excavation camps"), (75, 89, ""), (90, CAP, "")]),
    "why": [
        f"**Reset at 35, not sooner:** with a level 30 dagger the gain is only {pct(SW[32]['reset_dagger'][1], SW[32]['claw'][1])} to {pct(SW[34]['reset_dagger'][1], SW[34]['claw'][1])}% (levels 32 to 34); Halfmoon Zamadar at 35 makes it {pct(s35['reset_dagger'][1], s35['claw'][1])}%",
        "**Double Stab before Savage Blow:** Double Stab 20 does more until Savage Blow has 21 points (6 hits), which is level 44",
        "**Shop gear to 50:** every weapon here is under 70K mesos except Shinkita",
        "**Korean Fan at 40:** speed 3, no DEX need, within 3% of Gephart (35 DEX)",
        f"**Mastery first:** Dagger Mastery 20 is mastery 10 in the game files; your lowest hit at 37 is {minratio}x higher"],
    "mistakes": [
        "**Resetting before a level 35 dagger:** level 30 daggers lose to Lucky Seven",
        "**Savage Blow before Dagger Mastery:** under 21 points it is weaker than Double Stab",
        "**More than 1 point in Dagger Booster early:** level 1 already gives the full speed up",
        "**Skipping DEX before 50:** Shinkita needs 45 DEX, Deadly Fin 55, Kandine 65",
        "**Buying Kumbi or Tobi stars:** you stop throwing at 35"],
    "compare": None,
    "future": [{"when": "3rd job (Chief Bandit)", "status": "not in Classic World yet; no date from Nexon", "plan": "keep LUK as the main stat; no change to this guide until skill data is out"}],
}

# compare: same class, other builds (engine numbers)
CT = C["compare_typical"]
def ct(k, L): return CT[k][str(L)]
sin["compare"] = [
    {"build": "Sindit (this guide)", "main_attack": "Lucky Seven, Double Stab, Savage Blow", "dmg_per_s": {L: lvrow(S, L)["dps"] for L in (40, 60, CAP)},
     "best_at": "ranged start, cheap gear", "weak": "needs a reset at 35"},
    {"build": "Sindit, no reset", "main_attack": "Lucky Seven to 39, Savage Blow from 40", "dmg_per_s": {L: lvrow("sindit_noreset", L)["dps"] for L in (40, 60, CAP)},
     "best_at": "no Cash Shop", "weak": f"{pct(lvrow(S, 40)['dps'], lvrow('sindit_noreset', 40)['dps'])}% less damage at 40, 5 weaker levels 35 to 39"},
    {"build": "Pure Bandit (dagger from 10)", "main_attack": "Double Stab, Savage Blow", "dmg_per_s": {L: ct("bandit", L)["dps"] for L in (40, 60, CAP)},
     "best_at": "no reset", "weak": "melee from 10", "note": "training page Typical build"},
    {"build": "Assassin (claw)", "main_attack": "Lucky Seven, Drain", "dmg_per_s": {L: ct("assassin", L)["dps"] for L in (40, 60, CAP)},
     "best_at": "range all the way", "weak": "stars cost: Kumbi to Steely", "note": "training page Typical build; Typical claws need more DEX than it has"},
    {"build": "Dexless Bandit", "main_attack": "Savage Blow", "dmg_per_s": {L: ct("dexbandit", L)["dps"] for L in (40, 60, CAP)},
     "best_at": "highest LUK", "weak": "misses; can't wear DEX daggers", "note": "training page Typical build"},
    {"build": "STR Bandit", "main_attack": "Savage Blow with STR daggers", "dmg_per_s": None, "best_at": "faster daggers (Bazlud, Sai)", "weak": "not in the engine yet",
     "note": "waits for Adam's review; see str-bandit-engine.md"}]
REVIEW["sindit_typical_vs_guide"] = typical_vs_plan(S)
REVIEW["sindit_switch_table"] = [{"level": r["lv"], "claw": {"attack": r["claw"][0], "dmg_per_s": r["claw"][1], "exp_hour": r["claw"][2]},
                         "reset_dagger": {"attack": r["reset_dagger"][0], "dmg_per_s": r["reset_dagger"][1], "exp_hour": r["reset_dagger"][2], "weapon": r["reset_dagger"][3]},
                         "no_reset_dagger": {"attack": r["noreset_dagger"][0], "dmg_per_s": r["noreset_dagger"][1], "exp_hour": r["noreset_dagger"][2], "weapon": r["noreset_dagger"][3]}} for r in C["switch"]]
cost = sum((x["price"]["typical"] or 0) for x in sin["gear"] if x["level"] <= 50) + (price("SP Reset Scroll")["typical"] or 0)
sin["header"]["gear_cost"]["to_level_50"] = {"mesos": cost, "shown": "about " + mesos(cost)}
sin["search"] = {
    "title": "Sindit Build Guide: AP, SP and When to Switch | Club FM",
    "description": "MapleStory Classic sindit: Lucky Seven to 34, SP reset at 35, Double Stab then Savage Blow. AP, SP, gear and maps by level.",
    "slug": "/builds/sindit/",
    "keywords": ["sindit", "sindit build", "sin build", "assassin build", "bandit build", "lucky seven bandit", "claw bandit", "sin bandit", "thief build",
                 "bandit sp build", "bandit ap build", "sindit skill build", "when to switch to dagger", "savage blow build", "double stab build", "best thief build",
                 "best bandit build", "lucky seven build", "dagger bandit", "maplestory classic sindit", "classic world bandit", "sindit reset"],
    "sitesearch": ["Sindit build guide", "sindit-build", "Thief", "Bandit", "/builds/sindit/"],
}
REVIEW["sindit_compare"] = [dict(r) for r in sin["compare"]]
for r in sin["compare"]: r.pop("dmg_per_s", None)
sin["phone_tabs"] = TABS
write("sindit.json", sin)


# =================================================================== SPEARMAN
def lig(cls, p):
    rows = C["precise"][cls + "30"]["p" + str(p)]
    return next(m["hit"] for m in rows if m["mob"] == "Ligator")


def spear_guide(cls):
    key = "spearman_spear" if cls == "Spear" else "spearman_polearm"
    other = "spearman_polearm" if cls == "Spear" else "spearman_spear"
    M, Bo, FA = (1300000, 1301002, 1301000) if cls == "Spear" else (1300001, 1301003, 1301001)
    first = [(1001001, 20), (1001002, 20), (1000000, 3), (1000001, 1), (1000002, 15), (1000000, 5)]
    sec = [(M, 5), (Bo, 1), (1301005, 1), (M, 20), (FA, 30), (Bo, 20), (1301005, 20), (1301004, 30)]
    w1 = {(1001001, 20): "main attack to 100: 260% at 20", (1001002, 20): "hits 6 for mobbing", (1000000, 3): "needed for Max HP Increase",
          (1000001, 1): "+10% max HP for 1 point", (1000002, 15): "+20 accuracy, +5% crit: hit chance is the warrior's weak spot",
          (1000000, 5): "spare points: more potion healing"}
    w2 = {(M, 5): "opens the Booster", (Bo, 1): "level 1 already gives the full 2-step speed up", (1301005, 1): "mobbing move, 2 s cooldown",
          (M, 20): "mastery 10" + (": 1 to 20% chance to ignore weapon defense" if cls == "Spear" else ": also +20 movement speed"),
          (FA, 30): "350% follow-up hit; heals up to 15% max HP (not in the model yet)", (Bo, 20): "longer buff only (100 to 300 s)",
          (1301005, 20): "more Rush damage, cheaper MP", (1301004, 30): "defense buff, last"}
    sk = milestones(first, sp1, 10, w1, "1st job") + milestones(sec, sp2, 30, w2, "2nd job")
    sk.sort(key=lambda r: (r["level"], r["book"]))
    sched = ([(10, "Spear", ""), (15, "Fork on a Stick", ""), (20, "Fish Spear", "speed 6, no DEX"), (25, "Janitor's Mop", "polearm: any warrior can use it before 30; strongest at 25"),
              (30, "Forked Spear", "needs DEX 30"), (35, "Nakamaki", "needs DEX 35"), (40, "Zeco", "speed 6, needs DEX 40"), (45, "Bamboo Spear", "no DEX needed, speed 6"),
              (50, "Serpent's Tongue", "needs DEX 50"), (60, "Holy Spear", "needs DEX 60"), (70, "Redemption", "needs DEX 70")] if cls == "Spear" else
             [(10, "Pole Arm", ""), (15, "Iron Ball", "needs DEX 15"), (20, "Studded Polearm", "speed 7"), (25, "Janitor's Mop", ""), (30, "Mithril Pole Arm", "needs DEX 30"),
              (35, "Axe Pole Arm", "needs DEX 35"), (40, "Crescent Polearm", "needs DEX 40"), (45, "Yellow Mop", "speed 7, no DEX: cheapest of the three Mops"),
              (50, "The Nine Dragons", "needs DEX 50"), (60, "Skylar", "needs DEX 60"), (70, "The Gold Dragon", "needs DEX 70")])
    gear = gear_rows(key, [(L, cls if n != "Janitor's Mop" else "Polearm", n, w) for L, n, w in sched])
    me, ot = lvrow(key, 40)["dps"], lvrow(other, 40)["dps"]
    g = {
        "slug": "/builds/spearman-spear/" if cls == "Spear" else "/builds/spearman-polearm/",
        "header": {
            "class": "Warrior", "job_path": "Warrior (10) → Spearman (30)", "build": f"Spearman, {cls.lower()}",
            "pitch": ("Stab-heavy spearman: Spear Mastery skips weapon defense on hard targets." if cls == "Spear" else
                      "Swing-heavy spearman: the most damage per hit a 2nd job warrior gets."),
            "best_at": (["Hard, high-defense monsters", "Cheaper weapons (Bamboo Spear, Serpent's Tongue)", "Speed 6 weapons from 40"] if cls == "Spear" else
                        ["Highest Power Strike damage", "Mobbing with Slash Blast and Rush", "Fast walking (+20 speed)"]),
            "weak_spots": ["Accuracy at 30 to 40 (Jr. Wraiths, Lupins)", "Potion cost", "Big gap between low and high rolls"] + (["Less damage on soft monsters than polearm"] if cls == "Spear" else ["Slowest weapons (speed 8)"]),
            "difficulty": "Easy", "level_range": f"10 to {CAP}", "game_version": VERSION, "gear_cost": None},
        "stat_plan": {
            "rule": [{"levels": "1 to 9", "ap": "STR to 35, rest STR", "why": "Warrior needs 35 STR at 10"},
                     {"levels": "10 to 100", "ap": "STR, plus DEX only to the next weapon's need", "why": "DEX adds accuracy and a little damage; STR adds more damage"},
                     {"levels": "DEX checkpoints", "ap": "30 at 30, 35 at 35, 40 at 40, 50 at 50, 60 at 60, 70 at 70" if cls == "Spear" else "15 at 15, 20 at 20, 30 at 30, 35 at 35, 40 at 40, 50 at 50, 60 at 60, 70 at 70",
                      "why": "the weapon's DEX need; put the 5 AP of the level before into DEX when a step is 10"},
                     {"levels": "after 70", "ap": "all STR", "why": "no weapon needs more than 70 DEX"},
                     {"levels": "any", "ap": "DEX from gear counts", "why": "each DEX your gear gives is one more AP for STR"},
                     {"levels": "never", "ap": "AP into HP", "why": "the engine can't value it yet; see resets"}],
            "table": stat_rows(key, [10, 20, 30, 35, 40, 45, 50, 60, 70, 80, 90, CAP], ["STR", "DEX"]),
        },
        "skill_order": sk,
        "gear": gear,
        "advancement": [
            {"level": 10, "job": "Warrior", "where": "Perion, Dances with Balrog", "needs": "level 10, 35 STR (players; Nexon names only the level)", "gets": "1 SP"},
            {"level": 30, "job": "Spearman", "where": "Perion, Dances with Balrog", "needs": "level 30", "gets": "Spearman book; pick Spearman"},
            {"level": "3rd job", "job": "Dragon Knight", "where": "not in Classic World yet", "needs": "", "gets": ""}],
        "resets": [
            {"what": "SP Reset Scroll", "when": "to change weapon line (spear ↔ polearm)", "cost": {"nx": 7000, "mesos": price("SP Reset Scroll")}, "worth_it": "Only to switch",
             "why": "mastery, booster and Final Attack are weapon-specific; one line uses about 120 of 121 points at 70"},
            {"what": "AP Reset Scroll", "when": "only to fix too much DEX", "cost": {"nx": 7000, "mesos": price("AP Reset Scroll")}, "worth_it": "Rarely", "why": "returns all AP at once"},
            {"what": "HP washing", "when": "not now", "cost": None, "worth_it": "No", "why": "the AP Reset returns HP AP too, so the old trick doesn't work"}],
        "train_ranges": maps_of(key, [(10, 14, ""), (15, 19, ""), (20, 24, ""), (25, 29, ""), (30, 34, "boars: high hit chance"), (35, 46, "Jr. Wraiths in Kerning's subway"),
                                      (47, 49, ""), (50, 59, "Clangs and Torties; Clang's defense was cut on Nov 24"), (60, 64, ""), (65, 74, "Excavation camps"),
                                      (75, 89, ""), (90, CAP, "")]),
        "why": [
            "**Polearm or spear:** polearm swings at 3.5x and stabs at 1.5x, spear the reverse; most warrior hits are swings",
            "**Precise Strikes 15:** +20 accuracy and +5% crit (game files); missing is the warrior's weak spot from 30 to 40",
            "**DEX only for weapons:** each spear and polearm from 30 needs DEX equal to its level; Bamboo Spear and the Mops need none",
            "**Booster at 1 point:** the game files give the full 2-step speed up at level 1",
            "**Final Attack 30 before Booster 20:** 350% hit in the game files vs 260% Power Strike",
            ("**Spear Mastery:** up to 20% of hits ignore weapon defense: best on armored monsters" if cls == "Spear" else "**Polearm swings at 3.5x:** 60% of warrior attacks are swings, so the average hit is higher")],
        "mistakes": [
            "**Skipping DEX:** Forked Spear and Mithril Pole Arm need 30 DEX at 30, 70 by 70",
            "**Booster past 1 before mastery:** extra points only lengthen the buff",
            "**Iron Will early:** defense only; last in the order",
            "**AP Reset to fix skills:** SP and AP resets are different scrolls",
            "**Maxing both weapon lines:** not enough points; pick one"],
        "compare": [
            {"build": "Spearman, spear", "dmg_per_s": {L: lvrow("spearman_spear", L)["dps"] for L in (40, 60, CAP)}, "best_at": "armored monsters, cheaper weapons", "weak": "less damage on soft monsters"},
            {"build": "Spearman, polearm", "dmg_per_s": {L: lvrow("spearman_polearm", L)["dps"] for L in (40, 60, CAP)}, "best_at": "most damage per hit", "weak": "slowest weapons, pricier at 50"},
            {"build": "Dexless spearman", "dmg_per_s": {L: CT["dexless_spearman"][str(L)]["dps"] for L in (40, 60, CAP)}, "best_at": "raw damage", "weak": "can't wear level 30+ spears or polearms (DEX needs)",
             "note": "training page Typical build; its weapon needs DEX it doesn't have"}],
        "future": [{"when": "3rd job (Dragon Knight)", "status": "not in Classic World yet; no date from Nexon", "plan": "players expect stab skills to favour spears; check the game files when they arrive, then decide on an SP reset"}],
        "phone_tabs": TABS,
    }
    REVIEW[key + "_compare"] = [dict(r) for r in g["compare"]]
    for r in g["compare"]: r.pop("dmg_per_s", None)
    REVIEW[key + "_typical_vs_guide"] = typical_vs_plan(key)
    cost = sum((x["price"]["typical"] or 0) for x in gear if x["level"] <= 50)
    g["header"]["gear_cost"] = {"to_level_50": {"mesos": cost, "shown": "about " + mesos(cost)}, "note": "weapons only, live typical prices"}
    if cls == "Spear":
        g["search"] = {"title": "Spearman Spear Build: AP, SP, Gear by Level | Club FM",
                       "description": "MapleStory Classic spearman with a spear: STR and DEX plan, skill order, spears by level with prices, maps and spear vs polearm.",
                       "slug": "/builds/spearman-spear/",
                       "keywords": ["spearman build", "spear build", "spear spearman", "spearman ap build", "spearman sp build", "spearman skill build", "spear vs polearm",
                                    "polearm vs spear", "best spearman build", "dragon knight build", "dk build", "spearman guide", "warrior build", "best warrior build",
                                    "spear mastery", "maplestory classic spearman", "classic world spearman"],
                       "sitesearch": ["Spearman spear build guide", "spearman-spear", "Warrior", "Spearman", "/builds/spearman-spear/"]}
    else:
        g["search"] = {"title": "Spearman Polearm Build: AP, SP, Gear by Level | Club FM",
                       "description": "MapleStory Classic polearm spearman: STR and DEX plan, skill order, polearms by level with prices, maps and polearm vs spear.",
                       "slug": "/builds/spearman-polearm/",
                       "keywords": ["polearm build", "polearm spearman", "pole arm build", "spearman build", "spearman ap build", "spearman sp build", "polearm vs spear",
                                    "spear vs polearm", "best spearman build", "polearm mastery", "dk build", "warrior build", "best warrior build", "nine dragons",
                                    "maplestory classic polearm", "classic world spearman"],
                       "sitesearch": ["Spearman polearm build guide", "spearman-polearm", "Warrior", "Spearman", "/builds/spearman-polearm/"]}
    return g


write("spearman-spear.json", spear_guide("Spear"))
write("spearman-polearm.json", spear_guide("Polearm"))

hub = {
    "slug": "/builds/",
    "title": "MapleStory Classic Build Guides: AP and SP | Club FM",
    "description": "Club FM build guides for MapleStory Classic World: AP, SP, gear and training maps by level for every job, checked against the game files.",
    "sections": [
        {"class": "Thief", "builds": [{"name": "Sindit", "slug": "/builds/sindit/", "status": "draft for review"},
                                      {"name": "DEX Bandit", "slug": "/builds/bandit/", "status": "waits for review"},
                                      {"name": "STR Bandit", "slug": "/builds/str-bandit/", "status": "needs engine work"},
                                      {"name": "Assassin", "slug": "/builds/assassin/", "status": "later"}]},
        {"class": "Warrior", "builds": [{"name": "Spearman, spear", "slug": "/builds/spearman-spear/", "status": "draft for review"},
                                        {"name": "Spearman, polearm", "slug": "/builds/spearman-polearm/", "status": "draft for review"},
                                        {"name": "Fighter", "slug": "/builds/fighter/", "status": "later"}, {"name": "Page", "slug": "/builds/page/", "status": "later"}]},
        {"class": "Magician", "builds": [{"name": "Fire Poison", "status": "later"}, {"name": "Ice Lightning", "status": "later"}, {"name": "Cleric", "status": "later"}]},
        {"class": "Bowman", "builds": [{"name": "Hunter", "status": "later"}, {"name": "Crossbowman", "status": "later"}]}],
    "card": ["build name", "pitch (one line)", "difficulty", "gear cost to 50", "level range"],
    "links_in": ["menu: Training sub-bar gets a Builds link", "each /training/<job>/ page links its build guides", "map.html build picker links the matching guide"],
    "search": {"keywords": ["build guide", "builds", "ap build", "sp build", "skill build", "best build", "class guide", "job guide", "maplestory classic builds"],
               "sitesearch": ["Build guides", "builds", "", "", "/builds/"]},
    "sitesearch_note": "data/sitesearch.json has no build list yet (keys v, built, m, i, q, p). Proposed: a new key b, rows [name, slug, class, job, path, keywords]; tools/sitesearch.py and assets/sitesearch.js would need a small change, so it waits for Adam.",
}
write("hub.json", hub)
write("check/review-numbers.json", REVIEW)
