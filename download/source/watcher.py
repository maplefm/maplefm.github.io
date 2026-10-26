"""FM Watcher: reads MapleStory's shop windows and chat off the screen and publishes prices.

It only looks at the screen. It never sends a key press or a click to the game and never
touches the game's files or memory.

  python watcher.py              run in the foreground (Ctrl+C to stop)
  python watcher.py --snapshot   save one annotated screenshot to the review folder and exit
"""
import sys, os, json, math, time, threading, queue, hashlib, datetime, re, difflib, traceback, base64, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
from PIL import Image, ImageDraw
import fmparse
try:
    import boards
except Exception:          # numpy missing: everything else still works
    boards = None

VERSION = "2026.10.26.1"

# Which stats an equip can carry: its base stats, plus what a scroll for its slot adds. Attack on earrings, boots or a
# hat means the popup on screen belonged to another item, so its stats are not attached; a big main stat the item
# doesn't have ("LUK 70" on a claw) is a requirement line read as a bonus and is dropped on its own.
_SCROLLABLE = {"Earrings": "STR DEX INT LUK AVOID", "Glove": "ATT MATT ACC", "Hat": "ACC HP MP", "Cape": "ACC DEX INT LUK MDEF STR WDEF", "Top": "WDEF HP MP",
               "Bottom": "WDEF HP MP", "Overall": "WDEF DEX INT LUK STR", "Shield": "ACC WDEF", "Shoes": "AVOID JUMP SPEED", "Pet Equipment": "JUMP SPEED", "Wand": "MATT", "Staff": "MATT"}
_WEAPON = re.compile(r"Sword|Axe|Blunt|Dagger|Spear|Pole Arm|Bow|Crossbow|Claw|Knuckle|Gun")
_STATS = ["ATT", "MATT", "STR", "DEX", "INT", "LUK", "HP", "MP", "WDEF", "MDEF", "ACC", "AVOID", "SPEED", "JUMP"]
_SMALL = {"STR": 15, "DEX": 15, "INT": 15, "LUK": 15, "ACC": 15, "AVOID": 15, "SPEED": 15, "JUMP": 15, "HP": 60, "MP": 60, "WDEF": 40, "MDEF": 40}
try:
    _FIT = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "statfit.json"), encoding="utf-8"))
except (OSError, ValueError):
    _FIT = {}
_FIT_LOW = {k.lower(): v for k, v in _FIT.items()}

def stats_fit(name, stats):
    """The stats this item can really have, or None when the popup was clearly another item's."""
    f = _FIT_LOW.get(re.sub(r"\s*\(.*$", "", str(name)).strip().lower())
    if not f or not stats: return stats
    sub, base, cash = f
    allow = set(base)
    if not cash: allow |= set((_SCROLLABLE.get(sub) or ("ATT" if _WEAPON.search(sub) else "")).split())
    out = dict(stats)
    for k in _STATS:
        if not stats.get(k): continue
        if k in allow and k not in base and stats[k] > _SMALL.get(k, 999) and not (stats.get(k + "_b") is not None and stats[k + "_b"] < stats[k]):
            out.pop(k, None); out.pop(k + "_b", None); continue    # a requirement line on a stat only scrolls give
        if k in allow: continue
        if k in ("ATT", "MATT"): return None
        if stats[k] > _SMALL.get(k, 0):
            out.pop(k, None); out.pop(k + "_b", None)
    return out
SITE = "https://maplefm.gg"
# anonymous price inbox: watchers without a token.txt send their prices here and a GitHub Action puts them on the site
# the price inbox: Club FM's own server, readable only by the site's jobs
INBOX_FORM = "https://clubfm-accounts.aaweaver93.workers.dev/inbox"
INBOX_FIELD = "m"
ACCOUNTS = "https://clubfm-accounts.aaweaver93.workers.dev"   # the Club FM accounts service for linking a watcher to a contributor account

DEFAULTS = {
    "window_title": "MapleStory",
    # boxes are [left, top, right, bottom] in pixels inside the game window
    "shop_region": [696, 311, 939, 707],
    "chat_region": [562, 683, 1121, 1018],
    "shop_every_seconds": 1.0,
    "chat_every_seconds": 4,
    "publish": True,
    "review_mode": False,           # true keeps everything on this PC and sends nothing
    "publish_every_minutes": 3,
    "hot_publish_seconds": 60,
    "hot_fraction": 0.5,
    "keep_days": 14,
    "save_review": True,
    "review_limit": 600,
    "github_repo": "maplefm/clubfm-archive",
    "github_path": "data/watcher.json",
    "github_branch": "live",
    "token_file": "token.txt",
    "room_region": [60, 20, 400, 60],
    "name": "",
    "inbox_every_minutes": 10,
}

def load_config():
    cfg = dict(DEFAULTS)
    p = os.path.join(HERE, "config.json")
    if os.path.exists(p):
        cfg.update(json.load(open(p, encoding="utf-8")))
        # Older versions wrote "publish": false into a new config.json, which quietly kept every price on the PC.
        # Sharing is now on unless review_mode is set on purpose.
        if not cfg.get("publish") and not cfg.get("review_mode"):
            cfg["publish"] = True
            try:
                saved = json.load(open(p, encoding="utf-8")); saved["publish"] = True
                json.dump(saved, open(p, "w", encoding="utf-8"), indent=2)
            except Exception:
                pass
    else:
        json.dump(DEFAULTS, open(p, "w", encoding="utf-8"), indent=2)
    if cfg.get("review_mode"):
        cfg["publish"] = False
    return cfg

def chime(ok=True):
    """A short sound so you know a hover was read (high) or missed (low) without looking at the log."""
    if not CFG_CHIME[0]: return
    def go():
        try:
            import winsound; winsound.Beep(1400 if ok else 500, 70 if ok else 140)
        except Exception: pass
    threading.Thread(target=go, daemon=True).start()
CFG_CHIME = [True]

# Equips the price board most needs a hover on (worth 50K+ and mostly listed without stats). Item names only,
# refreshed every 20 minutes. The watcher never moves the mouse: it only tells you which row to rest it on.
HW_URL = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/summary-public.json"
HW = {"items": {}, "at": 0.0}
BOARD_TYP = {}      # the board's typical price per item, refreshed with the hover-wanted list
# a weapon named on its own at a scroll's price is the scroll: "S> crossbow 90k" on a 5K bow
WEAPON_SCROLL = {"Crossbow": "Crossbow Attack Scroll", "Pole Arm": "Polearm Attack Scroll", "Spear": "Spear Attack Scroll",
                 "Dagger": "Dagger Attack Scroll", "Bow": "Bow Attack Scroll", "Wand": "Wand Magic Attack Scroll", "Staff": "Staff Magic Attack Scroll"}
CONFUSE = set("3895602")    # digits the reader mixes up in chat bubbles: 9 and 3, 6 and 5, 8 and 3
def chat_price(item, price):
    """Fix the two misreads the board can catch: a price written without its k ("125 ea" on a 125K scroll),
    and a weapon name standing in for its scroll. Returns (item, price)."""
    hover_wanted()
    t = BOARD_TYP.get(item) or 0
    if price < 1000 and t >= 10000 and 0.3 <= price * 1000 / t <= 3:
        price *= 1000
    sc = WEAPON_SCROLL.get(item)
    if sc and t and price > t * 8:
        st = BOARD_TYP.get(sc + ": Intermediate") or 0
        if st and 0.4 <= price / st <= 2.5:
            item = sc + ": Intermediate"
    return item, price
CUTMARK = re.compile(r"\s*\((?:name|tier) cut off\)$")
NEWSEEN = {}; NEWTRY = {}
def relearn(item):
    """A cut-off or misread name saved before its item was learned gets the full name when it goes out."""
    if not CUTMARK.search(item) and fmparse.norm(item) in fmparse._ITEM_NORM: return item
    return fmparse.learned_match(CUTMARK.sub("", item)) or item
def learn_new(res, tip_img):
    """A shop row we can't name (a brand-new item) plus its tooltip on screen: read the full name off the
    tooltip, learn it, and from then on that item is read, priced and uploaded with its icon like any other."""
    for row in res["rows"]:
        if row.get("known"): continue
        pre = CUTMARK.sub("", row["i"])
        hit = fmparse.learned_match(pre)
        if not hit and not CUTMARK.search(row["i"]): continue      # a full name we can read already goes up as is
        if not hit:
            if time.time() - NEWTRY.get(pre, 0) < 3: continue      # one tooltip read every few seconds per row
            NEWTRY[pre] = time.time()
            full = fmparse.tooltip_title(tip_img, pre)
            if not full: continue
            NEWSEEN[full] = NEWSEEN.get(full, 0) + 1
            if NEWSEEN[full] < (1 if len(pre.split()) >= 3 else 2): continue
            if fmparse.learn_item(full):
                log(f"new item: learned {full} from its tooltip. It goes on the board with its icon from now on.")
            hit = full
        row["i"] = hit; row["known"] = True
def digit_twins(a, b):
    """Two prices one misread digit apart: 30000 and 90000, 50000 and 60000."""
    a, b = str(a), str(b)
    if len(a) != len(b): return False
    diff = [(x, y) for x, y in zip(a, b) if x != y]
    return len(diff) == 1 and diff[0][0] in CONFUSE and diff[0][1] in CONFUSE
NUDGED = {}
def hover_wanted():
    if time.time() - HW["at"] > 1200:
        HW["at"] = time.time()
        try:
            req = urllib.request.Request(HW_URL + "?t=" + str(int(time.time())), headers={"User-Agent": "fm-watcher/" + VERSION})
            with urllib.request.urlopen(req, timeout=20) as r:
                j = json.loads(r.read().decode("utf-8"))
            HW["items"] = {str(x.get("i")): int(x.get("typ") or 0) for x in (j.get("hw") or j.get("items") or []) if x.get("i")}
            BOARD_TYP.clear(); BOARD_TYP.update({str(x["item"]): int(x.get("typ") or 0) for x in (j.get("rows") or []) if x.get("item") and x.get("typ")})
            fmparse.extend_aliases(list(BOARD_TYP))
            # names other scanners taught the board (new items included) help this watcher finish cut-off names too
            for n in BOARD_TYP:
                if " " in n and "cut off" not in n and "\u2026" not in n: fmparse._ITEM_NORM.setdefault(fmparse.norm(n), n)
        except Exception:
            pass
    return HW["items"]
def short_meso(v):
    return f"{v / 1e6:.1f}M" if v >= 1e6 else f"{v // 1000}K" if v >= 1000 else str(v)
def nudge():
    """Two rising notes: an item in this shop is on the hover-wanted list."""
    if not CFG_CHIME[0]: return
    def go():
        try:
            import winsound; winsound.Beep(900, 60); winsound.Beep(1300, 90)
        except Exception: pass
    threading.Thread(target=go, daemon=True).start()
def hover_nudge(res):
    wanted = hover_wanted()
    if not wanted: return
    seller = res.get("seller") or ""
    for n, r in enumerate(res.get("rows") or []):
        if r.get("so") or r.get("i") not in wanted: continue
        k = (seller, r["i"])
        if time.time() - NUDGED.get(k, 0) < 900: continue
        if res.get("tip") and res["tip"].get("row") == n: continue
        NUDGED[k] = time.time()
        typ = wanted.get(r["i"]) or 0
        log(f"hover wanted: rest your mouse on {r['i']} (row {n + 1})" + (f", sells for about {short_meso(typ)}" if typ else "") + ". The board has no stats for most of these yet.")
        nudge()
        return

def log(*a):
    line = datetime.datetime.now().strftime("%H:%M:%S ") + " ".join(str(x) for x in a)
    print(line, flush=True)
    try:
        with open(os.path.join(HERE, "watcher.log"), "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass

# ------------------------------------------------------------------ screen (Windows only)

def _exe_of(hwnd):
    import ctypes
    from ctypes import wintypes
    pid = wintypes.DWORD()
    ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    h = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid.value)   # PROCESS_QUERY_LIMITED_INFORMATION
    if not h:
        return ""
    try:
        buf = ctypes.create_unicode_buffer(520); n = wintypes.DWORD(520)
        if ctypes.windll.kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(n)):
            return buf.value.lower()
        return ""
    finally:
        ctypes.windll.kernel32.CloseHandle(h)

def find_game(title, exe="maplestory.exe"):
    """Return (left, top, width, height) of the game window's client area in screen pixels, or None."""
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.windll.user32
    found = []
    @ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd) or user32.IsIconic(hwnd):
            return True
        n = user32.GetWindowTextLengthW(hwnd)
        if n == 0:
            return True
        buf = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        if buf.value.strip().lower().startswith(title.lower()) and _exe_of(hwnd).endswith(exe.lower()):
            rc = wintypes.RECT(); user32.GetClientRect(hwnd, ctypes.byref(rc))
            pt = wintypes.POINT(0, 0); user32.ClientToScreen(hwnd, ctypes.byref(pt))
            if rc.right > 600 and rc.bottom > 400:
                found.append((pt.x, pt.y, rc.right, rc.bottom))
        return True
    user32.EnumWindows(cb, 0)
    return found[0] if found else None

def place(cfg, game):
    """Shop and chat regions for this window. The settings are measured on a 1920 x 1080 game.
    The shop window opens centred and the chat box sits above the centred status bar, so on
    another size the shop is kept relative to the centre and the chat to the bottom centre."""
    rw, rh = cfg.get("reference_size", [1920, 1080])
    w, h = game[2], game[3]
    if (w, h) == (rw, rh):
        return list(cfg["shop_region"]), list(cfg["chat_region"])
    dx, dyc, dyb = (w - rw) // 2, (h - rh) // 2, h - rh
    s, c = cfg["shop_region"], cfg["chat_region"]
    shop = [s[0] + dx, s[1] + dyc, s[2] + dx, s[3] + dyc]
    chat = [c[0] + dx, c[1] + dyb, c[2] + dx, c[3] + dyb]
    fit = lambda b: [max(0, b[0]), max(0, b[1]), min(w, b[2]), min(h, b[3])]
    return fit(shop), fit(chat)

def cursor_pos():
    """Where the mouse pointer is, in screen pixels. Reading it does not move it."""
    try:
        import ctypes
        from ctypes import wintypes
        pt = wintypes.POINT()
        if ctypes.windll.user32.GetCursorPos(ctypes.byref(pt)):
            return pt.x, pt.y
    except Exception:
        pass
    return None

def hovered_row(game, shop_box):
    """Which shop row the pointer is over (0 to 5), and the tooltip area next to it, in window pixels."""
    c = cursor_pos()
    if not c:
        return None, None
    cx, cy = c[0] - game[0], c[1] - game[1]
    S = fmparse.SHOP
    rx, ry = cx - shop_box[0], cy - shop_box[1]
    if not (4 <= rx <= S["x1"] + 8 and S["row0"] <= ry < S["row0"] + S["pitch"] * S["rows"]):
        return None, None
    idx = int((ry - S["row0"]) // S["pitch"])
    box = [max(0, cx - 10), max(0, cy - 340), min(game[2], cx + 380), min(game[3], cy + 520)]
    return idx, box

def tip_ready(game, shop_box, t, st={"pos": None, "since": 0, "shots": 0}):
    """While the pointer rests on a shop row, say when to read the item's tooltip: at about half a second (the game
    shows the tooltip after a short delay), then again at 1.2 and 2.5 seconds so the stats get voted on.
    A shop window that doesn't change on screen never triggers a normal read, so without this a hover could go unread."""
    c = cursor_pos()
    idx, tbox = hovered_row(game, shop_box)
    if not c or idx is None:
        st["pos"] = None; return None
    p = st["pos"]
    if p is None or abs(p[0] - c[0]) > 3 or abs(p[1] - c[1]) > 3:
        st.update(pos=(c[0], c[1]), since=t, shots=0); return None
    due = (0.45, 1.2, 2.5)
    if st["shots"] < len(due) and t - st["since"] >= due[st["shots"]]:
        st["shots"] += 1; return idx, tbox
    return None

def inv_ready(game, t, state={"pos": None, "since": 0, "done": None}):
    """True once the pointer has rested on one spot inside the game for most of a second, once per spot."""
    c = cursor_pos()
    if not c:
        return None
    cx, cy = c[0] - game[0], c[1] - game[1]
    if not (0 <= cx < game[2] and 0 <= cy < game[3]):
        state["pos"] = None; return None
    p = state["pos"]
    if p is None or abs(p[0] - cx) > 3 or abs(p[1] - cy) > 3:
        state["pos"] = (cx, cy); state["since"] = t; return None
    if t - state["since"] < 0.7 or state["done"] == p:
        return None
    state["done"] = p
    inv_ready.box = [max(0, cx - 10), max(0, cy - 20), min(game[2], cx + 380), min(game[3], cy + 500)]
    inv_ready.at = (cx, cy)
    return True

def tooltip_in(img):
    """The game's dark navy item popup somewhere in a picture, cut out; or None."""
    import numpy as np
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (b - r >= 35) & (b >= 80) & (b <= 170) & (r <= 115) & (g <= 130)
    if m.mean() < 0.02:
        return None
    # the biggest solid block of navy: rows where it's dense, then the columns dense within those rows
    rd = m.mean(axis=1); rows = np.where(rd > max(0.12, rd.max() * 0.5))[0]
    if len(rows) < 50:
        return None
    # the longest run of such rows
    runs, st = [], rows[0]
    for i in range(1, len(rows)):
        if rows[i] - rows[i - 1] > 6: runs.append((st, rows[i - 1])); st = rows[i]
    runs.append((st, rows[-1])); y0, y1 = max(runs, key=lambda t: t[1] - t[0])
    cd = m[y0:y1 + 1].mean(axis=0); cols = np.where(cd > 0.5)[0]
    if len(cols) < 100 or y1 - y0 < 50:
        return None
    x0, x1 = cols.min(), cols.max()
    return img.crop((max(0, x0 - 4), max(0, y0 - 4), min(img.width, x1 + 6), min(img.height, y1 + 6)))

def grab(sct, game, box):
    l, t, r, b = box
    shot = sct.grab({"left": game[0] + l, "top": game[1] + t, "width": r - l, "height": b - t})
    return Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

def quick_hash(img, size):
    small = img.convert("L").resize(size).point(lambda v: v >> 4)
    return hashlib.md5(small.tobytes()).hexdigest()

# ------------------------------------------------------------------ store

class Store:
    """Everything seen, kept on disk. Only confirmed rows are published."""
    def __init__(self, path, keep_days):
        self.path, self.keep_days, self.lock = path, keep_days, threading.Lock()
        self.d = {"shop": {}, "chat": {}, "sellers": {}, "icons": {}, "inv": {}}
        if os.path.exists(path):
            try: self.d.update(json.load(open(path, encoding="utf-8")))
            except Exception: log("could not read", path, "- starting fresh")
        self.dirty = False
        self._fix_names()
        self.ref = {}
        rp = os.path.join(HERE, "reference.json")
        if os.path.exists(rp):
            self.ref = json.load(open(rp, encoding="utf-8"))
        self.hot = False
        self.pending = {}
        self.hot_fraction = 0.5
        self.inv_changed = True

    def _fix_names(self):
        """One-time repairs for names the reader got wrong in earlier versions."""
        done = self.d.setdefault("fixes", [])
        if "lemona-v1" in done:
            return
        shop = self.d["shop"]
        for key in list(shop):
            day, seller, item, price, qty = json.loads(key)
            new = re.sub(r"^\d{1,4}\s+(?=[A-Za-z])", "", item)
            if new == "Lemon" and price / max(1, qty) >= 1000:
                new = "Lemona"                     # a thief glove that was being read as Lemon
            if new != item:
                nk = json.dumps([day, seller, new, price, qty])
                o = shop.pop(key)
                if nk in shop:
                    shop[nk]["reads"] += o["reads"]; shop[nk]["n"] = max(shop[nk]["n"], o["n"])
                else:
                    shop[nk] = o
        icons = self.d.get("icons", {})
        for name in list(icons):
            if name == "Lemon" or re.match(r"^\d", name):
                del icons[name]
        done.append("lemona-v1"); self.dirty = True

    def save(self):
        with self.lock:
            tmp = self.path + ".tmp"
            json.dump(self.d, open(tmp, "w", encoding="utf-8"))
            os.replace(tmp, self.path)

    def _seller(self, seller):
        """The reader spells a seller a few ways. Settle on the most common close spelling."""
        book = self.d["sellers"]
        book[seller] = book.get(seller, 0) + 1
        best, score = seller, book[seller]
        for name, n in book.items():
            if n > score and difflib.SequenceMatcher(None, seller.lower(), name.lower()).ratio() >= 0.78:
                best, score = name, n
        return best

    def _typical(self, item):
        """What an item sells for: the median of sold rows this watcher has seen, else the reference price."""
        sold = sorted(json.loads(k)[3] / max(1, json.loads(k)[4]) for k, o in self.d["shop"].items() if json.loads(k)[2] == item and o.get("so"))
        if len(sold) >= 3:
            return sold[len(sold) // 2]
        return None                         # not enough sales to call anything a deal

    def add_shop(self, res, when=None):
        """when: the moment the shop was on screen, for shops read from old video. Defaults to now."""
        now = when or time.time(); day = datetime.date.fromtimestamp(now).isoformat()
        if len(res["seller"]) < 3:
            return                      # could not read whose shop this is
        full = self.d.setdefault("fullnames", {})
        for r in res["rows"]:
            if "cut off" in r["i"] and r["i"] in full:
                r["i"] = full[r["i"]]; r["known"] = True
        with self.lock:
            if not when:                    # minutes spent reading shops, for the hourly scan stats (kept two days)
                mins = self.d.setdefault("mins", {}); m = str(int(now // 60)); mins[m] = mins.get(m, 0) + 1
                if len(mins) > 3000:
                    for k in sorted(mins)[:-2880]: del mins[k]
            seller = self._seller(res["seller"])
            # copies of the same item at the same price: count the sold ones and the open ones separately
            groups = {}
            for r in res["rows"]:
                g = groups.setdefault((r["i"], r["p"], r["q"]), {"S": 0, "U": 0, "known": False})
                g["S" if r["so"] else "U"] += 1
                g["known"] = g["known"] or r["known"]
            for (item, price, qty), g in groups.items():
                key = json.dumps([day, seller, item, price, qty])
                if key not in self.d["shop"] and g["U"] and g["known"] and not when:
                    typ = self._typical(item)
                    cut = 0.7 if typ and typ >= 10000 else self.hot_fraction   # pricier items: 30% off is worth a flip
                    if typ and price / max(1, qty) <= typ * cut:
                        self.hot = True             # a big deal: publish soon instead of waiting the usual interval
                o = self.d["shop"].setdefault(key, {"n": 1, "reads": 0, "first": now, "known": g["known"], "so": False, "so_reads": 0})
                o["reads"] += 1; o["last"] = max(o.get("last", 0), now)
                o["known"] = o["known"] or g["known"]
                o["n"] = max(o["n"], g["S"] + g["U"])
                if "nu" not in o and o["so"] and o["so_reads"] >= 2:      # saved by an older version as sold
                    o["ns"] = o["s_last"] = o["n"]; o["hi_t"] = now
                o["so_reads"] = o["so_reads"] + 1 if g["S"] else 0
                o["so"] = g["S"] > 0
                # sold slots stay in a shop until it closes. A sold count counts once two reads in a row agree on it;
                # when the shop later shows fewer for half an hour it was reopened, and what sold before is kept.
                conf = min(o.get("s_last", 0), g["S"]); o["s_last"] = g["S"]
                if conf >= o.get("ns", 0):
                    o["ns"] = conf; o["hi_t"] = now
                elif now - o.get("hi_t", now) > 1800:
                    o["sb"] = o.get("sb", 0) + o["ns"]; o["ns"] = conf; o["hi_t"] = now
                o["nu"] = g["U"]                    # still open, as of this read
                if res.get("room"): o["r"] = res["room"]
                if res.get("vod") and not o.get("v"): o["v"], o["vt"] = res["vod"]     # past broadcast id and second it was seen
                if res.get("ch"): o["c"] = res["ch"]
                elif "c" in o and res.get("room") and res["room"] != o.get("r"): del o["c"]
            self.dirty = True

    def add_tooltip(self, res):
        """Attach the stats from a hovered item's tooltip to that exact listing."""
        tip = res["tip"]; S = fmparse.SHOP
        y = int(round(S["row0"] + S["pitch"] * tip["row"]))
        day = datetime.date.fromtimestamp(res.get("when") or time.time()).isoformat()
        seller = self._seller_peek(res["seller"])
        cands = [r for r in res["rows"] if r.get("y") == y]
        if not cands:
            # the hovered row itself was covered; fall back to a single listing of that item from this seller
            same = [json.loads(k) for k in self.d["shop"] if json.loads(k)[1] == seller and json.loads(k)[0] == day]
            tn = fmparse.norm(re.sub(r"\s*\(\+\d+\)\s*$", "", tip["name"]))
            scored = sorted(((difflib.SequenceMatcher(None, fmparse.norm(k[2]), tn).ratio(), k) for k in same if fmparse.norm(k[2])[:8]), key=lambda x: -x[0])
            # the closest name wins when it's a clear match and clearly ahead of the next one
            # ("Green Starlight" next to "Red Starlight" in the same shop used to match both and give up)
            exact = [k for sc, k in scored if fmparse.norm(k[2]) == tn]
            if len({(k[2], k[3]) for k in exact}) == 1:
                cands = [{"i": exact[0][2], "p": exact[0][3], "q": exact[0][4]}]
            elif scored and scored[0][0] >= 0.8 and (len(scored) == 1 or scored[0][0] - scored[1][0] >= 0.08):
                k = scored[0][1]; cands = [{"i": k[2], "p": k[3], "q": k[4]}]
            else:
                # the hovered row hasn't read clearly yet: keep the stats and attach them once it does
                if tn and len(tn) >= 4:
                    self.pending[(seller, tn)] = (time.time(), tip)
                    return "pending"
                return None
        r = cands[0]
        a, b = fmparse.norm(r["i"]).replace("namecutoff", ""), fmparse.norm(tip["name"])
        if not (b.startswith(a[:10]) or difflib.SequenceMatcher(None, a, b[:len(a) + 2]).ratio() >= 0.7):
            # The pointer sits on this exact row. A scrolled item's title often reads badly ("mr Guardian ruta" for
            # 10 attack Work Gloves): when the title isn't any real item, the stats belong to the row under the pointer.
            # A title that clearly names another item still means the popup belongs to something else.
            if fmparse._known_name(tip["name"]) or any(fmparse.norm(r["i"])[:8] in fmparse.norm(l) for l in tip["lines"][:1]):
                if not any(a[:10] and a[:10] in fmparse.norm(l) for l in tip["lines"]):
                    return None
            tip = dict(tip, name=r["i"])
        # the stats have to be ones this item can carry, or the popup was another item's
        fixed = stats_fit(r["i"], tip["stats"])
        if fixed is None:
            log("hover skipped: those stats can't be on", r["i"])
            return None
        tip = dict(tip, stats=fixed)
        key = json.dumps([day, seller, r["i"], r["p"], r["q"]])
        with self.lock:
            o = self.d["shop"].get(key)
            if not o:
                return None
            # the same popup is read several times while the pointer rests; vote per stat so one misread does not stick
            reads = (o.get("xr") or [])[-5:] + [tip["stats"]]
            o["xr"] = reads
            vote = {}
            for rd in reads:
                for k, v in rd.items():
                    vote.setdefault(k, {}); vote[k][v] = vote[k].get(v, 0) + 1
            o["x"] = {k: max(c, key=lambda v: (c[v], v)) for k, c in vote.items()}
            if not o.get("xt") or len(tip["lines"]) >= len(o.get("xt", [])): o["xt"] = tip["lines"]
            if tip.get("job"): o["xj"] = tip["job"]
            # a cut-off name: the tooltip shows the whole thing, so use it from now on
            tname = re.sub(r"\s*\(\+\d+\)\s*$", "", tip["name"]).strip()
            if "cut off" in r["i"] and len(tname) > len(r["i"].split(" (")[0]):
                stem = fmparse.norm(r["i"].split(" (")[0])
                if fmparse.norm(tname).startswith(stem[:max(6, len(stem) - 2)]):
                    self.d.setdefault("fullnames", {})[r["i"]] = tname
                    nk = json.dumps([day, seller, tname, r["p"], r["q"]])
                    if nk not in self.d["shop"]:
                        self.d["shop"][nk] = self.d["shop"].pop(key)
                    for row in res["rows"]:
                        if row["i"] == r["i"]: row["i"] = tname; row["known"] = True
                    r = dict(r, i=tname)
            self.dirty = True
        return r["i"], r["p"]

    def flush_pending(self, res):
        """Stats read from a tooltip before its row read clearly: attach them now that the row is in."""
        if not self.pending:
            return []
        seller = self._seller_peek(res["seller"]); S = fmparse.SHOP; now = time.time(); hits = []
        for (sl, tn), (when, tip) in list(self.pending.items()):
            if now - when > 900:
                del self.pending[(sl, tn)]; continue
            if sl != seller:
                continue
            rows = [r for r in res["rows"] if r.get("y") is not None and fmparse.norm(r["i"]) == tn]
            if len({(r["i"], r["p"]) for r in rows}) != 1:
                continue
            t2 = dict(tip); t2["row"] = (rows[0]["y"] - S["row0"]) / S["pitch"]
            hit = self.add_tooltip({"tip": t2, "seller": res["seller"], "rows": res["rows"], "when": res.get("when")})
            if hit and hit != "pending":
                del self.pending[(sl, tn)]; hits.append(hit)
        return hits

    def _seller_peek(self, seller):
        book = self.d["sellers"]; best, score = seller, book.get(seller, 0)
        for name, n in book.items():
            if n > score and difflib.SequenceMatcher(None, seller.lower(), name.lower()).ratio() >= 0.78:
                best, score = name, n
        return best

    def add_inventory(self, tip):
        """An item the player hovered outside a shop, most likely in their own inventory: something to sell."""
        name = re.sub(r"\s*\(\+\d+\)\s*$", "", tip["name"]).strip()
        known = fmparse._known_name(name)
        clean = re.fullmatch(r"[A-Z][A-Za-z0-9' &:.-]{3,40}", name) and not re.search(r"[VY][VWY]|¥", name)
        if not known and not tip["stats"] and not clean:
            return False
        name = known or name
        stats = {k: v for k, v in tip["stats"].items() if k != "REQLV"}
        key = json.dumps([name, sorted(stats.items())])
        now = time.time()
        with self.lock:
            inv = self.d.setdefault("inv", {})
            for k in [k for k, o in inv.items() if now - o["t"] > 3 * 86400]:
                del inv[k]
            o = inv.get(key)
            if o:
                # hovered again: bump it back to the top, and back onto the list if it was removed on the site
                again = now - o["t"] > 20
                o["t"] = now; o["n"] = o.get("n", 1) + 1
                if again: self.dirty = True; self.inv_changed = True
                return "again" if again else False
            inv[key] = {"i": name, "x": stats, "xt": tip["lines"], "xj": tip.get("job", ""), "t": now, "n": 1}
            self.dirty = True; self.inv_changed = True
        return True

    def inventory_list(self):
        with self.lock:
            items = sorted(self.d.get("inv", {}).values(), key=lambda o: -o["t"])
        return [{"i": o["i"], "x": o["x"], "xt": o.get("xt", []), "xj": o.get("xj", ""), "t": int(o["t"])} for o in items if o.get("n", 1) >= 1]

    def add_icons(self, img, res):
        """Keep one icon per known item, from a row that is not greyed out. A frame with a skipped row
        may have the item popup over it, so those frames are not used."""
        if res["dropped"] and res.get("hovering"):
            return                      # an item popup may be covering a row
        icons = self.d.setdefault("icons", {})
        for r in res["rows"]:
            clean = re.fullmatch(r"[A-Z][A-Za-z0-9' &:.-]{2,40}", r["i"]) and not re.search(r"[VY][VWY]|¥", r["i"])
            if not (r["known"] or clean) or r["so"] or r["i"] in icons or "y" not in r or "cut off" in r["i"]:
                continue
            import io
            buf = io.BytesIO(); fmparse.crop_icon(img, r["y"]).save(buf, "PNG")
            icons[r["i"]] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
            self.dirty = True

    def add_chat(self, player, side, item, price, x=None):
        now = time.time(); day = datetime.date.today().isoformat()
        item, price = chat_price(item, price)
        with self.lock:
            key = json.dumps([day, player.lower(), side, item, price])
            o = self.d["chat"].setdefault(key, {"reads": 0, "first": now, "last_read": 0})
            if now - o["last_read"] >= 8:      # one read per capture
                o["reads"] += 1; o["last_read"] = now
            o["last"] = now
            if x: o["x"] = x                    # the roll written in the message, like (+3) or 55 att
            self.dirty = True

    def add_chat_tip(self, tip):
        """Stats of an item linked in trade chat and clicked open: attach them to the newest chat post for that item
        from the last few minutes."""
        name = re.sub(r"\s*\(\+\d+\)\s*$", "", tip["name"] or "").strip()
        tn = fmparse.norm(fmparse._known_name(name) or name)
        if len(tn) < 4:
            return None
        now = time.time(); best = None
        with self.lock:
            for key, o in self.d["chat"].items():
                day, player, side, item, price = json.loads(key)
                if now - o.get("last", 0) > 300:
                    continue
                ni = fmparse.norm(item)
                if ni == tn or (len(ni) >= 8 and (tn.startswith(ni) or ni.startswith(tn))):
                    if best is None or o.get("last", 0) > best[1].get("last", 0):
                        best = (key, o)
            if not best:
                return None
            key, o = best
            stats = stats_fit(json.loads(key)[3], {k: v for k, v in tip["stats"].items() if k != "REQLV"})
            if stats is None:
                return None
            if stats:
                x = dict(o.get("x") or {}); x.update(stats); o["x"] = x
            if tip.get("lines"): o["xt"] = tip["lines"]
            if tip.get("job"): o["xj"] = tip["job"]
            self.dirty = True
            day, player, side, item, price = json.loads(key)
            return item, player, price

    def _plausible(self, item, price):
        ref = BOARD_TYP.get(item) or self.ref.get(item)
        return ref is None or ref * 0.6 <= price <= ref * 6.0     # well under the going rate needs more readings

    def published_docs(self):
        cutoff = (datetime.date.today() - datetime.timedelta(days=self.keep_days)).isoformat()
        tz = datetime.datetime.now().astimezone()
        docs = {}
        with self.lock:
            for kind in ("shop", "chat"):
                for key in [k for k in self.d[kind] if json.loads(k)[0] < cutoff]:
                    del self.d[kind][key]
            for key, o in self.d["shop"].items():
                day, seller, item, price, qty = json.loads(key)
                if "nu" in o:
                    sold = o.get("sb", 0) + o.get("ns", 0)
                    opn = o["nu"] if o["reads"] >= (1 if o["known"] else 2) else 0
                    if not sold and not opn:
                        continue
                else:                                   # saved by an older version
                    need = 1 if (o["known"] and not o["so"]) else 2
                    if o["reads"] < need or (o["so"] and o["so_reads"] < 2):
                        continue
                    sold, opn = (o["n"], 0) if o["so"] else (0, o["n"])
                doc = docs.setdefault((day, "shop"), {"last": 0, "rows": []})
                doc["last"] = max(doc["last"], o["last"])
                row = {"s": seller, "i": relearn(item), "p": price, "q": qty}
                if o.get("r"): row["r"] = o["r"]
                if o.get("c"): row["c"] = o["c"]
                if o.get("v"): row["v"] = o["v"]; row["vt"] = o.get("vt", 0)
                if o.get("x"): row["x"] = o["x"]; row["xt"] = o.get("xt", [])
                if o.get("xj"): row["xj"] = o["xj"]
                if o.get("xn"): row["xn"] = o["xn"]
                row["t"] = int(o["last"])
                doc["rows"].extend([dict(row, so=True)] * sold + [row] * opn)
            # the same post read with one digit swapped (90K and 30K): keep the reading nearer the board's price
            twins = set()
            groups = {}
            for key in self.d["chat"]:
                day, player, side, item, price = json.loads(key)
                groups.setdefault((day, player, side, item), []).append((price, key))
            for (day, player, side, item), ps in groups.items():
                ref = BOARD_TYP.get(item) or self.ref.get(item)
                if not ref or len(ps) < 2: continue
                for pa, ka in ps:
                    for pb, kb in ps:
                        if pa < pb and digit_twins(pa, pb):
                            far = ka if abs(math.log(pa / ref)) > abs(math.log(pb / ref)) else kb
                            twins.add(far)
            for key, o in self.d["chat"].items():
                if key in twins: continue
                day, player, side, item, price = json.loads(key)
                need = 2 if self._plausible(item, price) else 4
                if o["reads"] < need:
                    continue
                doc = docs.setdefault((day, "chat"), {"last": 0, "rows": []})
                doc["last"] = max(doc["last"], o["last"])
                row = {"s": player, "i": item, "p": price, "q": 1, "t": int(o.get("last_read") or o["first"])}
                if side == "B": row["k"] = "b"
                if o.get("x"): row["x"] = o["x"]
                if o.get("xt"): row["xt"] = o["xt"]
                if o.get("xj"): row["xj"] = o["xj"]
                doc["rows"].append(row)
        out = []
        for (day, kind), doc in sorted(docs.items()):
            at = datetime.datetime.fromtimestamp(doc["last"], tz.tzinfo).isoformat(timespec="seconds")
            out.append({"at": at, "src": "watcher-" + kind, "rows": doc["rows"]})
        return out

# ------------------------------------------------------------------ publish

def publish_icons(cfg, store, state={"n": -1}):
    icons = dict(store.d.get("icons", {}))
    if len(icons) == state["n"]:
        return
    path = cfg["github_path"].replace(".json", "-icons.json")
    if publish(cfg, icons, path=path, what=f"{len(icons)} icons"):
        state["n"] = len(icons)

def publish(cfg, docs, path=None, what=None):
    """Upload, retrying when another uploader (a friend's watcher, a stream reader, the nightly report) committed
    to the same branch in the same moment: GitHub answers 409 then, and a fresh read of the file fixes it."""
    for attempt in range(4):
        r = _publish_once(cfg, docs, path, what, quiet=attempt < 3)
        if r != "retry":
            return r
        time.sleep(1 + attempt)
    return False

def _publish_once(cfg, docs, path=None, what=None, quiet=False):
    tok_path = os.path.join(HERE, cfg["token_file"])
    if not os.path.exists(tok_path):
        log("publish skipped: no", cfg["token_file"]); return False
    token = open(tok_path, encoding="utf-8").read().strip()
    body = json.dumps(docs, separators=(",", ":")).encode("utf-8")
    # Club FM's raw scans go to the private data repository; the public site repository only gets the finished,
    # encrypted data. Older configs still name the public one, so they are pointed at the private one here.
    repo = cfg["github_repo"]
    if repo.lower() in ("maplefm/maplefm.github.io", "maplefm/maplefm"): repo = "maplefm/clubfm-archive"
    api = f"https://api.github.com/repos/{repo}/contents/{path or cfg['github_path']}"
    hdr = {"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "User-Agent": "fm-watcher"}
    sha = None
    try:
        with urllib.request.urlopen(urllib.request.Request(api + "?ref=" + cfg["github_branch"], headers=hdr), timeout=30) as r:
            cur = json.load(r); sha = cur["sha"]
            if base64.b64decode(cur.get("content", "")) == body:
                return True
    except urllib.error.HTTPError as e:
        if e.code != 404:
            log("publish failed reading current file:", e.code, e.reason); return False
    payload = {"message": "Watcher update", "content": base64.b64encode(body).decode(), "branch": cfg["github_branch"]}
    who = {"name": "maplefm", "email": "maplefm@users.noreply.github.com"}
    payload["committer"] = who; payload["author"] = who
    if sha: payload["sha"] = sha
    try:
        req = urllib.request.Request(api, data=json.dumps(payload).encode(), headers=hdr, method="PUT")
        with urllib.request.urlopen(req, timeout=60) as r:
            r.read()
        log("published", what or (str(sum(len(d["rows"]) for d in docs)) + " rows")); return True
    except urllib.error.HTTPError as e:
        if e.code in (409, 422) and quiet:
            return "retry"
        log("publish failed:", e.code, e.reason, e.read()[:200]); return False
    except Exception as e:
        log("publish failed:", e); return False

def has_token(cfg):
    return os.path.exists(os.path.join(HERE, cfg["token_file"]))

def anon_id():
    p = os.path.join(HERE, "anon_id.txt")
    try:
        v = open(p, encoding="utf-8").read().strip()
        if re.fullmatch(r"[0-9a-f]{16}", v): return v
    except OSError:
        pass
    v = os.urandom(8).hex()
    open(p, "w", encoding="utf-8").write(v)
    return v

def anon_key():
    """A secret only this install knows. Every inbox post is signed with it, so nobody can post as this watcher
    without the file, and the inbox pins the first key it sees for an id."""
    p = os.path.join(HERE, "inbox_key.txt")
    try:
        v = open(p, encoding="utf-8").read().strip()
        if re.fullmatch(r"[0-9a-f]{64}", v): return v
    except OSError:
        pass
    v = os.urandom(32).hex()
    open(p, "w", encoding="utf-8").write(v)
    return v

def inbox_sig(key, sid, seq, k, n, z):
    import hmac
    return hmac.new(bytes.fromhex(key), ("%s|%s|%s|%s|%s" % (sid, seq, k, n, z)).encode(), "sha256").hexdigest()

def link_account(cfg):
    """config.json "link_code": "ABC123" (from the account page on maplefm.gg/earn) links this watcher to that
    account once, so its sales caught can be paid. Only the hashed id goes up, never the id or key."""
    code = str(cfg.get("link_code") or "").strip().upper()
    if not code or not ACCOUNTS: return
    import hashlib
    hid = hashlib.sha256(("fm-inbox:" + anon_id()).encode()).hexdigest()[:16]
    body = json.dumps({"code": code, "hid": hid}).encode()
    try:
        req = urllib.request.Request(ACCOUNTS + "/link", data=body, headers={"Content-Type": "application/json", "User-Agent": "fm-watcher/" + VERSION})
        with urllib.request.urlopen(req, timeout=30) as r:
            res = json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        try: res = json.loads(e.read().decode("utf-8", "replace"))
        except Exception: res = {"error": "HTTP %s" % e.code}
    except Exception as e:
        log("Couldn't reach Club FM to link this watcher (%s). It will try again next start." % e); return
    p = os.path.join(HERE, "config.json")
    try:
        saved = json.load(open(p, encoding="utf-8")); saved.pop("link_code", None)
        if res.get("ok"): saved["linked"] = res.get("name") or True
        json.dump(saved, open(p, "w", encoding="utf-8"), indent=2)
    except Exception:
        pass
    if res.get("ok"): log("This watcher is now linked to", res.get("name") or "your account", "on maplefm.gg. Sales you catch count toward pay.")
    else: log("Link code not accepted:", res.get("error") or "unknown error")

def send_inbox(cfg, docs, state={"sent": {}, "full": 0}):
    """No token.txt: post new and changed listings of the last two days to the anonymous inbox form. Club FM keeps
    its own copy and merges each post in, so only what changed goes up. Every 6 hours everything is sent once more,
    so a lost post fixes itself. Big posts are split into parts the inbox puts back together."""
    import zlib, urllib.parse
    # the first send after starting covers the last week, so scans that never went up (an older version, no
    # internet, sharing off) still reach the site; after that only the last two days
    back = 7 if not state.get("started") else 1
    keep = (datetime.date.today() - datetime.timedelta(days=back)).isoformat()
    docs = [d for d in docs if d["at"][:10] >= keep and d["rows"]]
    if time.time() - state["full"] > 6 * 3600:
        state["sent"] = {}; state["full"] = time.time()
    sent, out, mark = state["sent"], [], {}
    for d in docs:
        occ, rows = {}, []
        for r in d["rows"]:
            base = json.dumps([r.get("s"), r.get("i"), r.get("p"), r.get("q", 1), r.get("k", "")])
            o = occ.get(base, 0); occ[base] = o + 1
            key = d["at"][:10] + "|" + d["src"] + "|" + base + "|" + str(o)
            body = dict(r); t = body.pop("t", 0)
            sig = json.dumps(body, sort_keys=True)
            old = sent.get(key)
            # a listing seen again only goes up again when something about it changed, or once an hour
            if old and old[0] == sig and t - old[1] < 3600:
                continue
            r2 = dict(r); r2["_o"] = o; rows.append(r2); mark[key] = (sig, t)
        if rows:
            out.append({"at": d["at"], "src": d["src"], "rows": rows})
    if not out:
        state["started"] = True
        return True
    # posts of at most 1500 listings each, so none is too big for the form
    batches, cur, n = [], [], 0
    for d in out:
        for i in range(0, len(d["rows"]), 1500):
            chunk = d["rows"][i:i + 1500]
            if n + len(chunk) > 1500 and cur:
                batches.append(cur); cur, n = [], 0
            cur.append({"at": d["at"], "src": d["src"], "rows": chunk}); n += len(chunk)
    if cur:
        batches.append(cur)
    total = 0
    for bi, batch in enumerate(batches):
        raw = json.dumps(batch, separators=(",", ":"), sort_keys=True).encode("utf-8")
        z = base64.b64encode(zlib.compress(raw, 9)).decode()
        size = 24000                     # the inbox turns away posts over about 60,000 characters
        parts = [z[i:i + size] for i in range(0, len(z), size)] or [""]
        if len(parts) > 8:
            continue
        seq = int(time.time() * 1000) + bi
        sid, key = anon_id(), anon_key()
        for k, part in enumerate(parts):
            msg = json.dumps({"v": 3, "id": sid, "nm": str(cfg.get("name") or "")[:16], "ign": str(cfg.get("ign") or "")[:13], "ver": VERSION,
                              "seq": seq, "k": k, "n": len(parts), "z": part,
                              "sig": inbox_sig(key, sid, seq, k, len(parts), part), "reg": key}, separators=(",", ":"))
            body = urllib.parse.urlencode({INBOX_FIELD: msg}).encode()
            try:
                req = urllib.request.Request(INBOX_FORM, data=body, headers={"User-Agent": "fm-watcher/" + VERSION})
                with urllib.request.urlopen(req, timeout=60) as r:
                    r.read()
            except Exception:
                log("Couldn't send prices right now, trying again in a few minutes."); return False
        for d in batch:
            for r in d["rows"]:
                base = json.dumps([r.get("s"), r.get("i"), r.get("p"), r.get("q", 1), r.get("k", "")])
                key = d["at"][:10] + "|" + d["src"] + "|" + base + "|" + str(r["_o"])
                if key in mark: sent[key] = mark[key]
            total += len(d["rows"])
    log("sent", total, "new prices to Club FM (on the site in about 10 minutes)")
    state["started"] = True
    return True

def scan_stats(store, now=None):
    """New listings, shops and sales caught, for the last hour and for today, plus the pace per active hour.
    Active time is minutes in which a shop was actually read, so AFK and travel don't count against you."""
    now = now or time.time(); today = datetime.date.fromtimestamp(now).isoformat()
    with store.lock:
        shop = list(store.d.get("shop", {}).items()); mins = dict(store.d.get("mins", {}))
    def window(t0):
        rows = [(k, o) for k, o in shop if o.get("first", 0) >= t0]
        sellers = {json.loads(k)[1] for k, o in rows}
        sales = sum(o.get("ns", 0) + o.get("sb", 0) for k, o in rows)
        active = sum(1 for m in mins if int(m) * 60 >= t0)
        return {"listings": len(rows), "shops": len(sellers), "sales": sales, "active": active,
                "pace": round(len(rows) / (active / 60)) if active >= 5 else None}
    midnight = time.mktime(datetime.date.fromtimestamp(now).timetuple())
    return {"hour": window(now - 3600), "today": window(midnight), "at": now}
def stats_text(st):
    def line(w):
        return (f"{w['listings']:,} new listings · {w['shops']:,} shops · {w['sales']:,} sales caught · "
                f"{w['active']} active min" + (f" · {w['pace']:,} listings per active hour" if w["pace"] else ""))
    return "last hour: " + line(st["hour"]) + "\n         today:     " + line(st["today"])
def show_stats(cfg):
    store = Store(os.path.join(HERE, "watcher_data_v2.json"), cfg["keep_days"])
    st = scan_stats(store)
    print("FM Watcher scan stats, " + datetime.datetime.now().strftime("%b %d %I:%M %p"))
    print("  Last hour: " + stats_text(st).split("\n")[0][len("last hour: "):])
    print("  Today:     " + stats_text(st).split("\n")[1].strip()[len("today:"):].strip())
    print("  Active minutes count only time spent reading shops. The site's Scanner Ranks show your all-time totals.")

def export_csv(cfg):
    """Write everything this watcher has seen to my_scans.csv, one row per listing, for Excel or Google Sheets."""
    import csv
    store = Store(os.path.join(HERE, "watcher_data_v2.json"), cfg["keep_days"])
    docs = store.published_docs()
    out = os.path.join(HERE, "my_scans.csv")
    n = 0
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["Date", "Time", "Source", "Channel", "Room", "Seller", "Item", "Price", "Bundle", "Each", "Status", "Stats"])
        for d in sorted(docs, key=lambda d: d["at"]):
            kind = "trade chat" if d["src"] == "watcher-chat" else "shop"
            for r in sorted(d["rows"], key=lambda r: r.get("t", 0)):
                t = datetime.datetime.fromtimestamp(r.get("t", 0)) if r.get("t") else None
                q = r.get("q", 1) or 1
                status = "buying" if r.get("k") == "b" else "sold" if r.get("so") else "for sale"
                stats = " ".join(k + " " + str(v) for k, v in (r.get("x") or {}).items() if not k.startswith("_"))
                w.writerow([t.strftime("%Y-%m-%d") if t else "", t.strftime("%H:%M") if t else "", kind, r.get("c", ""),
                            r.get("r", ""), r.get("s", ""), r.get("i", ""), r.get("p", ""), q, round(r.get("p", 0) / q), status, stats])
                n += 1
    log("wrote", n, "listings to", out)
    log("Open it in Excel or Google Sheets. Close it before running this again.")

def ver_tuple(v):
    return tuple(int(x) for x in re.findall(r"\d+", str(v)))

RESTART_FOR_UPDATE = 75          # exit code that tells the launcher: patch me and start me again

def check_update(state={"told": None}):
    """Every 15 minutes, look at the version the site offers. Only reads a small file; never downloads code by itself.
    When a newer one is out and the launcher is running us, the main loop saves and hands back to the launcher, which
    patches the folder and starts the watcher again. Nobody has to touch anything."""
    try:
        req = urllib.request.Request(SITE + "/download/version.json?t=" + str(int(time.time())), headers={"User-Agent": "fm-watcher"})
        with urllib.request.urlopen(req, timeout=20) as r:
            v = json.load(r)
    except Exception:
        return
    new = str(v.get("version", ""))
    if ver_tuple(new) > ver_tuple(VERSION) and new != state["told"]:
        state["told"] = new
        log("=" * 64)
        log("For our fellow intel gatherers: update " + new + " is ready.")
        if v.get("notes"): log("Patch notes: " + v["notes"])
        if os.environ.get("FM_LAUNCHER") == "1":
            log("Updating in a moment. Your settings and saved prices are kept.")
            check_update.restart = True
        elif os.path.exists(os.path.join(HERE, "launcher.py")):
            log("To update, close this window and open start.bat again. Your settings are kept.")
        else:
            log("To update, download Club FM Watcher again from " + SITE + "/contribute.html")
            log("and copy your config.json into the new folder. After that it updates on its own.")
        log("=" * 64)

check_update.last = 0
check_update.restart = False

# ------------------------------------------------------------------ main loop

JOBWORDS = {"beginner", "warrior", "fighter", "page", "spearman", "magician", "wizard", "cleric", "bowman", "hunter", "crossbowman", "thief", "assassin", "bandit", "pirate",
            "crusader", "knight", "dragon", "mage", "priest", "ranger", "sniper", "hermit", "chief", "lv", "hp", "mp", "exp"}

def hud_name(sct, game, cfg, state={"votes": {}, "last": 0.0, "set": None, "dumped": False}):
    """Your character's name, read off the status bar at the bottom of the game (the small text under the
    LV box, below the job). Once the same name is read five times it becomes the scanner name, so nobody
    has to type it, and it rides along with the sales you catch. Only looks at the screen."""
    t = time.time()
    if cfg.get("name"): return cfg["name"]                       # a name in config.json is the name; nothing to read
    if t - state["last"] < 45 or state["set"]: return state["set"]
    state["last"] = t
    try:
        w, h = game[2], game[3]
        box = [0, max(0, h - int(h * 0.075)), w // 2, h]
        strip = grab(sct, game, box)
        if not state["dumped"]:
            state["dumped"] = True
            try: os.makedirs(os.path.join(HERE, "review"), exist_ok=True); strip.save(os.path.join(HERE, "review", "hud.png"))
            except Exception: pass
        import ocrlib
        lines = ocrlib.ocr_lines(strip, scale=4, psm=11)
        words = []
        for l in lines:
            for wd in re.findall(r"[A-Za-z][A-Za-z0-9]{3,12}", l["text"]):   # Maple names are 4 to 13 characters
                if wd.lower() in JOBWORDS: continue
                if l["x"] > strip.width * 0.6: continue
                words.append((l["y"], wd))
        if not words: return None
        # the name sits lowest in the LV block, under the job line
        words.sort()
        cand = words[-1][1]
        v = state["votes"]; v[cand] = v.get(cand, 0) + 1
        # five reads of the same spelling, and it has to be the clear winner, not one of several guesses
        if v[cand] >= 5 and v[cand] >= 0.7 * sum(v.values()):
            state["set"] = cand
            log("Your character is", cand + ". Sales you catch count under that name.")
            try:
                p = os.path.join(HERE, "config.json"); saved = json.load(open(p, encoding="utf-8"))
                if not saved.get("name"):
                    saved["name"] = cand; json.dump(saved, open(p, "w", encoding="utf-8"), indent=2)
            except Exception: pass
            if not cfg.get("name"): cfg["name"] = cand
            cfg["ign"] = cand
        return state["set"]
    except Exception as e:
        log("name read skipped:", e); return None

def current_channel(cfg):
    """The channel is not shown on screen, so the player types it in channel.txt.
    A number that has not been touched for a while is ignored so a stale one is not stamped on rows."""
    p = os.path.join(HERE, "channel.txt")
    try:
        if time.time() - os.path.getmtime(p) > cfg.get("channel_hours", 6) * 3600:
            return None
        m = re.search(r"\d{1,2}", open(p, encoding="utf-8", errors="ignore").read())
        n = int(m.group(0)) if m else 0
        return n if 1 <= n <= 40 else None
    except OSError:
        return None

def set_channel(n):
    try:
        open(os.path.join(HERE, "channel.txt"), "w", encoding="utf-8").write(str(n))
    except OSError:
        pass

class ChannelWatch:
    """Notices the game's Change Channel window. The highlighted button when it opens is the channel
    you are on. If the screen goes dark right after it closes, you changed channel, to the button that
    was highlighted last; if not, you cancelled. Either way channel.txt is kept up to date for you."""
    def __init__(self):
        self.open = False; self.first = None; self.last = None; self.closed = 0.0; self.saved = None; self.since = 0.0

    def box(self, game):
        w, h = game[2], game[3]
        return [max(0, w // 2 - 520), int(h * 0.18), min(w, w // 2 + 520), int(h * 0.82)]

    def step(self, sct, game, t):
        try:
            sel = fmparse.read_channel_dialog(grab(sct, game, self.box(game)))
        except Exception:
            sel = None
        if sel:
            if not self.open:
                self.open = True; self.first = sel; self.since = t
                self.save(sel, "on")
            self.last = sel
            # nobody keeps the window open for long; if it "stays open", it's something else on screen,
            # so keep reading shops and chat instead of waiting on it
            return t - self.since < 15
        if self.open:
            self.open = False; self.closed = t
            # the highlight moved to another channel before the window went away: clicking a channel button
            # is what closes the window, so that is a change (cancelling leaves the highlight where it was)
            if self.last and self.first and self.last != self.first:
                self.save(self.last, "changed to"); self.closed = 0
        if self.closed and t - self.closed < 8 and self.last and self.last != self.first:
            w, h = game[2], game[3]
            mid = grab(sct, game, [w // 4, h // 4, w * 3 // 4, h * 3 // 4]).convert("L").resize((32, 18))
            if sum(mid.getdata()) / (32 * 18) < 30:          # the loading screen between channels
                self.save(self.last, "changed to"); self.closed = 0
        elif self.closed and t - self.closed >= 8:
            self.closed = 0
        return False

    def save(self, n, how):
        if n != self.saved or how == "changed to":
            set_channel(n); self.saved = n
            log(f"channel {how} {n} (saved to channel.txt)")

def review_save(cfg, kind, img, reading):
    if not cfg["save_review"]:
        return
    d = os.path.join(HERE, "review"); os.makedirs(d, exist_ok=True)
    files = sorted(os.listdir(d))
    for f in files[:max(0, len(files) - cfg["review_limit"])]:
        try: os.remove(os.path.join(d, f))
        except OSError: pass
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
    img.save(os.path.join(d, f"{stamp}-{kind}.png"))
    json.dump(reading, open(os.path.join(d, f"{stamp}-{kind}.json"), "w", encoding="utf-8"), indent=1)

def worker(cfg, jobs, store):
    worker.room_hash = getattr(worker, "room_hash", None); worker.room_text = getattr(worker, "room_text", "")
    while True:
        kind, img, extra = jobs.get()
        try:
            if kind == "shop":
                res = fmparse.read_shop_checked(img)
                if res:
                    extra = extra or {}
                    # the minimap title barely changes between frames: read it once per look, not once per shop frame
                    try:
                        if extra.get("room") is None: res["room"] = ""
                        else:
                            rh = quick_hash(extra["room"], (40, 8))
                            if rh == worker.room_hash: res["room"] = worker.room_text
                            else: res["room"] = fmparse.read_room(extra["room"]); worker.room_hash, worker.room_text = rh, res["room"]
                    except Exception: res["room"] = ""
                    res["tip"] = None; res["hovering"] = extra.get("tip") is not None
                    if extra.get("tip") is not None:
                        try:
                            tip = fmparse.read_tooltip(extra["tip"])
                            if tip:
                                tip["row"] = extra["row"]; res["tip"] = tip
                                review_save(cfg, "tip", extra["tip"], tip)
                            elif extra.get("hover"):
                                review_save(cfg, "tipmiss", extra["tip"], {"row": extra["row"]}); chime(False)
                                log(f"hover: couldn't read a tooltip on row {extra['row'] + 1} yet")
                        except Exception as e:
                            log("tooltip error:", e)
                    # the channel when the shop was on screen, not when it got read: reading can run behind
                    res["ch"] = extra["ch"] if "ch" in extra else current_channel(cfg)
                    review_save(cfg, kind, img, res)
                    if extra.get("room") is not None and res["room"] != getattr(worker, "last_room", None):
                        worker.last_room = res["room"]; review_save(cfg, "room", extra["room"], {"room": res["room"]})
                    if res["rows"] and extra.get("tip") is not None:
                        try: learn_new(res, extra["tip"])
                        except Exception as e: log("new item error:", e)
                    if res["rows"]:
                        store.add_shop(res)
                        if res["tip"]:
                            hit = store.add_tooltip(res)
                            if hit == "pending": log(f"hover: read {res['tip']['name']}, stats saved until its row reads clearly")
                            elif hit:
                                log(f"read  {hit[0]} {hit[1]}: " + " ".join(f"{k} {v}" for k, v in res['tip']['stats'].items() if not k.endswith("_b")))
                                chime(True)
                                NUDGED[(res.get("seller") or "", res["tip"].get("name") or "")] = time.time() + 86400
                            else: log(f"hover: read {res['tip']['name']} but couldn't match it to a row in this shop")
                        for hit in store.flush_pending(res):
                            log(f"stats {hit[0]} {hit[1]} (from an earlier hover)")
                        try: hover_nudge(res)
                        except Exception as e: log("hover list error:", e)
                        try: store.add_icons(img, res)
                        except Exception as e: log("icon error:", e)
                        behind = jobs.qsize()
                        log(f"shop  {res['seller'] or '?':<14} {res['room'] or 'room ?':<8} {('ch ' + str(res['ch'])) if res['ch'] else 'ch ?':<6} {len(res['rows'])} rows read, {res['dropped']} unsure" + (f"  ({behind} still to read)" if behind >= 4 else ""))
            elif kind == "chattip":
                tip = fmparse.read_tooltip(img, need_stats=False)
                if tip:
                    review_save(cfg, "chattip", img, tip)
                    hit = store.add_chat_tip(tip)
                    if hit: log(f"chat  stats for {hit[0]} from {hit[1]} at {hit[2]:,}: " + " ".join(f"{k} {v}" for k, v in tip["stats"].items() if not k.endswith("_b")))
                    else: log(f"chat  read {tip['name']} but no recent chat post for it")
            elif kind == "inv":
                tip = fmparse.read_tooltip(img, need_stats=False)
                if tip:
                    review_save(cfg, "inv", img, tip)
                    added = store.add_inventory(tip)
                    if added:
                        log("sell list +" if added is True else "sell list (again)", tip["name"], " ".join(f"{k} {v}" for k, v in tip["stats"].items() if not k.endswith("_b")))
            elif kind == "board":
                hover_wanted()
                rh = quick_hash(extra["room"], (40, 8))
                if rh != getattr(worker, "board_hash", None):
                    worker.board_hash = rh; worker.board_room = fmparse.read_room(extra["room"])
                if worker.board_room != "FM Entrance":
                    continue
                posts = boards.read_boards(img, scale=img.height / 1080)
                for player, side, item, price, x in posts:
                    store.add_chat(player, side, item, price, x)
                if posts:
                    review_save(cfg, "board", img, {"rows": [list(p[:4]) for p in posts]})
                    log(f"board {len(posts)} chalkboard posts: " + ", ".join(f"{p[0]} {p[2]} {p[3]:,}" for p in posts[:4]) + (" ..." if len(posts) > 4 else ""))
            else:
                hover_wanted()
                msgs = fmparse.read_chat(img)
                found = []
                for player, msg in msgs:
                    for side, item, price, x in fmparse.parse_chat_message_x(msg):
                        store.add_chat(player, side, item, price, x); found.append([player, side, item, price] + ([x] if x else []))
                review_save(cfg, kind, img, {"messages": msgs, "rows": found})
                if found:
                    log(f"chat  {len(found)} priced messages")
        except Exception:
            log("reader error:", traceback.format_exc().splitlines()[-1])
        finally:
            jobs.task_done()

def snapshot(cfg):
    import mss
    game = find_game(cfg["window_title"])
    if not game:
        print("MapleStory window not found. Open the game first."); return
    d = os.path.join(HERE, "review"); os.makedirs(d, exist_ok=True)
    with getattr(mss, "MSS", mss.mss)() as sct:
        full = grab(sct, game, [0, 0, game[2], game[3]])
        draw = ImageDraw.Draw(full)
        shop_box, chat_box = place(cfg, game)
        grab(sct, game, shop_box).save(os.path.join(d, "snapshot-shop.png"))
        grab(sct, game, chat_box).save(os.path.join(d, "snapshot-chat.png"))
        draw.rectangle(shop_box, outline=(255, 0, 0), width=2)
        draw.rectangle(chat_box, outline=(0, 160, 255), width=2)
        full.save(os.path.join(d, "snapshot.png"))
    print("Saved review/snapshot.png. Game window is", game[2], "x", game[3], "pixels.")

def main():
    cfg = load_config(); CFG_CHIME[0] = cfg.get("hover_sound", True)
    if sys.platform == "win32":
        import ctypes
        try: ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception: pass
    if "--snapshot" in sys.argv:
        snapshot(cfg); return
    if "--export" in sys.argv:
        export_csv(cfg); return
    if "--stats" in sys.argv:
        show_stats(cfg); return
    link_account(cfg)
    import mss
    store = Store(os.path.join(HERE, "watcher_data_v2.json"), cfg["keep_days"])
    store.hot_fraction = cfg.get("hot_fraction", 0.5)
    jobs = queue.Queue(maxsize=160)
    # readers side by side, so a quick scroll through a busy shop doesn't pile up: two, or more on a bigger CPU
    for _ in range(max(1, int(cfg.get("readers") or min(4, max(2, (os.cpu_count() or 2) // 2))))):
        threading.Thread(target=worker, args=(cfg, jobs, store), daemon=True).start()
    log("FM Watcher", VERSION, "started. Publishing is", "ON" if cfg["publish"] else "OFF (review mode)")
    try:
        import ocrlib
        if not (os.path.exists(ocrlib.TESS) or __import__("shutil").which(ocrlib.TESS)):
            log("The Tesseract text reader is missing, so shops can't be read. Close this window, run install.bat, then start.bat again.")
    except Exception:
        pass
    if cfg["publish"] and not has_token(cfg):
        log("Prices you see go to Club FM automatically" + (" as " + cfg["name"] if cfg.get("name") else "") + ".")
        log("Your character's name is read off the screen once the game is open, so the ranks show your IGN with nothing to type.")
    cp = os.path.join(HERE, "channel.txt")
    if not os.path.exists(cp):
        open(cp, "w", encoding="utf-8").write("")
    log("channel:", current_channel(cfg) or "not known yet. Open the Change Channel window once and it is picked up.")
    last_shop_hash = last_chat_hash = None
    nudge_at = 0.0
    last_chat = last_save = last_board = 0.0
    last_pub = time.time()
    announced = None
    chw = ChannelWatch(); last_chw = 0.0
    with getattr(mss, "MSS", mss.mss)() as sct:
        while True:
            t = time.time()
            try:
                game = find_game(cfg["window_title"])
                if not game:
                    if announced is not False:
                        log("waiting for the MapleStory window"); announced = False
                    time.sleep(5)
                else:
                    if announced is not True:
                        log("watching MapleStory,", game[2], "x", game[3]); announced = True
                        log("shop area", place(cfg, game)[0], "chat area", place(cfg, game)[1])
                    shop_box, chat_box = place(cfg, game)
                    hud_name(sct, game, cfg)
                    if chw.open or chw.closed or t - last_chw >= 1.0:
                        last_chw = t
                        if chw.step(sct, game, t):
                            time.sleep(0.25); continue
                    shop = grab(sct, game, shop_box)
                    if fmparse.looks_like_shop(shop):
                        h = quick_hash(shop, (40, 66))
                        tr = tip_ready(game, shop_box, t)
                        if (h != last_shop_hash or tr) and not jobs.full():
                            extra = {"room": grab(sct, game, cfg["room_region"]), "ch": current_channel(cfg)}
                            if extra["ch"] is None and t - nudge_at > 600:
                                nudge_at = t; log("No channel known yet: open the Change Channel window once (Esc, then Change Channel) so these scans land on the right channel.")
                            idx, tbox = tr if tr else hovered_row(game, shop_box)
                            if idx is not None:
                                extra["row"] = idx; extra["tip"] = grab(sct, game, tbox); extra["hover"] = bool(tr)
                            last_shop_hash = h; jobs.put(("shop", shop, extra))
                    elif cfg.get("sell_hover", True) and inv_ready(game, t) is not None and not jobs.full():
                        cx, cy = inv_ready.at
                        cb = chat_box
                        if cb[0] - 20 <= cx <= cb[2] + 20 and cb[1] - 20 <= cy <= cb[3] + 20:
                            # an item linked in trade chat, clicked open: its stats belong to that chat listing,
                            # never to your sell list. The popup can open above the pointer, so look all around it.
                            area = [max(0, cx - 420), max(0, cy - 560), min(game[2], cx + 420), min(game[3], cy + 60)]
                            tipimg = tooltip_in(grab(sct, game, area))
                            if tipimg is not None:
                                jobs.put(("chattip", tipimg, None))
                        else:
                            box = inv_ready.box
                            tipimg = grab(sct, game, box)
                            if fmparse.looks_like_tooltip(tipimg):
                                jobs.put(("inv", tipimg, None))
                    elif boards and cfg.get("boards", True) and t - last_board >= cfg.get("board_every_seconds", 45) and jobs.qsize() < 2:
                        # Free Market Entrance: read the chat bubbles over everyone's head (the worker checks the map first)
                        last_board = t
                        jobs.put(("board", grab(sct, game, [0, 0, game[2], game[3]]), {"room": grab(sct, game, cfg["room_region"])}))
                    elif t - last_chat >= cfg["chat_every_seconds"]:
                        last_chat = t
                        chat = grab(sct, game, chat_box)
                        h = quick_hash(chat, (80, 48))
                        if h != last_chat_hash and not jobs.full():
                            last_chat_hash = h; jobs.put(("chat", chat, None))
                if int(t // 3600) != getattr(main, "stats_hour", None):
                    if getattr(main, "stats_hour", None) is not None:
                        try: log("scan stats, " + stats_text(scan_stats(store)))
                        except Exception as e: log("stats error:", e)
                    main.stats_hour = int(t // 3600)
                if store.dirty and t - last_save > 30:
                    store.dirty = False; store.save(); last_save = t
                if t - check_update.last > 900:
                    check_update.last = t; threading.Thread(target=check_update, daemon=True).start()
                if check_update.restart:
                    store.save()
                    log("Restarting to update...")
                    os._exit(RESTART_FOR_UPDATE)
                if cfg["publish"] and not has_token(cfg):
                    if t - last_pub > max(5, cfg.get("inbox_every_minutes", 10)) * 60:
                        last_pub = t; store.hot = False
                        threading.Thread(target=send_inbox, args=(cfg, store.published_docs()), daemon=True).start()
                    hot_due = False
                else:
                    hot_due = store.hot and t - last_pub >= cfg.get("hot_publish_seconds", 60)
                if cfg["publish"] and has_token(cfg) and (hot_due or t - last_pub > cfg["publish_every_minutes"] * 60):
                    if hot_due: log("hot deal spotted, publishing now")
                    store.hot = False
                    last_pub = t
                    publish(cfg, store.published_docs())
                    publish_icons(cfg, store)
                    if store.inv_changed:
                        if publish(cfg, store.inventory_list(), path=cfg["github_path"].replace(".json", "-sell.json"), what="sell list"):
                            store.inv_changed = False
            except KeyboardInterrupt:
                break
            except Exception:
                log("loop error:", traceback.format_exc().splitlines()[-1]); time.sleep(3)
            time.sleep(max(0.05, cfg["shop_every_seconds"] - (time.time() - t)))
    store.save()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
