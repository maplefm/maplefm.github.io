"""Which copy of the Classic World game files to read on maplestory.io (region MCW).

maplestory.io lists its data sets at /api/wz. Classic's live data has been version "1" since launch; a patch may come
as a new version ("2", "1.3.0"). base() returns the newest numbered MCW version that is ready and actually answers,
so the builders pick a new data set up the day it appears. Test-server sets (CBT2 and the like) are never chosen.
MCW_VERSION in the environment pins a version. Anything unclear falls back to "1"."""
import os, re, json, urllib.request

ROOT = "https://maplestory.io/api/MCW/"
UA = {"User-Agent": "maplefm.gg game data (+https://maplefm.gg)"}
_V = None


def _get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:
        return None


def _key(v):
    return tuple(int(x) for x in v.split("."))


def pick(listing, probe=None):
    """the version to use from /api/wz's answer; probe(v) says whether that version really serves data"""
    vs = [str(x.get("mapleVersionId") or "") for x in (listing or []) if isinstance(x, dict)
          and x.get("region") == "MCW" and x.get("isReady") is not False]
    vs = sorted({v for v in vs if re.fullmatch(r"\d+(\.\d+)*", v)}, key=_key, reverse=True)
    for v in vs:
        if probe is None or probe(v): return v
    return "1"


def version():
    global _V
    if _V: return _V
    pin = os.environ.get("MCW_VERSION", "").strip()
    if pin:
        _V = pin; return _V
    def probe(v):
        m = _get(ROOT + v + "/mob")
        return isinstance(m, list) and len(m) > 50
    _V = pick(_get("https://maplestory.io/api/wz"), probe)
    return _V


def base():
    return ROOT + version()


if __name__ == "__main__":
    print(base())
