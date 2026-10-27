"""Contributor credits: verified sales caught, by the rules in the Contributor Pay design.

  python3 tools/credits.py DATA_DIR OUT.json [POOL_JSON] [ITEMDB_JSON] [LINKS_JSON] [LEDGER_JSON]

LEDGER_JSON is the lasting all-time count of verified sales per scanner, kept across runs: the inbox only holds
two weeks, so without it "all-time" would mean "the last fourteen days". Days inside the inbox window are
recomputed every run; older days keep the count they had.

LINKS_JSON is the accounts service's /public/links: scanner tag -> in-game name. Keys that start with
"stream:" are streamers who verified their Twitch account on the site; their stream captures earn like
a watcher's scans. Other streams only witness.

One credit = one sale a watcher saw go from open to sold, where someone else also saw that listing:
another contributor's watcher or a Twitch stream capture. A sale nobody else saw (most of them while
the scanner base is small: sold slots already sitting in a shop when the watcher walks in) earns
SELF_RATE of a credit, and the week's flags call out a scanner whose sellers nobody else ever sees. Only watcher
shop scans earn (streams witness, never earn). Sales under MIN_PRICE and beyond SHOP_CAP credits from
one seller's shop in a day earn nothing. Credits go to whoever saw the sale first, as the ranks do.
Weeks run Monday 00:00 Eastern.

Trial mode: this publishes numbers so the rules can be watched against real scanning before anyone is
paid. POOL_JSON, if given, holds the settings the owner sets by hand:
  {"rate_per_100": 0.50, "daily_cap": 10, "weekly_cap": 50, "weekly_budget": 250, "min_payout": 5}
Everyone earns rate_per_100 for each 100 verified sales, at most daily_cap a day and weekly_cap a week;
if the week's total would still pass the budget, the rate scales down for that week so the budget
holds, and the page says so.
"""
import sys, os, json, glob, datetime, collections
try:
    from zoneinfo import ZoneInfo
    ET = ZoneInfo("America/New_York")
except Exception:
    ET = datetime.timezone(datetime.timedelta(hours=-4))
MIN_PRICE = 20             # a sale earns only above what an NPC shop pays for the item, or above this when no NPC price is known
VEND = {}                  # item name (lower) -> NPC vendor price, from itemdb.json when given
TAGS = {}                  # scanner display name -> public tag (first 4 of the hashed inbox id), for account links
EARN_STREAMS = set()       # "stream:<twitch login>" of streamers who verified their Twitch account; they earn, others witness
SHOP_CAP = 20            # credits one seller's shop can yield per day, all contributors together
REOPEN_GAP = 30 * 60     # a drop in sold slots after this long means the shop was reopened
SELF_RATE = 0.5          # what an unwitnessed sale earns, the trial setting while few people scan
OWNER = {"maya", "adam"}
ALIAS = {"adam": "Maya", "yinisera": "Yint"}   # one scanner under an older name: history folds into the current one         # the owner's scans are tracked but excluded from the pool
NAMES = {"watcher.json": "Maya", "watcher-2.json": "Jack", "watcher-3.json": "Matt", "watcher-4.json": "Jimmy"}
OWNH = {"a4959daa", "bd22ad91", "6d3b4a44", "5b5738ce", "7528a716"}   # club members' own shops, never credited
KNOWN = set()              # item names (lower) from itemdb.json; when given, only real items earn (no OCR scraps)
LINKS = {}                 # scanner tag -> in-game name of the account that linked it; two watchers on one account are one person
RECEIVED = {}              # (inbox tag, day) -> when that day's upload last arrived, to clamp claimed times

def own(name):
    x = 0x811c9dc5
    for c in ("clubfm:" + name.lower()).encode():
        x ^= c; x = (x * 0x01000193) & 0xffffffff
    return format(x, "08x") in OWNH

def load(path, default):
    try: return json.load(open(path, encoding="utf-8"))
    except Exception: return default

def week_start(dt):
    d = dt.astimezone(ET)
    monday = (d - datetime.timedelta(days=d.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return monday

HOVERS = {}                # listing key -> (t, scanner) of the first stats capture (an equip hovered in game)
HOVER_RATE = 0.1           # credit for being the first to capture an equip's stats; the owner sets it in pay.json
WITNESS_RATE = 0.25        # credit for confirming someone else's sale (max WITNESS_MAX witnesses per sale); streams get none
WITNESS_MAX = 2
SELF_TO_BAR = 0.25         # an unverified sale counts this much toward the unlock bar (pay for it stays SELF_RATE)

def observations(data_dir):
    """Every look at a shop listing by a watcher: key -> [(t, scanner, sold, open)]"""
    obs = collections.defaultdict(list)
    TAGS.clear(); HOVERS.clear(); SPOTS.clear(); KEYSPOT.clear()
    for f in sorted(glob.glob(os.path.join(data_dir, "*.json"))):
        b = os.path.basename(f)
        if b not in NAMES and b not in ("inbox.json", "streams.json", "streams-vods.json"): continue
        stream = b.startswith("streams")
        docs = load(f, [])
        if not isinstance(docs, list): continue
        for d in docs:
            if not isinstance(d, dict) or not isinstance(d.get("rows"), list): continue
            src = str(d.get("src") or "")
            if "chat" in src or (not stream and not src.startswith("watcher")): continue
            who = ("stream:" + str(d.get("by") or "")) if stream else (NAMES.get(b) or str(d.get("who") or d.get("inbox") or "Guest")[:24])
            who = ALIAS.get(who.lower(), who)
            if not stream and d.get("inbox"): TAGS[who] = str(d["inbox"])[:4]
            try: at = int(datetime.datetime.fromisoformat(d["at"]).timestamp())
            except Exception: continue
            look = collections.defaultdict(lambda: [0, 0])
            for r in d["rows"]:
                s = str(r.get("s") or "")
                if not s or own(s) or r.get("k") == "b": continue
                p = int(r.get("p") or 0)
                item = str(r.get("i") or "").lower()
                if KNOWN and item not in KNOWN: continue                   # a name the game doesn't have is a misread, not a sale
                key = (s.lower(), item, p, int(r.get("q") or 1))
                t = int(r.get("t") or at)
                if t > at: t = at                                         # a row cannot be newer than the upload it came in
                if r.get("so") and r.get("ss") and t < int(r["ss"]) - 1800:   # claimed sold long before the pump first saw it sold
                    t = int(r["ss"]) - 1800                               # the pump runs every 5 minutes; half an hour of slack
                look[(key, t)][1 if r.get("so") else 0] += 1
                if not stream and r.get("r") and r.get("c"):
                    spot = (str(r["r"]), int(r["c"])); SPOTS[spot].append((t, who)); KEYSPOT[key] = spot
                if not stream and isinstance(r.get("x"), dict) and r["x"] and (key not in HOVERS or t < HOVERS[key][0]):
                    HOVERS[key] = (t, who)
            for (key, t), (u, sld) in look.items():
                obs[key].append((t, who, sld, u))
    return obs

def price_ok(item, price):
    v = VEND.get(item)
    return price > v if v else price >= MIN_PRICE

def person(who):
    """Who a scanner really is: the in-game name of the account that linked the watcher, else the scanner name.
    Two watchers linked to one account are one person and never verify each other."""
    if who.startswith("stream:"): return who.lower()
    tag = TAGS.get(who)
    return LINKS[tag].lower() if tag and LINKS.get(tag) else who.lower()

WITNESS_WINDOW = 24 * 3600   # a witness counts when they saw the listing within a day of the sale, not ever
SPOTS = collections.defaultdict(list)   # (room, channel) -> [(t, who)]: every look at every spot
KEYSPOT = {}                            # listing key -> the spot it was last seen in
COLD_GAP = 24 * 3600                    # a spot nobody else has read in a day is cold
COLD_BONUS = 0.5                        # extra credit on a verified sale caught in a cold spot

def is_cold(key, t, who):
    """Nobody but this scanner read the listing's spot in the day before: a room the regulars skip."""
    spot = KEYSPOT.get(key)
    if not spot: return False
    me = person(who)
    for t2, w in SPOTS.get(spot, ()):
        if t - COLD_GAP <= t2 < t and person(w) != me: return False
    return True

def credits(obs, start, end):
    """Sales credited in [start, end): list of (t, scanner, seller, price, witnesses, consistent)
    A witness is a different person (not another watcher on the same account) who saw the same listing within a
    day of the sale. consistent is true when the crediting scanner saw the listing open before it sold, or another
    party saw it sold too: a sale they watched happen, not a sold slot found in a shop (or copied from public data)."""
    out = []
    for key, looks in obs.items():
        seller, item, price, qty = key
        looks.sort()
        cur, hi_t, first_open, sold_by = 0, 0, {}, {}
        for t, who, sld, u in looks:
            if who.startswith("stream:") and who.lower() not in EARN_STREAMS: continue   # unverified streams witness, they don't earn
            if u and who not in first_open: first_open[who] = t
            if sld < cur and t - hi_t > REOPEN_GAP: cur = 0
            if sld > cur:
                n = sld - cur; cur = sld
                if start <= t < end and price_ok(item, price):
                    me = person(who)
                    others = {w for (t2, w, s2, u2) in looks if person(w) != me and abs(t2 - t) <= WITNESS_WINDOW}
                    saw_open = who in first_open and first_open[who] < t
                    saw_sold = any(person(w) != me and s2 >= sld and abs(t2 - t) <= WITNESS_WINDOW for (t2, w, s2, u2) in looks)
                    wit = sorted({person(w) for (t2, w, s2, u2) in looks if not w.startswith("stream:") and person(w) != me and abs(t2 - t) <= WITNESS_WINDOW})[:WITNESS_MAX]
                    cold = is_cold(key, t, who)
                    for _ in range(n): out.append((t, who, seller, price, others, saw_open or saw_sold, wit, cold))
            if sld >= cur: hi_t = t
    out.sort()
    # one seller's shop yields at most SHOP_CAP credits a day
    per_day = collections.Counter(); kept = []
    for row in out:
        t, seller = row[0], row[2]
        day = datetime.datetime.fromtimestamp(t, ET).date().isoformat()
        if per_day[(seller, day)] >= SHOP_CAP: continue
        per_day[(seller, day)] += 1
        kept.append(row)
    return kept

def lifetime_verified(kept, ledger, window_start):
    """All-time verified sales per person: the bar a contributor clears before credits turn into pay.
    Days inside the inbox window are recomputed from what is there; older days keep the ledger's count."""
    days = collections.defaultdict(collections.Counter)
    for t, who, seller, price, others, consistent, wit, cold in kept:
        if STRICT and not consistent: continue
        day = datetime.datetime.fromtimestamp(t, ET).date().isoformat()
        days[person(who)][day] += 1 if others else SELF_TO_BAR
    cut = datetime.datetime.fromtimestamp(window_start, ET).date().isoformat()
    for p, old in (ledger.get("days") or {}).items():
        for day, n in old.items():
            if day < cut: days[p][day] = max(days[p][day], float(n))
    ledger["days"] = {p: {d: round(v, 2) for d, v in dd.items()} for p, dd in days.items()}
    return collections.Counter({p: sum(d.values()) for p, d in days.items()})

KOFI = {}                    # /public/kofi-income from the Worker: {"total": dollars over 28 days}
STRICT = False   # pay only for sales the scanner watched happen (saw it open first, or someone else saw it sold too)

def tally(kept, obs, start, end, life=None):
    life = life or {}
    by = collections.defaultdict(lambda: {"verified": 0, "self": 0, "dropped": 0, "hovers": 0, "witnessed": 0, "cold": 0, "credits": 0.0, "days": collections.Counter(), "sellers": collections.Counter(), "witnesses": collections.Counter(), "hours": set(), "volume": 0, "names": set()})
    # the first scanner to hover an equip and capture its stats: the work behind every roll price on the board
    hov_day = collections.Counter()
    for key, (t, who) in HOVERS.items():
        if not (start <= t < end) or not price_ok(key[1], key[2]): continue
        day = datetime.datetime.fromtimestamp(t, ET).date().isoformat()
        if hov_day[(key[0], day)] >= SHOP_CAP: continue
        hov_day[(key[0], day)] += 1
        c = by[person(who)]; c["names"].add(who); c["hovers"] += 1; c["credits"] += HOVER_RATE; c["days"][day] += HOVER_RATE
    for t, who, seller, price, others, consistent, wit, cold in kept:
        c = by[person(who)]; c["names"].add(who); day = datetime.datetime.fromtimestamp(t, ET).date().isoformat()
        if STRICT and not consistent:
            c["dropped"] += 1
            continue
        if cold and consistent:                          # the cold-room bounty: a watched sale from a spot nobody else reads
            c["cold"] += 1; c["credits"] += COLD_BONUS; c["days"][day] += COLD_BONUS
        for w in wit:                                   # the people whose watcher confirmed this sale
            wc = by[w]; wc["names"].add(w); wc["witnessed"] += 1; wc["credits"] += WITNESS_RATE; wc["days"][day] += WITNESS_RATE
        if others:
            c["verified"] += 1; c["credits"] += 1; c["days"][day] += 1; c["volume"] += price; c["sellers"][seller] += 1
            for o in others: c["witnesses"][o] += 1
        else:
            c["self"] += 1; c["credits"] += SELF_RATE; c["days"][day] += SELF_RATE; c["volume"] += price; c["sellers"][seller] += 1
    seen_by = collections.defaultdict(set)
    for key, looks in obs.items():
        for t, who, sld, u in looks:
            seen_by[key[0]].add(person(who))
            if start <= t < end and not who.startswith("stream:") and person(who) in by: by[person(who)]["hours"].add(t // 3600)
    for who, c in by.items():
        sellers = list(c["sellers"])
        c["ghost"] = sum(1 for sl in sellers if seen_by[sl] <= {who}) / len(sellers) if sellers else 0
    rows = []
    rates = [c["credits"] / max(1, len(c["hours"])) for c in by.values() if c["credits"]]
    typical = sorted(rates)[len(rates) // 2] if rates else 0
    for who, c in by.items():
        flags = []
        hrs = len(c["hours"]); rate = c["credits"] / max(1, hrs)
        if c["credits"] >= 20 and typical and rate > 3 * typical: flags.append("credits per hour far above others")
        if c["credits"] >= 10 and c["sellers"] and c["sellers"].most_common(1)[0][1] > 0.4 * c["credits"]: flags.append("over 40% of credits from one seller")
        if c["verified"] >= 10 and len(c["witnesses"]) == 1: flags.append("one witness for every verified sale")
        if c["credits"] >= 20 and c["ghost"] > 0.6: flags.append("%d%% of their sellers were never seen by anyone else" % round(c["ghost"] * 100))
        names = sorted(c["names"], key=lambda n: (n.startswith("stream:"), n)) or [who]
        shown = next((LINKS[TAGS[n]] for n in names if TAGS.get(n) and LINKS.get(TAGS[n])), names[0])
        if shown.startswith("stream:"): shown = shown[7:]
        tag = TAGS.get(names[0]) or names[0].lower()
        rows.append({"name": shown, "person": who, "tag": tag, "watchers": names, "credits": round(c["credits"], 1), "hovers": c["hovers"], "witnessed": c["witnessed"], "cold": c["cold"], "days": {d: round(v, 1) for d, v in c["days"].items()}, "verified": c["verified"], "self": c["self"], "dropped": c["dropped"], "hours": hrs,
                     "volume": c["volume"], "top_seller": c["sellers"].most_common(1)[0][0] if c["sellers"] else None,
                     "witnesses": len(c["witnesses"]), "ghost": round(c["ghost"], 2), "flags": flags, "owner": shown.lower() in OWNER or any(n.lower() in OWNER for n in names),
                     "lifetime_verified": int(life.get(who, 0)), "bar": round(float(life.get(who, 0)), 1)})
    rows.sort(key=lambda r: (-r["credits"], r["name"].lower()))
    return rows

def cap_on(pool):
    """The weekly cap holds until Ko-fi support reaches uncap_kofi_month (dollars over the last 28 days)."""
    line = float(pool.get("uncap_kofi_month") or 0)
    return not (line and KOFI.get("total") is not None and float(KOFI.get("total") or 0) >= line)

def balances(all_rows, ledger, window_start, pool, life, payouts):
    """What each person is owed: every credit they've earned, all time, at the posted rate (weekly cap while it
    holds, scaled down for a week that would pass the budget), less what has been paid out. A payout sends the
    whole balance, so it goes back to 0 and builds again. Pay unlocks once, when the bar reaches unlock_verified."""
    rate = float(pool.get("rate_per_100") or 0); wcap = float(pool.get("weekly_cap") or 0) if cap_on(pool) else 0.0
    budget = float(pool.get("weekly_budget") or 0); unlock = int(pool.get("unlock_verified") or 0)
    kb = pool.get("kofi_budget") or {}
    if kb and KOFI.get("total") is not None:
        try: budget = max(budget, min(float(kb.get("max") or 1000), max(0.0, float(KOFI.get("total") or 0)) * float(kb.get("share", 1.0))))
        except (TypeError, ValueError): pass
    minp = float(pool.get("min_payout") or 5)
    cut = datetime.datetime.fromtimestamp(window_start, ET).date().isoformat()
    days = collections.defaultdict(dict); meta = {}
    for r in all_rows:
        meta[r["person"]] = r
        for d, v in r["days"].items(): days[r["person"]][d] = v
    for p, old in (ledger.get("cred") or {}).items():
        for d, v in old.items():
            if d < cut: days[p][d] = max(days[p].get(d, 0), float(v))
    ledger["cred"] = {p: {d: round(v, 2) for d, v in dd.items()} for p, dd in days.items()}
    def wk(d): dt = datetime.date.fromisoformat(d); return (dt - datetime.timedelta(days=dt.weekday())).isoformat()
    owners = {p for p, r in meta.items() if r.get("owner")}
    per = collections.defaultdict(lambda: collections.defaultdict(float))     # person -> week -> dollars
    for p, dd in days.items():
        for d, v in dd.items(): per[p][wk(d)] += v / 100 * rate
    weeks = sorted({w for p in per for w in per[p]})
    for w in weeks:
        if wcap:
            for p in per:
                if w in per[p]: per[p][w] = min(per[p][w], wcap)
        tot = sum(per[p].get(w, 0) for p in per if p not in owners)
        if budget and tot > budget:
            f = budget / tot
            for p in per:
                if w in per[p]: per[p][w] *= f
    paid_map = {str(k).lower(): v for k, v in (payouts or {}).items()}
    out = []
    for p in per:
        r = meta.get(p, {"name": p, "tag": p.lower(), "owner": p.lower() in OWNER})
        earned = round(sum(per[p].values()), 2)
        hist = paid_map.get(p.lower()) or paid_map.get(str(r.get("name", "")).lower()) or paid_map.get(str(r.get("tag", "")).lower()) or []
        paid = round(sum(float(x.get("amount") or 0) for x in hist), 2)
        owed = round(max(0.0, earned - paid), 2)
        # the bar is every credit earned, all time: it keeps counting past the unlock as a lifetime record, and payouts never lower it
        bar = round(sum(days[p].values()), 1); unlocked = bar >= unlock
        out.append({"name": r.get("name", p), "person": p, "tag": r.get("tag"), "owner": bool(r.get("owner")), "earned": earned, "paid": paid, "owed": owed,
                    "bar": bar, "unlocked": unlocked, "payable": (not r.get("owner")) and unlocked and owed >= minp,
                    "last_paid": max((x.get("date") for x in hist), default=None)})
    out.sort(key=lambda x: (-x["owed"], x["name"].lower()))
    return out

def payout(rows, pool):
    rate = float(pool.get("rate_per_100") or 0)
    dcap, wcap = float(pool.get("daily_cap") or 0), float(pool.get("weekly_cap") or 0)
    if not cap_on(pool): wcap = 0.0
    budget = float(pool.get("weekly_budget") or 0)
    # the budget follows Ko-fi support once support passes it: the last 4 weeks of income, times "share" (1.0 pays
    # out everything that came in over those weeks each week; 0.25 pays out a week's worth)
    kb = pool.get("kofi_budget") or {}
    if kb and KOFI.get("total") is not None:
        try: follow = min(float(kb.get("max") or 1000), max(0.0, float(KOFI.get("total") or 0)) * float(kb.get("share", 1.0)))
        except (TypeError, ValueError): follow = 0.0
        if follow > budget: budget = round(follow, 2)
    unlock = int(pool.get("unlock_verified") or 0)
    for r in rows: r["unlocked"] = r.get("bar", r["lifetime_verified"]) >= unlock
    def paid(r): return not r["owner"] and r["unlocked"]
    def earn(r, rt):
        days = [min(v / 100 * rt, dcap) if dcap else v / 100 * rt for v in r["days"].values()]
        w = sum(days)
        return min(w, wcap) if wcap else w
    total = sum(r["credits"] for r in rows if not r["owner"])
    bill = sum(earn(r, rate) for r in rows if paid(r))
    scaled = budget > 0 and bill > budget
    eff = rate
    if scaled:                       # bring the rate down until the capped bill fits the budget
        lo, hi = 0.0, rate
        for _ in range(40):
            eff = (lo + hi) / 2
            if sum(earn(r, eff) for r in rows if paid(r)) > budget: hi = eff
            else: lo = eff
        eff = lo
    for r in rows:
        r["uncapped"] = round(r["credits"] / 100 * eff, 2)   # the owner line shows what the rules would pay; he does not take it
        r["pays"] = round(earn(r, eff), 2) if paid(r) else 0
        r["capped"] = paid(r) and r["pays"] < r["uncapped"] - 0.005
    paying = sum(r["pays"] for r in rows)
    return {"rate_per_100": rate, "effective_rate": round(eff, 4), "daily_cap": dcap, "weekly_cap": wcap, "weekly_budget": budget, "kofi_28d": KOFI.get("total"),
            "bill": round(bill, 2), "paying": round(paying, 2), "scaled": scaled, "total_credits": total,
            "min_payout": float(pool.get("min_payout") or 5), "unlock_verified": unlock, "cap_on": cap_on(pool), "uncap_kofi_month": float(pool.get("uncap_kofi_month") or 0)}

if __name__ == "__main__":
    data_dir, out = sys.argv[1], sys.argv[2]
    pool = load(sys.argv[3], {}) if len(sys.argv) > 3 else {}
    if len(sys.argv) > 4:
        for r in (load(sys.argv[4], {}).get("items") or []):
            if r[6]: VEND[str(r[0]).lower()] = max(VEND.get(str(r[0]).lower(), 0), int(r[6]))
    if len(sys.argv) > 5:
        for k, v in (load(sys.argv[5], {}) or {}).items():
            if str(k).startswith("stream:"): EARN_STREAMS.add(str(k).lower())
            if isinstance(v, str) and v: LINKS[str(k)] = v
    if len(sys.argv) > 4:
        for r in (load(sys.argv[4], {}).get("items") or []): KNOWN.add(str(r[0]).lower())
    STRICT = bool(pool.get("strict"))
    if "hover_credit" in pool: HOVER_RATE = float(pool.get("hover_credit") or 0)
    if "witness_credit" in pool: WITNESS_RATE = float(pool.get("witness_credit") or 0)
    if "self_to_bar" in pool: SELF_TO_BAR = float(pool.get("self_to_bar") or 0)
    if "cold_bonus" in pool: COLD_BONUS = float(pool.get("cold_bonus") or 0)
    ledger_path = sys.argv[6] if len(sys.argv) > 6 else None
    if len(sys.argv) > 7: KOFI = load(sys.argv[7], {}) or {}
    ledger = load(ledger_path, {}) if ledger_path else {}
    now = datetime.datetime.now(ET)
    this_wk = week_start(now); last_wk = this_wk - datetime.timedelta(days=7)
    obs = observations(data_dir)
    window_start = int((now - datetime.timedelta(days=12)).timestamp())   # the inbox keeps 14 days; trust the last 12 as complete
    end_all = int((this_wk + datetime.timedelta(days=7)).timestamp())
    kept_all = credits(obs, 0, end_all)
    life = lifetime_verified(kept_all, ledger, window_start)
    # what has been paid out, per person: data/payouts.json next to pay.json, {"Name": [{"date": "2026-11-02", "amount": 12.5}]}
    payouts = load(sys.argv[8] if len(sys.argv) > 8 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "payouts.json"), {})
    bal = balances(tally(kept_all, obs, 0, end_all, life), ledger, window_start, pool, life, payouts)
    life = collections.Counter({b["person"]: b["bar"] for b in bal})   # weekly rows show the same all-time credit bar
    if ledger_path:
        ledger["updated"] = now.isoformat()
        json.dump(ledger, open(ledger_path, "w", encoding="utf-8"), separators=(",", ":"), sort_keys=True)
    weeks = []
    for a, b in ((this_wk, this_wk + datetime.timedelta(days=7)), (last_wk, this_wk)):
        kept = credits(obs, int(a.timestamp()), int(b.timestamp()))
        rows = tally(kept, obs, int(a.timestamp()), int(b.timestamp()), life)
        weeks.append({"start": a.date().isoformat(), "end": (b - datetime.timedelta(days=1)).date().isoformat(),
                      "current": a == this_wk, "math": payout(rows, pool), "rows": rows})
    json.dump({"generated": now.isoformat(), "trial": True,
               "rules": {"min_price": MIN_PRICE, "vendor_floor": bool(VEND), "shop_cap_per_day": SHOP_CAP, "self_rate": SELF_RATE, "witnesses": "another person's watcher or a stream capture, within a day of the sale", "earns": "watcher shop scans only", "strict": STRICT, "known_items_only": bool(KNOWN), "hover_credit": HOVER_RATE, "witness_credit": WITNESS_RATE, "self_to_bar": SELF_TO_BAR, "cold_bonus": COLD_BONUS},
               "weeks": weeks, "balances": bal}, open(out, "w", encoding="utf-8"), separators=(",", ":"))
    w = weeks[0]
    print("week of %s: %d contributors, %d credits" % (w["start"], len(w["rows"]), w["math"]["total_credits"]))
    for r in w["rows"][:8]: print("  %-18s %7.1f credits  %4d verified %4d self %4d dropped %3d h  $%.2f %s" % (r["name"], r["credits"], r["verified"], r["self"], r["dropped"], r["hours"], r["pays"], ", ".join(r["flags"])))
