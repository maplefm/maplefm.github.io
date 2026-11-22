"""Checks the Mega Deals repeat rules in tools/discord.py job_deals, offline: nothing is posted.
  python3 tests/deals-repeat.py
1. one seller's three copies of an item post once, not three times in 18 seconds (LoNaim, Nov 22);
2. a repriced listing posts again only when the price drops 25% or more (Chimte's fan: 110K then 65K);
3. no item posts more than ITEM_CAP times a day."""
import json, os, sys, tempfile, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
os.environ.pop("DISCORD_HOOKS", None); os.environ.pop("DISCORD_HOOK_DEALS", None)
import discord as D
sent = []
D.post = lambda kind, content=None, embeds=None: sent.append(embeds[0]["description"]) or True
D.scan_docs = lambda data_dir: iter(())
D.icon_url = lambda i: None
fails = 0
def ok(name, cond, extra=""):
    global fails
    print(("ok   " if cond else "FAIL ") + name + (" | " + str(extra) if extra != "" else ""))
    if not cond: fails += 1
tmp = tempfile.mkdtemp()
state, summ = os.path.join(tmp, "discord_deals.json"), os.path.join(tmp, "summary.json")
who = [{"name": "laclac", "sales": 500}, {"name": "zik", "sales": 500}]
def run(rd_by_item):
    rows = [{"item": i, "equip": True, "typ": 500000, "rd": rd} for i, rd in rd_by_item.items()]
    json.dump({"rows": rows, "who": who}, open(summ, "w"))
    D.job_deals(tmp, summ, state)
def rd(s, p, typ=600000, by="laclac"):
    return {"s": s, "p": p, "q": 1, "t": int(time.time()), "typ": typ, "n": 4, "who": ["zik"], "by": by, "grade": "+5 LUK", "g": 5}

# 1. three copies, three fast-lane runs 18 seconds apart
for p in (349999, 399999, 300000): run({"Emerald Earrings": [rd("LoNaim", p)]})
ok("one seller's copies of one item post once a day", len(sent) == 1, len(sent))
# 2. a reprice: 110K then 105K (no post), then 65K (posts)
sent.clear()
run({"Korean Fan": [rd("Chimte", 110000, 280000)]}); run({"Korean Fan": [rd("Chimte", 105000, 280000)]})
ok("a small price cut does not post again", len(sent) == 1, len(sent))
run({"Korean Fan": [rd("Chimte", 65000, 280000)]})
ok("a 25%+ price cut posts again", len(sent) == 2, len(sent))
# 3. item cap: six different sellers of one item in a day
sent.clear()
for k in range(6): run({"Blue Sauna Robe": [rd("seller%d" % k, 200000)]})
ok("no item posts more than ITEM_CAP times a day", len(sent) == D.ITEM_CAP, len(sent))
st = json.load(open(state))
ok("state keeps the repeat memory", "deals_last" in st and "deals_item" in st, sorted(st))
print(fails and "%d failed" % fails or "all passed"); sys.exit(1 if fails else 0)
