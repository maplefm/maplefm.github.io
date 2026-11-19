// One board tab left open for MINUTES (default 60), heap sampled every 5 minutes. Visit beacon blocked.
const { chromium } = require("playwright");
const MIN = +(process.argv[2] || 60);
(async () => { const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.route(/classicrank\.com/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"data":[]}' }));   // automated checks stay off classicrank.com's keyless API (Nov 19 2026)
  await ctx.route(/api\.maplefm\.gg\/hit/, (r) => r.fulfill({ status: 204, body: "" }));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("https://maplefm.gg/", { waitUntil: "load" }); const t0 = Date.now(); const s = [];
  const c = await ctx.newCDPSession(p);
  for (;;) { await c.send("HeapProfiler.collectGarbage").catch(() => {}); const h = await p.evaluate(() => ({ heap: Math.round(performance.memory.usedJSHeapSize / 1e6), dom: document.getElementsByTagName("*").length }));
    s.push(Object.assign({ min: Math.round((Date.now() - t0) / 60000) }, h)); console.log(JSON.stringify(s[s.length - 1]));
    if (Date.now() - t0 > MIN * 60000) break; await p.waitForTimeout(5 * 60000); }
  const grow = s[s.length - 1].heap - s[1 < s.length ? 1 : 0].heap;
  console.log((grow < 40 && !errs.length ? "ok   " : "FAIL ") + "memory over " + MIN + " min: heap " + s.map((x) => x.heap).join(" → ") + " MB, DOM " + s[0].dom + " → " + s[s.length - 1].dom + (errs.length ? " | errors " + errs.slice(0, 2).join("; ") : ""));
  await b.close(); })();
