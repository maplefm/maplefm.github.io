// The Recent sales drawer on a phone and a desktop: opens, its bar stays tappable above the sticky search, and it closes
// from the bar, a tap outside, Escape or starting a search. Serves this checkout's board. Run: NODE_PATH=$(npm root -g) node tests/drawer-ux.cjs
const pw=require("playwright"),fs=require("fs"),R=require("path").join(__dirname,"..");
(async()=>{let fails=0;const ok=(n,c,x)=>{console.log((c?"ok   ":"FAIL ")+n+(x!==undefined?" | "+x:""));if(!c)fails++;};
for(const dev of ["iPhone 13","desktop"]){
const b=await pw.chromium.launch();const c=await b.newContext(dev==="desktop"?{viewport:{width:1440,height:900}}:{...pw.devices[dev]});
await c.route(/api\.maplefm\.gg\/hit/,r=>r.fulfill({status:204,body:""}));
await c.route(/classicrank\.com/,r=>r.fulfill({status:200,contentType:"application/json",body:'{"data":[]}'}));
await c.route(/^https:\/\/maplefm\.gg\/(\?[^#]*)?$|^https:\/\/maplefm\.gg\/assets\/board\.min\.(js|css)/,r=>{const u=new URL(r.request().url());const f=u.pathname==="/"?"/index.html":u.pathname;r.fulfill({status:200,contentType:f.endsWith(".js")?"text/javascript":f.endsWith(".css")?"text/css":"text/html",body:fs.readFileSync(R+f)})});
const p=await c.newPage();const errs=[];p.on("pageerror",e=>errs.push(e.message));
await p.goto("https://maplefm.gg/");await p.waitForFunction(()=>document.querySelectorAll("#rows tr[data-item]").length>20,null,{timeout:60000});await p.waitForTimeout(1500);
const st=()=>p.evaluate(()=>{const d=document.getElementById("drawer"),btn=document.getElementById("drawerbtn").getBoundingClientRect();const t=document.elementFromPoint(btn.left+btn.width/2,btn.top+btn.height/2);return {open:d.classList.contains("open"),barOnTop:!!(t&&t.closest("#drawerbtn")),dx:getComputedStyle(d.querySelector(".dx")).display,listH:Math.round(document.getElementById("dlist").getBoundingClientRect().height),vh:innerHeight}});
const tap=async s=>{const l=p.locator(s).first(); if(dev==="desktop") await l.click(); else await l.tap();};
await tap("#drawerbtn");await p.waitForTimeout(600);let s=await st();
ok(dev+": opens",s.open,JSON.stringify(s));ok(dev+": bar tappable above the search",s.barOnTop);ok(dev+": Close shows",s.dx!=="none");ok(dev+": list at most 40% of screen",s.listH<=s.vh*0.41,s.listH+"/"+s.vh);
await p.screenshot({path:(process.env.OUT||require("os").tmpdir())+"/d2-"+dev.replace(/ /g,"")+"-open.png"});
await tap("#drawerbtn");await p.waitForTimeout(600);ok(dev+": bar closes it",!(await st()).open);
await tap("#drawerbtn");await p.waitForTimeout(400);await p.evaluate(()=>scrollTo(0,0));await (dev==="desktop"?p.mouse.click(30,200):p.touchscreen.tap(30,200));await p.waitForTimeout(500);ok(dev+": tap outside closes it",!(await st()).open);
await tap("#drawerbtn");await p.waitForTimeout(400);await p.keyboard.press("Escape");await p.waitForTimeout(300);ok(dev+": Escape closes it",!(await st()).open);
await tap("#drawerbtn");await p.waitForTimeout(400);await p.evaluate(()=>scrollBy(0,500));await p.waitForTimeout(400);await p.evaluate(()=>document.getElementById("q").focus());await p.waitForTimeout(300);ok(dev+": starting a search closes it",!(await st()).open);
await p.evaluate(()=>document.getElementById("q").blur());await tap("#drawerbtn");await p.waitForTimeout(500);await tap("#dlist button");await p.waitForTimeout(1500);
const card=await p.evaluate(()=>{const h=document.querySelector("#ip .ih h3");return h?h.innerText:""});ok(dev+": a sale in it still opens its item",!!card&&!(await st()).open,card);
await p.keyboard.press("Escape").catch(()=>{});
await p.locator("#q").fill("work gloves");await p.waitForTimeout(1200);const rows=await p.evaluate(()=>[...document.querySelectorAll("#rows tr[data-item]")].map(t=>t.dataset.item).slice(0,3));ok(dev+": search works",rows.some(r=>/Work Gloves/.test(r)),rows.join(", "));
ok(dev+": no script errors",!errs.length,errs.join("; "));
await b.close();}
console.log(fails?fails+" failed":"all passed");process.exit(fails?1:0);})();
