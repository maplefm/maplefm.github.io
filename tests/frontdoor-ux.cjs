// The front page the way a player uses it: what a strip, button or badge shows must be what it opens, and a price the
// board isn't sure of (flagged, rough, a lead, under 3 sales) never headlines. Serves this checkout's board on maplefm.gg
// with live data. Run: NODE_PATH=$(npm root -g) node tests/frontdoor-ux.cjs [chromium|webkit] [phone|desktop]  (exit 1 on any failure)
const pw = require("playwright"), ENGINE = pw[process.argv[2] || "chromium"], PHONE = (process.argv[3] || "phone") === "phone";
const fs = require("fs"), R = require("path").join(__dirname, "..") + "/", OUT = (process.env.OUT || require("os").tmpdir()) + "/";
const DBID = {}; JSON.parse(fs.readFileSync(R + "data/itemdb.json", "utf8")).items.forEach((r) => { (DBID[r[0].toLowerCase()] || (DBID[r[0].toLowerCase()] = [])).push(r[1]); });
const log = []; const ok = (n, c, note) => log.push((c ? "ok   " : "FAIL ") + n + (note ? " | " + note : ""));
(async () => {
  const b = await ENGINE.launch();
  const ctx = await b.newContext(PHONE ? Object.assign({}, pw.devices["iPhone 13"]) : { viewport: { width: 1440, height: 900 } });
  await ctx.route(/api\.maplefm\.gg\/hit/, (r) => r.fulfill({ status: 204, body: "" }));
  await ctx.route(/^https:\/\/maplefm\.gg\/(\?[^#]*)?$|^https:\/\/maplefm\.gg\/assets\/(board\.min\.js|board\.min\.css|advsearch\.js|kofigoal\.js|sitesearch\.js|nav\.css)/, (r) => { const u = new URL(r.request().url()); const f = u.pathname === "/" ? "index.html" : u.pathname.slice(1); r.fulfill({ status: 200, contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html", body: fs.readFileSync(R + f) }); });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("https://maplefm.gg/", { waitUntil: "load" });
  await p.waitForFunction(() => window.fmFirm && document.querySelectorAll("#picks .pk").length > 0, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2000);
  const title = () => p.evaluate(() => { const h = document.querySelector("#ip .ih h3, #side .ih h3"); return h ? h.innerText.trim() : ""; });
  // close the card the way a person does: Back on a phone, Esc on a desktop
  const close = async () => { if (PHONE) await p.tap("#sheetback"); else await p.keyboard.press("Escape"); await p.waitForTimeout(1200); };
  const tapIt = async (sel) => { const l = p.locator(sel); await l.scrollIntoViewIfNeeded(); if (PHONE) await l.tap(); else await l.click(); await p.waitForTimeout(2500); };
  // 1. The cleaned-up front door (Nov 18 2026): "Free market search", no tagline, no biggest mover, no Ko-fi strip on
  // top; Ko-fi is one line at the end of the stats and first in the menu
  const fd = await p.evaluate(() => { const h = document.getElementById("htitle"), k = document.querySelector("#cards .kofiline"), m = document.querySelector("#menu > *");
    return { title: h ? h.textContent.trim() : "", mover: !!document.getElementById("hdeal"), strip: !!document.getElementById("kofigoal"),
      line: k ? { href: k.href, text: k.innerText.replace(/\s+/g, " ").trim() } : null, menu1: m ? m.className + " " + (m.getAttribute("href") || "") : "" }; });
  ok("heading reads Free market search, nothing under it", fd.title === "Free market search", fd.title);
  ok("biggest mover and the Ko-fi strip are gone", !fd.mover && !fd.strip);
  ok("Ko-fi line in the stats goes to Ko-fi", fd.line && /ko-fi\.com\/maplefm/.test(fd.line.href) && /Donations pay the scanners/.test(fd.line.text), JSON.stringify(fd.line));
  ok("Ko-fi is first in the menu", /mkofi .*ko-fi\.com\/maplefm/.test(fd.menu1), fd.menu1);
  // the popular items fill exactly one row: 5 on a phone, as many as fit on a desktop
  const row = await p.evaluate(() => { const box = document.getElementById("picks"), ks = [...box.querySelectorAll(".pk")], r = box.getBoundingClientRect();
    const tops = new Set(ks.map((k) => Math.round(k.getBoundingClientRect().top))), last = ks.length ? ks[ks.length - 1].getBoundingClientRect() : r;
    return { n: ks.length, rows: tops.size, gapRight: Math.round(r.right - last.right), w: Math.round(r.width), minW: Math.min.apply(null, ks.map((k) => k.getBoundingClientRect().width)) }; });
  ok("popular items sit in one row", row.rows === 1, JSON.stringify(row));
  ok(PHONE ? "5 popular items on a phone" : "the row is full on a desktop", PHONE ? row.n === 5 : row.n === Math.min(40, Math.floor((row.w + 8) / 78)), JSON.stringify(row));
  ok("the row reaches the right edge", row.gapRight <= 2 && row.minW >= (PHONE ? 50 : 70), JSON.stringify(row));
  // 2. Popular: every pick is a sure price and opens itself
  const picks = await p.evaluate(() => [...document.querySelectorAll("#picks .pk")].map((b) => ({ item: b.dataset.item, label: b.getAttribute("aria-label") })));
  const unsure = await p.evaluate((ps) => ps.filter((x) => !window.fmFirm(x.item)).map((x) => x.item), picks);
  ok("Popular has picks", picks.length >= 5, picks.length + " picks");
  ok("Popular shows only sure prices", unsure.length === 0, unsure.join(", "));
  for (const k of [0, picks.length - 1]) {
    if (!picks[k]) continue;
    await tapIt("#picks .pk >> nth=" + k);
    const t = await title();
    ok("Popular pick " + k + " opens itself", t && picks[k].label.indexOf(t) === 0, picks[k].label + " -> " + t); await close();
  }
  // 3. Big sales: only items the board is sure of
  await p.waitForFunction(() => document.querySelector("#ticker [data-item], #ticker .tq"), null, { timeout: 30000 }).catch(() => {});
  const tick = await p.evaluate(() => [...document.querySelectorAll("#ticker [data-item]")].map((s) => s.dataset.item));
  const tickBad = await p.evaluate((ts) => ts.filter((n) => !window.fmFirm(n)), tick);
  ok("Big sales shows only sure items", tickBad.length === 0, tick.length + " sales; unsure: " + tickBad.join(", "));
  // 4. NPC badge: never on an unsure price
  for (const n of ["Two-Handed Sword", "Work Gloves", "Elixir"]) {
    await p.fill("#q", n); await p.waitForTimeout(1500);
    // the way a person picks it: the suggestion under the box
    const hit = await p.evaluate((n) => { const o = [...document.querySelectorAll("#sugg .so")].find((x) => x.innerText.replace(/\s+/g, " ").trim().toLowerCase().startsWith(n.toLowerCase() + " ") && !/scroll|show them/i.test(x.innerText.slice(n.length, n.length + 20))); if (o) o.setAttribute("data-t", "1"); return !!o; }, n);
    const sug = p.locator('#sugg .so[data-t="1"]');
    ok("suggestion offered for " + n, hit);
    if (hit) { if (PHONE) await sug.tap(); else await sug.click(); await p.waitForTimeout(2500); }
    const v = await p.evaluate((n) => { const t = document.querySelector("#ip .vend .tg, #side .vend .tg"), h = document.querySelector("#ip .ih h3"); return { card: h ? h.innerText : "", firm: window.fmFirm(n), badge: t ? t.textContent : "" }; }, n);
    ok("search opens " + n, v.card.toLowerCase() === n.toLowerCase(), v.card);
    ok("NPC badge only on a sure price: " + n, v.firm || !v.badge, JSON.stringify(v));
    await p.screenshot({ path: OUT + "fd-" + n.replace(/\W+/g, "-") + "-" + (PHONE ? "phone" : "desk") + ".png" }); if (v.card) await close(); await p.evaluate(() => scrollTo(0, 0)); await p.fill("#q", "");
  }
  ok("no script errors", !errs.length, errs.slice(0, 2).join("; "));
  // 5. the item list arriving late (a slow phone connection): no shop-window crop stands in for a known item's icon
  const p2 = await ctx.newPage();
  await p2.route(/data\/itemdb\.json/, async (r) => { await new Promise((z) => setTimeout(z, 6000)); r.continue(); });
  await p2.goto("https://maplefm.gg/", { waitUntil: "load" });
  await p2.waitForFunction(() => document.querySelectorAll("#picks .pk").length > 0, null, { timeout: 60000 }).catch(() => {});
  await p2.waitForTimeout(9000);
  const crops = await p2.evaluate(() => [...document.querySelectorAll("#picks img, #rows img")].filter((im) => /^data:|\/shard|crop/.test(im.getAttribute("src") || "")).map((im) => (im.closest("[data-item]") || {}).dataset ? im.closest("[data-item]").dataset.item : "?"));
  ok("slow item list: no crops on known items", crops.length === 0, crops.slice(0, 5).join(", "));
  await p2.close();
  console.log(log.join("\n")); await b.close(); process.exit(log.some((x) => x.startsWith("FAIL")) ? 1 : 0);
})();
