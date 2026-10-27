import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { SOURCE_X,DOUBLE_X,HALF_WIDTH,SCREEN_HALF_WIDTH,SPEED,SCREEN_EXPOSURE,defaults,wavelength,slitPositions,screenX,direction,incidentStart,mediumGeometry,incidentOpticalDistance,brightness,incidentAmplitude,pathPoint } from './physics.mjs?v=20261027-2';

const $=id=>document.getElementById(id);
const canvas=$('c'), state=defaults();
let renderer;
try { renderer=new THREE.WebGLRenderer({canvas,antialias:true}); }
catch(error) { $('error').hidden=false; $('error').textContent='3D表示を開始できませんでした。WebGLが有効なブラウザーで開いてください。'; throw error; }
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.setClearColor(0x000000);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(43,1,0.05,160);
const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true; controls.dampingFactor=0.12;
controls.minDistance=2; controls.maxDistance=55;
controls.maxPolarAngle=Math.PI*0.96;
controls.touches.ONE=THREE.TOUCH.ROTATE;
controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
scene.add(new THREE.HemisphereLight(0xd9edff,0x1b2440,2.4));
const light=new THREE.DirectionalLight(0xffffff,2.2); light.position.set(-3,7,5); scene.add(light);
const hardware=new THREE.Group(),paths=new THREE.Group(); scene.add(hardware,paths);
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),dragPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
let handles=[],pathCurves=[],paused=false,time=40,last=performance.now(),drag=null;
const PATH_WAVE_WIDTH=3, pathResolution=new THREE.Vector2(1,1);

function disposeGroup(group) {
 group.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});
 group.clear();
}
function box(parent,position,size,color,opacity=1) {
 const material=new THREE.MeshPhongMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity===1,shininess:50});
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.position.set(...position);parent.add(mesh);
 const edges=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:opacity<1?0x66d9ff:0x425a84,transparent:opacity<1,opacity:0.8}));mesh.add(edges);
 return mesh;
}
function sphere(parent,x,y,z,r,color) {
 const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,24,16),new THREE.MeshBasicMaterial({color}));mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
function board(x,gaps) {
 let from=-HALF_WIDTH;
 for(const z of [...gaps,HALF_WIDTH+0.065]) {
  const to=Math.min(HALF_WIDTH,z-0.065);
  if(to>from)box(hardware,[x,0,(from+to)/2],[0.075,1.45,to-from],0x1a2b48);
  from=z+0.065;
 }
 for(const y of [-.77,.77])box(hardware,[x,y,0],[0.16,0.1,HALF_WIDTH*2+0.1],0x334566);
}
const uniforms={
 uTime:{value:time},uLambda:{value:0.25},uScreen:{value:3},uSingle:{value:new THREE.Vector2()},uLaser:{value:0},
 uAmplitude:{value:new THREE.Vector2(1,1)},uDirection:{value:new THREE.Vector2(1,0)},uSlits:{value:new THREE.Vector2()},uIncident:{value:new THREE.Vector2()},
 uMedium:{value:0},uN:{value:1.5},uBoxCenter:{value:new THREE.Vector2()},uBoxAxis:{value:new THREE.Vector2()},uBoxSize:{value:new THREE.Vector2()}
};
const vertex=`varying vec3 world; void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`;
const shared=`
 varying vec3 world;
 uniform float uTime,uLambda,uScreen,uLaser,uMedium,uN;
 uniform vec2 uSingle,uDirection,uSlits,uIncident,uBoxCenter,uBoxAxis,uBoxSize,uAmplitude;
 float boxDistance(vec2 a,vec2 b){
  vec2 normal=vec2(-uBoxAxis.y,uBoxAxis.x);
  vec2 q=vec2(dot(a-uBoxCenter,uBoxAxis),dot(a-uBoxCenter,normal));
  vec2 v=vec2(dot(b-a,uBoxAxis),dot(b-a,normal));
  vec2 safeV=vec2(abs(v.x)<0.000001?0.000001:v.x,abs(v.y)<0.000001?0.000001:v.y);
  vec2 t1=(-uBoxSize*.5-q)/safeV,t2=(uBoxSize*.5-q)/safeV;
  float lo=max(0.,max(min(t1.x,t2.x),min(t1.y,t2.y)));
  float hi=min(1.,min(max(t1.x,t2.x),max(t1.y,t2.y)));
  return max(0.,hi-lo)*length(b-a)*uMedium;
 }
 float incident(vec2 p){
  vec2 start=uSingle;
  float base=distance(vec2(-4.2,0.),uSingle)+distance(uSingle,p);
  if(uLaser>.5){start=vec2(-4.2,p.y-(p.x+4.2)*uDirection.y/uDirection.x);base=dot(p-vec2(-4.2,0.),uDirection)+2.;}
  return base+(uN-1.)*boxDistance(start,p);
 }
 float spread(float r){return 1./max(1.,r);}
 float singleAmplitude(){return spread(distance(vec2(-4.2,0.),uSingle));}
 float waveLight(float amplitude){return pow(1.-exp(-8.*amplitude*amplitude),.4);}
 float crest(float optical){
  float phase=6.28318530718*(optical-${SPEED}*uTime)/uLambda;
  float band=abs(sin(phase*.5));
  return (1.-smoothstep(.025,.025+max(fwidth(phase)*.65,.13),band))*step(optical,${SPEED}*uTime);
 }
`;
const waveMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,transparent:true,depthWrite:false,side:THREE.DoubleSide,
 fragmentShader:shared+`
 void main(){
  vec2 p=world.xz;
  // Clip in world coordinates, independent of the camera direction or zoom.
  if(p.x>=uScreen||abs(p.y)>(p.x< -1.?${HALF_WIDTH.toFixed(1)}:${SCREEN_HALF_WIDTH.toFixed(1)}))discard;
  vec3 color=vec3(1.,.78,.32);float alpha=0.;
  if(p.x< -1.045){
   if(uLaser<.5&&p.x<uSingle.x-.04){float r=distance(p,vec2(-4.2,0.));alpha=crest(r)*waveLight(spread(r));}
   else if(uLaser>.5||p.x>uSingle.x+.04){float a=uLaser>.5?1.:singleAmplitude()*spread(distance(p,uSingle));alpha=crest(incident(p))*waveLight(a);}
  }else if(p.x>-.955){
   float r1=distance(p,vec2(-1.,uSlits.x)),r2=distance(p,vec2(-1.,uSlits.y));
   float upper=crest(uIncident.x+r1)*waveLight(uAmplitude.x*spread(r1));
   float lower=crest(uIncident.y+r2)*waveLight(uAmplitude.y*spread(r2));
   color=mix(vec3(.35,.95,.72),vec3(.38,.7,1.),lower/(upper+lower+.001));
   alpha=max(upper,lower);
  }
  if(alpha<.015)discard;
  gl_FragColor=vec4(color,alpha*.9);
 }`});
const wavePlane=new THREE.Mesh(new THREE.PlaneGeometry(1,1),waveMaterial);wavePlane.rotation.x=-Math.PI/2;scene.add(wavePlane);
const screenMaterial=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,side:THREE.DoubleSide,
 fragmentShader:shared+`
 void main(){
  float a=uIncident.x+distance(vec2(-1.,uSlits.x),vec2(uScreen,world.z));
  float b=uIncident.y+distance(vec2(-1.,uSlits.y),vec2(uScreen,world.z));
  float amp1=uAmplitude.x*spread(distance(vec2(-1.,uSlits.x),vec2(uScreen,world.z)));
  float amp2=uAmplitude.y*spread(distance(vec2(-1.,uSlits.y),vec2(uScreen,world.z)));
  float intensity=max(0.,(amp1*amp1+amp2*amp2+2.*amp1*amp2*cos(6.28318530718*(b-a)/uLambda))*.25);
  float luminance=sqrt(1.-exp(-${SCREEN_EXPOSURE.toFixed(1)}*intensity));
  vec3 col=vec3(.87,.96,1.)*luminance;
  gl_FragColor=vec4(col,1.);
 }`});
const screenFaces=[];
for(const sign of [-1,1]) {
 const face=new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_HALF_WIDTH*2,1.4),screenMaterial);
 face.rotation.y=Math.PI/2;face.userData.sign=sign;screenFaces.push(face);scene.add(face);
}
function line(a,b,color,opacity=1) {
 const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0],0,a[1]),new THREE.Vector3(b[0],0,b[1])]),new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));paths.add(mesh);
}
// Screen-space ribbons keep the waveform readable at 3 CSS pixels, including
// on WebGL implementations where native line width is fixed at one pixel.
function addPath(a,b,offset,color,throughMedium=false) {
 line(a,b,0x8397bd,.45);
 const count=241,points=new Float32Array(count*3),geometry=new THREE.BufferGeometry();
 for(const name of ['position','previous','next'])geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(count*6),3).setUsage(THREE.DynamicDrawUsage));
 const sides=new Float32Array(count*2),indices=[];
 for(let i=0;i<count;i++) {
  sides[i*2]=-1;sides[i*2+1]=1;
  if(i<count-1){const j=i*2;indices.push(j,j+1,j+2,j+1,j+3,j+2);}
 }
 geometry.setAttribute('side',new THREE.BufferAttribute(sides,1));geometry.setIndex(indices);
 const material=new THREE.ShaderMaterial({
  uniforms:{color:{value:new THREE.Color(color)},resolution:{value:pathResolution},width:{value:PATH_WAVE_WIDTH}},
  transparent:true,depthWrite:false,side:THREE.DoubleSide,
  vertexShader:`
   attribute vec3 previous,next;attribute float side;
   uniform vec2 resolution;uniform float width;varying float edge;
   void main(){
    vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
    vec4 a=projectionMatrix*modelViewMatrix*vec4(previous,1.);
    vec4 b=projectionMatrix*modelViewMatrix*vec4(next,1.);
    vec2 tangent=(b.xy/b.w-a.xy/a.w)*resolution;
    vec2 normal=vec2(-tangent.y,tangent.x)/max(length(tangent),.00001);
    p.xy+=normal*side*width/resolution*p.w;
    edge=side;gl_Position=p;
   }`,
  fragmentShader:`
   uniform vec3 color;varying float edge;
   void main(){
    float alpha=1.-smoothstep(1.-fwidth(edge),1.,abs(edge));
    gl_FragColor=vec4(color,alpha);
    #include <colorspace_fragment>
   }`
 });
 const mesh=new THREE.Mesh(geometry,material);paths.add(mesh);
 pathCurves.push({a,b,offset,throughMedium,mesh,points});
}
function updatePath(curve) {
 const {points,mesh}=curve,count=points.length/3;
 for(let i=0;i<count;i++)points.set(pathPoint(state,curve.a,curve.b,i/(count-1),curve.offset,time,curve.throughMedium),i*3);
 for(let i=0;i<count;i++)for(const [name,index] of [['position',i],['previous',Math.max(0,i-1)],['next',Math.min(count-1,i+1)]]) {
  const attr=mesh.geometry.attributes[name],k=index*3;
  for(let side=0;side<2;side++)attr.setXYZ(i*2+side,points[k],points[k+1],points[k+2]);
 }
 for(const name of ['position','previous','next'])mesh.geometry.attributes[name].needsUpdate=true;
 mesh.geometry.computeBoundingSphere();
}
function rebuildPaths() {
 disposeGroup(paths);pathCurves=[];
 const zs=slitPositions(state),P=[screenX(state)-.001,state.pick];
 if(state.source==='point')addPath([SOURCE_X,0],[state.singleX,state.singleZ],0,0xffd166);
 for(let i=0;i<2;i++) {
  const z=zs[i],a=incidentStart(state,z),b=[DOUBLE_X,z];
  const offset=state.source==='point'?Math.hypot(state.singleX-SOURCE_X,state.singleZ):(a[0]-SOURCE_X)*direction(state)[0]+a[1]*direction(state)[1]+2;
  addPath(a,b,offset,0xffd166,true);
  addPath(b,P,incidentOpticalDistance(state,z),i===0?0x72f1b8:0x66b5ff);
 }
 paths.visible=state.mode==='path';wavePlane.visible=state.mode==='wave';
 const pick=handles.find(h=>h.userData.handle==='pick');if(pick)pick.visible=state.mode==='path';
}
function rebuild() {
 disposeGroup(hardware);handles=[];
 const zs=slitPositions(state),xs=screenX(state),m=mediumGeometry(state);
 const max=Math.min(5,Math.floor(m.maxThickness*100)/100);
 $('sT').max=max;
 if(state.thickness>max){state.thickness=max;$('sT').value=max;}
 $('sT').value=state.thickness;
 $('sTout').textContent=state.thickness.toFixed(2)+'λ';
 if(state.source==='point') {
  sphere(hardware,SOURCE_X,0,0,.13,0xffd166);board(state.singleX,[state.singleZ]);
  const handle=new THREE.Object3D();handle.position.set(state.singleX,0,state.singleZ);
  handle.userData.handle='single';hardware.add(handle);handles.push(handle);
 } else {
  const laser=new THREE.Group(),[dx,dz]=direction(state);
  laser.position.set(SOURCE_X,0,(SOURCE_X-DOUBLE_X)*dz/dx);laser.rotation.y=-state.angle*Math.PI/180;hardware.add(laser);
  box(laser,[-.28,0,0],[.6,.22,.22],0xb6c6d8);box(laser,[.045,0,0],[.08,.15,.15],0xe16666);
 }
 board(DOUBLE_X,zs);
 box(hardware,[xs+.04,0,0],[.08,1.45,SCREEN_HALF_WIDTH*2+.08],0x344462);
 for(const face of screenFaces)face.position.set(xs+.04+face.userData.sign*.041,0,0);
 const pick=new THREE.Mesh(new THREE.CircleGeometry(.045,24),new THREE.MeshBasicMaterial({color:0xc4cec9,side:THREE.DoubleSide}));
 pick.rotation.y=Math.PI/2;pick.position.set(xs-.003,0,state.pick);
 pick.userData.handle='pick';hardware.add(pick);handles.push(pick);
 if(state.medium) {
  const medium=mediumGeometry(state),mesh=box(hardware,[medium.center[0],0,medium.center[1]],[medium.length,.85,medium.width],0x66d9ff,.23);
  mesh.rotation.y=-Math.atan2(medium.axis[1],medium.axis[0]);mesh.renderOrder=2;
 }
 const left=SOURCE_X-.55,right=xs;
 wavePlane.scale.set(right-left,SCREEN_HALF_WIDTH*2,1);wavePlane.position.set((left+right)/2,0,0);
 uniforms.uLambda.value=wavelength(state);uniforms.uScreen.value=xs;
 uniforms.uSingle.value.set(state.singleX,state.singleZ);uniforms.uLaser.value=state.source==='laser'?1:0;
 uniforms.uDirection.value.set(...direction(state));uniforms.uSlits.value.set(...zs);
 uniforms.uIncident.value.set(...zs.map(z=>incidentOpticalDistance(state,z)));
 uniforms.uAmplitude.value.set(...zs.map(z=>incidentAmplitude(state,z)));
 const medium=mediumGeometry(state);uniforms.uMedium.value=state.medium?1:0;uniforms.uN.value=state.n;
 uniforms.uBoxCenter.value.set(...medium.center);uniforms.uBoxAxis.value.set(...medium.axis);uniforms.uBoxSize.value.set(medium.length,medium.width);
 rebuildPaths();updateUI();
}
function active(id,on){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on));}
function updateUI() {
 active('sourcePoint',state.source==='point');active('sourceLaser',state.source==='laser');
 active('modeWave',state.mode==='wave');active('modePath',state.mode==='path');active('toggleMedium',state.medium);active('pause',paused);
 $('toggleMedium').textContent=state.medium?'媒質を削除':'媒質を挿入';$('pause').textContent=paused?'再生':'一時停止';
 $('angleControl').hidden=state.source!=='laser';$('singleControl').hidden=state.source!=='point';
 $('mediumStatus').textContent=state.medium?'挿入中':'未挿入';$('speed').value=String(state.speed);
}
for(const [id,key,format] of [
 ['sL','L',v=>v.toFixed(2)+'×'],['sd','d',v=>v.toFixed(2)+'×'],['sl','wavelength',v=>v.toFixed(2)+'×'],
 ['sN','n',v=>v.toFixed(2)],['sT','thickness',v=>v.toFixed(2)+'λ'],['sAngle','angle',v=>v.toFixed(1)+'°'],
 ['sSingle','singleZ',v=>v.toFixed(2)],['sPick','pick',v=>v.toFixed(2)]
]) $(id).addEventListener('input',()=>{state[key]=Number($(id).value);$(id+'out').textContent=format(state[key]);rebuild();if(key==='L')fitView();});
$('sourcePoint').onclick=()=>{state.source='point';rebuild();fitView();};
$('sourceLaser').onclick=()=>{state.source='laser';rebuild();fitView();};
$('modeWave').onclick=()=>{state.mode='wave';rebuildPaths();updateUI();};
$('modePath').onclick=()=>{state.mode='path';rebuildPaths();updateUI();};
$('toggleMedium').onclick=()=>{state.medium=!state.medium;rebuild();};
$('pause').onclick=()=>{paused=!paused;updateUI();};
$('speed').onchange=()=>{state.speed=Number($('speed').value);};
function setPan(pan) {
 controls.mouseButtons.LEFT=pan?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
 controls.touches.ONE=pan?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
 active('panMode',pan);active('orbitMode',!pan);
}
$('panMode').onclick=()=>setPan(true);$('orbitMode').onclick=()=>setPan(false);
function zoom(factor){camera.position.sub(controls.target).multiplyScalar(factor).clampLength(controls.minDistance,controls.maxDistance).add(controls.target);controls.update();}
$('zoomIn').onclick=()=>zoom(.8);$('zoomOut').onclick=()=>zoom(1.25);
let fitted=false,lastWidth=0;
function fitView(top=false) {
 controls.enableDamping=false;controls.update();
 const center=(SOURCE_X-.6+screenX(state))/2;
 const eye=new THREE.Vector3(top?0:-.22,top?1:.62,top?.0001:.85).normalize();
 const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),eye).normalize();
 const up=new THREE.Vector3().crossVectors(eye,right).normalize();
 const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),tanH=tanV*camera.aspect;
 let distance=3;
 for(const x of [SOURCE_X-.7,screenX(state)+.15])for(const y of [-.85,.85])for(const z of (x>DOUBLE_X?[-SCREEN_HALF_WIDTH-.15,SCREEN_HALF_WIDTH+.15]:[-HALF_WIDTH-.15,HALF_WIDTH+.15])) {
  const p=new THREE.Vector3(x-center,y,z);
  distance=Math.max(distance,p.dot(eye)+Math.max(Math.abs(p.dot(right))/(tanH*.86),Math.abs(p.dot(up))/(tanV*.75)));
 }
 controls.target.set(center,0,0);camera.position.copy(controls.target).add(eye.multiplyScalar(Math.min(distance,controls.maxDistance)));
 controls.update();controls.enableDamping=true;fitted=true;
}
$('viewReset').onclick=()=>fitView();$('viewTop').onclick=()=>fitView(true);
$('reset').onclick=()=>{
 Object.assign(state,defaults());paused=false;time=40;
 for(const [id,value,text] of [['sL',1,'1.00×'],['sd',1,'1.00×'],['sl',1,'1.00×'],['sN',1.5,'1.50'],['sT',2,'2.00λ'],['sAngle',0,'0.0°'],['sSingle',0,'0.00'],['sPick',0,'0.00']]){$(id).value=value;$(id+'out').textContent=text;}
 setPan(false);rebuild();fitView();
};
function resize() {
 const r=canvas.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();pathResolution.set(r.width,r.height);
 if(fitted&&lastWidth!==r.width)fitView();lastWidth=r.width;
}
new ResizeObserver(resize).observe($('viewport'));
function mouseRay(event) {
 const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
}
canvas.addEventListener('pointerdown',event=>{
 if(event.button!==0)return;
 // A second finger releases the object so OrbitControls can own the pinch gesture.
 if(drag){finishDrag();return;}
 const r=canvas.getBoundingClientRect();
 // Use a 44px interaction target even when the scene is zoomed out on a tablet.
 const hits=handles.filter(object=>object.visible).map(object=>{
  const p=object.position.clone().project(camera);
  return {object,distance:Math.hypot(event.clientX-r.left-(p.x+1)*r.width/2,event.clientY-r.top-(1-p.y)*r.height/2),visible:p.z>=-1&&p.z<=1};
 }).filter(h=>h.visible&&h.distance<=22).sort((a,b)=>a.distance-b.distance);
 const hit=hits[0];if(!hit)return;
 drag={kind:hit.object.userData.handle,id:event.pointerId};controls.enabled=false;canvas.setPointerCapture(event.pointerId);
 event.stopImmediatePropagation();
},true);
canvas.addEventListener('pointermove',event=>{
 if(!drag||drag.id!==event.pointerId)return;
 mouseRay(event);const p=new THREE.Vector3();
 if(raycaster.ray.intersectPlane(dragPlane,p)) {
  if(drag.kind==='pick'){state.pick=THREE.MathUtils.clamp(p.z,-SCREEN_HALF_WIDTH+.1,SCREEN_HALF_WIDTH-.1);$('sPick').value=state.pick;$('sPickout').textContent=state.pick.toFixed(2);}
  else {state.singleX=THREE.MathUtils.clamp(p.x,-3.4,-2.3);state.singleZ=THREE.MathUtils.clamp(p.z,-.8,.8);$('sSingle').value=state.singleZ;$('sSingleout').textContent=state.singleZ.toFixed(2);}
  rebuild();
 }
 event.stopImmediatePropagation();
},true);
function finishDrag(){if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);drag=null;controls.enabled=true;}
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,finishDrag);
window.addEventListener('blur',finishDrag);
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();$('error').hidden=false;$('error').textContent='3D表示が中断されました。ページを再読み込みしてください。';});
function frame(now) {
 if(!paused)time+=Math.min((now-last)/1000,.1)*state.speed;last=now;uniforms.uTime.value=time;
 if(state.mode==='path')for(const curve of pathCurves)updatePath(curve);
 controls.update();renderer.render(scene,camera);requestAnimationFrame(frame);
}
resize();rebuild();fitView();requestAnimationFrame(frame);
// Opt-in read-only diagnostics for model/rendering acceptance checks.
if(new URLSearchParams(location.search).has('debug'))window.youngDiagnostics=()=>({
 state:{...state},time,screenProbe:new THREE.Vector3(screenX(state)-.001,.45,0).project(camera).toArray(),camera:camera.position.toArray(),target:controls.target.toArray(),
 incident:uniforms.uIncident.value.toArray(),screenX:screenX(state),waveBounds:[wavePlane.position.x-wavePlane.scale.x/2,wavePlane.position.x+wavePlane.scale.x/2],
 wavePlaneY:wavePlane.position.y,speed:SPEED,screenWidth:SCREEN_HALF_WIDTH*2,screenAmplitude:uniforms.uAmplitude.value.toArray(),background:renderer.getClearColor(new THREE.Color()).getHexString(),hardware:hardware.children.length,handles:handles.map(h=>({kind:h.userData.handle,visible:h.visible,world:h.position.toArray(),screen:h.position.clone().project(camera).toArray()})),
 pathWaveWidth:PATH_WAVE_WIDTH,pathVertices:pathCurves.map(c=>Array.from(c.points)),
 brightness:[-1,0,1].map(z=>brightness(state,z)),renderer:renderer.info.render,controlsEnabled:controls.enabled
});
