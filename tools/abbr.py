"""Build the search shortcuts.
  python tools/abbr.py [path/to/FMWatcher] [path/to/summary-public.json]

Two outputs:
1. data/abbr.json: everything people might type, for the site search, the items list and the Discord bot. Keys are
   squashed (lowercase, letters and digits only). Google never reads this file as a page.
2. data/nick.json: the few real nicknames each item page shows ("Also called ..."). Only names players actually use:
   tools/abbr_curated.json, the watcher's trade chat aliases, and searches people made on Google. Never typos,
   never generated codes, never a name that only drops a letter or a word of the real one.

Sources, strongest first:
1. tools/abbr_curated.json          real shorthand, checked by hand (shown on pages)
2. tools/abbr_searched.json         what people typed on Google to reach us, from Search Console (shown on pages)
3. FMWatcher items.json aliases     trade chat shorthand the watcher reads (shown on pages when not a typo)
4. tools/abbr_typos.json            misspellings people make (search only)
5. generated                        scroll codes, word swaps, plurals, common misspellings (search only)
A generated key never replaces a real one, never equals another item's own name or the initials of a traded item,
and a key two generated items both want goes to neither.
"""
import json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)


def norm(s): return re.sub(r"[^a-z0-9]+", "", s.lower())


ITEMS = [r[0] for r in json.load(open(os.path.join(ROOT, "data/itemdb.json")))["items"]]
db = {n.lower(): n for n in ITEMS}
bases = {re.sub(r": \w+$", "", n).lower(): re.sub(r": \w+$", "", n) for n in ITEMS if re.search(r"Scroll: \w+$", n)}
NAMEKEY = {}                                   # squashed item name -> item, to stop a shortcut stealing another item's name
for n in list(db.values()) + list(bases.values()):
    NAMEKEY.setdefault(norm(n), n)

NEAR = {}                                      # every item name with one letter dropped: "cupid bow" is one letter off Cupid's Bow
for nk0, n in NAMEKEY.items():
    if len(nk0) < 6: continue
    for i in range(len(nk0) + 1):
        NEAR.setdefault(nk0[:i] + nk0[i + 1:], set()).add(n)


PREFIX = {}                                    # how many item names start with each squashed prefix
for nk0 in NAMEKEY:
    for i in range(2, min(len(nk0), 12) + 1): PREFIX[nk0[:i]] = PREFIX.get(nk0[:i], 0) + 1


def near_other(nk, item):
    if len(nk) < 6: return None
    for v in [nk] + [nk[:i] + nk[i + 1:] for i in range(len(nk))]:
        for n in NEAR.get(v, ()):
            if n != item: return n
    return None


w = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), "watcher")
spath = sys.argv[2] if len(sys.argv) > 2 else ""
try:
    summ = json.load(open(spath)) if spath else json.loads(subprocess.run(["git", "-C", ROOT, "show", "origin/live:data/summary-public.json"], capture_output=True, text=True).stdout)
except Exception:
    summ = {}
TRADED = {}                                   # item -> sales seen, for picking which items get generated forms
for r in summ.get("rows") or []:
    if isinstance(r, dict) and r.get("item"):
        b = re.sub(r": \w+$", "", r["item"])
        TRADED[b] = max(TRADED.get(b, 0), (r.get("salesN") or 0) + (r.get("n") or 0))
SSTOP = {"of", "the", "a", "for", "scroll"}
INITIALS = {}                                  # initials of traded items: the site search matches these on its own
for n in TRADED:
    ini = "".join(x[0] for x in re.split(r"[^a-z0-9]+", n.lower()) if x and x not in SSTOP)
    if len(ini) >= 2: INITIALS.setdefault(ini, n)

out, src, show, report = {}, {}, {}, {"skipped": [], "clash": [], "name_taken": []}
RANK = {"curated": 0, "searched": 1, "chat": 2, "typo": 3, "gen": 4}


def lev(a, b):
    p = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        c = [i]
        for j, cb in enumerate(b, 1): c.append(min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (ca != cb)))
        p = c
    return p[-1]


def brings_new_word(k, item, short_counts=False):
    """True when k has a word the item's own name doesn't: "gfa", "cloak", "elixer". False for "kumbi star" or "att gloves",
    which the site search already finds from the name's own words."""
    nw = [x for x in re.split(r"[^a-z0-9]+", item.lower().replace("'", "")) if x]
    def same(t):
        for x in nw:
            if t == x or t.rstrip("s") == x.rstrip("s"): return True
            if (x.startswith(t) or t.startswith(x)) and not (short_counts and len(t) <= 4 and len(x) >= len(t) + 2): return True
            if len(t) >= 5 and len(x) >= 5 and lev(t, x) <= (1 if len(x) < 7 else 2): return True
        return False
    return any(not same(t) for t in re.split(r"[^a-z0-9]+", k.lower().replace("'", "")) if t)


def target(v):
    return db.get(v.lower()) or bases.get(v.lower())


def add(k, v, how, display=False):
    v2 = target(v)
    if not v2: report["skipped"].append((k, v)); return
    nk = norm(k)
    if len(nk) < 2 or nk == norm(v2): return
    owner = NAMEKEY.get(nk)
    if owner and owner != v2:                  # "angel wings" is its own item, not a nickname for Baby Angel Wings
        report["name_taken"].append((k, v2, owner)); return
    if how != "curated" and PREFIX.get(nk, 0) >= 3:   # "oranges" or "rising" is how people start typing other items too
        report["name_taken"].append((k, v2, f"{PREFIX[nk]} names start with it")); return
    near = near_other(nk, v2)
    if near and how not in ("curated",):      # "cupid bow" is a letter off Cupid's Bow, a different item
        report["name_taken"].append((k, v2, near)); return
    if how == "gen" and INITIALS.get(nk) not in (None, v2): return
    if how == "gen" and " " in k.strip() and not brings_new_word(k, v2): return     # the search finds these from the name already
    if nk in out:
        if out[nk] == v2:
            if RANK[how] < RANK[src[nk]]: src[nk] = how
        elif RANK[how] < RANK[src[nk]]:
            out[nk], src[nk] = v2, how
        elif how == "gen" and src[nk] == "gen":
            report["clash"].append((k, out[nk], v2)); out[nk] = None
        if not display: return
    else:
        out[nk], src[nk] = v2, how
    if display and out.get(nk) == v2: show.setdefault(v2, []).append(k.strip())


# 1-3: real names, shown on pages
for k, v in json.load(open(os.path.join(HERE, "abbr_curated.json"))).items():
    if not k.startswith("_"): add(k, v, "curated", True)
try:
    for k, v in json.load(open(os.path.join(HERE, "abbr_searched.json"))).items():
        if not k.startswith("_"): add(k, v, "searched", True)
except OSError:
    pass
try:
    for canon, al in json.load(open(os.path.join(w, "items.json")))["aliases"].items():
        for a in al: add(a, canon, "chat", True)
    for a, canon in json.load(open(os.path.join(w, "chat_names.json"))).get("abbr", {}).items(): add(a, canon, "chat", True)
except OSError:
    pass
# 4: misspellings people make, search only
try:
    for k, v in json.load(open(os.path.join(HERE, "abbr_typos.json"))).items():
        if not k.startswith("_"): add(k, v, "typo")
except OSError:
    pass

# 5: generated, search only
SLOT = {"Gloves": ["g", "glove", "gloves", "glv"], "Earring": ["e", "earring", "earrings", "ear", "earing", "ering"],
        "Cape": ["c", "cape", "cloak"], "Hat": ["h", "hat", "helm", "helmet"], "Topwear": ["t", "top", "topwear", "shirt"],
        "Bottomwear": ["b", "bot", "bottom", "bottoms", "bottomwear", "pants"], "Overall Armor": ["o", "oa", "overall", "ovr"],
        "Shoes": ["s", "shoe", "shoes", "boots"], "Shield": ["sh", "shield"], "Pet Equip": ["p", "pet", "pet equip"],
        "Claw": ["c", "claw"], "Bow": ["b", "bow"], "Crossbow": ["x", "xbow", "cbow", "crossbow"], "Dagger": ["d", "dagger"],
        "Spear": ["sp", "spear"], "Polearm": ["pa", "pole", "polearm", "pole arm"], "Wand": ["w", "wand"], "Staff": ["st", "staff"],
        "One-Handed Sword": ["1hs", "ohs", "1h sword", "one handed sword", "1hsw"], "One-Handed Axe": ["1ha", "oha", "1h axe", "one handed axe"],
        "One-Handed Blunt Weapon": ["1hbw", "ohbw", "1h bw", "1h blunt", "1h mace", "one handed blunt", "1hm"],
        "Two-handed Sword": ["2hs", "ths", "2h sword", "two handed sword"], "Two-handed Axe": ["2ha", "tha", "2h axe", "two handed axe"],
        "Two-handed Blunt Weapon": ["2hbw", "thbw", "2h bw", "2h blunt", "2h mace", "two handed blunt", "2hm"]}
STAT = {"Attack": ["att", "atk", "attack", "watk", "wa", "attk"], "Magic Attack": ["matk", "matt", "magic att", "magic attack", "ma", "m att"],
        "STR": ["str", "strength"], "DEX": ["dex", "dexterity"], "INT": ["int", "intelligence"], "LUK": ["luk", "luck"],
        "Accuracy": ["acc", "accuracy", "accu"], "DEF": ["def", "wdef", "w def"], "HP": ["hp"], "MP": ["mp"],
        "Evasion": ["avoid", "avoidability", "eva", "evasion", "avo"], "Speed": ["speed", "spd"], "Jump": ["jump", "jmp"],
        "Crit. Damage": ["crit dmg", "crit damage", "cdmg", "critdmg"], "Crit. Rate": ["crit", "crit rate", "critrate"],
        "Magic Def.": ["mdef", "m def", "magic def"], "Weapon Def.": ["wdef", "w def", "weapon def"]}
FOR = {"Attack": ["a"], "Magic Attack": ["ma", "m"]}
for base in sorted(bases.values()):
    m = re.match(r"^(.*?) (Attack|Magic Attack|STR|DEX|INT|LUK|Accuracy|DEF|HP|MP|Evasion|Speed|Jump|Crit\. Damage|Crit\. Rate|Magic Def\.|Weapon Def\.) Scroll$", base)
    if not m or m.group(1) not in SLOT: continue
    slot, stat = m.group(1), m.group(2)
    for s in SLOT[slot]:
        for t in STAT[stat]:
            if len(s) == 1 and len(t) < 2: continue
            # "att 1h sword" would read as a +1 ATT roll on "h sword", so stat-first only when the slot doesn't start with a number
            fs = (f"{s} {t}", f"{s} for {t}", f"{s} {t} scroll", f"{s} scroll {t}") + (() if s[0].isdigit() else (f"{t} {s}", f"{t} {s} scroll"))
            for k in fs:
                add(k, base, "gen")
        for f in FOR.get(stat, []):
            if len(s) <= 2: add(f"{s}f{f}", base, "gen")
            add(f"{s} for {f}", base, "gen")

# whole items people trade: plurals, word swaps and the misspellings that come up most, one change at a time
WORD = {"earrings": ["earings", "earing", "erring"], "earring": ["earing", "ering"], "elixir": ["elixer", "elixar", "elix"],
        "necklace": ["neclace", "necklase", "neckless"], "pendant": ["pendent", "pendat"], "throwing": ["throwin", "throw"],
        "stars": ["star", "starz"], "knives": ["knifes", "knife", "knive"], "shield": ["sheild", "shild"], "sword": ["sowrd", "swrd"],
        "potion": ["pot", "potoin", "poition"], "coupon": ["coupn", "cupon", "coupons"], "mushroom": ["mushrom", "shroom", "mush"],
        "gloves": ["glove", "gloove"], "glove": ["gloves"], "boots": ["boot"], "shoes": ["shoe"], "pants": ["pant"], "ring": ["rings"],
        "accuracy": ["acc"], "attack": ["att", "atk"], "helmet": ["helm", "hat"], "hat": ["helm"], "cape": ["cloak"], "ore": ["ores"],
        "ingot": ["ingots", "bar"], "plate": ["plates"], "skin": ["skins"], "crossbow": ["xbow"], "polearm": ["pole arm"],
        "wand": ["wnd"], "staff": ["stuff"], "claw": ["claws"], "dagger": ["daggar"], "palette": ["pallet", "pallete", "palete"],
        "exchange": ["exhange", "exchang"], "beanie": ["beany", "beenie"], "camping": ["campin"], "chocolate": ["choco", "chocolat"],
        "scepter": ["sceptre", "septer"], "fondue": ["fondu"], "selective": ["select", "selection"], "mystery": ["mistery", "mystry"],
        "sunglasses": ["sunglass", "shades"], "glasses": ["glass"], "costume": ["costum"], "jacket": ["jaket"], "overall": ["overal"]}


def forms(name):
    """A few ways people write a name: without "the" or "of", singular or plural, one word misspelled or swapped."""
    low = name.lower().replace("'", "")
    ws = re.split(r"[\s\-:]+", low)
    res = {" ".join(x for x in ws if x not in ("of", "the", "a"))}
    if ws[-1].endswith("s") and len(ws[-1]) > 3: res.add(" ".join(ws[:-1] + [ws[-1][:-1]]))
    elif not ws[-1].endswith("s"): res.add(" ".join(ws[:-1] + [ws[-1] + "s"]))
    for i, x in enumerate(ws):
        for alt in WORD.get(x, []):
            res.add(" ".join(ws[:i] + [alt] + ws[i + 1:]))
    if "throwing" in ws: res.add(" ".join(x for x in ws if x != "throwing"))
    if len(ws) >= 3 and ws[1] == "throwing": res.add(ws[0])
    return res


gen_items = 0
for name, seen in sorted(TRADED.items(), key=lambda x: -x[1]):
    if name not in db.values() and name not in bases.values(): continue
    if name in bases.values(): continue                         # scrolls are covered above
    gen_items += 1
    for f in forms(name): add(f, name, "gen")

out = {k: v for k, v in out.items() if v}
json.dump(dict(sorted(out.items())), open(os.path.join(ROOT, "data/abbr.json"), "w"), indent=0, ensure_ascii=False, separators=(",", ":"))


# page nicknames: readable, real, and not just the name with a letter or word dropped
TYPO_WORDS = {a for alts in WORD.values() for a in alts if a not in WORD and len(a) > 3 and a not in
              ("star", "knife", "boot", "shoe", "pant", "rings", "glove", "gloves", "helm", "cloak", "ores", "ingots", "plates",
               "skins", "claws", "coupons", "shades", "glass", "select", "selection", "choco", "throw", "mush", "shroom")}
TYPO_WORDS |= {"earing", "earings", "pallet", "pallets", "pallete", "stix", "tounge", "skul"}


def worth_showing(k, item):
    nk, nn = norm(k), norm(item)
    if nn in nk: return False                                   # the whole name with more added
    if lev(nk, nn) <= max(2, len(nn) // 5): return False         # "pen lid", "cherubs bow"
    if src.get(nk) not in ("curated", "searched", "chat") or out.get(nk) != item: return False
    if any(x in TYPO_WORDS for x in re.split(r"[^a-z0-9]+", k.lower())): return False
    # a nickname has to bring a word the name doesn't have: "earrings DEX" or "pallets" is only the name again
    return brings_new_word(k, item, short_counts=True)       # "red pot" counts: Google doesn't read pot as potion


def pretty(k):
    k = re.sub(r"\s+", " ", k.strip())
    if re.fullmatch(r"[a-z0-9]{2,4}", k) or (re.fullmatch(r"[a-z0-9]{5}", k) and not k.endswith("s")): return k.upper()
    return " ".join(x.upper() if x in ("str", "dex", "int", "luk", "acc", "hp", "mp", "def", "att", "matk", "atk") else x for x in k.split(" "))


nick = {}
for item, ks in show.items():
    seen, keep = set(), []
    for k in sorted(ks, key=lambda k: (RANK[src.get(norm(k), "gen")], len(k))):
        if not worth_showing(k, item): continue
        p = pretty(k)
        sq = norm(p).rstrip("s")                                   # "kitty ring" and "kitty rings" are one nickname
        if sq in seen: continue
        seen.add(sq); keep.append(p)
    if keep: nick[item] = keep[:3]
json.dump(dict(sorted(nick.items())), open(os.path.join(ROOT, "data/nick.json"), "w"), indent=1, ensure_ascii=False)

by = {}
for k in out: by[src[k]] = by.get(src[k], 0) + 1
print(len(out), "search shortcuts", by, "|", gen_items, "traded items with generated forms |", len(nick), "items with page nicknames")
print("not items:", report["skipped"][:20])
print("dropped, another item's name:", report["name_taken"][:30])
print("generated clashes dropped:", len(report["clash"]), report["clash"][:15])
