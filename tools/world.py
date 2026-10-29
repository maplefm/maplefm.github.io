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
mons = cargo("monsters", ["_pageName=page", "id", "name_en", "level", "hp", "mp", "exp", "weapon_attack", "magic_attack", "physical_defense", "magic_defense", "accuracy", "avoidability", "knockback", "element_weak", "element_resist", "boss", "undead", "variant", "variant_label"])
# mesos a kill, measured by the wiki's editors (kills counted, mesos seen): the item "Meso" in monster_drops
meso_rows = cargo("monster_drops", ["monster_id", "drop_rate", "min_quantity", "max_quantity", "sample_kills"], 'item_id="Meso"') or []
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
io_mobs = {}   # by game id: names repeat (a job test or party quest copy shares its name with the real monster)
for m in get(IO + "/mob") or []:
    if isinstance(m, dict) and m.get("id") and m["id"] < 9000000:
        d = get(f"{IO}/mob/{m['id']}")
        if d and d.get("meta"): io_mobs[d["id"]] = dict(d["meta"], id=d["id"])
        time.sleep(0.1)


def val(v):
    """the wiki's number, or None when the wiki left it empty: 0 is a value, not a gap"""
    if v is None or (isinstance(v, str) and not v.strip()): return None
    try: return int(float(v))
    except (TypeError, ValueError): return None


def first(*vs):
    for v in vs:
        if v is not None: return v
    return 0


def elem(w, field):
    v = w.get(field) or ""
    return "" if v in ("", "None") else v


# monster stats: the game files first (looked up by id), the wiki where the game files don't have the monster yet.
# Variants (a party quest or 2nd job test copy of a monster) keep their own stats under "Name (label)" and are only
# placed on the maps where they spawn; they are flagged "variant" so training math leaves them out.
mob, var_key = {}, {}
for w in mons:
    nm = w.get("name_en"); wid = val(w.get("id"))
    if not nm or not wid or (w.get("page") or "").startswith("Module:"): continue   # skip rows that aren't monsters
    g = io_mobs.get(wid) or {}
    key = nm
    if w.get("variant"):
        key = f"{nm} ({w.get('variant_label') or w['variant']})"
        var_key[(nm, w["variant"])] = key
    if key in mob: continue
    mob[key] = {
        "id": wid, "lv": first(g.get("level"), val(w.get("level"))), "hp": first(g.get("maxHP"), val(w.get("hp"))),
        "exp": first(g.get("exp"), val(w.get("exp"))), "atk": first(g.get("physicalDamage"), val(w.get("weapon_attack"))),
        "matk": first(g.get("magicDamage"), val(w.get("magic_attack"))), "acc": first(g.get("accuracy"), val(w.get("accuracy"))),
        "eva": first(g.get("evasion"), val(w.get("avoidability"))), "wdef": first(g.get("physicalDefense"), val(w.get("physical_defense"))),
        "mdef": first(g.get("magicDefense"), val(w.get("magic_defense"))), "kb": first(g.get("minimumPushDamage"), val(w.get("knockback"))),
        "weak": elem(w, "element_weak"), "resist": elem(w, "element_resist"),
        # the game files' element code: a letter (F fire, I ice, L lightning, S poison, H holy) then 1 immune, 2 resists, 3 weak
        "elem": str(g.get("elementalAttributes") or ""),
        "undead": bool(g["isUndead"]) if "isUndead" in g else w.get("undead") == "1",
        "boss": bool(g["isBoss"]) if "isBoss" in g else w.get("boss") == "1",
    }
    if w.get("variant"): mob[key].update(variant=w["variant"], base=nm)

# mesos a kill: [min, max, chance %, source]. The wiki's measured range first; tools/mesos_reported.json (player reports)
# only for monsters the wiki hasn't measured yet. Neither: no entry, and pages fall back to the level estimate.
for r in meso_rows:
    n = r.get("monster_id")
    lo, hi = val(r.get("min_quantity")), val(r.get("max_quantity"))
    if n in mob and lo is not None and hi is not None:
        rate = r.get("drop_rate")
        mob[n]["meso"] = [lo, hi, round(float(rate)) if rate not in (None, "") else None, "wiki", val(r.get("sample_kills"))]
try:
    rep = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "mesos_reported.json"), encoding="utf-8"))
    rep = rep.get("mobs", rep)
except Exception:
    rep = {}
for n, v in rep.items():
    if n in mob and "meso" not in mob[n] and isinstance(v, list) and len(v) >= 2:
        mob[n]["meso"] = [v[0], v[1], v[2] if len(v) > 2 else None, "reported", None]

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
# spawns: "groups" keeps every wiki spawn row [monster, count, respawn seconds or None]; "mobs" adds the groups up per
# monster; "respawn" is each monster's timer where the wiki records one; variant spawns go to "vmobs" only.
for s in spawns:
    mpg, mn = s.get("map_id"), s.get("monster_id")
    if mpg not in M: continue
    c = num(s.get("spawn_count")); rs = val(s.get("respawn_seconds"))
    if s.get("variant"):
        k = var_key.get((mn, s["variant"]))
        if k: M[mpg].setdefault("vmobs", []).append([k, c])
        continue
    if mn not in mob: continue
    M[mpg].setdefault("groups", []).append([mn, c, rs])
for m in M.values():
    tot, timed = {}, {}
    for n, c, rs in m.get("groups", []):
        tot[n] = tot.get(n, 0) + c
        if rs: timed.setdefault(n, []).append((c, rs))
    m["mobs"] = sorted([[n, c] for n, c in tot.items()], key=lambda x: -x[1])
    # one timer per monster, only when every one of its spawn points has a timer: the rate they refill at together
    # (count / sum of count/seconds), so kills an hour from it can be at most count * 3600 / respawn. When only some of
    # a monster's points have a timer, "groups" has the detail and "respawn" leaves the monster out.
    m["respawn"] = {n: round(sum(c for c, _ in g) / sum(c / r for c, r in g)) for n, g in timed.items() if sum(c for c, _ in g) == tot[n]}
    if "vmobs" in m:
        vt = {}
        for n, c in m["vmobs"]: vt[n] = vt.get(n, 0) + c
        m["vmobs"] = [[n, c] for n, c in vt.items()]
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
    if d.get("mobRate") is not None: m["rate"] = round(float(d["mobRate"]), 2)   # the map's monster rate setting in the game files
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
# Only fares the wiki records. [from, to, fare below level 20, fare from level 20]; boats add who to talk to and,
# where the wiki gives no fare, None plus "unconfirmed" so the page can say so instead of showing it as free.
F = lambda k, d=0: fares.get(k, d)
mult = F("regularCabLevel20Multiplier", 2)
cabs = []
for town, key in (("Henesys", "henesysCab"), ("Kerning City", "kerningCityCab"), ("Perion", "perionCab")):
    for dest, dk in (("Lith Harbor", "LithHarbor"), ("Perion", "Perion"), ("Ellinia", "Ellinia"), ("Kerning City", "KerningCity"), ("Henesys", "Henesys")):
        f = F(key + dk + "Fare")
        if f and dest != town: cabs.append([town, dest, f, f * mult])
    sw = F(key + "SleepywoodFare")
    if sw: cabs.append([town, "Sleepywood", sw, sw])   # wiki Regular Cab: fares double from 20 "except to and from Sleepywood"
# Ellinia's Regular Cab has no recorded fares on the wiki, so it isn't listed (no guessing from the reverse trips).
if F("sleepywoodCabFare"):   # wiki Regular Cab (Sleepywood): the same fare to Henesys, Ellinia, Perion or Kerning City
    for dest in ("Henesys", "Ellinia", "Perion", "Kerning City"): cabs.append(["Sleepywood", dest, F("sleepywoodCabFare"), F("sleepywoodCabFare")])
# Phil in Lith Harbor: one way only (wiki Phil); fares halve from level 10 to 19
for dest, dk in (("Perion", "philPerionFare"), ("Ellinia", "philElliniaFare"), ("Henesys", "philHenesysFare"), ("Kerning City", "philKerningCityFare")):
    if F(dk): cabs.append(["Lith Harbor", dest, F(dk) // max(1, F("philLevel10To19Divisor", 2)), F(dk)])
# boats and rides that aren't cabs [from, to, fare, NPC, note]: Shanks 300 mesos one way off Maple Island (wiki Shanks),
# Pason 1,500 to Florina Beach (wiki Pason); Pison brings you back (wiki Pason/Pison) but no fare is recorded.
boats = [["Southperry", "Lith Harbor", 300, "Shanks", ""], ["Lith Harbor", "Florina Beach", 1500, "Pason", ""],
         ["Florina Beach", "Lith Harbor", None, "Pison", "unconfirmed"]]
vip = [[t, "Ant Tunnel Park", F("vipCabFare"), F("vipCabFare")] for t in ("Ellinia", "Lith Harbor") if F("vipCabFare")]   # wiki VIP Cab
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
new_mobs = [n for n in mob if prev.get("mobs") and n not in prev["mobs"] and not mob[n].get("variant")]   # job test and PQ copies aren't news
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
