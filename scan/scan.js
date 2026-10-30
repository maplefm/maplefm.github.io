// Club FM browser scanner page: shares the game window and hands its frames to scan/worker.js, where FM Watcher
// itself runs. Shows the watcher's own window (its log lines, deal alerts, tips, counts) and plays its sounds.
// Pictures never leave this browser; the watcher sends listings up exactly as the download does.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var API = window.FM_API || "https://api.maplefm.gg";
  var SEND_MS = 10 * 60e3, FAST = 120, SLOW = 1000;
  var w = null, stream = null, track = null, reader = null, video = null;
  var running = false, waiting = false, lastSend = 0, hid = "", acct = null, chan = null, ready = false;
  var stat = { looks: 0, ms: [] };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function num(n) { return Math.round(n).toLocaleString("en-US"); }
  function say(t, cls) { var s = $("status"); s.textContent = t; s.className = "status" + (cls ? " " + cls : ""); }
  function supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined"; }
  function onSite() { return /(^|\.)maplefm\.gg$/.test(location.hostname); }

  // signed in: this browser's scanner joins the account like a linked FM Watcher, so pay and ranks see one person
  fetch(API + "/me", { credentials: "include" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (me) {
    acct = me && me.signedIn ? me.account : null;
    $("who").innerHTML = acct ? "Signed in as <b></b>. Your scans count toward your Earn total." : 'Scanning as a guest. <a href="' + API + '/login?back=scan">Sign in with Discord</a> to earn from them.';
    if (acct) $("who").querySelector("b").textContent = acct.ign || acct.name || "you";
    link(); who();
  }).catch(function () { $("who").textContent = "Scanning as a guest."; });
  function link() {
    if (!onSite() || !acct || !acct.code || !hid || ls("fm-scan-linked") === hid) return;
    fetch(API + "/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: acct.code, hid: hid }) })
      .then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) ls("fm-scan-linked", hid); }).catch(function () {});
  }
  function myName() { return (ls("fm-scan-name") || "").slice(0, 16); }
  function who() { if (w && ready) w.postMessage({ type: "who", name: myName(), ign: acct && acct.ign || "" }); }

  function boot() {
    if (w) return;
    w = new Worker("/scan/worker.js?v=2");
    w.onmessage = function (e) {
      var m = e.data;
      if (m.type === "ready") { ready = true; hid = m.hid || ""; link(); who(); say(running ? "Reading. Open shops in the Free Market as usual." : "Ready. Press Start and pick the MapleStory window.", "ok"); if (running) next(0); }
      if (m.type === "error") say("The reader didn't start: " + m.error + ". Try Chrome or Edge.", "no");
      if (m.type === "result") done(m);
      if (m.type === "tick") look();
      if (m.type === "published" || m.type === "counts") show(m.counts);
    };
    w.postMessage({ type: "init", api: API, dry: !onSite(), name: myName(), ign: acct && acct.ign || "" });
    say("Loading the reader, about 25 MB the first time…");
  }

  async function start() {
    if (!supported()) { say("This browser can't share a window. Use Chrome, Edge or Firefox on a computer.", "no"); return; }
    try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10, displaySurface: "window", cursor: "always" }, audio: false, selfBrowserSurface: "exclude", preferCurrentTab: false }); }
    catch (e) { say("Nothing shared. Press Start and pick the MapleStory window.", ""); return; }
    track = stream.getVideoTracks()[0];
    track.addEventListener("ended", stop);
    // Chrome and Edge hand frames over directly, even while this tab is in the background; others draw a hidden video
    if (window.MediaStreamTrackProcessor) reader = new MediaStreamTrackProcessor({ track: track, maxBufferSize: 1 }).readable.getReader();
    else { video = document.createElement("video"); video.muted = true; video.playsInline = true; video.srcObject = stream; await video.play().catch(function () {}); }
    running = true; lastSend = Date.now();
    $("start").hidden = true; $("stop").hidden = false;
    boot();
    say("Reading. Open shops in the Free Market as usual.", "ok");
    if (ready) next(0);
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
  function send() { if (w && ready) { lastSend = Date.now(); w.postMessage({ type: "publish" }); } }

  // one look at a time, at FM Watcher's pace: ten a second while a shop is open, once a second otherwise.
  // The timer runs in the worker, so it keeps its pace while this tab sits behind the game.
  function next(ms) { if (w) w.postMessage({ type: "wait", ms: ms }); }
  async function look() {
    if (!running || waiting) return;
    waiting = true;
    try {
      var f = null;
      if (reader) { var r = await reader.read(); if (r.done) { waiting = false; stop(); return; } f = r.value; }
      else if (video && video.videoWidth) f = await createImageBitmap(video);
      if (f) { w.postMessage({ type: "frame", frame: f }, [f]); return; }   // waiting until the result
    } catch (e) {}
    waiting = false; next(SLOW);
  }
  function done(m) {
    waiting = false;
    stat.looks++; stat.ms.push(m.ms); if (stat.ms.length > 50) stat.ms.shift();
    var o = m.out || {};
    if (window.__outs) window.__outs.push(o);
    if (o.ch !== undefined) chan = o.ch;
    if (o.channel) chan = o.channel;
    $("chnote").textContent = chan ? "Channel " + chan : "Channel not known yet: open the Change Channel window once (Esc, then Change Channel).";
    $("chnote").className = "small" + (chan ? "" : " warn");
    (o.log || []).forEach(addLog);
    (o.sound || []).forEach(beep);
    if (o.error) addLog("error: " + o.error);
    var avg = stat.ms.reduce(function (a, b) { return a + b; }, 0) / stat.ms.length;
    $("perf").textContent = "Average look " + Math.round(avg) + " ms";
    if (Date.now() - lastSend > SEND_MS) send();
    if (stat.looks % 20 === 1) w.postMessage({ type: "counts" });
    // never more than a third of the time reading, so the game keeps its frame rate
    next(Math.max(o.busy ? FAST : SLOW, m.ms * 2));
  }
  // the watcher's window: its own lines, newest at the bottom
  var LOGN = 60;
  function addLog(line) {
    var box = $("log"), p = document.createElement("div");
    p.textContent = line;
    if (/ DEAL |^\S+ DEAL|deal/i.test(line)) p.className = "deal";
    else if (/^\S+ (read |stats )/.test(line)) p.className = "ok";
    var stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
    box.appendChild(p);
    while (box.childNodes.length > LOGN) box.removeChild(box.firstChild);
    if (stick) box.scrollTop = box.scrollHeight;
  }
  // the watcher's sounds: a high blip for a popup read, a low one for a miss, two rising notes for a hover wanted
  var AC = null;
  function tone(f, ms, at) {
    var o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = f; g.gain.value = 0.06;
    o.connect(g); g.connect(AC.destination); o.start(AC.currentTime + at); o.stop(AC.currentTime + at + ms / 1000);
  }
  function beep(kind) {
    if (!$("sound").checked) return;
    try { AC = AC || new AudioContext(); } catch (e) { return; }
    if (kind === "ok") tone(1400, 70, 0); else if (kind === "miss") tone(500, 140, 0); else { tone(900, 60, 0); tone(1300, 90, 0.07); }
  }
  function show(c) {
    if (!c || !c.today) return;
    [["hour", c.hour], ["today", c.today]].forEach(function (p) {
      var x = p[1]; $(p[0]).textContent = num(x.listings) + " listings · " + num(x.shops) + " shops · " + num(x.sales) + " sales caught · " + num(x.stats) + " stats read";
    });
  }

  $("name").value = myName();
  $("name").addEventListener("change", function () { ls("fm-scan-name", $("name").value.trim().slice(0, 16)); who(); });
  $("sound").checked = ls("fm-scan-sound") !== "0";
  $("sound").addEventListener("change", function () { ls("fm-scan-sound", $("sound").checked ? "1" : "0"); });
  $("start").addEventListener("click", start);
  $("stop").addEventListener("click", stop);
  addEventListener("pagehide", function () { if (running && w) send(); });
  if (!supported()) { say("This browser can't share a window. Use Chrome, Edge or Firefox on a computer.", "no"); $("start").disabled = true; }
  else boot();
})();
