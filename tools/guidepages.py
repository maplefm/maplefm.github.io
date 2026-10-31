"""Guides and items-by-class pages, built with the item pages from the same public price summary.

  /guides/                     the guide hub
  /guides/price-an-item/       how to price an item
  /guides/read-the-board/      what every number on the board means
  /guides/scan-and-earn/       how scanning and Earn work (rates live on the Earn page, never here)
  /guides/make-mesos/          drops, scrolls and items that sell for far more than the NPC pays, from our own sales
  /guides/what-sells-by-level/ the most traded equips and weapons in each level range
  /items/class/                one page per class: every priced equip, by slot and job, sorted by level

Called from itempages.main(); returns the paths built, for the sitemap. Everything shown comes from the summary,
the item list and the item guide. Nothing is copied from other sites.
"""
import os, html, json

H = html.escape

# itemdb class mask bits; Classic has no pirates
CLASSES = [(1, "warrior", "Warrior"), (2, "magician", "Magician"), (4, "bowman", "Bowman"), (8, "thief", "Thief")]
# which jobs use each weapon, for the class pages
WEAPON_JOBS = {
    "One-Handed Sword": "Fighter, Page", "Two-Handed Sword": "Fighter, Page", "One-Handed Axe": "Fighter", "Two-Handed Axe": "Fighter",
    "One-Handed Blunt Weapon": "Page", "Two-Handed Blunt": "Page", "Spear": "Spearman", "Pole Arm": "Spearman",
    "Wand": "every Magician", "Staff": "every Magician", "Bow": "Hunter", "Crossbow": "Crossbowman", "Claw": "Assassin", "Dagger": "Bandit",
}
NATIVE = {1: {"One-Handed Sword", "Two-Handed Sword", "One-Handed Axe", "Two-Handed Axe", "One-Handed Blunt Weapon", "Two-Handed Blunt", "Spear", "Pole Arm"},
          2: {"Wand", "Staff"}, 4: {"Bow", "Crossbow"}, 8: {"Claw", "Dagger"}}
SLOT_ORDER = ["Hat", "Top", "Bottom", "Overall", "Glove", "Shoes", "Shield", "Cape", "Earrings", "Ring", "Face Accessory", "Eye Decoration"]
BANDS = [(1, 19, "Level 1 to 19"), (20, 34, "Level 20 to 34"), (35, 49, "Level 35 to 49"), (50, 69, "Level 50 to 69"), (70, 200, "Level 70 and up")]

CSS = ("<style>.gd h2{margin-top:26px}.gd ol,.gd ul{padding-left:22px;line-height:1.6}.gd li{margin:4px 0}.gd .ex{background:var(--panel2);border:1px solid var(--line2);"
       "border-radius:12px;padding:12px 14px;margin:14px 0}.gd .ex b{white-space:nowrap}.gd table{width:100%}.gd td small{color:var(--muted)}"
       ".ghub{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}@media (max-width:640px){.ghub{grid-template-columns:1fr}}"
       ".ghub a{display:block;padding:14px;border:1px solid var(--line2);border-radius:14px;background:var(--panel2);text-decoration:none;color:var(--ink)}"
       ".ghub a b{display:block;font-size:1.02rem}.ghub a span{color:var(--muted);font-size:.88rem}.gd .tw{overflow-x:auto}</style>")


def build(out, rows, ids, dbrow, kinds, guide, vendor, when, h):
    """h: helpers from itempages (page, slug, shown, meso, full, fit_title, SITE, BSLUG)."""
    page, slug, shown, meso, full, SITE, BSLUG = h["page"], h["slug"], h["shown"], h["meso"], h["full"], h["SITE"], h["BSLUG"]
    paths = []
    byname = {r["item"]: r for r in rows}

    def icon(n, sz=24):
        return (f'<img src="https://maplefm.gg/i/{ids[n]}.png" onerror="this.onerror=null;this.src=&#39;https://maplestory.io/api/MCW/1/item/{ids[n]}/icon&#39;" '
                f'alt="" width="{sz}" height="{sz}" loading="lazy">') if n in ids else ""

    def ilink(n):
        return f'<a href="/item/{slug(n)}/">{icon(n)} {H(shown(n))}</a>'

    def kind_of(n):
        r = dbrow.get(n)
        if not r or len(r) < 6 or r[4] or r[5] >= len(kinds): return ""   # row: name, id, level, class mask, cash, kind
        k = kinds[r[5]]
        return k.split(":", 1)[1] if k.startswith("Equip:") else ""

    def level(n):
        r = dbrow.get(n); return r[2] if r and len(r) > 2 else 0

    def mask(n):
        r = dbrow.get(n); return r[3] if r and len(r) > 3 else 0

    def clsname(m):
        names = [c[2] for c in CLASSES if m & c[0]]
        return "Any class" if not names or len(names) == 4 else ", ".join(names)

    def mob(n):
        return f'<a href="/monster/{BSLUG[n]}/">{H(n)}</a>' if n in BSLUG else H(n)

    def ld(name, url, trail):
        items = [{"@type": "ListItem", "position": 1, "name": "Club FM", "item": SITE + "/"}] + [
            {"@type": "ListItem", "position": k + 2, "name": t, "item": SITE + u} for k, (t, u) in enumerate(trail)]
        return '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": items}) + "</script>"

    def write(path, title, desc, body, trail, crumbs):
        d = os.path.join(out, path.strip("/")); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page(title, desc, SITE + path, CSS + body, ld(title, path, trail), crumbs=crumbs))
        paths.append(path)

    equips = [r for r in rows if kind_of(r["item"]) and r.get("cat") in ("Equips", "Weapons")]

    # ---------- items by class
    cls_links = []
    for bit, cs, cn in CLASSES:
        mine = [r for r in equips if mask(r["item"]) & bit]
        if len(mine) < 5: continue
        groups = {}
        for r in mine:
            k = kind_of(r["item"])
            if k in WEAPON_JOBS and k not in NATIVE[bit]: k = "Other weapons"   # a low multi-class weapon this class can also hold
            groups.setdefault(k, []).append(r)
        order = sorted(groups, key=lambda k: (0 if k in WEAPON_JOBS else 1 if k == "Other weapons" else 2, SLOT_ORDER.index(k) if k in SLOT_ORDER else 99, k))
        secs = ""
        for k in order:
            g = sorted(groups[k], key=lambda r: (level(r["item"]), shown(r["item"])))
            trs = "".join(f'<tr><td>{ilink(r["item"])}</td><td class="n">{level(r["item"]) or ""}</td><td class="n"><span class="mz">{meso(r["typ"])}</span></td><td class="n">{full(r.get("salesN") or 0)}</td></tr>' for r in g)
            jobs = f' <small>· {H(WEAPON_JOBS[k])}</small>' if k in WEAPON_JOBS else ""
            label = k if k in ("Overall", "Other weapons") or k.endswith("s") else k + "s"
            secs += f'<h2 id="{slug(k)}">{H(label)}{jobs}</h2><div class="tw"><table><tr><th>Item</th><th>Level</th><th>Typical</th><th>Sales seen</th></tr>{trs}</table></div>'
        jump = " · ".join(f'<a href="#{slug(k)}">{H(k)}</a>' for k in order)
        others = " · ".join(f'<a href="/items/class/{c[1]}/">{c[2]}</a>' for c in CLASSES if c[1] != cs)
        body = (f'<div class="card gd"><h1>MapleStory Classic {cn.lower()} equipment prices</h1><p class="sub">{len(mine)} {cn.lower()} equips priced · updated {when}</p>'
                f'<p>Every {cn.lower()} weapon and armor piece traded on the Free Market, by slot and level. Typical prices come from watched sales. '
                f'Gear any class can wear is on <a href="/items/equipment/">equipment prices</a>.</p><p class="note">Jump to: {jump}</p>{secs}'
                f'<p class="note" style="margin-top:16px">Other classes: {others} · <a href="/guides/what-sells-by-level/">What sells by level</a> · <a href="/">Live board</a></p></div>')
        title = f"{cn} equipment prices · MapleStory Classic · Club FM"
        desc = f"Every {cn.lower()} weapon and armor piece in MapleStory Classic with its typical Free Market price from real sales, by slot and level. Updated {when}."
        write(f"/items/class/{cs}/", title, desc, body, [("Item prices", "/items/"), ("By class", "/items/class/"), (cn, f"/items/class/{cs}/")],
              [("Prices", "/"), ("All items", "/items/"), ("By class", "/items/class/"), (cn, "")])
        cls_links.append((cs, cn, len(mine)))
    if cls_links:
        cards = "".join(f'<a href="/items/class/{cs}/"><b>{cn}</b><span>{n} equips priced</span></a>' for cs, cn, n in cls_links)
        body = (f'<div class="card gd"><h1>MapleStory Classic equipment by class</h1><p class="sub">Updated {when}</p>'
                f'<p>Pick a class to see every weapon and armor piece it can wear, with today\'s typical Free Market price.</p><div class="ghub">{cards}</div></div>')
        write("/items/class/", "Equipment prices by class · MapleStory Classic · Club FM",
              "MapleStory Classic warrior, magician, bowman and thief equipment with typical Free Market prices from real sales.", body,
              [("Item prices", "/items/"), ("By class", "/items/class/")], [("Prices", "/"), ("All items", "/items/"), ("By class", "")])

    # ---------- guides
    G = [("price-an-item", "How to price an item", "Find what an item really sells for before you list or buy."),
         ("read-the-board", "How to read the board", "What Typical, 24h, Cheapest now, Trend, Sales and Volume mean."),
         ("scan-and-earn", "How to scan and earn", "Run FM Watcher while you shop and get paid for the prices you catch."),
         ("make-mesos", "Ways to make mesos in Classic", "Drops, scrolls and items that sell to players for far more than the NPC pays."),
         ("what-sells-by-level", "What sells by level range", "The most traded equips and weapons in each level range, with prices.")]

    def gpage(sl, body, extra_desc=""):
        t = [x for x in G if x[0] == sl][0]
        others = " · ".join(f'<a href="/guides/{x[0]}/">{H(x[1])}</a>' for x in G if x[0] != sl)
        full_body = f'<div class="card gd"><h1>{H(t[1])}</h1><p class="sub">MapleStory Classic guide · updated {when}</p>{body}<p class="note" style="margin-top:18px">More guides: {others}</p></div>'
        write(f"/guides/{sl}/", f"{t[1]} · MapleStory Classic · Club FM", (t[2] + " " + extra_desc).strip(), full_body,
              [("Guides", "/guides/"), (t[1], f"/guides/{sl}/")], [("Prices", "/"), ("Guides", "/guides/"), (t[1], "")])

    top = sorted([r for r in rows if r.get("kind") == "sale" and (r.get("salesN") or 0) >= 20], key=lambda r: -(r.get("vol") or 0))
    ex = top[0] if top else None
    exs = ""
    if ex:
        rng = f'<span class="mz">{meso(ex["lo"])}</span> to <span class="mz">{meso(ex["hi"])}</span>' if ex.get("hi", 0) > ex.get("lo", 0) else meso(ex["typ"])
        exs = (f'<div class="ex"><b>Example, {when}:</b> {ilink(ex["item"])} has a typical of <b><span class="mz">{meso(ex["typ"])}</span></b>, '
               f'a range of {rng}, from {full(ex.get("salesN") or 0)} watched sales. Listing well above <span class="mz">{meso(ex.get("hi") or ex["typ"])}</span> usually sits unsold.</div>')
    gpage("price-an-item", f"""
<p>Prices on Club FM come from real Free Market sales that players watched happen, not from what sellers hope to get.</p>
<h2>Five steps</h2>
<ol>
<li><b>Search it.</b> Type the name on the <a href="/">price board</a>. Short names work, like GFA 60 or wg. The full list is on <a href="/shortcuts.html">shortcuts</a>.</li>
<li><b>Read Typical.</b> It's the middle of real sales from the last 24 hours, or the last 3 days when it's quiet. If the card says "from asks", no sales were caught yet and it's based on asking prices, so treat it as a rough guide.</li>
<li><b>Check the range and the trend.</b> The range is the low and high of recent sales. The 24h and 7 day moves tell you if the price is climbing or falling.</li>
<li><b>Look at what's for sale.</b> Cheapest now and Where to buy show the listings you'd be competing with, with the seller, channel and room.</li>
<li><b>Set your price.</b> Just under the cheapest listing sells fastest. Never go under the low end of recent sales, and never under what an NPC pays.</li>
</ol>
{exs}
<h2>Equips and scrolls</h2>
<ul>
<li><b>Equips sell by stats.</b> A clean pair of Work Gloves and a 3 attack pair are different items. Open Price by stat on the item card to see what each roll sells for.</li>
<li><b>Scrolls sell by success rate.</b> Cheapest per success on a scroll's card shows which rate gives you the most successes for your mesos.</li>
</ul>
<h2>Before a big trade</h2>
<ul>
<li><b>Check the date.</b> A typical with few sales can move fast. The card says how many sales back it up.</li>
<li><b>Hover the listing.</b> In game, check the stats yourself before paying a roll price.</li>
</ul>""")

    gpage("read-the-board", """
<p>The <a href="/">price board</a> lists every item players have caught for sale. Tap any row for its item card.</p>
<h2>The columns</h2>
<ul>
<li><b>Typical:</b> the middle of recent real sales. Asking prices are used only when no sales were caught yet.</li>
<li><b>24h:</b> today's typical against the 24 hours before.</li>
<li><b>Cheapest now:</b> the lowest listing seen in the last 24 hours that nobody has seen sold or gone since.</li>
<li><b>Trend:</b> the typical price over the last 7 days.</li>
<li><b>Sales:</b> how many sales were caught.</li>
<li><b>Volume:</b> how many mesos changed hands, so you can see what's actually busy.</li>
</ul>
<h2>The tabs</h2>
<ul>
<li><b>Board:</b> every item, searchable, with category and class filters.</li>
<li><b>Best deals:</b> listings well under their typical. Public deals show 10 minutes after they're caught; Mega Deals members see them live.</li>
<li><b>Sell my items:</b> a list of what you want to sell, with a suggested price for each.</li>
<li><b>My positions:</b> log what you buy and sell to track your profit.</li>
</ul>
<h2>The item card</h2>
<ul>
<li><b>Where to buy:</b> every listing still up, cheapest first, with seller, channel, room and when it was seen. Listings over 2 hours old are dimmed.</li>
<li><b>Recent sales:</b> what sold, for how much and when.</li>
<li><b>Price by stat:</b> on equips, what each roll sells for.</li>
<li><b>Check mark:</b> a second scanner or a stream saw the same sale.</li>
<li><b>Report a wrong price:</b> at the bottom of every card, if something looks off.</li>
</ul>
<p>More on where the numbers come from: <a href="/how-it-works.html">how Club FM works</a>.</p>""")

    gpage("scan-and-earn", """
<p>Every price on Club FM comes from players. FM Watcher reads the shops you open while you play, and you get paid for what it catches.</p>
<h2>How to start</h2>
<ol>
<li><b>Download FM Watcher</b> from the <a href="/contribute.html">Earn page</a>. It's free, for Windows, and updates itself.</li>
<li><b>Run install.bat once</b>, then start.bat with MapleStory open.</li>
<li><b>Open the Change Channel window once</b> each login, so your scans get a channel.</li>
<li><b>Keep the minimap in view</b>, so your scans get an FM room.</li>
<li><b>Open shops and scroll to the bottom.</b> Every sold slot is a sale caught.</li>
<li><b>Hover equips</b> for about a second to read their stats. This pays the most.</li>
</ol>
<h2>How pay works</h2>
<ul>
<li><b>Same chance for everyone.</b> Anyone who contributes earns by the same rules.</li>
<li><b>Credits</b> come from verified sales, equip stats and coverage. Sales another scanner or a stream also saw count in full.</li>
<li><b>Clear the bar once</b>, sign in with Discord, link your watcher and add PayPal. Your balance pays out.</li>
<li><b>Promos change over time.</b> Current rates, bonuses and the pay bar are always on the <a href="/contribute.html">Earn page</a>.</li>
</ul>
<h2>Safe to run</h2>
<ul>
<li><b>Reads the screen only</b>, like streaming software. It never clicks, types, or touches game files or memory.</li>
<li><b>Streamers</b> can earn too: stream Classic on Twitch and connect your channel on the Earn page.</li>
</ul>""")

    # make mesos: drops and scrolls that sell, from the item guide and the summary
    def drops(n):
        out = []
        for d in (guide.get(n) or {}).get("d") or []:
            if d[0] not in [x[0] for x in out] and not (len(d) > 5 and d[5]): out.append(d)
        return out
    def droptab(lst, k):
        trs = ""
        for r in lst[:k]:
            ds = drops(r["item"])
            who = ", ".join(f'{mob(d[0])}' + (f' <small>Lv {d[1]}</small>' if d[1] else "") for d in ds[:2]) + (f' <small>+{len(ds) - 2} more</small>' if len(ds) > 2 else "")
            trs += f'<tr><td>{ilink(r["item"])}</td><td class="n"><span class="mz">{meso(r["typ"])}</span></td><td class="n">{full(r.get("salesN") or 0)}</td><td>{who}</td></tr>'
        return f'<div class="tw"><table><tr><th>Item</th><th>Typical</th><th>Sales seen</th><th>Known droppers</th></tr>{trs}</table></div>'
    etc = sorted([r for r in rows if r.get("cat") == "Etc" and r.get("kind") == "sale" and drops(r["item"]) and (r.get("salesN") or 0) >= 10], key=lambda r: -(r.get("vol") or 0))
    scr = sorted([r for r in rows if r.get("cat") == "Scrolls" and r.get("kind") == "sale" and drops(r["item"]) and (r.get("salesN") or 0) >= 10], key=lambda r: -(r.get("vol") or 0))
    npc = []
    for r in rows:
        vp = vendor.get(r["item"]) or 0
        if vp > 1 and r.get("kind") == "sale" and (r.get("salesN") or 0) >= 20 and r["typ"] >= vp * 5 and r.get("cat") in ("Etc", "Use", "Equips", "Weapons"):
            npc.append((r, vp))
    npc.sort(key=lambda x: -((x[0]["typ"] - x[1]) * min(x[0].get("salesN") or 0, 200)))
    ntr = "".join(f'<tr><td>{ilink(r["item"])}</td><td class="n"><span class="mz">{meso(vp)}</span></td><td class="n"><span class="mz">{meso(r["typ"])}</span></td><td class="n">{full(r.get("salesN") or 0)}</td></tr>' for r, vp in npc[:12])
    gpage("make-mesos", f"""
<p>What actually sells, from Free Market sales players watched. These tables rebuild every day.</p>
<h2>Drops that sell</h2>
<p>Etc drops with the most mesos changing hands. Farm the monster, sell to players.</p>
{droptab(etc, 12) if etc else '<p class="note">Not enough sales caught yet.</p>'}
<h2>Scrolls that drop</h2>
<p>Scrolls are the biggest market in Classic. These drop from monsters and sell steadily.</p>
{droptab(scr, 12) if scr else '<p class="note">Not enough sales caught yet.</p>'}
<h2>Sell to players, not the NPC</h2>
<p>Items players pay at least 5 times what an NPC store gives you for them.</p>
{f'<div class="tw"><table><tr><th>Item</th><th>NPC pays</th><th>Players pay</th><th>Sales seen</th></tr>{ntr}</table></div>' if ntr else '<p class="note">Not enough sales caught yet.</p>'}
<h2>Buying low</h2>
<ul>
<li><b>Best deals</b> on the <a href="/">board</a> lists listings well under their typical. Check the stats in game before you buy an equip.</li>
<li><b>Watch the trend.</b> A price that's falling can keep falling. The 7 day trend is on every row.</li>
<li><b>Scan while you shop.</b> FM Watcher pays you for the prices you catch. See <a href="/guides/scan-and-earn/">how to scan and earn</a>.</li>
</ul>
<p class="note">Droppers are the monsters players have reported dropping it; others may drop it too.</p>
<p>Leveling first? The <a href="/training/">training guides</a> show where to train at every level.</p>""",
          "Live tables of what sells, from real sales.")

    # what sells by level
    secs = ""
    for lo, hi, lab in BANDS:
        b = sorted([r for r in equips if lo <= level(r["item"]) <= hi and r.get("kind") == "sale" and (r.get("salesN") or 0) >= 5], key=lambda r: -(r.get("vol") or 0))[:12]
        if not b: continue
        trs = "".join(f'<tr><td>{ilink(r["item"])}</td><td class="n">{level(r["item"])}</td><td><small>{H(clsname(mask(r["item"])))}</small></td><td class="n"><span class="mz">{meso(r["typ"])}</span></td><td class="n">{full(r.get("salesN") or 0)}</td></tr>' for r in b)
        secs += f'<h2>{lab}</h2><div class="tw"><table><tr><th>Item</th><th>Level</th><th>Class</th><th>Typical</th><th>Sales seen</th></tr>{trs}</table></div>'
    gpage("what-sells-by-level", f"""
<p>The equips and weapons with the most mesos changing hands in each level range, from watched Free Market sales. Prices are for the typical copy; good rolls sell for more. Open an item for its price by stat.</p>
{secs or '<p class="note">Not enough sales caught yet.</p>'}
<p>By class instead: {" · ".join(f'<a href="/items/class/{c[0]}/">{c[1]}</a>' for c in cls_links)}.</p>""")

    cards = "".join(f'<a href="/guides/{x[0]}/"><b>{H(x[1])}</b><span>{H(x[2])}</span></a>' for x in G)
    if cls_links: cards += '<a href="/items/class/"><b>Equipment by class</b><span>Every warrior, magician, bowman and thief equip with its price.</span></a>'
    write("/guides/", "MapleStory Classic Free Market guides · Club FM", "Guides to pricing, buying, selling and making mesos in MapleStory Classic, built from real Free Market sales.",
          f'<div class="card gd"><h1>MapleStory Classic Free Market guides</h1><p class="sub">Built from real sales · updated {when}</p><div class="ghub">{cards}</div>'
          '<p class="note">Training: <a href="/training/">where to train at every level</a> · Quests: <a href="/quests.html">Quest Log</a></p></div>',
          [("Guides", "/guides/")], [("Prices", "/"), ("Guides", "")])
    return paths
