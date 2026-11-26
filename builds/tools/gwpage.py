#!/usr/bin/env python3
"""Build guide page in the "game window" look Adam picked (Nov 25), with his Nov 25 evening changes:
levels 1 to 70 only (70 is 3rd job, not out yet), stats for every level in a scroll box with jump buttons and a
"Changes only" toggle, skill points for every level with skill icons, no "why" columns, needs shown as stat badges,
ways to get each weapon as linked cards (NPC, Free Market, drop, craft, quest), minimap on hover or tap for training
maps, and other builds linked to their guides. Stars are never recommended; the page only says where NPCs sell Subi.
    python3 builds/tools/gwpage.py [name ...]     default: sindit
"""
import json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import worldpages as W  # noqa: E402

LIVE = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/"
CAP = 70
GUIDES = {"Sindit": "sindit", "Spearman, spear": "spearman-spear", "Spearman, polearm": "spearman-polearm", "Assassin": "assassin", "Pure Bandit": "pure-bandit", "Hunter": "hunter"}


def E(s): return W.E(str(s if s is not None else ""))
def md(s): return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", E(s))
def exists(*p): return os.path.exists(os.path.join(ROOT, *p, "index.html"))


def load(name):
    p = os.path.join(ROOT, "data", name)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else json.load(urllib.request.urlopen(LIVE + name, timeout=60))


def rng(s):
    m = re.match(r"(\d+)(?:\D+(\d+))?", str(s))
    return (int(m.group(1)), int(m.group(2) or m.group(1))) if m else None


_NPCMAP = None
def npc_link(npc):
    """the interactive map, opened where the NPC is, with the NPC flashing. Shop insides have no minimap, so for an
    NPC indoors it opens the map outside and flashes the door in."""
    global _NPCMAP
    from urllib.parse import quote
    maps = load("world.json")["maps"]
    if _NPCMAP is None:
        _NPCMAP = {}
        for mn, m in maps.items():
            for x in m.get("npcs") or []:
                _NPCMAP.setdefault(x[0], mn)
    mn = _NPCMAP.get(npc)
    if not mn: return ""
    m = maps[mn]
    if m.get("mm") and any(x[0] == npc and x[1] is not None for x in m.get("npcs") or []):
        return f"/map.html#map={quote(mn)}&npc={quote(npc)}"
    outside = next((on for on, o in maps.items() if o.get("mm") and any(p[0] == mn for p in o.get("portals") or [])), None)
    if outside: return f"/map.html#map={quote(outside)}&npc={quote(npc)}&door={quote(mn)}"
    return f"/map.html#map={quote(mn)}"


def _moblv():
    import tempfile
    p = os.path.join(tempfile.gettempdir(), "fm-world.json")
    if not os.path.exists(p):
        import urllib.request
        open(p, "wb").write(urllib.request.urlopen("https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/world.json", timeout=120).read())
    return {n: m["lv"] for n, m in json.load(open(p, encoding="utf-8"))["mobs"].items() if not m.get("variant")}


MOBLV = _moblv()


def ways(guide, name):
    g = guide.get(name) or {}
    out = []
    for npc, town, price in sorted({(s[0], s[1], s[2]) for s in g.get("s", []) if s[2]}, key=lambda s: s[2])[:2]:
        ts = W.slug(town)
        out.append({"k": "npc", "t": npc, "s": town, "p": price, "u": npc_link(npc) or (f"/map/{ts}/" if exists("map", ts) else "")})
    # the monster's own level from world.json; the drop list's level can be a job quest's copy of the monster
    drops = {(x[0], MOBLV.get(x[0]) or x[1]) for x in g.get("d", []) if x[1]}
    for mob, lv in sorted(drops, key=lambda x: x[1])[:3]:
        ms = W.slug(mob)
        out.append({"k": "drop", "t": mob, "s": f"Lv {lv}", "u": f"/monster/{ms}/" if exists("monster", ms) else ""})
    for c in g.get("c", [])[:1]:
        cs = W.slug(c[0])
        out.append({"k": "craft", "t": c[0], "s": ", ".join(f"{m[1]} {m[0]}" for m in c[2]) + f" + {c[3]:,} mesos", "u": f"/crafting/{cs}/" if exists("crafting", cs) else ""})
    for q in g.get("q", [])[:1]:
        qs = W.slug(q[0])
        out.append({"k": "quest", "t": q[0], "s": q[3] if len(q) > 3 else "", "u": f"/quest/{qs}/" if exists("quest", qs) else ""})
    return out


CSS = r"""
.gw{max-width:none;margin:0 auto}.gw-two{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}.gw-two>.win{margin-bottom:0}.gw-two>*,.gw-grid>*,.gw-low>*{min-width:0}.gw-two{margin-bottom:14px}
.gw-top{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:4px 0 14px}
.gw-top h1{margin:0;font-size:clamp(26px,4vw,36px)}.gw-top p{margin:4px 0 0;color:var(--muted);max-width:620px}
.gw-ctl{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.gw-lv{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:8px 12px}
.gw-lv input{width:200px;accent-color:#f59e0b}.gw-lv b{font-size:20px;min-width:66px}
.gbtn{font:800 14px inherit;border-radius:12px;padding:11px 14px;cursor:pointer;border:2px solid #c9a24a;background:linear-gradient(#f8d977,#e3b94f);color:#3b2a06}
.gbtn.alt{background:var(--panel);color:inherit;border-color:var(--line)}
.gw-grid{display:grid;grid-template-columns:260px minmax(0,1fr) minmax(0,1fr) 380px;gap:14px;align-items:start}
.win{background:linear-gradient(#2b3a67,#1b2546);border:2px solid #c9a24a;border-radius:10px;color:#eef2ff;box-shadow:0 0 0 2px #10172e,0 8px 24px rgba(16,23,46,.3);margin-bottom:14px}
.win h2{margin:0;font-size:13px;letter-spacing:.12em;text-transform:uppercase;padding:8px 12px;background:linear-gradient(#f8d977,#c9a24a);color:#3b2a06;border-radius:7px 7px 0 0}
.win .in{padding:12px}.gw .win table,.gw .win td,.gw .win th{color:#eef2ff}.gw .win td.gn{color:#fde047;text-align:left}.win a{color:#fde047}
.srow{display:flex;justify-content:space-between;align-items:center;padding:7px 10px;margin:5px 0;border-radius:6px;background:rgba(255,255,255,.06);font-weight:700}
.srow span{color:#9fb0e8;font-size:12px;letter-spacing:.08em}.srow b{font-size:18px}.srow.hi{background:rgba(245,158,11,.22);outline:1px solid #f59e0b}
.wtip{font-size:13px;color:#c7d2fe;margin-top:8px;line-height:1.45}
.tabsg{display:flex;gap:4px;padding:8px 12px 0}.tabsg button{font:700 12px inherit;border:0;border-radius:6px 6px 0 0;padding:7px 12px;background:#33447a;color:#c7d2fe;cursor:pointer}.tabsg button[aria-pressed=true]{background:#f8d977;color:#3b2a06}
.ski{width:32px;height:32px;border-radius:7px;background:#0f1730;display:inline-grid;place-items:center;flex:none;overflow:hidden;vertical-align:middle}
.ski img{width:32px;height:32px;image-rendering:pixelated}.ski b{font-size:11px;color:#c7d2fe}
.sk{display:grid;grid-template-columns:32px 1fr auto;gap:10px;align-items:center;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.05);margin:6px 0}
.sk.off{opacity:.45}.sk .nm{font-weight:700}.sk .bar{height:6px;border-radius:6px;background:#0f1730;margin-top:5px;overflow:hidden}.sk .bar i{display:block;height:100%;background:linear-gradient(90deg,#f59e0b,#fde047)}
.sk .pt{font-weight:800;font-size:15px;color:#fde047}.sk small{color:#9fb0e8;font-size:12px}
.gneed{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.gneed span{font-size:11px;font-weight:800;letter-spacing:.04em;border-radius:5px;padding:3px 7px;background:rgba(255,255,255,.1);color:#eef2ff}.gneed span em{font-style:normal;color:#9fb0e8;margin-right:4px}
.wpn{display:grid;grid-template-columns:60px 1fr;gap:12px;align-items:center}
.wpn .slot{width:60px;height:60px;border-radius:10px;display:grid;place-items:center;background:rgba(245,158,11,.18);border:1px solid #f59e0b}
.wpn .slot img{width:38px;height:38px;image-rendering:pixelated}.wpn b{font-size:17px}.wpn small{display:block;color:#9fb0e8}
.ways{margin-top:12px;display:grid;gap:7px}
.way{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:8px 10px;color:#eef2ff!important;text-decoration:none}
a.way:hover{border-color:#fde047}.way .tg{font-size:10px;font-weight:900;letter-spacing:.06em;border-radius:5px;padding:3px 6px;min-width:44px;text-align:center}
.way.npc .tg{background:#f8d977;color:#3b2a06}.way.fm .tg{background:#a78bfa;color:#1e1240}.way.drop .tg{background:#34d399;color:#06281c}.way.craft .tg{background:#93c5fd;color:#0b2447}.way.quest .tg{background:#fca5a5;color:#450a0a}
.way .t{font-weight:700;font-size:14px;min-width:0}.way .t small{display:block;font-weight:500;color:#9fb0e8;font-size:12px}.way .p{font-weight:800;color:#fde047;white-space:nowrap;text-align:right}
.way.best{outline:1px solid #fde047}.way .cheap{display:block;font-size:10px;color:#fde047;font-weight:800;letter-spacing:.06em}
.next{margin-top:10px;font-size:13px;color:#c7d2fe}
.mapc{display:flex;gap:10px;flex-wrap:wrap}.trw .mapc{flex-direction:column}.trw .mp{flex:0 0 auto}@media(max-width:1300px){.trw .mapc{flex-direction:row}}
.mp{flex:1 1 200px;position:relative;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:10px 12px;color:#eef2ff!important;text-decoration:none;font-weight:700}
.mp small{display:block;color:#9fb0e8;font-weight:500}.mp .gmm{display:none;position:absolute;left:0;top:calc(100% + 6px);z-index:30;background:#10172e;border:2px solid #c9a24a;border-radius:10px;padding:8px;box-shadow:0 10px 30px rgba(0,0,0,.45);width:max-content;max-width:min(340px,86vw)}
.mp .gmm img{display:block;max-width:100%;height:auto;image-rendering:pixelated;border-radius:4px;min-width:160px}.mp .gmm span{display:block;font-size:12px;color:#c7d2fe;margin-top:6px;font-weight:600}
.mp:hover .gmm,.mp.open .gmm{display:block}
.gbox{max-height:min(1050px,72vh);overflow:auto;border-radius:8px;background:rgba(0,0,0,.12)}
.gbox table{width:100%;border-collapse:separate;border-spacing:0;font-size:14px}
.gbox th{position:sticky;top:0;z-index:2;background:#22305a;text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9fb0e8;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.15)}
.gbox td{color:#eef2ff;text-align:left;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.06);white-space:nowrap}
.gbox tr.gch td{background:rgba(245,158,11,.14)}.gbox tr.gch td:first-child{box-shadow:inset 3px 0 #f59e0b}
.gbox td.gn{font-weight:800;color:#fde047}.gbox td.gv{font-variant-numeric:tabular-nums}.gbox td.gup{color:#fde047;font-weight:800}
.boxbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:10px}
.boxbar button{font:800 12px inherit;border-radius:7px;padding:6px 10px;border:1px solid rgba(255,255,255,.18);background:#33447a;color:#eef2ff;cursor:pointer}
.boxbar label{margin-left:auto;display:flex;gap:6px;align-items:center;font-size:13px;font-weight:700;color:#c7d2fe;cursor:pointer}
.boxbar input{accent-color:#f59e0b;width:16px;height:16px}
.gbox.only tr:not(.gch):not(.thd){display:none}
.spr td:nth-child(2){white-space:normal}.spr .si{display:inline-flex;align-items:center;gap:6px;margin:2px 12px 2px 0;font-weight:600}.spr .si .ski{width:24px;height:24px;border-radius:5px}.spr .si .ski img{width:24px;height:24px}
.all{margin-top:4px}.all>summary{list-style:none;cursor:pointer}.all>summary::-webkit-details-marker{display:none}
.all table.t{width:100%;border-collapse:collapse;font-size:14px}.all .t th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9fb0e8;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.15)}
.all .t td{padding:8px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top}.all .t td small{color:#9fb0e8}.all .tw{overflow-x:auto}
.gw-low{display:grid;grid-template-columns:1fr 1fr;gap:14px}.gw-low ol{padding-left:20px;margin:0}.gw-low li{margin:6px 0;color:#dbe2ff}
.third{display:flex;gap:14px;align-items:center}.third b{font-size:18px}.third .badge{font-size:11px;font-weight:900;letter-spacing:.08em;border-radius:6px;padding:4px 8px;background:#f8d977;color:#3b2a06;white-space:nowrap}
.cmp{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.cmp a,.cmp div.c{display:block;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:10px 12px;color:#eef2ff!important;text-decoration:none}
.cmp a:hover{border-color:#fde047}.cmp b{display:block}.cmp small{display:block;color:#9fb0e8;margin-top:3px}.cmp .go{font-size:12px;font-weight:800;color:#fde047;margin-top:6px}.cmp .soon{font-size:12px;color:#9fb0e8;margin-top:6px}
@media(max-width:1300px){.gw-grid{grid-template-columns:250px 1fr 340px}.gw-grid .trw{grid-column:1/-1}}@media(max-width:1100px){.gw-two{grid-template-columns:1fr}}@media(max-width:1000px){.gw-grid{grid-template-columns:1fr 1fr}.gw-grid .skw{grid-column:1/-1;order:3}.gw-grid .trw{order:4}}
@media(max-width:640px){.way{grid-template-columns:auto 1fr}.way .p{grid-column:2;text-align:left;white-space:normal}.way .cheap{display:inline;margin-right:6px}.gw-grid,.gw-low{grid-template-columns:1fr}.gw-ctl{width:100%}.gw-lv{flex:1 1 100%}.gw-lv input{flex:1;width:auto}.gbtn{flex:1}.gbox{max-height:70vh}.boxbar label{margin-left:0}}
"""

JS = r"""
const E=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmt=n=>n>=1e6?(n/1e6).toFixed(1).replace(".0","")+"M":n>=1e5?Math.round(n/1000)+"K":n.toLocaleString();
const ab=n=>n.split(" ").map(w=>w[0]).join("").slice(0,2);
function skFail(img){const b=document.createElement("b");b.textContent=img.dataset.ab;img.replaceWith(b)}
const ski=n=>{const id=D.sid[n];return`<span class="ski">${id?`<img src="${D.skimg(id)}" alt="" data-ab="${ab(n)}" onerror="skFail(this)">`:`<b>${ab(n)}</b>`}</span>`};
const S=D.stats;let book="1st job",touched=0;
function needs(w){return`<div class="gneed">${w.needs.map(([k,v])=>`<span>${k?`<em>${E(k)}</em>`:""}${E(v)}</span>`).join("")}</div>`}
function waysHtml(w){const c=[],npcs=w.ways.filter(x=>x.k=="npc");
 const cheapest=Math.min(...npcs.map(x=>x.p),w.fmv||Infinity),both=npcs.length&&w.fmv;
 for(const x of npcs)c.push([`way npc${both&&x.p==cheapest?" best":""}`,x.u,"NPC",`${E(x.t)}<small>${E(x.s)}</small>`,`${both&&x.p==cheapest?'<span class="cheap">Cheapest</span>':""}${fmt(x.p)}`]);
 if(w.fmv)c.push([`way fm${both&&w.fmv==cheapest?" best":""}`,w.link?"/item/"+w.slug+"/":"","FM",`Free Market<small>typical FM price</small>`,`${both&&w.fmv==cheapest?'<span class="cheap">Cheapest</span>':""}<span data-fmi="${E(w.item)}"><b class="mz">${E(w.fm)}</b></span>`]);
 for(const k of ["drop","craft","quest"])for(const x of w.ways.filter(x=>x.k==k))c.push([`way ${k}`,x.u,k[0].toUpperCase()+k.slice(1),`${E(x.t)}<small>${E(x.s)}</small>`,""]);
 if(!c.length)return'<div class="ways"><div class="way"><span class="tg"></span><span class="t">No NPC sells it and it hasn\'t shown up on the Free Market yet.</span><span></span></div></div>';
 return'<div class="ways">'+c.map(([cl,u,tg,t,p])=>`<${u?"a":"div"} class="${cl}"${u?` href="${u}"`:""}><span class="tg">${tg}</span><span class="t">${t}</span><span class="p">${p}</span></${u?"a":"div"}>`).join("")+"</div>"}
function draw(){const L=+lv.value;lvn.textContent="Lv "+L;const s=S[L-1],pv=S[Math.max(0,L-2)],sk=D.sp[L];
 stw.innerHTML=["STR","DEX","INT","LUK"].map((k,i)=>`<div class="srow${L>1&&s.t[i]!=pv.t[i]?" hi":""}"><span>${k}</span><b>${s.t[i]}</b></div>`).join("")+`<div class="wtip">This level: ${E(s.ap)}</div>`;
 const books=["1st job"].concat(L>=30?["2nd job"]:[]);if(L<10){skt.innerHTML="";skw.innerHTML='<div class="wtip">Skills start at level 10, when you job advance.</div>'}else{
 if(!touched||!books.includes(book))book=books[books.length-1];
 skt.innerHTML=books.map(b=>`<button type="button" aria-pressed="${b==book}" data-b="${b}">${b}</button>`).join("");
 skt.querySelectorAll("button").forEach(x=>x.onclick=()=>{book=x.dataset.b;touched=1;draw()});
 skw.innerHTML=D.book[book].map(n=>{const p=sk.have[n]||0,m=D.max[n]||20;return`<div class="sk${p?"":" off"}">${ski(n)}<div><div class="nm">${E(n)}</div><div class="bar"><i style="width:${p/m*100}%"></i></div><small>${p?(p>=m?"maxed":p+" of "+m):(D.reset&&L>=D.reset&&D.first[n]<D.reset?"reset at "+D.reset:"starts at level "+D.first[n])}</small></div><div class="pt">${p}/${m}</div></div>`}).join("")+(sk.spare?`<div class="wtip">${sk.spare} spare point${sk.spare>1?"s":""}${L==D.cap?", save for 3rd job":""}</div>`:"")}
 let w=null;for(const g of D.gear)if(g.level<=L)w=g;const nx=D.gear.find(g=>g.level>L);
 eqw.innerHTML=w?`<div class="wpn"><div class="slot"><img src="${D.icon(w.id)}" alt="" width="38" height="38"></div><div><b>${w.link?`<a href="/item/${w.slug}/">${E(w.item)}</a>`:E(w.item)}</b><small>${E(w.slot)} · attack ${E(w.attack)}${w.speed?" · speed "+E(w.speed):""}</small>${needs(w)}</div></div>${waysHtml(w)}${nx?`<div class="next">Next: <b>${E(nx.item)}</b> at level ${nx.level}</div>`:""}${w.slot=="Claw"&&D.ammo?`<div class="wtip">${D.ammo}</div>`:""}${w.slot=="Bow"&&D.ammoBow?`<div class="wtip">${D.ammoBow}</div>`:""}`:`<div class="wtip">No weapon yet. ${D.gear[0]?`Your first is <b>${E(D.gear[0].item)}</b> at level ${D.gear[0].level}.`:""}</div>`;
 const t=D.train.find(t=>L>=t.a&&L<=t.b);mpw.innerHTML=t?t.maps.map(m=>`<a class="mp" href="/map/${m.slug}/">${E(m.map)}<small>${E(m.monsters.join(", "))}</small>${m.mm?`<span class="gmm"><img src="${D.mm(m.mm)}" alt="Minimap of ${E(m.map)}" loading="lazy"><span>${E(m.map)}</span></span>`:""}</a>`).join(""):'<div class="wtip">Train on Maple Island and around your starting town until 10.</div>';
 try{history.replaceState(null,"",L==D.start?location.pathname:"#lv"+L)}catch(e){}
}
mpw.addEventListener("click",e=>{const a=e.target.closest(".mp");if(!a||!matchMedia("(hover:none)").matches)return;if(!a.classList.contains("open")){e.preventDefault();mpw.querySelectorAll(".mp.open").forEach(x=>x.classList.remove("open"));a.classList.add("open")}});
stb.innerHTML='<table><tr class="thd"><th>Lv</th><th>AP this level</th><th>STR</th><th>DEX</th><th>INT</th><th>LUK</th></tr>'+S.map((s,i)=>{const p=S[i-1];return`<tr id="sv${s.l}" class="${s.ch?"gch":""}"><td class="gn">${s.l}</td><td>${E(s.ap)}</td>${s.t.map((v,k)=>`<td class="gv${p&&v!=p.t[k]?" gup":""}">${v}</td>`).join("")}</tr>`}).join("")+"</table>";
document.querySelectorAll("[data-jump]").forEach(b=>b.onclick=()=>{if(chg.checked){chg.checked=false;stb.classList.remove("only")}const r=document.getElementById("sv"+b.dataset.jump);if(r)stb.scrollTop=r.offsetTop-stb.querySelector("th").offsetHeight});
chg.onchange=()=>stb.classList.toggle("only",chg.checked);
spb.innerHTML='<table><tr class="thd"><th>Lv</th><th>Where the points go</th></tr>'+D.spLevels.map(r=>`<tr class="spr${r.ch?" gch":""}"><td class="gn">${r.l}</td><td>${r.note?`<b style="color:#fde047;margin-right:10px">${E(r.note)}</b>`:""}${(r.gone||[]).map(([n,k])=>`<span class="si" style="color:#9fb0e8;text-decoration:line-through">${ski(n)}${E(n)} ${k}</span>`).join("")}${r.put.map(([n,k])=>`<span class="si">${ski(n)}${E(n)} +${k}</span>`).join("")}${r.spare?`<span class="si" style="color:#9fb0e8">${r.spare} spare, save for 3rd job</span>`:""}</td></tr>`).join("")+"</table>";
const m=location.hash.match(/^#lv(\d+)$/);if(m)lv.value=Math.min(D.cap,Math.max(1,+m[1]));
lv.oninput=draw;fin.onclick=()=>{lv.value=D.cap;draw()};
allb.onclick=()=>{all.open=!all.open;if(all.open)all.scrollIntoView({behavior:"smooth"})};all.ontoggle=()=>allb.textContent=all.open?"Hide the whole guide":"See the whole guide";
draw();
"""


def build(name):
    d = json.load(open(os.path.join(ROOT, "builds", name + ".json"), encoding="utf-8"))
    guide = load("itemguide.json")["items"]
    maps = load("world.json")["maps"]
    skills = json.load(open(os.path.join(ROOT, "assets", "classic-skills.json")))["skills"]
    sid = {v["n"]: int(k) for k, v in skills.items()}
    smax = {v["n"]: v["max"] for v in skills.values()}
    h, sp = d["header"], d["stat_plan"]
    rows = sp["table"]
    t10 = {k: int(v) for k, v in rows[0].items()}
    assert t10["level"] == 10

    # stats for every level, forward from the creation picks. Classic creation (Adam, Nov 25): no dice, 25 points,
    # 4 in every stat at least, and the sub stat starts at exactly 5. Each level after gives 5 AP; the sub stat is
    # bought up to each target in the guide's rules, everything else goes into the main stat.
    K = ["STR", "DEX", "INT", "LUK"]
    cr = d["creation"]; main, sub = cr["main"], cr["sub"]
    st1 = [cr["stats"][k] for k in K]
    assert sum(st1) == 25 and min(st1) >= 4 and cr["stats"][sub] == 5, ("creation breaks the Classic rules", cr)
    sub_to = []
    for r in sp["rule"]:
        lr = rng(r["levels"]); m = re.search(sub + r" (?:\(to |to )(\d+)", r["ap"])
        if lr and m: sub_to.append((lr[0], lr[1], int(m.group(1))))
    si, mi = K.index(sub), K.index(main)
    st = [None] * (CAP + 1); st[1] = st1; goal = st1[si]
    for L in range(2, CAP + 1):
        hit = next((v for a_, b_, v in sub_to if a_ <= L <= b_), None)
        if hit: goal = hit
        s_ = list(st[L - 1]); a_ = max(0, min(5, goal - s_[si])); s_[si] += a_; s_[mi] += 5 - a_; st[L] = s_
    INT = st[10][2]
    for r in rows:
        L = int(r["level"])
        if L <= CAP: assert st[L] == [int(r["STR"]), int(r["DEX"]), int(r.get("INT", INT)), int(r["LUK"])], ("stats disagree with the guide table", L, st[L], r)
    stats = []
    for L in range(1, CAP + 1):
        s, p = st[L], st[L - 1] if L > 1 else None
        if L == 1: ap = "character creation: " + ", ".join(f"{v} {k}" for k, v in zip(K, s))
        else: ap = " ".join(f"+{s[i] - p[i]} {K[i]}" for i in range(4) if s[i] != p[i])
        stats.append({"l": L, "t": s, "ap": ap, "ch": L in (1, 10, 30) or bool(p and s[si] != p[si])})

    # skill points every level, never more than the level allows or a skill's max
    order = [s for s in d["skill_order"] if s["level"] <= CAP]
    books = {b: [s for s in order if s["book"] == b] for b in ("1st job", "2nd job")}
    def have_at(L):
        hv, spare = {}, 0
        for bk, start in (("1st job", 10), ("2nd job", 30)):
            if L < start: continue
            pts = 1 + 3 * ((min(L, 30) if bk == "1st job" else L) - start)
            rs = d.get("reset")
            if rs and bk == rs["book"] and L >= rs["level"]:   # after an SP Reset the book is rebuilt as the guide says
                assert sum(rs["to"].values()) == pts, ("reset spends a different number of SP than the book has", sum(rs["to"].values()), pts)
                hv.update(rs["to"]); continue
            for s in books[bk]:
                need = s["to"] - hv.get(s["skill"], 0)
                if need <= 0: continue
                g = min(need, pts); hv[s["skill"]] = hv.get(s["skill"], 0) + g; pts -= g
                if pts <= 0: break
            spare = pts
        return hv, spare
    spd, sp_lv, prev = {}, [], {}
    for L in range(1, CAP + 1):
        hv, spare = have_at(L)
        for k, v in hv.items(): assert v <= smax.get(k, 30), (k, v)
        spd[L] = {"have": hv, "spare": spare}
        if L >= 10:
            put = [[k, v - prev.get(k, 0)] for k, v in hv.items() if v - prev.get(k, 0) > 0]
            gone = [[k, v] for k, v in prev.items() if hv.get(k, 0) < v]
            rs = d.get("reset")
            note = next((f"Job advance to {a['job']}" for a in d["advancement"] if str(a["level"]) == str(L)), "")
            if rs and L == rs["level"]: note = (note + " · " if note else "") + "Use an SP Reset Scroll (it clears every skill, put them back like this)"
            sp_lv.append({"l": L, "put": put, "gone": gone, "spare": spare if L == CAP else 0, "note": note, "ch": bool(note)})
        prev = hv
    first = {}
    for r in sp_lv:
        for n, _ in r["put"]: first.setdefault(n, r["l"])

    def needs_list(s):
        out = []
        for part in re.split(r",\s*", s):
            m = re.match(r"(\d+)\s+([A-Z]{3})", part.strip())
            if m: out.append([m.group(2), m.group(1)])
            elif part.strip() and part.strip() != "level only": out.append(["", part.strip()])
        return out
    REQ = {r[0]: r[2] for r in load("itemdb.json")["items"] if r[2]}
    gear = []
    for g in d["gear"]:
        if g["slot"] == "Stars" or g["level"] > CAP: continue
        p = g.get("price") or {}
        gear.append({"level": g["level"], "item": g["item"], "slug": W.slug(g["item"]), "link": exists("item", W.slug(g["item"])), "id": g["id"], "slot": g["slot"], "attack": g["attack"], "speed": g.get("speed"),
                     "needs": [["LV", str(REQ.get(g["item"], g["level"]))]] + needs_list(g["needs"]), "fm": p.get("shown") if p.get("typical") else None, "fmv": p.get("typical"), "ways": ways(guide, g["item"])})

    train = []
    for t in d["train_ranges"]:
        a, b = rng(t["levels"])
        if a > CAP: continue
        train.append({"a": a, "b": min(b, CAP), "levels": f"{a} to {min(b, CAP)}",
                      "maps": [{"map": m["map"], "slug": W.slug(m["map"]), "monsters": m["monsters"], "mm": (maps.get(m["map"]) or {}).get("id")} for m in t["maps"]]})

    def npc(n):
        return sorted({(s[0], s[1], s[2]) for s in (guide.get(n) or {}).get("s", []) if s[2]}, key=lambda s: (s[1] != "Kerning City", s[2], s[0]))
    subi, wolbi = npc("Subi Throwing Stars"), npc("Wolbi Throwing Stars")
    ammo = ("Lucky Seven throws 2 stars a cast. Buy them from an NPC in Kerning City: "
            + (f"Subi for {subi[0][2]:,} a set at {E(subi[0][0])}" if subi else "")
            + (f", or Wolbi for {wolbi[0][2]:,} a set at {E(wolbi[0][0])} (+2 attack)" if wolbi else "")
            + '. Anything better is a luxury, not part of the build. <a href="/items/stars/">Every star and its price</a>') if subi else ""
    arrows = npc("Arrows for Bows")
    arrows = sorted(arrows, key=lambda x: (x[1] != "Henesys", x[2], x[0]))
    ammo_bow = (f"Bows shoot Arrows for Bows. {E(arrows[0][0])} in {E(arrows[0][1])} sells them for {arrows[0][2]:,} each. "
                '<a href="/items/stars/">Every arrow and its price</a>') if arrows else ""

    data = {"cap": CAP, "reset": (d.get("reset") or {}).get("level"), "start": d.get("switch") or 30, "stats": stats, "sp": spd, "spLevels": sp_lv, "first": first, "max": {n: smax.get(n, 20) for n in first},
            "book": {b: list(dict.fromkeys([s["skill"] for s in v] + (list(d["reset"]["to"]) if d.get("reset") and d["reset"]["book"] == b else []))) for b, v in books.items()}, "sid": {n: ({x["skill"]: x["id"] for x in d["skill_order"] if x.get("id")}.get(n) or sid.get(n)) for n in first if n in sid},
            "gear": gear, "train": train, "ammo": ammo, "ammoBow": ammo_bow}

    def t_(head, rws): return '<div class="tw"><table class="t"><tr>' + "".join(f"<th>{x}</th>" for x in head) + "</tr>" + "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rws) + "</table></div>"
    def need_h(g): return '<div class="gneed">' + "".join(f"<span>{'<em>' + E(k) + '</em>' if k else ''}{E(v)}</span>" for k, v in g["needs"]) + "</div>"
    def ways_h(g):
        parts = []
        for w in g["ways"]:
            label = {"npc": "NPC", "drop": "Drop", "craft": "Craft", "quest": "Quest"}[w["k"]]
            txt = f'{label}: {E(w["t"])}' + (f', {E(w["s"])}' if w.get("s") else "") + (f' · {w["p"]:,}' if w.get("p") else "")
            parts.append(f'<a href="{w["u"]}">{txt}</a>' if w.get("u") else txt)
        if g["fm"]:
            fmx = f'Free Market · <span data-fmi="{E(g["item"])}"><b class="mz">{E(g["fm"])}</b></span>'
            parts.insert(len([w for w in g["ways"] if w["k"] == "npc"]), f'<a href="/item/{g["slug"]}/">{fmx}</a>' if g["link"] else fmx)
        return "<br>".join(parts) or "not sold by NPCs, not seen on the FM yet"
    cmp = []
    for c in d["compare"]:
        nm = c["build"].replace(" (this guide)", "")
        this = "(this guide)" in c["build"]
        key = next((k for k in GUIDES if nm.lower() == k.lower()), None)
        url = f"/builds/{GUIDES[key]}/" if key and GUIDES[key] != name else ""
        inner = f'<b>{E(nm)}</b><small>{E(c.get("main_attack") or c["best_at"])}</small>' + ('<div class="soon">You are here</div>' if this else '<div class="go">Open the guide →</div>' if url else '<div class="soon">Guide coming</div>')
        cmp.append(f'<a href="{url}">{inner}</a>' if url else f'<div class="c">{inner}</div>')
    allh = (
        '<div class="win"><h2>Weapons</h2><div class="in">' + t_(["Level", "Weapon", "Needs", "Attack", "How to get it"], [[E(g["level"]), f'<img src="/i/{g["id"]}.png" alt="" width="28" height="28" style="vertical-align:middle"> ' + (f'<a href="/item/{g["slug"]}/">{E(g["item"])}</a>' if g["link"] else E(g["item"])) + f'<br><small>{E(g["slot"])}</small>', need_h(g), E(g["attack"]), ways_h(g)] for g in gear]) + "</div></div>"
        + '<div class="win"><h2>Job advancement</h2><div class="in">' + t_(["Level", "Job", "Where", "Needs", "You get"], [[E(a["level"]), f'<b>{E(a["job"])}</b>', E(a["where"]), E(a["needs"]), E(a["gets"])] for a in d["advancement"] if str(a["level"]).isdigit()]) + "</div></div>"
        + '<div class="win"><h2>Resets</h2><div class="in">' + t_(["Item", "When", "Worth it", "Why"], [[f'<b>{E(r["what"])}</b>', E(r["when"]), f'<b>{E(r["worth_it"])}</b>', E(r["why"])] for r in d["resets"]]) + "</div></div>"
        + '<div class="win"><h2>Where to train</h2><div class="in">' + t_(["Levels", "Maps"], [[E(t["levels"]), "<br>".join(f'<a href="/map/{m["slug"]}/">{E(m["map"])}</a> <small>{E(", ".join(m["monsters"]))}</small>' for m in t["maps"])] for t in train]) + "</div></div>")
    third = next((a for a in d["advancement"] if not str(a["level"]).isdigit()), None)

    body = (f'<style>{CSS}</style><div class="gw"><div class="gw-top"><div><h1>{E(h["build"])}</h1><p>{md(h["pitch"])}</p></div>'
            f'<div class="gw-ctl"><label class="gw-lv">Level <b id="lvn">Lv {d.get("switch") or 30}</b><input id="lv" type="range" min="1" max="{CAP}" value="{d.get("switch") or 30}" aria-label="Character level"></label>'
            '<button type="button" class="gbtn" id="fin">Finished build</button><button type="button" class="gbtn alt" id="allb">See the whole guide</button></div></div>'
            '<div class="gw-grid"><div class="win"><h2>Stats</h2><div class="in" id="stw"></div></div><div class="win skw"><h2>Skills</h2><div class="tabsg" id="skt"></div><div class="in" id="skw"></div></div>'
            '<div class="win trw"><h2>Where to train</h2><div class="in"><div class="mapc" id="mpw"></div></div></div>'
            '<div class="win"><h2>Weapon</h2><div class="in" id="eqw"></div></div></div>'
            '<div class="gw-two"><div class="win"><h2>Stats by level</h2><div class="in"><div class="boxbar">' + "".join(f'<button type="button" data-jump="{x}">Lv {x}</button>' for x in sorted({1, 10, 30, d.get("switch") or 30, 50, CAP})) +
            '<label title="Hides the levels where every point just goes into your main stat"><input type="checkbox" id="chg"> Key levels only</label></div><div class="gbox" id="stb"></div></div></div>'
            '<div class="win"><h2>Skill points by level</h2><div class="in"><div class="gbox" id="spb"></div></div></div></div>'
            '<div class="win"><h2>Other ways to build it</h2><div class="in"><div class="cmp">' + "".join(cmp) + "</div></div></div>"
            f'<div class="gw-low"><div class="win"><h2>Why this way</h2><div class="in"><ol>{"".join("<li>" + md(x) + "</li>" for x in d["why"])}</ol></div></div>'
            f'<div class="win"><h2>Common mistakes</h2><div class="in"><ol>{"".join("<li>" + md(x) + "</li>" for x in d["mistakes"])}</ol></div></div></div>'
            + (f'<div class="win"><h2>3rd job at 70</h2><div class="in third"><span class="badge">Not out yet</span><div><b>{E(third["job"])}</b><div class="wtip">This guide stops at 70. It gets extended when Nexon releases 3rd job in Classic World.</div></div></div></div>' if third else "")
            + f'<details class="all" id="all"><summary></summary>{allh}</details></div>'
            f'<script>const D={json.dumps(data).replace("</", "<\\/")};D.icon=id=>"/i/"+id+".png";D.skimg=id=>"/sk/"+id+".png";D.mm=id=>"{LIVE}minimap/"+id+".png";{JS}</script>'
            '<script src="/assets/fmprice.js?v=2" defer></script>')
    s = d["search"]
    text = W.page(s["title"], s["description"], d["slug"], [("Build guides", "/builds/"), (h["build"].split(":")[0], d["slug"])], body)
    text = text.replace('<a href="/training/">Training guides</a><a href="/maps/" aria-current="page">Maps</a>', '<a href="/training/" aria-current="page">Training guides</a><a href="/maps/">Maps</a>')
    text = text.replace('<div class="card">', '<div class="card wide">', 1)   # use the full width on desktop
    W.write(ROOT, d["slug"], text)
    return d["slug"], data


if __name__ == "__main__":
    for n in sys.argv[1:] or ["sindit"]:
        p, data = build(n)
        print("wrote", p, "| spare SP at 70:", data["sp"][CAP]["spare"], "| level 1:", data["stats"][0]["t"], "| skills with icons:", len(data["sid"]), "of", len(data["first"]))
