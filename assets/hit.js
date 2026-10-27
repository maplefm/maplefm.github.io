// Visit counter: the page, the site you came from and the partner tag. No cookies, no IP stored (see How it works).
(function () {
  try {
    var ref = "";
    try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
    var m = location.search.match(/[?&]ref=([\w-]{1,24})/);
    // returning or new: the day this browser first opened the site stays in its own storage; only 0 or 1 is sent
    var ret = null, today = new Date().toISOString().slice(0, 10);
    try { var f = localStorage.getItem("fm-first"); if (!f) { var old = false; for (var k = 0; k < localStorage.length; k++) if (/^fm-/.test(localStorage.key(k) || "")) { old = true; break; } f = old ? "2026-10-01" : today; localStorage.setItem("fm-first", f); } ret = f < today ? 1 : 0; } catch (e) {}
    var d = JSON.stringify({ p: location.pathname.slice(0, 120), r: ref.slice(0, 80), q: m ? m[1] : "", ret: ret });
    var u = "https://api.maplefm.gg/hit";
    if (navigator.sendBeacon) navigator.sendBeacon(u, new Blob([d], { type: "text/plain" }));
    else fetch(u, { method: "POST", body: d, keepalive: true, mode: "no-cors" });
  } catch (e) {}
})();
