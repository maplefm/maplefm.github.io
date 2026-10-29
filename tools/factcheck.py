"""Weekly fact check: our published quest, monster and map data against the two sources it is built from.

  python3 tools/factcheck.py ITEMGUIDE.json WORLD.json OUT.json [--known tools/factcheck_known.json] [--cache DIR]

Sources (the only two the site uses):
  1. maplestory.io's copy of the MapleStory Classic World game files (region MCW): quests, monsters, maps.
     The authority for quest numbers (levels, items, counts, kills, rewards, event windows) and monster stats.
  2. The MapleStory Classic Wiki (mapleclassic.wiki, CC BY-NC-SA 4.0) through its Cargo tables: givers, repeatable
     quests, choice/random rewards, released maps, spawns and portals. The authority for maps.

Writes OUT.json: {"at", "checked", "diff", "new", "unconfirmed", "partial", "failed"}.
  diff         our value differs from the source that is the authority for it, or the two sources disagree in a
               way nobody has looked at yet (once confirmed as a source disagreement, list it in factcheck_known.json)
  new          quests, maps and monsters the sources have (released, Classic World) and we don't
  unconfirmed  known source disagreements: in factcheck_known.json, or marked "unconfirmed" by the builder itself
Exit 1 when diff or new is non-empty. A source that can't be reached is never a failure: what was fetched is
checked, "partial" is set and the exit code is 0 (the watchdog notices if the job stops running at all).
Standard library only.
"""
import sys, os, json, time, re, html, hashlib, argparse, urllib.request, urllib.parse, urllib.error, datetime

IO = "https://maplestory.io/api/MCW/1"
WIKI = "https://mapleclassic.wiki/api.php"
UA = {"User-Agent": "maplefm.gg weekly fact check (+https://maplefm.gg)"}
START = time.time()
BUDGET = 14 * 60          # stop fetching after this many seconds and report what was checked (partial)
GAP = 0.25                # about 4 requests a second
FAILED = []               # urls that could not be fetched
_last = [0.0]
CACHE = None
DOWN = {}                 # host -> failed urls in a row (each already retried 5 times); after 2 the host is treated as down for the rest of the run


def get(url, tries=5):
    """JSON from url, or None. 404 is an answer (None, not a failure); 429/5xx/network errors are retried with
    backoff and then recorded as a failure, which makes the run partial."""
    if CACHE:
        fn = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + ".json")
        if os.path.exists(fn):
            j = json.load(open(fn, encoding="utf-8"))
            return None if isinstance(j, dict) and (j.get("_http") == 404) else (None if isinstance(j, dict) and "_err" in j else j)
    host = urllib.parse.urlsplit(url).netloc
    if time.time() - START > BUDGET or DOWN.get(host, 0) >= 2:
        FAILED.append(url); return None
    for k in range(tries):
        wait = GAP - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                j = json.loads(r.read().decode("utf-8"))
            if CACHE: json.dump(j, open(fn, "w", encoding="utf-8"))
            DOWN[host] = 0
            return j
        except urllib.error.HTTPError as e:
            if e.code == 404:
                if CACHE: json.dump({"_http": 404}, open(fn, "w"))
                DOWN[host] = 0
                return None
            if e.code not in (429, 500, 502, 503, 504, 520, 521, 522, 524): break
            ra = e.headers.get("Retry-After") if e.headers else None
            time.sleep(min(60, int(ra)) if ra and ra.isdigit() else 2 + 4 * k)
        except Exception:
            time.sleep(2 + 4 * k)
    FAILED.append(url)
    DOWN[host] = DOWN.get(host, 0) + 1
    if DOWN[host] == 2: print("source looks down, skipping the rest of its requests:", host)
    return None


def cargo(table, fields, where=None):
    out, off = [], 0
    while True:
        q = {"action": "cargoquery", "format": "json", "limit": 500, "offset": off, "tables": table, "fields": ",".join(fields)}
        if where: q["where"] = where
        j = get(WIKI + "?" + urllib.parse.urlencode(q))
        rows = (j or {}).get("cargoquery")
        if rows is None:
            print("wiki table unavailable:", table); return None
        out += [{k.replace(" ", "_"): (html.unescape(html.unescape(v)) if isinstance(v, str) else v) for k, v in r["title"].items()} for r in rows]
        if len(rows) < 500: return out
        off += 500


def num(v, d=None):
    if v is None or (isinstance(v, str) and not v.strip()): return d
    try: return int(float(v))
    except (TypeError, ValueError): return d


def norm(s):
    s = html.unescape(str(s or "")).lower().replace("’", "'").replace("�", " ")
    s = re.sub(r"^\s*\[[^\]]*\]\s*", "", s)
    s = re.sub(r"\s*\((?:quest item|quest|warrior|magician|bowman|thief|pirate|beginner)\)\s*$", "", s)
    s = re.sub(r"'s\b|'", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def bag(pairs):
    out = {}
    for k, c in pairs: out[k] = out.get(k, 0) + c
    return out


def iso(t):
    try: return datetime.datetime.fromisoformat(str(t)[:19])
    except (TypeError, ValueError): return None


def wiki_url(page): return "https://mapleclassic.wiki/index.php?title=" + urllib.parse.quote(str(page).replace(" ", "_"))


ELEM = {"F": "Fire", "I": "Ice", "L": "Lightning", "S": "Poison", "H": "Holy", "D": "Dark", "P": "Physical"}
JOBBITS = [(1, "Beginner"), (2, "Warrior"), (4, "Magician"), (8, "Bowman"), (16, "Thief"), (32, "Pirate")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("itemguide"); ap.add_argument("world"); ap.add_argument("out")
    ap.add_argument("--known", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "factcheck_known.json"))
    ap.add_argument("--cache", help="keep source responses here (local runs; not used in the workflow)")
    a = ap.parse_args()
    global CACHE
    if a.cache: CACHE = a.cache; os.makedirs(CACHE, exist_ok=True)
    guide = json.load(open(a.itemguide, encoding="utf-8"))
    world = json.load(open(a.world, encoding="utf-8"))
    try: known = json.load(open(a.known, encoding="utf-8"))
    except (OSError, ValueError): known = {}
    KNOWN = {(str(k.get("kind")), str(k.get("id")), str(k.get("field"))) for k in known.get("disagree", [])}
    IGNORE_NEW = {(str(k.get("kind")), str(k.get("id"))) for k in known.get("ignore_new", [])}
    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
    diff, new, unconf, checked = [], [], [], {}

    def D(kind, id_, field, ours, source, url, note=""):
        diff.append({"kind": kind, "id": id_, "field": field, "ours": ours, "source": source, "url": url, **({"note": note} if note else {})})

    def disagree(kind, id_, field, ours, source, url, carried=False):
        """the two sources disagree; ours follows the authority. Known ones are 'unconfirmed', new ones are a diff."""
        row = {"kind": kind, "id": id_, "field": field, "ours": ours, "source": source, "url": url}
        if carried or (kind, str(id_), field) in KNOWN: unconf.append(row)
        else: diff.append(dict(row, note="the game files and the wiki disagree; ours follows the authority. If that's confirmed, add it to tools/factcheck_known.json"))

    # ------------------------------------------------------------------ wiki tables
    wq = cargo("quests", ["_pageName=page", "id", "name_en", "required_level", "repeatable", "exp_reward", "meso_reward", "fame_reward", "available_until", "game_version"])
    wqi = cargo("quest_required_items", ["quest_id", "item_id", "quantity"])
    wqr = cargo("quest_rewards", ["quest_id", "item_id", "quantity", "reward_type", "choice_group", "job", "gender", "chance"])
    wqe = cargo("quest_enemies", ["quest_id", "monster_id", "quantity"])
    witems = cargo("items", ["id", "name_en"])
    wmons = cargo("monsters", ["_pageName=page", "id", "name_en", "level", "hp", "exp", "accuracy", "avoidability", "physical_defense", "magic_defense",
                               "element_weak", "element_resist", "variant", "released"])
    wmaps = cargo("maps", ["_pageName=page", "id", "name_en"])
    wspawn = cargo("monster_spawns", ["monster_id", "map_id", "spawn_count", "variant"])
    wport = cargo("portals", ["_pageName=src", "to_map"])

    wiki_iid = {str(r.get("name_en") or "").strip(): num(r.get("id")) for r in (witems or []) if num(r.get("id"))}

    def wrows(table, w):
        ps = {str(w.get(k) or "").strip() for k in ("page", "name_en")} - {""}
        return [r for r in (table or []) if str(r.get("quest_id") or "").strip() in ps]

    # ------------------------------------------------------------------ quests
    Q = {q["id"]: q for q in guide.get("quests") or []}
    ids = guide.get("ids") or {}
    name_of_id = {}
    for nm, i in ids.items(): name_of_id.setdefault(int(i), nm)

    def iname(i):
        i = int(i)
        if i not in name_of_id:
            j = get(f"{IO}/item/{i}/name")
            name_of_id[i] = str((j or {}).get("name") or i).strip() if isinstance(j, dict) else str(i)
        return name_of_id[i]

    def wname(page):
        i = wiki_iid.get(str(page or "").strip())
        return iname(i) if i and i in name_of_id else str(page or "")

    glist = get(IO + "/quest")
    wq_by_id = {num(w["id"]): w for w in (wq or []) if num(w.get("id"))}
    n_q = 0
    if glist is None:
        print("game quest list unavailable: quests not checked")
    else:
        gids = {q["id"] for q in glist if isinstance(q, dict)}
        for qi in glist:
            qid = qi.get("id")
            d = get(f"{IO}/quest/{qid}")
            if not d or "id" not in d: continue
            st, rc = d.get("requirementToStart") or {}, d.get("requirementToComplete") or {}
            rw, rs = d.get("rewardOnComplete") or {}, d.get("rewardOnStart") or {}
            url = f"{IO}/quest/{qid}"
            w = wq_by_id.get(qid) if wq_by_id.get(qid) and norm(wq_by_id[qid].get("name_en")) == norm(d.get("name")) else None
            if not w:
                w = next((x for x in (wq or []) if num(x.get("id")) not in gids and norm(x.get("name_en")) == norm(d.get("name"))), None)
            t_from, t_to = iso(st.get("startTime")), iso(st.get("endTime"))
            over = bool(t_to and t_to < now)
            o = Q.get(qid)
            if not o:
                if not over and ("quest", str(qid)) not in IGNORE_NEW:   # an ended event we never listed isn't news
                    new.append({"kind": "quest", "id": qid, "name": d.get("name"), "url": url, "lv": st.get("levelMinimum")})
                continue
            n_q += 1
            carried = set(o.get("unconfirmed") or [])
            if bool(o.get("ended")) != over:
                D("quest", qid, "ended", bool(o.get("ended")), over, url, "event window per the game's endTime " + str(st.get("endTime")))
            for fld, val in (("from", t_from), ("to", t_to)):
                want = val.strftime("%Y-%m-%dT%H:%M") if val else None
                if o.get(fld) != want: D("quest", qid, fld, o.get(fld), want, url)
            lv = st.get("levelMinimum")
            if lv is not None and o["lv"] != lv: D("quest", qid, "lv", o["lv"], lv, url)
            lv2 = rc.get("levelMinimum")
            if lv2 and lv2 > (lv or 0) and o.get("lv2") != lv2: D("quest", qid, "lv2", o.get("lv2"), lv2, url)
            cost = -int(rs["meso"]) if int(rs.get("meso") or 0) < 0 else None
            if cost and o.get("cost") != cost: D("quest", qid, "cost", o.get("cost"), cost, url)
            gneed = bag((norm(iname(x["id"])), int(x["count"])) for x in (rc.get("items") or []) if int(x.get("count") or 0) > 0)
            if bag((norm(n), c) for n, c in o["need"]) != gneed:
                D("quest", qid, "need", o["need"], [[iname(x["id"]), x.get("count")] for x in (rc.get("items") or [])], url)
            gkill = bag((x["id"], int(x.get("count") or 0)) for x in (rc.get("mobs") or []))
            if bag((k[2], k[1]) for k in o["kill"]) != gkill:
                D("quest", qid, "kill", o["kill"], [[x["id"], x.get("count")] for x in (rc.get("mobs") or [])], url)
            for fld, keys in (("exp", ("exp",)), ("meso", ("meso", "money")), ("fame", ("fame", "pop"))):
                gv = int(next((rw[k] for k in keys if rw.get(k) is not None), 0))
                if o[fld] != gv: D("quest", qid, fld, o[fld], gv, url)
            gpre = sorted(x["id"] for x in (st.get("quests") or []) if x.get("state") == 2)
            if sorted(o["pre"]) != gpre: D("quest", qid, "pre", o["pre"], gpre, url)
            # rewards: everything the game gives (or its reward summary lists) must be in get + get2; class-bound ones in get2
            ritems = [x for x in (rw.get("items") or []) if int(x.get("count") or 0) > 0]
            if not ritems and d.get("rewardSummary"):
                ritems = [{"id": int(i), "count": int(c)} for i, c in re.findall(r"#i(\d+)#[^#]*#t\d+#\s*x\s*(\d+)", str(d["rewardSummary"]))]
            allget = bag((norm(x[0]), x[1]) for x in (o.get("get") or []) + (o.get("get2") or []))
            if allget != bag((norm(iname(x["id"])), int(x["count"])) for x in ritems):
                D("quest", qid, "get", {"get": o.get("get"), "get2": o.get("get2")}, [[iname(x["id"]), x["count"], x.get("job")] for x in ritems], url)
            in_get = {norm(x[0]) for x in o.get("get") or []}
            for x in ritems:
                jm = int(x.get("job") or 0)
                js = [n for b, n in JOBBITS if jm & b]
                if js and len(js) < len(JOBBITS) and norm(iname(x["id"])) in in_get:
                    D("quest", qid, "get2", o.get("get"), [iname(x["id"]), x["count"], " or ".join(js) + " only"], url, "class-bound reward listed as always given")
            rep = 1 if (st.get("dayByDay") or st.get("repeatInterval") or (w and str(w.get("repeatable")) == "1")) else 0
            if o["rep"] != rep: D("quest", qid, "rep", o["rep"], rep, url if not w else [url, wiki_url(w["page"])])
            if not w: continue
            # the wiki as a second opinion
            wu = [url, wiki_url(w["page"])]
            wr_items = [r for r in wrows(wqr, w) if r.get("reward_type") == "item"]
            grp = [r for r in wr_items if r.get("choice_group") in ("random", "choice")]
            if len(grp) > 1:
                for r in grp:
                    if norm(wname(r.get("item_id"))) in in_get:
                        D("quest", qid, "get2", o.get("get"), [r.get("item_id"), r.get("quantity"), r.get("choice_group")], wu, "one-of reward listed as always given")
            if num(w.get("required_level")) is not None and lv is not None and num(w["required_level"]) != lv:
                disagree("quest", qid, "lv", o["lv"], {"game": lv, "wiki": num(w["required_level"])}, wu, "lv" in carried)
            wn = bag((norm(wname(r.get("item_id"))), num(r.get("quantity"), 0)) for r in wrows(wqi, w))
            if (wn and wn != gneed) or any("count" not in x for x in (rc.get("items") or [])):
                disagree("quest", qid, "need", o["need"], {"game": [[iname(x["id"]), x.get("count")] for x in (rc.get("items") or [])], "wiki": wn}, wu, "need" in carried)
            wk = bag((norm(r.get("monster_id")), num(r.get("quantity"), 0)) for r in wrows(wqe, w))
            gk = bag((norm(k[0]), k[1]) for k in o["kill"])
            if wk and wk != gk: disagree("quest", qid, "kill", o["kill"], {"wiki": wk}, wu, "kill" in carried)
            for fld, col in (("exp", "exp_reward"), ("meso", "meso_reward"), ("fame", "fame_reward")):
                vals = {num(w[col])} if num(w.get(col)) is not None else set()
                rows = [num(r.get("quantity"), 0) for r in wrows(wqr, w) if r.get("reward_type") == fld]
                if rows: vals.add(sum(rows))
                if vals and o[fld] not in vals: disagree("quest", qid, fld, o[fld], {"wiki": sorted(vals)}, wu, fld in carried)
            if wr_items:
                wg = bag((norm(wname(r.get("item_id"))), num(r.get("quantity"), 0)) for r in wr_items)
                if wg != allget: disagree("quest", qid, "get", {"get": o.get("get"), "get2": o.get("get2")}, {"wiki": wg}, wu, "get" in carried)
        for qid, o in Q.items():
            if qid not in gids and not o.get("wiki") and qid not in wq_by_id:
                D("quest", qid, "exists", o["n"], None, None, "on our list but in neither source")
        # quests only the wiki has (not in the game files yet), released and still running
        have = {norm(o["n"]) for o in Q.values()} | {norm(x.get("name")) for x in glist if isinstance(x, dict)}
        for w in wq or []:
            i = num(w.get("id"))
            if not i or i in gids or i in Q or norm(w.get("name_en")) in have or ("quest", str(i)) in IGNORE_NEW: continue
            if w.get("available_until") and iso(w["available_until"]) and iso(w["available_until"]) < now: continue
            if ("quest", str(w.get("name_en"))) in IGNORE_NEW: continue
            if str(w.get("game_version") or "") == "pre-launch": continue
            new.append({"kind": "quest", "id": i, "name": w.get("name_en"), "url": wiki_url(w["page"])})
    checked["quests"] = n_q

    # ------------------------------------------------------------------ monsters
    M = world.get("mobs") or {}
    by_id = {}
    for nm, m in M.items():
        if m.get("id"): by_id.setdefault(m["id"], []).append((nm, m))
    wm_by_id = {}
    for w in wmons or []:
        if num(w.get("id")) and not str(w.get("page") or "").startswith("Module:"): wm_by_id.setdefault(num(w["id"]), w)
    n_m = 0
    for mid, rows in sorted(by_id.items()):
        g = get(f"{IO}/mob/{mid}")
        meta = (g or {}).get("meta") if isinstance(g, dict) else None
        w = wm_by_id.get(mid)
        url = f"{IO}/mob/{mid}"
        if meta:
            e = str(meta.get("elementalAttributes") or "")
            gweak = sorted(ELEM.get(c, c) for c, lvl in re.findall(r"([A-Z])(\d)", e) if lvl == "3")
            gres = sorted(ELEM.get(c, c) for c, lvl in re.findall(r"([A-Z])(\d)", e) if lvl in ("1", "2"))
            src = {"lv": meta.get("level"), "hp": meta.get("maxHP"), "exp": meta.get("exp"), "acc": meta.get("accuracy"), "eva": meta.get("evasion"),
                   "wdef": meta.get("physicalDefense"), "mdef": meta.get("magicDefense")}
        elif w:
            src = {"lv": num(w.get("level")), "hp": num(w.get("hp")), "exp": num(w.get("exp")), "acc": num(w.get("accuracy")), "eva": num(w.get("avoidability")),
                   "wdef": num(w.get("physical_defense")), "mdef": num(w.get("magic_defense"))}
            url = wiki_url(w["page"])
        else:
            if (g is None and url in FAILED): continue
            for nm, m in rows: D("monster", mid, "exists", nm, None, None, "in neither source")
            continue
        wsrc = {"lv": num(w.get("level")), "hp": num(w.get("hp")), "exp": num(w.get("exp")), "acc": num(w.get("accuracy")), "eva": num(w.get("avoidability")),
                "wdef": num(w.get("physical_defense")), "mdef": num(w.get("magic_defense"))} if w else {}
        for nm, m in rows:
            n_m += 1
            for f, v in src.items():
                if v is not None and m.get(f) != v: D("monster", mid, f, m.get(f), v, url, nm)
                elif meta and wsrc.get(f) is not None and wsrc[f] != v:
                    disagree("monster", mid, f, m.get(f), {"game": v, "wiki": wsrc[f]}, [url, wiki_url(w["page"])])
            # elements: the wiki's names; the game's codes (L3 weak to lightning, F2 resists fire) as a second opinion
            for f, col, gv in (("weak", "element_weak", gweak if meta else None), ("resist", "element_resist", gres if meta else None)):
                ours = sorted(x.strip() for x in str(m.get(f) or "").split(",") if x.strip())
                wv = sorted(x.strip() for x in str((w or {}).get(col) or "").replace("None", "").split(",") if x.strip()) if w else None
                if wv is not None and ours != wv: D("monster", mid, f, m.get(f), (w or {}).get(col), wiki_url(w["page"]), nm)
                elif gv is not None and ours != gv: disagree("monster", mid, f, m.get(f), {"game": gv, "wiki": wv}, [url] + ([wiki_url(w["page"])] if w else []))
    ours_ids = set(by_id)
    for mid, w in wm_by_id.items():
        if mid in ours_ids or str(w.get("released") or "yes").lower() in ("no", "false", "0") or w.get("variant"): continue
        if ("monster", str(mid)) in IGNORE_NEW: continue
        if not any(s.get("monster_id") == w.get("name_en") for s in wspawn or []): continue   # not placed on any map yet
        new.append({"kind": "monster", "id": mid, "name": w.get("name_en"), "url": wiki_url(w["page"])})
    checked["monsters"] = n_m

    # ------------------------------------------------------------------ maps: spawns and exits, the wiki first, the game files second
    W = world.get("maps") or {}
    n_p = 0
    primary = set()
    id_name = {m.get("id"): page for page, m in W.items() if m.get("id")}
    mobname = {m["id"]: nm for nm, m in M.items() if m.get("id") and not m.get("variant")}
    if wmaps is not None:
        wpages = {w["page"]: w for w in wmaps}
        for page, w in wpages.items():
            if page not in W and ("map", page) not in IGNORE_NEW:
                new.append({"kind": "map", "id": num(w.get("id")), "name": page, "url": wiki_url(page)})
        for page in W:
            if page not in wpages: D("map", W[page].get("id"), "exists", page, None, None, "on our map list but not on the wiki")
    for page, m in W.items():
        url = wiki_url(page)
        n_p += wspawn is not None or wport is not None
        if wspawn is not None:
            ws = bag((s.get("monster_id"), num(s.get("spawn_count"), 0)) for s in wspawn if s.get("map_id") == page and not s.get("variant") and s.get("monster_id") in M)
            if bag((n, c) for n, c in m.get("mobs") or []) != ws:
                D("map", m.get("id"), "spawns", m.get("mobs"), ws, url, page); primary.add(("map", m.get("id"), "spawns"))
        if wport is not None:
            wp = sorted({p.get("to_map") for p in wport if p.get("src") == page and p.get("to_map")})
            if sorted({p[0] for p in m.get("portals") or []}) != wp:
                D("map", m.get("id"), "exits", sorted({p[0] for p in m.get("portals") or []}), wp, url, page); primary.add(("map", m.get("id"), "exits"))
        if not m.get("id"): continue
        g = get(f"{IO}/map/{m['id']}")
        if not isinstance(g, dict): continue
        checked["maps_game"] = checked.get("maps_game", 0) + 1
        # the game files as a second opinion: which maps the portals lead to, and which monsters spawn
        gx = sorted({id_name[p["toMap"]] for p in g.get("portals") or [] if isinstance(p, dict) and p.get("toMap") in id_name and p.get("toMap") != m["id"]})
        ours_x = sorted({p[0] for p in m.get("portals") or []})
        miss = [x for x in gx if x not in ours_x]
        if miss and ("map", m["id"], "exits") not in primary:
            disagree("map", m["id"], "exits", ours_x, {"game_exits_not_on_wiki": miss}, [url, f"{IO}/map/{m['id']}"])
        gm = sorted({mobname[x["id"]] for x in g.get("mobs") or [] if isinstance(x, dict) and x.get("id") in mobname and not x.get("hidden")})
        om = sorted({n for n, _ in m.get("mobs") or []})
        if gm != om and gm and ("map", m["id"], "spawns") not in primary:
            disagree("map", m["id"], "spawns", om, {"game_monsters": gm}, [url, f"{IO}/map/{m['id']}"])
    checked["maps"] = int(n_p)

    partial = bool(FAILED) or any(t is None for t in (wq, wqi, wqr, wqe, wmons, wmaps, wspawn, wport)) or glist is None
    out = {"at": int(time.time()), "checked": checked, "diff": diff, "new": new, "unconfirmed": unconf, "partial": partial,
           "failed": FAILED[:50], "seconds": int(time.time() - START),
           "sources": ["maplestory.io MCW game data", "MapleStory Classic Wiki (mapleclassic.wiki, CC BY-NC-SA 4.0)"]}
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump(out, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"checked {checked}; diff {len(diff)}, new {len(new)}, unconfirmed {len(unconf)}; {out['seconds']}s")
    for x in diff[:40]: print("DIFF", x["kind"], x["id"], x["field"], "ours:", json.dumps(x["ours"], ensure_ascii=False)[:120], "source:", json.dumps(x["source"], ensure_ascii=False)[:160])
    for x in new[:40]: print("NEW", x["kind"], x["id"], x["name"])
    if partial:
        print(f"PARTIAL: {len(FAILED)} source requests failed or ran past the time budget; not treating this run as a failure")
        return 0
    return 1 if diff or new else 0


if __name__ == "__main__":
    sys.exit(main())
