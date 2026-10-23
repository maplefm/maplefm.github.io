"""Write data/maintenance.json: MapleStory Classic World maintenance notices from Nexon's news feed.

Each notice: id, title, status (scheduled, completed, extended), start and end as UTC ISO times when the
post gives them, and a link. The price site shows a bar when one is coming up or under way.
"""
import json, re, sys, html, datetime, urllib.request

FEED = "https://g.nexonstatic.com/maplestory/cms/v1/news"
UA = {"User-Agent": "Mozilla/5.0 (maplefm maintenance check)"}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)

def text(body):
    t = re.sub(r"<br\s*/?>|</p>|</li>", "\n", body or "", flags=re.I)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"[ \t ]+", " ", t)

MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}

def clock(s):
    m = re.match(r"(\d{1,2})(?::(\d{2}))?\s*([AP]M)", s.strip(), re.I)
    if not m: return None
    h = int(m.group(1)) % 12 + (12 if m.group(3).upper() == "PM" else 0)
    return h, int(m.group(2) or 0)

def window(t, title):
    """Start and end in UTC from the post's PDT/PST line, using the date in the title or body."""
    d = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})", title + " " + t, re.I)
    if not d: return None, None
    day = datetime.date(int(d.group(3)), MONTHS[d.group(1).lower()], int(d.group(2)))
    m = re.search(r"P[DS]T\s*\(UTC\s*-\s*(\d+)\)\s*:\s*([0-9:]+\s*[AP]M)\s*[-–]\s*([0-9:]+\s*[AP]M)", t, re.I)
    if not m:
        m2 = re.search(r"at\s+([0-9:]+\s*[AP]M)\s*P[DS]T", t, re.I)
        if not m2: return None, None
        off, a, b = (7 if "PDT" in t else 8), clock(m2.group(1)), None
        e = re.search(r"concluding (?:around|at)\s+([0-9:]+\s*[AP]M)\s*P[DS]T", t, re.I)
        if e: b = clock(e.group(1))
    else:
        off, a, b = int(m.group(1)), clock(m.group(2)), clock(m.group(3))
    tz = datetime.timezone(datetime.timedelta(hours=-off))
    start = datetime.datetime(day.year, day.month, day.day, a[0], a[1], tzinfo=tz) if a else None
    end = datetime.datetime(day.year, day.month, day.day, b[0], b[1], tzinfo=tz) if b else None
    if start and end and end <= start: end += datetime.timedelta(days=1)
    iso = lambda x: x.astimezone(datetime.timezone.utc).isoformat().replace("+00:00", "Z") if x else None
    return iso(start), iso(end)

def main(out):
    now = datetime.datetime.now(datetime.timezone.utc)
    items = [n for n in get(FEED) if n.get("isMSCW") and (n.get("category") or "").lower() == "maintenance"]
    items.sort(key=lambda n: n.get("liveDate") or "", reverse=True)
    notices = []
    for n in items[:8]:
        title = n.get("name") or ""
        if re.search(r"known issues", title, re.I): continue
        live = datetime.datetime.fromisoformat((n.get("liveDate") or "1970-01-01T00:00:00Z").replace("Z", "+00:00"))
        if now - live > datetime.timedelta(days=21): continue
        try: body = text(get(f"{FEED}/{n['id']}").get("body"))
        except Exception: body = n.get("summary") or ""
        start, end = window(body, title)
        status = "completed" if re.search(r"\[completed\]", title, re.I) else "extended" if re.search(r"extend", title, re.I) else "scheduled"
        what = re.search(r"What will be unavailable:\s*(.+?)(?:\n|Changes|$)", body, re.I)
        notices.append({"id": n["id"], "title": re.sub(r"^\[[^\]]+\]\s*", "", title), "status": status, "start": start, "end": end,
                        "down": (what.group(1).strip() if what else "")[:160], "posted": n.get("liveDate"),
                        "url": f"https://www.nexon.com/maplestory/news/maintenance/{n['id']}"})
    doc = {"checked": now.isoformat().replace("+00:00", "Z"), "source": "Nexon news, Classic World maintenance", "notices": notices}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1)
    print(len(notices), "notices")
    for x in notices: print(x["status"], x["start"], x["end"], x["title"])

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "maintenance.json")
