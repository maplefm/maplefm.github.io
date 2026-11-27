// Opens every live build guide in WebKit as an iPhone and on desktop: loads, slider works, icons load, no script errors. Run on demand.
const {webkit,devices}=require('playwright');
(async()=>{const b=await webkit.launch();let fail=0;
for(const slug of ['sindit','spearman-spear','spearman-polearm','assassin','pure-bandit','hunter','bowman','cleric','cleric-staff','crossbowman','fighter-axe','fighter-axe-1h','fighter-sword','fighter-sword-1h','fire-poison','fire-poison-staff','ice-lightning','ice-lightning-staff','magician','page-blunt','page-blunt-1h','page-sword','page-sword-1h','str-bandit','thief','warrior']){
 for(const [tag,o] of [['iphone',{...devices['iPhone 13']}],['desk',{viewport:{width:1440,height:900}}]]){
  const c=await b.newContext(o);await c.route(/api\.maplefm\.gg\/(hit|beacon)|classicrank/,r=>r.fulfill({status:204,body:''}));
  const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('https://maplefm.gg/builds/'+slug+'/?v='+Date.now(),{waitUntil:'networkidle',timeout:60000});await p.waitForTimeout(1500);
  const r=await p.evaluate(async()=>{lv.value=70;lv.dispatchEvent(new Event('input'));await new Promise(z=>setTimeout(z,300));
    return {w:document.documentElement.scrollWidth,iw:innerWidth,stats:stw.innerText.replace(/\n/g,' ').slice(0,60),wpn:(document.querySelector('.wpn small')||{}).textContent||'',
      broken:[...document.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0&&i.offsetParent).map(i=>i.getAttribute('src')).slice(0,3)}});
  const ok=!errs.length&&r.w<=r.iw&&!r.broken.length&&/LUK|STR|DEX/.test(r.stats)&&(/(Faster|Fast|Normal|Slow|Slower) \(speed \d\)/.test(r.wpn)||/magic attack/.test(r.wpn));if(!ok)fail++;
  console.log(ok?'ok  ':'FAIL',slug,tag,JSON.stringify(r),errs.slice(0,2).join('; '));await c.close()}}
await b.close();process.exit(fail?1:0)})();
