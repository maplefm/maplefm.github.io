"""Game changes newer than the maplestory.io game files, from tools/gamepatch.json. A change applies only while the
game files still hold its old value, so it switches itself off once maplestory.io has the new files."""
import json, os

_P = None


def patches():
    global _P
    if _P is None:
        try: _P = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "gamepatch.json"), encoding="utf-8")).get("patches", [])
        except (OSError, ValueError): _P = []
    return _P


def mob(mid, meta):
    """meta: a monster's game-file stats (maplestory.io meta). Returns it with newer patch values applied, in place."""
    if not isinstance(meta, dict): return meta
    for p in patches():
        for f, ch in (p.get("mobs", {}).get(str(mid)) or {}).items():
            if isinstance(ch, list) and len(ch) == 2 and meta.get(f) == ch[0]: meta[f] = ch[1]
    return meta


def skill(sid, lv):
    """lv: a skill's per-level table as skilldata.py writes it. Returns it with newer patch values applied, in place."""
    if not isinstance(lv, dict): return lv
    for p in patches():
        for f, ch in (p.get("skills", {}).get(str(sid)) or {}).items():
            if isinstance(ch, list) and len(ch) == 2 and lv.get(f) == ch[0]: lv[f] = list(ch[1])
    return lv
