"""The site search index (data/sitesearch.json): every monster, item page, quest and map, with what the search box and
its preview show. Built by itempages.py right after the pages, so every result links to a page that exists.
Prices are the board's daily public typical, and only when the board states it as sure (firm): 3+ sales, nothing
flagged, not rough, not a lead. Anything else shows no number.

Shape (lists, to keep the file small):
  m: [name, slug, lv, hp, exp, weak, where, [drop names, best first], sprite id or 0]
  i: [name, slug or "", game id, kind, [dropped by], [quests that need it], typical or 0, sales]
  q: [name, slug, lv, area, giver, needs text, exp, meso]
  p: [name, slug, region, lv lo, lv hi, [[monster, count]]]
"""
import json, os


def build(out, world, guide, rows, page_of, qslug, bslug, mslug, firm, kinds=None, dbrow=None):
    world = world or {}; guide = guide or {}
    maps, mobs = world.get("maps") or {}, world.get("mobs") or {}
    items, quests = guide.get("items") or {}, guide.get("quests") or []
    # only what has a page on disk: a slug can exist for a monster that gets no page (a test dummy with no EXP)
    def page(kind, slug): return bool(slug) and os.path.exists(os.path.join(out, kind, slug, "index.html"))
    price = {}
    for r in rows or []:
        if isinstance(r, dict) and r.get("item") and firm(r): price[r["item"]] = (int(r["typ"]), int(r.get("salesN") or 0))

    # where each monster lives: its busiest maps
    homes = {}
    for mn, m in maps.items():
        for x in m.get("mobs") or []:
            if x and x[0] in mobs: homes.setdefault(x[0], []).append((x[1] or 0, mn))
    # what each monster drops, the ones worth the most first
    drops = {}
    for iname, g in items.items():
        for d in g.get("d") or []:
            if d and d[0]: drops.setdefault(d[0], []).append(iname)
    def worth(n): return price.get(n, (0, 0))[0]

    M = []
    for n, mb in sorted(mobs.items()):
        if mb.get("base") or n not in bslug or not page("monster", bslug[n]): continue          # job test copies share the base monster's page
        h = [p for _, p in sorted(homes.get(n, []), key=lambda x: -x[0])[:3]]
        where = ", ".join(h) if h else (mb.get("region") or "")
        dl = sorted(set(drops.get(n, [])), key=lambda x: (-worth(x), x))[:12]
        M.append([n, bslug[n], mb.get("lv") or 0, mb.get("hp") or 0, mb.get("exp") or 0, mb.get("weak") or "", where, dl,
                  0 if mb.get("nosprite") else (mb.get("id") or 0)])

    need_by = {}
    for q in quests:
        for x in (q.get("need") or []):
            if x and x[0]: need_by.setdefault(x[0], []).append(q.get("n"))
    I = []
    for n, s in sorted(page_of.items()):
        if not page("item", s): continue
        g = items.get(n) or {}
        row = (dbrow or {}).get(n)
        kind = (kinds[row[5]].split(":")[-1] if row and kinds and len(row) > 5 and row[5] < len(kinds) else "")
        by = []
        for d in g.get("d") or []:
            if d and d[0] and d[0] not in by: by.append(d[0])
        p = price.get(n, (0, 0))
        I.append([n, s, int(row[1]) if row else 0, kind, by[:4], sorted(set(need_by.get(n, [])))[:3], p[0], p[1]])

    Q = []
    for q in quests:
        if q.get("id") not in qslug or not page("quest", qslug[q["id"]]): continue
        need = []
        for k in q.get("kill") or []:
            if k and k[0]: need.append(f"hunt {k[1]} {k[0]}")
        for x in q.get("need") or []:
            if x and x[0]: need.append(f"bring {x[1]} {x[0]}")
        Q.append([q.get("n"), qslug[q["id"]], q.get("lv") or 0, q.get("a") or "", q.get("g") or "", ", ".join(need[:3]),
                  q.get("exp") or 0, q.get("meso") or 0])

    P = []
    for mn, s in sorted(mslug.items()):
        if not page("map", s): continue
        m = maps.get(mn) or {}
        lv = m.get("lv") or [None, None]
        P.append([mn, s, m.get("region") or "", lv[0] or 0, lv[1] or 0, [[x[0], x[1]] for x in (m.get("mobs") or [])[:6] if x]])

    doc = {"v": 1, "built": world.get("built") or "", "m": M, "i": I, "q": Q, "p": P}
    os.makedirs(os.path.join(out, "data"), exist_ok=True)
    path = os.path.join(out, "data", "sitesearch.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print("site search:", len(M), "monsters,", len(I), "items,", len(Q), "quests,", len(P), "maps,", os.path.getsize(path) // 1024, "KB")
    return path
