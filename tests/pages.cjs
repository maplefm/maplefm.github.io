// Battle test: every page type on one browser setup. Run: node tests/pages.cjs <chromium|webkit|firefox|android> [out.json]
// Live site. SWAP=1 serves this checkout's index.html, board and stat search files in place of the live ones (same
// origin, so the API answers). Headless browsers are skipped by the site's visit counter.
const { chromium, webkit, firefox, devices } = require("playwright");
const fs = require("fs"), path = require("path");
const R = path.join(__dirname, "..");
const SETUP = process.argv[2] || "chromium", OUT = process.argv[3] || "";
const B = "https://maplefm.gg";
const PAGES = ["/", "/#item=Work%20Gloves", "/#item=Gloves%20Attack%20Scroll%3A%20Intermediate", "/#item=Bunny%20Slippers", "/#item=Brown%20Felt%20Hat",
  "/item/work-gloves/", "/item/gloves-attack-scroll-60/", "/item/megaphone/", "/item/kitty-camping-hat/",
  "/quest/a-box-hidden-long-ago/", "/map/ellinia/", "/monster/mushmom/", "/training/level-40-50/",
  "/items/", "/items/scrolls/", "/items/equipment/", "/items/weapons/", "/items/cash-shop/", "/items/etc/", "/items/potions/", "/items/throwing-stars/", "/items/class/", "/items/class/warrior/",
  "/quests/", "/quests/level-30-40/", "/maps/", "/monsters/", "/training/", "/training/thief/", "/crafting/", "/crafting/smithing/", "/guides/", "/guides/price-an-item/", "/recap/", "/bot/",
  "/market.html", "/shop.html", "/quests.html", "/map.html", "/contribute.html", "/earn.html", "/how-it-works.html", "/streamers.html", "/shortcuts.html", "/terms.html", "/report.html", "/scan/", "/no-such-page-zz/"];
function ctxFor(b) {
  if (SETUP === "webkit") return devices["iPhone 13"];
  if (SETUP === "android") return Object.assign({}, devices["Pixel 5"], { viewport: { width: 360, height: 780 } });
  return { viewport: { width: 1366, height: 900 } };
}
async function swap(ctx) {
  // test visits never reach the visit counter, whatever browser name or network they come from
  await ctx.route(/api\.maplefm\.gg\/hit/, (r) => r.fulfill({ status: 204, body: "" }));
  if (!process.env.SWAP) return;
  await ctx.route(/^https:\/\/maplefm\.gg\/(\?[^#]*)?$|^https:\/\/maplefm\.gg\/index\.html|^https:\/\/maplefm\.gg\/assets\/(board\.min\.js|board\.min\.css|advsearch\.js)/, async (r) => {
    const u = new URL(r.request().url()); const f = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
    await r.fulfill({ status: 200, contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html", body: fs.readFileSync(path.join(R, f)) });
  });
}
async function check(ctx, url, opts) {
  const p = await ctx.newPage(), errs = [], bad = [];
  p.on("pageerror", (e) => errs.push("pageerror: " + String(e.message).slice(0, 160)));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon|ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });
  p.on("response", (r) => { const u = r.url(); if (r.status() >= 400 && /maplefm\.gg|raw\.githubusercontent/.test(u) && !/no-such-page/.test(u) && !/\/me(\/|$)|\/admin/.test(u) && !/\/data\/icons\/\w+\.json/.test(u)) bad.push(r.status() + " " + u.slice(0, 120)); });
  p.on("requestfailed", (r) => { const u = r.url(), f = r.failure() && r.failure().errorText || ""; if (/maplefm\.gg|raw\.githubusercontent/.test(u) && !/ABORTED|cancelled|NS_BINDING_ABORTED/i.test(f)) bad.push("failed " + f + " " + u.slice(0, 120)); });
  await p.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch (e) { window.__cls = null; } });
  if (opts && opts.dark) await p.emulateMedia({ colorScheme: "dark" });
  if (opts && opts.dark) await p.addInitScript(() => { try { localStorage.setItem("fm-night", "1"); } catch (e) {} });
  let status = 0, load = 0;
  try {
    // the speed watch phone profile: 4x slower CPU, real network (slow 3G is tested on its own in features.cjs)
    if (SETUP === "android") { try { const c = await ctx.newCDPSession(p); await c.send("Emulation.setCPUThrottlingRate", { rate: 4 }); } catch (e) {} }
    const t0 = Date.now(); const r = await p.goto(B + url, { waitUntil: "load", timeout: 60000 }); load = Date.now() - t0; status = r ? r.status() : 0;
  } catch (e) { errs.push("goto: " + e.message.slice(0, 120)); }
  await p.waitForTimeout(url === "/" || url.startsWith("/#") ? 8000 : 2500);
  const m = await p.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
    const brokenImg = [...document.images].filter((i) => vis(i) && i.complete && i.naturalWidth === 0 && i.src && !/^data:/.test(i.src)).map((i) => i.src.slice(0, 100));
    const nameOf = (e) => (e.getAttribute("aria-label") || e.getAttribute("title") || e.textContent || (e.querySelector("img[alt]") || {}).alt || e.getAttribute("placeholder") || e.value || "").trim();
    const unlabeled = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea")].filter((e) => vis(e) && !nameOf(e) && !(e.id && document.querySelector('label[for="' + e.id + '"]')) && !e.closest("label")).map((e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : "")).slice(0, 8);
    const d = document.querySelector('meta[name="description"]');
    return { title: document.title, desc: d ? d.content.length : 0, cls: window.__cls == null ? null : +window.__cls.toFixed(3), heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
      overflow: document.documentElement.scrollWidth - innerWidth, brokenImg: brokenImg.slice(0, 5), unlabeled };
  }).catch((e) => ({ err: e.message }));
  await p.close();
  const fails = [];
  if (status !== 200 && !/no-such-page/.test(url)) fails.push("status " + status);
  if (/no-such-page/.test(url) && status !== 404) fails.push("404 page answered " + status);
  if (/no-such-page/.test(url)) errs.splice(0, errs.length, ...errs.filter((e) => !/Failed to load resource/.test(e)));
  if (errs.length) fails.push(...errs.slice(0, 4));
  if (bad.length) fails.push(...bad.slice(0, 4));
  if (m.brokenImg && m.brokenImg.length) fails.push("broken images " + m.brokenImg.join(" "));
  if (m.cls != null && m.cls >= 0.1) fails.push("layout shift " + m.cls);
  if (m.overflow > 2) fails.push("sideways scroll " + m.overflow + "px");
  if (!m.title) fails.push("no title");
  if (!/no-such-page|report\.html|shortcuts|scan\/|download/.test(url) && !m.desc) fails.push("no description");
  if (load > 3000 && (SETUP === "android" || SETUP === "webkit")) fails.push("load " + load + " ms over 3 s");
  return { url: url + (opts ? " " + JSON.stringify(opts) : ""), status, load, cls: m.cls, heap: m.heap, unlabeled: m.unlabeled || [], fails };
}
(async () => {
  const bt = SETUP === "webkit" ? webkit : SETUP === "firefox" ? firefox : chromium;
  const b = await bt.launch(), out = [];
  // four pages at a time, each in its own context
  const jobs = PAGES.map((u) => async () => { const ctx = await b.newContext(ctxFor()); await swap(ctx); const r = await Promise.race([check(ctx, u), new Promise((ok) => setTimeout(() => ok({ url: u, status: 0, load: 0, cls: null, heap: null, unlabeled: [], fails: ["page never finished (90 s)"] }), 90000))]); await ctx.close().catch(() => {}); out.push(r); console.log((r.fails.length ? "FAIL " : "ok   ") + r.url + " " + r.load + "ms" + (r.fails.length ? " | " + r.fails.join(" ; ") : "")); });
  const run = async () => { while (jobs.length) await jobs.shift()(); };
  // phones one page at a time so load times are honest; desktops four at a time
  await Promise.all(SETUP === "android" || SETUP === "webkit" ? [run()] : [run(), run(), run(), run()]);
  // variants: dark theme, reduced motion, 320 px, landscape, 200% zoom
  const VAR = [["/", { dark: 1 }], ["/item/work-gloves/", { dark: 1 }], ["/map.html", { dark: 1 }]];
  for (const [u, o] of VAR) { const ctx = await b.newContext(ctxFor()); await swap(ctx); out.push(await check(ctx, u, o)); await ctx.close(); }
  for (const [u, extra, o] of [["/", { viewport: { width: 320, height: 640 } }, { w: 320 }], ["/item/work-gloves/", { viewport: { width: 320, height: 640 } }, { w: 320 }], ["/map.html", { viewport: { width: 320, height: 640 } }, { w: 320 }],
    ["/", { viewport: { width: 844, height: 390 } }, { landscape: 1 }], ["/", { reducedMotion: "reduce" }, { reduced: 1 }], ["/item/work-gloves/", { viewport: { width: 683, height: 450 }, deviceScaleFactor: 2 }, { zoom: 1 }], ["/", { viewport: { width: 683, height: 450 }, deviceScaleFactor: 2 }, { zoom: 1 }]]) {
    const ctx = await b.newContext(Object.assign({}, ctxFor(), extra)); await swap(ctx); out.push(await check(ctx, u, o)); await ctx.close();
  }
  await b.close();
  let nf = 0; for (const r of out) { if (r.fails.length) nf++; console.log((r.fails.length ? "FAIL " : "ok   ") + SETUP + " " + r.url + " | " + r.status + " " + r.load + "ms cls " + r.cls + " heap " + r.heap + (r.fails.length ? " | " + r.fails.join(" ; ") : "") + (r.unlabeled.length ? " | unlabeled " + r.unlabeled.join(",") : "")); }
  console.log(SETUP + ": " + (out.length - nf) + " of " + out.length + " pass");
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  process.exit(nf ? 1 : 0);
})();
