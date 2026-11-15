// Club FM feature and failure tests on the live site. Read only: nothing is sent to the live data.
// The visit beacon (/hit), Sold? votes and every write to api.maplefm.gg are blocked by the test itself.
// Run: NODE_PATH=$(npm root -g) node tests/features.cjs [out.json]
const { chromium, devices } = require("playwright");
const fs = require("fs");
const B = process.env.BASE || "https://maplefm.gg";
const OUT = process.argv[2];
const results = [];
function rec(name, ok, note) { results.push({ name, ok: !!ok, note: note || "" }); console.log((ok ? "ok   " : "FAIL ") + name + (note ? " | " + note : "")); }
async function ctxWith(b, opts, routes) {
  const ctx = await b.newContext(Object.assign({ viewport: { width: 1366, height: 900 } }, opts || {}));
  const sent = [];
  // safety: no writes reach the live Worker from a test
  await ctx.route(/api\.maplefm\.gg\/(hit|sold|vote|report|me\/|missimg|scan|inbox|alerts|watch)/, (r) => { sent.push(r.request().method() + " " + r.request().url()); return r.request().method() === "GET" ? r.continue() : r.fulfill({ status: 204, body: "" }); });
  for (const [re, fn] of routes || []) await ctx.route(re, fn);
  ctx.__sent = sent;
  return ctx;
}
async function open(ctx, url, wait) {
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
  await p.addInitScript(() => { window.__xss = 0; });
  await p.goto(B + url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => errs.push("goto " + e.message.slice(0, 80)));
  await p.waitForTimeout(wait == null ? 8000 : wait);
  p.__errs = errs; return p;
}
const text = (p) => p.evaluate(() => document.body.innerText);
const ready = (p) => p.evaluate(() => !!(window.FMS && document.querySelectorAll(".row, tr").length > 5) || document.body.innerText.length > 2000);
async function search(p, q) { const s = await p.$("#q"); await s.fill(""); await s.type(q.slice(0, 600), { delay: 0 }); await p.waitForTimeout(1200); return text(p); }

(async () => {
  const b = await chromium.launch();
  // 1. search inputs
  {
    const ctx = await ctxWith(b); const p = await open(ctx, "/");
    const cases = [["work gloves", /Work Gloves/], ["wg", /Work Gloves/], ["wrok glvoes", /Work Gloves/], ["glove att 60", /Gloves Attack Scroll/], ["10% claw", /Claw Attack Scroll/],
      ["wg 8 att", /Work Gloves/], ["work gloves 1 crit", /Work Gloves/], ["", null], ["x".repeat(500), null], ["🍄🍄 mushroom", null], ["<script>window.__xss=1</script>", null],
      ["<img src=x onerror=window.__xss=1>", null], ["\"'quotes'\" `tick`", null], ["%00%3Cscript%3E", null]];
    for (const [q, want] of cases) {
      const t = await search(p, q).catch((e) => "ERR " + e.message);
      const x = await p.evaluate(() => window.__xss);
      rec("search " + JSON.stringify(q.length > 40 ? q.slice(0, 20) + "…(" + q.length + ")" : q), !x && !/^ERR/.test(t) && (!want || want.test(t)) && !p.__errs.length, (x ? "script ran " : "") + p.__errs.slice(0, 2).join("; "));
    }
    // search typed before the board has loaded
    const p2 = await ctx.newPage(); const e2 = []; p2.on("pageerror", (e) => e2.push(e.message));
    await p2.goto(B + "/", { waitUntil: "commit" }); const box = await p2.waitForSelector("#q", { timeout: 20000 }).catch(() => null);
    if (box) { await box.type("work gloves"); await p2.waitForTimeout(9000); }
    rec("search while loading", box && /Work Gloves/.test(await text(p2)) && !e2.length, e2.slice(0, 2).join("; "));
    rec("no writes sent during search tests", !ctx.__sent.some((s) => !/^GET/.test(s)), ctx.__sent.filter((s) => !/^GET/.test(s)).slice(0, 3).join(" "));
    await ctx.close();
  }
  // 2. deep links and Discord link formats
  {
    const ctx = await ctxWith(b);
    for (const [u, want] of [["/#item=Work%20Gloves", /Work Gloves/], ["/?q=work%20gloves", /Work Gloves/], ["/c/work-gloves/", /Work Gloves/], ["/item/work-gloves/", /Work Gloves price/],
      ["/?q=Work%20Gloves&s=SomeSeller&p=1000000", /Work Gloves/], ["/?ref=discord", /Club FM/], ["/#item=No%20Such%20Item%20Zz", /Club FM/], ["/?q=wg%208%20att", /Work Gloves/], ["/?a=", /Club FM/],
      ["/map/", /Maps|maps/], ["/download/", /Earn|scanning/], ["/monster/", /Monsters|monsters/], ["/quest/", /Quests|quests/]]) {
      const p = await open(ctx, u, /^\/(map|download|monster|quest)\/$/.test(u) ? 4000 : 8000);
      const t = await text(p); rec("link " + u, want.test(t) && !p.__errs.length, p.__errs.slice(0, 2).join("; ") + " → " + p.url().replace(B, "")); await p.close();
    }
    await ctx.close();
  }
  // 3. failures
  const FAIL = [
    ["Worker down", [[/api\.maplefm\.gg/, (r) => r.abort("connectionrefused")]]],
    ["GitHub raw down", [[/raw\.githubusercontent\.com/, (r) => r.abort("connectionrefused")]]],
    ["GitHub raw slow 6 s", [[/raw\.githubusercontent\.com/, async (r) => { await new Promise((ok) => setTimeout(ok, 6000)); r.continue(); }]]],
    ["snapshot empty", [[/api\.maplefm\.gg\/data\/snap(\?|$)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" })]]],
    ["snapshot malformed", [[/api\.maplefm\.gg\/data\/snap(\?|$)/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{\"rows\":[1,2,{" })]]],
    ["summary malformed", [[/summary-public\.json/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: "<html>oops" })]]],
    ["item list 500", [[/itemdb\.json/, (r) => r.fulfill({ status: 500, body: "" })]]],
    ["server board stale (snap-status old)", [[/api\.maplefm\.gg\/data\/snap-status/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ at: Date.now() - 6 * 3600e3 }) })]]],
  ];
  for (const [name, routes] of FAIL) {
    const ctx = await ctxWith(b, null, routes); const p = await open(ctx, "/", 14000);
    const t = await text(p); const blank = t.trim().length < 200;
    rec("failure: " + name, !p.__errs.length && !blank, (blank ? "page blank " : "") + p.__errs.slice(0, 2).join("; ") + " | shows: " + t.replace(/\s+/g, " ").slice(0, 120));
    await ctx.close();
  }
  // offline mid-session and back
  {
    const ctx = await ctxWith(b); const p = await open(ctx, "/");
    await ctx.setOffline(true); await search(p, "work gloves").catch(() => {}); await p.evaluate(() => { const a = document.querySelector("[data-item], .row"); if (a) a.click(); }); await p.waitForTimeout(3000);
    const off = await text(p); await ctx.setOffline(false); await p.waitForTimeout(4000);
    rec("offline mid-session", !p.__errs.length && off.length > 500, p.__errs.slice(0, 2).join("; "));
    await ctx.close();
  }
  // slow 3G
  {
    const ctx = await ctxWith(b, devices["Pixel 5"]); const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    const c = await ctx.newCDPSession(p); await c.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 400e3 / 8, uploadThroughput: 400e3 / 8 });
    const t0 = Date.now(); await p.goto(B + "/", { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {}); const dcl = Date.now() - t0;
    let firstPrice = 0; for (let i = 0; i < 60; i++) { if (/\d+(\.\d+)?[KM]\b/.test(await text(p))) { firstPrice = Date.now() - t0; break; } await p.waitForTimeout(1000); }
    rec("slow 3G: board shows prices", firstPrice > 0 && !errs.length, "first HTML " + dcl + " ms, first price " + (firstPrice || "never") + " ms");
    await ctx.close();
  }
  // two tabs
  {
    const ctx = await ctxWith(b); const p1 = await open(ctx, "/"), p2 = await open(ctx, "/");
    await p1.evaluate(() => { try { localStorage.setItem("fm-watch", JSON.stringify({ "Work Gloves": { t: Date.now() } })); } catch (e) {} });
    await p2.reload(); await p2.waitForTimeout(8000);
    rec("two tabs open", !p1.__errs.length && !p2.__errs.length && (await text(p2)).length > 1000, "");
    await ctx.close();
  }
  // injection: names with HTML in the live data, served to this browser only
  {
    const evil = "<img src=x onerror=window.__xss=1><b>Bold</b>";
    const ctx = await ctxWith(b, null, [[/api\.maplefm\.gg\/data\/snap(\?|$)/, async (r) => {
      const res = await r.fetch(); let j; try { j = await res.json(); } catch (e) { return r.fulfill({ response: res }); }
      const s = JSON.stringify(j).replace(/"s":"[^"]{2,16}"/, '"s":"' + evil.replace(/"/g, '\\"') + '"');
      return r.fulfill({ status: 200, contentType: "application/json", body: s });
    }]]);
    const p = await open(ctx, "/", 12000);
    for (let i = 0; i < 30; i++) { await p.mouse.wheel(0, 3000); await p.waitForTimeout(150); }
    const x = await p.evaluate(() => window.__xss); const shownAsText = /<img src=x/.test(await text(p));
    rec("injection: seller name with HTML", !x, (x ? "SCRIPT RAN" : "no script") + (shownAsText ? ", shown as plain text" : ", name not on screen in this view"));
    await ctx.close();
  }
  await b.close();
  const nf = results.filter((r) => !r.ok).length;
  console.log("features: " + (results.length - nf) + " of " + results.length + " pass");
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  process.exit(nf ? 1 : 0);
})();
