// The site's smoke test: every hand-built page at phone and desktop width, in a real browser, served from this
// checkout. Fails on a page error, sideways scrolling, a missing menu or a board control that doesn't respond.
//   node tools/smoke.cjs [port]      (serves the repo itself; needs playwright)
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), PORT = +process.argv[2] || 8899;
const TYPES = { html: "text/html", js: "application/javascript", css: "text/css", json: "application/json", png: "image/png", ico: "image/x-icon", gif: "image/gif", svg: "image/svg+xml", txt: "text/plain", xml: "application/xml", otf: "font/otf" };
const srv = http.createServer((q, r) => {
  let f = decodeURIComponent(q.url.split("?")[0].split("#")[0]); if (f.endsWith("/")) f += "index.html";
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { r.writeHead(404); return r.end("nf"); }
  r.writeHead(200, { "Content-Type": TYPES[p.split(".").pop()] || "application/octet-stream" }); fs.createReadStream(p).pipe(r);
});
const PAGES = [["/", ".sitenav"], ["/market.html", ".tabs"], ["/shop.html", "#q"], ["/map.html", ".sitenav"], ["/quests.html", ".sitenav"], ["/contribute.html", ".sitenav"],
  ["/report.html", ".sitenav"], ["/streamers.html", ".sitenav"], ["/how-it-works.html", ".sitenav"], ["/shortcuts.html", ".sitenav"], ["/terms.html", ".sitenav"], ["/bot/", ".sitenav"]];
const fails = []; let checks = 0;
const ok = (c, name) => { checks++; if (!c) fails.push(name); };
(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch();
  for (const [w, h, tag] of [[1366, 900, "desktop"], [390, 844, "phone"]]) {
    for (const [pg, must] of PAGES) {
      const ctx = await b.newContext({ viewport: { width: w, height: h } });
      // the live site's own address answers from this checkout, so absolute links and data paths work
      await ctx.route("https://maplefm.gg/**", (route) => route.continue({ url: route.request().url().replace("https://maplefm.gg", "http://localhost:" + PORT) }));
      await ctx.route(/fonts\.(googleapis|gstatic)\.com|googletagmanager|google-analytics/, (r) => r.abort());
      const p = await ctx.newPage(), errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      await p.goto("http://localhost:" + PORT + pg, { waitUntil: "domcontentloaded" });
      const found = await p.waitForSelector(must, { timeout: 15000 }).then(() => true, () => false);
      await p.waitForTimeout(pg === "/" ? 5000 : 1500);
      ok(found, `${tag} ${pg}: shows ${must}`);
      ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, `${tag} ${pg}: no sideways scroll`);
      ok(await p.evaluate(() => document.querySelectorAll(".sitenav .sn-links a").length >= 6), `${tag} ${pg}: site menu`);
      if (pg === "/") {
        for (const t of ["tab-sell", "tab-pos", "tab-deals", "tab-prices"]) {
          await p.evaluate((id) => document.getElementById(id).click(), t); await p.waitForTimeout(300);
          ok(await p.evaluate((id) => document.getElementById(id).getAttribute("aria-selected") === "true" || document.getElementById(id).classList.contains("on") || document.getElementById(id).getAttribute("aria-pressed") === "true", t), `${tag} board tab ${t} switches`);
        }
        for (const [btn, dlg] of [["m-about", "help"], ["m-sources", "sources"], ["m-check", "datacheck"]] ) {
          await p.evaluate((x) => { document.getElementById("menubtn").click(); document.getElementById(x).click(); }, btn); await p.waitForTimeout(400);
          ok(await p.evaluate((d) => !!document.getElementById(d).open, dlg), `${tag} menu opens ${dlg}`);
          await p.evaluate((d) => document.getElementById(d).close && document.getElementById(d).close(), dlg);
        }
        // anything open on top must really be on top: sample points across the menu and make sure nothing sticky covers it,
        // at the top of the page and scrolled down
        for (const y of [0, 600]) {
          await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(200);
          await p.evaluate(() => { const m = document.getElementById("menu"); if (m.hidden) document.getElementById("menubtn").click(); }); await p.waitForTimeout(300);
          const cover = await p.evaluate(() => {
            const m = document.getElementById("menu"), r = m.getBoundingClientRect(), bad = [];
            for (let i = 1; i < 10; i++) for (let j = 1; j < 4; j++) {
              const x = r.left + (r.width * j) / 4, yy = r.top + (r.height * i) / 10;
              if (yy < 0 || yy > innerHeight || x < 0 || x > innerWidth) continue;
              const e = document.elementFromPoint(x, yy);
              if (e && !m.contains(e)) bad.push((e.id || e.className || e.tagName) + "");
            }
            return [...new Set(bad)].slice(0, 3);
          });
          ok(!cover.length, `${tag} menu not covered (scroll ${y}) ${cover.join(",")}`);
          await p.evaluate(() => { const m = document.getElementById("menu"); if (!m.hidden) document.getElementById("menubtn").click(); });
        }
        await p.evaluate(() => window.scrollTo(0, 0));
        await p.waitForFunction(() => window.fmQA && window.fmQA.items().length > 100, null, { timeout: 30000 }).catch(() => {});
        await p.evaluate(() => window.fmQA.pick("Work Gloves")); await p.waitForTimeout(1500);
        ok(await p.evaluate(() => !!document.querySelector("#ip") && document.querySelector("#ip").textContent.indexOf("Work Gloves") >= 0), `${tag} search opens an item card`);
      }
      ok(!errs.length, `${tag} ${pg}: no page errors ${errs.slice(0, 2).join(" | ")}`);
      await ctx.close();
    }
  }
  await b.close(); srv.close();
  console.log(`smoke: ${checks - fails.length}/${checks} passed`); fails.forEach((f) => console.log("FAIL", f));
  process.exit(fails.length ? 1 : 0);
})();
