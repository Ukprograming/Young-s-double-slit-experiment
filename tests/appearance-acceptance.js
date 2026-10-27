async page=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.reload();await page.waitForFunction(()=>typeof window.youngDiagnostics==='function');
 const read=()=>page.evaluate(()=>window.youngDiagnostics());
 const checks=[];const check=(ok,s)=>{if(!ok)throw Error(s);checks.push(s);};
 let d=await read();check(d.speed===.425,'default speed halved');check(d.screenWidth===10.4,'screen width doubled');check(d.background==='000000','WebGL background black');
 check(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor==='rgb(0, 0, 0)'),'page background black');
 await page.locator('#speed').selectOption('0.25');let start=(await read()).time;await page.waitForTimeout(400);let delta=(await read()).time-start;
 check(delta>.025&&delta<.25,'quarter-speed playback advances slowly');
 await page.getByRole('button',{name:'初期化',exact:true}).click();check((await read()).state.speed===1&&await page.locator('#speed').inputValue()==='1','reset restores default speed');
 await page.getByRole('button',{name:'一時停止',exact:true}).click();
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(100);
 const probes=[];
 for(const L of [.5,1,2]){
  await page.locator('#sL').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},String(L));await page.waitForTimeout(100);
  d=await read();const b=await page.locator('#c').boundingBox();
  probes.push({L,x:Math.round(b.x+(d.screenProbe[0]+1)*b.width/2),y:Math.round(b.y+(1-d.screenProbe[1])*b.height/2),intensity:d.brightness[1]});
  await page.screenshot({path:'output/playwright/attenuation-'+L+'.png'});
 }
 check(probes[0].intensity>probes[1].intensity&&probes[1].intensity>probes[2].intensity,'fringe intensity decreases with L');
 await page.locator('#sPick').evaluate(el=>{el.value='5';el.dispatchEvent(new Event('input',{bubbles:true}));});check((await read()).state.pick===5,'observation point covers wider screen');
 await page.getByRole('button',{name:'初期化',exact:true}).click();
 for(const [width,height] of [[320,740],[390,844],[768,1024],[1024,768],[1440,900]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(100);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow '+width);
  await page.screenshot({path:'output/playwright/redesign-'+width+'.png'});
 }
 check(errors.length===0,'no script or shader errors');
 return {passed:checks.length,checks,probes,errors};
}
