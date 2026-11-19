// Phones: a page laid out in columns (assets/pages.css .lay[data-tabs]) shows its header card, then tabs for the other
// cards, one at a time, so the drops or the price are one tap away instead of a long scroll. Desktops see every card.
(function () {
  "use strict";
  var lay = document.querySelector(".lay[data-tabs]"); if (!lay || /[?&]mini=1/.test(location.search)) return;   // the mini window shows the map and exits only
  var secs = [].slice.call(lay.querySelectorAll("section.blk[data-tab]")).filter(function (s) { return !s.classList.contains("head"); });
  if (secs.length < 2) return;
  var bar = document.createElement("div"); bar.className = "ptabs"; bar.setAttribute("role", "tablist"); bar.setAttribute("aria-label", "Parts of this page");
  // the same name twice (two cards about one thing) is one tab that shows both
  var names = [], by = {};
  secs.forEach(function (s) { var n = s.getAttribute("data-tab"); if (!by[n]) { by[n] = []; names.push(n); } by[n].push(s); });
  var key = "fm-ptab:" + (lay.className.match(/lay-(\w+)/) || [, ""])[1], want = "";
  try { want = sessionStorage.getItem(key) || ""; } catch (e) {}
  if (names.indexOf(want) < 0) want = names.indexOf(lay.getAttribute("data-first")) >= 0 ? lay.getAttribute("data-first") : names[0];   // a map page opens on its exits
  var btns = names.map(function (n) {
    var b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.textContent = n;
    b.addEventListener("click", function () { show(n); try { sessionStorage.setItem(key, n); } catch (e) {} });
    bar.appendChild(b); return b;
  });
  function show(n) {
    secs.forEach(function (s) { s.classList.toggle("on", s.getAttribute("data-tab") === n); });
    btns.forEach(function (b) { b.setAttribute("aria-selected", b.textContent === n ? "true" : "false"); });
  }
  // the bar goes right after the header card; on desktops pages.css keeps it hidden and every card shows
  var head = lay.querySelector("section.blk.head");
  if (head && head.parentNode) head.parentNode.insertBefore(bar, head.nextSibling); else lay.insertBefore(bar, lay.firstChild);
  lay.classList.add("tabbed"); show(want);
})();
