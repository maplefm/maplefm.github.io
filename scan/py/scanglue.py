"""Browser scanner glue. FM Watcher's own loop (watcher.look, watcher.handle_job, watcher.chores) runs here on the
frames of a shared game window, so the browser reads, matches, sends and earns exactly like the download. This file
only supplies what Windows gives the watcher: pictures of parts of the game (from the shared frame, through the
page worker's canvas), where the in-game pointer is, and where the game sits inside the shared picture.

step(t) -> JSON text: what changed this look (the shop read, a popup read, the channel, log lines, counts).
"""
import json, re, time, hashlib
from PIL import Image
import numpy as np
import fmparse, glyphs, watcher
from js import grab_rect, frame_info

CUR = json.load(open(watcher.HERE + "/cursor.json"))
ST = {"game": None, "fw": 0, "fh": 0, "L": None, "cfg": None, "cursor": None, "cur_t": 0.0, "find_t": 0.0, "log": [],
      "last_res": None, "sound": [], "started": False, "next_publish_ok": True}


class Jobs(list):
    """The watcher's job queue, run right after each look instead of on reader threads."""
    def put(self, x): self.append(x)
    def full(self): return len(self) >= 160
    def qsize(self): return len(self)


def _img(x, y, w, h):
    w, h = max(1, int(w)), max(1, int(h))
    buf = grab_rect(int(x), int(y), w, h)
    return Image.frombuffer("RGBA", (w, h), buf.to_bytes(), "raw", "RGBA", 0, 1).convert("RGB")


def _grab(game, box):
    l, t, r, b = box
    return _img(game[0] + l, game[1] + t, r - l, b - t)


def _cursor():
    c = ST["cursor"]
    return (c[0], c[1]) if c else None


def _log(line):
    ST["log"].append(line)
    if len(ST["log"]) > 200: del ST["log"][:100]


def _sound(kind):
    ST["sound"].append(kind)


DEFER = []
def _defer(fn, args):
    DEFER.append((fn, args))


def run_deferred():
    """Work the watcher would do on a side thread (fetching the hover list, uploading a popup picture): done here,
    after a look's result has gone back to the page, so a look is never held up by the network."""
    n = 0
    while DEFER and n < 4:
        fn, args = DEFER.pop(0); n += 1
        try: fn(*args)
        except Exception as e: _log("background error: " + str(e)[:200])
    return len(DEFER)


def init(name="", ign=""):
    """Load the watcher's store and settings, and point its hooks at the shared frame."""
    cfg = dict(watcher.load_config()) if hasattr(watcher, "load_config") else {}
    cfg.update({"publish": True, "save_review": False, "name": name, "ign": ign, "browser": True})
    ST["cfg"] = cfg
    watcher.HOOKS.update({"grab": _grab, "cursor": _cursor, "log": _log, "sound": _sound, "defer": _defer})
    watcher.check_update.last = float("inf")       # the page is always the newest version: nothing to update
    watcher.check_update.restart = False
    ST["store"] = watcher.Store(watcher.HERE + "/watcher_data_v2.json", cfg.get("keep_days", 14))
    ST["store"].hot_fraction = cfg.get("hot_fraction", 0.5)
    ST["L"] = watcher.LoopState()
    ST["jobs"] = Jobs()
    ST["started"] = True


def set_who(name="", ign=""):
    if ST["cfg"] is None: return
    ST["cfg"]["name"] = name; ST["cfg"]["ign"] = ign


# ---------------------------------------------------------------- where the game is in the shared picture

def plate_frame(crop):
    """The seller plate's 1-pixel white frame, exactly where it belongs in a shop window crop."""
    x0, y0 = fmparse.SHOP["plate"][0], fmparse.SHOP["plate"][1]
    px = crop.load()
    W = lambda p: p[0] >= 250 and p[1] >= 250 and p[2] >= 250
    N = lambda p: p[2] > p[0] + 30 and p[0] < 60
    try:
        return (all(W(px[x0, y]) for y in range(y0 + 4, y0 + 18)) and all(W(px[x, y0 + 3]) for x in range(x0 + 1, x0 + 20))
                and N(px[x0 + 1, y0 + 4]) and N(px[x0 + 2, y0 + 5]) and not W(px[x0 - 1, y0 + 8]))
    except IndexError:
        return False


def locate_game(fw, fh):
    """The game area inside the shared picture: the whole picture, or less a window border and title bar. Found from
    an open shop window, whose seller plate sits at a fixed spot relative to the game's centre."""
    best = None
    cands = sorted(((ox, oy) for oy in range(0, 48) for ox in range(0, 9)), key=lambda t: t[0] + t[1])
    for ox, oy in cands:
        game = (ox, oy, fw - 2 * ox, fh - oy)
        shop_box, _ = watcher.place(ST["cfg"], game)
        pl = fmparse.SHOP["plate"]
        crop = _img(game[0] + shop_box[0], game[1] + shop_box[1], pl[2] + 4, pl[3] + 4)
        if plate_frame(crop):
            best = game; break
    return best


# ---------------------------------------------------------------- the in-game pointer

def _find_hand(img, x0=0, y0=0):
    """The game's pointing hand in a picture: the first spot, top to bottom then left to right, where all but 3 of its
    outline pixels are near black. A quick pass over 8 spread outline pixels keeps only spots with 5 or more of them
    dark (a real hand misses at most 3), then those few are checked against the whole outline."""
    blk = CUR["black"]
    a = np.asarray(img)
    if a.ndim != 3: return None
    mx = max(dx for dx, dy in blk); my = max(dy for dx, dy in blk); ny = min(dy for dx, dy in blk)
    H, W = a.shape[0] - my + ny - 1, a.shape[1] - mx - 1
    if H <= 0 or W <= 0: return None
    dark = (a[..., 0] < 40) & (a[..., 1] < 40) & (a[..., 2] < 40)
    few = blk[::max(1, len(blk) // 8)][:8]
    cnt = np.zeros((H, W), np.int8)
    for dx, dy in few:
        cnt += dark[dy - ny:dy - ny + H, dx:dx + W]
    ys, xs = np.nonzero(cnt >= len(few) - 3)
    if not len(ys): return None
    full = np.zeros(len(ys), np.int16)
    for dx, dy in blk:
        full += dark[ys + (dy - ny), xs + dx]
    ok = np.nonzero(full >= len(blk) - 3)[0]
    if not len(ok): return None
    k = ok[0]                      # nonzero lists spots top to bottom, then left to right, like argwhere
    return int(x0 + xs[k]), int(y0 + ys[k] - ny)


def track_cursor(game):
    """Where the pointer is, in frame pixels. First over the shop list (where hovers matter most, and cheap to search);
    then around any item popup on screen, which opens next to the pointer."""
    L = ST["L"]
    shop_box, chat_box = watcher.place(ST["cfg"], game)
    S = fmparse.SHOP
    if time.time() - L.shop_seen < 3:
        x0, y0 = game[0] + shop_box[0], game[1] + shop_box[1] + int(S["row0"]) - 8
        h = int(S["pitch"] * S["rows"]) + 40
        c = _find_hand(_img(x0, y0, shop_box[2] - shop_box[0] + 30, h), x0, y0)
        if c: ST["cursor"] = c; ST["cur_t"] = time.time(); return
    # a popup somewhere (sell list, a linked item in chat): the pointer is at its top left corner
    small = frame_info(4)
    a = np.frombuffer(small.to_bytes(), np.uint8).reshape(-1, int(np.ceil(ST["fw"] / 4)), 4)[..., :3].astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    navy = (b - r >= 35) & (b >= 80) & (b <= 170) & (r <= 115) & (g <= 130)
    if navy.mean() > 0.003:
        ys, xs = np.nonzero(navy)
        cx, cy = int(np.median(xs)) * 4, int(np.median(ys)) * 4
        x0, y0 = max(0, cx - 420), max(0, cy - 420)
        c = _find_hand(_img(x0, y0, 840, 840), x0, y0)
        if c: ST["cursor"] = c; ST["cur_t"] = time.time(); return
    if time.time() - ST["cur_t"] > 2: ST["cursor"] = None


# ---------------------------------------------------------------- one look

def step():
    """One look at the shared frame, the same look FM Watcher takes, then its reading jobs and its chores."""
    t = time.time()
    fi = frame_info(0)
    fw, fh = int(fi[0]), int(fi[1])
    out = {"t": t}
    if not fw or not fh: return json.dumps({"why": "no frame"})
    if (fw, fh) != (ST["fw"], ST["fh"]) or ST["game"] is None:
        ST["fw"], ST["fh"] = fw, fh
        g = locate_game(fw, fh)
        ST["game"] = g or (0, 0, fw, fh)
        ST["game_found"] = bool(g)
    elif not ST.get("game_found") and t - ST["find_t"] > 5:
        ST["find_t"] = t
        g = locate_game(fw, fh)
        if g: ST["game"] = g; ST["game_found"] = True
    game = ST["game"]
    L, jobs, store, cfg = ST["L"], ST["jobs"], ST["store"], ST["cfg"]
    track_cursor(game)
    shops0 = watcher.fmparse.STATS.get("shops", 0)
    try:
        r = watcher.look(cfg, None, game, t, L, jobs, store)
        if r == "channel": out["channel"] = L.chw.last
    except Exception as e:
        out["error"] = "look: " + str(e)[:200]
    while jobs:
        kind, img, extra = jobs.pop(0)
        try:
            watcher.handle_job(cfg, kind, img, extra, store, len(jobs))
        except Exception as e:
            _log("reader error: " + str(e)[:200])
        if kind == "shop": out["shop"] = True
    try: watcher.chores(cfg, t, L, store)
    except Exception as e: out["error"] = "chores: " + str(e)[:200]
    out["busy"] = time.time() - L.shop_seen < 3          # a shop is open: look again soon
    out["ch"] = watcher.current_channel(cfg)
    out["game"] = list(game)
    if ST["log"]: out["log"] = ST["log"][:]; ST["log"].clear()
    if ST["sound"]: out["sound"] = ST["sound"][:]; ST["sound"].clear()
    return json.dumps(out)


def counts():
    try: return json.dumps(watcher.scan_stats(ST["store"]))
    except Exception as e: return json.dumps({"error": str(e)})


def publish():
    """Send now (the page is closing or stopping)."""
    S = ST["store"]
    if S is None: return False
    S.fresh = False; ST["L"].last_pub = time.time()
    return bool(watcher.send_inbox(ST["cfg"], S.published_docs()))


def save():
    S = ST["store"]
    if S is not None and S.dirty: S.dirty = False; S.save()
