// The board scrolled like a person does it, on a phone (finger swipes) or a desktop (mouse wheel over the table), with
// this checkout's board files. Checks what the Nov 25 smoothness fixes touched:
//   1. more rows arrive while scrolling, never twice, in one unbroken list with "Loading more…" last
//   2. board row icons load with their row (no lazy icons in the table)
//   3. the Big sales strip holds still while the page scrolls and slides again once the scroll stops
//   4. a search typed while rows are still arriving leaves no rows from the old list behind
//   5. an item card opens from a tapped row and closes back to the same place, with the same rows
//   6. frame times while scrolling (printed; fails only when over 40% of frames miss 30 fps), no script errors
// Run: NODE_PATH=$(npm root -g) node tests/smooth-ux.cjs [chromium|webkit] [phone|desktop]   (exit 1 on any failure)
const pw = require("playwright"), ENGINE = pw[process.argv[2] || "chromium"], PHONE = (process.argv[3] || "phone") === "phone";
const fs = require("fs"), R = require("path").join(__dirname, "..") + "/";
(async () => {
  const b = await ENGINE.launch(); const ctx = await b.newContext(PHONE ? Object.assign({}, pw.devices["iPhone 13"]) : { viewport: { width: 1440, height: 900 } });
  await ctx.route(/classicrank\.com/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"data":[]}' }));   // automated checks stay off classicrank.com's keyless API
  await ctx.route(/api\.maplefm\.gg\/hit/, (r) => r.fulfill({ status: 204, body: "" }));   // never count a test as a visitor
  await ctx.route(/^https:\/\/maplefm\.gg\/(\?[^#]*)?$|^https:\/\/maplefm\.gg\/assets\/(board\.min\.js|board\.min\.css|advsearch\.js|kofigoal\.js)/, (r) => { const u = new URL(r.request().url()); const f = u.pathname === "/" ? "index.html" : u.pathname.slice(1); r.fulfill({ status: 200, contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html", body: fs.readFileSync(R + f) }); });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const log = [], ok = (c, m) => log.push((c ? "ok   " : "FAIL ") + m);
  const cdp = ENGINE === pw.chromium ? await ctx.newCDPSession(p) : null;
  async function swipe(n) {
    for (let i = 0; i < n; i++) {
      if (PHONE && cdp) {
        const T = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: 195, y }] });
        await T("touchStart", 560); for (let y = 560; y > 120; y -= 30) { await T("touchMove", y); await p.waitForTimeout(16); } await T("touchEnd");
      } else if (PHONE) { await p.evaluate(() => window.scrollBy(0, 450)); }
      else { await p.mouse.move(500, 520); await p.mouse.wheel(0, 500); }
      await p.waitForTimeout(80);
    }
  }
  const rowsInfo = () => p.evaluate(() => { const t = [...document.querySelectorAll("#rows > tr")]; const it = t.filter((r) => r.dataset.item).map((r) => r.dataset.item); return { n: it.length, uniq: new Set(it).size, moreLast: !t.some((r, i) => r.classList.contains("more-row") && i !== t.length - 1), moreRows: t.filter((r) => r.classList.contains("more-row")).length }; });
  await p.goto("https://maplefm.gg/"); await p.waitForSelector("#rows tr[data-item]", { timeout: 60000 }); await p.waitForTimeout(4000);
  const r0 = await rowsInfo();
  ok(r0.n > 0 && r0.n <= 80, "board starts with its first rows (" + r0.n + ")");
  // 1, 3, 6: scroll with frame times recorded
  await p.evaluate(() => { window.__f = []; window.__still = 0; let l = performance.now(); const f = (t) => { if (!window.__f) return; window.__f.push(t - l); l = t; const tk = document.getElementById("tickbar"); if (tk && tk.classList.contains("still")) window.__still++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await swipe(PHONE ? 24 : 30);
  const fr = await p.evaluate(() => { const a = window.__f.slice(1); window.__f = null; return { a, still: window.__still }; });
  await p.waitForTimeout(1200);
  const r1 = await rowsInfo();
  ok(r1.n > r0.n, "more rows arrive while scrolling (" + r0.n + " → " + r1.n + ")");
  ok(r1.uniq === r1.n, "no row shows twice (" + r1.uniq + " of " + r1.n + " distinct)");
  ok(r1.moreLast && r1.moreRows <= 1, "one Loading more row at most, and it is last");
  ok(fr.still > 0, "Big sales strip holds still during the scroll (" + fr.still + " frames)");
  const s = [...fr.a].sort((x, y) => x - y), jank = fr.a.filter((x) => x > 33.4).length / Math.max(1, fr.a.length);
  ok(jank <= 0.4, "frames while scrolling: " + fr.a.length + ", median " + Math.round(s[s.length >> 1]) + " ms, 95th " + Math.round(s[Math.floor(s.length * 0.95)]) + " ms, " + Math.round(jank * 100) + "% over 33 ms");
  // 2
  const lazy = await p.evaluate(() => [...document.querySelectorAll("#rows .itc img")].filter((i) => i.loading === "lazy").length);
  ok(lazy === 0, "board row icons load with their row (" + lazy + " lazy)");
  // 3: back at the top, the strip slides again
  await p.evaluate(() => window.scrollTo(0, 0)); if (!PHONE) await p.evaluate(() => { const t = document.querySelector("#prices-view .tbox"); if (t) t.scrollTop = 0; });
  // the strip slides again 250 ms after the scroll stops; a slow CI runner can take a few seconds to say it is back in view
  let still = true;
  // a touch fling or rows still landing can carry the page a few px past the top again (CI saw y 35, strip fully above
  // the screen, rightly still): put it back at the top on each look so the check is about the strip, not the scroll
  for (let k = 0; k < 10 && still !== false; k++) { await p.waitForTimeout(500); still = await p.evaluate(() => { if (window.scrollY > 0) window.scrollTo(0, 0); const t = document.getElementById("tickbar"); return t ? t.classList.contains("still") : null; }); }
  const why = still === false ? "" : await p.evaluate(() => { const t = document.getElementById("tickbar"); const r = t && t.getBoundingClientRect(); return JSON.stringify({ y: window.scrollY, top: r && Math.round(r.top), h: r && Math.round(r.height), vh: innerHeight, scrolling: document.documentElement.classList.contains("fm-scrolling"), cls: t && t.className }); });
  ok(still === false, "Big sales strip slides again once the scroll stops and it is in view" + (why ? " | " + why : ""));
  // 4: a search typed while rows are still arriving
  await swipe(3);
  await p.fill("#q", "gloves"); await p.waitForTimeout(2000);
  const r2 = await rowsInfo();
  const stray = await p.evaluate(() => [...document.querySelectorAll("#rows > tr[data-item]")].filter((r) => !/glove/i.test(r.dataset.item)).length);
  ok(r2.uniq === r2.n && r2.n > 0, "search while rows load: " + r2.n + " rows, none twice");
  log.push((stray ? "note " : "ok   ") + "rows without \"glove\" in the name after searching gloves: " + stray + " (the search also matches other words)");
  await p.fill("#q", ""); await p.waitForTimeout(2000);
  // 5: card opens and closes back to the same place
  await swipe(4); await p.waitForTimeout(800);
  const pos = () => p.evaluate(() => { const t = document.querySelector("#prices-view .tbox"); return Math.round(window.scrollY + (t ? t.scrollTop : 0)); });
  const before = await pos(), rb = await rowsInfo();
  const tr = await p.$("#rows tr[data-item]:nth-child(5)"); await tr.scrollIntoViewIfNeeded();
  const at = await pos();
  const t0 = Date.now(); await tr.click();
  await p.waitForFunction(() => document.body.classList.contains("sheet") || document.body.classList.contains("bigcard"), null, { timeout: 15000 }).catch(() => {});
  const opened = await p.evaluate(() => document.body.classList.contains("sheet") || document.body.classList.contains("bigcard"));
  ok(opened, "tapping a row opens its card (" + (Date.now() - t0) + " ms)");
  await p.waitForTimeout(1200);
  if (PHONE) { const bk = await p.$("#sheetback"); if (bk && (await bk.isVisible())) await bk.click(); else await p.goBack(); } else await p.keyboard.press("Escape");
  await p.waitForFunction(() => !document.body.classList.contains("sheet") && !document.body.classList.contains("bigcard"), null, { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(800);
  const after = await pos(), ra = await rowsInfo();
  ok(Math.abs(after - at) <= 60, "closing the card goes back to the same place (" + at + " → " + after + ")");
  ok(ra.n >= rb.n && ra.uniq === ra.n, "the same rows are there after closing (" + rb.n + " → " + ra.n + ")");
  ok(!errs.length, "no script errors" + (errs.length ? " | " + errs.slice(0, 3).join(" | ") : ""));
  console.log((PHONE ? "phone" : "desktop") + "\n" + log.join("\n")); await b.close(); process.exit(log.some((x) => x.startsWith("FAIL")) ? 1 : 0);
})();
