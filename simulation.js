import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { SOURCE_X,DOUBLE_X,HALF_WIDTH,SPEED,defaults,wavelength,slitPositions,screenX,direction,incidentStart,mediumGeometry,incidentOpticalDistance,brightness,pathPoint } from './physics.mjs';

const $=id=>document.getElementById(id);
const canvas=$('c'), state=defaults();
let renderer;
try { renderer=new THREE.WebGLRenderer({canvas,antialias:true}); }
catch(error) { $('error').hidden=false; $('error').textContent='3D表示を開始できませんでした。WebGLが有効なブラウザーで開いてください。'; throw error; }
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.setClearColor(0x0b1020);
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
let handles=[],pathCurves=[],paused=false,time=18,last=performance.now(),drag=null;

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
 uDirection:{value:new THREE.Vector2(1,0)},uSlits:{value:new THREE.Vector2()},uIncident:{value:new THREE.Vector2()},
 uMedium:{value:0},uN:{value:1.5},uBoxCenter:{value:new THREE.Vector2()},uBoxAxis:{value:new THREE.Vector2()},uBoxSize:{value:new THREE.Vector2()}
};
const vertex=`varying vec3 world; void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`;
const shared=`
 varying vec3 world;
 uniform float uTime,uLambda,uScreen,uLaser,uMedium,uN;
 uniform vec2 uSingle,uDirection,uSlits,uIncident,uBoxCenter,uBoxAxis,uBoxSize;
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
  if(p.x>=uScreen||abs(p.y)>2.6)discard;
  vec3 color=vec3(1.,.78,.32);float alpha=0.;
  if(p.x< -1.045){
   if(uLaser<.5&&p.x<uSingle.x-.04)alpha=crest(distance(p,vec2(-4.2,0.)));
   else if(uLaser>.5||p.x>uSingle.x+.04)alpha=crest(incident(p));
  }else if(p.x>-.955){
   float upper=crest(uIncident.x+distance(p,vec2(-1.,uSlits.x)));
   float lower=crest(uIncident.y+distance(p,vec2(-1.,uSlits.y)));
   color=mix(vec3(.35,.95,.72),vec3(.38,.7,1.),lower/(upper+lower+.001));
   alpha=min(1.,upper+lower);
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
  float intensity=.5*(1.+cos(6.28318530718*(b-a)/uLambda));
  vec3 col=mix(vec3(.018,.035,.065),vec3(.87,.96,1.),intensity);
  gl_FragColor=vec4(col,1.);
 }`});
const screenFaces=[];
for(const sign of [-1,1]) {
 const face=new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH*2,1.4),screenMaterial);
 face.rotation.y=Math.PI/2;face.userData.sign=sign;screenFaces.push(face);scene.add(face);
}
function line(a,b,color,opacity=1) {
 const mesh=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0],0,a[1]),new THREE.Vector3(b[0],0,b[1])]),new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));paths.add(mesh);
}
function addPath(a,b,offset,color,throughMedium=false) {
 line(a,b,0x8397bd,.45);
 const points=new Float32Array(241*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(points,3));
 const mesh=new THREE.Line(geometry,new THREE.LineBasicMaterial({color}));paths.add(mesh);
 pathCurves.push({a,b,offset,throughMedium,mesh});
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
 box(hardware,[xs+.04,0,0],[.08,1.45,HALF_WIDTH*2+.08],0x344462);
 for(const face of screenFaces)face.position.set(xs+.04+face.userData.sign*.041,0,0);
 const pick=sphere(hardware,xs-.095,0,state.pick,.105,0xffffff);pick.userData.handle='pick';handles.push(pick);
 // A small rim makes the draggable observation point visible over bright fringes.
 const rim=new THREE.Mesh(new THREE.TorusGeometry(.14,.018,8,32),new THREE.MeshBasicMaterial({color:0x669bff}));rim.rotation.y=Math.PI/2;rim.position.copy(pick.position);hardware.add(rim);
 if(state.medium) {
  const medium=mediumGeometry(state),mesh=box(hardware,[medium.center[0],0,medium.center[1]],[medium.length,.85,medium.width],0x66d9ff,.23);
  mesh.rotation.y=-Math.atan2(medium.axis[1],medium.axis[0]);mesh.renderOrder=2;
 }
 const left=SOURCE_X-.55,right=xs;
 wavePlane.scale.set(right-left,HALF_WIDTH*2,1);wavePlane.position.set((left+right)/2,0,0);
 uniforms.uLambda.value=wavelength(state);uniforms.uScreen.value=xs;
 uniforms.uSingle.value.set(state.singleX,state.singleZ);uniforms.uLaser.value=state.source==='laser'?1:0;
 uniforms.uDirection.value.set(...direction(state));uniforms.uSlits.value.set(...zs);
 uniforms.uIncident.value.set(...zs.map(z=>incidentOpticalDistance(state,z)));
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
 for(const x of [SOURCE_X-.7,screenX(state)+.15])for(const y of [-.85,.85])for(const z of [-2.75,2.75]) {
  const p=new THREE.Vector3(x-center,y,z);
  distance=Math.max(distance,p.dot(eye)+Math.max(Math.abs(p.dot(right))/(tanH*.86),Math.abs(p.dot(up))/(tanV*.75)));
 }
 controls.target.set(center,0,0);camera.position.copy(controls.target).add(eye.multiplyScalar(Math.min(distance,controls.maxDistance)));
 controls.update();controls.enableDamping=true;fitted=true;
}
$('viewReset').onclick=()=>fitView();$('viewTop').onclick=()=>fitView(true);
$('reset').onclick=()=>{
 Object.assign(state,defaults());paused=false;time=18;
 for(const [id,value,text] of [['sL',1,'1.00×'],['sd',1,'1.00×'],['sl',1,'1.00×'],['sN',1.5,'1.50'],['sT',2,'2.00λ'],['sAngle',0,'0.0°'],['sSingle',0,'0.00'],['sPick',0,'0.00']]){$(id).value=value;$(id+'out').textContent=text;}
 setPan(false);rebuild();fitView();
};
function resize() {
 const r=canvas.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();
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
 const hits=handles.map(object=>{
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
  if(drag.kind==='pick'){state.pick=THREE.MathUtils.clamp(p.z,-2.5,2.5);$('sPick').value=state.pick;$('sPickout').textContent=state.pick.toFixed(2);}
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
 if(!paused)time+=Math.min((now-last)/1000,.1);last=now;uniforms.uTime.value=time;
 if(state.mode==='path')for(const curve of pathCurves) {
  const p=curve.mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i++)p.setXYZ(i,...pathPoint(state,curve.a,curve.b,i/(p.count-1),curve.offset,time,curve.throughMedium));
  p.needsUpdate=true;curve.mesh.geometry.computeBoundingSphere();
 }
 controls.update();renderer.render(scene,camera);requestAnimationFrame(frame);
}
resize();rebuild();fitView();requestAnimationFrame(frame);
// Opt-in read-only diagnostics for model/rendering acceptance checks.
if(new URLSearchParams(location.search).has('debug'))window.youngDiagnostics=()=>({
 state:{...state},time,camera:camera.position.toArray(),target:controls.target.toArray(),
 incident:uniforms.uIncident.value.toArray(),screenX:screenX(state),waveBounds:[wavePlane.position.x-wavePlane.scale.x/2,wavePlane.position.x+wavePlane.scale.x/2],
 wavePlaneY:wavePlane.position.y,hardware:hardware.children.length,handles:handles.map(h=>({kind:h.userData.handle,world:h.position.toArray(),screen:h.position.clone().project(camera).toArray()})),
 pathVertices:pathCurves.map(c=>Array.from(c.mesh.geometry.attributes.position.array)),
 brightness:[-1,0,1].map(z=>brightness(state,z)),renderer:renderer.info.render,controlsEnabled:controls.enabled
});
