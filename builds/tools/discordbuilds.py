#!/usr/bin/env python3
"""Writes builds/discord.json for the Discord /build command: for every live guide, each level's stats, the AP that level,
the skills you have, the SP that level and the weapon. Read straight from the guide pages' own data, so the bot and the
site can never disagree.   python3 builds/tools/discordbuilds.py"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import checkguides as C  # noqa: E402

# the short names the site uses (gwpage.GUIDES), read from its source so the world data isn't loaded for this
GUIDES = eval(re.search(r"^GUIDES = (\{.*?\})", open(os.path.join(HERE, "gwpage.py"), encoding="utf-8").read(), re.M | re.S).group(1))
SHORT = {v: k for k, v in GUIDES.items()}
out = {}
for slug in sorted(d for d in os.listdir(B) if os.path.exists(os.path.join(B, d, "index.html")) and os.path.exists(os.path.join(B, d + ".json"))):
    D = C.page_data(slug)
    name = re.search(r"<h1[^>]*>(.*?)</h1>", open(os.path.join(B, slug, "index.html"), encoding="utf-8").read(), re.S).group(1)
    name = SHORT.get(slug) or re.sub(r"<[^>]+>", "", name).strip()
    st = {r["l"]: r for r in D["stats"]}
    spl = {r["l"]: r for r in D["spLevels"]}
    gear = sorted(D["gear"], key=lambda g: g["level"])
    lv = {}
    for L in range(1, D["cap"] + 1):
        s = st[L]; sp = D["sp"][str(L)]; row = spl.get(L) or {}
        w = next((g for g in reversed(gear) if g["level"] <= L), None)
        nxt = next((g for g in gear if g["level"] > L), None)
        lv[L] = {"s": s["t"], "ap": s["ap"], "have": sorted(sp["have"].items(), key=lambda kv: -kv[1]), "spare": sp["spare"],
                 "put": row.get("put") or [], "gone": row.get("gone") or [], "note": row.get("note") or "",
                 "w": [w["item"], w["level"]] if w else None, "next": [nxt["item"], nxt["level"]] if nxt else None}
    out[slug] = {"name": name, "cap": D["cap"], "url": f"https://maplefm.gg/builds/{slug}/", "levels": lv}
json.dump({"note": "made by builds/tools/discordbuilds.py from the guide pages; read by the Worker's /build command", "builds": out},
          open(os.path.join(B, "discord.json"), "w", encoding="utf-8"), separators=(",", ":"))
print("builds/discord.json:", ", ".join(f"{k} ({v['name']})" for k, v in out.items()), os.path.getsize(os.path.join(B, "discord.json")) // 1024, "KB")
