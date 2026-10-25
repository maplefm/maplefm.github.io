"""The site navigation, the same on every page. Used by the page builders, and by `python tools/nav.py` to stamp the
hand-written pages: it replaces whatever sits between <!--nav--> and <!--/nav--> with the current links."""
import os, re, sys

LINKS = [("prices", "/", "Prices", "Prices"), ("items", "/items/", "All items", "Items"), ("market", "/market.html", "Player market", "Market"),
         ("quests", "/quests.html", "Quests", "Quests"),
         ("maps", "/map.html", "Maps and training", "Maps"), ("earn", "/contribute.html", "Earn by scanning", "Earn")]


def nav_html(active="", home=False):
    out = []
    for k, href, long, short in LINKS:
        cur = ' aria-current="page"' if k == active else ""
        cls = ' class="sn-earn"' if k == "earn" else ""
        out.append(f'<a href="{href}"{cls}{cur}><span class="sn-l">{long}</span><span class="sn-s">{short}</span></a>')
    return ('<!--nav--><nav class="sitenav' + (' sn-home' if home else '') + '" aria-label="Club FM">'
            '<a class="sn-brand" href="/"><img src="/assets/superstar@4x.png" alt="">Club <b>FM</b></a>'
            '<div class="sn-links">' + "".join(out) + '</div></nav><!--/nav-->')


NAV_CSS = '<link rel="stylesheet" href="/assets/nav.css?v=1">'
PAGES = {"index.html": ("prices", True), "market.html": ("market", False), "map.html": ("maps", False), "quests.html": ("quests", False), "contribute.html": ("earn", False),
         "report.html": ("", False), "streamers.html": ("", False), "how-it-works.html": ("", False), "shortcuts.html": ("", False),
         "terms.html": ("", False), "404.html": ("", False), "bot/index.html": ("", False)}

if __name__ == "__main__":
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    for f, (act, home) in PAGES.items():
        p = os.path.join(root, f); s = open(p, encoding="utf-8").read()
        if "<!--nav-->" not in s: print("no nav slot in", f); continue
        s = re.sub(r"<!--nav-->.*?<!--/nav-->", lambda m: nav_html(act, home), s, flags=re.S)
        if "/assets/nav.css" not in s: s = s.replace("</head>", NAV_CSS + "</head>", 1)
        s = re.sub(r"/assets/nav\.css\?v=\d+", "/assets/nav.css?v=1", s)
        open(p, "w", encoding="utf-8").write(s); print("nav", f)
