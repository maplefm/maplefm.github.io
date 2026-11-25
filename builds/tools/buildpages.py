#!/usr/bin/env python3
"""Turns the build guide files (builds/<name>.json) into site pages at /builds/<name>/, in the same card layout as
map and quest pages (assets/pages.css), with phone tabs (assets/pagetabs.js) and live FM prices (assets/fmprice.js).
    python3 builds/tools/buildpages.py [out_dir]     (default: the repo root, so pages land in builds/<name>/index.html)
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import worldpages as W  # noqa: E402

def E(s): return W.E(str(s if s is not None else ""))
BUILDS = ["sindit", "spearman-spear", "spearman-polearm"]


def md(s): return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", E(str(s or "")))


def item(name, iid=None):
    s = W.slug(name)
    icon = f'<img src="/i/{iid}.png" alt="" width="24" height="24" loading="lazy" onerror="this.remove()"> ' if iid else ""
    if os.path.exists(os.path.join(ROOT, "item", s, "index.html")):
        return f'<a href="/item/{s}/">{icon}{E(name)}</a>'
    return icon + E(name)


def mapl(name):
    s = W.slug(name)
    return f'<a href="/map/{s}/">{E(name)}</a>' if os.path.exists(os.path.join(ROOT, "map", s, "index.html")) else E(name)


def fp(name, shown):   # today's price, swapped in by fmprice.js when the page opens
    return f'<span class="fp" data-fmi="{E(name)}">about <b class="mz">{E(shown)}</b> on the FM</span>' if shown and shown[0].isdigit() else '<span class="fp fpn" data-fmi="' + E(name) + '">not seen on the FM yet</span>'


def table(head, rows):
    return '<div class="tw"><table><tr>' + "".join(f"<th>{h}</th>" for h in head) + "</tr>" + "".join(
        "<tr>" + "".join(f"<td{' class=n' if i == 0 else ''}>{c}</td>" for i, c in enumerate(r)) + "</tr>" for r in rows) + "</table></div>"


def sec(h, tab, cls=""):
    return f'<section class="blk{(" " + cls) if cls else ""}" data-tab="{E(tab)}">{h}</section>'


def build_page(name):
    d = json.load(open(os.path.join(ROOT, "builds", name + ".json"), encoding="utf-8"))
    h = d["header"]
    head = (f'<h1>{E(h["build"])}</h1><p class="sub">{E(h["class"])} · {E(h["job_path"])} · levels {E(h["level_range"])} · {E(h["difficulty"])}</p>'
            f'<p class="big">{md(h["pitch"])}</p>'
            '<div class="grid">'
            f'<div><b>Best at</b><ol>' + "".join(f"<li>{E(x)}</li>" for x in h["best_at"]) + "</ol></div>"
            f'<div><b>Weak spots</b><ol>' + "".join(f"<li>{E(x)}</li>" for x in h["weak_spots"]) + "</ol></div>"
            + (f'<div><b>Gear to 50</b><p>{E(h["gear_cost"]["to_level_50"]["shown"])}</p><small>{E(h["gear_cost"]["note"])}</small></div>' if h.get("gear_cost") else "")
            + f'</div><p class="tip">{E(h["game_version"])}</p>')
    sp = d["stat_plan"]
    stats = "<h2>Stats</h2>" + table(["Levels", "Where AP goes", "Why"], [[E(r["levels"]), E(r["ap"]), E(r["why"])] for r in sp["rule"]])
    if sp.get("table"):
        ks = list(sp["table"][0])
        stats += "<h3>Your stats by level</h3>" + table([E(k) for k in ks], [[E(r[k]) for k in ks] for r in sp["table"]])
    skills = "<h2>Skill order</h2>" + table(["Level", "Skill", "To", "Why"], [[E(r["level"]), f'<b>{E(r["skill"])}</b><br><small>{E(r["book"])}</small>', E(r["to"]), E(r["why"])] for r in d["skill_order"]])
    grow = lambda r: [E(r["level"]), item(r["item"], r.get("id")) + f'<br><small>{E(r["slot"])}</small>', E(r["needs"]),
                      E(r["attack"]) + (f'<br><small>speed {E(r["speed"])}</small>' if r.get("speed") else ""), fp(r["item"], (r.get("price") or {}).get("shown")),
                      E(r["why"])]
    gear = "<h2>Gear by level</h2>" + table(["Level", "Item", "Needs", "Attack", "Price", "Why"], [grow(r) for r in d["gear"]])
    if d.get("gear_optional"):
        gear += "<h3>Nice to have</h3>" + table(["Level", "Item", "Needs", "Attack", "Price", "Why"], [grow(r) for r in d["gear_optional"]])
    job = "<h2>Job advancement</h2>" + table(["Level", "Job", "Where", "Needs", "You get"], [[E(r["level"]), f'<b>{E(r["job"])}</b>', E(r["where"]), E(r["needs"]), E(r["gets"])] for r in d["advancement"]])

    def cost(r):
        c = r.get("cost")
        if not c: return ""
        m = (c.get("mesos") or {})
        return (f'{c["nx"]:,} NX' if c.get("nx") else "") + (("<br>" + fp(r["what"], m.get("shown"))) if m.get("shown") else "")
    resets = "<h2>Resets</h2>" + table(["Item", "When", "Cost", "Worth it", "Why"], [[f'<b>{E(r["what"])}</b>', E(r["when"]), cost(r), f'<b>{E(r["worth_it"])}</b>', E(r["why"])] for r in d["resets"]])
    train = "<h2>Where to train</h2>" + table(["Levels", "Maps", "Tip"], [[E(t["levels"]), "<br>".join(f'{mapl(m["map"])} <small>{E(", ".join(m["monsters"]))}</small>' for m in t["maps"]), E(t["tip"])] for t in d["train_ranges"]])
    why = "<h2>Why this way</h2><ol>" + "".join(f"<li>{md(x)}</li>" for x in d["why"]) + "</ol>"
    mist = "<h2>Common mistakes</h2><ol>" + "".join(f"<li>{md(x)}</li>" for x in d["mistakes"]) + "</ol>"
    ma = any(r.get("main_attack") for r in d["compare"])
    comp = "<h2>Other ways to build it</h2>" + table(["Build"] + (["Main attack"] if ma else []) + ["Best at", "Weak"], [[f'<b>{E(r["build"])}</b>' + (f'<br><small>{E(r["note"])}</small>' if r.get("note") else "")] + ([E(r.get("main_attack"))] if ma else []) + [E(r["best_at"]), E(r["weak"])] for r in d["compare"]])
    fut = "<h2>3rd job</h2>" + table(["When", "Status", "Plan"], [[f'<b>{E(r["when"])}</b>', E(r["status"]), E(r["plan"])] for r in d["future"]])

    body = (f'<div class="lay lay-build n2" data-tabs>'
            f'<div class="col">{sec(head, "Overview", "head band")}{sec(stats, "Stats")}{sec(skills, "Skills")}{sec(job, "Job")}{sec(resets, "Resets")}</div>'
            f'<div class="col">{sec(gear, "Gear")}{sec(train, "Train")}{sec(why, "Why")}{sec(mist, "Why")}{sec(comp, "Compare")}{sec(fut, "3rd job")}</div></div>'
            '<div class="cta"><b>Gear for this build:</b> every Free Market listing seen today, with channel and room. <a href="/">Open the price board</a></div>')
    s = d["search"]
    return d["slug"], W.page(s["title"], s["description"], d["slug"], [("Build guides", "/builds/"), (h["build"].split(":")[0], d["slug"])], body)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else ROOT
    for n in BUILDS:
        path, text = build_page(n)
        text = text.replace('<link rel="stylesheet" href="/assets/pages.css?v=2">', '<link rel="stylesheet" href="/assets/pages.css?v=2"><style>.lay-build .blk h3{margin-top:16px}.lay-build td small{color:var(--muted)}.lay-build .tw{overflow-x:auto}.lay-build ol{padding-left:22px}.lay-build ol li{margin:3px 0}.lay-build .head p.big{font-size:1.15rem;line-height:1.45;font-weight:600}</style>', 1)
        if "data-fmi=" in text and "fmprice.js" not in text:
            text = text.replace("</body>", '<script src="/assets/fmprice.js?v=2" defer></script></body>')
        text = text.replace('<a href="/training/">Training guides</a><a href="/maps/" aria-current="page">Maps</a>', '<a href="/training/" aria-current="page">Training guides</a><a href="/maps/">Maps</a>')
        W.write(out, path, text)
        print("wrote", path)


if __name__ == "__main__":
    main()
