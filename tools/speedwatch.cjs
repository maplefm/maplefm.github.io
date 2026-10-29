// Daily speed watch on the live site: the pages most visitors open, on a slowed-down phone and a desktop, in Chromium,
// WebKit (Safari) and Firefox. Each number is compared with the baseline the first run recorded. A number counts as
// slower only when it is past its budget on two runs in a row, so one noisy run never raises an alarm.
//   node tools/speedwatch.cjs DATA_DIR [rebase]
// Writes DATA_DIR/speed.json (latest numbers, history, streaks) and DATA_DIR/speed-base.json (the baseline).
// Exits 1 when something has stayed over budget, so the watchdog's "Jobs still failing" alert tells the admins.
const pw = require("playwright"), fs = require("fs"), path = require("path");
const DIR = process.argv[2] || "data", REBASE = process.argv[3] === "rebase";
const SITE = "https://maplefm.gg";
const PAGES = ["/", "/market.html", "/quests.html", "/quest/pios-collecting-recycled-goods/", "/map.html", "/training/level-30-40/", "/item/work-gloves/", "/contribute.html"];
const RUNS = [
  ["chromium", "phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, 4],
  ["chromium", "desktop", { viewport: { width: 1440, height: 900 } }, 1],
  ["webkit", "phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, 1],
  ["firefox", "desktop", { viewport: { width: 1440, height: 900 } }, 1],
];
// how far past the baseline counts as slower: a share of the baseline plus a fixed allowance for noise
const BUDGET = { load: [1.5, 800], ltMax: [1.5, 120], ltSum: [1.5, 300], cls: [1, 0.05], heapMB: [1.3, 25], kb: [1.3, 150] };
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch (e) { return d; } };

async function measure(bn, prof, opts, cpu, pg) {
  const b = await pw[bn].launch(process.env.SW_PROXY ? { proxy: { server: process.env.SW_PROXY } } : {});   // SW_PROXY: only for runs behind a proxy
  try {
    const o = Object.assign({ ignoreHTTPSErrors: !!process.env.SW_PROXY }, opts); if (bn === "firefox") { delete o.isMobile; delete o.hasTouch; }
    const ctx = await b.newContext(o);
    await ctx.route("https://api.maplefm.gg/hit**", (r) => r.fulfill({ status: 204, body: "" }));   // never count ourselves as visitors
    await ctx.addInitScript(() => {
      window.__lt = []; window.__cls = 0;
      try { localStorage.setItem("fm-play", JSON.stringify({ lv: 35, fam: 1 })); } catch (e) {}
      try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: "longtask", buffered: true }); } catch (e) {}
      try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: "layout-shift", buffered: true }); } catch (e) {}
    });
    const p = await ctx.newPage();
    if (bn === "chromium" && cpu > 1) { const s = await ctx.newCDPSession(p); await s.send("Emulation.setCPUThrottlingRate", { rate: cpu }); }
    const t0 = Date.now();
    await p.goto(SITE + pg + (pg.includes("?") ? "&" : "?") + "sw=" + Date.now(), { waitUntil: "load", timeout: 60000 });
    const load = Date.now() - t0;
    await p.waitForTimeout(4000);
    for (let i = 0; i < 6; i++) { await p.evaluate(() => window.scrollBy(0, 600)); await p.waitForTimeout(150); }
    const m = await p.evaluate(() => {
      const res = performance.getEntriesByType("resource").concat(performance.getEntriesByType("navigation"));
      const kb = res.reduce((a, r) => a + (r.transferSize || 0), 0) / 1024;
      return { lt: window.__lt, cls: window.__cls, heap: performance.memory ? performance.memory.usedJSHeapSize / 1e6 : null, kb };
    });
    await ctx.close();
    const out = { load };
    if (bn === "chromium") { out.ltMax = Math.round(Math.max(0, ...m.lt)); out.ltSum = Math.round(m.lt.reduce((a, x) => a + Math.max(0, x - 50), 0)); out.cls = +m.cls.toFixed(3); out.heapMB = Math.round(m.heap); }
    if (bn !== "webkit" && m.kb > 0) out.kb = Math.round(m.kb);
    return out;
  } finally { await b.close(); }
}

(async () => {
  const now = {};
  for (const [bn, prof, opts, cpu] of RUNS) {
    for (const pg of PAGES) {
      const key = bn + " " + prof + " " + pg;
      // two loads, keep the better of each number: a slow network moment isn't the page getting slower
      let best = null;
      for (let k = 0; k < 2; k++) {
        try {
          const r = await measure(bn, prof, opts, cpu, pg);
          best = best ? Object.fromEntries(Object.keys(r).map((m) => [m, Math.min(r[m], best[m] != null ? best[m] : r[m])])) : r;
        } catch (e) { console.log("could not measure", key, String(e.message || e).slice(0, 120)); }
      }
      if (best) { now[key] = best; console.log(key, JSON.stringify(best)); }
    }
  }
  if (Object.keys(now).length < 10) { console.log("too few pages measured; nothing compared"); process.exit(0); }
  let base = read("speed-base.json", null);
  if (!base || REBASE) { base = { at: Date.now(), pages: now }; console.log(REBASE ? "baseline reset" : "first run: baseline recorded"); }
  const prev = read("speed.json", { streak: {}, history: [] });
  const streak = {}, over = [];
  for (const key of Object.keys(now)) {
    const b = base.pages[key]; if (!b) { base.pages[key] = now[key]; continue; }
    for (const m of Object.keys(now[key])) {
      if (b[m] == null || !BUDGET[m]) continue;
      const lim = b[m] * BUDGET[m][0] + BUDGET[m][1];
      if (now[key][m] > lim) {
        const id = key + " " + m; streak[id] = (prev.streak[id] || 0) + 1;
        if (streak[id] >= 2) over.push(`${key}: ${m} ${now[key][m]} (baseline ${b[m]}, budget ${Math.round(lim * 1000) / 1000})`);
      }
    }
  }
  const hist = (prev.history || []).concat([{ at: Date.now(), over: over.length }]).slice(-60);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, "speed.json"), JSON.stringify({ at: Date.now(), pages: now, streak, over, history: hist }, null, 1));
  fs.writeFileSync(path.join(DIR, "speed-base.json"), JSON.stringify(base, null, 1));
  if (over.length) { console.log("SLOWER THAN THE BASELINE ON TWO RUNS IN A ROW:\n" + over.join("\n")); process.exit(1); }
  console.log("all pages within budget");
})();
