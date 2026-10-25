// Item prices index: search, category chips, sorting, and today's prices pulled live over the baked copy.
(function () {
  "use strict";
  var q = document.getElementById("q"), sort = document.getElementById("sort"), none = document.getElementById("none"), CAT = "", SHOW = 12, open = {};
  var cats = [].slice.call(document.querySelectorAll(".cat"));
  function meso(n) { n = +n || 0; if (n >= 999.5e6) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B"; if (n >= 999.5e3) return (n / 1e6).toFixed(n >= 9.95e6 ? 1 : 2).replace(/\.?0+$/, "") + "M"; if (n >= 1e4) return (n / 1e3).toFixed(n >= 99.95e3 ? 0 : 1).replace(/\.?0+$/, "") + "K"; return Math.round(n).toLocaleString("en-US"); }
  function key(a, k) { return k === "a" ? a.dataset.n : k === "p" ? -a.dataset.p : k === "m" ? -Math.abs(+a.dataset.m) : -a.dataset.v; }
  function draw() {
    var v = q.value.trim().toLowerCase(), k = sort.value, shown = 0, words = v.split(/\s+/).filter(Boolean);
    cats.forEach(function (c) {
      var box = c.querySelector(".its"), its = [].slice.call(box.children), more = c.querySelector(".more");
      its.sort(function (a, b) { var x = key(a, k), y = key(b, k); return x < y ? -1 : x > y ? 1 : 0; }).forEach(function (a) { box.appendChild(a); });
      var hits = its.filter(function (a) { return words.every(function (w) { return a.dataset.n.indexOf(w) >= 0; }); }), cap = v || open[c.dataset.c] || CAT ? 1e9 : SHOW;
      its.forEach(function (a) { a.hidden = true; }); hits.forEach(function (a, i) { a.hidden = i >= cap; });
      c.hidden = !hits.length || (CAT && c.dataset.c !== CAT); if (!c.hidden) shown += hits.length;
      more.hidden = hits.length <= cap; more.textContent = "Show all " + hits.length;
    });
    none.hidden = shown > 0; document.getElementById("board").href = "/" + (v ? "#q=" + encodeURIComponent(q.value.trim()) : "");
    try { history.replaceState(null, "", v ? "#q=" + encodeURIComponent(q.value.trim()) : location.pathname); } catch (e) {}
  }
  cats.forEach(function (c) { c.querySelector(".more").addEventListener("click", function () { open[c.dataset.c] = 1; draw(); }); });
  [].forEach.call(document.querySelectorAll(".cc"), function (b) { b.addEventListener("click", function () { CAT = b.dataset.c; [].forEach.call(document.querySelectorAll(".cc"), function (x) { x.classList.toggle("on", x === b); }); draw(); }); });
  q.addEventListener("input", draw); sort.addEventListener("change", draw);
  var m = /^#q=(.+)$/.exec(location.hash); if (m) q.value = decodeURIComponent(m[1]);
  draw();
  // today's numbers: the page is rebuilt daily, the board updates every few minutes
  fetch("https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/summary-public.json?m=" + Math.floor(Date.now() / 3e5)).then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
    if (!s || !s.rows) return; var by = {}; s.rows.forEach(function (r) { if (r && r.item) by[r.item] = r; });
    [].forEach.call(document.querySelectorAll(".it"), function (a) {
      var r = by[a.dataset.k]; if (!r || !r.typ) return; a.dataset.p = Math.round(r.typ); a.dataset.v = Math.round(r.vol || 0); a.querySelector(".pr").textContent = meso(r.typ);
      var mv = (r.mv || [])[0], e = a.querySelector(".mv"); a.dataset.m = typeof mv === "number" ? mv : 0;
      if (typeof mv === "number" && Math.abs(mv) >= 0.01) { e.className = "mv " + (mv > 0 ? "up" : "down"); e.textContent = (mv > 0 ? "▲" : "▼") + Math.abs(Math.round(mv * 100)) + "%"; } else { e.className = "mv"; e.textContent = ""; }
    });
    if (s.at) { var mins = Math.round((Date.now() - s.at) / 6e4); document.getElementById("upd").textContent = "updated " + (mins < 2 ? "just now" : mins < 90 ? mins + " min ago" : new Date(s.at).toLocaleString()); }
    draw();
  }).catch(function () {});
})();
