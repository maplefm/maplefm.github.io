// The built item, monster, quest, map and training pages (Nov 19 2026 layout), the way a player uses them: cards in
// columns on a desktop, tabs on a phone, every exit numbered on the map, Directions that light the right portal, and
// the mini window. Serves pages built by tools/itempages.py from BUILD (default /tmp/ip) and everything else from this
// checkout. Run: NODE_PATH=$(npm root -g) node tests/pages-ux.cjs [build dir]  (exit 1 on any failure)
const pw = require("playwright"), http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), BUILD = process.argv[2] || "/tmp/ip", PORT = 8897;
const TYPES = { html: "text/html", js: "application/javascript", css: "text/css", json: "application/json", png: "image/png", gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon" };
const srv = http.createServer((q, r) => {
  let f = decodeURIComponent(q.url.split("?")[0].split("#")[0]); if (f.endsWith("/")) f += "index.html";
  for (const base of [BUILD, ROOT]) { const p = path.join(base, f); if (p.startsWith(base) && fs.existsSync(p) && fs.statSync(p).isFile()) { r.writeHead(200, { "Content-Type": TYPES[p.split(".").pop()] || "application/octet-stream" }); return fs.createReadStream(p).pipe(r); } }
  r.writeHead(404); r.end("nf");
});
const log = []; const ok = (n, c, note) => log.push((c ? "ok   " : "FAIL ") + n + (note ? " | " + note : ""));
const U = (p) => `http://localhost:${PORT}${p}`;
function first(dir, test) { for (const s of fs.readdirSync(path.join(BUILD, dir)).sort()) { if (!fs.existsSync(path.join(BUILD, dir, s, "index.html"))) continue; const h = fs.readFileSync(path.join(BUILD, dir, s, "index.html"), "utf8"); if (test(h)) return `/${dir}/${s}/`; } return null; }
srv.listen(PORT, async () => {
  const pages = {
    monster: first("monster", (h) => h.includes("<h2>Drops</h2>") && h.includes("<h2>Where to find it</h2>")),
    item: first("item", (h) => h.includes("<h2>Price by grade</h2>")),
    quest: first("quest", (h) => h.includes("<h2>Hunt</h2>") && h.includes("<h2>Bring</h2>")),
    map: fs.existsSync(path.join(BUILD, "map/henesys/index.html")) ? "/map/henesys/" : first("map", (h) => h.includes("<h2>Exits</h2>")),
    training: first("training", (h) => h.includes("lay-train")),
  };
  const b = await pw.chromium.launch();
  for (const [dn, o] of [["desktop", { viewport: { width: 1440, height: 900 } }], ["phone", { ...pw.devices["iPhone 13"] }]]) {
    const c = await b.newContext(o); await c.route(/api\.maplefm\.gg\/hit|raw\.githubusercontent|maplestory\.io/, (r) => r.fulfill({ status: 204, body: "" }));
    const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    for (const [k, u] of Object.entries(pages)) {
      if (!u) { ok(`${dn} ${k}: a page to test`, false); continue; }
      await p.goto(U(u)); await p.waitForTimeout(700);
      const m = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, cols: [...document.querySelectorAll(".lay > .col")].filter((e) => e.getBoundingClientRect().width > 0).length,
        tabs: [...document.querySelectorAll(".ptabs button")].map((x) => x.textContent), shown: [...document.querySelectorAll(".lay section.blk")].filter((e) => e.offsetParent).length, nav: (document.body.innerText.match(/Nav here/g) || []).length }));
      ok(`${dn} ${k}: no sideways scroll`, m.over <= 0, `${u} ${m.over}px`);
      ok(`${dn} ${k}: no "Nav here" left`, m.nav === 0);
      if (dn === "desktop") ok(`${dn} ${k}: cards side by side`, m.cols >= 2 || k === "training", JSON.stringify(m));
      else ok(`${dn} ${k}: tabs instead of a long page`, m.tabs.length >= 2 || k === "training" || k === "quest" && m.tabs.length >= 1, JSON.stringify(m.tabs));
    }
    // a phone tab shows its card and hides the others
    if (dn === "phone" && pages.monster) {
      await p.goto(U(pages.monster)); await p.waitForTimeout(500);
      const before = await p.evaluate(() => [...document.querySelectorAll(".lay section.blk[data-tab]:not(.head)")].filter((e) => e.offsetParent).map((e) => e.dataset.tab));
      await p.locator(".ptabs button", { hasText: "Where" }).first().tap(); await p.waitForTimeout(300);
      const after = await p.evaluate(() => [...document.querySelectorAll(".lay section.blk[data-tab]:not(.head)")].filter((e) => e.offsetParent).map((e) => e.dataset.tab));
      ok("phone tab switches the card", before.join() === "Drops" && after.join() === "Where", before + " -> " + after);
    }
    // the map: numbered exits, number keys, Directions light one portal
    if (pages.map) {
      await p.goto(U(pages.map)); await p.waitForTimeout(700);
      const mp = await p.evaluate(() => ({ chips: document.querySelectorAll(".pchip").length, ex: [...document.querySelectorAll(".exits table tr")].filter((r) => r.querySelector("td")).length, kb: document.querySelectorAll(".xk").length, first: (document.querySelector(".pchip") || {}).getAttribute && document.querySelector(".pchip").getAttribute("href") }));
      ok(`${dn} map: every exit labeled on the minimap`, mp.chips >= mp.ex && mp.kb > 0, JSON.stringify(mp));
      if (dn === "desktop") {
        const want = await p.evaluate(() => { const a = document.querySelector(".exits table tr td a"); return a ? a.getAttribute("href") : ""; });
        const n = await p.evaluate(() => (document.querySelector(".exits .xk") || {}).textContent);
        await p.keyboard.press(String(n)); await p.waitForTimeout(800);
        ok("a number key opens that exit's map", new URL(p.url()).pathname === want, p.url() + " want " + want);
      }
      // Directions: from this map to the first exit and on
      const st = await p.evaluate(() => { const ms = [...document.querySelectorAll(".mmap .mk.p")]; return null; });
      await p.goto(U(pages.map)); await p.waitForTimeout(400);
      const here = await p.evaluate(() => document.querySelector("h1").textContent.trim());
      const tgt = await p.evaluate(() => { const m = [...document.querySelectorAll(".mmap .mk.p,.mmap .mk.d,.mmap .mk.h")]; const i = m.findIndex((x) => /^To /.test(x.title)); return i < 0 ? null : [i, m[i].title.replace(/^To /, "")]; });
      await p.evaluate(([here, tgt]) => localStorage.setItem("fm-dir", JSON.stringify({ to: tgt[1], at: Date.now(), steps: [{ from: here, to: tgt[1], kind: "walk", portal: tgt[0] }] })), [here, tgt]);
      await p.reload(); await p.waitForTimeout(700);
      const d = await p.evaluate(() => ({ glow: [...document.querySelectorAll(".pchip.glow")].map((c) => c.textContent), tgt: document.querySelectorAll(".mk.tgt").length, bar: !!document.querySelector(".dbar"), sheet: !!document.querySelector(".dsheet") }));
      ok(`${dn} Directions light only the portal to take`, d.tgt >= 1 && d.glow.length >= 1 && d.glow.every((t) => t.endsWith(tgt[1])), JSON.stringify(d));
      ok(`${dn} Directions ${dn === "phone" ? "get their own screen" : "show one short bar"}`, dn === "phone" ? d.sheet && !d.bar : d.bar && !d.sheet, JSON.stringify(d));
      if (dn === "phone") { await p.locator(".dgo").tap(); } else { await p.keyboard.press("Space"); }
      await p.waitForTimeout(800);
      ok(`${dn} I'm through opens the next map and the route ends there`, decodeURIComponent(new URL(p.url()).pathname).length > 5 && (await p.evaluate(() => localStorage.getItem("fm-dir"))) === null, p.url());
      // the mini window
      if (dn === "desktop") {
        await p.goto(U(pages.map + "?mini=1")); await p.waitForTimeout(600);
        const mi = await p.evaluate(() => ({ nav: !!document.querySelector(".sitenav") && !!document.querySelector(".sitenav").offsetParent, box: !!document.querySelector("#mgo-q"), ex: !!document.querySelector(".exits") && !!document.querySelector(".exits").offsetParent }));
        ok("mini window: the map and exits only, with a box to jump", !mi.nav && mi.box && mi.ex, JSON.stringify(mi));
      }
    }
    ok(`${dn}: no script errors`, !errs.length, errs.slice(0, 3).join("; "));
    await c.close();
  }
  console.log(log.join("\n")); await b.close(); srv.close(); process.exit(log.some((x) => x.startsWith("FAIL")) ? 1 : 0);
});
