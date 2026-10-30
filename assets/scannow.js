// Scan now: start the browser scanner right from the price board. Step 1 offers Discord sign-in or a guest skip,
// step 2 shows the three things the scanner needs and ticks each one off as it sees it happen. The reader
// (scan/engine.js and its worker) loads only once someone opens this window.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var dlg = $("scandlg"); if (!dlg) return;
  var engine = null, acct = undefined, shops = 0;
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
  function tick(n, on) { $("sc-c" + n).classList.toggle("done", !!on); }
  function step(n) {
    $("sc-1").hidden = n !== 1; $("sc-2").hidden = n !== 2;
    $("sc-step").textContent = acct ? "" : n + " of 2";
  }
  function who() {
    var w = $("sc-who"); w.textContent = "";
    if (acct) { w.appendChild(document.createTextNode("Scanning as ")); var b = document.createElement("b"); b.textContent = acct.ign || acct.name || "you"; w.appendChild(b); w.appendChild(document.createTextNode(". Your scans count toward Earn.")); }
    else { w.appendChild(document.createTextNode("Scanning as a guest. ")); var a = document.createElement("a"); a.href = (window.FM_API || "https://api.maplefm.gg") + "/login?back=home"; a.textContent = "Sign in"; a.addEventListener("click", resume); w.appendChild(a); w.appendChild(document.createTextNode(" to earn from it.")); }
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
    $("sc-gotxt").textContent = on ? "Stop scanning" : "Share your MapleStory window";
    tick(1, on); pill();
  }
  var wired = false;
  function wire(F) {
    if (wired) return; wired = true;
    F.on(function (k, d) {
      if (k === "signed") { acct = d; who(); }
      if (k === "error") status(d === "unsupported" ? "This browser can't share a window. Use Chrome or Edge on a computer, or FM Watcher." : "The reader didn't start. Try Chrome or Edge, or FM Watcher.", "no");
      if (k === "status" && d === "not-shared") status("Nothing shared. Press the button and pick the MapleStory window.");
      if (k === "ready" && F.running()) status("Reading. Open shops in the Free Market as usual.", "ok");
      if (k === "started") { running(true); status(d.ready ? "Reading. Open shops in the Free Market as usual." : "Loading the reader, then reading starts…", "ok"); }
      if (k === "stopped") { running(false); status("Stopped. What you read is on its way to the board."); }
      if (k === "counts") pill();
      if (k === "result") {
        if (d.out.shop) shops++;
        tick(2, !!F.state.chan); tick(3, shops > 0);
        if (d.out.shop && shops === 1) status("First shop read. Keep browsing, you can close this window.", "ok");
        pill();
      }
    });
    if (F.state.account !== undefined) { acct = F.state.account; who(); }
  }
  function resume() { ls("fm-scan-resume", String(Date.now())); }

  function open() {
    try { navigator.sendBeacon && navigator.sendBeacon((window.FM_API || "https://api.maplefm.gg") + "/hit", new Blob([JSON.stringify({ p: "#scan-now", r: "", q: "" })], { type: "text/plain" })); } catch (e) {}
    var F = window.FMScan;
    if (!F || !F.running()) { status(""); }
    if (!dlg.open) dlg.showModal();
    pill();
    load().then(function (F) {
      if (!F.supported()) { step(2); status("Scanning in the browser needs Chrome or Edge on a computer. Phones and Safari can't share a game window. FM Watcher works on any Windows PC.", "no"); $("sc-go").disabled = true; return; }
      F.me.then(function (a) { acct = a; who(); if (!F.running()) step(a || ls("fm-scan-guest") ? 2 : 1); else step(2); });
    }, function () { step(2); status("The scanner didn't load. Check your connection and try again.", "no"); });
  }
  window.openScanNow = open;
  $("sc-signin").addEventListener("click", resume);
  $("sc-skip").addEventListener("click", function () { ls("fm-scan-guest", "1"); step(2); });
  $("sc-go").addEventListener("click", function () {
    load().then(function (F) {
      if (F.running()) { F.stop(); return; }
      status("Pick the MapleStory window in the list.");
      F.start().then(function (ok) { if (ok) setTimeout(function () { if (F.running() && dlg.open && !shops) status("Reading. Open the Change Channel window once, then open shops.", "ok"); }, 4000); });
    });
  });
  $("scanpill").addEventListener("click", open);
  dlg.addEventListener("close", pill);
  document.addEventListener("click", function (e) { var t = e.target.closest && e.target.closest("[data-scannow]"); if (t) { e.preventDefault(); open(); } });
  // back from Discord sign-in: carry on where they were
  var r = +ls("fm-scan-resume") || 0;
  if (r && Date.now() - r < 10 * 60e3) { ls("fm-scan-resume", null); setTimeout(open, 600); }
  if (/[#&]scan-now\b/.test(location.hash)) setTimeout(open, 600);
})();
