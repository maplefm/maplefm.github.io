#!/usr/bin/env python3
"""tools/accuracy.py row checks on fixed cases, so a change to the limits shows up here first."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
import accuracy as A

names = {"red potion": (2000000, "Use"), "gephart": (1102000, "Equip:Cape"), "wolbi throwing stars": (2070006, "Use:Thrown")}
typ = {"red potion": (40, False), "gephart": (200000, True), "wolbi throwing stars": (1500, False)}
cases = [
    ({"i": "Red Potion", "p": 1000, "q": 25}, []),               # 40 each: fine
    ({"i": "Red Potion", "p": 5, "q": 1}, ["low"]),              # 5 against 40: under 15%
    ({"i": "Red Potion", "p": 5000, "q": 1}, ["high"]),          # 125 times typical: a spot holder
    ({"i": "Red Potion", "p": 5, "q": 1, "k": "b"}, []),         # a buy post is never priced against typical
    ({"i": "Gephart", "p": 15000, "q": 1}, []),                  # equipment: rolls move the price 10x, never flagged
    ({"i": "Gephart", "p": 15000, "q": 3}, ["stack"]),           # equipment never stacks
    ({"i": "Wolbi Throwing Stars", "p": 1449, "q": 500}, []),    # a set is priced per set, not per star
    ({"i": "Wolbi Throwing Stars", "p": 144, "q": 500}, ["low"]),  # a digit dropped
    ({"i": "Red Potoin", "p": 40, "q": 1}, ["name"]),
]
bad = 0
for r, want in cases:
    got = A.row_flags(r, "watcher-shop", names, typ)
    if got != want: bad += 1; print("FAIL", r, "want", want, "got", got)
assert A.edit1("Shinchan", "Sinchan") and not A.edit1("abc", "abc") and not A.edit1("abcd", "abxy")
print("accuracy cases:", len(cases) - bad, "of", len(cases), "pass"); sys.exit(1 if bad else 0)
