// Search the site (assets/sitesearch.js): the green button at the end of the menu, its results and its preview, the way
// a player uses them. Every number it shows must match the page it links to, and an item's price shows only when the
// board is sure of it. Serves this checkout on maplefm.gg with the live data.
// Run: NODE_PATH=$(npm root -g) node tests/sitesearch-ux.cjs [chromium|webkit] [phone|desktop]  (exit 1 on any failure)
const pw = require("playwright"), ENGINE = pw[process.argv[2] || "chromium"], PHONE = (process.argv[3] || "phone") === "phone";
const fs = require("fs"), R = require("path").join(__dirname, "..") + "/", OUT = (process.env.OUT || require("os").tmpdir()) + "/";
const IDX = JSON.parse(fs.readFileSync(R + "data/sitesearch.json", "utf8"));
const log = []; const ok = (n, c, note) => log.push((c ? "ok   " : "FAIL ") + n + (note ? " | " + note : ""));
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".html": "text/html" };
(async () => {
  const b = await ENGINE.launch();
  const ctx = await b.newContext(PHONE ? Object.assign({}, pw.devices["iPhone 13"]) : { viewport: { width: 1440, height: 900 } });
  let hits = 0; await ctx.route(/api\.maplefm\.gg\/hit/, (r) => { hits++; r.fulfill({ status: 204, body: "" }); });
  // this checkout's pages, scripts and the index; everything else (data, icons) from the live site
  await ctx.route(/^https:\/\/maplefm\.gg\/((\?[^#]*)?$|[a-z]+\.html|assets\/(board\.min\.js|board\.min\.css|nav\.css|sitesearch\.js|kofigoal\.js)|data\/sitesearch\.json|(monster|item|quest|map)\/[^/]+\/$)/, (r) => {
    const u = new URL(r.request().url()); let f = u.pathname === "/" ? "index.html" : u.pathname.slice(1); if (f.endsWith("/")) f += "index.html";
    if (!fs.existsSync(R + f)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ status: 200, contentType: TYPES[f.slice(f.lastIndexOf("."))] || "text/plain", body: fs.readFileSync(R + f) });
  });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  for (const page of ["/", "/quests.html", "/map.html"]) {
    await p.goto("https://maplefm.gg" + page, { waitUntil: "load" }); await p.waitForTimeout(page === "/" ? 3500 : 1200);
    const g = await p.evaluate(() => { const bt = document.querySelector(".sitenav .sn-site"), nav = document.querySelector(".sitenav"); if (!bt) return null;
      const r = bt.getBoundingClientRect(), n = nav.getBoundingClientRect(), l = (innerWidth <= 700 && nav.querySelector(".sn-search") || nav.querySelector(".sn-links")).getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(n.right - r.right), sameRow: Math.abs((r.top + r.bottom) / 2 - (l.top + l.bottom) / 2) < 4, label: bt.innerText.trim(), over: document.documentElement.scrollWidth - innerWidth }; });
    ok(page + " has the Search site button", !!g, JSON.stringify(g));
    if (g) {
      ok(page + " button at the right end of the menu row", g.right <= 2 && g.sameRow, JSON.stringify(g));
      ok(page + " button " + (PHONE ? "is an icon on a phone" : "says Search site"), PHONE ? g.label === "" && g.w >= 38 : g.label === "Search site", JSON.stringify(g));
      ok(page + " no sideways scroll", g.over <= 0, g.over + "px");
    }
  }
  await p.goto("https://maplefm.gg/", { waitUntil: "load" }); await p.waitForTimeout(3000);
  const tap = async (sel) => { const l = p.locator(sel).first(); if (PHONE) await l.tap(); else await l.click(); };
  await tap(".sitenav .sn-site"); await p.waitForTimeout(1200);
  const opened = await p.evaluate(() => { const d = document.querySelector("dialog.ss-dlg"); return { open: !!(d && d.open), focus: document.activeElement && document.activeElement.id, ph: (document.getElementById("ss-q") || {}).placeholder }; });
  ok("opens with the box focused", opened.open && opened.focus === "ss-q" && /quests, monsters, maps, drops/.test(opened.ph), JSON.stringify(opened));
  ok("price search is untouched", await p.evaluate(() => document.getElementById("q").value === ""));
  const look = async (q) => { await p.fill("#ss-q", q); await p.waitForTimeout(500);
    return p.evaluate(() => ({ groups: [...document.querySelectorAll(".ss-list .ss-h")].map((h) => h.textContent), rows: [...document.querySelectorAll(".ss-list .ss-row")].map((a) => ({ n: a.querySelector("b").textContent, href: a.getAttribute("href"), on: a.classList.contains("on") })),
      pv: (document.querySelector(".ss-pv") || {}).innerText || "", pvHidden: document.querySelector(".ss-pv").hidden, links: [...document.querySelectorAll(".ss-pv .ss-pl a")].map((a) => a.getAttribute("href")) })); };
  // a monster: its numbers and drops, each drop's price only when sure
  const m = IDX.m.find((x) => x[0] === "Echopus") || IDX.m[0];
  let r = await look(m[0].toLowerCase());
  ok("monster found first", r.rows[0] && r.rows[0].n === m[0] && r.rows[0].on && r.groups[0] === "Monsters", JSON.stringify(r.rows.slice(0, 2)));
  ok("monster preview numbers match its page data", r.pv.includes("Lv " + m[2]) && r.pv.includes(m[3].toLocaleString("en-US") + " HP") && r.pv.includes(m[4].toLocaleString("en-US") + " EXP"), r.pv.slice(0, 160));
  const im = Object.fromEntries(IDX.i.map((x) => [x[0], x]));
  for (const d of m[7].slice(0, 6)) { const it = im[d]; const want = it && it[6] ? "sales" : "no sure price yet"; ok("drop " + d + (it && it[6] ? " shows its sure price" : " shows no number"), r.pv.split("\n").some((l) => l.startsWith(d) && l.includes(want)) || r.pv.includes(d + "\n") && r.pv.includes(want), want); }
  // an item: its sure price, its monsters and quests
  const priced = IDX.i.filter((x) => x[6] && x[4].length).sort((a, b) => b[7] - a[7])[0];
  r = await look(priced[0]);
  const row = r.rows.findIndex((x) => x.n === priced[0]);
  ok("item found", row >= 0, priced[0]);
  if (row >= 0 && !r.rows[row].on) { await p.hover(".ss-row >> nth=" + row).catch(() => {}); if (PHONE) for (let k = 0; k < row; k++) await p.keyboard.press("ArrowDown"); await p.waitForTimeout(300); r = await look(priced[0]); }
  const fmtShort = (n) => n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, "") + "B" : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M" : n >= 1e4 ? Math.round(n / 1e3) + "K" : n.toLocaleString("en-US");
  ok("item preview shows the board's sure typical", r.pv.includes(fmtShort(priced[6])) && r.pv.includes(priced[7] + " sales"), priced[0] + " " + priced[6] + " | " + r.pv.slice(0, 120));
  ok("item preview lists who drops it", priced[4].every((n) => r.pv.includes(n)), priced[4].join(", "));
  const unsure = IDX.i.find((x) => !x[6] && x[4].length);
  r = await look(unsure[0]); ok("an unsure item shows no number", r.pv.includes("no sure price yet") && !/\d+(\.\d)?[KMB]\b/.test(r.pv.split("Dropped by")[0].replace(unsure[0], "")), unsure[0]);
  // a quest and a map
  const q = IDX.q.find((x) => x[5] && x[6]); r = await look(q[0]);
  ok("quest found with level and reward", r.rows.some((x) => x.n === q[0]) && (r.rows.find((x) => x.on) || {}).n === q[0] ? r.pv.includes("Lv " + q[2] + "+") && r.pv.includes(q[6].toLocaleString("en-US") + " EXP") : r.rows.some((x) => x.n === q[0]), q[0]);
  const mp = IDX.p.find((x) => x[5].length >= 2); r = await look(mp[0]);
  ok("map found", r.rows.some((x) => x.n === mp[0]), mp[0]);
  r = await look("zzqqxx"); ok("no match says so", /Nothing on the site matches/.test(await p.evaluate(() => document.querySelector(".ss-list").innerText)) && r.pvHidden);
  // every result link in a common search goes to a page that exists
  r = await look("mushroom"); const bad = r.rows.map((x) => x.href).filter((h) => !fs.existsSync(R + h.slice(1) + "index.html"));
  ok("results for mushroom link to real pages", r.rows.length >= 5 && !bad.length, r.rows.length + " rows; bad " + bad.join(", "));
  await p.screenshot({ path: OUT + "ss-" + (PHONE ? "phone" : "desk") + ".png" });
  const fit = await p.evaluate(() => { const d = document.querySelector(".ss-box").getBoundingClientRect(); return { l: Math.round(d.left), r: Math.round(innerWidth - d.right), over: document.documentElement.scrollWidth - innerWidth }; });
  ok("search panel fits the screen", fit.l >= 0 && fit.r >= 0 && fit.over <= 0, JSON.stringify(fit));
  // keyboard: down and Enter opens the picked result's page; Esc closes
  await look(m[0]); await p.keyboard.press("Enter"); await p.waitForTimeout(1500);
  ok("Enter opens the monster page", new URL(p.url()).pathname === "/monster/" + m[1] + "/", p.url());
  await p.goto("https://maplefm.gg/", { waitUntil: "load" }); await p.waitForTimeout(2500);
  await tap(".sitenav .sn-site"); await p.waitForTimeout(600); await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  ok("Esc closes it", await p.evaluate(() => !document.querySelector("dialog.ss-dlg").open && !document.documentElement.classList.contains("ss-open")));
  ok("no script errors", !errs.length, errs.slice(0, 2).join("; "));
  ok("test visits sent nothing to the visit counter", hits === 0, hits + " beacons");
  console.log(log.join("\n")); await b.close(); process.exit(log.some((x) => x.startsWith("FAIL")) ? 1 : 0);
})();
