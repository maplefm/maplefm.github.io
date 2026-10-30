// Club FM browser scanner engine: shares the game window and hands its frames to /scan/worker.js, where FM Watcher
// itself runs. Used by the /scan/ page and by the Scan now window on the price board. Pictures never leave this
// browser; the watcher sends listings up exactly as the download does.
//   FMScan.boot()            load the reader (about 25 MB the first time), without asking for anything
//   FMScan.start()           ask for the game window and start reading; resolves true once a window is shared
//   FMScan.stop()            stop and send what was read
//   FMScan.on(fn)            fn(event, data) for: status, ready, error, result, counts, started, stopped, signed
//   FMScan.setName(name)     the guest scanner name
(function () {
  if (window.FMScan) return;
  var API = window.FM_API || "https://api.maplefm.gg";
  var SEND_MS = 10 * 60e3, FAST = 120, SLOW = 1000;
  var w = null, stream = null, track = null, reader = null, video = null;
  var running = false, waiting = false, lastSend = 0, hid = "", acct = null, ready = false, fns = [];
  var S = { looks: 0, ms: [], chan: null, shops: 0, shared: false, account: null, counts: null };
  function emit(k, d) { fns.forEach(function (f) { try { f(k, d); } catch (e) {} }); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function onSite() { return /(^|\.)maplefm\.gg$/.test(location.hostname); }
  function supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined"; }

  // signed in: this browser's scanner joins the account like a linked FM Watcher, so pay and ranks see one person
  var me = fetch(API + "/me", { credentials: "include" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
    acct = m && m.signedIn ? m.account : null; S.account = acct; link(); who(); emit("signed", acct); return acct;
  }).catch(function () { emit("signed", null); return null; });
  function link() {
    if (!onSite() || !acct || !acct.code || !hid || ls("fm-scan-linked") === hid) return;
    fetch(API + "/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: acct.code, hid: hid }) })
      .then(function (r) { return r.json(); }).then(function (j) { if (j && j.ok) ls("fm-scan-linked", hid); }).catch(function () {});
  }
  function myName() { return (ls("fm-scan-name") || "").slice(0, 16); }
  function who() { if (w && ready) w.postMessage({ type: "who", name: myName(), ign: acct && acct.ign || "" }); }

  function boot() {
    if (w || !supported()) return;
    w = new Worker("/scan/worker.js?v=3");
    w.onmessage = function (e) {
      var m = e.data;
      if (m.type === "ready") { ready = true; hid = m.hid || ""; link(); who(); emit("ready", m); if (running) next(0); }
      if (m.type === "error") emit("error", m.error);
      if (m.type === "result") done(m);
      if (m.type === "tick") look();
      if (m.type === "published" || m.type === "counts") { S.counts = m.counts; emit("counts", m.counts); }
    };
    w.postMessage({ type: "init", api: API, dry: !onSite(), name: myName(), ign: acct && acct.ign || "" });
    emit("status", "loading");
  }

  async function start() {
    if (!supported()) { emit("error", "unsupported"); return false; }
    if (running) return true;
    try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10, displaySurface: "window", cursor: "always" }, audio: false, selfBrowserSurface: "exclude", preferCurrentTab: false }); }
    catch (e) { emit("status", "not-shared"); return false; }
    track = stream.getVideoTracks()[0];
    track.addEventListener("ended", stop);
    // Chrome and Edge hand frames over directly, even while this tab is in the background; others draw a hidden video
    if (window.MediaStreamTrackProcessor) reader = new MediaStreamTrackProcessor({ track: track, maxBufferSize: 1 }).readable.getReader();
    else { video = document.createElement("video"); video.muted = true; video.playsInline = true; video.srcObject = stream; await video.play().catch(function () {}); }
    running = true; S.shared = true; lastSend = Date.now();
    boot();
    emit("started", { ready: ready });
    if (ready) next(0);
    return true;
  }
  function stop() {
    if (!running) return;
    running = false;
    if (reader) { try { reader.cancel(); } catch (e) {} reader = null; }
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = track = video = null;
    emit("stopped");
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
    S.looks++; S.ms.push(m.ms); if (S.ms.length > 50) S.ms.shift();
    var o = m.out || {};
    if (window.__outs) window.__outs.push(o);
    if (o.ch !== undefined && o.ch) S.chan = o.ch;
    if (o.channel) S.chan = o.channel;
    if (o.shop) S.shops++;
    (o.sound || []).forEach(beep);
    emit("result", { out: o, ms: m.ms, avg: S.ms.reduce(function (a, b) { return a + b; }, 0) / S.ms.length });
    if (Date.now() - lastSend > SEND_MS) send();
    if (S.looks % 20 === 1) w.postMessage({ type: "counts" });
    // never more than a third of the time reading, so the game keeps its frame rate
    next(Math.max(o.busy ? FAST : SLOW, m.ms * 2));
  }
  // the watcher's sounds: a high blip for a popup read, a low one for a miss, two rising notes for a hover wanted
  var AC = null;
  function tone(f, ms, at) {
    var o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = f; g.gain.value = 0.06;
    o.connect(g); g.connect(AC.destination); o.start(AC.currentTime + at); o.stop(AC.currentTime + at + ms / 1000);
  }
  function beep(kind) {
    if (ls("fm-scan-sound") === "0") return;
    try { AC = AC || new AudioContext(); } catch (e) { return; }
    if (kind === "ok") tone(1400, 70, 0); else if (kind === "miss") tone(500, 140, 0); else { tone(900, 60, 0); tone(1300, 90, 0.07); }
  }
  addEventListener("pagehide", function () { if (running && w) send(); });

  window.FMScan = {
    boot: boot, start: start, stop: stop, send: send, supported: supported, me: me, state: S,
    running: function () { return running; }, isReady: function () { return ready; },
    on: function (f) { fns.push(f); },
    name: myName, setName: function (n) { ls("fm-scan-name", String(n || "").trim().slice(0, 16)); who(); },
    sound: function (on) { if (on === undefined) return ls("fm-scan-sound") !== "0"; ls("fm-scan-sound", on ? "1" : "0"); },
    counts: function () { if (w && ready) w.postMessage({ type: "counts" }); }
  };
})();
