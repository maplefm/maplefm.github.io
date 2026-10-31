// Rows that scroll sideways show it: a soft fade and an arrow on each side that has more. Tap or click an arrow to
// scroll, or swipe. Works for the menu, tab rows, chip rows and wide tables, including rows the page builds later.
(function () {
  var SEL = ".sitenav .sn-links,.playbar,.tabs,.chips,.seg,.tbox,.tbl,.scroll";
  function arrow(side, el) {
    var a = document.createElement("span");
    a.className = "hsb hs" + side; a.setAttribute("role", "button"); a.setAttribute("aria-label", side === "l" ? "Scroll left" : "Scroll right");
    var i = document.createElement("i"); i.textContent = side === "l" ? "‹" : "›"; a.appendChild(i);
    a.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); el.scrollBy({ left: (side === "l" ? -1 : 1) * Math.max(140, el.clientWidth * 0.7), behavior: "smooth" }); });
    return a;
  }
  function update(el) {
    var max = el.scrollWidth - el.clientWidth;
    el.classList.toggle("hs-on", max > 4);
    el.classList.toggle("hs-l", max > 4 && el.scrollLeft > 4);
    el.classList.toggle("hs-r", max > 4 && max - el.scrollLeft > 4);
  }
  // the fade under an arrow takes the colour actually behind the row, so no text ever shows through around the arrow
  function solid(c) { var m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return c && c !== "transparent" ? c : null; var p = m[1].split(","); return p.length < 4 || +p[3] >= 0.85 ? "rgb(" + p.slice(0, 3).join(",") + ")" : null; }
  function bgOf(el) { for (var x = el; x && x.nodeType === 1; x = x.parentElement) { var c = solid(getComputedStyle(x).backgroundColor); if (c) return c; } return "#fff"; }
  function setup(el) {
    var flex = /flex/.test(getComputedStyle(el).display);
    var head = !flex && el.querySelector("thead th, thead tr, thead"); el.style.setProperty("--hsbg", (head && solid(getComputedStyle(head).backgroundColor)) || bgOf(el));
    // the page may rebuild a row (new tabs, new chips): put the arrows back
    if (flex) {
      if (!el.querySelector(":scope > .hsl")) el.insertBefore(arrow("l", el), el.firstChild);
      if (el.lastElementChild && !el.lastElementChild.classList.contains("hsr")) { var old = el.querySelector(":scope > .hsr"); if (old) old.remove(); el.appendChild(arrow("r", el)); }
    } else if (!el.querySelector(":scope > .hsrail")) {
      var rail = document.createElement("div"); rail.className = "hsrail"; rail.appendChild(arrow("l", el)); rail.appendChild(arrow("r", el));
      el.insertBefore(rail, el.firstChild);
    }
    if (!el.__hs) {
      el.__hs = 1; el.classList.add(flex ? "hsf" : "hsk");
      el.addEventListener("scroll", function () { update(el); }, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(function () { update(el); }).observe(el);
    }
    update(el);
  }
  var t = 0;
  function scan() { t = 0; [].forEach.call(document.querySelectorAll(SEL), setup); }
  function later() { if (!t) t = setTimeout(scan, 120); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan); else scan();
  window.addEventListener("load", scan);
  window.addEventListener("resize", later);
  new MutationObserver(function (ms) {
    for (var i = 0; i < ms.length; i++) { var n = ms[i].target; if (n.nodeType === 1 && !(n.classList && (n.classList.contains("hsb") || n.classList.contains("hsrail")))) { later(); return; } }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
// Search hints: an input with data-ph="long|shorter|short" shows the longest hint that fits its box, so a phone never cuts one off mid-word
(function () {
  var cx = document.createElement("canvas").getContext("2d");
  function fit() {
    var ins = document.querySelectorAll("input[data-ph]");
    for (var i = 0; i < ins.length; i++) {
      var q = ins[i]; if (!q.clientWidth) continue; var cs = getComputedStyle(q); cx.font = cs.font;
      var room = q.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (q.type === "search" ? 24 : 6), opts = q.getAttribute("data-ph").split("|"), pick = opts[opts.length - 1];
      for (var k = 0; k < opts.length; k++) if (cx.measureText(opts[k]).width <= room) { pick = opts[k]; break; }
      if (q.placeholder !== pick) q.placeholder = pick;
    }
  }
  window.fitPh = fit;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fit); else fit();
  addEventListener("resize", fit); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
