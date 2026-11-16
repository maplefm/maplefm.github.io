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
  await ctx.route(/^https:\/\/maplefm\.gg\/(\?[^#]*)?$|^https:\/\/maplefm\.gg\/assets\/(board\.min\.js|board\.min\.css|advsearch\.js|kofigoal\.js)/, (r) => { const u = new URL(r.request().url()); const f = u.pathname === "/" ? "index.html" : u.pathname.slice(1); r.fulfill({ status: 200, contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html", body: fs.readFileSync(R + f) }); });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("https://maplefm.gg/", { waitUntil: "load" });
  await p.waitForFunction(() => window.fmFirm && document.querySelectorAll("#picks .pk").length > 0, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2000);
  const title = () => p.evaluate(() => { const h = document.querySelector("#ip .ih h3, #side .ih h3"); return h ? h.innerText.trim() : ""; });
  // close the card the way a person does: Back on a phone, Esc on a desktop
  const close = async () => { if (PHONE) await p.tap("#sheetback"); else await p.keyboard.press("Escape"); await p.waitForTimeout(1200); };
  const tapIt = async (sel) => { const l = p.locator(sel); await l.scrollIntoViewIfNeeded(); if (PHONE) await l.tap(); else await l.click(); await p.waitForTimeout(2500); };
  // 1. Biggest mover: a sure price, and its icon, name and card are one item
  const hd = await p.evaluate(() => { const a = document.getElementById("hdeal"); if (!a || a.hidden) return null; const im = a.querySelector("img"); return { item: a.dataset.item, name: (a.querySelector("b") || {}).textContent, icon: im ? im.getAttribute("src") : "" }; });
  if (hd) {
    ok("mover is a sure price", await p.evaluate((n) => window.fmFirm(n), hd.item), hd.item);
    const id = (/\/i\/(\d+)\.png|item\/(\d+)\/icon/.exec(hd.icon || "") || []).slice(1).filter(Boolean)[0];
    // a known item shows its own game icon, never a crop from a shop window (a crop filed under a misread name showed a
    // scroll on the Two-Handed Sword)
    ok("mover icon is that item", !hd.icon || (DBID[hd.item.toLowerCase()] || []).includes(+id), hd.item + " icon " + String(hd.icon).slice(0, 60));
    await tapIt("#hdeal");
    const t = await title(); ok("mover opens the item it names", t === hd.name.trim(), hd.name + " -> " + t);
    await p.screenshot({ path: OUT + "fd-mover-" + (PHONE ? "phone" : "desk") + ".png" }); await close();
  } else ok("mover hidden (nothing sure moved 5%+)", true);
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
  const crops = await p2.evaluate(() => [...document.querySelectorAll("#hdeal img, #picks img, #rows img")].filter((im) => /^data:|\/shard|crop/.test(im.getAttribute("src") || "")).map((im) => (im.closest("[data-item]") || {}).dataset ? im.closest("[data-item]").dataset.item : "?"));
  ok("slow item list: no crops on known items", crops.length === 0, crops.slice(0, 5).join(", "));
  await p2.close();
  console.log(log.join("\n")); await b.close(); process.exit(log.some((x) => x.startsWith("FAIL")) ? 1 : 0);
})();
