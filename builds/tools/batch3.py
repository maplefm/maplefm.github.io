#!/usr/bin/env python3
"""Batch 3 build guides: Fighter sword and axe, Page sword and blunt weapon, Fire Poison, Ice Lightning, Cleric,
Crossbowman. Same rules and checks as batch2.py (whose stat, SP and price helpers this reuses): creation 25 points with
the sub stat at exactly 5, the sub stat only to each weapon's requirement in the game files, SP orders checked against
the game files' required skill levels, training maps from the site's damage engine.
    python3 builds/tools/batch3.py [slug ...]
"""
import json, os, subprocess, sys, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import batch2 as B2  # noqa: E402
from batch2 import WPN, CAP, BANDS, plan_stats, plan_sp, skills_at, needs, price, mesos  # noqa: E402

B = B2.B
JOBNAME = {110: "Fighter", 120: "Page", 210: "Fire Poison Wizard", 220: "Ice Lightning Wizard", 230: "Cleric", 320: "Crossbowman"}

WARRIOR_1 = [("Power Strike", 20), ("Slash Blast", 20), ("Precise Strikes", 15), ("Improved HP Recovery", 5), ("Max HP Increase", 1)]
MAGE_1 = [("Energy Bolt", 20), ("Improved MP Recovery", 15), ("Max MP Increase", 15), ("Magic Guard", 11)]
BOW_1 = [("Arrow Blow", 20), ("Critical Shot", 15), ("The Eye of Amazon", 3), ("Focus", 20), ("The Eye of Amazon", 6)]
ADV1 = {"Warrior": (10, "Warrior", "Perion, Dances with Balrog", "Level 10", "1 SP. Power Strike and Slash Blast open."),
        "Magician": (10, "Magician", "Ellinia, Grendel the Really Old", "Level 10", "1 SP. Energy Bolt and Magic Claw open."),
        "Bowman": (10, "Bowman", "Henesys, Athena Pierce", "Level 10", "1 SP. Arrow Blow and Double Shot open.")}
CREATE = {"Warrior": {"STR": 12, "DEX": 5, "INT": 4, "LUK": 4}, "Magician": {"STR": 4, "DEX": 4, "INT": 12, "LUK": 5},
          "Bowman": {"STR": 5, "DEX": 12, "INT": 4, "LUK": 4}}
MAINSUB = {"Warrior": ("STR", "DEX"), "Magician": ("INT", "LUK"), "Bowman": ("DEX", "STR")}
HOME = {"Warrior": "Perion, Dances with Balrog", "Magician": "Ellinia, Grendel the Really Old", "Bowman": "Henesys, Athena Pierce"}

SWORD2 = [(10, "Wooden Sword"), (15, "Wooden Baseball Bat"), (20, "Two-Handed Sword"), (25, "Broadsword"), (30, "Scimitar"), (35, "Lionheart"),
          (40, "Zard"), (45, "Blade of Harmony"), (50, "Lion's Fang"), (60, "Sparta"), (70, "Doombringer")]
AXE2 = [(10, "Metal Axe"), (20, "Iron Axe"), (25, "Two-Handed Axe"), (30, "Blue Axe"), (35, "Niam"), (40, "Sabretooth"), (50, "The Rising"),
        (60, "The Shining"), (70, "Chrono")]
BLUNT2 = [(10, "Wooden Mallet"), (15, "Heavy Mace"), (20, "Square Hammer"), (25, "Monkey Wrench"), (30, "Mithril Maul"), (35, "Sledgehammer"),
          (40, "Titan"), (50, "Golden Mole"), (60, "The Blessing"), (70, "Gigantic Sledge")]
WAND = [(10, "Wooden Wand"), (15, "Hardwood Wand"), (20, "Metal Wand"), (25, "Ice Wand"), (30, "Mithril Wand"), (35, "Wizard Wand"), (40, "Fairy Wand"),
        (45, "Arc Staff"), (50, "Cromi"), (60, "Evil Tale"), (70, "Angel Wings")]
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
         [("Teleport", 1), ("Heal", 1), ("Holy Arrow", 30), ("Heal", 30), ("MP Eater", 20), ("Invincible", 5), ("Bless", 20), ("Teleport", 16)], "Priest"),
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
    bs = [b for b in BUILDS if not slugs or b["slug"] in slugs]
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
IRONBODY = "Putting points into Iron Body. It needs Max HP Increase 3 first, so it costs 2 extra points before it does anything, and then it's only +20% weapon defense. Those points do more in Precise Strikes, +20 accuracy at 15."
MASTERY_VS = ("{m} Mastery 20 comes before the rest of {other}. At 40 those 15 points raise your average hit about 30%, because mastery lifts your lowest hits; "
              "{other_why}")
BOOST = "{w} Mastery 5 opens {w} Booster, and Booster 1 already gives the full 2 steps of speed. Points 2 to 20 only make it last 300 seconds instead of 100 and cut its HP and MP cost from 30 to 10, so they wait."
DEX2H = "2-handed {w}s need DEX equal to their level from {first} at {lv}{skip}. AP only goes into DEX in the levels right before each new {w}, everything else goes into STR."
MAGE_W = [
    "Energy Bolt 20 is 130 magic on one mob for 16 MP. Magic Claw 20 is the same 130 split into two 65 hits for 20 MP and less range, 300 against 350, so Energy Bolt is the one to max.",
    "Improved MP Recovery 15 makes MP potions heal 25% more, and Max MP Increase 15 is +25% max MP. Mages live on MP potions, so that's straight mesos saved every hour.",
    "The last 11 points of 1st job go into Magic Guard: at 11 it sends 68% of the damage you take to MP instead of HP. Turn it on for mobs that hit hard, like Wraiths.",
    "MP Eater 3 opens Meditation, and Meditation 1 is already +5 magic attack for you and your party. Teleport 1 gets you around maps from 31.",
]
MAGE_M = [
    "Maxing Magic Claw and Energy Bolt both. They do the same damage at max, so the second one is 19 SP wasted that should be in MP Recovery and Max MP.",
    "Putting 2nd job points into Slow. It only slows mobs and drops their avoid by 5 at 20; those points do more in Meditation, +25 magic attack at 20.",
]
TEXT3 = {
    "fighter-sword": {
        "pitch": "STR with DEX only to each sword's need. Power Strike and Slash Blast 20 by 23, then Sword Mastery, Rage and Final Attack.",
        "best": ["Rage is +40 attack for you and your party", "Sword Mastery is +20 accuracy", "Final Attack: Sword hits 3 mobs"],
        "weak": ["Rage lowers your own weapon defense by 40", "DEX has to match your level from 20"],
        "why": W1 + [BOOST.format(w="Sword"),
                     "Rage 1 goes in at 32: it's already +10 attack for 150 seconds for 1 SP, about +20% damage on a 53 attack Scimitar.",
                     MASTERY_VS.format(m="Sword", other="Rage", other_why="the other 29 points of Rage add 30 attack, about 43% on a 60 attack Zard. Per point Mastery is worth more, and it's +20 accuracy too."),
                     "Final Attack: Sword 1 goes in early: a 25% chance when you attack to open a 60 second window for one extra hit on up to 3 mobs, 140% at 1. Points 2 to 30 raise it to 200%.",
                     "Rush 1 at 33 is for getting around: it carries you forward and hits up to 6 mobs for 60%. Points 2 to 20 only raise that to 80%, so they come last.",
                     DEX2H.format(w="sword", first="Two-Handed Sword", lv=20, skip=", except Wooden Baseball Bat at 15")],
        "mistakes": [IRONBODY,
                     "Maxing Sword Booster early. Points 2 to 20 only stretch it from 100 to 300 seconds. That's 19 SP, over 6 levels, that should be in Mastery and Rage.",
                     "Forgetting DEX before 20. Two-Handed Sword needs 20 DEX at 20, so put your AP from 18 to 20 into DEX, or you stay on the Wooden Baseball Bat's 35 attack instead of 40.",
                     "Leaving Rage at 0 until later. Its first point is +10 attack, about 20% on a Scimitar, for 1 SP."],
    },
    "fighter-axe": {
        "pitch": "STR with DEX only to each axe's need. Power Strike and Slash Blast 20 by 23, then Axe Mastery, Rage and Final Attack.",
        "best": ["Rage is +40 attack for you and your party", "Axe Mastery makes mobs bleed", "Final Attack: Axe hits 3 mobs"],
        "weak": ["No accuracy from Axe Mastery, unlike Sword Mastery", "Rage lowers your own weapon defense by 40"],
        "why": W1 + [BOOST.format(w="Axe"),
                     "Rage 1 goes in at 32: it's already +10 attack for 1 SP, about +20% damage on a 50 attack Blue Axe.",
                     MASTERY_VS.format(m="Axe", other="Rage", other_why="the other 29 points of Rage add 30 attack, about 43% on a 60 attack Sabretooth. Per point Mastery is worth more, and at 20 your hits have a 25% chance to make the mob bleed."),
                     "Final Attack: Axe 1 goes in early: a 25% chance when you attack to open a 60 second window for one extra hit on up to 3 mobs, 140% at 1. Points 2 to 30 raise it to 200%.",
                     "Rush 1 at 33 is for getting around: it carries you forward and hits up to 6 mobs for 60%. Points 2 to 20 only raise that to 80%, so they come last.",
                     DEX2H.format(w="axe", first="Iron Axe", lv=20, skip="")],
        "mistakes": [IRONBODY,
                     "Maxing Axe Booster early. Points 2 to 20 only stretch it from 100 to 300 seconds. That's 19 SP, over 6 levels, that should be in Mastery and Rage.",
                     "Buying a sword with an axe build. Axe Mastery, Axe Booster and Final Attack: Axe only work with an axe, so you lose most of 2nd job.",
                     "Skipping DEX before Sabretooth. It needs 40 DEX at 40, so put your AP from 40 into DEX, or you stay on Niam's 55 attack instead of 60."],
    },
    "page-sword": {
        "pitch": "STR with DEX only to each sword's need. Power Strike and Slash Blast 20 by 23, then Sword Mastery and Final Attack.",
        "best": ["Final Attack: Sword hits for 360% at 30", "Sword Mastery is +20 accuracy", "Rush hits 6 mobs"],
        "weak": ["No attack buff like Rage", "DEX has to match your level from 20"],
        "why": W1 + [BOOST.format(w="Sword"),
                     "Final Attack: Sword 1 goes in at 32: a 25% chance when you attack to open a 60 second window for one extra 270% hit. 1 point already gets the full chance.",
                     "Sword Mastery 20 comes next. At 40 those 15 points raise your average hit about 30%, because mastery lifts your lowest hits, and they're +20 accuracy.",
                     "Final Attack points 2 to 30 take that hit from 270% to 360%, so they come right after Mastery.",
                     "Threaten goes last, with the 30 points nothing else needs by then: at 30 it lowers up to 4 mobs' weapon defense by 10 and slows them for 30 seconds.",
                     DEX2H.format(w="sword", first="Two-Handed Sword", lv=20, skip=", except Wooden Baseball Bat at 15")],
        "mistakes": [IRONBODY,
                     "Maxing Sword Booster early. Points 2 to 20 only stretch it from 100 to 300 seconds. That's 19 SP, over 6 levels, that should be in Mastery and Final Attack.",
                     "Forgetting DEX before 20. Two-Handed Sword needs 20 DEX at 20, so put your AP from 18 to 20 into DEX, or you stay on the Wooden Baseball Bat's 35 attack instead of 40.",
                     "Putting Threaten ahead of Final Attack. -10 weapon defense on 4 mobs is a small gain; Final Attack 2 to 30 takes your extra hit from 270% to 360%."],
    },
    "page-blunt": {
        "pitch": "STR with DEX only to each blunt weapon's need. Power Strike and Slash Blast 20 by 23, then Blunt Weapon Mastery and Final Attack.",
        "best": ["Blunt Weapon Mastery is +20% critical damage", "Final Attack: Blunt Weapon hits for 360% at 30", "2-handed blunt weapons have the most attack"],
        "weak": ["2-handed blunt weapons are slow", "DEX from 15"],
        "why": W1 + [BOOST.format(w="Blunt Weapon"),
                     "Final Attack: Blunt Weapon 1 goes in at 32: a 25% chance when you attack to open a 60 second window for one extra 270% hit. 1 point already gets the full chance.",
                     "Blunt Weapon Mastery 20 comes next. At 40 those 15 points raise your average hit about 30%, because mastery lifts your lowest hits, and they're +20% critical damage.",
                     "Final Attack points 2 to 30 take that hit from 270% to 360%, so they come right after Mastery.",
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
        "weak": ["Fire-resistant mobs take 25% less", "Lives on MP potions"],
        "why": MAGE_W + ["Fire Arrow 30 first: 180 magic and a burn every second for 3 seconds. In our damage engine, Fire Arrow first trains about 23% faster at 40 than Poison Breath first, 73.7K EXP an hour against 60K.",
                         "Meditation 20 next, +25 magic attack for 300 seconds, then Poison Breath 30 for up to 6 mobs at 90.",
                         "Wands need LUK from Metal Wand at 20: 10 LUK there, 40 at 50 and 65 at 70. AP only goes into LUK in the levels right before each new wand, everything else goes into INT."],
        "mistakes": MAGE_M + ["Training on fire-resistant mobs. Fire hits them 25% softer; pick maps where the mobs are fire-weak, like Jr. Wraiths.",
                              "Forgetting LUK before Cromi. It needs 40 LUK at 50, so keep LUK at 40 from Arc Staff at 45, or you can't wear it."],
    },
    "ice-lightning": {
        "pitch": "INT with LUK only to each wand's need. Energy Bolt in 1st job, then Cold Beam, Meditation and Thunder Bolt.",
        "best": ["Cold Beam slows the mob it hits", "Thunder Bolt hits up to 6 mobs", "Meditation is +25 magic attack for the party"],
        "weak": ["Ice-resistant mobs take 25% less", "Lives on MP potions"],
        "why": MAGE_W + ["Thunder Bolt 1 at 32 gives you a hit for 6 mobs, 50 magic, from the start of 2nd job.",
                         "Cold Beam 30 first: 170 magic on one mob, and the mob is slowed. In our damage engine, Cold Beam first trains about 23% faster at 40 than Thunder Bolt first, 73.7K EXP an hour against 60K.",
                         "Meditation 20 next, +25 magic attack for 300 seconds, then Thunder Bolt to 30, 80 magic on up to 6 mobs with a 25% stun.",
                         "Wands need LUK from Metal Wand at 20: 10 LUK there, 40 at 50 and 65 at 70. AP only goes into LUK in the levels right before each new wand, everything else goes into INT."],
        "mistakes": MAGE_M + ["Training on ice-resistant mobs. Ice hits Ligators, Cold Eyes, Drakes and Crocos 25% softer; lightning-weak mobs like Lorangs and Clangs take 25% more from Thunder Bolt.",
                              "Forgetting LUK before Cromi. It needs 40 LUK at 50, so keep LUK at 40 from Arc Staff at 45, or you can't wear it."],
    },
    "cleric": {
        "pitch": "INT with LUK only to each wand's need. Energy Bolt in 1st job, then Holy Arrow, Heal, and Bless for parties.",
        "best": ["Heal hurts undead mobs, up to 6", "Holy Arrow hits undead harder", "Parties want a Cleric"],
        "weak": ["Heal only hurts undead mobs", "No Meditation"],
        "why": MAGE_W[:3] + ["Teleport 1 and Heal 1 go in at 30 and 31: getting around, and a heal for you and your party.",
                             "Holy Arrow 30 first: 160 magic on one mob, more on undead. In our damage engine, Holy Arrow first trains about 22% faster at 40 than Heal first, 73.7K EXP an hour against 60.4K.",
                             "Heal 30 next: it hits every undead mob around you, up to 6, and heals your party. On Jr. Wraith and Zombie Mushroom maps that's your best attack.",
                             "Invincible 5 opens Bless. Bless 20 cuts the damage your whole party takes by 10% for 300 seconds.",
                             "Wands need LUK from Metal Wand at 20: 10 LUK there, 40 at 50 and 65 at 70. AP only goes into LUK in the levels right before each new wand, everything else goes into INT."],
        "mistakes": MAGE_M[:1] + ["Leveling Heal first and training off undead maps. Heal only hurts undead; anywhere else Holy Arrow is your attack.",
                                   "Maxing Invincible. 5 points open Bless; the other 15 only cut physical damage from 5% to 20%.",
                                   "Forgetting LUK before Cromi. It needs 40 LUK at 50, so keep LUK at 40 from Arc Staff at 45, or you can't wear it."],
    },
    "crossbowman": {
        "pitch": "DEX with STR only to each crossbow's need. Arrow Blow in 1st job, then Crossbow Mastery, Iron Arrow and Final Attack.",
        "best": ["Ranged from level 10", "Iron Arrow hits up to 6 mobs in a line", "Arrows cost 1 meso each at the NPC"],
        "weak": ["STR for crossbows from 20", "Crossbows are slower than bows"],
        "why": ["Arrow Blow 20 hits one mob for 240% with one arrow. Double Shot 20 is 120% on up to 2, so Arrow Blow is your main attack until 30.",
                "Critical Shot 15 is 20% critical rate and +15% critical damage. The Eye of Amazon 3 opens Focus, and Focus 20 is +25 accuracy and +25 avoid for 300 seconds.",
                "The last 3 points of 1st job go into The Eye of Amazon, 6 in all, for +15 range on every crossbow attack.",
                "Crossbow Mastery 5 opens Crossbow Booster, and Booster 1 is already the full 2 steps of speed. Final Attack: Crossbow 1 is a 25% chance for an extra 270% hit, so it goes in early too.",
                "Iron Arrow 1 at 33 already hits up to 6 mobs in a line for 120%. Mastery 20 comes next, then Iron Arrow to 30 for 180%.",
                "Soul Arrow needs Booster 5 and only saves arrows that cost 1 meso, so both wait until after Final Attack.",
                "Crossbows need STR from Balanche at 20, about 10 under your level. AP only goes into STR in the levels right before each new crossbow, everything else goes into DEX."],
        "mistakes": ["Skipping STR before a new crossbow. Eagle Crow needs 20 STR at 30, so put your AP from 30 into STR, or you stay on Mountain Crossbow's 47 attack instead of 52.",
                     "Maxing Crossbow Booster early. Points 2 to 20 only stretch it from 100 to 300 seconds. That's 19 SP, over 6 levels, that belong in Mastery, Iron Arrow and Final Attack.",
                     "Buying a bow. Crossbow Mastery, Booster, Soul Arrow, Iron Arrow and Final Attack: Crossbow only work with a crossbow, so you lose all of 2nd job.",
                     "Leveling Double Shot before Arrow Blow. Double Shot 20 is 120% per mob, Arrow Blow 20 is 240% on one; max Arrow Blow first."],
    },
}
COMPARE3 = {
    "fighter-sword": [("Fighter, sword (this guide)", "Rage and +20 accuracy", "DEX from 20"), ("Fighter, axe", "Rage and bleeding", "no accuracy from mastery"), ("Page, sword", "360% Final Attack", "no Rage")],
    "fighter-axe": [("Fighter, axe (this guide)", "Rage and bleeding", "no accuracy from mastery"), ("Fighter, sword", "Rage and +20 accuracy", "DEX from 20"), ("Page, blunt weapon", "+20% critical damage", "no Rage")],
    "page-sword": [("Page, sword (this guide)", "360% Final Attack, +20 accuracy", "no Rage"), ("Page, blunt weapon", "+20% critical damage", "slow weapons"), ("Fighter, sword", "Rage for the party", "Final Attack only 200%")],
    "page-blunt": [("Page, blunt weapon (this guide)", "+20% critical damage", "slow weapons"), ("Page, sword", "+20 accuracy", "less attack"), ("Fighter, axe", "Rage for the party", "Final Attack only 200%")],
    "fire-poison": [("Fire Poison (this guide)", "Fire Arrow burn", "fire-resistant mobs"), ("Ice Lightning", "Cold Beam slow, Thunder Bolt on 6", "ice-resistant mobs"), ("Cleric", "Heal on undead, parties", "Heal only hurts undead")],
    "ice-lightning": [("Ice Lightning (this guide)", "Cold Beam slow, Thunder Bolt on 6", "ice-resistant mobs"), ("Fire Poison", "Fire Arrow burn", "fire-resistant mobs"), ("Cleric", "Heal on undead, parties", "Heal only hurts undead")],
    "cleric": [("Cleric (this guide)", "Heal on undead, parties", "Heal only hurts undead"), ("Fire Poison", "Fire Arrow burn", "fire-resistant mobs"), ("Ice Lightning", "Cold Beam slow", "ice-resistant mobs")],
    "crossbowman": [("Crossbowman (this guide)", "Iron Arrow on 6 in a line", "slower weapons"), ("Hunter", "Arrow Bomb on 6", "STR for bows from 15")],
}


def write(slugs=None):
    B2.TEXT.update(TEXT3); B2.COMPARE.update(COMPARE3)
    bs, plans, out, eng = run(slugs)
    for b in bs:
        st, rules, table, order = out[b["slug"]]
        d = B2.build_json(b, st, rules, table, order, eng)
        for g in d["gear"]:
            w = WPN[g["item"]]; g["slot"] = w["kind"]
            if b["cls"] == "Magician": g["attack"] = w.get("incMAD") or 0; g["akind"] = "magic attack"; g["speed"] = None
        d["header"]["difficulty"] = "Easy" if b["cls"] in ("Bowman", "Magician") else "Medium"
        json.dump(d, open(os.path.join(B, b["slug"] + ".json"), "w"), indent=1, ensure_ascii=False)
        print("wrote", b["slug"], "| lv70", st[CAP], "| maps", len(d["train_ranges"]))


if __name__ == "__main__":
    write(sys.argv[1:])
