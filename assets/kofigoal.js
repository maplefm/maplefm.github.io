// Ko-fi support line, one line at the end of the board's stats ("Donations pay the scanners", a thin goal bar, the
// amount, Support). Donations over the last 28 days against the $250 that lifts the scanners' weekly pay cap
// (data/pay.json uncap_kofi_month, the same 28-day total tools/credits.py uses). The board rebuilds its stats row
// often, so this fetches once and paints whichever .kofiline is on the page, now and each time board.js asks.
(function () {
  var GOAL = 250, TOTAL = null, OFF = false;
  function money(n) { return "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
  function paint() {
    var lines = document.querySelectorAll(".kofiline");
    for (var k = 0; k < lines.length; k++) {
      var box = lines[k], bar = box.querySelector(".kl-bar"), have = box.querySelector(".kl-have");
      if (OFF) { box.classList.add("kl-off"); box.title = "Support Club FM on Ko-fi"; continue; }
      if (TOTAL == null) continue;
      var pct = Math.max(0, Math.min(100, TOTAL / GOAL * 100));
      have.textContent = money(TOTAL); box.querySelector(".kl-of").textContent = "of " + money(GOAL);
      box.querySelector(".kl-fill").style.width = (TOTAL > 0 ? Math.max(pct, 3) : 0) + "%";
      bar.setAttribute("aria-valuenow", String(Math.round(TOTAL))); bar.setAttribute("aria-valuetext", money(TOTAL) + " of " + money(GOAL));
      box.title = TOTAL >= GOAL ? "Goal reached: the scanners' weekly pay cap is off. Support Club FM on Ko-fi." : money(TOTAL) + " of " + money(GOAL) + " in the last 28 days. At " + money(GOAL) + " the scanners' weekly pay cap comes off.";
      box.classList.add("kl-ready");
    }
  }
  window.fmKofiPaint = paint;
  fetch("https://api.maplefm.gg/public/kofi-income", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && typeof j.total === "number") TOTAL = j.total; else OFF = true; paint(); })
    .catch(function () { OFF = true; paint(); });
})();
