// 20 searches players type, the way they type them. Each must suggest the item meant first, with its price when it has
// one (Nov 16: "brown work gloves" showed Work Gloves as "not seen yet", "claw att 10" led with the 60% scroll).
// Run: NODE_PATH=$(npm root -g) node tests/search-ux.cjs [chromium|webkit] [phone|desktop]   (exit 1 on any failure)
const pw = require("playwright"), ENGINE = pw[process.argv[2] || "chromium"], PHONE = (process.argv[3] || "desktop") === "phone";
const fs = require("fs"), R = require("path").join(__dirname, "..") + "/";
const Q = [["gfa 60", "Gloves Attack Scroll 60%"], ["wg", "Work Gloves"], ["elixer", "Elixir"], ["ilbi", "Ilbi Throwing Stars"], ["brown work gloves", "Work Gloves"],
  ["red pot", "Red Potion"], ["pe", "Power Elixir"], ["white pot", "White Potion"], ["steely", "Steely Throwing Knives"], ["orihalcon", "Orihalcon Ore"],
  ["hat acc 60", "Hat Accuracy Scroll 60%"], ["2h sword att 60", "Two-handed Sword Attack Scroll 60%"], ["two handed sword", "Two-Handed Sword"], ["black knucklevest pants", "Black Knucklevest Pants"],
  ["wg 3 att", "Work Gloves"], ["emerald earrings", "Emerald Earrings"], ["mana elixer", "Mana Elixir"], ["stirge wing", "Stirge Wing"], ["claw att 10", "Claw Attack Scroll 10%"], ["gfm 60", "Gloves Magic Attack Scroll 60%"]];
(async () => {
  const b = await ENGINE.launch(); const ctx = await b.newContext(PHONE ? Object.assign({}, pw.devices["iPhone 13"]) : { viewport: { width: 1440, height: 900 } });
  await ctx.route(/api\.maplefm\.gg\/hit/, (r) => r.fulfill({ status: 204, body: "" }));
  await ctx.route(/^https:\/\/maplefm\.gg\/(\?[^#]*)?$|^https:\/\/maplefm\.gg\/assets\/(board\.min\.js|board\.min\.css|advsearch\.js|kofigoal\.js)/, (r) => { const u = new URL(r.request().url()); const f = u.pathname === "/" ? "index.html" : u.pathname.slice(1); r.fulfill({ status: 200, contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html", body: fs.readFileSync(R + f) }); });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("https://maplefm.gg/"); await p.waitForFunction(() => document.querySelectorAll("#picks .pk").length > 0, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  const log = [];
  for (const [q, want] of Q) {
    await p.fill("#q", ""); await p.type("#q", q, { delay: 30 }); await p.waitForTimeout(1300);
    const s = await p.evaluate(() => [...document.querySelectorAll("#sugg .so")].filter((x) => !x.classList.contains("kind")).map((x) => ({ t: ((x.querySelector(".sn") || x).firstChild || {}).textContent.replace(/\s+/g, " ").trim(), unseen: !!x.querySelector(".sn small"), price: !x.querySelector(".sp.none") })));
    const top = s[0] || { t: "(nothing)" };
    const good = top.t.toLowerCase() === want.toLowerCase();
    log.push((good ? "ok   " : "FAIL ") + q + " -> " + top.t + (good ? "" : "   wanted " + want));
    // a suggestion that says "not seen yet" must really have no price on the board
    const lie = s.filter((x) => x.unseen).map((x) => x.t);
    const priced = await p.evaluate((ns) => ns.filter((n) => [...document.querySelectorAll("#rows tr[data-item]")].some((tr) => tr.dataset.item.toLowerCase() === n.toLowerCase())), lie);
    if (priced.length) log.push("FAIL " + q + ": says not seen yet for " + priced.join(", "));
  }
  log.push((errs.length ? "FAIL " : "ok   ") + "no script errors" + (errs.length ? " | " + errs[0] : ""));
  console.log(log.join("\n")); await b.close(); process.exit(log.some((x) => x.startsWith("FAIL")) ? 1 : 0);
})();
