// Map pages: getting from map to map while you play (Nov 19 2026).
//  1. Every exit is labeled on the minimap with a number. Click it, or press the number, and that map's page opens.
//     Backspace goes back one map.
//  2. Directions: the route finder (map.html) saves the route in fm-dir. On each map of the route, the one portal to
//     take pulses gold, the rest fade, and a short bar says where to go. "I'm through" (or Space) opens the next map;
//     End (or Esc) stops. On a phone the directions get their own screen: an arrow, the map, the next step, one button.
//  3. Mini window: a small window that sits beside the game (?mini=1), with a box to jump to any map.
// The site can't see the game, so it never moves on by itself: you say when you're through.
(function () {
  "use strict";
  var card = document.querySelector("main .card"), h1 = card && card.querySelector("h1"); if (!h1) return;
  var HERE = h1.textContent.trim(), MINI = /[?&]mini=1/.test(location.search), PHONE = matchMedia("(max-width:760px)").matches;
  var mm = card.querySelector(".mmap .in");
  function slug(s) { return String(s).toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x"; }
  function href(name) { return "/map/" + slug(name) + "/" + (MINI ? "?mini=1" : ""); }
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function ev(p) { try { if (navigator.webdriver) return; var d = JSON.stringify({ p: String(p).slice(0, 120), r: "", q: "" }); navigator.sendBeacon && navigator.sendBeacon("https://api.maplefm.gg/hit", new Blob([d], { type: "text/plain" })); } catch (e) {} }

  // ---------------------------------------------------------------- the exits, numbered
  // where each exit is, in words, from the exits table and the hidden portal notes the page already has
  var WHERE = {};
  [].forEach.call(card.querySelectorAll(".exits table tr"), function (tr) { var a = tr.cells[0] && tr.cells[0].querySelector("a"); if (a && tr.cells[2]) WHERE[a.textContent.trim()] = tr.cells[2].textContent.trim(); });
  [].forEach.call(card.querySelectorAll(".exits .hid"), function (d) { var a = d.querySelector("b a"), m = /\(([^)]*)\)/.exec(d.textContent); if (a && m && !WHERE[a.textContent.trim()]) WHERE[a.textContent.trim()] = m[1]; });
  var marks = mm ? [].slice.call(mm.querySelectorAll(".mk.p,.mk.d,.mk.h")) : [], EXITS = [], NUM = {};
  marks.forEach(function (m, i) {
    var to = (m.getAttribute("title") || "").replace(/^(Hidden portal to|To) /, ""); m.dataset.i = i; m.dataset.to = to;
    if (!to || to === HERE) return;
    if (!NUM[to]) { EXITS.push({ to: to, mk: m }); NUM[to] = EXITS.length; }
  });
  // the exits table and the hidden portals show the same numbers as the minimap
  [].forEach.call(card.querySelectorAll(".exits table tr"), function (tr) { var a = tr.cells[0] && tr.cells[0].querySelector("a"); if (a && NUM[a.textContent.trim()] && NUM[a.textContent.trim()] <= 9) a.insertAdjacentHTML("beforebegin", '<kbd class="xk">' + NUM[a.textContent.trim()] + "</kbd> "); });
  marks.forEach(function (m) {
    var n = NUM[m.dataset.to]; if (!n) return;
    var c = el("a", "pchip"); c.href = href(m.dataset.to); c.style.left = m.style.left; c.style.top = m.style.top;
    var L = parseFloat(m.style.left); if (L < 12) c.classList.add("l"); else if (L > 88) c.classList.add("r");
    if (parseFloat(m.style.top) > 55) c.classList.add("dn");
    if (n <= 9) c.appendChild(el("kbd", null, String(n))); c.appendChild(el("span", null, m.dataset.to)); c.title = "Go to " + m.dataset.to;
    c.addEventListener("click", function () { ev("#portal:" + HERE + ">" + m.dataset.to); });
    m.parentNode.appendChild(c); m.chip = c;
  });
  // labels that would sit on top of one another keep only their number
  (function () {
    var cs = [].slice.call(mm ? mm.querySelectorAll(".pchip") : []), boxes = [];
    cs.forEach(function (c) { var r = c.getBoundingClientRect(); if (boxes.some(function (b) { return r.left < b.right + 4 && r.right > b.left - 4 && r.top < b.bottom + 2 && r.bottom > b.top - 2; })) c.classList.add("short"); else boxes.push(r); });
  })();
  if (mm && EXITS.length) {
    var hint = el("p", "note mhint"); hint.innerHTML = PHONE ? "Tap a portal to open that map." : "Click a portal or press its number to open that map. <kbd>Backspace</kbd> goes back.";
    var lg = mm.parentNode.nextElementSibling, after = lg && lg.classList.contains("lg") ? lg : mm.parentNode; after.parentNode.insertBefore(hint, after.nextSibling);
  }

  // ---------------------------------------------------------------- Directions
  var DIR = ls("fm-dir"), STEP = -1;
  if (DIR && (!DIR.steps || Date.now() - (DIR.at || 0) > 6 * 3600e3)) { ls("fm-dir", null); DIR = null; }
  if (DIR) DIR.steps.forEach(function (s, i) { if (STEP < 0 && s.from === HERE) STEP = i; });
  var bar = null, sheet = null;
  function arrow(w) {
    w = w || ""; var lf = /left/.test(w), rt = /right/.test(w), up = /up high/.test(w), dn = /bottom/.test(w);
    return lf ? (up ? "↖" : "←") : rt ? (up ? "↗" : "→") : up ? "↑" : dn ? "↓" : "•";
  }
  function stepText(s) {
    if (s.kind === "walk") return { go: s.to, where: WHERE[s.to] || "", hidden: s.hidden };
    return { go: s.to, where: s.what ? (s.kind === "scroll" ? "Use a " + s.what : "Take the " + s.what) : "", ride: true };
  }
  function next() {
    if (!DIR || STEP < 0) return; var s = DIR.steps[STEP]; ev("#dir:next");
    if (STEP + 1 >= DIR.steps.length) ls("fm-dir", null);   // the last map: you're there
    location.href = href(s.to) + (MINI ? "" : "");
  }
  function end() { ls("fm-dir", null); DIR = null; STEP = -1; if (bar) bar.remove(); if (sheet) sheet.remove(); document.documentElement.classList.remove("dir-on"); marks.forEach(function (m) { m.classList.remove("tgt", "fade"); if (m.chip) m.chip.classList.remove("glow", "fade"); }); }
  function dots() { var d = el("span", "ddots"); DIR.steps.forEach(function (_, i) { d.appendChild(el("i", i < STEP ? "done" : i === STEP ? "on" : "")); }); return d; }
  if (DIR && STEP >= 0) {
    var s = DIR.steps[STEP], t = stepText(s);
    document.documentElement.classList.add("dir-on");
    // the portal to take glows; the others fade back
    marks.forEach(function (m) {
      var hit = s.kind === "walk" && (s.portal != null ? +m.dataset.i === s.portal && m.dataset.to === s.to : m.dataset.to === s.to);
      m.classList.toggle("tgt", hit); m.classList.toggle("fade", !hit);
      if (m.chip) { m.chip.classList.toggle("glow", hit); m.chip.classList.toggle("fade", !hit); }
    });
    if (s.kind === "walk" && !marks.some(function (m) { return m.classList.contains("tgt"); })) marks.forEach(function (m) { if (m.dataset.to === s.to) { m.classList.add("tgt"); m.classList.remove("fade"); if (m.chip) { m.chip.classList.add("glow"); m.chip.classList.remove("fade"); } } });
    if (PHONE && !MINI) {
      // phones: Directions get their own screen
      sheet = el("div", "dsheet"); sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-label", "Directions");
      var top = el("div", "dtop"); top.appendChild(el("b", null, "Directions")); var x = el("button", "dend", "End"); x.type = "button"; x.addEventListener("click", end); top.appendChild(x); sheet.appendChild(top);
      var pr = el("div", "dprog"); pr.appendChild(dots()); pr.appendChild(el("span", null, "To " + DIR.to)); sheet.appendChild(pr);
      var c1 = el("div", "dcard"); c1.appendChild(el("small", null, "You're in " + HERE));
      var row = el("div", "drow"); row.appendChild(el("span", "darr", t.ride ? "⇢" : arrow(t.where)));
      var tx = el("div"); tx.appendChild(el("b", null, t.go)); if (t.where) tx.appendChild(el("span", null, t.where + (t.hidden ? " · hidden portal, press up" : ""))); row.appendChild(tx); c1.appendChild(row);
      if (mm && !t.ride) { var clone = mm.parentNode.cloneNode(true); clone.querySelectorAll(".pchip:not(.glow)").forEach(function (c) { c.remove(); }); c1.appendChild(clone); }
      sheet.appendChild(c1);
      var nx = DIR.steps[STEP + 1];
      if (nx) { var c2 = el("div", "dcard thin"); c2.appendChild(el("small", null, "Then")); c2.appendChild(el("b", null, nx.to)); sheet.appendChild(c2); }
      var go = el("button", "dgo"); go.type = "button"; go.innerHTML = "I'm through <small>" + (nx || STEP + 1 < DIR.steps.length ? "next map" : "you're there") + "</small>"; go.addEventListener("click", next); sheet.appendChild(go);
      document.body.appendChild(sheet);
    } else {
      // computers: one short line above the map
      bar = el("div", "dbar"); bar.appendChild(el("b", "dt", "Directions")); bar.appendChild(dots());
      var g = el("span", "dgo1"); g.appendChild(document.createTextNode(t.ride ? (t.where || "Go") + " to " : "Go to ")); g.appendChild(el("b", null, t.go)); bar.appendChild(g);
      var b1 = el("button", "dnext"); b1.type = "button"; b1.innerHTML = "I'm through <kbd>Space</kbd>"; b1.addEventListener("click", next); bar.appendChild(b1);
      var b2 = el("button", "dend", "End"); b2.type = "button"; b2.addEventListener("click", end); bar.appendChild(b2);
      var host = card.querySelector("section.head") || card; host.insertBefore(bar, host.querySelector(".mmap") || host.firstChild);
    }
  } else if (DIR && DIR.steps.length && HERE === DIR.to) { ls("fm-dir", null); }

  // ---------------------------------------------------------------- keys
  addEventListener("keydown", function (e) {
    var t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    if (/^[1-9]$/.test(e.key) && EXITS[+e.key - 1]) { ev("#portalkey:" + HERE); location.href = href(EXITS[+e.key - 1].to); }
    else if (e.key === "Backspace" && history.length > 1) { e.preventDefault(); history.back(); }
    else if (e.key === " " && DIR && STEP >= 0) { e.preventDefault(); next(); }
    else if (e.key === "Escape" && DIR) end();
  });

  // ---------------------------------------------------------------- mini window
  // the route finder starts from the last map page you opened, so Directions from here start here
  try { localStorage.setItem("fm-map-from", HERE); } catch (e) {}
  var recent = ls("fm-recent-maps") || []; recent = [HERE].concat(recent.filter(function (x) { return x !== HERE; })).slice(0, 8); ls("fm-recent-maps", recent);
  if (MINI) {
    document.documentElement.classList.add("mini");
    // every map link on the page (the exits table, hidden portals) stays in the mini window
    [].forEach.call(document.querySelectorAll('a[href^="/map/"]'), function (a) { var u = a.getAttribute("href"); if (!/[?]/.test(u)) a.setAttribute("href", u.replace(/(#.*)?$/, "?mini=1$1")); });
    var box = el("div", "minitop");
    box.innerHTML = '<div class="mt"><img src="/assets/superstar@4x.png" alt=""><b>Club FM</b><span>Mini window</span></div>';
    var lab = el("label", "mgo"), inp = el("input"); inp.id = "mgo-q"; inp.placeholder = "Go to a map: type 3 letters"; inp.autocomplete = "off"; inp.setAttribute("aria-label", "Go to a map");
    lab.appendChild(inp); var sug = el("div", "msug"); sug.hidden = true; box.appendChild(lab); box.appendChild(sug);
    var rc = el("div", "mrec"); rc.appendChild(el("span", null, "Recent")); recent.slice(1, 5).forEach(function (n) { var a = el("a", null, n); a.href = href(n); rc.appendChild(a); }); if (recent.length > 1) box.appendChild(rc);
    card.insertBefore(box, card.firstChild);
    var MAPS = null;
    inp.addEventListener("input", function () {
      var q = inp.value.trim().toLowerCase(); if (q.length < 2) { sug.hidden = true; return; }
      (MAPS ? Promise.resolve(MAPS) : fetch("/data/sitesearch.json").then(function (r) { return r.json(); }).then(function (j) { MAPS = (j.p || []).map(function (x) { return x[0]; }); return MAPS; })).then(function (all) {
        var hits = all.filter(function (n) { return n.toLowerCase().indexOf(q) >= 0; }).sort(function (a, b) { return a.toLowerCase().indexOf(q) - b.toLowerCase().indexOf(q) || a.length - b.length; }).slice(0, 8);
        sug.textContent = ""; hits.forEach(function (n) { var a = el("a", null, n); a.href = href(n); sug.appendChild(a); }); sug.hidden = !hits.length;
      }).catch(function () {});
    });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { var a = sug.querySelector("a"); if (a) location.href = a.href; } });
  } else if (!PHONE && mm) {
    // a button that opens this map in a small window to keep beside the game
    var mb = el("button", "minibtn", "Open as a mini window"); mb.type = "button";
    mb.addEventListener("click", function () { ev("#mini:open"); var w = window.open(location.pathname + "?mini=1", "fmmini", "width=460,height=900"); if (!w) location.href = location.pathname + "?mini=1"; });
    var nr = card.querySelector(".navrow"); if (nr) nr.appendChild(mb);
  }
})();
