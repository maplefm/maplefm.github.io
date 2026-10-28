"""Build data/itemdb.json: a compact list of every MapleStory Classic World item from maplestory.io.

Each row is [name, id, required level, job bitmask, cash 0/1, kind, NPC sell price, base stats]. Base stats is a
small object for equips ({"ATT": 55, "ACC": 1, "SLOTS": 7}) and is left off when the data has none; the site
checks it against what hovers in the game show.
The NPC price is fetched per item for every non-Cash item (0 when unknown); the site shows it as the
vendor price and uses it to spot "spot holder" listings, like a Mushroom Spore put up for 50,000 just to hold a shop spot. Job bits: 1 warrior, 2 magician,
4 bowman, 8 thief, 16 pirate, 0 anyone. Kind is an index into "kinds" (overall category: sub category).
The price site uses it for icons, classes, levels and to tidy up names read off the screen.
"""
import json, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

URL = "https://maplestory.io/api/MCW/1/item"   # MapleStory Classic World: Classic names, ids and icons
JOBS = {"Warrior": 1, "Magician": 2, "Bowman": 4, "Thief": 8, "Pirate": 16}

req = urllib.request.Request(URL, headers={"User-Agent": "maplefm-itemdb"})
data = json.load(urllib.request.urlopen(req, timeout=120))
kinds, rows = [], []
for it in data:
    name = (it.get("name") or "").strip()
    if not name:
        continue
    ti = it.get("typeInfo") or {}
    k = (ti.get("overallCategory") or "") + ":" + (ti.get("subCategory") or "")
    if k not in kinds:
        kinds.append(k)
    m = 0
    for j in it.get("requiredJobs") or []:
        m |= JOBS.get(j, 0)
    rows.append([name, it["id"], it.get("requiredLevel") or 0, m, 1 if it.get("isCash") else 0, kinds.index(k), 0])

# the base stats an equip comes with. Classic's published data (MCW 1) leaves weapon attack out; the closed beta
# data (MCW CBT2) has it as incWAT. Both are read after MeowDB, beta first, for any stat still missing.
STATS = {"incWAT": "ATT", "incPAD": "ATT", "incMAD": "MATT", "incMAT": "MATT", "incPDD": "WDEF", "incWDD": "WDEF",
         "incMDD": "MDEF", "incSTR": "STR", "incDEX": "DEX", "incINT": "INT", "incLUK": "LUK", "incMHP": "HP",
         "incMMP": "MP", "incACC": "ACC", "incEVA": "AVOID", "incSpeed": "SPEED", "incJump": "JUMP", "tuc": "SLOTS"}
BETA = "https://maplestory.io/api/MCW/CBT2/item"


def _meta(url):
    for attempt in range(3):
        try:
            r = urllib.request.Request(url, headers={"User-Agent": "maplefm-itemdb"})
            return json.load(urllib.request.urlopen(r, timeout=30))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
        except Exception:
            continue
    return None


def npc_price(row):
    """NPC price and base stats, from the item's own page in both data sets."""
    j = _meta(URL + "/" + str(row[1])) or {}
    mi = j.get("metaInfo") or {}
    price = int(mi.get("price") or j.get("price") or 0)
    stats = dict(MEOWDB.get(int(row[1]), {}))
    if KINDS_EQUIP[row[5]]:
        b = (_meta(BETA + "/" + str(row[1])) or {}).get("metaInfo") or {}
        for src in (b, mi):
            for k, v in src.items():
                if k in STATS and isinstance(v, (int, float)) and v and STATS[k] not in stats:
                    stats[STATS[k]] = int(v)
        if not price:
            price = int(b.get("price") or 0)
    return price, stats

# MeowDB (meowdb.com, used with its owners' permission) keeps Classic's equip stats complete, weapon attack
# included, so it comes first; the two maplestory.io data sets fill in anything it doesn't have.
MEOW = "https://meowdb.com/msclassic/api/items?type=Equip&ossyria=1&sort=slot&limit=200&locale=en&page="
MEOWKEYS = {"watk": "ATT", "matk": "MATT", "wdef": "WDEF", "mdef": "MDEF", "str": "STR", "dex": "DEX", "int": "INT",
            "luk": "LUK", "hp": "HP", "mp": "MP", "acc": "ACC", "avoid": "AVOID", "speed": "SPEED", "jump": "JUMP", "slots": "SLOTS",
            # crit, knockback and attack speed show in the game's popup too (Emerald Earrings: Critical Damage +2)
            "critRate": "CRIT", "critDamage": "CRITDMG", "knockback": "KB", "attackSpeed": "ASPD"}


def meow_stats():
    out = {}
    try:
        for page in range(1, 40):
            r = urllib.request.Request(MEOW + str(page), headers={"User-Agent": "maplefm-itemdb (maplefm.github.io)"})
            j = json.load(urllib.request.urlopen(r, timeout=60))
            for it in j.get("items") or []:
                try:
                    st = json.loads(it.get("stats") or "{}")
                    out[int(it["iconKey"])] = {MEOWKEYS[k]: int(v) for k, v in st.items() if k in MEOWKEYS and isinstance(v, (int, float)) and v}
                except Exception:
                    continue
            if not j.get("hasMore"):
                break
    except Exception as e:
        print("MeowDB not reachable right now:", e)
    print(len(out), "equips from MeowDB")
    return out

MEOWDB = meow_stats()
KINDS_EQUIP = [k.startswith("Equip") for k in kinds]
want = [r for r in rows if not r[4]]          # every item that isn't Cash Shop: equips sell to NPCs too
with ThreadPoolExecutor(16) as ex:
    for r, (p, st) in zip(want, ex.map(npc_price, want)):
        r[6] = p
        if st: r.append(st)
print(sum(1 for r in want if r[6]), "of", len(want), "non-cash items have an NPC price")
eq = [r for r in want if KINDS_EQUIP[r[5]]]
print(len(eq), "equips,", sum(1 for r in eq if len(r) > 7), "with base stats,", sum(1 for r in eq if len(r) > 7 and ("ATT" in r[7] or "MATT" in r[7])), "with attack")
out = sys.argv[1] if len(sys.argv) > 1 else "data/itemdb.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump({"source": "maplestory.io MCW 1, MapleStory Classic World; equip stats from MeowDB (meowdb.com) with permission", "kinds": kinds, "items": rows}, f, separators=(",", ":"), ensure_ascii=False)
print(len(rows), "items,", len(kinds), "kinds")
