// Live listings on the server-built board: answers /data/fast with test listings (never posts real ones) and checks one
// appears in its item card without a reload, a deal under 10 minutes old stays hidden, one past 10 minutes shows.
//   node tests/live-fresh.cjs chromium|webkit [https://maplefm.gg/]
const { chromium, webkit, devices } = require('playwright');
const ITEM = "Gloves Attack Scroll: Intermediate";
(async () => {
  const which = process.argv[2] || "chromium", base = process.argv[3] || "http://localhost:8830/";
  const bt = which === "webkit" ? webkit : chromium, opt = which === "webkit" ? devices['iPhone 13'] : { viewport: { width: 1400, height: 900 } };
  const b = await bt.launch(); const ctx = await b.newContext(opt); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let serve = false, calls = 0;
  await p.route('https://api.maplefm.gg/data/fast', r => {
    calls++; const t = Math.floor(Date.now() / 1000);
    const docs = serve ? [{ at: new Date().toISOString(), src: "watcher-shop", who: "PartnerTool", inbox: "fast-17b7", rows: [
      { s: "LiveTestShop", i: ITEM, p: 1650000, q: 1, t: t - 5, r: "FM7", c: 3 }, { s: "LiveHeldShop", i: ITEM, p: 1300000, q: 1, t: t - 5, r: "FM7", c: 3 },
      { s: "LiveDealShop", i: ITEM, p: 1300000, q: 1, t: t - 620, r: "FM7", c: 3 },
      { s: "LiveTestShop", i: "Not A Real Item Name", p: 5000, q: 1, t: t - 5, r: "FM7", c: 3 }] }] : [];
    r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ at: Date.now(), docs }) });
  });
  const t0 = Date.now();
  await p.goto(base + '#item=' + encodeURIComponent(ITEM), { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => document.querySelectorAll('#rows tr, #rows > *').length > 5, null, { timeout: 90000 });
  await p.waitForTimeout(3000);
  // open the item's card
  const before = await p.evaluate(() => (document.getElementById('side') || document.body).innerText);
  const hadShop = before.includes("LiveTestShop");
  serve = true; const tServe = Date.now();
  let seen = 0;
  for (let k = 0; k < 40; k++) { await p.waitForTimeout(2000); const tx = await p.evaluate(() => (document.getElementById('side') || document.body).innerText); if (tx.includes("LiveTestShop")) { seen = Date.now() - tServe; break; } }
  const after0 = 1;
  const after = await p.evaluate(() => ({ side: (document.getElementById('side') || document.body).innerText, fresh: window.FM_FRESH || null, url: location.href }));
  const mem = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null);
  console.log(JSON.stringify({ which, loadS: Math.round((tServe - t0) / 1000), hadShopBefore: hadShop, appearedAfterS: seen ? Math.round(seen / 1000) : "never", dealAfterHoldShown: after.side.includes("LiveDealShop"), heldShown: after.side.includes("LiveHeldShop"), table: await (async () => { await p.evaluate(() => { const x = document.getElementById("sheetx"); if (x) x.click(); }); await p.fill("#q", "gloves attack scroll"); await p.waitForTimeout(2500); return p.evaluate((n) => { const r = [...document.querySelectorAll("#rows tr")].find(x => x.innerText.includes(n)); return r ? r.innerText.replace(/\s+/g, " ").slice(0, 200) : "row not on first page"; }, ITEM); })(), fresh: after.fresh, fastCalls: calls, errors: errs.slice(0, 3), heapMB: mem }));
  const i = after.side.indexOf("LiveTestShop"); console.log("card text near it:", JSON.stringify(after.side.slice(Math.max(0, i - 200), i + 80)));
  await p.screenshot({ path: `/tmp/claude-0/qa/live/${which}.png` });
  await b.close();
})();
