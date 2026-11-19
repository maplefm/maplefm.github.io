// Getting back, on every page (Nov 19 2026 battle test):
//  1. A Top button once you are well down a long page. It brings the menu back with it.
//  2. The board on a phone: its menu sits above the search and scrolls away with the page. Scroll up and a copy of the
//     menu slides in at the top (the search moves down under it); scroll down and it slides away again.
(function () {
  "use strict";
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, phone = function () { return innerWidth <= 700; };
  var top = document.createElement("button"); top.type = "button"; top.className = "sn-top"; top.hidden = true;
  top.setAttribute("aria-label", "Back to the top of the page"); top.innerHTML = '<span aria-hidden="true">↑</span> Top';
  top.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    var n = document.querySelector(".sitenav.sn-pin"); if (n) n.classList.remove("sn-hide");
    hideFloat();
  });
  document.body.appendChild(top);

  var home = document.querySelector(".sitenav.sn-home"), fl = null;
  // the copy is made the first time it is needed, so the page itself still has one menu
  function makeFloat() {
    if (fl || !home || !home.querySelector(".sn-links")) return fl;
    fl = document.createElement("nav"); fl.className = "sitenav sn-float"; fl.setAttribute("aria-label", "Club FM");
    fl.appendChild(home.querySelector(".sn-links").cloneNode(true)); document.body.appendChild(fl);
    fl.offsetHeight;   // laid out hidden first, so it slides in
    return fl;
  }
  function cardOpen() { var c = document.body.classList; return c.contains("sheet") || c.contains("bigcard"); }
  function showFloat() {
    if (!makeFloat() || fl.classList.contains("on")) return;
    fl.classList.add("on"); fl.setAttribute("aria-hidden", "false"); [].forEach.call(fl.querySelectorAll("a"), function (a) { a.tabIndex = 0; });
    document.documentElement.style.setProperty("--snfh", fl.offsetHeight + "px"); document.body.classList.add("snf");
  }
  function hideFloat() {
    if (!fl || !fl.classList.contains("on")) return;
    fl.classList.remove("on"); fl.setAttribute("aria-hidden", "true"); [].forEach.call(fl.querySelectorAll("a"), function (a) { a.tabIndex = -1; });
    document.body.classList.remove("snf");
  }
  var y = scrollY, H = 0, t = 0;
  ["wheel", "touchmove", "keydown"].forEach(function (e) { addEventListener(e, function () { t = Date.now(); }, { passive: true }); });
  addEventListener("scroll", function () {
    var h = document.documentElement.scrollHeight, d = scrollY - y;
    top.hidden = !(h > innerHeight * 2.5 && scrollY > innerHeight * 1.5) || cardOpen();
    if (h !== H) { H = h; y = scrollY; return; }          // the page grew under the reader: not their scroll
    if (!home) return;
    var past = home.getBoundingClientRect().bottom < 0;
    if (!phone() || !past || cardOpen()) { hideFloat(); y = scrollY; return; }
    if (d < -12 && Date.now() - t < 600) { showFloat(); y = scrollY; }
    else if (d > 30) { hideFloat(); y = scrollY; }
  }, { passive: true });
})();
