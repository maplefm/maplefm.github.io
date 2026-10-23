"""Trade chat self test. Run it after any change to fmparse.py:  python test_chat.py

1. Hand-written cases: messages that went wrong once, with the right answer. Add a line every time
   chat gets something wrong, so the same mistake can never come back.
2. Golden file: every real chat message saved in review/ and what the reader made of it the last time
   it was checked (chat_golden.json). Anything that reads differently now is printed so a person can
   say whether the change is a fix or a new mistake. Run with --accept to save the new answers.
"""
import json, os, sys, glob
import fmparse

HERE = os.path.dirname(os.path.abspath(__file__))
GOLD = os.path.join(HERE, "chat_golden.json")

CASES = [
    # a linked [item] after the price belongs to nobody's price: this one is an Earring LUK 60%
    ("S> 60% EARRING LUK SCROLL 140K OBO [Claw Attack Scroll: Intermediate] Soft Chocolate Fondue Scepter",
     [("S", "Earring LUK Scroll: Intermediate", 140000)]),
    ("S> Claw attack scroll 60% 295k", [("S", "Claw Attack Scroll: Intermediate", 295000)]),
    ("S> 60% Glove Magic Attk Scroll - 250k :}", [("S", "Gloves Magic Attack Scroll: Intermediate", 250000)]),
    # two scrolls in one message each keep their own percent and price
    ("S> 60% claw 300k / 10% earring luk 150k",
     [("S", "Claw Attack Scroll: Intermediate", 300000), ("S", "Earring LUK Scroll: Greater", 150000)]),
    ("S> bow 10% 80k, xbow 60% 120k",
     [("S", "Bow Attack Scroll: Greater", 80000), ("S", "Crossbow Attack Scroll: Intermediate", 120000)]),
    ("S > HALO 165K, EARRING LUK 60% 140K", None),   # None: only check the earring is right, halo may vary
    # no price, no row
    ("S>GLOVE FOR ATT 60% PMO OFFER", []),
    ("S> 60% EARRING LUK SCROLL PMO [Emerald Earrings]", []),
    # c/o is a bid, not an asking price
    ("S> 60% glove atk, C/O 600k", []),
]

ROLLS = [
    # rolls written next to equips: a grade in brackets, or the attack number
    ("S> KFAN (-3) 100k", [("S", "Korean Fan", 100000, {"g": -3})]),
    ("S>Kfan att65(+3) 800K", [("S", "Korean Fan", 800000, {"g": 3, "ATT": 65})]),
    ("S> Korean Fan 55 att 200k", [("S", "Korean Fan", 200000, {"ATT": 55})]),
    ("S> Wooden Staff +7 56 Magic Attack (24+32) 150k", [("S", "Wooden Staff", 150000, {"MATT": 56})]),
    ("S> Steel Avarice 90k", [("S", "Steel Avarice", 90000, None)]),
    ("selling brown legolier 4 str above average 40k", [("S", "Brown Legolier", 40000, {"g": 4})]),
    ("S>Nx.decos for your aurora stamps, 20K each", []),
    ("S> Claw attack scroll 60% 295k", [("S", "Claw Attack Scroll: Intermediate", 295000, None)]),
]

def run_cases():
    bad = 0
    for msg, want in ROLLS:
        got = fmparse.parse_chat_message_x(msg)
        if got != want:
            bad += 1; print("FAIL roll", msg, "\n   want", want, "\n   got ", got)
    for msg, want in CASES:
        got = fmparse.parse_chat_message(msg)
        if want is None:
            ok = ("S", "Earring LUK Scroll: Intermediate", 140000) in got and not any("Claw" in g[1] for g in got)
        else:
            ok = got == want
        if not ok:
            bad += 1; print("FAIL", msg, "\n   want", want, "\n   got ", got)
    print(f"cases: {len(CASES) + len(ROLLS) - bad} of {len(CASES) + len(ROLLS)} pass")
    return bad

def messages():
    seen = set()
    for f in sorted(glob.glob(os.path.join(HERE, "review", "*chat.json"))):
        try: d = json.load(open(f, encoding="utf-8"))
        except Exception: continue
        for m in d.get("messages", []):
            if m[1] not in seen: seen.add(m[1]); yield m[1]

def run_golden(accept):
    gold = json.load(open(GOLD, encoding="utf-8")) if os.path.exists(GOLD) else {}
    changed = 0; new = dict(gold)
    # every message ever saved is re-checked, not only the ones still in review/ (that folder rotates)
    for m in list(dict.fromkeys(list(gold) + list(messages()))):
        got = [list(x) for x in fmparse.parse_chat_message(m)]
        if m in gold and gold[m] != got:
            changed += 1; print("CHANGED", m[:120], "\n   was", gold[m], "\n   now", got)
        new[m] = got
    if accept or not gold:
        json.dump(new, open(GOLD, "w", encoding="utf-8"), indent=0, ensure_ascii=False)
        print(f"golden file saved: {len(new)} messages")
    print(f"golden: {len(gold)} known messages, {changed} read differently now")
    return 0 if accept else changed

if __name__ == "__main__":
    b = run_cases() + run_golden("--accept" in sys.argv)
    sys.exit(1 if b else 0)
