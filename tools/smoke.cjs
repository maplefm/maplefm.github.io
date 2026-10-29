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
const PAGES = [["/", ".sitenav"], ["/market.html", ".ctl"], ["/shop.html", "#q"], ["/map.html", ".sitenav"], ["/quests.html", ".sitenav"], ["/contribute.html", ".sitenav"],
  ["/report.html", ".sitenav"], ["/streamers.html", ".sitenav"], ["/how-it-works.html", ".sitenav"], ["/shortcuts.html", ".sitenav"], ["/terms.html", ".sitenav"], ["/bot/", ".sitenav"], ["/items/", ".sitenav"], ["/item/work-gloves/", ".crumbs"], ["/map/sleepywood/", ".crumbs"], ["/training/", ".crumbs"], ["/quests/", ".crumbs"]];
const fails = []; let checks = 0;
const ok = (c, name) => { checks++; if (!c) fails.push(name); };
(async () => {
  await new Promise((r) => srv.listen(PORT, r));
  const b = await chromium.launch();
  // the small phone uses a plain, wider font, the way a phone without our web fonts loaded sees the page
  for (const [w, h, tag] of [[1366, 900, "desktop"], [390, 844, "phone"], [360, 780, "small phone"], [1366, 900, "dark desktop"]]) {
    for (const [pg, must] of PAGES) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: tag.startsWith("dark") ? "dark" : "light" });
      // the live site's own address answers from this checkout, so absolute links and data paths work
      // answered straight from this checkout: switching an https request to http isn't allowed for every request type
      await ctx.route("https://maplefm.gg/**", (route) => {
        let f = decodeURIComponent(new URL(route.request().url()).pathname); if (f.endsWith("/")) f += "index.html";
        const p = path.join(ROOT, f);
        if (!p.startsWith(ROOT) || !fs.existsSync(p) || !fs.statSync(p).isFile()) return route.fulfill({ status: 404, body: "nf" });
        return route.fulfill({ status: 200, contentType: TYPES[p.split(".").pop()] || "application/octet-stream", body: fs.readFileSync(p) });
      });
      await ctx.route(/fonts\.(googleapis|gstatic)\.com|googletagmanager|google-analytics/, (r) => r.abort());
      if (tag === "small phone") await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = '*{font-family:"DejaVu Sans",Verdana,sans-serif!important}'; document.head.appendChild(st); }));
      const p = await ctx.newPage(), errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      await p.goto("http://localhost:" + PORT + pg, { waitUntil: "domcontentloaded" });
      const found = await p.waitForSelector(must, { timeout: 15000 }).then(() => true, () => false);
      await p.waitForTimeout(pg === "/" ? 5000 : 1500);
      ok(found, `${tag} ${pg}: shows ${must}`);
      const wide = await p.evaluate(() => {
        const over = document.documentElement.scrollWidth - window.innerWidth; if (over <= 1) return "";
        const bad = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); if (!r.width || r.right <= window.innerWidth + 1 || getComputedStyle(e).position === "fixed") return false;
          // clipped inside a scroller or a box that hides its overflow: that doesn't widen the page
          for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o !== "visible") return false; }
          return true; })
          .filter((e) => !e.closest("[hidden]")).slice(0, 4).map((e) => (e.id ? "#" + e.id : e.tagName.toLowerCase() + "." + String(e.className).split(" ")[0]) + "→" + Math.round(e.getBoundingClientRect().right));
        return over + "px wider: " + bad.join(" ");
      });
      ok(!wide, `${tag} ${pg}: no sideways scroll ${wide}`);
      ok(await p.evaluate(() => document.querySelectorAll(".sitenav .sn-links a").length === 5), `${tag} ${pg}: site menu`);
      // all five menu links fit on screen, nothing hidden off the side
      ok(await p.evaluate(() => [...document.querySelectorAll(".sitenav .sn-links a")].every((a) => { const r = a.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; })), `${tag} ${pg}: whole menu visible`);
      ok(await p.evaluate(() => !!document.querySelector(".clubfoot .sf-cols a[href='/market.html']")), `${tag} ${pg}: site footer`);
      // the menu's text stays readable on its own background (dark pages, light pages)
      const contrast = await p.evaluate(() => {
        const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
        const lum = (c) => { const [r, g, b] = rgb(c).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const bgOf = (e) => { for (let a = e; a; a = a.parentElement) { const c = getComputedStyle(a).backgroundColor; const v = rgb(c); if (v.length && (v.length < 4 || v[3] > 0.5)) return c; } return "rgb(255,255,255)"; };
        const out = [];
        document.querySelectorAll(".sitenav .sn-brand, .sitenav .sn-links a:not([aria-current]), .crumbs a").forEach((e) => {
          const a = lum(getComputedStyle(e).color), b = lum(bgOf(e)), r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (r < 3) out.push((e.className || e.textContent.trim()).slice(0, 20) + " " + r.toFixed(1));
        });
        return out.slice(0, 3).join(", ");
      });
      ok(!contrast, `${tag} ${pg}: menu text readable ${contrast}`);
      ok(await p.evaluate(() => document.querySelectorAll(".clubfoot").length === 1 && !document.querySelector("footer.sitefoot")), `${tag} ${pg}: one footer`);
      if (pg !== "/") {
        ok(await p.evaluate(() => !!document.querySelector(".sitenav .sn-search input")), `${tag} ${pg}: price search in the menu`);
        // the menu stays reachable: still there after scrolling down and back up a little
        await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2)); await p.waitForTimeout(1200);
        await p.mouse.move(w / 2, h / 2); await p.mouse.wheel(0, -300); await p.waitForTimeout(900);
        const back = await p.evaluate(() => { const n = document.querySelector(".sitenav"), r = n.getBoundingClientRect(); return r.top >= -5 && r.top < 80 && r.bottom > 30 ? "" : [Math.round(r.top), Math.round(r.bottom), Math.round(scrollY), n.className, getComputedStyle(n).position].join(" "); });
        ok(!back, `${tag} ${pg}: menu comes back on scroll up ${back}`);
        await p.evaluate(() => window.scrollTo(0, 0));
      }
      if (pg === "/") {
        // the picked category's count badge is readable
        const chipC = await p.evaluate(() => {
          const e = document.querySelector('.cchip[aria-pressed="true"] em'); if (!e) return "";
          const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
          const lum = (c) => { const [r, g, b] = rgb(c).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
          const a = lum(getComputedStyle(e).color), b = lum(getComputedStyle(e).backgroundColor), r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          return r < 3 ? r.toFixed(1) : "";
        });
        ok(!chipC, `${tag} picked category count readable ${chipC}`);
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
        // stats an item can't have never count as its roll
        const sf = await p.evaluate(() => [JSON.stringify(window.fmQA.statsFix("Emerald Earrings", { ATT: 50, ATT_b: 47, SLOTS: 5 })),
          JSON.stringify(window.fmQA.statsFix("Work Gloves", { ATT: 5, WDEF: 6, SLOTS: 2 })), JSON.stringify(window.fmQA.statsFix("Korean Fan", { ATT: 58, ATT_b: 55, LUK: 70, SLOTS: 7 }))]);
        ok(sf[0] === "null" && sf[1] === '{"ATT":5,"WDEF":6,"SLOTS":2}' && sf[2] === '{"ATT":58,"ATT_b":55,"SLOTS":7}', `${tag} impossible stats are thrown out, real ones kept ${sf.join(" ")}`);
        // searching from another tab lands back on the board
        await p.evaluate(() => document.getElementById("tab-pos").click()); await p.waitForTimeout(300);
        await p.fill("#q", "pan lid"); await p.waitForTimeout(500); await p.keyboard.press("Enter"); await p.waitForTimeout(900);
        ok(await p.evaluate(() => document.getElementById("tab-prices").getAttribute("aria-selected") === "true"), `${tag} search from My positions switches to the board`);
      }
      if (pg === "/market.html") {
        await p.fill(".sitenav .sn-search input", "work gloves"); await p.keyboard.press("Enter");
        await p.waitForFunction(() => document.querySelector("#ip") && /Work Gloves/.test(document.querySelector("#ip").textContent), null, { timeout: 30000 }).catch(() => {});
        ok(await p.evaluate(() => location.pathname === "/" && !!document.querySelector("#ip") && /Work Gloves/.test(document.querySelector("#ip").textContent)), `${tag} menu search opens the item on the board`);
        // "See X on the price board" from a listing opens that item's card
        await p.goto("http://localhost:" + PORT + "/#item=" + encodeURIComponent("Pan Lid"), { waitUntil: "domcontentloaded" });
        await p.waitForFunction(() => document.querySelector("#ip") && /Pan Lid/.test(document.querySelector("#ip").textContent), null, { timeout: 30000 }).catch(() => {});
        ok(await p.evaluate(() => !!document.querySelector("#ip") && /Pan Lid/.test(document.querySelector("#ip").textContent)), `${tag} a #item= link opens the item card`);
      }
      ok(!errs.length, `${tag} ${pg}: no page errors ${errs.slice(0, 2).join(" | ")}`);
      await ctx.close();
    }
  }
  await b.close(); srv.close();
  console.log(`smoke: ${checks - fails.length}/${checks} passed`); fails.forEach((f) => console.log("FAIL", f));
  process.exit(fails.length ? 1 : 0);
})();
