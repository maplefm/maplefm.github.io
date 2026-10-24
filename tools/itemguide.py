"""Quest, drop, crafting and shop guide for every item: data/itemguide.json, shown at the bottom of each item card.

Sources:
  1. maplestory.io's MapleStory Classic game data (region MCW): every quest and the exact items and counts it
     asks for, the level it opens at and the NPC that gives it. Complete, straight from the game files.
  2. The MapleStory Classic Wiki (mapleclassic.wiki, CC BY-NC-SA 4.0) through its Cargo tables: quest givers and
     regions, crafting recipes, monster drops measured by players, NPC shops, reactor (box) drops.

Run daily by .github/workflows/itemguide.yml, so new quests show up the day either source has them.
  python tools/itemguide.py OUT.json [itemdb.json]
"""
import sys, os, json, time, re, html, urllib.request, urllib.parse

IO = "https://maplestory.io/api/MCW/1"
WIKI = "https://mapleclassic.wiki/api.php"
UA = {"User-Agent": "ClubFM-itemguide/1.0 (https://maplefm.gg; daily, polite)"}


def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.load(r)
        except Exception as e:
            if k == tries - 1:
                print("failed", url[:120], e); return None
            time.sleep(2 + 3 * k)


def cargo(table, fields):
    """every row of a wiki Cargo table, 500 at a time"""
    out, off = [], 0
    while True:
        q = urllib.parse.urlencode({"action": "cargoquery", "format": "json", "limit": 500, "offset": off, "tables": table, "fields": ",".join(fields)})
        j = get(WIKI + "?" + q)
        rows = (j or {}).get("cargoquery")
        if rows is None:
            print("cargo error", table, json.dumps(j)[:200]); break
        out += [{k.replace(" ", "_"): (html.unescape(v) if isinstance(v, str) else v) for k, v in r["title"].items()} for r in rows]
        if len(rows) < 500: break
        off += 500; time.sleep(0.5)
    print(table, len(out))
    return out


def num(v, d=0):
    try: return float(v)
    except (TypeError, ValueError): return d


def ingredients(s):
    """'[[Tree Branch|<span ...>Tree Branch</span>]] &times; 10, [[Firewood|...]] × 5' -> [['Tree Branch', 10], ['Firewood', 5]]"""
    s = html.unescape(html.unescape(s or ""))
    out = []
    for m in re.finditer(r"\[\[([^|\]]+)(?:\|[^\]]*)?\]\][^,\[]*?[×x]\s*([\d,]+)", s):
        out.append([m.group(1).strip(), int(m.group(2).replace(",", ""))])
    return out


def main():
    out_path = sys.argv[1]
    names = {}
    if len(sys.argv) > 2 and os.path.exists(sys.argv[2]):
        for r in (json.load(open(sys.argv[2], encoding="utf-8")).get("items") or []):
            if r and len(r) > 1 and r[1]: names[int(r[1])] = r[0]
    G = {}                                    # item name -> guide

    def g(name):
        return G.setdefault(name, {"q": [], "d": [], "c": [], "u": 0, "s": [], "r": []})

    # ---- wiki tables
    wq = cargo("quests", ["id", "name_en", "required_level", "giver", "region", "repeatable", "profession", "profession_level"])
    wqi = cargo("quest_required_items", ["quest_id", "item_id", "quantity"])
    rec = cargo("recipes", ["profession", "level", "output_item", "output_count", "meso_cost", "catalyst", "catalyst_count", "ingredients"])
    mons = cargo("monsters", ["name_en", "level", "primary_location", "region"])
    drops = cargo("monster_drops", ["monster_id", "item_id", "drop_rate", "sample_kills", "quest_flag"])
    shops = cargo("shops", ["id", "name_en", "npc", "town", "map", "currency"])
    sitems = cargo("shop_items", ["shop_id", "item_id", "price", "currency"])
    reac = cargo("reactor_drops", ["reactor_id", "item_id", "drop_rate", "required_quest"])

    # game ids for pictures: mobs and NPCs by name from the game data
    mob_id, npc_id = {}, {}
    for m in (get(IO + "/mob") or []):
        if isinstance(m, dict) and m.get("name"): mob_id.setdefault(str(m["name"]).strip().lower(), m.get("id"))
    for n in (get(IO + "/npc") or []):
        if isinstance(n, dict) and n.get("name"): npc_id.setdefault(str(n["name"]).strip().lower(), n.get("id"))
    print("mob ids", len(mob_id), "npc ids", len(npc_id))
    wq_by_name = {str(q.get("name_en") or "").strip().lower(): q for q in wq}
    mon_lv = {str(m.get("name_en") or ""): int(num(m.get("level"))) for m in mons}
    mon_where = {str(m.get("name_en") or ""): (m.get("primary_location") or m.get("region") or "") for m in mons}

    # ---- game data: every quest's required items
    seen = set()
    qlist = get(IO + "/quest") or []
    print("game quests", len(qlist))
    npc_name = {}
    mob_name = {}
    for m in (get(IO + "/mob") or []):
        if isinstance(m, dict) and m.get("id") is not None: mob_name[m["id"]] = m.get("name") or ""
    allq = []
    def item_name(iid):
        nm = names.get(iid)
        if not nm:
            n = get(f"{IO}/item/{iid}/name")
            nm = (n.get("name") if isinstance(n, dict) else None) or str(iid)
            names[iid] = nm
        return nm
    for k, q in enumerate(qlist):
        d = get(f"{IO}/quest/{q['id']}")
        if not d or "id" not in d: continue
        try:
            st0, rc = d.get("requirementToStart") or {}, d.get("requirementToComplete") or {}
            rw = d.get("rewardOnComplete") or {}
            nm0 = str(d.get("name") or q.get("name") or "").strip()
            w0 = wq_by_name.get(nm0.lower()) or {}
            gid0 = st0.get("npcId")
            if gid0 and gid0 not in npc_name:
                n = get(f"{IO}/npc/{gid0}/name"); npc_name[gid0] = (n.get("name") if isinstance(n, dict) else n) or ""
            allq.append({
                "id": d["id"], "n": nm0, "lv": int(st0.get("levelMinimum") or num(w0.get("required_level")) or 0),
                "g": w0.get("giver") or npc_name.get(gid0, ""), "gid": gid0, "a": w0.get("region") or d.get("areaName") or "",
                "rep": 1 if str(w0.get("repeatable") or "0") == "1" else 0,
                "jobs": st0.get("jobs") or [],
                "pre": [x.get("id") for x in (st0.get("quests") or []) if isinstance(x, dict) and x.get("state") == 2],
                "need": [[item_name(int(x["id"])), int(x["count"])] for x in (rc.get("items") or []) if int(x.get("count") or 0) > 0],
                "kill": [[mob_name.get(x.get("id"), str(x.get("id"))), int(x.get("count") or 0), x.get("id")] for x in (rc.get("mobs") or [])],
                "exp": int(rw.get("exp") or 0), "meso": int(rw.get("money") or rw.get("meso") or 0), "fame": int(rw.get("pop") or rw.get("fame") or 0),
                "get": [[item_name(int(x["id"])), int(x["count"])] for x in (rw.get("items") or []) if int(x.get("count") or 0) > 0],
                "end": rc.get("npcId"),
            })
        except Exception as e:
            print("quest", q.get("id"), e)
        req = (d.get("requirementToComplete") or {}).get("items") or []
        need = [(int(x["id"]), int(x["count"])) for x in req if int(x.get("count") or 0) > 0]
        if not need: continue
        start = d.get("requirementToStart") or {}
        name = str(d.get("name") or q.get("name") or "").strip()
        wiki = wq_by_name.get(name.lower()) or {}
        giver = wiki.get("giver") or ""
        nid = start.get("npcId")
        if not giver and nid:
            if nid not in npc_name:
                n = get(f"{IO}/npc/{nid}/name")
                npc_name[nid] = (n.get("name") if isinstance(n, dict) else n) or ""
            giver = npc_name[nid]
        lvl = int(start.get("levelMinimum") or num(wiki.get("required_level")) or 0)
        region = wiki.get("region") or d.get("areaName") or ""
        for iid, cnt in need:
            iname = names.get(iid)
            if not iname:
                n = get(f"{IO}/item/{iid}/name")
                iname = (n.get("name") if isinstance(n, dict) else None) or str(iid)
                names[iid] = iname
            key = (name.lower(), iname.lower())
            if key in seen: continue
            seen.add(key)
            g(iname)["q"].append([name, lvl, cnt, giver, region, 1 if str(wiki.get("repeatable") or "0") == "1" else 0, nid or npc_id.get(str(giver).lower())])
        if k % 25 == 0: time.sleep(0.3)

    # ---- wiki quests the game data doesn't list yet (newly added ones)
    for r in wqi:
        qn, iname, cnt = str(r.get("quest_id") or "").strip(), str(r.get("item_id") or "").strip(), int(num(r.get("quantity")))
        if not qn or not iname or cnt <= 0 or (qn.lower(), iname.lower()) in seen: continue
        seen.add((qn.lower(), iname.lower()))
        wiki = wq_by_name.get(qn.lower()) or {}
        g(iname)["q"].append([qn, int(num(wiki.get("required_level"))), cnt, wiki.get("giver") or "", wiki.get("region") or "", 1 if str(wiki.get("repeatable") or "0") == "1" else 0, npc_id.get(str(wiki.get("giver") or "").lower())])

    # ---- crafting: how an item is made, and how many recipes use it
    for r in rec:
        outn = str(r.get("output_item") or "").strip()
        ing = ingredients(r.get("ingredients"))
        if not outn: continue
        cat = r.get("catalyst") or ""
        g(outn)["c"].append([r.get("profession") or "", int(num(r.get("level"))), ing, int(num(r.get("meso_cost"))), int(num(r.get("output_count"), 1)) or 1,
                             [cat, int(num(r.get("catalyst_count"), 1)) or 1] if cat else None])
        for nm, _ in ing:
            g(nm)["u"] += 1

    # ---- monster drops (measured by players on the wiki; a rate when enough kills were counted)
    for r in drops:
        iname, mob = str(r.get("item_id") or "").strip(), str(r.get("monster_id") or "").strip()
        if not iname or not mob: continue
        rate = num(r.get("drop_rate"), None) if r.get("drop_rate") not in (None, "") else None
        g(iname)["d"].append([mob, mon_lv.get(mob, 0), round(rate, 2) if rate is not None else None, int(num(r.get("sample_kills"))), mon_where.get(mob, ""),
                              1 if str(r.get("quest_flag") or "0") == "1" else 0, mob_id.get(mob.lower())])

    # ---- NPC shops
    shop = {}
    for s in shops:
        for k in (s.get("id"), s.get("name_en"), s.get("npc")):
            if k: shop.setdefault(str(k).strip(), s)
    for r in sitems:
        iname, sid = str(r.get("item_id") or "").strip(), str(r.get("shop_id") or "").strip()
        if not iname or not sid: continue
        s = shop.get(sid, {})
        cur = r.get("currency") or s.get("currency") or ""
        g(iname)["s"].append([s.get("npc") or sid, s.get("town") or s.get("map") or "", int(num(r.get("price"))), "" if cur in ("", "meso", "mesos", "Mesos") else cur, npc_id.get(str(s.get("npc") or sid).lower())])

    for r in reac:
        iname = str(r.get("item_id") or "").strip()
        if iname: g(iname)["r"].append([str(r.get("reactor_id") or ""), num(r.get("drop_rate"), None), r.get("required_quest") or ""])

    # tidy: sort, drop empty parts, drop items with nothing to say
    items = {}
    for nm, v in G.items():
        v["q"].sort(key=lambda x: (x[1], x[0])); v["d"].sort(key=lambda x: (-(x[2] or 0), x[1])); v["c"].sort(key=lambda x: (x[0], x[1]))
        v["s"].sort(key=lambda x: x[2])
        v = {k: x for k, x in v.items() if x}
        if v: items[nm] = v
    # item ids for icons: every item the guide names, from the item list (and the game data for the rest)
    ids = {}
    byname = {v.lower(): k for k, v in names.items()}
    want = set(items)
    for v in items.values():
        for c in v.get("c") or []:
            for x in c[2]: want.add(x[0])
    for nm in want:
        i = byname.get(nm.lower())
        if i: ids[nm] = i
    for q in allq:
        for x in q["need"] + q["get"]:
            i = byname.get(x[0].lower())
            if i: ids[x[0]] = i
    doc = {"v": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "n": len(items),
           "src": "Quests from MapleStory Classic game data (maplestory.io). Givers, crafting, drops and shops from the MapleStory Classic Wiki (mapleclassic.wiki), CC BY-NC-SA 4.0.",
           "items": items, "ids": ids, "quests": allq}
    json.dump(doc, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("items", len(items), "with quests", sum(1 for v in items.values() if "q" in v), "bytes", os.path.getsize(out_path))


if __name__ == "__main__":
    main()
