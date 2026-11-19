// The Nov 19 2026 getting-around features on the live site (or BASE given as the first argument): Quests that hunt here on
// map pages, breadcrumbs on the help pages, the wide Guides hub, the Top button, 40 px phone menu taps, and the board's
// menu sliding back in on a phone when you scroll up (assets/navback.js). Screenshots go to /tmp/claude-0/bt/ga/.
// Run: NODE_PATH=$(npm root -g) node tests/getting-around.cjs [base url]   (exit 1 on any failure)
const pw=require("playwright");const B=process.argv[2]||"https://maplefm.gg",O="/tmp/claude-0/bt/ga/";const log=[];const ok=(n,c,x)=>log.push((c?"ok   ":"FAIL ")+n+(x?" | "+x:""));
(async()=>{const b=await pw.chromium.launch();
const mk=async o=>{const c=await b.newContext(o);await c.route(/classicrank\.com/,r=>r.fulfill({status:200,contentType:"application/json",body:'{"data":[]}'}));await c.route(/api\.maplefm\.gg\/hit/,r=>r.fulfill({status:204,body:""}));const p=await c.newPage();p.errs=[];p.on("pageerror",e=>p.errs.push(e.message));return [c,p]};
const D={viewport:{width:1440,height:900},deviceScaleFactor:1},P={...pw.devices["iPhone 13"]};
// 1 map page quests, desktop
{const [c,p]=await mk(D);await p.goto(B+"/map/dangerous-steam/");await p.waitForTimeout(1200);
const y=await p.evaluate(()=>{const h=[...document.querySelectorAll("h2")].find(h=>/Quests that hunt here/.test(h.textContent));return h?h.getBoundingClientRect().top+scrollY:-1});ok("desktop map page shows Quests that hunt here",y>0,"y "+Math.round(y));
await p.screenshot({path:O+"1-map-quests-desktop.png",fullPage:true,clip:{x:0,y:Math.max(0,y-500),width:1440,height:900}});
// 3 help page crumbs + lit menu
await p.goto(B+"/how-it-works.html");await p.waitForTimeout(1000);const hw=await p.evaluate(()=>({cr:[...document.querySelectorAll(".crumbs a,.crumbs span")].map(e=>e.textContent),lit:[...document.querySelectorAll(".sitenav a[aria-current]")].map(a=>a.textContent)}));ok("How it works: breadcrumbs and Prices lit",hw.cr.join(">")==="Prices>How prices work"&&/Prices/.test(hw.lit.join()),JSON.stringify(hw));
await p.screenshot({path:O+"3-help-crumbs-desktop.png",clip:{x:0,y:0,width:1440,height:420}});
for(const u of ["/streamers.html","/shortcuts.html","/terms.html","/bot/","/report.html","/404.html"]){await p.goto(B+u);await p.waitForTimeout(600);const n=await p.locator(".crumbs").count();ok("breadcrumbs on "+u,n===1,String(n));}
// 6 guides hub wide
await p.goto(B+"/guides/");await p.waitForTimeout(1000);const gw=await p.evaluate(()=>({card:Math.round(document.querySelector(".card.gd").getBoundingClientRect().width),cols:getComputedStyle(document.querySelector(".ghub")).gridTemplateColumns.split(" ").length}));ok("guides hub wide with several columns",gw.card>1200&&gw.cols>=3,JSON.stringify(gw));
await p.screenshot({path:O+"6-guides-hub-desktop.png",clip:{x:0,y:0,width:1440,height:700}});
await p.goto(B+"/guides/what-sells-by-level/");await p.waitForTimeout(800);const aw=await p.evaluate(()=>Math.round(document.querySelector(".card.gd").getBoundingClientRect().width));ok("guide article keeps a reading width",aw<=1040&&aw>700,String(aw));
// Top button desktop on long page
await p.goto(B+"/items/");await p.waitForTimeout(1000);await p.mouse.wheel(0,4000);await p.waitForTimeout(600);const tv=await p.locator(".sn-top:visible").count();ok("desktop Top button on a long page",tv===1);await p.locator(".sn-top").click();await p.waitForTimeout(1200);ok("desktop Top goes to the top",await p.evaluate(()=>scrollY)<5);
ok("desktop no script errors",!p.errs.length,p.errs.join(";"));await c.close();}
// phone
{const [c,p]=await mk(P);await p.goto(B+"/map/dangerous-steam/");await p.waitForTimeout(1000);await p.locator(".ptabs button:has-text('Quests')").tap();await p.waitForTimeout(400);
ok("phone map page Quests tab lists the hunts",await p.locator("h2:has-text('Quests that hunt here'):visible").count()===1);await p.screenshot({path:O+"2-map-quests-phone.png"});
const mh=await p.evaluate(()=>Math.round(document.querySelector(".sitenav .sn-links a").getBoundingClientRect().height));ok("phone menu taps 40 px or more",mh>=40,mh+"px");
await p.goto(B+"/items/");await p.waitForTimeout(1000);await p.evaluate(()=>scrollTo(0,5000));await p.waitForTimeout(300);
await p.mouse.wheel(0,200);await p.waitForTimeout(500);ok("phone Top button on a long page",await p.locator(".sn-top:visible").count()===1);await p.screenshot({path:O+"5-top-phone.png"});
await p.locator(".sn-top").tap();await p.waitForTimeout(1200);ok("phone Top goes to the top with the menu",await p.evaluate(()=>scrollY)<5);
// board float menu
await p.goto(B+"/");await p.waitForTimeout(7000);
const swipe=async(dy)=>{await p.evaluate(()=>window.dispatchEvent(new Event("touchmove")));await p.evaluate(dy=>scrollBy(0,dy),dy);await p.waitForTimeout(350);};
for(let i=0;i<6;i++)await swipe(400);ok("board: menu stays away while scrolling down",await p.evaluate(()=>!document.querySelector(".sn-float.on")));
await swipe(-60);const fs=await p.evaluate(()=>{const f=document.querySelector(".sn-float.on"),h=document.querySelector(".hsearch");return {on:!!f,fb:f?Math.round(f.getBoundingClientRect().bottom):0,ht:h?Math.round(h.getBoundingClientRect().top):-1}});
ok("board: menu slides back on scroll up, search moves under it",fs.on&&fs.ht>=fs.fb-2,JSON.stringify(fs));await p.waitForTimeout(300);await p.screenshot({path:O+"4-board-menu-phone.png"});
await swipe(400);ok("board: menu slides away again on scroll down",await p.evaluate(()=>!document.querySelector(".sn-float.on")));
await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(400);ok("board: no float at the top",await p.evaluate(()=>!document.querySelector(".sn-float.on")));
// open a card: no float, no Top
await p.fill("#q","work gloves");await p.waitForTimeout(800);await p.locator("#rows tr[data-item]").first().tap();await p.waitForTimeout(1500);await swipe(500);await swipe(-80);
ok("card open: no float menu, no Top over it",await p.evaluate(()=>!document.querySelector(".sn-float.on")&&!document.querySelector(".sn-top:not([hidden])")));
ok("phone sideways scroll none",await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
ok("phone no script errors",!p.errs.length,p.errs.join(";"));await c.close();}
console.log(log.join("\n"));await b.close();process.exit(log.some(x=>x.startsWith("FAIL"))?1:0);})();
