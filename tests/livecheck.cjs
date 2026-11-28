// live site check: board loads, an item opens, search works, no script errors, memory; item, quest and map pages load
const pw = require('playwright'); const { devices } = pw; const chromium = pw[process.argv[2] || 'chromium'];
(async () => {
  const b = await chromium.launch(); const out = {};
  for (const mode of ['phone', 'desktop']) {
    const ctx = await b.newContext(mode === 'phone' ? devices['iPhone 13'] : { viewport: { width: 1400, height: 900 } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const t0 = Date.now(); await p.goto('https://maplefm.gg/'); await p.waitForSelector('#rows tr[data-item]', { timeout: 60000 });
    const load = Date.now() - t0; await p.waitForTimeout(3000);
    const rows = await p.locator('#rows tr[data-item]').count();
    const tr = p.locator('#rows tr[data-item]').nth(3); const nm = await tr.getAttribute('data-item'); await tr.click(); await p.waitForTimeout(2500);
    const card = await p.evaluate(() => { const c = document.querySelector('#sheet, #detail, .sheet, [role=dialog]'); return c ? c.innerText.slice(0, 120) : document.body.innerText.includes('Where to buy'); });
    if (mode === 'phone') { const bk = await p.$('#sheetback'); if (bk && await bk.isVisible()) await bk.click(); else await p.goBack(); } else await p.keyboard.press('Escape');
    await p.waitForTimeout(800);
    await p.fill('#q', 'gloves'); await p.waitForTimeout(2500);
    const sr = await p.evaluate(() => [...document.querySelectorAll('#rows > tr[data-item]')].map(r => r.dataset.item));
    const heap = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null);
    out[mode] = { loadMs: load, rows, opened: nm, card: typeof card === 'string' ? card.replace(/\s+/g, ' ').slice(0, 80) : card, searchRows: sr.length, searchSample: sr.slice(0, 3), errors: errs.slice(0, 3), heapMB: heap };
    await ctx.close();
  }
  const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  for (const u of ['https://maplefm.gg/item/'+process.env.IT+'/', 'https://maplefm.gg/quest/a-box-hidden-long-ago/', 'https://maplefm.gg/map/1st-accompaniment-1st-stage/']) {
    const r = await p.goto(u); out[u] = { status: r && r.status(), title: (await p.title()).slice(0, 60) };
  }
  out.pageErrors = errs.slice(0, 3);
  console.log(JSON.stringify(out, null, 1)); await b.close();
  const bad = ['phone', 'desktop'].some((m) => !out[m].rows || !out[m].searchRows || out[m].errors.length) || out.pageErrors.length || Object.keys(out).some((k) => /^https/.test(k) && out[k].status !== 200);
  if (bad) { console.log('FAILED'); process.exit(1); }
})();
