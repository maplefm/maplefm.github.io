"""Maps, travel and training data for maplefm.gg/map.html, rebuilt every day so new content shows up on its own.

Sources:
  1. The MapleStory Classic Wiki (mapleclassic.wiki, CC BY-NC-SA 4.0) through its Cargo tables: every released map,
     its portals (walking, hidden, doors), monster spawns, NPCs, shops and shop prices, plus the cab fares the wiki
     records in Module:Observed facts. The wiki only lists content that is in the live game, so a map shows up here
     the day the wiki adds it, and nothing that is only datamined.
  2. maplestory.io's copy of the Classic World game files (region MCW): monster stats, where monsters and NPCs stand,
     each map's size and its in-game minimap picture, and what each potion restores.

  python3 tools/world.py OUT_DIR [PREVIOUS_world.json]
writes OUT_DIR/world.json and OUT_DIR/minimap/<map id>.png. The previous file is used to date new maps and monsters
("new since ..."), and its changes are printed for the workflow to post.
"""
import sys, os, json, re, time, html, base64, urllib.request, urllib.parse, datetime

WIKI = "https://mapleclassic.wiki/api.php"
RAW = "https://mapleclassic.wiki/index.php?title=Module:Observed_facts&action=raw"
IO = "https://maplestory.io/api/MCW/1"
UA = {"User-Agent": "maplefm.gg world builder (+https://maplefm.gg)"}
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/world"
PREV = sys.argv[2] if len(sys.argv) > 2 else os.path.join(OUT, "world.json")
TODAY = datetime.date.today().isoformat()


def get(url, tries=3, raw=False):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                b = r.read()
                return b if raw else json.loads(b.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            time.sleep(2 + i * 3)
        except Exception:
            time.sleep(2 + i * 3)
    return None


def cargo(table, fields, where=None):
    out, off = [], 0
    while True:
        q = {"action": "cargoquery", "format": "json", "limit": 500, "offset": off, "tables": table, "fields": ",".join(fields)}
        if where: q["where"] = where
        j = get(WIKI + "?" + urllib.parse.urlencode(q))
        rows = (j or {}).get("cargoquery")
        if rows is None:
            print("cargo error", table, json.dumps(j)[:200]); return None
        out += [{k.replace(" ", "_"): (html.unescape(v) if isinstance(v, str) else v) for k, v in r["title"].items()} for r in rows]
        if len(rows) < 500: break
        off += 500; time.sleep(0.4)
    print(table, len(out))
    return out


def num(v, d=0):
    try: return int(float(v))
    except (TypeError, ValueError): return d


prev = {}
try: prev = json.load(open(PREV, encoding="utf-8"))
except Exception: pass

# ------------------------------------------------------------------ the wiki
maps = cargo("maps", ["_pageName=page", "id", "name_en", "region", "map_type", "recommended_level_min", "recommended_level_max", "nearest_town", "return_map", "game_version", "image", "origin_x", "origin_y", "render_width", "render_height"])
portals = cargo("portals", ["_pageName=src", "to_map", "portal_name", "direction", "portal_type", "requires_level", "x", "y"])
spawns = cargo("monster_spawns", ["monster_id", "map_id", "spawn_count", "respawn_seconds", "variant"])
mons = cargo("monsters", ["id", "name_en", "level", "hp", "mp", "exp", "weapon_attack", "magic_attack", "physical_defense", "magic_defense", "accuracy", "avoidability", "knockback", "element_weak", "element_resist", "boss", "undead", "variant"])
npcs = cargo("npcs", ["_pageName=page", "id", "name_en", "role", "map"])
shops = cargo("shops", ["_pageName=page", "npc", "map", "shop_type"])
shop_items = cargo("shop_items", ["shop_id", "item_id", "price"])
if not maps or not portals or not mons:
    sys.exit("the wiki didn't answer; keeping yesterday's map data")

# cab fares the wiki recorded in game
fares = {}
lua = get(RAW, raw=True)
if lua:
    for k, v in re.findall(r"(\w+)\s*=\s*function\(\)\s*return\s*(\d+)", lua.decode("utf-8", "ignore")):
        fares[k] = int(v)

# ------------------------------------------------------------------ the game files
io_list = get(IO + "/map") or []
io_ids = {m["id"] for m in io_list if isinstance(m, dict)}
os.makedirs(os.path.join(OUT, "minimap"), exist_ok=True)
io_mobs = {}
for m in get(IO + "/mob") or []:
    if isinstance(m, dict) and m.get("id") and m["id"] < 9000000:
        d = get(f"{IO}/mob/{m['id']}")
        if d and d.get("meta"): io_mobs[d["name"]] = dict(d["meta"], id=d["id"])
        time.sleep(0.1)

mob = {}
for w in mons:
    if not w.get("name_en") or w.get("variant"): continue
    nm = w["name_en"]; m = io_mobs.get(nm) or {}
    mob.setdefault(nm, {
        "id": num(w.get("id")) or m.get("id"), "lv": num(w.get("level")) or m.get("level", 0), "hp": num(w.get("hp")) or m.get("maxHP", 0),
        "exp": num(w.get("exp")) or m.get("exp", 0), "atk": num(w.get("weapon_attack")) or m.get("physicalDamage", 0),
        "matk": num(w.get("magic_attack")) or m.get("magicDamage", 0), "acc": num(w.get("accuracy")) or m.get("accuracy", 0),
        "eva": num(w.get("avoidability")) or m.get("evasion", 0), "wdef": num(w.get("physical_defense")) or m.get("physicalDefense", 0),
        "mdef": num(w.get("magic_defense")) or m.get("magicDefense", 0), "kb": num(w.get("knockback")),
        "weak": "" if (w.get("element_weak") or "None") == "None" else w["element_weak"],
        "resist": "" if (w.get("element_resist") or "None") == "None" else w["element_resist"],
        "undead": w.get("undead") == "1" or bool(m.get("isUndead")), "boss": w.get("boss") == "1",
    })

npc_by_page = {n["page"]: n for n in npcs}
npc_by_id = {num(n.get("id")): n for n in npcs if n.get("id")}

M = {}
for mp in maps:
    page = mp["page"]
    M[page] = {"id": num(mp.get("id")) or None, "name": mp.get("name_en") or page, "region": mp.get("region") or "",
               "type": mp.get("map_type") or "", "lv": [num(mp.get("recommended_level_min")) or None, num(mp.get("recommended_level_max")) or None],
               "near": mp.get("nearest_town") or "", "ret": mp.get("return_map") or "", "portals": [], "mobs": [], "npcs": [], "shops": []}
IMG = {mp["page"]: [mp.get("image") or "", num(mp.get("origin_x")), num(mp.get("origin_y")), num(mp.get("render_width")), num(mp.get("render_height"))] for mp in maps if mp.get("image")}
for p in portals:
    s, t = p.get("src"), p.get("to_map")
    if s in M and t:
        M[s]["portals"].append([t, p.get("portal_type") or "walking", num(p.get("x")), num(p.get("y")), p.get("portal_name") or "", num(p.get("requires_level")) or 0])
for s in spawns:
    if s.get("variant"): continue
    mpg, mn = s.get("map_id"), s.get("monster_id")
    if mpg in M and mn in mob:
        M[mpg]["mobs"].append([mn, num(s.get("spawn_count"))])
for sh in shops:
    if sh.get("map") in M: M[sh["map"]]["shops"].append(sh.get("npc") or sh["page"])

# map details from the game files: size, minimap, where monsters and NPCs stand
n_mm = 0
for page, m in M.items():
    if not m["id"] or m["id"] not in io_ids: continue
    d = get(f"{IO}/map/{m['id']}")
    time.sleep(0.12)
    if not d: continue
    vr = d.get("vrBounds") or {}
    m["w"], m["h"] = vr.get("width") or 0, vr.get("height") or 0
    m["town"] = bool(d.get("isTown"))
    mm = d.get("miniMap") or {}
    if mm.get("canvas"):
        png = base64.b64decode(mm["canvas"])
        path = os.path.join(OUT, "minimap", f"{m['id']}.png")
        if not os.path.exists(path) or open(path, "rb").read() != png:
            open(path, "wb").write(png)
        m["mm"] = [mm.get("centerX", 0), mm.get("centerY", 0), mm.get("magnification", 4), mm.get("width", 0), mm.get("height", 0)]
        n_mm += 1
    pos, seen = [], set()
    for x in d.get("mobs") or []:
        if not isinstance(x, dict) or x.get("hidden"): continue
        k = (x.get("id"), round((x.get("x") or 0) / 80), round((x.get("y") or 0) / 80))
        if k in seen: continue
        seen.add(k); pos.append([x.get("id"), x.get("x"), x.get("y")])
    m["mobpos"] = pos[:80]
    for x in d.get("npcs") or []:
        if not isinstance(x, dict) or x.get("hidden"): continue
        n = npc_by_id.get(x.get("id"))
        if n: m["npcs"].append([n.get("name_en") or n["page"], x.get("x"), x.get("y"), n.get("role") or ""])
# maps the game-file source doesn't have yet (new content): shrink the wiki's full map render into a stand-in minimap
OLD = os.path.dirname(os.path.abspath(PREV))
need = [p for p, m in M.items() if not m.get("mm") and IMG.get(p) and IMG[p][3] and IMG[p][4]]
urls = {}
for i in range(0, len(need), 40):
    j = get(WIKI + "?" + urllib.parse.urlencode({"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url", "titles": "|".join("File:" + IMG[p][0] for p in need[i:i + 40])}))
    for pg in ((j or {}).get("query") or {}).get("pages", {}).values():
        if pg.get("imageinfo"): urls[pg["title"][5:].replace("_", " ")] = pg["imageinfo"][0]["url"]
try:
    from PIL import Image
    import io as _io
except Exception:
    Image = None
for p in need:
    m, (img, ox, oy, rw, rh) = M[p], IMG[p]
    path = os.path.join(OUT, "minimap", f"{m['id']}.png"); old = os.path.join(OLD, "minimap", f"{m['id']}.png")
    if not os.path.exists(path) and os.path.exists(old) and prev.get("maps", {}).get(p, {}).get("mm", [0, 0, 0])[2] == 3:
        open(path, "wb").write(open(old, "rb").read())
    if not os.path.exists(path):
        if not Image or img.replace("_", " ") not in urls: continue
        try:
            raw = urllib.request.urlopen(urllib.request.Request(urls[img.replace("_", " ")], headers=UA), timeout=60).read()
            im = Image.open(_io.BytesIO(raw)).convert("RGB"); im = im.resize((max(1, rw // 8), max(1, rh // 8)), Image.LANCZOS); im.save(path, optimize=True)
        except Exception as e:
            print("map render", p, e); continue
    m["mm"] = [ox, oy, 3, rw, rh]; m["w"], m["h"] = rw, rh; n_mm += 1
print("maps", len(M), "minimaps", n_mm)
mob_id_name = {v["id"]: k for k, v in mob.items() if v.get("id")}

# ------------------------------------------------------------------ travel: cabs and return scrolls
F = lambda k, d=0: fares.get(k, d)
mult = F("regularCabLevel20Multiplier", 2)
cabs = []   # [from town, to town, fare below 20, fare from 20]
for town, key in (("Henesys", "henesysCab"), ("Kerning City", "kerningCityCab"), ("Perion", "perionCab")):
    for dest, dk in (("Lith Harbor", "LithHarbor"), ("Perion", "Perion"), ("Ellinia", "Ellinia"), ("Kerning City", "KerningCity"), ("Henesys", "Henesys")):
        f = F(key + dk + "Fare")
        if f and dest != town: cabs.append([town, dest, f, f * mult])
    sw = F(key + "SleepywoodFare")
    if sw: cabs.append([town, "Sleepywood", sw, sw])
# Ellinia's cab isn't recorded yet: fares are the same both ways on every recorded pair, so use the reverse trips
have = {(a, b) for a, b, _, _ in cabs}
for a, b, f1, f2 in list(cabs):
    if b == "Ellinia" and ("Ellinia", a) not in have: cabs.append(["Ellinia", a, f1, f2])
if F("sleepywoodCabFare"):
    for dest in ("Henesys", "Ellinia", "Perion", "Kerning City"): cabs.append(["Sleepywood", dest, F("sleepywoodCabFare"), F("sleepywoodCabFare")])
for dest, dk in (("Perion", "philPerionFare"), ("Ellinia", "philElliniaFare"), ("Henesys", "philHenesysFare"), ("Kerning City", "philKerningCityFare")):
    if F(dk): cabs.append(["Lith Harbor", dest, F(dk) // max(1, F("philLevel10To19Divisor", 2)), F(dk)])
if ("Ellinia", "Lith Harbor") not in {(a, b) for a, b, _, _ in cabs} and F("philElliniaFare"):
    cabs.append(["Ellinia", "Lith Harbor", F("philElliniaFare") // 2, F("philElliniaFare")])
# NPC rides that aren't cabs: Pason in Lith Harbor sails to Florina Beach and Pison brings you back (fare from the wiki's Pason page)
boats = [["Lith Harbor", "Florina Beach", 1500, "Pason"], ["Florina Beach", "Lith Harbor", 0, "Pison"]]
vip = [[t, "Ant Tunnel Park", F("vipCabFare", 10000), F("vipCabFare", 10000)] for t in ("Ellinia", "Lith Harbor") if F("vipCabFare")]
scrolls = {}
for s in shop_items:
    it = s.get("item_id") or ""
    if it.startswith("Return Scroll"):
        to = "nearest" if "Nearest" in it else it.replace("Return Scroll to ", "")
        p = num(s.get("price"))
        if p and (to not in scrolls or p < scrolls[to]["price"]): scrolls[to] = {"item": it, "price": p}

# ------------------------------------------------------------------ potions: what they restore, what the NPCs charge, where
POTS = ["Red Potion", "Orange Potion", "White Potion", "Blue Potion", "Elixir", "Mana Elixir", "Power Elixir", "Pure Water", "Meat", "Lemon",
        "Orange", "Apple", "Egg", "Fried Chicken", "Salad", "Pizza", "Hamburger", "Cake", "Unagi", "Watermelon", "Ice Cream Pop"]
itemdb = get("https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/itemdb.json") or {}
ids = {}
for r in itemdb.get("items", []):
    if r[0] in POTS and r[0] not in ids: ids[r[0]] = r[1]
pots = {}
for n in POTS:
    i = ids.get(n); d = get(f"{IO}/item/{i}/name") if i else None
    desc = (d or {}).get("description", "") if isinstance(d, dict) else ""
    hp = re.search(r"([\d,]+)\s*(%\s*of your\s*)?HP", desc); mp = re.search(r"([\d,]+)\s*(%\s*of your\s*)?MP", desc)
    both = re.search(r"([\d,]+)(%)?\s*(?:of your\s*)?HP and MP", desc)
    e = {"id": i}
    if both: e["hp"] = e["mp"] = int(both.group(1).replace(",", "")); e["pct"] = bool(both.group(2))
    else:
        if hp: e["hp"] = int(hp.group(1).replace(",", "")); e["pct"] = bool(hp.group(2))
        if mp: e["mp"] = int(mp.group(1).replace(",", "")); e["pct"] = e.get("pct") or bool(mp.group(2))
    sold = [(num(s.get("price")), s.get("shop_id")) for s in shop_items if s.get("item_id") == n and num(s.get("price"))]
    if sold:
        e["npc"] = min(p for p, _ in sold)
        e["where"] = sorted({(npc_by_page.get(sh) or {}).get("map") or sh for _, sh in sold if sh})[:12]
    if e.get("hp") or e.get("mp"): pots[n] = e
    time.sleep(0.1)

# ------------------------------------------------------------------ what changed since yesterday
first = {k: v for k, v in (prev.get("first") or {}).items()}
for page in M: first.setdefault("map:" + page, TODAY)
for name in mob: first.setdefault("mob:" + name, TODAY)
new_maps = [p for p in M if prev.get("maps") and p not in prev["maps"]]
new_mobs = [n for n in mob if prev.get("mobs") and n not in prev["mobs"]]
for page, m in M.items(): m["since"] = first.get("map:" + page)
unreleased = sorted(m["name"] for m in io_list if isinstance(m, dict) and m.get("id") not in {v["id"] for v in M.values()})

# monster sprites, hosted with the data so the page doesn't wait on the sprite renderer
os.makedirs(os.path.join(OUT, "sprite"), exist_ok=True)
for name, mb in mob.items():
    if not mb.get("id"): continue
    path = os.path.join(OUT, "sprite", f"{mb['id']}.gif"); old = os.path.join(OLD, "sprite", f"{mb['id']}.gif")
    if os.path.exists(old): open(path, "wb").write(open(old, "rb").read()); continue
    try:
        raw = urllib.request.urlopen(urllib.request.Request(f"{IO}/mob/{mb['id']}/render/stand", headers=UA), timeout=60).read()
        if raw[:3] == b"GIF": open(path, "wb").write(raw)
    except Exception as e:
        print("sprite", name, e)
    time.sleep(0.2)
    if not os.path.exists(path) and Image:
        # new monsters aren't in the sprite renderer yet: use the wiki's picture
        j = get(WIKI + "?" + urllib.parse.urlencode({"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url", "titles": f"File:{name}.png"}))
        for pg in ((j or {}).get("query") or {}).get("pages", {}).values():
            if not pg.get("imageinfo"): continue
            try:
                raw = urllib.request.urlopen(urllib.request.Request(pg["imageinfo"][0]["url"], headers=UA), timeout=60).read()
                im = Image.open(_io.BytesIO(raw)).convert("RGBA"); im.thumbnail((120, 120))
                im.save(path, format="PNG")   # served under the same name; browsers read the PNG inside
            except Exception as e:
                print("wiki sprite", name, e)
out = {"at": int(time.time()), "built": TODAY, "maps": M, "mobs": mob, "cabs": cabs, "vip": vip, "boats": boats, "scrolls": scrolls, "pots": pots,
       "first": first, "unreleased": len(unreleased),
       "credit": "Maps, portals, spawns and shops: MapleStory Classic Wiki (CC BY-NC-SA 4.0). Minimaps, monster stats and sprites: Classic World game files via maplestory.io."}
json.dump(out, open(os.path.join(OUT, "world.json"), "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
json.dump({"new_maps": new_maps, "new_mobs": new_mobs, "unreleased": len(unreleased)}, open(os.path.join(OUT, "world_changes.json"), "w"))
print("new maps", new_maps[:10], "new monsters", new_mobs[:10], "in game files but not released:", len(unreleased))
