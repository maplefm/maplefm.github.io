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


def _live(p):
    """a patch that only holds while maplestory.io still serves the old data set ("until_mcw")"""
    u = p.get("until_mcw")
    if not u: return True
    try:
        import mcwver
        return mcwver.base().rstrip("/").split("/")[-1] == str(u)
    except Exception:
        return True


def released_mobs():
    """{game id: (name, region)} for monsters a patch put in the game that the wiki may not list yet"""
    out = {}
    for p in patches():
        if not _live(p): continue
        for k, n in (p.get("released_mobs") or {}).items(): out[int(k)] = (n, p.get("region") or "")
    return out


def defense_changed():
    """{monster name: patch date} whose defense a patch changed without published numbers"""
    out = {}
    for p in patches():
        if not _live(p): continue
        for n in p.get("defense_changed") or []: out[n] = p.get("date") or ""
    return out


def drops_since():
    """{game id: first trusted drop report id} for monsters released by a patch: older reports came from a test server"""
    out = {}
    for p in patches():
        if not _live(p) or not p.get("drops_since_report"): continue
        for k in p.get("released_mobs") or {}: out[int(k)] = int(p["drops_since_report"])
    return out


def released_weapons():
    """names of weapons a patch released before maplestory.io has them (Nexon's notes)"""
    out = set()
    for p in patches():
        if not _live(p): continue
        out |= set(p.get("weapons") or [])
    return out


def map_rate(mid, rate):
    """(rate now, rate before the patch) for a map whose monster rate a patch changed, while the game files hold the old one"""
    for p in patches():
        if not _live(p): continue
        ch = (p.get("map_rate") or {}).get(str(mid))
        if ch and rate is not None and abs(float(rate) - ch["mobRate"][0]) < 0.01: return ch["mobRate"][1], ch["mobRate"][0], p.get("date") or ""
    return rate, None, ""
