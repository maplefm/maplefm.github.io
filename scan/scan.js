// Club FM browser scanner page: the watcher's own window (its log lines, deal alerts, tips, counts) on top of
// scan/engine.js, which shares the game window and runs FM Watcher in a worker.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var F = window.FMScan;
  function num(n) { return Math.round(n).toLocaleString("en-US"); }
  function say(t, cls) { var s = $("status"); s.textContent = t; s.className = "status" + (cls ? " " + cls : ""); }
  var API = window.FM_API || "https://api.maplefm.gg";

  F.on(function (k, d) {
    if (k === "signed") {
      $("who").innerHTML = d ? "Signed in as <b></b>. Your scans count toward your Earn total." : 'Scanning as a guest. <a href="' + API + '/login?back=scan">Sign in with Discord</a> to earn from them.';
      if (d) $("who").querySelector("b").textContent = d.ign || d.name || "you";
    }
    if (k === "status" && d === "loading") say("Loading the reader, about 25 MB the first time…");
    if (k === "status" && d === "not-shared") say("Nothing shared. Press Start and pick the MapleStory window.", "");
    if (k === "ready") say(F.running() ? "Reading. Open shops in the Free Market as usual." : "Ready. Press Start and pick the MapleStory window.", "ok");
    if (k === "error") say(d === "unsupported" ? "This browser can't share a window. Use Chrome, Edge or Firefox on a computer." : "The reader didn't start: " + d + ". Try Chrome or Edge.", "no");
    if (k === "started") { $("start").hidden = true; $("stop").hidden = false; say(d.ready ? "Reading. Open shops in the Free Market as usual." : "Loading the reader, then reading starts…", "ok"); }
    if (k === "stopped") { $("start").hidden = false; $("stop").hidden = true; say("Stopped. Sending what you read…"); }
    if (k === "counts") show(d);
    if (k === "result") {
      var o = d.out, chan = F.state.chan;
      $("chnote").textContent = chan ? "Channel " + chan : "Channel not known yet: open the Change Channel window once (Esc, then Change Channel).";
      $("chnote").className = "small" + (chan ? "" : " warn");
      (o.log || []).forEach(addLog);
      if (o.error) addLog("error: " + o.error);
      $("perf").textContent = "Average look " + Math.round(d.avg) + " ms";
    }
  });
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
  function show(c) {
    if (!c || !c.today) return;
    [["hour", c.hour], ["today", c.today]].forEach(function (p) {
      var x = p[1]; $(p[0]).textContent = num(x.listings) + " listings · " + num(x.shops) + " shops · " + num(x.sales) + " sales caught · " + num(x.stats) + " stats read";
    });
  }

  $("name").value = F.name();
  $("name").addEventListener("change", function () { F.setName($("name").value); });
  $("sound").checked = F.sound();
  $("sound").addEventListener("change", function () { F.sound($("sound").checked); });
  $("start").addEventListener("click", function () { F.start(); });
  $("stop").addEventListener("click", function () { F.stop(); });
  if (!F.supported()) { say("This browser can't share a window. Use Chrome, Edge or Firefox on a computer.", "no"); $("start").disabled = true; }
  else F.boot();
})();
