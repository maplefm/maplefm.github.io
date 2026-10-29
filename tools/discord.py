"""Post site events to the Club FM Discord through channel webhooks.

The webhook URLs live in the DISCORD_HOOKS repository secret as JSON:
  {"news": "...", "site": "...", "big_sales": "...", "market_close": "...", "coverage": "...", "ranks": "..."}
"news" is #maple-news and carries only Nexon's Classic World news (tools/nexon_news.py). "site" is where
the site's own updates and watcher releases go. Nothing about contributor pay is ever posted automatically.
With the secret missing every job exits quietly, so the data workflows never fail over Discord.

  python3 tools/discord.py sales   DATA_DIR STATE.json      new sales worth posting since the last run
  python3 tools/discord.py ranks   RANKS.json STATE.json    tier-ups, new top-10 entries, a new Crown
  python3 tools/discord.py report  REPORT.json STATE.json   the market close summary, once per day
  python3 tools/discord.py coverage DATA_DIR STATE.json     how much of the FM got scanned today, once per day
  python3 tools/discord.py news    STATE.json [RANGE]       collect site changes, post watcher releases at once (to "site")
  python3 tools/discord.py digest  STATE.json               post the collected changes as one plain daily note
  python3 tools/discord.py note    TITLE TEXT               a hand-written note (to "site")
  python3 tools/discord.py potd    SUMMARY.json STATE.json  price of the day (to "market_close"), once a day

STATE.json is kept on the live branch so nothing is posted twice.
"""
import sys, os, json, math, glob, datetime, subprocess, urllib.request, time, re

try:
    from zoneinfo import ZoneInfo
    ET = ZoneInfo("America/New_York")      # Eastern with daylight time, so posts keep their day after November
except Exception:
    ET = datetime.timezone(datetime.timedelta(hours=-5))
SITE = "https://maplefm.gg"
BIG = 250000          # a sale at or above this price gets a post in #big-sales
MAX_SALES = 8         # per run, the biggest ones
ROOMS, CHANNELS = 20, 40
WORKER = "https://clubfm-accounts.aaweaver93.workers.dev"
TIERS = [(100000, "Mythic"), (50000, "Titan"), (25000, "Immortal"), (10000, "Legend"), (5000, "Monarch"), (2500, "Royal"), (1000, "Tycoon"),
         (400, "Broker"), (150, "Trader"), (50, "Merchant"), (10, "Apprentice"), (0, "Scout")]
PURPLE, GOLD, GREEN, RED, BLUE = 0x7c4dff, 0xf6c94a, 0x3ddc84, 0xff5c5c, 0x61d4f0

def hooks():
    try: h = json.loads(os.environ.get("DISCORD_HOOKS") or "{}")
    except Exception: h = {}
    if os.environ.get("DISCORD_HOOK_DEALS"): h["mega_deals"] = os.environ["DISCORD_HOOK_DEALS"]   # the private #mega-deals channel
    if os.environ.get("DISCORD_HOOK_DIGEST"): h["digest"] = os.environ["DISCORD_HOOK_DIGEST"]     # the weekly card in #announcements
    if os.environ.get("DISCORD_HOOK_SCANNERS"): h["covmap"] = os.environ["DISCORD_HOOK_SCANNERS"]   # the coverage map in #scanners
    if h.get("market_close"): h["coverage"] = h["market_close"]   # both land in #nightly-report since the coverage channel was folded in
    return h

def load(path, default):
    try: return json.load(open(path, encoding="utf-8"))
    except Exception: return default

def save(path, obj):
    json.dump(obj, open(path, "w", encoding="utf-8"), separators=(",", ":"))

def post(kind, content=None, embeds=None):
    url = hooks().get(kind)
    if not url:
        return False
    body = {"allowed_mentions": {"parse": []}}
    if content: body["content"] = content[:1900]
    if embeds: body["embeds"] = embeds[:10]
    req = urllib.request.Request(url + "?wait=true", json.dumps(body).encode(), {"Content-Type": "application/json", "User-Agent": "maplefm.gg"})
    for i in range(3):
        try:
            urllib.request.urlopen(req, timeout=20).read()
            return True
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2 + i * 3); continue
            print("discord", kind, e.code, e.read()[:200]); return False
        except Exception as e:
            print("discord", kind, e); time.sleep(2)
    return False

import re as _re
def spot(r):
    """Where a listing was: "FM7 ch5". A room the watcher couldn't read cleanly is left out rather than shown as junk."""
    room = str(r.get("r") or "").strip()
    room = room if re.fullmatch(r"FM\d{1,2}", room) else ""
    ch = f"ch{int(r['c'])}" if str(r.get("c") or "").isdigit() else ""
    return (room + " " + ch).strip() or "Free Market"

def shown(name):
    """Scroll names as players say them: the tier word becomes the success rate (Lesser 100%, Intermediate 60%, Greater 10%)."""
    m = _re.match(r"^(.*Scroll): (Lesser|Intermediate|Greater|Chaos|Superior)$", str(name or ""))
    return (m.group(1) + " " + {"Lesser": "100%", "Intermediate": "60%", "Greater": "10%"}.get(m.group(2), m.group(2))) if m else name

def plain(s, n=40):
    """untrusted text in an embed: no markdown, no links"""
    s = re.sub(r"[*_~`|>\[\]()<>@#]", "", str(s or ""))
    s = re.sub(r"https?:\S*", "", s, flags=re.I)
    return s.strip()[:n] or "?"

def meso(n):
    n = int(n or 0)
    return f"{n:,}"

def tier(n):
    for at, name in TIERS:
        if n >= at: return name

def et_day(t):
    return datetime.datetime.fromtimestamp(t, ET).date().isoformat()

# ---------------------------------------------------------------- item icons for embeds
MAIN_DIR = os.environ.get("MAIN_DIR", "/tmp/main")   # a checkout of main: itemdb.json and the icons folder
_ITEM_IDS = None
def icon_url(item):
    """An http picture of the item for a Discord embed: Classic's own icon from maplestory.io by item id,
    else one of the site's cut-out icons. Discord needs a real URL, so the captured data: icons can't be used."""
    global _ITEM_IDS
    name = str(item or "").strip()
    if not name: return None
    if _ITEM_IDS is None:
        _ITEM_IDS = {}
        for path in (os.path.join(MAIN_DIR, "data", "itemdb.json"), "data/itemdb.json"):
            try:
                for r in json.load(open(path, encoding="utf-8")).get("items") or []:
                    if r and r[1]: _ITEM_IDS.setdefault(str(r[0]).lower(), int(r[1]))
                break
            except Exception: continue
    base = re.sub(r"\s*\(name cut off\)$", "", name)
    iid = _ITEM_IDS.get(base.lower())
    if iid:
        # the site's own copy when it has one (fast, always up), else maplestory.io
        return f"{SITE}/i/{iid}.png" if os.path.exists(os.path.join(MAIN_DIR, "i", f"{iid}.png")) else f"https://maplestory.io/api/MCW/1/item/{iid}/icon"
    slug = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")
    if os.path.exists(os.path.join(MAIN_DIR, "icons", slug + ".png")): return f"{SITE}/icons/{slug}.png"
    return None

# character pictures from classicrank.com's public read API (no key, 30 requests a minute, CORS on)
_PHOTOS = {}
def photo_of(name):
    """URL of the character's picture on classicrank.com, or None. Scanner names are in-game names now,
    so a straight lookup works; streams and names with odd characters are skipped."""
    n = str(name or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9]{3,13}", n) or n.lower().startswith("stream:"): return None
    if n in _PHOTOS: return _PHOTOS[n]
    url = None
    try:
        req = urllib.request.Request(f"https://classicrank.com/api/v1/characters/{urllib.request.quote(n)}?fields=name,photo", headers={"User-Agent": "clubfm-discord/1.0 (maplefm.gg)"})
        with urllib.request.urlopen(req, timeout=10) as r:
            d = json.load(r); url = (d.get("data") or d).get("photo") or None
    except Exception:
        url = None
    _PHOTOS[n] = url
    return url

def scan_docs(data_dir):
    """Every scan document in the data folder, with the scanner's name."""
    names = {"watcher.json": "Maya", "watcher-2.json": "Jack", "watcher-3.json": "Matt", "watcher-4.json": "Jimmy"}
    for f in sorted(glob.glob(os.path.join(data_dir, "*.json"))):
        b = os.path.basename(f)
        if b not in names and b not in ("inbox.json", "streams.json", "streams-vods.json"):
            continue
        docs = load(f, [])
        if not isinstance(docs, list): continue
        for d in docs:
            if isinstance(d, dict) and isinstance(d.get("rows"), list):
                yield names.get(b) or d.get("who") or d.get("by") or "Guest", d

# ---------------------------------------------------------------- sales
def job_sales(data_dir, state_path):
    st = load(state_path, {})
    seen = st.get("sales_seen") or {}
    mark = st.get("sales_mark")
    now = int(time.time())
    if not mark:
        # first run: remember where we are, post nothing from the backlog
        st["sales_mark"] = now; save(state_path, st); return
    new, latest = [], mark
    # who else has seen each listing: a sale from the anonymous inbox only posts when a second party saw the listing
    seen_by = {}
    for who, d in scan_docs(data_dir):
        if "chat" in str(d.get("src", "")): continue
        for r in d["rows"]:
            seen_by.setdefault(f'{str(r.get("s")).lower()}|{str(r.get("i")).lower()}|{r.get("p")}', set()).add(who)
    for who, d in scan_docs(data_dir):
        try: at = int(datetime.datetime.fromisoformat(d["at"]).timestamp())
        except Exception: continue
        if at <= mark: continue
        latest = max(latest, at)
        # watcher shop scans only: stream captures are OCR and misread names and prices now and then
        if not str(d.get("src", "")).startswith("watcher") or "chat" in str(d.get("src", "")): continue
        club = who in ("Maya", "Jack", "Matt", "Jimmy")
        for r in d["rows"]:
            if not r.get("so") or r.get("k") == "b": continue
            p = int(r.get("p") or 0)
            if p < BIG or "cut off" in str(r.get("i") or ""): continue
            if not club and len(seen_by.get(f'{str(r.get("s")).lower()}|{str(r.get("i")).lower()}|{p}', ())) < 2: continue
            key = f'{r.get("s")}|{r.get("i")}|{p}|{r.get("t")}'
            if key in seen: continue
            seen[key] = now
            new.append((p, r, who))
    new.sort(key=lambda x: -x[0])
    for p, r, who in new[:MAX_SALES]:
        q = int(r.get("q") or 1)
        where = spot(r)
        line = f'**{plain(shown(r.get("i")), 64)}**' + (f" ×{q}" if q > 1 else "") + f" sold for **{meso(p)}** meso"
        emb = {"title": "Big sale", "description": line, "color": GOLD,
               "fields": [{"name": "Seller", "value": plain(r.get("s"), 24), "inline": True},
                          {"name": "Spot", "value": where.strip() or "?", "inline": True},
                          {"name": "Caught by", "value": plain(who, 24), "inline": True}],
               "url": f"{SITE}/?q=" + urllib.request.quote(str(r.get("i") or "")[:64])}
        ic = icon_url(r.get("i"))
        if ic: emb["thumbnail"] = {"url": ic}
        post("big_sales", embeds=[emb])
    cutoff = now - 4 * 86400
    st["sales_seen"] = {k: v for k, v in seen.items() if v >= cutoff}
    st["sales_mark"] = latest
    save(state_path, st)

# ---------------------------------------------------------------- ranks
def totals(ranks):
    out = {}
    for who, days in (ranks.get("who") or {}).items():
        k = who.lower()
        o = out.setdefault(k, {"name": who, "sales": 0, "rows": 0})
        if who[:1].isupper() and not o["name"][:1].isupper(): o["name"] = who
        for a in days.values():
            o["sales"] += a[0]; o["rows"] += a[2]
    board = sorted(out.values(), key=lambda w: (-w["sales"], -w["rows"], w["name"].lower()))
    for i, w in enumerate(board): w["rank"] = i + 1
    return board

def job_ranks(ranks_path, state_path):
    st = load(state_path, {})
    ranks = load(ranks_path, {})
    board = totals(ranks)
    streams = {str(n).lower() for n in (ranks.get("stream") or [])}
    old = st.get("ranks") or {}
    first = not old
    events, crown = [], None
    for w in board:
        o = old.get(w["name"].lower())
        if first or not o: continue
        t0, t1 = tier(o["sales"]), tier(w["sales"])
        if t1 != t0 and w["sales"] > o["sales"]:
            events.append((w, f'reached **{t1}** with {meso(w["sales"])} sales caught'))
        if w["rank"] <= 10 < o["rank"]:
            events.append((w, f'broke into the top 10 at #{w["rank"]}'))
        if w["rank"] == 1 and o["rank"] != 1:
            crown = w
    if crown:
        events.insert(0, (crown, "takes the Crown, most sales caught of anyone <:crown:1563401437218734160>"))
    # one embed per person, with their character picture when classicrank.com has one
    embeds = []
    for w, what in events[:10]:
        emb = {"title": plain(w["name"], 24), "description": what, "color": PURPLE, "url": f"{SITE}/contribute.html#gatherer"}
        if w["name"].lower() not in streams:
            ph = photo_of(w["name"])
            if ph: emb["thumbnail"] = {"url": ph}
        embeds.append(emb)
    if embeds:
        post("ranks", embeds=embeds)
    st["ranks"] = {w["name"].lower(): {"sales": w["sales"], "rank": w["rank"]} for w in board}
    save(state_path, st)

# ---------------------------------------------------------------- market close
def pct(x):
    return f"{x * 100:+.1f}%"

def job_report(report_path, state_path, pdf_path=""):
    st = load(state_path, {})
    rep = load(report_path, {})
    day = rep.get("day")
    if not day or st.get("report_day") == day:
        return
    m, s = rep.get("market") or {}, rep.get("stats") or {}
    up = (m.get("chg") or 0) >= 0
    big_icon = None
    fields = [{"name": "FM index", "value": f'{m.get("value", 0):.2f} ({pct(m.get("chg") or 0)})', "inline": True},
              {"name": "Sales", "value": f'{s.get("sales", 0):,} for {meso(s.get("volume"))} meso', "inline": True},
              {"name": "Listings", "value": f'{s.get("listings", 0):,} across {s.get("items", 0):,} items', "inline": True}]
    g = ", ".join(f'{plain(x["item"], 48)} {pct(x["chg"])}' for x in (rep.get("gainers") or [])[:4])
    l = ", ".join(f'{plain(x["item"], 48)} {pct(x["chg"])}' for x in (rep.get("losers") or [])[:4])
    if g: fields.append({"name": "Gainers", "value": g[:1000], "inline": False})
    if l: fields.append({"name": "Losers", "value": l[:1000], "inline": False})
    b = rep.get("biggest_sale") or {}
    if b.get("item"):
        fields.append({"name": "Biggest sale", "value": f'{plain(b["item"], 64)} for {meso(b.get("price"))} meso' + (f' by {plain(b["seller"], 24)}' if b.get("seller") else ""), "inline": False})
        big_icon = icon_url(b.get("item"))
    cats = [c for c in (rep.get("categories") or []) if c.get("value")]
    if cats:
        fields.append({"name": "Categories", "value": " · ".join(f'{c["name"]} {pct(c.get("chg") or 0)}' for c in cats)[:1000], "inline": False})
    emb = {"title": f"Market close · {day}", "color": GREEN if up else RED, "fields": fields,
           **({"thumbnail": {"url": big_icon}} if big_icon else {}),
           "url": f"{SITE}/report.html", "footer": {"text": "Full report at maplefm.gg/report.html"}}
    # the day's report as a PDF (tools/reportpdf.py), attached when it was made and fits; the post goes out either way
    pdf = b""
    try:
        if pdf_path and os.path.isfile(pdf_path) and 1000 < os.path.getsize(pdf_path) < 8 * 1024 * 1024: pdf = open(pdf_path, "rb").read()
        elif pdf_path: print("market close: no PDF to attach", pdf_path)
    except Exception as e: print("market close pdf", e)
    sent = post_files("market_close", [(f"club-fm-market-close-{day}.pdf", pdf)], [emb]) if pdf else False
    if sent or post("market_close", embeds=[emb]):
        st["report_day"] = day
        save(state_path, st)

# ---------------------------------------------------------------- coverage
def job_coverage(data_dir, state_path):
    st = load(state_path, {})
    # the day being closed, the same rule as the market report: a run before noon closes the day before
    nowet = datetime.datetime.now(ET)
    today = (nowet.date() - datetime.timedelta(days=1 if nowet.hour < 12 else 0)).isoformat()
    if st.get("coverage_day") == today:
        return
    spots, by, shops, sales = set(), {}, set(), 0
    for who, d in scan_docs(data_dir):
        if "chat" in str(d.get("src", "")): continue
        try: at = datetime.datetime.fromisoformat(d["at"]).timestamp()
        except Exception: continue
        for r in d["rows"]:
            if et_day(r.get("t") or at) != today: continue
            room = str(r.get("r") or "")
            if room.startswith("FM") and room[2:].isdigit() and r.get("c"):
                spots.add((room, r["c"]))
                by.setdefault(who, set()).add((room, r["c"]))
            shops.add(f'{r.get("s")}|{d["at"]}')
            if r.get("so") and r.get("k") != "b": sales += 1
    if not shops:
        return
    total = ROOMS * CHANNELS
    rooms = {}
    for r, c in spots: rooms[r] = rooms.get(r, 0) + 1
    top = sorted(by.items(), key=lambda kv: -len(kv[1]))[:8]
    desc = (f"**{len(spots)} of {total}** FM spots scanned ({len(spots) * 100 // total}%), "
            f"{len(shops):,} shops read, {sales:,} sales caught, {len(by)} scanner{'s' if len(by) != 1 else ''}.")
    fields = []
    if top:
        fields.append({"name": "Scanners", "value": "\n".join(f'{plain(w, 24)} · {len(s)} spots' for w, s in top)[:1000], "inline": True})
    if rooms:
        gaps = [f"FM{n}" for n in range(1, ROOMS + 1) if rooms.get(f"FM{n}", 0) < CHANNELS // 4]
        best = sorted(rooms.items(), key=lambda kv: -kv[1])[:6]
        fields.append({"name": "Most covered", "value": "\n".join(f'{r} · {n}/{CHANNELS} ch' for r, n in best), "inline": True})
        if len(gaps) > 12:
            fields.append({"name": "Needs scanning", "value": f"{len(gaps)} of {ROOMS} rooms barely touched. Open FM Watcher and pick any room.", "inline": False})
        elif gaps:
            fields.append({"name": "Needs scanning", "value": ", ".join(gaps)[:1000], "inline": False})
    if post("coverage", embeds=[{"title": f"Coverage · {today}", "description": desc, "color": BLUE, "fields": fields,
                                 "url": f"{SITE}/contribute.html"}]):
        st["coverage_day"] = today
        save(state_path, st)

# ---------------------------------------------------------------- news
QUIET = re.compile(r"\b(earn|pay|payout|payouts|paid|credit|credits|budget|rate|paypal|money|fund|price floor|cap)\b", re.I)
# behind-the-scenes work stays out of the public updates: the Reddit watch, Ko-fi and supporter thank-yous, outreach,
# owner alerts and DMs, scheduled jobs and the Worker
PRIVATE = re.compile(r"\b(reddit|ko-?fi|supporters?|tiers?|outreach|whispers?|dms?|owner|admins?|alerts?|scheduled|schedule|cron|dispatch|worker|watchdog|stat check|stats? report|partner|the club|kingdavid|api access|speed watch|fact check|smoke)\b", re.I)

def plain_change(subj):
    """A commit title as a visitor would read it: no file names, code words or brackets, one short line."""
    t = re.sub(r"\([^)]*\)", "", subj)                                  # brackets hold the technical part
    t = re.sub(r"\b\S*[/_.]\S*\b", "", t)                                # paths, file names, dotted names
    t = re.sub(r"\b[a-z]+[A-Z]\w*\b", "", t)                             # camelCase identifiers
    t = re.sub(r"^\s*FM Watcher\s*:\s*", "", t)                          # the release post already says which watcher
    t = re.sub(r"\s+(and|or|with|the)\s*$", "", t)                       # a removed file name can leave a dangling word
    t = re.sub(r"\s*[:;]\s*$", "", re.sub(r"\s{2,}", " ", t)).strip(" ,.-")
    return t[:1].upper() + t[1:140] if t else ""

def job_news(state_path, rng=None, digest=False):
    """Watcher releases post at once. Site changes are collected and go out as one plain daily note, so the
    channel says 'the site is being worked on' without reading like a commit log."""
    st = load(state_path, {})
    rng = rng or (st.get("news_sha") + "..HEAD" if st.get("news_sha") else "HEAD~1..HEAD")
    try:
        log = subprocess.run(["git", "log", "--reverse", "--format=%H%x1f%s%x1f%b%x1e", "--no-merges", rng],
                             capture_output=True, text=True, check=True).stdout
    except Exception as e:
        print("git log", e); return
    head = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    commits = []
    for rec in log.split("\x1e"):
        parts = rec.strip("\n").split("\x1f")
        if len(parts) < 2 or not parts[0].strip(): continue
        sha, subj = parts[0].strip(), parts[1].strip()
        if subj.lower().startswith(("merge", "live pump", "price inbox", "scanner ranks", "icon shards", "startup timing", "maple news state", "site updates state", "item pages")): continue
        if QUIET.search(subj): continue        # contributor pay never goes out automatically
        if PRIVATE.search(subj): continue      # the Reddit watch and other private tooling never go out
        files = subprocess.run(["git", "show", "--name-only", "--format=", sha], capture_output=True, text=True).stdout.split()
        commits.append((sha, subj, files))
    rel = [c for c in commits if "download/version.json" in c[2]]
    if rel:
        try: ver = json.load(open("download/version.json")).get("version")
        except Exception: ver = None
        post("site", embeds=[{"title": f"FM Watcher {ver or ''} is out".strip(), "color": GOLD,
                              "description": "Running watchers update themselves within 15 minutes, nothing to do.\n" +
                                             "\n".join("• " + plain_change(c[1]) for c in rel if plain_change(c[1]))[:1500],
                              "url": f"{SITE}/contribute.html"}])
    # only what visitors can see: pages, styles and the board's own script, never the Worker, bots or tools
    sitec = [c for c in commits if c not in rel and any((f.endswith((".html", ".css", ".js")) and not f.startswith(("worker/", "bot/", "tools/", ".github/"))) for f in c[2])]
    site = [plain_change(c[1]) for c in sitec]
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import siteshots
    pages = list(st.get("pending_pages") or [])
    for c in sitec:
        for pg in siteshots.pages_for(c[2]):
            if pg not in pages: pages.append(pg)
    pending = [x for x in (st.get("pending") or []) + [x for x in site if x] if x]
    seen = set(); pending = [x for x in pending if not (x.lower() in seen or seen.add(x.lower()))]
    if digest and pending:
        if digest_post(st, pending, pages):
            st["week"] = (st.get("week") or []) + [{"day": datetime.datetime.now(ET).date().isoformat(), "changes": pending[:12], "pages": pages[:3]}]
            pending, pages = [], []
    if digest: kofi_week(st)
    st["pending"] = pending[-30:]
    st["pending_pages"] = pages[:10]
    st["news_sha"] = head
    save(state_path, st)

SHOTS = os.environ.get("SHOTS_DIR", "")

def post_files(kind, files, embeds):
    """a webhook post with several pictures; each embed shows its own with attachment://name"""
    url = hooks().get(kind)
    if not url: return False
    b = "----clubfm" + str(int(time.time() * 1000))
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\nContent-Type: application/json\r\n\r\n"
            + json.dumps({"allowed_mentions": {"parse": []}, "embeds": embeds[:10]}) + "\r\n").encode()
    for i, (fname, png) in enumerate(files[:10]):
        ct = "application/pdf" if fname.endswith(".pdf") else "image/png"
        body += (f"--{b}\r\nContent-Disposition: form-data; name=\"files[{i}]\"; filename=\"{fname}\"\r\nContent-Type: {ct}\r\n\r\n").encode() + png + b"\r\n"
    body += f"--{b}--\r\n".encode()
    req = urllib.request.Request(url + "?wait=true", body, {"Content-Type": "multipart/form-data; boundary=" + b, "User-Agent": "maplefm.gg"})
    for i in range(3):
        try:
            urllib.request.urlopen(req, timeout=60).read(); return True
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(2 + i * 3); continue
            print("discord", kind, e.code, e.read()[:200]); return False
        except Exception as e:
            print("discord", kind, e); time.sleep(2)
    return False

def digest_post(st, pending, pages):
    """The day's site changes as one post: the list, then a before and now picture of up to three pages that
    changed. Without a browser (or the shots folder) it is the list alone."""
    import siteshots
    day = datetime.datetime.now(ET).date().isoformat()
    emb = {"title": "What changed on the site today", "color": PURPLE, "url": SITE,
           "description": "\n".join("• " + x for x in pending[:12])[:1500]}
    files, embeds = [], [emb]
    if SHOTS and pages:
        try:
            shots = siteshots.shoot(pages[:3])
            for name, png in shots.items():
                before = siteshots.latest(SHOTS, name, day)
                siteshots.keep(SHOTS, day, name, png)
                label = siteshots.PAGES[name][1]
                fn = f"{name}-{day}.png"
                files.append((fn, siteshots.before_after(before, png, label + " · " + day)))
                e = {"color": PURPLE, "title": label, "url": SITE + siteshots.PAGES[name][0], "image": {"url": "attachment://" + fn}}
                if len(embeds) == 1 and "image" not in emb: emb["image"] = e["image"]; emb.setdefault("fields", []).append({"name": "Pictured", "value": label, "inline": True})
                else: embeds.append(e)
        except Exception as e:
            print("shots", e)
    return post_files("site", files, embeds) if files else post("site", embeds=embeds)

def kofi_week(st):
    """Sunday's digest also leaves the week's update for Ko-fi in the shots folder: one picture of the pages that
    changed and the text. The Worker sends both to the owner to approve; nothing goes on Ko-fi by itself."""
    import siteshots
    now = datetime.datetime.now(ET)
    day = now.date().isoformat()
    if now.weekday() != 6 or not SHOTS or st.get("kofi_week") == day: return
    week = st.get("week") or []
    if not week: return
    shots, seenp = [], set()
    for w in reversed(week):
        for pg in w.get("pages") or []:
            f = os.path.join(SHOTS, w["day"], pg + ".png")
            if pg not in seenp and os.path.exists(f):
                seenp.add(pg); shots.append((siteshots.PAGES[pg][1], open(f, "rb").read()))
    changes = []
    for w in week:
        for c in [x for x in (w.get("changes") or []) if not PRIVATE.search(x) and not QUIET.search(x)]:
            if c.lower() not in {x.lower() for x in changes}: changes.append(c)
    start = (now.date() - datetime.timedelta(days=6)).strftime("%b %d").replace(" 0", " ")
    title = "Club FM this week: " + start + " to " + now.strftime("%b %d").replace(" 0", " ")
    text = ("Here's what changed on maplefm.gg this week, thanks to everyone scanning and supporting.\n\n"
            + "\n".join(f"{i + 1}. {c}" for i, c in enumerate(changes[:10]))
            + "\n\nEvery update with pictures is in #site-updates on the Club FM Discord.")
    png = siteshots.grid(shots, title) if shots else None
    if png: open(os.path.join(SHOTS, "kofi-week.png"), "wb").write(png)
    json.dump({"day": day, "title": title, "text": text, "png": bool(png)}, open(os.path.join(SHOTS, "kofi-week.json"), "w"))
    st["kofi_week"] = day
    st["week"] = []

# ---------------------------------------------------------------- mega deals
# The private #mega-deals channel gets the same flips the board's deal alert shows club members: a listing from
# the last few minutes, at least 20% under the item's typical price, flippable for 50K+ after relisting 5% under
# typical, on an item that sold 3+ times in the last week. More than 85% under is a misread or a spot holder and
# is skipped. Typical prices come from data/summary.json, which the board itself builds. One post per listing.
DEAL_MIN, DEAL_OFF, DEAL_FAST, DEAL_WIN = 50000, 0.20, 0.05, 12 * 60
PING_CAP = 12   # Mega Deals pings one scanner's catches can trigger per day
def who_caught(docs, d):
    """The scanner whose watcher saw this exact listing, for the Caught by field."""
    s, p = str(d.get("s") or "").lower(), int(d.get("p") or 0)
    for who, doc in docs:
        for r in doc["rows"]:
            if str(r.get("s") or "").lower() == s and int(r.get("p") or 0) == p and r.get("x"): return who
    return "the board"

def job_deals(data_dir, summary_path, state_path):
    st = load(state_path, {})
    seen = st.get("deals_seen") or {}
    now = int(time.time())
    summ = load(summary_path, {})
    rows = {r["item"]: r for r in (summ.get("rows") or []) if isinstance(r, dict) and r.get("item")}
    if not rows: return
    # who may call a deal: scanners the board trusts (50+ sales caught, a stream, or the crew), and no more than
    # PING_CAP pings per scanner per day, so a flood of made-up asks under fresh shop names can't drain the channel
    trust = {str(w.get("name") or "").lower() for w in (summ.get("who") or []) if isinstance(w, dict) and (w.get("stream") or w.get("club") or int(w.get("sales") or 0) >= 50)}
    pinged = st.get("deals_by") or {}
    day = time.strftime("%Y-%m-%d")
    def may_ping(who):
        k = f"{day}|{str(who).lower()}"
        return str(who).lower() in trust and pinged.get(k, 0) < PING_CAP
    # everyone asking for each item in the last day: a price 3+ other sellers also ask is the going rate, not a deal
    asks, docs = {}, []
    for who, d in scan_docs(data_dir):
        src = str(d.get("src", ""))
        if "chat" in src or not src.startswith("watcher"): continue
        docs.append((who, d))
        for r in d["rows"]:
            if r.get("so") or r.get("k") == "b" or now - int(r.get("t") or 0) > 86400: continue
            asks.setdefault(str(r.get("i")), {})[str(r.get("s")).lower()] = int(r.get("p") or 0)
    hot = []
    for who, d in docs:
        for r in d["rows"]:
            t = int(r.get("t") or 0)
            if r.get("so") or r.get("k") == "b" or r.get("spot") or now - t > DEAL_WIN or "cut off" in str(r.get("i") or ""): continue
            it = rows.get(r.get("i"))
            if not it or it.get("kind") != "sale" or not it.get("typ") or it.get("check") or (it.get("salesN") or 0) < 3: continue
            if it.get("equip"): continue                                   # equips are judged by roll below, never by name
            if it.get("basis") not in ("24h", "3d"): continue              # a typical that rests on 3+ sales in 3 days
            tw = [str(w).lower() for w in (it.get("typWho") or [])]
            if not tw or not may_ping(who): continue                       # a trusted price and a trusted caller
            if len(tw) == 1 and tw[0] == str(who).lower(): continue       # the one person who set the price can't also call the deal
            u, q, typ = int(r.get("p") or 0), int(r.get("q") or 1), float(it["typ"])
            if u <= 0: continue
            off = 1 - u / typ
            flip = (typ * (1 - DEAL_FAST) - u) * q
            if off < DEAL_OFF or off > 0.85 or flip < DEAL_MIN: continue
            near = [x for sl, x in asks.get(str(r.get("i")), {}).items() if sl != str(r.get("s")).lower() and x > 0 and abs(math.log(x / u)) < math.log(1.25)]
            if len(near) >= 3: continue
            key = f'{str(r.get("s")).lower()}|{str(r.get("i")).lower()}|{u}'
            if key in seen: continue
            hot.append((flip, off, r, it, who, key))
    # Equips: the board prices each roll from its own sales (two or more in two weeks) and lists the listings whose
    # stats were read and sit well under that. A 10 ATT Work Gloves at 11M against 15M for that roll is a ping;
    # a Work Gloves nobody hovered is not, whatever the price.
    for it in rows.values():
        for d in (it.get("rd") or []):
            if not isinstance(d, dict): continue
            t = int(d.get("t") or 0) // 1000 if int(d.get("t") or 0) > 10**11 else int(d.get("t") or 0)
            if now - t > DEAL_WIN: continue
            u, q, typ = int(d.get("p") or 0), int(d.get("q") or 1), float(d.get("typ") or 0)
            if u <= 0 or typ <= 0: continue
            off = 1 - u / typ
            flip = (typ * (1 - DEAL_FAST) - u) * q
            if off < DEAL_OFF or off > 0.85 or flip < DEAL_MIN: continue
            key = f'{str(d.get("s")).lower()}|{str(it.get("item")).lower()}|{u}'
            if key in seen: continue
            rw = [str(w).lower() for w in (d.get("who") or [])]
            by = str(d.get("by") or "")
            if not rw or not may_ping(by): continue
            if len(rw) == 1 and rw[0] == by.lower(): continue   # same person priced the roll and caught the deal
            g = d.get("g") if isinstance(d.get("g"), (int, float)) else 0
            roll = (f'{d.get("k")} {d.get("v")}' if d.get("k") and d.get("v") is not None else ("average roll" if not g else "roll"))
            roll += f' ({"+" if g > 0 else ""}{int(g)})' if g else ""
            if d.get("slots") is not None: roll += f', {int(d["slots"])} slots left'
            r = {"i": it["item"], "s": d.get("s"), "p": u, "q": q, "r": d.get("r"), "c": d.get("c"), "x": True, "roll": roll, "rolln": int(d.get("n") or 0)}
            hot.append((flip, off, r, dict(it, typ=typ), d.get("by") or who_caught(docs, d), key))
    hot.sort(key=lambda x: -x[0])
    items_done = set()
    feed_path = os.path.join(os.path.dirname(state_path) or ".", "discord_dealfeed.json")
    feed = load(feed_path, [])
    if not isinstance(feed, list): feed = []
    for flip, off, r, it, who, key in hot:
        if len(items_done) >= 6 or str(r.get("i")).lower() in items_done: continue   # one ping per item per run
        items_done.add(str(r.get("i")).lower())
        seen[key] = now
        pk = f"{day}|{str(who).lower()}"; pinged[pk] = pinged.get(pk, 0) + 1
        q = int(r.get("q") or 1)
        where = spot(r)
        roll = f" · **{plain(r['roll'], 40)}**, typical for this roll from {r['rolln']} sales" if r.get("roll") else ""
        line = (f'**{plain(shown(r.get("i")), 64)}**' + (f" ×{q}" if q > 1 else "") + f" listed at **{meso(int(r['p']))}**" + (" each" if q > 1 else "")
                + f"\n**+{meso(int(flip))}** to flip · {int(round(off * 100))}% under typical {meso(int(it['typ']))}{roll}")
        emb = {"title": "Mega deal", "description": line, "color": GREEN,
               "fields": [{"name": "Seller", "value": plain(r.get("s"), 24), "inline": True},
                          {"name": "Spot", "value": where.strip() or "?", "inline": True},
                          {"name": "Caught by", "value": plain(who, 24), "inline": True}],
               "url": f"{SITE}/?q=" + urllib.request.quote(str(r.get("i") or "")[:64]),
               "footer": {"text": "Profit assumes you relist 5% under typical. Listed in the last 12 minutes; it may already be gone."}}
        ic = icon_url(r.get("i"))
        if ic: emb["thumbnail"] = {"url": ic}
        post("mega_deals", embeds=[emb])
        # the public deal feed: the Worker reads it to DM Mega Deals holders watching the item
        feed.append({"t": now, "key": key, "item": r.get("i"), "s": r.get("s"), "p": int(r["p"]), "q": q, "where": where.strip(), "flip": int(flip), "off": round(off, 3), "typ": int(it["typ"]), "roll": r.get("roll") or "", "by": who})
    save(feed_path, feed[-80:])
    cutoff = now - 86400
    st["deals_seen"] = {k: v for k, v in seen.items() if v >= cutoff}
    st["deals_by"] = {k: v for k, v in pinged.items() if k.startswith(day)}
    save(state_path, st)

# ---------------------------------------------------------------- weekly digest
def job_weekly(report_path, ranks_path, state_path):
    """Sunday evening: the week on one card. Index and category moves over 7 days, the busiest items, the biggest
    sale, the scanners who caught the most this week, new supporters. Posts to the digest hook, else site-updates."""
    st = load(state_path, {})
    rep, ranks = load(report_path, {}), load(ranks_path, {})
    today = datetime.datetime.now(ET).date()
    wk = today.isoformat()
    if st.get("weekly") == wk or not rep.get("market"): return
    def week_chg(series):
        pts = [p for p in (series or []) if p and p[1]]
        if len(pts) < 2: return None
        ago = (today - datetime.timedelta(days=7)).isoformat()
        base = next((p[1] for p in pts if p[0] >= ago), pts[0][1])
        return pts[-1][1] / base - 1 if base else None
    m = rep["market"]; mc = week_chg(m.get("series"))
    fields = [{"name": "FM index, 7 days", "value": f'{m.get("value", 0):.2f} ({pct(mc)})' if mc is not None else f'{m.get("value", 0):.2f}', "inline": True}]
    days = rep.get("days") or {}
    week_days = [d for d in days if d >= (today - datetime.timedelta(days=6)).isoformat()]
    sales = sum(int((days[d].get("stats") or {}).get("sales") or 0) for d in week_days)
    vol = sum(int((days[d].get("stats") or {}).get("volume") or 0) for d in week_days)
    if sales: fields.append({"name": "Watched sales", "value": f"{sales:,} for {vol / 1e6:,.0f}M meso", "inline": True})
    cats = [(c["name"], week_chg(c.get("series"))) for c in (rep.get("categories") or []) if c.get("series")]
    cats = [(n, c) for n, c in cats if c is not None]
    if cats:
        up = max(cats, key=lambda x: x[1]); dn = min(cats, key=lambda x: x[1])
        fields.append({"name": "Categories", "value": f'Up most: {up[0]} {pct(up[1])} · Down most: {dn[0]} {pct(dn[1])}', "inline": False})
    big, big_day = None, None
    for d in week_days:
        b = (days[d].get("biggest_sale") or {})
        if b.get("price") and (not big or b["price"] > big["price"]): big, big_day = b, d
    if big: fields.append({"name": "Biggest sale of the week", "value": f'{plain(shown(big["item"]), 64)} for {meso(big["price"])} meso' + (f' by {plain(big["seller"], 24)}' if big.get("seller") else ""), "inline": False})
    # scanners: sales caught this week, from the ranks file's per-day tallies
    week_by, alias = {}, {"yinisera": "Yint"}   # one scanner under an older name, as the board folds them
    for who, dd in (ranks.get("who") or {}).items():
        n = sum(a[0] for d, a in dd.items() if d >= week_days[0]) if week_days else 0
        who = alias.get(str(who).lower(), who)
        if n: week_by[who] = week_by.get(who, 0) + n
    folded, shown_as = {}, {}
    for who, n in week_by.items():                          # AlkaidSC and alkaidsc are one scanner; keep the capitalized spelling
        k = str(who).lower(); folded[k] = folded.get(k, 0) + n
        if k not in shown_as or (str(who)[:1].isupper() and not shown_as[k][:1].isupper()): shown_as[k] = str(who)
    top = sorted(((shown_as[k], n) for k, n in folded.items()), key=lambda kv: -kv[1])[:5]
    if top: fields.append({"name": "Top scanners this week", "value": " · ".join(f'**{plain(w, 20)}** {n:,}' for w, n in top), "inline": False})
    try:
        sup = json.load(urllib.request.urlopen(urllib.request.Request(f"{WORKER}/public/supporters", headers={"User-Agent": "clubfm"}), timeout=20))
        names = [plain(x.get("ign") or "", 20) for x in (sup if isinstance(sup, list) else sup.get("supporters") or []) if x.get("ign")]
        if names: fields.append({"name": "Supporters on Ko-fi", "value": ", ".join(names[:12]) + (" and more" if len(names) > 12 else ""), "inline": False})
    except Exception: pass
    emb = {"title": f"The week on the Free Market · {wk}", "color": PURPLE, "fields": fields, "url": f"{SITE}/report.html",
           "description": "Prices come from sales scanners watched happen. Run FM Watcher while you shop and your name lands on this card.",
           "footer": {"text": "Full report at maplefm.gg/report.html · ranks at maplefm.gg"}}
    ic = icon_url(big["item"]) if big else None
    if ic: emb["thumbnail"] = {"url": ic}
    if post("digest" if hooks().get("digest") else "site", embeds=[emb]):
        st["weekly"] = wk; save(state_path, st)

def job_note(title, text, image=""):
    """A hand-written note to #site-updates, with an optional picture from the repository (NOTE_IMAGE)."""
    emb = {"title": title or "Club FM", "description": text.replace("\\n", "\n")[:3900], "color": PURPLE, "url": SITE}
    image = image or os.environ.get("NOTE_IMAGE", "")
    if image and os.path.isfile(image):
        fn = os.path.basename(image)
        emb["image"] = {"url": "attachment://" + fn}
        return post_files("site", [(fn, open(image, "rb").read())], [emb])
    post("site", embeds=[emb])

# ---------------------------------------------------------------- members' weekly market recap
def job_members(summary_path, feed_path, state_path):
    """Sunday: the item-level week for members (signed-in site members hold the Members role): the biggest movers by
    typical price over 7 days, and the best deals scanners caught. Nothing about contributor pay."""
    st = load(state_path, {})
    wk = datetime.datetime.now(ET).date().isoformat()
    if st.get("members_week") == wk: return
    sm = load(summary_path, {}); feed = load(feed_path, [])
    moves = []
    for r in sm.get("rows") or []:
        if not isinstance(r, dict) or (r.get("salesN") or 0) < 8 or r.get("equip"): continue
        d = [x for x in (r.get("daily") or []) if x and x[1]]
        if len(d) < 4 or not d[0][1]: continue
        ch = d[-1][1] / d[0][1] - 1
        if abs(ch) >= 0.05: moves.append((ch, r))
    moves.sort(key=lambda x: x[0])
    def line(ch, r): return f"{plain(shown(r['item']), 48)} · {meso(int(r['typ']))} ({'+' if ch > 0 else ''}{int(round(ch * 100))}%)"
    up = [line(c, r) for c, r in reversed(moves[-5:]) if c > 0]
    dn = [line(c, r) for c, r in moves[:5] if c < 0]
    now = time.time(); week = [f for f in (feed if isinstance(feed, list) else []) if isinstance(f, dict) and f.get("t", 0) >= now - 7 * 86400]
    week.sort(key=lambda f: -(f.get("flip") or 0))
    best = [f"{plain(shown(f.get('item')), 40)} at {meso(int(f.get('p') or 0))} · {int(round((f.get('off') or 0) * 100))}% under, +{meso(int(f.get('flip') or 0))}" for f in week[:5]]
    fields = []
    if up: fields.append({"name": "Rising", "value": "\n".join(up)[:1000], "inline": False})
    if dn: fields.append({"name": "Falling", "value": "\n".join(dn)[:1000], "inline": False})
    if best: fields.append({"name": "Best deals caught", "value": "\n".join(best)[:1000], "inline": False})
    if not fields: return
    emb = {"title": "The week in the FM", "color": PURPLE, "fields": fields, "url": SITE,
           "description": "Typical prices over the last 7 days from watched sales. Every listing behind these is on the board for Mega Deals holders.",
           "footer": {"text": "Club FM · Mega Deals weekly recap"}}
    if post("mega_deals", embeds=[emb]):
        st["members_week"] = wk; save(state_path, st)

# ---------------------------------------------------------------- coverage map, every two hours
def post_file(kind, png, fname, embeds):
    """a webhook post with one picture attached; the embed shows it with attachment://fname"""
    url = hooks().get(kind)
    if not url: return False
    b = "----clubfm" + str(int(time.time() * 1000))
    payload = json.dumps({"allowed_mentions": {"parse": []}, "embeds": embeds[:10]})
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"payload_json\"\r\nContent-Type: application/json\r\n\r\n{payload}\r\n"
            f"--{b}\r\nContent-Disposition: form-data; name=\"files[0]\"; filename=\"{fname}\"\r\nContent-Type: image/png\r\n\r\n").encode() + png + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(url + "?wait=true", body, {"Content-Type": "multipart/form-data; boundary=" + b, "User-Agent": "maplefm.gg"})
    for i in range(3):
        try:
            urllib.request.urlopen(req, timeout=30).read(); return True
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(2 + i * 3); continue
            print("discord", kind, e.code, e.read()[:200]); return False
        except Exception as e:
            print("discord", kind, e); time.sleep(2)
    return False

def covmap_png(fresh, today, now_label):
    """FM rooms down the side, channels across: bright for read in the last two hours, soft for earlier today."""
    from PIL import Image, ImageDraw, ImageFont
    cw, chh, left, top = 22, 22, 56, 44
    W, H = left + CHANNELS * cw + 12, top + ROOMS * chh + 40
    bg, empty, soft, bright, ink, dim = (30, 31, 36), (52, 54, 61), (52, 120, 86), (87, 242, 135), (235, 236, 240), (150, 152, 160)
    im = Image.new("RGB", (W, H), bg); d = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype("DejaVuSans-Bold.ttf", 12); fs = ImageFont.truetype("DejaVuSans.ttf", 11); ft = ImageFont.truetype("DejaVuSans-Bold.ttf", 14)
    except Exception:
        f = fs = ft = ImageFont.load_default()
    d.text((left, 10), "FM coverage  " + now_label, fill=ink, font=ft)
    for c in range(1, CHANNELS + 1):
        if c == 1 or c % 5 == 0: d.text((left + (c - 1) * cw + 4, top - 16), str(c), fill=dim, font=fs)
    for r in range(1, ROOMS + 1):
        y = top + (r - 1) * chh
        d.text((8, y + 4), f"FM{r}", fill=ink, font=f)
        for c in range(1, CHANNELS + 1):
            k = (f"FM{r}", c); col = bright if k in fresh else soft if k in today else empty
            x = left + (c - 1) * cw + (2 if c > 20 else 0)
            d.rounded_rectangle([x + 1, y + 1, x + cw - 2, y + chh - 2], radius=4, fill=col)
    ly = top + ROOMS * chh + 12
    for i, (col, lab) in enumerate([(bright, "last 2 hours"), (soft, "earlier today"), (empty, "not read today")]):
        x = left + i * 150; d.rounded_rectangle([x, ly, x + 14, ly + 14], radius=3, fill=col); d.text((x + 20, ly), lab, fill=dim, font=fs)
    import io
    buf = io.BytesIO(); im.save(buf, "PNG", optimize=True); return buf.getvalue()

def job_covmap(data_dir, state_path):
    st = load(state_path, {})
    now = time.time()
    if now - (st.get("covmap_at") or 0) < 100 * 60: return
    today_s = datetime.datetime.now(ET).date().isoformat()
    fresh, today, by = set(), set(), {}
    for who, d in scan_docs(data_dir):
        if "chat" in str(d.get("src", "")): continue
        try: at = datetime.datetime.fromisoformat(d["at"]).timestamp()
        except Exception: continue
        for r in d["rows"]:
            t = int(r.get("t") or at)
            if et_day(t) != today_s: continue
            room = str(r.get("r") or "")
            if not (room.startswith("FM") and room[2:].isdigit() and 1 <= int(room[2:]) <= ROOMS): continue
            try: c = int(r.get("c") or 0)
            except Exception: continue
            if not 1 <= c <= CHANNELS: continue
            today.add((room, c))
            if now - t <= 2 * 3600: fresh.add((room, c)); by.setdefault(who, set()).add((room, c))
    if not today: return
    total = ROOMS * CHANNELS
    label = datetime.datetime.now(ET).strftime("%b %d, %I:%M %p ET").replace(" 0", " ")
    try: png = covmap_png(fresh, today, label)
    except Exception as e: print("covmap image", e); return
    rooms = {}
    for r, c in today: rooms[r] = rooms.get(r, 0) + 1
    gaps = [f"FM{n}" for n in range(1, ROOMS + 1) if rooms.get(f"FM{n}", 0) < CHANNELS // 4]
    sp = lambda n: f"{n} spot" + ("" if n == 1 else "s")
    desc = (f"**{sp(len(fresh))}** read in the last 2 hours, **{len(today)} of {total}** today ({len(today) * 100 // total}%).")
    fields = []
    top = sorted(by.items(), key=lambda kv: -len(kv[1]))[:6]
    if top: fields.append({"name": "Last 2 hours", "value": "\n".join(f"{plain(w, 24)} · {sp(len(s))}" for w, s in top)[:1000], "inline": True})
    if gaps:
        if len(gaps) <= 12: need = ", ".join(gaps)
        else:
            # most of the market is dark: point at whole channels nobody has opened today, the easiest place to start
            seen = {c for _, c in today}
            empty = [c for c in range(1, CHANNELS + 1) if c not in seen]
            need = ("Most of the market. " if len(gaps) == ROOMS else f"{len(gaps)} of {ROOMS} rooms. ") + \
                   (f"No reads yet on channels {', '.join(str(c) for c in empty[:8])}" + (" and more" if len(empty) > 8 else "") + "." if empty else "Every channel has a few reads; fill in the dark rooms.")
        fields.append({"name": "Needs scanning", "value": need[:1000], "inline": True})
    emb = {"title": "Coverage map", "description": desc, "color": BLUE, "fields": fields, "image": {"url": "attachment://coverage.png"},
           "url": f"{SITE}/contribute.html", "footer": {"text": "Pick a dark spot and run FM Watcher there."}}
    if post_file("covmap", png, "coverage.png", [emb]):
        st["covmap_at"] = int(now); save(state_path, st)


# ---------------------------------------------------------------- price of the day
def job_potd(summary_path, state_path):
    """One item a day in the market close channel: a well-traded equip or scroll with a real price story, linked to
    its page. No item twice in three weeks."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from itempages import slug, shown as pshown
    st = load(state_path, {})
    day = datetime.datetime.now(ET).strftime("%Y-%m-%d")
    if st.get("day") == day:
        return
    rows = [r for r in (load(summary_path, {}).get("rows") or []) if isinstance(r, dict) and r.get("kind") == "sale"
            and (r.get("salesN") or 0) >= 15 and (r.get("typ") or 0) >= 20000 and r.get("item")]
    recent = {x for x in st.get("seen", [])[-21:]}
    def week(r):
        d = [x for x in (r.get("daily") or []) if x and x[1]]
        return d[-1][1] / d[max(0, len(d) - 8)][1] - 1 if len(d) >= 5 else 0
    pool = [r for r in rows if r["item"] not in recent]
    if not pool:
        return
    # the most traded item that moved the most this week leads; ties go to more sales
    pool.sort(key=lambda r: -((r.get("salesN") or 0) ** 0.5 * (1 + min(abs(week(r)), 1.5))))
    r = pool[0]; w = week(r); nm = pshown(r["item"])
    rng = f'{meso(r["lo"])} to {meso(r["hi"])}' if r.get("hi") and r.get("lo") and meso(r["lo"]) != meso(r["hi"]) else meso(r["typ"])
    fields = [{"name": "Typical", "value": f'{meso(r["typ"])} meso', "inline": True},
              {"name": "Most sales", "value": rng, "inline": True},
              {"name": "This week", "value": pct(w) if abs(w) >= 0.01 else "steady", "inline": True},
              {"name": "Sales seen", "value": f'{r.get("salesN") or 0:,}', "inline": True}]
    url = f'{SITE}/item/{slug(r["item"])}/?ref=potd'
    emb = {"title": f"Price of the day · {nm}", "url": url, "color": GOLD, "fields": fields,
           "description": f"[Price history, live listings and drops]({url})",
           **({"thumbnail": {"url": icon_url(r["item"])}} if icon_url(r["item"]) else {}), "footer": {"text": "From sales players watched happen · maplefm.gg"}}
    if post("market_close", embeds=[emb]):
        st["day"] = day; st["seen"] = (st.get("seen", []) + [r["item"]])[-60:]
        save(state_path, st)


if __name__ == "__main__":
    job, a = sys.argv[1], sys.argv[2:]
    if not hooks():
        print("DISCORD_HOOKS not set, skipping"); sys.exit(0)
    if job == "digest": job_news(a[0], None, True)
    else: {"sales": job_sales, "deals": job_deals, "ranks": job_ranks, "report": job_report, "coverage": job_coverage, "news": job_news, "note": job_note, "weekly": job_weekly, "members": job_members, "covmap": job_covmap, "potd": job_potd}[job](*a)
