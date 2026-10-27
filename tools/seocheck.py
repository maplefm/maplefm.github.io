"""Weekly search health check: every page in the sitemap, fetched like a visitor.
  python3 tools/seocheck.py OUT.json
Counts what would hurt us in Google: pages that don't load, redirect, carry noindex, point their canonical elsewhere,
miss a title, description or heading, share a title, or load slowly. The Monday traffic DM shows the counts."""
import re, sys, json, time, datetime, collections, urllib.request, concurrent.futures as cf

SITE = "https://maplefm.gg"

def get(u):
    t = time.time()
    for i in range(3):
        try:
            r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 clubfm-seocheck"}), timeout=30)
            b = r.read().decode("utf-8", "replace"); break
        except Exception as e:
            if i == 2: return u, {"err": str(e)[:80]}
            time.sleep(3)
    g = lambda p: (re.search(p, b, re.I | re.S) or [None, None])[1]
    return u, {"code": r.status, "final": r.url, "ms": int((time.time() - t) * 1000), "title": g(r"<title>(.*?)</title>"),
               "desc": g(r'<meta name="description" content="([^"]*)"'), "canon": g(r'<link rel="canonical" href="([^"]*)"'),
               "h1": g(r"<h1[^>]*>(.*?)</h1>"), "robots": g(r'<meta name="robots" content="([^"]*)"')}

def main(out):
    sm = urllib.request.urlopen(SITE + "/sitemap.xml").read().decode()
    urls = re.findall(r"<loc>([^<]+)</loc>", sm)
    with cf.ThreadPoolExecutor(16) as ex: R = dict(ex.map(get, urls))
    titles = collections.Counter(v.get("title") for v in R.values() if v.get("title"))
    iss = collections.Counter(); ex = collections.defaultdict(list)
    for u, v in R.items():
        def bad(k): iss[k] += 1; ex[k].append(u)
        if "err" in v or v.get("code") != 200: bad("not loading"); continue
        if v["final"].rstrip("/") != u.rstrip("/"): bad("redirects")
        if v["robots"] and "noindex" in v["robots"]: bad("noindex")
        if v["canon"] != u: bad("canonical elsewhere")
        if not v["title"]: bad("no title")
        elif len(v["title"]) > 70: bad("long titles")
        elif titles[v["title"]] > 1: bad("same title as another page")
        if not v["desc"]: bad("no description")
        if not v["h1"]: bad("no heading")
        if v["ms"] > 3000: bad("slow (over 3s)")
    ms = sorted(v.get("ms", 0) for v in R.values() if "ms" in v)
    rep = {"day": datetime.date.today().isoformat(), "pages": len(urls), "ms": ms[len(ms) // 2] if ms else 0,
           "issues": dict(iss), "examples": {k: v[:5] for k, v in ex.items()}}
    json.dump(rep, open(out, "w"), indent=1)
    print(json.dumps({k: rep[k] for k in ("pages", "ms", "issues")}))

if __name__ == "__main__":
    main(sys.argv[1])
