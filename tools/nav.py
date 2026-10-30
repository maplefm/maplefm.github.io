"""The site navigation, the same on every page. Used by the page builders, and by `python tools/nav.py` to stamp the
hand-written pages: it replaces whatever sits between <!--nav--> and <!--/nav--> with the current links."""
import os, re, sys

LINKS = [("prices", "/", "Prices", "Prices"), ("market", "/market.html", "Player market", "Market"), ("quests", "/quests.html", "Quests", "Quests"),
         ("training", "/map.html", "Training and maps", "Training"), ("earn", "/contribute.html", "Earn by scanning", "Earn")]
# each section's own row, on every page in it: quests with quests by level and crafting; training with maps and monsters
SUB = {"quests": [("quests", "/quests.html", "Quest log"), ("qlevels", "/quests/", "All quests"), ("crafting", "/crafting/", "Crafting")],
       "training": [("training", "/map.html", "Where to train"), ("guides", "/training/", "Training guides"), ("maps", "/maps/", "Maps"), ("monsters", "/monsters/", "Monsters")]}
# pages that belong under one of the top links: the item catalog and item pages live under Prices
ALIAS = {"items": "prices", "shop": "market", "qlevels": "quests", "crafting": "quests", "guides": "training", "maps": "training", "monsters": "training"}

SEARCH = ('<form class="sn-search" action="/" method="get" role="search"><label><span class="sn-sr">Search item prices</span>'
          '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2.4"/>'
          '<path d="M13 13l4 4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'
          '<input type="search" name="q" placeholder="Search any item price" autocomplete="off" enterkeyhint="search" maxlength="80"></label></form>')


# phones: the pinned menu slides away while you scroll down a page and comes back as soon as you scroll up
PIN_JS = ('<script>(function(){var n=document.querySelector(".sitenav.sn-pin");if(!n)return;var y=scrollY,t=0,h=0,u=function(){t=Date.now()};'
          '["wheel","touchmove","keydown"].forEach(function(e){addEventListener(e,u,{passive:true})});'
          'addEventListener("scroll",function(){var d=scrollY-y,H=document.documentElement.scrollHeight;if(H!==h){h=H;y=scrollY;return}'
          'if(scrollY<=120||d<-6){n.classList.remove("sn-hide");y=scrollY;return}'
          # only the reader's own scrolling tucks it away, never the page growing under them
          'if(d>30){if(innerWidth<=700&&Date.now()-t<500&&!n.contains(document.activeElement))n.classList.add("sn-hide");y=scrollY}},{passive:true});})();</script>')


def play_html(top, sub):
    return (f'<nav class="playbar" aria-label="{"Quests" if top == "quests" else "Training and maps"}">' + "".join(
        f'<a href="{href}"' + (' aria-current="page"' if k == sub else '') + f'>{name}</a>' for k, href, name in SUB[top]) + '</nav>')


def nav_html(active="", home=False):
    sub = active
    active = ALIAS.get(active, active)
    out = []
    for k, href, long, short in LINKS:
        cur = ' aria-current="page"' if k == active else ""
        cls = ' class="sn-earn"' if k == "earn" else ""
        out.append(f'<a href="{href}"{cls}{cur}><span class="sn-l">{long}</span><span class="sn-s">{short}</span></a>')
    # every page but the board itself keeps the menu and a price search pinned at the top
    return ('<!--nav--><nav class="sitenav' + (' sn-home' if home else ' sn-pin') + '" aria-label="Club FM">'
            '<a class="sn-brand" href="/"><img src="/assets/superstar@4x.png" alt="">Club <b>FM</b></a>'
            + ('' if home else SEARCH) +
            '<div class="sn-links">' + "".join(out) + '</div></nav>' + ('' if home else PIN_JS) + (play_html(active, sub) if active in SUB else '') + '<script src="/assets/hscroll.js?v=2" defer></script><!--/nav-->')


FOOT_COLS = [
    ("Prices", [("Price board", "/"), ("All items", "/items/"), ("Items by class", "/items/class/"), ("Guides", "/guides/"), ("Weekly recap", "/recap/"), ("How prices work", "/how-it-works.html")]),
    ("Trade", [("Player market", "/market.html"), ("Shops", "/shop.html"), ("List an item", "/market.html#new"), ("My positions", "/#positions")]),
    ("Quests and training", [("Quests", "/quests.html"), ("Training", "/map.html"), ("Training guides", "/training/"), ("All maps", "/maps/"), ("Monsters", "/monsters/"), ("Crafting recipes", "/crafting/")]),
    ("Club FM", [("Earn by scanning", "/contribute.html"), ("For streamers", "/streamers.html"), ("Add /price to Discord", "/bot/"), ("Discord", "https://discord.gg/cXnVBTUUPk"), ("Terms", "/terms.html")]),
]


def foot_html():
    cols = "".join(f'<div><b>{h}</b>' + "".join(f'<a href="{u}">{n}</a>' for n, u in links) + '</div>' for h, links in FOOT_COLS)
    return ('<!--foot--><footer class="clubfoot"><div class="sf-cols">' + cols + '</div>'
            '<p>Club FM is a free fan project built by players. Not affiliated with or endorsed by NEXON; MapleStory is a trademark of NEXON. '
            'Item icons from <a href="https://maplestory.io" rel="noopener">maplestory.io</a>, character pictures from <a href="https://classicrank.com" rel="noopener">classicrank.com</a>. '
            'Price data © Club FM. No scraping, bulk copying or AI training without permission. <a href="/terms.html">Terms of Use</a></p></footer><!--/foot-->')


NAV_CSS = '<link rel="stylesheet" href="/assets/nav.css?v=4">'
PAGES = {"index.html": ("prices", True), "market.html": ("market", False), "shop.html": ("market", False), "map.html": ("training", False), "quests.html": ("quests", False), "contribute.html": ("earn", False),
         "report.html": ("", False), "streamers.html": ("", False), "how-it-works.html": ("", False), "shortcuts.html": ("", False),
         "terms.html": ("", False), "404.html": ("", False), "bot/index.html": ("", False)}

if __name__ == "__main__":
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    for f, (act, home) in PAGES.items():
        p = os.path.join(root, f); s = open(p, encoding="utf-8").read()
        if "<!--nav-->" not in s: print("no nav slot in", f); continue
        s = re.sub(r"<!--nav-->.*?<!--/nav-->", lambda m: nav_html(act, home), s, flags=re.S)
        # the old one-line footers give way to the shared one
        s = re.sub(r'<footer class="sitefoot">.*?</footer>\s*', "", s, flags=re.S)
        if "<!--foot-->" in s: s = re.sub(r"<!--foot-->.*?<!--/foot-->", lambda m: foot_html(), s, flags=re.S)
        else: s = s.replace("</body>", foot_html() + "</body>", 1)
        if "/assets/nav.css" not in s: s = s.replace("</head>", NAV_CSS + "</head>", 1)
        s = re.sub(r"/assets/nav\.css\?v=\d+", "/assets/nav.css?v=4", s)
        open(p, "w", encoding="utf-8").write(s); print("nav", f)
