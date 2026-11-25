"""Stream Reader: reads Free Market shops off public MapleStory Classic streams on Twitch.

Every few minutes it looks at the live MapleStory channels on Twitch, picks the ones playing
MapleStory Classic, and watches up to a few of them at about one picture a second. When a
streamer opens a player shop, the shop is cut out of the picture and read by the same reader
FM Watcher uses on your own screen, and the prices are published for the guild site.

It only watches public video. It never touches the game, and no video is kept: pictures are
read in memory and thrown away, except shop crops and one picture per channel in
review_stream for checking, which are overwritten as it goes.

  python stream_reader.py                 run (Ctrl+C to stop)
  python stream_reader.py --list          show which live channels it would watch, then exit
  python stream_reader.py --test URL      read one channel or VOD without publishing, saving
                                          every shop it finds to review_stream for checking
        --start 1h02m30s                  where to start in a VOD
        --seconds 300                     how long to read in --test mode
"""
import sys, os, json, time, threading, queue, re, datetime, subprocess, traceback, hashlib, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
for _s in (sys.stdout, sys.stderr):
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception: pass
import numpy as np
from PIL import Image
import fmparse
import watcher as W

GQL = "https://gql.twitch.tv/gql"
# the public client id Twitch's own website uses for read-only directory requests
GQL_CLIENT = "kimne78kx3ncx6brgo4mv6wki5h1ko"
FRAME_W, FRAME_H = 1920, 1080

STREAM_DEFAULTS = {
    "max_streams": 15,                # channels watched at once in cheap 360p, about 0.7 Mbps each
    "max_full": 4,                    # of those, how many may switch to full quality while a shop is open (3 to 8 Mbps each)
    "check_minutes": 10,              # how often to look for channels that went live
    "frames_per_second": 1,
    "quality": "1080p60,1080p,936p60,900p60,900p,best",
    "title_must_match": r"classic|\bmscw\b|\bcw\b|國際服",
    "title_must_not_match": r"kronos|hyperion|reboot|heroic|bera|scania|aurora|elysium|luna\b|solis|not[- ]?classic|\bkms\b|\btms\b|\bgms\b|\bmsea\b|maplestorysea|\bjms\b|\bmsw\b|maplestory ?worlds?|maple ?worlds?|artale|bgm|24/7|arcane|bossing|dailies|weeklies|legion|mules?\b",
    "watch_untagged_english": True,   # also try English channels whose title does not say Classic; dropped if no Classic shop shows up
    "skip_non_latin_titles": True,    # Taiwan and Korea Classic run separate worlds with their own markets
    "channels_include": [],           # always watch these when live, even if the title does not say Classic
    "channels_exclude": [],           # streamers who asked to be left out
    "min_viewers": 0,
    "publish_path": "data/streams.json",
    "keep_minutes_without_shop": 45,  # move on from a channel that has not opened a shop in this long, if others are waiting
    "min_scale": 0.9,                 # a shop shown smaller than 90% of real size is too blurry to read
    "vod_days": 7,                    # past broadcasts newer than this are read by vods.bat
    "vod_channels": [],               # extra channels whose past broadcasts to read
}

LOGNAME = "stream.log"

def log(*a):
    line = datetime.datetime.now().strftime("%H:%M:%S ") + " ".join(str(x) for x in a)
    print(line, flush=True)
    try:
        with open(os.path.join(HERE, LOGNAME), "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass

W.log = lambda *a: log(*a)      # the shared publish code logs here too

def load_config():
    cfg = W.load_config()
    st = dict(STREAM_DEFAULTS); st.update(cfg.get("streams") or {})
    cfg["streams"] = st
    return cfg

# ------------------------------------------------------------------ finding channels

def live_channels(cfg):
    """Live MapleStory channels on Twitch, most viewers first: [{login, name, title, viewers}]."""
    q = 'query { game(name: "MapleStory") { streams(first: 100) { edges { node { title viewersCount broadcaster { login displayName } } } } } }'
    req = urllib.request.Request(GQL, data=json.dumps({"query": q}).encode(), headers={"Client-ID": GQL_CLIENT, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.load(r)
    edges = ((((j.get("data") or {}).get("game") or {}).get("streams") or {}).get("edges")) or []
    out = []
    for e in edges:
        n = e.get("node") or {}
        b = n.get("broadcaster") or {}
        if not b.get("login"):
            continue
        out.append({"login": b["login"].lower(), "name": b.get("displayName") or b["login"], "title": n.get("title") or "", "viewers": n.get("viewersCount") or 0})
    out.sort(key=lambda c: -c["viewers"])
    return out

def wanted(cfg, ch):
    st = cfg["streams"]
    login = ch["login"]
    if login in [c.lower() for c in st["channels_exclude"]]:
        return False, "opted out"
    if login in [c.lower() for c in st["channels_include"]]:
        return True, "on the include list"
    t = ch.get("title") or ""
    if st["skip_non_latin_titles"] and re.search(r"[぀-ヿ㐀-鿿가-힯]", t) and not re.search(r"mscw|classic ?world|國際服", t, re.I):
        return False, "not an English title"
    if re.search(r"經典版|经典版", t):
        return False, "Taiwan Classic server"
    if re.search(st["title_must_not_match"], t, re.I):
        return False, "title points to another version"
    if ch["viewers"] < st["min_viewers"]:
        return False, "too few viewers"
    if re.search(st["title_must_match"], t, re.I):
        return True, "Classic"
    if st["watch_untagged_english"]:
        return True, "maybe Classic"
    return False, "title does not say Classic"

# ------------------------------------------------------------------ finding the shop in a picture

_TPL = None
def template():
    """The shop's three buttons (Seller Info, Buy Item, Leave Store), at real size, in grey."""
    global _TPL
    if _TPL is None:
        import cv2
        t = np.array(Image.open(os.path.join(HERE, "shop_buttons.png")).convert("RGB"))
        _TPL = cv2.cvtColor(t, cv2.COLOR_RGB2GRAY)
    return _TPL

# where the template sits inside the shop crop that fmparse reads (243 x 396)
TPL_AT = (142, 52)
SHOP_W, SHOP_H = 243, 396
SCALES = [round(0.85 + 0.05 * k, 2) for k in range(24)]   # 0.85 to 2.0

def has_buttons(frame):
    """Cheap first look: a shop shows a block of orange button colour. Most pictures have none."""
    a = frame[::4, ::4].astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    orange = (r > 200) & (g > 90) & (g < 175) & (b < 100) & (r - b > 130)
    return int(orange.sum()) >= 25

def _match(g, tpl, s):
    import cv2
    t = cv2.resize(tpl, (max(8, int(round(tpl.shape[1] * s))), max(6, int(round(tpl.shape[0] * s)))), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    if t.shape[0] >= g.shape[0] or t.shape[1] >= g.shape[1]:
        return -1, (0, 0)
    r = cv2.matchTemplate(g, t, cv2.TM_CCOEFF_NORMED)
    _, mv, _, ml = cv2.minMaxLoc(r)
    return mv, ml

def find_shop(frame, hint=None, thresh=0.7):
    """Find a shop window in an RGB frame. Returns (x, y, scale, score) of the shop crop's top left, or None.
    hint is the scale found last time on this stream, tried first."""
    import cv2
    if not has_buttons(frame):
        return None
    g = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
    small = cv2.resize(g, (g.shape[1] // 2, g.shape[0] // 2), interpolation=cv2.INTER_AREA)
    tpl = template()
    order = SCALES if hint is None else sorted(SCALES, key=lambda s: abs(s - hint))[:5]
    best = None
    for s in order:
        mv, ml = _match(small, tpl, s / 2)
        if best is None or mv > best[0]:
            best = (mv, ml, s)
    if not best or best[0] < thresh - 0.08:
        return None
    # refine the size and the spot at full resolution, around the rough hit
    mv0, (mx, my), s0 = best
    pad = 24
    x0, y0 = max(0, mx * 2 - pad), max(0, my * 2 - pad)
    win = g[y0:y0 + int(tpl.shape[0] * (s0 + .1)) + 2 * pad, x0:x0 + int(tpl.shape[1] * (s0 + .1)) + 2 * pad]
    top = (-1, (0, 0), s0)
    for k in range(-8, 9):
        s = round(s0 + 0.008 * k, 4)
        if s <= 0.3:
            continue
        mv, ml = _match(win, tpl, s)
        if mv > top[0]:
            top = (mv, ml, s)
    mv, ml, s = top
    if mv < thresh:
        return None
    x = x0 + ml[0] - TPL_AT[0] * s
    y = y0 + ml[1] - TPL_AT[1] * s
    return int(round(x)), int(round(y)), round(s, 3), round(float(mv), 3)

def shop_hint(frame):
    """Rough look at a small, blurry picture: is a shop's button column on screen?
    Looks for a lime bar (Seller Info) with orange bars (Buy Item, Leave Store) of the same width below it."""
    import cv2
    hsv = cv2.cvtColor(frame, cv2.COLOR_RGB2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    orange = ((h >= 8) & (h <= 22) & (s > 90) & (v > 130)).astype(np.uint8)
    lime = ((h >= 26) & (h <= 44) & (s > 90) & (v > 110)).astype(np.uint8)
    no, _, so, _ = cv2.connectedComponentsWithStats(orange, 8)
    nl, _, sl, _ = cv2.connectedComponentsWithStats(lime, 8)
    for i in range(1, no):
        x, y, w, hh, a = so[i]
        if w < 6 or w < hh * 1.0 or w > hh * 10 or a < w * hh * 0.4:
            continue
        for j in range(1, nl):
            X, Y, Wl, Hl, A = sl[j]
            if Wl < 6 or abs(Wl - w) > max(3, w * 0.3) or abs(X - x) > max(3, w * 0.25):
                continue
            if 0 < y - Y < max(hh, Hl) * 6 and A > Wl * Hl * 0.4:
                return True
    return False

def shop_crop(frame, hit):
    """Cut the shop out and bring it back to real size so the normal reader can read it."""
    x, y, s = hit[0], hit[1], hit[2]
    w, h = int(round(SHOP_W * s)), int(round(SHOP_H * s))
    H, Wd = frame.shape[:2]
    if x < 0 or y < 0 or x + w > Wd or y + h > H:
        return None
    img = Image.fromarray(frame[y:y + h, x:x + w])
    if abs(s - 1) > 0.02:
        img = img.resize((SHOP_W, SHOP_H), Image.LANCZOS)
    return img

def find_tooltip(frame, hit):
    """An item tooltip next to the shop: the streamer resting the pointer on a listing. Returns
    (tooltip picture at real size, the shop row it belongs to or -99), or None. The tooltip is the game's
    dark navy box; it opens just below and right of the pointer, so the pointer sits at its top left corner."""
    import cv2
    x, y, s = hit[0], hit[1], hit[2]
    H, Wd = frame.shape[:2]
    x0, y0 = max(0, x), max(0, int(y + 120 * s))
    x1, y1 = min(Wd, int(x + (SHOP_W + 420) * s)), min(H, int(y + (SHOP_H + 320) * s))
    if x1 - x0 < 50 or y1 - y0 < 50:
        return None
    a = frame[y0:y1, x0:x1].astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = ((b - r >= 35) & (b >= 80) & (b <= 160) & (r <= 110) & (g <= 125)).astype(np.uint8)
    if m.mean() < 0.04:
        return None
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, _, st, _ = cv2.connectedComponentsWithStats(m, 8)
    best = None
    for i in range(1, n):
        bx, by, bw, bh, area = st[i]
        if bw >= 110 * s and bh >= 60 * s and area >= 0.5 * bw * bh and (best is None or area > best[4]):
            best = st[i]
    if best is None:
        return None
    cx, cy = x0 + best[0] + 10 * s, y0 + best[1] - 10 * s           # where the pointer is
    bx0, by0 = int(max(0, cx - 10 * s)), int(max(0, cy - 20 * s))
    bx1, by1 = int(min(Wd, cx + 380 * s)), int(min(H, cy + 500 * s))
    img = Image.fromarray(frame[by0:by1, bx0:bx1])
    if abs(s - 1) > 0.02:
        img = img.resize((max(1, int(img.width / s)), max(1, int(img.height / s))), Image.LANCZOS)
    S = fmparse.SHOP
    rx, ry = (cx - x) / s, (cy - y) / s
    row = int((ry - S["row0"]) // S["pitch"])
    if not (4 <= rx <= S["x1"] + 8 and 0 <= row < S["rows"]):
        row = -99
    return img, row, (int(cx) // 8, int(cy) // 8)

def channel_dialog(frame):
    """The Change Channel window in the middle of the picture: returns the highlighted channel, or None.
    Works on any picture size, 360p included, by scaling the middle of the frame to the game's own size."""
    try:
        H, W_ = frame.shape[:2]
        mid = frame[int(H * .18):int(H * .82), int(W_ * .2):int(W_ * .8)]
        # cheap gate: the window's grey buttons make a big patch of neutral light grey
        sm = mid[::4, ::4].astype(np.int16); r, g, b = sm[..., 0], sm[..., 1], sm[..., 2]
        if (((abs(r - g) < 8) & (abs(g - b) < 8) & (r > 160) & (r < 205)).mean() < 0.02):
            return None
        img = Image.fromarray(mid); k = 1040.0 / img.width
        return fmparse.read_channel_dialog(img.resize((1040, max(1, int(img.height * k))), Image.BICUBIC))
    except Exception:
        return None

def is_dark(frame):
    H, W_ = frame.shape[:2]
    return float(frame[H // 4:H * 3 // 4:4, W_ // 4:W_ * 3 // 4:4].mean()) < 30

class ChannelTracker:
    """Which channel a streamer is on, learned only when they open the Change Channel window.
    Opening it shows the channel they are on (highlighted). If the screen goes dark within 10 seconds of it
    closing, they moved to the last highlighted channel; if not, they cancelled."""
    KEEP = 4 * 3600
    def __init__(self):
        self.ch = None; self.ch_t = 0.0; self.open = False; self.first = self.last = None; self.closed = 0.0; self.events = []
    def step(self, frame, t):
        sel = channel_dialog(frame)
        if sel:
            if not self.open:
                self.open = True; self.first = sel; self.set(sel, t, "on")
            self.last = sel; return
        if self.open:
            self.open = False; self.closed = t
        if self.closed and t - self.closed < 10:
            if self.last and self.last != self.first and is_dark(frame):
                self.set(self.last, t, "changed to"); self.closed = 0
        elif self.closed:
            self.closed = 0
    def set(self, n, t, how):
        changed = n != self.ch
        self.ch, self.ch_t = n, t; self.events.append((t, n))
        return changed
    def at(self, t):
        """Channel at time t (for past broadcasts), from the last sighting before it."""
        best = None
        for et, n in self.events:
            if et <= t: best = (et, n)
        return best[1] if best and t - best[0] < self.KEEP else None
    def now(self, t):
        return self.ch if self.ch and t - self.ch_t < self.KEEP else None

ROOM_OK = re.compile(r"^(FM(\d{1,2}| Entrance)?|[A-Z][A-Za-z'.:-]+( [A-Za-z0-9'.:<>-]+){0,5})$")

def clean_room(name):
    """Keep Free Market rooms and map names that read cleanly (shops are opened in hunting maps too)."""
    name = (name or "").strip()
    if re.match(r"^FM(\d{1,2}| Entrance)?$", name): return name
    return name if name in fmparse._maps() else ""      # only a map the game has, spelled its way

def room_crops(frame, s=None):
    """The map name panel of the minimap, found by its light steel-blue colour anywhere in the top left
    of the picture (streams crop, scale and move the game, so a fixed spot does not work). Sky can be the same
    blue, so every band of that colour is a candidate, top first; the reader keeps the one that reads as a room.
    Each is the text part of the panel, icon cut off, scaled to the size the reader expects."""
    out = []
    try:
        H, W_ = frame.shape[:2]
        reg = frame[:int(H * .55), :int(W_ * .6)].astype(np.int16)
        r, g, b = reg[..., 0], reg[..., 1], reg[..., 2]
        m = (np.abs(r - 152) < 24) & (np.abs(g - 187) < 24) & (np.abs(b - 204) < 24)
        good = m.sum(1) > W_ * 0.025      # the text rows of a small minimap leave little panel colour showing
        bands, y = [], 0
        while y < len(good):
            if good[y]:
                y0, gap = y, 0
                while y < len(good) and gap <= 5:
                    gap = 0 if good[y] else gap + 1; y += 1
                y1 = y - gap
                if H * 0.025 <= y1 - y0 <= H * 0.15: bands.append((y0, y1))
            y += 1
        for y0, y1 in bands[:4]:
            cols = m[y0:y1].mean(0)
            # the panel is one block of columns: the widest run, not every blue column in the row
            on = cols > 0.35; xs = np.nonzero(on)[0]
            if len(xs) < W_ * 0.03: continue
            runs, st, pv = [], int(xs[0]), int(xs[0])
            for v in xs[1:]:
                if v - pv > 30: runs.append((st, pv)); st = int(v)
                pv = int(v)
            runs.append((st, pv))
            spans = [max(runs, key=lambda t: t[1] - t[0]), (int(xs.min()), int(xs.max()))]
            for x0, x1 in (spans if spans[0] != spans[1] else spans[:1]):
                c = _panel_text(frame, cols, y0, y1, x0, x1, W_)
                if c is not None: out.append(c)
    except Exception:
        pass
    return out

def _panel_text(frame, cols, y0, y1, x0, x1, W_):
    """One panel candidate: its text part, icon cut off, scaled to the size the reader expects."""
    if x1 - x0 < W_ * 0.03: return None
    # skip the map icon at the left of the panel: a run of columns that are mostly not panel colour
    low = cols[x0:x1] < 0.5; x = 0; lim = (x1 - x0) // 3
    while x < lim and not low[x]: x += 1
    if x < lim:
        e, gap = x, 0
        while e < len(low) and gap <= 2:
            gap = 0 if low[e] else gap + 1; e += 1
        e -= gap
        if e - x >= (y1 - y0) * 0.5: x0 = x0 + e + 1
    img = Image.fromarray(frame[y0:y1, x0:x1 + 1].astype(np.uint8))
    k = 44.0 / img.height
    return img.resize((max(1, int(img.width * k)), 44), Image.LANCZOS)

def room_crop(frame, s=None):
    c = room_crops(frame, s)
    return c[0] if c else None

def read_panel(crops):
    """The room or map from the first minimap panel candidate that reads as one, or ""."""
    fmseen = False
    for c in crops or []:
        r = clean_room(fmparse.read_room(c))
        if r == "FM": fmseen = True; continue
        if r: return r
    return "FM" if fmseen else ""

def bar_crops(frame, s=None):
    """The minimap minimized to its one-line title bar ("Hidden Street : Free Market <3>"): a light grey strip, as
    tall as 20 game pixels, near the top of the game. Streams move and scale the game, so it is found by its shape:
    rows whose light run (dark letters bridged) is long, starting at the same spot. s is the game's scale in this
    video. Every strip of that shape, top first (signs and chat boxes look alike; the reader keeps only a real title),
    each scaled to the size the reader expects."""
    try:
        s = s or 1.0
        H, W_ = frame.shape[:2]
        reg = frame[:int(H * .35), :int(W_ * .6)].astype(np.int16)
        mn, mx = reg.min(axis=2), reg.max(axis=2)
        m = ((mn > 185) & (mx - mn < 34)).astype(np.int8)
        gap = max(3, int(9 * s))
        need = int(150 * s)
        runs = []
        for y in range(m.shape[0]):
            row = m[y]; best = (0, 0); x = 0; W2 = len(row)
            idx = np.flatnonzero(row)
            if len(idx) < need * 0.6: runs.append(best); continue
            st = idx[0]; prev = idx[0]
            for v in idx[1:]:
                if v - prev > gap:
                    if prev - st > best[1] - best[0]: best = (st, prev)
                    st = v
                prev = v
            if prev - st > best[1] - best[0]: best = (st, prev)
            runs.append(best)
        y = 0; out = []
        while y < len(runs) and len(out) < 6:
            x0, x1 = runs[y]
            if x1 - x0 >= need:
                y0 = y
                while y < len(runs) and runs[y][1] - runs[y][0] >= need and abs(runs[y][0] - x0) <= 4 * s: y += 1
                if 13 * s <= y - y0 <= 28 * s:
                    x1 = max(r[1] for r in runs[y0:y]); pad = max(2, (y - y0) // 4)
                    img = Image.fromarray(frame[max(0, y0 - pad):y + pad, x0:x1 + 1].astype(np.uint8))
                    k = 30.0 / img.height
                    out.append(img.resize((max(1, int(img.width * k)), 30), Image.LANCZOS))
            else:
                y += 1
        return out
    except Exception:
        return []

def read_bar(frame, s=None):
    """The room or map from the minimized minimap's title bar in a stream picture, or ""."""
    for b in bar_crops(frame, s):
        r = fmparse.read_room_bar(b, trim=False)
        if r: return r
    return ""

# ------------------------------------------------------------------ pulling pictures from a stream

def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"

class Feed:
    """One channel's video, as RGB frames at a steady rate, decoded by ffmpeg from streamlink."""
    def __init__(self, cfg, url, start=None, duration=None, quality=None, size=(FRAME_W, FRAME_H), fps=None):
        st = cfg["streams"]
        self.w, self.h = size
        sl = [sys.executable, "-m", "streamlink", "--stdout", "--loglevel", "error", "--twitch-disable-ads"]
        if start:
            sl += ["--hls-start-offset", str(start)]
        if duration:
            sl += ["--hls-duration", str(duration)]
        sl += [url, quality or st["quality"]]
        ff = [ffmpeg_exe(), "-loglevel", "error", "-i", "pipe:0", "-an",
              "-vf", f"fps={fps or st['frames_per_second']},scale={self.w}:{self.h}:flags=lanczos",
              "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
        flags = 0x08000000 if sys.platform == "win32" else 0     # no extra console windows
        self.sl = subprocess.Popen(sl, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=flags)
        self.fflog = open(os.path.join(HERE, "stream_ffmpeg.log"), "a", encoding="utf-8", errors="ignore")
        self.ff = subprocess.Popen(ff, stdin=self.sl.stdout, stdout=subprocess.PIPE, stderr=self.fflog, creationflags=flags)
        self.sl.stdout.close()
        self.err = []
        threading.Thread(target=self._drain, daemon=True).start()

    def _drain(self):
        try:
            for line in self.sl.stderr:
                self.err = (self.err + [line.decode("utf-8", "ignore").strip()])[-5:]
        except Exception:
            pass

    def frames(self):
        n = self.w * self.h * 3
        while True:
            buf = self.ff.stdout.read(n)
            if not buf or len(buf) < n:
                return
            yield np.frombuffer(buf, np.uint8).reshape(self.h, self.w, 3)

    def error(self):
        return " | ".join(l for l in self.err if l)[-300:]

    def close(self):
        for p in (self.ff, self.sl):
            try: p.kill()
            except Exception: pass

# ------------------------------------------------------------------ watching

class Channel(threading.Thread):
    def __init__(self, cfg, login, name, jobs, test=None):
        super().__init__(daemon=True)
        self.cfg, self.login, self.name, self.jobs, self.test = cfg, login, name, jobs, test
        self.stop = False; self.scale = None; self.last_hash = None
        self.shops = 0; self.frames = 0; self.started = time.time(); self.last_shop = time.time()
        self.feed = None; self.title = ""; self.full = False; self.wants_full = False
        self.snooze_until = 0; self.last_small = None; self.last_sig = None; self.same = 0
        self.chan = ChannelTracker(); self.chan_logged = None

    def run(self):
        url = self.test["url"] if self.test else "https://www.twitch.tv/" + self.login
        fails = 0
        while not self.stop and fails < 3:
            t0 = time.time()
            if self.test or self.full:
                self.watch(url)
                if self.full: release_full(self); self.full = False
                if self.wants_full: fails = 0; continue
            else:
                self.scout(url)
                if self.wants_full and take_full(self):
                    self.full = True; self.wants_full = False; fails = 0
                    log(f"{self.name}: shop open, switching to full quality"); continue
                if self.wants_full:              # all full-quality slots busy; keep scouting
                    self.wants_full = False; fails = 0; time.sleep(5); continue
            if self.stop or self.test:
                break
            # Twitch video drops now and then (ads, a hiccup); pick it straight back up while the stream is live
            fails = 0 if time.time() - t0 > 90 else fails + 1
            time.sleep(5 if fails == 0 else 20)

    def scout(self, url):
        """Cheap 360p look, one picture a second. Hands over to full quality when a shop shows up."""
        try:
            self.feed = Feed(self.cfg, url, quality="360p30,360p,480p30,480p,worst", size=(640, 360), fps=1)
            seen = 0
            for frame in self.feed.frames():
                if self.stop: break
                self.frames += 1
                self.track_channel(frame)
                if time.time() >= self.snooze_until and shop_hint(frame) and small_match(frame) >= 0.75:
                    seen += 1
                    if seen >= 2:
                        self.wants_full = True; break
                else:
                    seen = max(0, seen - 1)
            if not self.stop and not self.wants_full:
                err = self.feed.error()
                log(f"{self.name}: video stopped" + (f": {err}" if err else ""))
        except Exception:
            log(f"{self.name}: error:", traceback.format_exc().splitlines()[-1])
        finally:
            if self.feed: self.feed.close()

    def track_channel(self, frame):
        self.chan.step(frame, time.time())
        n = self.chan.now(time.time())
        if n and n != self.chan_logged:
            log(f"{self.name}: on channel {n} (seen in the Change Channel window)"); self.chan_logged = n

    def watch(self, url):
        st = self.cfg["streams"]
        try:
            self.feed = Feed(self.cfg, url, start=self.test.get("start") if self.test else None)
            miss = 0; quiet = time.time()
            for frame in self.feed.frames():
                if self.stop:
                    break
                if self.full and time.time() - quiet > 90:      # shopping is over: back to the cheap look
                    log(f"{self.name}: no shop for 90s, back to 360p"); break
                self.frames += 1
                self.track_channel(frame)
                if self.test and self.frames > self.test["seconds"] * st["frames_per_second"]:
                    break
                if self.frames % 600 == 5:      # one small full picture every 10 minutes, for checking the setup
                    try:
                        d = os.path.join(HERE, "review_stream"); os.makedirs(d, exist_ok=True)
                        Image.fromarray(frame).save(os.path.join(d, f"frame-{self.login}.jpg"), quality=80)
                    except Exception: pass
                hit = find_shop(frame, self.scale)
                if not hit and self.scale is not None:
                    miss += 1
                    if miss % 5 == 0:
                        hit = find_shop(frame, None)
                if not hit:
                    continue
                miss = 0
                if hit[2] < st["min_scale"]:
                    if self.frames % 60 == 1:
                        log(f"{self.name}: shop seen but the video is too small to read (scale {hit[2]})")
                    continue
                self.scale = hit[2]
                shop = shop_crop(frame, hit)
                if shop is None:
                    continue
                if not fmparse.looks_like_shop(shop):
                    # a pixel or two off after scaling: nudge until the seller plate lines up
                    for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1), (2, 0), (-2, 0), (0, 2), (0, -2)]:
                        c2 = shop_crop(frame, (hit[0] + dx, hit[1] + dy, hit[2], hit[3]))
                        if c2 is not None and fmparse.looks_like_shop(c2):
                            shop = c2; break
                    else:
                        if hit[3] < 0.85:
                            continue
                if time.time() < self.snooze_until:          # parked in one shop: drop back to the cheap look
                    break
                h = W.quick_hash(shop, (40, 66))
                small = np.asarray(shop.convert("L").resize((61, 99)), dtype=np.int16)
                same = self.last_small is not None and np.abs(small - self.last_small).mean() < 5
                try: tip = find_tooltip(frame, hit)
                except Exception: tip = None
                new_tip = tip is not None and tip[2] != getattr(self, "last_tip", None)
                if self.jobs.full() or ((h == self.last_hash or same) and not new_tip):
                    continue
                if tip is not None: self.last_tip = tip[2]
                self.last_hash = h; self.last_small = small; self.last_shop = time.time(); quiet = time.time()
                self.jobs.put((self, shop, (room_crops(frame, hit[2]), bar_crops(frame, hit[2])), hit, tip))
            err = self.feed.error()
            if not self.stop:
                log(f"{self.name}: video stopped after {self.frames} pictures" + (f": {err}" if err else ""))
        except Exception:
            log(f"{self.name}: error:", traceback.format_exc().splitlines()[-1])
        finally:
            if self.feed: self.feed.close()

_full_lock = threading.Lock(); _full = set(); FULL_MAX = [4]
def take_full(ch):
    with _full_lock:
        if len(_full) >= FULL_MAX[0]: return False
        _full.add(ch.login); return True
def release_full(ch):
    with _full_lock:
        _full.discard(ch.login)

def review_save(kind, img, reading):
    d = os.path.join(HERE, "review_stream"); os.makedirs(d, exist_ok=True)
    files = sorted(os.listdir(d))
    for f in files[:max(0, len(files) - 400)]:
        try: os.remove(os.path.join(d, f))
        except OSError: pass
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
    img.save(os.path.join(d, f"{stamp}-{kind}.png"))
    json.dump(reading, open(os.path.join(d, f"{stamp}-{kind}.json"), "w", encoding="utf-8"), indent=1)

# ------------------------------------------------------------------ sure seller names
# A blurred stream plate fools the text reader now and then (DunaBeetle for DungBeetle, RovalRhythms): about a third
# of names in tests. A name counts as sure once it was read exactly, or once drawing it in the game's own plate font
# (plateverify.py) fits the picture better than every look-alike spelling and fits it well. Rows under a name that
# isn't sure yet go up marked su, and the board says the name may be misread.
SURE_FILE = os.path.join(HERE, "stream_sure_sellers.json")
_OLD_SURE = os.path.join(HERE, "stream_data", "sure_sellers.json")
SURE, _SURE_LOCK, _VTRIES = {}, threading.Lock(), {}
for _f in (_OLD_SURE, SURE_FILE):
    try: SURE.update({k: v for k, v in json.load(open(_f, encoding="utf-8")).items() if v in ("fit", "exact")})
    except Exception: pass
_VQ = queue.Queue(maxsize=40)
try: import plateverify as PV
except Exception: PV = None

def plate_reads(plate):
    """Several text reads of the plate's white letters (scales and thresholds), for plateverify to start from."""
    from PIL import ImageOps
    a = np.asarray(plate.convert("RGB")).astype(int); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    navy = (b > r + 25) & (b < 170) & (r < 90); ys, xs = np.where(navy)
    if len(xs) < 50: return []
    x0, x1, y0, y1 = xs.min() + 2, xs.max() - 1, ys.min() + 2, ys.max() - 1
    lum = ((r + g + b) / 3.0)[y0:y1, x0:x1].astype("uint8"); out = []
    for sc, th in ((4, 110), (6, 110), (8, 110), (4, 125), (6, 100), (8, 100), (4, 140), (6, 125), (8, 125)):
        big = Image.fromarray(lum).resize((lum.shape[1] * sc, lum.shape[0] * sc), Image.LANCZOS)
        m = ImageOps.expand(Image.fromarray(((np.asarray(big) <= th) * 255).astype("uint8")), border=16, fill=255)
        t = re.sub(r"[^A-Za-z0-9]", "", "".join(l["text"] for l in fmparse.ocr_lines(m, scale=1, psm=7, allow=fmparse._IGN_CHARS)))
        if fmparse._IGN.fullmatch(t): out.append(t)
    return out

def _sure_save():
    try:
        with _SURE_LOCK: d = dict(SURE)
        tmp = SURE_FILE + ".tmp"; json.dump(d, open(tmp, "w", encoding="utf-8")); os.replace(tmp, SURE_FILE)
    except Exception: pass

def verifier():
    while True:
        name, plate, who = _VQ.get()
        try:
            rd = plate_reads(plate)
            bn = PV.best_name(plate, rd) if rd else None
            fold = lambda x: x.replace("I", "l")
            if bn and fold(bn[0]) == fold(name) and bn[1] >= 0.85:
                with _SURE_LOCK: SURE[name] = "fit"
                _sure_save(); log(f"{who:<16} seller {name} is sure (fits the plate {bn[1]:.2f})")
            elif bn:
                log(f"{who:<16} seller {name} not sure yet (plate fits {bn[0]} best, {bn[1]:.2f})")
        except Exception:
            log("seller check error:", traceback.format_exc().splitlines()[-1])
        finally:
            _VQ.task_done()

def check_seller(res, shop, who):
    """Queue the shop's seller for the plate check, up to three different pictures per name."""
    s = res.get("seller") or ""
    if len(s) < 3 or s in SURE: return
    if res.get("fast"):                      # read straight off the pixels: exact
        with _SURE_LOCK: SURE[s] = "exact"
        _sure_save(); return
    # every new seller plate is kept small (about 1 KB) with its rows, to train the plate check on real stream video
    # later: pairing these with exact PC reads of the same shops gives the true name for each picture
    try:
        pd = os.path.join(HERE, "stream_data", "plates"); os.makedirs(pd, exist_ok=True)
        if _VTRIES.get(s, 0) < 3 and len(os.listdir(pd)) < 6000:
            stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
            shop.crop((10, 125, 106, 149)).save(os.path.join(pd, f"{stamp}.png"))
            json.dump({"read": s, "who": who, "scale": res.get("scale"), "rows": [[r["i"], r["p"]] for r in res.get("rows", [])][:12], "t": int(time.time())},
                      open(os.path.join(pd, f"{stamp}.json"), "w", encoding="utf-8"))
    except Exception: pass
    if PV is None or _VTRIES.get(s, 0) >= 3: return
    try:
        _VQ.put_nowait((s, shop.crop(PV.PLATE), who)); _VTRIES[s] = _VTRIES.get(s, 0) + 1
    except queue.Full:
        pass


class Stores:
    """One small store per streamer, so every price can be credited to the channel it came from."""
    def __init__(self, cfg, sub="stream_data"):
        self.cfg = cfg; self.d = {}
        self.dir = os.path.join(HERE, sub); os.makedirs(self.dir, exist_ok=True)
        for f in os.listdir(self.dir):
            if f.endswith(".json") and f not in ("channels.json", "vods_done.json", "live_seen.json", "placements.json", "sure_sellers.json"):
                self.get(f[:-5])

    def get(self, login):
        if login not in self.d:
            s = W.Store(os.path.join(self.dir, login + ".json"), self.cfg["keep_days"])
            s.hot_fraction = self.cfg.get("hot_fraction", 0.5)
            self.d[login] = s
        return self.d[login]

    def save(self):
        for s in self.d.values():
            if s.dirty:
                s.dirty = False; s.save()

    def docs(self, names):
        out = []
        for login, s in self.d.items():
            for doc in s.published_docs():
                if doc["src"] == "watcher-shop" and doc["rows"]:
                    doc["src"] = "stream-shop"; doc["by"] = names.get(login, login)
                    for r in doc["rows"]:
                        if r.get("s") not in SURE: r["su"] = 1      # the seller's name may be misread
                    out.append(doc)
        return out

    def icons(self):
        out = {}
        for s in self.d.values():
            for k, v in (s.d.get("icons") or {}).items():
                out.setdefault(k, v)
        return out

    def publish_icons(self, cfg, path, state):
        icons = self.icons()
        if len(icons) != state.get("n") and W.publish(cfg, icons, path=path, what=f"{len(icons)} icons"):
            state["n"] = len(icons)

    def hot(self):
        h = any(s.hot for s in self.d.values())
        for s in self.d.values(): s.hot = False
        return h

def read_tip(tip, rows=None):
    """Stats off a tooltip found next to a shop, or None."""
    if tip is None:
        return None
    try:
        hint = None
        try:
            yy = int(round(fmparse.SHOP["row0"] + fmparse.SHOP["pitch"] * tip[1]))
            hint = next((r["i"] for r in (rows or []) if r.get("y") == yy and r.get("known")), None)
        except Exception: pass
        try: t = fmparse.read_tooltip(tip[0], item=hint)
        except TypeError: t = fmparse.read_tooltip(tip[0])        # a watcher older than 2026.11.2.7
    except Exception:
        return None
    if not t or not t.get("stats"):
        return None
    t["row"] = tip[1]
    return t

def reader(cfg, jobs, stores, test):
    while True:
        ch, shop, room, hit, tip = jobs.get()
        try:
            res = fmparse.read_shop_checked(shop)
            if res:
                # the minimap's map name panel, or when the minimap is minimized, its one-line title bar. The same
                # picture as last time on this stream gives the same room, so it is read once
                try:
                    rimgs, bars = room if isinstance(room, tuple) else ([room] if room is not None else [], [])
                    pics = list(rimgs) + list(bars)
                    key = tuple(int(v) for p in pics[:3] for v in np.asarray(p.convert("L").resize((24, 6))).ravel() // 32)
                    rc = ch.__dict__.get("room_cache")
                    if rc and rc[0] == key: res["room"] = rc[1]
                    else:
                        r = read_panel(rimgs)
                        if not r or r == "FM":
                            for b in bars:
                                rb = clean_room(fmparse.read_room_bar(b, trim=False))
                                if rb: r = rb; break
                        res["room"] = r; ch.room_cache = (key, r)
                except Exception: res["room"] = ""
                res["tip"] = None; res["ch"] = ch.chan.now(time.time()) if hasattr(ch, "chan") else None
                res["stream"] = ch.login; res["scale"] = hit[2]; res["match"] = hit[3]
                # a blurry stream reads the same seller a little differently from frame to frame (Ipipmonkey,
                # lpipmonkey): the shop's own rows say it is the same shop, so the spelling most frames agree on wins
                try:
                    if len(res["rows"]) >= 2:
                        key = tuple(sorted((r["i"], r["p"]) for r in res["rows"]))[:4]
                        votes = ch.__dict__.setdefault("seller_votes", {})
                        v = votes.setdefault(key, {})
                        if res.get("seller") and len(res["seller"]) >= 3: v[res["seller"]] = v.get(res["seller"], 0) + 1
                        if len(votes) > 60: votes.pop(next(iter(votes)))
                        if v:
                            best = max(v, key=lambda x: (v[x], -abs(len(x) - 8)))
                            if v[best] >= 2 and best != res.get("seller"): res["seller"] = best
                except Exception:
                    pass
                check_seller(res, shop, ch.name)
                review_save(ch.login, shop, res)
                sig = (re.sub(r"[^a-z0-9]", "", (res["seller"] or "").lower())[:6], tuple((r["i"], r["p"], r["so"]) for r in res["rows"]))
                ch.same = ch.same + 1 if sig == ch.last_sig else 0
                ch.last_sig = sig
                if ch.same >= 3 and not test:
                    ch.snooze_until = time.time() + 20 * 60; ch.same = 3
                    log(f"{ch.name}: sitting in the same shop ({res['seller'] or '?'}), checking it again in 20 min")
                tipr = read_tip(tip, res.get("rows"))
                if res["rows"] and (ch.same <= 2 or test or tipr):      # a couple of repeat reads confirm sold rows
                    ch.shops += 1
                    if not test:
                        store = stores.get(ch.login)
                        store.add_shop(res)
                        try: store.add_icons(shop, res)
                        except Exception: pass
                        if tipr:
                            res["tip"] = tipr
                            hit2 = store.add_tooltip(res)
                            if hit2 and hit2 != "pending": log(f"{ch.name:<16} stats {hit2[0]} " + " ".join(f"{k} {v}" for k, v in tipr["stats"].items()))
                        for h3 in store.flush_pending(res):
                            log(f"{ch.name:<16} stats {h3[0]} (from an earlier hover)")
                    log(f"{ch.name:<16} shop {res['seller'] or '?':<14} {res['room'] or 'room ?':<8} {len(res['rows'])} rows, {res['dropped']} unsure (scale {hit[2]})")
        except Exception:
            log("reader error:", traceback.format_exc().splitlines()[-1])
        finally:
            jobs.task_done()

def write_status(chans, live, names):
    st = {"at": datetime.datetime.now().isoformat(timespec="seconds"),
          "watching": [{"channel": c.name, "minutes": round((time.time() - c.started) / 60), "frames": c.frames, "shops": c.shops} for c in chans.values()],
          "live_classic": [names.get(l, l) for l in live]}
    try: json.dump(st, open(os.path.join(HERE, "stream_status.json"), "w", encoding="utf-8"), indent=1)
    except OSError: pass

def run_test(cfg, url, start, seconds):
    jobs = queue.Queue(maxsize=20)
    threading.Thread(target=reader, args=(cfg, jobs, None, True), daemon=True).start()
    login = re.sub(r".*twitch\.tv/(videos/)?", "", url).strip("/").split("/")[0] or "test"
    ch = Channel(cfg, login, login, jobs, test={"url": url, "start": start, "seconds": seconds})
    log(f"test: reading {url} for {seconds}s" + (f" from {start}" if start else ""))
    ch.start(); ch.join(); jobs.join()
    log(f"test done: {ch.frames} pictures, {ch.shops} shops read. See the review_stream folder.")


# ------------------------------------------------------------------ past broadcasts

def gql(q):
    req = urllib.request.Request(GQL, data=json.dumps({"query": q}).encode(), headers={"Client-ID": GQL_CLIENT, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r).get("data") or {}

CHANNELS_FILE = os.path.join(HERE, "stream_data", "channels.json")
SEED_CHANNELS = ["maaateen", "tytykiller", "triciaisabirdy", "stal", "bidoof2d", "xypanda", "officialmrgimmick", "shamana", "noorimz", "lolnico",
                 "noteflakes", "240pr", "tevinwilliams", "orionfluxvt", "misusingtv", "skyjlv", "detrivance", "angelskimi", "itskellers", "haisayaka", "capypapar"]

LIVE_SEEN_FILE = os.path.join(HERE, "stream_data", "live_seen.json")

def load_live_seen():
    """{login: [[start, end], ...]}; anything else in the file is ignored."""
    try: d = json.load(open(LIVE_SEEN_FILE, encoding="utf-8"))
    except Exception: return {}
    out = {}
    for k, v in (d.items() if isinstance(d, dict) else []):
        if isinstance(v, list):
            spans = [x for x in v if isinstance(x, list) and len(x) == 2 and all(isinstance(n, (int, float)) for n in x)]
            if spans: out[k] = spans
    return out

def note_live_seen(logins, now):
    """Remember when each channel was watched live, so the past broadcast reader can skip what was already read."""
    d = load_live_seen()
    for login in logins:
        spans = d.setdefault(login, [])
        if spans and now - spans[-1][1] < 180: spans[-1][1] = now
        else: spans.append([now, now])
    cut = now - 9 * 86400
    d = {k: [x for x in v if x[1] > cut] for k, v in d.items()}
    d = {k: v for k, v in d.items() if v}
    try:
        tmp = LIVE_SEEN_FILE + ".tmp"; json.dump(d, open(tmp, "w", encoding="utf-8")); os.replace(tmp, LIVE_SEEN_FILE)
    except OSError:
        pass

def live_cover(seen, login, a, b):
    """Share of the time from a to b that the live reader was watching this channel."""
    if b <= a: return 0.0
    tot = sum(max(0, min(b, y) - max(a, x)) for x, y in seen.get(login, []))
    return tot / (b - a)

def known_channels():
    try: d = json.load(open(CHANNELS_FILE, encoding="utf-8"))
    except Exception: d = {}
    for c in SEED_CHANNELS: d.setdefault(c, c)
    return d

def remember_channels(chs):
    d = known_channels()
    for c in chs: d[c["login"]] = c["name"]
    try:
        os.makedirs(os.path.dirname(CHANNELS_FILE), exist_ok=True)
        json.dump(d, open(CHANNELS_FILE, "w", encoding="utf-8"), indent=1)
    except OSError: pass

def maple_parts(vid, length):
    """The stretches of a past broadcast spent in MapleStory, from its chapter markers: [(start s, length s)]."""
    q = 'query { video(id: "%s") { game { name } moments(momentRequestType: VIDEO_CHAPTER_MARKERS) { edges { node { positionMilliseconds durationMilliseconds details { ... on GameChangeMomentDetails { game { name } } } } } } } }' % vid
    v = gql(q).get("video") or {}
    edges = ((v.get("moments") or {}).get("edges")) or []
    parts = []
    for e in edges:
        n = e.get("node") or {}
        g = ((n.get("details") or {}).get("game") or {}).get("name") or ""
        if "maplestory" in g.lower():
            parts.append((n["positionMilliseconds"] // 1000, max(60, (n.get("durationMilliseconds") or 0) // 1000)))
    if not edges and "maplestory" in (((v.get("game") or {}).get("name")) or "").lower():
        parts = [(0, length)]
    return parts

def hms(sec):
    sec = int(sec); return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"

def scan_part(cfg, url, start, length, stopper, chan=None):
    """First pass at 360p: which seconds show a shop. Cheap on download (well under 1 Mbps).
    Also notes the channel whenever the Change Channel window is open (times are seconds into the video)."""
    hits = []
    feed = Feed(cfg, url, start=hms(start), duration=hms(length), quality="360p30,360p,480p30,480p,worst", size=(640, 360), fps=1)
    try:
        for k, frame in enumerate(feed.frames()):
            if stopper(): break
            if chan is not None: chan.step(frame, start + k)
            if shop_hint(frame) and small_match(frame) >= 0.75: hits.append(start + k)
    finally:
        feed.close()
    return hits

def small_match(frame):
    """How well the shop buttons match anywhere in a 640 x 360 picture, 0 to 1."""
    import cv2
    g = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY); tpl = template(); best = 0.0
    for s in (0.3, 0.333, 0.36, 0.4, 0.43, 0.47, 0.5, 0.55, 0.6, 0.67):
        t = cv2.resize(tpl, (int(tpl.shape[1] * s), int(tpl.shape[0] * s)), interpolation=cv2.INTER_AREA)
        best = max(best, float(cv2.matchTemplate(g, t, cv2.TM_CCOEFF_NORMED).max()))
    return best

def windows(hits, before=4, after=12):
    out = []
    for t in sorted(hits):
        a, b = max(0, t - before), t + after
        if out and a <= out[-1][1]: out[-1][1] = max(out[-1][1], b)
        else: out.append([a, b])
    return out

def probe(cfg, url, at, secs=12):
    """Pull a few seconds at full size and say whether a real shop window is in them."""
    feed = Feed(cfg, url, start=hms(at), duration=hms(secs), fps=1)
    try:
        for frame in feed.frames():
            if find_shop(frame): return True
    finally:
        feed.close()
    return False

def read_window(cfg, url, a, b, born, login, stores, stats, chan=None):
    """Second pass at full size over one stretch where a shop showed, read like live video.
    If the same shop is read 3 times in a row (a parked or AFK shop), it stops reading every frame
    and only looks for 20 seconds every 5 minutes, going back to normal reading if the shop changes."""
    pos, base, parked = a, None, 0
    while pos < b - 1:
        if base is None:
            stop, sig = _read_span(cfg, url, pos, b, born, login, stores, stats, None, chan)
            if stop is None: return
            base = sig; pos = stop + 300; parked += 1
            log(f"vod {login}: same shop ({sig[0] or '?'}) sitting there, skimming every 5 min")
        else:
            stop, sig = _read_span(cfg, url, pos, min(b, pos + 20), born, login, stores, stats, base, chan)
            if stop is not None and sig != base:
                base = None                       # shop changed, read normally from here
            else:
                pos += 300
    if parked: log(f"vod {login}: skimmed {parked} parked stretch(es)")

def _read_span(cfg, url, a, b, born, login, stores, stats, base, chan=None):
    """Reads [a,b). Normal mode (base None): returns (t, sig) after 3 identical reads in a row, else (None, None).
    Skim mode (base set): returns (t, sig) on the first readable shop, else (None, None)."""
    st = cfg["streams"]; fps = 2
    feed = Feed(cfg, url, start=hms(a), duration=hms(b - a), fps=fps)
    scale, last, last_sig, same = None, None, None, 0
    try:
        for k, frame in enumerate(feed.frames()):
            hit = find_shop(frame, scale) or (find_shop(frame, None) if scale else None)
            if not hit or hit[2] < st["min_scale"]: continue
            scale = hit[2]
            shop = shop_crop(frame, hit)
            if shop is None: continue
            if not fmparse.looks_like_shop(shop):
                for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (2, 0), (-2, 0), (0, 2), (0, -2)]:
                    c2 = shop_crop(frame, (hit[0] + dx, hit[1] + dy, hit[2], hit[3]))
                    if c2 is not None and fmparse.looks_like_shop(c2): shop = c2; break
            h = W.quick_hash(shop, (40, 66))
            if h == last and base is None: continue
            last = h
            res = fmparse.read_shop_checked(shop)
            if not res or not res["rows"]: continue
            sig = (re.sub(r"[^a-z0-9]", "", (res["seller"] or "").lower())[:6], tuple((r["i"], r["p"], r["so"]) for r in res["rows"]))
            t = a + k / fps
            if base is not None:
                if sig == base: return t, sig
                same = 0
            else:
                same = same + 1 if sig == last_sig else 0
                last_sig = sig
                if same >= 3: return t, sig
            try:
                res["room"] = read_panel(room_crops(frame, scale))
                if not res["room"] or res["room"] == "FM": res["room"] = read_bar(frame, scale) or res["room"]
            except Exception: res["room"] = ""
            res["room"] = clean_room(res["room"])
            res["ch"] = chan.at(t) if chan is not None else None; res["tip"] = None
            try: tipr = read_tip(find_tooltip(frame, hit), res.get("rows"))
            except Exception: tipr = None
            vm = re.search(r"/videos/(\d+)", url)
            if vm: res["vod"] = (vm.group(1), int(t))               # so the site can link straight to this moment
            when = born + t
            check_seller(res, shop, login)
            stores.get(login).add_shop(res, when=when)
            try: stores.get(login).add_icons(shop, res)
            except Exception: pass
            res["when"] = when
            if tipr:
                res["tip"] = tipr
                stores.get(login).add_tooltip(res)
            stores.get(login).flush_pending(res)
            stats["shops"] += 1; stats["rows"] += len(res["rows"])
            review_save(login + "-vod", shop, dict(res, at=datetime.datetime.fromtimestamp(when).isoformat(timespec="seconds")))
            if base is not None: return t, sig      # a different shop showed up while skimming
    finally:
        feed.close()
    return None, None

def run_vods(cfg):
    global LOGNAME
    LOGNAME = "vods.log"
    st = cfg["streams"]; stores = Stores(cfg, "vod_data"); icon_state = {}
    done_file = os.path.join(HERE, "stream_data", "vods_done.json")
    try: done = json.load(open(done_file, encoding="utf-8"))
    except Exception: done = {}
    threading.Thread(target=verifier, daemon=True).start()
    log("Past broadcast reader started. Reading the last", st["vod_days"], "days of Classic channels, newest first.")

    def listing():
        chans = known_channels()
        for c in st["vod_channels"]: chans.setdefault(c.lower(), c)
        for c in st["channels_exclude"]: chans.pop(c.lower(), None)
        todo = []
        for login, name in chans.items():
            try:
                q = 'query { user(login: "%s") { displayName videos(first: 20, type: ARCHIVE, sort: TIME) { edges { node { id title createdAt lengthSeconds status } } } } }' % login
                u = gql(q).get("user") or {}
            except Exception as e:
                log(f"{name}: could not list videos: {e}"); continue
            for e in ((u.get("videos") or {}).get("edges") or []):
                v = e["node"]
                born = datetime.datetime.fromisoformat(v["createdAt"].replace("Z", "+00:00")).timestamp()
                if time.time() - born > st["vod_days"] * 86400 or v["id"] in done: continue
                if (v.get("status") or "").upper() == "RECORDING": continue     # still live; the live reader has it
                todo.append((born, login, u.get("displayName") or name, v))
        todo.sort(key=lambda t: -t[0])
        return todo

    todo, listed = [], 0
    while True:
        # list again every hour, so a broadcast that just ended goes to the front instead of waiting days behind old ones
        if not todo or time.time() - listed > 3600:
            todo = listing(); listed = time.time()
            log(f"{len(todo)} past broadcasts to read, newest first")
            if not todo:
                log("Caught up. Checking for new past broadcasts in an hour.")
                for _ in range(60): restart_if_updated("while caught up"); time.sleep(60)
                continue
        born, login, name, v = todo.pop(0)
        if v["id"] in done: continue
        url = "https://www.twitch.tv/videos/" + v["id"]
        cover = live_cover(load_live_seen(), login, born, born + (v.get("lengthSeconds") or 0))
        if cover >= 0.85:
            log(f"{name}: {(v.get('title') or 'untitled broadcast')[:60]} ({datetime.datetime.fromtimestamp(born):%b %d}), skipped: the live reader watched {round(cover * 100)}% of it")
            done[v["id"]] = {"channel": login, "at": born, "shops": 0, "live": round(cover, 2)}
            try: json.dump(done, open(done_file, "w", encoding="utf-8"), indent=1)
            except OSError: pass
            continue
        try:
            parts = maple_parts(v["id"], v.get("lengthSeconds") or 0)
        except Exception as e:
            log(f"{name} {v['id']}: no chapters: {e}"); parts = []
        mins = sum(p[1] for p in parts) // 60
        log(f"{name}: {(v.get('title') or 'untitled broadcast')[:60]} ({datetime.datetime.fromtimestamp(born):%b %d}), {mins} minutes of MapleStory" + (f", {round(cover * 100)}% already watched live" if cover >= 0.05 else ""))
        stats = {"shops": 0, "rows": 0}; hits = []; chan = ChannelTracker()
        t0 = time.time()
        for a, n in parts:
            hits += scan_part(cfg, url, a, n, lambda: False, chan)
        if chan.events: log(f"  channel seen: " + ", ".join(f"{n} at {hms(et)}" for et, n in chan.events[:8]))
        wins = windows(hits)
        log(f"  quick pass: {len(hits)} seconds with a shop on screen, {len(wins)} stretches to read, took {round((time.time() - t0) / 60)} min")
        seen = load_live_seen()
        for a, b in wins:
            if live_cover(seen, login, born + a, born + b) >= 0.9:
                log(f"  skipped {round((b - a) / 60)} min stretch: already read live"); continue
            # a long stretch is often an overlay with shop-like colours; check a few spots at full size first
            if b - a > 120 and not any(probe(cfg, url, p) for p in (a + 5, (a + b) // 2, b - 20)):
                log(f"  skipped {round((b - a) / 60)} min stretch: no shop at full size, probably an overlay"); continue
            try: read_window(cfg, url, a, b, born, login, stores, stats, chan)
            except Exception: log("  read error:", traceback.format_exc().splitlines()[-1])
        log(f"  read {stats['shops']} shops, {stats['rows']} rows")
        done[v["id"]] = {"channel": login, "at": born, "shops": stats["shops"]}
        stores.save()
        try: json.dump(done, open(done_file, "w", encoding="utf-8"), indent=1)
        except OSError: pass
        if cfg["publish"] and stats["rows"]:
            names = {l: n for l, n in known_channels().items()}; names[login] = name
            W.publish(cfg, stores.docs(names), path=st["publish_path"].replace(".json", "-vods.json"), what=f"past broadcast rows")
            stores.publish_icons(cfg, st["publish_path"].replace(".json", "-vods-icons.json"), icon_state)
        restart_if_updated("between broadcasts")

# ---------------------------------------------------------------- self update
# When a newer stream_reader.py (or the reader it shares with FM Watcher) lands in this folder, finish what is in
# hand, then exit with code 3: stream.bat and vods.bat start it again on the new code. A file that doesn't compile
# is ignored, so a half-copied update never stops the reader.
_CODE = [os.path.join(HERE, f) for f in ("stream_reader.py", "fmparse.py", "watcher.py")]
def _stamp(): return tuple(os.path.getmtime(f) if os.path.exists(f) else 0 for f in _CODE)
_BOOT = _stamp()
def code_changed():
    now = _stamp()
    if now == _BOOT: return False
    import py_compile
    try:
        for f in _CODE:
            if os.path.exists(f): py_compile.compile(f, doraise=True, cfile=os.devnull if os.name != "nt" else None)
    except Exception:
        return False
    return True
def restart_if_updated(where):
    if code_changed():
        log(f"New version found, restarting ({where})")
        os._exit(3)

# ---------------------------------------------------------------- Reddit watch
# Reddit turns away the site's server, so this PC reads the newest posts on the Classic subreddits every 5 minutes
# and hands them to the site, which DMs Maya about the ones on prices or the Free Market. Read only.
REDDIT_SUBS = ["MSClassicWorld", "MapleStory"]   # r/MapleStory posts only count when they mention Classic
def reddit_loop():
    import xml.etree.ElementTree as ET, html as H
    try: key = open(os.path.join(HERE, "reddit_key.txt"), encoding="utf-8").read().strip()
    except OSError: return
    if not key: return
    A = "{http://www.w3.org/2005/Atom}"; last_err = 0
    while True:
        posts = []
        for n, sub in enumerate(REDDIT_SUBS):
            if n: time.sleep(20)   # Reddit answers 429 to back-to-back feed reads
            try:
                req = urllib.request.Request(f"https://www.reddit.com/r/{sub}/new/.rss?limit=25", headers={"User-Agent": "Mozilla/5.0 (Club FM reddit watch)"})
                with urllib.request.urlopen(req, timeout=30) as r: root = ET.fromstring(r.read())
                for e in root.findall(A + "entry"):
                    pid = (e.findtext(A + "id") or "").split("_")[-1]
                    link = e.find(A + "link"); href = link.get("href") if link is not None else ""
                    body = re.sub(r"<[^>]+>", " ", H.unescape(e.findtext(A + "content") or ""))
                    when = e.findtext(A + "published") or e.findtext(A + "updated") or ""
                    try: ts = datetime.datetime.fromisoformat(when.replace("Z", "+00:00")).timestamp()
                    except ValueError: ts = time.time()
                    posts.append({"id": pid, "sub": sub, "title": e.findtext(A + "title") or "", "selftext": re.sub(r"\s+", " ", body).strip()[:3000],
                                  "permalink": href, "author": (e.findtext(A + "author/" + A + "name") or "").replace("/u/", ""), "created_utc": ts})
            except Exception as ex:
                if time.time() - last_err > 3600: log(f"reddit watch: r/{sub} not read ({ex})"); last_err = time.time()
        if posts:
            try:
                req = urllib.request.Request("https://api.maplefm.gg/reddit/push", data=json.dumps({"posts": posts}).encode(), headers={"Content-Type": "application/json", "X-Push-Key": key, "User-Agent": "Club FM stream reader"})
                with urllib.request.urlopen(req, timeout=30) as r: res = json.loads(r.read() or b"{}")
                if res.get("new"): log(f"reddit watch: {res['new']} new price or FM post(s), sent to Discord")
            except Exception as ex:
                if time.time() - last_err > 3600: log(f"reddit watch: couldn't reach the site ({ex})"); last_err = time.time()
        time.sleep(300)

def main():
    cfg = load_config(); st = cfg["streams"]
    if "--vods" in sys.argv:
        run_vods(cfg); return
    if "--list" in sys.argv:
        for c in live_channels(cfg):
            ok, why = wanted(cfg, c)
            print(("WATCH " if ok else "skip  ") + f"{c['name']:<20} {c['viewers']:>6}  {why:<32} {(c.get('title') or '')[:70]}")
        return
    if "--test" in sys.argv:
        i = sys.argv.index("--test"); url = sys.argv[i + 1]
        start = sys.argv[sys.argv.index("--start") + 1] if "--start" in sys.argv else None
        secs = int(sys.argv[sys.argv.index("--seconds") + 1]) if "--seconds" in sys.argv else 300
        run_test(cfg, url, start, secs); return
    stores = Stores(cfg)
    jobs = queue.Queue(maxsize=30)
    threading.Thread(target=reader, args=(cfg, jobs, stores, False), daemon=True).start()
    threading.Thread(target=verifier, daemon=True).start()
    FULL_MAX[0] = st["max_full"]
    threading.Thread(target=reddit_loop, daemon=True).start()
    log("Stream Reader started. Watching up to", st["max_streams"], "streams at 360p, switching up to", st["max_full"], "to full quality when a shop opens. Publishing is", "ON" if cfg["publish"] else "OFF")
    chans, names, live = {}, {}, []
    icon_state = {}
    last_check = 0; last_pub = time.time(); last_save = 0
    while True:
        try:
            t = time.time()
            for login in [l for l, c in chans.items() if not c.is_alive()]:
                log(f"{chans[login].name}: stopped watching ({chans[login].shops} shops read)")
                del chans[login]
                last_check = min(last_check, t - st["check_minutes"] * 60 + 60)   # look again in a minute
            if t - last_check >= st["check_minutes"] * 60 or (not chans and t - last_check >= 120):
                last_check = t
                try:
                    found = live_channels(cfg)
                    pick = [c for c in found if wanted(cfg, c)[0]]
                    pick.sort(key=lambda c: (wanted(cfg, c)[1] != "Classic", -c["viewers"]))
                    live = [c["login"] for c in pick]
                    for c in found: names[c["login"]] = c["name"]
                    remember_channels([c for c in pick if wanted(cfg, c)[1] == "Classic"])
                    sure = [c for c in pick if wanted(cfg, c)[1] == "Classic"]
                    log(f"{len(found)} MapleStory channels live, {len(sure)} say Classic, {len(pick) - len(sure)} more might be" + (": " + ", ".join(c["name"] for c in pick[:12]) if pick else ""))
                    # make room: channels that went offline, or have not opened a shop in a long while when others wait
                    waiting = [c for c in pick if c["login"] not in chans]
                    for login, c in list(chans.items()):
                        leash = st["keep_minutes_without_shop"] if wanted(cfg, {"login": login, "title": c.title, "viewers": 10**6})[1] == "Classic" else 20
                        idle = t - c.last_shop > leash * 60
                        if login not in live or (idle and waiting):
                            c.stop = True; c.feed and c.feed.close()
                            log(f"{c.name}: moving on" + (" (no shop opened lately)" if login in live else " (went offline)"))
                            del chans[login]
                    for c in waiting:
                        if len(chans) >= st["max_streams"]:
                            break
                        ch = Channel(cfg, c["login"], c["name"], jobs); ch.title = c.get("title") or ""; chans[c["login"]] = ch; ch.start()
                        log(f"{c['name']}: watching ({c['viewers']} viewers) {(c.get('title') or '')[:60]}")
                except Exception as e:
                    log("could not check Twitch:", e)
                write_status(chans, live, names)
            if t - last_save > 30:
                stores.save(); last_save = t
                note_live_seen(list(chans), t)
            hot = stores.hot()
            if cfg["publish"] and (hot or t - last_pub > cfg["publish_every_minutes"] * 60):
                last_pub = t
                docs = stores.docs(names)
                W.publish(cfg, docs, path=st["publish_path"], what=f"{sum(len(d['rows']) for d in docs)} stream rows")
                stores.publish_icons(cfg, st["publish_path"].replace(".json", "-icons.json"), icon_state)
                write_status(chans, live, names)
                restart_if_updated("after publishing")
            time.sleep(2)
        except KeyboardInterrupt:
            break
        except Exception:
            log("loop error:", traceback.format_exc().splitlines()[-1]); time.sleep(5)
    for c in chans.values():
        c.stop = True; c.feed and c.feed.close()
    stores.save()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
