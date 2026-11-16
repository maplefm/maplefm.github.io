// Ko-fi goal strip: donations over the last 28 days against the $250 that lifts the scanners' weekly pay cap
// (data/pay.json uncap_kofi_month, the same 28-day total tools/credits.py uses). The strip keeps its height
// while it loads, so nothing on the page moves.
(function () {
  var box = document.getElementById("kofigoal"); if (!box) return;
  var goal = +box.getAttribute("data-goal") || 250;
  function money(n) { return "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
  function show(total) {
    var pct = Math.max(0, Math.min(100, total / goal * 100));
    box.querySelector(".kg-have").textContent = money(total);
    box.querySelector(".kg-fill").style.width = (total > 0 ? Math.max(pct, 2) : 0) + "%";
    var bar = box.querySelector(".kg-bar"); bar.setAttribute("aria-valuenow", String(Math.round(total))); bar.setAttribute("aria-valuetext", money(total) + " of " + money(goal));
    box.querySelector(".kg-note").textContent = total >= goal ? "Goal reached: the scanners' weekly pay cap is off." : "At " + money(goal) + " the scanners' weekly pay cap comes off.";
    box.classList.add("kg-ready");
  }
  fetch("https://api.maplefm.gg/public/kofi-income", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && typeof j.total === "number") show(j.total); else off(); })
    .catch(off);
  // no number: the strip stays where it is as a plain Ko-fi link, so nothing moves
  function off() { box.classList.add("kg-off"); box.querySelector(".kg-text b").textContent = "Support Club FM on Ko-fi"; }
})();
