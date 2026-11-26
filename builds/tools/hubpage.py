#!/usr/bin/env python3
"""The /builds/ hub: every build grouped by class, in the guides' game window look. A build links once its page is
built in the new look; the rest say "Guide coming".
    python3 builds/tools/hubpage.py
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, HERE)
import worldpages as W  # noqa: E402
import gwpage as G  # noqa: E402

E = G.E
DONE = {"sindit", "spearman-spear", "spearman-polearm", "assassin", "pure-bandit", "hunter"}   # pages rebuilt in the approved look
CLASSES = [
    ("Warrior", [("Fighter, sword", "fighter-sword"), ("Fighter, axe", "fighter-axe"), ("Page, sword", "page-sword"), ("Page, blunt weapon", "page-blunt"),
                 ("Spearman, spear", "spearman-spear"), ("Spearman, polearm", "spearman-polearm"), ("Dexless warrior", "dexless-warrior")]),
    ("Magician", [("Fire Poison", "fire-poison"), ("Ice Lightning", "ice-lightning"), ("Cleric", "cleric"), ("LUK mage", "luk-mage")]),
    ("Bowman", [("Hunter", "hunter"), ("Crossbowman", "crossbowman")]),
    ("Thief", [("Assassin", "assassin"), ("DEX Assassin", "dex-assassin"), ("Pure Bandit", "pure-bandit"), ("Sindit", "sindit"),
               ("STR Bandit", "str-bandit"), ("DEX Bandit", "dex-bandit"), ("Dexless Bandit", "dexless-bandit")]),
]


def build():
    wins = []
    for cls, builds in CLASSES:
        cards = "".join(
            f'<a href="/builds/{s}/"><b>{E(n)}</b><div class="go">Open the guide →</div></a>' if s in DONE and G.exists("builds", s)
            else f'<div class="c"><b>{E(n)}</b><div class="soon">Guide coming</div></div>' for n, s in builds)
        wins.append(f'<div class="win"><h2>{E(cls)}</h2><div class="in"><div class="cmp">{cards}</div></div></div>')
    body = (f'<style>{G.CSS}</style><div class="gw"><div class="gw-top"><div><h1>Build guides</h1>'
            '<p>Stats and SP for every level from 1 to 70, the weapon to use at each level and where to get it, and where to train. Pick your build.</p></div></div>'
            + "".join(wins) + '<div class="win"><h2>Stars and arrows</h2><div class="in"><div class="cmp"><a href="/items/stars/"><b>Every star and arrow</b><small>attack, set size, NPC and FM prices</small><div class="go">Open →</div></a></div></div></div></div>')
    title = "MapleStory Classic Build Guides | Club FM"
    desc = "MapleStory Classic build guides: AP and SP for every level from 1 to 70, weapons and where to get them, and where to train."
    assert len(title) < 60 and len(desc) < 155
    text = W.page(title, desc, "/builds/", [("Build guides", "/builds/")], body)
    text = text.replace('<a href="/training/">Training guides</a><a href="/maps/" aria-current="page">Maps</a>', '<a href="/training/" aria-current="page">Training guides</a><a href="/maps/">Maps</a>')
    text = text.replace('<div class="card">', '<div class="card wide">', 1)   # use the full width on desktop
    W.write(ROOT, "/builds/", text)


if __name__ == "__main__":
    build(); print("wrote /builds/")
