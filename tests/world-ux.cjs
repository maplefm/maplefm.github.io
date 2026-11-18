// The World button, the way a player uses it: Windia by default, one tap to Zenith and back. Zenith's board is built
// from Zenith scans only (a made-up Zenith market is served here) and never shows a Windia price; Windia's board never
// shows a Zenith one. Run: NODE_PATH=$(npm root -g) node tests/world-ux.cjs [chromium|webkit] [phone|desktop]
const pw = require("playwright"), ENGINE = pw[process.argv[2] || "chromium"], PHONE = (process.argv[3] || "desktop") === "phone";
const fs = require("fs"), R = require("path").join(__dirname, "..") + "/", OUT = (process.env.OUT || require("os").tmpdir()) + "/";
const log = []; const ok = (n, c, note) => log.push((c ? "ok   " : "FAIL ") + n + (note ? " | " + note : ""));
const now = Math.floor(Date.now() / 1000), day = new Date().toISOString().slice(0, 10), at = new Date().toISOString();
function rows(seller, item, p, n, sold) { const o = []; for (let k = 0; k < n; k++) o.push(Object.assign({ s: seller + k, i: item, p: p + k * 10, q: 1, t: now - 600 - k * 60, r: "FM" + (k % 20 + 1), c: k % 10 + 1, w: "Zenith" }, k < sold ? { so: true } : {})); return o; }
const ZEN = [{ at, src: "watcher-shop", who: "ZenScanner", inbox: "zen1", day, rows: [].concat(rows("Zn", "Elixir", 4400, 8, 5), rows("Zb", "Zenith Test Only Item", 1, 0, 0), rows("Zw", "Work Gloves", 777000, 6, 4)) }];
(async () => {
  const b = await ENGINE.launch(); const ctx = await b.newContext(PHONE ? Object.assign({}, pw.devices["iPhone 13"]) : { viewport: { width: 1440, height: 900 } });
  await ctx.route(/api\.maplefm\.gg\/hit/, (r) => r.fulfill({ status: 204, body: "" }));
  const seen = { snap: 0, summary: 0, zenLive: 0, liveNoWorld: 0, leakServed: 0 };
  await ctx.route(/api\.maplefm\.gg\/data\/live/, async (r) => { const u = r.request().url(); if (/world=zenith/.test(u)) { seen.zenLive++; return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ "data/inbox-zenith.json": zenEmpty ? [] : ZEN }) }); } seen.liveNoWorld++;
    // Windia's bundle as the Worker's fast lane carries it before the pump splits worlds: a Zenith-tagged row inside
    // data/fast.json must never reach Windia's board. Made up here, so the real 45 MB bundle is never pulled.
    const win = { at, src: "watcher-shop", who: "WinScanner", inbox: "win1", day, rows: rows("Wn", "Elixir", 600, 8, 5).map((x) => (delete x.w, x)) };
    const leak = { at, src: "watcher-shop", who: "Guest-fast", inbox: "fast-zz", day, fast: 1, rows: rows("Zf", "Zenith Test Only Item", 2500, 8, 5) };
    seen.leakServed++; return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ "data/inbox.json": [win], "data/fast.json": [leak] }) }); });
  let rawOnly = false, zenEmpty = false;   // phase 4: the server board is down, so the board builds from the raw bundle
  await ctx.route(/api\.maplefm\.gg\/data\/snap/, (r) => { seen.snap++; return rawOnly ? r.fulfill({ status: 503, body: "" }) : r.continue(); });
  await ctx.route(/summary-public\.json/, (r) => { seen.summary++; return rawOnly ? r.fulfill({ status: 404, body: "" }) : r.continue(); });
  await ctx.route(/^https:\/\/maplefm\.gg\/(\?[^#]*)?$|^https:\/\/maplefm\.gg\/assets\/(board\.min\.js|board\.min\.css|advsearch\.js|kofigoal\.js|world-[a-z]+\.png)/, (r) => { const u = new URL(r.request().url()); const f = u.pathname === "/" ? "index.html" : u.pathname.slice(1); r.fulfill({ status: 200, contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".png") ? "image/png" : "text/html", body: fs.readFileSync(R + f) }); });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  const tap = async (sel) => { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded(); if (PHONE) await l.tap(); else await l.click(); };
  const rowPrice = (n) => p.evaluate((n) => { const tr = document.querySelector('#rows tr[data-item="' + n + '"]'); return tr ? tr.innerText.replace(/\s+/g, " ") : null; }, n);
  // 1. Windia, the default
  await p.goto("https://maplefm.gg/"); await p.waitForFunction(() => document.querySelectorAll("#rows tr[data-item]").length > 20, null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  // the Server switch shows both servers, each with its game emblem, the one on screen pressed
  const wb = await p.evaluate(() => { const s = document.getElementById("worldsw"); const r = s && s.getBoundingClientRect();
    const bs = s ? [...s.querySelectorAll("button[data-world]")].map((b) => { const im = b.querySelector("img"); const br = b.getBoundingClientRect(); return { w: b.dataset.world, on: b.getAttribute("aria-pressed"), img: !!(im && im.complete && im.naturalWidth >= 32), tall: Math.round(br.height) }; }) : [];
    return s && { top: Math.round(r.top), vis: r.width > 0 && r.height > 0, bs, note: !document.getElementById("worldnote").hidden }; });
  ok("Server switch at the top shows both servers with their emblems", wb && wb.vis && wb.top < 260 && wb.bs.length === 2 && wb.bs.every((b) => b.img) && wb.bs.map((b) => b.w).join() === "Windia,Zenith", JSON.stringify(wb));
  ok("Windia is the one pressed", wb && wb.bs[0].on === "true" && wb.bs[1].on === "false");
  ok("each server is a real tap target", wb && wb.bs.every((b) => b.tall >= (PHONE ? 36 : 28)), wb && wb.bs.map((b) => b.tall).join("/"));
  ok("no Zenith note on Windia", wb && !wb.note);
  const wFirst = await p.evaluate(() => { const tr = document.querySelector("#rows tr[data-item]"); return { n: tr.dataset.item, t: tr.innerText.replace(/\s+/g, " ") }; });
  ok("Windia board is Windia's", !/Zenith/.test(wFirst.n) && !(await rowPrice("Zenith Test Only Item")), wFirst.n);
  ok("Windia never shows the Zenith-only item", !(await rowPrice("Zenith Test Only Item")));
  await p.screenshot({ path: OUT + "world-windia-" + (PHONE ? "phone" : "desk") + ".png" });
  // 2. one tap to Zenith
  seen.snap = 0; seen.summary = 0;
  await tap('#worldsw button[data-world="Zenith"]'); await p.waitForURL(/\?w=zenith/, { timeout: 15000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelectorAll("#rows tr[data-item]").length > 0, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2000);
  const z = await p.evaluate(() => ({ url: location.href, btn: document.querySelector('#worldsw [aria-pressed="true"]').dataset.world, note: !document.getElementById("worldnote").hidden, items: [...document.querySelectorAll("#rows tr[data-item]")].map((t) => t.dataset.item) }));
  ok("tap goes to Zenith", /\?w=zenith/.test(z.url) && /Zenith/.test(z.btn), z.url + " " + z.btn);
  ok("Zenith note shows", z.note);
  ok("Zenith board lists only Zenith items", z.items.length >= 2 && z.items.every((n) => ["Elixir", "Work Gloves"].includes(n)), z.items.join(", "));
  const zElixir = await rowPrice("Elixir"); ok("Zenith Elixir is Zenith's price", !!zElixir && /4,4\d\d|4\.4K/.test(zElixir), zElixir);
  ok("Zenith loads only Zenith scans", seen.zenLive > 0 && seen.snap === 0 && seen.summary === 0, JSON.stringify(seen));
  await tap('#rows tr[data-item="Elixir"] td:nth-child(3)'); await p.waitForTimeout(2000);
  const card = await p.evaluate(() => { const h = document.querySelector("#ip .ih h3"); return { name: h ? h.innerText : "", txt: (document.getElementById("ip") || {}).innerText || "" }; });
  ok("Zenith card opens with Zenith's price", card.name === "Elixir" && /4,4\d\d|4\.4K/.test(card.txt), card.name);
  await p.screenshot({ path: OUT + "world-zenith-" + (PHONE ? "phone" : "desk") + ".png" });
  if (PHONE) await tap("#sheetback"); else await p.keyboard.press("Escape"); await p.waitForTimeout(800);
  // 3. the choice sticks on the next visit, and Back to Windia returns
  await p.goto("https://maplefm.gg/"); await p.waitForTimeout(3000);
  ok("next visit stays on Zenith", (await p.evaluate(() => document.querySelector('#worldsw [aria-pressed="true"]').dataset.world)) === "Zenith");
  // tapping the server already shown does nothing
  await tap('#worldsw button[data-world="Zenith"]'); await p.waitForTimeout(1200); ok("tapping the shown server stays put", /\?w=zenith/.test(p.url()) || (await p.evaluate(() => localStorage.getItem("fm-world"))) === "Zenith", p.url());
  await tap("#worldback"); await p.waitForURL((u) => !/\?w=/.test(u.toString()), { timeout: 15000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelectorAll("#rows tr[data-item]").length > 20, null, { timeout: 60000 }).catch(() => {});
  const back = await p.evaluate(() => ({ btn: document.querySelector('#worldsw [aria-pressed="true"]').dataset.world, note: !document.getElementById("worldnote").hidden }));
  ok("Back to Windia", /Windia/.test(back.btn) && !back.note, JSON.stringify(back));
  // live data can move between loads; the typical price (first number) must be Windia's, within a few percent
  const num = (t) => { const m = /([\d,.]+)\s*([KMB])?/.exec(String(t || "").replace(/^[^\d]*/, "")); return m ? parseFloat(m[1].replace(/,/g, "")) * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]] || 1) : NaN; };
  const after = await rowPrice(wFirst.n), a0 = num(wFirst.t.replace(wFirst.n, "")), a1 = num(String(after).replace(wFirst.n, ""));
  ok("Windia board back after the round trip", !!after && Math.abs(a1 - a0) <= a0 * 0.05, wFirst.n + " " + a0 + " -> " + a1);
  // 4. Windia built from the raw bundle, with a Zenith row riding in the fast lane: it never shows
  rawOnly = true; seen.leakServed = 0;
  await p.goto("https://maplefm.gg/"); await p.waitForFunction(() => !!document.querySelector('#rows tr[data-item="Elixir"]'), null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2000);
  const raw = { elixir: await rowPrice("Elixir"), zen: await p.evaluate(() => /Zenith Test Only/.test(document.body.innerText)) };
  ok("raw Windia board loaded (test exercised)", seen.leakServed > 0 && !!raw.elixir, "bundle " + seen.leakServed + "x, Elixir " + raw.elixir);
  ok("fast-lane Zenith row stays off Windia", seen.leakServed > 0 && !raw.zen);
  // 5. Zenith with no scans yet (opening day): an honest empty board, never Windia's saved prices, and Windia's saved
  // copy left as it was. Live caught this on Nov 18: the quick-start copy of Windia's board showed under Zenith.
  rawOnly = false; zenEmpty = true;
  await p.goto("https://maplefm.gg/"); await p.waitForFunction(() => document.querySelectorAll("#rows tr[data-item]").length > 20, null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(2500);
  const sumOf = () => p.evaluate(() => { try { return (JSON.parse(localStorage.getItem("fm-summary")) || {}).rows.length; } catch (e) { return -1; } });
  const sumBefore = await sumOf();
  // a Zenith board with prices must not save over Windia's quick-start copy either
  zenEmpty = false; await p.evaluate(() => { localStorage.setItem("fm-world", "Zenith"); }); await p.goto("https://maplefm.gg/?w=zenith"); await p.waitForTimeout(6000);
  const sumZen = await sumOf();
  zenEmpty = true; await p.goto("https://maplefm.gg/?w=zenith"); await p.waitForTimeout(6000);
  const ze = await p.evaluate(() => ({ rows: document.querySelectorAll("#rows tr[data-item]").length, empty: ((document.getElementById("empty").hidden ? "" : document.getElementById("empty").innerText) || "").replace(/\s+/g, " ").trim().slice(0, 120), sum: (function () { try { return (JSON.parse(localStorage.getItem("fm-summary")) || {}).rows.length; } catch (e) { return -1; } })() }));
  ok("empty Zenith shows no Windia prices", ze.rows === 0, JSON.stringify(ze));
  ok("empty Zenith says why", /Zenith|no scans|nothing/i.test(ze.empty), ze.empty);
  ok("Windia's saved copy untouched by Zenith", sumBefore > 0 && sumZen === sumBefore && ze.sum === sumBefore, sumBefore + " -> " + sumZen + " -> " + ze.sum);
  await p.screenshot({ path: OUT + "world-zenith-empty-" + (PHONE ? "phone" : "desk") + ".png" });
  await p.evaluate(() => { localStorage.setItem("fm-world", "Windia"); });
  ok("no script errors", !errs.length, errs.slice(0, 2).join("; "));
  console.log(log.join("\n")); await b.close(); process.exit(log.some((x) => x.startsWith("FAIL")) ? 1 : 0);
})();
