"""The weekly Free Market recap: biggest risers and fallers over 7 days and the most traded items, as a page people can
share (recap/index.html) plus a dated copy every Sunday, and RECAP.json for the share image.

  python tools/recap.py SUMMARY.json OUT_DIR RECAP.json
"""
import json, os, sys, datetime, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import itempages

E = html.escape


def main():
    summ = json.load(open(sys.argv[1], encoding="utf-8")); out = sys.argv[2]
    now = (summ.get("at") or 0) / 1000 or datetime.datetime.now().timestamp()
    rows, up, down = [], [], []
    for r in summ.get("rows") or []:
        if not isinstance(r, dict) or not r.get("typ") or (r.get("salesN") or 0) < 8 or r.get("kind") != "sale": continue
        dl = [d for d in (r.get("daily") or []) if d and d[1]]
        old = [d for d in dl if now - d[0] / 1000 >= 5.5 * 86400]
        if not old: continue
        base = old[-1] if now - old[-1][0] / 1000 <= 8.5 * 86400 else None
        if not base: continue
        chg = r["typ"] / base[1] - 1
        x = {"item": r["item"], "now": r["typ"], "then": base[1], "chg": chg, "vol": r.get("vol") or 0, "cat": r.get("cat") or ""}
        rows.append(x)
    up = sorted([x for x in rows if x["chg"] >= 0.08], key=lambda x: -x["chg"])[:10]
    down = sorted([x for x in rows if x["chg"] <= -0.08], key=lambda x: x["chg"])[:10]
    hot = sorted([r for r in summ.get("rows") or [] if isinstance(r, dict) and r.get("typ") and r.get("vol")], key=lambda r: -r["vol"])[:10]
    end = datetime.datetime.fromtimestamp(now, datetime.timezone.utc); start = end - datetime.timedelta(days=7)
    rng = f"{start.strftime('%b %-d')} to {end.strftime('%b %-d, %Y')}"
    link = lambda n: f'<a href="/item/{itempages.slug(n)}/">{E(itempages.shown(n))}</a>'
    def table(xs):
        return "<table><tr><th>Item</th><th>Week ago</th><th>Now</th><th>Change</th></tr>" + "".join(
            f'<tr><td>{link(x["item"])}</td><td>{itempages.meso(x["then"])}</td><td><b>{itempages.meso(x["now"])}</b></td><td><span class="chg {"up" if x["chg"] > 0 else "down"}">{"▲" if x["chg"] > 0 else "▼"} {abs(round(x["chg"] * 100))}%</span></td></tr>' for x in xs) + "</table>"
    b = f'<div class="card"><h1>This week on the MapleStory Classic Free Market</h1><p class="sub">{rng} · from sales players watched in Free Market shops</p>'
    if up: b += f"<h2>Biggest risers</h2>{table(up)}"
    if down: b += f"<h2>Biggest drops</h2>{table(down)}"
    if hot: b += "<h2>Most traded</h2><table><tr><th>Item</th><th>Typical</th><th>Sales seen</th></tr>" + "".join(f'<tr><td>{link(r["item"])}</td><td><b>{itempages.meso(r["typ"])}</b></td><td>{r.get("salesN") or 0:,}</td></tr>' for r in hot) + "</table>"
    # the player market's week: listings, trades, and the best member deals still up
    mk = None
    try:
        import urllib.request
        mk = json.load(urllib.request.urlopen(urllib.request.Request("https://api.maplefm.gg/market/stats?days=7", headers={"User-Agent": "clubfm-recap"}), timeout=20))
    except Exception as e:
        print("market stats unavailable:", e)
    if mk and (mk.get("listed") or mk.get("open")):
        b += (f'<h2>Player market</h2><p>{mk.get("listed", 0):,} listed by {mk.get("sellers", 0):,} members · {mk.get("sold", 0):,} sold'
              f'{" · " + format(mk.get("confirmed", 0), ",") + " buyer confirmed" if mk.get("confirmed") else ""} · {mk.get("open", 0):,} up now. '
              '<a href="/market.html">See the market</a></p>')
        if mk.get("best"):
            b += "<table><tr><th>Member deal</th><th>Price</th><th>Typical</th><th>Under</th></tr>" + "".join(
                f'<tr><td><a href="{E(d["url"])}">{E(d["item"])}</a></td><td><b>{itempages.meso(d["price"])}</b></td><td>{itempages.meso(d["typ"])}</td><td>{round(d["off"] * 100)}%</td></tr>' for d in mk["best"]) + "</table>"
    b += '<p style="margin-top:16px"><a href="/">Live prices</a> · <a href="/items/">Every item</a></p>'
    b += f'<p class="note">Typical sale now against about a week ago. Items with 8 or more sales only. Updated {end.strftime("%B %-d, %Y")}.</p></div>'
    desc = f"MapleStory Classic Free Market, {rng}: " + (", ".join(f"{itempages.shown(x['item'])} {'up' if x['chg'] > 0 else 'down'} {abs(round(x['chg'] * 100))}%" for x in (up[:2] + down[:2])) or "the week's prices") + "."
    pg = itempages.page("This week on the MapleStory Classic Free Market · Club FM", desc, itempages.SITE + "/recap/", b, None, itempages.OG + "recap.png", active="prices")
    os.makedirs(os.path.join(out, "recap"), exist_ok=True)
    open(os.path.join(out, "recap", "index.html"), "w", encoding="utf-8").write(pg)
    et = end - datetime.timedelta(hours=4)
    if et.weekday() == 6:   # Sunday: keep a dated copy
        dd = os.path.join(out, "recap", et.strftime("%Y-%m-%d")); os.makedirs(dd, exist_ok=True)
        open(os.path.join(dd, "index.html"), "w", encoding="utf-8").write(pg.replace(itempages.SITE + "/recap/\"", itempages.SITE + "/recap/" + et.strftime("%Y-%m-%d") + "/\""))
    json.dump({"range": rng, "up": up, "down": down, "market": mk}, open(sys.argv[3], "w"))
    print("recap", len(up), "up", len(down), "down")


if __name__ == "__main__":
    main()
