// Read an item tooltip from a screenshot, in the browser: finds the tooltip, reads its text, and returns the item
// name and its stat rolls. Classic World prints a roll as "Weapon Attack: +35 (32 +3)": the value, then the base and
// the difference in brackets, so the roll can be read straight off the tooltip. Nothing is uploaded anywhere.
//   fmReadTip(fileOrBlob, { names: [item names], base: name -> {ATT:.., SLOTS:..} | null, progress: fn })
(function () {
  var TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  var LABELS = [
    ["ATT", /[wvy]{1,2}eapon\s*att\w*/i], ["MATT", /(?:m|hi|rn)agic\s*att\w*/i], ["WDEF", /[wvy]{1,2}eapon\s*de[ft]\w*\.?/i], ["MDEF", /(?:m|hi|rn)agic\s*de[ft]\w*\.?/i],
    ["HP", /max\s*hp/i], ["MP", /max\s*mp/i], ["ACC", /accura\w*/i], ["AVOID", /evasion|avoid\w*/i],
    ["SPEED", /speed/i], ["JUMP", /jump/i], ["STR", /\bstr\b/i], ["DEX", /\bdex\b/i], ["INT", /\bint\b/i], ["LUK", /\bluke?\b/i],
    ["SLOTS", /re(?:m|rn)aining\s*enhanc\w*|upgrades?\s*avail\w*|number\s*of\s*upgrades?\w*/i], ["SUCCESS", /success\s*rate|success/i]
  ];
  // the sign is small and often misread ("«7", "t7"), so up to two stray marks may sit between the label and the number
  var VAL = /^\s*[.:;]*\s*[^\d\s(]{0,2}\s*(\d{1,4})\s*%?(?:\s*[\(\[{]\s*(\d{1,4})(?:\s*([+\-~]?)\s*(\d{1,3}))?)?/;
  var ORDER = ["ATT", "MATT", "STR", "DEX", "INT", "LUK", "ACC", "AVOID", "SPEED", "JUMP", "HP", "MP", "WDEF", "MDEF"];
  var SHOW = { WDEF: "W.DEF", MDEF: "M.DEF" };

  var libP = null;
  function lib() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (libP) return libP;
    libP = new Promise(function (ok, bad) { var s = document.createElement("script"); s.src = TESS; s.onload = function () { ok(window.Tesseract); }; s.onerror = function () { libP = null; bad(new Error("Couldn't load the reader. Check your connection.")); }; document.head.appendChild(s); });
    return libP;
  }
  var workerP = null;
  function worker(progress) {
    if (workerP) return workerP;
    workerP = lib().then(function (T) { return T.createWorker("eng", 1, { logger: function (m) { if (progress && m && m.status === "recognizing text") progress(m.progress); } }); });
    workerP.catch(function () { workerP = null; });
    return workerP;
  }

  function loadImage(file) {
    return new Promise(function (ok, bad) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { ok(im); setTimeout(function () { URL.revokeObjectURL(u); }, 1000); };
      im.onerror = function () { bad(new Error("That file isn't a picture we can open.")); };
      im.src = u;
    });
  }

  // the tooltip's thin light border: a long light line down its left side meeting a long light line across its top
  function findBox(px, W, H) {
    var edge = new Uint8Array(W * H);
    for (var i = 0, p = 0; i < W * H; i++, p += 4) { var r = px[p], g = px[p + 1], b = px[p + 2]; edge[i] = r > 165 && g > 165 && b > 155 && Math.abs(r - b) < 40 && Math.abs(r - g) < 30 ? 1 : 0; }
    function runV(x) { var best = [0, 0], run = 0, st = 0; for (var y = 0; y < H; y++) { if (edge[y * W + x]) { if (!run) st = y; run++; if (run > best[1]) best = [st, run]; } else run = 0; } return best; }
    function runH(y, from) { var best = [0, 0], run = 0, st = 0; for (var x = Math.max(0, from - 4); x < W; x++) { if (edge[y * W + x]) { if (!run) st = x; run++; if (run > best[1]) best = [st, run]; } else { if (run && st > from + 4) break; run = 0; } } return best; }
    var cands = [];
    for (var x = 0; x < W; x++) { var v = runV(x); if (v[1] >= 70) cands.push([x, v[0], v[1]]); }
    cands.sort(function (a, b) { return b[2] - a[2]; });
    for (var c = 0; c < Math.min(cands.length, 60); c++) {
      var x0 = cands[c][0], y0 = cands[c][1], n = cands[c][2];
      for (var dy = 0; dy <= 3 && y0 + dy < H; dy++) {
        var h = runH(y0 + dy, x0);
        if (h[1] >= 120 && Math.abs(h[0] - x0) <= 4) return { x: x0 + 1, y: y0 + 1, w: h[1] - 2, h: n - 2 };
      }
    }
    return null;
  }

  // no border found: the tooltip is the biggest dark, bluish patch on the screen
  function findDark(px, W, H) {
    var S = 8, cw = Math.floor(W / S), ch = Math.floor(H / S); if (cw < 4 || ch < 4) return null;
    var cell = new Uint8Array(cw * ch);
    for (var cy = 0; cy < ch; cy++) for (var cx = 0; cx < cw; cx++) {
      var n = 0, t = 0;
      for (var y = cy * S; y < cy * S + S; y += 2) for (var x = cx * S; x < cx * S + S; x += 2) { var p = (y * W + x) * 4, r = px[p], g = px[p + 1], b = px[p + 2]; t++; if (Math.max(r, g, b) < 115 && b >= r - 5) n++; else if (Math.min(r, g, b) > 200) n += 0.6; }
      cell[cy * cw + cx] = n / t >= 0.55 ? 1 : 0;
    }
    var seen = new Uint8Array(cw * ch), best = null;
    for (var i = 0; i < cw * ch; i++) {
      if (!cell[i] || seen[i]) continue;
      var q = [i], area = 0, x0 = cw, y0 = ch, x1 = 0, y1 = 0; seen[i] = 1;
      while (q.length) { var j = q.pop(), jx = j % cw, jy = (j / cw) | 0; area++; if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
        [j - 1, j + 1, j - cw, j + cw].forEach(function (k) { if (k >= 0 && k < cw * ch && !seen[k] && cell[k] && Math.abs((k % cw) - jx) <= 1) { seen[k] = 1; q.push(k); } }); }
      var bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      // a tooltip is a solid box, not a long dark strip or the whole screen
      if (area >= 30 && area >= bw * bh * 0.6 && bw < cw * 0.7 && bh < ch * 0.9 && (!best || area > best.area)) best = { area: area, x: x0, y: y0, w: bw, h: bh };
    }
    return best ? { x: best.x * S, y: best.y * S, w: best.w * S, h: best.h * S } : null;
  }

  // a found box can be the frame around the icon inside the tooltip: grow it out to the edges of the dark tooltip panel,
  // so the name at the top and the last stat line are inside too
  function grow(px, W, H, box) {
    function dark(x, y) { var p = (y * W + x) * 4, r = px[p], g = px[p + 1], b = px[p + 2]; return Math.max(r, g, b) < 150 && b >= r - 8; }
    function rowOk(y, x0, x1) { var n = 0, t = 0; for (var x = x0; x <= x1; x += 2) { t++; if (dark(x, y)) n++; } return t && n / t >= 0.55; }
    function colOk(x, y0, y1) { var n = 0, t = 0; for (var y = y0; y <= y1; y += 2) { t++; if (dark(x, y)) n++; } return t && n / t >= 0.55; }
    var x0 = box.x, y0 = box.y, x1 = box.x + box.w - 1, y1 = box.y + box.h - 1, lim = Math.max(W, H), miss;
    for (var pass = 0; pass < 2; pass++) {
      for (miss = 0; y0 > 0 && miss < 4 && box.y - y0 < lim; ) { if (rowOk(y0 - 1, x0, x1)) { y0--; miss = 0; } else { y0--; miss++; } } y0 += miss;
      for (miss = 0; y1 < H - 1 && miss < 4; ) { if (rowOk(y1 + 1, x0, x1)) { y1++; miss = 0; } else { y1++; miss++; } } y1 -= miss;
      for (miss = 0; x0 > 0 && miss < 4; ) { if (colOk(x0 - 1, y0, y1)) { x0--; miss = 0; } else { x0--; miss++; } } x0 += miss;
      for (miss = 0; x1 < W - 1 && miss < 4; ) { if (colOk(x1 + 1, y0, y1)) { x1++; miss = 0; } else { x1++; miss++; } } x1 -= miss;
    }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  // light text on the dark tooltip becomes dark text on white, the way the reader likes it
  function prep(im) {
    var W = im.naturalWidth, H = im.naturalHeight, k = Math.min(1, 2400 / Math.max(W, H));
    var c = document.createElement("canvas"); c.width = Math.round(W * k); c.height = Math.round(H * k);
    var x = c.getContext("2d"); x.drawImage(im, 0, 0, c.width, c.height);
    var d = x.getImageData(0, 0, c.width, c.height), box = findBox(d.data, c.width, c.height) || findDark(d.data, c.width, c.height);
    var sx = 0, sy = 0, sw = c.width, sh = c.height;
    if (box) { var g0 = grow(d.data, c.width, c.height, box); sx = g0.x; sy = g0.y; sw = g0.w; sh = g0.h; }
    var scale = box ? 3 : (Math.max(sw, sh) < 900 ? 3 : 2);
    var o = document.createElement("canvas"); o.width = Math.round(sw * scale); o.height = Math.round(sh * scale);
    var ox = o.getContext("2d"); ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = "high";
    ox.drawImage(c, sx, sy, sw, sh, 0, 0, o.width, o.height);
    // a full-colour copy of just the tooltip, for a listing's picture; never the whole screen, so chat and names stay private
    var pic = null;
    if (box) { var gb = grow(d.data, c.width, c.height, box), pd = 3, px0 = Math.max(0, gb.x - pd), py0 = Math.max(0, gb.y - pd), pw = Math.min(c.width - px0, gb.w + pd * 2), ph = Math.min(c.height - py0, gb.h + pd * 2);
      pic = document.createElement("canvas"); pic.width = pw; pic.height = ph; pic.getContext("2d").drawImage(c, px0, py0, pw, ph, 0, 0, pw, ph); }
    var od = ox.getImageData(0, 0, o.width, o.height), p = od.data;
    // dark background or light? a light screenshot (rare) is read as it is
    var sum = 0; for (var i = 0; i < p.length; i += 40) sum += (p[i] + p[i + 1] + p[i + 2]) / 3;
    var darkBg = sum / (p.length / 40) < 128;
    for (var j = 0; j < p.length; j += 4) {
      var m = Math.min(p[j], p[j + 1], p[j + 2]), v;
      if (darkBg) v = m <= 140 ? 255 : m >= 215 ? 0 : Math.round(255 - (m - 140) * 3.4);
      else { var mx = Math.max(p[j], p[j + 1], p[j + 2]); v = mx; }
      p[j] = p[j + 1] = p[j + 2] = v;
    }
    ox.putImageData(od, 0, 0);
    return { canvas: o, box: !!box, pic: pic };
  }

  function normName(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 6) return 99;
    var prev = [], cur, i, j; for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) { cur = [i]; for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[b.length];
  }
  // the line that spells a known item, allowing a few misread letters
  function matchName(lines, names) {
    var idx = names.map(function (n) { return [normName(n), n]; });
    var best = null;
    lines.slice(0, 8).forEach(function (t, li) {
      var words = t.replace(/\(\+\d+\)/g, "").split(/\s+/);
      for (var drop = 0; drop < Math.min(3, Math.max(1, words.length - 1)); drop++) {
        var n = normName(words.slice(drop).join(" ")); if (n.length < 4) break;
        idx.forEach(function (e) {
          var d = e[0] === n ? 0 : lev(n, e[0]), r = 1 - d / Math.max(n.length, e[0].length);
          var score = r - li * 0.01 - drop * 0.02;
          if (r >= 0.84 && (!best || score > best.score || (score === best.score && e[1].length > best.name.length))) best = { name: e[1], score: score };
        });
      }
    });
    return best ? best.name : "";
  }

  function parse(text, names, baseOf) {
    var lines = String(text || "").split(/\n/).map(function (t) { return t.replace(/：/g, ":").replace(/\s+/g, " ").trim(); }).filter(function (t) { return t.replace(/[^A-Za-z0-9]/g, "").length >= 3; });
    var stats = {};
    // bonuses sit below the "Type:" line; above it are requirements ("REQ DEX: 25"), often misread as FEG or PER
    var ty = -1; lines.slice(0, 14).some(function (t, i) { if (/\bt[yv]pe\b/i.test(t)) { ty = i; return true; } return false; });
    lines.forEach(function (t, li) {
      if (ty >= 0 && li <= ty && !/success|re(?:m|rn)aining|upgrade/i.test(t)) return;
      for (var i = 0; i < LABELS.length; i++) {
        var k = LABELS[i][0], rx = LABELS[i][1], m = rx.exec(t);
        if (!m || stats[k] != null) continue;
        // "REQ STR: 35" is a requirement, not a bonus
        if (/^(STR|DEX|INT|LUK)$/.test(k) && /re\S?\s*$/i.test(t.slice(Math.max(0, m.index - 5), m.index))) continue;
        if (k === "SUCCESS") { var sv = /(100|60|10)/.exec(t.slice(m.index + m[0].length)); if (sv) stats.SUCCESS = +sv[1]; break; }
        var v = VAL.exec(t.slice(m.index + m[0].length)); if (!v) continue;
        stats[k] = +v[1];
        if (v[2]) { var base = +v[2], diff = stats[k] - base; if (diff && Math.abs(diff) <= 10 && (!v[4] || +v[4] === Math.abs(diff))) stats[k + "_b"] = base; }
        break;
      }
    });
    // scrolls show their base name and a success rate: 100% Lesser, 60% Intermediate, 10% Greater
    var TIER = { 100: "Lesser", 60: "Intermediate", 10: "Greater" }, bases = {};
    names.forEach(function (n) { var m = /^(.*Scroll): (Lesser|Intermediate|Greater)$/.exec(n); if (m) bases[m[1]] = 1; });
    var name = matchName(lines, names.concat(Object.keys(bases)));
    if (bases[name]) { var tier = TIER[stats.SUCCESS]; name = tier && names.indexOf(name + ": " + tier) >= 0 ? name + ": " + tier : ""; }
    if (/: (Lesser|Intermediate|Greater)$/.test(name)) { delete stats.SUCCESS; }
    var base = name && baseOf ? baseOf(name) : null, parts = [], known = 0;
    ORDER.forEach(function (k) {
      if (stats[k] == null) return;
      var b = stats[k + "_b"] != null ? stats[k + "_b"] : base ? (base[k] || 0) : null;
      if (b == null) return;
      known++;
      var d = stats[k] - b; if (d) parts.push((d > 0 ? "+" : "") + d + " " + (SHOW[k] || k));
    });
    // every stat it showed sits at the item's base
    if (known && !parts.length) parts.push("clean");
    delete stats.SUCCESS;
    if (stats.SLOTS != null) parts.push(stats.SLOTS + (stats.SLOTS === 1 ? " slot" : " slots"));
    // every stat the tooltip shows, each with its gain over the item's base: "STR 3 · LUK 8 (+5) · W.DEF 40 · 7 slots"
    var full = [];
    ORDER.forEach(function (k) {
      if (stats[k] == null) return;
      var b0 = stats[k + "_b"] != null ? stats[k + "_b"] : base ? (base[k] || 0) : null, g = b0 == null ? 0 : stats[k] - b0;
      full.push((SHOW[k] || k) + " " + stats[k] + (g ? " (" + (g > 0 ? "+" : "") + g + ")" : ""));
    });
    if (stats.SLOTS != null) full.push(stats.SLOTS + (stats.SLOTS === 1 ? " slot" : " slots"));
    return { name: name, stats: stats, statsText: parts.join(", "), statsFull: full.join(" · "), lines: lines };
  }

  window.fmReadTip = function (file, opt) {
    opt = opt || {};
    return loadImage(file).then(function (im) {
      var pr = prep(im);
      return worker(opt.progress).then(function (w) { return w.recognize(pr.canvas); }).then(function (r) {
        var out = parse(r && r.data ? r.data.text : "", opt.names || [], opt.base);
        out.box = pr.box;
        // a picture only when an item was read off it: a wrong box (the chat window, say) is never posted
        if (pr.pic && out.name) { var u = pr.pic.toDataURL("image/png"); if (u.length > 1.9e6) u = pr.pic.toDataURL("image/jpeg", 0.9); out.pic = u.length <= 1.9e6 ? u : ""; }
        return out;
      });
    });
  };
  window.fmParseTip = parse;   // for tests
})();
