#!/usr/bin/env python3
"""Check sheet for the build guides: every number on the three pages with where it comes from and its status, plus the
model numbers that stay off the pages (damage a second, hit chance, EXP an hour). Writes builds/check-sheet.csv and
builds/check-sheet.md.   python3 builds/tools/checksheet.py"""
import csv, json, os

HERE = os.path.dirname(os.path.abspath(__file__)); B = os.path.dirname(HERE)
C = json.load(open(os.path.join(B, "check", "computed.json")))
R = json.load(open(os.path.join(B, "check", "review-numbers.json")))
G = json.load(open(os.path.join(HERE, "gear-snapshot.json")))
FILES = {"sindit": "sindit.json", "spearman_spear": "spearman-spear.json", "spearman_polearm": "spearman-polearm.json"}
GF = "game files MCW 1.2"
rows = []
def add(build, section, item, value, source, status, note=""): rows.append([build, section, item, value, source, status, note])

for key, fn in FILES.items():
    d = json.load(open(os.path.join(B, fn)))
    for g in d["gear"]:
        add(key, "gear", g["item"] + " id", g["id"], GF, "confirmed")
        add(key, "gear", g["item"] + " level, attack, speed", f'{G[g["item"]]["lv"]}, {g["attack"]}, {g["speed"]}', GF, "confirmed")
        add(key, "gear", g["item"] + " needs", g["needs"], GF + " reqSTR/DEX/LUK", "confirmed")
        p = g["price"]; add(key, "gear", g["item"] + " typical price", p["shown"], "live summary-public.json, basis " + str(p.get("basis")), "live data" if p["typical"] else "no price", f'{p.get("sales_seen") or 0} seen')
    for s in d["skill_order"]:
        add(key, "skills", f'{s["skill"]} {s["to"]} by level {s["level"]}', s["level"], "SP 1 at 10, 3 a level; 1 at 30, 3 a level (players: 61 and 121 SP), skill max from " + GF, "supported", s["book"])
    for r in d["stat_plan"]["table"]:
        add(key, "stats", f'level {r["level"]}', json.dumps({k: v for k, v in r.items() if k != "level"}), "25 total at level 1 plus 5 AP a level; DEX = weapon need (" + GF + ")", "DEX confirmed; totals unconfirmed",
            "starting total 25 is the engine's assumption; a different roll shifts the main stat a few points")
    for w in d["why"]: add(key, "why", w.split(":**")[0].strip("*"), w.split(":**")[-1].strip(), "see check-sheet.md", "model (fits real hits within 2.5%)" if "%" in w or "x higher" in w else "game files")

# model numbers kept off the pages
for key in FILES:
    for L, a in R["accuracy"][key].items(): add(key, "model only", f"accuracy at {L}", a, "engine F15", "unconfirmed")
    for L in ["30", "35", "40", "50", "60", "100"]:
        x = C["builds"][key]["levels"][L]
        add(key, "model only", f"damage a second at {L} ({x['attack']}, {x['weapon']})", x["dps"], "engine F1 to F8, speed rows", "supported" if key == "sindit" else "unconfirmed (F10, F23)")
        for m in x.get("mobs", []): add(key, "model only", f"hit on {m['mob']} at {L}", f"{m['hit']}%", "engine F15, F16", "unconfirmed", f"kill {m['kill_s']} s")
    for m in R["maps"][key]: add(key, "model only", f"EXP an hour, {m['map']} ({m['levels']})", m["exp_hour"], "engine map model", "unconfirmed")

with open(os.path.join(B, "check-sheet.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(["build", "section", "item", "value", "source", "status", "note"]); w.writerows(rows)

# ---------------------------------------------------------------- the readable sheet
L = []
P = L.append
P("# Build guides check sheet, Nov 25, 2026\n")
P("Every number on the three pages, its source and status, is in **check-sheet.csv** (" + str(len(rows)) + " rows). Below: counts, then the model numbers that stay off the pages.\n")
from collections import Counter
cnt = Counter((r[0], r[5]) for r in rows)
P("## Rows by status\n\n| Build | Status | Rows |\n|---|---|---|")
for (b, s), n in sorted(cnt.items()): P(f"| {b} | {s} | {n} |")
P("\n## Damage a second: guide build vs the training page's Typical gear\n")
P("Plain target (no defense, no misses). Typical can_wear false means the Typical build gets a weapon its stats can't equip (audit E1).\n")
P("| Build | Level | Guide weapon | Guide attack | Guide dmg/s | Typical weapon | Typical dmg/s | Typical can wear |\n|---|---|---|---|---|---|---|---|")
for key in FILES:
    for r in R[key + "_typical_vs_guide"]:
        g, t = r["guide"], r["typical"]
        P(f"| {key} | {r['level']} | {g['weapon']} | {g['attack']} | {g['dmg_per_s']} | {t['weapon']} | {t['dmg_per_s']} | {'yes' if t['can_wear'] else '**no**'} |")
P("\n## Sindit switch table (model)\n\nLucky Seven keeps Mithril Guards and Wolbi stars. Reset dagger: Double Stab 20 plus the 2nd job book. No reset: 2nd job book only.\n")
P("| Level | Lucky Seven dmg/s | EXP/h | Reset dagger | dmg/s | EXP/h | No reset | dmg/s | EXP/h |\n|---|---|---|---|---|---|---|---|---|")
for r in R["sindit_switch_table"]:
    c, a, n = r["claw"], r["reset_dagger"], r["no_reset_dagger"]
    P(f"| {r['level']} | {c['dmg_per_s']} | {round((c['exp_hour'] or 0) / 1000)}K | {a['attack']}, {a['weapon']} | {a['dmg_per_s']} | {round((a['exp_hour'] or 0) / 1000)}K | {n['attack']} | {n['dmg_per_s']} | {round((n['exp_hour'] or 0) / 1000)}K |")
P("\n## Compare tables (model numbers)\n")
for key in FILES:
    P(f"### {key}\n\n| Build | dmg/s 40 | dmg/s 60 | dmg/s 100 | Note |\n|---|---|---|---|---|")
    for r in R[key + "_compare"]:
        d = r.get("dmg_per_s") or {}
        P(f"| {r['build']} | {d.get(40, d.get('40', '—'))} | {d.get(60, d.get('60', '—'))} | {d.get(100, d.get('100', '—'))} | {r.get('note', '')} |")
    P("")
P("## Hit chance on training monsters (model, unconfirmed F15 and F16)\n")
for key in FILES:
    P(f"### {key}\n\n| Level | Accuracy | Monsters: hit %, seconds a kill |\n|---|---|---|")
    for Lv in ["30", "35", "40", "50", "60", "70"]:
        x = C["builds"][key]["levels"][Lv]
        P(f"| {Lv} | {x['acc']} | " + ", ".join(f"{m['mob']} {m['hit']}% {m['kill_s']}s" for m in x.get("mobs", [])) + " |")
    P("")
P("### Precise Strikes 15 vs 5 at level 30 (warrior 1st job)\n\n| Weapon | Accuracy 15 / 5 | Ligator | Fire Boar | Curse Eye | Jr. Wraith |\n|---|---|---|---|---|---|")
for cls in ["Spear", "Polearm"]:
    p = C["precise"][cls + "30"]; f = lambda rows, n: next((m["hit"] for m in rows if m["mob"] == n), "—")
    P(f"| {cls} | {p['acc15']} / {p['acc5']} | " + " | ".join(f"{f(p['p15'], n)}% / {f(p['p5'], n)}%" for n in ["Ligator", "Fire Boar", "Curse Eye", "Jr. Wraith"]) + " |")
P("\n## Training maps with model EXP an hour\n")
for key in FILES:
    P(f"### {key}\n\n| Levels | Map | EXP/h | Engine note |\n|---|---|---|---|")
    for m in R["maps"][key]: P(f"| {m['levels']} | {m['map']} | {round(m['exp_hour'] / 1000)}K | {m['engine_note']} |")
    P("")
P("## Same runs with the Nov 24 defense patch (Lorang, Clang WDEF 10)\n\n1. Spear 49: top 3 becomes Hot Sand, Clang and Lorang, Remains (Tomb) I.\n2. Spear 60: Hot Sand moves to first.\n3. Every other top 3 in the three guides is unchanged.\n")
P("## Numbers left out of the guides\n\n1. Accuracy, hit chance, EXP an hour: one source for the formulas (audit F15, F16, F17).\n2. Spear vs polearm damage a second: rests on the 60/40 swing split (F10) and swing times at speed 7 and 8 (F23).\n3. HP and MP per level (wiki pre-launch table: warrior +28 HP, thief +22 HP): one source.\n4. Damage taken: the datamine and the wiki give different formulas.\n5. Base crit 5% / +20%: no allowed source (F12). It is in every damage number above, equally for both sides of each comparison.\n6. Final Attack damage over time: how often it can be pressed is unknown (E5).\n")
open(os.path.join(B, "check-sheet.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
print(len(rows), "rows")
