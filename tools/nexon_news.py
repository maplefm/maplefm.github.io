"""Post Nexon's MapleStory Classic World news to the Club FM Discord #maple-news channel.

  python3 tools/nexon_news.py STATE.json

Reads Nexon's news feed (the same one the maintenance check uses), keeps the Classic World posts of every
category (updates, events, maintenance, announcements), and posts each new one once: title, category,
a short excerpt and the link. STATE.json remembers what was posted. Nothing about the site goes here.
"""
import sys, os, json, re, html, datetime, urllib.request

FEED = "https://g.nexonstatic.com/maplestory/cms/v1/news"
UA = {"User-Agent": "Mozilla/5.0 (maplefm news)"}
SITE_NEWS = "https://www.nexon.com/maplestory/news"
COLORS = {"maintenance": 0xff5c5c, "update": 0x7c4dff, "updates": 0x7c4dff, "events": 0x3ddc84, "event": 0x3ddc84, "announcements": 0xf6c94a, "sale": 0x61d4f0}
FIRST_RUN_POSTS = 3

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from discord import post, hooks, load, save   # noqa: E402

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)

def text(body):
    t = re.sub(r"<br\s*/?>|</p>|</li>|</h\d>", "\n", body or "", flags=re.I)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    t = re.sub(r"[ \t\xa0]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n", t).strip()

def image_of(item, detail, body):
    """The post's picture: a known image field on the item or its detail, else the first image in the body."""
    for src in (item, detail or {}):
        for k in ("image", "imageUrl", "thumbnail", "thumbnailUrl", "banner", "bannerImage", "bannerUrl", "coverImage", "listImage", "thumbImage"):
            v = src.get(k) if isinstance(src, dict) else None
            if isinstance(v, dict): v = v.get("url") or v.get("src")
            if isinstance(v, str) and v.startswith("http"): return v
    m = re.search(r"<img[^>]+src=[\"']([^\"']+)[\"']", body or "", re.I)
    if m and m.group(1).startswith("http"): return m.group(1)
    return None

def excerpt(body, n=420):
    t = text(body)
    t = re.sub(r"https?://\S+", "", t)
    if len(t) <= n: return t
    cut = t[:n].rsplit(" ", 1)[0]
    return cut + "…"

def main(state_path):
    st = load(state_path, {})
    seen = set(st.get("posted") or [])
    items = [n for n in get(FEED) if n.get("isMSCW")]
    items.sort(key=lambda n: n.get("publishedAt") or n.get("createdAt") or "", reverse=True)
    fresh = [n for n in items if n.get("id") not in seen]
    first = not seen
    if first:
        fresh = fresh[:FIRST_RUN_POSTS]
    posted = 0
    for n in reversed(fresh):              # oldest first, so the channel reads in order
        cat = str(n.get("category") or "news").lower()
        try: detail = get(f"{FEED}/{n['id']}"); body = detail.get("body")
        except Exception: detail, body = {}, ""
        url = f"{SITE_NEWS}/{cat}/{n['id']}"
        title = next((str(n.get(k) or detail.get(k) or "") for k in ("title", "name", "subject", "headline") if n.get(k) or detail.get(k)), "")
        if not title:
            first = text(body).split("\n")[0].strip()
            title = first[:120] if first and not re.match(r"^\w+ \d{1,2}, \d{4}", first) else "MapleStory Classic World " + cat
        emb = {"title": title[:240], "url": url, "color": COLORS.get(cat, 0x7c4dff),
               "description": excerpt(body) + f"\n\n[Read the full post on Nexon]({url})",
               "footer": {"text": "Nexon · MapleStory Classic World · " + cat}}
        img = image_of(n, detail, body)
        if img: emb["image"] = {"url": img}
        when = n.get("publishedAt") or n.get("createdAt")
        if when:
            try: emb["timestamp"] = datetime.datetime.fromisoformat(str(when).replace("Z", "+00:00")).isoformat()
            except Exception: pass
        if post("news", embeds=[emb]):
            seen.add(n["id"]); posted += 1
    if first:
        seen |= {n["id"] for n in items}   # everything older than the first posts is history, not news
    st["posted"] = sorted(seen)[-500:]
    save(state_path, st)
    print("nexon news: %d posted, %d known" % (posted, len(seen)))

if __name__ == "__main__":
    if not hooks():
        print("DISCORD_HOOKS not set, skipping"); sys.exit(0)
    main(sys.argv[1])
