"""Refuse to replace good data with a short pull. Compares the counts that matter in the new file with the copy
already published and fails when any falls more than 10% (a real game change that big is put through by hand with
DATACHECK_FORCE=1). Nov 5 2026: a guide that lost every NPC shop and 461 items passed the old "200 items" check.

  python3 tools/datacheck.py itemguide|world NEW.json OLD.json"""
import json, os, sys

def counts(kind, d):
    if kind == "itemguide":
        it = d.get("items") or {}
        return {"items": len(it), "with drops": sum(1 for v in it.values() if v.get("d")), "with quests": sum(1 for v in it.values() if v.get("q")),
                "with crafting": sum(1 for v in it.values() if v.get("c")), "with NPC shops": sum(1 for v in it.values() if v.get("s")),
                "quests": len(d.get("quests") or [])}
    maps, mobs = d.get("maps") or {}, d.get("mobs") or {}
    return {"maps": len(maps), "monsters": len(mobs), "portals": sum(len(m.get("portals") or []) for m in maps.values()),
            "NPCs on maps": sum(len(m.get("npcs") or []) for m in maps.values()), "monster spawns": sum(len(m.get("mobs") or []) for m in maps.values())}

def main():
    kind, new_p, old_p = sys.argv[1:4]
    new = counts(kind, json.load(open(new_p, encoding="utf-8")))
    try: old = counts(kind, json.load(open(old_p, encoding="utf-8")))
    except Exception: old = {}
    bad = []
    for k, v in new.items():
        o = old.get(k)
        print(f"{k}: {o if o is not None else '-'} -> {v}")
        if o and v < 0.9 * o: bad.append(f"{k} {o} -> {v}")
    if bad and os.environ.get("DATACHECK_FORCE") != "1":
        sys.exit(f"{kind} pull looks short, keeping the published copy: " + "; ".join(bad))

if __name__ == "__main__":
    main()
