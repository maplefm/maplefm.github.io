// The weekly market recap as files for Reddit: report.html on the Week tab, saved with the page's own Export PDF
// (the PDF the admins make by hand) and as one tall PNG, which Reddit shows inline in an image post.
//   node tools/weeklypdf.cjs OUT_DIR [URL]
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
(async () => {
  const out = process.argv[2], url = process.argv[3] || "https://maplefm.gg/report.html#week";
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2, acceptDownloads: true, colorScheme: "light" });
  const p = await ctx.newPage();
  // the Export PDF button shows for admins; here it is shown by answering its admin check
  await p.route("https://api.maplefm.gg/admin/reddit", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForSelector("#pdf:not([hidden])", { timeout: 30000 });
  await p.waitForTimeout(2500);
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), p.click("#pdf")]);
  await dl.saveAs(path.join(out, "club-fm-weekly.pdf"));
  await p.evaluate(() => { document.documentElement.classList.add("pdfdoc"); document.documentElement.removeAttribute("data-theme"); });
  await p.waitForTimeout(800);
  await p.locator(".wrap").screenshot({ path: path.join(out, "club-fm-weekly.png") });
  const meta = await p.evaluate(() => ({ title: document.getElementById("sub") ? document.getElementById("sub").textContent : "" }));
  fs.writeFileSync(path.join(out, "club-fm-weekly.json"), JSON.stringify({ made: new Date().toISOString(), sub: meta.title }));
  await b.close();
  console.log("ok", meta.title);
})().catch((e) => { console.error(e); process.exit(1); });
