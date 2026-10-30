// Scan from this tab: the browser scanner, started from the price board. One window: a short quest (share the
// game, find the channel, open a shop) that fills in as the scanner sees each step, a start button, and a line
// to sign in for Earn. Guests scan right away. The reader (scan/engine.js and its worker) loads only once
// someone opens this window.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var dlg = $("scandlg"); if (!dlg) return;
  var engine = null, acct = null, shops = 0, done = [0, 0, 0];
  var API = function () { return window.FM_API || "https://api.maplefm.gg"; };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function load() {
    if (engine) return engine;
    engine = new Promise(function (ok, no) {
      if (window.FMScan) return ok(window.FMScan);
      var s = document.createElement("script"); s.src = "/scan/engine.js?v=1";
      s.onload = function () { ok(window.FMScan); }; s.onerror = no; document.head.appendChild(s);
    }).then(function (F) { wire(F); F.boot(); return F; });
    return engine;
  }
  function status(t, cls) { var s = $("sc-status"); s.textContent = t || ""; s.className = "sc-status" + (cls ? " " + cls : ""); }
  function tick(n, on) {
    done[n - 1] = on ? 1 : 0; $("sc-c" + n).classList.toggle("done", !!on);
    var k = done[0] + done[1] + done[2];
    $("sc-prog").textContent = k === 3 ? "Done" : k + " / 3"; $("sc-bar").style.width = (k / 3 * 100) + "%";
  }
  function who() {
    var w = $("sc-acct"); w.textContent = "";
    if (acct) { w.appendChild(document.createTextNode("Scanning as ")); var b = document.createElement("b"); b.textContent = acct.ign || acct.name || "you"; w.appendChild(b); w.appendChild(document.createTextNode(". Every shop counts toward your Earn total.")); return; }
    w.appendChild(document.createTextNode("Scanning as a guest. "));
    var a = document.createElement("a"); a.href = API() + "/login?back=home"; a.className = "sc-dc"; a.textContent = "Sign in with Discord";
    a.addEventListener("click", function () { ls("fm-scan-resume", String(Date.now())); });
    w.appendChild(a); w.appendChild(document.createTextNode(" to get paid for your shops."));
  }
  function pill() {
    var F = window.FMScan, on = F && F.running();
    $("scanpill").hidden = !on || dlg.open;
    if (!on) return;
    var c = F.state.counts, n = c && c.hour ? c.hour.listings : 0;
    $("scanpill-t").textContent = "Scanning" + (F.state.chan ? " · CH " + F.state.chan : "") + " · " + shops + (shops === 1 ? " shop" : " shops") + (n ? " · " + n.toLocaleString("en-US") + " listings this hour" : "");
  }
  function running(on) {
    $("sc-go").classList.toggle("stop", on);
    $("sc-gotxt").textContent = on ? "Stop scanning" : "Start scanning";
    tick(1, on); pill();
  }
  var wired = false;
  function wire(F) {
    if (wired) return; wired = true;
    F.on(function (k, d) {
      if (k === "signed") { acct = d; who(); }
      if (k === "error") status(d === "unsupported" ? "This browser can't share a window. Use Chrome or Edge on a computer, or FM Watcher." : "The reader didn't start. Try Chrome or Edge, or FM Watcher.", "no");
      if (k === "status" && d === "not-shared") status("Nothing shared yet. Press Start and pick the game.");
      if (k === "ready" && F.running()) status("Reading. Open shops as usual.", "ok");
      if (k === "started") { running(true); status(d.ready ? "Reading. Open shops as usual." : "Warming up the reader…", "ok"); }
      if (k === "stopped") { running(false); status("Stopped. What you read is on its way to the board."); }
      if (k === "counts") pill();
      if (k === "result") {
        if (d.out.shop) shops++;
        tick(2, !!F.state.chan); tick(3, shops > 0);
        if (d.out.shop && shops === 1) status("First shop is in. Keep going; you can close this and use the board.", "ok");
        pill();
      }
    });
  }

  function open() {
    try { navigator.sendBeacon && navigator.sendBeacon(API() + "/hit", new Blob([JSON.stringify({ p: "#scan-tab", r: "", q: "" })], { type: "text/plain" })); } catch (e) {}
    if (!dlg.open) dlg.showModal();
    pill(); who();
    load().then(function (F) {
      if (!F.supported()) { status("Scanning from a tab needs Chrome or Edge on a computer. Phones and Safari can't share a game window. FM Watcher runs on any Windows PC.", "no"); $("sc-go").disabled = true; return; }
      F.me.then(function (a) { acct = a; who(); });
    }, function () { status("The scanner didn't load. Check your connection and try again.", "no"); });
  }
  window.openScanNow = open;
  $("sc-go").addEventListener("click", function () {
    load().then(function (F) {
      if (F.running()) { F.stop(); return; }
      status("Pick the MapleStory window in the list.");
      F.start();
    });
  });
  $("scanpill").addEventListener("click", open);
  dlg.addEventListener("close", pill);
  document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-scannow]"); if (t) { e.preventDefault(); open(); } });
  // back from Discord sign-in: carry on where they were
  var r = +ls("fm-scan-resume") || 0;
  if (r && Date.now() - r < 10 * 60e3) { ls("fm-scan-resume", null); setTimeout(open, 600); }
  if (/[#&]scan-tab\b/.test(location.hash)) setTimeout(open, 600);
})();
