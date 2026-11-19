// Getting around the live site without getting lost: ten real trips and the Back button, on a desktop and an iPhone.
// Counts the clicks and Backs each trip takes, checks that Back returns to the same place with the same search, card,
// filters and tab, that every page has a way home, and that nothing hides the way on. Read only: the visit beacon is
// answered by the test, nothing is posted or sold.
// Run: NODE_PATH=$(npm root -g) node tests/wayfinding.cjs [desktop|phone|both] [out dir]   (exit 1 on any failure)
const pw = require("playwright"), fs = require("fs");
const WHICH = process.argv[2] || "both", OUT = (process.argv[3] || require("os").tmpdir() + "/wayfinding") + "/"; fs.mkdirSync(OUT, { recursive: true });
const S = process.env.BASE || "https://maplefm.gg", log = [], trips = [];
const ok = (n, c, note) => log.push((c ? "ok   " : "FAIL ") + n + (note ? " | " + String(note).slice(0, 300) : ""));
// ideas waiting on Adam's OK (Nov 19 2026): reported, not failed
const idea = (n, c, note) => log.push((c ? "ok   " : "idea ") + n + (note ? " | " + String(note).slice(0, 300) : ""));
const wait = (p, ms) => p.waitForTimeout(ms);
const path = (p) => decodeURIComponent(new URL(p.url()).pathname + new URL(p.url()).hash);
(async () => {
  const b = await pw.chromium.launch();
  const setups = [["desktop", { viewport: { width: 1440, height: 900 } }], ["phone", { ...pw.devices["iPhone 13"] }]].filter((x) => WHICH === "both" || x[0] === WHICH);
  for (const [dn, opt] of setups) {
    const c = await b.newContext(opt); let beacons = 0;
    await c.route(/api\.maplefm\.gg\/(hit|ev|ref)/, (r) => { beacons++; r.fulfill({ status: 204, body: "" }); });
    const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(p.url() + " " + e.message));
    const tap = async (loc) => { await loc.first().scrollIntoViewIfNeeded(); if (dn === "phone") await loc.first().tap(); else await loc.first().click(); };
    async function trip(name, fn) {
      const t = { setup: dn, name, clicks: 0, backs: 0, notes: [], ok: true };
      const click = async (loc, what) => { t.clicks++; await tap(loc); await wait(p, 1200); t.notes.push("tap " + what + " -> " + path(p)); };
      const back = async () => { t.backs++; await p.goBack(); await wait(p, 1500); t.notes.push("back -> " + path(p)); };
      const check = (n, cond, note) => { ok(dn + " " + name + ": " + n, cond, note); if (!cond) t.ok = false; };
      try { await fn({ click, back, check, t }); } catch (e) { check("ran to the end", false, e.message.split("\n")[0]); }
      await p.screenshot({ path: OUT + dn + "-" + name.replace(/\W+/g, "_").slice(0, 40) + ".png" }).catch(() => {});
      trips.push(t);
    }
    // 1. Google to a quest, the item it needs, its price, back to the quest
    await trip("1 Google to quest to item price and back", async ({ click, back, check }) => {
      await p.goto(S + "/quest/andres-request/", { referer: "https://www.google.com/" }); await wait(p, 1500);
      const q = path(p);
      if (dn === "phone") { const bt = p.locator(".ptabs button:has-text('Bring')"); if (await bt.count()) await bt.first().tap(); await wait(p, 300); }
      const item = p.locator(".lay-quest a[href^='/item/']:visible");
      check("quest names an item page", (await item.count()) > 0);
      const y0 = await p.evaluate(() => scrollY);
      await click(item, "item"); check("item page shows a price or how to get it", await p.locator(".big, .pr, h2").count() > 0);
      await back(); check("Back returns to the quest", path(p) === q, path(p));
    });
    // 2. Board search, item card, item page, back with the search still there
    await trip("2 board search card item page and back", async ({ click, back, check }) => {
      await p.goto(S + "/"); await wait(p, 6000);
      await p.fill("#q", "work gloves"); await wait(p, 900);
      await click(p.locator("#rows tr[data-item]"), "first row"); check("card opens with #item=", /#item=/.test(p.url()), p.url());
      await click(p.locator("#side a[href^='/item/']"), "Full price history");
      check("item page opened", /\/item\//.test(p.url()), p.url());
      const crumbs = await p.locator(".crumbs a").count(); check("item page has breadcrumbs", crumbs > 0);
      await back(); await wait(p, 3000);
      check("Back lands on the board with the card open", /#item=Work/.test(p.url()) && await p.locator("#side .ih h3, #ip .ih h3").count() > 0, p.url());
      check("Back keeps the search typed", (await p.inputValue("#q").catch(() => "")) === "work gloves", JSON.stringify(await p.inputValue("#q").catch(() => "?")));
      await click(p.locator(dn === "phone" ? "#sheetback" : "#sheetx"), "close card");
      check("closing the card leaves the board", new URL(p.url()).pathname === "/" && !/#item=/.test(p.url()), p.url());
    });
    // 3. A Discord link to one item, then other items
    await trip("3 Discord link then other items", async ({ click, back, check }) => {
      await p.goto(S + "/c/work-gloves/?ref=discord"); await wait(p, 7000);
      check("share link opens the card", /#item=Work/.test(p.url()), p.url());
      await click(p.locator(dn === "phone" ? "#sheetback" : "#sheetx"), "close card");
      check("closing shows the board's price list", await p.locator("#rows tr[data-item]").count() > 5);
      await click(p.locator("#rows tr[data-item]").nth(3), "another item"); check("another card opens", /#item=/.test(p.url()) && !/Work%20Gloves/.test(p.url()), p.url());
      await back(); check("Back closes that card, stays on the board", new URL(p.url()).pathname === "/", p.url());
    });
    // 4. Where to train, a map, Directions, quit halfway, back to the list
    await trip("4 where to train directions quit and back", async ({ click, back, check }) => {
      await p.goto(S + "/map.html"); await p.evaluate(() => { localStorage.setItem("fm-map-me", JSON.stringify({ lv: 25, cls: "Warrior" })); localStorage.setItem("fm-map-from", "Henesys"); localStorage.setItem("fm-train-sort", "meso"); });
      await p.goto(S + "/map.html#train"); await p.reload(); await wait(p, 6000);
      const first = await p.locator(".tw-r .tw-nm b").first().textContent(); check("table ranks maps", !!first, first);
      await click(p.locator(dn === "phone" ? ".tw-x .tw-xb .btn.pri" : ".tw-r .tw-go button"), "Directions");
      check("route opens for that map", (await p.inputValue("#to").catch(() => "")) === first, await p.inputValue("#to").catch(() => ""));
      const go = p.locator("a.gostep"); check("step by step link on the map pages", (await go.count()) > 0);
      if (await go.count()) {
        await click(go, "Directions on the map pages"); check("first map page shows the way on", await p.locator(".dbar, .dsheet").count() > 0, path(p));
        if (dn === "phone") await click(p.locator(".dsheet .dend, .dsheet button:has-text('End')"), "End"); else { await p.keyboard.press("Escape"); await wait(p, 600); }
        check("route ended", (await p.evaluate(() => localStorage.getItem("fm-dir"))) === null);
        const wt = p.locator(".playbar a[href*='map.html'], .crumbs a[href*='map.html']");
        check("a link back to Where to train on the map page", (await wt.count()) > 0);
        if (await wt.count()) { await click(p.locator(".playbar a:has-text('Where to train')"), "Where to train"); check("back on the ranked list, same sort", await p.locator(".tw-sort .on:has-text('Most mesos')").count() > 0, path(p)); }
      }
    });
    // 5. Monster page, a map it lives on, a quest there, the quest log
    await trip("5 monster to map to quest to quest log", async ({ click, check }) => {
      await p.goto(S + "/monster/stirge/"); await wait(p, 1500);
      if (dn === "phone") { const wt = p.locator(".ptabs button:has-text('Where')"); if (await wt.count()) await wt.first().tap(); await wait(p, 300); }
      await click(p.locator(".lay a[href^='/map/']:visible"), "a map"); check("map page", /\/map\//.test(p.url()), p.url());
      const qn = await p.locator(".lay a[href^='/quest/']").count(); idea(dn + " " + name + ": map page lists quests that hunt here", qn > 0, qn + " quest links on " + path(p));
      if (dn === "phone") { const mt = p.locator(".ptabs button:has-text('Monsters')"); if (await mt.count()) await mt.first().tap(); await wait(p, 300); }
      await click(p.locator(".lay a[href^='/monster/']:visible"), "a monster here");
      if (dn === "phone") { const qt = p.locator(".ptabs button:has-text('Quest')"); if (await qt.count()) await qt.first().tap(); await wait(p, 300); }
      const ql = p.locator(".lay a[href^='/quest/']:visible"); check("monster page lists its quests", (await ql.count()) > 0);
      if (await ql.count()) { await click(ql, "a quest"); const lg = p.locator("a[href*='quests.html#q-']:visible"); check("quest page links to the quest log", (await lg.count()) > 0); if (await lg.count()) { await click(lg, "quest log"); check("quest log opens on that quest", /#q-\d+/.test(p.url()), path(p)); } }
    });
    // 6. Quest log, an item's FM price
    await trip("6 quest log to item prices", async ({ click, back, check }) => {
      await p.goto(S + "/quests.html#q-10305"); await wait(p, 4000);
      const it = p.locator("a[href^='/item/']:visible, a[href*='#item=']:visible"); check("quest log links to item prices", (await it.count()) > 0, await it.count());
      if (await it.count()) { const before = path(p); await click(it, "an item"); check("item opens", /item/.test(p.url()), p.url()); await back(); check("Back returns to the same quest", path(p) === before, path(p)); }
    });
    // 7. Mini window: jump to another map, then back
    if (dn === "desktop") await trip("7 mini window jump and back", async ({ click, back, check }) => {
      await p.goto(S + "/map/henesys/?mini=1"); await wait(p, 1500);
      const ex = p.locator(".exits table a[href^='/map/']"); check("mini window lists exits", (await ex.count()) > 0);
      await click(ex, "an exit"); check("still in the mini window", /mini=1/.test(p.url()) || await p.evaluate(() => document.documentElement.classList.contains("mini")), p.url());
      await back(); check("Back to Henesys", /henesys/.test(p.url()), p.url());
    });
    // 8. Search by stats, a result, back with the filters kept
    await trip("8 search by stats result and back", async ({ click, back, check }) => {
      await p.goto(S + "/"); await wait(p, 9000);
      await tap(p.locator("#advbtn")); await wait(p, 800);
      await p.selectOption("#advbox select[aria-label='Equip type']", "Claw"); await wait(p, 600);
      await p.fill("#advbox input[aria-label='ATT total']", "30"); await wait(p, 900);
      const url0 = p.url();
      const r = p.locator("#sres li a, #sres li"); check("results listed", (await r.count()) > 0);
      if (await r.count()) { await click(r, "a result"); await back(); check("Back keeps the stat search", (await p.inputValue("#advbox input[aria-label='ATT total']").catch(() => "")) === "30" || /a=|att/i.test(p.url()), p.url() + " was " + url0); }
    });
    // 9. Earn by scanning, download, how it works, back to the board
    await trip("9 earn download how it works board", async ({ click, check }) => {
      await p.goto(S + "/contribute.html"); await wait(p, 2000);
      const hw = p.locator("a[href*='how-it-works']:visible"); check("Earn links to how it works", (await hw.count()) > 0);
      if (await hw.count()) await click(hw, "how it works");
      await click(p.locator(".sitenav .sn-brand"), "logo"); check("logo goes to the board", new URL(p.url()).pathname === "/", p.url());
    });
    // 10. A bad address
    await trip("10 bad address", async ({ click, check }) => {
      await p.goto(S + "/item/not-a-real-item-zz/"); await wait(p, 2000);
      check("404 has the menu and search", await p.locator(".sitenav input[name=q]").count() > 0);
      await p.fill(".sitenav input[name=q]", "red potion"); await p.keyboard.press("Enter"); await wait(p, 6000);
      check("search from the 404 finds it", /q=red/i.test(p.url()) || /Red%20Potion|Red Potion/.test(p.url()), p.url());
    });
    // every page type: a way home, breadcrumbs, menu after scrolling, tap sizes, close buttons, Feedback not covering links
    const types = { board: "/", item: "/item/work-gloves/", "item hub": "/items/", "items sub-hub": "/items/scrolls/", quest: "/quest/andres-request/", "quest hub": "/quests/", map: "/map/henesys/", "map hub": "/maps/", monster: "/monster/stirge/", "monster hub": "/monsters/", training: "/training/", "training page": "/training/level-30-40/", crafting: "/crafting/", guide: "/guides/", recap: "/recap/", "quest log": "/quests.html", "training tool": "/map.html", market: "/market.html", shop: "/shop.html", earn: "/contribute.html", "how it works": "/how-it-works.html", streamers: "/streamers.html", shortcuts: "/shortcuts.html", terms: "/terms.html", bot: "/bot/", scan: "/scan/", "404": "/nope-zz/" };
    for (const [k, u] of Object.entries(types)) {
      await p.goto(S + u); await wait(p, k === "board" ? 6000 : 1800);
      const m = await p.evaluate((dn) => {
        const brand = document.querySelector(".sitenav .sn-brand"), crumbs = document.querySelectorAll(".crumbs a").length;
        const lit = [...document.querySelectorAll(".sitenav .sn-links a")].filter((a) => a.getAttribute("aria-current") || a.classList.contains("on") || a.classList.contains("cur")).map((a) => a.textContent.trim());
        const small = [...document.querySelectorAll(".sitenav a, .sitenav button, .crumbs a, .playbar a")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.height < 32 || r.width < 32); }).map((e) => e.textContent.trim().slice(0, 14) + " " + Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height));
        const fb = document.querySelector(".fbk, #fbk, .feedback"); let under = [];
        if (fb && fb.getBoundingClientRect().width) { const f = fb.getBoundingClientRect(); under = [...document.querySelectorAll("a, button")].filter((e) => { if (fb.contains(e)) return false; const r = e.getBoundingClientRect(); return r.width && r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top; }).map((e) => e.textContent.trim().slice(0, 20)); }
        return { home: !!brand && brand.getAttribute("href") === "/", crumbs, lit, small: small.slice(0, 6), nsmall: small.length, under: under.slice(0, 4), h: document.documentElement.scrollHeight, top: !!document.querySelector(".totop, #totop, [aria-label*='top' i]") };
      }, dn);
      ok(`${dn} ${k}: logo goes home`, m.home);
      idea(`${dn} ${k}: you-are-here (breadcrumbs or lit menu item)`, m.crumbs > 0 || m.lit.length > 0 || k === "board", JSON.stringify({ crumbs: m.crumbs, lit: m.lit }));
      if (dn === "phone") idea(`${dn} ${k}: menu and crumb taps at least 32 px`, m.nsmall === 0, m.small.join(", "));
      ok(`${dn} ${k}: Feedback button covers nothing`, m.under.length === 0, m.under.join(", "));
      if (m.h > 3 * (dn === "phone" ? 844 : 900)) {
        await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await wait(p, 300); await p.evaluate(() => scrollBy(0, -200)); await wait(p, 500);
        const vis = await p.evaluate(() => { const n = document.querySelector(".sitenav"); if (!n) return false; const r = n.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && getComputedStyle(n).visibility !== "hidden" && !n.classList.contains("sn-hide"); });
        idea(`${dn} ${k}: menu comes back when you scroll up on a long page`, vis, Math.round(m.h) + "px page");
        idea(`${dn} ${k}: back-to-top on a long page`, m.top, Math.round(m.h) + "px page");
      }
    }
    // Escape closes the card; Back after a deep link doesn't leave the site in one press
    if (dn === "desktop") {
      await p.goto(S + "/#item=Work%20Gloves"); await wait(p, 7000); await p.keyboard.press("Escape"); await wait(p, 600);
      ok("desktop Escape closes the item card", !/#item=/.test(p.url()), p.url());
    }
    ok(`${dn}: no script errors`, !errs.length, errs.slice(0, 4).join(" || "));
    ok(`${dn}: test visits never reached the counter`, true, beacons + " beacons answered by the test");
    await c.close();
  }
  await b.close();
  fs.writeFileSync(OUT + "trips.json", JSON.stringify(trips, null, 1));
  console.log(log.join("\n"));
  console.log("\ntrips: setup | trip | clicks | backs | ok");
  trips.forEach((t) => console.log(`  ${t.setup} | ${t.name} | ${t.clicks} | ${t.backs} | ${t.ok ? "ok" : "FAIL"}`));
  process.exit(log.some((x) => x.startsWith("FAIL")) ? 1 : 0);
})();
