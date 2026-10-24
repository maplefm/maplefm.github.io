// Visit counter: the page, the site you came from and the partner tag. No cookies, no IP stored (see How it works).
(function () {
  try {
    var ref = "";
    try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
    var m = location.search.match(/[?&]ref=([\w-]{1,24})/);
    var d = JSON.stringify({ p: location.pathname.slice(0, 120), r: ref.slice(0, 80), q: m ? m[1] : "" });
    var u = "https://api.maplefm.gg/hit";
    if (navigator.sendBeacon) navigator.sendBeacon(u, new Blob([d], { type: "text/plain" }));
    else fetch(u, { method: "POST", body: d, keepalive: true, mode: "no-cors" });
  } catch (e) {}
})();
