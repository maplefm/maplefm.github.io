"""Quest, drop, crafting and shop guide for every item: data/itemguide.json, shown at the bottom of each item card.

Sources:
  1. maplestory.io's MapleStory Classic game data (region MCW): every quest and the exact items and counts it
     asks for, the level it opens at and the NPC that gives it. Complete, straight from the game files.
  2. The MapleStory Classic Wiki (mapleclassic.wiki, CC BY-NC-SA 4.0) through its Cargo tables: quest givers and
     regions, crafting recipes, monster drops measured by players, NPC shops, reactor (box) drops.

Wiki quest rows are joined to game quests by id (the wiki carries the game id), by name only as a fallback.
Event quests whose window has closed are kept with "ended": true. Optional per-quest fields, omitted when empty:
  get2 [[item, count, note]] rewards bound to a class, gender or chance ("Warrior only", "one of these at random (20%)");
       "get" keeps only the always-given ones
  lv2 turn-in level when above lv, cost mesos to accept, start [[item, count]] handed over at the start,
  skill [names] rewarded, prof [[profession, level]] required, from/to event window (ISO), town of the giver,
  unconfirmed [fields] where the game and the wiki disagree (the game's value is kept)

Run daily by .github/workflows/itemguide.yml, so new quests show up the day either source has them.
  python tools/itemguide.py OUT.json [itemdb.json]
"""
import sys, os, json, time, re, html, datetime, urllib.request, urllib.parse

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


def norm(name):
    """quest names match across sources despite apostrophes, '?' stand-ins and '(quest)' suffixes"""
    n = html.unescape(str(name or "")).lower().replace("\u2019", "'")
    n = re.sub(r"\s*\(quest\)\s*$", "", n)
    n = re.sub(r"'s\b|'", "", n)
    return re.sub(r"[^a-z0-9]", "", n)


def is_image(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
            return r.status == 200 and "image" in (r.headers.get("Content-Type") or "")
    except Exception:
        return False


def ingredients(s):
    """'[[Tree Branch|<span ...>Tree Branch</span>]] &times; 10, [[Firewood|...]] × 5' -> [['Tree Branch', 10], ['Firewood', 5]]"""
    s = html.unescape(html.unescape(s or ""))
    out = []
    for m in re.finditer(r"\[\[([^|\]]+)(?:\|[^\]]*)?\]\][^,\[]*?[×x]\s*([\d,]+)", s):
        out.append([m.group(1).strip(), int(m.group(2).replace(",", ""))])
    return out


def norm2(name):
    """norm() that also ignores the game's '[Event] ' style prefixes and the wiki's '(Warrior)' style suffixes"""
    n = re.sub(r"^\s*\[[^\]]*\]\s*", "", html.unescape(str(name or "")))
    n = re.sub(r"\s*\((?:quest item|warrior|magician|bowman|thief|pirate|beginner)\)\s*$", "", n, flags=re.I)
    return norm(n)


JUNK = "�?"


def clean_name(game, wiki=""):
    """game strings carry U+FFFD (and the odd '?') where the original had a character maplestory.io could not decode.
    When the wiki row (joined by id) spells the same name, take the real character from it; otherwise a space."""
    s = str(game or "").strip()
    wiki = str(wiki or "").strip()
    if wiki and any(c in s for c in JUNK):
        body = re.sub(r"^\[[^\]]*\]\s*", "", s); pre = s[:len(s) - len(body)]
        pat = "".join("(.?)" if c in JUNK else (r"\s*" if c == " " else re.escape(c)) for c in body)
        m = re.fullmatch(pat, wiki)
        if m:
            it = iter(m.groups())
            s = pre + "".join(next(it) if c in JUNK else c for c in body)
    s = s.replace("\ufffd", " ")
    if not wiki:
        s = re.sub(r"(?<=\w)\?(?=\w)", " ", s).replace("?&", " &").replace("&?", "& ")
    return re.sub(r"\s+", " ", s).strip()


JOBBITS = [(1, "Beginner"), (2, "Warrior"), (4, "Magician"), (8, "Bowman"), (16, "Thief"), (32, "Pirate")]


def job_note(mask):
    """game reward 'job' is a bitmask; Classic only has the explorer bits (higher bits are other branches)"""
    js = [n for b, n in JOBBITS if int(mask) & b]
    return (" or ".join(js) + " only") if js and len(js) < len(JOBBITS) else ""


def iso(t):
    try: return datetime.datetime.fromisoformat(str(t)[:19])
    except (TypeError, ValueError): return None


def main():
    out_path = sys.argv[1]
    names = {}
    if len(sys.argv) > 2 and os.path.exists(sys.argv[2]):
        for r in (json.load(open(sys.argv[2], encoding="utf-8")).get("items") or []):
            if r and len(r) > 1 and r[1]: names[int(r[1])] = str(r[0]).strip()
    G = {}                                    # item name -> guide
    now = datetime.datetime.utcnow()

    def g(name):
        return G.setdefault(name, {"q": [], "d": [], "c": [], "u": 0, "s": [], "r": []})

    # ---- wiki tables
    wq = cargo("quests", ["_pageName=page", "id", "name_en", "required_level", "complete_level", "giver", "turn_in", "region", "area", "repeatable", "profession", "profession_level",
                          "meso_cost", "exp_reward", "meso_reward", "fame_reward", "available_until"])
    wqi = cargo("quest_required_items", ["quest_id", "item_id", "quantity"])
    wqr = cargo("quest_rewards", ["quest_id", "item_id", "quantity", "reward_type", "choice_group", "job", "gender", "chance"])
    wqe = cargo("quest_enemies", ["quest_id", "monster_id", "quantity"])
    wnpc = cargo("npcs", ["name_en", "location", "map", "region"])
    witems = cargo("items", ["id", "name_en"])
    rec = cargo("recipes", ["profession", "profession_id", "level", "output_item", "output_count", "meso_cost", "catalyst", "catalyst_count", "ingredients"])
    mons = cargo("monsters", ["name_en", "level", "primary_location", "region"])
    drops = cargo("monster_drops", ["monster_id", "item_id", "drop_rate", "sample_kills", "quest_flag"])
    shops = cargo("shops", ["id", "name_en", "npc", "town", "map", "currency"])
    sitems = cargo("shop_items", ["shop_id", "item_id", "price", "currency"])
    reac = cargo("reactor_drops", ["reactor_id", "item_id", "drop_rate", "required_quest"])
    qgive = cargo("quest_given_items", ["quest_id", "item_id", "quantity"])
    qsteps = cargo("quest_steps", ["quest_id", "step_number", "target_monster", "required_item"])

    # game ids for pictures: mobs and NPCs by name from the game data
    mob_id, npc_id = {}, {}
    for m in (get(IO + "/mob") or []):
        if isinstance(m, dict) and m.get("name"): mob_id.setdefault(str(m["name"]).strip().lower(), m.get("id"))
    for n in (get(IO + "/npc") or []):
        if isinstance(n, dict) and n.get("name"): npc_id.setdefault(str(n["name"]).strip().lower(), n.get("id"))
    print("mob ids", len(mob_id), "npc ids", len(npc_id))
    wq_by_id = {int(q["id"]): q for q in wq if str(q.get("id") or "").strip().isdigit()}
    mon_lv = {str(m.get("name_en") or ""): int(num(m.get("level"))) for m in mons}
    mon_where = {str(m.get("name_en") or ""): (m.get("primary_location") or m.get("region") or "") for m in mons}
    npc_town = {}
    for n in wnpc:
        if n.get("name_en") and n.get("location"):
            npc_town.setdefault(str(n["name_en"]).strip().lower(), n["location"])
            npc_town.setdefault(re.sub(r"\s*\([^)]*\)\s*$", "", str(n["name_en"])).strip().lower(), n["location"])
    prof_name = {int(num(r.get("profession_id"))): r.get("profession") for r in rec if r.get("profession_id") and r.get("profession")}
    # wiki item pages carry the game item id: "Dark Marble (Warrior)" is item 4031017, which the game calls "Dark Marble"
    wiki_iid = {str(r.get("name_en") or "").strip(): int(r["id"]) for r in witems if str(r.get("id") or "").strip().isdigit()}

    def wname(page):
        page = str(page or "").strip()
        i = wiki_iid.get(page)
        return names.get(i) or page if i else page

    # ---- game data: every quest
    qlist = get(IO + "/quest") or []
    print("game quests", len(qlist))
    game_ids = {q["id"] for q in qlist if isinstance(q, dict)}
    npc_name = {}
    mob_name = {}
    for m in (get(IO + "/mob") or []):
        if isinstance(m, dict) and m.get("id") is not None: mob_name[m["id"]] = m.get("name") or ""
    allq, hidden, page_qid = [], [], {}

    def item_name(iid):
        nm = names.get(iid)
        if not nm:
            n = get(f"{IO}/item/{iid}/name")
            nm = (str(n.get("name") or "").strip() if isinstance(n, dict) else None) or str(iid)
            names[iid] = nm
        return nm

    def quest_todo(txt):
        out = []
        for ln in str(txt or "").replace("\\n", "\n").replace("\\r", "").split("\n"):
            ln = re.sub(r"#questorder\d*#", "", ln)
            ln = re.sub(r"#p(\d+)#", lambda m: npcn(int(m.group(1))) or "", ln)
            ln = re.sub(r"#t(\d+)#", lambda m: item_name(int(m.group(1))) or "", ln)
            ln = re.sub(r"#o(\d+)#", lambda m: mob_name.get(int(m.group(1)), "") if isinstance(mob_name, dict) else "", ln)
            ln = re.sub(r"#m(\d+)#", lambda m: "{m:" + m.group(1) + "}", ln)
            ln = re.sub(r"#[a-zA-Z](?:\d+#)?", "", ln).strip()
            if len(ln) >= 4 and ln not in out: out.append(ln)
        return out[:12]
    def npcn(nid):
        if nid and nid not in npc_name:
            n = get(f"{IO}/npc/{nid}/name"); npc_name[nid] = str((n.get("name") if isinstance(n, dict) else n) or "").strip()
        return npc_name.get(nid, "")

    def wrow(gid, gname):
        """the wiki row for a game quest: by id (289 of the wiki's rows carry it), else by name among rows with no game id"""
        w = wq_by_id.get(gid)
        if w and norm2(w.get("name_en")) == norm2(gname): return w
        for w in wq:
            wid = str(w.get("id") or "").strip()
            if (not wid.isdigit() or int(wid) not in game_ids) and norm2(w.get("name_en")) == norm2(gname): return w
        return {}

    def wrows(table, w, col="quest_id"):
        ps = {str(w.get(k) or "").strip() for k in ("page", "name_en")} - {""}   # child tables key on the page, "Hero's Gladius (quest)"
        return [r for r in table if str(r.get(col) or "").strip() in ps] if w else []

    for k, q in enumerate(qlist):
        d = get(f"{IO}/quest/{q['id']}")
        if not d or "id" not in d: continue
        try:
            st0, rc = d.get("requirementToStart") or {}, d.get("requirementToComplete") or {}
            rw, rs = d.get("rewardOnComplete") or {}, d.get("rewardOnStart") or {}
            raw = str(d.get("name") or q.get("name") or "")
            w0 = wrow(d["id"], raw)
            nm0 = clean_name(raw, str(w0.get("name_en") or ""))
            t_from, t_to = iso(st0.get("startTime")), iso(st0.get("endTime"))
            if not t_to and w0.get("available_until"): t_to = iso(w0["available_until"])
            ended = bool(t_to and t_to < now)       # event over: kept (its guide page still answers searches), marked ended
            gid0 = st0.get("npcId")
            giver = str(w0.get("giver") or "").strip() or npcn(gid0)
            lv = int(st0.get("levelMinimum") or num(w0.get("required_level")) or 0)
            need = [[item_name(int(x["id"])), int(x["count"])] for x in (rc.get("items") or []) if int(x.get("count") or 0) > 0]
            # rewards: always-given ones in "get"; class-, gender- or chance-bound ones in "get2" with a note
            ritems = [x for x in (rw.get("items") or []) if int(x.get("count") or 0) > 0]
            genders = {x.get("gender") for x in ritems if "gender" in x}
            wr_items = [r for r in wrows(wqr, w0) if r.get("reward_type") == "item"]
            wr_by = {norm2(wname(r.get("item_id"))): r for r in wr_items}
            n_choice = sum(1 for r in wr_items if r.get("choice_group") in ("random", "choice"))
            get_, get2 = [], []
            for x in ritems:
                nm, c = item_name(int(x["id"])), int(x["count"])
                wr_ = wr_by.get(norm2(nm)) or {}
                notes = []
                jn = job_note(x["job"]) if x.get("job") else (f"{wr_['job']} only" if wr_.get("job") else "")
                if jn: notes.append(jn)
                if wr_.get("gender"): notes.append(f"{str(wr_['gender']).lower()} only")
                elif "gender" in x and len(genders) > 1: notes.append("female only" if x["gender"] else "male only")
                if wr_.get("choice_group") == "random" and n_choice > 1:
                    notes.append(f"one of these at random ({int(num(wr_['chance']))}%)" if wr_.get("chance") else "one of these at random")
                elif wr_.get("choice_group") == "choice" and n_choice > 1:
                    notes.append("choose one of these")
                (get2.append([nm, c, ", ".join(notes)]) if notes else get_.append([nm, c]))
            if not ritems and d.get("rewardSummary"):  # rewards handed out by script only show in the quest's reward summary
                for iid, c in re.findall(r"#i(\d+)#[^#]*#t\d+#\s*x\s*(\d+)", str(d["rewardSummary"])):
                    get_.append([item_name(int(iid)), int(c)])
            rec0 = {
                "id": d["id"], "n": nm0, "lv": lv,
                "g": giver, "gid": gid0, "a": str(w0.get("area") or d.get("areaName") or w0.get("region") or "").strip(),
                "rep": 1 if (str(w0.get("repeatable") or "0") == "1" or st0.get("dayByDay") or st0.get("repeatInterval")) else 0,
                "jobs": st0.get("jobs") or [],
                "pre": [x.get("id") for x in (st0.get("quests") or []) if isinstance(x, dict) and x.get("state") == 2],
                "need": need,
                "kill": [[mob_name.get(x.get("id"), str(x.get("id"))), int(x.get("count") or 0), x.get("id")] for x in (rc.get("mobs") or [])],
                "exp": int(rw.get("exp") or 0), "meso": int(rw.get("money") or rw.get("meso") or 0), "fame": int(rw.get("pop") or rw.get("fame") or 0),
                "get": get_,
                "end": rc.get("npcId"),
            }
            extra = {
                "get2": get2,
                "lv2": int(rc["levelMinimum"]) if int(rc.get("levelMinimum") or 0) > lv else None,
                "cost": -int(rs["meso"]) if int(rs.get("meso") or 0) < 0 else (int(num(w0.get("meso_cost"))) or None),
                "start": [[item_name(int(x["id"])), int(x["count"])] for x in (rs.get("items") or []) if int(x.get("count") or 0) > 0],
                "skill": [prof_name.get(int(s["id"])) or f"skill {s['id']}" for s in (rw.get("skills") or []) if isinstance(s, dict) and s.get("id")],
                "prof": [[w0["profession"], int(num(w0.get("profession_level")))]] if w0.get("profession") else [],
                "from": t_from.strftime("%Y-%m-%dT%H:%M") if t_from else None,
                "to": t_to.strftime("%Y-%m-%dT%H:%M") if t_to else None,
                "town": npc_town.get(giver.lower()) or npc_town.get(npcn(gid0).lower()) if (giver or gid0) else None,
                # the quest window's own to-do list ("Find the child in the dark tunnel"): what a player reads in game,
                # so the page says the same. #p NPC and #t item codes become names; #m map codes stay as {m:id} for
                # the page builder, which knows the maps.
                "steps": quest_todo(d.get("demandSummary")),
                "ended": True if ended else None,
            }
            # where the game and the wiki disagree, keep the game's value and say so
            unc = []
            if any("count" not in x for x in (rc.get("items") or [])): unc.append("need")
            wn = {}
            for r in wrows(wqi, w0): wn[norm2(wname(r.get("item_id")))] = wn.get(norm2(wname(r.get("item_id"))), 0) + int(num(r.get("quantity")))
            gn = {}
            for nm, c in need: gn[norm2(nm)] = gn.get(norm2(nm), 0) + c
            if wn and wn != gn and "need" not in unc: unc.append("need")
            wk = {}
            for r in wrows(wqe, w0): wk[norm2(r.get("monster_id"))] = wk.get(norm2(r.get("monster_id")), 0) + int(num(r.get("quantity")))
            gk = {}
            for m in rec0["kill"]: gk[norm2(m[0])] = gk.get(norm2(m[0]), 0) + m[1]
            if wk and wk != gk: unc.append("kill")
            if w0.get("required_level") and st0.get("levelMinimum") and int(num(w0["required_level"])) != int(st0["levelMinimum"]): unc.append("lv")
            for fld, col in (("exp", "exp_reward"), ("meso", "meso_reward"), ("fame", "fame_reward")):
                vals = {int(num(w0[col]))} if w0.get(col) not in (None, "") else set()
                rows = [int(num(r.get("quantity"))) for r in wrows(wqr, w0) if r.get("reward_type") == fld]
                if rows: vals.add(sum(rows))
                if vals and rec0[fld] not in vals: unc.append(fld)
            if wr_items:
                wg = {}
                for r in wr_items: wg[norm2(wname(r.get("item_id")))] = wg.get(norm2(wname(r.get("item_id"))), 0) + int(num(r.get("quantity")))
                gg = {}
                for x in get_ + get2: gg[norm2(x[0])] = gg.get(norm2(x[0]), 0) + x[1]
                if wg != gg: unc.append("get")
            extra["unconfirmed"] = unc
            rec0.update({k2: v for k2, v in extra.items() if v})
            allq.append(rec0)
            for k2 in ("page", "name_en"):
                if w0.get(k2): page_qid[str(w0[k2]).strip()] = d["id"]
        except Exception as e:
            print("quest", q.get("id"), e)
        if k % 25 == 0: time.sleep(0.3)
    print("event quests past their window, left out:", hidden)

    # item cards: every quest that asks for the item, one entry per (quest id, item)
    seen = set()
    for q in allq:
        for iname, cnt in q["need"]:
            if (q["id"], iname) in seen: continue
            seen.add((q["id"], iname))
            g(iname)["q"].append([q["n"], q["lv"], cnt, q["g"], q["a"], q["rep"], q["gid"] or npc_id.get(str(q["g"]).lower()), q["id"]])

    qid_by_norm = {}
    for q in allq: qid_by_norm.setdefault(norm2(q["n"]), q["id"])

    def qid_of(page):
        page = str(page or "").strip()
        return page_qid.get(page) or qid_by_norm.get(norm2(page))

    # ---- wiki quests the game data doesn't list yet go in the quest log too (the Lith Harbor snail line, the
    # Sleepywood rumor line...), with what the wiki knows: level, giver, region and the items it asks for
    have = {norm2(q["n"]) for q in allq} | {norm2(p) for p in page_qid}; have_id = {q["id"] for q in allq} | set(hidden)
    for w in wq:
        nm, wid = str(w.get("name_en") or "").strip(), str(w.get("id") or "").strip()
        if not nm or not wid.isdigit() or int(wid) in have_id or norm2(nm) in have: continue
        if w.get("available_until") and iso(w["available_until"]) and iso(w["available_until"]) < now: continue
        have.add(norm2(nm))
        q = {"id": int(wid), "n": nm, "lv": int(num(w.get("required_level"))), "g": w.get("giver") or "", "gid": npc_id.get(str(w.get("giver") or "").lower()),
             "a": w.get("area") or w.get("region") or "", "rep": 1 if str(w.get("repeatable") or "0") == "1" else 0, "jobs": [], "pre": [],
             "need": [[wname(r.get("item_id")), int(num(r.get("quantity")))] for r in wrows(wqi, w) if int(num(r.get("quantity"))) > 0],
             "kill": [], "exp": int(num(w.get("exp_reward"))), "meso": int(num(w.get("meso_reward"))), "fame": int(num(w.get("fame_reward"))), "get": [], "end": None, "wiki": 1}
        if npc_town.get(str(q["g"]).lower()): q["town"] = npc_town[str(q["g"]).lower()]
        allq.append(q); page_qid[nm] = q["id"]; page_qid[str(w.get("page") or nm).strip()] = q["id"]
        for iname, cnt in q["need"]:
            if (q["id"], iname) not in seen:
                seen.add((q["id"], iname)); g(iname)["q"].append([nm, q["lv"], cnt, q["g"], q["a"], q["rep"], q["gid"], q["id"]])
    print("quests in the log", len(allq))

    # ---- wiki required items for quests that are neither in the game data nor a quest row of their own
    for r in wqi:
        qn, iname, cnt = str(r.get("quest_id") or "").strip(), wname(r.get("item_id")), int(num(r.get("quantity")))
        if not qn or not iname or cnt <= 0 or qn in page_qid or norm2(qn) in qid_by_norm or norm2(qn) in {norm2(p) for p in page_qid}: continue
        if ("w:" + norm2(qn), iname) in seen: continue
        seen.add(("w:" + norm2(qn), iname))
        g(iname)["q"].append([qn, 0, cnt, "", "", 0, None, None])

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

    # ---- quest sources: handed over by an NPC during a quest, dropped by a mob only while on the quest, or a reward
    for q in allq:                            # the game's own list of what each quest hands over when it starts
        for x in q.get("start") or []:
            g(x[0]).setdefault("g", []).append([q["n"], q["id"], "given"])
    for r in qgive:
        iname, qn = wname(r.get("item_id")), str(r.get("quest_id") or "").strip()
        if iname and qn and qid_of(qn) not in hidden:
            qid = qid_of(qn)
            g(iname).setdefault("g", []).append([next((q["n"] for q in allq if q["id"] == qid), qn), qid, "given"])
    have_drop = {(nm, d[0].lower()) for nm, v in G.items() for d in v["d"]}
    for r in qsteps:
        iname, mob, qn = wname(r.get("required_item")), str(r.get("target_monster") or "").strip(), str(r.get("quest_id") or "").strip()
        if iname and mob and (iname, mob.lower()) not in have_drop:
            have_drop.add((iname, mob.lower()))
            g(iname)["d"].append([mob, mon_lv.get(mob, 0), None, 0, mon_where.get(mob, ""), 1, mob_id.get(mob.lower())])
    # ---- player-reported drops (tools/drops_reported.json): who drops what in Classic, confirmed by players' votes.
    # Fills in the many monsters the wiki hasn't measured yet; no rate, just "drops".
    rp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "drops_reported.json")
    if os.path.exists(rp):
        wiki_mob = {k.lower(): k for k in mon_lv}
        added = 0
        for mob, m in json.load(open(rp, encoding="utf-8")).items():
            wm = wiki_mob.get(mob.lower(), mob)
            for gid, nm in m["d"]:
                iname = names.get(int(gid)) or nm
                if (iname, wm.lower()) in have_drop: continue
                have_drop.add((iname, wm.lower()))
                g(iname)["d"].append([wm, mon_lv.get(wm) or m.get("lv", 0), None, 0, mon_where.get(wm, ""), 0, mob_id.get(wm.lower())])
                added += 1
        print("player-reported drops added", added)
    for q in allq:
        for x in q["get"] + (q.get("get2") or []):
            g(x[0]).setdefault("g", []).append([q["n"], q["id"], "reward"])
    for v in G.values():
        if v.get("g"):
            seen_g, keep = set(), []
            for x in v["g"]:
                k = (x[1] if x[1] is not None else norm2(x[0]), x[2])
                if k not in seen_g: seen_g.add(k); keep.append(x)
            v["g"] = keep

    # quest items with no known source yet: keep the game's own description as the hint ("from an old box...")
    bare = sorted({x[0] for q in allq for x in q["need"] if not any((G.get(x[0]) or {}).get(k) for k in ("d", "c", "s", "r", "g"))})
    for i in range(0, len(bare), 40):
        part = bare[i:i + 40]
        where = "name_en IN (" + ",".join("'" + n.replace("'", "\\'") + "'" for n in part) + ")"
        qs = urllib.parse.urlencode({"action": "cargoquery", "format": "json", "limit": 500, "tables": "items", "fields": "name_en,description_en", "where": where})
        for r in ((get(WIKI + "?" + qs) or {}).get("cargoquery") or []):
            t = r["title"]; nm, ds = html.unescape(t.get("name en") or ""), html.unescape(t.get("description en") or "")
            if nm and ds: g(nm)["t"] = re.sub(r"\s+", " ", ds).strip()[:220]
    print("quest items without a source", len(bare))

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
        for x in q["need"] + q["get"] + (q.get("get2") or []) + (q.get("start") or []):
            i = byname.get(x[0].lower())
            if i: ids[x[0]] = i
    for nm, v in items.items():
        for d in v.get("d") or []:
            pass
        if nm not in ids:
            i = byname.get(nm.lower())
            if i: ids[nm] = i
    # mob pictures: some Classic mobs have no standing frame, so their icon 404s; use the walk animation instead
    mobs_used = {k[2] for q in allq for k in q["kill"] if k[2] is not None} | {d[6] for v in items.values() for d in v.get("d") or [] if d[6] is not None}
    mobimg = {}
    for mid in sorted(mobs_used, key=str):
        if is_image(f"{IO}/mob/{mid}/icon"): continue
        mobimg[str(mid)] = "render/move" if is_image(f"{IO}/mob/{mid}/render/move") else ""
    print("mobs", len(mobs_used), "without an icon", mobimg)
    doc = {"v": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "n": len(items), "mobimg": mobimg,
           "src": "Quests from MapleStory Classic game data (maplestory.io). Givers, crafting, drops and shops from the MapleStory Classic Wiki (mapleclassic.wiki), CC BY-NC-SA 4.0.",
           "items": items, "ids": ids, "quests": allq}
    json.dump(doc, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("items", len(items), "with quests", sum(1 for v in items.values() if "q" in v), "bytes", os.path.getsize(out_path))


if __name__ == "__main__":
    main()
