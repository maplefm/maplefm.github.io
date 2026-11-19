"""Prerequisites of quests only the wiki lists (tools/itemguide.py), checked offline.
Nov 19 2026: the Forgotten Hollow quests arrived on the wiki with no game-file record, so their pages had no prerequisite.
  python3 tests/wikiquestpre.py"""
import os, re, sys, textwrap
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "tools", "itemguide.py")).read()
blk = textwrap.dedent(src[src.index("    # prerequisites of those wiki quests"):src.index('    print("quests in the log"')])
fails = []
def ok(name, cond, extra=""):
    print(("ok   " if cond else "FAIL ") + name + (" | " + str(extra) if extra else ""))
    if not cond: fails.append(name)
ok("itemguide asks the wiki for prerequisite", '"arc", "prerequisite"]' in src)
norm2 = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())
def run(wpre):
    allq = [{"id": i + 1, "n": n, "pre": []} for i, n in enumerate(["Welcome to the Hollow", "Zelya's Map", "Word from the Hideout", "A Rival's Gambit", "Two Thieves, One Plan", "x", "Glowspore Ward", "What Rots Below"])]
    page_qid = {"Glowspore Ward (quest)": 7}; by = {norm2(q["n"]): q["id"] for q in allq}
    qid_of = lambda p: page_qid.get(str(p or "").strip()) or by.get(norm2(str(p or "")))
    exec(blk, {"allq": allq, "wpre": wpre, "qid_of": qid_of, "print": lambda *a: None})
    return {q["n"]: q["pre"] for q in allq}
r = run({2: "Welcome to the Hollow", 5: "A Rival's Gambit", 8: "Glowspore Ward (quest)"})
ok("plain, by page name", r["Zelya's Map"] == [1] and r["Two Thieves, One Plan"] == [4] and r["What Rots Below"] == [7], r)
ok("a name with a comma stays whole", run({6: "Two Thieves, One Plan"})["x"] == [5])
ok("two quests joined by a comma", run({6: "Welcome to the Hollow,Zelya's Map"})["x"] == [1, 2])
ok("an unknown page is left out, never guessed", run({6: "Nope Quest;Welcome to the Hollow"})["x"] == [1])
print(f"\n{'all passed' if not fails else str(len(fails)) + ' failed'}")
sys.exit(1 if fails else 0)
