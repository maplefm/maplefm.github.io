// Item pages are built once a day; this swaps in the board's current numbers when the page opens.
(function () {
  var name = window.FM_ITEM; if (!name) return;
  function meso(n) {
    var f = function (x, d) { return x.toFixed(d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); };
    if (n >= 999.5e6) return f(n / 1e9, 2) + "B";
    if (n >= 999.5e3) return f(n / 1e6, n >= 9.95e6 ? 1 : 2) + "M";
    if (n >= 1e4) return f(n / 1e3, n >= 99.95e3 ? 0 : 1) + "K";
    return n >= 10 ? Math.round(n).toLocaleString("en-US") : f(n, 1);
  }
  function full(n) { return Math.round(n || 0).toLocaleString("en-US"); }
  function set(id, v) { var e = document.getElementById(id); if (e && v) e.textContent = v; }
  fetch("https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/summary-public.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
    if (!s || !s.rows) return;
    var r = s.rows.filter(function (x) { return x && x.item === name; })[0];
    if (!r || !r.typ) return;
    var rng = r.hi > r.lo && meso(r.lo) !== meso(r.hi) ? meso(r.lo) + " to " + meso(r.hi) : meso(r.typ), top = null;
    // equips: the busiest grade's range, the same one the page was built with
    (r.lad || []).forEach(function (sv) { (sv[1] || []).forEach(function (g) { if (!top && g[7] && g[1] === "sold") top = g; }); });
    if (top) rng = meso(top[2]) !== meso(top[3]) ? meso(top[2]) + " to " + meso(top[3]) : meso(top[4]);
    set("rng", rng); set("typ", full(r.typ)); set("t2", meso(r.typ)); set("sn", full(r.salesN)); set("ln", full(r.n));
    if (r.best) set("ba", meso(r.best));
    set("upd", "Live as of " + new Date(s.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + ".");
  }).catch(function () {});
})();
// Watch this price: the same watchlist the board keeps (fm-watch in this browser, synced when signed in). The board
// shows it under ★ Watchlist. One tap here, no sign-in needed.
(function () {
  var name = window.FM_ITEM, wrap = document.querySelector(".ctaw"); if (!name || !wrap) return;
  var load = function () { try { return JSON.parse(localStorage.getItem("fm-watch") || "{}") || {}; } catch (e) { return {}; } };
  var b = document.createElement("button"); b.type = "button"; b.className = "watchbtn";
  var note = document.createElement("span"); note.className = "watchnote";
  var draw = function () { var on = !!load()[name]; b.textContent = on ? "★ Watching" : "☆ Watch this price"; b.setAttribute("aria-pressed", on); note.innerHTML = on ? 'Saved in this browser. Find it under ★ Watchlist on <a href="/">the price board</a>.' : ""; };
  b.addEventListener("click", function () {
    var w = load(); if (w[name]) delete w[name]; else w[name] = { t: Date.now() };
    try { localStorage.setItem("fm-watch", JSON.stringify(w)); } catch (e) {}
    if (w[name]) try { navigator.sendBeacon("https://api.maplefm.gg/hit", new Blob([JSON.stringify({ p: "#watch:" + name.slice(0, 100), r: "", q: "" })], { type: "text/plain" })); } catch (e) {}
    draw();
  });
  wrap.appendChild(b); wrap.appendChild(note); draw();
})();
