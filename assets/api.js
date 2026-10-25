// Club FM talks to its server at api.maplefm.gg (same site as maplefm.gg, so phones keep the sign-in). Some networks
// can't find that address yet; then every call quietly goes to the server's other address instead, links included,
// and the page remembers that for six hours before trying api.maplefm.gg again.
(function () {
  var A = "https://api.maplefm.gg", B = "https://clubfm-accounts.aaweaver93.workers.dev", alt = false;
  try { var t = +localStorage.getItem("fm-api-alt") || 0; alt = Date.now() - t < 6 * 36e5; } catch (e) {}
  window.FM_API = alt ? B : A;
  var f0 = window.fetch.bind(window);
  // The sign-in also comes back as a token in the address (#signed-in&fmt=...). It is kept in this browser and sent with
  // each call to the server, so browsers that block cross-site cookies (iPhones, Safari, some Chrome setups) stay signed in.
  var TOK = ""; try { TOK = localStorage.getItem("fm-tok") || ""; } catch (e) {}
  var hm = /[#&]fmt=([^&]+)/.exec(location.hash);
  if (hm) {
    TOK = decodeURIComponent(hm[1]); try { localStorage.setItem("fm-tok", TOK); } catch (e) {}
    try { history.replaceState(null, "", location.pathname + location.search + location.hash.replace(/&?fmt=[^&]+/, "")); } catch (e) {}
  }
  function f(u, o) {
    if (typeof u === "string" && (u.indexOf(A) === 0 || u.indexOf(B) === 0)) {
      if (/\/logout(\?|$)/.test(u)) { TOK = ""; try { localStorage.removeItem("fm-tok"); } catch (e) {} }
      else if (TOK) { o = Object.assign({}, o || {}); var h = new Headers(o.headers || {}); if (!h.has("Authorization")) h.set("Authorization", "Bearer " + TOK); o.headers = h; }
    }
    return f0(u, o);
  }
  function swap(u) { return B + u.slice(A.length); }
  function useAlt() { window.FM_API = B; try { localStorage.setItem("fm-api-alt", String(Date.now())); } catch (e) {} relink(); }
  function relink() { document.querySelectorAll('a[href^="' + A + '"]').forEach(function (a) { a.href = swap(a.getAttribute("href")); }); }
  window.fetch = function (u, o) {
    if (u && typeof u === "object" && u.url) return f0(u, o);
    if (typeof u !== "string" || u.indexOf(A) !== 0) return f(u, o);
    if (window.FM_API === B) return f(swap(u), o);
    return f(u, o).catch(function (e) { useAlt(); return f(swap(u), o); });
  };
  if (navigator.sendBeacon) { var sb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (u, d) { return sb(typeof u === "string" && u.indexOf(A) === 0 && window.FM_API === B ? swap(u) : u, d); }; }
  // links made later (sign-in buttons and the like) follow along when clicked
  document.addEventListener("click", function (e) { if (window.FM_API !== B) return; var a = e.target.closest && e.target.closest('a[href^="' + A + '"]'); if (a) a.href = swap(a.getAttribute("href")); }, true);
  if (alt) document.addEventListener("DOMContentLoaded", relink);
})();
