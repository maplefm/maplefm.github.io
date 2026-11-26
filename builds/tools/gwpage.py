#!/usr/bin/env python3
"""Build guide page in the "game window" look Adam picked (Nov 25): a level slider drives Stats, Skills and Equipment
windows; "Finished build" jumps to 100; "See the whole guide" opens every table (plain HTML, so search engines read it).
Ways to get each weapon come from the live item guide (NPC shops with price, drops, crafting) next to the FM price.
    python3 builds/tools/gwpage.py            writes builds/sindit/index.html
"""
import json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import worldpages as W  # noqa: E402

LIVE = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/"


def E(s): return W.E(str(s if s is not None else ""))
def md(s): return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", E(s))


def load(name):
    p = os.path.join(ROOT, "data", name)
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    return json.load(urllib.request.urlopen(LIVE + name, timeout=60))


def ways(guide, name):
    g = guide.get(name) or {}
    shops = sorted({(s[0], s[1], s[2]) for s in g.get("s", []) if s[2]}, key=lambda s: s[2])
    drops = sorted({(x[0], x[1]) for x in g.get("d", []) if x[1]}, key=lambda x: x[1])[:3]
    craft = [{"town": "Kerning City" if c[0] == "Weaponcrafting" else "", "fee": c[3], "mats": [m[0] for m in c[2]]} for c in g.get("c", [])]
    return {"shops": [{"npc": a, "town": b, "price": c} for a, b, c in shops[:2]], "drops": [{"mob": a, "lv": b} for a, b in drops], "craft": craft[:1]}


CSS = r"""
.gw{max-width:1100px;margin:0 auto}
.gw-top{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:4px 0 14px}
.gw-top h1{margin:0;font-size:clamp(26px,4vw,36px)}.gw-top p{margin:4px 0 0;color:var(--muted);max-width:620px}
.gw-ctl{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.gw-lv{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:8px 12px}
.gw-lv input{width:200px;accent-color:#f59e0b}.gw-lv b{font-size:20px;min-width:66px}
.gbtn{font:800 14px inherit;border-radius:12px;padding:11px 14px;cursor:pointer;border:2px solid #c9a24a;background:linear-gradient(#f8d977,#e3b94f);color:#3b2a06}
.gbtn.alt{background:var(--panel);color:var(--ink,inherit);border-color:var(--line)}
.gw-grid{display:grid;grid-template-columns:250px 1fr 320px;gap:14px;align-items:start}
.win{background:linear-gradient(#2b3a67,#1b2546);border:2px solid #c9a24a;border-radius:10px;color:#eef2ff;box-shadow:0 0 0 2px #10172e,0 8px 24px rgba(16,23,46,.3);overflow:hidden}
.win h2{margin:0;font-size:13px;letter-spacing:.12em;text-transform:uppercase;padding:8px 12px;background:linear-gradient(#f8d977,#c9a24a);color:#3b2a06}
.win .in{padding:12px}.win a{color:#fde047}
.srow{display:flex;justify-content:space-between;align-items:center;padding:7px 10px;margin:5px 0;border-radius:6px;background:rgba(255,255,255,.06);font-weight:700}
.srow span{color:#9fb0e8;font-size:12px;letter-spacing:.08em}.srow b{font-size:18px}.srow.hi{background:rgba(245,158,11,.22);outline:1px solid #f59e0b}
.wtip{font-size:13px;color:#c7d2fe;margin-top:8px;line-height:1.45}
.tabsg{display:flex;gap:4px;padding:8px 12px 0}.tabsg button{font:700 12px inherit;border:0;border-radius:6px 6px 0 0;padding:7px 12px;background:#33447a;color:#c7d2fe;cursor:pointer}.tabsg button[aria-pressed=true]{background:#f8d977;color:#3b2a06}
.sk{display:grid;grid-template-columns:38px 1fr auto;gap:10px;align-items:center;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.05);margin:6px 0}
.sk .ic{width:38px;height:38px;border-radius:8px;display:grid;place-items:center;font-weight:900;font-size:13px;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff}
.sk.off{opacity:.45}.sk .nm{font-weight:700}.sk .bar{height:6px;border-radius:6px;background:#0f1730;margin-top:5px;overflow:hidden}.sk .bar i{display:block;height:100%;background:linear-gradient(90deg,#f59e0b,#fde047)}
.sk .pt{font-weight:800;font-size:15px;color:#fde047}.sk small{color:#9fb0e8;font-size:12px}
.wpn{display:grid;grid-template-columns:64px 1fr;gap:12px;align-items:center}
.wpn .slot{width:64px;height:64px;border-radius:10px;display:grid;place-items:center;background:rgba(245,158,11,.18);border:1px solid #f59e0b}
.wpn .slot img{width:40px;height:40px;image-rendering:pixelated}.wpn b{font-size:17px}.wpn small{display:block;color:#9fb0e8}
.get{margin-top:12px;display:grid;gap:6px}.get div{display:flex;gap:8px;align-items:flex-start;background:rgba(255,255,255,.06);border-radius:8px;padding:8px 10px;font-size:14px}
.get i{font-style:normal;font-size:11px;font-weight:800;border-radius:6px;padding:2px 6px;background:#f8d977;color:#3b2a06;flex:none;margin-top:2px}
.get i.tfm{background:#a78bfa;color:#1e1240}.get i.tdr{background:#34d399;color:#06281c}.get i.tcr{background:#93c5fd;color:#0b2447}
.get .best{outline:1px solid #fde047}.get span{flex:1;min-width:0}
.next{margin-top:10px;font-size:13px;color:#c7d2fe}
.gw-maps{margin-top:14px}.mapc{display:flex;gap:10px;flex-wrap:wrap}.mapc a{flex:1 1 200px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:10px 12px;color:#eef2ff;text-decoration:none;font-weight:700}.mapc a small{display:block;color:#9fb0e8;font-weight:500}
.gw-low{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}.gw-low ol{padding-left:20px;margin:0}.gw-low li{margin:6px 0;color:#dbe2ff}
.all{margin-top:16px}.all>summary{list-style:none;cursor:pointer}.all>summary::-webkit-details-marker{display:none}
.all .win{margin-top:14px}.all table{width:100%;border-collapse:collapse;font-size:14px}.all th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9fb0e8;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.15)}
.all td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top}.all td small{color:#9fb0e8}.all .tw{overflow-x:auto}
@media(max-width:1000px){.gw-grid{grid-template-columns:1fr 1fr}.gw-grid .skw{grid-column:1/-1;order:3}}
@media(max-width:640px){.gw-grid,.gw-low{grid-template-columns:1fr}.gw-ctl{width:100%}.gw-lv{flex:1 1 100%}.gw-lv input{flex:1;width:auto}.gbtn{flex:1}}
"""

JS = r"""
const E=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const slug=s=>s.toLowerCase().replace(/'/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const fmt=n=>n>=1e6?(n/1e6).toFixed(1).replace(".0","")+"M":n>=1e5?Math.round(n/1000)+"K":n.toLocaleString();
function dexAt(L){for(const r of D.dex)if(L>=r[0]&&L<=r[1])return r[2];return 25}
function statsAt(L){let dex=D.base.DEX,luk=D.base.LUK;for(let l=D.base.level+1;l<=L;l++){const a=Math.max(0,Math.min(5,dexAt(l)-dex));dex+=a;luk+=5-a}return{STR:D.base.STR,DEX:dex,LUK:luk}}
function skillsAt(L){const out={};function fill(list,sp){for(const s of list){const have=out[s.skill]||0,need=s.to-have;if(need<=0)continue;const g=Math.min(need,sp);out[s.skill]=have+g;sp-=g;if(sp<=0)break}}
 fill(D.skills.filter(s=>s.book=="1st job"),L>=10?1+3*(Math.min(L,30)-10):0);if(L>=30)fill(D.skills.filter(s=>s.book=="2nd job"),1+3*(L-30));return out}
let book="1st job";const ab=n=>n.split(" ").map(w=>w[0]).join("").slice(0,2);
function draw(){const L=+lv.value;lvn.textContent="Lv "+L;const s=statsAt(L),pv=statsAt(Math.max(10,L-1)),sk=skillsAt(L);
 stw.innerHTML=["STR","DEX","LUK"].map(k=>`<div class="srow${L>10&&s[k]!=pv[k]?" hi":""}"><span>${k}</span><b>${s[k]}</b></div>`).join("")+`<div class="wtip">${E((D.rules.find(r=>L>=r[0]&&L<=r[1])||[0,0,""])[2])}</div>`;
 const books=["1st job"].concat(L>=30?["2nd job"]:[]);if(!books.includes(book)||(L>=30&&!skt.dataset.touched))book=books[books.length-1];
 skt.innerHTML=books.map(b=>`<button type="button" aria-pressed="${b==book}" data-b="${b}">${b}</button>`).join("");
 skt.querySelectorAll("button").forEach(x=>x.onclick=()=>{book=x.dataset.b;skt.dataset.touched=1;draw()});
 skw.innerHTML=[...new Set(D.skills.filter(x=>x.book==book).map(x=>x.skill))].map(n=>{const p=sk[n]||0,m=D.max[n]||20,steps=D.skills.filter(x=>x.skill==n),cur=steps.filter(x=>x.level<=L).pop()||steps[0];
  return`<div class="sk${p?"":" off"}"><div class="ic">${ab(n)}</div><div><div class="nm">${E(n)}</div><div class="bar"><i style="width:${p/m*100}%"></i></div><small>${p?E(cur.why):"starts at level "+steps[0].level}</small></div><div class="pt">${p}/${m}</div></div>`}).join("");
 let w=null;for(const g of D.gear)if(g.level<=L)w=g;const nx=D.gear.find(g=>g.level>L);
 if(!w){eqw.innerHTML='<div class="wtip">No weapon needed yet.</div>'}else{
  const fm=w.fm?`<div><i class="tfm">FM</i><span data-fmi="${E(w.item)}">about <b class="mz">${E(w.fm)}</b> on the Free Market</span></div>`:"";
  const shop=w.get.shops.map((x,i)=>`<div class="${i==0&&w.fmv&&x.price<w.fmv?"best":""}"><i>NPC</i><span>${E(x.npc)}, ${E(x.town)}: <b>${fmt(x.price)}</b></span></div>`).join("");
  const dr=w.get.drops.length?`<div><i class="tdr">DROP</i><span>${w.get.drops.map(x=>E(x.mob)+" (Lv "+x.lv+")").join(", ")}</span></div>`:"";
  const cr=w.get.craft.map(c=>`<div><i class="tcr">CRAFT</i><span>${E(c.town)} weaponcrafting: ${E(c.mats.join(", "))} + ${fmt(c.fee)}</span></div>`).join("");
  eqw.innerHTML=`<div class="wpn"><div class="slot"><img src="/i/${w.id}.png" alt="" width="40" height="40"></div><div><b><a href="/item/${slug(w.item)}/">${E(w.item)}</a></b><small>${E(w.slot)} · attack ${E(w.attack)}${w.speed?" · speed "+E(w.speed):""} · needs ${E(w.needs)}</small></div></div><div class="get">${(shop+fm+dr+cr)||"<div><span>No NPC sells it and it hasn't shown up on the Free Market yet.</span></div>"}</div><div class="wtip">${E(w.why)}</div>${nx?`<div class="next">Next: <b>${E(nx.item)}</b> at level ${nx.level}</div>`:""}`}
 const t=D.train.find(t=>L>=t[0]&&L<=t[1]);mpw.innerHTML=t?t[2].map(m=>`<a href="/map/${slug(m.map)}/">${E(m.map)}<small>${E(m.monsters.join(", "))}</small></a>`).join("")+(t[3]?`<div class="wtip" style="flex-basis:100%">${E(t[3])}</div>`:""):"";
 try{history.replaceState(null,"",L==D.start?location.pathname:"#lv"+L)}catch(e){}
}
const m=location.hash.match(/^#lv(\d+)$/);if(m)lv.value=Math.min(100,Math.max(10,+m[1]));
lv.oninput=draw;fin.onclick=()=>{lv.value=100;draw()};
allb.onclick=()=>{all.open=!all.open;if(all.open)all.scrollIntoView({behavior:"smooth"})};all.ontoggle=()=>allb.textContent=all.open?"Hide the whole guide":"See the whole guide";
draw();
"""


def rng(s):
    m = re.match(r"(\d+)(?:\D+(\d+))?", str(s))
    return (int(m.group(1)), int(m.group(2) or m.group(1))) if m else None


def table(head, rows):
    return '<div class="tw"><table><tr>' + "".join(f"<th>{h}</th>" for h in head) + "</tr>" + "".join(
        "<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows) + "</table></div>"


def build(name):
    d = json.load(open(os.path.join(ROOT, "builds", name + ".json"), encoding="utf-8"))
    guide = load("itemguide.json")["items"]
    h, sp = d["header"], d["stat_plan"]
    # DEX targets by level, from the stat table: DEX rises to each row's value by that row's level
    rows = sp["table"]
    base = dict(rows[0]); base["level"] = int(base["level"])
    dex = []
    for r in sp["rule"]:
        lr = rng(r["levels"])
        if not lr: continue
        m = re.search(r"DEX (?:\(to |to )(\d+)", r["ap"])
        if m: dex.append([lr[0], lr[1], int(m.group(1))])
    rules = [[*rng(r["levels"]), r["ap"]] for r in sp["rule"] if rng(r["levels"])]
    # DEX target per level: inside a "DEX (to N)" range the target is N; otherwise it holds
    tgt, last = [], int(base["DEX"])
    for L in range(10, 101):
        hit = next((x for x in dex if x[0] <= L <= x[1]), None)
        if hit: last = hit[2]
        tgt.append([L, L, last])
    gear = []
    for g in d["gear"] + [dict(x, optional=True) for x in d.get("gear_optional", [])]:
        if g.get("optional"): continue
        p = g.get("price") or {}
        gear.append({"level": g["level"], "item": g["item"], "id": g["id"], "slot": g["slot"], "needs": g["needs"], "attack": g["attack"], "speed": g.get("speed"),
                     "why": g["why"], "fm": p.get("shown") if p.get("typical") else None, "fmv": p.get("typical"), "get": ways(guide, g["item"])})
    MAX = {"Savage Blow": 30, "Steal": 30}
    data = {"start": 44, "base": base, "dex": tgt, "rules": rules, "skills": d["skill_order"], "max": MAX, "gear": gear,
            "train": [[*rng(t["levels"]), t["maps"], t.get("tip")] for t in d["train_ranges"]]}
    # check the stat math against every row of the guide's own table before writing anything
    import subprocess
    chk = subprocess.run(["node", "-e", "const D=" + json.dumps(data) + ";" + JS.split("let book")[0].split("function skillsAt")[0] +
                          "console.log(JSON.stringify(" + json.dumps([[int(r["level"]), int(r["DEX"]), int(r["LUK"])] for r in rows]) + ".filter(r=>{const s=statsAt(r[0]);return s.DEX!=r[1]||s.LUK!=r[2]})))"],
                         capture_output=True, text=True)
    assert chk.stdout.strip() == "[]", ("stat math disagrees with the table", chk.stdout, chk.stderr)

    # the whole guide as plain HTML
    def ways_txt(g):
        w = g["get"]; out = []
        out += [f'{E(s["npc"])}, {E(s["town"])}: {s["price"]:,}' for s in w["shops"]]
        if g["fm"]: out.append(f'<span data-fmi="{E(g["item"])}">FM about <b class="mz">{E(g["fm"])}</b></span>')
        if w["drops"]: out.append("drops: " + E(", ".join(x["mob"] for x in w["drops"])))
        if w["craft"]: out.append("crafted in Kerning City")
        return "<br>".join(out)
    allh = (
        '<div class="win"><h2>Stats by level</h2><div class="in">' + table(["Levels", "Where AP goes", "Why"], [[E(r["levels"]), E(r["ap"]), E(r["why"])] for r in sp["rule"]])
        + table(list(rows[0]), [[E(r[k]) for k in rows[0]] for r in rows]) + "</div></div>"
        + '<div class="win"><h2>Skill order</h2><div class="in">' + table(["Level", "Skill", "To", "Why"], [[E(s["level"]), f'<b>{E(s["skill"])}</b><br><small>{E(s["book"])}</small>', E(s["to"]), E(s["why"])] for s in d["skill_order"]]) + "</div></div>"
        + '<div class="win"><h2>Weapons</h2><div class="in">' + table(["Level", "Weapon", "Needs", "Attack", "How to get it", "Why"], [[E(g["level"]), f'<img src="/i/{g["id"]}.png" alt="" width="28" height="28" style="vertical-align:middle"> <a href="/item/{W.slug(g["item"])}/">{E(g["item"])}</a><br><small>{E(g["slot"])}</small>', E(g["needs"]), E(g["attack"]), ways_txt(g), E(g["why"])] for g in gear]) + "</div></div>"
        + '<div class="win"><h2>Job advancement</h2><div class="in">' + table(["Level", "Job", "Where", "Needs", "You get"], [[E(a["level"]), f'<b>{E(a["job"])}</b>', E(a["where"]), E(a["needs"]), E(a["gets"])] for a in d["advancement"]]) + "</div></div>"
        + '<div class="win"><h2>Resets</h2><div class="in">' + table(["Item", "When", "Worth it", "Why"], [[f'<b>{E(r["what"])}</b>', E(r["when"]), f'<b>{E(r["worth_it"])}</b>', E(r["why"])] for r in d["resets"]]) + "</div></div>"
        + '<div class="win"><h2>Where to train</h2><div class="in">' + table(["Levels", "Maps", "Tip"], [[E(t["levels"]), "<br>".join(f'<a href="/map/{W.slug(m["map"])}/">{E(m["map"])}</a> <small>{E(", ".join(m["monsters"]))}</small>' for m in t["maps"]), E(t["tip"])] for t in d["train_ranges"]]) + "</div></div>"
        + '<div class="win"><h2>Other ways to build it</h2><div class="in">' + table(["Build", "Main attack", "Best at", "Weak"], [[f'<b>{E(c["build"])}</b>', E(c.get("main_attack")), E(c["best_at"]), E(c["weak"])] for c in d["compare"]]) + "</div></div>"
        + '<div class="win"><h2>3rd job</h2><div class="in">' + table(["When", "Status", "Plan"], [[f'<b>{E(f["when"])}</b>', E(f["status"]), E(f["plan"])] for f in d["future"]]) + "</div></div>")

    body = (f'<style>{CSS}</style><div class="gw"><div class="gw-top"><div><h1>{E(h["build"])}</h1><p>{md(h["pitch"])}</p></div>'
            '<div class="gw-ctl"><label class="gw-lv">Level <b id="lvn">Lv 44</b><input id="lv" type="range" min="10" max="100" value="44" aria-label="Character level"></label>'
            '<button type="button" class="gbtn" id="fin">Finished build</button><button type="button" class="gbtn alt" id="allb">See the whole guide</button></div></div>'
            '<div class="gw-grid"><div class="win"><h2>Stats</h2><div class="in" id="stw"></div></div><div class="win skw"><h2>Skills</h2><div class="tabsg" id="skt"></div><div class="in" id="skw"></div></div>'
            '<div class="win"><h2>Weapon</h2><div class="in" id="eqw"></div></div></div>'
            '<div class="win gw-maps"><h2>Where to train</h2><div class="in"><div class="mapc" id="mpw"></div></div></div>'
            f'<div class="gw-low"><div class="win"><h2>Why this way</h2><div class="in"><ol>{"".join("<li>" + md(x) + "</li>" for x in d["why"])}</ol></div></div>'
            f'<div class="win"><h2>Common mistakes</h2><div class="in"><ol>{"".join("<li>" + md(x) + "</li>" for x in d["mistakes"])}</ol></div></div></div>'
            f'<details class="all" id="all"><summary></summary>{allh}</details></div>'
            f'<script>const D={json.dumps(data).replace("</", "<\\/")};{JS}</script>'
            '<script src="/assets/fmprice.js?v=2" defer></script>')
    s = d["search"]
    path, text = d["slug"], W.page(s["title"], s["description"], d["slug"], [("Build guides", "/builds/"), (h["build"].split(":")[0], d["slug"])], body)
    text = text.replace('<a href="/training/">Training guides</a><a href="/maps/" aria-current="page">Maps</a>', '<a href="/training/" aria-current="page">Training guides</a><a href="/maps/">Maps</a>')
    W.write(ROOT, path, text)
    return path


if __name__ == "__main__":
    print("wrote", build("sindit"))
