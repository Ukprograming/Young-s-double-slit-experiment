async (page) => {
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.reload();
await page.waitForFunction(()=>typeof window.youngDiagnostics==='function');
const checks=[];
function check(ok,label){if(!ok)throw new Error(label);checks.push(label);}
async function read(){return page.evaluate(()=>window.youngDiagnostics());}
async function slider(id,value){await page.locator('#'+id).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},String(value));await page.waitForTimeout(70);}
const original=await read();
check(original.waveBounds[1]<=original.screenX+1e-8,'wave geometry ends at screen');
check(original.wavePlaneY===0,'wavefronts confined to experiment plane');
check(!original.handles.find(h=>h.kind==='pick').visible,'observation dot hidden in wave mode');
await page.getByRole('button',{name:'一時停止',exact:true}).click();
const paused=(await read()).time;await page.waitForTimeout(180);check((await read()).time===paused,'pause stops propagation');
await page.getByRole('button',{name:'レーザーポインター',exact:true}).click();
let laser=await read();
check(laser.state.source==='laser'&&!laser.handles.some(h=>h.kind==='single'),'laser removes single slit and its handle');
check(await page.locator('#angleControl').isVisible()&&!await page.locator('#singleControl').isVisible(),'source-specific controls switch');
const laserCenter=laser.brightness[1];
await slider('sAngle',20);laser=await read();
check(Math.abs(laser.incident[1]-laser.incident[0]-1.3*Math.sin(20*Math.PI/180))<1e-9,'laser angle controls slit incident phase');
check(Math.abs(laser.brightness[1]-laserCenter)>.001,'tilted laser shifts fringes');
await page.screenshot({path:'output/playwright/laser-wave.png'});
await page.getByRole('button',{name:'経路表示',exact:true}).click();
await page.getByRole('button',{name:'媒質を挿入',exact:true}).click();
await page.waitForTimeout(120);
let d=await read();
check(d.state.medium&&d.pathVertices.length===4,'laser paths and medium render');
check(d.pathVertices.every(arr=>arr.filter((v,i)=>i%3===1).every(y=>Math.abs(y)<=.160001)),'path oscillations vertical amplitude');
check(d.pathVertices.some(arr=>Math.max(...arr.filter((v,i)=>i%3===1))>.1),'visible vertical path displacement');
check(d.pathVertices.every(arr=>arr.filter((v,i)=>i%3===0).every(x=>x<=d.screenX+1e-6)),'all paths stop before screen');
await page.screenshot({path:'output/playwright/laser-path-medium.png'});
await page.getByRole('button',{name:'初期化',exact:true}).click();
await page.getByRole('button',{name:'経路表示',exact:true}).click();
await page.getByRole('button',{name:'媒質を挿入',exact:true}).click();
await page.waitForTimeout(100);check((await read()).pathVertices.length===5,'point-source paths retain single slit');
await page.screenshot({path:'output/playwright/point-path-medium.png'});
await page.getByRole('button',{name:'初期化',exact:true}).click();
const canvas=page.locator('#c'),bounds=await canvas.boundingBox();
let before=await read();
await page.mouse.move(bounds.x+bounds.width*.3,bounds.y+bounds.height*.25);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.4,bounds.y+bounds.height*.32,{steps:10});await page.mouse.up();await page.waitForTimeout(250);
d=await read();check(Math.hypot(...d.camera.map((v,i)=>v-before.camera[i]))>.1,'mouse drag rotates viewpoint');
await page.getByRole('button',{name:'パン',exact:true}).click();before=await read();
await page.mouse.move(bounds.x+200,bounds.y+100);await page.mouse.down();await page.mouse.move(bounds.x+260,bounds.y+130,{steps:8});await page.mouse.up();await page.waitForTimeout(250);
d=await read();check(Math.hypot(...d.target.map((v,i)=>v-before.target[i]))>.05,'pan mode moves camera target');
const distance=x=>Math.hypot(...x.camera.map((v,i)=>v-x.target[i]));before=await read();
await page.getByRole('button',{name:'拡大',exact:true}).click();d=await read();check(distance(d)<distance(before)*.9,'zoom button zooms');
await page.mouse.move(bounds.x+200,bounds.y+200);before=await read();await page.mouse.wheel(0,180);await page.waitForTimeout(250);d=await read();check(distance(d)>distance(before),'mouse wheel zooms');
await page.getByRole('button',{name:'初期化',exact:true}).click();
await page.getByRole('button',{name:'経路表示',exact:true}).click();
check((await read()).handles.find(h=>h.kind==='pick').visible,'observation dot visible in path mode');
for(const kind of ['single','pick']){
 before=await read();const h=before.handles.find(h=>h.kind===kind);const x=bounds.x+(h.screen[0]+1)*bounds.width/2,y=bounds.y+(1-h.screen[1])*bounds.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+25,y+25,{steps:6});await page.mouse.up();await page.waitForTimeout(150);d=await read();
 check(d.controlsEnabled,'drag releases camera control '+kind);
 check(kind==='single'?Math.abs(d.state.singleZ)+Math.abs(d.state.singleX+2.9)>.01:Math.abs(d.state.pick)>.01,'3D handle drag '+kind);
 check(Math.hypot(...d.camera.map((v,i)=>v-before.camera[i]))<.01,'handle drag retains camera '+kind);
}
await slider('sl',2);await slider('sT',5);await slider('sL',2);await slider('sd',2);
d=await read();check(d.waveBounds[1]<=d.screenX+1e-8,'screen clipping follows maximum distance');
await page.getByRole('button',{name:'初期化',exact:true}).click();d=await read();
check(d.state.thickness===2&&await page.locator('#sT').inputValue()==='2','reset restores thickness slider after dynamic clamp');
check(d.state.mode==='wave'&&d.state.source==='point'&&!d.state.medium&&d.state.pick===0,'reset restores full experiment');
for(const [width,height] of [[390,844],[768,1024],[1024,768]]){
 await page.setViewportSize({width,height});await page.waitForTimeout(180);
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow '+width);
 check((await canvas.boundingBox()).height>=240,'canvas remains usable '+width);
 await page.screenshot({path:'output/playwright/responsive-'+width+'.png'});
}
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
const rect=await canvas.boundingBox();before=await read();
const touch=(x,y,id)=>({x,y,id});const cy=rect.y+rect.height*.35;
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(80,cy,1)]});
for(let n=1;n<=8;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(80+n*7,cy+n*3,1)]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(220);d=await read();
check(Math.hypot(...d.camera.map((v,i)=>v-before.camera[i]))>.1,'one-finger orbit');
before=await read();
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(100,cy,1),touch(250,cy,2)]});
for(let n=1;n<=8;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(100-n*4,cy+n*2,1),touch(250+n*4,cy+n*2,2)]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);d=await read();
check(distance(d)<distance(before),'two-finger pinch zoom');
check(Math.hypot(...d.target.map((v,i)=>v-before.target[i]))>.01,'two-finger pan');
check(d.controlsEnabled,'touch gesture releases camera');
await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'初期化',exact:true}).click();
await page.getByRole('button',{name:'真上',exact:true}).click();await page.waitForTimeout(100);d=await read();
check(Math.abs(d.camera[0]-d.target[0])<1e-8&&Math.abs((d.camera[2]-d.target[2])/(d.camera[1]-d.target[1]))<.001,'top view looks down onto experiment plane');
await page.screenshot({path:'output/playwright/top-view.png'});
await page.getByRole('button',{name:'視点を戻す',exact:true}).click();d=await read();
check(d.camera[1]>d.target[1]+1&&d.camera[2]>d.target[2]+1,'restore oblique viewpoint');
const handle=d.handles.find(h=>h.kind==='single'),box=await canvas.boundingBox();
const hx=box.x+(handle.screen[0]+1)*box.width/2,hy=box.y+(1-handle.screen[1])*box.height/2;
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(hx,hy,1)]});
await page.waitForFunction(()=>!window.youngDiagnostics().controlsEnabled,null,{timeout:2000});
check(!(await read()).controlsEnabled,'touch acquires object handle');
await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
await page.waitForFunction(()=>window.youngDiagnostics().controlsEnabled,null,{timeout:2000});
check((await read()).controlsEnabled,'touch cancellation releases object handle');
await page.getByRole('button',{name:'初期化',exact:true}).click();
check(errors.length===0,'no JavaScript or WebGL shader errors');
await page.evaluate(result=>window.acceptanceResult=result,{passed:checks.length,checks,errors});
return {passed:checks.length,checks,errors};

}
