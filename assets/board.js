(function () {
  "use strict";
  // ENGINE: this file is running inside fmengine.js, the background worker that builds the board for club members
  var ENGINE = !!(typeof self !== "undefined" && self.FM_ENGINE && typeof importScripts === "function");
  var MYSRC = !ENGINE && document.currentScript ? document.currentScript.src : "";
  // Club members' own shops are left out of prices. Stored as fingerprints, not names.
  var OWNH = { "a4959daa": 1, "bd22ad91": 1, "6d3b4a44": 1, "5b5738ce": 1, "7528a716": 1 }, OWNC = {};
  function ownShop(sl) {
    if (OWNC[sl] != null) return OWNC[sl];
    var x = 0x811c9dc5, t = unescape(encodeURIComponent("clubfm:" + sl));
    for (var k = 0; k < t.length; k++) { x ^= t.charCodeAt(k); x = Math.imul(x, 0x01000193) >>> 0; }
    return (OWNC[sl] = !!OWNH[("0000000" + x.toString(16)).slice(-8)]);
  }
  var LIVE = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/";
  var CREW = ["Maya", "Jack", "Matt", "Jimmy"];
  // trade chat rows read wrong before a reader fix, corrected by hand: seller|item as read|price -> real item
  var CHATFIX = { "videogame|Claw Attack Scroll: Intermediate|140000": "Earring LUK Scroll: Intermediate" };
  var FILES = [["data/watcher.json", "Maya"], ["data/watcher-2.json", "Jack"], ["data/watcher-3.json", "Matt"], ["data/watcher-4.json", "Jimmy"], ["data/streams.json", "Streams"], ["data/streams-vods.json", "Streams"], ["data/inbox.json", null], ["data/fast.json", null]];   // fast.json: new rows from the Worker before the pump folds them in
  var MIN = 5, HOT = 0.5, H = 36e5, DAY = 864e5;
  var $ = function (id) { return document.getElementById(id); };
  var ICONS = {}; try { ICONS = JSON.parse($("icon-ids").textContent); } catch (e) {}
  var base = []; try { base = JSON.parse($("scan-data").textContent); } catch (e) {}
  base.forEach(function (s) { s.who = "Maya"; });
  var live = {}, scans = base.slice(), D = null;
  var BUYSORT = "price";   // every card opens on Where to buy, cheapest first
  var state = { tab: "prices", cat: "All", sub: "", sortK: "vol", sortDir: -1, dK: "pct", dDir: -1, sel: null, chart: "time", list: "buy", actDays: 7 };
  // Names the watcher already knows, plus full Classic names that shop windows cut short.
  var KNOWN = ["Adamantium Ore","Amethyst Ore","Angel Halo","Angel Wand","Animal Fur Bundle","Aquamarine","Aquamarine Ore","Arrows for Bows","Arrows for Crossbows","Baby Angel Wings","Battle Axe","Beetle Long Sleeve","Beige Nitty","Beige Plain Robe","Beret","Black Bandana","Black Cat Beanie","Black Enamel Shoes","Black Kitty","Black Knucklevest Pants","Black Pig","Black Sneak Pants","Black Sunglasses","Blue Bucket Hat","Blue Cap","Blue Guise","Blue Hawkeye","Blue Headband","Blue Jewelry Boots","Blue Lappy Boots","Blue Mushroom Cap","Blue Pao","Blue Qi Pao","Blue Qi Pao Pants","Blue Snail Shell","Blue Training Shirt","Blue Watch","Blue Wizardry Hat","Blue Woodsman Boots","Bronze Aroa Boots","Bronze Helmet","Bronze Ingot","Bronze Koif","Bronze Ore","Brown Bamboo Hat","Brown Doloress Robe","Brown Hard Leather Boots","Brown Kitty","Brown Lamelle","Brown Puppy","Bubbling's Huge Bubble","Bunny Earmuffs","Bunny Ears","Butterfly Skirt","Cake","Cape STR Scroll: Lesser","Cat Hat","Cat Suit","Charm of the Undead","Cherub's Bow","Chocolate Chat Ring","Chocolate Label Ring","Claw Attack Scroll: Intermediate","Composite Bow","Crossbow Attack Scroll: Intermediate","Cutlus","Dagger Attack Scroll: Intermediate","Dark Master Sergeant","Diamond Ore","Dollish Pink","Double Axe","Eagle Crow","Earring DEX Scroll: Intermediate","Earring INT Scroll: Intermediate","Earring LUK Scroll: Intermediate","Earring STR Scroll: Intermediate","Emerald Ore","Emerald Staff","Evil Eye Tail","Firewood","Fish Spear","Fork on a Stick","Fragment of Magic","Fruit Knife","Garnet","Garnet Ore","Gloves Magic Attack Scroll: Greater","Gold Kitty Slippers","Gold Ore","Green Armine Skirt","Green Bamboo Hat","Green Bennis Chainmail","Green Feather Hat","Green Mushroom Cap","Green Woodsman Boots","Grey Able Armor","Hardwood Wand","Hat Accuracy Scroll: Greater","Hat Accuracy Scroll: Intermediate","Hat Accuracy Scroll: Lesser","Heart Sunglasses","Holy Water","Horny Mushroom Cap","Ink-and-Wash Chat Ring","Ink-and-Wash Label Ring","Iron Ball","Iron Dagger","Iron Ingot","Iron Ore","Jr. Necki Skin","Kitty Chat Ring","Leaf","Leaf Earrings","Leather","Lemon","Lemona","Lined Hip-Hop Pants","Long Sword","Mace","Magic Potion","Meba","Meshcap","Metal Axe","Metal Gear","Metal Wand","Mithril Ore","Mithril Pole Arm","Mushroom Spore","Mystery Face Coupon","Mystery Hair Coupon","Nakamaki","Octopus Leg","Opal Ore","Orange Baseball Jacket","Orange Hooded Shirt","Orange Mushroom Balloon","Orange Mushroom Cap","Orange Split Piece","Orange Toy Hammer","Orihalcon Ore","Overall Armor INT Scroll: Greater","Pan Lid","Patissier Hat","Patissier Uniform","Pet Equip Speed Scroll: Intermediate","Pet Equip Speed Scroll: Lesser","Pig & Mushroom Omok Set","Pig & Octopus Omok Set","Pig Illustrated","Pig's Head","Pig's Ribbon","Pink Allstar","Pink Bunny","Pink Bunny Sweater","Pole Arm","Polearm Attack Scroll: Intermediate","Processed Cloth","Processed Leather","Processed Wood","Pure Water","Purple Dorothy Dress","Rainbow Knit","Red Bandana","Red Check Rider","Red Hwarang Shirt","Red Loosecap","Red Ninja Sandals","Red Potion","Red Sailor Shirt","Red Sailor Skirt","Red Snail Shell","Red Thief Hood","Red Trainer Jacket","Red Trainer Pants","Reggae Hat","Ribboned Pig Headband","Ripped Jeans","Sailor Hat","Sailor Outfit","Sandblasted Jeans","Sap of Ancient Tree","Sapphire Ore","Screw","Selective 5-slot Coupon","Set of Match Cards","Shoes Jump Scroll: Greater","Shoes Speed Scroll: Intermediate","Signature Hair Coupon","Silver Ore","Slime & Octopus Omok Set","Slime & Pig Omok Set","Slime Bubble","Slime Earrings","Slime Slippers","Slime T-Shirt","Snail Shell","Spear","Spear Attack Scroll: Intermediate","Splash Choco Boy","Splash Choco Girl","Squishy Liquid","Staff Magic Attack Scroll: Intermediate","Steel Fingerless Gloves","Steel Igor","Steel Shield","Stiff Feather","Stirge Wing","Sword","Toga","Topaz Ore","Topwear DEF Scroll: Lesser","Tourist T","Tree Branch","Triangular Zamadar","Unagi","Warrior Potion","Weighted Earrings","White Bunny","White Gomushin","White Hooded Vest","White Jeans","White Label Ring","White Rabbit","Wizard Staff","Wooden Buckler","Wooden Club","Wooden Mallet","Wooden Staff","Work Gloves","Yellow Bandana","Yellow Rainbow Sneaks","Yellow Spatula","Yellow Square"].concat(["Ink-and-Wash Thought Bubble Ring", "Ink-and-Wash Painting Name Tag Ring", "Ink-and-Wash Chat Ring", "Ink-and-Wash Label Ring", "Founder's Mystery Fashion Crate", "White Ribboned Sailor Dress", "Soft Chocolate Fondue Scepter", "Starlight Heart Scepter", "Arwen's Glass Shoe", "Selective 5-slot Coupon", "Kumbi Throwing Stars", "Mokbi Throwing Stars", "Wooden Top"]);

  // ---------- formatting
  // bundle items like arrows cost a fraction of a meso each, so small prices keep a decimal instead of rounding to 0
  function fmt(n) { return n > 0 && n < 10 && Math.round(n) !== n ? (Math.round(n * 10) / 10).toLocaleString("en-US") : Math.round(n).toLocaleString("en-US"); }
  function short(n) {
    if (n > 0 && n < 10 && Math.round(n) !== n) return String(Math.round(n * 10) / 10);
    n = Math.round(n);
    // a number that would print as 1000K or 10000K rolls up: 999,999 is 1M, not 1000K
    if (n >= 999.5e6) return (n / 1e9).toFixed(2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + "B";
    if (n >= 999.5e3) return (n / 1e6).toFixed(n >= 9.95e6 ? 1 : 2).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 99.95e3 ? 0 : 1).replace(/\.0$/, "") + "K";
    return n.toLocaleString("en-US");
  }
  function ago(t) {
    var m = Math.max(0, Math.round((Date.now() - t) / 6e4));
    if (m < 1) return "just now"; if (m < 60) return m + "m ago";
    var h = Math.round(m / 60); if (h < 48) return h + "h ago"; return Math.round(h / 24) + "d ago";
  }
  // M(n) / MF(n) mark a meso amount inside a sentence; el() and rich() draw each mark as the number plus the meso coin
  function M(n) { return "\uE000" + short(n) + "\uE001"; }
  function MF(n) { return "\uE000" + fmt(n) + "\uE001"; }
  function rich(e, t) {
    e.textContent = ""; String(t).split(/(\uE000[^\uE001]*\uE001)/).forEach(function (p) {
      if (!p) return; if (p.charCodeAt(0) === 0xE000) { var z = document.createElement("span"); z.className = "mz"; z.textContent = p.slice(1, -1); e.appendChild(z); } else e.appendChild(document.createTextNode(p)); });
    return e;
  }
  function plain(t) { return String(t).replace(/[\uE000\uE001]/g, ""); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) { if (typeof txt === "string" && txt.indexOf("\uE000") >= 0) rich(e, txt); else e.textContent = txt; } return e; }
  function ssCrown() { var i = document.createElement("img"); i.src = "assets/superstar@4x.png"; i.alt = "Crown"; i.className = "ssi"; return i; }
  function coin() { return el("span", "coin"); }
  function money(n, cls) { return el("span", "num mz" + (cls ? " " + cls : ""), short(n)); }
  function median(a) { if (!a.length) return 0; a = a.slice().sort(function (x, y) { return x - y; }); var m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
  function quant(a, q) { if (!a.length) return 0; a = a.slice().sort(function (x, y) { return x - y; }); var i = (a.length - 1) * q, lo = Math.floor(i); return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (i - lo); }
  // Older watcher versions saved half-read map names like "ee Market <1> p" for Free Market 1.
  var frCache = {};
  function fixRoom(r) { if (!r) return r; var c = frCache[r]; if (c === undefined) c = frCache[r] = fixRoom0(r); return c; }
  function fixRoom0(r) {
    if (!r || /^FM(\d{1,2}| Entrance)?$/.test(r) || r === "chat") return r;
    // shops only open in Free Market rooms: a title read as something else ("Khe 2 tated") keeps its room number
    if (!/(fr)?e\s*e?\s*mark|m[ae]rk[ae]t|mar?k[ae]t/i.test(r)) { var lone = String(r).match(/(^|\D)(\d{1,2})(?!\d)/g) || []; return lone.length === 1 && +lone[0].replace(/\D/g, "") >= 1 && +lone[0].replace(/\D/g, "") <= 40 ? "FM" + (+lone[0].replace(/\D/g, "")) : "FM"; }
    if (/entr/i.test(r)) return "FM Entrance";
    var m = /<\s*(\d{1,2})/.exec(r) || /(\d{1,2})\D{0,3}$/.exec(r);
    return m && +m[1] >= 1 && +m[1] <= 30 ? "FM" + (+m[1]) : "FM";
  }
  // Misread scroll names ("Statt Magic Attack Scroll") snap to the real scroll from the item list.
  var SB = null, SBC = {};
  function snapScroll(n) {
    if (SBC[n] != null) return SBC[n];
    var m = /^(.*Scroll)(: (Lesser|Intermediate|Greater|Superior))?$/.exec(n);
    if (!m || dbRow(n) || !DBN) return n;
    if (!SB) { SB = {}; Object.keys(DB).forEach(function (k) { var t = /^(.*scroll): (lesser|intermediate|greater|superior)$/.exec(k); if (t) SB[t[1].replace(/[^a-z0-9]/g, "")] = DB[k][0].replace(/: \w+$/, ""); }); }
    var key = m[1].toLowerCase().replace(/[^a-z0-9]/g, ""), best = "", bd = 99, second = 99;
    if (SB[key]) best = SB[key], bd = 0;
    else Object.keys(SB).forEach(function (k) { var d = lev(key, k, 4); if (d < bd) { second = bd; bd = d; best = SB[k]; } else if (d < second) second = d; });
    var out = best && (bd === 0 || (bd <= 3 && second > bd)) ? best + (m[2] || "") : n;
    SBC[n] = out; return out;
  }
  function roomLabel(r) { if (!r) return ""; var m = /^FM(\d+)$/.exec(r); return m ? "Free Market " + m[1] : r === "chat" ? "trade chat" : r; }
  // from a "Price by ATT" row to the newest listing with that roll: switch to the list that holds it,
  // scroll it into view and flash it, so the shop it sits in is one look away
  function jumpToStat(i, v, newest, ks) {
    if (!newest) return;
    var inBuy = !newest.so && Date.now() - newest.t < DAY;
    state.list = inBuy ? "buy" : "sales"; renderItem();
    var ls = $("side").querySelector(".list");
    var li = ls && Array.prototype.filter.call(ls.querySelectorAll(".li[data-sv]"), function (x) { return x.dataset.sv === String(v); })[0];
    if (li) { li.scrollIntoView({ block: "center", behavior: "smooth" }); li.classList.add("hit"); setTimeout(function () { li.classList.remove("hit"); }, 1800); }
    // and say where the newest one with this roll was, whether or not it is in the list
    var sec = $("side").querySelector(".pbs"); if (!sec) return;
    var note = sec.querySelector(".jumpnote") || sec.appendChild(el("p", "jumpnote"));
    note.textContent = ""; note.appendChild(el("b", null, (ks === "SUCCESS" ? v + "%" : ks + " " + v) + ": "));
    note.appendChild(document.createTextNode((newest.so ? "sold by " : "asked by ") + newest.s + (where(newest) ? " · " + where(newest) : "") + " · " + ago(newest.t) + " · "));
    note.appendChild(money(newest.u));
    if (newest.stream) { note.appendChild(document.createTextNode(" · seen on ")); note.appendChild(streamLink(newest)); }
    if (!li) note.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function jumpToGrade(i, g, newest, ks, base, lab) {
    if (!newest) return;
    var inBuy = !newest.so && !newest.chat && Date.now() - newest.t < DAY;
    state.list = inBuy ? "buy" : "sales"; renderItem();
    var ls = $("side").querySelector(".list");
    var li = ls && Array.prototype.filter.call(ls.querySelectorAll(".li[data-g]"), function (x) { return x.dataset.g === String(g); })[0];
    if (li) { li.scrollIntoView({ block: "center", behavior: "smooth" }); li.classList.add("hit"); setTimeout(function () { li.classList.remove("hit"); }, 1800); }
    var sec = $("side").querySelector(".rollbox"); if (!sec) return;
    var note = sec.querySelector(".jumpnote") || sec.appendChild(el("p", "jumpnote"));
    var label = lab || (base != null ? ks + " " + (base + g) : (g === 0 ? "Average roll" : (g > 0 ? "+" : "") + g));
    note.textContent = ""; note.appendChild(el("b", null, label + ": "));
    note.appendChild(document.createTextNode((newest.chat ? "posted by " : newest.so ? "sold by " : "asked by ") + newest.s + (where(newest) ? " · " + where(newest) : "") + " · " + ago(newest.t) + " · "));
    note.appendChild(money(newest.u));
    if (newest.stream) { note.appendChild(document.createTextNode(" · seen on ")); note.appendChild(streamLink(newest)); }
    if (!li) note.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function where(l) { return [l.c ? "CH " + l.c + (l.ci ? " (likely)" : "") : "", roomLabel(l.r) + (l.r && l.ri ? " (likely)" : "")].filter(Boolean).join(", "); }
  // Where to buy: where to walk to, in plain words; says so when the room hasn't been seen yet
  function placed(l) { return !l.chat && !!l.c && !l.ci && /^FM\d+$/.test(l.r || ""); }
  // Where to buy order: full location first, then channel only, then nothing read; chat posts last
  function listRank(l) { return l.chat ? 3 : placed(l) ? 0 : l.c && !l.ci ? 1 : 2; }
  function buyWhere(l) {
    if (l.chat) return "whisper them, posted in chat";
    var room = /^FM\d+$/.test(l.r || "") || l.r === "FM Entrance" ? roomLabel(l.r) + (l.ri ? " (likely)" : "") : "";
    var ch = l.c ? "CH " + l.c + (l.ci ? " (likely)" : "") : "";
    if (!ch && !room) return "location not read";
    return [ch || "channel not read", room || "room not read"].join(", ");
  }
  function hue(s) { var h = 0; for (var k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) % 360; return h; }
  function avatar(name, cls) { var a = el("span", "av" + (cls ? " " + cls : ""), (name || "?").replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?"); a.style.background = "hsl(" + hue(name || "") + " 55% 48%)"; a.setAttribute("aria-hidden", "true"); return a; }

  // ---------- the public item list: icons, classes, levels, and a dictionary for tidying names
  var DB = {}, DBB = {}, DBK = [], DBN = 0, tieredCache = {};   // DBN: how many names the list holds, so hot paths never count the keys
  // what an NPC shop pays for the item (from the game data); a listing below this is money left on the table
  var VEND = {};
  function vendor(name) { return VEND[String(name).toLowerCase()] || 0; }
  // Cash Shop prices in NX (data/nx_prices.json, from Nexon's shop update). With the typical meso sale of the same
  // items this gives the going rate: how many mesos a thousand NX fetches on the Free Market.
  var NX = {}, NXRATE = 0;
  function nxOf(name) { return NX[String(name).toLowerCase()] || 0; }
  fetch("data/nx_prices.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.prices) { Object.keys(j.prices).forEach(function (k) { NX[k.toLowerCase()] = j.prices[k]; }); nxRate(); } }).catch(function () {});
  function nxRate() {
    if (!D || !D.list) return NXRATE;
    var pts = [];
    D.list.forEach(function (i) { var nx = nxOf(i.item); if (!nx || !i.typ || i.kind !== "sale" || (i.salesN || 0) < 3 || nx < 1000) return; pts.push([i.typ / nx, i.salesN]); });
    if (!pts.length) return NXRATE;
    pts.sort(function (a, b) { return a[0] - b[0]; }); var tot = pts.reduce(function (t, x) { return t + x[1]; }, 0), run = 0, med = pts[0][0];
    for (var k = 0; k < pts.length; k++) { run += pts[k][1]; if (run >= tot / 2) { med = pts[k][0]; break; } }
    NXRATE = med; var lab = $("nxlab"); if (lab) rich(lab, "1,000 NX sells for about " + M(Math.round(med * 1000)) + ", from " + pts.length + " Cash Shop items");
    return med;
  }
  function dbRow(name) { return DB[String(name).toLowerCase()] || null; }
  var T0 = { rows: 0, live: 0 };   // startup timing, readable as FM_T0 in the console
  // ---------- the finished board, built on the server: a first visit shows live listings without building anything
  // The pump runs this same page on the server, calls fmSnap(), and the Worker serves the result at /data/snap.
  var SNAP_DROP = { raw: 1, sk: 1, xt: 1, tl: 1, tx: 1 }, ENG_DROP = { raw: 1, sk: 1, xt: 1, xbad: 1 };   // only the build itself reads these
  // Listings are stored by column: text values point into a per-column word list, true/false become 1/0, and
  // times are seconds after the newest. Per-item listing lists keep the last 3 days plus anything with stats
  // (the counts and prices on each item were worked out from everything); the board-wide lists stay whole.
  // full: the club engine's copy (see fmengine.js) keeps every field, every listing and fresh deals; it is handed
  // over as an object, never as text, so nothing is parsed twice
  function snapEncode(full, asObj) {
    if (!D || D.preview || D.snap) return null;
    var isL = new Set(D.L), idx = new Map(), n = 0, cols = {}, words = {}, wix = {}, now = Date.now(), T = D.latest || now;
    function put(k, v) {
      if ((full ? ENG_DROP : SNAP_DROP)[k] || v === undefined || v === null || v === false || v === "") return;
      // the scroll-split memo (x._ss) is rebuilt on demand by scrollSplit; sending it made the board too big to upload
      if (k === "x" && !full && typeof v === "object" && v._ss) { v = Object.assign({}, v); delete v._ss; }
      var c = cols[k] || (cols[k] = []);
      if (typeof v === "string") { var w = words[k] || (words[k] = []), m = wix[k] || (wix[k] = {}); if (m[v] == null) { m[v] = w.length; w.push(v); } c[n] = m[v] + 1; }
      else if (v === true) c[n] = 1;
      else if (k === "t" && typeof v === "number") c[n] = Math.round((T - v) / 1000);
      else c[n] = v;
    }
    function lref(l) {
      if (idx.has(l)) return idx.get(l);
      Object.keys(l).forEach(function (k) { put(k, l[k]); });
      idx.set(l, n); return n++;
    }
    var keep = function (l) { return full || l.x || T - l.t <= 3 * DAY; };
    // a fresh deal stays out of the public copy for its first 10 minutes, the same hold the page applies
    var held = function (l) { if (full) return false; var it = D.byName[l.i]; return !l.so && it && it.typ && l.u < it.typ * 0.8 && now - l.t < HOLD; };
    function enc(v, top) {
      if (v && typeof v === "object") {
        if (isL.has(v)) return held(v) ? null : { "@": lref(v) };
        if (Array.isArray(v)) {
          var a = v; if (a.length && isL.has(a[0])) a = a.filter(function (l) { return !held(l) && (top || keep(l)); });
          // a wrapper around a held listing ({l: listing, g: roll}) is left out whole, not sent with an empty listing
          return a.filter(function (x) { return !(x && typeof x === "object" && !Array.isArray(x) && x.l && isL.has(x.l) && held(x.l)); }).map(function (x) { return enc(x); });
        }
        var o = {}; Object.keys(v).forEach(function (k) { o[k] = enc(v[k]); });
        if (Array.isArray(v.asks) && typeof v.item === "string") o.asksN = v.asks.length;   // the card's count is of every listing
        return o;
      }
      return v;
    }
    var out = {}; Object.keys(D).forEach(function (k) { if (k !== "L" && k !== "byName") out[k] = enc(D[k], true); });
    Object.keys(cols).forEach(function (k) { var c = cols[k]; for (var i = 0; i < n; i++) if (c[i] === undefined) c[i] = 0; });
    // a column that is mostly empty is sent as the rows that have a value: gaps between them, then the values
    Object.keys(cols).forEach(function (k) {
      var c = cols[k], nz = 0, i; for (i = 0; i < n; i++) if (c[i] !== 0) nz++;
      if (nz > n * 0.3) return;
      var gi = [], gv = [], last = -1; for (i = 0; i < n; i++) if (c[i] !== 0) { gi.push(i - last); gv.push(c[i]); last = i; }
      cols[k] = { g: gi, v: gv };
    });
    var kinds = {}; Object.keys(cols).forEach(function (k) { kinds[k] = words[k] ? "w" : k === "t" ? "t" : "v"; });
    var o = { v: 3, at: now, T: T, n: n, cols: cols, words: words, kinds: kinds, D: out };
    return asObj ? o : JSON.stringify(o);
  }
  window.fmSnap = function () { return snapEncode(false); }; window.fmD = function () { return D; }; window.fmSnapDec = function (j) { return snapDecode(j); };
  // Decoding a board makes a hundred thousand listing objects. It runs in slices with a breath between them
  // (snapDecodeAsync), so the page keeps scrolling and clicking while a new board comes in; snapDecode runs it in one go.
  var BOOLK = /^(so|b|chat|stream|tl|scaled|pricey|spot|ci)$/;
  function* snapDecodeGen(j) {
    if (!j || (j.v !== 2 && j.v !== 3) || !j.cols || !j.D) return null;
    var n = j.n, T = j.T, L = new Array(n), i, STEP = 25000;
    for (i = 0; i < n; i++) { L[i] = {}; if (i % STEP === STEP - 1) yield; }
    var keys = Object.keys(j.cols);
    for (var ki = 0; ki < keys.length; ki++) {
      var k = keys[ki], c = j.cols[k], kind = j.kinds[k], w = j.words[k], v, bool = BOOLK.test(k);
      if (c && c.g) {   // sparse: only the rows with a value
        var gi = c.g, gv = c.v, at = -1;
        for (var q = 0; q < gi.length; q++) { at += gi[q]; v = gv[q]; L[at][k] = kind === "w" ? w[v - 1] : kind === "t" ? T - v * 1000 : bool && v === 1 ? true : v; }
        if (gi.length > 4000) yield;
        continue;
      }
      for (var a = 0; a < n; a += STEP) {
        var e = Math.min(n, a + STEP);
        if (kind === "w") { for (i = a; i < e; i++) { v = c[i]; if (v) L[i][k] = w[v - 1]; } }
        else if (kind === "t") { for (i = a; i < e; i++) L[i][k] = T - c[i] * 1000; }
        else if (bool) { for (i = a; i < e; i++) { v = c[i]; if (v !== 0) L[i][k] = v === 1 ? true : v; } }
        else { for (i = a; i < e; i++) { v = c[i]; if (v !== 0) L[i][k] = v; } }
        yield;
      }
    }
    for (i = 0; i < n; i++) {
      var l = L[i]; if (l.x === undefined) l.x = null; if (l.so === undefined) l.so = false; if (l.b === undefined) l.b = false; if (l.chat === undefined) l.chat = false; if (l.stream === undefined) l.stream = false;
      if (l.n === undefined) l.n = 0; if (l.c === undefined) l.c = 0; if (l.q === undefined) l.q = 1;
      if (i % STEP === STEP - 1) yield;
    }
    function dec(v) {
      if (v && typeof v === "object") {
        if (!Array.isArray(v) && v["@"] != null && Object.keys(v).length === 1) return L[v["@"]];
        if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) v[i] = dec(v[i]); return v; }
        for (var kk in v) v[kk] = dec(v[kk]); return v;
      }
      return v;
    }
    var D0 = j.D, top = Object.keys(D0);
    for (var t = 0; t < top.length; t++) {
      var tk = top[t];
      if (tk === "list" && Array.isArray(D0.list)) { for (var li = 0; li < D0.list.length; li++) { D0.list[li] = dec(D0.list[li]); if (li % 150 === 149) yield; } }
      else { D0[tk] = dec(D0[tk]); yield; }
    }
    var d = D0; d.L = L; d.byName = {}; d.list.forEach(function (i) { d.byName[i.item] = i; if (Array.isArray(i.rolls)) i.rolls = i.rolls.filter(function (r) { return r && r.l; }); }); d.snap = true; d.snapAt = j.at;
    return d;
  }
  function snapDecode(j) { var g = snapDecodeGen(j), r; do { r = g.next(); } while (!r.done); return r.value; }
  function snapDecodeAsync(j) {
    return new Promise(function (ok) {
      var g; try { g = snapDecodeGen(j); } catch (e) { ok(null); return; }
      (function step() {
        var end = performance.now() + 12, r;
        try { do { r = g.next(); } while (!r.done && performance.now() < end); } catch (e) { ok(null); return; }
        if (r.done) ok(r.value); else setTimeout(step, 0);
      })();
    });
  }
  var SNAP_P = null;
  if (ENGINE) SNAP_P = Promise.resolve(null);
  else try {
    SNAP_P = fetch("https://api.maplefm.gg/data/snap", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  } catch (e) { SNAP_P = Promise.resolve(null); }
  function mark(k) { if (!T0[k]) T0[k] = Math.round(performance.now()); }
  // items the game data names alike but the shop window tells apart by colour: name -> {item id: colour}
  var COLOURS = { "Buddy Overall Jeans": { 1057090: "Blue", 1057096: "Red" } };
  function loadDB() {
    fetch("data/abbr.json?v=1").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) { ABBR = j; SIDX = null; } }).catch(function () {});
    // the weekly refreshed list lives with the price data; the copy next to the page is the fallback
    return fetch(LIVE + "data/itemdb.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (j) { return j && j.items ? j : fetch("data/itemdb.json?v=mcw4").then(function (r) { return r.ok ? r.json() : null; }); }).then(function (j) {
      if (!j || !j.items) return; mark("dbIn");
      DBK = j.kinds || [];
      j.items.forEach(function (r) {
        var k = r[0].toLowerCase(); if (r[6] > (VEND[k] || 0)) VEND[k] = r[6]; if (!DB[k]) { DB[k] = r; var b = k.slice(0, 2); (DBB[b] || (DBB[b] = [])).push(k); }
        // one name in the game data, two items in the shop window: each colour is its own item with its own price
        var cv = COLOURS[r[0]] && COLOURS[r[0]][r[1]];
        if (cv) { var vn = r[0] + " (" + cv + ")", vk = vn.toLowerCase(), vr = r.slice(); vr[0] = vn; if (!DB[vk]) { DB[vk] = vr; (DBB[vk.slice(0, 2)] || (DBB[vk.slice(0, 2)] = [])).push(vk); } }
      });
      DBN = Object.keys(DB).length;
      CN = {}; SBC = {}; SB = null; SIDX = null; DIRTY = true; tieredCache = {}; mark("db"); seedNames(); if (D && scans.length) render();   // before any prices are in, the poll's render is the first real one
    }).catch(function () {});
  }

  // ---------- search: every item in the game, shortcuts people type in chat (GFA, WG, WLR), scroll percents, small typos
  var ABBR = {}, SIDX = null, SSTOP = { of: 1, the: 1, a: 1, "for": 1, scroll: 1 };
  var TIERPCT = { "100": "lesser", "60": "intermediate", "10": "greater" };
  function nrm(x) { return String(x).toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function searchIndex() {
    if (SIDX) return SIDX;
    var seen = {}, arr = [];
    function add(n) {
      var k = String(n).toLowerCase(); if (seen[k]) return; seen[k] = 1;
      var tm = /scroll: (\w+)$/.exec(k), base = tm ? k.replace(/: \w+$/, "") : k;
      var iw = base.split(/[^a-z0-9]+/).filter(function (w) { return w && !SSTOP[w]; });
      var r = DB[k];
      arr.push({ n: n, k: k, nk: nrm(k), base: base, nb: nrm(base), tier: tm ? tm[1] : "", w: k.split(/[^a-z0-9]+/).filter(Boolean), ini: iw.map(function (w) { return w[0]; }).join(""), cash: !!(r && r[4]) });
    }
    // misread scraps the price list hides stay out of search too
    if (D) D.list.forEach(function (i) { if (/\u2026$/.test(i.item) || /^Scroll: /.test(i.item)) return; if (!DB[i.item.toLowerCase()] && !(i.n >= MIN)) return; add(i.item); });
    Object.keys(DB).forEach(function (k) { add(DB[k][0]); });
    if (D) SIDX = arr;
    return arr;
  }
  function dlev(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    var prev = [], cur, i, j; for (j = 0; j <= b.length; j++) prev[j] = j;
    var pp = null; for (i = 1; i <= a.length; i++) { cur = [i]; var lo = i; for (j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1); if (cur[j] < lo) lo = cur[j]; } if (lo > cap) return cap + 1; pp = prev; prev = cur; }
    return prev[b.length];
  }
  var QROLL = null, PENDROLL = null, ROLLMISS = null;
  // returns [{n, score, why}] best first. strong matches score 450 and up; typo matches stay under 300.
  function searchItems(q, limit) {
    var ql = String(q || "").toLowerCase().trim(); if (!ql) return [];
    if (!searchItems.inner) QROLL = null;   // only the query typed last can ask for a roll
    // a roll typed with the item ("5 att wg", "work gloves +3 att") finds the item, then opens that roll's listings
    // the stat can be any word people use: att, attack, watk, matt, magic attack, str, dex, int, luk, wdef, acc...
    var RW = "(crit damage|crit dmg|cdmg|crit rate|crit|magic attack|magic att|weapon attack|attack|att|watk|atk|w\\.?att|matt|matk|m\\.?att|str|dex|int|luk|w\\.?def|wdef|m\\.?def|mdef|acc|accuracy|avoid|speed|jump|hp|mp)";
    var rm = new RegExp("(^|\\s)\\+?(\\d{1,3})\\s*" + RW + "(?![a-z])").exec(ql) || new RegExp("(^|\\s)" + RW + "\\s*\\+?(\\d{1,3})(?![0-9%])").exec(ql);
    var cm0 = /(^|\s)(clean|unscrolled|stock)(?=\s|$)/.exec(ql);
    if (cm0) { var rest0 = ql.replace(cm0[0], " ").replace(/\s+/g, " ").trim(); if (rest0) { QROLL = { k: "CLEAN", v: 0, at: Date.now() }; ql = rest0; } }
    if (rm) {
      var rword = isNaN(rm[2]) ? rm[2] : rm[3], rv = +(isNaN(rm[2]) ? rm[3] : rm[2]);
      var rk = /^(crit ?d|cdmg)/.test(rword) ? "CRITDMG" : /^crit/.test(rword) ? "CRIT" : /^(magic|matt|matk|m\.?att)/.test(rword) ? "MATT" : /^(att|attack|weapon|watk|atk|w\.?att)/.test(rword) ? "ATT" : /def/.test(rword) ? (/^m/.test(rword) ? "MDEF" : "WDEF") : rword === "accuracy" ? "ACC" : rword.toUpperCase();
      var rest = ql.replace(rm[0], " ").replace(/\s+/g, " ").trim();
      if (rest && rv > 0 && rv <= (/^(HP|MP)$/.test(rk) ? 300 : 40)) { QROLL = { k: rk, v: rv, at: Date.now() }; ql = rest; }
    }
    var tier = "";
    ql = ql.replace(/(^|[^0-9])(100|60|10)\s*%/, function (m, a, n) { tier = TIERPCT[n]; return a + " "; });
    if (!tier) { var bm = /(^|\s)(100|60|10)(\s|$)/.exec(ql); if (bm && ql.replace(bm[0], " ").trim()) { tier = TIERPCT[bm[2]]; ql = ql.replace(bm[0], " "); } }
    var cs = /\bchaos\b/.test(ql); if (cs) { tier = "chaos"; ql = ql.replace(/\bchaos\b/, " "); }
    ql = ql.replace(/\s+/g, " ").trim();
    var nq = nrm(ql), toks = ql.split(/[^a-z0-9]+/).filter(Boolean);
    var to = nq && ABBR[nq] ? ABBR[nq].toLowerCase() : "";
    var out = [];
    searchIndex().forEach(function (e) {
      if (tier && e.tier !== tier) return;
      var sc = 0, why = "";
      if (!nq) sc = 500;
      else {
        if (to && (e.k === to || e.base === to)) { sc = 1000; why = ABBR[nq]; }
        else if (e.nk === nq || e.nb === nq) sc = 950;
        else if (e.k.indexOf(ql) === 0 || e.nk.indexOf(nq) === 0) sc = 800;
        else if (nq.length >= 2 && e.ini === nq) { sc = 700; why = "initials"; }
        else if (toks.every(function (t) { return e.w.some(function (w) { return w.indexOf(t) === 0; }); })) sc = 600;
        else if (nq.length >= 3 && e.nk.indexOf(nq) >= 0) sc = 500;
        else if (nq.length >= 5 && e.nk.replace(/and|of|the|for/g, "").indexOf(nq) >= 0) sc = 480;   // "inkwash"
        else if (toks.every(function (t) { return e.k.indexOf(t) >= 0; })) sc = 450;
        else if (toks.some(function (t) { return t.length >= 4; })) {
          var dist = 0, ok = toks.every(function (t) { if (t.length < 4) return e.w.some(function (w) { return w.indexOf(t) === 0; }); var cap = t.length >= 7 ? 2 : 1, best = cap + 1; e.w.forEach(function (w) { var d = dlev(t, w.slice(0, t.length + 1), cap); if (d < best) best = d; d = dlev(t, w, cap); if (d < best) best = d; }); dist += best; return best <= cap; });
          if (ok) { sc = 280 - dist * 30; why = "close match"; }
        }
      }
      if (!sc) return;
      var it = D && D.byName[e.n];
      // items with real prices are what people are looking for
      if (it) sc += 150 + Math.min(40, Math.log(1 + (it.salesN || 0) + it.n / 4) * 8);
      if (e.cash) sc -= 25;
      if (!it && sc < 1000) sc -= 40;
      out.push({ n: e.n, score: sc, why: why, it: it || null });
    });
    out.sort(function (a, b) { return b.score - a.score || a.n.length - b.n.length; });
    if (out.length && out[0].score >= 450) { var cut = Math.max(420, out[0].score - 420); out = out.filter(function (r) { return r.score >= cut; }); }
    else if (out.length) { var top = out[0].score; out = out.filter(function (r) { return r.score >= top - 110; }).slice(0, 8); }
    // nothing at all: a word that isn't in any item name ("brown work gloves" for Work Gloves) is dropped, one at a time
    if (!out.length && toks.length > 1 && !searchItems.inner) {
      searchItems.inner = true;
      try {
        for (var dk = 0; dk < toks.length && !out.length; dk++) {
          var q2 = toks.filter(function (_, x) { return x !== dk; }).join(" ");
          out = searchItems((tier ? q2 + " " + ({ lesser: "100%", intermediate: "60%", greater: "10%" }[tier] || "") : q2), limit).map(function (r) { return { n: r.n, score: Math.min(r.score, 440) - 60, why: r.why }; });
        }
      } finally { searchItems.inner = false; }
    }
    return limit ? out.slice(0, limit) : out;
  }
  function idOf(name) { var r = dbRow(name); return r ? r[1] : 0; }

  // ---------- tidying names read off the screen
  // Shop text often turns a W into VW, Vv, YV or a yen sign, cuts long names short, and picks up stray letters.
  function cleanName(raw) {
    var n = String(raw || "").replace(/Â/g, "").replace(/â€\S?/g, "").replace(/[‘’]/g, "'").replace(/[“”—–]/g, "").replace(/¥/g, "V");
    var cut = /\(name cut off\)\s*$|\.{2,}[\s.,;]*$|…[\s.,;]*$/.test(n), tl = /\(tier cut off\)\s*$/.test(n);
    n = n.replace(/\((name|tier) cut off\)\s*$/, "").replace(/(\.{2,}|…)[\s.,;]*$/, "");
    n = n.replace(/(^|[\s-])(?:[VY][VvWwYy]+|v[VvWwYy]+|W[WwVv]+)(?=[a-z])/g, "$1W");
    n = n.replace(/\bS[ce][xcr]?[oa][l1|][l1|]?(?=[:\s]|$)/g, "Scroll");                 // "Sexoll", "Scoll"
    n = n.replace(/\s+(?:to|t0|TO|T0)\s+S\w{0,3}\s*$/, "");                               // "Garnet TO SELL" from chat
    n = n.replace(/\bBott\w*?ear\b/g, "Bottomwear").replace(/\b([A-Z])\1(?=[a-z]{2})/g, "$1");
    // letters the screen reader swaps in known names: Retum, Eartings, Paletie, Alfac, Cal's Eye
    n = n.replace(/\bRetum\b/g, "Return").replace(/\bEartings?\b/g, "Earrings").replace(/\bPalet[il1t]e\b/g, "Palette").replace(/\bAlfac/g, "Attac").replace(/\bA(?:lt|tl|l1|1t|tt|lf)ac(?=k|\b)/g, "Attac").replace(/\bCal's Eye\b/g, "Cat's Eye").replace(/\bAtlack\b/g, "Attack").replace(/\bAltack\b/g, "Attack");
    n = n.replace(/\s+/g, " ").trim();
    // a scroll cut off before "Scroll", with the cut word misread: "One-Handed Sword Altac", "Overall Armor LUK Ser",
    // "Two-handed Blunt" (Weapon Attack Scroll). The tier was cut too.
    if (/\s(?:Attac\w*|Atal|Atta?|Altac)$/.test(n) && tieredBase(n.replace(/\s\S+$/, "") + " Attack Scroll")) { n = n.replace(/\s\S+$/, " Attack Scroll"); tl = true; }
    else if (/\b(?:STR|DEX|INT|LUK|DEF|HP|MP|Accuracy|Speed|Jump|Evasion|Avoidability)\s(?:S|Se|Ser|Sc|Scr)$/.test(n) && tieredBase(n.replace(/\s\S+$/, "") + " Scroll")) { n = n.replace(/\s\S+$/, " Scroll"); tl = true; }
    else if (/^(?:One|Two)-handed Blunt$/i.test(n)) { n = n.replace(/Blunt$/i, "Blunt Weapon Attack Scroll"); tl = true; }
    // a tier word on a scroll that has none ("SP Reset Scroll: Greater")
    if (/ Scroll: (?:Lesser|Intermediate|Greater|Chaos|Superior)$/.test(n) && !tieredBase(n.replace(/: \w+$/, ""))) { n = n.replace(/: \w+$/, ""); tl = false; var notier = true; }
    if (/\sScr\w*(\s+\S{1,3})?$/.test(n) && !/Scroll:/.test(n)) { n = n.replace(/\sScr\w*(\s+\S{1,3})?$/, " Scroll"); tl = true; }
    if (/ Scroll$/.test(n) && !/^Return Scroll/i.test(n) && tieredBase(n) && !notier) tl = true;   // SP Reset Scroll has no tiers; its tier is never "cut off"
    n = n.replace(/\s+[^\w\s'&.:()-]+$/, "").trim();
    n = n.replace(/[.,;]+$/, "").trim();                 // "Mystery Palette Exchange." is the same name
    return { s: n, cut: cut, tl: tl };
  }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j; for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var best = i;
      for (j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < best) best = cur[j]; }
      if (best > max) return max + 1; prev = cur;
    }
    return prev[b.length];
  }
  function caps(s) { return (s.match(/\b[A-Z]{2,}\b/g) || []).sort().join(" "); }
  var JUNK = /^(\d+|[A-Za-z]{1,2}|[a-z]\w*|[^\w]+)$/;
  var CONNECT = { "for": 1, of: 1, the: 1, and: 1, on: 1, to: 1, with: 1, "in": 1 };
  var CN = {};
  // OCR look-alikes: l/1/| read for i, t for f, rn for m, ri for n, v or y for w, 0 for o, 5 for s. Two names with the same
  // key are the same name read differently ("lron Hog's Metal Hoot" is Iron Hog's Metal Hoof).
  function ocrKey(s) { return String(s).toLowerCase().replace(/ri/g, "n").replace(/rn/g, "m").replace(/vv/g, "w").replace(/[^a-z0-9|]/g, "").replace(/[l1|]/g, "i").replace(/t/g, "f").replace(/[vy]/g, "w").replace(/ww+/g, "w").replace(/0/g, "o").replace(/5/g, "s"); }
  var OCRIDX = null, OCRN = 0;
  function ocrIndex() {
    var n = DBN; if (OCRIDX && OCRN === n) return OCRIDX;
    OCRIDX = {}; OCRN = n;
    Object.keys(DB).forEach(function (k) { var o = ocrKey(k); (OCRIDX[o] || (OCRIDX[o] = [])).push(k); });
    OCRIDX.__keys = Object.keys(OCRIDX);
    return OCRIDX;
  }
  // the one real item an unknown name was misread from, or ""
  function ocrSnap(k, cut) {
    if (!DBN || k.length < 4) return "";
    var ix = ocrIndex(), o = ocrKey(k), hit = ix[o];
    if (!cut && hit && hit.length === 1) return hit[0];
    if (cut) {
      if (o.length < 8) return "";
      var c = []; ix.__keys.forEach(function (x) { if (x !== "__keys" && x.indexOf(o) === 0) c = c.concat(ix[x]); });
      return c.length === 1 ? c[0] : (c.length > 1 ? c : "");
    }
    if (o.length < 8) return "";
    // a scrap of junk on the end ("Wand Magic Attack 1@", "Adamantium 0", "Iron Hog's Met The"): drop it and look again
    var words = k.split(" ");
    for (var d = 1; d <= 2 && words.length - d >= 1; d++) {
      var tail = words[words.length - d];
      if (!(tail.length <= 4 || /[^a-z']/.test(tail))) break;
      var k2 = words.slice(0, words.length - d).join(" "), o2 = ocrKey(k2);
      if (o2.length < 6) break;
      if (ix[o2] && ix[o2].length === 1) return ix[o2][0];
      if (o2.length >= 10) { var pc = []; ix.__keys.forEach(function (x) { if (x !== "__keys" && x.indexOf(o2) === 0) pc = pc.concat(ix[x]); }); if (pc.length === 1) return pc[0]; }
    }
    // the start of exactly one real name ("lron Hog's Metal")
    if (o.length >= 10) { var pc2 = []; ix.__keys.forEach(function (x) { if (x !== "__keys" && x.indexOf(o) === 0 && x !== o) pc2 = pc2.concat(ix[x]); }); if (pc2.length === 1) return pc2[0]; }
    var mx = o.length >= 14 ? 2 : 1, best = [], bd = mx + 1, cp = caps(k.toUpperCase() === k ? k : String(k));
    ix.__keys.forEach(function (x) {
      if (x === "__keys" || Math.abs(x.length - o.length) > mx) return;
      var d = lev(o, x, mx); if (d > mx) return;
      if (d < bd) { bd = d; best = ix[x].slice(); } else if (d === bd) best = best.concat(ix[x]);
    });
    return best.length === 1 ? best[0] : "";
  }
  // Tidying a name read off the screen is slow (it tries edit distances against the whole item list), so each raw
  // spelling is worked out once and kept. Everything is worked out again when the item list arrives and once an
  // hour, so a name's place can still change as more spellings of it come in.
  var CNC = { cl: {}, out: {}, db: -1, at: 0 }, NAMES_IN = null;
  // bump when cleanName or the name resolver changes, so a published names.json from older rules is not reused
  var CLEANV = 5;   // 5: colour items (Buddy Overall Jeans) kept apart
  window.fmClean = function () { return { cl: CNC.cl, out: CNC.out, v: CLEANV }; };
  window.fmQA = { statsFit: function (n, x) { return statsFit(n, x); }, statsFix: function (n, x) { return statsFix(n, x); }, canonAll: function (r) { return canonAll(r); }, pick: function (n) { pick(n); }, items: function () { return D ? D.list.map(function (i) { return i.item; }) : []; }, item: function (n) { return D && D.byName[n]; }, all: function () { return D ? D.list : []; }, D: function () { return D; } };
  // the server runs this same page and publishes the tidied spelling of every raw name it saw; seeded here, the
  // first build only has to tidy names that are new since
  function seedNames() { if (NAMES_IN && NAMES_IN.v === CLEANV && DBN && !Object.keys(CNC.cl).length) { CNC = { cl: NAMES_IN.cl, out: NAMES_IN.out || {}, db: DBK.length, at: Date.now() }; NAMES_IN = null; } }
  fetch(LIVE + "data/names.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.cl && Date.now() - (j.at || 0) < 2 * 864e5) { NAMES_IN = j; mark("namesIn"); seedNames(); } }).catch(function () {});
  function canonAll(raws) {
    var cl = {}, cnt = {}, spell = {}, known = {};
    var fresh = CNC.db !== DBK.length || Date.now() - CNC.at > 36e5;
    if (fresh) { CNC = { cl: {}, out: {}, db: DBK.length, at: Date.now() }; }
    KNOWN.forEach(function (k) { known[k.toLowerCase()] = k; });
    Object.keys(raws).forEach(function (r) {
      if (CNC.cl[r]) { var c0 = cl[r] = CNC.cl[r]; if (!c0.cut) { var k0 = c0.s.toLowerCase(); cnt[k0] = (cnt[k0] || 0) + raws[r]; var sp0 = spell[k0] || (spell[k0] = {}); sp0[c0.s] = (sp0[c0.s] || 0) + raws[r]; } return; }
      var c = cl[r] = CNC.cl[r] = cleanName(r);
      // a name the reader cut short without saying so ("Ink-and-Wash Painting N"): when it isn't an item itself but
      // starts exactly one real item's name, treat it as cut off so it joins that item instead of becoming its own
      if (!c.cut) {
        var lk = c.s.toLowerCase();
        if (lk.length >= 10 && !DB[lk] && !known[lk]) {
          var starts = function (pre) { return (DBB[pre.slice(0, 2)] || []).filter(function (t) { return t.indexOf(pre) === 0 && t !== lk; }); };
          // also with a short scrap of junk on the end dropped ("Horny Mushroom G")
          // or several, all tiers of one scroll ("One-Handed Axe Attack S"): cut off, tier unknown
          var oneBase = function (a) { return a.length > 1 && a.every(function (t) { return / scroll: /.test(t) && t.split(": ")[0] === a[0].split(": ")[0]; }); };
          if (starts(lk).length === 1 || (lk.split(" ").length >= 3 && oneBase(starts(lk))) || (lk.split(" ").length >= 3 && starts(lk).length > 1 && !/ scroll: /.test(starts(lk)[0])) || (/\s\S{1,2}$/.test(lk) && starts(lk.replace(/\s\S{1,2}$/, " ")).length === 1)) c.cut = true;
        }
      }
      if (c.cut) return;
      var k = c.s.toLowerCase(); cnt[k] = (cnt[k] || 0) + raws[r];
      var sp = spell[k] || (spell[k] = {}); sp[c.s] = (sp[c.s] || 0) + raws[r];
    });
    function display(k) {
      if (known[k]) return known[k];
      var sp = spell[k]; if (sp) return Object.keys(sp).sort(function (a, b) { return sp[b] - sp[a] || (/^[A-Z]/.test(b) ? 1 : 0) - (/^[A-Z]/.test(a) ? 1 : 0); })[0];
      return DB[k] ? DB[k][0] : k;
    }
    var solid = Object.keys(cnt).filter(function (k) { return cnt[k] >= 3 || known[k] || DB[k]; });
    Object.keys(known).forEach(function (k) { if (!cnt[k]) solid.push(k); });
    var solidSet = {}; solid.forEach(function (k) { solidSet[k] = 1; });
    function fuzzy(k) {
      if (k.length < 7) return "";
      var mx = k.length >= 12 ? 2 : 1, best = "", bd = 9, bc = 0, cp = caps(display(k));
      var pool = solid.concat(DBB[k.slice(0, 2)] || []).concat(Object.keys(known));
      for (var p = 0; p < pool.length; p++) {
        var t = pool[p]; if (t === k) continue;
        if ((cnt[t] || 0) < (cnt[k] || 0) * 2 && !known[t] && !DB[t]) continue;
        // a short scrap of junk on the end: "Bronze Ore a TO SELL", "Firewood Ty"
        if (k.indexOf(t + " ") === 0) {
          var rest = k.slice(t.length + 1).split(" ")[0], restRaw = display(k).slice(t.length + 1).split(" ")[0];
          if (!CONNECT[rest] && (JUNK.test(restRaw) && (restRaw.length <= 2 || /^[a-z]/.test(restRaw) || /^\d+$/.test(restRaw)))) { var d0 = 0.5; if (d0 < bd) { bd = d0; best = t; bc = cnt[t] || 0; } continue; }
        }
        if (Math.abs(t.length - k.length) > mx) continue;
        var d = lev(k, t, mx); if (d > mx) continue;
        if (caps(display(t)) !== cp) continue;   // never turn DEX into DEF or HP into MP
        // Classic sometimes spells a name a little differently from the old item list; keep ours then
        if (!cnt[t] && (k.replace(/[\s-]/g, "") === t.replace(/[\s-]/g, "") || k === t + "s" || t === k + "s")) continue;
        if (d < bd || (d === bd && (cnt[t] || 0) > bc)) { bd = d; best = t; bc = cnt[t] || 0; }
      }
      return best;
    }
    var out = CNC.out;
    Object.keys(raws).forEach(function (r) {
      if (out[r]) return;
      var c = cl[r], k = c.s.toLowerCase(), res = "";
      if (c.cut) {
        var cand = {}, pre = k;
        var findC = function (pre) {
          solid.forEach(function (t) { if (t.indexOf(pre) === 0 && t !== pre) cand[t] = 1; });
          if (!Object.keys(cand).length) (DBB[pre.slice(0, 2)] || []).forEach(function (t) { if (t.indexOf(pre) === 0) cand[t] = 1; });
        };
        findC(pre);
        // a garbled last scrap ("Painting MN", "Mushroom 0"): try again without it
        if (!Object.keys(cand).length && /\s\S{1,2}$/.test(pre) && pre.length > 10) findC(pre.replace(/\s\S{1,2}$/, " "));
        if (!Object.keys(cand).length) { var oc = ocrSnap(pre, true); if (typeof oc === "string" && oc) cand[oc] = 1; else if (oc && oc.length) oc.forEach(function (t) { cand[t] = 1; }); }
        var cs = Object.keys(cand);
        // several matches: real item names beat other scraps that were also cut short
        if (cs.length > 1) { var real = cs.filter(function (t) { return DB[t] || known[t]; }); if (real.length === 1) cs = real; }
        if (cs.length === 1) res = cs[0];
        else if (cs.length > 1) {
          var bases = {}; cs.forEach(function (t) { bases[t.split(": ")[0]] = 1; });
          var bk = Object.keys(bases);
          if (bk.length === 1 && /scroll$/.test(bk[0])) { out[r] = { n: displayBase(bk[0], cs), tl: true }; return; }
        }
        if (!res) {
          var tails = [" Magic Attack Scroll", " Weapon Attack Scroll", " Attack Scroll", " Coupon"];
          for (var ti = 0; ti < tails.length; ti++) for (var tk = tails[ti].length - 1; tk >= 3; tk--) {
            if (c.s.length > tk + 4 && c.s.slice(-tk) === tails[ti].slice(0, tk)) { out[r] = { n: c.s.slice(0, -tk) + tails[ti], tl: / Scroll$/.test(tails[ti]) }; return; }
          }
        }
        out[r] = res ? { n: display(res), tl: false } : { n: c.s + "\u2026", tl: false };
        return;
      }
      if (!DB[k] && !known[k]) { var sn = ocrSnap(k, false); if (sn && caps(DB[sn][0]) === caps(c.s)) res = sn; }
      if (!res) { if (solidSet[k]) res = k; else res = fuzzy(k) || k; }
      // still nothing: screen scraps like "an | Blue Sauna Robe" or "ee) fom) Return Scroll" carry stray short
      // tokens before the real name. Peel them off one at a time; a scrap that never resolves is marked unknown.
      if (res === k && !DB[k] && !known[k]) {
        var parts = k.split(" "), got = "";
        while (parts.length > 1 && parts[0].length <= 3 && !got) { parts.shift(); var kk = parts.join(" "); if (DB[kk] || known[kk] || solidSet[kk]) got = kk; else { var fz = fuzzy(kk); if (fz) got = fz; } }
        if (got) res = got;
        else if (/[|*\\{}\[\]<>=]/.test(c.s) || (/\)/.test(c.s) && !/\(/.test(c.s)) || /^[^A-Za-z0-9]/.test(c.s)) { out[r] = { n: c.s + "\u2026", tl: false }; return; }
      }
      // a one-off scrap that matches nothing real ("Green Mushro a", "Selectve 5-slot Caaf us") stays out of
      // search and the item lists until it has been seen a few times
      if (!DB[res] && !known[res] && !solidSet[res]) { out[r] = { n: c.s + "\u2026", tl: false }; return; }
      var nm = display(res);
      out[r] = { n: nm, tl: c.tl && !/: (Lesser|Intermediate|Greater|Superior)$/i.test(nm) };
      if (out[r].tl) out[r].n = nm.replace(/: .*$/, "");
    });
    function displayBase(bk, cs) { var d = display(cs[0]); return d.replace(/: .*$/, ""); }
    return out;
  }
  function canon(raw) { return CN[raw] || { n: raw, tl: false }; }
  window.fmNames = function () { return CN; };
  var stCache = {};
  // Classic scrolls are named by tier but players know them by rate: Lesser is the 100%, Intermediate the 60%,
  // Greater the 10% (checked against every tiered scroll's own text). Chaos stays Chaos. Names stay canonical
  // underneath; this is how they read on screen.
  var TIERLBL = { Lesser: "100%", Intermediate: "60%", Greater: "10%", Chaos: "Chaos" };
  function tierLabel(t) { return TIERLBL[t] || t; }
  function showName(name) { var m = /^(.*Scroll): (Lesser|Intermediate|Greater|Chaos|Superior)$/.exec(String(name || "")); return m ? m[1] + " " + tierLabel(m[2]) : name; }
  // Only scrolls the game sells in tiers get a tier: the item list has "X Scroll: Lesser" and friends. AP Reset
  // Scroll, SP Reset Scroll, Return Scroll and other one-offs never do, whatever a row claims.
  function tieredBase(b) { var k = String(b || "").toLowerCase(); if (k in tieredCache) return tieredCache[k]; return tieredCache[k] = !!(DB[k + ": lesser"] || DB[k + ": intermediate"] || DB[k + ": greater"]); }
  function splitTier(name) { var c = stCache[name]; if (c) return c; var m = /^(.*Scroll): (Lesser|Intermediate|Greater|Superior)$/i.exec(name); return stCache[name] = m ? { b: m[1], t: m[2] } : { b: name, t: "" }; }

  // ---------- categories and scroll tags
  var CASH = /^(angel halo|angel wand|baby angel wings|beret|beetle long sleeve|black cat beanie|sky blue cat beanie|orange cat beanie|black enamel shoes|black sunglasses|heart sunglasses|blue bucket hat|blue cap|blue watch|bunny earmuffs|bunny ears|butterfly skirt|cat hat|cat suit|cherub's bow|dollish pink|gold kitty slippers|lined hip-hop pants|meshcap|orange baseball jacket|orange hooded shirt|orange mushroom balloon|orange toy hammer|patissier hat|patissier uniform|pink allstar|pink bunny sweater|purple dorothy dress|rainbow knit|red check rider|red sailor shirt|red sailor skirt|red trainer jacket|red trainer pants|reggae hat|ripped jeans|sailor hat|sailor outfit|sandblasted jeans|slime earrings|slime slippers|slime t-shirt|splash choco boy|splash choco girl|toga|tourist t|white hooded vest|white jeans|white ribboned sailor dress|yellow rainbow sneaks|yellow spatula|selective 5-slot coupon|mystery hair coupon|mystery face coupon|signature hair coupon|signature face coupon|founder's mystery fashion crate|starlight heart scepter|soft chocolate fondue scepter|.* (chat|label) ring|ink-and-.*)$/i;
  var CATNAME = { Cash: "Cash Shop" };
  var catCache = {};
  function category(name) {
    if (catCache[name]) return catCache[name];
    var c = (function () {
      if (CASH.test(name)) return "Cash";
      var r0 = dbRow(name); if (r0 && r0[4]) return "Cash";                     // the item list marks Cash Shop items: SP Reset Scroll is NX, not a scroll
      if (/scroll/i.test(name) && !/^return scroll/i.test(name) && !/reset scroll/i.test(name)) return "Scrolls";
      if (/throwing stars?$|^wooden top$/i.test(name)) return "Stars";
      var id = idOf(name), r = dbRow(name);
      if (id) {
        var t = Math.floor(id / 1e6), sub = Math.floor(id / 1e4);
        if (t === 1) return (r && r[4]) || sub >= 170 ? "Cash" : (sub >= 130 ? "Weapons" : "Equips");
        if (t === 2) return sub === 207 || sub === 233 ? "Stars" : "Use";
        if (t === 3) return "Other"; if (t === 4) return "Etc"; if (t === 5) return "Cash";
      }
      if (/return scroll|potion|water|elixir|pill|salad|cake|lemon|meat|pizza|juice/i.test(name)) return "Use";
      if (/ore$|ingot|plate|leather|feather|bubble|cap$|shell|leg$|head$|wing|ribbon|liquid|spore|tree$|branch|firewood|screw|thread|cloth|wood|gear|skin|fur bundle|^garnet$|^amethyst$|^aquamarine$|^emerald$|^opal$|^sapphire$|^topaz$|^diamond$|^black crystal$|fragment|parchment/i.test(name)) return "Etc";
      if (/coupon|omok|match cards|chair/i.test(name)) return "Other";
      return "Equips";
    })();
    if (DBN) catCache[name] = c;
    return c;
  }
  var SLOT = [["overall armor", "OVR"], ["topwear", "TOP"], ["bottomwear", "BTM"], ["one-handed sword", "1H SW"], ["two-handed sword", "2H SW"], ["one-handed axe", "1H AXE"], ["two-handed axe", "2H AXE"], ["one-handed bw", "1H BW"], ["two-handed bw", "2H BW"], ["one-handed blunt", "1H BW"], ["two-handed blunt", "2H BW"],
    ["pet equip", "PET"], ["earring", "EAR"], ["gloves", "GLV"], ["shoes", "SHOE"], ["shield", "SHLD"], ["cape", "CAPE"], ["hat", "HAT"], ["helmet", "HAT"], ["claw", "CLAW"], ["dagger", "DAG"], ["spear", "SPR"], ["polearm", "PA"], ["crossbow", "XBOW"], ["bow", "BOW"], ["wand", "WAND"], ["staff", "STAFF"], ["1h", "1H"], ["2h", "2H"]];
  var STAT = [["magic def", "MDEF"], ["magic att", "MATT"], ["magic attack", "MATT"], ["weapon def", "WDEF"], ["crit", "CRIT"], ["accuracy", "ACC"], ["evasion", "AVOID"], ["avoidability", "AVOID"], ["attack", "ATT"], ["def", "DEF"], ["speed", "SPD"], ["jump", "JUMP"], ["int", "INT"], ["str", "STR"], ["dex", "DEX"], ["luk", "LUK"], ["hp", "HP"], ["mp", "MP"]];
  function scrollTag(name) {
    if (category(name) !== "Scrolls") return "";
    var n = name.toLowerCase().replace(/scroll.*$/, ""), slot = "", stat = "";
    for (var i = 0; i < SLOT.length; i++) if (n.indexOf(SLOT[i][0]) > -1) { slot = SLOT[i][1]; break; }
    for (var j = 0; j < STAT.length; j++) if (new RegExp("\\b" + STAT[j][0]).test(n)) { stat = STAT[j][1]; break; }
    return (slot + " " + stat).trim();
  }
  // Which classes use an item: from the item list, or for scrolls, from the weapon they're for.
  var SCROLLCLASS = [[/claw|dagger/, 8], [/wand|staff/, 2], [/crossbow|bow/, 4], [/sword|axe|blunt|bw\b|spear|polearm|pole arm/, 1]];
  function classMask(name) {
    if (category(name) === "Scrolls") { var n = name.toLowerCase(); for (var k = 0; k < SCROLLCLASS.length; k++) if (SCROLLCLASS[k][0].test(n)) return SCROLLCLASS[k][1]; return 0; }
    var r = dbRow(name); return r ? r[3] : -1;
  }
  function reqLevel(name) { var b = BASE[name]; if (b && b.REQLV != null) return b.REQLV; var r = dbRow(name); return r ? r[2] : -1; }
  var JOBS = [[1, "Warrior"], [2, "Magician"], [4, "Bowman"], [8, "Thief"], [16, "Pirate"]];
  function className(m) { if (m <= 0) return ""; var n = JOBS.filter(function (j) { return m & j[0]; }).map(function (j) { return j[1]; }); return n.length > 2 ? "" : n.join(", "); }
  // Icons cut out of real Classic shop windows by the watchers and the stream reader. Classic reuses
  // some item ids for different items, so these beat the old v83 item list whenever we have one.
  // They live in small files by name (data/icons/abc.json) and load only when maplestory.io has no icon.
  var SHARDS = {};
  function shard(k) {
    var p = k.slice(0, 3);
    if (!SHARDS[p]) SHARDS[p] = fetch(LIVE + "data/icons/" + p + ".json").then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    return SHARDS[p];
  }
  function capturedAsync(name) { var k = ocrKey(name); if (k.length < 3) return Promise.resolve(""); return shard(k).then(function (m) { return (m && m[k]) || ""; }); }
  // Classic World's own icons from maplestory.io first; then icons cut from real shop windows.
  var IO = "https://maplestory.io/api/MCW/1/item/";
  // the site's own copy of the icon first (/i/<id>.png, same connection, long cached), then maplestory.io
  function iconSrcs(name) {
    var out = [], r = dbRow(name);
    if (r) { out.push("/i/" + r[1] + ".png"); out.push(IO + r[1] + "/icon"); out.push(IO + r[1] + "/iconRaw"); }
    var v = ICONS[name]; if (typeof v === "string") out.push(v);
    return out;
  }
  function iconSrc(name) { return iconSrcs(name)[0] || ""; }
  // try each source in turn, then a shop window crop, until one loads
  function loadIcon(im, name) {
    var list = iconSrcs(name), k = 0, triedCap = false, again = false;
    // a crop from a shop window is only for items with no icon anywhere; a known item that failed to load (a busy
    // moment on the network) tries its icon once more instead of showing a crop from someone's screen
    function cap() {
      if (list.length) { if (!again) { again = true; k = 0; setTimeout(function () { im.src = list[0] + (list[0].indexOf("?") < 0 ? "?r=1" : ""); }, 2500); } else im.remove(); return; }
      if (triedCap) { im.remove(); return; } triedCap = true; capturedAsync(name).then(function (src) { if (src) im.src = src; else im.remove(); });
    }
    im.onerror = function () { k++; if (k < list.length) this.src = list[k]; else cap(); };
    if (list.length) im.src = list[0]; else cap();
    return true;
  }
  function iconBox(name, cls) {
    var b = el("span", "itc" + (cls ? " " + cls : ""));
    var im = new Image(); im.alt = ""; im.loading = "lazy"; loadIcon(im, name); b.appendChild(im);
    return b;
  }
  function iconImg(name) { var im = new Image(); im.alt = ""; return loadIcon(im, name) ? im : null; }

  // Equipment never comes in bundles; crates, coupons, scrolls, ores and potions can ("11 for 299,999").
  // Cash Shop items are both: NX clothes don't stack, crates and coupons do, so the item list decides.
  function canStack(name, cat) {
    var r = dbRow(name);
    if (r) return !/^Equip/.test(DBK[r[5]] || "");
    return !(cat === "Equips" || cat === "Weapons");
  }

  // ---------- data
  function build() {
    var winDays = +$("win").value, now = Date.now();
    var ordered = scans.filter(function (s) { return Array.isArray(s.rows); }).sort(function (a, b) { return Date.parse(b.at) - Date.parse(a.at); });
    var raws = {};
    ordered.forEach(function (s) { s.rows.forEach(function (r) { raws[r.i] = (raws[r.i] || 0) + 1; }); });
    if (Object.keys(raws).some(function (r) { return !CN[r]; })) CN = canonAll(raws);
    var seen = {}, L = [], who = {}, sellerLast = {}, itemLast = {};
    // A shop row read as "4 for 133,333" when the same seller's same item at the same price was also read
    // as "1 for 133,333" is a misread bundle size; equipment never comes in bundles.
    var oneSeen = {};
    ordered.forEach(function (s) { s.rows.forEach(function (r) { if ((r.q || 1) === 1) oneSeen[String(r.s).toLowerCase() + "|" + canon(r.i).n + "|" + r.p] = 1; }); });
    var latest = ordered.length ? Date.parse(ordered[0].at) : now;
    // One player, one name: IGNs don't care about case, and the reader mixes up look-alike letters
    // (I l i, rn m, vv w, v w, t f). Every spelling of the same name goes under the one seen most.
    var sk = function (n) { return String(n).toLowerCase().replace(/rn/g, "m").replace(/vv/g, "w").replace(/[l|]/g, "i").replace(/t/g, "f").replace(/v/g, "w"); };
    var sc = {}, sbest = {};
    ordered.forEach(function (s) { s.rows.forEach(function (r) { if (r.s) sc[r.s] = (sc[r.s] || 0) + 1; }); });
    Object.keys(sc).forEach(function (n) { var k = sk(n), b = sbest[k]; if (!b || sc[n] > sc[b] || (sc[n] === sc[b] && /^[A-Z]/.test(n) && !/^[A-Z]/.test(b))) sbest[k] = n; });
    ordered.forEach(function (s) { s.rows.forEach(function (r) { if (r.s) { var b = sbest[sk(r.s)]; if (b && b !== r.s) r.s = b; } }); });
    // Shop listings are matched across every scanner: the same seller, item, price and bundle seen by anyone is one
    // listing. Each look at a shop is an observation of how many copies were open and how many showed sold, and
    // sold slots stay in a shop until it closes. So a listing one person saw open and the next person saw sold is a
    // sale, credited to whoever saw it sold first; the open count comes from the newest look; and when a shop that
    // had sold slots later shows fewer, it was reopened, so what sold before is kept and new sold slots add to it.
    var G = {}, GO = [];
    ordered.forEach(function (s, si) {
      var st = Date.parse(s.at), chat = /chat/.test(s.src || ""), by = s.by || s.who || "Maya", stream = !!s.by;
      s.rows.forEach(function (r) {
        var sl = String(r.s).toLowerCase();
        if (ownShop(sl)) return;
        var t = r.t ? r.t * 1000 : st;
        if (!chat) { sellerLast[sl] = Math.max(sellerLast[sl] || 0, t); }
        if (now - t > winDays * DAY && latest - t > winDays * DAY) return;
        var cn = canon(r.i), name = snapScroll(cn.n);
        if (chat && CHATFIX[sl + "|" + name + "|" + r.p]) name = CHATFIX[sl + "|" + name + "|" + r.p];
        if (!chat) itemLast[sl + "|" + name] = Math.max(itemLast[sl + "|" + name] || 0, t);
        var cat0 = category(name), qty = r.q || 1;
        if (qty > 1 && (oneSeen[sl + "|" + name + "|" + r.p] || !canStack(name, cat0))) qty = 1;
        var key = r.s + "|" + name + "|" + r.p + "|" + qty + "|" + (r.k || "");
        if (!chat && r.k !== "b") {
          var g = G[key]; if (!g) { g = G[key] = { obs: {}, x: null }; GO.push(key); }
          var ok = si + "|" + t, o = g.obs[ok] || (g.obs[ok] = { t: t, S: 0, U: 0, s: s, by: by, stream: stream, cn: cn, name: name, qty: qty, cat: cat0 });
          if (r.so) { o.S++; o.rs = o.rs || r; } else { o.U++; o.ru = o.ru || r; }
          if (r.x && !g.x) g.x = r;
          return;
        }
        var prev = seen[key];
        if (prev) { if (r.so && !prev.so) prev.so = true; if (r.x && !prev.x) { prev.x = r.x; prev.xt = r.xt || []; prev.xj = r.xj || ""; } return; }
        L.push(seen[key] = mk(r, s, name, cn, qty, cat0, t, chat, by, stream, !!r.so));
      });
    });
    GO.forEach(function (key) {
      var g = G[key], obs = Object.keys(g.obs).map(function (k) { return g.obs[k]; }).sort(function (a, b) { return a.t - b.t; });
      var cur = 0, hiT = 0, oc = 0, last = obs[obs.length - 1];
      var add = function (o, so, n) { for (var k = 0; k < n; k++) { var l = mk(so ? o.rs : o.ru, o.s, o.name, o.cn, o.qty, o.cat, o.t, false, o.by, o.stream, so); l.oc = oc++; if (!l.x && g.x && g.x.x) { l.x = g.x.x; l.xt = g.x.xt || []; l.xj = g.x.xj || ""; } L.push(l); } };
      obs.forEach(function (o) {
        if (o.S < cur && o.t - hiT > 30 * 6e4) cur = 0;          // the shop was reopened: earlier sales stay counted
        if (o.S > cur) { add(o, true, o.S - cur); cur = o.S; }   // new sold slots since the last look are new sales
        if (o.S >= cur) hiT = o.t;
      });
      add(last, false, last.U);                                  // still open, as of the newest look
    });
    function mk(r, s, name, cn, qty, cat0, t, chat, by, stream, so) {
        var room = fixRoom(r.r) || (chat ? "chat" : "");
        if (stream && room && !/^FM(\d{1,2}| Entrance)?$/.test(room) && !/^[A-Z][A-Za-z'.:-]+( [A-Za-z0-9'.:<>-]+){0,5}$/.test(room)) room = "";   // streams: FM rooms and cleanly read map names
        // Stars, bullets and Wooden Tops show how many are in the set, but the price is for the whole set.
        var set = cat0 === "Stars";
        var sp0 = splitTier(name); if ((sp0.t || cn.tl) && !tieredBase(sp0.b)) { name = sp0.b; cn = { n: cn.n, tl: false }; }   // a tier pinned on a scroll that has none
        if (/^scroll$/i.test(name)) name = "Scroll\u2026";                                                                  // just "Scroll": the real name was cut off
        var l = { i: name, raw: r.i, tl: cn.tl, s: r.s, p: r.p, q: set ? 1 : qty, u: set ? r.p : r.p / qty, n: set ? r.q || 0 : 0, so: so, b: r.k === "b", r: room, c: r.c || 0, t: t, tx: !!r.t, chat: chat, who: by, stream: stream, sk: by + "|" + r.s + "|" + s.at, x: r.x || null, xt: r.xt || null, v: r.v || "", vt: r.vt || 0, xn: r.xn || "", xj: r.xj || "" };
        return l;
    }
    // A shop seen without a channel (the scanner never opened Change Channel) inherits the channel another
    // scanner or stream saw the same seller's shop on, within three hours. A character is on one channel at a time.
    (function () {
      var sight = {};
      L.forEach(function (l) { if (l.c && !l.chat && l.s) (sight[String(l.s).toLowerCase()] || (sight[String(l.s).toLowerCase()] = [])).push(l); });
      var n = 0;
      L.forEach(function (l) {
        if (l.c || l.chat || !l.s) return;
        var ss = sight[String(l.s).toLowerCase()]; if (!ss) return;
        var best = null, bd = 3 * H + 1;
        ss.forEach(function (o) { var d = Math.abs(o.t - l.t); if (d < bd && (!l.r || !o.r || l.r === o.r)) { bd = d; best = o; } });
        if (best) { l.c = best.c; l.ci = true; if (!l.r && best.r) l.r = best.r; n++; }
      });
      if (n) mark("channels inferred " + n);
      // the same for the room: a shop doesn't move while it's open, so a sighting with no Free Market room takes the
      // room another scanner or stream saw the same seller's shop in, on the same channel, within three hours
      var rooms = {}, nr = 0;
      L.forEach(function (l) { if (l.c && !l.chat && l.s && l.r && l.r !== "chat" && !l.ri) (rooms[String(l.s).toLowerCase() + "|" + l.c] || (rooms[String(l.s).toLowerCase() + "|" + l.c] = [])).push(l); });
      L.forEach(function (l) {
        if (!l.c || l.chat || !l.s || l.r) return;
        var rs = rooms[String(l.s).toLowerCase() + "|" + l.c]; if (!rs) return;
        var best = null, bd = 3 * H + 1;
        rs.forEach(function (o) { var d = Math.abs(o.t - l.t); if (d < bd) { bd = d; best = o; } });
        if (best) { l.r = best.r; l.ri = true; nr++; }
      });
      if (nr) mark("rooms inferred " + nr);
    })();
    // A scroll whose tier was cut off joins the tier it's priced like, when one is close.
    var byN = {}; L.forEach(function (l) { if (!l.tl && !l.b) (byN[l.i] || (byN[l.i] = [])).push(l.u); });
    // The hover text gives the success rate, and the rate tells the tier: 100% Lesser, 60% Intermediate, 10% Greater.
    var RATE = { 100: "Lesser", 60: "Intermediate", 10: "Greater" };
    var rateTier = {};
    L.forEach(function (l) {
      var t = l.x && RATE[l.x.SUCCESS];
      if (!t) return;
      var b = l.tl ? l.i : splitTier(l.i).b;
      if (!/Scroll$/.test(b)) {     // the row name was cut off, but the hover text has the full name
        var full = (l.xt || []).map(function (x) { var m = /([A-Za-z][A-Za-z.\- ]+Scroll)\b/.exec(x); return m ? m[1].trim() : ""; }).filter(Boolean)[0];
        if (full) b = snapScroll(full);
        // no full name in the hover either ("Two-handed Sword Attac", 10%): the one scroll whose name starts like this
        if (!full) {
          var pre = b.toLowerCase().replace(/\u2026$/, "").trim(), bases = {};
          if (pre.length >= 8) (DBB[pre.slice(0, 2)] || []).forEach(function (t) { if (t.indexOf(pre) === 0 && / scroll: /.test(t)) bases[t.split(": ")[0]] = 1; });
          var bk = Object.keys(bases);
          if (bk.length === 1) { var row = DB[bk[0] + ": " + t.toLowerCase()] || DB[Object.keys(DB).filter(function (k) { return k.indexOf(bk[0] + ": ") === 0; })[0]]; if (row) b = String(row[0]).split(": ")[0]; }
        }
      }
      if (/Scroll$/.test(b) && tieredBase(b)) { l.i = b + ": " + t; l.tl = false; rateTier[String(l.s).toLowerCase() + "|" + b + "|" + l.p] = t; }
    });
    L.forEach(function (l) { var t = l.tl && rateTier[String(l.s).toLowerCase() + "|" + l.i + "|" + l.p]; if (t) { l.i = l.i + ": " + t; l.tl = false; } });
    // a listing whose hover shows a success rate is a scroll: never price it as the weapon its cut name starts with
    // ...unless the name is a whole real item that isn't a scroll (Bronze Ore, Wolbi Throwing Stars): then the
    // success rate was a misread, and the listing stays the item it says it is
    L.forEach(function (l) {
      if (!(l.x && l.x.SUCCESS != null && !/scroll/i.test(l.i) && !/\u2026$/.test(l.i))) return;
      if (DB[String(l.i).toLowerCase()]) { delete l.x.SUCCESS; return; }
      l.i = l.i + " Scroll\u2026";
    });
    // a colour item read without its colour (older watchers): the colour whose price it sits on, or left out
    var colBase = {}; Object.keys(COLOURS).forEach(function (b) { colBase[b] = Object.keys(COLOURS[b]).map(function (id) { return b + " (" + COLOURS[b][id] + ")"; }); });
    var colMed = {}; L.forEach(function (l) { Object.keys(colBase).forEach(function (b) { if (colBase[b].indexOf(l.i) >= 0 && !l.b) (colMed[l.i] || (colMed[l.i] = [])).push(l.u); }); });
    L.forEach(function (l) {
      var vs = colBase[l.i]; if (!vs) return;
      var near = vs.filter(function (v) { var a = colMed[v]; return a && a.length >= 3 && Math.abs(Math.log(l.u / median(a))) < Math.log(1.5); });
      l.i = near.length === 1 ? near[0] : l.i + "\u2026";
    });
    L.forEach(function (l) {
      if (!l.tl) return;
      var best = "", bd = Math.log(2.5);
      ["Lesser", "Intermediate", "Greater", "Superior"].forEach(function (t) { var n = l.i + ": " + t, a = byN[n]; if (!a || a.length < 2) return; var d = Math.abs(Math.log(l.u / median(a))); if (d < bd) { bd = d; best = n; } });
      if (best) { l.i = best; l.tl = false; }
      else if (!/\u2026$/.test(l.i)) l.i = l.i + "\u2026";   // tier still unknown: a cut-off name, kept out of the table like other cut-offs
    });
    // Before 1:25 PM ET on Oct 17 the watchers guessed a cut-off tier from the text alone and often swapped
    // Greater and Intermediate (Greater is the 10% scroll and usually the cheaper one). Rows from before then are
    // checked against prices seen since, with the icon colour working: a row far off its own tier's price and
    // right on the other tier's is moved over. Only for scrolls where both tiers have 4+ recent prices 2x apart.
    var TIERCUT = Date.UTC(2026, 9, 17, 17, 25), tref = {};
    L.forEach(function (l) { if (l.t < TIERCUT || l.b || l.tl) return; var sp = splitTier(l.i); if (sp.t === "Greater" || sp.t === "Intermediate") (tref[sp.b + "|" + sp.t] || (tref[sp.b + "|" + sp.t] = [])).push(l.u); });
    L.forEach(function (l) {
      if (l.t >= TIERCUT || l.b || l.tl) return;
      var sp = splitTier(l.i); if (sp.t !== "Greater" && sp.t !== "Intermediate") return;
      var other = sp.t === "Greater" ? "Intermediate" : "Greater", a = tref[sp.b + "|" + sp.t], o = tref[sp.b + "|" + other];
      if (!a || !o || a.length < 4 || o.length < 4) return;
      var ma = median(a), mo = median(o); if (Math.max(ma, mo) < 2 * Math.min(ma, mo)) return;
      var da = Math.abs(Math.log(l.u / ma)), dob = Math.abs(Math.log(l.u / mo));
      if (da > Math.log(1.6) && dob < Math.log(1.3)) { l.i = sp.b + ": " + other; l.tierFixed = true; }
    });
    // Trade chat prices typed without the k: "Angel Halo 230" for an item that sells around 230,000 means 230k.
    // Only for chat (shop windows show the full number); the price is scaled by 1,000 or 1,000,000 when that lands
    // within 3x of what the item goes for in shops, and dropped when neither does.
    var shopMed = {}; L.forEach(function (l) { if (!l.chat && !l.b) (shopMed[l.i] || (shopMed[l.i] = [])).push(l.u); });
    Object.keys(shopMed).forEach(function (k) { shopMed[k] = shopMed[k].length >= 3 ? median(shopMed[k]) : 0; });
    L = L.filter(function (l) {
      var m = shopMed[l.i]; if (!l.chat || !m || l.u * 50 > m) return true;
      var fit = [1e3, 1e6].filter(function (f) { var v = l.u * f; return v >= m / 3 && v <= m * 3; })[0];
      if (!fit) return false;
      l.p *= fit; l.u *= fit; l.scaled = fit; return true;
    });
    // One shop, two spellings: the reader sometimes adds or drops a letter at the start or end of a name
    // ("sDububelly" for "Dububelly"). Two names that differ by one edge letter and were seen with the same
    // item at the same price within 6 hours are the same seller, so the rarer spelling joins the commoner one.
    var nameN = {}, byLst = {};
    L.forEach(function (l) { var n = String(l.s).toLowerCase(); nameN[n] = (nameN[n] || 0) + (l.chat ? 1 : 1000); /* a name read off a shop window counts far more than one from chat */ var k = l.i + "|" + l.u; (byLst[k] || (byLst[k] = [])).push(l); });
    var alias = {};
    Object.keys(byLst).forEach(function (k) {
      var g = byLst[k]; if (g.length < 2) return;
      for (var x = 0; x < g.length; x++) for (var y = x + 1; y < g.length; y++) {
        var a = String(g[x].s).toLowerCase(), b = String(g[y].s).toLowerCase(); if (a === b || Math.abs(g[x].t - g[y].t) > 6 * H) continue;
        var long = a.length > b.length ? a : b, short_ = long === a ? b : a;
        var edge = long.length === short_.length + 1 && short_.length >= 3 && (long.slice(1) === short_ || long.slice(0, -1) === short_);
        // trade chat: the same post read a few times can come out "wearsxx", "yearsxx", "yearskx". Same item, same price,
        // within half an hour and names at most 2 letters apart: one person.
        var chatTwin = (g[x].chat || g[y].chat) && Math.abs(g[x].t - g[y].t) <= 30 * 6e4 && short_.length >= 5 && lev(a, b, 2) <= 2;
        // shop windows misread one letter now and then ("Muckwuck" for "Muckywuck"): same item and price within half an hour
        var shopTwin = Math.abs(g[x].t - g[y].t) <= 30 * 6e4 && short_.length >= 5 && lev(a, b, 1) <= 1;
        if (!edge && !chatTwin && !shopTwin) continue;
        var keep = nameN[a] !== nameN[b] ? (nameN[a] > nameN[b] ? a : b) : (a.length <= b.length ? a : b), drop = keep === a ? b : a;
        if (!alias[keep]) alias[drop] = keep;
      }
    });
    if (Object.keys(alias).length) {
      var proper = {}; L.forEach(function (l) { var n = String(l.s).toLowerCase(); if (!alias[n] && !proper[n]) proper[n] = l.s; });
      var seenK = {}, keyOf = function (l) { return String(l.s).toLowerCase() + "|" + l.i + "|" + l.u + "|" + (l.b ? 1 : 0) + "|" + (l.so ? 1 : 0) + "|" + (l.oc || 0) + "|" + Math.floor(l.t / H); };
      L.forEach(function (l) { if (!alias[String(l.s).toLowerCase()]) seenK[keyOf(l)] = l; });
      L = L.filter(function (l) {
        var n = String(l.s).toLowerCase(), to = alias[n], hop = 0; while (to && alias[to] && hop++ < 5) to = alias[to];
        if (!to) return true;
        l.s = proper[to] || l.s; l.sk = l.who + "|" + l.s + "|" + (l.sk || "").split("|").slice(2).join("|");
        var k = keyOf(l), had = seenK[k];
        if (had) { if (l.so) had.so = true; if (l.x && !had.x) had.x = l.x; return false; }      // the same listing under the right name
        seenK[k] = l; return true;
      });
    }
    L.forEach(tipStats);
    sanitizeStats(L);
    learnBase(L);
    missingLines(L);
    // Spot holders: junk listed at a silly price just to keep a shop up (a Mushroom Spore for 50,000).
    // 1. more than 10x the item's median listing, when the item was seen 4 or more times;
    // 2. a Use or Etc item over 10,000 and over 500x what the NPC pays for it (catches items where most listings are spots);
    // 3. listings that sold are trusted, unless they're over 30x the median (usually a spot swapped out, not a sale).
    var grp = {}; L.forEach(function (l) { if (!l.b) (grp[l.i] || (grp[l.i] = [])).push(l.u); });
    var gmed = {}; Object.keys(grp).forEach(function (k) { gmed[k] = grp[k].length >= 4 ? median(grp[k]) : 0; });
    // what the item actually sells for: a Use or Etc item that keeps selling well above its NPC price
    // (Cash Shop coupons the NPC buys for 1 meso) is a real market, so its open listings aren't spots
    var sgrp = {}; L.forEach(function (l) { if (l.so && !l.b) (sgrp[l.i] || (sgrp[l.i] = [])).push(l.u); });
    var smed = {}; Object.keys(sgrp).forEach(function (k) { if (sgrp[k].length >= 3) smed[k] = median(sgrp[k]); });
    var spotN = 0, showSpot = $("f-spot").checked;
    L.forEach(function (l) {
      if (l.b) return;
      var m = gmed[l.i], r = m ? l.u / m : 0, cat = category(l.i), row = dbRow(l.i), npc = row && row[6] ? row[6] : 0;
      // Equips are never thrown out as spot holders: one roll or a good scroll job can be worth 100x a plain one
      // (a +1 crit Work Gloves, 10 attack gloves). A pricey equip with unknown stats stays listed, tagged so you hover
      // it to see what it is, and is left out of typical and the roll bands until its stats are known.
      var eq = cat === "Weapons" || cat === "Equips";
      var tipUp = l.x && l.x._tip && Object.keys(l.x._tip).some(function (k) { return l.x._tip[k] > 0; });
      if (eq) { if (m && r > 10 && !tipUp) l.pricey = true; }        // shown and counted as a sale, but kept out of typical
      else if (m && r > 10 && (!l.so || r > 30)) l.spot = true;
      else if (!l.so && npc && (cat === "Use" || cat === "Etc" || cat === "Other") && l.u >= 10000 && l.u > npc * 500 && !nxOf(l.i) && !(smed[l.i] && l.u <= smed[l.i] * 3)) l.spot = true;
      if (l.spot) spotN++;
    });
    if (!showSpot) L = L.filter(function (l) { return !l.spot; });
    L.forEach(function (l) {
      var w = who[l.who] || (who[l.who] = { name: l.who, stream: l.stream, club: !l.stream && CREW.indexOf(l.who) > -1, sales: 0, rows: 0, shops: {}, days: {} });
      w.rows++; if (l.so && !l.b) w.sales++; if (!l.chat) w.shops[l.sk] = 1; w.days[new Date(l.t).toDateString()] = 1;
    });
    // A witness has to have earned it: a watcher that has caught 50+ sales, a stream, or the crew. Anyone can post
    // two rows under a fresh watcher id, so a fresh id neither sets a price nor vouches for a roll.
    var TRUST_SALES = 50;
    function trusted(name) { var w = name && who[name]; return !!(w && (w.stream || w.club || w.sales >= TRUST_SALES)); }
    MEDSTAT = {}; var stv = {};
    L.forEach(function (l) { if (!l.x || l.b) return; ["ATT", "MATT"].forEach(function (k) { if (l.x[k] != null) (stv[l.i + "|" + k] || (stv[l.i + "|" + k] = [])).push(l.x[k]); }); });
    Object.keys(stv).forEach(function (k) { if (stv[k].length >= 3) MEDSTAT[k] = median(stv[k]); });
    // Classic's item data has no base attack for weapons, so learn it: "att65 (+3)" in chat means an average roll is 62
    var bg = {};
    L.forEach(function (l) { if (!l.x || l.x.g == null) return; ["ATT", "MATT"].forEach(function (k) { if (l.x[k] != null) (bg[l.i + "|" + k] || (bg[l.i + "|" + k] = [])).push(l.x[k] - l.x.g); }); });
    Object.keys(bg).forEach(function (k) { MEDSTAT[k] = median(bg[k]); });
    var items = {};
    L.forEach(function (l) {
      var it = items[l.i] || (items[l.i] = { item: l.i, asks: [], sales: [], bids: [], all: [] });
      it.all.push(l);
      if (l.b) it.bids.push(l); else if (l.so) it.sales.push(l); else it.asks.push(l);
    });
    var ref = latest;
    var list = Object.keys(items).map(function (k) {
      var it = items[k];
      var tn = splitTier(k); it.baseName = tn.b; it.tier = tn.t;
      it.cat = category(k);
      it.n = it.sales.length + it.asks.length;
      it.salesN = it.sales.length;
      it.kind = it.sales.length >= 3 ? "sale" : "ask";
      it.sales.sort(function (a, b) { return b.t - a.t; });
      it.asks.sort(function (a, b) { return b.t - a.t; });
      // Typical leans hard on the present, because Classic prices move fast:
      // 1. the last 24 hours of sales when 5 or more sold in them;
      // 2. else the last 3 days of sales, when at least 3 sold;
      // 3. else the last 10 sales, but if today's asking prices sit well above them, the market has moved,
      //    so typical follows the low end of what sellers are asking today.
      var day = it.sales.filter(function (x) { return now - x.t <= DAY; });
      var d3 = it.sales.filter(function (x) { return now - x.t <= 3 * DAY; });
      var askNow = it.asks.filter(function (x) { return now - x.t <= DAY && !x.chat && !x.pricey; }).map(function (x) { return x.u; });
      var set, basis;
      if (it.cat === "Weapons" || it.cat === "Equips") { day = day.filter(function (x) { return !x.pricey; }); d3 = d3.filter(function (x) { return !x.pricey; }); }
      if (it.kind === "sale") {
        if (day.length >= 5) { set = day; basis = "24h"; }
        else if (d3.length >= 3) { set = d3.slice(0, 10); basis = "3d"; }
        else { set = it.sales.filter(function (x) { return !x.pricey; }).slice(0, 10); if (!set.length) set = it.sales.slice(0, 10); basis = "old"; }
      } else { var plain = it.asks.filter(function (x) { return !x.pricey; }); set = plain.length ? plain.slice(0, 10) : it.asks.length ? it.asks.slice(0, 10) : it.sales.slice(0, 10); basis = "ask"; }
      var su = set.map(function (x) { return x.u; });
      it.typ = median(su); it.lo = quant(su, .25); it.hi = quant(su, .75); it.typN = su.length; it.typDay = basis === "24h";
      it.typSet = set; it.basis = basis; it.moved = false;
      // who supplied the sales behind the typical: a deal announced by the only person who set the price is no deal
      var tw = {}, strm = false; set.forEach(function (x) { if (x.who && trusted(x.who)) tw[String(x.who).toLowerCase()] = 1; if (x.stream) strm = true; }); it.typWho = Object.keys(tw).slice(0, 8);
      // How much to trust the typical: verified when fresh sales were caught by two trusted scanners or a stream
      // agrees; watched when one trusted scanner saw fresh sales; a lead when it rests on old sales or asking prices
      var fresh = basis === "24h" || basis === "3d";
      it.conf = fresh && (it.typWho.length >= 2 || (strm && it.typWho.length >= 1)) ? "verified" : fresh && it.typWho.length >= 1 ? "watched" : "lead";
      if (basis === "old" && askNow.length >= 3 && quant(askNow, .25) > it.typ * 1.15) {
        it.lo = quant(askNow, .1); it.typ = quant(askNow, .25); it.hi = median(askNow); it.moved = true; it.basis = "asknow";
      }
      // 4. a ceiling from what is buyable right now: when three or more different sellers are asking less than the
      //    sales say, the item is worth at most what the third-cheapest of them asks. A morning of sales at 205K
      //    cannot call a scroll a 205K item while a wall of shops is asking 100K for it, and a listing at 108K is
      //    not a deal. Equips are left alone here: their asks differ by roll and the bands below handle them.
      it.capped = false;
      if (it.kind === "sale" && it.cat !== "Weapons" && it.cat !== "Equips") {
        var askBy = {};
        it.asks.forEach(function (x) {
          if (now - x.t > DAY || x.chat || x.pricey || x.spot) return;
          if (it.typ >= 2000 && x.u < it.typ * 0.03) return;   // "1 for 1 mesos" misreads
          var sl = String(x.s).toLowerCase(), lastShop = sellerLast[sl] || 0, lastItem = itemLast[sl + "|" + x.i] || x.t;
          if (lastShop - lastItem > 5 * 6e4) return;           // the shop was seen since without it: sold or pulled
          if (!(sl in askBy) || x.u < askBy[sl]) askBy[sl] = x.u;
        });
        var askLow = Object.keys(askBy).map(function (k) { return askBy[k]; }).sort(function (a, b) { return a - b; });
        if (askLow.length >= 3 && askLow[2] < it.typ * 0.9) {
          it.typSales = it.typ; it.typ = askLow[2]; it.hi = Math.min(it.hi, askLow[2]); it.lo = Math.min(it.lo, askLow[2]);
          it.capped = true; it.cappedN = askLow.length; it.basis = "asks";
        }
      }
      // Equips: one name, very different items. Prices split into low, average and high rolls; known rolls
      // (hovered in game or written in chat) decide the bands when there are enough of them.
      if (it.cat === "Weapons" || it.cat === "Equips") {
        it.equip = true;
        mergeReads(it.all);
        // lines no scroll mix or drop roll can explain, on stats buyers don't pay for, are misreads: dropped from the read
        it.all.forEach(function (l) {
          if (!l.x || l.b || l.x._dropped) return;
          var sp = scrollSplit(it.item, l); if (!sp || !sp.drop || !sp.drop.length) return;
          var nx = Object.assign({}, l.x); sp.drop.forEach(function (k) { delete nx[k]; delete nx[k + "_b"]; if (nx._tip) { nx._tip = Object.assign({}, nx._tip); delete nx._tip[k]; } if (nx._tipx) { nx._tipx = Object.assign({}, nx._tipx); delete nx._tipx[k]; } });
          delete nx._ss; nx._dropped = sp.drop.slice(); l.x = nx;
        });
        it.rolls = it.all.filter(function (x) { return !x.b && x.x && !x.pricey; }).map(function (x) { var p = rollPick(it.item, x); return { l: x, g: p ? sane(p.g, p.k) : null, k: p ? p.k : "", mv: p ? p.mv : {}, combo: p ? p.combo : "", su: slotsUsed(it.item, x) }; }).filter(function (r) { return r.g != null; }).sort(function (a, b) { return a.g - b.g || a.l.u - b.l.u; });
        // a copy whose stats no mix of real scrolls and a real drop roll can make was misread: it stays out of roll prices
        it.rollBad = 0;
        it.rolls = it.rolls.filter(function (r) { var sp = scrollSplit(it.item, r.l); if (sp && !sp.ok) { it.rollBad++; r.l.xodd = 1; return false; } return true; });
        // Roll prices: what each roll sold for in the last two weeks, two or more sales. A 10 ATT Work Gloves and a
        // clean one share a name and nothing else, so deals on equips are judged against the roll, never the name.
        // and by slots used: a pair with 4 of 5 slots left took a scroll (often a failed one), so it is priced only
        // against sales with the same slots left, never against clean ones. Listings without a slots read don't count.
        // Kept per slots used and per natural roll: "0|CRIT+1" is a clean pair with 1 more crit rate than base,
        // "2|ATT+6" took 2 scrolls for 6 attack. A clean +1 crit pair and a clean base pair never share a price.
        var byRoll = {}, rollWho = {}, rollMeta = {};
        it.rolls.forEach(function (r) { if (!r.l.so || now - r.l.t > 14 * DAY || !trusted(r.l.who) || !rollKeyOk(it.item, r.l)) return; var su = slotsUsed(it.item, r.l); if (su == null) return; var rk = su + "|" + r.combo; (byRoll[rk] || (byRoll[rk] = [])).push(r.l.u); rollMeta[rk] = { g: r.g, k: r.k }; (rollWho[rk] || (rollWho[rk] = {}))[String(r.l.who).toLowerCase()] = 1; });
        it.rollTyp = {}; Object.keys(byRoll).forEach(function (g) { if (byRoll[g].length >= 2) it.rollTyp[g] = { typ: median(byRoll[g]), n: byRoll[g].length, g: rollMeta[g].g, k: rollMeta[g].k, who: Object.keys(rollWho[g] || {}).slice(0, 8) }; });
        // Identical copies only: the headline price of an equip is what a plain copy sells for (an average roll with no
        // scroll slots used). Copies known to be scrolled, failed or rolled high or low are priced in Price by roll and
        // never move the headline. With fewer than 3 plain copies sold, the usual sales are used minus the known odd ones.
        var hasSlH = !!(dbBase(it.item) || {}).SLOTS, offL = [], plainL = [];
        it.rolls.forEach(function (r) { var su = slotsUsed(it.item, r.l); if (!r.combo && r.k !== "TOTAL" && (!hasSlH || su === 0)) plainL.push(r.l); else if (r.combo || (su || 0) > 0) offL.push(r.l); });
        var plainS = plainL.filter(function (x) { return x.so && !x.pricey && now - x.t <= 14 * DAY; }).sort(function (a, b) { return b.t - a.t; }).slice(0, 10);
        it.typOff = 0;
        if (plainS.length >= 3) {
          var pu = plainS.map(function (x) { return x.u; });
          it.typ = median(pu); it.lo = quant(pu, .25); it.hi = quant(pu, .75); it.typN = pu.length; it.typSet = plainS; it.basis = "clean"; it.moved = false;
        } else if (it.kind === "sale" && offL.length && it.typSet) {
          var keep = it.typSet.filter(function (x) { return offL.indexOf(x) < 0; });
          if (keep.length >= 3 && keep.length < it.typSet.length) {
            var ku = keep.map(function (x) { return x.u; });
            it.typOff = it.typSet.length - keep.length;
            it.typ = median(ku); it.lo = quant(ku, .25); it.hi = quant(ku, .75); it.typN = ku.length; it.typSet = keep;
          }
        }
        var pts = it.all.filter(function (x) { return !x.b && !x.spot && !x.pricey && now - x.t <= 7 * DAY; }).map(function (x) { return x.u; }).sort(function (a, b) { return a - b; });
        if (pts.length >= 6) {
          var q1 = quant(pts, .25), q3 = quant(pts, .75);
          it.bands = { lo: median(pts.filter(function (v) { return v <= q1; })), mid: it.typ, hi: median(pts.filter(function (v) { return v >= q3; })), n: pts.length, from: "prices" };
          var hasSl0 = !!(dbBase(it.item) || {}).SLOTS, rk0 = it.rolls.filter(function (r) { return !hasSl0 || r.l.x.SLOTS != null; });   // complete reads only
          var kl = rk0.filter(function (r) { return r.g < 0; }).map(function (r) { return r.l.u; }), km = rk0.filter(function (r) { return r.g === 0; }).map(function (r) { return r.l.u; }), kh = rk0.filter(function (r) { return r.g > 0; }).map(function (r) { return r.l.u; });
          if (kl.length >= 2) it.bands.lo = median(kl);
          if (kh.length >= 2) it.bands.hi = median(kh);
          if (km.length >= 3) { it.bands.mid = median(km); it.bands.from = "rolls"; }   // the roll box shows it; the headline stays what the item sold for
          if (it.bands.lo > it.bands.mid) it.bands.lo = it.bands.mid;
          if (it.bands.hi < it.bands.mid) it.bands.hi = it.bands.mid;
        }
        // what each roll goes for: average, +1, +2... from every listing with a known roll
        it.gradeMed = {}; var gg = {}, hasSl = !!(dbBase(it.item) || {}).SLOTS;
        it.rolls.forEach(function (r) { if (now - r.l.t <= 14 * DAY && (!hasSl || r.l.x.SLOTS != null)) (gg[r.g] || (gg[r.g] = [])).push(r.l.u); });
        Object.keys(gg).forEach(function (g) { it.gradeMed[g] = { p: median(gg[g]), n: gg[g].length }; });
      }
      // Last 3 avg follows the typical: on equips the scrolled sales (pricey, or a roll above base) stay out, so a
      // 15M pair of 10 ATT Work Gloves never lands in the 2,000 average of the plain ones
      var l3 = it.sales.filter(function (x) { return !x.pricey && !(it.equip && x.x && rollOf(it.item, x) > 0) && !(it.equip && !x.x && it.typ && x.u > it.typ * 3); });
      if (!l3.length) l3 = it.sales;
      it.last3 = l3.length ? median(l3.slice(0, 3).map(function (x) { return x.u; })) : 0;
      it.lastSale = it.sales[0] || null;
      it.vol = it.sales.reduce(function (a, x) { return a + x.p; }, 0);
      it.bid = it.bids.length ? Math.max.apply(null, it.bids.map(function (x) { return x.u; })) : 0;
      // Mega Deals first: a listing priced 20% or more under typical stays off the public board for its first 10 minutes,
      // so Club and Mega Deals holders see it first. Then it goes public.
      var fresh = it.asks.filter(function (x) { if (!DEALS_ON && it.typ && x.u < it.typ * 0.8 && now - x.t < HOLD) { HELD = Math.min(HELD, x.t + HOLD); return false; } return (latest - x.t <= DAY || now - x.t <= DAY) && !(x.chat && it.typ && x.u < it.typ * 0.3) && !(it.typ >= 2000 && x.u < it.typ * 0.03); })   // "1 for 1 mesos" on a 20K item is a misread
        .sort(function (a, b) { return a.u - b.u || b.t - a.t; });
      // Cheapest now: the lowest listing seen in the last day whose shop nobody has seen since without it. The more
      // people scan, the sooner a sold or pulled listing is caught missing, so this stays fresh as scanners grow.
      fresh.forEach(function (x) {
        var sl = String(x.s).toLowerCase(), lastShop = sellerLast[sl] || 0, lastItem = itemLast[sl + "|" + x.i] || x.t;
        // gone only after a later visit with the item missing for over an hour: watchers re-send an unchanged listing
        // once an hour, so a visit sooner than that can't tell a listing that left from one that wasn't re-sent yet
        x.st = !x.chat && lastShop - lastItem > 65 * 6e4 ? "gone" : now - x.t < 2 * H ? "up" : "old";   // over 2 hours unseen: dimmed, may be gone
        var gv = GONE.items[soldKey(x)]; x.sold = gv && gv[1] > x.t ? gv[0] : 0;
        if (x.sold >= GONE.need || (MYSOLD[soldKey(x)] || 0) > x.t) x.st = "sold";
      });
      // Where to buy, Cheapest now and deals use only shops you can walk to: an FM room on a channel a scanner actually
      // read. Trade chat, megaphones, FM Entrance boards and streams without a room still feed the prices in the
      // background. Club and Mega Deals also see chat posts there, since a seller's name is enough to whisper.
      // Where to buy lists every shop listing; ones without a room read sit below full locations (listRank). Cheapest
      // now is the cheapest shop listing seen in the last 24 hours that nobody has seen gone or sold since.
      it.buy = fresh.filter(function (x) { return !x.chat || DEALS_ON; });
      // a listing priced at a small slice of the typical is almost always a misread (a quantity read as the price, a
      // stream frame caught mid-change): it stays in Where to buy, but never becomes Cheapest now
      var floorU = it.typ > 0 ? it.typ * (it.equip ? 0.08 : 0.15) : 0;
      var still = it.buy.filter(function (x) { return x.st !== "gone" && x.st !== "sold" && !x.chat && !(floorU && x.u < floorU); });
      it.bestL = still[0] || null;
      it.best = it.bestL ? it.bestL.u : 0;
      // A deal needs a typical that rests on sales: 3+ in the last 3 days. Asking prices and a lone old sale don't count.
      var solid = it.basis === "24h" || it.basis === "3d";
      it.deal = solid && it.bestL && it.typ ? 1 - it.bestL.u / it.typ : -1;
      if (it.equip) {
        // Equips: only listings with their stats read, priced against their own roll's sales
        it.rd = [];
        var rdSeen = {}, LG = ladderOf(it);
        // the grade a listing falls in, when that grade's price rests on sales: deals are judged against it, the same
        // price the card shows; otherwise against the listing's exact roll
        var gradeRef = function (x) {
          if (!LG) return null; var hit = null;
          LG.stats.some(function (k) { return LG.views[k].some(function (g) { if (g.basis === "sold" && g.asks.indexOf(x) >= 0) { hit = g; return true; } return false; }); });
          if (!hit) return null; var w = {}; hit.use.forEach(function (l) { if (l.who) w[l.who] = 1; });
          return { typ: hit.mid, n: hit.use.length, who: Object.keys(w), name: hit.name };
        };
        still.forEach(function (x) {
          if (!x.x || x.chat || !rollKeyOk(it.item, x)) return;
          if (!trusted(x.who)) return;                        // stats uploaded by a fresh watcher id prove nothing yet
          var g = rollOf(it.item, x); if (g == null) return;
          var su = slotsUsed(it.item, x); if (su == null) return;
          var rt = gradeRef(x) || it.rollTyp[rollKey(it.item, x, su)]; if (!rt) return;
          var off = 1 - x.u / rt.typ;
          if (off < 0.15 || off > 0.85 || rt.typ - x.u < 100) return;
          if (x.who && String(x.who).toLowerCase() === String(x.s).toLowerCase()) return;   // a seller's own watcher vouching for the seller's own roll
          // sold already: a sale by the same seller at the same price at or after this sighting
          if (it.sales.some(function (y) { return y.s === x.s && y.u === x.u && y.t >= x.t - 6e4; })) return;
          var dk = x.s + "|" + x.u + "|" + g; if (rdSeen[dk]) return; rdSeen[dk] = 1;
          var ks = keyStat(it.item, x.x, x.xj);
          it.rd.push({ s: x.s, p: x.u, q: x.q || 1, g: g, k: ks, v: ks && x.x[ks] != null ? x.x[ks] : null, slots: x.x.SLOTS != null ? x.x.SLOTS : null, used: su, typ: rt.typ, n: rt.n, who: rt.who, grade: rt.name || "", by: x.who || "", t: x.t, r: x.r || "", c: x.c || 0, off: off, l: x });
        });
        it.rd.sort(function (a, b) { return b.off - a.off; });
        it.deal = it.rd.length ? it.rd[0].off : -1;
      }
      var days = {};
      it.all.forEach(function (x) { if (x.b) return; var d = new Date(x.t).toDateString(); (days[d] || (days[d] = [])).push(x.u); });
      var dk = Object.keys(days).sort(function (a, b) { return Date.parse(a) - Date.parse(b); });
      it.daily = dk.map(function (d) { return [Date.parse(d), median(days[d])]; });
      it.trend = it.daily.length >= 3 ? (it.daily[it.daily.length - 1][1] / it.daily[0][1] - 1) : -9;
      it.saleDays = it.sales.length ? Math.max(1, Math.ceil((it.sales[0].t - it.sales[it.sales.length - 1].t) / DAY)) : 0;
      // movement: median of the last 24 hours against the same 24 hours 1, 3 and 7 days earlier
      // joke listings (a fifth or five times the typical price) are left out, and each window needs 5 sightings
      var px = it.all.filter(function (x) { return !x.b && (!it.typ || (x.u >= it.typ / 5 && x.u <= it.typ * 5)); });
      var win = function (a, b) { var v = px.filter(function (x) { return ref - x.t >= a && ref - x.t < b; }).map(function (x) { return x.u; }); return v.length >= 5 ? median(v) : 0; };
      var cur = win(0, DAY);
      it.mv = [1, 3, 7].map(function (d) { var old = win(d * DAY, (d + 1) * DAY); return cur && old ? cur / old - 1 : null; });
      it.chg = it.mv[0] != null ? it.mv[0] : -9;
      var anyMv = it.mv.filter(function (v) { return v != null; });
      it.move = anyMv.length ? Math.abs(anyMv[0]) : -1;
      return it;
    });
    var byName = {}; list.forEach(function (i) { byName[i.item] = i; });
    selfCheck(list, byName, now);
    var sales = L.filter(function (l) { return l.so && !l.b; }), active = L.filter(function (l) { return !l.so && !l.b && (now - l.t <= DAY || latest - l.t <= DAY); });
    var whoAll = rankAll(), whoList = whoAll.slice(0, 10);     // the top 10 of everyone: club watchers, streams and the inbox
    return { list: list, byName: byName, L: L, sales: sales, active: active, latest: latest, who: whoList, whoAll: whoAll, spotN: spotN };
  }

  // ---------- self check: before anyone trusts a price, it has to hold up against the rest of the data.
  // Each failed check adds a flag to the item. A flagged item shows "Check" in the lists and its panel says why,
  // and its deals are shown greyed with no ping, so nobody acts on a number that might be a misread.
  function selfCheck(list, byName, now) {
    list.forEach(function (i) {
      i.flags = [];
      if (!i.typ) return;
      var recent = i.all.filter(function (x) { return !x.b && now - x.t <= 3 * DAY; });
      // 1. a scroll tier whose prices are mixed up with the other tier (a misread tier)
      if (i.tier) {
        ["Lesser", "Intermediate", "Greater"].forEach(function (t) {
          if (t === i.tier) return; var o = byName[i.baseName + ": " + t];
          if (!o || !o.typ || o.n < 4 || Math.max(o.typ, i.typ) < 1.8 * Math.min(o.typ, i.typ)) return;
          var near = recent.filter(function (x) { return Math.abs(Math.log(x.u / o.typ)) < Math.log(1.3) && Math.abs(Math.log(x.u / i.typ)) > Math.log(1.6); }).length;
          if (recent.length >= 4 && near / recent.length >= 0.25) i.flags.push(Math.round(near / recent.length * 100) + "% of the last 3 days' prices match " + t + " (" + short(o.typ) + ") instead, so some rows may be the wrong tier");
          else if (Math.abs(Math.log(i.typ / o.typ)) < Math.log(1.15) && o.n >= 4 && i.n >= 4) i.flags.push("Typical matches the " + t + " tier almost exactly, which usually means tiers got mixed up");
        });
      }
      // 2. our watchers and the streams disagree by more than 2x
      var mine = recent.filter(function (x) { return !x.stream; }).map(function (x) { return x.u; }), strm = recent.filter(function (x) { return x.stream; }).map(function (x) { return x.u; });
      if (mine.length >= 3 && strm.length >= 3) { var a = median(mine), b = median(strm); if (Math.max(a, b) > 2 * Math.min(a, b)) i.flags.push("Our watchers see about " + short(a) + " but streams see about " + short(b)); }
      // 3. typical jumped or crashed more than 2.5x in a week
      var old = i.all.filter(function (x) { return !x.b && now - x.t > 4 * DAY && now - x.t <= 11 * DAY; }).map(function (x) { return x.u; });
      if (old.length >= 3 && i.typN >= 3) { var r = i.typ / median(old); if (r > 2.5 || r < 0.4) i.flags.push("Typical is " + (r > 1 ? r.toFixed(1) + "x" : Math.round((1 - r) * 100) + "% under") + " what it was last week (" + short(median(old)) + ")"); }
      // 4. everyone is listing well under typical: typical is stale, the "deals" are just today's price
      var ask = i.asks.filter(function (x) { return now - x.t <= DAY && !x.chat && !x.spot; }), sellers = {};
      ask.forEach(function (x) { sellers[String(x.s).toLowerCase()] = x.u; });
      var sv = Object.keys(sellers).map(function (k) { return sellers[k]; });
      if (sv.length >= 4 && median(sv) < i.typ * 0.65) i.flags.push(sv.length + " sellers today ask a median " + short(median(sv)) + ", well under typical " + short(i.typ) + ", so typical may be out of date");
      // 5. bundles that don't agree with singles (a misread quantity)
      var single = recent.filter(function (x) { return (x.q || 1) === 1; }).map(function (x) { return x.u; }), multi = recent.filter(function (x) { return (x.q || 1) > 1; });
      if (single.length >= 3 && multi.length) { var ms = median(single), bad = multi.filter(function (x) { return x.u > ms * 4 || x.u < ms / 4; }).length; if (bad >= 2) i.flags.push(bad + " bundle listings price out very differently from singles, so a quantity may be misread"); }
      i.check = i.flags.length > 0;
    });
  }

  // ---------- top cards
  var finderIdx = 0, finderTimer = null;
  function card(label, title, sub, icon, cls, onclick) {
    var d = el("div", "card" + (cls ? " " + cls : ""));
    if (icon && icon.classList && (icon.classList.contains("av") || icon.classList.contains("avb"))) d.appendChild(icon);
    else { var ic = el("span", "ic"); if (icon) ic.appendChild(icon); else ic.appendChild(el("span", "coin")); d.appendChild(ic); }
    var t = el("div"); var sm = el("small"); if (typeof label === "string") sm.textContent = label; else sm.appendChild(label); t.appendChild(sm);
    var st = el("strong"); if (typeof title === "string") st.textContent = title; else st.appendChild(title); t.appendChild(st);
    if (sub) { var sb = el("span", "sub"); if (typeof sub === "string") sb.textContent = sub; else sb.appendChild(sub); t.appendChild(sb); }
    d.appendChild(t);
    if (onclick) { d.tabIndex = 0; d.setAttribute("role", "button"); d.addEventListener("click", onclick); d.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onclick(); } }); }
    return d;
  }
  // ---------- lifetime ranks: the ledger the Scanner ranks job keeps, topped up with everything loaded right now
  var RANKS = null;
  function etDay(t) { return new Date(t - 4 * 3600e3).toISOString().slice(0, 10); }
  function rankAll() {
    var live = {}, streamSet = {};
    ((RANKS && RANKS.stream) || []).forEach(function (n) { streamSet[n] = 1; });
    scans.forEach(function (s) {
      if (!Array.isArray(s.rows)) return;
      var by = String(s.by || s.who || "Maya").slice(0, 24), st = Date.parse(s.at), chat = /chat/.test(s.src || "");
      if (s.by) streamSet[by] = 1;
      var w = live[by] || (live[by] = {});
      s.rows.forEach(function (r) {
        var sl = String(r.s).toLowerCase(); if (ownShop(sl)) return;
        var day = etDay(r.t ? r.t * 1000 : st), c = w[day] || (w[day] = [0, {}, 0]);
        c[2]++; if (r.so && r.k !== "b") c[0]++; if (!chat) c[1][r.s + "|" + s.at] = 1;
      });
    });
    // the same person under two spellings (khrayer from a stream, Khrayer from a watcher) is one scanner, shown
    // under the spelling with a capital, else the one seen first
    var ALIAS = {};
    // one watcher install (same inbox id) that posted under two names, say a typed name and then the name read
    // off the screen, is one scanner shown under its newest name
    ALIAS.yinisera = "yint";   // same scanner, a fresh install that now reads its name off the screen
    var ALIASTO = { yinisera: "Yint" }, latest = {};
    scans.forEach(function (s) { if (s.inbox && s.who) { var cur = latest[s.inbox]; if (!cur || Date.parse(s.at) > cur.t) latest[s.inbox] = { n: String(s.who).slice(0, 24), t: Date.parse(s.at) }; } });
    scans.forEach(function (s) { if (s.inbox && s.who && latest[s.inbox] && latest[s.inbox].n.toLowerCase() !== String(s.who).toLowerCase()) { ALIAS[String(s.who).toLowerCase()] = latest[s.inbox].n.toLowerCase(); ALIASTO[String(s.who).toLowerCase()] = latest[s.inbox].n; } });
    var fold = {}, canonN = function (n) { var k = ALIAS[n.toLowerCase()] || n.toLowerCase(); if (k !== n.toLowerCase()) n = ALIASTO[n.toLowerCase()] || n; if (!fold[k] || (/^[A-Z]/.test(n) && !/^[A-Z]/.test(fold[k]))) fold[k] = n; return k; };
    Object.keys(RANKS && RANKS.who || {}).forEach(canonN); Object.keys(live).forEach(canonN);
    var merge = function (src) { var o = {}; Object.keys(src).forEach(function (n) { var k = ALIAS[n.toLowerCase()] || n.toLowerCase(), d = o[k] || (o[k] = {}); Object.keys(src[n]).forEach(function (day) { var a = src[n][day], b = d[day]; if (!b) { d[day] = Array.isArray(a) ? a.slice() : a; return; } if (Array.isArray(a) && Array.isArray(b)) { b[0] += a[0]; if (typeof a[1] === "object" && typeof b[1] === "object") Object.keys(a[1]).forEach(function (x) { b[1][x] = 1; }); else b[1] += a[1]; b[2] += a[2]; } }); }); return o; };
    var led = merge((RANKS && RANKS.who) || {}), names = {}, wk = etDay(Date.now() - 7 * 864e5); live = merge(live);
    Object.keys(led).forEach(function (n) { names[n] = 1; }); Object.keys(live).forEach(function (n) { names[n] = 1; });
    var streamSetL = {}; Object.keys(streamSet).forEach(function (n) { streamSetL[n.toLowerCase()] = 1; }); streamSet = streamSetL;
    var out = Object.keys(names).map(function (n) {
      var a = led[n] || {}, b = live[n] || {}, days = {}, w = { name: fold[n] || n, stream: !!streamSet[n], club: !streamSet[n] && CREW.indexOf(fold[n] || n) > -1, sales: 0, shopsN: 0, daysN: 0, week: 0, rows: 0 };
      Object.keys(a).forEach(function (d) { days[d] = 1; }); Object.keys(b).forEach(function (d) { days[d] = 1; });
      Object.keys(days).forEach(function (d) {
        var x = a[d] || [0, 0, 0], y = b[d] ? [b[d][0], Object.keys(b[d][1]).length, b[d][2]] : [0, 0, 0];
        var sl = Math.max(x[0], y[0]), sh = Math.max(x[1], y[1]), rw = Math.max(x[2], y[2]);
        w.sales += sl; w.shopsN += sh; w.rows += rw; if (rw) w.daysN++; if (d >= wk) w.week += sl;
      });
      return w;
    }).filter(function (w) { return w.rows > 0; });
    out.sort(function (a, b) { return b.sales - a.sales || b.rows - a.rows || a.name.localeCompare(b.name); });
    out.forEach(function (w, k) { w.rank = k + 1; });
    return out;
  }
  // find your own row: the closest name slides into view and lights up, nobody else is hidden
  var BQ_T = null, BQ_HIT = null;
  function boardFind(q) {
    var all = (D && D.whoAll) || [], hint = $("bqhint");
    if (BQ_HIT) { BQ_HIT.classList.remove("hit"); BQ_HIT = null; }
    q = (q || "").trim().toLowerCase(); if (!q || !all.length) { hint.textContent = ""; return; }
    var best = null, score = -1;
    all.forEach(function (w) {
      var n = w.name.toLowerCase(), sc = n === q ? 4 : n.indexOf(q) === 0 ? 3 : n.indexOf(q) > -1 ? 2 : 0;
      if (!sc) { var i = 0, j = 0; while (i < q.length && j < n.length) { if (q[i] === n[j]) i++; j++; } if (i === q.length) sc = 1; }
      if (sc && (sc > score || (sc === score && best && w.rank < best.rank))) { score = sc; best = w; }
    });
    if (!best) { hint.textContent = "No match"; return; }
    if (best.rank > BSHOWN) { BSHOWN = 9999; renderBoard(); }
    var r = BROWS[best.name]; if (!r) return;
    hint.textContent = "#" + best.rank + " " + best.name;
    r.classList.add("hit"); BQ_HIT = r;
    var box = $("bbody"); if (box.scrollHeight <= box.clientHeight + 2) box = $("bl");
    var top = r.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - box.clientHeight / 2 + r.offsetHeight / 2;
    if (box.scrollHeight > box.clientHeight + 2) box.scrollTo({ top: Math.max(0, top), behavior: "smooth" }); else r.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  $("bq").addEventListener("input", function () { clearTimeout(BQ_T); var v = this.value; BQ_T = setTimeout(function () { boardFind(v); }, 120); });
  $("bq").addEventListener("keydown", function (e) { if (e.key === "Enter" && BQ_HIT) { e.preventDefault(); BQ_HIT.click(); } if (e.key === "Escape") { this.value = ""; boardFind(""); this.blur(); } });
  // ---------- badges: a rank badge for the top 10, and a tier everyone earns by the sales they've caught
  var TIERS = [[100000, "Mythic", "mythic"], [50000, "Titan", "titan"], [25000, "Immortal", "immortal"], [10000, "Legend", "tlegend"], [5000, "Monarch", "monarch"], [2500, "Royal", "royal"], [1000, "Tycoon", "tycoon"], [400, "Broker", "broker"], [150, "Trader", "trader"], [50, "Merchant", "merchant"], [10, "Apprentice", "apprentice"], [0, "Scout", "scout"]];
  // Ko-fi supporters, by in-game name: a heart next to the name on the board, with the tier in the tooltip
  var SUPP = {};
  fetch("https://api.maplefm.gg/public/supporters").then(function (r) { return r.ok ? r.json() : []; }).then(function (l) { (l || []).forEach(function (x) { if (x.ign) SUPP[x.ign.toLowerCase()] = x; }); if (D) renderBoard(); }).catch(function () {});
  function supporterOf(name) { return SUPP[String(name || "").toLowerCase()] || null; }
  function heart(sp) { var h = el("span", "heart", "♥"); h.title = "Supports Club FM on Ko-fi" + (sp.tier ? ": " + sp.tier + " tier" : "") + (sp.lifetime ? " · lifetime supporter" : ""); h.setAttribute("aria-label", h.title); return h; }
  function tierOf(n) { for (var k = 0; k < TIERS.length; k++) if (n >= TIERS[k][0]) return { name: TIERS[k][1], cls: TIERS[k][2], next: k ? TIERS[k - 1] : null, at: TIERS[k][0] }; }
  var CROWN_SVG = '<img src="assets/superstar@4x.png" alt="" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated">';
  var GEM = { mythic: "✦", titan: "⬢", immortal: "✧", tlegend: "★", monarch: "♛", royal: "♛", tycoon: "◆", broker: "◆", trader: "●", merchant: "●", apprentice: "●", scout: "○" };
  function rankBadge(r) {
    var b = el("span", "rbadge r" + Math.min(r, 4)); b.title = r === 1 ? "Number one scanner: wears the Crown" : r <= 3 ? "Top 3 scanner" : "Top 10 scanner";
    if (r === 1) b.innerHTML = CROWN_SVG; else b.textContent = r;
    return b;
  }
  function tierBadge(w) {
    var t = tierOf(w.sales), b = el("span", "tbadge " + t.cls); b.appendChild(el("i", null, GEM[t.cls])); b.appendChild(document.createTextNode(t.name));
    b.title = t.name + ": " + fmt(w.sales) + " sales caught" + (t.next ? ". " + t.next[1] + " at " + fmt(t.next[0]) : ". The top tier.");
    return b;
  }
  // scanner pictures: the character's sprite from classicrank.com's public API (names are IGNs now), looked up
  // in batches of 20 and remembered for a day; the letter avatar stays when there is none
  var PHOTOS = loadLS("fm-photos", {}), PHOTO_Q = [], PHOTO_T = null, PHOTO_WAIT = {};
  function photoFlush() {
    PHOTO_T = null; var names = PHOTO_Q.splice(0, 20); if (!names.length) return;
    fetch("https://classicrank.com/api/v1/characters?names=" + encodeURIComponent(names.join(",")) + "&fields=name,photo").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var got = {}; ((j && j.data) || []).forEach(function (c) { if (c.name) got[c.name.toLowerCase()] = c.photo || ""; });
      names.forEach(function (n) { var k = n.toLowerCase(); PHOTOS[k] = { u: got[k] || "", t: Date.now() }; (PHOTO_WAIT[k] || []).forEach(function (cb) { cb(PHOTOS[k].u); }); delete PHOTO_WAIT[k]; });
      saveLSRaw("fm-photos", JSON.stringify(PHOTOS));
    }).catch(function () { names.forEach(function (n) { delete PHOTO_WAIT[n.toLowerCase()]; }); });
    if (PHOTO_Q.length) PHOTO_T = setTimeout(photoFlush, 2500);
  }
  function charPhoto(name, cb) {
    if (!/^[A-Za-z0-9]{3,13}$/.test(name)) return;
    var k = name.toLowerCase(), c = PHOTOS[k];
    if (c && Date.now() - c.t < 864e5) { if (c.u) cb(c.u); return; }
    if (!PHOTO_WAIT[k]) { PHOTO_WAIT[k] = []; PHOTO_Q.push(name); }
    PHOTO_WAIT[k].push(cb);
    if (!PHOTO_T) PHOTO_T = setTimeout(photoFlush, 400);
  }
  function avatarPhoto(name) {
    var a = avatar(name);
    charPhoto(name, function (u) { var im = new Image(); im.alt = ""; im.onload = function () { a.textContent = ""; a.style.background = "var(--panel2)"; a.classList.add("pic"); a.appendChild(im); }; im.src = u; });
    return a;
  }
  function avatarBadged(w, r) { var a = el("span", "avb"); a.appendChild(avatarPhoto(w.name)); a.appendChild(rankBadge(r)); return a; }
  function finderCard() {
    var w = D.who, n = w.length; if (!n) return card("Top scanner", "Nobody yet", "Start FM Watcher to add prices", null, "finder", openRanks);
    finderIdx = finderIdx % n; var f = w[finderIdx], r = finderIdx + 1;
    var lab = el("span"); lab.appendChild(el("span", "rank" + (r === 1 ? " gold" : ""), (r === 1 ? "THE CROWN · #1" : (f.stream ? "STREAMER #" : "TOP SCANNER #") + r)));
    var sub = el("span", "fsub"); sub.appendChild(tierBadge(f)); if (f.club) sub.appendChild(el("span", "clubtag", "Club")); sub.appendChild(document.createTextNode(fmt(f.sales) + " sales · " + fmt(f.shopsN) + " shops"));
    var d = card(lab, f.name, sub, avatarBadged(f, r), "finder" + (r === 1 ? " crowned" : ""), openRanks);
    d.id = "finder"; d.setAttribute("aria-label", "Top scanner number " + (finderIdx + 1) + ": " + f.name + ". Open the ranks.");
    d.appendChild(el("span", "of", (finderIdx + 1) + " / " + n));
    var bar = el("span", "bar2"), bi = el("i"); bar.appendChild(bi); d.appendChild(bar);
    if (n > 1) requestAnimationFrame(function () { bi.classList.add("go"); });
    return d;
  }
  function rotateFinder() {
    clearInterval(finderTimer);
    finderTimer = setInterval(function () { if (!D || D.who.length < 2 || document.hidden) return; finderIdx = (finderIdx + 1) % D.who.length; var old = $("finder"); if (old) old.replaceWith(finderCard()); }, 6000);
    // the board on the left is the live one; the rotating card only lives on if something still asks for it
  }
  // header: how many people are in the Discord and how many are on right now
  fetch("https://api.maplefm.gg/public/stats").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !j.members || j.members < 25) return; var c = $("disccnt");   // a tiny number reads as an empty room; show it once the server has some people in it c.textContent = " " + fmt(j.members) + (j.online ? " · " + fmt(j.online) + " on" : ""); c.hidden = false;
    $("discpill").title = fmt(j.members) + " in the Club FM Discord, " + fmt(j.online) + " online now. Price checks, scanner help, and the live feed.";
  }).catch(function () {});
  // One walk over every listing per board (redone after a minute, since "live" and "today" move with the clock),
  // shared by the cards, the streamer strip and the live pill, instead of one walk each on every redraw.
  function Lstat() {
    if (!D || !D.L) return null;
    var now = Date.now(), c = D._lst; if (c && now - c.at < 60e3) return c;
    var live = {}, shops = {}, spots = {}, sc = {}, st = {}, by = {}, lastT = 0, L = D.L;
    for (var k = 0; k < L.length; k++) {
      var l = L[k], age = now - l.t; if (l.t > lastT) lastT = l.t;
      if (!l.chat && !l.stream && l.who && age < 15 * 6e4) live[String(l.who).toLowerCase()] = 1;
      if (!l.chat && age <= DAY) { if (l.s) shops[String(l.s).toLowerCase() + "|" + (l.c || 0)] = 1; if (l.r && l.c && /^FM\d+$/.test(l.r)) spots[l.r + "|" + l.c] = 1; if (l.who) (l.stream ? st : sc)[String(l.who).toLowerCase()] = 1; }
      if (l.stream && age <= 7 * DAY) { var w = by[l.who] || (by[l.who] = { name: l.who, rows: 0, sales: 0, last: 0, shops: {} }); w.rows++; if (l.so && !l.b) w.sales++; if (l.t > w.last) w.last = l.t; if (l.s) w.shops[l.s] = 1; }
    }
    var n = Object.keys(shops).length;
    return (D._lst = { at: now, lastT: lastT, live: Object.keys(live).length, streams: by, cov: n ? { shops: n, spots: Object.keys(spots).length, scanners: Object.keys(sc).length, streams: Object.keys(st).length } : null });
  }
  // players whose watcher sent shop rows in the last 15 minutes (streams and chat don't count)
  // Scanners uploading in the last 15 minutes, FM Watcher and the browser scanner alike, counted by the server
  // (/public/scanners, one per person); the board's own rows are the fallback when the server can't be reached.
  var LIVE_N = -1, LIVE_AT = 0;
  function loadLive() {
    if (Date.now() - LIVE_AT < 60e3) return; LIVE_AT = Date.now();
    fetch((window.FM_API || "https://api.maplefm.gg") + "/public/scanners").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || typeof j.live !== "number") return;
      var was = LIVE_N; LIVE_N = j.live; if (was !== LIVE_N && D) renderCards();
    }).catch(function () {});
  }
  setInterval(function () { if (!document.hidden) loadLive(); }, 90e3);
  function liveScanners() { loadLive(); var s = Lstat(), b = s ? s.live : 0; return Math.max(LIVE_N, b); }
  function coverage24() { var s = Lstat(); return s ? s.cov : null; }
  // Streamers whose broadcasts fed the board this week, credited by name with a link to their channel
  function renderStreams() {
    var box = $("bstreams"), list = $("bstr"); if (!box || !D || !D.L) return;
    var now = Date.now(), by = (Lstat() || {}).streams || {};
    var ws = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return (now - b.last < 20 * 6e4) - (now - a.last < 20 * 6e4) || Object.keys(b.shops).length - Object.keys(a.shops).length; });
    box.hidden = !ws.length; if (!ws.length) return;
    var sig = ws.slice(0, 12).map(function (w) { return w.name + Object.keys(w.shops).length + "/" + w.sales + (now - w.last < 20 * 6e4) + ago(w.last); }).join("|");
    if (list.dataset.sig === sig) return; list.dataset.sig = sig;   // nothing changed: leave the strip as it is
    $("bstr-sub").textContent = ws.length + (ws.length === 1 ? " streamer" : " streamers") + " this week";
    list.textContent = "";
    ws.slice(0, 12).forEach(function (w) {
      var a = el("a"); a.href = "https://www.twitch.tv/" + encodeURIComponent(w.name); a.target = "_blank"; a.rel = "noopener"; a.title = "Open " + w.name + "'s Twitch channel. Shops seen on their broadcast feed the board.";
      var im = el("img"); im.src = "assets/emoji/stream.png"; im.alt = ""; a.appendChild(im);
      a.appendChild(el("b", null, w.name));
      if (now - w.last < 20 * 6e4) a.appendChild(el("span", "live", "LIVE"));
      var ns = Object.keys(w.shops).length; a.appendChild(el("small", null, ns + (ns === 1 ? " shop · " : " shops · ") + w.sales + (w.sales === 1 ? " sale" : " sales") + " · " + ago(w.last)));
      list.appendChild(a);
    });
  }
  // Share: the link to this item on the board, or a price card image for Discord and chat
  function shareBox(i) {
    var box = el("div", "share");
    var link = el("button", "sh", "🔗"); link.type = "button"; link.title = "Copy a link to this item (shows its picture and price when pasted in Discord)";
    var img = el("button", "sh", "🖼️"); img.type = "button"; img.title = "Copy a price card image (or download it)";
    function flash(b, t) { var o = b.textContent; b.textContent = t; b.classList.add("done"); setTimeout(function () { b.textContent = o; b.classList.remove("done"); }, 1400); }
    link.addEventListener("click", function (e) { e.stopPropagation(); var url = ITEMPAGES[i.item] ? "https://maplefm.gg/item/" + itemSlug(i.item) + "/" : "https://maplefm.gg/#item=" + encodeURIComponent(i.item); (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { flash(link, "✓"); }, function () { prompt("Copy this link", url); }); });
    img.addEventListener("click", function (e) { e.stopPropagation(); priceCard(i).then(function (blob) {
      var ok = window.ClipboardItem && navigator.clipboard && navigator.clipboard.write;
      var p = ok ? navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]) : Promise.reject();
      p.then(function () { flash(img, "✓"); }, function () { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = i.item.replace(/[^\w]+/g, "-") + "-clubfm.png"; a.click(); flash(img, "⬇"); });
    }); });
    box.appendChild(link); box.appendChild(img); return box;
  }
  function priceCard(i) {
    var W = 640, Hh = 336, c = document.createElement("canvas"); c.width = W * 2; c.height = Hh * 2; var g = c.getContext("2d"); g.scale(2, 2);
    var grad = g.createLinearGradient(0, 0, W, Hh); grad.addColorStop(0, "#5b3df5"); grad.addColorStop(1, "#2a1763"); g.fillStyle = grad; g.fillRect(0, 0, W, Hh);
    g.fillStyle = "rgba(255,255,255,.08)"; g.beginPath(); g.arc(W - 70, 60, 150, 0, 7); g.fill();
    function txt(t, x, y, size, weight, color) { g.font = weight + " " + size + "px Inter, Segoe UI, Arial"; g.fillStyle = color; g.fillText(t, x, y); }
    txt("CLUB FM", 62, 40, 15, "900", "#f5c542"); txt("maplefm.gg", 140, 40, 15, "800", "#fff"); txt("Priced by watched sales", 236, 40, 13, "700", "rgba(255,255,255,.7)");
    txt(showName(i.item), 28, 118, 34, "800", "#fff");
    var line = i.hi > i.lo && short(i.lo) !== short(i.hi) ? short(i.lo) + " – " + short(i.hi) : fmt(i.typ);
    txt(line, 28, 180, 52, "900", "#ffd166"); txt("typical " + fmt(i.typ) + " mesos", 28, 210, 16, "700", "rgba(255,255,255,.85)");
    var conf = i.conf ? (CONFTXT[i.conf] || [""])[0] : ""; var sub = [conf, fmt(i.salesN) + " sales", i.typWho && i.typWho.length ? i.typWho.length + (i.typWho.length === 1 ? " scanner" : " scanners") : ""].filter(Boolean).join(" · ");
    txt(sub, 28, 244, 15, "700", "rgba(255,255,255,.8)");
    if (i.mv[0] != null) { var r = Math.round(i.mv[0] * 100); txt((r > 0 ? "▲ " : r < 0 ? "▼ " : "") + Math.abs(r) + "% in 24h", 28, 272, 15, "800", r > 0 ? "#8fe3a8" : r < 0 ? "#ff9b8f" : "#ddd"); }
    txt(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · MapleStory Classic Free Market", 28, Hh - 22, 12, "700", "rgba(255,255,255,.6)");
    // our logo top left, so a shared picture always says where it came from
    var logo = new Image(); logo.src = "/clubfm-icon-512.png";
    var logoP = new Promise(function (ok) { logo.onload = function () { try { g.drawImage(logo, 26, 18, 28, 28); } catch (e) {} ok(); }; logo.onerror = ok; setTimeout(ok, 1500); });
    return logoP.then(function () { return new Promise(function (res) {
      var done = function () { c.toBlob(function (b) { res(b); }, "image/png"); };
      var srcs = iconSrcs(i.item), k = 0, fin = false, im = new Image(); im.crossOrigin = "anonymous";
      var end = function () { if (fin) return; fin = true; done(); };
      im.onload = function () { try { g.fillStyle = "rgba(255,255,255,.14)"; g.beginPath(); g.roundRect(W - 150, 70, 120, 120, 22); g.fill(); var sc = Math.min(96 / im.width, 96 / im.height, 3); var w = im.width * sc, h = im.height * sc; g.imageSmoothingEnabled = false; g.drawImage(im, W - 90 - w / 2, 130 - h / 2, w, h); } catch (e) {} end(); };
      // the icon host may refuse cross-origin drawing; then the icon a watcher captured in game (same origin) is used
      im.onerror = function () { k++; if (k < srcs.length) im.src = srcs[k]; else capturedAsync(i.item).then(function (src) { if (src && !fin) { im.onerror = end; im.src = src; } else end(); }, end); };
      if (srcs.length) im.src = srcs[0]; else im.onerror(); setTimeout(end, 3000);
    }); });
  }
  // ---------- front door: trust strip, quick picks and the deal next to the search
  var HOOK_T = null, HOOK_K = 0;
  function renderCards() {
    renderStreams();
    var c = $("cards"); c.textContent = "";
    var k = D.preview && D.kpi;
    function st(icon, num, txt, tag, fn, tip) {
      var s = el(tag || "span", "st"); if (tag === "button") { s.type = "button"; s.addEventListener("click", fn); } if (tip) s.title = tip;
      s.appendChild(document.createTextNode(icon + " ")); s.appendChild(el("b", null, num)); s.appendChild(document.createTextNode(" " + txt)); return s;
    }
    c.appendChild(st("🧾", fmt(k ? k.sales : D.sales.length), "sales caught"));
    c.appendChild(st("🛒", fmt(k ? k.active : D.active.length), "for sale right now"));
    var cov = coverage24();
    if (cov) c.appendChild(st("🗺️", fmt(cov.shops), "shops read today", "button", openCoverage, fmt(cov.spots) + " of " + (40 * 20) + " room and channel spots visited in the last day, by " + cov.scanners + (cov.scanners === 1 ? " scanner" : " scanners") + (cov.streams ? " and " + cov.streams + (cov.streams === 1 ? " stream" : " streams") : "") + ". Click for the coverage map."));
    // Scan now: starts the browser scanner right here (assets/scannow.js); without it, the Earn page
    var liveN = liveScanners(), help;
    if (window.openScanNow) {
      help = el("button", "st scannow"); help.type = "button"; help.setAttribute("data-scannow", ""); help.title = "Scan shops from this tab while you browse the Free Market and earn from them. No download.";
      var ss = el("img"); ss.src = "/assets/superstar@4x.png"; ss.alt = ""; help.appendChild(ss);
      help.appendChild(el("b", null, "Scan from this tab"));
      if (liveN > 2) { var lv = el("span", "scn live"); lv.appendChild(el("i")); lv.appendChild(document.createTextNode(liveN + " scanning now")); help.appendChild(lv); }
      else help.appendChild(el("span", "scn", "earn, no download"));
    } else {
      help = el("a", "st"); help.href = "contribute.html"; help.title = "Run FM Watcher while you shop and get paid for the shops you browse";
      help.appendChild(el("span", "heart", "♥"));
      if (liveN >= 2) { help.appendChild(el("b", null, liveN + " scanning now")); help.appendChild(document.createTextNode(" · Earn by scanning")); }
      else help.appendChild(el("b", null, "Earn by scanning"));
    }
    c.appendChild(help);
    // the hook: the biggest sales caught, one at a time
    // skip one-off sales far above the item's normal price (a lucky roll or a typo reads as a mistake next to "about 2K")
    var sane = function (l) { var it = D.byName[l.i]; return !it || !it.typ || l.p <= it.typ * 8; };
    var seenBig = {}, big = D.sales.filter(sane).sort(function (a, b) { return b.p - a.p; }).filter(function (l) { if (seenBig[l.i]) return false; seenBig[l.i] = 1; return true; }).slice(0, 5);
    if (!big.length && k && k.big && sane(k.big)) big = [k.big];
    var hook = el("button", "st hook"); hook.type = "button"; c.appendChild(hook);
    function showHook() {
      if (!big.length) { hook.textContent = ""; return; }
      var b = big[HOOK_K % big.length], sp = el("span"); hook.textContent = "";
      var im = iconImg(b.i); if (im) hook.appendChild(im);
      sp.appendChild(document.createTextNode("Big sale caught: ")); sp.appendChild(el("b", null, showName(b.i))); sp.appendChild(document.createTextNode(" for ")); sp.appendChild(money(b.p));
      hook.appendChild(sp); hook.onclick = function () { ev("#pick:" + b.i); pick(b.i); jumpToCard(); };
      hook.title = "Biggest sales the scanners caught. Click to see the item.";
    }
    showHook(); clearInterval(HOOK_T);
    if (big.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) HOOK_T = setInterval(function () { HOOK_K++; showHook(); }, 6000);
    renderPicks(); renderHeroDeal();
  }
  // board events for the popular list and the traffic report: no cookies, same counter as page visits
  var EV_SEEN = {};
  function ev(p) {
    try {
      if (EV_SEEN[p]) return; EV_SEEN[p] = 1;
      var d = JSON.stringify({ p: String(p).slice(0, 120), r: "", q: "" }), u = "https://api.maplefm.gg/hit";
      if (navigator.sendBeacon) navigator.sendBeacon(u, new Blob([d], { type: "text/plain" })); else fetch(u, { method: "POST", body: d, keepalive: true, mode: "no-cors" });
    } catch (e) {}
  }
  // Sold buttons: anyone can mark a listing in Where to buy as sold. Enough players (the Worker says how many) and it
  // drops out of Cheapest now, deals and alerts until a scan sees it again. Your own mark hides it for you at once.
  var HOLD = 10 * 6e4, HELD = Infinity;   // when the next held-back deal goes public
  var GONE = { need: 2, items: {} }, GONE_AT = 0, MYSOLD = {};
  try { MYSOLD = JSON.parse(localStorage.getItem("fm-sold") || "{}"); } catch (e) {}
  function soldKey(x) { return (String(x.s) + "|" + x.i + "|" + x.u).toLowerCase(); }
  function loadGone(force) {
    if (!force && Date.now() - GONE_AT < 60e3) return; GONE_AT = Date.now();
    fetch(ACCT + "/public/gone").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.items) return; var sig = JSON.stringify(j); if (sig === JSON.stringify(GONE)) return;
      GONE = j; if (D) { DIRTY = true; render(); }
    }).catch(function () {});
  }
  function soldBtn(x, mine) {
    var b = el("button", "soldbtn" + (mine ? " on" : ""), mine ? "✓ Sold" : "Sold?"); b.type = "button";
    b.title = mine ? "You marked this sold. It comes back if a scan sees it again." : "Went to buy it and it's gone? Mark it sold. Once " + GONE.need + " players do, it drops off the list until a scan sees it again.";
    b.setAttribute("aria-label", mine ? "You marked this listing sold" : "Mark " + x.s + "'s listing as sold");
    b.addEventListener("click", function (e) {
      e.stopPropagation(); if (mine) return;
      var k = soldKey(x); MYSOLD[k] = Date.now();
      try { var keep = {}; Object.keys(MYSOLD).forEach(function (q) { if (Date.now() - MYSOLD[q] < 2 * DAY) keep[q] = MYSOLD[q]; }); MYSOLD = keep; localStorage.setItem("fm-sold", JSON.stringify(keep)); } catch (er) {}
      b.disabled = true; b.textContent = "✓ Sold";
      fetch(ACCT + "/gone", { method: "POST", body: JSON.stringify({ k: k }) }).then(function (r) { return r.json(); }).catch(function () { return null; }).then(function () { loadGone(true); DIRTY = true; render(); });
    });
    return b;
  }
  // a search or a popular pick always lands on the board, whatever tab was open (My positions, Best deals...)
  function jumpToCard() {
    if (state.tab !== "prices") $("tab-prices").click();
  }
  var POP = null, POP_AT = 0;
  function loadPopular() {
    if (Date.now() - POP_AT < 10 * 60e3) return; POP_AT = Date.now();
    fetch("https://api.maplefm.gg/public/popular").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.items) { POP = j.items; if (D) renderPicks(); } }).catch(function () {});
  }
  // short names under the quick-pick icons: every scroll shares one icon, so the label says which one
  function pickLabel(n) {
    var t = showName(n), m = /^(.*?)\s*Scroll\s*(\d+%)?$/.exec(t.replace(/ for /, " "));
    if (m) t = m[1].replace(/Magic Attack/, "MATT").replace(/Attack/, "ATT").replace(/Defense/, "DEF").replace(/Accuracy/, "ACC").replace(/Avoidability/, "AVOID") + (m[2] ? " " + m[2] : "");
    return t.replace(/^Overall Armor /, "Overall ").replace(/ Exchange Coupon$/, "").replace(/Throwing[- ]Stars?/, "Stars");
  }
  function renderPicks() {
    var box = $("picks"); if (!box || !D) return; loadPopular();
    var score = {}, add = function (i, v) { if (i && i.typ) score[i.item] = (score[i.item] || 0) + v; };
    (POP || []).forEach(function (x) { add(D.byName[x[0]], x[1] * 6); });
    D.list.forEach(function (i) { if (i.n >= MIN && i.salesN) add(i, Math.min(i.salesN, 60) / 10); });
    var top = Object.keys(score).sort(function (a, b) { return score[b] - score[a]; }).slice(0, 10);
    var sig = top.join("|") + top.map(function (n) { var i = D.byName[n]; return i.typ + ":" + (i.mv[0] || 0); }).join(",");
    if (box.dataset.sig === sig) return; box.dataset.sig = sig; box.textContent = "";
    top.forEach(function (n) {
      var i = D.byName[n], b = el("button", "pk"); b.type = "button"; b.setAttribute("role", "listitem");
      b.setAttribute("aria-label", showName(n) + ", about " + short(i.typ) + " mesos");
      var im = iconImg(n); if (im) b.appendChild(im); else b.appendChild(el("span", null, ""));
      b.appendChild(el("span", "pn", pickLabel(n)));
      var mv = i.mv[0]; if (mv != null && Math.abs(mv) >= 0.03) { var a = el("i", mv > 0 ? "up" : "dn", mv > 0 ? "▲" : "▼"); a.title = (mv > 0 ? "Up " : "Down ") + Math.round(Math.abs(mv) * 100) + "% in 24h"; b.appendChild(a); }
      var tip = el("span", "tip"); tip.appendChild(document.createTextNode(showName(n))); tip.appendChild(money(i.typ)); b.appendChild(tip);
      b.addEventListener("click", function () { ev("#pick:" + n); pick(n); jumpToCard(); });
      box.appendChild(b);
    });
  }
  function renderHeroDeal() {
    var a = $("hdeal"); if (!a || !D) return;
    var best = null, lbl = "", txt = "";
    // deals stay with Mega Deals; the front door only shows the biggest mover
    if (!best) {
      D.list.forEach(function (i) { if (i.n >= MIN && i.typ >= 100000 && i.mv[0] != null && (!best || Math.abs(i.mv[0]) > Math.abs(best.mv[0]))) best = i; });
      if (best && Math.abs(best.mv[0]) >= 0.05) { lbl = "Biggest mover today"; txt = (best.mv[0] > 0 ? "▲ " : "▼ ") + Math.round(Math.abs(best.mv[0]) * 100) + "%"; } else best = null;
    }
    a.hidden = !best; if (!best) return;
    var sig = lbl + best.item + txt; if (a.dataset.sig === sig) return; a.dataset.sig = sig; a.textContent = "";
    var im = iconImg(best.item); if (im) a.appendChild(im);
    a.appendChild(el("small", null, lbl)); a.appendChild(el("b", null, showName(best.item))); a.appendChild(document.createTextNode(txt));
    a.onclick = function (e) { e.preventDefault(); ev("#pick:" + best.item); pick(best.item); jumpToCard(); };
  }
  function openSources() {
    var box = $("crew"); box.textContent = "";
    D.who.forEach(function (w, k) { var d = el("div", k === 0 ? "crowned" : ""); d.appendChild(avatarBadged(w, k + 1)); var t = el("span"); var nb = el("b", null, ""); if (w.stream) { var a = el("a", null, w.name); a.href = "https://www.twitch.tv/" + encodeURIComponent(w.name); a.target = "_blank"; a.rel = "noopener"; nb.appendChild(a); } else nb.appendChild(document.createTextNode(w.name)); t.appendChild(nb); var bl = el("span", "fsub"); bl.appendChild(tierBadge(w)); if (w.club) bl.appendChild(el("span", "clubtag", "Club")); t.appendChild(bl); t.appendChild(el("small", null, fmt(w.sales) + " sales · " + fmt(w.shopsN) + " shops · " + w.daysN + (w.daysN === 1 ? " day" : " days") + (w.stream ? " · stream" : ""))); d.appendChild(t); box.appendChild(d); });
    $("crew-note").textContent = D.who.length ? "Top 10 scanners and streams by sales caught, all time. Number one wears the Crown. Tiers: Scout, Apprentice 10, Merchant 50, Trader 150, Broker 400, Tycoon 1,000, Royal 2,500, Monarch 5,000, Legend 10,000, Immortal 25,000, Titan 50,000, Mythic 100,000. Titan unlocks Mega Deals." : "No scans in the current time range.";
    $("sources").showModal();
  }

  // ---------- ticker
  // Big sales strip at the top of the board: sales of 250K and up in the last 24 hours (the same bar as #big-sales),
  // newest first, from sales the board accepts. Seller, item, price, room and how long ago. Hovering pauses it, a
  // hidden tab stops it, and reduced motion gets a still line instead of a scroll.
  var TICK_MIN = 250000;
  function renderTicker() {
    var run = $("ticker"); if (!run || !D || D.preview) return;
    var now = Date.now(), seen = {};
    var ev = D.sales.filter(function (l) { var it = D.byName[l.i]; return l.p >= TICK_MIN && now - l.t <= DAY && !(it && it.typ && l.p > it.typ * 8) && !/\u2026$/.test(l.i); })
      .sort(function (a, b) { return b.t - a.t; }).filter(function (l) { var k = l.s + "|" + l.i + "|" + l.p; if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 20);
    var sig = ev.map(function (l) { return l.s + l.i + l.p + l.t; }).join("|") + "|" + Math.floor(now / 6e4);
    if (run.dataset.sig === sig) return; run.dataset.sig = sig; run.textContent = "";
    if (!ev.length) { run.appendChild(el("span", "tq", "No sales over 250K in the last 24 hours")); return; }
    ev.forEach(function (l) {
      var sp = el("span"); sp.appendChild(document.createTextNode(l.s + " sold ")); sp.appendChild(el("b", null, showName(l.i)));
      sp.appendChild(document.createTextNode(" for ")); sp.appendChild(el("b", "mz", short(l.p)));
      var rm = /^FM\d+$/.test(l.r || "") ? roomLabel(l.r) : "";
      sp.appendChild(document.createTextNode((rm ? " · " + (l.c && !l.ci ? "CH " + l.c + ", " : "") + rm : "") + " · " + ago(l.t)));
      run.appendChild(sp);
    });
    // a second copy right after the first makes the loop seamless: the strip is full from the first frame
    Array.prototype.slice.call(run.children).forEach(function (n) { var c = n.cloneNode(true); c.setAttribute("aria-hidden", "true"); c.classList.add("dup"); run.appendChild(c); });
    run.style.setProperty("--dur", Math.max(30, ev.length * 8) + "s");
  }
  document.addEventListener("visibilitychange", function () { var b = $("tickbar"); if (b) b.classList.toggle("paused", document.hidden); });

  // ---------- category chips
  var CATS = [["All", 0], ["Scrolls", 2040000], ["Weapons", 1302000], ["Equips", 1082002], ["Stars", 2070000], ["Use", 2000000], ["Etc", 4000019], ["Cash", 1007077], ["Other", 3010000]];
  function renderChips(basel) {
    var cnt = {}; basel.forEach(function (i) { cnt[i.cat] = (cnt[i.cat] || 0) + 1; }); cnt.All = basel.length;
    var box = $("chips"); box.textContent = "";
    CATS.forEach(function (c) {
      var k = c[0]; if (k !== "All" && !cnt[k] && state.cat !== k) return;
      var nm = CATNAME[k] || k;
      var b = el("button", "cchip" + (k === "All" ? " all" : "")); b.type = "button"; b.setAttribute("aria-pressed", state.cat === k); b.title = nm + ": " + (cnt[k] || 0) + " items"; b.setAttribute("aria-label", nm + ", " + (cnt[k] || 0) + " items");
      if (k === "All") b.appendChild(el("span", null, "ALL")); else { var im = new Image(); im.alt = ""; im.src = IO + c[1] + "/icon"; b.appendChild(im); }
      b.appendChild(el("em", null, cnt[k] || 0));
      b.addEventListener("click", function () { state.cat = k; state.sub = ""; renderView(); });
      box.appendChild(b);
    });
    renderSub(basel);
  }
  // Weapons and Equips: a row of types (Dagger, One-Handed Sword, Hat...) with counts, and the level range right
  // beside them, so "a level 30 dagger" is two taps. The level boxes are the same ones as in Filters.
  function inCat(i) { return (state.cat === "All" || i.cat === state.cat) && (!state.sub || subKind(i.item) === state.sub); }
  function renderSub(basel) {
    var box = $("subchips"); if (!box) return;
    var on = state.cat === "Weapons" || state.cat === "Equips"; box.hidden = !on; box.textContent = "";
    if (!on) { state.sub = ""; return; }
    var cnt = {}; basel.forEach(function (i) { if (i.cat !== state.cat) return; var k = subKind(i.item) || "Other"; cnt[k] = (cnt[k] || 0) + 1; });
    var keys = Object.keys(cnt).sort(function (a, b) { return a.localeCompare(b); });
    if (state.sub && !cnt[state.sub]) keys.push(state.sub);
    var mk = function (k, lab, n) {
      var b = el("button", "schip"); b.type = "button"; b.setAttribute("aria-pressed", state.sub === k);
      b.appendChild(document.createTextNode(lab)); b.appendChild(el("em", null, n || 0));
      b.addEventListener("click", function () { state.sub = state.sub === k ? "" : k; renderView(); }); return b;
    };
    var tot = 0; keys.forEach(function (k) { tot += cnt[k] || 0; });
    box.appendChild(mk("", state.cat === "Weapons" ? "All weapons" : "All equips", tot));
    keys.forEach(function (k) { if (k !== "Other") box.appendChild(mk(k, k, cnt[k])); });
    var lv = el("span", "slv"); lv.appendChild(el("b", null, "Level"));
    [["lv-min", "from"], ["lv-max", "to"]].forEach(function (p, n) {
      var inp = el("input"); inp.type = "number"; inp.min = 0; inp.max = 200; inp.placeholder = n ? "any" : "0"; inp.value = $(p[0]).value; inp.setAttribute("aria-label", "Level " + p[1]);
      inp.addEventListener("change", function () { $(p[0]).value = inp.value; $(p[0]).dispatchEvent(new Event("input", { bubbles: true })); $(p[0]).dispatchEvent(new Event("change", { bubbles: true })); });
      if (n) lv.appendChild(el("span", null, "to")); lv.appendChild(inp);
    });
    box.appendChild(lv);
  }

  var QHIT = {};
  function lvRange() { var a = $("lv-min").value, b = $("lv-max").value; return [a === "" ? null : +a, b === "" ? null : +b]; }
  function visible() {
    var q = boardQ().trim().toLowerCase(), low = $("f-low").checked, onlySold = $("f-sold").checked, onlyBids = $("f-bids").checked, cash = $("f-cash").checked, cls = +$("cls").value || 0, lr = lvRange();
    var fon = low || !cash || $("f-spot").checked || onlySold || onlyBids || lr[0] != null || lr[1] != null || $("win").value !== "7";
    $("fon").hidden = !fon;
    $("spotn").textContent = "Junk put up at silly prices to hold a shop spot" + (D.spotN ? " · " + fmt(D.spotN) + ($("f-spot").checked ? " shown" : " left out") : "");
    QHIT = {};
    if (q) searchItems(q).forEach(function (r) { QHIT[r.n] = r.score; });
    return D.list.filter(function (i) {
      if (!(i.n > 0) || !(low || i.n >= MIN) || (onlySold && !i.salesN) || (onlyBids && !i.bid) || (!cash && i.cat === "Cash")) return false;
      if (q && !(i.item in QHIT)) return false;
      if (/\u2026$/.test(i.item) || /^Scroll: /.test(i.item)) return false;   // too cut off to tell which item it is
      if (cls) { var m = classMask(i.item); if (m < 0) return false; if (m === 0 && !(i.cat === "Equips" || i.cat === "Scrolls")) return false; if (m > 0 && !(m & cls)) return false; }
      if (lr[0] != null || lr[1] != null) { var lv = reqLevel(i.item); if (lv < 0 || (lv === 0 && i.cat !== "Equips" && i.cat !== "Weapons")) return false; if (lr[0] != null && lv < lr[0]) return false; if (lr[1] != null && lv > lr[1]) return false; }
      return true;
    });
  }

  function spark(daily) {
    var w = 64, h = 24, s = "http://www.w3.org/2000/svg", svg = document.createElementNS(s, "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h); svg.setAttribute("width", w); svg.setAttribute("height", h); svg.setAttribute("class", "spark"); svg.setAttribute("aria-hidden", "true");
    var ys = daily.map(function (d) { return d[1]; }), lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), sp = hi - lo || 1;
    var P = daily.map(function (d, k) { return [k / (daily.length - 1) * (w - 6) + 2, h - 3 - (d[1] - lo) / sp * (h - 7)]; });
    var up = ys[ys.length - 1] >= ys[0], col = up ? "var(--up)" : "var(--down)";
    var area = document.createElementNS(s, "path"); area.setAttribute("d", "M" + P[0][0] + "," + h + " " + P.map(function (p) { return "L" + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + " L" + P[P.length - 1][0] + "," + h + "Z"); area.setAttribute("fill", up ? "var(--up-soft)" : "var(--down-soft)"); svg.appendChild(area);
    var pl = document.createElementNS(s, "polyline"); pl.setAttribute("points", P.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ")); pl.setAttribute("fill", "none"); pl.setAttribute("stroke", col); pl.setAttribute("stroke-width", "1.8"); pl.setAttribute("stroke-linejoin", "round"); svg.appendChild(pl);
    var dot = document.createElementNS(s, "circle"); dot.setAttribute("cx", P[P.length - 1][0]); dot.setAttribute("cy", P[P.length - 1][1]); dot.setAttribute("r", "2.2"); dot.setAttribute("fill", col); svg.appendChild(dot);
    return svg;
  }
  function pctPill(v) {
    if (v == null || v === -9) return el("span", "pct none", "–");
    var r = Math.round(v * 100); return el("span", "pct " + (r > 0 ? "up" : r < 0 ? "down" : "flat"), (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r) + "%");
  }
  function moveTag(v, label) {
    var s = el("span", "mvt " + (v > 0.02 ? "up" : v < -0.02 ? "down" : "flat"));
    s.textContent = (v > 0.02 ? "▲ " : v < -0.02 ? "▼ " : "■ ") + (v > 0 ? "+" : "") + Math.round(v * 100) + "%" + (label ? " " + label : "");
    return s;
  }
  // the verified-price badge: what the typical rests on, in one glance
  var CONFTXT = { verified: ["Verified", "Fresh sales caught by two trusted scanners, or by a scanner and a stream"], watched: ["Watched", "Fresh sales caught by one trusted scanner. Treat it as a lead until a second scanner sees it"], lead: ["Lead", "Rests on older sales or asking prices, not fresh watched sales"] };
  function infoTip(text) {
    var b = el("button", "inf", "i"); b.type = "button"; b.title = text; b.setAttribute("aria-label", "What this means: " + text);
    b.addEventListener("click", function (e) {
      e.stopPropagation(); var host = b.closest(".subw, .rollbox, .guide, .tline, .gbox") || b.parentNode, ex = host.querySelector(":scope > .infx");
      if (ex) { ex.remove(); return; } var n = el("p", "infx", text); if (host.classList.contains("tline")) host.parentNode.insertBefore(n, host.nextSibling); else host.appendChild(n);
    });
    return b;
  }
  function confBadge(i, long) {
    if (!i.conf || i.kind !== "sale") return null;
    var b = el("span", "conf " + i.conf + (long ? "" : " mini")); var im = el("img"); im.alt = CONFTXT[i.conf][0]; im.src = "assets/emoji/" + (i.conf === "verified" ? "verified" : i.conf === "watched" ? "scanner" : "witness") + ".png"; b.appendChild(im);
    if (long) b.appendChild(document.createTextNode(CONFTXT[i.conf][0] + (i.typWho.length ? " · " + i.typWho.length + (i.typWho.length === 1 ? " scanner" : " scanners") : "")));
    b.title = CONFTXT[i.conf][0] + ": " + CONFTXT[i.conf][1]; return b;
  }
  function nameCell(i, extraTag) {
    var td = el("td"), w = el("div", "nm"); w.appendChild(iconBox(i.item));
    var t = el("div", "t"); var b = el("b", null, i.baseName); b.title = i.item; t.appendChild(b);
    t.appendChild(el("small", null, CATNAME[i.cat] || i.cat));
    if (i.tier) { var tt = el("span", "tg tier", tierLabel(i.tier)); tt.title = i.tier + (TIERLBL[i.tier] && i.tier !== "Chaos" ? ": " + TIERLBL[i.tier] + " success" : ""); t.appendChild(tt); }
    if (i.n < MIN) t.appendChild(el("span", "tg low", "Low data")); else if (i.kind === "ask") t.appendChild(el("span", "tg ask", "Ask"));
    var cb0 = i.n >= MIN ? confBadge(i) : null; if (cb0) t.appendChild(cb0);
    if (i.moved) { var mv = el("span", "tg ask", "Rising"); mv.title = "Recent sales are thin and today's asking prices are well above them, so typical follows today's asks"; t.appendChild(mv); }
    var vpr = vendor(i.item); if (vpr && i.typ && i.typ < vpr * 1.1) { var np = el("span", "tg deal", "NPC"); np.title = "An NPC shop pays " + short(vpr) + " each, as much as the Free Market does. Sell it to an NPC."; t.appendChild(np); }
    if (i.capped) { var cp = el("span", "tg ask", "Asks lower"); cp.title = i.cappedN + " sellers are asking less than recent sales (" + short(i.typSales) + "), so typical follows the third-cheapest ask"; t.appendChild(cp); }
    if (extraTag) t.appendChild(extraTag);
    w.appendChild(t); td.appendChild(w); return td;
  }

  var priceIO = null;
  function renderPrices() {
    if (D && D.list.length) { mark("rows"); if (!D.preview) mark("live"); }
    var basel = visible(); renderChips(basel);
    var shown = basel.filter(function (i) { return inCat(i) && (!state.wonly || WATCH[i.item]); });
    // equips show (and sort by) the price of their busiest grade once it has 3+ sales; the rest keep the typical
    shown.forEach(function (i) { if (!i.equip || D.preview) { i.ltop = null; return; } var L = ladderOf(i); i.ltop = L && L.top && L.top.basis === "sold" ? L.top : null; });
    $("wcount").textContent = Object.keys(WATCH).length;
    var k = state.sortK, dir = state.sortDir;
    var hasQ = boardQ().trim() !== "";
    shown.sort(function (a, b) {
      if (hasQ && QHIT[a.item] !== QHIT[b.item] && Math.max(QHIT[a.item], QHIT[b.item]) >= 900) return QHIT[b.item] - QHIT[a.item];
      if (k === "item") return dir * a.item.localeCompare(b.item);
      var x = a[k] || 0, y = b[k] || 0; if (k === "typ") { x = a.ltop ? a.ltop.mid : x; y = b.ltop ? b.ltop.mid : y; } if (k === "best") { x = a.best || (dir > 0 ? 1e15 : -1); y = b.best || (dir > 0 ? 1e15 : -1); }
      if (k === "chg" || k === "trend") { var ax = x === -9, bx = y === -9; if (ax !== bx) return ax ? 1 : -1; }   // rows with no data sit last either way
      return dir * (x - y) || b.n - a.n || a.item.localeCompare(b.item);
    });
    var tb = $("rows"); tb.textContent = "";
    if (priceIO) priceIO.disconnect();
    var upto = Math.max(PAGE, keepRows);
    function row(i) {
      var tr = el("tr"); if (i.n < MIN) tr.className = "thin"; if (state.sel === i.item) tr.classList.add("sel");
      tr.tabIndex = 0; tr.dataset.item = i.item;
      var ncell = nameCell(i), st = el("button", "star", WATCH[i.item] ? "★" : "☆"); st.type = "button"; st.setAttribute("aria-pressed", !!WATCH[i.item]); st.setAttribute("aria-label", (WATCH[i.item] ? "Stop watching " : "Watch ") + i.item);
      st.addEventListener("click", function (e) { e.stopPropagation(); if (WATCH[i.item]) delete WATCH[i.item]; else WATCH[i.item] = { t: Date.now() }; saveLS("fm-watch", WATCH); st.textContent = WATCH[i.item] ? "★" : "☆"; st.setAttribute("aria-pressed", !!WATCH[i.item]); $("wcount").textContent = Object.keys(WATCH).length; });
      ncell.firstChild.insertBefore(st, ncell.firstChild.firstChild);
      tr.appendChild(ncell);
      var tc = el("td"), LT = i.equip && i.ltop;
      if (LT) { tc.appendChild(money(LT.mid)); var gt = el("small", "lgt", LT.name.replace(/^Slots used, no gain$/, "no gain").toLowerCase().replace(/ (att|matt|str|dex|int|luk|hp|mp)\b/gi, function (z) { return z.toUpperCase(); })); gt.title = "The price of the grade most copies sell at. Open the item for every grade."; tc.appendChild(gt); }
      else tc.appendChild(money(i.typ));
      tr.appendChild(tc);
      var cc = el("td", "c col-chg"); cc.appendChild(pctPill(i.mv[0])); tr.appendChild(cc);
      var bc = el("td", "c col-src clubonly");
      // equips showing a grade price: the cheapest copy of that same grade, and how far under the grade it sits
      var LB = LT && (LT.okAsks || LT.asks).filter(function (x) { return x.st !== "gone" && x.st !== "sold"; })[0];
      if (LB) { var lsp = el("span", "srcp"), loff = 1 - LB.u / LT.mid; if (loff >= 0.25) lsp.classList.add("deal"); lsp.appendChild(el("span", "mz", short(LB.u))); if (loff >= 0.25) lsp.appendChild(el("small", null, "−" + Math.round(loff * 100) + "%")); lsp.title = LT.name + " · " + LB.s + (where(LB) ? ", " + where(LB) : "") + ", " + ago(LB.t); bc.appendChild(lsp); }
      else if (LT) bc.appendChild(el("span", "srcp none", "No " + LT.name.toLowerCase().replace(/ (att|matt|str|dex|int|luk)\b/gi, function (z) { return z.toUpperCase(); }) + " up"));
      else if (i.bestL) { var sp = el("span", "srcp" + (i.deal >= 0.25 ? " deal" : "")); sp.appendChild(el("span", "mz", short(i.best))); if (i.deal >= 0.25) sp.appendChild(el("small", null, "−" + Math.round(i.deal * 100) + "%")); sp.title = i.bestL.s + (where(i.bestL) ? ", " + where(i.bestL) : "") + ", " + ago(i.bestL.t); bc.appendChild(sp); }
      else bc.appendChild(el("span", "srcp none", "Not on sale now"));
      tr.appendChild(bc);
      var trc = el("td", "c col-trend"); if (i.daily.length >= 3) trc.appendChild(spark(i.daily)); else trc.appendChild(el("span", "tfd", "Too few days")); tr.appendChild(trc);
      var sc = el("td", "c col-sales"); sc.appendChild(el("span", "cnt" + (i.salesN ? "" : " zero"), fmt(i.salesN))); tr.appendChild(sc);
      var vc = el("td", "col-vol"); if (i.vol) vc.appendChild(money(i.vol)); tr.appendChild(vc);
      return tr;
    }
    function addRows(a, b) {
      var frag = document.createDocumentFragment();
      shown.slice(a, b).forEach(function (i) { frag.appendChild(row(i)); });
      var old = tb.querySelector(".more-row"); if (old) old.remove();
      tb.appendChild(frag);
      if (b < shown.length) {
        var more = el("tr", "more-row"), td = el("td", null, "Loading more…"); td.colSpan = 7; more.appendChild(td); tb.appendChild(more);
        if ("IntersectionObserver" in window) {
          // the table box only scrolls on its own on wide screens; on phones the page scrolls, so the screen is the
          // root (with the box as root every row loaded at once, 1,000+ rows with charts, and phones stuttered)
          var tbx = tb.closest(".tbox"), ownScroll = tbx && getComputedStyle(tbx).maxHeight !== "none";
          priceIO = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) { priceIO.disconnect(); addRows(b, b + PAGE); } }, { root: ownScroll ? tbx : null, rootMargin: "600px" });
          priceIO.observe(more);
        } else addRows(b, shown.length);
      }
    }
    addRows(0, upto);
    $("empty").hidden = shown.length > 0;
    if (!shown.length && hasQ) {
      var qh = searchItems(boardQ(), 3);
      if (qh.length && !qh[0].it) {
        $("empty").textContent = ""; $("empty").appendChild(el("strong", null, qh[0].n + " has no price yet"));
        var eb = el("button", "cta", "See item info"); eb.type = "button"; eb.addEventListener("click", function () { pick(qh[0].n); });
        $("empty").appendChild(document.createTextNode("Nobody has seen it in the Free Market in this time range. ")); $("empty").appendChild(eb);
        $("empty").hidden = false; $("count").textContent = "Showing 0 of " + fmt(D.list.length) + " items"; return;
      }
    }
    if (!shown.length) { $("empty").textContent = ""; $("empty").appendChild(el("strong", null, D.list.length ? "No items match" : "No prices yet")); $("empty").appendChild(document.createTextNode(D.list.length ? "Clear the search, pick another category or class, or open Filters." : "Waiting for the first scan.")); }
    $("count").textContent = "Showing " + shown.length + " of " + D.list.length + " items";
    fitBoard();
    document.querySelectorAll("thead button[data-k]").forEach(function (b) { if (b.dataset.k === state.sortK) b.setAttribute("aria-sort", state.sortDir < 0 ? "descending" : "ascending"); else b.removeAttribute("aria-sort"); });
  }

  // ---------- positions and watchlist
  function loadLS(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function saveLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} if (window.syncTouch) syncTouch(k); }
  var POS = loadLS("fm-pos", []), WATCH = loadLS("fm-watch", {}), WSEEN = loadLS("fm-watch-seen", {});
  // ---------- My positions: a trade journal. Every buy and sell is logged; each sale is matched to the oldest copies
  // still held (first in, first out), so a win or loss is counted once, and what's left is valued at today's price.
  var TRADES = loadLS("fm-trades", null), PSIDE = "buy";
  if (!Array.isArray(TRADES)) {   // the old list of positions becomes the first buys
    TRADES = (POS || []).map(function (p, k) { return { id: "m" + k + "-" + (p.t || 0), i: p.i, side: "buy", q: p.q || 1, p: p.paid, t: p.t || Date.now() }; });
    saveLS("fm-trades", TRADES);
  }
  function ledger() {
    var fee = Math.max(0, +loadLS("fm-fee", 0) || 0) / 100, lots = {}, closed = [];
    TRADES.slice().sort(function (a, b) { return a.t - b.t; }).forEach(function (tr) {
      var L = lots[tr.i] || (lots[tr.i] = []);
      if (tr.side === "buy") { L.push({ q: tr.q, p: tr.p, t: tr.t }); return; }
      var left = tr.q, cost = 0, held = 0, got = 0;
      while (left > 0 && L.length) { var lot = L[0], take = Math.min(left, lot.q); cost += take * lot.p; held += take * (tr.t - lot.t); got += take; lot.q -= take; left -= take; if (!lot.q) L.shift(); }
      var net = tr.p * (1 - fee);
      closed.push({ tr: tr, matched: got, cost: cost, pl: got ? net * got - cost : 0, held: got ? held / got : 0, unmatched: left });
    });
    var hold = Object.keys(lots).map(function (n) { var q = 0, c = 0, t0 = Infinity; lots[n].forEach(function (l) { q += l.q; c += l.q * l.p; t0 = Math.min(t0, l.t); }); return q ? { i: n, q: q, paid: c / q, cost: c, t: t0 } : null; }).filter(Boolean);
    return { hold: hold, closed: closed, fee: fee };
  }
  // the board's own name for what was typed: exact, the shown scroll name ("Gloves Attack Scroll 60%"), or the best search hit
  function posItem(n) {
    if (!D || !n) return null; var lo = String(n).toLowerCase();
    if (D.byName[n]) return D.byName[n];
    var hit = D.list.filter(function (i) { return i.item.toLowerCase() === lo || String(showName(i.item)).toLowerCase() === lo; })[0];
    if (hit) return hit;
    var keepQ = QROLL; try { var s = searchItems(n, 1)[0]; QROLL = keepQ; if (s && s.score >= 600 && D.byName[s.n]) return D.byName[s.n]; } catch (e) { QROLL = keepQ; }
    return null;
  }
  function syncPOS() { POS = ledger().hold.map(function (h) { return { i: h.i, q: h.q, paid: Math.round(h.paid), t: h.t }; }); saveLS("fm-pos", POS); }
  function saveTrades() { saveLS("fm-trades", TRADES); syncPOS(); }
  syncPOS();
  function watched() { var w = {}; Object.keys(WATCH).forEach(function (k) { w[k] = 1; }); POS.forEach(function (p) { w[p.i] = 1; }); return Object.keys(w); }
  function plSpan(v) { return el("span", "num mz pl " + (v >= 0 ? "up" : "down"), (v >= 0 ? "+" : "−") + short(Math.abs(v))); }
  function renderPos() {
    fillNames();
    var lg = ledger(), days = +($("pf-period").value || 0), since = days ? (days === 1 ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : Date.now() - days * DAY) : 0;
    var tb = $("pos-rows"); tb.textContent = ""; var unreal = 0, inv = 0, worth = 0;
    lg.hold.sort(function (a, b) { return b.cost - a.cost; }).forEach(function (h) {
      var i = posItem(h.i), tr = el("tr"); tr.dataset.item = i ? i.item : h.i;
      var now = i && i.typ ? i.typ : 0, pl = now ? (now * (1 - lg.fee) - h.paid) * h.q : 0;
      if (i) tr.appendChild(nameCell(i)); else tr.appendChild(el("td", null, h.i));
      tr.appendChild(el("td", null, fmt(h.q)));
      var pc = el("td"); pc.appendChild(money(Math.round(h.paid))); tr.appendChild(pc);
      var nc = el("td"); if (now) nc.appendChild(money(now)); else nc.appendChild(el("span", "tfd", "no price yet")); tr.appendChild(nc);
      var mc = el("td"); if (i && i.mv[0] != null) mc.appendChild(moveTag(i.mv[0], "1d")); else if (i && i.mv[1] != null) mc.appendChild(moveTag(i.mv[1], "3d")); tr.appendChild(mc);
      var uc = el("td"); if (now) { uc.appendChild(plSpan(pl)); uc.appendChild(el("small", null, " " + (pl >= 0 ? "+" : "") + Math.round(pl / h.cost * 100) + "%")); } tr.appendChild(uc);
      if (now) { unreal += pl; worth += now * h.q; } inv += h.cost;
      if (now && pl < 0) tr.classList.add("under");
      var ac = el("td", "pact"), sb = el("button", "pbtn", "Sell"); sb.type = "button";
      sb.addEventListener("click", function (e) { e.stopPropagation(); pform("sell", h.i, h.q, now); });
      ac.appendChild(sb); tr.appendChild(ac); tb.appendChild(tr);
    });
    $("pos-empty").hidden = lg.hold.length > 0;
    // trades in the period, newest first, each sale with what it made
    var tb2 = $("trade-rows"); tb2.textContent = "";
    var byTr = {}; lg.closed.forEach(function (c) { byTr[c.tr.id] = c; });
    var inP = TRADES.filter(function (t) { return t.t >= since; }).sort(function (a, b) { return b.t - a.t; });
    inP.forEach(function (t) {
      var tr = el("tr"), c = byTr[t.id];
      tr.appendChild(el("td", "pwhen", new Date(t.t).toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + new Date(t.t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })));
      var i = posItem(t.i); if (i) tr.appendChild(nameCell(i)); else tr.appendChild(el("td", null, t.i));
      tr.appendChild(el("td", null, "")).appendChild(el("span", "pside-tag " + t.side, t.side === "buy" ? "Bought" : "Sold"));
      tr.appendChild(el("td", null, fmt(t.q)));
      var pc = el("td"); pc.appendChild(money(t.p)); tr.appendChild(pc);
      var plc = el("td"); if (c && c.matched) { plc.appendChild(plSpan(c.pl)); plc.appendChild(el("small", null, " " + (c.pl >= 0 ? "+" : "") + Math.round(c.pl / c.cost * 100) + "%")); if (c.unmatched) plc.title = c.unmatched + " sold that weren't logged as bought, so they don't count"; } else if (c) plc.appendChild(el("small", "tfd", "no buy logged")); tr.appendChild(plc);
      var rc = el("td"), rm = el("button", "rm", "×"); rm.type = "button"; rm.setAttribute("aria-label", "Delete this trade");
      rm.addEventListener("click", function (e) { e.stopPropagation(); TRADES = TRADES.filter(function (x) { return x.id !== t.id; }); saveTrades(); render(); }); rc.appendChild(rm); tr.appendChild(rc);
      tb2.appendChild(tr);
    });
    $("trade-empty").hidden = inP.length > 0;
    // the scoreboard
    var sold = lg.closed.filter(function (c) { return c.matched && c.tr.t >= since; }), real = 0, wins = 0, best = null, worst = null, held = 0;
    sold.forEach(function (c) { real += c.pl; if (c.pl > 0) wins++; if (!best || c.pl > best.pl) best = c; if (!worst || c.pl < worst.pl) worst = c; held += c.held; });
    var sm = $("psum"); sm.textContent = "";
    function card(lbl, val, sub, cls) { var d = el("div", "pcard" + (cls ? " " + cls : "")); d.appendChild(el("small", null, lbl)); var b = el("b"); if (typeof val === "number") b.appendChild(plSpan(val)); else rich(b, val); d.appendChild(b); if (sub) d.appendChild(el("span", null, sub)); sm.appendChild(d); }
    var pname = { 1: "today", 7: "7 days", 30: "30 days", 0: "all time" }[days];
    card("Profit, " + pname, real, sold.length ? sold.length + (sold.length === 1 ? " sale" : " sales") : "no sales yet", real >= 0 ? "up" : "down");
    card("Win rate", sold.length ? Math.round(wins / sold.length * 100) + "%" : "–", sold.length ? wins + " of " + sold.length + " sales made money" : "");
    card("Holding", M(Math.round(inv)), lg.hold.length ? lg.hold.length + (lg.hold.length === 1 ? " item" : " items") + (worth ? " · worth " + M(Math.round(worth)) : "") : "nothing right now");
    card("If you sold today", unreal, "on what you're holding", unreal >= 0 ? "up" : "down");
    if (best && best.pl > 0) card("Best flip", best.pl, showName(best.tr.i));
    if (worst && worst.pl < 0) card("Worst", worst.pl, showName(worst.tr.i));
    if (sold.length) { var hh = held / sold.length / 36e5; card("Average hold", hh < 48 ? Math.round(hh) + " hours" : Math.round(hh / 24) + " days", "from buy to sale"); }
    var wb = $("watch-rows"); wb.textContent = "";
    watched().forEach(function (name) {
      var i = D.byName[name], tr = el("tr"); tr.dataset.item = name;
      if (i) tr.appendChild(nameCell(i)); else tr.appendChild(el("td", null, name));
      var tc = el("td"); if (i) tc.appendChild(money(i.typ)); tr.appendChild(tc);
      [0, 1, 2].forEach(function (d) { var td = el("td"); if (i && i.mv[d] != null) td.appendChild(moveTag(i.mv[d])); else td.appendChild(el("span", "tfd", "n/a")); tr.appendChild(td); });
      var cc = el("td", "clubonly"); if (i && i.bestL) cc.appendChild(money(i.best)); tr.appendChild(cc);
      var ac = el("td");
      if (WATCH[name]) {
        var ai = el("input"); ai.type = "text"; ai.inputMode = "numeric"; ai.className = "under-in"; ai.placeholder = "price"; ai.title = "Notify me when it's listed at or under this many mesos (100k and 1.5m work)";
        ai.value = WATCH[name].under ? short(WATCH[name].under) : "";
        ai.addEventListener("click", function (e) { e.stopPropagation(); });
        ai.addEventListener("change", function () { var v = parseMesos(ai.value); if (v > 0) WATCH[name].under = v; else delete WATCH[name].under; saveLS("fm-watch", WATCH); if (v > 0) askNotify(); render(); });
        ac.appendChild(ai);
      }
      tr.appendChild(ac);
      var rc = el("td");
      if (WATCH[name]) { var rm = el("button", "rm", "×"); rm.type = "button"; rm.setAttribute("aria-label", "Stop watching " + name); rm.addEventListener("click", function (e) { e.stopPropagation(); delete WATCH[name]; saveLS("fm-watch", WATCH); render(); }); rc.appendChild(rm); }
      else rc.appendChild(el("small", null, "position"));
      tr.appendChild(rc); wb.appendChild(tr);
    });
    $("watch-empty").hidden = watched().length > 0;
    rich($("count"), TRADES.length ? (sold.length ? (real >= 0 ? "Up " : "Down ") + M(Math.abs(Math.round(real))) + " on " + sold.length + (sold.length === 1 ? " sale" : " sales") + ", " + pname : "No sales " + (days ? "in this period" : "logged yet")) + (lg.hold.length ? " · holding " + lg.hold.length : "") : "");
  }
  // ---- price alerts: a starred item listed at or under the price you set. A browser notification (when allowed)
  // and the page's alert sound, once per listing.
  function parseMesos(t) {
    var m = /^\s*([\d.,]+)\s*([kmb])?\s*$/i.exec(String(t || "")); if (!m) return 0;
    var v = parseFloat(m[1].replace(/,/g, "")); if (!isFinite(v)) return 0;
    return Math.round(v * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] || "").toLowerCase()] || 1));
  }
  function askNotify() { try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) {} }
  var USEEN = loadLS("fm-under-seen", {}), uArmed = false;
  function checkUnder() {
    if (!D) return;
    var hits = [];
    Object.keys(WATCH).forEach(function (name) {
      var w = WATCH[name], i = D.byName[name]; if (!w || !w.under || !i) return;
      (i.buy || []).forEach(function (x) {
        if (x.st === "gone" || x.st === "sold" || x.u > w.under || Date.now() - x.t > 2 * H) return;
        var k = name + "|" + String(x.s).toLowerCase() + "|" + x.u; if (USEEN[k]) return;
        USEEN[k] = Date.now(); hits.push({ name: name, x: x });
      });
    });
    Object.keys(USEEN).forEach(function (k) { if (Date.now() - USEEN[k] > 2 * DAY) delete USEEN[k]; });
    saveLS("fm-under-seen", USEEN);
    if (!uArmed) { uArmed = true; return; }          // listings already up when the page opened don't ping
    hits.slice(0, 4).forEach(function (h) {
      var body = h.x.s + " has it for " + fmt(h.x.u) + (where(h.x) ? " · " + where(h.x) : "");
      try { if (window.Notification && Notification.permission === "granted") { var n = new Notification(showName(h.name) + " under your price", { body: body, icon: "og-icon.png?v=3", tag: h.name }); n.onclick = function () { window.focus(); pick(h.name); n.close(); }; } } catch (e) {}
    });
    if (hits.length) { if ($("sound").checked) beep(); clearInterval(titleTimer); var on = false, left = 20, n = hits.length;
      titleTimer = setInterval(function () { on = !on; document.title = on ? "(" + n + ") Under your price" : baseTitle; if (--left <= 0 && document.hasFocus()) { clearInterval(titleTimer); document.title = baseTitle; } }, 1000); }
  }

  // a starred item or a position moving past the threshold in a day pings, once per item, day and direction
  var wArmed = false;
  var WHIDE = loadLS("fm-watch-hide", {});
  function pruneHide() { var keep = {}; Object.keys(WHIDE).forEach(function (k) { if (Date.now() - WHIDE[k] < 3 * DAY) keep[k] = WHIDE[k]; }); WHIDE = keep; return keep; }
  function renderWatchAlert() {
    try { checkUnder(); } catch (e) {}
    var th = Math.max(3, +$("watch-th").value || 15) / 100, day = new Date().toDateString();
    var mkey = function (i) { return i.item + "|" + day + "|" + (i.mv[0] > 0 ? "up" : "down"); };
    var moved = watched().map(function (n) { return D.byName[n]; }).filter(function (i) { return i && i.mv[0] != null && Math.abs(i.mv[0]) >= th && !WHIDE[mkey(i)]; })
      .sort(function (a, b) { return Math.abs(b.mv[0]) - Math.abs(a.mv[0]); });
    $("walert").hidden = !moved.length;
    if (!moved.length) return;
    $("walert-count").textContent = moved.length + (moved.length === 1 ? " item you're watching" : " items you're watching") + " moved more than " + Math.round(th * 100) + "% in a day";
    var hx = $("walert-x"); if (!hx) { hx = el("span", "wx wall", "Clear all"); hx.id = "walert-x"; hx.setAttribute("role", "button"); hx.tabIndex = 0; $("walert").querySelector(".alert-head").appendChild(hx);
      var all = function (e) { e.stopPropagation(); e.preventDefault(); (hx._moved || []).forEach(function (i) { WHIDE[mkey(i)] = Date.now(); }); saveLS("fm-watch-hide", pruneHide()); renderWatchAlert(); };
      hx.addEventListener("click", all); hx.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") all(e); }); }
    hx._moved = moved;
    var ul = $("walert-list"); ul.textContent = "";
    moved.slice(0, 8).forEach(function (i) {
      var li = el("span", "alert-row"); li.appendChild(el("span", "n", POS.some(function (p) { return p.i === i.item; }) ? "position" : "watching"));
      li.appendChild(el("span", "it", i.item)); li.appendChild(el("span", "pr mz", fmt(i.typ))); var m = moveTag(i.mv[0], "1d"); m.className += " pc"; li.appendChild(m);
      var p = POS.filter(function (x) { return x.i === i.item; })[0];
      li.appendChild(el("span", "wh", p ? "you paid " + MF(p.paid) + ", " + (i.typ >= p.paid ? "up " : "down ") + M(Math.abs(i.typ - p.paid)) + " each" : ""));
      // clear this one: it stays hidden until it moves again on another day or turns the other way
      var x = el("span", "wx", "\u00d7"); x.setAttribute("role", "button"); x.tabIndex = 0; x.title = "Clear this alert"; x.setAttribute("aria-label", "Clear the alert for " + i.item);
      var clear = function (e) { e.stopPropagation(); e.preventDefault(); WHIDE[mkey(i)] = Date.now(); saveLS("fm-watch-hide", pruneHide()); renderWatchAlert(); };
      x.addEventListener("click", clear); x.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") clear(e); });
      li.firstChild.insertBefore(x, li.firstChild.firstChild);
      ul.appendChild(li);
    });
    var fresh = moved.filter(function (i) { var k = i.item + "|" + day + "|" + (i.mv[0] > 0 ? "up" : "down"); if (WSEEN[k]) return false; WSEEN[k] = 1; return true; });
    if (fresh.length) {
      saveLS("fm-watch-seen", WSEEN);
      if (wArmed) {
        $("walert-new").hidden = false;
        var a = $("walert"); a.classList.remove("fresh"); void a.offsetWidth; a.classList.add("fresh");
        clearInterval(titleTimer); var on = false, left = 20, n = fresh.length;
        titleTimer = setInterval(function () { on = !on; document.title = on ? "(" + n + ") Price move on your watchlist" : baseTitle; if (--left <= 0 && document.hasFocus()) { clearInterval(titleTimer); document.title = baseTitle; } }, 1000);
        if ($("sound").checked) beep();
      }
    }
  }

  // ---------- sell my items
  var SELL = loadLS("fm-sell", []), FASTPCT = loadLS("fm-fast-pct", 5);
  function saveSell() { saveLS("fm-sell", SELL); }
  function nice(x) { if (!x || x < 10) return Math.max(1, Math.floor(x || 0)); var step = Math.pow(10, Math.max(0, String(Math.floor(x)).length - 2)); var n = Math.floor(x / step) * step; return step >= 10 ? n - 1 : n; }
  // Quick: just under the cheapest listing up now, but never under the low end of real sales.
  // Fair: what it usually sells for. Patient: the top of the normal sale range.
  function advice(i) {
    // the same recent sales typical uses, not the whole week, so a fast-moving market does not drag prices down
    var su = (i.kind === "sale" ? i.typSet : i.sales).map(function (x) { return x.u; });
    var au = i.asks.filter(function (x) { return Date.now() - x.t <= 3 * DAY; }).map(function (x) { return x.u; });
    if (!au.length) au = i.asks.map(function (x) { return x.u; });
    var p25 = su.length >= 3 ? quant(su, .25) : 0, p50 = su.length >= 3 ? quant(su, .5) : 0, p75 = su.length >= 3 ? quant(su, .75) : 0;
    if (i.moved || i.capped) { p25 = i.lo; p50 = i.typ; p75 = i.hi; }
    var low = i.bestL ? i.bestL.u : 0, askMed = au.length ? median(au) : 0;
    var fair = p50 || (askMed ? askMed * 0.95 : low);
    var floor = p25 || (fair ? fair * 0.8 : 0);
    var under = low && floor && low < floor;
    var quick = !low ? (floor || fair * 0.9) : under ? floor : Math.max(floor, low - Math.max(1, low * 0.01));
    var patient = p75 || askMed || fair * 1.15;
    if (patient < fair) patient = fair;
    var why = [];
    if (low) why.push("Cheapest up now " + M(low) + " from " + i.bestL.s);
    if (su.length >= 3) why.push("sales usually " + short(p25) + " to " + M(p75)); else why.push(su.length ? "only " + su.length + " sale seen, priced from asking prices" : "no sales seen yet, priced from asking prices");
    if (under) why.push("that is below what it normally sells for, so the quick price stays at the low end of sales instead of matching it");
    var sellers = {}; (i.buy || []).forEach(function (x) { sellers[x.s] = 1; });
    var bids = i.bids.map(function (x) { return x.u; }).filter(function (v) { return !fair || v <= fair * 2.5; });
    return { quick: nice(quick), fair: nice(fair), patient: nice(patient), low: low, ups: Object.keys(sellers).length, bid: bids.length ? Math.max.apply(null, bids) : 0, why: why.join("; ") };
  }
  // removed game items remember when they were removed; hovering the item in game again brings it back
  var GAME = [], HIDE = loadLS("fm-sell-hide", {});
  Object.keys(HIDE).forEach(function (k) { if (HIDE[k] === 1) HIDE[k] = Math.floor(Date.now() / 1000); });
  function gameKey(g) { return g.i + "|" + JSON.stringify(g.x || {}); }
  function loadGame() {
    var src = ""; try { src = localStorage.getItem("fm-sell-src") || ""; } catch (e) {}
    $("sell-src").value = src;
    if (!src) { GAME = []; return Promise.resolve(); }
    var x = (BUNDLE && BUNDLE[src]) || ENG_SELL[src]; GAME = Array.isArray(x) ? x : []; return Promise.resolve();
  }
  // the item suggestions shared by Sell my items and My positions
  function fillNames() {
    var dl = $("itemnames"); if (dl.childElementCount !== D.list.length) { dl.textContent = ""; D.list.slice().sort(function (a, b) { return a.item.localeCompare(b.item); }).forEach(function (i) { var o = el("option"); o.value = i.item; dl.appendChild(o); }); }
  }
  function renderSell() {
    fillNames();
    var tb = $("sell-rows"); tb.textContent = ""; var total = 0;
    var rows = SELL.map(function (s, k) { return { i: s.i, q: s.q, k: k, at: s.t || 0 }; });
    // hovered items whose name didn't read cleanly (not a real item and never seen in the market) are left out
    var junk = 0;
    GAME.forEach(function (g) {
      if (HIDE[gameKey(g)] && g.t <= HIDE[gameKey(g)]) return;
      var n = canon(g.i).n; if (!D.byName[n] && !dbRow(n)) { junk++; return; }
      rows.push({ i: n, q: 1, g: g, at: (g.t || 0) * 1000 });
    });
    // newest first: the item you just added or hovered is always at the top
    rows.sort(function (a, b) { return b.at - a.at; });
    rows.forEach(function (s) {
      var i = D.byName[s.i], tr = el("tr"); tr.dataset.item = s.i; if (SELL_NEW && s.i === SELL_NEW && !s.g) tr.className = "justadded";
      if (i && i.cat === "Stars" && s.q >= 10) s.q = 1;     // a star count typed in means one set
      var rmc = el("td", "c"), rm = el("button", "rm", "×"); rm.type = "button"; rm.setAttribute("aria-label", "Remove " + s.i); rm.title = "Remove";
      rmc.appendChild(rm); tr.appendChild(rmc);
      if (!i) { tr.appendChild(el("td", null, s.i)); tr.appendChild(el("td", null, s.q)); var td = el("td", "why", "Not seen in the market yet, so no price to suggest."); td.colSpan = 5; tr.appendChild(td); }
      else {
        var a = advice(i), vp = vendor(i.item), fast = Math.max(nice(i.typ * (1 - FASTPCT / 100)), vp);
        var nc = nameCell(i);
        if (s.g) { var tag = el("span", "tg ask", "From game " + ago(s.g.t * 1000)); nc.querySelector(".t").appendChild(tag); var ch = statChip(i.item, s.g.x, s.g.xj); if (ch) nc.querySelector("b").appendChild(ch); }
        tr.appendChild(nc);
        tr.appendChild(el("td", null, fmt(s.q)));
        [[fast, "pick", ""], [a.quick, "", "col-opt"], [a.fair, "", "col-opt"]].forEach(function (v) { var td = el("td", v[2]); td.appendChild(money(v[0], "rec " + v[1])); tr.appendChild(td); });
        var up = el("td", "col-opt"); if (a.low) { up.appendChild(money(a.low)); up.appendChild(el("small", null, " " + a.ups + (a.ups === 1 ? " seller" : " sellers"))); } else up.textContent = "None"; tr.appendChild(up);
        var tot = el("td"); tot.appendChild(money(fast * s.q)); tr.appendChild(tot); total += fast * s.q;
      }
      rm.addEventListener("click", function (e) { e.stopPropagation(); if (s.g) { HIDE[gameKey(s.g)] = Math.max(s.g.t || 0, Math.floor(Date.now() / 1000)); saveLS("fm-sell-hide", HIDE); } else { SELL.splice(s.k, 1); saveSell(); } render(); }); 
      tb.appendChild(tr);
      if (i) {
        var ad = advice(i), why = ad.why;
        why += "; sell fast at " + FASTPCT + "% under typical " + M(i.typ) + (ad.low && ad.low < i.typ * (1 - FASTPCT / 100) ? " (someone is listed cheaper, at " + M(ad.low) + ")" : "");
        why += "; patient price " + M(ad.patient) + (ad.bid ? "; a buyer offered " + M(ad.bid) + " in chat" : "");
        var vpw = vendor(i.item); if (vpw) why += "; an NPC pays " + M(vpw) + (i.typ * (1 - FASTPCT / 100) < vpw ? ", so sell fast is held at the vendor price" : "");
        if (s.g && s.g.x) {
          var ks = keyStat(i.item, s.g.x, s.g.xj), v = s.g.x[ks];
          if (ks && v != null) {
            var same = i.all.filter(function (x) { return x.x && x.x[ks] === v && !x.b; }).map(function (x) { return x.u; });
            why += same.length ? "; this roll (" + ks + " " + v + ") has been seen " + same.length + "x around " + M(median(same)) : "; no other listing with this exact roll seen yet";
          }
        }
        var wr = el("tr", "whyrow"); var wd = el("td", "why", why); wd.colSpan = 8; wr.appendChild(wd); tb.appendChild(wr);
      }
    });
    $("sell-empty").hidden = rows.length > 0;
    rich($("count"), rows.length ? rows.length + " items, about " + M(total) + " at sell fast prices" : "");
    $("sell-clear").disabled = !rows.length;
    if (SELL_NEW) { SELL_NEW = null; var ja = tb.querySelector("tr.justadded"); if (ja && ja.getBoundingClientRect().top < 0) ja.scrollIntoView({ block: "center", behavior: "smooth" }); }
    $("sell-help").textContent = "From the game: pick your watcher, then hover each inventory item for a second. They show up within minutes." + (junk ? " " + junk + (junk === 1 ? " hovered item" : " hovered items") + " didn't read cleanly; hover again." : "");
  }
  var SELL_NEW = null;
  function addSell(name, q) {
    name = (name || "").trim(); if (!name) return;
    var hit = D.list.filter(function (i) { return i.item.toLowerCase() === name.toLowerCase(); })[0]; if (hit) name = hit.item;
    var ex = SELL.filter(function (s) { return s.i === name; })[0];
    if (ex) { ex.q += q || 1; ex.t = Date.now(); } else SELL.push({ i: name, q: q || 1, t: Date.now() });
    SELL_NEW = name;
    saveSell();
  }

  function renderDeals() {
    var basel = visible(); renderChips(basel);
    // a gap of a few mesos (arrows at 0.3 each) isn't a deal anyone would cross the market for
    var list = basel.filter(function (i) { return inCat(i) && i.n >= MIN && i.deal >= 0.15 && (i.equip ? i.rd && i.rd.length : i.bestL && i.typ - i.best >= 100); })
      .map(function (i) { if (i.equip) { var d = i.rd[0]; return { i: i, item: i.item, pct: d.off, u: d.p, typ: d.typ, gap: d.typ - d.p, s: d.s, t: d.t, l: d.l, roll: d }; } return { i: i, item: i.item, pct: i.deal, u: i.best, typ: i.typ, gap: i.typ - i.best, s: i.bestL.s, t: i.bestL.t }; });
    var k = state.dK, dir = state.dDir;
    list.sort(function (a, b) { var x = a[k], y = b[k]; if (typeof x === "string") return dir * x.localeCompare(y) || b.pct - a.pct; return dir * (x - y) || a.item.localeCompare(b.item); });
    // the deal picked from the alert goes first, even if filters or the deal rules would leave it out
    if (state.dealTop) {
      var dt = state.dealTop, at = -1;
      list.forEach(function (d, x) { if (d.item === dt.item) at = x; });
      var top = at >= 0 ? list.splice(at, 1)[0] : (D.byName[dt.item] ? { i: D.byName[dt.item], item: dt.item } : null);
      if (top) { top.pct = 1 - dt.u / (top.i.typ || dt.u); top.u = dt.u; top.typ = top.i.typ; top.gap = top.i.typ - dt.u; top.s = dt.s; top.t = dt.t; top.l = dt.l; top.pin = true; list.unshift(top); }
    }
    var tb = $("deal-rows"); tb.textContent = "";
    list.forEach(function (d) {
      var i = d.i, tr = el("tr"); tr.tabIndex = 0; tr.dataset.item = i.item; if (state.sel === i.item) tr.className = "sel";
      if (d.pin) tr.classList.add("pinned");
      var tags = el("span", "tgs"), lst = d.l || i.bestL;
      if (d.pin) tags.appendChild(el("span", "tg pin", "From alert")); else if (i.kind === "ask") tags.appendChild(el("span", "tg ask", "vs ask"));
      if (i.equip) { var rc = lst && lst.x ? statChip(i.item, lst.x, lst.xj) : (d.roll && d.roll.k && d.roll.v != null ? el("span", "tg roll", d.roll.k + " " + d.roll.v + (d.roll.g ? " (" + (d.roll.g > 0 ? "+" : "") + d.roll.g + ")" : "")) : null); if (rc) tags.appendChild(rc); else { var rq = el("span", "tg roll", "roll ?"); rq.title = "Stats of this listing aren't known. Hover it in game to see the roll."; tags.appendChild(rq); } if (d.roll) { var rn = el("span", "tg ok", "this roll" + (d.roll.slots != null ? " with " + d.roll.slots + " slots left" : "") + " sells for " + short(d.roll.typ) + " · " + d.roll.n + (d.roll.n === 1 ? " sale" : " sales")); rn.title = "What this exact roll sold for: the typical of " + d.roll.n + " watched sales of it in the last two weeks. The deal is measured against that, not against the item's overall typical."; tags.appendChild(rn); } }
      tr.appendChild(nameCell(i, tags));
      var pc = el("td"); pc.appendChild(el("span", "pct " + (d.pct >= HOT ? "down" : "flat"), Math.round(d.pct * 100) + "% off")); tr.appendChild(pc);
      var uc = el("td"); uc.appendChild(money(d.u)); tr.appendChild(uc);
      var tc = el("td"); tc.appendChild(money(d.typ)); tr.appendChild(tc);
      var gc = el("td"); gc.appendChild(money(d.gap)); tr.appendChild(gc);
      var wc = el("td"); wc.style.textAlign = "left"; wc.appendChild(el("b", null, d.s)); var bl = d.l || (d.roll && d.roll.r ? d.roll : i.bestL), wh = bl ? where(bl) : ""; if (wh) { wc.appendChild(el("br")); wc.appendChild(el("small", null, wh)); }
      if (bl && bl.stream) { wc.appendChild(el("br")); var ss = el("small"); ss.appendChild(streamLink(bl)); wc.appendChild(ss); } tr.appendChild(wc);
      tr.appendChild(el("td", null, ago(d.t)));
      if (lst && lst.s) tipAttach(tr, lst, i.item);   // a deal is one listing: hover it for the item as the game shows it
      tb.appendChild(tr);
    });
    $("deal-empty").hidden = list.length > 0;
    var dn = $("deal-note"); if (dn) { dn.textContent = "Equips are matched by roll, so only hovered listings show here."; dn.hidden = false; }
    // searching on this tab: say which matching items exist but aren't under typical right now, so none seem missing
    var also = $("deal-also"); also.textContent = ""; also.hidden = true;
    if (boardQ().trim()) {
      var inDeals = {}; list.forEach(function (d) { inDeals[d.item] = 1; });
      var rest = basel.filter(function (i) { return !inDeals[i.item] && inCat(i); }).slice(0, 6);
      if (rest.length) {
        also.appendChild(el("span", "dah", "Also matches, not under typical right now:"));
        rest.forEach(function (i) {
          var b = el("button", "dai"); b.type = "button"; b.appendChild(iconBox(i.item)); b.appendChild(el("span", null, i.item));
          var t = el("small"); t.appendChild(document.createTextNode("typical ")); t.appendChild(money(i.typ)); b.appendChild(t);
          b.addEventListener("click", function () { pick(i.item); }); also.appendChild(b);
        });
        also.hidden = false;
      }
    }
    $("count").textContent = list.length + " items listed under their typical price";
    document.querySelectorAll("thead button[data-d]").forEach(function (b) { if (b.dataset.d === state.dK) b.setAttribute("aria-sort", state.dDir < 0 ? "descending" : "ascending"); else b.removeAttribute("aria-sort"); });
  }

  // ---------- base stats from the public item database, so a roll can be shown as plus or minus
  var BASE = {}, BASEMAP = { incPAD: "ATT", incMAD: "MATT", incPDD: "WDEF", incMDD: "MDEF", incSTR: "STR", incDEX: "DEX", incINT: "INT", incLUK: "LUK", incMHP: "HP", incMMP: "MP", incACC: "ACC", incEVA: "AVOID", incSpeed: "SPEED", incJump: "JUMP", tuc: "SLOTS", reqLevel: "REQLV", reqSTR: "RSTR", reqDEX: "RDEX", reqINT: "RINT", reqLUK: "RLUK", price: "NPC", success: "SUCCESS" };
  function loadBase(name) {
    var id = idOf(name);
    if (!id || BASE[name] !== undefined) return;
    BASE[name] = null;
    fetch(IO + id).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.metaInfo) { BASE[name] = {}; return; } var b = {};
      Object.keys(BASEMAP).forEach(function (k) { if (j.metaInfo[k] != null) b[BASEMAP[k]] = j.metaInfo[k]; });
      b.cash = !!j.metaInfo.cash; b.job = j.metaInfo.reqJob || 0; b.sub = j.typeInfo ? j.typeInfo.subCategory : "";
      BASE[name] = b;
      if ((b.ATT || b.MATT) && D && D.byName[name] && D.byName[name].equip) { DIRTY = true; render(); }      // rolls can be worked out now
      else if (state.sel === name) renderItem();
      if (hovName === name) showHov(name);
      var gi = GTIP_ON && TIPL && TIPL.get(GTIP_ON); if (gi && gi.n === name) { var t = $("gtip"); t.textContent = ""; t.appendChild(gameTip(gi.l, gi.n)); }
    }).catch(function () { if (!BASE[name]) BASE[name] = {}; });
  }
  // The stat that matters most for an item. Weapons: attack, or magic attack for wands and staffs.
  // Other equips: the main stat of the class that wears it, so STR warrior, INT mage, DEX bowman, LUK thief.
  var JOBSTAT = [[1, "STR"], [2, "INT"], [4, "DEX"], [8, "LUK"]];
  var JOBNAME = { WARRIOR: "STR", MAGICIAN: "INT", BOWMAN: "DEX", THIEF: "LUK", PIRATE: "STR" };
  // What buyers pay for, by slot, in the order a roll is keyed. MAIN is the main stat of the class that wears it
  // (STR warrior, INT mage, DEX bowman, LUK thief). Defense is never a pricing stat, except on shields, and there only
  // after attack and main stats. Weapons go by weapon attack, or magic attack for wands and staffs.
  var MAINS = ["STR", "DEX", "INT", "LUK"];
  var VALUE = { Glove: ["ATT", "MATT", "CRIT"], Earrings: ["MAIN", "MATT", "CRITDMG"], Hat: ["MAIN", "HP", "ACC"], Top: ["MAIN", "HP"], Bottom: ["MAIN", "HP"],
    Overall: ["MAIN", "HP"], Cape: ["MAIN", "HP", "ACC"], Shoes: ["SPEED", "JUMP", "DEX"], Shield: ["ATT", "MATT", "MAIN", "WDEF"], "Pet Equipment": ["SPEED", "JUMP"] };
  var VALUE_ANY = ["ATT", "MATT", "MAIN", "CRIT", "CRITDMG", "HP", "MP", "ACC", "AVOID", "SPEED", "JUMP"];
  function subKind(name) { var r = dbRow(name), k = r && DBK[r[5]] || ""; return k.split(":")[1] || ""; }
  // the item list's own type decides (a shield files under Weapons on the board but prices like armour)
  function isWeapon(name) { var sb = subKind(name); return sb ? sb === "Wand" || sb === "Staff" || WEAPONS.test(sb) : category(name) === "Weapons"; }
  // weapons: attack first, then any crit line (a claw with +1 crit rate on a clean roll is worth knowing about)
  function valueOrder(name) {
    var o = isWeapon(name) ? (/^(Wand|Staff)$/.test(subKind(name)) ? ["MATT", "CRIT", "CRITDMG"] : ["ATT", "MATT", "CRIT", "CRITDMG"]) : (VALUE[subKind(name)] || VALUE_ANY).slice();
    var b = fullBase(name).s; ["CRIT", "CRITDMG"].forEach(function (k) { if (b[k] && o.indexOf(k) < 0) o.push(k); });
    return o;
  }
  // every stat that counts toward a roll on this item, MAIN spelled out
  function valSet(name) { var o = {}; valueOrder(name).forEach(function (k) { if (k === "MAIN") MAINS.forEach(function (m) { o[m] = 1; }); else o[k] = 1; }); return o; }
  function mainStat(b, x, xj) {
    var jobs = JOBSTAT.filter(function (j) { return (b.job || 0) & j[0]; }).map(function (j) { return j[1]; });
    if (xj && JOBNAME[xj]) jobs = [JOBNAME[xj]];
    if (jobs.length === 1) return { k: jobs[0], one: true, all: jobs };
    var pk = "", best = -1;
    MAINS.forEach(function (k) { var v = Math.max(b[k] || 0, x && x[k] != null ? x[k] : -1); if ((!jobs.length || jobs.indexOf(k) > -1) && v > best) { best = v; pk = k; } });
    return { k: best > 0 ? pk : "", one: false, all: jobs.length ? jobs : MAINS };
  }
  function keyStat(name, x, xj) {
    if (x && x.SUCCESS != null) return "SUCCESS";
    var b = Object.assign({}, BASE[name] || {}, fullBase(name).s);
    if (b.job == null) { var dr = dbRow(name); if (dr) b.job = dr[3] || 0; }
    if (isWeapon(name)) {
      if (/^(Wand|Staff)$/.test(subKind(name)) || (b.MATT || 0) > (b.ATT || 0) || (!b.ATT && x && x.MATT != null && x.ATT == null)) return "MATT";
      return "ATT";
    }
    var order = valueOrder(name), ms = mainStat(b, x, xj);
    var has = function (k) { return (b[k] || 0) > 0 || (x && x[k] != null); };
    // a copy with a valuable stat off its base is keyed on that stat: +10 LUK earrings go by LUK, not crit damage
    if (x) for (var i = 0; i < order.length; i++) {
      var ks = order[i] === "MAIN" ? ms.all : [order[i]];
      for (var j = 0; j < ks.length; j++) {
        var k = ks[j], bv = x[k + "_b"] != null ? x[k + "_b"] : b[k] || 0;
        if (x[k] == null || x[k] === bv || (/^(HP|MP|ACC|AVOID|WDEF|MDEF)$/.test(k) && bv > 0 && Math.abs(x[k] - bv) <= Math.max(1, Math.ceil(bv * 0.12)))) continue;
        return k;
      }
    }
    // gloves are shopped by attack: a pair with nothing moved is a 0 ATT pair, even though most carry 1 crit rate
    if (subKind(name) === "Glove") return x && x.MATT != null && x.ATT == null ? "MATT" : "ATT";
    for (var i2 = 0; i2 < order.length; i2++) {
      if (order[i2] === "MAIN") { if (ms.k && (ms.one || has(ms.k))) return ms.k; continue; }
      if (has(order[i2])) return order[i2];
    }
    return order[0] === "MAIN" ? ms.k : order[0];
  }
  // one line for the item page: which stat Price by roll is keyed on, and why
  var KEYWHY = { Glove: "gloves sell by the attack scrolled onto them, then a crit rate roll (a 2 crit pair of Work Gloves sells for many times a 1 crit one)", Earrings: "earrings sell by main stats, then magic attack, then crit damage",
    Hat: "hats sell by main stats, then HP and accuracy", Top: "tops sell by main stats, then HP", Bottom: "bottoms sell by main stats, then HP",
    Overall: "overalls sell by main stats, then HP", Cape: "capes sell by main stats, then HP and accuracy", Shoes: "shoes sell by speed, jump and DEX",
    Shield: "shields sell by attack, then main stats, then defense", "Pet Equipment": "pet equips sell by speed and jump" };
  function keyWhy(name) {
    var k = keyStat(name, null, ""); if (!k || k === "SUCCESS") return "";
    var why = isWeapon(name) ? (k === "MATT" ? "wands and staffs sell by magic attack" : "weapons sell by weapon attack") : KEYWHY[subKind(name)] || "it's the stat this item is bought for";
    var b = fullBase(name).s, one = MAINS.indexOf(k) > -1 && (classMask(name) & 15) && [1, 2, 4, 8].filter(function (m) { return classMask(name) & m; }).length === 1;
    return "Rolls keyed on " + (STATABBR[k] || k) + (b[k] ? " (base " + b[k] + ")" : "") + ": " + why + (one ? ", and this is " + MAINCLS[k] + " gear" : "") + ". A copy that moved another of those stats is keyed on that one. Defense never counts" + (subKind(name) === "Shield" ? " except last on shields" : "") + ".";
  }
  // An equip's base stats. The item list carries them from the game data (Classic's own data leaves weapon attack
  // out, so the closed beta data fills it in). Hovers in the game check them: a stat at its base shows as a plain
  // number ("Weapon Attack: +55"), one that rolled differently shows the base in brackets ("+57 (55 +2)"), and one
  // that rolled down to nothing has no line at all. When two or more hovers agree on a base the data doesn't
  // have, or most hovers outvote the data, the hovers win.
  var LB = {}, BSTATS = ["ATT", "MATT", "STR", "DEX", "INT", "LUK", "HP", "MP", "WDEF", "MDEF", "ACC", "AVOID", "SPEED", "JUMP", "CRIT", "CRITDMG"];
  function dbBase(name) {
    var r = dbRow(name); if (!r) return null;
    if (r[7] && typeof r[7] === "object") return r[7];
    if (r.length > 8) { var o = {}; if (r[7]) o.ATT = r[7]; if (r[8]) o.MATT = r[8]; return o; }    // older list: attack only
    return null;
  }
  // A tooltip read off the screen can belong to the item next to it. Before any stat counts toward a roll, it has to
  // be one this item can carry: one of its base stats, or one a scroll for its slot adds (no attack on earrings).
  // Every scroll in the game, from its own description (MeowDB): per slot, each scroll line's four grades as
  // [success rate, what one pass adds]. Lesser 100%, Intermediate 60%, Greater 10%, Chaos 10% (half the fails destroy
  // the item). A failed scroll uses the slot and adds nothing. DEF scrolls above Lesser add magic defense too.
  var SCROLLS = {"Bottom":[["DEF",[[100,{"WDEF":2}],[60,{"WDEF":4,"MDEF":2}],[10,{"WDEF":6,"MDEF":4}],[10,{"WDEF":8,"MDEF":6}]]],["HP",[[100,{"HP":10}],[60,{"HP":15}],[10,{"HP":20}],[10,{"HP":25}]]],["MP",[[100,{"MP":10}],[60,{"MP":15}],[10,{"MP":20}],[10,{"MP":25}]]]],"Bow":[["Attack",[[100,{"ATT":1}],[60,{"ATT":2}],[10,{"ATT":4}],[10,{"ATT":5}]]]],"Cape":[["Accuracy",[[100,{"ACC":1}],[60,{"ACC":2}],[10,{"ACC":3}],[10,{"ACC":4}]]],["DEX",[[100,{"DEX":1}],[60,{"DEX":2}],[10,{"DEX":3}],[10,{"DEX":4}]]],["INT",[[100,{"INT":1}],[60,{"INT":2}],[10,{"INT":3}],[10,{"INT":4}]]],["LUK",[[100,{"LUK":1}],[60,{"LUK":2}],[10,{"LUK":3}],[10,{"LUK":4}]]],["Magic Def",[[100,{"MDEF":2}],[60,{"WDEF":2,"MDEF":4}],[10,{"WDEF":4,"MDEF":6}],[10,{"WDEF":6,"MDEF":8}]]],["STR",[[100,{"STR":1}],[60,{"STR":2}],[10,{"STR":3}],[10,{"STR":4}]]],["Weapon Def",[[100,{"WDEF":2}],[60,{"WDEF":4,"MDEF":2}],[10,{"WDEF":6,"MDEF":4}],[10,{"WDEF":8,"MDEF":6}]]]],"Claw":[["Attack",[[100,{"ATT":1}],[60,{"ATT":2}],[10,{"ATT":4}],[10,{"ATT":5}]]]],"Crossbow":[["Attack",[[100,{"ATT":1}],[60,{"ATT":2}],[10,{"ATT":4}],[10,{"ATT":5}]]]],"Dagger":[["Attack",[[100,{"ATT":1}],[60,{"ATT":2}],[10,{"ATT":4}],[10,{"ATT":5}]]]],"Earrings":[["Avoidability",[[100,{"AVOID":1}],[60,{"AVOID":2}],[10,{"AVOID":3}],[10,{"AVOID":4}]]],["Crit",[[100,{"CRITDMG":1}],[60,{"CRITDMG":2}],[10,{"CRITDMG":3}],[10,{"CRITDMG":4}]]],["DEX",[[100,{"DEX":1}],[60,{"DEX":2}],[10,{"DEX":3}],[10,{"DEX":4}]]],["INT",[[100,{"INT":1}],[60,{"INT":2}],[10,{"INT":3}],[10,{"INT":4}]]],["LUK",[[100,{"LUK":1}],[60,{"LUK":2}],[10,{"LUK":3}],[10,{"LUK":4}]]],["STR",[[100,{"STR":1}],[60,{"STR":2}],[10,{"STR":3}],[10,{"STR":4}]]]],"Glove":[["Accuracy",[[100,{"ACC":1}],[60,{"ACC":2}],[10,{"ACC":3}],[10,{"ACC":4}]]],["Attack",[[100,{"ATT":1}],[60,{"ATT":2}],[10,{"ATT":3}],[10,{"ATT":4}]]],["Crit",[[100,{"CRIT":1}],[60,{"CRIT":2}],[10,{"CRIT":3}],[10,{"CRIT":4}]]],["Magic Attack",[[100,{"MATT":2}],[60,{"MATT":4}],[10,{"MATT":6}],[10,{"MATT":8}]]]],"Hat":[["Accuracy",[[100,{"ACC":1}],[60,{"ACC":2}],[10,{"ACC":3}],[10,{"ACC":4}]]],["HP",[[100,{"HP":10}],[60,{"HP":15}],[10,{"HP":20}],[10,{"HP":25}]]],["MP",[[100,{"MP":10}],[60,{"MP":15}],[10,{"MP":20}],[10,{"MP":25}]]]],"One-Handed Axe":[["Attack",[[100,{"ATT":1}],[60,{"ATT":2}],[10,{"ATT":4}],[10,{"ATT":5}]]]],"One-Handed Blunt Weapon":[["Attack",[[100,{"ATT":1}],[60,{"ATT":2}],[10,{"ATT":4}],[10,{"ATT":5}]]]],"One-Handed Sword":[["Attack",[[100,{"ATT":1}],[60,{"ATT":2}],[10,{"ATT":4}],[10,{"ATT":5}]]]],"Overall":[["DEF",[[100,{"WDEF":2}],[60,{"WDEF":4,"MDEF":2}],[10,{"WDEF":6,"MDEF":4}],[10,{"WDEF":8,"MDEF":6}]]],["DEX",[[100,{"DEX":1}],[60,{"DEX":2}],[10,{"DEX":3}],[10,{"DEX":4}]]],["INT",[[100,{"INT":1}],[60,{"INT":2}],[10,{"INT":3}],[10,{"INT":4}]]],["LUK",[[100,{"LUK":1}],[60,{"LUK":2}],[10,{"LUK":3}],[10,{"LUK":4}]]],["STR",[[100,{"STR":1}],[60,{"STR":2}],[10,{"STR":3}],[10,{"STR":4}]]]],"Pet Equipment":[["Jump",[[100,{"JUMP":1}],[60,{"JUMP":2}],[10,{"JUMP":3}],[10,{"JUMP":4}]]],["Speed",[[100,{"SPEED":1}],[60,{"SPEED":2}],[10,{"SPEED":3}],[10,{"SPEED":4}]]]],"Pole Arm":[["Attack",[[100,{"ATT":1}],[60,{"ATT":2}],[10,{"ATT":4}],[10,{"ATT":5}]]]],"Shield":[["Accuracy",[[100,{"ACC":1}],[60,{"ACC":2}],[10,{"ACC":3}],[10,{"ACC":4}]]],["DEF",[[100,{"WDEF":2}],[60,{"WDEF":4,"MDEF":2}],[10,{"WDEF":6,"MDEF":4}],[10,{"WDEF":8,"MDEF":6}]]]],"Shoes":[["Avoidability",[[100,{"AVOID":1}],[60,{"AVOID":2}],[10,{"AVOID":3}],[10,{"AVOID":4}]]],["Jump",[[100,{"JUMP":1}],[60,{"JUMP":2}],[10,{"JUMP":3}],[10,{"JUMP":4}]]],["Speed",[[100,{"SPEED":1}],[60,{"SPEED":2}],[10,{"SPEED":3}],[10,{"SPEED":4}]]]],"Spear":[["Attack",[[100,{"ATT":1}],[60,{"ATT":2}],[10,{"ATT":4}],[10,{"ATT":5}]]]],"Staff":[["Magic Attack",[[100,{"MATT":2}],[60,{"MATT":4}],[10,{"MATT":8}],[10,{"MATT":10}]]]],"Top":[["DEF",[[100,{"WDEF":2}],[60,{"WDEF":4,"MDEF":2}],[10,{"WDEF":6,"MDEF":4}],[10,{"WDEF":8,"MDEF":6}]]],["HP",[[100,{"HP":10}],[60,{"HP":15}],[10,{"HP":20}],[10,{"HP":25}]]],["MP",[[100,{"MP":10}],[60,{"MP":15}],[10,{"MP":20}],[10,{"MP":25}]]]],"Two-Handed Axe":[["Attack",[[100,{"ATT":1}],[60,{"ATT":2}],[10,{"ATT":4}],[10,{"ATT":5}]]]],"Two-Handed Blunt":[["Attack",[[100,{"ATT":1}],[60,{"ATT":2}],[10,{"ATT":4}],[10,{"ATT":5}]]]],"Two-Handed Sword":[["Attack",[[100,{"ATT":1}],[60,{"ATT":2}],[10,{"ATT":4}],[10,{"ATT":5}]]]],"Wand":[["Magic Attack",[[100,{"MATT":2}],[60,{"MATT":4}],[10,{"MATT":8}],[10,{"MATT":10}]]]]};
  // the stats a scroll can add on each slot, straight from that table
  var SCROLLABLE = {}; Object.keys(SCROLLS).forEach(function (sub) { var o = {}; SCROLLS[sub].forEach(function (ln) { ln[1].forEach(function (g) { Object.keys(g[1]).forEach(function (k) { o[k] = 1; }); }); }); SCROLLABLE[sub] = Object.keys(o).join(" "); });
  var WEAPONS = /Sword|Axe|Blunt|Dagger|Spear|Pole Arm|Bow|Crossbow|Claw|Knuckle|Gun/;
  // returns the stats this item can really have: attack where the slot can't have attack means the whole tooltip was
  // another item's (null); a stray stat line (a requirement read as a bonus, "LUK 70" on a claw) is dropped on its own
  // Our item list doesn't know every item's base stats (Red Cross Earrings carry +5 HP, Bronze Helmet +4 STR). A stat
  // the list doesn't have still counts when it's small and two or more hovers show the same base for it; a big one
  // ("LUK 70" on a claw) is a requirement read as a bonus, and attack where the slot can't have attack means the
  // tooltip was another item's.
  var CONS = {}, SMALL = { STR: 15, DEX: 15, INT: 15, LUK: 15, ACC: 15, AVOID: 15, SPEED: 15, JUMP: 15, HP: 60, MP: 60, WDEF: 40, MDEF: 40, CRIT: 15, CRITDMG: 15 };
  function statsFix(name, x) {
    if (!x || typeof x !== "object") return x;
    if (x._ok) return x;                        // read exactly by FM Watcher and checked against the item: never "fixed"
    var r = dbRow(name); if (!r) return x;
    var kind = DBK[r[5]] || "", sub = kind.split(":")[1] || "", base = dbBase(name) || {};
    if (!/^Equip/.test(kind)) return x;        // a scroll's tooltip lists what it adds; that's not a roll
    var allow = {}; Object.keys(base).forEach(function (k) { allow[k] = 1; });
    if (!r[4]) (SCROLLABLE[sub] || (WEAPONS.test(sub) ? "ATT" : "")).split(" ").forEach(function (k) { if (k) allow[k] = 1; });
    var out = x, foreign = false;
    BSTATS.forEach(function (k) {
      if (!x[k]) return;
      if (x[k + "_b"] == null && base[k] && x[k] !== base[k] && slipFix(name, x, x[k], base[k])) { if (out === x) out = Object.assign({}, x); out[k] = base[k]; return; }
      // a stat only scrolls give this item, showing a big plain number ("LUK 30" on an overall): a requirement line
      if (allow[k] && base[k] == null && SMALL[k] && x[k] > SMALL[k] && !(x[k + "_b"] != null && x[k + "_b"] < x[k])) {
        if (out === x) out = Object.assign({}, x);
        delete out[k]; delete out[k + "_b"]; return;
      }
      if (allow[k]) return;
      if (k === "ATT" || k === "MATT") { foreign = true; return; }
      var bv = x[k + "_b"] != null ? x[k + "_b"] : x[k];
      if (x[k] <= (SMALL[k] || 0) && (CONS[name + "|" + k + "|" + bv] || 0) >= 2) return;   // a base stat our list is missing
      if (out === x) out = Object.assign({}, x);
      delete out[k]; delete out[k + "_b"]; if (out._tip) { out._tip = Object.assign({}, out._tip); delete out._tip[k]; }
    });
    return foreign ? null : out;
  }
  function statsFit(name, x) { return statsFix(name, x) === x; }
  // the text reader's usual digit slips: a 1 read as 4 or 7, and back
  // A value with no brackets that only a scroll could reach, on a copy that took no passed scroll (all slots left, or a
  // white name), can't be real: when it's one digit off the base (1 read as 4), it's the base.
  function slipFix(name, x, v, base) {
    if (base > 5 || Math.abs(v - base) <= 2 || !digitSlip(v, base)) return false;   // small bases only: a drop moves them 1 or 2 at most
    var bs = (dbBase(name) || {}).SLOTS;
    return x.UP === 0 || (bs != null && x.SLOTS != null && x.SLOTS === bs);
  }
  function digitSlip(a, b) {
    a = String(a); b = String(b); if (a.length !== b.length) return false;
    var diff = []; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(a[i] + b[i]);
    return diff.length === 1 && /^(14|41|17|71)$/.test(diff[0]);
  }
  function sanitizeStats(L) {
    CONS = {};
    L.forEach(function (l) { var x = l.x; if (!x) return; BSTATS.forEach(function (k) { if (x[k]) { var bv = x[k + "_b"] != null ? x[k + "_b"] : x[k], key = l.i + "|" + k + "|" + bv; CONS[key] = (CONS[key] || 0) + 1; } }); });
    L.forEach(function (l) { if (!l.x) return; var f = statsFix(l.i, l.x); if (f !== l.x) { l.xbad = l.x; l.x = f; } });
    // Upgrades left that can't be right: more than the item comes with, or armour with more scrolled attack than its
    // used slots could give (3 per success at most). One wrong slot count moves an equip's price a lot, so the read is
    // set aside (the daily stat report counts these) and the listing is priced as if it wasn't hovered.
    L.forEach(function (l) {
      var x = l.x; if (!x || x.SLOTS == null) return;
      var b = dbBase(l.i) || {}; if (!b.SLOTS) return;
      var gain = category(l.i) !== "Weapons" && !b.ATT && !b.MATT ? (x.ATT || 0) + (x.MATT || 0) : 0;
      if (x.SLOTS > b.SLOTS || (b.SLOTS - x.SLOTS) * 3 < gain) { l.xbad = Object.assign({ _why: "slots" }, x); l.x = null; }
    });
  }
  // The same copy is often hovered by two scanners, or twice by one, and only one read reaches the upgrades line.
  // When the reads agree on every stat they share, the complete one fills in what the other missed.
  function mergeReads(all) {
    var by = {};
    // the same copy: same seller, same item, same price and bundle (the item was missing from this once, so two
    // different items one seller priced alike could share stats)
    all.forEach(function (l) { if (!l.x || l.b || l.chat || l.x._ok) return; var k = String(l.s).toLowerCase() + "|" + String(l.i).toLowerCase() + "|" + l.u + "|" + (l.q || 1); (by[k] || (by[k] = [])).push(l); });
    Object.keys(by).forEach(function (k) {
      var g = by[k]; if (g.length < 2) return;
      var full = g.filter(function (l) { return l.x.SLOTS != null; }).sort(function (a, b) { return b.t - a.t; });
      if (!full.length) return;
      g.forEach(function (l) {
        if (l.x.SLOTS != null || l.x._merged) return;
        var m = full.filter(function (f) { return Math.abs(f.t - l.t) < 3 * DAY && BSTATS.every(function (s) { return l.x[s] == null || f.x[s] == null || l.x[s] === f.x[s]; }); })[0];
        if (!m) return;
        // only the upgrades line comes across; the other read's stats never do (that added stats a copy didn't have)
        var x = Object.assign({}, l.x); x.SLOTS = m.x.SLOTS; if (m.x.UP != null && x.UP == null) x.UP = m.x.UP; x._merged = 1; delete x._ok; l.x = x;
      });
    });
  }
  window.fmQA && (window.fmQA.cons = function (L) { sanitizeStats(L); return CONS; });
  function learnBase(L) {
    LB = {};
    L.forEach(function (l) {
      var x = l.x; if (!x || (!x._tip && !x._tipx)) return;
      BSTATS.forEach(function (k) {
        var b = x[k + "_b"]; if (b == null || ((x._tip || {})[k] == null && (x._tipx || {})[k] == null)) return;
        var m = LB[l.i] || (LB[l.i] = {}), mk = m[k] || (m[k] = {}); mk[b] = (mk[b] || 0) + 1;
      });
      if (x.SLOTS != null) { var m2 = LB[l.i] || (LB[l.i] = {}); m2._slots = Math.max(m2._slots || 0, x.SLOTS); }
    });
  }
  function hoverVote(c) {
    var best = null, bn = 0, tot = 0;
    Object.keys(c).forEach(function (v) { var n = c[v]; tot += n; if (n > bn) { bn = n; best = +v; } });
    return { v: best, n: bn, of: tot };
  }
  // The game data decides every stat it has: it matched the hovers everywhere they were read cleanly, while the
  // screen reader now and then turns a 1 into a 4 or takes a "REQ LUK" line for a stat. Hovers only fill in
  // attack on weapons the data leaves without it: two or more hovers agreeing, or a single one marked unconfirmed.
  function fullBase(name) {
    var db = dbBase(name) || {}, api = BASE[name] || {}, c = LB[name] || {}, out = {}, src = {}, weak = {};
    BSTATS.forEach(function (k) {
      var dv = db[k] != null ? db[k] : api[k] || null;
      if (dv) { out[k] = dv; src[k] = "data"; return; }
      if ((k === "ATT" || k === "MATT") && c[k]) {
        var hv = hoverVote(c[k]);
        if (hv.v > 0 && hv.n * 2 > hv.of) { out[k] = hv.v; src[k] = "hovers"; if (hv.n < 2) weak[k] = 1; }
      }
    });
    var sl = db.SLOTS || api.SLOTS || c._slots; if (sl) out.SLOTS = sl;
    if (db.KB) out.KB = db.KB; if (db.ASPD) out.ASPD = db.ASPD;       // shown in the popup, never priced
    return { s: out, src: src, weak: weak, known: !!(Object.keys(db).length || api.SLOTS != null) };
  }
  // A stat that rolled down to nothing has no line in the hover, so a complete hover (one that reached the
  // Remaining Enhancements line at the bottom) with no line for a stat the item has means that stat rolled -base.
  function missingLines(L) {
    // A line the reader missed looks exactly like a stat that rolled to nothing, and a drop moves a small stat by 1 at
    // most (a 3 LUK cape can't roll to 0), so a missing line no longer counts as a roll. Old marks are undone.
    L.forEach(function (l) { var x = l.x; if (!x || !x._mk) return; x._mk.forEach(function (k) { if (x._tip) delete x._tip[k]; delete x[k]; delete x[k + "_b"]; }); x._mk = []; if (x._tip && !Object.keys(x._tip).length) delete x._tip; });
    return;
    var ROLLK = TIPSTAT.map(function (t) { return t[1]; }), fbc = {};
    L.forEach(function (l) {
      var x = l.x; if (!x) return;
      // worked out again on every build (the item list loads after the first one); undo the last pass first
      (x._mk || []).forEach(function (k) { if (x._tip) delete x._tip[k]; delete x[k]; delete x[k + "_b"]; });
      if (x._tip && !Object.keys(x._tip).length) delete x._tip;
      x._mk = [];
      if (!l.xt || !l.xt.length || !l.xt.some(function (t) { return /enhance|upgrade/i.test(t); })) return;
      var fb = fbc[l.i] || (fbc[l.i] = fullBase(l.i).s);
      var critLine = l.xt.some(function (t) { return /cri?t/i.test(t); });
      ROLLK.forEach(function (k) {
        if ((k === "CRIT" || k === "CRITDMG") && (critLine || fb[k] > 1)) return;   // crit 2 rolls 1 to 3, never to nothing: no line is a missed read
        // only small stats can roll away to nothing; a big one with no line is a line the reader missed
        if (!fb[k] || fb[k] > 5 || x[k] != null || (x._tip && x._tip[k] != null)) return;
        (x._tip || (x._tip = {}))[k] = -fb[k]; x[k] = 0; x[k + "_b"] = fb[k]; x._mk.push(k);
      });
    });
  }
  var BLABEL = { ATT: "ATT", MATT: "MATT", WDEF: "W.DEF", MDEF: "M.DEF", ACC: "ACC", AVOID: "AVOID", SPEED: "Speed", JUMP: "Jump", HP: "HP", MP: "MP", STR: "STR", DEX: "DEX", INT: "INT", LUK: "LUK", CRIT: "Crit rate", CRITDMG: "Crit damage" };
  function baseText(name) {
    var b = fullBase(name), s = b.s;
    var parts = BSTATS.filter(function (k) { return s[k]; }).map(function (k) { return BLABEL[k] + " " + s[k] + (b.weak[k] ? "?" : ""); });
    if (category(name) === "Weapons" && !s.ATT && !s.MATT) parts.unshift("attack not known yet");
    if (s.SLOTS) parts.push(s.SLOTS + " slots");
    var hov = Object.keys(b.src).filter(function (k) { return b.src[k] !== "data"; }).length;
    return parts.length ? { t: parts.join(" · "), from: hov ? "hovers" : "data" } : (b.known ? { t: "no stats, " + (s.SLOTS || 0) + " slots", from: "data" } : null);
  }
  function itemBase(name) { return fullBase(name); }
  function baseOf(name, x, k) {
    if (x && x[k + "_b"] != null) return x[k + "_b"];
    var b = fullBase(name); if (b.s[k] != null) return b.s[k];
    if (k === "STR" || k === "DEX" || k === "INT" || k === "LUK") return b.known ? 0 : null;
    if ((k === "ATT" || k === "MATT") && b.known && category(name) !== "Weapons") return 0;   // attack on gloves or a cape is scrolled on
    if (b.known && /^(HP|MP|ACC|AVOID|SPEED|JUMP|CRIT|CRITDMG)$/.test(k)) return 0;               // our item data now has every line: none is none
    return null;
  }
  function statChip(name, x, xj) {
    if (!x) return null;
    if (x._tip && x.SUCCESS == null) {
      var gg = rollOf(name, { x: x }), cs = totalsChip(name, x, gg);
      cs.title = "From the tooltip: " + Object.keys(x._tip).map(function (k) { return k + " " + x[k] + (x._tip[k] ? " (" + x[k + "_b"] + (x._tip[k] > 0 ? " +" : " ") + x._tip[k] + ")" : ""); }).join(", ");
      return slotTag(cs, name, x);
    }
    var k = keyStat(name, x, xj), g = rollOf(name, { x: x, xj: xj }), s = el("span", "xs");
    if (k && x[k] != null) s.textContent = (k === "SUCCESS" ? x[k] + "%" : k + " " + x[k]);
    else if (x.ATT != null || x.MATT != null) s.textContent = x.ATT != null ? "ATT " + x.ATT : "MATT " + x.MATT;
    else if (g != null) s.textContent = "Roll";
    else if (x.clean) s.textContent = "Clean";
    else return null;
    if (g != null && k !== "SUCCESS") s.appendChild(el("em", g > 0 ? "up" : g < 0 ? "down" : "", g === 0 ? "avg" : (g > 0 ? "+" : "") + g));
    return slotTag(s, name, x);
  }
  // a read copy's totals in plain text, so a glance is enough: weapons their attack, gloves attack then crit, other
  // equips each main stat they have, then what buyers pay for on that slot. The gap from the item's base is coloured.
  var TOTLAB = { ATT: "ATT", MATT: "MATT", STR: "STR", DEX: "DEX", INT: "INT", LUK: "LUK", CRIT: "crit", CRITDMG: "crit dmg", ACC: "ACC", AVOID: "AVOID", SPEED: "speed", JUMP: "jump", HP: "HP", MP: "MP", WDEF: "WDEF", MDEF: "MDEF" };
  function totalKeys(name, x) {
    var wep = isWeapon(name), mag = /^(Wand|Staff)$/.test(subKind(name)), vs = valSet(name), ks = [];
    var add = function (k) { if (ks.indexOf(k) < 0 && x[k] != null && (x[k] !== 0 || k === "ATT" || k === "MATT")) ks.push(k); };
    if (subKind(name) === "Glove") { ks.push("ATT"); }      // gloves always lead with attack: a popup with no attack line is 0
    if (wep) add(mag ? "MATT" : "ATT");
    else if (x.ATT || vs.ATT) add("ATT");
    if (!wep && (x.MATT || vs.MATT)) add("MATT");
    MAINS.forEach(function (k) { if (x[k]) add(k); });
    valueOrder(name).forEach(function (k) { if (k !== "MAIN" && k !== "WDEF" && k !== "MDEF" && (!wep || (k !== "ATT" && k !== "MATT"))) add(k); });
    if (subKind(name) === "Shield") { add("WDEF"); }
    return ks;
  }
  function totalsChip(name, x, gg) {
    var cs = el("span", "xs tot " + (gg > 0 ? "upx" : gg < 0 ? "downx" : "")), b = fullBase(name).s, ks = totalKeys(name, x);
    if (!ks.length) { cs.textContent = "average roll"; return cs; }
    ks.forEach(function (k, n) {
      if (n) cs.appendChild(document.createTextNode(" · "));
      var v = x[k] != null ? x[k] : 0;
      cs.appendChild(document.createTextNode(v + " " + TOTLAB[k]));
      var d = b[k] != null ? v - b[k] : (x._tip && x._tip[k]) || 0;
      if (d) cs.appendChild(el("em", d > 0 ? "up" : "down", (d > 0 ? "+" : "−") + Math.abs(d)));
    });
    return cs;
  }
  // "3/7 used" or "clean" from the hover's Remaining Enhancements against the item's base slots: scrolls taken,
  // passes and fails both, worked out only from what the player's own screen showed.
  function slotTag(s, name, x) {
    var su = slotsUsed(name, { x: x }), b = fullBase(name).s.SLOTS;
    if (su == null || !b) return s;
    var up = scrollsPassed(name, { x: x });
    var t = el("em", "slot" + (su === 0 ? " clean" : ""), su === 0 ? "clean, " + b + " slots" : su + "/" + b + " used" + (up != null ? ", " + up + " passed" : ""));
    t.title = su === 0 ? "No scrolls used: all " + b + " upgrade slots left" : su + " of " + b + " upgrade slots used (passed or failed scrolls), " + x.SLOTS + " left";
    s.appendChild(t); return s;
  }
  // The game's tooltip shows a stat that rolled off its base as "Critical Rate: +2 (1 +1)": base 1, one above.
  // A stat with no brackets rolled exactly its base. So every hovered equip tells us its own roll, per stat.
  var TIPSTAT = [[/weapon\s*att(?:ack)?/i, "ATT"], [/magic\s*att(?:ack)?/i, "MATT"], [/crit(?:ical)?\s*rate/i, "CRIT"], [/cri\w*\.?\s*da[mrn]\w*/i, "CRITDMG"], [/\bstr\b/i, "STR"], [/\bdex\b/i, "DEX"], [/\bint\b/i, "INT"], [/\bluk\b/i, "LUK"]];
  // the rest of a tooltip: read for the item's base stats only, never counted in a roll
  var TIPEXTRA = [[/weapon\s*def(?:ense)?\.?/i, "WDEF"], [/magic\s*def(?:ense)?\.?/i, "MDEF"], [/accuracy/i, "ACC"], [/avoidability|evasion/i, "AVOID"],
    [/\bspeed\b/i, "SPEED"], [/\bjump\b/i, "JUMP"], [/max\s*hp|\bhp\b/i, "HP"], [/max\s*mp|\bmp\b/i, "MP"]];
  function tipStats(l) {
    if (!l.xt || !l.xt.length || !l.x || l.x._tipd) return;
    l.x._tipd = true;                                                 // parsed once; the same x object comes back every build
    var bon = {}, ext = {}, any = false, vs = valSet(l.i), shield = subKind(l.i) === "Shield";
    l.xt.forEach(function (line) {
      if (/\breq|re\s*[qgo0@®©]+\s*(lev|lv|str|dex|int|luk)/i.test(line)) return;   // "REQ STR: 35" (or misread "RE@LUK") is a requirement, not a stat
      TIPSTAT.concat(TIPEXTRA).forEach(function (t) {
        var extra = TIPEXTRA.indexOf(t) >= 0;
        if (extra && vs[t[1]] && (shield || (t[1] !== "WDEF" && t[1] !== "MDEF"))) extra = false;
        var hpmp = t[1] === "HP" || t[1] === "MP";
        var m = new RegExp("(?:" + t[0].source + ")\\s*[:.;]?\\s*\\+?\\s*(\\d{1,3})(?:\\s*[\\(\\[{]\\s*(\\d{1,3})(?:\\s*([+-])?\\s*(\\d{1,3}))?\\s*[\\)\\]}]?)?", "i").exec(line);
        if (!m || bon[t[1]] != null || ext[t[1]] != null) return;
        var v = +m[1], d = 0;
        // "Critical Rate: +4" on 1 crit gloves with no scroll passed is a 1 read as 4: a drop rolls a 1 to 0 or 2 at most
        if (m[2] == null) { var dbv = (dbBase(l.i) || {})[t[1]]; if (dbv && v !== dbv && slipFix(l.i, l.x, v, dbv)) { v = dbv; l.x[t[1]] = dbv; l.x[t[1] + "_b"] = dbv; } }
        if (m[2] != null) {
          // "+52 (55 -3)" is base 55, roll -3. The screen often loses the sign or the whole second number ("+52 (55)"):
          // the base is still there, so the roll is the difference
          d = v - +m[2];
          if (m[4] != null && Math.abs(+m[4]) !== Math.abs(d)) return;   // the brackets must add up, or it's a misread
        }
        if (v >= 200 && !extra && t[1] !== "HP" && t[1] !== "MP" && t[1] !== "WDEF" && t[1] !== "MDEF") return;   // no Classic roll reads 200+ on a main stat or attack
        if (hpmp ? d < -40 || d > 300 : d < -6 || d > 15) return;      // a roll more than 6 under or 15 over base is a misread (HP and MP move more)
        if (extra) ext[t[1]] = d; else { bon[t[1]] = d; any = true; }
        if (l.x[t[1]] == null) l.x[t[1]] = v;
        if (l.x[t[1] + "_b"] == null) l.x[t[1] + "_b"] = v - d;
      });
    });
    if (any) { l.x._tip = bon; }
    if (Object.keys(ext).length) l.x._tipx = ext;
  }
  function bonusLabel(x) {
    var b = x && x._tip; if (!b) return null;
    var parts = Object.keys(b).filter(function (k) { return b[k]; }).map(function (k) { return k + " " + (b[k] > 0 ? "+" : "") + b[k]; });
    return parts.length ? parts.join(" · ") : "average roll";
  }
  // How far a listing's roll is above or below an average one: from "(+3)" in chat, from the item's base stats,
  // or, when the base hasn't loaded, from the middle of every roll we've seen of that item.
  var MEDSTAT = {};
  // Roll pricing only trusts the stats buyers pay for on that slot (see VALUE). Defense counts only on shields. A hover whose name reads as another item is ignored.
  function rollKeyOk(name, l) {
    var x = l && l.x; if (!x) return false;
    if (l.xn) { var hn = String(l.xn).replace(/\s*\(tier cut off\)/, "").toLowerCase(), nn = String(name).toLowerCase(); if (hn && hn !== nn && !nn.startsWith(hn.slice(0, 6)) && !hn.startsWith(nn.slice(0, 6))) return false; }
    var k = keyStat(name, x, l.xj);
    return !!k && k !== "SUCCESS" && (isWeapon(name) || !!valSet(name)[k]);
  }
  // a roll runs from about 5 under base (a bad drop) to 15 over (a full scroll job); anything else is a misread
  function sane(g, k) { return g == null ? null : k === "HP" || k === "MP" ? (g >= -40 && g <= 300 ? g : null) : g >= -6 && g <= 15 ? g : null; }
  function rollOf(name, l) { var p = rollPick(name, l); return p ? sane(p.g, p.k) : null; }
  // the key roll prices are kept under: slots used and every paid-for stat that moved ("0|CRIT+1": clean, crit rate +1)
  function rollKey(name, l, su) { var p = rollPick(name, l); return p ? su + "|" + p.combo : ""; }
  // scrolls that passed, from the popup's title: an orange name with "(+N)" (FM Watcher reads it), a white name is 0.
  // Null when it wasn't read or doesn't add up (more passed than slots used). Slots used minus passed is failed.
  function scrollsPassed(name, l) {
    var x = l && l.x; if (!x || x.UP == null) return null;
    var su = slotsUsed(name, l); if (su == null || x.UP > su || x.UP < 0) return null;
    return x.UP;
  }
  // A drop rolls each stat it comes with up to min(base / 10 + 1, 5) either way (a 1 crit pair rolls 0 to 2, a 31 MATT
  // staff 27 to 35); a stat the item doesn't come with can't roll at all, it only comes from scrolls.
  function natRange(b) { return b > 0 ? Math.min(Math.floor(b / 10) + 1, 5) : 0; }
  // How a copy's stats split into its own drop roll and what its scrolls added, worked out from the scroll table.
  // For every stat read: change from base = natural roll + the gains of the passed scrolls. With the passed count read
  // off the title it's exactly that many passes; without it, anything from 0 to the slots used. Every mix of scrolls
  // that fits is tried, so a stat is "certain" only when every fit agrees. No fit at all means a misread.
  // Returns { ok, nat: {stat: [lo, hi]}, gain: {stat: [lo, hi]}, passed: [lo, hi], su } or null without a slots read.
  function scrollSplit(name, l) {
    var x = l && l.x; if (!x || x.g != null) return null;
    var su = slotsUsed(name, l); if (su == null) return null;
    var up = scrollsPassed(name, l), memo = su + "|" + (up == null ? "" : up);
    if (x._ss && x._ss.k === memo) return x._ss.v;
    var lines = SCROLLS[subKind(name)] || [], b = fullBase(name).s, tot = {}, stats = [];
    BSTATS.forEach(function (k) { if (x[k] == null) return; tot[k] = x[k] - (b[k] || 0); stats.push(k); });
    var res = null, drop = [], badStats = [], vsI = valSet(name);
    // one stat at a time first: a stat no number of passes can explain is a misread line (or our item data is missing
    // it). Lines buyers don't pay for are dropped from the read; a paid-for one keeps the whole read out of roll prices.
    var pHi0 = up != null ? up : su;
    stats = stats.filter(function (k) {
      var gs = {}; lines.forEach(function (ln) { ln[1].forEach(function (g) { gs[g[1][k] || 0] = 1; }); });
      var steps = Object.keys(gs).map(Number); if (!steps.length) steps = [0];
      var reach = { 0: 1 }, fits = false, r = natRange(b[k] || 0);
      for (var p = 0; p <= pHi0 && !fits; p++) {
        if (p >= (up != null ? up : 0)) Object.keys(reach).forEach(function (gv) { if (Math.abs(tot[k] - gv) <= r) fits = true; });
        var nx = {}; Object.keys(reach).forEach(function (gv) { steps.forEach(function (st) { var w = +gv + st; if (w <= tot[k] + r) nx[w] = 1; }); }); reach = nx;
      }
      if (!fits) (vsI[k] ? badStats : drop).push(k);
      return fits;
    });
    if (stats.length) {
      var pLo = up != null ? up : 0, pHi = up != null ? up : su, opts = {}, nGrades = 0;
      lines.forEach(function (ln) { ln[1].forEach(function (g) { nGrades++; var v = stats.map(function (k) { return g[1][k] || 0; }); if (v.some(Boolean)) opts[v.join(",")] = v; }); });
      var ov = Object.keys(opts).map(function (k) { return opts[k]; }), zero = ov.length < nGrades || !lines.length;
      var cap = stats.map(function (k) { return tot[k] + natRange(b[k] || 0); });
      var nat = {}, gain = {}, any = false, pass = [99, -1], cur = {};
      cur[stats.map(function () { return 0; }).join(",")] = 1;
      for (var p = 0; p <= pHi; p++) {
        if (p >= pLo) Object.keys(cur).forEach(function (key) {
          var v = key.split(",").map(Number);
          for (var i = 0; i < stats.length; i++) if (Math.abs(tot[stats[i]] - v[i]) > natRange(b[stats[i]] || 0)) return;
          any = true; pass[0] = Math.min(pass[0], p); pass[1] = Math.max(pass[1], p);
          stats.forEach(function (k, i) { var n = tot[k] - v[i]; nat[k] = nat[k] ? [Math.min(nat[k][0], n), Math.max(nat[k][1], n)] : [n, n]; gain[k] = gain[k] ? [Math.min(gain[k][0], v[i]), Math.max(gain[k][1], v[i])] : [v[i], v[i]]; });
        });
        if (p === pHi) break;
        var nx = {};
        Object.keys(cur).forEach(function (key) {
          var v = key.split(",").map(Number);
          if (zero) nx[key] = 1;           // a pass on a stat this copy's popup didn't show leaves the stats read as they were
          ov.forEach(function (o) { var w = v.map(function (a, i) { return a + o[i]; }); for (var i = 0; i < w.length; i++) if (w[i] > cap[i]) return; nx[w.join(",")] = 1; });
        });
        cur = nx; if (!Object.keys(cur).length) break;
      }
      res = { ok: any && !badStats.length, nat: nat, gain: gain, passed: any ? pass : null, su: su, drop: drop, badStats: badStats };
    } else if (drop.length || badStats.length) res = { ok: !badStats.length, nat: {}, gain: {}, passed: null, su: su, drop: drop, badStats: badStats };
    x._ss = { k: memo, v: res };
    return res;
  }
  // "natural +1 crit rate" when every fit agrees on a stat that moved; "natural 0 to +1 crit rate" when it could be either
  function naturalWords(name, sp, only) {
    if (!sp || !sp.ok) return "";
    var vs = valSet(name), out = [];
    Object.keys(sp.nat).forEach(function (k) {
      if (only && !vs[k]) return;
      var r = sp.nat[k]; if (!r[0] && !r[1]) return;
      var f = function (n) { return (n > 0 ? "+" : "") + n; };
      out.push((r[0] === r[1] ? f(r[0]) : f(r[0]) + " to " + f(r[1])) + " " + (STATWORD[k] || k));
    });
    return out.length ? "natural " + out.join(", ") : "";
  }
  // slots taken from the item's base count: 0 is clean. Null when the hover didn't reach Remaining Enhancements.
  // ---------------------------------------------------------------- the equip price ladder
  // An equip's price split into named grades a buyer or seller can click, instead of one number blending clean and
  // scrolled copies: Clean (no slot used), Clean with a good natural roll on a stat buyers pay for, Slots used with
  // no gain, then +1, +2... on the item's key stat (the stat its scrolled copies most often gained), at most 5 grades.
  // Only hovers that pass the roll checks count (rollKeyOk, slots read). A grade with 3+ sales in the board's window
  // shows the middle of its sales; otherwise its asking prices, labeled as asking.
  var LADMIN = 2, LADSEL = {}, LADSTAT = {};
  var CRITK = { CRIT: 1, CRITDMG: 1 };
  function ladName(k) { return k === "TOTAL" ? "stats" : k === "CRIT" ? "crit rate" : k === "CRITDMG" ? "crit damage" : STATABBR[k] || k; }
  function ladderOf(i) {
    if (!i || !i.equip) return null;
    var stamp = (i.buy || []).length + "|" + i.sales.length + "|" + (D && D.L ? D.L.length : 0);
    if (i._lad && i._lad.at === stamp) return i._lad;
    var n = i.item, wep = isWeapon(n), wk = wep ? keyStat(n, null) : null, base = fullBase(n).s;
    // a copy counts only when its popup was read well: the roll checks pass, its slots were read, and its stats fit
    // what the game allows (a drop moves a stat at most 5 off base; scrolls add only what their slots could)
    // An item whose base has no stat buyers pay for (defense earrings, plain hats) has no roll to key on: a copy with its
    // slots read and its stats fitting the game still counts, as Clean or as slots used with no gain.
    var ok = function (l) {
      if (!l.x || l.chat || slotsUsed(n, l) == null) return false;
      var sp = scrollSplit(n, l); if (sp && sp.ok === false) return false;
      if (wep) return l.x[wk] != null && base[wk] > 0 && rollKeyOk(n, l) && !!rollPick(n, l);
      return (rollKeyOk(n, l) && !!rollPick(n, l)) || !!sp;
    };
    var pickOf = function (l) { return (rollKeyOk(n, l) && rollPick(n, l)) || { g: 0, k: "", mv: {}, combo: "" }; };
    var seenA = {}, asks = (i.buy || []).filter(function (x) { if (x.st === "gone" || x.st === "sold" || !ok(x)) return false; var k = x.s + "|" + x.u + "|" + x.x.SLOTS + "|" + (pickOf(x).combo || "") + "|" + (wep ? x.x[wk] : ""); if (seenA[k]) return false; seenA[k] = 1; return true; });
    var sold = i.sales.filter(ok), all = sold.map(function (l) { return [l, 1]; }).concat(asks.map(function (l) { return [l, 0]; }));
    var scrollable = null; (SCROLLS[subKind(n)] || []).forEach(function (ln) { ln[1].forEach(function (g) { Object.keys(g[1] || {}).forEach(function (k) { if (g[1][k] > 0) (scrollable || (scrollable = {}))[k] = 1; }); }); });
    var G = {}, order = [];
    function put(id, a, name, sortv) { var g = G[id]; if (!g) { g = G[id] = { id: id, name: name, sv: sortv, sold: [], asks: [] }; order.push(g); } g[a[1] ? "sold" : "asks"].push(a[0]); }
    var statN = {};
    all.forEach(function (a) {
      var l = a[0], su = slotsUsed(n, l), p = pickOf(l), mv = p.mv || {};
      if (wep) {
        // weapons go by their attack number, the way players quote them: clean ones by their own roll, then scrolled
        var v = l.x[wk];
        if (su === 0) put("WC|" + v, a, "Clean " + v + " " + ladName(wk), v); else put("WS|" + v, a, "Scrolled " + v + " " + ladName(wk), 1000 + v);
        return;
      }
      var up = Object.keys(mv).filter(function (k) { return mv[k] > 0; });
      if (su === 0) {
        // clean: plain, or a natural roll above base on a stat buyers pay for (crit on gloves and earrings first)
        if (!up.length) put("C|", a, "Clean", 0);
        else { var key = up.sort().map(function (k) { return k + "+" + mv[k]; }).join("."); put("C|" + key, a, "Clean, " + up.map(function (k) { return "+" + mv[k] + " " + ladName(k); }).join(" "), up.some(function (k) { return CRITK[k]; }) ? 0.5 : 0.7); }
        return;
      }
      if (!up.length) { put("S|0", a, "Slots used, no gain", 1); return; }
      // scrolled: one grade per stat it gained, so a hat with +3 INT shows under INT and one with +3 DEX under DEX
      // only stats a scroll for this slot can add get a ladder (the game's scroll table); a glove's natural +1 crit
      // isn't a scroll job, so it stays with the copy's attack grade
      var sk = up.filter(function (k) { return !scrollable || scrollable[k]; }); if (!sk.length) sk = up;
      // stats are offered in order of how much money trades on them (gloves: attack before crit)
      sk.forEach(function (k) { statN[k] = (statN[k] || 0) + l.u * (a[1] ? 1 : 0.3); put("S|" + k + "|" + mv[k], a, "+" + mv[k] + " " + ladName(k), 10 + mv[k]); });
    });
    var q = function (v, f) { v = v.slice().sort(function (a, b) { return a - b; }); var x = (v.length - 1) * f, lo = Math.floor(x), hi = Math.min(lo + 1, v.length - 1); return v[lo] + (v[hi] - v[lo]) * (x - lo); };
    function finish(g) {
      g.sold.sort(function (a, b) { return b.t - a.t; }); g.asks.sort(function (a, b) { return a.u - b.u; });
      // one sale per seller, price and grade every 10 minutes (a shop selling a stack, or two scanners seeing one sale)
      var once = {}; g.uniq = g.sold.filter(function (l) { var k = l.s + "|" + l.u + "|" + Math.floor(l.t / 6e5); if (once[k]) return false; once[k] = 1; return true; });
      // a sale 4 times above or below the grade's middle is set aside (a misread line or a one-off), listed on request
      var m0 = g.uniq.length >= 3 ? q(g.uniq.map(function (l) { return l.u; }), 0.5) : null;
      g.odd = m0 ? g.uniq.filter(function (l) { return l.u > m0 * 4 || l.u < m0 / 4; }) : [];
      g.use = g.uniq.filter(function (l) { return g.odd.indexOf(l) < 0; });
      var su = g.use.map(function (l) { return l.u; }), au = g.asks.map(function (l) { return l.u; });
      if (su.length >= LADMIN) { g.basis = "sold"; g.lo = q(su, 0.25); g.hi = q(su, 0.75); g.mid = q(su, 0.5); }
      else if (au.length >= LADMIN) { g.basis = "asking"; g.lo = q(au, 0.25); g.hi = q(au, 0.75); g.mid = q(au, 0.5); }
      // a single copy still shows its price, marked as one sale or one listing; it never sets the board's price
      else if (su.length || au.length) { g.basis = "few"; g.one = su.length ? "sold" : "asking"; var ov = su.length ? su : au; g.lo = Math.min.apply(null, ov); g.hi = Math.max.apply(null, ov); g.mid = null; }
      else { g.basis = "none"; g.mid = null; }
      // listings 4 times off a grade priced from sales are set aside the same way (a misread price or roll, a troll ask)
      g.oddA = g.basis === "sold" ? g.asks.filter(function (l) { return l.u > g.mid * 4 || l.u < g.mid / 4; }) : [];
      g.okAsks = g.asks.filter(function (l) { return g.oddA.indexOf(l) < 0; });
      return g;
    }
    // merge the thin ends of a run of numbered grades ("27 ATT or less", "+4 LUK or more") so a row stays short
    function squeeze(list, max, lowEnd) {
      list = list.slice().sort(function (a, b) { return a.sv - b.sv; }).map(function (g) { return { id: g.id, sv: g.sv, base: g.name, sold: g.sold.slice(), asks: g.asks.slice(), lo: false, hi: false }; });
      var busy = function (g) { return g.sold.length * 3 + g.asks.length; };
      while (list.length > max) {
        if (lowEnd && busy(list[0]) <= busy(list[list.length - 1])) { var t = list.shift(), f = list[0]; f.sold = f.sold.concat(t.sold); f.asks = f.asks.concat(t.asks); f.lo = true; }
        else { var t2 = list.pop(), l2 = list[list.length - 1]; l2.sold = l2.sold.concat(t2.sold); l2.asks = l2.asks.concat(t2.asks); l2.hi = true; }
      }
      list.forEach(function (g) { g.name = g.base + (g.lo ? " or less" : g.hi ? " or more" : ""); if (g.lo) g.id += "-"; if (g.hi) g.id += "+"; });
      return list;
    }
    var clean = order.filter(function (g) { return /^C\|/.test(g.id); }), nogain = G["S|0"] || null, views = {}, stats = [];
    var cleanShow = [];
    if (G["C|"]) cleanShow.push(G["C|"]);
    // good natural rolls: every one with 2+ copies, crit first; gloves with +1 crit rate and earrings with crit damage
    // are their own markets
    clean.filter(function (g) { return g.id !== "C|" && g.sold.length + g.asks.length >= 2; }).sort(function (a, b) { return a.sv - b.sv || (b.sold.length * 3 + b.asks.length) - (a.sold.length * 3 + a.asks.length); }).slice(0, 3).forEach(function (g) { cleanShow.push(g); });
    if (wep) {
      var wc = squeeze(order.filter(function (g) { return /^WC\|/.test(g.id); }), 4, true), ws = squeeze(order.filter(function (g) { return /^WS\|/.test(g.id); }), 3, false);
      views[wk] = wc.concat(ws); stats = [wk];
    } else {
      stats = Object.keys(statN).sort(function (a, b) { return statN[b] - statN[a]; });
      if (!stats.length) stats = [keyStat(n, null) || "ATT"];
      stats.forEach(function (k) {
        var lv = squeeze(order.filter(function (g) { return g.id.indexOf("S|" + k + "|") === 0; }), 3, false);
        views[k] = cleanShow.concat(nogain ? [nogain] : []).concat(lv);
      });
    }
    var seen = [];
    Object.keys(views).forEach(function (k) { views[k].forEach(function (g) { if (seen.indexOf(g) < 0) { finish(g); seen.push(g); } }); });
    var top = seen.filter(function (g) { return g.basis === "sold"; }).sort(function (a, b) { return b.use.length - a.use.length; })[0] ||
      seen.filter(function (g) { return g.basis !== "none" && g.basis !== "few"; }).sort(function (a, b) { return b.asks.length - a.asks.length; })[0] || null;
    var pick = stats[0];
    if (top) stats.some(function (k) { if (views[k].indexOf(top) >= 0) { pick = k; return true; } return false; });
    return (i._lad = { at: stamp, wep: wep, key: wk || stats[0], stats: stats, views: views, pick: pick, top: top, grades: views[pick] || [] });
  }
  // the small colored tag naming a copy's grade; the color follows the grade's place on the ladder
  function gradeTag(L, g) { var k = -1; L.stats.some(function (s0) { k = L.views[s0].indexOf(g); return k >= 0; }); var t = el("span", "lgt g" + Math.min(4, Math.max(0, k)), g.name); t.title = "Grade on the price ladder"; return t; }
  // which grade a listing or sale falls in, for the small tag next to it (null when its stats weren't read well)
  function gradeOf(i, l) {
    var L = ladderOf(i); if (!L || !l || !l.x) return null;
    var vk = LADSTAT[i.item] && L.views[LADSTAT[i.item]] ? LADSTAT[i.item] : L.pick, order = [vk].concat(L.stats.filter(function (k) { return k !== vk; }));
    for (var j = 0; j < order.length; j++) { var gs = L.views[order[j]]; for (var k = 0; k < gs.length; k++) { var g = gs[k]; if (g.sold.indexOf(l) >= 0 || g.asks.indexOf(l) >= 0) return g; } }
    return null;
  }

  function slotsUsed(name, l) {
    var x = l && l.x; if (!x || x.SLOTS == null) return null;
    var b = fullBase(name).s.SLOTS; if (!b || x.SLOTS > b) return null;
    return b - x.SLOTS;
  }
  // which stat a roll's +/- number is about, for the label on Price by roll: one stat when only one moved off base,
  // "Total stats" when several did and the number is their sum, "" when only a chat grade like (-3) is known
  var STATABBR = { ATT: "ATT", MATT: "MATT", STR: "STR", DEX: "DEX", INT: "INT", LUK: "LUK", HP: "HP", MP: "MP", WDEF: "W.DEF", MDEF: "M.DEF", ACC: "ACC", AVOID: "AVOID", SPEED: "SPEED", JUMP: "JUMP", CRIT: "Crit rate", CRITDMG: "Crit damage" };
  function rollBasis(name, l) {
    var x = l && l.x; if (!x || x.g != null) return "";
    var p = rollPick(name, l); return p ? p.k || "" : "";
  }
  function gradeLabel(i, g, fallback) {
    var c = {}, best = "", n = 0;
    i.rolls.forEach(function (r) { if (r.g !== g) return; var b = rollBasis(i.item, r.l); if (b) { c[b] = (c[b] || 0) + 1; if (c[b] > n) { n = c[b]; best = b; } } });
    best = best || fallback || "";
    return best === "TOTAL" ? "Total stats" : STATABBR[best] || best;
  }
  // A copy's roll and the stat it's about. A hovered copy shows its own roll per stat ("+57 (55 +2)"). The roll goes by
  // what buyers pay for on that slot (VALUE): scrolled attack on armour first, then the main stats (several moved: their
  // total), then the slot's other paid-for stats in order. Nothing paid-for moved: 0 on the item's key stat.
  function rollPick(name, l) {
    var x = l && l.x; if (!x) return null;
    if (x.g != null) return { g: x.g, k: "", mv: {}, combo: "" };
    var t = x._tip, wep = isWeapon(name), kk = keyStat(name, x, l.xj);
    // each paid-for stat's move off its base: from the popup's brackets, else the value read against the item's base
    var vs = valSet(name), mv = {}, nread = 0;
    Object.keys(vs).forEach(function (k) {
      // the brackets lost but the watcher kept the base: the value against it
      if (t && t[k] != null) { mv[k] = t[k] === 0 && x[k] != null && x[k + "_b"] != null ? x[k] - x[k + "_b"] : t[k]; nread++; }
      else if (x[k] != null) { var b0 = baseOf(name, x, k); if (b0 != null) { mv[k] = x[k] - b0; nread++; } }
      // a stat can't read below nothing: that's a misread line, left out
      if (mv[k] != null) { var fbk = fullBase(name).s[k], cb = fbk != null ? fbk : baseOf(name, x, k) || 0; if (cb + mv[k] < 0) { delete mv[k]; nread--; } }
      // a drop's own small wobble on HP, MP, accuracy or a shield's defense (22 HP rolling 24) isn't what anyone pays for; a scroll's +10 is
      if (mv[k] && /^(HP|MP|ACC|AVOID|WDEF|MDEF)$/.test(k)) { var bb = baseOf(name, x, k) || 0; if (bb > 0 && Math.abs(mv[k]) <= Math.max(1, Math.ceil(bb * 0.12))) mv[k] = 0; }
    });
    var p = null, att = wep ? [kk, kk === "MATT" ? "ATT" : "MATT"] : ["ATT", "MATT"];
    // attack first (scrolled attack on armour, or a weapon's own attack roll), then the main stats (several moved: their
    // total), then the slot's other paid-for stats in order
    for (var a = 0; a < att.length && !p; a++) if (vs[att[a]] && mv[att[a]]) p = { g: mv[att[a]], k: att[a] };
    if (!p && !wep) {
      var ms = MAINS.filter(function (k) { return mv[k]; });
      if (ms.length === 1) p = { g: mv[ms[0]], k: ms[0] };
      else if (ms.length > 1) p = { g: ms.reduce(function (s0, k) { return s0 + mv[k]; }, 0), k: "TOTAL" };
    }
    var order = valueOrder(name);
    for (var i = 0; i < order.length && !p; i++) if (order[i] !== "MAIN" && mv[order[i]]) p = { g: mv[order[i]], k: order[i] };
    if (!p && (nread || t) && (!wep || mv[kk] != null)) p = { g: 0, k: keyStat(name, null, l.xj) || kk };   // nothing paid-for moved: one clean group per item
    if (!p) {
      var k = kk;
      if (!k || k === "SUCCESS" || x[k] == null) {
        // a complete hover (it reached Remaining Enhancements) with no line for a stat the item doesn't come with: none scrolled on
        if (k && k !== "SUCCESS" && x.SLOTS != null && baseOf(name, x, k) === 0 && x.ATT == null && x.MATT == null) p = { g: 0, k: k };
        else { k = x.ATT != null ? "ATT" : x.MATT != null ? "MATT" : null; if (!k || (wep && !vs[k])) return null; }   // weapon attack on a staff is a misread
      }
      if (!p) {
        var bq = baseOf(name, x, k);
        if (bq != null) p = { g: x[k] - bq, k: k };
        else { var m = MEDSTAT[name + "|" + k]; if (m == null) return null; p = { g: Math.round(x[k] - m), k: k }; }
        if (p.g) mv[k] = p.g;
      }
    }
    p.mv = {}; Object.keys(mv).forEach(function (k) { if (mv[k]) p.mv[k] = mv[k]; });
    p.combo = comboOf(name, p.mv);
    return p;
  }
  // every paid-for stat that moved, in the slot's own order: "ATT+1.CRIT+1"; "" is a copy at base on all of them
  function comboOf(name, mv) {
    var out = [];
    valueOrder(name).forEach(function (k) { (k === "MAIN" ? MAINS : [k]).forEach(function (s0) { if (mv[s0]) out.push(s0 + (mv[s0] > 0 ? "+" : "") + mv[s0]); }); });
    Object.keys(mv).forEach(function (s0) { if (mv[s0] && !out.some(function (o) { return o.indexOf(s0 + "+") === 0 || o.indexOf(s0 + "-") === 0; })) out.push(s0 + (mv[s0] > 0 ? "+" : "") + mv[s0]); });
    return out.join(".");
  }
  var STATWORD = { ATT: "ATT", MATT: "MATT", STR: "STR", DEX: "DEX", INT: "INT", LUK: "LUK", HP: "HP", MP: "MP", ACC: "accuracy", AVOID: "avoid", SPEED: "speed", JUMP: "jump", CRIT: "crit rate", CRITDMG: "crit damage", WDEF: "W.DEF", MDEF: "M.DEF" };
  // "ATT+1.CRIT+1" read out: "+1 ATT, +1 crit rate"
  function comboLabel(combo) {
    if (!combo) return "base";
    return combo.split(".").map(function (c) { var m = /^([A-Z]+)([+-]\d+)$/.exec(c); return m ? m[2] + " " + (STATWORD[m[1]] || m[1]) : c; }).join(", ");
  }
  function comboMap(combo) { var o = {}; (combo || "").split(".").forEach(function (c) { var m = /^([A-Z]+)([+-]\d+)$/.exec(c); if (m) o[m[1]] = +m[2]; }); return o; }
  function rollOf0(name, l) { var p = rollPick(name, l); return p ? p.g : null; }
  // The item's tooltip, rebuilt the way the game shows it from the stats that were read and checked,
  // never the raw screen text (that carries stray marks and symbols from around the popup).
  var TIPROWS = [["REQLV", "REQ LEV"], ["STR", "STR"], ["DEX", "DEX"], ["INT", "INT"], ["LUK", "LUK"], ["HP", "MaxHP"], ["MP", "MaxMP"], ["ATT", "Weapon Attack"], ["MATT", "Magic Attack"],
    ["WDEF", "Weapon Def."], ["MDEF", "Magic Def."], ["ACC", "Accuracy"], ["AVOID", "Evasion"], ["SPEED", "Speed"], ["JUMP", "Jump"],
    ["CRIT", "Critical Rate"], ["CRITDMG", "Critical Damage"], ["SUCCESS", "Success rate"], ["SLOTS", "Remaining Enhancements"]];
  // where a stream price came from: the past broadcast at the exact moment when we have it, else the channel
  function streamLink(l) {
    var a = el("a", "slink", l.who + (l.v ? "'s broadcast" : "'s stream")); a.target = "_blank"; a.rel = "noopener";
    if (l.v) { var t = Math.max(0, (l.vt || 0) - 5), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60; a.href = "https://www.twitch.tv/videos/" + encodeURIComponent(String(l.v)) + "?t=" + h + "h" + m + "m" + sec + "s"; a.title = "Open the broadcast at the moment this shop was on screen"; }
    else { a.href = "https://www.twitch.tv/" + encodeURIComponent(l.who); a.title = "Open " + l.who + "'s Twitch channel"; }
    a.addEventListener("click", function (e) { e.stopPropagation(); });
    return a;
  }
  function tipBox(l) {
    var box = el("div", "tipbox"), x = l.x || {};
    box.appendChild(el("b", null, String(l.xn || l.i).replace(/\s*\(tier cut off\)/, "")));
    var r = dbRow(l.i), kind = r && DBK[r[5]] ? DBK[r[5]].split(":")[1] : "";
    var lv = x.REQLV != null ? x.REQLV : r && r[2] ? r[2] : null;
    if (lv) box.appendChild(el("div", "tl", "REQ LEV: " + lv));
    if (kind && kind !== "Unknown") box.appendChild(el("div", "tl", "Type: " + kind));
    TIPROWS.forEach(function (t) {
      var k = t[0]; if (k === "REQLV" || x[k] == null) return;
      var v = x[k], line = el("div", "tl");
      if (k === "SLOTS") line.textContent = t[1] + ": " + v;
      else if (k === "SUCCESS") line.textContent = t[1] + ": " + v + "%";
      else {
        line.textContent = t[1] + ": +" + v;
        var bv = x[k + "_b"];
        if (bv != null && bv !== v) { var d = v - bv, sp = el("span", d > 0 ? "up" : "down", " (" + bv + (d > 0 ? " +" : " -") + Math.abs(d) + ")"); line.appendChild(sp); }
      }
      box.appendChild(line);
    });
    if (box.childElementCount === 1) box.appendChild(el("div", "tl", "Stats not read cleanly yet. Hover it again in game."));
    return box;
  }
  // stats read from a tooltip of any listing of this item, used when the item list has nothing
  function seenStats(i) { var x = i.all.filter(function (l) { return l.x; })[0]; return x || null; }
  function levelLine(i) {
    var b = BASE[i.item] || {}, lv = b.REQLV != null ? b.REQLV : reqLevel(i.item), m = classMask(i.item), parts = [];
    if (lv > 0) parts.push("Lv " + lv);
    var cn = className(m > 0 ? m : 0); if (cn) parts.push(cn);
    return parts.join(" · ");
  }

  // ---------- hover card on a row
  var hovName = null, hovTimer = null, hovRow = null;
  function showHov(name) {
    var i = D && D.byName[name], h = $("hov"); if (!i || !hovRow) { h.hidden = true; return; }
    loadBase(name);
    var b = BASE[name] || {}; h.textContent = "";
    var hh = el("div", "hh"); hh.appendChild(iconBox(name)); var ht = el("div"); ht.appendChild(el("b", null, name));
    var r = dbRow(name); var sub = r && DBK[r[5]] ? DBK[r[5]].split(":")[1] : (b.sub || "");
    ht.appendChild(el("span", null, (CATNAME[i.cat] || i.cat) + (sub && sub !== i.cat ? " · " + sub : "")));
    var cz = el("div", "chipz"), lv = b.REQLV != null ? b.REQLV : reqLevel(name);
    if (lv > 0) cz.appendChild(el("i", "lv", "Lv " + lv));
    var cn = className(classMask(name)); if (cn) cz.appendChild(el("i", null, cn));
    if (b.SLOTS) cz.appendChild(el("i", null, b.SLOTS + " slots"));
    if (b.cash || (r && r[4])) cz.appendChild(el("i", null, "Cash"));
    if (i.tier) cz.appendChild(el("i", null, i.tier));
    if (cz.childNodes.length) ht.appendChild(cz);
    hh.appendChild(ht); h.appendChild(hh);
    var stats = ["ATT", "MATT", "WDEF", "MDEF", "STR", "DEX", "INT", "LUK", "HP", "MP", "ACC", "AVOID", "SPEED", "JUMP"].filter(function (k) { return b[k]; });
    var sx = seenStats(i);
    if (stats.length || b.RSTR || b.RDEX || b.RINT || b.RLUK || (sx && sx.x)) {
      var s1 = el("div", "sec"), kv = el("div", "kv");
      stats.slice(0, 8).forEach(function (k) { kv.appendChild(el("span", null, k)); kv.appendChild(el("b", null, "+" + b[k])); });
      if (stats.length) s1.appendChild(kv);
      var req = [["RSTR", "STR"], ["RDEX", "DEX"], ["RINT", "INT"], ["RLUK", "LUK"]].filter(function (q) { return b[q[0]]; }).map(function (q) { return q[1] + " " + b[q[0]]; });
      if (req.length) s1.appendChild(el("div", "cred", "Requires " + req.join(", ")));
      if (!stats.length && sx && sx.x) { var cl = tipBox(sx); [].slice.call(cl.querySelectorAll(".tl")).slice(0, 7).forEach(function (d) { if (/success/i.test(d.textContent)) d.className += " succ"; s1.appendChild(d); }); }
      h.appendChild(s1);
    }
    var s2 = el("div", "sec"); s2.appendChild(el("h5", null, "Free Market"));
    var bp = el("div", "bigp"); bp.appendChild(el("span", "mz", fmt(i.typ))); bp.appendChild(el("small", null, i.kind === "sale" ? "typical" : "typical asking")); s2.appendChild(bp); var vph = vendor(i.item); if (vph) s2.appendChild(el("div", "cred", "Vendor price " + MF(vph) + " each"));
    var all = i.sales.concat(i.asks).map(function (x) { return x.u; }), mn = quant(all, .03), mxv = quant(all, .97);
    if (mxv > mn) {
      var P = function (v) { return Math.max(0, Math.min(100, (v - mn) / (mxv - mn) * 100)); };
      var rg = el("div", "rng"), band = el("i"); band.style.left = P(i.lo) + "%"; band.style.width = Math.max(2, P(i.hi) - P(i.lo)) + "%"; rg.appendChild(band);
      var tk = el("em"); tk.style.left = P(i.typ) + "%"; rg.appendChild(tk); s2.appendChild(rg);
      var rl = el("div", "rl"); rl.appendChild(el("span", "mz", short(mn))); rl.appendChild(el("span", "mz", short(mxv))); s2.appendChild(rl);
    }
    var kv2 = el("div", "kv");
    [["Sales seen", fmt(i.salesN)], ["Last 3 avg", i.last3 ? M(i.last3) : "–"], ["Last sold", i.lastSale ? ago(i.lastSale.t) : "never"], ["Asking now", i.bestL ? M(i.best) : "–"]].forEach(function (p) { kv2.appendChild(el("span", null, p[0])); kv2.appendChild(el("b", null, p[1])); });
    s2.appendChild(kv2);
    var ups = {}; (i.buy || []).forEach(function (x) { if (x.st !== "gone") ups[x.s] = 1; }); var nu = Object.keys(ups).length;
    var lst = el("div", "stl"); lst.appendChild(el("span", null, "Listed")); lst.appendChild(el("span", "ok", nu ? nu + (nu === 1 ? " shop listing" : " shops listing") : "none up now")); s2.appendChild(lst);
    h.appendChild(s2);
    if (b.NPC != null) { var s3 = el("div", "sec"); s3.appendChild(el("h5", null, "NPC")); var k3 = el("div", "kv"); k3.appendChild(el("span", null, "Sell-back")); k3.appendChild(el("b", "mz", fmt(b.NPC))); k3.appendChild(el("span")); k3.appendChild(el("b")); s3.appendChild(k3); h.appendChild(s3); }
    h.appendChild(el("div", "sec cred", idOf(name) ? "Item data: maplestory.io · prices: Club FM scans" : "Prices: Club FM scans"));
    h.hidden = false;
    var rc = hovRow.getBoundingClientRect(), hw = 272, hhgt = h.offsetHeight;
    var x = Math.min(window.innerWidth - hw - 8, rc.left + 200), y = rc.bottom + 4;
    if (y + hhgt > window.innerHeight - 8) y = Math.max(8, rc.top - hhgt - 4);
    h.style.left = x + "px"; h.style.top = y + "px";
  }
  function hideHov() { clearTimeout(hovTimer); hovName = null; hovRow = null; $("hov").hidden = true; }
  document.addEventListener("mouseover", function (e) {
    var tr = e.target.closest && e.target.closest("#rows tr[data-item], #deal-rows tr[data-item]:not(.gtipable)");
    if (!tr) { if (hovName) hideHov(); return; }
    if (tr === hovRow) return;
    hideHov(); hovRow = tr; hovName = tr.dataset.item;
    hovTimer = setTimeout(function () { showHov(hovName); }, 260);
  });
  window.addEventListener("scroll", hideHov, { passive: true });

  // ---------- item panel
  function pick(name, nav) {
    earnNudge(1);
    var was = cardOpen(), h = "#item=" + encodeURIComponent(name) + (state.tab === "deals" ? "&deals" : "");
    // the roll typed with the item ("wg 4 att") can be cleared by a board refresh between typing and opening: read it
    // again from the search box when that search still names this item
    if (!QROLL && $("q") && $("q").value) { searchItems.inner = true; try { var rq0 = searchItems($("q").value, 1); if (!rq0.length || rq0[0].n !== name) QROLL = null; } finally { searchItems.inner = false; } }
    PENDROLL = QROLL && Date.now() - QROLL.at < 60000 ? { n: name, k: QROLL.k, v: QROLL.v } : null; QROLL = null;   // a slow phone can take a while between typing and the card
    if (PENDROLL) window.__ladroll = { n: PENDROLL.n, k: PENDROLL.k, v: PENDROLL.v, at: Date.now() };   // the price ladder's own copy, kept until its card shows
    if (PENDROLL) STATOPEN = name;
    state.sel = name; state.list = "buy"; BUYSORT = "price"; hideHov();
    // opening from the board adds a history step, so the browser's back button (or a phone's back gesture) closes
    // the card; a link straight to #item= gets a board step put under it for the same reason
    try {
      if (nav === "load" && !was) { var base = location.pathname + location.search + (state.tab === "deals" ? "#deals" : ""); history.replaceState(null, "", base); history.pushState({ fmcard: 1 }, "", h); }
      else if (!was && !nav) history.pushState({ fmcard: 1 }, "", h);
      else history.replaceState(history.state, "", h);
    } catch (e) {}
    document.querySelectorAll("tbody tr.sel").forEach(function (r) { r.classList.remove("sel"); });
    document.querySelectorAll('tbody tr[data-item="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]').forEach(function (r) { r.classList.add("sel"); });
    renderItem(); ev("#open:" + name);
    $("side").scrollTop = 0; showCard();
  }
  // The item card opens over the board: a big framed card on a wide screen, the full screen on a phone. The board
  // behind it is never touched, so closing the card leaves it exactly where it was.
  // the board keeps the search it had when the card opened: looking up other items from the card's search box
  // doesn't filter the board behind it, and closing the card puts the old search back
  var CARD_Y = 0, CARD_Q = "";
  function boardQ() { return cardOpen() ? CARD_Q : $("q").value; }
  function cardOpen() { var b = document.body.classList; return b.contains("bigcard") || b.contains("sheet"); }
  function showCard() {
    var b = document.body, hs = $("hsearch"), ph = $("hsph"), wide = window.innerWidth > 1180;
    // the search moves to the top while the card is open; a spacer of the same height keeps the page behind from moving
    if (!cardOpen()) { CARD_Y = window.scrollY; CARD_Q = $("q").value; if (hs && ph) ph.style.height = hs.offsetHeight + "px"; }
    b.classList.toggle("bigcard", wide); b.classList.toggle("sheet", !wide);
    if (!wide && document.activeElement === $("q") && window.innerWidth <= 700) $("q").blur();
    placeCard();
  }
  function placeCard() {
    var hs = $("hsearch"), rs = document.documentElement.style; if (!hs || !cardOpen()) return;
    if (window.innerWidth > 1180) {
      var tp = document.querySelector(".top"), tb = tp ? Math.max(0, tp.getBoundingClientRect().bottom) : 0;
      rs.setProperty("--srchtop", Math.round(tb + 4) + "px");
      rs.setProperty("--cardtop", Math.round(tb + 4 + hs.offsetHeight + 12) + "px");
    } else rs.setProperty("--cardtop", Math.round(hs.getBoundingClientRect().bottom) + "px");
  }
  function closeCard(nav) {
    if (!cardOpen()) return;
    document.body.classList.remove("bigcard", "sheet");
    if ($("q").value !== CARD_Q) { $("q").value = CARD_Q; render(); }
    var keepY = function () { if (!cardOpen() && Math.abs(window.scrollY - CARD_Y) > 1) window.scrollTo(0, CARD_Y); };
    keepY(); requestAnimationFrame(keepY); setTimeout(keepY, 250);   // the board redraws its rows a moment later
    state.sel = null; hideHov();
    document.querySelectorAll("tbody tr.sel").forEach(function (r) { r.classList.remove("sel"); });
    if (nav) return;
    if (history.state && history.state.fmcard) { try { history.back(); return; } catch (e) {} }
    try { history.replaceState(null, "", location.pathname + location.search + (state.tab === "deals" ? "#deals" : "")); } catch (e) {}
  }
  // A roll's listings, for the list that opens under Price by roll: what's for sale now (cheapest first, with where to
  // find it), then what sold (newest first). The same copy read twice in one visit counts once.
  function forSale(l) { return !l.so && !l.b && l.st !== "gone" && l.st !== "sold" && Date.now() - l.t < 3 * DAY; }
  function rollRows(ls) {
    var seen = {}, up = [], sold = [], old = [];
    ls.slice().sort(function (a, b) { return b.t - a.t; }).forEach(function (l) {
      var k = String(l.s).toLowerCase() + "|" + l.u + "|" + JSON.stringify(l.x || {}) + "|" + (l.so ? 1 : 0); if (seen[k]) return; seen[k] = 1;
      (l.so ? sold : forSale(l) ? up : old).push(l);
    });
    up.sort(function (a, b) { return a.u - b.u || b.t - a.t; });
    return { up: up, sold: sold, old: old };
  }
  function rollList(i, ls, title) {
    var g = rollRows(ls), box = el("div", "rlist");
    var hd = el("div", "rlh"); hd.appendChild(el("b", null, title)); hd.appendChild(el("span", null, (g.up.length ? g.up.length + " for sale now" : "none for sale now") + " · " + g.sold.length + " sold")); box.appendChild(hd);
    function row(l, kind) {
      var r = el("div", "rl " + kind); r.tabIndex = 0;
      var t = el("div", "rlt"); t.appendChild(el("b", null, l.s)); var c = statChip(i.item, l.x, l.xj); if (c) { var cw = el("span", "rlc"); cw.appendChild(c); t.appendChild(cw); }
      t.appendChild(el("small", null, (kind === "up" ? buyWhere(l) : where(l) || (l.chat ? "trade chat" : "")) + " · " + ago(l.t)));
      r.appendChild(t);
      var p = el("div", "rlp"); p.appendChild(money(l.u)); p.appendChild(el("small", null, kind === "up" ? (l.st === "up" ? "likely still up" : "may be gone") : kind === "sold" ? "sold" : "seen, gone now")); r.appendChild(p);
      tipAttach(r, l, i.item);
      return r;
    }
    if (g.up.length) { box.appendChild(el("div", "rlsub", "For sale now, cheapest first")); g.up.slice(0, 12).forEach(function (l) { box.appendChild(row(l, "up")); }); }
    if (g.sold.length) { box.appendChild(el("div", "rlsub", "Sold, newest first")); g.sold.slice(0, 8).forEach(function (l) { box.appendChild(row(l, "sold")); }); }
    if (!g.up.length && g.old.length) { box.appendChild(el("div", "rlsub", "Seen earlier, likely gone")); g.old.slice(0, 6).forEach(function (l) { box.appendChild(row(l, "old")); }); }
    // a roll nobody has bought yet (often a one-of-a-kind copy): the closest rolls that did sell, same scroll state.
    // Closest means the fewest stat points apart across every paid-for stat, so +1 ATT +1 crit is compared with
    // +1 ATT and with +1 crit before anything further away.
    if (!g.sold.length && ls.length && i.rolls) {
      var mineR = i.rolls.filter(function (r) { return r.l === ls[0]; })[0];
      if (mineR) mineR = Object.assign({}, mineR, { su: slotsUsed(i.item, mineR.l) });
      if (mineR) {
        var mm = comboMap(mineR.combo), cut = Date.now() - 30 * DAY, by = {};
        i.rolls.forEach(function (r) {
          if (!r.l.so || r.l.t < cut || r.l.pricey || r.combo === mineR.combo) return;
          var rsu = slotsUsed(i.item, r.l); if ((mineR.su === 0) !== (rsu === 0) || (mineR.su > 0 && rsu !== mineR.su)) return;
          var key = r.combo; (by[key] || (by[key] = { combo: key, su: rsu, v: [] })).v.push(r.l.u);
        });
        var dist = function (c) { var o = comboMap(c), d = 0, ks = {}; Object.keys(o).concat(Object.keys(mm)).forEach(function (k) { if (ks[k]) return; ks[k] = 1; d += Math.abs((o[k] || 0) - (mm[k] || 0)); }); return d; };
        var near = Object.keys(by).sort(function (a, b) { return dist(a) - dist(b) || by[b].v.length - by[a].v.length; }).slice(0, 3);
        if (near.length) {
          box.appendChild(el("div", "rlsub", "No sales of this exact roll yet. Closest rolls that sold" + (mineR.su === 0 ? ", clean copies only:" : ", same slots used:")));
          near.forEach(function (k) { var o = by[k], d = el("div", "rl near"); d.appendChild(el("b", null, (mineR.su === 0 ? "Clean, " : "") + comboLabel(k))); var pp = el("div", "rlp"); pp.appendChild(money(median(o.v))); pp.appendChild(el("small", null, o.v.length + (o.v.length === 1 ? " sale" : " sales") + ", 30 days")); d.appendChild(pp); box.appendChild(d); });
        }
      }
    }
    box.appendChild(el("p", "rlnote", (window.matchMedia && matchMedia("(hover: none)").matches ? "Tap" : "Hover") + " a listing to see the item as the game shows it."));
    return box;
  }
  // Price by roll: one section per stat that moves, each a row of rolls from worst to best. Every roll seen shows,
  // one-offs included (an 8 attack glove is seen once and is the one people ask about). A cell's price is what that roll
  // sold for, or what it's asking when none sold yet, and it says which. Click a roll for every copy: for sale now and sold.
  // Expensive copies nobody hovered get their own cell, so they're never invisible: hover them in game to price their roll.
  var MAINCLS = { STR: "Warrior", DEX: "Bowman", INT: "Magician", LUK: "Thief" }, CLSSTAT = { 1: "STR", 2: "INT", 4: "DEX", 8: "LUK" }, CLSNAME = { WARRIOR: "STR", MAGICIAN: "INT", BOWMAN: "DEX", THIEF: "LUK" };
  var ROLLOPEN = {};
  function myStat() {
    var c = $("cls") && +$("cls").value; if (CLSSTAT[c]) return CLSSTAT[c];
    try { var m = JSON.parse(localStorage.getItem("fm-map-me") || "{}"); if (m && m.cls && CLSNAME[String(m.cls).toUpperCase()]) return CLSNAME[String(m.cls).toUpperCase()]; } catch (e) {}
    return "";
  }
  function rollBox(i) {
    var box = el("div", "rollbox"), hd = el("h4"); hd.appendChild(document.createTextNode("Price by stat")); box.appendChild(hd);
    var kw = keyWhy(i.item); if (kw) hd.appendChild(infoTip(kw + " Clean means no scrolls used; a clean copy can still have rolled above or below the item's base, and that roll is priced on its own."));
    if (i.bands) {
      var bg = el("div", "rollbands");
      [["Low", Math.min(i.bands.lo, i.bands.mid), "down"], ["Average", i.bands.mid, "mid"], ["High", Math.max(i.bands.hi, i.bands.mid), "up"]].forEach(function (b) { var d = el("div", "rb " + b[2]); d.appendChild(el("small", null, b[0])); d.appendChild(money(b[1])); bg.appendChild(d); });
      box.appendChild(bg);
    }
    var now = Date.now(), gks = keyStat(i.item, null, ""), gkb = gks && gks !== "SUCCESS" ? (itemBase(i.item).s[gks] != null ? itemBase(i.item).s[gks] : baseOf(i.item, null, gks)) : null;
    var m = classMask(i.item), jobs = [1, 2, 4, 8].filter(function (b) { return m > 0 && (m & b); }).length;
    var gradeKey = gks && (MAINS.indexOf(gks) < 0 || jobs === 1) ? gks : "GRADE";
    // Clean copies (no scrolls used) go by their natural roll: base, or whatever the drop rolled above or below it.
    // Scrolled copies go by what they gained and how many slots that took. Each cell is one exact combination.
    var cleanG = {}, secs = {}, clean = null, hasSl = !!(dbBase(i.item) || {}).SLOTS, noSl = {}, bSlots = (dbBase(i.item) || {}).SLOTS || fullBase(i.item).s.SLOTS || 0;
    i.rolls.forEach(function (r) {
      if (now - r.l.t > 14 * DAY) return;
      var bs = r.k || gradeKey, su = slotsUsed(i.item, r.l);   // read now: the item list may have landed after the rolls were built
      // copies whose upgrades left weren't read sit apart: a used one is worth far less than a clean one
      if (hasSl && su == null) { var nk = (r.combo || "BASE") + "|" + bs; (noSl[nk] || (noSl[nk] = { k: bs, g: r.g, combo: r.combo, ls: [] })).ls.push(r.l); return; }
      if (r.l.x.g != null) { var gk = "GRADE|" + r.g; (secs.GRADE || (secs.GRADE = { k: "GRADE", c: {}, n: 0 })).n++; (secs.GRADE.c[gk] || (secs.GRADE.c[gk] = { g: r.g, combo: "", su: null, ls: [] })).ls.push(r.l); return; }
      if (!hasSl || su === 0) {
        var ck = r.combo; (cleanG[ck] || (cleanG[ck] = { g: r.g, k: bs, combo: ck, su: 0, ls: [] })).ls.push(r.l);
        if (!ck) (clean || (clean = { ls: [] })).ls.push(r.l);
        return;
      }
      var sc = secs[bs] || (secs[bs] = { k: bs, c: {}, n: 0 }); sc.n++;
      var up = scrollsPassed(i.item, r.l);
      var key = su + "|" + (up == null ? "?" : up) + "|" + r.combo; (sc.c[key] || (sc.c[key] = { g: r.g, combo: r.combo, su: su, up: up, ls: [] })).ls.push(r.l);
    });
    var mine = myStat(), keys = Object.keys(secs);
    var rank = function (k) { return k === "TOTAL" ? 3 : k === "GRADE" ? 2 : k === mine ? -2 : (k === "ATT" || k === "MATT") ? -1 : 0; };
    keys.sort(function (a, b) { return rank(a) - rank(b) || secs[b].n - secs[a].n || (a < b ? -1 : 1); });
    var cleanPrice = clean ? priceOf(clean.ls) : null;
    function priceOf(ls) {
      var g = rollRows(ls), sold = g.sold.map(function (l) { return l.u; }), ask = g.up.concat(g.old).map(function (l) { return l.u; });
      return sold.length ? { p: median(sold), how: "sold", up: g.up.length, sold: sold.length } : { p: median(ask.length ? ask : ls.map(function (l) { return l.u; })), how: "asking", up: g.up.length, sold: 0 };
    }
    function total(combo) { var m = comboMap(combo), t = 0; Object.keys(m).forEach(function (k) { t += m[k]; }); return t; }
    // one cell: its top line says the roll, the small line what it sold for or asks
    function cell(key, g, ls, top, sub, full, cls) {
      var pr = priceOf(ls), id = i.item + "|" + key, open = ROLLOPEN[id];
      var d = el("button", "rc " + (cls || (g === 0 ? "ref" : g === "?" ? "unk" : g > 0 ? "up" : "down")) + (open ? " on" : "")); d.type = "button";
      d.appendChild(el("b", null, top)); if (sub) d.appendChild(el("i", "rsu", sub)); d.appendChild(money(pr.p));
      d.appendChild(el("small", null, pr.how === "sold" ? pr.sold + " sold" + (pr.up ? " · " + pr.up + " up" : "") : (pr.up ? pr.up + " for sale" : ls.length + " seen") + " · asking"));
      d.title = full + ": click for every copy, for sale now and sold";
      d.setAttribute("aria-expanded", open ? "true" : "false"); d.dataset.k = key; d.dataset.g = String(g);
      d.addEventListener("click", function () { var was = ROLLOPEN[id]; ROLLOPEN = {}; if (!was) ROLLOPEN[id] = 1; box.replaceWith(rollBox(i)); });
      return { el: d, open: open ? rollList(i, ls, full) : null };
    }
    var shown = 0;
    var cks = Object.keys(cleanG);
    if (cks.length) {
      var cs = el("div", "rsec clean"), ch = el("div", "rsh"); ch.appendChild(el("b", null, "Clean"));
      ch.appendChild(el("span", null, hasSl ? "no scrolls used, by natural roll" : "by natural roll"));
      ch.appendChild(el("small", null, cks.reduce(function (a, k) { return a + cleanG[k].ls.length; }, 0) + " seen")); cs.appendChild(ch);
      var cr = el("div", "rrow"), copen = null;
      cks.sort(function (a, b) { return (a ? 1 : 0) - (b ? 1 : 0) || total(a) - total(b) || (a < b ? -1 : 1); }).forEach(function (k) {
        var o = cleanG[k], lab = k ? comboLabel(k) : "Base", c = cell("C|" + k, k ? total(k) : 0, o.ls, lab, "", "Clean, " + comboLabel(k), k ? null : "ref");
        cr.appendChild(c.el); if (c.open) copen = c.open;
      });
      cs.appendChild(cr); if (copen) cs.appendChild(copen); box.appendChild(cs); shown++;
    }
    keys.forEach(function (k) {
      var sc = secs[k], cells = Object.keys(sc.c).map(function (key) { return [key, sc.c[key]]; });
      var sec = el("div", "rsec" + (k === mine ? " mine" : "") + (k === "TOTAL" || k === "GRADE" ? " misc" : ""));
      var h = el("div", "rsh"); h.appendChild(el("b", null, k === "TOTAL" ? "Total stats" : k === "GRADE" ? "Chat grade" : STATABBR[k] || k));
      var sub = k === "GRADE" ? "stat not named" : "scrolled" + (MAINCLS[k] && jobs !== 1 ? " · " + MAINCLS[k] : "");
      h.appendChild(el("span", null, sub));
      if (k === mine) h.appendChild(el("i", "you", "your class"));
      h.appendChild(el("small", null, sc.n + " seen" + (cleanPrice ? " · clean " + M(cleanPrice.p) : "")));
      sec.appendChild(h);
      var row = el("div", "rrow"), opened = null;
      cells.sort(function (a, b) { return a[1].g - b[1].g || (a[1].su || 0) - (b[1].su || 0) || (a[1].up == null ? 99 : a[1].up) - (b[1].up == null ? 99 : b[1].up); }).forEach(function (e) {
        var o = e[1], top, su0, full;
        if (k === "GRADE") { top = (o.g > 0 ? "+" : o.g < 0 ? "−" : "") + Math.abs(o.g); su0 = ""; full = "Chat grade " + top; }
        else {
          top = o.combo ? comboLabel(o.combo) : "No gain";
          su0 = o.su + (bSlots ? " of " + bSlots : "") + " used" + (o.up == null ? "" : o.up === 0 ? ", none passed" : ", " + o.up + " passed");
          // no scroll passed: every stat that moved is the drop's own roll
          if (o.up === 0 && o.combo) top = "Natural " + top;
          var nw = o.up === 0 ? "" : naturalWords(i.item, scrollSplit(i.item, o.ls[0]), true);   // by the scroll table: what of it the drop rolled
          if (nw) su0 += ", " + nw;
          full = (o.combo ? (o.up === 0 ? "Natural roll " : "") + comboLabel(o.combo) : "No gain (failed scrolls)") + ", " + o.su + (bSlots ? " of " + bSlots : "") + " slots used" + (o.up == null ? ", passed count not read" : o.up === 0 ? ", none passed" : ", " + o.up + " passed, " + (o.su - o.up) + " failed") + (nw ? ", " + nw : "");
        }
        var c = cell(e[0] + "|" + k, o.g, o.ls, top, su0, full);
        row.appendChild(c.el); if (c.open) opened = c.open;
      });
      sec.appendChild(row); if (opened) sec.appendChild(opened);
      box.appendChild(sec); shown++;
    });
    var nks = Object.keys(noSl);
    if (nks.length) {
      var ns = el("div", "rsec unread"), nh = el("div", "rsh"); nh.appendChild(el("b", null, "Upgrades not read")); nh.appendChild(el("span", null, "kept out of the prices above"));
      nh.appendChild(el("small", null, nks.reduce(function (a, k) { return a + noSl[k].ls.length; }, 0) + " seen")); ns.appendChild(nh);
      var nr = el("div", "rrow"), nopen = null;
      nks.sort(function (a, b) { return noSl[a].g - noSl[b].g; }).forEach(function (k) {
        var o = noSl[k], lab = o.combo ? comboLabel(o.combo) : "Base?";
        var c = cell("NOSL:" + k, o.g, o.ls, lab, "", (o.combo ? comboLabel(o.combo) : "At base") + ", upgrades not read", o.combo ? null : "ref"); nr.appendChild(c.el); if (c.open) nopen = c.open;
      });
      ns.appendChild(nr); if (nopen) ns.appendChild(nopen);
      ns.firstChild.appendChild(infoTip("The hover didn't reach the upgrades line, so these could be scrolled. Hover them again in game to price them with the rolls above."));
      box.appendChild(ns);
    }
    // copies far above the clean price that nobody hovered: almost always scrolled or a top roll
    var floor = Math.max(cleanPrice ? cleanPrice.p * 4 : 0, i.typ * 4, ((i.bands && i.bands.hi) || 0) * 2);
    var unread = (i.all || []).filter(function (l) { return !l.x && !l.b && !l.chat && l.u >= floor && floor > 0 && now - l.t < 7 * DAY && l.u < 2e9; });
    var ug = rollRows(unread);
    if (unread.length) {
      var us = el("div", "rsec unread"), uh = el("div", "rsh"); uh.appendChild(el("b", null, "Not hovered yet")); uh.appendChild(el("span", null, "likely scrolled or a top roll"));
      uh.appendChild(el("small", null, (ug.up.length + ug.sold.length + ug.old.length) + " seen")); us.appendChild(uh);
      var ps = unread.map(function (l) { return l.u; }), ur = el("div", "rrow"), uc = cell("?", "?", unread, "Stats unread", "", "Not hovered yet", "unk");
      uc.el.querySelector(".num").replaceWith(el("span", "num rng2", short(Math.min.apply(null, ps)) + "–" + M(Math.max.apply(null, ps))));
      ur.appendChild(uc.el); us.appendChild(ur); if (uc.open) us.appendChild(uc.open);
      us.firstChild.appendChild(infoTip("Rest the mouse on these in game and FM Watcher reads their stats, so they get priced by roll here."));
      box.appendChild(us);
    }
    var ft = el("div", "rfoot"), known = i.rolls.length;
    ft.appendChild(el("span", null, (i.bands ? i.bands.n + " prices this week · " : "") + (known ? known + " with a known roll" : "No rolls known yet") + " · click a roll to see each one"));
    box.appendChild(ft);
    return box;
  }
  // ---------- the in-game look
  // Hover any listing to see the item the way the game shows it: name, icon, requirements, category, every stat
  // (what it rolled against the item's base in green or red), and upgrades left. Rebuilt from what FM Watcher read off
  // that copy's own popup. A copy nobody hovered shows the item's base stats, and says so.
  var TIPL = typeof WeakMap === "function" ? new WeakMap() : null, GTIP_ON = null;
  function tipAttach(node, l, name) { if (!TIPL) return; TIPL.set(node, { l: l, n: name || (l && l.i) }); node.classList.add("gtipable"); }
  // the game's own order and wording (read off thousands of hovers): main stats, MaxHP/MaxMP, attack, defense, the rest, crit
  var GTLINES = [["STR", "STR"], ["DEX", "DEX"], ["INT", "INT"], ["LUK", "LUK"], ["HP", "MaxHP"], ["MP", "MaxMP"], ["ATT", "Weapon Attack"], ["MATT", "Magic Attack"],
    ["WDEF", "Weapon Def."], ["MDEF", "Magic Def."], ["ACC", "Accuracy"], ["AVOID", "Evasion"], ["SPEED", "Speed"], ["JUMP", "Jump"], ["CRIT", "Critical Rate"], ["CRITDMG", "Critical Damage"]];
  var GTTYPE = { Glove: "Gloves", Overall: "Outfit", "Pole Arm": "Polearm", "One-Handed Sword": "One-handed Sword", "One-Handed Axe": "One-handed Axe", "One-Handed Blunt Weapon": "One-handed Blunt Weapon",
    "Two-Handed Sword": "Two-handed Sword", "Two-Handed Axe": "Two-handed Axe", "Two-Handed Blunt": "Two-handed Blunt Weapon" };
  function aspdName(v) { return v <= 3 ? "Very Fast" : v <= 5 ? "Fast" : v === 6 ? "Average" : "Slow"; }
  // the real popup when FM Watcher sent one (equips at 500K and up), with the listing under it; the rebuilt one if
  // the picture is missing or still on its way
  function gameTip(l, name) {
    var xi = l && l.x && typeof l.x === "object" && /^[0-9a-f]{16}$/.test(l.x._img || "") ? l.x._img : "";
    if (!xi || gameTip.noimg[xi]) return gameTip0(l, name);
    var wrap = el("div", "gt gt-pic"), im = new Image(); im.alt = showName(name) + " as seen in game"; im.className = "gt-real";
    im.onerror = function () { gameTip.noimg[xi] = 1; var t = $("gtip"); if (t && t.contains(wrap)) { t.textContent = ""; t.appendChild(gameTip0(l, name)); } };
    im.onload = function () { var gi = GTIP_ON && TIPL.get(GTIP_ON); if (gi) gtipMove(gtipMove.x || 0, gtipMove.y || 0); };
    im.src = "https://api.maplefm.gg/tipimg/" + xi + ".png"; wrap.appendChild(im);
    var f = el("div", "gt-foot");
    var pl = el("div"); pl.appendChild(el("b", null, l.s)); pl.appendChild(document.createTextNode(" · ")); pl.appendChild(money(l.u)); pl.appendChild(document.createTextNode(l.q > 1 ? " each" : "")); f.appendChild(pl);
    var w = l.chat ? "trade chat" : where(l); f.appendChild(el("div", null, (w ? w + " · " : "") + (l.so ? "sold " : "seen ") + ago(l.t)));
    f.appendChild(el("div", "gt-dim", "The popup exactly as FM Watcher saw it in game"));
    wrap.appendChild(f);
    return wrap;
  }
  gameTip.noimg = {};
  function gameTip0(l, name) {
    var x = l && l.x && typeof l.x === "object" ? l.x : null, read = !!(x && Object.keys(x).some(function (k) { return /^[A-Z]+$/.test(k); }));
    loadBase(name);   // requirements come from the item's full record; the popup fills them in when it lands
    var fb = fullBase(name), b = fb.s || {}, r = dbRow(name), api = BASE[name] || {}, box = el("div", "gt");
    // the game's "(+N)" is scrolls that passed, not slots used: shown only when this copy's title was read
    var passed = l ? scrollsPassed(name, l) : null;
    box.appendChild(el("div", "gt-name" + (passed > 0 ? " gt-up" : ""), showName(name) + (passed > 0 ? " (+" + passed + ")" : "")));
    var top = el("div", "gt-top"), ic = el("div", "gt-ic"), im = iconImg(name); if (im) ic.appendChild(im); top.appendChild(ic);
    var req = el("div", "gt-req"), lv = x && x.REQLV != null ? x.REQLV : api.REQLV != null ? api.REQLV : r && r[2] ? r[2] : 0;
    var known = BASE[name] != null || !idOf(name);
    [["REQ LEV", lv], ["REQ STR", api.RSTR], ["REQ DEX", api.RDEX], ["REQ INT", api.RINT], ["REQ LUK", api.RLUK]].forEach(function (q, qi) { var d = el("div"); d.appendChild(el("span", null, q[0])); d.appendChild(el("b", null, ": " + (qi && !known ? "…" : q[1] || 0))); req.appendChild(d); });
    top.appendChild(req); box.appendChild(top);
    var cn = className(classMask(name)); if (cn) box.appendChild(el("div", "gt-jobs", cn));
    var kind = r && DBK[r[5]] ? DBK[r[5]].split(":").pop() : ""; if (kind && kind !== "Unknown") box.appendChild(el("div", "gt-l", "Type: " + (GTTYPE[kind] || kind)));
    if (b.ASPD) box.appendChild(el("div", "gt-l", "Attack Speed: " + aspdName(b.ASPD)));
    var any = false;
    GTLINES.forEach(function (t) {
      var k = t[0], v = read && x[k] != null ? x[k] : b[k]; if (v == null || (!(read && x[k] != null) && !v)) return;
      var line = el("div", "gt-l"); line.appendChild(document.createTextNode(t[1] + ": +" + v)); any = true;
      if (read && x[k] == null) { line.className += " gt-dim"; line.appendChild(el("span", "gt-dim", " (base, not read)")); }
      var bv = read && x[k] != null ? (x[k + "_b"] != null ? x[k + "_b"] : b[k] != null ? b[k] : null) : null;
      if (bv != null && bv !== v) { var d = v - bv; line.appendChild(el("span", d > 0 ? "gt-up" : "gt-dn", " (" + bv + (d > 0 ? " +" : " −") + Math.abs(d) + ")")); }
      box.appendChild(line);
    });
    if (b.KB) { box.appendChild(el("div", "gt-l", "Knockback Chance: " + b.KB + "%")); any = true; }
    if (x && x.SUCCESS != null) { box.appendChild(el("div", "gt-l", "Success rate: " + x.SUCCESS + "%")); any = true; }
    // upgrades left only when this copy's popup showed them: a scrolled copy has fewer than the base, and the base
    // number in its place would make a used item look clean
    // armour gains attack only from scrolls, 3 at most per success: +6 ATT gloves have used at least 2 slots
    var armGain = read && category(name) !== "Weapons" && !b.ATT && !b.MATT ? (x.ATT || 0) + (x.MATT || 0) : 0, minUsed = Math.ceil(armGain / 3);
    if (read && x.SLOTS != null) {
      var sl = el("div", "gt-l", "Remaining Enhancements: " + x.SLOTS);
      if (b.SLOTS && (x.SLOTS > b.SLOTS || b.SLOTS - x.SLOTS < minUsed)) { sl.appendChild(el("span", "gt-dn", " (doesn't add up, check it in game)")); }
      box.appendChild(sl);
    }
    else if (read && b.SLOTS) box.appendChild(el("div", "gt-l gt-dim", "Remaining Enhancements: not read. " + (minUsed ? "At most " + Math.max(0, b.SLOTS - minUsed) + " of " + b.SLOTS + ": +" + armGain + " attack takes " + minUsed + "+ scrolls." : b.SLOTS + " when clean.")));
    else if (b.SLOTS != null) box.appendChild(el("div", "gt-l", "Remaining Enhancements: " + b.SLOTS));
    var slots = read ? x.SLOTS : b.SLOTS;
    if (!any && slots == null) box.appendChild(el("div", "gt-l gt-dim", "No stats"));
    if (l && l.s) {
      var f = el("div", "gt-foot");
      var pl = el("div"); pl.appendChild(el("b", null, l.s)); pl.appendChild(document.createTextNode(" · ")); pl.appendChild(money(l.u)); pl.appendChild(document.createTextNode(l.q > 1 ? " each" : "")); f.appendChild(pl);
      var w = l.chat ? "trade chat" : where(l); f.appendChild(el("div", null, (w ? w + " · " : "") + (l.so ? "sold " : "seen ") + ago(l.t) + (l.stream ? " · on " + l.who + "'s stream" : "")));
      var spl = read ? scrollSplit(name, l) : null;
      if (spl && spl.ok && spl.su > 0) {
        var pw = spl.passed[0] === spl.passed[1] ? spl.passed[0] + " passed, " + (spl.su - spl.passed[0]) + " failed" : spl.passed[0] + " to " + spl.passed[1] + " passed";
        var gw = []; Object.keys(spl.gain).forEach(function (k) { var g0 = spl.gain[k]; if (g0[1]) gw.push((g0[0] === g0[1] ? "+" + g0[0] : "+" + g0[0] + " to +" + g0[1]) + " " + (STATWORD[k] || k)); });
        f.appendChild(el("div", "gt-dim", "Scrolls: " + pw + (gw.length ? ", adding " + gw.join(", ") : "") + ". " + (naturalWords(name, spl, true) ? naturalWords(name, spl, true).replace(/^n/, "N") + " (the drop's own roll)." : "The stats buyers pay for are at the item's base apart from that.")));
      }
      else if (spl && !spl.ok) f.appendChild(el("div", "gt-dn", "These stats don't add up for any mix of scrolls, so the read is kept out of roll prices."));
      f.appendChild(el("div", "gt-dim", read ? "Stats read from this copy's popup in game" : "Not hovered in game yet: these are the item's base stats"));
      box.appendChild(f);
    }
    return box;
  }
  function gtipEl() { var t = $("gtip"); if (!t) { t = el("div", "gtip"); t.id = "gtip"; t.setAttribute("role", "tooltip"); t.hidden = true; document.body.appendChild(t); } return t; }
  function gtipShow(node, cx, cy) {
    var info = TIPL && TIPL.get(node); if (!info) return;
    var t = gtipEl(); if (GTIP_ON !== node) { t.textContent = ""; t.appendChild(gameTip(info.l, info.n)); GTIP_ON = node; }
    t.hidden = false; gtipMove(cx, cy);
  }
  function gtipMove(cx, cy) {
    gtipMove.x = cx; gtipMove.y = cy;
    var t = $("gtip"); if (!t || t.hidden) return;
    var w = t.offsetWidth, h = t.offsetHeight, x = cx + 18, y = cy + 14;
    if (x + w > window.innerWidth - 6) x = Math.max(6, cx - w - 14);
    if (y + h > window.innerHeight - 6) y = Math.max(6, window.innerHeight - h - 6);
    t.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
  }
  function gtipHide() { var t = $("gtip"); if (t) t.hidden = true; GTIP_ON = null; }
  function tipNode(n) { for (var k = 0; n && k < 6; k++, n = n.parentNode) if (n.classList && n.classList.contains("gtipable")) return n; return null; }
  (function () {
    if (!TIPL) return;
    var raf = 0, lx = 0, ly = 0, touch = false;
    document.addEventListener("pointerover", function (e) { if (e.pointerType !== "mouse") return; var n = tipNode(e.target); if (n) gtipShow(n, e.clientX, e.clientY); else if (GTIP_ON) gtipHide(); });
    document.addEventListener("pointermove", function (e) { if (e.pointerType !== "mouse" || !GTIP_ON) return; lx = e.clientX; ly = e.clientY; if (!raf) raf = requestAnimationFrame(function () { raf = 0; gtipMove(lx, ly); }); }, { passive: true });
    document.addEventListener("pointerdown", function (e) { touch = e.pointerType !== "mouse"; });
    // phones: a tap on a listing shows its popup under the finger; a tap anywhere else puts it away
    document.addEventListener("click", function (e) {
      if (!touch) return; var n = tipNode(e.target);
      if (n && n !== GTIP_ON && !e.target.closest("button, a")) { var rc = n.getBoundingClientRect(); gtipShow(n, Math.min(rc.left + 20, window.innerWidth - 270), rc.bottom - 8); }
      else if (GTIP_ON) gtipHide();
    });
    window.addEventListener("scroll", function () { if (GTIP_ON && touch) gtipHide(); }, { passive: true, capture: true });
  })();
  function svgEl(t, a) { var e = document.createElementNS("http://www.w3.org/2000/svg", t); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function txt(x, y, s, a) { var t = svgEl("text", Object.assign({ x: x, y: y, "font-size": "9.5", "font-weight": "800", fill: "var(--muted)", "font-family": "Inter, sans-serif" }, a || {})); t.textContent = s; return t; }
  function chartSpread(i) {
    var W = 300, Hh = 170, pad = 12, vals = i.sales.map(function (x) { return x.u; }).concat(i.asks.map(function (x) { return x.u; }));
    var lo = quant(vals, 0.03), hi = quant(vals, 0.97); if (hi <= lo) { lo = lo * 0.8; hi = hi * 1.2 + 1; }
    var X = function (v) { return pad + (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * (W - 2 * pad); };
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + Hh, role: "img", "aria-label": "Spread of sale and asking prices" });
    if (i.hi > i.lo) svg.appendChild(svgEl("rect", { x: X(i.lo), y: 16, width: Math.max(2, X(i.hi) - X(i.lo)), height: 94, fill: "rgba(124,77,230,.16)", rx: 4 }));
    var bins = 36, h = new Array(bins).fill(0);
    vals.forEach(function (v) { var b = Math.min(bins - 1, Math.max(0, Math.floor((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * bins))); h[b]++; });
    var sm = h.map(function (_, k) { var s = 0, n = 0; for (var j = -2; j <= 2; j++) { if (h[k + j] != null) { s += h[k + j] * (3 - Math.abs(j)); n += 3 - Math.abs(j); } } return s / n; });
    var mx = Math.max.apply(null, sm) || 1;
    var d = "M" + pad + ",110 " + sm.map(function (v, k) { return "L" + (pad + (k + .5) / bins * (W - 2 * pad)).toFixed(1) + "," + (110 - v / mx * 86).toFixed(1); }).join(" ") + " L" + (W - pad) + ",110 Z";
    svg.appendChild(svgEl("path", { d: d, fill: "var(--orange)", "fill-opacity": ".16", stroke: "var(--orange-lo)", "stroke-width": "2", "stroke-linejoin": "round" }));
    svg.appendChild(svgEl("line", { x1: X(i.typ), x2: X(i.typ), y1: 12, y2: 112, stroke: "var(--ink)", "stroke-dasharray": "4 3", "stroke-width": "1.4" }));
    svg.appendChild(txt(Math.min(W - 64, Math.max(4, X(i.typ) - 30)), 10, "typical " + short(i.typ), { fill: "var(--ink)" }));
    var jit = function (k) { return ((k * 37) % 7) - 3; };
    i.sales.forEach(function (x, k) { svg.appendChild(svgEl("circle", { cx: X(x.u), cy: 126 + jit(k), r: 3.3, fill: "var(--orange)", "fill-opacity": ".75" })); });
    i.asks.forEach(function (x, k) { svg.appendChild(svgEl("circle", { cx: X(x.u), cy: 144 + jit(k), r: 3.3, fill: "none", stroke: "var(--wood)", "stroke-width": "1.4" })); });
    svg.appendChild(txt(0, 129, "sales", { "font-size": "8.5" })); svg.appendChild(txt(0, 147, "asks", { "font-size": "8.5" }));
    [lo, (lo + hi) / 2, hi].forEach(function (v, k) { svg.appendChild(txt(k === 0 ? pad : k === 1 ? W / 2 : W - pad, 166, short(v), { "text-anchor": k === 0 ? "start" : k === 1 ? "middle" : "end" })); });
    return svg;
  }
  function chartTime(i) {
    var W = 300, Hh = 180, pl = 34, pr = 50, pt = 10, pb = 22;
    var pts = i.sales.map(function (x) { return [x.t, x.u, 1]; }).concat(i.asks.map(function (x) { return [x.t, x.u, 0]; }));
    var ys = pts.map(function (p) { return p[1]; }), lo = quant(ys, .03), hi = quant(ys, .97); if (hi <= lo) { lo *= .8; hi = hi * 1.2 + 1; }
    var span = hi - lo; lo = Math.max(0, lo - span * .04); hi = hi + span * .04;
    var t0 = Math.min.apply(null, pts.map(function (p) { return p[0]; })), t1 = Math.max.apply(null, pts.map(function (p) { return p[0]; })); if (t1 - t0 < H) { t0 -= H / 2; t1 += H / 2; }
    var X = function (t) { return pl + (t - t0) / (t1 - t0) * (W - pl - pr); }, Y = function (v) { return pt + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (Hh - pt - pb); };
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + Hh, role: "img", "aria-label": "Prices over time" });
    [0, 1, 2, 3].forEach(function (k) { var v = lo + (hi - lo) * k / 3; svg.appendChild(svgEl("line", { x1: pl, x2: W - pr + 6, y1: Y(v), y2: Y(v), stroke: "var(--line)" })); svg.appendChild(txt(pl - 4, Y(v) + 3, short(v), { "text-anchor": "end" })); });
    if (i.hi > i.lo) { svg.appendChild(svgEl("rect", { x: pl, y: Y(i.hi), width: W - pl - pr + 6, height: Math.max(2, Y(i.lo) - Y(i.hi)), fill: "rgba(124,77,230,.15)" })); svg.appendChild(txt(W - pr + 9, (Y(i.hi) + Y(i.lo)) / 2 - 1, "typical", { fill: "var(--orange-lo)" })); svg.appendChild(txt(W - pr + 9, (Y(i.hi) + Y(i.lo)) / 2 + 9, "range", { fill: "var(--orange-lo)" })); }
    var above = 0, below = 0;
    pts.forEach(function (p) {
      if (p[1] > hi) above++; if (p[1] < lo) below++;
      svg.appendChild(p[2] ? svgEl("circle", { cx: X(p[0]), cy: Y(p[1]), r: 3, fill: "var(--orange)", "fill-opacity": ".55" }) : svgEl("circle", { cx: X(p[0]), cy: Y(p[1]), r: 3, fill: "none", stroke: "var(--wood)", "stroke-width": "1.3", "stroke-opacity": ".8" }));
    });
    if (i.daily.length >= 2) svg.appendChild(svgEl("polyline", { points: i.daily.map(function (d) { return X(Math.min(t1, Math.max(t0, d[0] + DAY / 2))).toFixed(1) + "," + Y(d[1]).toFixed(1); }).join(" "), fill: "none", stroke: "var(--orange-lo)", "stroke-width": "2.6", "stroke-linejoin": "round", "stroke-linecap": "round" }));
    if (above) svg.appendChild(txt(W - pr + 9, pt + 6, "+" + above + " above"));
    if (below) svg.appendChild(txt(W - pr + 9, Hh - pb, "+" + below + " below"));
    var multi = t1 - t0 > 1.5 * DAY;
    [t0, (t0 + t1) / 2, t1].forEach(function (t, k) { svg.appendChild(txt(k === 0 ? pl : k === 1 ? (pl + W - pr) / 2 : W - pr, Hh - 6, new Date(t).toLocaleString("en-US", multi ? { month: "short", day: "numeric" } : { hour: "numeric", minute: "2-digit" }), { "text-anchor": k === 0 ? "start" : k === 1 ? "middle" : "end" })); });
    return svg;
  }
  // Scrolls: what one success costs at each tier. A 10% scroll at 30K is about 300K per success; a 60% at 120K
  // about 200K. The cheapest way to land one is marked. Only tiers with a typical price count.
  function scrollMath(name) {
    var sp = splitTier(name); if (!sp.t || !D) return null;
    var RATE = { Lesser: 100, Intermediate: 60, Greater: 10 }, rows = [];
    ["Lesser", "Intermediate", "Greater"].forEach(function (t) { var it = D.byName[sp.b + ": " + t]; if (it && it.typ) rows.push({ t: t, p: it.typ, r: RATE[t], per: it.typ * 100 / RATE[t], it: it }); });
    if (rows.length < 2) return null;   // one tier priced: nothing to compare
    // one line: which tier lands a success for the least mesos, the others muted and clickable
    rows.sort(function (a, b) { return a.per - b.per; });
    var box = el("div", "smath"), best = rows[0];
    box.appendChild(el("span", "sml", "Cheapest per success"));
    var bw = el("b", best.t === sp.t ? "me" : "jump", best.r + "% "); bw.appendChild(money(Math.round(best.per))); if (best.t !== sp.t) { bw.title = "Open the " + best.r + "% scroll"; bw.addEventListener("click", function () { pick(best.it.item); }); } box.appendChild(bw);
    rows.slice(1).forEach(function (r) {
      var o = el("span", "smo" + (r.t === sp.t ? " me" : " jump"), r.r + "% "); o.appendChild(money(Math.round(r.per)));
      if (r.t !== sp.t) { o.title = "Open the " + r.r + "% scroll"; o.addEventListener("click", function () { pick(r.it.item); }); } box.appendChild(o);
    });
    box.appendChild(infoTip("Price divided by success rate: what one successful scroll costs on average, counting the ones that fail. A " + (rows.filter(function (r) { return r.t === sp.t; })[0] || best).r + "% takes about " + Math.round(100 / (rows.filter(function (r) { return r.t === sp.t; })[0] || best).r) + " tries per success, and every failed one still uses a slot."));
    return box;
  }


  // ---- item guide: what quests ask for this item, where it drops, how it's crafted, who sells it (data/itemguide.json)
  var GUIDE = null, guideAsked = false;
  function loadGuide() {
    if (guideAsked) return; guideAsked = true;
    fetch(LIVE + "data/itemguide.json?h=" + Math.floor(Date.now() / 36e5)).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (j) { if (j && j.items) { GUIDE = j; GUIDE.low = {}; Object.keys(j.items).forEach(function (k) { GUIDE.low[k.toLowerCase()] = j.items[k]; }); if (state.sel) renderItem(); } });
  }
  function guideFor(name) {
    if (!GUIDE || !name) return null;
    return GUIDE.items[name] || GUIDE.low[String(name).toLowerCase()] || null;
  }
  function guideLink(name, n) {
    var known = (D && D.byName[name]) || dbRow(name);
    var a = el("span", known ? "gl" : null, name + (n != null ? " ×" + fmt(n) : ""));
    if (known) { a.tabIndex = 0; a.title = "Open " + name; a.addEventListener("click", function () { pick(D && D.byName[name] ? name : dbRow(name)[0]); }); }
    return a;
  }
  // quests by id, with the address of each one's guide page (same rule as tools/worldpages.py)
  var QBY = null;
  function questById(id) {
    if (!GUIDE || !GUIDE.quests) return null;
    if (!QBY) {
      QBY = {}; var seen = {}, sl = function (n) { return String(n).toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x"; };
      GUIDE.quests.forEach(function (q) { seen[sl(q.n)] = (seen[sl(q.n)] || 0) + 1; });
      GUIDE.quests.forEach(function (q) { var x = sl(q.n); QBY[q.id] = { q: q, slug: seen[x] === 1 ? x : x + "-" + q.id }; });
    }
    return QBY[id] || null;
  }
  function npcPic(id, name) {
    var pic = el("span", "qnpc"), ini = String(name || "?").charAt(0);
    if (id != null) { var im = new Image(); im.alt = ""; im.loading = "lazy"; im.src = "https://maplestory.io/api/MCW/1/npc/" + id + "/icon"; im.onerror = function () { im.remove(); pic.textContent = ini; }; pic.appendChild(im); }
    else pic.textContent = ini;
    return pic;
  }
  // one quest as a card: the NPC who gives it, the quest name, level and town, and what it means for this item
  function questCard(id, name, tag, cls) {
    var r = questById(id), q = r && r.q, a = el("a", "qcard");
    a.href = r ? "/quest/" + r.slug + "/" : "quests.html?q=" + encodeURIComponent(name);
    a.appendChild(npcPic(q && q.gid, (q && q.g) || name));
    var t = el("span", "qtx"); t.appendChild(el("b", null, name));
    var sub = [q && q.g, q && q.lv ? "Lv " + q.lv + "+" : "", q && (q.town || q.a), q && q.rep ? "repeatable" : ""].filter(Boolean).join(" · ");
    if (sub) t.appendChild(el("small", null, sub)); a.appendChild(t);
    a.appendChild(el("span", "qtag " + cls, tag));
    return a;
  }
  // a long list shows its first few cards and a button for the rest, so prices and listings stay near the top
  function capCards(box, n, what) {
    var k = box.children; if (k.length <= n + 1) return box;
    for (var j = n; j < k.length; j++) k[j].hidden = true;
    var w = el("div", "qwrap"), b = el("button", "qall", "Show all " + k.length + " " + what); b.type = "button";
    b.addEventListener("click", function () { [].forEach.call(box.children, function (c) { c.hidden = false; }); b.remove(); });
    w.appendChild(box); w.appendChild(b); return w;
  }
  function guideBox(name) {
    var g = guideFor(name); if (!g) return null;
    var box = el("div", "guide gbox");
    var where = el("div", "gwhere"), any = false, wh = el("h4", null, "Where to get it"); where.appendChild(wh);
    var cards = el("div", "qcards"), shops = el("div", "qcards");
    if (g.g) g.g.forEach(function (x) { any = true; cards.appendChild(questCard(x[1], x[0], x[2] === "given" ? "Given" : "Reward", "rew")); });
    if (g.s) g.s.forEach(function (x) {
      any = true; var c = el("div", "qcard shop"); c.appendChild(npcPic(x[4], x[0]));
      var t = el("span", "qtx"); t.appendChild(el("b", null, x[0])); t.appendChild(el("small", null, ["NPC shop", x[1]].filter(Boolean).join(" · "))); c.appendChild(t);
      var pr = el("span", "qtag shp"); if (x[3]) pr.textContent = fmt(x[2]) + " " + x[3]; else pr.appendChild(money(x[2])); c.appendChild(pr);
      shops.appendChild(c);
    });
    if (cards.firstChild) where.appendChild(capCards(cards, 4, "quests"));
    if (shops.firstChild) where.appendChild(capCards(shops, 2, "shops"));
    // monsters: the pictures come in from dropsBox; this keeps their place so the card doesn't jump
    if (g.d && g.d.length) { any = true; var gd = el("div", "gdrops"); gd.style.minHeight = (g.d.length > 4 ? 124 : 62) + "px"; where.appendChild(gd); }
    if (g.c) {
      any = true;
      g.c.forEach(function (c) {
        var rc = el("div", "gcraft"), hd = el("div", "gct"); hd.appendChild(el("span", "gtag", "Crafted")); hd.appendChild(el("b", null, c[0] + " Lv " + c[1]));
        hd.appendChild(document.createTextNode(" makes " + fmt(c[4] || 1) + " per craft")); if (c[3]) { hd.appendChild(document.createTextNode(" · fee ")); hd.appendChild(money(c[3])); }
        rc.appendChild(hd);
        var parts = c[2].map(function (x) { return [x[0], x[1], ""]; }); if (c[5]) parts.push([c[5][0], c[5][1], "catalyst"]);
        parts.forEach(function (x) {
          var row = el("div", "gci"), id = GUIDE.ids && GUIDE.ids[x[0]];
          if (id) { var im = new Image(); im.src = "/i/" + id + ".png"; im.alt = ""; im.loading = "lazy"; im.onerror = function () { if (/^\/i\//.test(new URL(im.src).pathname)) im.src = "https://maplestory.io/api/MCW/1/item/" + id + "/icon"; else im.remove(); }; row.appendChild(im); }
          row.appendChild(guideLink(x[0])); if (x[2]) row.appendChild(el("small", null, " " + x[2])); row.appendChild(el("em", null, "×" + fmt(x[1]))); rc.appendChild(row);
        });
        where.appendChild(rc);
      });
    }
    if (g.r) { any = true; g.r.forEach(function (x) { where.appendChild(el("div", "rc", "From " + x[0] + (x[1] != null ? " (" + x[1] + "%)" : "") + (x[2] ? " · during " + x[2] : ""))); }); }
    if (!any && g.t) { any = true; where.appendChild(el("div", "rc", "Found during the quest. In game: \u201c" + g.t + "\u201d")); }
    if (any) box.appendChild(where);
    if (g.q) {
      var tot = g.q.reduce(function (a, q) { return a + q[2]; }, 0);
      var used = el("div", "gused"), h = el("h4"); h.appendChild(document.createTextNode("Used in quests")); if (g.q.length > 1) h.appendChild(el("small", null, fmt(tot) + " in all")); used.appendChild(h);
      var uc = el("div", "qcards"); g.q.forEach(function (q) { uc.appendChild(questCard(q[7], q[0], "Needs ×" + fmt(q[2]), "need")); }); used.appendChild(capCards(uc, 4, "quests"));
      box.appendChild(used);
    }
    if (g.u) box.appendChild(el("p", "gnote", "Used in " + g.u + " crafting recipe" + (g.u === 1 ? "" : "s") + "."));
    if (!box.firstChild) return null;
    var src = el("p", "src"); src.appendChild(document.createTextNode("Sources: game data and the "));
    var wl = el("a", null, "MapleStory Classic Wiki"); wl.href = "https://mapleclassic.wiki/wiki/" + encodeURIComponent(String(name).replace(/ /g, "_")); wl.target = "_blank"; wl.rel = "noopener"; src.appendChild(wl);
    src.appendChild(document.createTextNode(" (CC BY-NC-SA 4.0)"));
    box.appendChild(src);
    return box;
  }
  function renderItem() {
    var r = $("ipr"); if (r) { r.textContent = ""; r.hidden = true; }
    $("ip").classList.remove("lclosed"); if ($("ipr")) $("ipr").classList.remove("lclosed");
    renderItem0();
    loadGuide();
    var gb = state.sel && guideBox(state.sel); if (gb) $("ip").appendChild(gb);
    if (window.innerWidth <= 1180) { var pch = state.sel && D && D.byName && D.byName[state.sel] && !D.preview && bigChart(D.byName[state.sel]); if (pch) $("ip").appendChild(pch); }
    orderCard($("ip"));
    foldLists($("ip"));
    foldStats($("ip"));
    splitCard();
    credit();
  }
  // phones and tablets: Price by stat starts folded so Where to buy is a short scroll away; one tap opens it, and it
  // stays open for that item. A search for a roll ("wg 3 att") opens it on its own.
  var STATOPEN = "";
  // equips with a price ladder: Price by stat and the listings start folded at every width, and stay open once opened
  // (remembered in this browser for every item)
  var OPENS = loadLS("fm-open", {}) || {};
  function ladItem() { var i = state.sel && D && D.byName && D.byName[state.sel]; return !!(i && i.equip && ladderOf(i)); }
  function foldStats(ip) {
    var lad = ladItem();
    if (!ip || (window.innerWidth > 1180 && !lad)) return;
    ip.querySelectorAll(":scope > .rollbox, :scope > .pbs").forEach(function (box) {
      var h = box.querySelector(":scope > h4"); if (!h) return;
      var open = STATOPEN === state.sel || (lad && !!OPENS.stats);
      box.classList.add("fold"); box.classList.toggle("open", open);
      h.setAttribute("role", "button"); h.tabIndex = 0; h.setAttribute("aria-expanded", open);
      if (!h.querySelector(".fhint")) { var hint = el("span", "fhint", open ? "Hide" : lad && window.innerWidth > 1180 ? "Open" : "Tap to open"); h.insertBefore(hint, h.querySelector(".inf")); h.appendChild(el("span", "fchev")); }
      var go = function (e) {
        if (e.target.closest(".inf")) return; if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return; e.preventDefault();
        var now = !box.classList.contains("open"); STATOPEN = now ? state.sel : ""; if (lad) { OPENS.stats = now ? 1 : 0; saveLS("fm-open", OPENS); }
        document.querySelectorAll("#ip > .fold, #ipr > .fold").forEach(function (b) { b.classList.toggle("open", now); var hh = b.querySelector(":scope > h4"); hh.setAttribute("aria-expanded", now); var fh = hh.querySelector(".fhint"); if (fh) fh.textContent = now ? "Hide" : lad && window.innerWidth > 1180 ? "Open" : "Tap to open"; });
      };
      h.addEventListener("click", go); h.addEventListener("keydown", go);
    });
  }
  // Where to buy and the full sales list behind one bar, open by default; closing it is remembered in this browser.
  // The list scrolls inside its own box, so the card never runs on past it
  function foldLists(ip) {
    var i = D && D.byName && D.byName[state.sel]; if (!i || !ip.querySelector(":scope > .ltabs") || ip.querySelector(":scope > .lfold")) return;
    var open = OPENS.lists !== 0, n = ip.querySelector(":scope > .ltabs em"), b = el("button", "lfold"); b.type = "button";   // open unless this browser closed it
    b.appendChild(el("span", null, "Where to buy and all sales")); b.appendChild(el("span", "fhint", open ? "Hide" : "Open")); b.appendChild(el("span", "fchev"));
    b.setAttribute("aria-expanded", open);
    ip.classList.toggle("lclosed", !open);
    b.addEventListener("click", function () { OPENS.lists = open ? 0 : 1; saveLS("fm-open", OPENS); renderItem(); });
    var lt = ip.querySelector(":scope > .ltabs"); ip.insertBefore(b, lt || null);
  }
  // the card's reading order. Buying comes first: Where to buy and all sales, how to get it, the buttons. Then what it's
  // worth: the header, the chart, price by grade and the rest. On wide screens buying is the left column and the
  // worth side the right (splitCard); on phones it is one column, header, lists, chart and grades, then the rest.
  // Anything without a place stays right after the part it was added next to.
  var CARDORDER = [["ih", 0], ["big", 0.05], ["tline", 0.06], ["lfold", 0.2], ["ltabs", 0.3], ["bsort", 0.4], ["list", 0.5], ["bchartw", 0.6], ["rollmiss", 2], ["gladder", 2.5], ["mvs", 5], ["stats", 6], ["smath", 7], ["panelbtns", 8], ["guide", 9], ["drops", 9.5], ["rollbox", 10], ["pbs", 11], ["bids", 12], ["ifoot", 20]];
  var BUYSIDE = ["ih", "big", "tline", "lfold", "ltabs", "bsort", "list", "guide", "drops", "panelbtns", "mkt"];
  function orderCard(ip) {
    if (!ip || !state.sel) return;
    var last = -1, kids = [].slice.call(ip.children).map(function (k, ix) {
      var r = null; for (var j = 0; j < CARDORDER.length && r == null; j++) if (k.classList.contains(CARDORDER[j][0])) r = CARDORDER[j][1];
      if (r == null) r = last + 0.01; last = r; return [r, ix, k];
    });
    kids.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).forEach(function (x) { ip.appendChild(x[2]); });
  }
  // wide screens: buying on the left (Where to buy and all sales, Where to get it, the buttons); the header, chart,
  // price by grade and everything else on the right, in the card's reading order
  function isBuy(k) { return BUYSIDE.some(function (c) { return k.classList.contains(c); }); }
  function splitCard() {
    var r = $("ipr"), ip = $("ip"); if (!r || !ip || window.innerWidth <= 1180 || !state.sel) return;
    var i = D && D.byName && D.byName[state.sel];
    var kids = [].slice.call(ip.children); if (!kids.some(isBuy)) return;
    var ch = i && !D.preview && bigChart(i), at = 0;
    kids.forEach(function (k) { if (isBuy(k)) return; r.appendChild(k); });
    if (ch) r.insertBefore(ch, r.firstChild);
    // left, top to bottom: the item and its price (people read left to right, top down), then where to buy it
    var order = ["ih", "big", "tline", "lfold", "ltabs", "bsort", "list", "mkt", "guide", "drops", "panelbtns"];
    [].slice.call(ip.children).map(function (k, ix) { var o = order.findIndex(function (c) { return k.classList.contains(c); }); return [o < 0 ? 99 : o, ix, k]; })
      .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).forEach(function (x) { ip.appendChild(x[2]); });
    r.hidden = false;
  }
  // the maplestory.io credit sits at the very bottom of the card, out of the way; the card's top carries our name
  function credit() {
    var c = $("icred"); if (!c) return; c.textContent = "";
    var n = state.sel, id = n && idOf(n) || (n && dbRow(n) && dbRow(n)[1]);
    if (!n) return;
    c.appendChild(document.createTextNode("Prices: Club FM scans"));
    if (id) { c.appendChild(document.createTextNode(" · Item data from ")); var a = el("a", null, "maplestory.io"); a.href = IO + id; a.target = "_blank"; a.rel = "noopener"; c.appendChild(a); }
  }
  // the card's price chart: every sale and asking price we saw, with the daily typical price as a line
  function bigChart(i) {
    var pts = (i.sales || []).map(function (x) { return [x.t, x.u, 1]; }).concat((i.asks || []).map(function (x) { return [x.t, x.u, 0]; }));
    var dl = (i.daily || []).filter(function (d) { return d && d[1] > 0; });
    if (pts.length < 3 && dl.length < 2) return null;
    if (pts.length < 3) pts = [];
    var W = 560, Hh = 210, pl = 46, pr = 14, pt = 12, pb = 24;
    var ys = pts.map(function (p) { return p[1]; }).concat(dl.map(function (d) { return d[1]; }));
    var lo = quant(ys, .03), hi = quant(ys, .97); if (hi <= lo) { lo *= .8; hi = hi * 1.2 + 1; }
    var span = hi - lo; lo = Math.max(0, lo - span * .06); hi = hi + span * .06;
    var ts = pts.map(function (p) { return p[0]; }).concat(dl.map(function (d) { return d[0] + DAY / 2; }));
    var t0 = Math.min.apply(null, ts), t1 = Math.max.apply(null, ts); if (t1 - t0 < H) { t0 -= H / 2; t1 += H / 2; }
    var X = function (t) { return pl + (t - t0) / (t1 - t0) * (W - pl - pr); }, Y = function (v) { return pt + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (Hh - pt - pb); };
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + Hh, role: "img", "aria-label": "Prices over time", "class": "bchart" });
    [0, 1, 2, 3].forEach(function (k) { var v = lo + (hi - lo) * k / 3; svg.appendChild(svgEl("line", { x1: pl, x2: W - pr, y1: Y(v), y2: Y(v), stroke: "var(--line)" })); svg.appendChild(txt(pl - 5, Y(v) + 3, short(v), { "text-anchor": "end" })); });
    if (i.hi > i.lo) svg.appendChild(svgEl("rect", { x: pl, y: Y(i.hi), width: W - pl - pr, height: Math.max(2, Y(i.lo) - Y(i.hi)), fill: "rgba(124,77,230,.13)" }));
    pts.forEach(function (p) { svg.appendChild(p[2] ? svgEl("circle", { cx: X(p[0]), cy: Y(p[1]), r: 3.2, fill: "var(--orange)", "fill-opacity": ".6" }) : svgEl("circle", { cx: X(p[0]), cy: Y(p[1]), r: 3.2, fill: "none", stroke: "var(--wood)", "stroke-width": "1.3", "stroke-opacity": ".8" })); });
    if (dl.length >= 2) svg.appendChild(svgEl("polyline", { points: dl.map(function (d) { return X(Math.min(t1, Math.max(t0, d[0] + DAY / 2))).toFixed(1) + "," + Y(d[1]).toFixed(1); }).join(" "), fill: "none", stroke: "var(--orange-lo)", "stroke-width": "2.4", "stroke-linejoin": "round", "stroke-linecap": "round" }));
    // equips with a ladder: the Clean grade's daily middle (green) and the grade picked on the card (blue), so the
    // chart reads the same way as the buttons
    var LC = i.equip ? ladderOf(i) : null, glines = [];
    if (LC && LC.top) {
      var gv = LC.views[LADSTAT[i.item] && LC.views[LADSTAT[i.item]] ? LADSTAT[i.item] : LC.pick] || [], gsel = LADSEL[i.item + "|" + (LADSTAT[i.item] || LC.pick)];
      var gc = gv.filter(function (g) { return /^Clean( \d+ (M?ATT))?$/.test(g.name) && g.basis === "sold"; }).sort(function (a, b) { return b.use.length - a.use.length; })[0] || LC.top;
      var gs = gv.filter(function (g) { return g.id === gsel; })[0];
      [[gc, "#1f9d55"], [gs && gs !== gc ? gs : null, "#2f6fe0"]].forEach(function (pair) {
        var g = pair[0]; if (!g || !g.use || g.use.length < 2) return;
        var by = {}; g.use.forEach(function (l) { var d = new Date(l.t).toDateString(); (by[d] || (by[d] = [])).push(l.u); });
        var line = Object.keys(by).map(function (d) { return [Date.parse(d), median(by[d])]; }).sort(function (a, b) { return a[0] - b[0]; });
        if (line.length >= 2) { svg.appendChild(svgEl("polyline", { points: line.map(function (d) { return X(Math.min(t1, Math.max(t0, d[0] + DAY / 2))).toFixed(1) + "," + Y(d[1]).toFixed(1); }).join(" "), fill: "none", stroke: pair[1], "stroke-width": "2.4", "stroke-linejoin": "round", "stroke-linecap": "round" })); glines.push([g.name, pair[1]]); }
        else if (line.length === 1) { svg.appendChild(svgEl("circle", { cx: X(line[0][0] + DAY / 2), cy: Y(line[0][1]), r: 5, fill: pair[1] })); glines.push([g.name, pair[1]]); }
      });
    }
    var multi = t1 - t0 > 1.5 * DAY;
    [t0, (t0 + t1) / 2, t1].forEach(function (t, k) { svg.appendChild(txt(k === 0 ? pl : k === 1 ? (pl + W - pr) / 2 : W - pr, Hh - 6, new Date(t).toLocaleString("en-US", multi ? { month: "short", day: "numeric" } : { hour: "numeric", minute: "2-digit" }), { "text-anchor": k === 0 ? "start" : k === 1 ? "middle" : "end" })); });
    var box = el("div", "subw bchartw"), hd = el("h4"); hd.appendChild(document.createTextNode("Price over time"));
    var sm0 = el("small", null, pts.length ? "dots: sales and asks · line: typical by day" : "typical price by day");
    glines.forEach(function (gl) { var k0 = el("span", "glk"); k0.style.color = gl[1]; k0.textContent = " · " + gl[0]; sm0.appendChild(k0); });
    hd.appendChild(sm0); box.appendChild(hd); box.appendChild(svg);
    return box;
  }

  // the item's name bar: once the header scrolls away, the card's title bar names the item, its price and the site, so any screenshot says what it is
  var nbIO = null;
  function nameBar(i) {
    var w = $("side") && $("side").querySelector(".wtitle"); if (!w) return;
    if (nbIO) { nbIO.disconnect(); nbIO = null; }
    var old = w.querySelector(".nbar"); if (old) old.remove();
    var hd = i && ($("side").querySelector(".ih h3") || $("side").querySelector(".ih"));   // the moment the item's name scrolls away
    if (!hd || !window.IntersectionObserver) { w.classList.remove("named"); return; }
    var nb = el("div", "nbar"); nb.setAttribute("aria-hidden", "true");
    nb.appendChild(iconBox(i.item)); var t = el("div", "nbt"); t.appendChild(el("b", null, showName(i.item)));
    var NL = i.equip && ladderOf(i), NT = NL && NL.top && NL.top.basis === "sold" ? NL.top : null;
    t.appendChild(el("small", null, (NT ? NT.name.toLowerCase().replace(/ (att|matt)\b/g, function (z) { return z.toUpperCase(); }) + " " + short(NT.lo) + "–" + M(NT.hi) : "typical " + M(i.typ)) + (i.salesN ? " · " + fmt(i.salesN) + " sales" : ""))); nb.appendChild(t);
    var nbr = el("span", "nbrand"); var nbi = el("img"); nbi.src = "/clubfm-icon-512.png"; nbi.alt = ""; nbr.appendChild(nbi); nbr.appendChild(document.createTextNode("maplefm.gg")); nb.appendChild(nbr);
    w.insertBefore(nb, w.querySelector(".meta"));
    nbIO = new IntersectionObserver(function (es) { var e = es[es.length - 1]; w.classList.toggle("named", !e.isIntersecting && e.boundingClientRect.top < e.rootBounds.top + 80); }, { root: $("side"), rootMargin: "-56px 0px 0px 0px" });
    nbIO.observe(hd);
  }

  // The ladder on an equip's card: for items scrolled for more than one stat, a stat picker first (any class finds its
  // stat at once); then one button per grade with its price range and how many sold, the busiest picked first; under
  // it the picked grade's recent sales and its cheapest listings. The search's roll ("wg 1 crit", "hat 3 int") picks
  // that stat and grade.
  var LADODD = {};
  function redrawChart(i) { var old = document.querySelector("#ipr .bchartw, #ip .bchartw"); if (!old) return; var nc = bigChart(i); if (nc) old.replaceWith(nc); }
  function ladderBox(i, L) {
    var box = el("div", "gladder"), h = el("h4");
    h.appendChild(document.createTextNode("Price by grade"));
    h.appendChild(infoTip("Every hovered copy is sorted into a grade: Clean has no scroll used, and a Clean grade with a stat is a better natural roll (crit on gloves and earrings sells for far more). Slots used, no gain had its scrolls fail. +1, +2 and up are the total over the item's base on that stat" + (L.wep ? "; weapons go by their attack number" : "") + ". Prices are the middle half of the last 7 days of sales, one per seller and price every 10 minutes, leaving out sales 4 times above or below the rest; with under " + LADMIN + " sales, the asking prices of copies up now. Copies nobody hovered, or whose popup didn't read right, aren't counted."));
    box.appendChild(h);
    var vk = LADSTAT[i.item] && L.views[LADSTAT[i.item]] ? LADSTAT[i.item] : L.pick;
    var LR = window.__ladroll;   // set by pick(), which sits in another part of this file
    if (LR && LR.n === i.item && Date.now() - LR.at < 60000) {
      var pk = LR.k, pv = +LR.v, want = null; window.__ladroll = null;
      // "1 crit" means whichever crit line the item has (crit rate on gloves, crit damage on earrings)
      if (/^CRIT/.test(pk)) { var hasK = function (k0) { return L.stats.some(function (s0) { return L.views[s0].some(function (g) { return g.id.indexOf(k0 + "+") > 0 || g.id.indexOf("S|" + k0 + "|") === 0; }); }); }; if (!hasK(pk) && hasK(pk === "CRIT" ? "CRITDMG" : "CRIT")) pk = pk === "CRIT" ? "CRITDMG" : "CRIT"; }
      if (pk === "CLEAN") { var cg = (L.views[vk] || []).filter(function (g) { return g.id === "C|" || /^WC\|/.test(g.id); }).sort(function (a, b) { return (b.use ? b.use.length : 0) - (a.use ? a.use.length : 0); })[0]; if (cg) { LADSEL[i.item + "|" + vk] = cg.id; } pk = null; }
      if (L.views[pk] && !L.wep) vk = pk;
      if (pk) L.stats.some(function (s0) { return L.views[s0].some(function (g) {
        var m = L.wep ? /^W[CS]\|(\d+)/.exec(g.id) : g.id.indexOf("S|" + pk + "|") === 0 ? [0, g.id.split("|")[2]] : g.id.indexOf("C|") === 0 && g.id.indexOf(pk + "+") > 0 ? [0, (new RegExp(pk + "\\+(\\d+)").exec(g.id) || [])[1]] : null;
        if (!m || m[1] == null) return false; var v = parseInt(m[1], 10);
        if (v === pv || (/\+$/.test(g.id) && pv >= v) || (/-$/.test(g.id) && pv <= v)) { want = g; vk = s0; return true; } return false; }); });
      if (want) { LADSEL[i.item + "|" + vk] = want.id; LADSTAT[i.item] = vk; }
    }
    if (L.stats.length > 1) {
      var sp = el("div", "lstats"); sp.appendChild(el("span", "lsl", "Stat"));
      L.stats.forEach(function (k) { var b = el("button", null, ladName(k)); b.type = "button"; b.setAttribute("aria-pressed", k === vk); b.addEventListener("click", function () { LADSTAT[i.item] = k; box.replaceWith(ladderBox(i, L)); redrawChart(i); }); sp.appendChild(b); });
      box.appendChild(sp);
    }
    var grades = L.views[vk] || [], sel = LADSEL[i.item + "|" + vk];
    // no grade has 2 copies yet: say so, and give the price of every sale (stats unread) so the card still prices it
    if (!L.top) {
      var nt = el("p", "lgnone");
      nt.appendChild(el("b", null, grades.length ? "Too few read copies to price every grade yet. " : "No copies read yet, so no grades. "));
      if (i.typ) { nt.appendChild(document.createTextNode("All sales, stats unread: ")); if (i.hi > i.lo && short(i.lo) !== short(i.hi)) { nt.appendChild(el("span", "num", short(i.lo))); nt.appendChild(document.createTextNode(" to ")); nt.appendChild(money(i.hi)); } else nt.appendChild(money(i.typ)); nt.appendChild(document.createTextNode(" · " + fmt(i.salesN) + " sales.")); }
      box.appendChild(nt);
      if (!grades.length) return box;
    }
    if (!grades.some(function (g) { return g.id === sel; })) sel = (L.top && grades.indexOf(L.top) >= 0 ? L.top : grades.filter(function (g) { return g.basis === "sold"; })[0] || grades.filter(function (g) { return g.basis === "asking"; })[0] || grades[0] || {}).id;
    var row = el("div", "lgrades"); row.setAttribute("role", "radiogroup"); row.setAttribute("aria-label", "Grades");
    grades.forEach(function (g) {
      var b = el("button", "lg" + (g.id === sel ? " on" : "") + (g.basis === "none" ? " empty" : g.basis === "few" ? " lone" : "")); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", g.id === sel);
      b.appendChild(el("span", "lgn", g.name));
      var pr = el("span", "lgp");
      if (g.basis === "sold" || g.basis === "asking" || (g.basis === "few" && g.lo)) { if (short(g.lo) !== short(g.hi)) { pr.appendChild(el("span", "num", short(g.lo))); pr.appendChild(el("span", "dash", "–")); pr.appendChild(money(g.hi)); } else pr.appendChild(money(g.lo)); }
      else pr.appendChild(el("span", "tfd", "not enough yet"));
      b.appendChild(pr);
      var ns = g.use ? g.use.length : 0;
      b.appendChild(el("span", "lgc", g.basis === "sold" ? ns + " sold" : g.basis === "asking" ? "asking · " + g.asks.length + " listed" : g.basis === "few" ? (g.one === "sold" ? "only 1 sold" : "asking · only 1 listed") : (g.sold.length + g.asks.length) + " seen"));
      b.addEventListener("click", function () { LADSEL[i.item + "|" + vk] = g.id; LADSTAT[i.item] = vk; var nb = ladderBox(i, L); box.replaceWith(nb); var o = nb.querySelector(".lg.on"); if (o) o.focus(); redrawChart(i); });
      row.appendChild(b);
    });
    box.appendChild(row);
    var g = grades.filter(function (x) { return x.id === sel; })[0];
    if (!g) return box;
    var det = el("div", "lgsel");   // no sentence over the lists: the grade's button already says its price and count
    function line(l, sold) {
      var li = el("div", "lgl" + ((g.odd && g.odd.indexOf(l) >= 0) || (g.oddA && g.oddA.indexOf(l) >= 0) ? " odd" : "")); li.appendChild(money(l.u));
      li.appendChild(el("span", "lgw", l.s));
      var chip = statChip(i.item, l.x, l.xj); if (chip) li.appendChild(chip);
      var lsm = el("small"); if (!sold) { lsm.appendChild(el("b", "wh", buyWhere(l))); lsm.appendChild(document.createTextNode(" · ")); } lsm.appendChild(document.createTextNode(ago(l.t))); li.appendChild(lsm);
      tipAttach(li, l, i.item);
      return li;
    }
    var showOdd = LADODD[i.item + "|" + g.id], list = (g.uniq || g.sold).filter(function (l) { return showOdd || !g.odd || g.odd.indexOf(l) < 0; });
    if (list.length) { det.appendChild(el("h5", null, "Recent sales")); list.slice(0, 6).forEach(function (l) { det.appendChild(line(l, true)); }); }
    var nOdd = (g.odd ? g.odd.length : 0) + (g.oddA ? g.oddA.length : 0);
    if (nOdd) {
      var ob = el("button", "lodd", showOdd ? "Hide " + nOdd + " unusual " + (nOdd === 1 ? "price" : "prices") : nOdd + " unusual " + (nOdd === 1 ? "price" : "prices") + " left out · show"); ob.type = "button";
      ob.title = "Sales and listings 4 times above or below the rest of this grade: often a stat line or price the reader missed, or a one-off. They don't count toward the price.";
      ob.addEventListener("click", function () { LADODD[i.item + "|" + g.id] = !showOdd; box.replaceWith(ladderBox(i, L)); }); det.appendChild(ob);
    }
    var alist = showOdd ? g.asks : (g.okAsks || g.asks);
    if (alist.length) { det.appendChild(el("h5", null, "Cheapest listed now")); alist.slice(0, 5).forEach(function (l) { det.appendChild(line(l, false)); }); }
    box.appendChild(det);
    return box;
  }
  // signed out (the saved summary has no listings): the grades and their prices only
  function ladderStatic(lad) {
    var box = el("div", "gladder"); box.appendChild(el("h4", null, "Price by grade"));
    lad.forEach(function (sv) {
      if (lad.length > 1) box.appendChild(el("h5", "lsh", sv[0]));
      var row = el("div", "lgrades");
      sv[1].forEach(function (g) {
        var b = el("div", "lg" + (g[7] ? " on" : "") + (g[1] === "none" || (g[1] === "few" && !(g[2] > 0)) ? " empty" : g[1] === "few" ? " lone" : "")); b.appendChild(el("span", "lgn", g[0]));
        var pr = el("span", "lgp"); if (g[1] === "sold" || g[1] === "asking" || (g[1] === "few" && g[2] > 0)) { if (short(g[2]) !== short(g[3])) { pr.appendChild(el("span", "num", short(g[2]))); pr.appendChild(el("span", "dash", "–")); pr.appendChild(money(g[3])); } else pr.appendChild(money(g[2])); } else pr.appendChild(el("span", "tfd", "not enough yet"));
        b.appendChild(pr); b.appendChild(el("span", "lgc", g[1] === "sold" ? g[5] + " sold" : g[1] === "asking" ? "asking · " + g[6] + " listed" : g[1] === "few" && g[2] > 0 ? (g[5] ? "only 1 sold" : "asking · only 1 listed") : (g[5] + g[6]) + " seen"));
        row.appendChild(b);
      });
      box.appendChild(row);
    });
    return box;
  }
  function renderItem0() {
    nameBar(null);
    if (state.sel) loadBase(state.sel);
    var ip = $("ip"); ip.textContent = ""; $("wiki").textContent = "";
    if (D && D.preview) {
      var pi = state.sel && D.byName[state.sel];
      if (!pi) { ip.appendChild(el("p", "note", MEMBER === false ? "Pick an item to see its price." : "Loading the latest prices…")); return; }
      var ph = el("div", "ih"); ph.appendChild(iconBox(pi.item)); var pt = el("div"); pt.appendChild(el("h3", null, showName(pi.item)));
      if (MEMBER !== false) { pt.appendChild(el("p", null, "Loading the latest prices…")); ph.appendChild(pt); ip.appendChild(ph); return; }
      pt.appendChild(el("p", null, (pi.cat || "") + (pi.salesN ? " · " + pi.salesN + " sales" : ""))); ph.appendChild(pt); ip.appendChild(ph);
      // signed out: the price, the range and the move are open to everyone; listings and deals are for members
      if (pi.lad && pi.lad.length) ip.appendChild(ladderStatic(pi.lad));
      else ip.appendChild(el("p", "pvbig", M(pi.typ)));
      if (pi.hi > pi.lo && short(pi.lo) !== short(pi.hi)) ip.appendChild(el("p", "note", "Typical price. Recent sales ran " + short(pi.lo) + " to " + M(pi.hi) + "."));
      var mv = pi.mv && pi.mv[0]; if (typeof mv === "number" && Math.abs(mv) >= 0.01) ip.appendChild(el("p", "note", (mv > 0 ? "Up " : "Down ") + Math.round(Math.abs(mv) * 100) + "% in the last 24 hours"));
      var gate = el("a", "gate"); gate.href = ACCT + "/login?back=home"; gate.appendChild(el("b", null, "Live listings for this item")); gate.appendChild(el("span", null, "Sellers, prices, rolls and recent sales. A Mega Deals perk.")); gate.appendChild(el("i", null, "Sign in with Discord")); ip.appendChild(gate);
      return;
    }
    var i = state.sel && D.byName[state.sel];
    if (i && !(i.typ > 0) && !i.asks.length && !i.sales.length) i = null;   // nothing priced yet: the "no price yet" card, not a 0
    if (!i && state.sel && dbRow(state.sel)) {
      var nr = dbRow(state.sel), nh = el("div", "ih"); nh.appendChild(iconBox(nr[0])); var nt = el("div"); nt.appendChild(el("h3", null, nr[0]));
      nt.appendChild(el("p", null, nr[4] ? "Cash item" : (nr[2] ? "Level " + nr[2] : "")));
      if (/^Equip/.test(DBK[nr[5]] || "") && !nr[4]) { var nbt = baseText(nr[0]); if (nbt) { var nbl = el("p", "baseln"); nbl.appendChild(el("b", null, "Base ")); nbl.appendChild(document.createTextNode(nbt.t)); nt.appendChild(nbl); } }
      var nv = vendor(nr[0]); if (nv) { var nvl = el("p", "vend"); nvl.appendChild(document.createTextNode("Vendor price ")); nvl.appendChild(money(nv)); nvl.appendChild(document.createTextNode(" each")); nt.appendChild(nvl); }
      nh.appendChild(nt); ip.appendChild(nh);
      ip.appendChild(el("p", "note nosale", "No sales yet. Try Last 30 days in Filters, or open a shop that sells it with FM Watcher running."));
      return;
    }
    if (!i) { ip.appendChild(el("p", "note", "Pick an item to see its price, recent sales and where to buy it.")); return; }
    $("wiki").appendChild(shareBox(i));
    var hd = el("div", "ih"); hd.appendChild(iconBox(i.item)); var ht = el("div"); ht.appendChild(el("h3", null, showName(i.item)));
    ht.appendChild(el("p", null, fmt(i.asksN != null ? i.asksN : i.asks.length) + " listings · " + fmt(i.salesN) + " sales"));
    var ll = levelLine(i); if (ll) ht.appendChild(el("p", null, ll));
    if (i.equip) { var bt = baseText(i.item); if (bt) { var bl = el("p", "baseln"); bl.appendChild(el("b", null, "Base ")); bl.appendChild(document.createTextNode(bt.t)); bl.title = "The stats this item comes with, before any roll. From the item database" + (bt.from === "hovers" ? "; attack from hovers in the game where the data leaves it out (a ? means only one hover so far)" : "") + "."; ht.appendChild(bl); } }
    var vp = vendor(i.item), nxp = nxOf(i.item);
    if (nxp) { var nl = el("p", "vend"); nl.title = "What this costs in the Cash Shop, and what a thousand NX comes to in mesos at this item's typical sale."; nl.appendChild(document.createTextNode("Cash Shop " + fmt(nxp) + " NX")); if (i.typ) { var per = i.typ / nxp, rate = nxRate(); nl.appendChild(el("span", null, " · " + M(Math.round(per * 1000)) + " per 1,000 NX")); if (rate && Math.abs(per / rate - 1) >= 0.15) nl.appendChild(el("span", "tg " + (per > rate ? "ok" : "ask"), (per > rate ? "above" : "below") + " the board rate of " + M(Math.round(rate * 1000)))); } ht.appendChild(nl); }
    if (vp) { var vl = el("p", "vend"); vl.title = "What an NPC shop pays you for one. Don't list it for less than this."; vl.appendChild(document.createTextNode("Vendor price ")); vl.appendChild(money(vp)); vl.appendChild(document.createTextNode(" each")); if (i.typ && i.typ < vp * 1.1) vl.appendChild(el("span", "tg deal", "Sell to NPC")); else if (i.typ && vp >= 100) { var mult = i.typ / vp; vl.appendChild(el("span", "tg ok", mult >= 2 ? "FM pays " + (mult >= 10 ? Math.round(mult) : Math.round(mult * 10) / 10) + "× more" : "FM pays " + Math.round((mult - 1) * 100) + "% more")); vl.title += " The Free Market typical is " + fmt(i.typ) + ", so listing it beats the NPC."; } ht.appendChild(vl); }
    hd.appendChild(ht); ip.appendChild(hd);
    // equips: the price ladder replaces the one blended price, its 24h move and its sale boxes
    // every equip gets the price ladder, even before any grade has 2 copies (then it says so and gives the overall price)
    var LD = i.equip ? ladderOf(i) : null;
    if (LD) { ip.appendChild(ladderBox(i, LD)); nameBar(i); }
    var big = el("div", "big");
    if (i.hi > i.lo) { big.appendChild(el("span", "num", short(i.lo))); big.appendChild(el("span", "dash", "–")); var hiS = money(i.hi); big.appendChild(hiS); }
    else big.appendChild(money(i.typ));
    if (i.mv[0] != null) { var r = Math.round(i.mv[0] * 100); big.appendChild(el("span", "chg " + (r > 0 ? "up" : r < 0 ? "down" : "flat"), (r > 0 ? "↗ " : r < 0 ? "↘ " : "") + Math.abs(r) + "% in 24h")); }
    if (!LD) { ip.appendChild(big); nameBar(i); }
    else if (LD.top) {
      // equips: the busiest grade's price up top beside the item, the same as the grade buttons show
      var eb = el("div", "big"); if (short(LD.top.lo) !== short(LD.top.hi)) { eb.appendChild(el("span", "num", short(LD.top.lo))); eb.appendChild(el("span", "dash", "–")); eb.appendChild(money(LD.top.hi)); } else eb.appendChild(money(LD.top.lo));
      ip.appendChild(eb);
      eb.appendChild(el("span", "tg roll etg", LD.top.name.toLowerCase()));      // which grade this price is for
    }
    var why = { "24h": "sales in the last 24 hours", "3d": "the last " + i.typN + " sales in 3 days", "old": "the last " + i.typN + " sales, some older than 3 days", "asknow": "today's asking prices, since they sit well above older sales", "ask": "asking prices, not enough sales yet", "rolls": "listings with an average roll (within 1 of average)", "asks": "the third-cheapest ask up now, since the cheapest asks sit under the recent sales", "clean": "the last " + i.typN + " sales of plain copies: average roll, no scrolls used" }[i.basis] || "recent sales";
    var SHORTWHY = { "24h": "24h sales", "3d": "3 days of sales", "old": "older sales", "asknow": "today's asks", "ask": "asking prices", "rolls": "average rolls", "asks": "asking prices" };
    var full = "Typical " + fmt(i.typ) + " from " + why + (i.typOff ? ", " + i.typOff + " scrolled or rolled " + (i.typOff === 1 ? "copy" : "copies") + " left out" : "") + "." + (i.equip ? " Equips are priced by roll, each against its own sales." : "");
    // the typical price once: when the big number already is the typical, this line only says where it comes from
    var tnote = el("p", "tline"), oneNum = !(i.hi > i.lo);
    if (!oneNum) { tnote.appendChild(el("span", null, "Typical ")); tnote.appendChild(el("b", "mz", short(i.typ))); }
    tnote.appendChild(el("span", "tsep", (oneNum ? "from " : " · ") + (SHORTWHY[i.basis] || "recent sales")));
    var cb1 = confBadge(i, false); if (cb1) tnote.appendChild(cb1);
    tnote.appendChild(infoTip(full));
    if (!LD) ip.appendChild(tnote);
    var st = el("div", "stats");
    [(i.lastSale && short(i.lastSale.u) !== short(i.typ)) ? [i.lastSale.u, "Last sale"] : null, (i.last3 && i.lastSale && short(i.last3) !== short(i.lastSale.u)) ? [i.last3, "Last 3 avg"] : null].filter(Boolean).forEach(function (x) { var d = el("div", "stat"); if (x[0] == null) d.appendChild(el("span", "num", fmt(x[2]))); else if (x[0]) d.appendChild(money(x[0])); else d.appendChild(el("span", "num", "None")); d.appendChild(el("small", null, x[1])); st.appendChild(d); });
    if (!LD && st.childNodes.length) ip.appendChild(st);
    if (i.equip && !LD && (i.bands || i.rolls.length)) ip.appendChild(rollBox(i));   // equips with grades: Price by grade covers it
    var smx = scrollMath(i.item); if (smx) ip.appendChild(smx);
    var lt = el("div", "ltabs");
    // Where to buy shows only what can still be bought: gone and sold listings drop off (one you marked sold yourself
    // stays, struck through, until enough players agree)
    var seenS = {}, buyRows = i.buy.filter(function (x) { if (x.st === "gone" || (x.st === "sold" && x.sold >= GONE.need)) return false; if (x.st === "sold" && !((MYSOLD[soldKey(x)] || 0) > x.t)) return false; if (seenS[x.s]) return false; seenS[x.s] = 1; return true; });
    var bb = el("button"); bb.type = "button"; bb.appendChild(document.createTextNode("Where to buy")); bb.appendChild(el("em", null, buyRows.length)); bb.setAttribute("aria-selected", state.list === "buy");
    var rb = el("button"); rb.type = "button"; rb.appendChild(document.createTextNode("Recent sales")); rb.setAttribute("aria-selected", state.list === "sales");
    bb.addEventListener("click", function () { state.list = "buy"; BUYSORT = "price"; renderItem(); }); rb.addEventListener("click", function () { state.list = "sales"; renderItem(); });
    lt.appendChild(bb); lt.appendChild(rb); ip.appendChild(lt);
    if (state.list === "buy") {
      // sort the sellers by cheapest first or most recently seen first; the choice is remembered
      var bs = el("div", "seg bsort"); bs.appendChild(el("span", "bsl", "Sort"));
      [["price", "Cheapest"], ["recent", "Most recent"]].forEach(function (x) { var b = el("button", null, x[1]); b.type = "button"; b.setAttribute("aria-pressed", BUYSORT === x[0]); b.addEventListener("click", function () { BUYSORT = x[0]; renderItem(); }); bs.appendChild(b); });
      ip.appendChild(bs);
      if (BUYSORT === "recent") buyRows = buyRows.slice().sort(function (a, b) { return b.t - a.t || a.u - b.u; });
      buyRows = buyRows.map(function (x, k) { return [listRank(x), k, x]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).map(function (z) { return z[2]; });
    }
    var ls = el("div", "list"), rows = state.list === "buy" ? buyRows : i.sales.slice().sort(function (a, b) { return b.t - a.t; });   // Recent sales: always newest first
    rows.slice(0, 40).forEach(function (x) {
      var li = el("div", "li" + (state.list === "buy" && (x.st === "gone" || x.st === "sold") ? " gone" : state.list === "buy" && x.st === "old" ? " stale" : ""));
      var nb = el("b", null, x.s); li.appendChild(nb);
      var p = el("div", "p"); p.appendChild(money(x.u)); if (x.n > 1 || x.q > 1) p.appendChild(el("small", null, x.n > 1 ? "set of " + fmt(x.n) : x.q + " for " + M(x.p) + " · each")); li.appendChild(p);
      var sm = el("small"); li.appendChild(sm);
      if (state.list === "buy") { buyWhere(x).split(", ").forEach(function (part, k) { if (k) sm.appendChild(document.createTextNode(", ")); sm.appendChild(/not (seen|read)/.test(part) ? el("span", "unk", part) : el("b", "wh", part)); }); sm.appendChild(document.createTextNode(" · " + ago(x.t))); }
      else { var w = where(x); if (w) { sm.appendChild(el("b", "wh", w)); sm.appendChild(document.createTextNode(" · ")); } sm.appendChild(document.createTextNode(ago(x.t))); }
      // seen on a stream: a small TV that opens the broadcast at that moment; the streamer's name is on hover
      if (x.stream) { var tv = streamLink(x); tv.textContent = "📺"; tv.classList.add("tv"); tv.title = "Seen on " + x.who + "'s stream. " + tv.title; tv.setAttribute("aria-label", tv.title); sm.appendChild(document.createTextNode(" ")); sm.appendChild(tv); }
      if (x.spot) li.appendChild(el("span", "stt gone", "Spot holder"));
      if (state.list === "buy") {
        var mine = (MYSOLD[soldKey(x)] || 0) > x.t;
        var sttx = x.st === "sold" ? (mine && x.sold < GONE.need ? "You marked this sold" : "Marked sold by " + x.sold + (x.sold === 1 ? " player" : " players")) : x.st === "gone" ? "Not seen on the shop's later visit" : (x.st === "up" ? "Likely still up" : "") + (x.sold ? (x.st === "up" ? " · " : "") + x.sold + " said sold" : "");
        if (sttx) li.appendChild(el("span", "stt " + (x.st === "sold" ? "gone" : x.st), sttx));
        if (x.st !== "gone" && !x.chat) li.appendChild(soldBtn(x, mine));
      }
      tipAttach(li, x, i.item);   // hover (or tap) for the item as the game shows it
      if (LD) { var gx = gradeOf(i, x); if (gx) nb.appendChild(gradeTag(LD, gx)); }
      if (x.x) { var chip = statChip(i.item, x.x, x.xj); if (chip) nb.appendChild(chip); li.classList.add("hasx"); var ksx = keyStat(i.item, x.x, x.xj); if (ksx && x.x[ksx] != null) li.dataset.sv = String(x.x[ksx]); }
      var rr = i.rolls && i.rolls.filter(function (r) { return r.l === x; })[0]; if (rr) li.dataset.g = String(rr.g);
      else if (i.equip && !(x.x && x.x._tip) && !x.pricey && !(x.x && statChip(i.item, x.x, x.xj))) nb.appendChild(el("span", "tg unread", "stats not read"));
      else if (x.pricey) { var pt = el("span", "tg roll", "scrolled? hover it"); pt.title = "Far above the usual price for this item. Could be a good roll or a scroll job, or a spot holder. Hover it in game to read its stats."; nb.appendChild(pt); }
      ls.appendChild(li);
    });
    if (!rows.length) { var e0 = el("div", "li"); e0.appendChild(el("small", null, state.list === "buy" ? "None up right now. Its price still counts trade chat and streams." : "No sales seen yet.")); ls.appendChild(e0); }
    ip.appendChild(ls);
    // our extras: watch, sell, positions, moves, offers, base stats, price by roll
    var btns = el("div", "panelbtns");
    var stb = el("button", "pbtn", WATCH[i.item] ? "★ Watching" : "☆ Watch"); stb.type = "button"; stb.setAttribute("aria-pressed", !!WATCH[i.item]);
    stb.addEventListener("click", function () { if (WATCH[i.item]) delete WATCH[i.item]; else WATCH[i.item] = { t: Date.now() }; saveLS("fm-watch", WATCH); render(); }); btns.appendChild(stb);
    var as = el("button", "pbtn", SELL.some(function (s) { return s.i === i.item; }) ? "In sell list ✓" : "+ Sell list"); as.type = "button";
    as.addEventListener("click", function () { addSell(i.item, 1); render(); }); btns.appendChild(as);
    if (i.equip) { var ab = el("button", "pbtn", "🔔 Stat alert"); ab.type = "button"; ab.title = "Get a Discord DM when this item is read with the stats you want (Mega Deals)"; ab.addEventListener("click", function () { alertDlg(i.item); }); btns.appendChild(ab); }
    var pb = el("button", "pbtn", "+ Log a trade"); pb.type = "button"; pb.title = "Log that you bought or sold this, to track your profit in My positions";
    pb.addEventListener("click", function () { state.tab = "pos"; render(); pform("buy", i.item, 1, 0); $("pos-view").scrollIntoView({ behavior: "smooth", block: "start" }); }); btns.appendChild(pb);
    ip.appendChild(btns);
    var mvs = el("div", "mvs"); [["3 days", 1], ["7 days", 2]].forEach(function (x) { if (i.mv[x[1]] == null) return; var s = el("span"); s.appendChild(el("span", "lbl", x[0] + " ")); s.appendChild(moveTag(i.mv[x[1]])); mvs.appendChild(s); });
    if (!LD && mvs.childNodes.length) ip.appendChild(mvs);
    if (i.bid) { var bd = el("div", "bids"); bd.appendChild(document.createTextNode("Buyers in chat: top offer ")); bd.appendChild(money(i.bid)); bd.appendChild(document.createTextNode(" from " + i.bids.length + (i.bids.length === 1 ? " offer" : " offers"))); ip.appendChild(bd); }
    // listings with stats actually read (a trade chat "clean" tag alone has none)
    var withX = i.all.filter(function (x) { return x.x && !x.b && Object.keys(x.x).some(function (k) { return /^[A-Z]+$/.test(k) && k !== "SLOTS"; }); });
    if (withX.length && !(i.equip && (i.bands || i.rolls.length))) {   // equips have Price by roll above, which covers this
      var ksN = {}; withX.forEach(function (x) { var k = keyStat(i.item, x.x, x.xj); if (k) ksN[k] = (ksN[k] || 0) + 1; });
      var ks = Object.keys(ksN).sort(function (a, b) { return ksN[b] - ksN[a]; })[0] || keyStat(i.item, withX[0].x, withX[0].xj);
      // the first hover can be a clean pair: gloves and other armour that gain attack from scrolls are grouped by
      // attack as soon as any listing shows some, and the clean ones count as attack 0
      var attX = withX.filter(function (x) { return x.x.ATT != null || x.x.MATT != null; })[0];
      if (attX && ks !== "ATT" && ks !== "MATT" && ks !== "SUCCESS") ks = attX.x.MATT != null && attX.x.ATT == null ? "MATT" : "ATT";
      var noBaseAtt = (ks === "ATT" || ks === "MATT") && category(i.item) !== "Weapons" && !(fullBase(i.item).s || {})[ks];
      var groups = {};
      withX.forEach(function (x) { var v = x.x[ks]; if (v == null && noBaseAtt && x.x.SLOTS != null) v = 0; if (v == null) return; var bv = baseOf(i.item, x.x, ks); if (ks !== "SUCCESS" && (v < 0 || (bv != null ? v > bv * 2 + 40 : v > 250))) return; (groups[v] || (groups[v] = [])).push(x); });   // a roll twice the base is a misread, not a scroll job
      var vals = Object.keys(groups).map(Number).sort(function (a, b) { return b - a; });
      if (vals.length) {
        var sec = el("div", "subw pbs"); var h5 = el("h4"); h5.appendChild(document.createTextNode("Price by " + (ks === "SUCCESS" ? "success rate" : ks))); h5.appendChild(infoTip("Read from hovered tooltips. Weapons group by attack, other equips by the stat buyers pay for on that slot. Defense only counts on shields. Click a row to jump to the newest one.")); sec.appendChild(h5);
        var tb = el("table"); var hr = el("tr"); ["Roll", "Seen", "Sold at", "Asking", "Cheapest"].forEach(function (h) { hr.appendChild(el("th", null, h)); }); tb.appendChild(hr);
        vals.forEach(function (v) {
          var g = groups[v], sold = g.filter(function (x) { return x.so; }).map(function (x) { return x.u; }), ask = g.filter(function (x) { return !x.so; }).map(function (x) { return x.u; });
          var tr = el("tr"); var c0 = el("td"); c0.appendChild(el("b", null, ks === "SUCCESS" ? v + "%" : ks + " " + v));
          var bv0 = baseOf(i.item, g[0].x, ks);
          if (bv0 != null && ks !== "SUCCESS") { var d = v - bv0; c0.appendChild(el("em", d > 0 ? "up" : d < 0 ? "down" : "", d === 0 ? " base" : " " + (d > 0 ? "+" : "") + d)); }
          tr.appendChild(c0); tr.appendChild(el("td", null, g.length));
          [sold.length ? median(sold) : 0, ask.length ? median(ask) : 0, ask.length ? Math.min.apply(null, ask) : 0].forEach(function (n) { var td = el("td"); if (n) td.appendChild(money(n)); tr.appendChild(td); });
          var newest = g.slice().sort(function (a, b) { return b.t - a.t; })[0];
          tr.className = "jump"; tr.title = "Click: jump to the newest one seen with this roll" + (newest && where(newest) ? " (" + where(newest) + ")" : "");
          tr.addEventListener("click", function () { jumpToStat(i, v, newest, ks); });
          tb.appendChild(tr);
        });
        sec.appendChild(tb); ip.appendChild(sec);
      }
    }
  }

  // ---------- activity panel
  // one small card about earning: after a third search or on a second visit, once, and never again after it's closed
  var NUDGE = { s: 0, v: 0, off: 0 };
  try { NUDGE = Object.assign(NUDGE, JSON.parse(localStorage.getItem("fm-nudge") || "{}")); if (!sessionStorage.getItem("fm-visit")) { sessionStorage.setItem("fm-visit", "1"); NUDGE.v++; localStorage.setItem("fm-nudge", JSON.stringify(NUDGE)); } } catch (e) {}
  function earnNudge(searched) {
    if (searched) { NUDGE.s++; try { localStorage.setItem("fm-nudge", JSON.stringify(NUDGE)); } catch (e) {} }
    if (NUDGE.off || $("nudge") || (NUDGE.s < 3 && NUDGE.v < 2)) return;
    if (ME_ACCT && ME_ACCT.watchers && ME_ACCT.watchers.length) return;   // already scanning
    var c = el("div", "nudge"); c.id = "nudge"; c.setAttribute("role", "note");
    var x = el("button", "nx", "×"); x.type = "button"; x.setAttribute("aria-label", "Close");
    x.addEventListener("click", function () { NUDGE.off = 1; try { localStorage.setItem("fm-nudge", JSON.stringify(NUDGE)); } catch (e) {} c.remove(); });
    var t = el("div"); t.appendChild(el("b", null, "Get paid for the shops you already browse"));
    t.appendChild(el("span", null, "Up to $50 a week, paid on PayPal. Free, Windows, never touches your game."));
    var a = el("a", "ngo", "Earn by scanning"); a.href = "contribute.html";
    a.addEventListener("click", function () { NUDGE.off = 1; try { localStorage.setItem("fm-nudge", JSON.stringify(NUDGE)); } catch (e) {} });
    c.appendChild(t); c.appendChild(a); c.appendChild(x); document.body.appendChild(c);
  }
  setTimeout(function () { earnNudge(0); }, 8000);
  // under the card: the item's full page (price history, quests, drops) and, quietly, where the price came from
  var ITEMPAGES = {};
  function itemSlug(n) { return String(showName(n)).toLowerCase().replace(/%/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
  // the player market: one small list for the whole board, fetched when an item is first opened
  var MKT = { at: 0, L: null, p: null };
  function mktLoad() {
    if (MKT.L && Date.now() - MKT.at < 60000) return Promise.resolve(MKT.L);
    if (MKT.p) return MKT.p;
    MKT.p = fetch("https://api.maplefm.gg/market").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { MKT.p = null; MKT.at = Date.now(); MKT.L = j && j.listings || []; return MKT.L; })
      .catch(function () { MKT.p = null; return MKT.L || []; });
    return MKT.p;
  }
  var MOBS = null, MOBS_P = null;
  function mobsLoad() { if (MOBS) return Promise.resolve(MOBS); if (!MOBS_P) MOBS_P = fetch("/data/mobs.json?d=" + new Date().toISOString().slice(0, 10)).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (j) { MOBS = j || {}; return MOBS; }); return MOBS_P; }
  function dropsBox(n, ip) {
    var g = guideFor(n); if (!g || !g.d || !g.d.length) return;
    mobsLoad().then(function (M) {
      if (state.sel !== n || !ip.isConnected || ip.querySelector(".drops")) return;
      // the regular drops first (best rate first), quest-only drops after
      var list = g.d.slice().sort(function (a, b) { return (a[5] || 0) - (b[5] || 0) || (b[2] || 0) - (a[2] || 0) || (a[1] || 0) - (b[1] || 0); });
      var box = el("div", "drops"), h = el("div", "dh"); h.appendChild(el("b", null, "Dropped by")); h.appendChild(el("span", null, list.length === 1 ? "where to farm it" : list.length + " monsters · where to farm it")); box.appendChild(h);
      var row = el("div", "dmobs");
      list.slice(0, 8).forEach(function (d) {
        var m = M[d[0]], a = el(m ? "a" : "div", "dmob");
        if (m) { a.href = "/monster/" + m[2] + "/"; a.title = d[0] + " · see its drops, stats and maps"; }
        var pic = el("span", "dpic");
        if (m && m[0]) { var im = new Image(); im.alt = ""; im.loading = "lazy"; im.src = LIVE + "data/sprite/" + m[0] + ".gif"; im.onerror = function () { im.remove(); }; pic.appendChild(im); }
        a.appendChild(pic);
        var t = el("span", "dtx"); t.appendChild(el("b", null, d[0]));
        var lv = d[1] || (m && m[1]) || 0, where = (m && m[3]) || d[4] || "";
        t.appendChild(el("small", null, [lv ? "Lv " + lv : "", d[2] != null ? d[2] + "%" : "", d[5] ? "on the quest" : "", where].filter(Boolean).join(" · ")));
        a.appendChild(t); row.appendChild(a);
      });
      box.appendChild(row);
      if (list.length > 8) { var more = el("a", "dmore", "+" + (list.length - 8) + " more monsters"); more.href = ITEMPAGES[n] && idOf(n) ? "/item/" + itemSlug(n) + "/" : "/monsters/"; box.appendChild(more); }
      var gd = ip.querySelector(".gdrops");
      if (gd) { gd.style.minHeight = ""; gd.appendChild(box); return; }
      var mk = ip.querySelector(".mkt"); ip.insertBefore(box, mk ? mk.nextSibling : (ip.children[1] || null));
    });
  }
  // Report a wrong price: the item, what the card showed and an optional note go to our review inbox. No sign-in;
  // 10 a day from one browser (the Worker holds the same limit per visitor).
  function wrongLink(n, ip) {
    var a = el("button", "wrongl", "Report a wrong price"); a.type = "button";
    a.addEventListener("click", function () {
      if (ip.querySelector(".wrongf")) return;
      var i = D ? D.list.filter(function (x) { return x.item === n; })[0] : null;
      var day = new Date().toISOString().slice(0, 10), used = loadLS("fm-wrong", {});
      var box = el("div", "wrongf"); box.setAttribute("role", "group"); box.setAttribute("aria-label", "Report a wrong price");
      box.appendChild(el("b", null, "What looks wrong?"));
      var ta = document.createElement("textarea"); ta.maxLength = 300; ta.rows = 2; ta.placeholder = "Optional: what you think it sells for, or what's off"; box.appendChild(ta);
      var row = el("div", "wrongb"), go = el("button", "pbtn", "Send"), no = el("button", "pbtn", "Cancel"); go.type = no.type = "button";
      var msg = el("small", "wrongm"); row.appendChild(go); row.appendChild(no); row.appendChild(msg); box.appendChild(row);
      no.addEventListener("click", function () { box.remove(); });
      go.addEventListener("click", function () {
        if ((used[day] || 0) >= 10) { msg.textContent = "That's 10 reports today from this browser. Thanks, try again tomorrow."; return; }
        go.disabled = true; msg.textContent = "Sending…";
        var body = { i: n, typ: i ? Math.round(i.typ || 0) : 0, best: i ? Math.round(i.best || 0) : 0, last3: i ? Math.round(i.last3 || 0) : 0, ls: i && i.lastSale ? Math.round(i.lastSale.u || 0) : 0, note: ta.value.slice(0, 300) };
        fetch("https://api.maplefm.gg/wrongprice", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body) }).then(function (r) {
          if (r.status === 429) { msg.textContent = "That's 10 reports today. Thanks, try again tomorrow."; return; }
          if (!r.ok) throw 0;
          used = {}; used[day] = (loadLS("fm-wrong", {})[day] || 0) + 1; saveLSRaw("fm-wrong", JSON.stringify(used));
          box.textContent = ""; box.appendChild(el("b", null, "Thanks, sent. We check every report."));
        }).catch(function () { go.disabled = false; msg.textContent = "Couldn't send. Try again in a minute."; });
      });
      var foot = ip.querySelector(".ifoot"); ip.insertBefore(box, foot); ta.focus();
    });
    return a;
  }
  var renderItemBody = renderItem0;
  renderItem0 = function () {
    renderItemBody();
    var n = state.sel, ip = $("ip"); if (!n || !ip || !ip.firstChild) return;
    var f = el("div", "ifoot");
    var fb = el("div", "ifbtns");
    var fbtn = function (href, ico, big, small, cls) { var x = el("a", "ifb" + (cls ? " " + cls : "")); x.href = href; x.appendChild(el("span", "ifi", ico)); var tx = el("span", "ift"); tx.appendChild(el("b", null, big)); tx.appendChild(el("small", null, small)); x.appendChild(tx); x.appendChild(el("span", "ifa", "→")); return x; };
    if (ITEMPAGES[n] && idOf(n)) fb.appendChild(fbtn("/item/" + itemSlug(n) + "/", "📈", "Full price history", "Charts, quests and drops"));
    fb.appendChild(fbtn("/market.html#new=" + encodeURIComponent(n), "🏷️", "Sell yours", "List it on maplefm.gg", "isell"));
    f.appendChild(fb);
    var e = el("p", "iearn");
    e.appendChild(wrongLink(n, ip)); f.appendChild(e);
    ip.appendChild(f);
    // members' own listings for this item: shown apart from the shop listings and never counted in the price
    mktLoad().then(function (L) {
      if (state.sel !== n || !ip.isConnected || ip.querySelector(".mkt")) return;
      var mine = L.filter(function (l) { return l.item === n; }).sort(function (a, b) { return (a.status === "pending") - (b.status === "pending") || a.price - b.price; });
      if (!mine.length) return;
      var box = el("div", "mkt"), h = el("div", "mkh"); h.appendChild(el("b", null, "Listed on maplefm.gg")); h.appendChild(el("span", null, mine.length + (mine.length === 1 ? " member listing" : " member listings") + " · not counted in the price"));
      box.appendChild(h);
      mine.slice(0, 5).forEach(function (l) {
        var r = el("a", "mkr"); r.href = "/market.html#l=" + l.id;
        r.appendChild(el("b", null, M(l.price) + (l.qty > 1 ? " ea" : "")));
        r.appendChild(el("span", "mkw", [l.stats, l.qty > 1 ? "x" + l.qty : "", l.ign || l.seller.name, l.status === "pending" ? "buyer on it" : ""].filter(Boolean).join(" · ")));
        r.appendChild(el("span", "mkv", "View listing →")); box.appendChild(r);
      });
      if (mine.length > 5) { var m = el("a", "mkr mkmore", "All " + mine.length + " listings →"); m.href = "/market.html#q=" + encodeURIComponent(showName(n)); box.appendChild(m); }
      ip.insertBefore(box, ip.children[1] || null);
    });
    // where to farm it: the monsters that drop it, with their picture, up near the price
    dropsBox(n, ip);
    // a roll asked for in the search: jump to its row in "Price by ATT", or say none has been seen
    if (PENDROLL && PENDROLL.n === n && (PENDROLL.k === "CLEAN" || ladItem())) PENDROLL = null;   // the price ladder picked the grade already
    if (PENDROLL && PENDROLL.n === n) {
      var want = PENDROLL.k + " " + PENDROLL.v, row = ip.querySelector('.rollbox .rc[data-k="' + PENDROLL.k + '"][data-abs="' + PENDROLL.v + '"]') || [].filter.call(ip.querySelectorAll(".pbs tr.jump"), function (tr) { return tr.firstChild && new RegExp("^" + want + "(\\D|$)").test(tr.firstChild.textContent); })[0];
      PENDROLL = null;
      if (row && row.classList.contains("rc")) { ROLLOPEN = {}; ROLLOPEN[n + "|" + row.dataset.k + "|" + row.dataset.g] = 1; var rb0 = ip.querySelector(".rollbox"); var nb0 = rollBox(D.byName[n]); rb0.replaceWith(nb0); setTimeout(function () { var o = nb0.querySelector(".rc.on"); if (o) o.scrollIntoView({ block: "center" }); }, 50); }
      else if (row) setTimeout(function () { row.scrollIntoView({ block: "center" }); row.click(); }, 50);
      else ROLLMISS = { n: n, want: want };
    }
    if (ROLLMISS && ROLLMISS.n === n) { var nn = el("p", "rollmiss", "No " + showName(n) + " with " + ROLLMISS.want + " seen yet. The rolls that have been seen are below."); ip.insertBefore(nn, ip.children[1] || null); }
    else ROLLMISS = null;
  };
  function renderActivity() {
    var box = $("act"); if ($("activity").hidden) return; box.textContent = "";
    var seg = $("aseg"); seg.textContent = "";
    [[7, "7D"], [30, "30D"]].forEach(function (x) { var b = el("button", null, x[1]); b.type = "button"; b.setAttribute("aria-pressed", state.actDays === x[0]); b.addEventListener("click", function () { state.actDays = x[0]; renderActivity(); }); seg.appendChild(b); });
    var now = Date.now(), S = D.sales.filter(function (l) { return now - l.t <= state.actDays * DAY; });
    if (!S.length) S = D.sales.slice();
    var mes = 0, units = 0, byH = {}, byD = {}, byI = {}, grid = {};
    S.forEach(function (l) { mes += l.p; units += l.q; var d = new Date(l.t), h = d.getHours(), wd = d.getDay(); byH[h] = (byH[h] || 0) + l.p; byD[wd] = (byD[wd] || 0) + l.p; byI[l.i] = (byI[l.i] || 0) + l.p; grid[wd + "|" + h] = (grid[wd + "|" + h] || 0) + l.p; });
    var spanD = S.length ? Math.max(1, (Math.max.apply(null, S.map(function (l) { return l.t; })) - Math.min.apply(null, S.map(function (l) { return l.t; }))) / DAY) : 1;
    var top = function (o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; })[0]; };
    var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ph = top(byH), bd = top(byD), ti = top(byI);
    var hr = function (h) { h = +h; return (h % 12 || 12) + (h < 12 ? "a" : "p"); };
    var kp = el("div", "kpis");
    [[M(mes), "Mesos traded"], [fmt(units), "Units sold"], [M(mes / spanD), "Mesos / day"], [ph != null ? hr(ph) : "–", "Peak hour"], [bd != null ? WD[bd] : "–", "Busiest day"], [ti || "–", "Top item"]].forEach(function (x) { var d = el("div", "stat"); var b = el("b", null, x[0]); b.title = plain(x[0]); d.appendChild(b); d.appendChild(el("small", null, x[1])); kp.appendChild(d); });
    box.appendChild(kp);
    function bars(title, note, keys, vals, lab, peak) {
      var w = el("div", "bars"); var h = el("h4"); h.appendChild(document.createTextNode(title)); w.appendChild(h);
      var mx = Math.max.apply(null, keys.map(function (k) { return vals[k] || 0; }).concat([1]));
      var g = el("div", "bg");
      keys.forEach(function (k) {
        var v = vals[k] || 0, c = el("div", "bc" + (String(k) === String(peak) ? " peak" : "")); var b = el("i"); b.style.height = Math.max(v ? 4 : 1, Math.round(100 * v / mx)) + "%"; c.appendChild(b);
        c.appendChild(el("span", null, lab(k))); c.title = lab(k, true) + ": " + fmt(v) + " mesos traded"; g.appendChild(c);
      });
      w.appendChild(g); w.appendChild(el("p", "note", note)); return w;
    }
    var hours = []; for (var h = 0; h < 24; h++) hours.push(h);
    var charts = el("div", "charts");
    charts.appendChild(bars("When the market trades, by hour", "Mesos traded per hour, your local time. Gold is the busiest.", hours, byH, function (k, full) { return full || k % 3 === 0 ? hr(k) : ""; }, ph));
    charts.appendChild(bars("By day of the week", "Mesos traded per day. Gold is the busiest.", [0, 1, 2, 3, 4, 5, 6], byD, function (k) { return WD[k]; }, bd));
    box.appendChild(charts);
    var rh = el("div", "acthead"); rh.appendChild(el("b", null, "Recent sales")); rh.appendChild(el("small", null, "item · who sold it · when")); rh.appendChild(el("small", "r", "price each")); box.appendChild(rh);
    var rows = el("div", "actrows");
    S.slice().sort(function (a, b) { return b.t - a.t; }).slice(0, 60).forEach(function (l) { var d = el("div"); var t = el("span"); t.appendChild(el("b", null, l.i)); t.appendChild(el("small", null, " " + l.s + " · " + ago(l.t))); d.appendChild(t); d.appendChild(money(l.p)); d.dataset.item = l.i; d.style.cursor = "pointer"; d.addEventListener("click", function () { pick(l.i); }); rows.appendChild(d); });
    box.appendChild(rows);
  }

  // ---------- alert
  var DSEEN = loadLS("fm-deal-seen", {}), seenDeals = null, armed = false, baseTitle = document.title, titleTimer = null;
  // Deal alerts are for club members only. Opening the site once with #vip=CODE turns them on for that
  // browser; the page only holds a hash of the code. It keeps them off other visitors' screens, it is not a lock.
  var MINPROF = loadLS("fm-min-profit", 50000), ALERTHOT = [];
  // ---------- anonymous feedback, sent to a Google Form that only the site owner can read. Nothing that identifies the sender is sent.
  // form: the form's /formResponse address; text, topic, ctx: the entry ids of its three questions.
  var FEEDBACK = { form: "https://docs.google.com/forms/d/e/1FAIpQLSfflhlu7sS4uYQPETjJictXyr9p4TXvA2pTwh2bcBNnHWX_pA/formResponse",
    text: "entry.1055486770", topic: "entry.378867292", ctx: "entry.1773285608" };
  function parseMesos(t) { var m = /^\s*([\d.,]+)\s*([kmb]?)\s*$/i.exec(String(t)); if (!m) return NaN; var v = parseFloat(m[1].replace(/,/g, "")); return Math.round(v * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()] || 1)); }
  // ---------- settings that follow your Discord sign-in
  // Signed in, the board's own settings (watchlist, positions, filters, theme, club key...) are kept with the
  // account, so a cleared browser or another PC gets them back. Nothing is sent when you are not signed in.
  var ACCT = "https://api.maplefm.gg", ME_ACCT = null, syncTimer = null;
  var SYNC_KEYS = ["fm-watch", "fm-watch-th", "fm-watch-seen", "fm-pos", "fm-trades", "fm-fee", "fm-pf-period", "fm-sell", "fm-sell-hide", "fm-min-profit", "fm-night", "fm-activity", "fm-fast-pct", "fm-sound", "fm-me", "fm-sell-src", "fm-buy-sort", "fm-tiers-seen", "fm-club", "fm-fb-tuck", "fm-ranks-open", "fm-gatherer", "fm-upd-hide", "fm-digest"];
  function syncBlob() { var o = {}; SYNC_KEYS.forEach(function (k) { try { var v = localStorage.getItem(k); if (v != null) o[k] = v; } catch (e) {} }); return o; }
  function syncPush() {
    if (!ME_ACCT) return;
    fetch(ACCT + "/me/settings", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: syncBlob() }) })
      .then(function (r) { return r.json(); }).then(function (r) { if (r.updated) saveLSRaw("fm-sync-at", String(r.updated)); }).catch(function () {});
  }
  function saveLSRaw(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  window.syncTouch = function (k) { if (!ME_ACCT || SYNC_KEYS.indexOf(k) < 0) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncPush, 2500); };
  function acctMenu() {
    var b = $("m-acct"); if (!b) return;
    b.textContent = ME_ACCT ? "Signed in as " + ME_ACCT.name + (ME_ACCT.club ? " · club member" : "") + " · settings saved" : "Sign in with Discord to keep your settings";
    var sp = $("signpill"); if (!sp) return;
    if (ME_ACCT) {
      sp.classList.add("in"); sp.href = "contribute.html#earn"; sp.title = "Signed in as " + ME_ACCT.name + ". Your settings are saved to this account. Opens your account page.";
      sp.textContent = ""; if (ME_ACCT.avatar) { var im = new Image(); im.src = ME_ACCT.avatar; im.alt = ""; sp.appendChild(im); }
      var tx = el("span", null, ME_ACCT.name); tx.id = "signtxt"; sp.appendChild(tx);
      // the Club role from the Discord shows next to the name, the same tag the ranks use
      if (ME_ACCT.club) { var ct = el("span", "clubtag", "Club"); ct.title = "Club role in the Club FM Discord"; sp.appendChild(ct); sp.title = "Signed in as " + ME_ACCT.name + " · Club member. Opens your account page."; }
    } else { sp.classList.remove("in"); }
  }
  function acctLoad() {
    fetch(ACCT + "/me", { credentials: "include" }).then(function (r) { return r.json(); }).then(function (m) {
      if (!m.signedIn) { ME_ACCT = null; acctMenu(); return; }
      ME_ACCT = m.account; acctMenu(); try { digestBtn(); } catch (e) {}
      if (ME_ACCT.club && !DEALS_ON) setClub(true);   // the Club role in the Discord unlocks club features, no key needed
      if ((ME_ACCT.watchers || []).length) { try { localStorage.setItem("fm-gatherer", "1"); } catch (e) {} }   // a linked watcher makes you a gatherer on every PC
      return fetch(ACCT + "/me/settings", { credentials: "include" }).then(function (r) { return r.json(); }).then(function (s) {
        var mine = Number(localStorage.getItem("fm-sync-at") || 0), theirs = Number(s.updated || 0);
        if (theirs > mine && s.settings && Object.keys(s.settings).length) {
          var changed = false;
          Object.keys(s.settings).forEach(function (k) { if (SYNC_KEYS.indexOf(k) >= 0 && localStorage.getItem(k) !== s.settings[k]) { saveLSRaw(k, s.settings[k]); changed = true; } });
          saveLSRaw("fm-sync-at", String(theirs));
          if (changed && !sessionStorage.getItem("fm-synced")) { sessionStorage.setItem("fm-synced", "1"); location.reload(); }
        } else if (Object.keys(syncBlob()).length) syncPush();
      });
    }).catch(function () {});
  }
  $("m-acct").addEventListener("click", function () {
    closeMenus();
    if (ME_ACCT) { fetch(ACCT + "/logout", { method: "POST", credentials: "include" }).then(function () { ME_ACCT = null; acctMenu(); }); }
    else location.href = ACCT + "/login?back=home";
  });
  if (/^#signed-in/.test(location.hash)) history.replaceState(null, "", location.pathname);
  acctLoad();

  // Club lock: deal alerts, the Best deals tab, Cheapest now and Where to buy are for club members.
  // A member unlocks once per browser with the club key: in the menu, or with a link ending #vip=KEY.
  var CLUB_HASH = "8cdec555c8dfc859afffa69776ae1736808738491fbd31cf1bce24f511d0c89b", DEALS_ON = false;
  function clubHash(k) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode("maplefm-club:" + k)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }); }
  function setClub(on) {
    DEALS_ON = on; document.body.classList.toggle("club", on);
    if (!ENGINE) { if (on) engineStart(); else engineStop(); }
    if (on && $("ubar").hidden) updateBar();
    if (on && state.wantDeals) { state.tab = "deals"; state.wantDeals = false; }
    if (!on && state.list === "buy") state.list = "sales";
    $("m-club").textContent = on ? "Club member · sign out" : "Club member sign in";
    if (D) { DIRTY = true; render(); }
  }
  function tryClub(k, quiet) {
    if (!k || !window.crypto || !crypto.subtle) return Promise.resolve(false);
    return clubHash(k).then(function (hex) {
      var ok = hex === CLUB_HASH;
      if (ok) { try { syncTouch("fm-club"); localStorage.setItem("fm-club", k); } catch (e) {} setClub(true); }
      return ok;
    });
  }
  (function () {
    var m = /[#&]vip=([A-Za-z0-9_-]+)/.exec(location.hash), k = m ? m[1] : "";
    if (m) try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    if (!k) try { k = localStorage.getItem("fm-club") || ""; } catch (e) {}
    // Prices and listings are open to everyone. Deals (Best deals, deal alerts, deals in the ticker) are for the Club and
    // Mega Deals roles only, unlocked by Discord sign-in or the club key.
    if (k) tryClub(k, true);
  })();
  function renderAlert() {
    if (!DEALS_ON) { $("alert").hidden = true; return; }
    // A deal is a listing from the last 10 minutes you can flip for real money:
    // 1. profit = (typical less 5%, so the relist sells) minus their price, times how many are in the row; at least MINPROF;
    // 2. and at least 20% under typical, so normal price swings on pricey items don't set it off;
    // 3. the item sold at least 3 times in the last 7 days, so it turns around fast;
    // 4. anything under its NPC price always counts (profit from selling to the store), from 1K up;
    // 5. more than 85% under typical is usually a misread or a spot holder: listed with a "check" tag, never pinged.
    var now = Date.now(), WIN = 10 * 6e4, WEEK = 7 * DAY;
    var hot = [], one = {};
    D.L.forEach(function (l) {
      if (l.so || l.b || l.spot || now - l.t > WIN || !l.tx) return;
      // a shop with several copies open is one listing in the alert, not one line per copy
      var ok1 = String(l.s).toLowerCase() + "|" + l.i + "|" + l.u + "|" + (l.q || 1); if (one[ok1]) return; one[ok1] = 1;
      var i = D.byName[l.i]; if (!i) return;
      var q = l.q || 1, vp = vendor(l.i), npcGain = vp > l.u ? (vp - l.u) * q : 0;
      var sold7 = i.sales.filter(function (x) { return now - x.t <= WEEK; }).length;
      var ref = i.typ, g = i.equip ? rollOf(l.i, l) : null;
      if (i.equip && g != null) {
        // a hovered equip is judged only against sales of the same roll with the same slots used, the same rule as
        // Mega Deals: a +1 crit Work Gloves with 4 of 5 slots left took a failed scroll and is worth far less than a
        // clean one. Slots not read, or no sales of that exact roll and slots yet: no deal.
        var su = slotsUsed(l.i, l), rt = su != null && i.rollTyp ? i.rollTyp[rollKey(l.i, l, su)] : null;
        if (!rt) return;
        ref = rt.typ;
      }
      var flip = ref && i.kind === "sale" ? (ref * (1 - FASTPCT / 100) - l.u) * q : 0;
      var off = ref ? 1 - l.u / ref : 0;
      var r = { l: l, typ: ref, off: off, profit: 0, why: "", check: false, roll: g };
      if (npcGain >= 1000 && npcGain >= flip) { r.profit = npcGain; r.why = "NPC buys at " + M(vp); }
      else if (i.typ && i.kind === "sale" && sold7 >= 3 && off >= 0.2 && flip >= MINPROF) {
        if (i.equip && g == null) r.lowFlip = i.bands ? (i.bands.lo * (1 - FASTPCT / 100) - l.u) * q : null;
        r.profit = flip; r.why = Math.round(off * 100) + "% under " + M(ref) + (i.equip ? (g == null ? " if average roll" : g === 0 ? " for an average roll" : " for a " + (g > 0 ? "+" : "") + g + " roll") : ""); r.check = off > 0.85 || (l.chat && off > 0.7) || i.check;
        // the going rate, not a deal: 3 or more other sellers in the last day ask within 25% of this price
        var near = {}; i.asks.forEach(function (x) { if (x !== l && now - x.t <= DAY && !x.chat && Math.abs(Math.log(x.u / l.u)) < Math.log(1.25)) near[String(x.s).toLowerCase()] = 1; });
        delete near[String(l.s).toLowerCase()];
        if (Object.keys(near).length >= 3) { r.check = true; r.note = "others ask the same"; }
      } else return;
      hot.push(r);
    });
    hot.sort(function (a, b) { return (a.check - b.check) || (b.profit - a.profit) || (b.l.t - a.l.t); });
    // A deal pings once: the same seller, item and price seen again later (a rescan, another watcher, a stream)
    // is the same listing, not a new deal. Remembered for a day in this browser, so a reload doesn't ping again either.
    var nowMs = Date.now(), keys = {};
    hot.forEach(function (r) { if (!r.check) keys[String(r.l.s).toLowerCase() + "|" + r.l.i + "|" + Math.round(r.l.u)] = 1; });
    Object.keys(DSEEN).forEach(function (k) { if (nowMs - DSEEN[k] > DAY) delete DSEEN[k]; });
    var fresh = Object.keys(keys).filter(function (k) { return !DSEEN[k]; });
    fresh.forEach(function (k) { DSEEN[k] = nowMs; }); if (fresh.length) saveLS("fm-deal-seen", DSEEN);
    if (!armed || !seenDeals) fresh = [];
    seenDeals = keys;
    $("alert").hidden = !hot.length;
    if (!hot.length) return;
    var good = hot.filter(function (r) { return !r.check; }).length; ALERTHOT = hot;
    rich($("alert-count"), good ? "💰 " + good + (good === 1 ? " flip" : " flips") + " ready · " + M(MINPROF) + "+ profit" : "👀 Too good to be true? Double check these");
    $("alert-count").title = "Listed in the last 10 minutes, biggest profit first. Profit assumes you relist " + FASTPCT + "% under typical.";
    var ul = $("alert-list"); ul.textContent = "";
    hot.slice(0, 8).forEach(function (r) {
      var l = r.l, li = el("span", "alert-row" + (r.check ? " chk" : "")); li.dataset.k = hot.indexOf(r);
      var pc = el("span", "pc"); pc.appendChild(el("b", "mz", "+" + short(r.profit))); pc.appendChild(el("span", null, " " + r.why));
      if (r.check) pc.appendChild(el("em", "chkt", r.note || "check: may be a misread"));
      else if (r.roll === null && r.lowFlip != null) {
        pc.appendChild(el("em", "chkt roll", r.lowFlip > 0 ? "roll unknown · +" + M(r.lowFlip) + " even if low" : "roll unknown · hover it before buying"));
      }
      var itx = el("span", "it", showName(l.i) + ((l.q || 1) > 1 ? " ×" + fmt(l.q) : "")); var sc = l.x ? statChip(l.i, l.x, l.xj) : null; if (sc) itx.appendChild(sc);
      li.appendChild(el("span", "n", ago(l.t))); li.appendChild(itx); li.appendChild(el("span", "pr", MF(l.u) + ((l.q || 1) > 1 ? " ea" : "")));
      li.appendChild(pc);
      var whs = el("span", "wh", [l.s, where(l)].filter(Boolean).join(", "));
      if (l.stream) { whs.appendChild(document.createTextNode(" · ")); whs.appendChild(streamLink(l)); }
      li.appendChild(whs);
      ul.appendChild(li);
    });
    if (hot.length > 8) ul.appendChild(el("span", "alert-row more", "+" + (hot.length - 8) + " more on the Best deals tab"));
    if (fresh.length) ping(fresh.length);
  }
  function ping(n) {
    $("alert-new").hidden = false;
    var a = $("alert"); a.classList.remove("fresh"); void a.offsetWidth; a.classList.add("fresh");
    clearInterval(titleTimer); var on = false, left = 20;
    titleTimer = setInterval(function () { on = !on; document.title = on ? "(" + n + ") New FM deal" : baseTitle; if (--left <= 0 && document.hasFocus()) { clearInterval(titleTimer); document.title = baseTitle; } }, 1000);
    if ($("sound").checked) beep();
  }

  // On a tall screen the item card grows down to the bottom of the window: the listings (or recent sales) list takes
  // the spare room instead of stopping at a fixed 330px with blank page below. Phones and narrow windows keep the sheet.
  (function () {
    var side = document.getElementById("side"); if (!side || !window.MutationObserver) return;
    var busy = false;
    function fit() {
      busy = false;
      var lists = side.querySelectorAll(".list, .actrows");
      if (window.innerWidth <= 1180) { lists.forEach(function (l) { l.style.maxHeight = ""; }); return; }
      lists.forEach(function (l) {
        if (!l.offsetParent) return;
        l.style.maxHeight = "";
        // the card sticks 72px from the top and may be up to the window height minus 84px: fill that
        var base = l.clientHeight, spare = window.innerHeight - 84 - side.scrollHeight;
        var grow = Math.max(0, Math.min(spare, l.scrollHeight - base));
        if (grow > 8) l.style.maxHeight = (base + grow) + "px";
      });
    }
    function soon() { if (!busy) { busy = true; requestAnimationFrame(fit); } }
    new MutationObserver(soon).observe(side, { childList: true, subtree: true });
    window.addEventListener("resize", soon);
    soon();
  })();
  function beep() {
    try {
      var C = window.AudioContext || window.webkitAudioContext, ctx = beep.ctx || (beep.ctx = new C());
      [0, .18].forEach(function (t) { var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(.2, ctx.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t + .15); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .16); });
    } catch (e) {}
  }

  // ---------- render
  var DIRTY = true, lastBuild = 0, PAGE = 80, keepRows = 0;
  // The table from the last visit is kept in this browser, so it shows the moment the page opens; the live
  // prices take over as soon as they arrive, and rows move to their new places.
  var SUMK = ["item", "baseName", "cat", "tier", "n", "kind", "check", "flags", "typ", "lo", "hi", "mv", "best", "deal", "daily", "salesN", "vol", "equip", "move", "basis", "typWho", "conf", "last3"];
  // Equips (every price) whose open listings mostly have no hover yet: the watcher tells scanners to rest the mouse on
  // these first. Item names only, never sellers or spots.
  function hoverWanted() {
    var by = {}, t = Date.now() - 7 * DAY;
    (D.active || []).forEach(function (l) {
      if (!l || !l.i || (l.t && l.t < t)) return;
      // every equip, cheap ones too: each graded price needs its copies hovered (the price ladder counts no others)
      var it = D.byName && D.byName[l.i]; if (!it || !it.equip || !(it.typ > 0)) return;
      var b = by[l.i] || (by[l.i] = { i: l.i, typ: it.typ, n: 0, x: 0 }); b.n++;
      // a read counts once it has the upgrades line, for any equip that comes with slots
      if (l.x && (l.x.SLOTS != null || (l.x._tip && !(dbBase(l.i) || {}).SLOTS))) b.x++;
    });
    return Object.keys(by).map(function (k) { return by[k]; }).filter(function (b) { return b.n >= 1 && b.x / b.n < 0.5; })
      .sort(function (a, b) { return b.typ * (b.n - b.x) - a.typ * (a.n - a.x); }).slice(0, 600)
      .map(function (b) { return { i: b.i, typ: b.typ, miss: b.n - b.x }; });
  }
  // the stat an item's roll prices are about, for the bots and item pages: "+1 Crit damage", "+6 LUK"
  function rollKeyName(i) {
    var c = {}, best = "", n = 0;
    (i.rolls || []).forEach(function (r) { var k = r.k; if (!k || k === "TOTAL") return; c[k] = (c[k] || 0) + 1; if (r.g && c[k] > n) { n = c[k]; best = k; } });
    best = best || keyStat(i.item, null, "");
    return best && best !== "SUCCESS" ? best : "";
  }
  function saveSummary() {
    if (!D || D.preview || !D.list.length) return;
    var rows = D.list.map(function (i) { var o = {}; SUMK.forEach(function (k) { if (i[k] !== undefined) o[k] = i[k]; }); if (i.bestL) { o.bestS = i.bestL.s; o.bestT = i.bestL.t; var bw = where(i.bestL); if (bw) o.bestW = bw; } if (i.equip) { var rkk = rollKeyName(i); if (rkk) o.rk = rkk; var LDs = ladderOf(i); if (LDs && LDs.top) o.lad = [LDs.pick].concat(LDs.stats.filter(function (k) { return k !== LDs.pick; })).map(function (k) { return [ladName(k), LDs.views[k].map(function (g) { return [g.name, g.basis, Math.round(g.lo || 0), Math.round(g.hi || 0), Math.round(g.mid || 0), g.use ? g.use.length : 0, g.asks.length, g === LDs.top ? 1 : 0]; })]; }); } if (i.rollTyp) { var rt = {}, rn = 0; Object.keys(i.rollTyp).forEach(function (g) { var rv = i.rollTyp[g], sp = g.indexOf("|"); if (rn++ < 60) rt[rv.g + "|" + g.slice(0, sp) + "|" + (rv.k || "") + "|" + g.slice(sp + 1)] = [Math.round(rv.typ), rv.n]; }); if (rn) o.rt = rt; }
      // rt: sold typical per "roll|slots used|stat|every stat that moved" ("1|0|CRIT|CRIT+1": a clean pair with +1 crit rate);
      // the cheapest open listing for each roll, from the last 2 days, per "roll|stat|moves|slots used": what the chat bot quotes for "7 att wg"
      if (i.rolls && i.rolls.length) { var ra = {}, cut = Date.now() - 2 * DAY; i.rolls.forEach(function (r) { var l = r.l; if (!l || l.so || !(l.u > 0) || (l.t && l.t < cut)) return; var ak = r.g + "|" + (r.k || "") + "|" + (r.combo || "") + "|" + (function (su) { return su == null ? "" : su; })(slotsUsed(i.item, l)); if (ra[ak] == null || l.u < ra[ak]) ra[ak] = l.u; }); if (Object.keys(ra).length) o.ra = ra; }
      if (i.rd && i.rd.length) o.rd = i.rd.slice(0, 5).map(function (d) { var c = {}; Object.keys(d).forEach(function (k) { if (k !== "l") c[k] = d[k]; }); return c; }); return o; });
    var who = (D.whoAll || []).map(function (w) { return { name: w.name, rank: w.rank, sales: w.sales, week: w.week, rows: w.rows, shopsN: w.shopsN, daysN: w.daysN, stream: w.stream, club: w.club }; });
    var big = D.sales.slice().sort(function (a, b) { return b.p - a.p; })[0];
    saveLS("fm-summary", { at: Date.now(), rows: rows, who: who, kpi: { big: big ? { i: big.i, p: big.p } : null, sales: D.sales.length, active: D.active.length, last: (Lstat() || {}).lastT || 0 }, hw: hoverWanted() });
  }
  // a saved board, from this browser's last visit or from the copy the server rebuilds every few minutes,
  // becomes the page at once; the raw scans then load behind it and take over
  function previewFrom(sm) {
    if (!sm || !sm.rows || Date.now() - sm.at > 3 * 864e5) return null;
    var byName = {};
    sm.rows.forEach(function (i) { i.mv = i.mv || [null, null, null]; i.daily = i.daily || []; i.flags = i.flags || []; if (i.bestS) i.bestL = { s: i.bestS, t: sm.at }; i.asks = []; i.sales = []; i.bids = []; i.all = []; i.rolls = []; byName[i.item] = i; });
    var who = (sm.who || []).map(function (w) { w.sales = w.sales || 0; w.week = w.week || 0; return w; });
    return { list: sm.rows, byName: byName, L: [], sales: [], active: [], latest: sm.at, who: who.slice(0, 10), whoAll: who, spotN: 0, preview: true, at: sm.at, kpi: sm.kpi || null };
  }
  function loadPreview() { return previewFrom(loadLS("fm-summary", null)); }
  function remotePreview() {
    var local = loadLS("fm-summary", null), lat = local && local.at || 0;
    return fetch(LIVE + "data/summary-public.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (sm) {
      if (sm && sm.rows) sm.rows.forEach(function (r) { if (r && r.item && r.typ && (r.n || 0) >= 5) ITEMPAGES[r.item] = 1; });
      mark("sumIn"); if (!sm || !sm.rows || sm.at <= lat) return;
      saveLS("fm-summary", sm);
      if (scans.length || (D && D.snap)) return;   // the real build (or the server's) already landed
      var pv = previewFrom(sm); if (!pv) return;
      D = pv; lastBuild = Date.now(); DIRTY = false; SIDX = null; render(); mark("pv");
    }).catch(function () {});
  }
  function hasRaw() { return scans.length > base.length; }
  function render(rebuild) {
    if (ENGINE) return;   // the engine only builds; the page draws
    if (rebuild === true || DIRTY || !D || Date.now() - lastBuild > 5 * 6e4) {
      if (!scans.length && !D) { var pv = loadPreview(); if (pv) { D = pv; lastBuild = Date.now(); DIRTY = false; } }
      if (D && D.snap && !hasRaw()) { DIRTY = false; lastBuild = Date.now(); }
      else if (!D || scans.length || !D.preview) { mark("buildA"); D = build(); mark("buildB"); SIDX = null; DIRTY = false; lastBuild = Date.now(); if (D.list.length) setTimeout(saveSummary, 1500); }
    }
    nxRate(); renderCards(); renderAlert(); renderWatchAlert();

    ["prices", "deals", "sell", "pos"].forEach(function (t) { $(t + "-view").hidden = state.tab !== t; $("tab-" + t).setAttribute("aria-selected", state.tab === t); });
    $("chips").parentNode.hidden = state.tab === "sell" || state.tab === "pos";
    if (state.tab === "prices") renderPrices(); else if (state.tab === "deals") renderDeals(); else if (state.tab === "sell") renderSell(); else renderPos();
    if (state.sel && !D.byName[state.sel]) { var c = canon(state.sel).n; if (D.byName[c]) state.sel = c; }
    renderItem(); livePill(); try { renderMaint(); } catch (e) {}
    // the parts below the fold or off to the side draw a moment later, when the page is idle, so the table and
    // the item card come up first and a click never waits on the rankings
    afterPaint();
  }
  var AFTER_P = 0;
  function afterPaint() {
    if (AFTER_P) return;
    var run = function () { AFTER_P = 0; if (!D) return; renderBoard(); renderTicker(); if (RANKS && armed) seenTiers(); if ($("ranks").open) renderRanks(); renderActivity(); renderDrawer(); };
    AFTER_P = window.requestIdleCallback ? requestIdleCallback(run, { timeout: 700 }) : setTimeout(run, 60);
  }
  function livePill() {
    if (!D) return;
    if (D.preview) { $("livepill").classList.add("stale"); $("livetxt").textContent = MEMBER === false ? "Prices updated " + ago(D.at) : "Loading"; return; }
    var lastT = (Lstat() || {}).lastT || 0;
    var stale = !lastT || Date.now() - lastT > 20 * 6e4;
    $("livepill").classList.toggle("stale", stale);
    $("livetxt").textContent = lastT ? "Updated " + ago(lastT).replace("just now", "just now") : "No scans yet";
    $("livepill").title = stale ? "No watcher has published in the last 20 minutes" : "A watcher is scanning now";
  }

  // ---------- events
  function closeMenus(e) {
    var m = $("menu"), f = $("fbox");
    if (!m.hidden && !(e && (m.contains(e.target) || $("menubtn").contains(e.target)))) { m.hidden = true; $("menubtn").setAttribute("aria-expanded", "false"); }
    if (!f.hidden && !(e && (f.contains(e.target) || $("fbtn").contains(e.target)))) { f.hidden = true; $("fbtn").setAttribute("aria-expanded", "false"); }
  }
  document.addEventListener("click", function (e) {
    var tr = e.target.closest && e.target.closest("tbody tr[data-item]"); if (tr && !e.target.closest("button")) pick(tr.dataset.item);
    closeMenus(e);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeMenus(); hideHov(); }
    if (e.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $("q").focus(); return; }
    var tr = e.target.closest && e.target.closest("tbody tr[data-item]"); if (tr && e.key === "Enter") pick(tr.dataset.item);
  });
  $("menubtn").addEventListener("click", function () { var m = $("menu"); m.hidden = !m.hidden; this.setAttribute("aria-expanded", String(!m.hidden)); });
  $("fbtn").addEventListener("click", function () {
    var f = $("fbox"); f.hidden = !f.hidden; this.setAttribute("aria-expanded", String(!f.hidden));
    if (!f.hidden) {      // fit on screen, above the recent sales bar, scrolling the page up a little when needed
      f.style.maxHeight = ""; var want = Math.min(f.scrollHeight, 560), top = f.getBoundingClientRect().top, need = top + want + 70 - window.innerHeight;
      if (need > 0) { window.scrollBy(0, Math.min(need, Math.max(0, top - 80))); top = f.getBoundingClientRect().top; }
      f.style.maxHeight = Math.max(200, Math.min(want, window.innerHeight - top - 70)) + "px";
    }
  });
  var qTimer = null;
  ["q", "win", "f-low", "f-sold", "f-bids", "f-cash", "f-spot", "cls", "lv-min", "lv-max"].forEach(function (id) {
    var go = function () { if (id === "win" || id === "f-spot") { if (engineLive()) enginePoke(true); DIRTY = true; render(); } else renderView(); };
    $(id).addEventListener("input", id === "q" ? function () { clearTimeout(qTimer); qTimer = setTimeout(go, 110); } : go);
    if (id !== "q") $(id).addEventListener("change", go);
  });
  $("wonly").addEventListener("click", function () { state.wonly = !state.wonly; this.setAttribute("aria-pressed", state.wonly); digestBtn(); renderView(); });
  // ---------- stat alerts (Mega Deals): set on an equip's card or from the watchlist, a Discord DM when a listing
  // with those stats is read. The Worker checks access on every save and every DM; this only draws the form.
  var ALERTS = null, ALERTS_OK = null, ALERT_MAX = 25, STATN2 = { ATT: "Attack", MATT: "Magic attack", STR: "STR", DEX: "DEX", INT: "INT", LUK: "LUK", HP: "HP", MP: "MP", WDEF: "Weapon def", MDEF: "Magic def", ACC: "Accuracy", AVOID: "Avoid", SPEED: "Speed", JUMP: "Jump", CRIT: "Crit rate", CRITDMG: "Crit damage" };
  function alertsLoad() {
    if (ALERTS) return Promise.resolve(ALERTS);
    return fetch(ACCT + "/me/alerts", { credentials: "include" }).then(function (r) { return r.json(); }).then(function (j) { ALERTS_OK = !!j.allowed; ALERT_MAX = j.max || 25; ALERTS = j.alerts || []; return ALERTS; }).catch(function () { ALERTS_OK = null; return []; });
  }
  function alertsSave(list) {
    return fetch(ACCT + "/me/alerts", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alerts: list }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Couldn't save"); ALERTS = j.alerts; return ALERTS; }); });
  }
  function alertText(a) {
    var p = a.stats.map(function (s) { return (s.rel ? "+" + s.min + " " : s.min + "+ ") + (STATN2[s.k] || s.k); });
    if (a.clean) p.push("clean"); else if (a.used != null) p.push("at most " + a.used + (a.used === 1 ? " slot" : " slots") + " used");
    return p.join(", ") + (a.max ? " · under " + M(a.max) : "");
  }
  function alertDlg(item) {
    var d = $("alertdlg"); if (!d) { d = document.createElement("dialog"); d.id = "alertdlg"; d.className = "alertdlg"; document.body.appendChild(d); }
    d.textContent = "";
    var hd = el("div", "adh"); hd.appendChild(el("b", null, item ? "Stat alert: " + showName(item) : "Your stat alerts"));
    var x = el("button", "nx", "×"); x.type = "button"; x.setAttribute("aria-label", "Close"); x.addEventListener("click", function () { d.close(); }); hd.appendChild(x); d.appendChild(hd);
    var body = el("div", "adb"); d.appendChild(body);
    if (!d.open) d.showModal();
    if (!ME_ACCT) {
      body.appendChild(el("p", null, "Get a Discord DM when an equip with the stats you want is read in a shop."));
      var si = el("a", "pbtn", "Sign in with Discord"); si.href = ACCT + "/login?back=home"; body.appendChild(si); return;
    }
    body.appendChild(el("p", "note", "Loading…"));
    alertsLoad().then(function (list) {
      body.textContent = "";
      if (ALERTS_OK === null) { body.appendChild(el("p", null, "Couldn't load your alerts. Try again in a minute.")); return; }
      if (!ALERTS_OK) {
        body.appendChild(el("p", null, "Stat alerts come with Mega Deals. Unlock them any of three ways:"));
        var ul = el("ol", "aunl");
        [["Join the Club", "https://discord.gg/cXnVBTUUPk"], ["Catch 50,000 sales scanning", "contribute.html"], ["Support $100 on Ko-fi", "https://ko-fi.com/maplefm"]].forEach(function (u) { var li = el("li"); var a = el("a", null, u[0]); a.href = u[1]; if (/^https/.test(u[1])) { a.target = "_blank"; a.rel = "noopener"; } li.appendChild(a); ul.appendChild(li); });
        body.appendChild(ul); return;
      }
      if (item) body.appendChild(alertForm(item, list, function () { alertDlg(item); }));
      var mine = item ? list.filter(function (a) { return a.item === item; }) : list;
      body.appendChild(el("h4", null, item ? "On this item" : list.length + " of " + ALERT_MAX + " alerts"));
      if (!mine.length) body.appendChild(el("p", "note", item ? "None yet." : "None yet. Open an equip's card and tap 🔔 Stat alert."));
      mine.forEach(function (a) {
        var r = el("div", "arow" + (a.on ? "" : " off"));
        var t = el("span"); if (!item) { var lk = el("a", null, showName(a.item)); lk.href = "#item=" + encodeURIComponent(a.item); lk.addEventListener("click", function () { d.close(); }); t.appendChild(lk); t.appendChild(document.createTextNode(" · ")); }
        t.appendChild(el("span", null, alertText(a))); r.appendChild(t);
        var tg = el("button", "pbtn", a.on ? "Pause" : "Resume"); tg.type = "button";
        var del = el("button", "pbtn", "Delete"); del.type = "button";
        var redo = function (fn) { var nl = ALERTS.map(function (z) { return Object.assign({}, z); }); fn(nl); alertsSave(nl).then(function () { alertDlg(item); }, function (e) { alert0(body, e.message); }); };
        tg.addEventListener("click", function () { redo(function (nl) { nl.forEach(function (z) { if (z.id === a.id) z.on = !z.on; }); }); });
        del.addEventListener("click", function () { redo(function (nl) { for (var k = nl.length - 1; k >= 0; k--) if (nl[k].id === a.id) nl.splice(k, 1); }); });
        r.appendChild(tg); r.appendChild(del); body.appendChild(r);
      });
      body.appendChild(el("p", "note", "One DM per listing, up to 20 a day. Only stats read with full confidence count. A listing may be gone by the time you get there."));
    });
  }
  function alert0(box, msg) { var m = box.querySelector(".aerr") || box.insertBefore(el("p", "aerr"), box.firstChild); m.textContent = msg; }
  function alertForm(item, list, done) {
    var f = el("div", "aform"), base = fullBase(item).s;
    var keys = BSTATS.filter(function (k) { return base[k]; }); ["ATT", "MATT"].forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    var rows = el("div", "astats"); f.appendChild(rows);
    function statRow() {
      var r = el("div", "astat"), sel = document.createElement("select"); sel.setAttribute("aria-label", "Stat");
      keys.forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = STATN2[k] || k; sel.appendChild(o); });
      var mode = document.createElement("select"); mode.setAttribute("aria-label", "How to count it");
      [["abs", "at least"], ["rel", "above clean, at least +"]].forEach(function (m) { var o = document.createElement("option"); o.value = m[0]; o.textContent = m[1]; mode.appendChild(o); });
      var n = document.createElement("input"); n.type = "number"; n.min = "-20"; n.max = "500"; n.value = "1"; n.setAttribute("aria-label", "Value"); n.inputMode = "numeric";
      var hint = el("small", "ahint");
      var upd = function () { var b = base[sel.value]; hint.textContent = b ? "clean " + b : ""; };
      sel.addEventListener("change", upd); upd();
      r.appendChild(sel); r.appendChild(mode); r.appendChild(n); r.appendChild(hint); rows.appendChild(r);
    }
    statRow();
    var more = el("button", "linkb", "+ another stat"); more.type = "button"; more.addEventListener("click", function () { if (rows.children.length < 3) statRow(); if (rows.children.length >= 3) more.hidden = true; }); f.appendChild(more);
    var cond = document.createElement("select"); cond.setAttribute("aria-label", "Scrolls used");
    [["", "Any scroll state"], ["clean", "Clean only"], ["1", "At most 1 slot used"], ["2", "At most 2 slots used"], ["3", "At most 3 slots used"]].forEach(function (c) { var o = document.createElement("option"); o.value = c[0]; o.textContent = c[1]; cond.appendChild(o); });
    var mx = document.createElement("input"); mx.type = "text"; mx.placeholder = "Max price, like 2m"; mx.setAttribute("aria-label", "Max price");
    var r2 = el("div", "arow2"); r2.appendChild(cond); r2.appendChild(mx); f.appendChild(r2);
    var sv = el("button", "pbtn go", "Save alert"); sv.type = "button"; f.appendChild(sv);
    sv.addEventListener("click", function () {
      if (list.length >= ALERT_MAX) { alert0(f, "That's " + ALERT_MAX + " alerts. Delete one first."); return; }
      var stats = Array.prototype.map.call(rows.children, function (r) { var s = r.querySelectorAll("select"), v = r.querySelector("input"); return { k: s[0].value, rel: s[1].value === "rel", min: Math.round(+v.value || 0) }; });
      var mp = mx.value.trim() ? parseMesos(mx.value) : 0; if (isNaN(mp)) { alert0(f, "Max price: a number like 500k or 2m."); return; }
      var a = { item: item, stats: stats, clean: cond.value === "clean", used: cond.value && cond.value !== "clean" ? +cond.value : null, max: mp, on: true };
      sv.disabled = true;
      alertsSave(list.concat([a])).then(done, function (e) { sv.disabled = false; alert0(f, e.message); });
    });
    return f;
  }
  // Daily DM: a free once-a-day Discord DM of the watchlist (the Worker's watchDigest reads fm-digest from synced
  // settings). Shown while the watchlist is open; signing in comes first.
  function digestBtn() {
    var b = $("wdm"); if (!b) return;
    var ab = $("walerts"); if (ab) ab.hidden = !state.wonly;
    b.hidden = !state.wonly; var on = !!loadLS("fm-digest", false) && !!ME_ACCT;
    b.setAttribute("aria-pressed", on); b.textContent = on ? "📬 Daily DM on" : "📬 Daily DM";
    b.title = !ME_ACCT ? "Sign in with Discord to get your watchlist by DM once a day" : on ? "On: your watchlist arrives by Discord DM at 10 AM Eastern. Click to turn off." : "Once a day at 10 AM Eastern, a Discord DM with your watched items' prices and how they moved";
  }
  if ($("walerts")) $("walerts").addEventListener("click", function () { alertDlg(null); });
  $("wdm").addEventListener("click", function () {
    if (!ME_ACCT) { location.href = ACCT + "/login?back=home"; return; }
    var on = !loadLS("fm-digest", false); saveLS("fm-digest", on); digestBtn();
    try { navigator.sendBeacon("https://api.maplefm.gg/hit", new Blob([JSON.stringify({ p: on ? "#digest:on" : "#digest:off", r: "", q: "" })], { type: "text/plain" })); } catch (e) {}
  });
  function renderView() { if (!D) return render(); if (state.tab === "prices") renderPrices(); else if (state.tab === "deals") renderDeals(); else render(); }
  var PRESETS = [[0, 10], [10, 20], [20, 30], [30, 40], [40, 50], [50, 70]];
  PRESETS.forEach(function (p) { var b = el("button", null, p[0] + "–" + p[1]); b.type = "button"; b.addEventListener("click", function () { var on = $("lv-min").value === String(p[0]) && $("lv-max").value === String(p[1]); $("lv-min").value = on ? "" : p[0]; $("lv-max").value = on ? "" : p[1]; syncPresets(); render(); }); $("presets").appendChild(b); });
  function syncPresets() { [].forEach.call($("presets").children, function (b, k) { b.setAttribute("aria-pressed", $("lv-min").value === String(PRESETS[k][0]) && $("lv-max").value === String(PRESETS[k][1])); }); }
  ["lv-min", "lv-max"].forEach(function (id) { $(id).addEventListener("input", syncPresets); });
  syncPresets();
  $("freset").addEventListener("click", function () { $("f-low").checked = false; $("f-sold").checked = false; $("f-bids").checked = false; $("f-cash").checked = true; $("f-spot").checked = false; $("win").value = "7"; $("lv-min").value = ""; $("lv-max").value = ""; $("cls").value = ""; syncPresets(); render(); });
  document.querySelectorAll("thead button[data-k]").forEach(function (b) { b.addEventListener("click", function () { if (state.sortK === b.dataset.k) state.sortDir = -state.sortDir; else { state.sortK = b.dataset.k; state.sortDir = b.dataset.k === "item" || b.dataset.k === "best" ? 1 : -1; } renderView(); }); });
  document.querySelectorAll("thead button[data-d]").forEach(function (b) { b.addEventListener("click", function () { state.dealTop = null; if (state.dK === b.dataset.d) state.dDir = -state.dDir; else { state.dK = b.dataset.d; state.dDir = (b.dataset.d === "item" || b.dataset.d === "s" || b.dataset.d === "u") ? 1 : -1; } render(); }); });
  $("tab-prices").addEventListener("click", function () { state.tab = "prices"; try { history.replaceState(null, "", state.sel ? "#item=" + encodeURIComponent(state.sel) : "#"); } catch (e) {} render(); });
  $("tab-deals").addEventListener("click", function () { state.tab = "deals"; state.dealTop = null; try { history.replaceState(null, "", "#deals"); } catch (e) {} render(); });
  $("tab-sell").addEventListener("click", function () { state.tab = "sell"; try { history.replaceState(null, "", "#sell"); } catch (e) {} render(); });
  $("tab-pos").addEventListener("click", function () { state.tab = "pos"; try { history.replaceState(null, "", "#positions"); } catch (e) {} render(); });
  function pform(side, item, q, price) {
    PSIDE = side; $("pf-buy").setAttribute("aria-pressed", side === "buy"); $("pf-sell").setAttribute("aria-pressed", side === "sell");
    $("pos-add").textContent = side === "buy" ? "Log buy" : "Log sale";
    if (item != null) { $("pos-item").value = item; $("pos-qty").value = q || 1; $("pos-paid").value = price ? short(price) : ""; }
    pfHint(); $("pos-paid").focus();
  }
  function pfHint() {
    var n = $("pos-item").value.trim(), i = n && posItem(n), h = $("pf-hint"), bits = [];
    if (i && i.typ) bits.push("Typical " + MF(i.typ) + (i.lo && i.hi && i.hi > i.lo ? " (most sales " + short(i.lo) + " to " + M(i.hi) + ")" : ""));
    if (PSIDE === "sell" && i) { var held = ledger().hold.filter(function (x) { return x.i === i.item; })[0]; bits.push(held ? "You hold " + held.q + " at " + M(Math.round(held.paid)) + " each" : "Not logged as bought, so this sale won't count toward profit"); }
    rich(h, bits.join(" · "));
  }
  $("pf-buy").addEventListener("click", function () { pform("buy"); });
  $("pf-sell").addEventListener("click", function () { pform("sell"); });
  $("pos-item").addEventListener("input", pfHint);
  $("pos-add").addEventListener("click", function () {
    var n = $("pos-item").value.trim(), q = Math.max(1, Math.round(+$("pos-qty").value || 1)), p = parseMesos($("pos-paid").value);
    if (!n) { $("pos-item").focus(); return; }
    if (!(p > 0)) { $("pos-paid").focus(); return; }
    var hit = posItem(n); if (hit) n = hit.item;
    TRADES.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), i: n, side: PSIDE, q: q, p: p, t: Date.now() }); saveTrades();
    $("pos-item").value = ""; $("pos-qty").value = 1; $("pos-paid").value = ""; $("pf-hint").textContent = ""; render();
  });
  $("pos-paid").addEventListener("keydown", function (e) { if (e.key === "Enter") $("pos-add").click(); });
  $("pf-period").value = String(loadLS("fm-pf-period", 0));
  $("pf-period").addEventListener("change", function () { saveLS("fm-pf-period", +this.value); render(); });
  $("pf-fee").value = loadLS("fm-fee", 0);
  $("pf-fee").addEventListener("change", function () { saveLS("fm-fee", Math.max(0, Math.min(50, +this.value || 0))); syncPOS(); render(); });
  $("pf-csv").addEventListener("click", function () {
    var lg = ledger(), byTr = {}; lg.closed.forEach(function (c) { byTr[c.tr.id] = c; });
    var rows = [["date", "item", "side", "qty", "price each", "profit"]].concat(TRADES.slice().sort(function (a, b) { return a.t - b.t; }).map(function (t) { var c = byTr[t.id]; return [new Date(t.t).toISOString(), t.i, t.side, t.q, t.p, c && c.matched ? Math.round(c.pl) : ""]; }));
    var csv = rows.map(function (r) { return r.map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "club-fm-trades.csv"; document.body.appendChild(a); a.click(); a.remove();
  });
  $("watch-th").value = loadLS("fm-watch-th", 15);
  $("watch-th").addEventListener("change", function () { saveLS("fm-watch-th", +this.value || 15); render(); });
  $("walert").addEventListener("click", function () { $("walert-new").hidden = true; clearInterval(titleTimer); document.title = baseTitle; state.tab = "pos"; render(); $("pos-view").scrollIntoView({ behavior: "smooth", block: "start" }); });
  $("sell-add").addEventListener("click", function () { addSell($("sell-item").value, Math.max(1, +$("sell-qty").value || 1)); $("sell-item").value = ""; $("sell-qty").value = 1; render(); });
  $("sell-item").addEventListener("keydown", function (e) { if (e.key === "Enter") $("sell-add").click(); });
  $("fast-pct").value = FASTPCT;
  $("fast-pct").addEventListener("input", function () { var v = Math.max(0, Math.min(50, +this.value || 0)); FASTPCT = v; saveLS("fm-fast-pct", v); renderSell(); });
  $("sell-refresh").addEventListener("click", function () { var b = this; b.disabled = true; b.textContent = "Loading…"; loadGame().then(function () { b.disabled = false; b.textContent = "↻ Load hovered items"; renderSell(); }); });
  $("sell-clear").addEventListener("click", function () {
    // clears typed items and hides every hovered item shown now; hovering one again in game brings it back
    var now = Math.floor(Date.now() / 1000);
    GAME.forEach(function (g) { HIDE[gameKey(g)] = Math.max(g.t || 0, now); }); saveLS("fm-sell-hide", HIDE);
    SELL.length = 0; saveSell(); renderSell();
  });
  $("sell-src").addEventListener("change", function () { try { syncTouch("fm-sell-src"); localStorage.setItem("fm-sell-src", this.value); } catch (e) {} loadGame().then(render); });
  $("alert").addEventListener("click", function (e) {
    $("alert-new").hidden = true; clearInterval(titleTimer); document.title = baseTitle;
    // the row clicked, or the best deal when the headline was clicked
    var row = e.target.closest && e.target.closest(".alert-row[data-k]"), r = row ? ALERTHOT[+row.dataset.k] : ALERTHOT.filter(function (x) { return !x.check; })[0] || ALERTHOT[0];
    state.tab = "deals"; state.dK = "gap"; state.dDir = -1;
    if (r) { state.dealTop = { item: r.l.i, u: r.l.u, s: r.l.s, t: r.l.t, l: r.l }; state.sel = r.l.i; }
    render(); if (r) pick(r.l.i);
    var tr = document.querySelector("#deal-rows tr.pinned") || $("deals-view"); tr.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  // search suggestions: every item in the game, best match first, the shortcut it understood on top
  (function () {
    var q = $("q"), box = $("sugg"), hits = [], at = -1, t = null;
    function close() { box.hidden = true; q.setAttribute("aria-expanded", "false"); at = -1; }
    function choose(k) { var r = hits[k]; if (!r) return; close(); ev("#find:" + q.value.trim().toLowerCase().slice(0, 40)); pick(r.n); jumpToCard(); }
    function mark() { box.querySelectorAll(".so").forEach(function (o, k) { o.setAttribute("aria-selected", k === at ? "true" : "false"); if (k === at) { var t0 = o.offsetTop, t1 = t0 + o.offsetHeight; if (t0 < box.scrollTop) box.scrollTop = t0; else if (t1 > box.scrollTop + box.clientHeight) box.scrollTop = t1 - box.clientHeight; } }); }
    function show() {
      var v = q.value.trim(); if (!v || !D) { close(); return; }
      hits = searchItems(v, 5); box.textContent = ""; at = -1;
      if (!hits.length) { box.appendChild(el("div", "sh", "No item matches \u201c" + v + "\u201d")); }
      else {
        var top = hits[0];
        var h = el("div", "sh");
        if (top.why && top.why !== "initials" && top.why !== "close match") { h.appendChild(document.createTextNode(v.toUpperCase().replace(/\s*(100|60|10)\s*%?\s*/, " ").trim() + " means ")); h.appendChild(el("b", null, top.why)); }
        else if (top.why === "close match") h.textContent = "Closest matches";
        else h.textContent = hits.length === 1 ? "1 item" : "Matches";
        box.appendChild(h);
        hits.forEach(function (r, k) {
          var o = el("div", "so"); o.setAttribute("role", "option"); o.id = "so" + k;
          o.appendChild(iconBox(r.n));
          var nm = el("span", "sn", showName(r.n)); if (!r.it) nm.appendChild(el("small", null, "not seen yet")); o.appendChild(nm);
          if (r.it && r.it.typ) { var sp = el("span", "sp"); sp.appendChild(money(r.it.typ)); o.appendChild(sp); } else o.appendChild(el("span", "sp none", "no price yet"));
          o.addEventListener("mousedown", function (e) { e.preventDefault(); });
          o.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); choose(k); });
          box.appendChild(o);
        });
      }
      box.hidden = false; q.setAttribute("aria-expanded", "true");
    }
    q.addEventListener("input", function () { clearTimeout(t); t = setTimeout(show, 90); });
    q.addEventListener("focus", function () { if (q.value.trim()) show(); });
    q.addEventListener("blur", function () { setTimeout(close, 120); });
    // phones: the box sits under the sticky search bar, so scrolling the page with it open covered the results it had
    // already filtered. Touching or scrolling anywhere else closes it and puts the keyboard away.
    document.addEventListener("touchstart", function (e) { if (!box.hidden && !box.contains(e.target) && e.target !== q) { close(); q.blur(); } }, { passive: true });
    window.addEventListener("scroll", function () { if (!box.hidden && document.activeElement !== q) close(); }, { passive: true });
    q.addEventListener("keydown", function (e) {
      if (box.hidden && e.key === "ArrowDown") { show(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); at = Math.min(hits.length - 1, at + 1); mark(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); at = Math.max(0, at - 1); mark(); }
      else if (e.key === "Enter") { if (hits.length && !box.hidden) { e.preventDefault(); choose(at < 0 ? 0 : at); } }
      else if (e.key === "Escape") { close(); }
    });
  })();
  // ---------- ranks window, your own progress, and promotions
  var RK_ME = ""; try { RK_ME = localStorage.getItem("fm-me") || ""; } catch (e) {}
  function tierIdx(n) { for (var k = 0; k < TIERS.length; k++) if (n >= TIERS[k][0]) return TIERS.length - 1 - k; return 0; }
  function progressOf(w) {
    var t = tierOf(w.sales); if (!t.next) return { pct: 100, txt: "Top tier reached. Legendary." };
    var span = t.next[0] - t.at, got = w.sales - t.at;
    return { pct: Math.max(2, Math.min(100, got / span * 100)), txt: fmt(t.next[0] - w.sales) + " sales to " + t.next[1], next: t.next };
  }
  function rkBar(w) { var b = el("div", "rk-bar"), i = el("i"); b.appendChild(i); var pr = progressOf(w); requestAnimationFrame(function () { requestAnimationFrame(function () { i.style.width = pr.pct + "%"; }); }); return b; }
  function badgeFor(name, rank) { var a = el("span", "avb"); a.appendChild(avatarPhoto(name)); if (rank && rank <= 10) a.appendChild(rankBadge(rank)); return a; }
  // The coverage map: every room and channel, colored by when a scanner last read it. The Free Market is
  // ROOMS rooms by CHANS channels; rooms past the ones anyone has walked are drawn too, since those are the cold ones.
  var ROOMS = 20, CHANS = 40;
  function coverageMap() {
    var now = Date.now(), last = {};
    if (D && D.L) D.L.forEach(function (l) { if (l.chat || !l.r || !l.c) return; var m = /^FM(\d+)$/.exec(l.r); if (!m) return; var k = +m[1] + "|" + l.c; if (!last[k] || l.t > last[k]) last[k] = l.t; });
    var g = $("covgrid"); g.textContent = ""; g.style.gridTemplateColumns = "40px repeat(" + ROOMS + ", minmax(14px, 1fr))";
    // room numbers across (FM in the corner), a little extra space after every fifth room so they're easy to count
    g.appendChild(el("div", "h fm", "FM")); for (var r = 1; r <= ROOMS; r++) g.appendChild(el("div", "h" + (r % 5 === 0 && r < ROOMS ? " g5" : ""), String(r)));
    var cold = [], warm = 0;
    for (var ch = 1; ch <= CHANS; ch++) {
      g.appendChild(el("div", "r", "ch " + ch));
      for (var rm = 1; rm <= ROOMS; rm++) {
        var t = last[rm + "|" + ch] || 0, age = t ? now - t : Infinity, cls = age < H ? "c3" : age < 6 * H ? "c2" : age < DAY ? "c1" : "c0";
        var cell = el("div", "c " + cls + (rm % 5 === 0 && rm < ROOMS ? " g5" : "")); cell.title = "Free Market " + rm + ", channel " + ch + (t ? ": read " + ago(t) : ": not read in the last day"); g.appendChild(cell);
        if (cls === "c0") cold.push([rm, ch, t]); else warm++;
      }
    }
    $("cov-sub").textContent = warm + " of " + (ROOMS * CHANS) + " spots read in the last day. Rooms across, channels down.";
    var cl = $("covcold"); cl.textContent = "";
    // the coldest first: never read, then longest ago; whole rooms nobody walks get one chip
    var byRoom = {}; cold.forEach(function (x) { (byRoom[x[0]] || (byRoom[x[0]] = [])).push(x); });
    var chips = [];
    Object.keys(byRoom).forEach(function (rm) { var xs = byRoom[rm]; if (xs.length === CHANS) chips.push({ t: "FM" + rm + " · every channel", hot: true, k: 0 }); else xs.slice(0, 6).forEach(function (x) { chips.push({ t: "FM" + x[0] + " ch " + x[1] + (x[2] ? " · " + ago(x[2]) : ""), hot: !x[2], k: x[2] || 0 }); }); });
    chips.sort(function (a, b) { return a.k - b.k; }).slice(0, 40).forEach(function (c) { cl.appendChild(el("span", c.hot ? "hot" : "", c.t)); });
    if (!cold.length) cl.appendChild(el("span", "", "Everything has been read in the last day. Nice."));
  }
  // The last 7 days by hour (data/covhours.json, written by the pump's pulse step): the busiest spots nobody usually
  // reads at this hour, and how much of the market goes unread at each hour of the day. Spots and counts only.
  var COVH = null, COVHAT = 0;
  function etHourNow() { try { return +new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", hour: "numeric", hour12: false }).format(new Date()) % 24; } catch (e) { return new Date().getHours(); } }
  function coverageHours() {
    var draw = function (j) {
      var box = $("covhr"), bars = $("covhrs"); if (!box || !bars) return;
      box.textContent = ""; bars.textContent = "";
      if (!j || !j.spots) { box.appendChild(el("span", "", "Builds after a day of scans.")); return; }
      var h = etHourNow(), n = (j.days || []).length || 7, ks = Object.keys(j.spots);
      var gaps = ks.map(function (k) { var sp = j.spots[k]; return { k: k, m: sp.m[h], e: sp.e[h] }; }).filter(function (g) { return g.m >= Math.max(3, n - 2) && g.e >= 1; })
        .sort(function (a, b) { return b.m * b.e - a.m * a.e; }).slice(0, 12);
      gaps.forEach(function (g) { var p = g.k.split("|"); box.appendChild(el("span", g.m === n ? "hot" : "", "FM" + p[0] + " ch " + p[1] + " · ~" + Math.round(g.e) + " shops")); });
      if (!gaps.length) box.appendChild(el("span", "", "Every busy spot is usually read at this hour. Nice."));
      for (var x = 0; x < 24; x++) {
        var tot = 0, miss = 0; ks.forEach(function (k) { var sp = j.spots[k]; tot += sp.e[x] * n; miss += sp.e[x] * sp.m[x]; });
        var pct = tot ? miss / tot : 0, b = el("i", x === h ? "now" : ""); b.style.height = Math.max(3, Math.round(pct * 100)) + "%";
        b.title = (x % 12 || 12) + (x < 12 ? " AM" : " PM") + ": " + Math.round(pct * 100) + "% of busy spots unread"; bars.appendChild(b);
      }
      var lab = $("covhrl"); if (!lab) { lab = el("div", "covhrl"); lab.id = "covhrl"; ["12a", "6a", "12p", "6p", "11p"].forEach(function (t) { lab.appendChild(el("span", "", t)); }); bars.parentNode.insertBefore(lab, bars.nextSibling); }
    };
    if (COVH && Date.now() - COVHAT < 30 * 60e3) { draw(COVH); return; }
    getJSON("data/covhours.json").then(function (j) { COVH = j; COVHAT = Date.now(); draw(j); }, function () { draw(null); });
  }
  function openCoverage() { coverageMap(); coverageHours(); if (!$("covdlg").open) $("covdlg").showModal(); }
  function openRanks() { renderRanks(); if (!$("ranks").open) $("ranks").showModal(); loadPaid(); }
  // lifetime payouts per scanner, from the payout record (data/payouts.json), shown on the ranks
  var PAIDOUT = null, PAID_AT = 0;
  function loadPaid() {
    if (Date.now() - PAID_AT < 10 * 6e4) return; PAID_AT = Date.now();
    fetch("/data/payouts.json?t=" + Math.floor(Date.now() / 6e5), { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (po) {
      if (!po) return; var m = {};
      Object.keys(po).forEach(function (n) { var t = 0; (po[n] || []).forEach(function (x) { t += +x.amount || 0; }); if (t > 0) m[n.toLowerCase()] = Math.round(t * 100) / 100; });
      PAIDOUT = m; if ($("ranks").open) renderRanks();
    }).catch(function () {});
  }
  function paidOf(name) { return PAIDOUT && PAIDOUT[String(name || "").toLowerCase()] || 0; }
  function paidTxt(name) { var v = paidOf(name); return v ? " · 💵 $" + (v % 1 ? v.toFixed(2) : v) + " paid out" : ""; }
  // ---------- the live leaderboard on the left: every scanner, first to last. Rows are kept between renders and
  // slide to their new place when the order changes, so a climb is seen rather than just read.
  var BROWS = {}, BLAST = {}, BSHOWN = 30;
  // the ranks bar: collapsed by default, remembered once opened
  (function () {
    var t = $("btog"), body = $("bbody"); if (!t || !body) return;
    function set(open) { body.hidden = !open; t.setAttribute("aria-expanded", open ? "true" : "false"); saveLS("fm-ranks-open", !!open); }
    set(!!loadLS("fm-ranks-open", false));
    t.addEventListener("click", function () { set(body.hidden); });
  })();
  function boardSummary(all) {
    var s = $("bsum"); if (!s) return; s.textContent = "";
    all.slice(0, 3).forEach(function (w, i) { var b = el("span"); var bb = el("b", null, (i === 0 ? " " : "#" + (i + 1) + " ") + w.name); if (i === 0) bb.insertBefore(ssCrown(), bb.firstChild); b.appendChild(bb); b.appendChild(document.createTextNode(" " + fmt(w.sales))); s.appendChild(b); if (i < 2) s.appendChild(document.createTextNode(" · ")); });
    if (all.length > 3) s.appendChild(document.createTextNode(" · " + all.length + " scanners"));
  }
  function renderBoard() {
    var all = (D && D.whoAll) || [], list = $("bl"); if (!list) return; boardSummary(all);
    if ($("bladder")) renderLadder($("bladder"), all);
    var before = {}; Object.keys(BROWS).forEach(function (n) { var r = BROWS[n]; if (r.parentNode) before[n] = r.getBoundingClientRect().top; });
    var show = all.slice(0, BSHOWN); var me = all.filter(function (w) { return w.name === RK_ME; })[0]; if (me && me.rank > BSHOWN) show.push(me);
    var keep = {};
    show.forEach(function (w) {
      keep[w.name] = 1;
      var r = BROWS[w.name]; if (!r) { r = BROWS[w.name] = el("div", "brow"); r.addEventListener("click", openRanks); r.dataset.name = w.name; }
      var old = BLAST[w.name];
      r.className = "brow" + (w.rank === 1 ? " top1" : "") + (w.name === RK_ME ? " me" : "");
      r.textContent = "";
      var ps = el("span", "pos" + (w.rank === 1 ? " p1" : ""), w.rank === 1 ? null : "#" + w.rank); if (w.rank === 1) ps.appendChild(ssCrown()); r.appendChild(ps);
      r.appendChild(badgeFor(w.name, w.rank));
      var bn = el("div", "bn"), nb = el("b", null, w.name); bn.appendChild(nb); var sp = supporterOf(w.name); if (sp) nb.appendChild(heart(sp));
      var tb = tierBadge(w); if (old && old.r !== w.rank) { var dl = el("span", "dlt " + (w.rank < old.r ? "u" : "d"), (w.rank < old.r ? "▲" : "▼") + Math.abs(old.r - w.rank)); dl.title = "was #" + old.r; tb.appendChild(dl); }
      bn.appendChild(tb); bn.appendChild(rkBar(w)); r.appendChild(bn);
      var bt = el("div", "bt", fmt(w.sales)); bt.appendChild(el("small", w.week ? "" : "dim", w.week ? "+" + fmt(w.week) + " wk" : "sales")); r.appendChild(bt);
      r.title = w.name + ": " + fmt(w.sales) + " sales caught, #" + w.rank + " of " + all.length + ". " + progressOf(w).txt;
      list.appendChild(r);
    });
    Object.keys(BROWS).forEach(function (n) { if (!keep[n] && BROWS[n].parentNode) BROWS[n].remove(); });
    // slide rows from where they were to where they are now
    var moved = [];
    show.forEach(function (w) {
      var r = BROWS[w.name], old = BLAST[w.name]; if (before[w.name] == null) return;
      var dy = before[w.name] - r.getBoundingClientRect().top; if (Math.abs(dy) < 1) return;
      r.style.transition = "none"; r.style.transform = "translateY(" + dy + "px)"; moved.push([r, old && old.r !== w.rank ? (w.rank < old.r ? "up" : "down") : ""]);
    });
    if (moved.length) requestAnimationFrame(function () { moved.forEach(function (m) { var r = m[0]; r.classList.add("moving"); if (m[1]) r.classList.add(m[1]); r.style.transition = ""; r.style.transform = ""; setTimeout(function () { r.classList.remove("moving", "up", "down"); }, 2600); }); });
    BLAST = {}; all.forEach(function (w) { BLAST[w.name] = { r: w.rank, s: w.sales }; });
    var bf = $("bfoot"); bf.textContent = "";
    if (all.length > BSHOWN) { var b = el("button", null, "Show all " + all.length + " scanners"); b.type = "button"; b.addEventListener("click", function () { BSHOWN = 9999; renderBoard(); }); bf.appendChild(b); }
    else if (all.length) bf.appendChild(document.createTextNode(all.length + " scanning · most sales caught of all time"));
    else bf.appendChild(document.createTextNode("Nobody on the board yet. Run FM Watcher and be the first."));
  }
  function renderRanks() {
    if (!D) return;
    var all = D.whoAll || [], me = all.filter(function (w) { return w.name === RK_ME; })[0];
    var mb = $("rk-me"); mb.textContent = "";
    if (me) {
      var box = el("div", "rk-me"); box.appendChild(badgeFor(me.name, me.rank));
      var t = el("div"), h = el("h3"); h.appendChild(document.createTextNode(me.name)); h.appendChild(tierBadge(me)); h.appendChild(el("span", "rk-num", "#" + me.rank + " of " + all.length)); t.appendChild(h);
      t.appendChild(rkBar(me)); var pr = progressOf(me), sub = el("div", "rk-sub");
      sub.innerHTML = "<b>" + fmt(me.sales) + "</b> sales caught · " + esc(pr.txt) + (me.week ? " · <b>+" + fmt(me.week) + "</b> this week" : "") + esc(paidTxt(me.name));
      t.appendChild(sub); box.appendChild(t); mb.appendChild(box);
    }
    var pick = el("label", "rk-pick"); pick.appendChild(document.createTextNode(me ? "Not you?" : "Which one is you? Pick your name to track your climb:"));
    var sel = el("select"); sel.appendChild(new Option("Choose…", ""));
    all.forEach(function (w) { var o = new Option(w.name + (w.stream ? " (stream)" : ""), w.name); if (w.name === RK_ME) o.selected = true; sel.appendChild(o); });
    sel.addEventListener("change", function () { RK_ME = sel.value; try { syncTouch("fm-me"); localStorage.setItem("fm-me", RK_ME); } catch (e) {} seenTiers(true); renderRanks(); });
    pick.appendChild(sel); mb.appendChild(pick);
    var pod = $("rk-pod"); pod.textContent = "";
    [1, 0, 2].forEach(function (k) {
      var w = all[k]; if (!w) { pod.appendChild(el("div")); return; }
      var d = el("div", "pod p" + (k + 1)); d.appendChild(el("span", "place", k === 0 ? "THE CROWN" : "#" + (k + 1)));
      d.appendChild(badgeFor(w.name, k + 1)); d.appendChild(el("b", null, w.name)); var tb = tierBadge(w); d.appendChild(tb);
      var n = el("div", "n", fmt(w.sales)); n.appendChild(el("small", null, " sales")); d.appendChild(n);
      if (paidOf(w.name)) d.appendChild(el("small", "rk-paid", paidTxt(w.name).replace(/^ · /, ""))); pod.appendChild(d);
    });
    var list = $("rk-list"); list.textContent = "";
    var rows = all.slice(3, 25); if (me && me.rank > 25) rows.push(me);
    rows.forEach(function (w) {
      var r = el("div", "rk-row" + (w.name === RK_ME ? " me" : "")); r.appendChild(el("span", "pos", "#" + w.rank)); r.appendChild(badgeFor(w.name, w.rank));
      var nm = el("div", "rk-nm"), top = el("div"); top.appendChild(el("b", null, w.name)); var sp2 = supporterOf(w.name); if (sp2) top.appendChild(heart(sp2)); top.appendChild(tierBadge(w)); if (w.club) top.appendChild(el("span", "clubtag", "Club")); if (w.stream) top.appendChild(el("span", "clubtag", "Stream"));
      nm.appendChild(top); nm.appendChild(rkBar(w)); nm.appendChild(el("div", "rk-sub", progressOf(w).txt + paidTxt(w.name))); r.appendChild(nm);
      var tot = el("div", "tot", fmt(w.sales)); tot.appendChild(el("small", null, w.week ? "+" + fmt(w.week) + " this week" : fmt(w.daysN) + (w.daysN === 1 ? " day" : " days"))); if (w.week) tot.lastChild.className = "wk"; r.appendChild(tot);
      list.appendChild(r);
    });
    renderLadder($("rk-ladder"), all);
  }
  function renderLadder(lad, all) {
    lad.textContent = "";
    TIERS.slice().reverse().forEach(function (t) {
      var n = all.filter(function (w) { return tierOf(w.sales).name === t[1]; }).length;
      var d = el("div", n ? "has" : ""), b = el("span", "tbadge " + t[2]); b.appendChild(el("i", null, GEM[t[2]])); b.appendChild(document.createTextNode(t[1])); d.appendChild(b);
      d.appendChild(el("small", null, (t[0] ? fmt(t[0]) + " sales" : "Start") + " · " + n + (n === 1 ? " scanner" : " scanners")));
      if (t[2] === "titan") { d.classList.add("unlock"); d.appendChild(el("span", "perk", "🔔 Mega Deals unlock")); }
      if (t[2] === "broker") { d.appendChild(el("span", "perk", "💵 pay unlocks at 500 credits")); }
      lad.appendChild(d);
    });
  }
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // remember everyone's tier and the top 10 order; when it moves, celebrate
  function seenTiers(reset) {
    var cur = {}; (D.whoAll || []).forEach(function (w) { cur[w.name] = [tierIdx(w.sales), w.rank]; });
    var old = null; try { old = JSON.parse(localStorage.getItem("fm-tiers-seen") || "null"); } catch (e) {}
    try { syncTouch("fm-tiers-seen"); localStorage.setItem("fm-tiers-seen", JSON.stringify(cur)); } catch (e) {}
    if (reset || !old) return;
    var ups = [];
    (D.whoAll || []).forEach(function (w) { var o = old[w.name]; if (!o) return; if (cur[w.name][0] > o[0]) ups.push({ w: w, kind: "tier" }); else if (w.rank <= 3 && w.rank < o[1]) ups.push({ w: w, kind: "rank" }); });
    var mine = ups.filter(function (u) { return u.w.name === RK_ME && u.kind === "tier"; })[0];
    if (mine) levelUp(mine.w);
    ups.filter(function (u) { return u !== mine && (u.w.rank <= 10 || u.w.name === RK_ME); }).slice(0, 3).forEach(function (u, k) { setTimeout(function () { rkToast(u); }, (mine ? 6000 : 400) + k * 6500); });
  }
  function rkToast(u) {
    var t = el("div", "rktoast"); t.appendChild(tierBadge(u.w));
    t.appendChild(document.createTextNode(u.kind === "tier" ? u.w.name + " just reached " + tierOf(u.w.sales).name + "!" : u.w.name + (u.w.rank === 1 ? " took the Crown!" : " climbed to #" + u.w.rank + "!")));
    t.addEventListener("click", function () { t.remove(); openRanks(); });
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 6200);
    if (u.kind === "rank" && u.w.rank === 1) confetti(60);
  }
  function confetti(n) {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var cols = ["#ffe27a", "#d9a520", "#b07cff", "#6d3fd1", "#ffffff", "#ff7ab8", "#6fe3c1"];
    for (var k = 0; k < n; k++) {
      var c = el("i", "confetti"); c.style.left = Math.random() * 100 + "vw"; c.style.background = cols[k % cols.length];
      c.style.setProperty("--dx", (Math.random() * 240 - 120) + "px"); c.style.setProperty("--rot", (Math.random() * 1440 - 720) + "deg");
      c.style.animationDuration = (2.4 + Math.random() * 2.2) + "s"; c.style.animationDelay = (Math.random() * .6) + "s";
      document.body.appendChild(c); (function (c) { setTimeout(function () { c.remove(); }, 5600); })(c);
    }
  }
  function levelUp(w) {
    var t = tierOf(w.sales), o = el("div", "lvlup"); o.setAttribute("role", "dialog"); o.setAttribute("aria-label", "Promoted to " + t.name);
    o.appendChild(el("div", "rays")); var c = el("div", "card2"); c.appendChild(el("div", "kick", "Rank up"));
    var big = el("div", "big"); big.appendChild(tierBadge(w)); c.appendChild(big);
    c.appendChild(el("h2", null, "Promoted to " + t.name + "!")); c.appendChild(el("p", null, w.name + " · " + fmt(w.sales) + " sales caught · #" + w.rank + " overall"));
    if (t.next) c.appendChild(el("p", null, "Next up: " + t.next[1] + " at " + fmt(t.next[0]) + " sales"));
    c.appendChild(el("p", "tap", "Click anywhere to keep scanning")); o.appendChild(c);
    o.addEventListener("click", function () { o.remove(); });
    document.body.appendChild(o); confetti(140); if ($("sound").checked) { beep(); setTimeout(beep, 380); }
    setTimeout(function () { if (o.parentNode) o.remove(); }, 9000);
  }
  $("m-club").addEventListener("click", function () {
    closeMenus();
    return;
    $("club-msg").textContent = ""; $("club-key").value = ""; $("clubdlg").showModal(); setTimeout(function () { $("club-key").focus(); }, 50);
  });
  function clubGo() { tryClub($("club-key").value.trim()).then(function (ok) { if (ok) $("clubdlg").close(); else $("club-msg").textContent = "That key didn't work."; }); }
  $("club-go").addEventListener("click", clubGo);
  $("club-key").addEventListener("keydown", function (e) { if (e.key === "Enter") clubGo(); });
  $("m-minprof").value = fmt(MINPROF);
  $("m-minprof").addEventListener("change", function () { var v = parseMesos(this.value); if (!(v >= 0)) v = 50000; MINPROF = v; saveLS("fm-min-profit", v); this.value = fmt(v); seenDeals = null; renderAlert(); });
  $("sound").addEventListener("change", function () { if (this.checked) beep(); try { syncTouch("fm-sound"); localStorage.setItem("fm-sound", this.checked ? "1" : ""); } catch (e) {} });
  try { $("sound").checked = localStorage.getItem("fm-sound") === "1"; } catch (e) {}
  $("scrim").addEventListener("click", function () { closeCard(); });
  // searching again from an open item: start fresh instead of editing the last search
  function freshQ() { if (cardOpen()) { var q = $("q"); q.select(); setTimeout(function () { q.select(); }, 0); } }
  $("q").addEventListener("focus", freshQ); $("q").addEventListener("click", freshQ);
  // close the item panel: on a phone it slides the sheet away; on a wide screen it hides the panel and the price
  // list takes the full width until you pick another item
  $("sheetx").addEventListener("click", function () { closeCard(); });
  $("sheetback").addEventListener("click", function () { closeCard(); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !cardOpen()) return;   // runs first (capture), while the menu or suggestions still show
    if (!$("sugg").hidden || document.querySelector("dialog[open]") || ($("menu") && !$("menu").hidden)) return;   // Esc closes those first
    closeCard();
  }, true);
  // back and forward: a step without #item= closes the card, a step with one opens that item
  window.addEventListener("popstate", function () {
    var m = /item=([^&]+)/.exec(location.hash); if (!m) { closeCard(true); return; }
    var n = ""; try { n = decodeURIComponent(m[1]); } catch (e) { return; }
    if (D && D.byName && D.byName[n] && (n !== state.sel || !cardOpen())) pick(n, true);
  });
  // The board shows only the columns that fit its box, dropping the least needed first, so no column is ever cut in half
  // at the edge of a phone or tablet: Volume, then Trend, Cheapest now, Sales, and last 24h. Item and Typical always stay.
  function fitBoard() {
    var tb = $("rows"), t = tb && tb.closest("table"), w = t && t.parentNode; if (!w || !w.clientWidth) return;
    for (var k = 1; k <= 5; k++) t.classList.remove("fit" + k);
    for (k = 1; k <= 5 && w.scrollWidth > w.clientWidth + 1; k++) t.classList.add("fit" + k);
  }
  var fbT = 0; window.addEventListener("resize", function () { if (!fbT) fbT = requestAnimationFrame(function () { fbT = 0; fitBoard(); }); });
  // the search hint is the longest version that fits the box, so a phone never shows it cut off mid-word
  var PH = ["Try GFA 60, work gloves, white label ring...", "Try GFA 60, work gloves...", "Try GFA 60...", "Search items"];
  function fitPh() {
    var q = $("q"); if (!q || !q.clientWidth) return; var cs = getComputedStyle(q), cx = document.createElement("canvas").getContext("2d"); cx.font = cs.font;
    var room = q.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24;   // search boxes keep room for their clear button
    q.placeholder = PH.filter(function (t) { return cx.measureText(t).width <= room; })[0] || PH[PH.length - 1];
  }
  fitPh(); window.addEventListener("resize", fitPh); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPh);
  // turning a tablet or resizing across the wide-screen line: the card switches between its two shapes
  var cardWide = window.innerWidth > 1180;
  window.addEventListener("resize", function () {
    var w = window.innerWidth > 1180; if (!cardOpen()) { cardWide = w; return; }
    if (w !== cardWide) { cardWide = w; showCard(); renderItem(); } else placeCard();
  });
  $("drawerbtn").addEventListener("click", function () { var d = $("drawer"), o = !d.classList.contains("open"); d.classList.toggle("open", o); this.setAttribute("aria-expanded", o); });
  function renderDrawer() {
    var s = D.sales.slice().sort(function (a, b) { return b.t - a.t; }).slice(0, 40), d = $("drawer");
    d.hidden = !s.length; if (!s.length) return;
    var f = s[0], dl = $("dlast"); dl.textContent = "";
    dl.appendChild(el("b", null, f.s)); dl.appendChild(document.createTextNode(" sold " + showName(f.i) + " for ")); dl.appendChild(money(f.p)); dl.appendChild(document.createTextNode(" · " + ago(f.t)));
    var box = $("dlist"), sig = s.map(function (l) { return l.s + l.i + l.p + ago(l.t) + (l.x ? 1 : 0); }).join("|");
    if (box.dataset.sig === sig) return; box.dataset.sig = sig; box.textContent = "";
    s.forEach(function (l) {
      var b = el("button"); b.type = "button"; b.appendChild(iconBox(l.i)); var bn = el("b", null, l.i); b.appendChild(bn);
      var di = l.x && D.byName[l.i], dg = di && di.equip && gradeOf(di, l); if (dg) bn.appendChild(gradeTag(ladderOf(di), dg));
      b.appendChild(el("small", null, l.s + (where(l) ? " · " + where(l) : "") + " · " + ago(l.t))); b.appendChild(money(l.p));
      tipAttach(b, l, l.i);
      b.addEventListener("click", function () { $("drawer").classList.remove("open"); pick(l.i); }); box.appendChild(b);
    });
  }
  function setTheme(night) { if (night) document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme"); $("m-night").checked = night; }
  setTheme(loadLS("fm-night", null) == null ? !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) : loadLS("fm-night", false));
  $("m-night").addEventListener("change", function () { saveLS("fm-night", this.checked); setTheme(this.checked); });
  $("m-activity").checked = loadLS("fm-activity", false); $("activity").hidden = !$("m-activity").checked;
  $("m-activity").addEventListener("change", function () { saveLS("fm-activity", this.checked); $("activity").hidden = !this.checked; if (this.checked) { renderActivity(); $("activity").scrollIntoView({ behavior: "smooth", block: "start" }); } });
  $("actx").addEventListener("click", function () { $("m-activity").checked = false; saveLS("fm-activity", false); $("activity").hidden = true; });
  $("m-about").addEventListener("click", function () { closeMenus(); $("help").showModal(); });
  $("m-sources").addEventListener("click", function () { closeMenus(); openSources(); });
  (function () {
    if (!FEEDBACK.form) return;                                    // hidden until the form is set up
    var topic = "Idea", tp = $("fb-topic");
    ["Wrong price", "Bug", "Idea", "Other"].forEach(function (t) { var b = el("button", null, t); b.type = "button"; b.setAttribute("aria-pressed", t === topic); b.addEventListener("click", function () { topic = t; [].forEach.call(tp.children, function (c) { c.setAttribute("aria-pressed", c === b); }); }); tp.appendChild(b); });
    var ctx = function () { return (state.tab === "deals" ? "Best deals" : state.tab === "sell" ? "Sell my items" : state.tab === "pos" ? "My positions" : "Board") + (state.sel ? " · " + state.sel : ""); };
    $("fbwrap").hidden = false;
    var fbT = false; try { fbT = localStorage.getItem("fm-fb-tuck") === "1"; } catch (e) {}
    function fbTuck(on) { fbT = on; $("fbwrap").classList.toggle("tucked", on); $("fbtuck").textContent = on ? "💬" : "›"; $("fbtuck").title = on ? "Show the feedback button" : "Tuck away"; $("fbtuck").setAttribute("aria-label", on ? "Show the feedback button" : "Tuck the feedback button away"); try { localStorage.setItem("fm-fb-tuck", on ? "1" : ""); } catch (e) {} }
    fbTuck(fbT);
    $("fbtuck").addEventListener("click", function () { fbTuck(!fbT); });
    $("fbk").addEventListener("click", function () { $("fb-ctxv").textContent = ctx(); $("fb-msg").textContent = ""; $("feedback").showModal(); setTimeout(function () { $("fb-text").focus(); }, 50); });
    $("fb-send").addEventListener("click", function () {
      var t = $("fb-text").value.trim(), last = +loadLS("fm-fb-last", 0);
      if (t.length < 3) { $("fb-msg").textContent = "Write a few words first."; return; }
      if (Date.now() - last < 30000) { $("fb-msg").textContent = "Thanks! Give it a few seconds before sending another."; return; }
      var f = new FormData(); f.append(FEEDBACK.text, t); f.append(FEEDBACK.topic, topic); if ($("fb-ctx").checked) f.append(FEEDBACK.ctx, ctx());
      var b = this; b.disabled = true; $("fb-msg").textContent = "Sending…";
      fetch(FEEDBACK.form, { method: "POST", mode: "no-cors", body: f }).then(function () {
        saveLS("fm-fb-last", Date.now()); $("fb-text").value = ""; $("fb-msg").textContent = "Sent. Thank you!"; setTimeout(function () { $("feedback").close(); }, 1200);
      }).catch(function () { $("fb-msg").textContent = "Couldn't send. Check your connection and try again."; }).then(function () { b.disabled = false; });
    });
  })();
  $("m-contrib").addEventListener("click", function () { closeMenus(); location.href = "contribute.html"; });
  $("m-short").addEventListener("click", function () { closeMenus(); location.href = "shortcuts.html"; });
  $("m-bot").addEventListener("click", function () { closeMenus(); location.href = "bot/"; });
  document.addEventListener("DOMContentLoaded", function () { var lb = $("legendbox"), x = $("legendx"); if (!lb) return; try { if (localStorage.getItem("fm-legend") !== "open") lb.classList.add("closed"); } catch (e) { lb.classList.add("closed"); }
    x.textContent = lb.classList.contains("closed") ? "+" : "–";
    lb.querySelector("b").addEventListener("click", function () { lb.classList.toggle("closed"); var c = lb.classList.contains("closed"); x.textContent = c ? "+" : "–"; try { localStorage.setItem("fm-legend", c ? "closed" : "open"); } catch (e) {} }); });
  document.querySelectorAll("dialog").forEach(function (d) {
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-close]")) d.close(); });
  });
  window.addEventListener("focus", function () { clearInterval(titleTimer); document.title = baseTitle; });
  // the menu's search on every other page lands here as /?q=...: fill the search and open the best match
  (function qParam() {
    var q = "", sel = "", pr = 0, sold = false;
    try { var sp = new URLSearchParams(location.search); q = sp.get("q") || ""; sel = sp.get("s") || ""; pr = +sp.get("p") || 0; sold = sp.get("k") === "sold"; } catch (e) {}
    q = q.trim().slice(0, 80); if (!q) return;
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
    var tries = 0, t = setInterval(function () {
      if (++tries > 120) return clearInterval(t);
      if (!D || !D.list || !D.list.length) return;
      clearInterval(t);
      var box = document.getElementById("q"); if (box) box.value = q;
      var hits = searchItems(q, 8);
      if (hits.length) {
        if (hits.length === 1 || hits[0].score - (hits[1] ? hits[1].score : 0) >= 100 || hits[0].it) {
          // a link straight to one item (a Discord deal or sale): open its card, leave the search closed, and show
          // the listing the post was about
          pick(hits[0].n); jumpToCard(); if (box) box.blur();
          var dd = $("sugg"); if (dd) dd.hidden = true;
          if (sel) showListing(hits[0].n, sel, pr, sold);
          return;
        }
        if (box) { box.dispatchEvent(new Event("input", { bubbles: true })); }
      } else if (box) { box.focus(); box.dispatchEvent(new Event("input", { bubbles: true })); }
    }, 250);
  })();
  // The listing a Discord post was about, by seller and price: Where to buy (or Recent sales for a sale), scrolled to and
  // lit up so it's clear which one it was. Said plainly when it's already gone.
  function showListing(name, seller, price, sold) {
    var n = 0, t = setInterval(function () {
      if (++n > 240) return clearInterval(t);          // up to a minute: the listings arrive with the full board, after the quick preview
      if (state.sel !== name || !document.querySelector("#side .list")) return;
      clearInterval(t);
      if (sold && state.list !== "sales") { state.list = "sales"; renderItem(); }
      var low = String(seller).toLowerCase(), hit = null;
      [].forEach.call(document.querySelectorAll("#side .list .li"), function (li) {
        if (hit) return; var b = li.querySelector("b"); var nm = b && b.firstChild && b.firstChild.nodeValue || "";
        var pv = li.querySelector(".p .num, .p"); var num = pv ? +String(pv.textContent).replace(/[^0-9]/g, "").slice(0, 12) : 0;
        if (nm.trim().toLowerCase() === low && (!price || Math.abs(num - price) <= Math.max(1, price * 0.002))) hit = li;
      });
      if (hit) { hit.classList.add("dealhit"); hit.scrollIntoView({ block: "center", behavior: "smooth" }); }
      else { var ls = document.querySelector("#side .list"); var note = el("div", "li dealgone"); note.appendChild(el("small", null, seller + "'s listing" + (price ? " at " + MF(price) : "") + " isn't up any more, or wasn't seen again. Here's everyone else selling it.")); ls.insertBefore(note, ls.firstChild); }
    }, 250);
  }
  // "Log this sale in My positions" from a market listing: #positions&plog=s,price,qty,item opens the form filled in
  (function plogHash() {
    var m = /[#&]plog=([bs]),(\d+),(\d+),([^&]+)/.exec(location.hash); if (!m) return;
    var item = ""; try { item = decodeURIComponent(m[4]); } catch (e) { return; }
    setTimeout(function () {
      try { pform(m[1] === "s" ? "sell" : "buy", item, +m[3], +m[2]); } catch (e) {}
      try { history.replaceState(null, "", location.pathname + "#positions"); } catch (e) {}
    }, 900);
  })();
  (function fromHash() { var h = location.hash; if (/deals/.test(h)) state.tab = "deals"; if (/sell/.test(h)) state.tab = "sell"; if (/positions/.test(h)) state.tab = "pos"; var m = /item=([^&]+)/.exec(h); if (m) state.sel = decodeURIComponent(m[1]); })();
  // "See X on the price board" links (#item=Name): once prices load, open that item's card and scroll to it
  var first = true;
  function itemHash() {
    var m = /item=([^&]+)/.exec(location.hash); if (!m) { first = false; return; }
    var name = ""; try { name = decodeURIComponent(m[1]); } catch (e) { return; }
    var tries = 0, t = setInterval(function () {
      if (++tries > 120) return clearInterval(t);
      if (!D || !D.list || !D.list.length) return;
      clearInterval(t);
      var hit = null;
      for (var i = 0; i < D.list.length; i++) if (D.list[i].item === name) { hit = name; break; }
      if (!hit) { var h = searchItems(name, 1); if (h.length) hit = h[0].n; }
      if (hit && (hit !== state.sel || !cardOpen())) { try { pick(hit, first ? "load" : true); jumpToCard(); } catch (e) {} }
      else if (hit) { try { jumpToCard(); } catch (e) {} }
      first = false;
    }, 250);
  }
  itemHash();
  window.addEventListener("hashchange", itemHash);

  // ---------- data loading
  // The GitHub API answers with the newest copy right away, and a "not changed" answer costs nothing
  // against its hourly limit. The raw file host is the fallback; it can lag by up to 5 minutes.
  var API = "https://api.github.com/repos/maplefm/maplefm.github.io/contents/";
  // Each viewer gets 60 API answers an hour. Files that do not exist yet are checked again only every
  // 15 minutes, and when the allowance runs low the page switches to the raw host until it resets.
  var missing = {}, rawUntil = 0;
  function getRaw(path) { return fetch(LIVE + path, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  function getJSON(path) {
    var now = Date.now();
    if (missing[path] && now - missing[path] < 9e5) return Promise.resolve(null);
    // everyone reads the compressed, cached copy (about 8 times smaller, no hourly limit). Only maintenance notices and
    // ranks come this way, never deals, so the GitHub API (60 calls an hour, then errors) isn't worth it.
    if (now < rawUntil || !DEALS_ON || true) return getRaw(path);
    return fetch(API + path + "?ref=live", { cache: "no-cache", headers: { Accept: "application/vnd.github.raw+json" } })
      .then(function (r) {
        var left = +r.headers.get("x-ratelimit-remaining"), reset = +r.headers.get("x-ratelimit-reset");
        if (r.headers.get("x-ratelimit-remaining") !== null && left < 8) rawUntil = reset ? reset * 1000 : now + 36e5;
        if (r.status === 404) { missing[path] = now; return null; }
        if (!r.ok) throw r.status;
        delete missing[path]; return r.json();
      })
      .catch(function () { return getRaw(path); });
  }
  // ---------- maintenance: Nexon's Classic World notices, checked every half hour by a GitHub job
  // the last notice this browser saw draws straight away, so the page doesn't jump when the fresh copy lands
  var MAINT = null; try { MAINT = JSON.parse(localStorage.getItem("fm-maint") || "null"); } catch (e) {}
  function whenTxt(d) { return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  function timeTxt(d) { return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
  function renderMaint() {
    var bar = $("mbar"); if (!MAINT || !MAINT.notices) { bar.hidden = true; return; }
    var now = Date.now(), pick = null, kind = "";
    // the newest shop scan: scans landing after the maintenance started mean the game is back up, even when Nexon's
    // notice still says scheduled (they rarely update it)
    var lastScan = (D && ((!D.preview && (Lstat() || {}).lastT) || (D.kpi && D.kpi.last))) || 0;
    MAINT.notices.forEach(function (n) {
      var a = n.start ? Date.parse(n.start) : 0, b = n.end ? Date.parse(n.end) : 0;
      var back = a && lastScan > a + 20 * 6e4 && (!b || lastScan > b - H);
      var done = n.status === "completed" || back || (b && now - b > 6 * H);
      var k = "";
      if (!done && a && a <= now) k = "down";
      else if (!done && a > now && a - now < 7 * DAY) k = "soon";
      else if (done && b && now - b < 3 * H && now >= a) k = "done";
      var rank = { down: 3, soon: 2, done: 1 }[k] || 0;
      if (rank > ({ down: 3, soon: 2, done: 1 }[kind] || 0)) { pick = n; kind = k; }
    });
    if (!pick) { bar.hidden = true; return; }
    var a = pick.start ? new Date(pick.start) : null, b = pick.end ? new Date(pick.end) : null, t = "";
    if (kind === "down") t = b && now > b.getTime() ? "Classic World maintenance is running past " + timeTxt(b) + ". Nexon hasn't called it done yet." : "Classic World is down for maintenance" + (b ? " until about " + timeTxt(b) + " your time." : ".") + " Prices pause until the servers are back.";
    else if (kind === "soon") t = "Maintenance coming: " + whenTxt(a) + (b ? " to " + timeTxt(b) : "") + " your time. " + (pick.down || "Classic World servers go down.");
    else t = "Maintenance finished" + (b ? " at " + timeTxt(b) : "") + ". Classic World is back up.";
    // a short pill next to "Browse all items": it never pushes the board down when it arrives; the full text is on hover and on Nexon's page
    var tt = function (d) { return timeTxt(d).replace(":00", ""); };
    var sh = kind === "down" ? (b && now > b.getTime() ? "Maint. running late" : "Down" + (b ? " until " + tt(b) : " now")) : kind === "soon" ? "Maint. " + (a.toDateString() === new Date().toDateString() ? "today" : a.toLocaleDateString("en-US", { weekday: "short" })) + " " + tt(a) : "Servers back up";
    bar.className = "mbar " + kind; bar.href = pick.url; bar.hidden = false; bar.title = t + " Tap for Nexon's notice.";
    bar.setAttribute("aria-label", t + " Opens Nexon's notice.");
    $("mtext").textContent = sh;
  }
  var lastSig = "";
  // Live listings come from the Club FM Worker, open to everyone (rate limited and marked per copy).
  // A tiny public stamp says when the data last changed, so the bundle is asked for only when there is something new.
  var BUNDLE = null, bundleAt = -1, MEMBER = null;
  // signed out: sign in; signed in without Club or Mega Deals: how to earn it
  function gateText(signedIn) {
    var g = $("gate"); if (!g) return;
    g.querySelector("b").textContent = signedIn ? "Live listings and deals are a Mega Deals perk" : "See every live listing, seller, roll and deal";
    g.querySelector("span").textContent = signedIn ? "Prices are free for everyone. Mega Deals unlocks at 50,000 sales caught or the $100 Ko-fi tier." : "Prices are free for everyone. Listings and deals need Mega Deals.";
    g.querySelector("i").textContent = signedIn ? "How to earn it" : "Sign in with Discord";
    g.href = signedIn ? "contribute.html#earn" : ACCT + "/login?back=home";
  }
  // one request at a time: the early start below and the first poll share it
  var BUNDLE_P = null;
  function getBundle() {
    if (BUNDLE_P) return BUNDLE_P;
    BUNDLE_P = getBundle0().then(function (b) { BUNDLE_P = null; return b; }, function () { BUNDLE_P = null; return BUNDLE; });
    return BUNDLE_P;
  }
  function getBundle0() {
    // wait briefly for the server's finished board; when it landed, the raw listings wait until the page is idle
    return Promise.race([SNAP_P, new Promise(function (ok) { setTimeout(ok, 2500); })]).then(function () {
      if (SNAP_OK && !DEALS_ON) return BUNDLE;   // the server's board keeps refreshing on its own (snapRefresh)
      if (!ENGINE && DEALS_ON && (engineLive() || engineStart())) return BUNDLE;   // the club engine reads the listings
      return getBundle1();
    });
  }
  function getBundle1() {
    var cacheP = BUNDLE ? Promise.resolve() : bundleCached();   // the browser's saved copy is read while the stamp is fetched
    // the server's stamp of the newest upload: changes within seconds of a watcher publishing
    return fetch(ACCT + "/data/sig", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (sig) {
      if (sig && sig.v) return sig.v;
      return fetch(LIVE + "data/live.sig?t=" + Math.floor(Date.now() / 6e4), { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (s2) { return s2 && s2.at || 0; });
    }).then(function (at) {
      return BUNDLE ? at : cacheP.then(function () { return at; });
    }).then(function (at) {
      if (BUNDLE && at === bundleAt) return BUNDLE;
      // after the first full load, ask only for uploads newer than what we hold (a few KB, not megabytes);
      // the bundle is kept in this browser, so a return visit loads only what's new; a full reload every 6 hours
      // picks up anything trimmed or rewritten on the server
      var delta = BUNDLE && bundleFull && Date.now() - bundleFull < 6 * 36e5, since = delta ? bundleNewest() - 15 * 6e4 : 0;
      // a first visit starts with the last 30 hours (what's for sale now, a fraction of the size), shows it, then the
      // full history follows a few seconds later and fills in the weekly numbers
      var first = !BUNDLE && !bundleFull;
      if (first) { delta = true; since = Date.now() - 30 * 36e5; }
      mark("liveReq");
      return fetch(ACCT + "/data/live" + (delta ? "?after=" + since : ""), { credentials: "include", cache: "no-cache" }).then(function (r) {
        if (r.status === 401 || r.status === 403) { MEMBER = false; gateText(r.status === 403); $("gate").hidden = false; return null; }
        return r.ok ? r.json() : null;
      }).then(function (b) {
        mark("liveJson");
        if (b && first) {
          BUNDLE = b; bundleFull = 0; bundleAt = at; MEMBER = true; $("gate").hidden = true;
          setTimeout(function () { bundleAt = -1; poll(); }, 2500);
          return BUNDLE;
        }
        if (b) {
          if (delta) {
            var nb = {};
            Object.keys(BUNDLE).forEach(function (k) { nb[k] = BUNDLE[k]; });
            Object.keys(b).forEach(function (k) {
              var cur = (nb[k] || []).slice(), at0 = {};
              // an inbox day copy keeps its scanner, kind and day while its "at" moves, so the new copy replaces the old
              var dk = function (d) { return d.inbox && d.day ? "ib|" + d.inbox + "|" + d.src + "|" + d.day : (d.at || "") + "|" + (d.src || ""); };
              cur.forEach(function (d, i) { at0[dk(d)] = i; });
              (b[k] || []).forEach(function (d) { var key = dk(d); if (at0[key] != null) cur[at0[key]] = d; else cur.push(d); });
              nb[k] = cur;
            });
            BUNDLE = nb;
          } else { BUNDLE = b; bundleFull = Date.now(); }
          bundleAt = at; MEMBER = true; $("gate").hidden = true; bundleSave();
        }
        return BUNDLE;
      }).catch(function () { return BUNDLE; });
    });
  }
  var bundleFull = 0, bundleTried = false, saveT = null;
  function idb(mode, fn) {
    return new Promise(function (ok) {
      try {
        var rq = indexedDB.open("clubfm", 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore("kv"); };
        rq.onsuccess = function () { try { var tx = rq.result.transaction("kv", mode); var r = fn(tx.objectStore("kv")); tx.oncomplete = function () { ok(r && r.result); }; tx.onerror = tx.onabort = function () { ok(null); }; } catch (e) { ok(null); } };
        rq.onerror = function () { ok(null); };
      } catch (e) { ok(null); }
    });
  }
  function bundleCached() {
    if (bundleTried) return Promise.resolve(); bundleTried = true;
    return Promise.race([idb("readonly", function (st) { return st.get("bundle"); }), new Promise(function (ok) { setTimeout(ok, 1500); })]).then(function (c) {
      if (c && c.b && c.full && Date.now() - c.full < 6 * 36e5 && !BUNDLE) { BUNDLE = c.b; bundleFull = c.full; }
    });
  }
  function bundleSave() {
    clearTimeout(saveT);
    saveT = setTimeout(function () { var b = BUNDLE, f = bundleFull; if (b) idb("readwrite", function (st) { return st.put({ b: b, full: f, at: Date.now() }, "bundle"); }); }, 3000);
  }
  function bundleNewest() {
    var m = 0; Object.keys(BUNDLE || {}).forEach(function (k) { (BUNDLE[k] || []).forEach(function (d) { var t = Date.parse(d && d.at); if (t > m) m = t; }); });
    return m || Date.now() - 36e5;
  }
  // Club and Mega Deals: new listings every 15 seconds, so a deal shows up while it's still there to buy
  setInterval(function () { if (DEALS_ON && D && !document.hidden && !engineLive()) livePoll(); }, 15000);
  function livePoll() {
    getBundle().then(function (b) {
      FILES.forEach(function (f) { var x = b && b[f[0]]; if (Array.isArray(x)) { x.forEach(function (s) { s.who = f[1] || String(s.who || "Guest").slice(0, 16); }); live[f[0]] = x; } });
      var all = base.slice(); FILES.forEach(function (f) { if (live[f[0]]) all = all.concat(live[f[0]]); });
      var sig = FILES.map(function (f) { var x = live[f[0]]; return x ? x.length + ":" + (x[x.length - 1] || {}).at : "-"; }).join("|");
      if (sig === lastSig) return;
      lastSig = sig; scans = all; DIRTY = true; keepRows = $("rows").childElementCount; render(); keepRows = 0;
    });
  }
  function poll() {
    loadGone();
    if (Date.now() >= HELD && D) { HELD = Infinity; DIRTY = true; render(); }
    getJSON("data/maintenance.json").then(function (m) { if (m && m.notices) { MAINT = m; renderMaint(); try { localStorage.setItem("fm-maint", JSON.stringify(m)); } catch (e) {} } });
    getJSON("data/ranks.json").then(function (r) { if (r && r.who) { var ch = !RANKS || RANKS.updated !== r.updated; RANKS = r; if (ch && D) { DIRTY = true; render(); } } });
    // Visitors on the server's finished board (the snap) never download the raw listings: they are 6 MB and
    // building the board from them froze phones for 10 seconds. The snap refreshes itself; club members, a
    // missing or stale snap, and anyone already on raw listings keep the old path.
    rawWanted().then(function (want) { return want ? getBundle() : "skip"; }).then(function (b) {
      if (b === "skip") return "skip";
      FILES.forEach(function (f) { var x = b && b[f[0]]; if (Array.isArray(x)) { x.forEach(function (s) { s.who = f[1] || String(s.who || "Guest").slice(0, 16); }); live[f[0]] = x; } });
    }).then(function (sk) {
      if (sk === "skip") { livePill(); armed = true; wArmed = true; return; }
      var all = base.slice(); FILES.forEach(function (f) { if (live[f[0]]) all = all.concat(live[f[0]]); });
      var sig = FILES.map(function (f) { var x = live[f[0]]; return x ? x.length + ":" + (x[x.length - 1] || {}).at : "-"; }).join("|");
      var changed = sig !== lastSig; lastSig = sig; scans = all;
      loadGame().then(function () {
        if (changed) { DIRTY = true; keepRows = $("rows").childElementCount; render(); keepRows = 0; } else livePill();
        armed = true; wArmed = true;
      });
    });
  }
  // ---------- the club engine
  // Club members get every new listing within 15 seconds, and working thousands of raw listings out into the board
  // is a second or more of solid number crunching. A background worker (fmengine.js) runs this same file, builds the
  // board there and hands over the finished board, so the page itself never freezes. If the worker can't start or
  // goes quiet, the page falls back to building the board itself, the old way.
  var ENG = { T: null, sellSig: "", seq: 0 }, ENGW = null, ENG_ON = false, ENG_BROKEN = false, ENG_SELL = {}, ENG_WAIT = null;
  function engineMain() {
    self.onmessage = function (e) {
      var m = e.data || {};
      if (m.type === "ui") { Object.keys(m.ids || {}).forEach(function (k) { self.FM_ENGINE.ids[k] = m.ids[k]; }); engineTick(true); }
      else if (m.type === "poll") engineTick(false);
    };
    setClub(true);
    dbReady.then(function () { engineTick(true); });
  }
  function engineTick(force) {
    clearTimeout(ENG.T);
    // the scanner ranks feed the ladder that the build works out (names, streams), as the page's poll does
    var rk = Date.now() - (ENG.rk || 0) > 6e4 ? getJSON("data/ranks.json").then(function (r) { ENG.rk = Date.now(); if (r && r.who) { if (!RANKS || RANKS.updated !== r.updated) force = true; RANKS = r; } }) : Promise.resolve();
    rk.then(function () { return getBundle(); }).then(function (b) {
      if (MEMBER === false) { self.postMessage({ type: "denied" }); return; }
      FILES.forEach(function (f) { var x = b && b[f[0]]; if (Array.isArray(x)) { x.forEach(function (s) { s.who = f[1] || String(s.who || "Guest").slice(0, 16); }); live[f[0]] = x; } });
      var all = base.slice(); FILES.forEach(function (f) { if (live[f[0]]) all = all.concat(live[f[0]]); });
      var sig = FILES.map(function (f) { var x = live[f[0]]; return x ? x.length + ":" + (x[x.length - 1] || {}).at : "-"; }).join("|");
      var changed = force || sig !== lastSig; lastSig = sig; scans = all;
      var sell = {}, ss = ""; Object.keys(b || {}).forEach(function (k) { if (/-sell\.json$/.test(k) && Array.isArray(b[k])) { sell[k] = b[k]; ss += k + ":" + b[k].length + ":" + ((b[k][b[k].length - 1] || {}).at || "") + "|"; } });
      if (ss !== ENG.sellSig) { ENG.sellSig = ss; self.postMessage({ type: "sell", sell: sell }); }
      if (!changed || !hasRaw()) return;
      var t0 = Date.now(); D = build(); var t1 = Date.now();
      // handed over as number arrays moved across without copying (prices, times, sellers...), plus the rest as one
      // text: far quicker for the page to take in than a copy of the whole object
      var o = snapEncode(true, true); if (!o) return;
      var typed = {}, move = [], rest = {};
      Object.keys(o.cols).forEach(function (k) {
        var c = o.cols[k], num = function (a) { for (var q = 0; q < a.length; q++) if (typeof a[q] !== "number") return false; return true; };
        if (Array.isArray(c) && num(c)) { var f = new Float64Array(c); typed[k] = f; move.push(f.buffer); }
        else if (c && c.g && num(c.v)) { var g = new Int32Array(c.g), v = new Float64Array(c.v); typed[k] = { g: g, v: v }; move.push(g.buffer, v.buffer); }
        else rest[k] = c;
      });
      o.cols = rest;
      self.postMessage({ type: "board", text: JSON.stringify(o), typed: typed, ms: [t1 - t0, Date.now() - t1] }, move);
    }).catch(function (e) { self.postMessage({ type: "error", msg: String(e && e.stack || e).slice(0, 400) }); })
      .then(function () { ENG.T = setTimeout(function () { engineTick(false); }, 15000); });
  }
  function engineUI() { return { win: { value: $("win").value }, "f-spot": { checked: $("f-spot").checked } }; }
  function engineStart() {
    if (ENGINE || ENGW || ENG_BROKEN || !window.Worker || !MYSRC) return false;
    try { ENGW = new Worker("/fmengine.js?v=1"); } catch (e) { ENG_BROKEN = true; return false; }
    var ls = {}; try { for (var k = 0; k < localStorage.length; k++) { var key = localStorage.key(k); if (/^fm-/.test(key) && key !== "fm-summary") ls[key] = localStorage.getItem(key); } } catch (e) {}
    var ids = engineUI(); ["scan-data", "icon-ids"].forEach(function (id) { var n = $(id); if (n) ids[id] = { textContent: n.textContent }; });
    ENGW.onmessage = function (e) {
      var m = e.data || {};
      if (m.type === "board") {
        mark("engIn"); var seq = ++ENG.seq, j0 = null; try { j0 = JSON.parse(m.text); Object.keys(m.typed || {}).forEach(function (k) { j0.cols[k] = m.typed[k]; }); } catch (err) { j0 = null; }
        T0.engMs = m.ms; T0.engLen = m.text.length; if (window.FM_KEEPTEXT) window.FM_ENGTEXT = m.text;
        snapDecodeAsync(j0).then(function (d) {
          mark("engDec");
          if (!d || !DEALS_ON || seq !== ENG.seq) return;   // a newer board came in while this one was unpacked
          d.engine = true; clearTimeout(ENG_WAIT); ENG_ON = true; mark("engine");
          D = d; MEMBER = true; $("gate").hidden = true; lastBuild = Date.now(); DIRTY = false; SIDX = null;
          keepRows = $("rows").childElementCount; render(); keepRows = 0;
        });
      } else if (m.type === "sell") { ENG_SELL = m.sell || {}; if (state.tab === "sell") loadGame().then(function () { render(); }); }
      else if (m.type === "denied") { engineStop(true); MEMBER = false; gateText(!!ME_ACCT); $("gate").hidden = false; }
      else if (m.type === "error") { if (!ENG_ON) engineFail(m.msg); else if (window.console) console.warn("board engine:", m.msg); }
    };
    ENGW.onerror = function (e) { engineFail(e && e.message); };
    ENGW.postMessage({ type: "init", src: MYSRC, ids: ids, ls: ls });
    // nothing back in 40 seconds: build here instead
    ENG_WAIT = setTimeout(function () { if (!ENG_ON) engineFail("timeout"); }, 40000);
    return true;
  }
  function engineStop(keepBroken) { clearTimeout(ENG_WAIT); if (ENGW) { try { ENGW.terminate(); } catch (e) {} } ENGW = null; ENG_ON = false; if (keepBroken) ENG_BROKEN = true; }
  function engineFail(msg) {
    if (window.console) console.warn("board engine off, building here:", msg);
    engineStop(true);
    if (DEALS_ON) livePoll();
  }
  function enginePoke(ui) { if (ENGW) ENGW.postMessage(ui ? { type: "ui", ids: engineUI() } : { type: "poll" }); }
  function engineLive() { return !!ENGW && !ENG_BROKEN; }
  function updateBar() {
    fetch("download/version.json?t=" + Math.floor(Date.now() / 6e5), { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
      if (!v || !v.version || !v.date) return;
      var age = Date.now() - Date.parse(v.date), key = "fm-upd-hide";
      var hid = ""; try { hid = localStorage.getItem(key) || ""; } catch (e) {}
      var gath = false; try { gath = !!localStorage.getItem("fm-gatherer"); } catch (e) {}
      if (!gath) return;   // only people who downloaded or linked the watcher; everyone else never sees it
      if (!(age >= 0 && age < 7 * 864e5) || hid === v.version) return;
      $("utext").textContent = "For our fellow intel gatherers: update " + v.version + " is ready." + (v.notes ? " " + v.notes : "") + " Close your watcher and open start.bat to update.";
      $("ubar").hidden = false;
      $("ubarx").onclick = function () { $("ubar").hidden = true; try { localStorage.setItem(key, v.version); } catch (e) {} };
    }).catch(function () {});
  }
  updateBar();
  // The item list makes every name tidy, so the first real build waits for it (it is small and quick); the page
  // shell shows at once and the data lands in one pass instead of three.
  var dbReady = Promise.race([loadDB(), new Promise(function (ok) { setTimeout(ok, 2500); })]);
  if (ENGINE) { engineMain(); return; }
  mark("start"); render(); try { if (MAINT) renderMaint(); } catch (e) {} mark("render0"); rotateFinder(); remotePreview(); window.FM_T0 = T0;
  // the server's finished board first; the raw listings follow when the page is idle (straight away for deal holders)
  var SNAP_OK = false, SNAP_SEEN = 0, SNAP_DONE = null;
  function rawWanted() { return (SNAP_DONE || Promise.resolve()).then(function () { return DEALS_ON || !SNAP_OK || hasRaw() || !D || !D.snap; }, function () { return true; }); }
  // a newer copy of the server's board replaces this one, unless this browser has moved on to the raw listings
  function snapRefresh() {
    if (!SNAP_OK || hasRaw() || DEALS_ON || document.hidden) return;
    // a 1 KB check first: the board itself (3 MB) only downloads when the server has a newer one
    fetch("https://api.maplefm.gg/data/snap-status", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (st) {
      if (st && st.at && st.at === SNAP_SEEN) return null;
      if (st && st.at) SNAP_SEEN = st.at;
      return fetch("https://api.maplefm.gg/data/snap", { cache: "no-cache" });
    }).then(function (r) { return r && r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !D || !D.snap || j.at <= D.snapAt || hasRaw()) return;
      return snapDecodeAsync(j).then(function (d) {
      if (!d || !D || !D.snap || D.engine || DEALS_ON || hasRaw()) return;
      D = d; lastBuild = Date.now(); DIRTY = false; SIDX = null; keepRows = $("rows").childElementCount; render(); keepRows = 0;
      });
    }).catch(function () {});
  }
  fetch("https://api.maplefm.gg/data/snap-status", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (st) { if (st && st.at && !SNAP_SEEN) SNAP_SEEN = st.at; }).catch(function () {});
  SNAP_DONE = SNAP_P.then(function (j) { return snapDecodeAsync(j); }).then(function (d) {
    if (D && D.engine) return;   // the club engine's board already landed
    if (!d || hasRaw() || (D && !D.preview && !D.snap && D.list.length)) { getBundle(); return; }
    if (Date.now() - d.snapAt > 90 * 6e4) { getBundle(); return; }   // stale copy: build it here instead
    D = d; SNAP_OK = true; lastBuild = Date.now(); DIRTY = false; SIDX = null; mark("snap"); render(); mark("live");
    setInterval(snapRefresh, 90000);
  });
  dbReady.then(function () { poll(); setInterval(poll, 60000); }); setInterval(renderMaint, 60000);
})();
