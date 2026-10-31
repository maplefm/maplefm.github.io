// FM prices on quest and crafting lists: every price says what it is ("about 200 each on the FM, 2,000 for all 10")
// and is today's, swapped in from the board when the page opens. A page built earlier keeps its numbers until then.
// Markup: <span class="fp" data-fmi="Item name" data-fmq="10">...</span>
(function () {
  function meso(n) {
    var f = function (x, d) { return x.toFixed(d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); };
    if (n >= 999.5e6) return f(n / 1e9, 2) + "B";
    if (n >= 999.5e3) return f(n / 1e6, n >= 9.95e6 ? 1 : 2) + "M";
    if (n >= 1e4) return f(n / 1e3, n >= 99.95e3 ? 0 : 1) + "K";
    return n >= 10 ? Math.round(n).toLocaleString("en-US") : f(n, 1);
  }
  // one rule for every list: the price each, then the total when there's more than one
  function fill(e, each) {
    var q = +e.dataset.fmq || 1; e.textContent = "";
    if (!(each > 0)) { e.appendChild(document.createTextNode("not seen on the FM yet")); e.classList.add("fpn"); return; }
    e.classList.remove("fpn");
    e.appendChild(document.createTextNode("about ")); var b = document.createElement("b"); b.textContent = meso(each); e.appendChild(b);
    e.appendChild(document.createTextNode(q > 1 ? " each on the FM, " : " on the FM"));
    if (q > 1) { var t = document.createElement("b"); t.textContent = meso(each * q); e.appendChild(t); e.appendChild(document.createTextNode(" for all " + q.toLocaleString("en-US"))); }
  }
  window.fmPriceFill = fill;
  window.fmPriceMeso = meso;
  var els = document.querySelectorAll("[data-fmi]"); if (!els.length) return;
  fetch("https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/data/summary-public.json?m=" + Math.floor(Date.now() / 3e5))
    .then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
      if (!s || !s.rows) return;
      var P = {}; s.rows.forEach(function (r) { if (r && r.item && r.typ) P[r.item] = r.typ; });
      els.forEach(function (e) { if (P[e.dataset.fmi]) fill(e, P[e.dataset.fmi]); });
      // a list's total ("Buy it all") follows the same prices
      document.querySelectorAll("[data-fmtot]").forEach(function (t) {
        var all = true, sum = 0; JSON.parse(t.dataset.fmtot).forEach(function (x) { if (P[x[0]]) sum += P[x[0]] * x[1]; else all = false; });
        if (sum) { var b = t.querySelector("b"); if (b) b.textContent = (all ? "about " : "at least ") + meso(sum) + " mesos"; }
      });
      document.querySelectorAll(".fpnote").forEach(function (n) { n.textContent = "FM prices change with the market; these are today's, as of " + new Date(s.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + "."; });
    }).catch(function () {});
})();
