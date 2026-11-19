// Search the site: monsters, items and drops, quests and maps, from the button at the end of the menu on every page.
// The big purple box on the board stays the price search; this one is green and opens over the page. It reads one
// small index (data/sitesearch.json, built with the pages by tools/sitesearch.py) the first time it opens. Picking a
// result shows a preview: a monster's drops with their sure Free Market price, an item's price and who drops it, a
// quest's needs and rewards, a map's monsters. Prices are the board's daily typical, shown only when the board is sure.
(function () {
  "use strict";
  var IDX = null, LOADING = null, dlg, inp, list, pv, rows = [], act = -1, lastQ = "", sentQ = {};
  var LIVE = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/";
  function el(t, c, txt) { var e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
  function norm(s) { return String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9%]+/g, " ").trim(); }
  function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }
  function short(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e4) return Math.round(n / 1e3) + "K";
    return fmt(n);
  }
  // the same visit counter the board uses: what people look for, never who (automated browsers don't count)
  function ev(p) {
    try {
      if (navigator.webdriver) return;
      var d = JSON.stringify({ p: String(p).slice(0, 120), r: "", q: "" }), u = "https://api.maplefm.gg/hit";
      if (navigator.sendBeacon) navigator.sendBeacon(u, new Blob([d], { type: "text/plain" })); else fetch(u, { method: "POST", body: d, keepalive: true, mode: "no-cors" });
    } catch (e) {}
  }
  function load() {
    if (IDX) return Promise.resolve(IDX);
    if (!LOADING) LOADING = fetch("/data/sitesearch.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) throw new Error("no index");
      var I = { m: {}, i: {}, q: {}, p: {}, all: [] };
      (j.m || []).forEach(function (x) { var r = { t: "m", n: x[0], s: x[1], lv: x[2], hp: x[3], exp: x[4], weak: x[5], where: x[6], drops: x[7] || [], sid: x[8] }; I.m[r.n] = r; I.all.push(r); });
      (j.i || []).forEach(function (x) { var r = { t: "i", n: x[0], s: x[1], id: x[2], kind: x[3], by: x[4] || [], need: x[5] || [], typ: x[6], sales: x[7] }; I.i[r.n] = r; I.all.push(r); });
      (j.q || []).forEach(function (x) { var r = { t: "q", n: x[0], s: x[1], lv: x[2], area: x[3], giver: x[4], needs: x[5], exp: x[6], meso: x[7] }; I.q[r.n] = r; I.all.push(r); });
      (j.p || []).forEach(function (x) { var r = { t: "p", n: x[0], s: x[1], region: x[2], lo: x[3], hi: x[4], mobs: x[5] || [] }; I.p[r.n] = r; I.all.push(r); });
      I.all.forEach(function (r) { r.k = norm(r.n); r.x = r.t === "i" ? norm(r.by.join(" ")) : r.t === "q" ? norm(r.needs) : r.t === "p" ? norm(r.mobs.map(function (m) { return m[0]; }).join(" ")) : ""; });
      I.built = j.built || ""; IDX = I; return I;
    });
    LOADING.catch(function () { LOADING = null; });
    return LOADING;
  }
  // a name match beats a match in what it drops, needs or holds; whole words beat parts of words
  function score(r, q, words) {
    var k = r.k;
    if (k === q) return 100;
    if (k.indexOf(q) === 0) return 80 - Math.min(k.length - q.length, 30) / 3;
    var all = words.every(function (w) { return (" " + k).indexOf(" " + w) >= 0; });
    if (all) return 60 - Math.min(k.length, 40) / 4;
    if (k.indexOf(q) >= 0) return 40;
    if (r.x && words.every(function (w) { return (" " + r.x).indexOf(" " + w) >= 0; })) return 20;
    return 0;
  }
  var GROUPS = [["m", "Monsters", 4], ["i", "Items and drops", 5], ["q", "Quests", 3], ["p", "Maps", 3]];
  var TAG = { m: "Monster", i: "Item", q: "Quest", p: "Map" };
  function href(r) { return r.t === "m" ? "/monster/" + r.s + "/" : r.t === "i" ? "/item/" + r.s + "/" : r.t === "q" ? "/quest/" + r.s + "/" : "/map/" + r.s + "/"; }
  function sub(r) {
    if (r.t === "m") return "Lv " + r.lv + (r.where ? " · " + r.where : "") + (r.drops.length ? " · drops " + r.drops.slice(0, 3).join(", ") : "");
    if (r.t === "i") return [r.kind, r.by.length ? "dropped by " + r.by.slice(0, 2).join(", ") : "", r.typ ? "about " + short(r.typ) + " mesos" : ""].filter(Boolean).join(" · ");
    if (r.t === "q") return "Lv " + r.lv + "+" + (r.area ? " · " + r.area : "") + (r.needs ? " · " + r.needs : "");
    return [r.region, r.lo ? "Lv " + r.lo + (r.hi && r.hi !== r.lo ? " to " + r.hi : "") : "", r.mobs.slice(0, 2).map(function (m) { return m[0]; }).join(", ")].filter(Boolean).join(" · ");
  }
  function icon(r) {
    var b = el("span", "ss-ic"), im;
    if (r.t === "m" && r.sid) { im = el("img"); im.src = LIVE + "sprite/" + r.sid + ".gif"; }
    else if (r.t === "i" && r.id) { im = el("img"); im.src = "/i/" + r.id + ".png"; }
    if (im) { im.alt = ""; im.loading = "lazy"; im.onerror = function () { im.remove(); b.textContent = r.t === "m" ? "👾" : "🎁"; }; b.appendChild(im); }
    else b.textContent = r.t === "q" ? "📜" : r.t === "p" ? "🗺️" : r.t === "m" ? "👾" : "🎁";
    return b;
  }
  function search(q) {
    lastQ = q; if (pv.parentNode === list) list.parentNode.appendChild(pv); list.textContent = ""; rows = []; act = -1;
    var n = norm(q);
    if (!n) { list.appendChild(el("p", "ss-hint", "Type a monster, item, quest or map. Item prices stay in the board's own search.")); preview(null); return; }
    var words = n.split(" "), hits = { m: [], i: [], q: [], p: [] };
    IDX.all.forEach(function (r) { var s = score(r, n, words); if (s) hits[r.t].push([s, r]); });
    GROUPS.forEach(function (g) {
      var h = hits[g[0]].sort(function (a, b) { return b[0] - a[0] || a[1].n.length - b[1].n.length; }).slice(0, g[2]);
      if (!h.length) return;
      list.appendChild(el("div", "ss-h", g[1]));
      h.forEach(function (x) {
        var r = x[1], a = el("a", "ss-row"); a.href = href(r); a.setAttribute("role", "option");
        a.appendChild(icon(r));
        var t = el("span", "ss-t"); t.appendChild(el("b", null, r.n)); t.appendChild(el("small", null, sub(r))); a.appendChild(t);
        a.appendChild(el("span", "ss-tag ss-" + r.t, TAG[r.t]));
        var k = rows.length; a.id = "ss-o" + k; rows.push({ a: a, r: r });
        a.addEventListener("mouseenter", function () { if (matchMedia("(hover:hover)").matches) setAct(k); });
        a.addEventListener("click", function () { ev("#siteopen:" + r.t + ":" + r.n); });
        list.appendChild(a);
      });
    });
    if (!rows.length) { list.appendChild(el("p", "ss-hint", "Nothing on the site matches \"" + q + "\". For an item's price, try the board's search.")); preview(null); return; }
    setAct(0);
    // one count per search people settle on, not per letter typed
    clearTimeout(search.t); search.t = setTimeout(function () { if (lastQ === q && !sentQ[n]) { sentQ[n] = 1; ev("#site:" + n); } }, 1500);
  }
  function setAct(k) {
    if (act >= 0 && rows[act]) { rows[act].a.classList.remove("on"); rows[act].a.removeAttribute("aria-selected"); }
    act = k; if (!rows[k]) return;
    rows[k].a.classList.add("on"); rows[k].a.setAttribute("aria-selected", "true");
    // phones: the preview opens right under the picked result, so it is seen without scrolling past the list
    if (matchMedia("(max-width:760px)").matches) list.insertBefore(pv, rows[k].a.nextSibling); else if (pv.parentNode !== list.parentNode) list.parentNode.appendChild(pv);
    inp.setAttribute("aria-activedescendant", rows[k].a.id);
    preview(rows[k].r);
  }
  function line(name, val, note, link) {
    var d = el("div", "ss-pl"), a = link ? el("a", null, name) : el("span", null, name); if (link) a.href = link; d.appendChild(a);
    var v = el("span"); if (val) v.appendChild(el("b", null, val)); if (note) v.appendChild(el("small", null, " " + note)); d.appendChild(v); return d;
  }
  function priceOf(n) { var i = IDX.i[n]; return i && i.typ ? [short(i.typ), i.sales + " sales"] : ["", "no sure price yet"]; }
  function btn(txt, link, main) { var a = el("a", "ss-btn" + (main ? " main" : ""), txt); a.href = link; return a; }
  function preview(r) {
    pv.textContent = ""; pv.hidden = !r; if (!r) return;
    var head = el("div", "ss-ph"); head.appendChild(icon(r));
    var t = el("div"); t.appendChild(el("b", "ss-pn", r.n)); head.appendChild(t); pv.appendChild(head);
    var acts = el("div", "ss-acts");
    if (r.t === "m") {
      t.appendChild(el("small", null, "Lv " + r.lv + " · " + fmt(r.hp) + " HP · " + fmt(r.exp) + " EXP" + (r.weak ? " · weak to " + r.weak.toLowerCase() : "")));
      if (r.where) t.appendChild(el("small", null, r.where));
      if (r.drops.length) {
        pv.appendChild(el("div", "ss-h", "Drops, worth today"));
        r.drops.slice(0, matchMedia("(max-width:760px)").matches ? 4 : 6).forEach(function (d) { var p = priceOf(d), it = IDX.i[d]; pv.appendChild(line(d, p[0], p[1], it ? href(it) : null)); });
      } else pv.appendChild(el("p", "ss-hint", "No drops recorded yet."));
      acts.appendChild(btn("Open " + r.n, href(r), true));
      var home = (r.where || "").split(", ")[0]; if (IDX.p[home]) acts.appendChild(btn("Map: " + home, href(IDX.p[home])));
    } else if (r.t === "i") {
      t.appendChild(el("small", null, r.kind || "Item"));
      pv.appendChild(r.typ ? line("Typical price", short(r.typ), r.sales + " sales") : line("Typical price", "", "no sure price yet"));
      if (r.by.length) { pv.appendChild(el("div", "ss-h", "Dropped by")); r.by.forEach(function (m) { var x = IDX.m[m]; pv.appendChild(line(m, x ? "Lv " + x.lv : "", "", x ? href(x) : null)); }); }
      if (r.need.length) { pv.appendChild(el("div", "ss-h", "Needed for")); r.need.forEach(function (q) { var x = IDX.q[q]; pv.appendChild(line(q, x ? "Lv " + x.lv + "+" : "", "", x ? href(x) : null)); }); }
      acts.appendChild(btn("Price and listings", href(r), true));
    } else if (r.t === "q") {
      t.appendChild(el("small", null, "Lv " + r.lv + "+" + (r.area ? " · " + r.area : "") + (r.giver ? " · from " + r.giver : "")));
      if (r.needs) { pv.appendChild(el("div", "ss-h", "To do")); pv.appendChild(el("p", "ss-txt", r.needs.charAt(0).toUpperCase() + r.needs.slice(1))); }
      if (r.exp || r.meso) { pv.appendChild(el("div", "ss-h", "Reward")); pv.appendChild(el("p", "ss-txt", [r.exp ? fmt(r.exp) + " EXP" : "", r.meso ? fmt(r.meso) + " mesos" : ""].filter(Boolean).join(" · "))); }
      acts.appendChild(btn("Open the quest", href(r), true));
    } else {
      t.appendChild(el("small", null, [r.region, r.lo ? "Lv " + r.lo + (r.hi && r.hi !== r.lo ? " to " + r.hi : "") : ""].filter(Boolean).join(" · ")));
      if (r.mobs.length) { pv.appendChild(el("div", "ss-h", "Monsters")); r.mobs.forEach(function (m) { var x = IDX.m[m[0]]; pv.appendChild(line(m[0], x ? "Lv " + x.lv : "", m[1] ? "×" + m[1] : "", x ? href(x) : null)); }); }
      acts.appendChild(btn("Open the map", href(r), true));
    }
    pv.appendChild(acts);
    if (IDX.built) pv.appendChild(el("p", "ss-note", "Prices are the board's typical, shown only when there are enough sales to be sure."));
  }
  function build() {
    dlg = el("dialog", "ss-dlg"); dlg.setAttribute("aria-label", "Search the site");
    var box = el("div", "ss-box"), lab = el("label", "ss-in");
    lab.appendChild(el("span", "ss-sr", "Search the site"));
    lab.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M13 13l4 4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>');
    inp = el("input"); inp.type = "search"; inp.id = "ss-q"; inp.placeholder = "Search quests, monsters, maps, drops"; inp.autocomplete = "off"; inp.setAttribute("enterkeyhint", "go"); inp.maxLength = 60;
    inp.setAttribute("role", "combobox"); inp.setAttribute("aria-controls", "ss-list"); inp.setAttribute("aria-expanded", "true");
    lab.appendChild(inp); lab.appendChild(el("span", "ss-chip", "Site search"));
    var x = el("button", "ss-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Close"); x.addEventListener("click", function () { dlg.close(); });
    lab.appendChild(x);
    var body = el("div", "ss-body"); list = el("div", "ss-list"); list.id = "ss-list"; list.setAttribute("role", "listbox"); pv = el("div", "ss-pv"); pv.hidden = true;
    body.appendChild(list); body.appendChild(pv); box.appendChild(lab); box.appendChild(body); dlg.appendChild(box); document.body.appendChild(dlg);
    inp.addEventListener("input", function () { if (IDX) search(inp.value); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (rows.length) setAct((act + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length); }
      else if (e.key === "Enter" && rows[act]) { e.preventDefault(); ev("#siteopen:" + rows[act].r.t + ":" + rows[act].r.n); location.href = rows[act].a.href; }
    });
    // a tap on the dimmed page outside the box closes it
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", function () { document.documentElement.classList.remove("ss-open"); });
  }
  function open() {
    if (!dlg) build();
    if (!dlg.open) { dlg.showModal(); document.documentElement.classList.add("ss-open"); }
    inp.focus(); inp.select();
    list.textContent = ""; list.appendChild(el("p", "ss-hint", "Loading…"));
    load().then(function () { search(inp.value); }).catch(function () { list.textContent = ""; list.appendChild(el("p", "ss-hint", "The site search didn't load. Check your connection and try again.")); });
  }
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-sitesearch]"); if (b) { e.preventDefault(); open(); } });
  // the index loads as soon as someone heads for the button, so the first results show at once
  ["pointerover", "focusin", "touchstart"].forEach(function (t) { document.addEventListener(t, function (e) { if (e.target.closest && e.target.closest("[data-sitesearch]")) load().catch(function () {}); }, { passive: true }); });
  window.fmSiteSearch = open;
})();
