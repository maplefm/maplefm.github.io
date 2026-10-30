// Club FM browser scanner page: shares the game window, hands frames to scan/worker.js (FM Watcher's own readers),
// shows what it read, and sends listings up the same way FM Watcher does. Pictures never leave this browser.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var API = window.FM_API || "https://api.maplefm.gg";
  var LIVE = "https://raw.githubusercontent.com/maplefm/maplefm.github.io/live/";
  var SEND_MS = 10 * 60e3, IDLE_MS = 30e3, MIN_GAP = 1000;
  var w = null, stream = null, track = null, reader = null, video = null, canvas = null, ctx2 = null;
  var running = false, busy = false, lastSend = 0, lastChange = 0, lastSig = "", hid = "", acct = null, typ = {};
  var stat = { frames: 0, shops: 0, rows: 0, ms: [] };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function num(n) { return Math.round(n).toLocaleString("en-US"); }
  function say(t, cls) { var s = $("status"); s.textContent = t; s.className = "status" + (cls ? " " + cls : ""); }
  function supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined"; }

  // typical prices for the "under typical" column: the board's public summary
  fetch(LIVE + "data/summary-public.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (sm) {
    (sm && sm.rows || []).forEach(function (r) { if (r.typ > 0 && r.kind === "sale") typ[r.item.toLowerCase()] = r.typ; });
  }).catch(function () {});

  // signed in: this browser's scanner joins the account like a linked FM Watcher, so pay and ranks see one person
  fetch(API + "/me", { credentials: "include" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (me) {
    acct = me && me.signedIn ? me.account : null;
    $("who").innerHTML = acct ? "Signed in as <b></b>. Your scans count toward your Earn total." : 'Scanning as a guest. <a href="' + API + '/login?back=scan">Sign in with Discord</a> to earn from them.';
    if (acct) $("who").querySelector("b").textContent = acct.ign || acct.name || "you";
    link();
  }).catch(function () { $("who").textContent = "Scanning as a guest."; });
  function link() {
    if (!/(^|\.)maplefm\.gg$/.test(location.hostname)) return;
    if (!acct || !acct.code || !hid || ls("fm-scan-linked") === hid) return;
    fetch(API + "/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: acct.code, hid: hid }) })
      .then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) ls("fm-scan-linked", hid); }).catch(function () {});
  }

  function boot() {
    if (w) return;
    w = new Worker("/scan/worker.js?v=1");
    w.onmessage = function (e) {
      var m = e.data;
      if (m.type === "ready") { hid = m.hid || ""; link(); if (running) { say("Reading. Open shops in the Free Market as usual.", "ok"); loop(); } else say("Ready. Press Start and pick the MapleStory window.", "ok"); }
      if (m.type === "error") say("The reader didn't start: " + m.error + ". Try Chrome or Edge.", "no");
      if (m.type === "result") done(m);
      if (m.type === "tick") loop();
      if (m.type === "published" || m.type === "counts") show(m.counts);
    };
    w.postMessage({ type: "init", api: API, dry: !/(^|\.)maplefm\.gg$/.test(location.hostname) });
    say("Loading the reader, about 20 MB the first time…");
  }

  async function start() {
    if (!supported()) { say("This browser can't share a window. Use Chrome, Edge or Firefox on a computer.", "no"); return; }
    try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5, displaySurface: "window" }, audio: false, selfBrowserSurface: "exclude", preferCurrentTab: false }); }
    catch (e) { say("Nothing shared. Press Start and pick the MapleStory window.", ""); return; }
    track = stream.getVideoTracks()[0];
    track.addEventListener("ended", stop);
    // Chrome and Edge hand frames over directly, even while this tab is in the background; others draw a hidden video
    if (window.MediaStreamTrackProcessor) reader = new MediaStreamTrackProcessor({ track: track, maxBufferSize: 1 }).readable.getReader();
    else { video = document.createElement("video"); video.muted = true; video.playsInline = true; video.srcObject = stream; await video.play().catch(function () {}); }
    running = true; lastChange = Date.now(); lastSend = Date.now();
    $("start").hidden = true; $("stop").hidden = false;
    boot();
    say("Reading. Open shops in the Free Market as usual.", "ok");
    if (hid) loop();
  }
  function stop() {
    if (!running) return;
    running = false;
    if (reader) { try { reader.cancel(); } catch (e) {} reader = null; }
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = track = video = null;
    $("start").hidden = false; $("stop").hidden = true;
    say("Stopped. Sending what you read…");
    send();
  }
  function send() { if (w) { lastSend = Date.now(); w.postMessage({ type: "publish", name: (ls("fm-scan-name") || "").slice(0, 16), ign: acct && acct.ign || "" }); } }

  // one frame at a time: the next is taken only once the last is read, and never sooner than a second later
  async function loop() {
    if (!running || busy) return;
    busy = true;
    var job = null, fw = 0, fh = 0;
    try {
      var bmp = null;
      if (reader) { var r = await reader.read(); if (r.done) { busy = false; stop(); return; } bmp = r.value; fw = bmp.displayWidth; fh = bmp.displayHeight; }
      else if (video && video.videoWidth) { bmp = video; fw = video.videoWidth; fh = video.videoHeight; }
      if (bmp && fw) {
        if (!canvas || canvas.width !== fw || canvas.height !== fh) { canvas = new OffscreenCanvas(fw, fh); ctx2 = canvas.getContext("2d", { willReadFrequently: true }); }
        ctx2.drawImage(bmp, 0, 0);
        if (reader) bmp.close();
        // only the middle of the game goes to the reader, plus the top left corner for the room
        // the middle 1040 pixels: the shop, its popups and the Change Channel window all open there
        var x0 = Math.max(0, Math.round(fw / 2) - 528), x1 = Math.min(fw, Math.round(fw / 2) + 528);
        var strip = ctx2.getImageData(x0, 0, x1 - x0, fh).data;
        var sig = sample(strip);
        // nothing there changed: skip the reading entirely
        if (sig !== lastSig) {
          lastSig = sig; lastChange = Date.now();
          var room = fw >= 400 && fh >= 60 ? ctx2.getImageData(0, 0, 400, 60).data : null;   // minimap title and title bar
          job = { type: "frame", id: Date.now(), px: strip, w: x1 - x0, h: fh, x0: x0, fw: fw, room: room };
        }
      }
    } catch (e) {}
    var idle = Date.now() - lastChange > IDLE_MS;
    $("idle").style.visibility = idle ? "visible" : "hidden";
    if (Date.now() - lastSend > SEND_MS) send();
    if (job) { w.postMessage(job, [job.px.buffer].concat(job.room ? [job.room.buffer] : [])); return; }   // busy until the result
    busy = false; later(idle ? 3000 : MIN_GAP);
  }
  // a timer from the worker side keeps its pace while this tab is in the background
  function later(ms) { if (w) w.postMessage({ type: "wait", ms: ms }); }
  function sample(d) {
    var h = 0;
    for (var i = 0; i < d.length; i += 4 * 97) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
    return String(h);
  }
  function done(m) {
    busy = false;
    stat.frames++; stat.ms.push(m.ms); if (stat.ms.length > 50) stat.ms.shift();
    var o = m.out || {};
    if (o.ch_set || (o.channel && o.channel.n)) chan = o.ch_set || o.channel.n;
    if (o.ch !== undefined) chan = o.ch;
    $("chnote").textContent = chan ? "Channel " + chan : "Channel not known yet: open the Change Channel window once (Esc, then Change Channel).";
    $("chnote").className = "small" + (chan ? "" : " warn");
    if (o.shop && o.shop.rows) { stat.shops++; stat.rows += o.shop.rows.length; shopView(Object.assign({ ch: chan }, o.shop), o.tip); }
    $("perf").textContent = "Last read " + Math.round(m.ms) + " ms";
    // wait at least as long as the reading took, so the reader stays a small share of the computer
    later(Math.max(MIN_GAP, m.ms * 3));
    if (stat.frames % 5 === 1) w.postMessage({ type: "counts" });
  }
  var lastView = "", chan = null;
  function shopView(s, tip) {
    var key = JSON.stringify([s.seller, s.room, s.ch, s.rows, tip && tip.stats && tip.stats._ok ? tip.item + JSON.stringify(tip.stats) : ""]);
    if (key === lastView) return; lastView = key;
    $("seller").textContent = s.seller + (s.room ? " · " + s.room : "") + (s.ch ? " ch " + s.ch : "");
    var tb = $("rows"); tb.textContent = "";
    s.rows.forEach(function (r) {
      var tr = document.createElement("tr"), unit = r.p / Math.max(1, r.q), t = typ[r.i.toLowerCase()];
      var off = t && unit < t ? Math.round((1 - unit / t) * 100) : 0;
      [r.i + (r.q > 1 ? " ×" + r.q : ""), num(r.p), t ? num(t) : "", off >= 10 ? off + "% under" : "", r.so ? "Sold" : ""].forEach(function (v, i) {
        var td = document.createElement("td"); td.textContent = v; if (i && i < 3) td.className = "n"; if (i === 3 && off >= 25) td.className = "deal"; tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    if (tip && tip.stats && tip.stats._ok) {
      var st = Object.keys(tip.stats).filter(function (k) { return !/^_|_b$/.test(k); }).map(function (k) { return k + " " + tip.stats[k]; }).join(", ");
      $("lasttip").textContent = "Stats read: " + tip.item + " " + st;
    }
  }
  function show(c) {
    if (!c || !c.today) return;
    [["hour", c.hour], ["today", c.today]].forEach(function (p) {
      var x = p[1]; $(p[0]).textContent = num(x.listings) + " listings · " + num(x.shops) + " shops · " + num(x.sales) + " sales caught · " + num(x.stats) + " stats read";
    });
  }

  $("name").value = ls("fm-scan-name") || "";
  $("name").addEventListener("change", function () { ls("fm-scan-name", $("name").value.trim().slice(0, 16)); });
  $("start").addEventListener("click", start);
  $("stop").addEventListener("click", stop);
  addEventListener("pagehide", function () { if (running && w) send(); });
  if (!supported()) { say("This browser can't share a window. Use Chrome, Edge or Firefox on a computer.", "no"); $("start").disabled = true; }
  else boot();
})();
