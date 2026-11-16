// Search by stats the way a person uses it: tap, type, look. Serves this checkout's board files on maplefm.gg, live data.
// Run: NODE_PATH=$(npm root -g) node tests/advsearch-ux.cjs [chromium|webkit]   (exit 1 on any failure)
const pw = require("playwright"), devices = pw.devices, ENGINE = pw[process.argv[2] || "chromium"]; const fs = require("fs"); const R = require("path").join(__dirname, "..") + "/";
const OUT = (process.env.OUT || require("os").tmpdir()) + "/"; const log = []; const ok = (n, c, note) => { log.push((c ? "ok   " : "FAIL ") + n + (note ? " | " + note : "")); };
(async () => { const b = await ENGINE.launch();
const ctx = await b.newContext(Object.assign({}, devices["iPhone 13"]));
await ctx.route(/api\.maplefm\.gg\/hit/, (r) => r.fulfill({ status: 204, body: "" }));
await ctx.route(/^https:\/\/maplefm\.gg\/(\?[^#]*)?$|^https:\/\/maplefm\.gg\/assets\/(board\.min\.js|board\.min\.css|advsearch\.js|kofigoal\.js)/, (r) => { const u = new URL(r.request().url()); const f = u.pathname === "/" ? "index.html" : u.pathname.slice(1); r.fulfill({ status: 200, contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html", body: fs.readFileSync(R + f) }); });
const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto("https://maplefm.gg/", { waitUntil: "load" }); await p.waitForTimeout(11000);
const rows = () => p.evaluate(() => [...document.querySelectorAll("#sres li")].map(li => li.innerText.replace(/\s+/g, " ")));
const head = () => p.evaluate(() => { const s = document.getElementById("sres"); return s && !s.hidden ? s.innerText.split("\n").slice(0, 3).join(" | ") : "(hidden)"; });
const btn = () => p.evaluate(() => (document.getElementById("advshow") || {}).textContent);
// A. type Claw, ATT 30
await p.tap("#advbtn"); await p.waitForTimeout(800);
await p.selectOption("#advbox select[aria-label='Equip type']", "Claw"); await p.waitForTimeout(800);
const att = p.locator("#advbox input[aria-label='ATT total']"); await att.tap(); await att.fill("30"); await p.waitForTimeout(900);
const rA = await rows(); ok("A claw ATT 30: box empty", (await p.inputValue("#q")) === "", await p.inputValue("#q"));
ok("A every row shows 30 ATT", rA.length > 0 ? rA.every(t => /\b30 ATT\b/.test(t)) : true, rA.length + " rows; " + (rA[0] || "") );
ok("A button counts", /Show \d+ cop|No exact|None match/.test(await btn()), await btn());
await p.screenshot({ path: OUT + "A-panel.png" });
for (let i = 0; i < 3; i++) await att.press("ArrowUp"); await p.waitForTimeout(900);   // spin up like a stepper
ok("A no pile-up in box", (await p.inputValue("#q")) === "", JSON.stringify(await p.inputValue("#q")));
await p.tap("#advshow"); await p.waitForTimeout(1200);
ok("A Show scrolls to results", await p.evaluate(() => { const r = document.getElementById("sres").getBoundingClientRect(); return r.top < 200 && r.top > -50; }), await head());
await p.screenshot({ path: OUT + "A-results.png" });
// B. named item, or more
await p.evaluate(() => scrollTo(0, 0)); await p.tap("#advbox .ax-clr"); await p.waitForTimeout(500);
await p.fill("#q", "work gloves"); await p.waitForTimeout(1500);
const att2 = p.locator("#advbox input[aria-label='ATT total']"); await att2.fill("6"); await p.waitForTimeout(900);
await p.locator("#advbox .ax-stc:has(input[aria-label='ATT total']) .ax-ge").tap(); await p.waitForTimeout(900);
const rB = await rows();
ok("B work gloves 6+ ATT: box keeps item", (await p.inputValue("#q")) === "work gloves", await p.inputValue("#q"));
ok("B every row 6 ATT or more", rB.every(t => { const m = /(\d+) ATT/.exec(t); return m && +m[1] >= 6; }), rB.length + " rows; " + rB.slice(0, 2).join(" // "));
const urlB = p.url(); await p.screenshot({ path: OUT + "B.png" });
// C. typed stats then edit in panel
await p.fill("#q", "wg 8 att"); await p.waitForTimeout(1500);
ok("C typed 8 att shows in panel", (await p.inputValue("#advbox input[aria-label='ATT total']")) === "8", await p.inputValue("#advbox input[aria-label='ATT total']"));
await p.fill("#advbox input[aria-label='ATT total']", "6"); await p.waitForTimeout(900);
ok("C edit moves stats to panel, box keeps item", (await p.inputValue("#q")) === "wg", JSON.stringify(await p.inputValue("#q")));
ok("C results follow the panel", (await head()).includes("6 ATT"), await head());
// D. shared link
const p2 = await ctx.newPage(); await p2.goto(urlB, { waitUntil: "load" }); await p2.waitForTimeout(12000);
const h2 = await p2.evaluate(() => { const s = document.getElementById("sres"); return s && !s.hidden ? s.innerText.split("\n").slice(0, 2).join(" | ") : "(hidden)"; });
ok("D shared link opens the same search", /Work Gloves/.test(h2) && /6\+ ATT/.test(h2), urlB.replace("https://maplefm.gg", "") + " → " + h2);
await p2.close();
// E. panel closed, new search: no stale stats
await p.tap("#advbtn"); await p.waitForTimeout(500); await p.fill("#q", "elixir"); await p.waitForTimeout(1500);
ok("E closed panel, new item: no leftover stats", await p.evaluate(() => document.getElementById("sres").hidden), await head());
ok("no script errors", !errs.length, errs.slice(0, 2).join("; "));
console.log(log.join("\n")); await b.close(); process.exit(log.some((x) => x.startsWith("FAIL")) ? 1 : 0); })();
