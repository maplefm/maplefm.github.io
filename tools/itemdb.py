"""Build data/itemdb.json: a compact list of every MapleStory Classic World item from maplestory.io.

Each row is [name, id, required level, job bitmask, cash 0/1, kind, NPC sell price, base stats]. Base stats is a
small object for equips ({"ATT": 55, "ACC": 1, "SLOTS": 7}) and is left off when the data has none; the site
checks it against what hovers in the game show.
The NPC price is fetched per item for every non-Cash item (0 when unknown); the site shows it as the
vendor price and uses it to spot "spot holder" listings, like a Mushroom Spore put up for 50,000 just to hold a shop spot. Job bits: 1 warrior, 2 magician,
4 bowman, 8 thief, 16 pirate, 0 anyone. Kind is an index into "kinds" (overall category: sub category).
The price site uses it for icons, classes, levels and to tidy up names read off the screen.
"""
import json, os, sys, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import mcwver
from concurrent.futures import ThreadPoolExecutor

URL = mcwver.base() + "/item"   # MapleStory Classic World: Classic names, ids and icons (newest data set)
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


# Items the game has that maplestory.io doesn't yet (Nov 18 2026: v2.0 added weapons, event items and furniture, and
# maplestory.io stayed on the old files). MeowDB, used with its owners' permission for items, reads the new client
# sooner. Only non-Cash items with a game id maplestory.io lacks are added; names MeowDB labels "(Alt)" are its own
# tags, never seen in game, so they are left out. Kind and class come from items both sources share.
def meow_new(rows, kinds):
    have = {int(r[1]) for r in rows}
    allit = []
    try:
        for page in range(1, 80):
            r = urllib.request.Request("https://meowdb.com/msclassic/api/items?locale=en&limit=200&page=" + str(page), headers={"User-Agent": "maplefm-itemdb (maplefm.github.io)"})
            j = json.load(urllib.request.urlopen(r, timeout=60))
            allit += j.get("items") or []
            if not j.get("hasMore"): break
    except Exception as e:
        print("MeowDB item list not reachable right now:", e)
        return []
    byid = {int(r[1]): r for r in rows}
    # kind: what the shared items of the same MeowDB type and subtype are filed as, within the same game id block
    # (ids group by kind: 4000xxx monster drops, 4031xxx quest items), else across the type when they all agree
    votes, wide = {}, {}
    for it in allit:
        try: gid = int(it.get("iconKey"))
        except (TypeError, ValueError): continue
        if gid in byid and not byid[gid][4]:
            t = (it.get("type"), it.get("subtype"))
            for d, key in ((votes, t + (gid // 1000,)), (votes, t + (gid // 10000,)), (wide, t)):
                d.setdefault(key, {}).setdefault(byid[gid][5], 0); d[key][byid[gid][5]] += 1
    def pick(v, need):
        if not v: return None
        k, n = max(v.items(), key=lambda x: x[1])
        return k if n >= need and n >= 0.9 * sum(v.values()) else None
    names = {r[0] for r in rows}
    added = []
    for it in allit:
        try: gid = int(it.get("iconKey"))
        except (TypeError, ValueError): continue
        name = (it.get("name") or "").strip()
        # "(Alt)", "(Thief)" and the like are MeowDB's own labels for items that share a name; the screen never shows them
        if gid in have or not name or "(" in name or "Cash" in (it.get("type") or ""): continue
        # a new id under a name we already have (v2.0's account-only Citizenship scrolls) is never the one players
        # sell; the tradeable item keeps the name and its prices
        if name in names: continue
        t = (it.get("type"), it.get("subtype"))
        kind = pick(votes.get(t + (gid // 1000,)), 2)
        if kind is None: kind = pick(votes.get(t + (gid // 10000,)), 3)
        if kind is None: kind = pick(wide.get(t), 5)
        if kind is None: continue
        try: st = json.loads(it.get("stats") or "{}")
        except ValueError: st = {}
        eq = kinds[kind].startswith("Equip")
        job = 0
        for j in str(st.get("reqJob") or "").replace(",", "/").split("/"):
            job |= JOBS.get({"Mage": "Magician"}.get(j.strip(), j.strip()), 0)
        row = [name, gid, int(it.get("levelReq") or 0) if eq else 0, job, 0, kind, int(st.get("price") or 0)]
        bs = {MEOWKEYS[k]: int(x) for k, x in st.items() if k in MEOWKEYS and isinstance(x, (int, float)) and x}
        if bs and eq: row.append(bs)
        rows.append(row); have.add(gid); names.add(name); added.append(name)
    print(len(added), "items from MeowDB that maplestory.io doesn't have yet:", added[:30])
    return added


MEOW_ADDED = meow_new(rows, kinds)
out = sys.argv[1] if len(sys.argv) > 1 else "data/itemdb.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump({"source": "maplestory.io MCW 1, MapleStory Classic World", "kinds": kinds, "items": rows}, f, separators=(",", ":"), ensure_ascii=False)
print(len(rows), "items,", len(kinds), "kinds")
