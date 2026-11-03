// Visit counter: the page, the site you came from and the partner tag. No cookies, no IP stored (see How it works).
(function () {
  // automated browsers (crawlers that run pages, test tools) say so in navigator.webdriver; pages nobody is looking at
  // (rendered in the background) wait until they're actually on screen, and only count after a second there
  // Google search loads its top results ahead of the click (prerendering): such a page is counted when the person
  // actually opens it. Chrome signals that with "prerenderingchange", not always "visibilitychange"; waiting on the
  // second alone dropped most Google visits from Nov 1.
  if (navigator.webdriver) return;
  var ready = function () { return document.visibilityState === "visible" && !document.prerendering; };
  var started = false, go = function () { if (started) return; started = true; setTimeout(send, 1000); };
  var on = function () { if (ready()) { document.removeEventListener("visibilitychange", on); document.removeEventListener("prerenderingchange", on); go(); } };
  if (ready()) go();
  else { document.addEventListener("visibilitychange", on); document.addEventListener("prerenderingchange", on); }
  function send() {
  if (!ready()) { started = false; on(); if (!started) { document.addEventListener("visibilitychange", on); document.addEventListener("prerenderingchange", on); } return; }
  try {
    var ref = "";
    try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
    var m = location.search.match(/[?&]ref=([\w-]{1,24})/);
    // returning or new: the day this browser first opened the site stays in its own storage; only 0 or 1 is sent
    var ret = null, today = new Date().toISOString().slice(0, 10);
    // (a browser without the mark is new: the board itself saves fm- settings in its first second, so looking for
    // other fm- keys, as the first version did for visitors from before Oct 27, called every new board visitor returning)
    try { var f = localStorage.getItem("fm-first"); if (!f) { f = today; localStorage.setItem("fm-first", f); } ret = f < today ? 1 : 0; } catch (e) {}
    var d = JSON.stringify({ p: location.pathname.slice(0, 120), r: ref.slice(0, 80), q: m ? m[1] : "", ret: ret });
    var u = "https://api.maplefm.gg/hit";
    if (navigator.sendBeacon) navigator.sendBeacon(u, new Blob([d], { type: "text/plain" }));
    else fetch(u, { method: "POST", body: d, keepalive: true, mode: "no-cors" });
  } catch (e) {}
  }
})();
