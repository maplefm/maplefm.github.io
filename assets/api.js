// Club FM talks to its server at api.maplefm.gg (same site as maplefm.gg, so phones keep the sign-in). Some networks
// can't find that address yet; then every call quietly goes to the server's other address instead, links included,
// and the page remembers that for six hours before trying api.maplefm.gg again.
(function () {
  var A = "https://api.maplefm.gg", B = "https://clubfm-accounts.aaweaver93.workers.dev", alt = false;
  try { var t = +localStorage.getItem("fm-api-alt") || 0; alt = Date.now() - t < 6 * 36e5; } catch (e) {}
  window.FM_API = alt ? B : A;
  var f = window.fetch.bind(window);
  function swap(u) { return B + u.slice(A.length); }
  function useAlt() { window.FM_API = B; try { localStorage.setItem("fm-api-alt", String(Date.now())); } catch (e) {} relink(); }
  function relink() { document.querySelectorAll('a[href^="' + A + '"]').forEach(function (a) { a.href = swap(a.getAttribute("href")); }); }
  window.fetch = function (u, o) {
    if (typeof u !== "string" || u.indexOf(A) !== 0) return f(u, o);
    if (window.FM_API === B) return f(swap(u), o);
    return f(u, o).catch(function (e) { useAlt(); return f(swap(u), o); });
  };
  if (navigator.sendBeacon) { var sb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (u, d) { return sb(typeof u === "string" && u.indexOf(A) === 0 && window.FM_API === B ? swap(u) : u, d); }; }
  // links made later (sign-in buttons and the like) follow along when clicked
  document.addEventListener("click", function (e) { if (window.FM_API !== B) return; var a = e.target.closest && e.target.closest('a[href^="' + A + '"]'); if (a) a.href = swap(a.getAttribute("href")); }, true);
  if (alt) document.addEventListener("DOMContentLoaded", relink);
})();
