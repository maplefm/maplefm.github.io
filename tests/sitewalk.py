"""Every page and every link on the site, the way a crawler sees it, plus how easy it is to get around.
Reads the pages in this checkout (the live build), and the live data for item, quest and map names behind # links.
  python3 tests/sitewalk.py [data dir with world.json itemguide.json summary-public.json] [out.json]
Checks: every internal link lands on a page that exists; #item=, #q-, #route=, #map= and #anchor links name a real
item, quest, map or spot on the page; pages nothing links to; pages with no way back to the board; pages without
breadcrumbs or the site menu; clicks from the board to every page. Exit 1 on any broken link."""
import os, re, sys, json, collections, urllib.parse
from html.parser import HTMLParser

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-0/bt"
OUT = sys.argv[2] if len(sys.argv) > 2 else None
SKIP = {"tests", "tools", "worker", "assets", "data", "i", "icons", "node_modules", ".git", ".github", "download"}

def load(n):
    try: return json.load(open(os.path.join(D, n)))
    except Exception: return None
W, G, S = load("world.json"), load("itemguide.json"), load("summary-public.json")
ITEMS = set((G or {}).get("items", {}).keys()) | {r["item"] for r in (S or {}).get("rows", [])}
QIDS = {str(q["id"]) for q in (G or {}).get("quests", [])}
MAPS = set((W or {}).get("maps", {}).keys())

class P(HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=True); s.stack = []; s.links = []; s.ids = set(); s.title = ""; s.h1 = ""; s._t = None
        s.marks = collections.Counter(); s.robots = ""; s.canon = ""; s.refresh = ""
    def zone(s):
        for tag, cls in reversed(s.stack):
            if tag == "footer" or "foot" in cls: return "footer"
            if "sitenav" in cls or "playbar" in cls or "navs" in cls or tag == "header": return "nav"
            if "crumbs" in cls: return "crumbs"
        return "content"
    def handle_starttag(s, tag, a):
        a = dict(a); cls = a.get("class") or ""
        if tag not in ("br", "img", "input", "meta", "link", "hr", "source"): s.stack.append((tag, cls))
        if a.get("id"): s.ids.add(a["id"])
        if a.get("name") and tag == "a": s.ids.add(a["name"])
        for k in ("sitenav", "crumbs", "playbar", "ptabs"):
            if k in cls.split(): s.marks[k] += 1
        if tag == "footer": s.marks["footer"] += 1
        if tag == "meta" and a.get("name") == "robots": s.robots = a.get("content", "")
        if tag == "meta" and (a.get("http-equiv") or "").lower() == "refresh": s.refresh = a.get("content", "")
        if tag == "link" and a.get("rel") == "canonical": s.canon = a.get("href", "")
        if tag == "a" and a.get("href") is not None: s.links.append([a["href"], s.zone(), ""]); s._t = s.links[-1]
        if tag in ("title", "h1"): s._cap = tag
    def handle_endtag(s, tag):
        for i in range(len(s.stack) - 1, -1, -1):
            if s.stack[i][0] == tag: del s.stack[i:]; break
        if tag == "a": s._t = None
        if tag in ("title", "h1"): s._cap = None
    def handle_data(s, d):
        if s._t is not None: s._t[2] += d
        c = getattr(s, "_cap", None)
        if c == "title": s.title += d
        elif c == "h1": s.h1 += d

pages = {}
for dp, dn, fn in os.walk(R):
    rel = os.path.relpath(dp, R)
    top = rel.split(os.sep)[0]
    if rel != "." and (top in SKIP or rel.startswith(".")): dn[:] = []; continue
    for f in fn:
        if not f.endswith(".html") or f.startswith("google"): continue
        path = "/" + ("" if rel == "." else rel.replace(os.sep, "/") + "/") + ("" if f == "index.html" else f)
        pages[path] = os.path.join(dp, f)

def resolve(base, href):
    href = href.strip()
    if href.startswith(("mailto:", "tel:", "javascript:", "data:")): return ("other", href, "")
    u = urllib.parse.urlparse(urllib.parse.urljoin("https://maplefm.gg" + base, href))
    if u.netloc and u.netloc not in ("maplefm.gg", "www.maplefm.gg"): return ("ext", href, "")
    return ("int", urllib.parse.unquote(u.path) or "/", (("?" + u.query) if u.query else "") + (("#" + u.fragment) if u.fragment else ""))

def exists(p):
    if p in pages: return p
    if not p.endswith("/") and p + "/" in pages: return p + "/"
    f = os.path.join(R, p.lstrip("/"))
    if os.path.isfile(f): return p
    return None

info, broken, badhash, ext = {}, collections.defaultdict(list), collections.defaultdict(list), collections.Counter()
notes = collections.defaultdict(list)
graph, cgraph = collections.defaultdict(set), collections.defaultdict(set)
nlinks = 0
for path, f in pages.items():
    p = P(); p.feed(open(f, encoding="utf-8", errors="replace").read())
    out = 0; home = False
    for href, zone, text in p.links:
        kind, tgt, rest = resolve(path, href)
        if kind == "ext": ext[re.sub(r"^https?://", "", href).split("/")[0]] += 1; continue
        if kind != "int": continue
        nlinks += 1
        t = exists(tgt)
        if not t and not tgt.startswith(("/i/", "/favicon")): broken[tgt].append(path); continue
        h = rest.split("#", 1)[1] if "#" in rest else ""
        if h:
            target = t or tgt
            m = re.match(r"item=([^&]+)", h)
            h = urllib.parse.unquote(h)
            if m and target == "/":
                if urllib.parse.unquote(m.group(1)) not in ITEMS:
                    # a share link (/c/) or item page made when the item had a price: the card still opens and says no sales yet
                    (notes if path.startswith(("/c/", "/item/")) else badhash)["item:" + urllib.parse.unquote(m.group(1))].append(path)
            elif target == "/quests.html" and re.match(r"q-\d+$", h):
                if h[2:] not in QIDS: badhash["quest:" + h].append(path)
            elif target == "/map.html" and h.startswith("route="):
                for nm in h[6:].split("|"):
                    if nm and nm not in MAPS: badhash["map:" + nm].append(path)
            elif target == "/map.html" and h.startswith("map="):
                if h[4:] not in MAPS: badhash["map:" + h[4:]].append(path)
            elif target == path and not re.search(r"[=&]", h) and h not in p.ids and h not in ("top", "", "positions", "new"):   # #positions and #new are read by the page's script
                badhash["anchor:" + path + "#" + h].append(path)
        if t and t in pages and t != path:
            graph[path].add(t); out += 1
            if zone == "content": cgraph[path].add(t)
        if t == "/": home = True
    info[path] = {"title": p.title.strip(), "h1": " ".join(p.h1.split()), "marks": dict(p.marks), "out": out, "cout": len(cgraph[path]),
                  "home": home, "robots": p.robots, "refresh": bool(p.refresh), "canon": p.canon}

inb, cinb = collections.Counter(), collections.Counter()
for a, bs in graph.items():
    for b in bs: inb[b] += 1
for a, bs in cgraph.items():
    for b in bs: cinb[b] += 1
def bfs(g, start="/"):
    d = {start: 0}; q = collections.deque([start])
    while q:
        x = q.popleft()
        for y in g.get(x, ()):
            if y not in d: d[y] = d[x] + 1; q.append(y)
    return d
dist = bfs(graph)
def kind(pth):
    s = pth.strip("/").split("/")[0]
    return s if s and "." not in s else (pth if pth != "/" else "board")
real = [p for p in pages if not info[p]["refresh"] and not p.startswith("/c/")]   # /c/ pages are share links that open the live card
by = collections.defaultdict(list)
for p in real: by[kind(p)].append(p)
rep = {"pages": len(pages), "redirect_pages": len(pages) - len(real), "links": nlinks, "broken": {k: [len(v), v[0]] for k, v in broken.items()},
       "bad_hash": {k: [len(v), v[0]] for k, v in badhash.items()}, "share_links_no_data": {k: [len(v), v[0]] for k, v in notes.items()}, "external_domains": dict(ext.most_common()),
       "by_kind": {}, "orphans": [p for p in real if not inb[p] and p != "/"], "unreached": [p for p in real if p not in dist],
       "far": sorted([[dist[p], p] for p in real if dist.get(p, 0) > 3], reverse=True)[:40]}
for k, ps in sorted(by.items(), key=lambda x: -len(x[1])):
    n = len(ps)
    rep["by_kind"][k] = {"n": n, "menu": sum(1 for p in ps if info[p]["marks"].get("sitenav")), "crumbs": sum(1 for p in ps if info[p]["marks"].get("crumbs")),
        "playbar": sum(1 for p in ps if info[p]["marks"].get("playbar")), "footer": sum(1 for p in ps if info[p]["marks"].get("footer")),
        "link_home": sum(1 for p in ps if info[p]["home"]), "no_content_links": sum(1 for p in ps if not info[p]["cout"]),
        "only_menu_links_in": sum(1 for p in ps if inb[p] and not cinb[p]), "clicks_from_board_max": max([dist.get(p, 99) for p in ps]),
        "clicks_avg": round(sum(dist.get(p, 99) for p in ps) / n, 2), "noindex": sum(1 for p in ps if "noindex" in info[p]["robots"]),
        "no_h1": sum(1 for p in ps if not info[p]["h1"]), "example": ps[0]}
print(json.dumps({k: v for k, v in rep.items() if k not in ("by_kind",)}, indent=1)[:6000])
print("\nby page type: n menu crumbs playbar footer link_home no_content_links only_menu_in max_clicks avg_clicks noindex no_h1")
for k, v in rep["by_kind"].items(): print(f"  {k:28} {v['n']:5} {v['menu']:5} {v['crumbs']:5} {v['playbar']:5} {v['footer']:5} {v['link_home']:5} {v['no_content_links']:5} {v['only_menu_links_in']:5} {v['clicks_from_board_max']:3} {v['clicks_avg']:5} {v['noindex']:5} {v['no_h1']:3}")
if OUT: json.dump({"rep": rep, "info": info, "dist": dist}, open(OUT, "w"))
sys.exit(1 if broken or badhash else 0)
