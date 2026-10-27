// Club FM board engine. Club members see fresh listings every 15 seconds, and working the raw listings out into the
// board takes a second or more of steady number crunching. This background worker runs the same board script the
// page runs, builds the board here, and hands the page the finished board, so scrolling and clicking never wait on it.
// The page sends what the build needs (the time window, a few settings); this side never shows anything, never
// signs in and never sends anything anywhere: it only reads the price data.
"use strict";
var ENG_IDS = {}, ENG_LS = {};
// ---- a stand-in for the page: anything the board script draws goes nowhere
var STUB = new Proxy(function () {}, {
  get: function (t, k) {
    if (k === Symbol.toPrimitive) return function (hint) { return hint === "number" ? 0 : ""; };
    if (k === Symbol.iterator) return [][Symbol.iterator];
    if (k === "length" || k === "childElementCount" || k === "offsetHeight" || k === "offsetWidth" || k === "scrollTop" || k === "clientHeight") return 0;
    if (k === "then") return undefined;   // never looks like a promise
    if (k === "hidden" || k === "checked" || k === "open" || k === "disabled") return false;
    if (k === "value" || k === "textContent" || k === "innerHTML" || k === "className" || k === "id") return "";
    if (k === "children" || k === "childNodes") return [];
    if (k === "dataset" || k === "style") return {};
    return STUB;
  },
  set: function () { return true; },
  apply: function () { return STUB; },
  construct: function () { return STUB; },
  has: function () { return false; }
});
function node(id) {
  var v = ENG_IDS[id];
  if (!v) return STUB;
  return new Proxy(v, { get: function (t, k) { return k in t ? t[k] : STUB[k]; }, set: function (t, k, x) { t[k] = x; return true; } });
}
self.window = self;
self.document = {
  getElementById: node, querySelector: function () { return STUB; }, querySelectorAll: function () { return []; },
  createElement: function () { return STUB; }, createElementNS: function () { return STUB; }, createTextNode: function () { return STUB; },
  addEventListener: function () {}, removeEventListener: function () {}, hasFocus: function () { return false; },
  body: STUB, documentElement: STUB, head: STUB, hidden: false, visibilityState: "visible", title: "", referrer: "", activeElement: STUB, currentScript: null, readyState: "complete"
};
function store(map) {
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem: function (k, v) { map[k] = String(v); }, removeItem: function (k) { delete map[k]; },
    key: function (i) { return Object.keys(map)[i] || null; }, get length() { return Object.keys(map).length; }
  };
}
self.sessionStorage = store({});
self.history = { replaceState: function () {}, pushState: function () {} };
self.Image = function () { return STUB; };
self.Audio = function () { return STUB; };
self.IntersectionObserver = self.ResizeObserver = self.MutationObserver = function () { return { observe: function () {}, disconnect: function () {}, unobserve: function () {} }; };
self.matchMedia = function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; };
self.getComputedStyle = function () { return STUB; };
self.CSS = { escape: function (s) { return String(s); } };
try { self.Notification = undefined; } catch (e) {}
self.innerWidth = 1500; self.innerHeight = 900; self.devicePixelRatio = 1;
self.scrollTo = self.scrollBy = self.alert = self.open = function () {};
self.addEventListener = (function (add) { return function (type, fn, o) { if (type === "message" || type === "error") return add.call(self, type, fn, o); }; })(self.addEventListener);
if (!self.requestAnimationFrame) self.requestAnimationFrame = function (f) { return setTimeout(function () { f(Date.now()); }, 16); };
if (!self.requestIdleCallback) self.requestIdleCallback = function (f) { return setTimeout(function () { f({ timeRemaining: function () { return 50; }, didTimeout: false }); }, 1); };
// ---- reading only: price data comes in, nothing goes out
var realFetch = self.fetch.bind(self);
var READ = [/^https:\/\/raw\.githubusercontent\.com\/maplefm\/maplefm\.github\.io\/live\/data\//, /^https:\/\/api\.maplefm\.gg\/data\/(live|sig)\b/, /^https:\/\/clubfm-accounts\.aaweaver93\.workers\.dev\/data\/(live|sig)\b/];
self.fetch = function (u, o) {
  var url = new URL(String(u && u.url || u), self.location.href).href, method = (o && o.method || "GET").toUpperCase();
  var same = url.indexOf(self.location.origin + "/data/") === 0;
  if (method !== "GET" || !(same || READ.some(function (r) { return r.test(url); }))) return Promise.resolve(new Response("", { status: 404 }));
  return realFetch(url, o);
};
self.onmessage = function (e) {
  var m = e.data || {};
  if (m.type !== "init" || self.FM_ENGINE) return;
  ENG_IDS = m.ids || {}; ENG_LS = m.ls || {};
  self.localStorage = store(ENG_LS);
  self.FM_ENGINE = { ids: ENG_IDS };
  try { importScripts(m.src); }
  catch (err) { self.postMessage({ type: "error", msg: "load: " + (err && err.message || err) }); }
};
