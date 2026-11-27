#!/usr/bin/env python3
"""Batch 3 build guides: Fighter sword and axe, Page sword and blunt weapon, Fire Poison, Ice Lightning, Cleric,
Crossbowman. Same rules and checks as batch2.py (whose stat, SP and price helpers this reuses): creation 25 points with
the sub stat at exactly 5, the sub stat only to each weapon's requirement in the game files, SP orders checked against
the game files' required skill levels, training maps from the site's damage engine.
    python3 builds/tools/batch3.py [slug ...]
"""
import json, os, re, subprocess, sys, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import batch2 as B2  # noqa: E402
from batch2 import WPN, CAP, BANDS, plan_stats, plan_sp, skills_at, needs, price, mesos  # noqa: E402

B = B2.B
JOBNAME = {110: "Fighter", 120: "Page", 210: "Fire Poison Wizard", 220: "Ice Lightning Wizard", 230: "Cleric", 320: "Crossbowman"}

WARRIOR_1 = [("Power Strike", 20), ("Slash Blast", 20), ("Precise Strikes", 15), ("Improved HP Recovery", 5), ("Max HP Increase", 1)]
MAGE_1 = [("Energy Bolt", 20), ("Magic Guard", 1), ("Improved MP Recovery", 15), ("Max MP Increase", 15), ("Magic Guard", 11)]
BOW_1 = [("Arrow Blow", 20), ("Critical Shot", 15), ("The Eye of Amazon", 3), ("Focus", 20), ("The Eye of Amazon", 6)]
ADV1 = {"Warrior": (10, "Warrior", "Perion, Dances with Balrog", "Level 10", "1 SP. Power Strike and Slash Blast open."),
        "Magician": (10, "Magician", "Ellinia, Grendel the Really Old", "Level 10", "1 SP. Energy Bolt and Magic Claw open."),
        "Bowman": (10, "Bowman", "Henesys, Athena Pierce", "Level 10", "1 SP. Arrow Blow and Double Shot open.")}
CREATE = {"Warrior": {"STR": 12, "DEX": 5, "INT": 4, "LUK": 4}, "Magician": {"STR": 4, "DEX": 4, "INT": 12, "LUK": 5},
          "Bowman": {"STR": 5, "DEX": 12, "INT": 4, "LUK": 4}}
MAINSUB = {"Warrior": ("STR", "DEX"), "Magician": ("INT", "LUK"), "Bowman": ("DEX", "STR")}
HOME = {"Warrior": "Perion, Dances with Balrog", "Magician": "Ellinia, Grendel the Really Old", "Bowman": "Henesys, Athena Pierce"}

SWORD2 = [(10, "Wooden Sword"), (15, "Wooden Baseball Bat"), (20, "Two-Handed Sword"), (25, "Broadsword"), (30, "Aluminum Baseball Bat"), (35, "Lionheart"),
          (40, "Zard"), (45, "Blade of Harmony"), (60, "Sparta"), (70, "Doombringer")]
AXE2 = [(10, "Metal Axe"), (20, "Iron Axe"), (25, "Two-Handed Axe"), (30, "Blue Axe"), (35, "Niam"), (40, "Sabretooth"), (50, "The Rising"),
        (60, "The Shining"), (70, "Chrono")]
BLUNT2 = [(10, "Wooden Mallet"), (15, "Heavy Mace"), (25, "Monkey Wrench"), (30, "Mithril Maul"), (35, "Sledgehammer"),
          (40, "Titan"), (50, "Golden Mole"), (60, "The Blessing"), (70, "Gigantic Sledge")]
WAND = [(10, "Wooden Wand"), (15, "Hardwood Wand"), (20, "Metal Wand"), (25, "Ice Wand"), (30, "Mithril Wand"), (35, "Wizard Wand"), (40, "Fairy Wand"),
        (60, "Evil Tale"), (70, "Angel Wings")]
XBOW = [(10, "Crossbow"), (15, "Battle Crossbow"), (20, "Balanche"), (25, "Mountain Crossbow"), (30, "Eagle Crow"), (40, "Heckler"), (45, "Silver Crow"),
        (50, "Rower"), (60, "Golden Crow"), (70, "Gross Jaeger")]


def warrior(slug, name, job, w, weapons, second, third):
    m, s = MAINSUB["Warrior"]
    return {"slug": slug, "name": name, "cls": "Warrior", "job": JOBNAME[job], "w": w, "main": m, "sub": s, "creation": CREATE["Warrior"], "early": None,
            "weapons": weapons, "first": WARRIOR_1, "second": second, "jobs": (100, job),
            "adv": [ADV1["Warrior"], (30, JOBNAME[job], HOME["Warrior"], "Level 30", f"Pick {JOBNAME[job]}. {w.split()[-1]} skills open.")], "third": third}


def mage(slug, name, job, attack2, second, third):
    m, s = MAINSUB["Magician"]
    jn = JOBNAME[job]
    return {"slug": slug, "name": name, "cls": "Magician", "job": jn, "w": "Wand", "main": m, "sub": s, "creation": CREATE["Magician"], "early": None,
            "weapons": WAND, "first": MAGE_1, "second": second, "jobs": (200, job),
            "adv": [ADV1["Magician"], (30, jn, HOME["Magician"], "Level 30", f"Pick {jn}. {attack2} open.")], "third": third}


FIGHTER2 = lambda w: [(f"{w} Mastery", 5), (f"{w} Booster", 1), ("Rage", 1), (f"Final Attack: {w}", 1), ("Rush", 1), (f"{w} Mastery", 20), ("Rage", 30),
                      (f"Final Attack: {w}", 30), (f"{w} Booster", 20), ("Rush", 20)]
PAGE2 = lambda w, wn: [(f"{wn} Mastery", 5), (f"{wn} Booster", 1), (f"Final Attack: {wn}", 1), ("Rush", 1), (f"{wn} Mastery", 20), (f"Final Attack: {wn}", 30),
                       (f"{wn} Booster", 20), ("Rush", 20), ("Threaten", 30)]
BUILDS = [
    warrior("fighter-sword", "Fighter, sword", 110, "2H Sword", SWORD2, FIGHTER2("Sword"), "Crusader"),
    warrior("fighter-axe", "Fighter, axe", 110, "2H Axe", AXE2, FIGHTER2("Axe"), "Crusader"),
    warrior("page-sword", "Page, sword", 120, "2H Sword", SWORD2, PAGE2("2H Sword", "Sword"), "White Knight"),
    warrior("page-blunt", "Page, blunt weapon", 120, "2H Blunt", BLUNT2, PAGE2("2H Blunt", "Blunt Weapon"), "White Knight"),
    mage("fire-poison", "Fire Poison", 210, "Fire Arrow and Poison Breath",
         [("MP Eater", 3), ("Meditation", 1), ("Teleport", 1), ("Fire Arrow", 30), ("Meditation", 20), ("Poison Breath", 30), ("MP Eater", 20), ("Teleport", 20)], "Fire Poison Mage"),
    mage("ice-lightning", "Ice Lightning", 220, "Cold Beam and Thunder Bolt",
         [("MP Eater", 3), ("Meditation", 1), ("Teleport", 1), ("Thunder Bolt", 1), ("Cold Beam", 30), ("Meditation", 20), ("Thunder Bolt", 30), ("MP Eater", 20), ("Teleport", 20)], "Ice Lightning Mage"),
    mage("cleric", "Cleric", 230, "Heal and Holy Arrow",
         [("Teleport", 1), ("Heal", 1), ("Holy Arrow", 30), ("Heal", 30), ("MP Eater", 20), ("Invincible", 5), ("Bless", 20), ("Invincible", 20)], "Priest"),
    {"slug": "crossbowman", "name": "Crossbowman", "cls": "Bowman", "job": "Crossbowman", "w": "Crossbow", "main": "DEX", "sub": "STR",
     "creation": CREATE["Bowman"], "early": None, "weapons": XBOW, "first": BOW_1,
     "second": [("Crossbow Mastery", 5), ("Crossbow Booster", 1), ("Final Attack: Crossbow", 1), ("Iron Arrow", 1), ("Crossbow Mastery", 20), ("Iron Arrow", 30),
                ("Final Attack: Crossbow", 30), ("Crossbow Booster", 5), ("Soul Arrow: Crossbow", 1), ("Crossbow Booster", 20), ("Soul Arrow: Crossbow", 20)],
     "jobs": (300, 320), "adv": [ADV1["Bowman"], (30, "Crossbowman", HOME["Bowman"], "Level 30", "Pick Crossbowman. Crossbow skills open.")], "third": "Sniper"},
]


def engine(builds, plans):
    """the site's engine (assets/classic-dmg.js) on every level of every build; weapon class follows the weapon in hand"""
    chars = {}
    for b in builds:
        st, order = plans[b["slug"]]
        lst = []
        for L in range(10, CAP + 1):
            n = B2.weapon_at(b, L); w = WPN[n]; cls = w["kind"]
            job = b["job"] if L >= 30 else b["cls"]
            ammo = {"Bow": "Arrows for Bows", "Crossbow": "Arrows for Crossbows"}.get(cls)
            lst.append({"lv": L, "job": job, "type": "pure", "str": st[L][0], "dex": st[L][1], "int": st[L][2], "luk": st[L][3], "w": cls,
                        "gear": {cls: {"name": n, "watk": w["watk"], "matk": w.get("incMAD") or 0, "spd": w["spd"], "ammo": ammo, "ammoAtk": 0}},
                        "skills": {str(k): v for k, v in skills_at(b, order, L).items()}, "maps": L in [a for a, _ in BANDS] or L == CAP})
        chars[b["slug"]] = lst
    world = os.path.join(tempfile.gettempdir(), "fm-world.json")
    if not os.path.exists(world):
        open(world, "wb").write(urllib.request.urlopen(B2.LIVE + "world.json", timeout=120).read())
    ci, co = os.path.join(tempfile.gettempdir(), "fm-chars3.json"), os.path.join(tempfile.gettempdir(), "fm-eng3.json")
    json.dump(chars, open(ci, "w"))
    subprocess.run(["node", os.path.join(HERE, "engrun.cjs"), ci, world, co], check=True)
    return json.load(open(co))


def run(slugs=None):
    bs = [B2.usable(b) for b in BUILDS if not slugs or b["slug"] in slugs]
    plans, out = {}, {}
    for b in bs:
        st, rules, table = plan_stats(b)
        order = plan_sp(b)
        plans[b["slug"]] = (st, order); out[b["slug"]] = (st, rules, table, order)
    return bs, plans, out, engine(bs, plans)


def report(slugs=None):
    bs, plans, out, eng = run(slugs)
    for b in bs:
        st = out[b["slug"]][0]
        print(b["slug"], "| lv1", st[1], "lv30", st[30], "lv70", st[CAP])
        for L in (10, 20, 30, 35, 40, 50, 60, 70):
            e = eng[b["slug"]][str(L)]
            print("   ", L, e["attack"], e["dps"], [(m["map"], m["exp_h"]) for m in (e.get("maps") or [])][:2])


# ------------------------------------------------------------------------------------------------ the words
W1 = ["Power Strike 20 hits one mob for 260% and Slash Blast 20 hits up to 6 for 130%. Max both first and by 23 you have a hit for one mob and a hit for groups.",
      "Precise Strikes 15 is +20 accuracy and +5% critical rate. The last 6 points of 1st job go into HP: Improved HP Recovery 5, then Max HP Increase 1, which needs it at 3 and is +10% max HP from its first point."]
IRONBODY = "Putting points into Iron Body. It needs Max HP Increase 3, so the 3 points come out of Precise Strikes: 3 less accuracy and 1% less critical rate, for +20% weapon defense you recast every 300 seconds."
MASTERY_VS = ("{m} Mastery 20 comes before the rest of {other}. At 40 those 15 points raise your average hit about 30%, because mastery lifts your lowest hits; "
              "{other_why}")
BOOST = "{w} Mastery 5 opens {w} Booster, and Booster 1 already gives the full attack speed boost. Points 2 to 20 only make it last 300 seconds instead of 100 and cut its HP and MP cost from 30 to 10, so they wait."
DEX2H = "Two-handed {w}s need DEX equal to their level from {first} at {lv}{skip}. AP only goes into DEX on the levels you need it for each new {w}, everything else goes into STR."
MAGE_W = [
    "Energy Bolt 20 is damage 130 on one mob for 16 MP. Magic Claw 20 is the same 130 split into two 65 hits for 20 MP and less range, 300 against 350, so Energy Bolt is the one to max.",
    "Magic Guard 1 goes in at 17: it's a toggle, and even 1 point sends 30% of the damage you take to MP instead of HP. Mage HP is small, so it pays off early.",
    "Improved MP Recovery 15 makes MP potions heal 25% more, so every potion goes 25% further. Max MP Increase 15 is +25% max MP.",
    "The last 10 points of 1st job take Magic Guard to 11: 68% of the damage you take goes to MP. Magic Armor is skipped: it needs Magic Guard 3 and only adds defense, +40 at 1, which doesn't kill anything faster.",
    "MP Eater 3 opens Meditation, and Meditation 1 is already +5 magic attack for you and your party. Teleport 1 gets you around maps from 32.",
]
MAGE_M = [
    "Maxing Magic Claw on top of Energy Bolt. Both are 130 at 20, so that's 20 SP for nothing, and Claw costs 20 MP a cast against 16. Put them in MP Recovery and Max MP.",
    "Putting 2nd job points into Slow. It only slows mobs and drops their avoid by 5 at 20; those points do more in Meditation, +25 magic attack at 20.",
]
TEXT3 = {
    "fighter-sword": {
        "pitch": "STR with DEX only to each sword's need. Power Strike and Slash Blast 20 by 23, then Sword Mastery, Rage and Final Attack.",
        "best": ["Rage is +40 attack for you and your party", "Sword Mastery is +20 accuracy", "Final Attack: Sword hits 3 mobs"],
        "weak": ["Rage also lowers weapon defense, by 40 at 30", "DEX has to match your level from 20"],
        "why": W1 + [BOOST.format(w="Sword"),
                     "Rage 1 goes in at 32: it's already +10 attack for 150 seconds for 1 SP, about +20% damage on a 50 attack Aluminum Baseball Bat.",
                     MASTERY_VS.format(m="Sword", other="Rage", other_why="the other 29 points of Rage add 30 attack, about 43% on a 60 attack Zard. Per point Mastery is worth more, and it's +20 accuracy too."),
                     "Final Attack: Sword 1 goes in early: when you use an attack skill there's a 25% chance it unlocks Final Attack for 60 seconds, and while it's lit you can use it on up to 3 mobs for 140%. Points 2 to 30 raise that to 200%.",
                     "Rush 1 at 33 is for getting around: it carries you forward and hits up to 6 mobs for 60%. Points 2 to 20 only raise that to 80%, so they come last.",
                     DEX2H.format(w="sword", first="Two-Handed Sword", lv=20, skip=", except the Wooden Baseball Bat at 15 and Aluminum Baseball Bat at 30"),
                     "Lion's Fang at 50 is 73 attack, 5 more than Blade of Harmony, about 7% more damage, but it sells for many times the price on the FM, so this guide keeps Blade of Harmony."],
        "mistakes": [IRONBODY,
                     "Maxing Sword Booster early. Points 2 to 20 only stretch it from 100 to 300 seconds. That's 19 SP, over 6 levels, that should be in Mastery and Rage.",
                     "Forgetting DEX before 20. Two-Handed Sword needs 20 DEX at 20, so put your AP from 18 to 20 into DEX, or you stay on the Wooden Baseball Bat's 35 attack instead of 40.",
                     "Leaving Rage at 0 until later. Its first point is +10 attack, about 20% on an Aluminum Baseball Bat, for 1 SP."],
    },
    "fighter-axe": {
        "pitch": "STR with DEX only to each axe's need. Power Strike and Slash Blast 20 by 23, then Axe Mastery, Rage and Final Attack.",
        "best": ["Rage is +40 attack for you and your party", "Axe Mastery makes mobs bleed", "Final Attack: Axe hits 3 mobs"],
        "weak": ["No accuracy from Axe Mastery, unlike Sword Mastery", "Rage also lowers weapon defense, by 40 at 30"],
        "why": W1 + [BOOST.format(w="Axe"),
                     "Rage 1 goes in at 32: it's already +10 attack for 1 SP, about +20% damage on a 50 attack Blue Axe.",
                     MASTERY_VS.format(m="Axe", other="Rage", other_why="the other 29 points of Rage add 30 attack, about 43% on a 60 attack Sabretooth. Per point Mastery is worth more, and at 20 your hits have a 25% chance to make the mob bleed."),
                     "Final Attack: Axe 1 goes in early: when you use an attack skill there's a 25% chance it unlocks Final Attack for 60 seconds, and while it's lit you can use it on up to 3 mobs for 140%. Points 2 to 30 raise that to 200%.",
                     "Rush 1 at 33 is for getting around: it carries you forward and hits up to 6 mobs for 60%. Points 2 to 20 only raise that to 80%, so they come last.",
                     DEX2H.format(w="axe", first="Iron Axe", lv=20, skip="")],
        "mistakes": [IRONBODY,
                     "Maxing Axe Booster early. Points 2 to 20 only stretch it from 100 to 300 seconds. That's 19 SP, over 6 levels, that should be in Mastery and Rage.",
                     "Buying a sword with an axe build. Axe Mastery, Axe Booster and Final Attack: Axe only work with an axe, so you lose most of 2nd job.",
                     "Skipping DEX before Sabretooth. It needs 40 DEX at 40, so put your AP from 40 into DEX, or you stay on Niam's 55 attack instead of 60."],
    },
    "page-sword": {
        "pitch": "STR with DEX only to each sword's need. Power Strike and Slash Blast 20 by 23, then Sword Mastery and Final Attack.",
        "best": ["Final Attack: Sword hits for 360% at 30", "Sword Mastery is +20 accuracy", "Final Attack is 270% from its first point"],
        "weak": ["No attack buff like Rage", "DEX has to match your level from 20"],
        "why": W1 + [BOOST.format(w="Sword"),
                     "Final Attack: Sword 1 goes in at 32: when you use an attack skill there's a 25% chance it unlocks Final Attack for 60 seconds, and while it's lit you can use it on one mob for 270%. 1 point already gets the full chance.",
                     "Sword Mastery 20 comes next. At 40 those 15 points raise your average hit about 30%, because mastery lifts your lowest hits, and they're +20 accuracy.",
                     "Final Attack points 2 to 30 take it from 270% to 360%, so they come right after Mastery.",
                     "Rush 1 at 33 is for getting around: it carries you forward and hits up to 6 mobs for 60%. Points 2 to 20 only raise that to 80%, so they come after Booster.",
                     "Threaten goes last, with the 30 points nothing else needs by then: at 30 it lowers up to 4 mobs' weapon defense by 10 and slows them for 30 seconds.",
                     DEX2H.format(w="sword", first="Two-Handed Sword", lv=20, skip=", except the Wooden Baseball Bat at 15 and Aluminum Baseball Bat at 30"),
                     "Lion's Fang at 50 is 73 attack, 5 more than Blade of Harmony, about 7% more damage, but it sells for many times the price on the FM, so this guide keeps Blade of Harmony."],
        "mistakes": [IRONBODY,
                     "Maxing Sword Booster early. Points 2 to 20 only stretch it from 100 to 300 seconds. That's 19 SP, over 6 levels, that should be in Mastery and Final Attack.",
                     "Forgetting DEX before 20. Two-Handed Sword needs 20 DEX at 20, so put your AP from 18 to 20 into DEX, or you stay on the Wooden Baseball Bat's 35 attack instead of 40.",
                     "Putting Threaten ahead of Final Attack. -10 weapon defense on 4 mobs is about +8% damage on a Jr. Wraith, whose weapon defense drops from 30 to 20; Final Attack 2 to 30 takes it from 270% to 360%."],
    },
    "page-blunt": {
        "pitch": "STR with DEX only to each blunt weapon's need. Power Strike and Slash Blast 20 by 23, then Blunt Weapon Mastery and Final Attack.",
        "best": ["Blunt Weapon Mastery is +20% critical damage", "Final Attack: Blunt Weapon hits for 360% at 30", "2-handed blunt weapons have the most attack"],
        "weak": ["2-handed blunt weapons are slow", "DEX from 15"],
        "why": W1 + [BOOST.format(w="Blunt Weapon"),
                     "Final Attack: Blunt Weapon 1 goes in at 32: when you use an attack skill there's a 25% chance it unlocks Final Attack for 60 seconds, and while it's lit you can use it on one mob for 270%. 1 point already gets the full chance.",
                     "Blunt Weapon Mastery 20 comes next. At 40 those 15 points raise your average hit about 30%, because mastery lifts your lowest hits, and they're +20% critical damage.",
                     "Final Attack points 2 to 30 take it from 270% to 360%, so they come right after Mastery.",
                     "Rush 1 at 33 is for getting around: it carries you forward and hits up to 6 mobs for 60%. Points 2 to 20 only raise that to 80%, so they come after Booster.",
                     "Threaten goes last, with the 30 points nothing else needs by then: at 30 it lowers up to 4 mobs' weapon defense by 10 and slows them for 30 seconds.",
                     DEX2H.format(w="blunt weapon", first="Heavy Mace", lv=15, skip=", except Monkey Wrench at 25")],
        "mistakes": [IRONBODY,
                     "Maxing Blunt Weapon Booster early. Points 2 to 20 only stretch it from 100 to 300 seconds. That's 19 SP, over 6 levels, that should be in Mastery and Final Attack.",
                     "Forgetting DEX for Heavy Mace. It needs 15 DEX at 15, so put your AP from 14 and 15 into DEX, or you stay on the Wooden Mallet's 32 attack instead of 40.",
                     "Buying a sword with a blunt build. Blunt Weapon Mastery, Booster and Final Attack: Blunt Weapon only work with a blunt weapon, so you lose most of 2nd job."],
    },
    "fire-poison": {
        "pitch": "INT with LUK only to each wand's need. Energy Bolt in 1st job, then Fire Arrow, Meditation and Poison Breath.",
        "best": ["Fire Arrow burns mobs for 3 seconds", "Poison Breath hits up to 6 mobs", "Meditation is +25 magic attack for the party"],
        "weak": ["Fire-resistant mobs take less", "Lives on MP potions"],
        "why": MAGE_W + ["Fire Arrow 30 first: damage 180 on one mob against Energy Bolt's 130, plus a burn every second for 3 seconds. In our damage engine it takes over from Energy Bolt by 40.",
                         "Meditation 20 next, +25 magic attack for 300 seconds, then Poison Breath 30, damage 90 on up to 6 mobs.",
                         "MP Eater 20 after that: a 50% chance to drain MP from a mob, once every 5 seconds, so fewer MP potions. Teleport takes the last points: more range and MP 55 down to 15 a cast.",
                         "Wands need LUK from Metal Wand at 20: 10 LUK there, 30 for Fairy Wand at 40. AP only goes into LUK on the levels you need it for each new wand, everything else goes into INT.",
                         "Cromi at 50 is about 2% more damage than staying on Fairy Wand, because its 40 LUK costs you 10 INT, and it sells for millions on the FM. It's a luxury, so this guide keeps Fairy Wand."],
        "mistakes": MAGE_M + ["Training on fire-resistant mobs like Fire Boars and Drakes. The game files mark them resistant, so Fire Arrow hits them softer; pick fire-weak mobs like Jr. Wraiths and Cold Eyes instead.",
                              "Forgetting LUK for Fairy Wand. It needs 30 LUK at 40, so put your AP at 40 into LUK, or you stay on Wizard Wand's 62 magic attack instead of 69."],
    },
    "ice-lightning": {
        "pitch": "INT with LUK only to each wand's need. Energy Bolt in 1st job, then Cold Beam, Meditation and Thunder Bolt.",
        "best": ["Cold Beam slows the mob it hits", "Thunder Bolt hits up to 6 mobs", "Meditation is +25 magic attack for the party"],
        "weak": ["Ice-resistant mobs take less", "Lives on MP potions"],
        "why": MAGE_W + ["Thunder Bolt 1 at 32 gives you a hit for 6 mobs, damage 50, from the start of 2nd job.",
                         "Cold Beam 30 first: damage 170 on one mob against Energy Bolt's 130, and the mob is slowed. In our damage engine it takes over from Energy Bolt by 40.",
                         "Meditation 20 next, +25 magic attack for 300 seconds, then Thunder Bolt to 30, damage 80 on up to 6 mobs with a 25% chance to stun.",
                         "MP Eater 20 after that: a 50% chance to drain MP from a mob, once every 5 seconds, so fewer MP potions. Teleport takes the last points: more range and MP 55 down to 15 a cast.",
                         "Wands need LUK from Metal Wand at 20: 10 LUK there, 30 for Fairy Wand at 40. AP only goes into LUK on the levels you need it for each new wand, everything else goes into INT.",
                         "Cromi at 50 is about 2% more damage than staying on Fairy Wand, because its 40 LUK costs you 10 INT, and it sells for millions on the FM. It's a luxury, so this guide keeps Fairy Wand."],
        "mistakes": MAGE_M + ["Training on ice-resistant mobs. The game files mark Ligators, Cold Eyes, Drakes and Crocos resistant to ice, so Cold Beam hits them softer; lightning-weak mobs like Lorangs and Clangs take more from Thunder Bolt.",
                              "Forgetting LUK for Fairy Wand. It needs 30 LUK at 40, so put your AP at 40 into LUK, or you stay on Wizard Wand's 62 magic attack instead of 69."],
    },
    "cleric": {
        "pitch": "INT with LUK only to each wand's need. Energy Bolt in 1st job, then Holy Arrow, Heal, and Bless for parties.",
        "best": ["Heal hurts undead mobs, up to 6", "Holy Arrow hits undead harder", "Heal and Bless help the whole party"],
        "weak": ["Heal only hurts undead mobs", "No Meditation"],
        "why": MAGE_W[:3] + ["Teleport 1 and Heal 1 go in at 30 and 31: getting around, and a heal for you and your party.",
                             "Holy Arrow 30 first: damage 160 on one mob against Energy Bolt's 130, more on undead. In our damage engine it takes over from Energy Bolt by 40.",
                             "Heal 30 next: it hits up to 6 undead mobs around you and heals your party. On Jr. Wraith maps it hits up to 6 Wraiths at once.",
                             "MP Eater 20 after that: a 50% chance to drain MP from a mob, once every 5 seconds, so fewer MP potions.",
                             "Invincible 5 opens Bless, and Bless 20 cuts the damage your whole party takes for 300 seconds. The last 15 points take Invincible to 20, 20% less physical damage for you.",
                             "Wands need LUK from Metal Wand at 20: 10 LUK there, 30 for Fairy Wand at 40. AP only goes into LUK on the levels you need it for each new wand, everything else goes into INT.",
                         "Cromi at 50 is about 2% more damage than staying on Fairy Wand, because its 40 LUK costs you 10 INT, and it sells for millions on the FM. It's a luxury, so this guide keeps Fairy Wand."],
        "mistakes": MAGE_M[:1] + ["Leveling Heal first and training off undead maps. Heal only hurts undead; anywhere else Holy Arrow is your attack.",
                                   "Leaving MP Eater at 0. At 20 it's a 50% chance to drain MP from a mob every 5 seconds; without it you buy more MP potions.",
                                   "Forgetting LUK for Fairy Wand. It needs 30 LUK at 40, so put your AP at 40 into LUK, or you stay on Wizard Wand's 62 magic attack instead of 69."],
    },
    "crossbowman": {
        "pitch": "DEX with STR only to each crossbow's need. Arrow Blow in 1st job, then Crossbow Mastery, Iron Arrow and Final Attack.",
        "best": ["Ranged from level 10", "Iron Arrow hits up to 6 mobs in a line", "Arrows cost 1 meso each at the NPC"],
        "weak": ["STR for crossbows from 20", "Crossbows are slower than bows"],
        "why": ["Arrow Blow 20 hits one mob for 240% with one arrow. Double Shot 20 is 120% on up to 2, so Arrow Blow is your main attack until 30.",
                "Critical Shot 15 is 20% critical rate and +15% critical damage. The Eye of Amazon 3 opens Focus, and Focus 20 is +25 accuracy and +25 avoid for 300 seconds.",
                "The last 3 points of 1st job go into The Eye of Amazon, 6 in all: 75 range, 15 more than at 3.",
                "Crossbow Mastery 5 opens Crossbow Booster, and Booster 1 is already the full attack speed boost. Final Attack: Crossbow 1 gives a 25% chance, when you use an attack skill, to unlock Final Attack for 60 seconds, 270% on one mob, so it goes in early too.",
                "Iron Arrow 1 at 33 already hits up to 6 mobs in a line for 120%, less on each mob it passes through. Mastery 20 comes next, then Iron Arrow to 30 for 180%.",
                "Amazon's Judgement is skipped: it only slows a mob when you crit. Power Knockback is skipped too: it always crits and hits up to 4 mobs, but it's a close-range swing that pushes mobs away.",
                "Soul Arrow needs Booster 5 and only saves arrows that cost 1 meso, so both wait until after Final Attack.",
                "Crossbows need STR from Balanche at 20, always 10 under the crossbow's level. AP only goes into STR on the levels you need it for each new crossbow, everything else goes into DEX."],
        "mistakes": ["Skipping STR before a new crossbow. Eagle Crow needs 20 STR at 30, so put your AP from 30 into STR, or you stay on Mountain Crossbow's 47 attack instead of 52.",
                     "Maxing Crossbow Booster early. Points 2 to 20 only stretch it from 100 to 300 seconds. That's 19 SP, over 6 levels, that belong in Mastery, Iron Arrow and Final Attack.",
                     "Buying a bow. Crossbow Mastery, Booster, Soul Arrow, Iron Arrow and Final Attack: Crossbow only work with a crossbow, so you lose all of 2nd job.",
                     "Maxing Double Shot before Arrow Blow. It's 120% per mob and uses 2 arrows a shot; Arrow Blow is 240% on one. Max Arrow Blow first."],
    },
}
TEXT3["str-bandit"] = {
    "pitch": "LUK with STR only to each STR dagger's need. Double Stab in 1st job, then Savage Blow, on daggers one speed step faster than the DEX ones.",
    "best": ["STR daggers are Faster (speed 3), a step above DEX daggers", "STR adds to dagger damage the same as DEX", "Korean Fan at 40 needs no STR"],
    "weak": ["Less accuracy: STR gives none, DEX does", "No thief armor: it needs DEX", "Melee: you walk to every mob and take hits"],
    "why": ["Double Stab 20 hits twice for 160%. It's your only real attack until 30, so max it first.",
            "Dark Sight needs Disorder 3, and the rest of 1st job goes into Dark Sight: at 20 it costs 30 MP instead of 50.",
            "STR daggers: Triple-Tipped Zamadar at 17, Stinger at 22, Cass at 30, Bazlud at 45 and Sai at 50 are all Faster (speed 3). The DEX daggers from 20 on, Coconut Knife, Reef Claw, Gephart and Shinkita, are Fast (speed 4), so you swing faster.",
            "For a dagger your damage stat is LUK, and by the game data STR counts with DEX as your second stat, so the STR you put in for the dagger still adds damage. That hasn't been checked in game yet. The cost is accuracy: STR gives none, so you sit about 7 below a Pure Bandit at 30 and 13 below at 50.",
            "No thief armor past 15: thief armor needs DEX, 10 at 20 up to 40 at 50, and a STR Bandit keeps DEX at 5. Wear gear any job can, like the Yellow Baseball Cap, Old Raggedy Cape and Squishy Shoes.",
            "STR only goes in for each dagger: 11 at 17, 17 at 22, 25 at 30, 40 at 45 and 45 at 50. Everything else goes into LUK, and DEX stays at 5.",
            "Dagger Mastery 5 and Booster 1 first, then straight into Savage Blow. At 21 it hits 6 times for 65%, 390% a cast. Savage Blow 22 to 30 only takes it to 450%, so Dagger Mastery 20 comes first.",
            "Steal needs Haste 5. At 30 a successful steal is +35 attack for 60 seconds, and it works 90% of the time, so it comes before the rest of Dagger Booster."],
    "mistakes": ["Putting AP into DEX out of habit. None of the STR daggers need DEX and you wear gear any job can, so every point there is a point out of LUK.",
                 "Forgetting STR before Bazlud. It needs 40 STR at 45, so put your AP from 43 to 45 into STR, or you stay on Korean Fan's 55 attack instead of 62.",
                 "Keeping Cass past 40. Korean Fan is 55 attack against 47, the same Faster speed, and needs no STR.",
                 "Leveling Haste before Savage Blow. Haste 20 is 20 SP, almost 7 levels' worth that Savage Blow needs. Put only 5 in Haste after Savage Blow 30, to open Steal."],
}
COMPARE3 = {
    "fighter-sword": [("Fighter, sword (this guide)", "Rage and +20 accuracy", "DEX from 20"), ("Fighter, axe", "Rage and bleeding", "no accuracy from mastery"), ("Page, sword", "360% Final Attack", "no Rage")],
    "fighter-axe": [("Fighter, axe (this guide)", "Rage and bleeding", "no accuracy from mastery"), ("Fighter, sword", "Rage and +20 accuracy", "DEX from 20"), ("Page, blunt weapon", "+20% critical damage", "no Rage")],
    "page-sword": [("Page, sword (this guide)", "360% Final Attack, +20 accuracy", "no Rage"), ("Page, blunt weapon", "+20% critical damage", "slow weapons"), ("Fighter, sword", "Rage for the party", "Final Attack 200% on 3 mobs, not 360% on 1")],
    "page-blunt": [("Page, blunt weapon (this guide)", "+20% critical damage", "slow weapons"), ("Page, sword", "+20 accuracy", "less attack"), ("Fighter, axe", "Rage for the party", "Final Attack 200% on 3 mobs, not 360% on 1")],
    "fire-poison": [("Fire Poison (this guide)", "Fire Arrow burn", "fire-resistant mobs"), ("Ice Lightning", "Cold Beam slow, Thunder Bolt on 6", "ice-resistant mobs"), ("Cleric", "Heal on undead, parties", "Heal only hurts undead")],
    "ice-lightning": [("Ice Lightning (this guide)", "Cold Beam slow, Thunder Bolt on 6", "ice-resistant mobs"), ("Fire Poison", "Fire Arrow burn", "fire-resistant mobs"), ("Cleric", "Heal on undead, parties", "Heal only hurts undead")],
    "cleric": [("Cleric (this guide)", "Heal on undead, parties", "Heal only hurts undead"), ("Fire Poison", "Fire Arrow burn", "fire-resistant mobs"), ("Ice Lightning", "Cold Beam slow", "ice-resistant mobs")],
    "str-bandit": [("STR Bandit (this guide)", "Faster daggers (speed 3)", "less accuracy, no thief armor"), ("Pure Bandit", "DEX daggers, thief armor", "a speed step slower"), ("Sindit", "Lucky Seven to 40, then a dagger", "needs an SP Reset at 40")],
    "crossbowman": [("Crossbowman (this guide)", "Iron Arrow on 6 in a line", "slower weapons"), ("Hunter", "Arrow Bomb on 6", "STR for bows from 15")],
}


ELEM = {"fire-poison": "F", "ice-lightning": "I", "cleric": "H"}   # the build's main element, game-file element codes


def drop_resisted(slug, eng):
    """a mage isn't sent to a map whose most common mob resists (2) or ignores (1) its main element"""
    code = ELEM.get(slug)
    if not code: return
    W = json.load(open(os.path.join(tempfile.gettempdir(), "fm-world.json")))
    def bad(m):
        mobs = (W["maps"].get(m["map"]) or {}).get("mobs") or []
        if not mobs: return False
        top = max(mobs, key=lambda x: x[1])[0]
        el = (W["mobs"].get(top) or {}).get("elem") or ""
        return any(el[i] == code and i + 1 < len(el) and el[i + 1] in "12" for i in range(len(el)))
    for e in eng[slug].values():
        if e.get("maps"): e["maps"] = [m for m in e["maps"] if not bad(m)]


# ------------------------------------------------------------------------------------------------ one-handed versions
SWORD1 = [(10, "Long Sword"), (15, "Saw"), (20, "Viking Sword"), (25, "Eloon"), (30, "Gladius"), (35, "Red Whip"), (40, "Traus"), (45, "Hero's Gladius"),
          (50, "Jeweled Katar"), (60, "Neocora"), (70, "Red Katana")]
AXE1 = [(10, "Double Axe"), (15, "Scythe"), (25, "Mithril Axe"), (30, "Fireman's Axe"), (35, "Dankke"), (40, "Blue Counter"), (45, "Green Paint Brush"),
        (50, "Buck"), (60, "Hawkhead"), (70, "Mikhail")]
BLUNT1 = [(10, "Steel Pipe"), (15, "Mace"), (20, "Iron Mace"), (25, "Plunger"), (30, "War Hammer"), (35, "Heavy Hammer"), (40, "Jacker"),
          (50, "Knuckle Mace"), (60, "Tamus"), (70, "The Judgement")]
ONE = {"fighter-sword": ("1H Sword", SWORD1), "fighter-axe": ("1H Axe", AXE1), "page-sword": ("1H Sword", SWORD1), "page-blunt": ("1H Blunt", BLUNT1)}
WMULT = {"1H Sword": 1.8, "2H Sword": 2.5, "1H Axe": 0.6 * 2.4 + 0.4 * 1.2, "2H Axe": 0.6 * 3.0 + 0.4 * 2.0, "1H Blunt": 0.6 * 2.4 + 0.4 * 1.2, "2H Blunt": 0.6 * 3.0 + 0.4 * 2.0}
MS = [0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10]   # mastery value by skill level, game files


def numbers(b, st):
    """the damage-formula figures the warrior text quotes, worked out for this build's own stats and weapons"""
    w40 = B2.weapon_at(b, 40); w32 = B2.weapon_at(b, 32); k = WPN[w40]["kind"]
    P, Sec, M = st[40][0], st[40][1], WMULT[k]
    avg = lambda ms: 0.9 + (P * ((ms / 10 + 0.1) * 0.7 + 1) / 2 * M + Sec) / 100
    a40, a32 = WPN[w40]["watk"], WPN[w32]["watk"]
    return {"mastery": round((avg(MS[20]) / avg(MS[5]) - 1) * 100), "rage": round(((a40 + 40) / (a40 + 10) - 1) * 100),
            "rage1": round(10 / a32 * 100), "w40": w40, "a40": a40, "w32": w32, "a32": a32}


def text_for(b, st):
    """the warrior text with this build's own numbers and weapons in it"""
    t = json.loads(json.dumps(TEXT3[b.get("parent") or b["slug"]]))
    n = numbers(b, st)
    an = lambda w: ("an " if w[0] in "AEIOU" else "a ") + w
    def fix(x):
        x = re.sub(r"average hit about \d+%", f"average hit about {n['mastery']}%", x)
        x = re.sub(r"about \d+% on an? \d+ attack [A-Z][\w' ]*?\.", f"about {n['rage']}% on {an(str(n['a40']))} attack {n['w40']}.", x)
        x = re.sub(r"about \+\d+% damage on an? \d+ attack [A-Z][\w' ]*?\.", f"about +{n['rage1']}% damage on {an(str(n['a32']))} attack {n['w32']}.", x)
        x = re.sub(r"about \d+% on an? [A-Z][\w' ]*?, for 1 SP", f"about {n['rage1']}% on {an(n['w32'])}, for 1 SP", x)
        return x
    for key in ("why", "mistakes"):
        t[key] = [fix(x) for x in t[key]]
    if b.get("parent"):
        kind = b["w"].split()[-1].lower(); kind = {"blunt": "blunt weapon"}.get(kind, kind)
        dexline = {"1H Sword": "One-handed swords need DEX from Viking Sword at 20, 15 there and 45 for Jeweled Katar at 50, except the Saw at 15 and Red Whip at 35, which need none.",
                   "1H Axe": "One-handed axes need DEX from Mithril Axe at 25, 20 there and 45 for Buck at 50, except the Scythe at 15, which needs none.",
                   "1H Blunt": "One-handed blunt weapons need no DEX until War Hammer at 30, 25 there and 45 for Knuckle Mace at 50."}[b["w"]]
        t["why"] = [dexline + " AP only goes into DEX on the levels you need it for each new " + kind + ", everything else goes into STR." if x.startswith("Two-handed") else x for x in t["why"]]
        P, Sec = st[40][0], st[40][1]; mf = (MS[20] / 10 + 0.1) * 0.7
        avgm = lambda M: 0.9 + (P * (mf + 1) / 2 * M + Sec) / 100
        soft = round((1 - avgm(WMULT[b["w"]]) / avgm(WMULT[b["w"].replace("1H", "2H")])) * 100)
        t["why"].append(f"A one-handed {kind} leaves room for a shield and its weapon defense, but at the same attack, with your stats at 40, it hits about "
                        f"{soft}% softer than a two-handed one. Some one-handed {kind}s swing a speed step faster, which wins a little of that back. Pick it if you'd rather take less damage than kill faster.")
        t["mistakes"] = [x for x in t["mistakes"] if "DEX before 20" not in x and "DEX for Heavy Mace" not in x and "DEX before Sabretooth" not in x]
        i = next(i for i, (lv, nm) in enumerate(b["weapons"]) if WPN[nm].get("reqDEX"))
        (lv, nm), (plv, pn) = b["weapons"][i], b["weapons"][i - 1]
        w, pw = WPN[nm], WPN[pn]
        cost = f"{pn}'s {pw['watk']} attack instead of {w['watk']}" + (", and a speed step slower" if pw["spd"] > w["spd"] else "")
        t["mistakes"].append(f"Forgetting DEX before {nm}. It needs {w['reqDEX']} DEX at {lv}, so put your AP into DEX, or you stay on {cost}.")
        t["pitch"] = t["pitch"].replace("each sword's need", "each one-handed sword's need").replace("each axe's need", "each one-handed axe's need").replace("each blunt weapon's need", "each one-handed blunt weapon's need")
        t["weak"] = [x for x in t["weak"] if "DEX" not in x and "2-handed" not in x and "Two-handed" not in x] + ["Less damage than a two-handed weapon"]
        t["best"] = [x for x in t["best"] if "2-handed" not in x and "Two-handed" not in x]
        t["why"] = [x for x in t["why"] if "Lion's Fang" not in x]
    return t


def variants():
    out = []
    for slug, (w, ladder) in ONE.items():
        p = next(b for b in BUILDS if b["slug"] == slug)
        out.append(dict(p, slug=slug + "-1h", name=p["name"] + " (one-handed)", w=w, weapons=ladder, parent=slug))
    return out


BUILDS.append({"slug": "str-bandit", "name": "STR Bandit", "cls": "Thief", "job": "Bandit", "w": "Dagger", "main": "LUK", "sub": "DEX", "raise": "STR",
               "creation": {"STR": 4, "DEX": 5, "INT": 4, "LUK": 12}, "early": None,
               "weapons": [(10, "Triangular Zamadar"), (17, "Triple-Tipped Zamadar"), (22, "Stinger"), (30, "Cass"), (40, "Korean Fan"), (45, "Bazlud"), (50, "Sai"),
                           (60, "Serpent's Coil"), (70, "Golden River")],
               "first": [("Double Stab", 20), ("Nimble Body", 15), ("Disorder", 3), ("Dark Sight", 20), ("Disorder", 6)],
               "second": [("Dagger Mastery", 5), ("Dagger Booster", 1), ("Savage Blow", 21), ("Dagger Mastery", 20), ("Savage Blow", 30), ("Haste", 5), ("Steal", 30),
                          ("Dagger Booster", 20), ("Haste", 20)],
               "jobs": (400, 420), "adv": [(10, "Thief", "Kerning City, Dark Lord", "Level 10", "1 SP. Lucky Seven and Double Stab open."),
                                           (30, "Bandit", "Kerning City, Dark Lord", "Level 30", "Pick Bandit. Dagger skills open.")],
               "third": "Chief Bandit"})
BUILDS += variants()
STAFF = [(10, "Wooden Staff"), (15, "Emerald Staff"), (20, "Old Wooden Staff"), (25, "Wizard Staff"), (45, "Arc Staff"), (55, "Thorns"), (65, "Evil Wings")]
MAGES = ("fire-poison", "ice-lightning", "cleric")
BUILDS += [dict(next(b for b in BUILDS if b["slug"] == m), slug=m + "-staff", name=next(b for b in BUILDS if b["slug"] == m)["name"] + " (staff)", w="Staff",
                weapons=STAFF, parent=m) for m in MAGES]


def staff_text(b):
    """a mage guide's words for the staff version"""
    t = json.loads(json.dumps(TEXT3[b["parent"]]))
    t["why"] = [x for x in t["why"] if not x.startswith("Cromi at 50")] + [
        "Staffs have no step between Wizard Staff at 25, magic attack 45, and Arc Staff at 45, 73. A wand mage has 55 to 69 over those levels, so a staff mage "
        "spends 30 to 44 with 10 to 24 less magic attack, then pulls ahead from 45."]
    t["mistakes"] = [x for x in t["mistakes"] if "Fairy Wand" not in x] + [
        "Forgetting LUK for Arc Staff. It needs 40 LUK at 45, so put your AP into LUK, or you stay on Wizard Staff's 45 magic attack instead of 73."]
    t["pitch"] = t["pitch"].replace("each wand's need", "each staff's need")
    return t
VARIANTS = {s: [{"label": "Two-handed", "slug": s}, {"label": "One-handed and shield", "slug": s + "-1h"}] for s in ONE}
VARIANTS.update({s + "-1h": v for s, v in VARIANTS.items()})
for m in ("fire-poison", "ice-lightning", "cleric"):
    VARIANTS[m] = VARIANTS[m + "-staff"] = [{"label": "Wand", "slug": m}, {"label": "Staff", "slug": m + "-staff"}]


def write(slugs=None):
    B2.TEXT.update(TEXT3); B2.COMPARE.update(COMPARE3)
    bs, plans, out, eng = run(slugs)
    for b in bs: drop_resisted(b["slug"], eng)
    for b in bs:
        st, rules, table, order = out[b["slug"]]
        if b["cls"] == "Warrior": B2.TEXT[b["slug"]] = text_for(b, st)
        if b["slug"].endswith("-staff"): B2.TEXT[b["slug"]] = staff_text(b)
        if b.get("parent"): B2.COMPARE[b["slug"]] = COMPARE3[b["parent"]]
        d = B2.build_json(b, st, rules, table, order, eng)
        if b["slug"] in VARIANTS: d["variants"] = VARIANTS[b["slug"]]
        for g in d["gear"]:
            w = WPN[g["item"]]; g["slot"] = w["kind"]
            if b["cls"] == "Magician": g["attack"] = w.get("incMAD") or 0; g["akind"] = "magic attack"; g["speed"] = None
        d["header"]["difficulty"] = "Easy" if b["cls"] in ("Bowman", "Magician") else "Medium"
        json.dump(d, open(os.path.join(B, b["slug"] + ".json"), "w"), indent=1, ensure_ascii=False)
        print("wrote", b["slug"], "| lv70", st[CAP], "| maps", len(d["train_ranges"]))





# ------------------------------------------------------------------------------------------------ 1 to 30 class guides
# For a player who only wants to get to 2nd job: one per class, the same rules, stopping at the 30 job advance with
# links to every 2nd job guide for that class.
def class_guide(cls, slug, weapons, first, jobs, skills_open):
    m, s = MAINSUB.get(cls, ("LUK", "DEX"))
    return {"slug": slug, "name": f"{cls}, 1 to 30", "cls": cls, "job": cls, "w": WPN[weapons[0][1]]["kind"], "main": m, "sub": s,
            "creation": CREATE.get(cls, {"STR": 4, "DEX": 5, "INT": 4, "LUK": 12}), "early": None, "weapons": [w for w in weapons if w[0] <= 30],
            "first": first, "second": [], "jobs": jobs, "cap": 30,
            "adv": [(10, cls, HOME.get(cls, "Kerning City, Dark Lord"), "Level 10", f"1 SP. {skills_open} open.")], "third": None}


CLASS30 = [
    class_guide("Warrior", "warrior", SWORD2, WARRIOR_1, (100, 110), "Power Strike and Slash Blast"),
    class_guide("Magician", "magician", WAND, MAGE_1, (200, 210), "Energy Bolt and Magic Claw"),
    class_guide("Bowman", "bowman", B2.HUNTER["weapons"], BOW_1, (300, 310), "Arrow Blow and Double Shot"),
    class_guide("Thief", "thief", B2.ASSASSIN["weapons"], B2.ASSASSIN["first"], (400, 410), "Lucky Seven and Double Stab"),
]
NEXT30 = {
    "warrior": [("Fighter, sword", "fighter-sword", "Rage for the party, two-handed or one-handed swords"), ("Fighter, axe", "fighter-axe", "Rage, and axes that make mobs bleed"),
                ("Page, sword", "page-sword", "Final Attack 360% on one mob"), ("Page, blunt weapon", "page-blunt", "+20% critical damage"),
                ("Spearman, spear", "spearman-spear", "spears, a step faster than polearms"), ("Spearman, polearm", "spearman-polearm", "polearms, the hardest hits until 70")],
    "magician": [("Fire Poison", "fire-poison", "Fire Arrow and Poison Breath"), ("Ice Lightning", "ice-lightning", "Cold Beam and Thunder Bolt on 6"), ("Cleric", "cleric", "Heal on undead, Bless for parties")],
    "bowman": [("Hunter", "hunter", "bow, Arrow Bomb on 6"), ("Crossbowman", "crossbowman", "crossbow, Iron Arrow through 6")],
    "thief": [("Assassin", "assassin", "claw and Lucky Seven all the way"), ("Sindit", "sindit", "Lucky Seven to 40, then a dagger"),
              ("Pure Bandit", "pure-bandit", "dagger from 10"), ("STR Bandit", "str-bandit", "STR daggers, a speed step faster")],
}
JOBADV30 = {"warrior": "Fighter, Page or Spearman", "magician": "Fire Poison, Ice Lightning or Cleric", "bowman": "Hunter or Crossbowman", "thief": "Assassin or Bandit"}
TEXT30 = {
    "warrior": {"pitch": "Warrior from 1 to the 2nd job advance at 30.", "best": [], "weak": [],
                "why": W1 + ["Two-handed swords are the easiest warrior weapons to get to 30: the Wooden Sword at 10, the Wooden Baseball Bat at 15 with no DEX, then a step every 5 levels.",
                             "Every warrior job uses this 1st job plan, so nothing here is wasted whichever 2nd job you pick at 30."],
                "mistakes": [IRONBODY, "Forgetting DEX before 20. Two-Handed Sword needs 20 DEX at 20, so put your AP from 18 to 20 into DEX, or you stay on the Wooden Baseball Bat's 35 attack instead of 40."]},
    "magician": {"pitch": "Magician from 1 to the 2nd job advance at 30.", "best": [], "weak": [],
                 "why": MAGE_W[:4] + ["Every mage job uses this 1st job plan, so nothing here is wasted whichever 2nd job you pick at 30."],
                 "mistakes": MAGE_M[:1]},
    "bowman": {"pitch": "Bowman from 1 to the 2nd job advance at 30.", "best": [], "weak": [],
               "why": ["Arrow Blow 20 hits one mob for 240% with one arrow. Double Shot 20 is 120% on up to 2, so Arrow Blow is your main attack until 30.",
                       "Critical Shot 15 is 20% critical rate and +15% critical damage. The Eye of Amazon 3 opens Focus, and Focus 20 is +25 accuracy and +25 avoid for 300 seconds.",
                       "The last 3 points go into The Eye of Amazon, 6 in all: 75 range, 15 more than at 3.",
                       "This guide uses a bow to 30. If you'll be a Crossbowman, a crossbow works with every 1st job skill too, and the Crossbowman guide covers it."],
               "mistakes": ["Maxing Double Shot before Arrow Blow. It's 120% per mob and uses 2 arrows a shot; Arrow Blow is 240% on one. Max Arrow Blow first.",
                            "Skipping STR before a new bow. Ryden needs 30 STR at 30, so put your AP at 30 into STR, or you stay on Battle Bow's 44 attack instead of 50."]},
    "thief": {"pitch": "Thief from 1 to the 2nd job advance at 30.", "best": [], "weak": [],
              "why": ["Lucky Seven throws 2 stars for 140% each at 20. Max it first and you hit from range from level 10.",
                      "Keen Eyes 15 adds range to Lucky Seven, 200 at 15, and needs Nimble Body 3. Nimble Body 15 is +15 accuracy and +15 avoid.",
                      "Disorder 3 opens Dark Sight, and the last points go there.",
                      "This plan is the claw start most thieves use. If you want a dagger and Double Stab from 10, the Pure Bandit and STR Bandit guides start that way from level 1."],
              "mistakes": ["Buying Kumbi or Tobi stars to level. Kumbi is +4 attack over Wolbi, 21 against 17, for a lot more mesos. Wolbi from Max in Kerning City is all you need."]},
}


def write30():
    B2.TEXT.update(TEXT30); B2.COMPARE.update({k: [] for k in TEXT30})
    bs = [B2.usable(b) for b in CLASS30]
    plans, out = {}, {}
    for b in bs:
        st, rules, table = plan_stats(b); order = plan_sp(b)
        plans[b["slug"]] = (st, order); out[b["slug"]] = (st, rules, table, order)
    eng = engine(bs, plans)
    for b in bs:
        st, rules, table, order = out[b["slug"]]
        d = B2.build_json(b, st, rules, table, order, eng)
        d["cap"] = 30
        d["stat_plan"]["table"] = [r for r in d["stat_plan"]["table"] if r["level"] <= 30]
        d["stat_plan"]["rule"] = [r for r in d["stat_plan"]["rule"] if not re.match(r"(\d+)", r["levels"]) or int(re.match(r"(\d+)", r["levels"]).group(1)) <= 30]
        d["train_ranges"] = [t for t in d["train_ranges"] if int(t["levels"].split()[0]) < 30]
        d["gear_note"] = ""; d["compare"] = []; d["future"] = []
        d["advancement"] = [a for a in d["advancement"] if str(a["level"]).isdigit()] + [
            {"level": 30, "job": "2nd job", "where": HOME.get(b["cls"], "Kerning City, Dark Lord"), "needs": "Level 30", "gets": f"Pick {JOBADV30[b['slug']]}. Your build guide takes over from here."}]
        d["next_guides"] = [{"name": n, "slug": s, "blurb": x} for n, s, x in NEXT30[b["slug"]]]
        d["header"]["level_range"] = "1 to 30"
        d["search"] = {"title": f"{b['cls']} Guide 1 to 30: AP and SP | Club FM", "description": f"MapleStory Classic {b['cls'].lower()} from level 1 to 30: AP and SP for every level, weapons and where to get them, where to train, and which 2nd job to pick."[:155]}
        json.dump(d, open(os.path.join(B, b["slug"] + ".json"), "w"), indent=1, ensure_ascii=False)
        print("wrote", b["slug"], "| lv30", st[30])


if __name__ == "__main__":
    if sys.argv[1:] == ["class30"]: write30()
    else: write(sys.argv[1:])
