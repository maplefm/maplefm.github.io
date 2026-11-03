// Club FM board snapshot reader. The server-built board is a 20+ MB JSON file, and reading it in one go held the page
// for a quarter second on a desktop and over a second on a phone. This worker fetches and reads it off the page,
// then hands it over in pieces the page can take a slice at a time: number columns as typed arrays (moved, not
// copied), and everything else as small JSON texts. It only reads the public snapshot; it never sends anything.
"use strict";
var CHUNK = 400;
function nums(a) {
  if (!Array.isArray(a)) return null;
  for (var i = 0; i < a.length; i++) if (typeof a[i] !== "number") return null;
  return Float64Array.from(a);
}
function texts(a, size) { var out = []; for (var i = 0; i < a.length; i += size) out.push(JSON.stringify(a.slice(i, i + size))); return out; }
self.onmessage = function (e) {
  var url = e.data && e.data.url;
  fetch(url, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !j.cols || !j.D) { self.postMessage({ none: true }); return; }
    var move = [], cols = {};
    Object.keys(j.cols).forEach(function (k) {
      var c = j.cols[k];
      if (c && !Array.isArray(c) && c.g) {
        var g = nums(c.g), v = nums(c.v);
        if (g) move.push(g.buffer); if (v) move.push(v.buffer);
        cols[k] = { g: g || texts(c.g, 5000), gt: !g, v: v || texts(c.v, 2000), vt: !v };
      } else {
        var d = nums(c);
        if (d) { move.push(d.buffer); cols[k] = { d: d }; } else cols[k] = { dt: texts(c || [], 5000) };
      }
    });
    var D = {}, list = null;
    Object.keys(j.D).forEach(function (k) { if (k === "list" && Array.isArray(j.D.list)) list = texts(j.D.list, CHUNK); else D[k] = JSON.stringify(j.D[k]); });
    var head = {}; Object.keys(j).forEach(function (k) { if (k !== "cols" && k !== "D") head[k] = j[k]; });
    self.postMessage({ head: head, cols: cols, D: D, list: list }, move);
  }).catch(function () { self.postMessage({ none: true }); });
};
