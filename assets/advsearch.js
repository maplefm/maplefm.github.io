/* Club FM: search by stats. Loaded by board.js the first time a search names a stat ("work gloves 8 att") or "Search by
   stats" is opened, so the board's first load never carries it.
   Every number is the total the item shows. Only copies whose popup was read well take part (the same check the price
   ladder uses), troll prices are set aside, and an estimate is always labeled as one. */
(function () {
  "use strict";
  var B = null;                     // the board's helpers (board.js FMS)
  var $ = function (id) { return document.getElementById(id); };
  var OPEN = false, TYPED = "", LAST = "", RUN_T = null;
  // the filters set in the panel. Stats typed in the box ("wg 8 att") count too; once a stat is set in the panel, every
  // stat lives in the panel (F.st) and the box keeps just the item, so the two never disagree or pile up
  var F0 = function () { return { sub: "", cls: 0, lvlo: "", lvhi: "", clean: false, slots: "", sort: "price", lo: "", hi: "", older: false, st: {} }; };
  var F = F0(), COUNT = null, MULTI = false;
  var ORDER = ["ATT", "MATT", "STR", "DEX", "INT", "LUK", "CRIT", "CRITDMG", "ACC", "AVOID", "SPEED", "JUMP", "HP", "MP", "WDEF", "MDEF"];
  var WORD = { ATT: "att", MATT: "matt", STR: "str", DEX: "dex", INT: "int", LUK: "luk", CRIT: "crit", CRITDMG: "crit dmg", ACC: "acc", AVOID: "avoid", SPEED: "speed", JUMP: "jump", HP: "hp", MP: "mp", WDEF: "wdef", MDEF: "mdef" };
  var LABEL = { ATT: "ATT", MATT: "MATT", STR: "STR", DEX: "DEX", INT: "INT", LUK: "LUK", CRIT: "Crit rate", CRITDMG: "Crit dmg", ACC: "ACC", AVOID: "Avoid", SPEED: "Speed", JUMP: "Jump", HP: "HP", MP: "MP", WDEF: "W.DEF", MDEF: "M.DEF" };
  var CLS = [[0, "Any class"], [1, "Warrior"], [2, "Magician"], [4, "Bowman"], [8, "Thief"]];

  function css() {
    if ($("advcss")) return;
    var st = document.createElement("style"); st.id = "advcss";
    st.textContent = [
      ".advbox{margin:8px 0 0;border:1px solid var(--line);border-radius:16px;background:var(--panel);padding:12px 14px;box-shadow:0 6px 18px rgba(30,20,60,.06)}",
      ".advbox .ax-ar{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin:0 0 10px}",
      ".advbox .ax-ar:last-child{margin-bottom:0}",
      ".advbox .ax-al{font:800 .7rem var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);min-width:58px}",
      ".advbox select,.advbox input[type=number]{font:700 .82rem var(--body);color:var(--ink);background:var(--panel2);border:1px solid var(--line2);border-radius:10px;padding:6px 8px;min-height:36px}",
      ".advbox input[type=number]{width:74px}",
      ".advbox .ax-lv input{width:76px}",
      ".advbox .ax-hint{font:600 .76rem var(--body);color:var(--muted)}",
      ".advbox .ax-stc{display:inline-flex;align-items:center;border:1px solid var(--line2);border-radius:12px;background:var(--panel2);overflow:hidden;min-height:38px}",
      ".advbox .ax-stc.on{border-color:var(--accent);background:var(--accent-soft)}",
      ".advbox .ax-stc b{font:800 .78rem var(--body);padding:0 8px 0 10px;white-space:nowrap}",
      ".advbox .ax-stc input[type=number]{width:64px;min-height:30px;margin:4px 0;padding:4px 6px;text-align:center;font:800 .9rem var(--body)}",
      ".advbox .ax-stc .ax-ge{border:0;border-left:1px solid var(--line2);background:transparent;font:800 .72rem var(--body);color:var(--muted);padding:0 10px;min-height:38px;margin-left:6px;cursor:pointer;white-space:nowrap}",
      ".advbox .ax-stc .ax-ge[aria-pressed=true]{color:var(--accent-ink,var(--ink));background:var(--accent-soft)}",
      ".advbox .ax-stc .ax-ge:disabled{opacity:.45;cursor:default}",
      ".advbox .ax-full{flex:1 0 100%;order:-1}",
      ".advbox .ax-show{display:block;width:100%;margin:12px 0 0;border:0;border-radius:12px;padding:12px;font:800 .95rem var(--body);color:#fff;background:var(--accent,#6d3fd1);cursor:pointer;position:sticky;bottom:10px;box-shadow:0 6px 18px rgba(60,30,120,.25)}",
      ".sres h3 .ax-edit{margin-left:auto;border:1px solid var(--line2);background:var(--panel2);border-radius:999px;padding:4px 12px;font:800 .76rem var(--body);color:var(--accent-ink,var(--ink));cursor:pointer}",
      ".hsearch.ax-open{position:static!important;top:auto!important}",
      ".advbox .ax-show:disabled{background:var(--panel2);color:var(--muted);box-shadow:none;cursor:default}",
      ".advbox .ax-tg{text-transform:none;letter-spacing:normal;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line2);border-radius:999px;padding:6px 12px;background:var(--panel2);font:700 .8rem var(--body);cursor:pointer;min-height:36px}",
      ".advbox .ax-tg[aria-pressed=true]{border-color:var(--accent);background:var(--accent-soft);color:var(--accent-ink,var(--ink))}",
      ".advbox .ax-clr{margin-left:auto;border:0;background:none;color:var(--accent-ink,var(--ink));font:800 .8rem var(--body);cursor:pointer;text-decoration:underline}",
      ".sres{margin:10px 0 0;border:1px solid var(--line);border-radius:16px;background:var(--panel);padding:12px 14px}",
      ".sres h3{font:800 1rem var(--display);margin:0 0 2px;display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}",
      ".sres h3 small{font:700 .78rem var(--body);color:var(--muted)}",
      ".sres .ax-sum{font:600 .82rem var(--body);color:var(--muted);margin:0 0 8px}",
      ".sres .ax-sum b{color:var(--ink)}",
      ".sres .ax-near{border-left:3px solid var(--gold,#f2b53a);background:var(--gold-soft,#fff6dd);border-radius:8px;padding:8px 10px;margin:6px 0 10px;font:700 .84rem var(--body)}",
      ".sres .ax-near .ax-nx{display:block;margin-top:4px;font-weight:600;color:var(--muted)}",
      ".sres .ax-grp{font:800 .72rem var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:10px 0 4px}",
      ".sres ol{list-style:none;margin:0;padding:0}",
      ".sres li{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:4px 10px;align-items:center;padding:8px 6px;border-top:1px solid var(--line);cursor:pointer;border-radius:10px}",
      ".sres li:hover,.sres li:focus{background:var(--accent-soft);outline:none}",
      ".sres li .ico,.sres li img{width:28px;height:28px}",
      ".sres .ax-nm{min-width:0;display:block}",
      ".advbox .ax-stc output.none{font:700 .74rem var(--body);color:var(--muted);min-width:30px}",
      ".sres .ax-nm .ax-it{font:800 .86rem var(--body);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".sres .ax-sts{display:flex;flex-wrap:wrap;gap:4px;margin:2px 0}",
      ".sres .ax-st{font:800 .74rem var(--body);background:var(--panel2);border:1px solid var(--line);border-radius:7px;padding:1px 6px;white-space:nowrap}",
      ".sres .ax-st.ax-hit{border-color:var(--accent);background:var(--accent-soft)}",
      ".sres .ax-st em{font-style:normal;color:var(--up);margin-left:4px}",
      ".sres .ax-st em.ax-dn{color:var(--down)}",
      ".sres .ax-wh{font:600 .74rem var(--body);color:var(--muted);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".sres .ax-pr{text-align:right;white-space:nowrap}",
      ".sres .ax-pr .num{font:800 .95rem var(--body)}",
      ".sres .ax-pr small{display:block;font:700 .72rem var(--body);color:var(--muted)}",
      ".sres .ax-pr small.ax-lo{color:var(--up)}.sres .ax-pr small.ax-hi{color:var(--down)}",
      ".sres .ax-ft{font:600 .76rem var(--body);color:var(--muted);margin:8px 0 0}",
      ".sres .ax-more{display:block;margin:8px auto 0;border:1px solid var(--line2);background:var(--panel2);border-radius:999px;padding:6px 14px;font:800 .8rem var(--body);cursor:pointer}",
      ".sres .ax-est{display:inline-block;font:800 .7rem var(--body);background:var(--flat-soft);border-radius:6px;padding:1px 6px;margin-left:4px;color:var(--muted)}",
      "@media (max-width:600px){.advbox{padding:10px}.advbox .ax-al{min-width:100%}.sres{padding:10px}.sres li{grid-template-columns:26px minmax(0,1fr) auto;padding:8px 2px}}"
    ].join("\n");
    document.head.appendChild(st);
  }

  // ---------- what the search asks for
  function parse(text) {
    var sq = B.statQuery(text || ""), f = { stats: [], clean: F.clean, slots: F.slots === "" ? null : +F.slots, older: F.older, lo: +F.lo || 0, hi: +F.hi || 0, rest: String(text || "").trim() };
    if (sq) { f.stats = sq.stats; f.clean = f.clean || sq.clean; if (sq.slots != null) f.slots = sq.slots; f.rest = sq.rest; }
    Object.keys(F.st).forEach(function (k) { f.stats = f.stats.filter(function (x) { return x.k !== k; }); f.stats.push({ k: k, v: F.st[k].v, ge: !!F.st[k].ge }); });
    return f;
  }
  // the items the search covers: one named item, or every item of a type (the panel's type, or a type word typed)
  // the quick first board (from the browser's last visit or the server's price summary) has prices but no listings yet
  function ready() { var D = B.D(); return !!(D && D.list && !D.preview && D.list.some(function (i) { return i.buy && i.buy.length; })); }
  var WAIT_T = null;
  function itemsFor(f) {
    var D = B.D(); if (!ready()) { clearTimeout(WAIT_T); WAIT_T = setTimeout(function () { run(); }, 1500); return { list: [], why: "loading" }; }
    var named = null;
    // a type typed in the box ("claw", "earrings", "gloves") picks that type
    var restN = f.rest;
    if (restN) { var tw = restN.toLowerCase().replace(/s$/, ""), ty = typesWithListings().filter(function (k) { return k.toLowerCase().replace(/s$/, "") === tw; })[0]; if (ty) { F.sub = ty; restN = ""; } }
    if (restN) {
      var hits = B.searchItems(restN, 3);
      if (hits.length && hits[0].score >= 450) named = hits[0].n;
    }
    if (named) {
      var it = D.byName[named];
      return { list: it && it.equip ? [it] : [], name: named, notEquip: !!(it && !it.equip) || (!it && !/^Equip:/.test(B.kindOf(named))), unpriced: !it };
    }
    if (!F.sub) return { list: [], why: restN ? "noitem" : "pick" };
    var lo = F.lvlo === "" ? 0 : +F.lvlo, hi = F.lvhi === "" ? 999 : +F.lvhi;
    var list = D.list.filter(function (i) {
      if (!i.equip || B.subKind(i.item) !== F.sub) return false;
      var r = B.dbRow(i.item), lv = r ? r[2] || 0 : 0, job = r ? r[3] || 0 : 0;
      if (lv < lo || lv > hi) return false;
      if (F.cls && job && !(job & F.cls)) return false;
      return true;
    });
    return { list: list, sub: F.sub };
  }

  // ---------- results
  function statChips(i, l, want) {
    var n = i.item, keys = want.map(function (w) { return w.k; }), box = B.el("span", "ax-sts");
    var b = B.fullBase(n).s;
    B.statWords(n, l, keys).forEach(function (s) {
      var c = B.el("span", "ax-st" + (keys.indexOf(s.k) >= 0 ? " hit" : ""), (s.t == null ? "?" : s.t) + " " + (LABEL[s.k] || s.k));
      if (s.t != null && s.d && b[s.k] != null) c.appendChild(B.el("em", s.d < 0 ? "ax-dn" : "", (s.d > 0 ? "+" : "") + s.d));
      box.appendChild(c);
    });
    var x = l.x || {}, bs = b.SLOTS;
    if (x.SLOTS != null && bs) box.appendChild(B.el("span", "ax-st", x.SLOTS + "/" + bs + " slots"));
    if (B.slotsUsed(n, l) === 0) box.appendChild(B.el("span", "ax-st", "clean"));
    return box;
  }
  function row(i, l, want, multi, m) {
    var li = B.el("li"); li.tabIndex = 0; li.setAttribute("role", "button");
    li.appendChild(B.iconBox(i.item));
    var nm = B.el("span", "ax-nm");
    if (multi) nm.appendChild(B.el("span", "ax-it", B.showName(i.item)));
    nm.appendChild(statChips(i, l, want));
    var mt = m && m.meta.get(l) || {};
    var wh = B.el("span", "ax-wh"), seller = l.ns || l.nu || mt.nameOdd ? "seller name not read clearly" : l.s;
    wh.textContent = seller + " · " + B.where(l) + " · " + B.ago(l.t);
    nm.appendChild(wh); li.appendChild(nm);
    var pr = B.el("span", "ax-pr"); pr.appendChild(B.money(l.u));
    var vs = B.vsUsual(i, l, mt.g || null);
    if (vs != null) pr.appendChild(B.el("small", vs <= -10 ? "ax-lo" : vs >= 10 ? "ax-hi" : "", vs === 0 ? "at usual" : (vs > 0 ? "+" : "") + vs + "% vs usual"));
    li.appendChild(pr);
    var go = function () { B.ev("#adv:open-copy"); B.openCopy(i.item, l, mt.g || null); };
    li.addEventListener("click", go);
    li.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    return li;
  }
  function wantText(want, f) {
    var w = want.map(function (s) { return s.v + (s.ge ? "+" : "") + " " + (LABEL[s.k] || s.k); });
    if (f.clean) w.unshift("clean");
    if (f.slots != null) w.push(f.slots + "+ slots left");
    return w.join(", ");
  }
  function sortList(rows, f) {
    var k = F.sort;
    rows.sort(function (a, b) {
      if (k === "new") return b.l.t - a.l.t;
      if (k === "sold") return ((b.i.salesN || 0) - (a.i.salesN || 0)) || a.l.u - b.l.u;
      if (k === "close") return a.d - b.d || a.l.u - b.l.u;
      return a.l.u - b.l.u || b.l.t - a.l.t;
    });
    return rows;
  }
  var SHOWN = 25;
  function render(text) {
    var box = $("sres"); if (!box) return;
    var f = parse(text), wantAny = f.stats.length || f.clean || f.slots != null || F.lo || F.hi;
    var scope = itemsFor(f);
    COUNT = null; showBtn();
    if (!wantAny && !(OPEN && F.sub)) { box.hidden = true; box.textContent = ""; return; }
    box.hidden = false; box.textContent = "";
    var h = B.el("h3");
    if (scope.why === "loading") { box.appendChild(B.el("p", "ax-sum", "Loading the latest listings…")); return; }
    if (scope.why === "pick") { box.appendChild(B.el("p", "ax-sum", "Name an item in the search box, or pick a type in Search by stats.")); return; }
    if (scope.why === "noitem") { box.appendChild(B.el("p", "ax-sum", "No item matches “" + f.rest + "”. Check the name, or pick a type in Search by stats.")); B.ev("#adv:none"); return; }
    if (scope.notEquip) { box.hidden = true; return; }
    var title = scope.name ? B.showName(scope.name) : "Every " + scope.sub.toLowerCase();
    h.appendChild(document.createTextNode(title));
    var wt = wantText(f.stats.map(function (s) { return { k: scope.list[0] ? B.critLine(scope.list[0].item, s.k) : s.k, v: s.v, ge: s.ge }; }), f);
    if (wt) h.appendChild(B.el("small", null, wt));
    box.appendChild(h);
    if (OPEN) { var up = B.el("button", "ax-edit", "Change filters"); up.type = "button"; up.addEventListener("click", function () { var a = $("advbox"); if (a) a.scrollIntoView({ block: "start", behavior: "smooth" }); }); h.appendChild(up); }
    if (scope.unpriced || !scope.list.length) {
      box.appendChild(B.el("p", "ax-sum", scope.name ? "No copies of " + B.showName(scope.name) + " seen on the Free Market yet, so no price for any roll." : "No " + scope.sub.toLowerCase() + " with listings in that range."));
      B.ev("#adv:none"); return;
    }
    var rows = [], odd = 0, unsure = 0, M = null;
    scope.list.forEach(function (i) {
      var m = B.statMatch(i, f); odd += m.odd; unsure += m.unsure; if (scope.list.length === 1) M = m;
      m.exact.forEach(function (l) { rows.push({ i: i, l: l, m: m, d: 0 }); });
    });
    sortList(rows, f); COUNT = rows.length; MULTI = scope.list.length > 1; showBtn();
    var multi = scope.list.length > 1, want = M ? M.want : f.stats;
    // the short summary: how many copies, from what price
    var sum = B.el("p", "ax-sum");
    if (rows.length) {
      sum.appendChild(B.el("b", null, rows.length + (rows.length === 1 ? " copy" : " copies")));
      sum.appendChild(document.createTextNode(" listed " + (f.older ? "lately" : "in the last 24 hours") + ", from "));
      sum.appendChild(B.money(Math.min.apply(null, rows.map(function (r) { return r.l.u; }))));
    } else sum.appendChild(B.el("b", null, "None listed " + (f.older ? "lately" : "in the last 24 hours") + "."));
    box.appendChild(sum);
    // nothing exact on one item: the closest totals either side, the last sale of that exact roll, the ladder's estimate
    if (!rows.length && M) {
      var nr = B.el("div", "ax-near");
      if (M.near.length) {
        nr.appendChild(document.createTextNode("Closest: "));
        M.near.forEach(function (x, k) {
          if (k) nr.appendChild(document.createTextNode(" · "));
          var a = B.el("a", null, x.t + " " + (LABEL[x.k] || x.k) + " at "); a.href = "#"; a.appendChild(B.money(x.l.u));
          a.addEventListener("click", function (e) { e.preventDefault(); var mt0 = M.meta.get(x.l) || {}; B.openCopy(M.item.item, x.l, mt0.g || null); });
          nr.appendChild(a);
        });
      } else nr.appendChild(document.createTextNode("No close rolls listed right now either."));
      var nx = B.el("span", "ax-nx");
      if (M.sold) { nx.appendChild(document.createTextNode("Last sold at this roll: ")); nx.appendChild(B.money(M.sold.u)); nx.appendChild(document.createTextNode(", " + B.ago(M.sold.t) + ". ")); }
      if (M.est) {
        nx.appendChild(document.createTextNode("Price ladder for " + M.est.name + ": "));
        if (B.short(M.est.lo) !== B.short(M.est.hi)) { nx.appendChild(B.money(M.est.lo)); nx.appendChild(document.createTextNode(" to ")); nx.appendChild(B.money(M.est.hi)); } else nx.appendChild(B.money(M.est.lo));
        nx.appendChild(B.el("span", "ax-est", M.est.basis === "sold" ? "estimate from sales" : "estimate from asking prices"));
      }
      if (!M.sold && !M.est) nx.appendChild(document.createTextNode("No sale of this exact roll caught yet."));
      nr.appendChild(nx); box.appendChild(nr);
      B.ev("#adv:none");
    }
    // a clean search on an item with a crit line: 1 crit and 2 crit copies are different markets, shown apart
    var critK = M && !want.some(function (w) { return /^CRIT/.test(w.k); }) && f.clean ? (function () { var b = B.fullBase(M.item.item).s; return b.CRIT ? "CRIT" : b.CRITDMG ? "CRITDMG" : ""; })() : "";
    // a crit asked for without "clean": a natural crit roll on a clean copy and crit from scrolls are different markets
    var bySlots = M && !f.clean && want.some(function (w) { return /^CRIT/.test(w.k); });
    var list = rows.slice(0, SHOWN);
    if (bySlots && rows.length) {
      [["Clean, natural roll", function (r) { return B.slotsUsed(r.i.item, r.l) === 0; }], ["Scrolls used", function (r) { return B.slotsUsed(r.i.item, r.l) !== 0; }]].forEach(function (gp) {
        var gl = rows.filter(gp[1]); if (!gl.length) return;
        box.appendChild(B.el("p", "ax-grp", gp[0] + " · " + gl.length));
        var ol0 = B.el("ol"); gl.slice(0, SHOWN).forEach(function (r) { ol0.appendChild(row(r.i, r.l, want, multi, r.m)); }); box.appendChild(ol0);
      });
    } else if (critK && rows.length) {
      var groups = {};
      rows.forEach(function (r) { var t = B.statTotal(r.i.item, r.l, critK); (groups[t == null ? "?" : t] || (groups[t == null ? "?" : t] = [])).push(r); });
      Object.keys(groups).sort().forEach(function (t) {
        box.appendChild(B.el("p", "ax-grp", "Clean, " + t + " " + LABEL[critK].toLowerCase() + " · " + groups[t].length));
        var ol = B.el("ol"); groups[t].slice(0, SHOWN).forEach(function (r) { ol.appendChild(row(r.i, r.l, want, multi, r.m)); }); box.appendChild(ol);
      });
    } else if (rows.length) {
      var ol = B.el("ol"); list.forEach(function (r) { ol.appendChild(row(r.i, r.l, want, multi, r.m)); }); box.appendChild(ol);
      if (rows.length > SHOWN) { var mb = B.el("button", "ax-more", "Show " + Math.min(25, rows.length - SHOWN) + " more"); mb.type = "button"; mb.addEventListener("click", function () { SHOWN += 25; render(TYPED); }); box.appendChild(mb); }
    }
    var ft = [];
    if (unsure) ft.push(unsure + (unsure === 1 ? " listing" : " listings") + " left out: stats not read, or not read clearly");
    if (odd) ft.push(odd + " left out: price far from that roll's usual");
    ft.push("Stats are the totals the item shows. Tap a copy for its card.");
    box.appendChild(B.el("p", "ax-ft", ft.join(" · ")));
  }

  // ---------- the panel
  function typesWithListings() {
    var D = B.D(), seen = {}; (D && D.list || []).forEach(function (i) { if (i.equip) { var k = B.subKind(i.item); if (k) seen[k] = (seen[k] || 0) + 1; } });
    return Object.keys(seen).sort();
  }
  // the stats an equip type can carry: what its items come with, what its scrolls add, and crit where the item has a line
  function statsFor(name, sub) {
    var o = {}, D = B.D();
    var add = function (n) { var b = B.fullBase(n).s; Object.keys(b).forEach(function (k) { if (ORDER.indexOf(k) >= 0 && b[k] > 0) o[k] = 1; }); };
    if (name) { add(name); sub = B.subKind(name); }
    else if (sub && D) D.list.forEach(function (i) { if (i.equip && B.subKind(i.item) === sub) add(i.item); });
    Object.keys(B.scrollable(sub || "")).forEach(function (k) { o[k] = 1; });
    return ORDER.filter(function (k) { return o[k]; });
  }
  function setText(f, stats) {
    var parts = [f.rest];
    if (f.clean) parts.push("clean");
    stats.forEach(function (s) { parts.push(s.v + (s.ge ? "+" : "") + " " + WORD[s.k]); });
    var v = parts.filter(Boolean).join(" ");
    $("q").value = v; TYPED = v; F.clean = false;
  }
  function panel() {
    var box = $("advbox"); box.textContent = "";
    var f = parse($("q").value), scope = itemsFor(f), name = scope.name && !scope.notEquip ? scope.name : "";
    var r1 = B.el("div", "ax-ar");
    r1.appendChild(B.el("span", "ax-al", "Item"));
    if (name) { r1.appendChild(B.el("b", null, B.showName(name))); r1.appendChild(B.el("span", "ax-hint", "from the search box")); }
    else {
      var sel = B.el("select"); sel.setAttribute("aria-label", "Equip type");
      var o0 = B.el("option", null, "Pick a type"); o0.value = ""; sel.appendChild(o0);
      typesWithListings().forEach(function (k) { var o = B.el("option", null, k); o.value = k; if (k === F.sub) o.selected = true; sel.appendChild(o); });
      sel.addEventListener("change", function () { F.sub = sel.value; B.ev("#adv:type"); panel(); run(); });
      r1.appendChild(sel);
      var cs = B.el("select"); cs.setAttribute("aria-label", "Class");
      CLS.forEach(function (c) { var o = B.el("option", null, c[1]); o.value = c[0]; if (+c[0] === F.cls) o.selected = true; cs.appendChild(o); });
      cs.addEventListener("change", function () { F.cls = +cs.value; run(); });
      r1.appendChild(cs);
      var lv = B.el("span", "ax-lv"); lv.appendChild(B.el("span", "ax-hint", "Level "));
      [["lvlo", "from"], ["lvhi", "to"]].forEach(function (p, k) { var inp = B.el("input"); inp.type = "number"; inp.min = 0; inp.max = 200; inp.inputMode = "numeric"; inp.placeholder = p[1]; inp.value = F[p[0]]; inp.setAttribute("aria-label", "Level " + p[1]); inp.addEventListener("input", function () { F[p[0]] = inp.value; run(); }); if (k) lv.appendChild(document.createTextNode(" – ")); lv.appendChild(inp); });
      r1.appendChild(lv);
    }
    box.appendChild(r1);
    // stat chips: tap the minus or plus to set a total; the number goes into the search text
    var keys = statsFor(name, name ? "" : F.sub);
    var r2 = B.el("div", "ax-ar"); r2.appendChild(B.el("span", "ax-al", "Stats"));
    if (!keys.length) r2.appendChild(B.el("span", "ax-hint", name || F.sub ? "No stats to pick on this item." : "Name an item or pick a type first."));
    if (keys.length) r2.appendChild(B.el("span", "ax-hint ax-full", "Type the total the item shows, like 8. Leave empty for any."));
    var cur = {}; f.stats.forEach(function (s0) { cur[name ? B.critLine(name, s0.k) : s0.k] = s0; });
    // every stat set so far moves into the panel and the box keeps only the item
    var adopt = function () {
      var st = {}; f.stats.forEach(function (s0) { var k0 = name ? B.critLine(name, s0.k) : s0.k; st[k0] = { v: s0.v, ge: !!s0.ge }; });
      if (f.clean) F.clean = true;
      F.st = st; var t = f.rest || ""; if ($("q").value !== t) { $("q").value = t; TYPED = t; }
    };
    keys.forEach(function (k) {
      var s0 = cur[k], c = B.el("label", "ax-stc" + (s0 ? " on" : ""));
      c.appendChild(B.el("b", null, LABEL[k] || k));
      var inp = B.el("input"); inp.type = "number"; inp.min = 0; inp.max = /^(HP|MP)$/.test(k) ? 400 : 250; inp.inputMode = "numeric"; inp.placeholder = "any";
      inp.value = s0 ? String(s0.v) : ""; inp.setAttribute("aria-label", (LABEL[k] || k) + " total");
      var ge = B.el("button", "ax-ge", "or more"); ge.type = "button"; ge.setAttribute("aria-pressed", s0 && s0.ge ? "true" : "false"); ge.disabled = !s0;
      ge.title = "Off: exactly this total. On: this total or more.";
      var set = function () {
        adopt(); var v = inp.value.trim();
        if (v === "" || !(+v >= 0)) delete F.st[k]; else F.st[k] = { v: Math.min(+v, +inp.max), ge: ge.getAttribute("aria-pressed") === "true" };
        c.classList.toggle("on", !!F.st[k]); ge.disabled = !F.st[k]; B.ev("#adv:stat:" + k); run();
      };
      var t0 = null; inp.addEventListener("input", function () { clearTimeout(t0); t0 = setTimeout(set, 250); });
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); clearTimeout(t0); set(); showResults(); } });
      ge.addEventListener("click", function (e) { e.preventDefault(); ge.setAttribute("aria-pressed", ge.getAttribute("aria-pressed") === "true" ? "false" : "true"); set(); });
      c.appendChild(inp); c.appendChild(ge);
      r2.appendChild(c);
    });
    box.appendChild(r2);
    var r3 = B.el("div", "ax-ar"); r3.appendChild(B.el("span", "ax-al", "Copy"));
    var tg = function (label, on, fn) { var b = B.el("button", "ax-tg", label); b.type = "button"; b.setAttribute("aria-pressed", on ? "true" : "false"); b.addEventListener("click", fn); return b; };
    r3.appendChild(tg("Clean only", f.clean, function () { if (f.clean) { var v = $("q").value.replace(/(^|\s)(clean|unscrolled|stock)(?=\s|$)/i, " ").replace(/\s+/g, " ").trim(); $("q").value = v; TYPED = v; F.clean = false; } else { F.clean = true; } panel(); run(); }));
    var sl = B.el("select"); sl.setAttribute("aria-label", "Slots left");
    [["", "Any slots left"], ["1", "1+ slots left"], ["3", "3+ slots left"], ["5", "5+ slots left"], ["7", "7 slots left"]].forEach(function (p) { var o = B.el("option", null, p[1]); o.value = p[0]; if (String(F.slots) === p[0]) o.selected = true; sl.appendChild(o); });
    sl.addEventListener("change", function () { F.slots = sl.value; run(); });
    r3.appendChild(sl);
    r3.appendChild(tg("Older listings too", F.older, function () { F.older = !F.older; panel(); run(); }));
    box.appendChild(r3);
    var r4 = B.el("div", "ax-ar"); r4.appendChild(B.el("span", "ax-al", "Price"));
    [["lo", "min"], ["hi", "max"]].forEach(function (p, k) { var inp = B.el("input"); inp.type = "number"; inp.min = 0; inp.inputMode = "numeric"; inp.placeholder = p[1] + " mesos"; inp.value = F[p[0]]; inp.setAttribute("aria-label", "Price " + p[1]); inp.style.width = "120px"; inp.addEventListener("input", function () { F[p[0]] = inp.value; run(); }); if (k) r4.appendChild(document.createTextNode("–")); r4.appendChild(inp); });
    var so = B.el("select"); so.setAttribute("aria-label", "Sort");
    [["price", "Cheapest first"], ["new", "Newest first"], ["sold", "Most sold item first"], ["close", "Closest to the stats"]].forEach(function (p) { var o = B.el("option", null, p[1]); o.value = p[0]; if (F.sort === p[0]) o.selected = true; so.appendChild(o); });
    so.addEventListener("change", function () { F.sort = so.value; run(); });
    r4.appendChild(so);
    var clr = B.el("button", "ax-clr", "Clear"); clr.type = "button";
    clr.addEventListener("click", function () { F = F0(); setText({ rest: f.rest, clean: false }, []); panel(); run(); });
    r4.appendChild(clr);
    box.appendChild(r4);
    // the results build below as you go; this button says how many and takes you there
    var go = B.el("button", "ax-show"); go.type = "button"; go.id = "advshow";
    go.addEventListener("click", showResults);
    box.appendChild(go); showBtn();
  }

  // ---------- the URL: a search link opens the same results (and is noindex, never in the sitemap)
  function advParam() {
    var p = [];
    if (F.sub) p.push("t:" + F.sub); if (F.cls) p.push("c:" + F.cls); if (F.lvlo !== "") p.push("l:" + F.lvlo); if (F.lvhi !== "") p.push("h:" + F.lvhi);
    if (F.clean) p.push("clean"); if (F.slots !== "") p.push("s:" + F.slots); if (F.sort !== "price") p.push("o:" + F.sort); if (F.lo) p.push("p:" + F.lo); if (F.hi) p.push("q:" + F.hi); if (F.older) p.push("old");
    Object.keys(F.st).forEach(function (k) { p.push("st:" + k + "." + F.st[k].v + (F.st[k].ge ? ".g" : "")); });
    return p.join(";");
  }
  function syncUrl() {
    try {
      var q = $("q").value.trim(), a = advParam(), sp = new URLSearchParams();
      if (q && (B.statQuery(q) || a)) sp.set("q", q); if (a && (q || F.sub || Object.keys(F.st).length)) sp.set("a", a);
      var qs = sp.toString(), want = location.pathname + (qs ? "?" + qs : "") + location.hash;
      if (want !== location.pathname + location.search + location.hash) history.replaceState(history.state, "", want);
      if (qs && !document.querySelector('meta[name="robots"][content^="noindex"]')) { var m = document.createElement("meta"); m.name = "robots"; m.content = "noindex,follow"; document.head.appendChild(m); }
    } catch (e) {}
  }
  function fromParam(a) {
    String(a || "").split(";").forEach(function (p) {
      var m = /^([a-z]+):(.*)$/.exec(p);
      if (p === "clean") F.clean = true; else if (p === "old") F.older = true;
      else if (m) { var v = m[2].slice(0, 40); if (m[1] === "t") F.sub = v; else if (m[1] === "c") F.cls = +v || 0; else if (m[1] === "l") F.lvlo = v.replace(/\D/g, ""); else if (m[1] === "h") F.lvhi = v.replace(/\D/g, ""); else if (m[1] === "s") F.slots = v.replace(/\D/g, ""); else if (m[1] === "o" && /^(price|new|sold|close)$/.test(v)) F.sort = v; else if (m[1] === "p") F.lo = v.replace(/\D/g, ""); else if (m[1] === "q") F.hi = v.replace(/\D/g, ""); else if (m[1] === "st") { var z = /^([A-Z]+)\.(\d{1,3})(\.g)?$/.exec(v); if (z && ORDER.indexOf(z[1]) >= 0) F.st[z[1]] = { v: +z[2], ge: !!z[3] }; } }
    });
  }

  function showBtn() {
    var b = $("advshow"); if (!b) return;
    b.disabled = COUNT == null;
    b.textContent = COUNT == null ? "Set a stat or pick a type to see copies" : COUNT === 0 ? (MULTI ? "None match: try fewer filters" : "No exact copies: see the closest") : "Show " + COUNT + (COUNT === 1 ? " copy" : " copies");
  }
  function showResults() {
    var r = $("sres"); if (!r || r.hidden) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // the phone keyboard closes
    r.scrollIntoView({ block: "start", behavior: "smooth" }); B.ev("#adv:show");
  }
  // the search box sticks to the top while scrolling; with the panel or results under it, that whole block stuck and
  // the results could never scroll into view on a phone. Open, it scrolls with the page.
  function unstick() { var hs = $("hsearch"), r = $("sres"); if (hs) hs.classList.toggle("ax-open", OPEN || !!(r && !r.hidden)); }
  function run() { clearTimeout(RUN_T); RUN_T = setTimeout(function () { SHOWN = 25; try { render($("q").value.trim()); unstick(); } catch (e) { var b = $("sres"); if (b) { b.hidden = false; b.textContent = "Search by stats hit an error. Try again in a moment."; } } syncUrl(); }, 60); }

  window.FMADV = {
    init: function (fms) { B = fms; css(); },
    // with the panel closed, the box alone says what to find: stats set earlier in the panel don't linger unseen
    // a stat typed in the box wins over the same stat set in the panel
    typed: function (v) {
      TYPED = v;
      if (!OPEN) F.st = {};
      else { var sq = B.statQuery(v || ""); (sq && sq.stats || []).forEach(function (x) { if (/^CRIT/.test(x.k)) { delete F.st.CRIT; delete F.st.CRITDMG; } else delete F.st[x.k]; }); panel(); }
      run();
    },
    toggle: function () {
      OPEN = !OPEN; var box = $("advbox"), bt = $("advbtn");
      box.hidden = !OPEN; bt.setAttribute("aria-expanded", OPEN ? "true" : "false");
      if (OPEN) { B.ev("#adv:open"); panel(); } run();
    },
    fromUrl: function (q, a) {
      if (a) { fromParam(a); OPEN = true; $("advbox").hidden = false; $("advbtn").setAttribute("aria-expanded", "true"); panel(); }
      TYPED = q; run();
      setTimeout(function () { var b = $("sres"); if (b && !b.hidden) b.scrollIntoView({ block: "start", behavior: "smooth" }); }, 400);
    },
    _parse: parse, _render: render
  };
})();
