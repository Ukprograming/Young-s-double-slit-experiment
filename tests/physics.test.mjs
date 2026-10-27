import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,wavelength,slitPositions,incidentStart,incidentOpticalDistance,direction,mediumGeometry,distanceInMedium,phaseDifference,brightness,interferenceFactor,spreadingAmplitude,incidentAmplitude,screenAmplitudes,displayBrightness,pathPoint,SPEED,SCREEN_HALF_WIDTH,DOUBLE_X,screenX} from '../physics.mjs';
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test('centered point source produces symmetric fringes and a central maximum',()=>{
 const s=defaults();near(phaseDifference(s,0),0);near(interferenceFactor(s,0),1);assert.ok(brightness(s,0)>0);
 for(let z=0;z<2.6;z+=.1)near(brightness(s,z),brightness(s,-z));
});
test('tilted plane wave gives d sin(angle) incident optical difference',()=>{
 for(const angle of [-30,-12,0,12,30]){
  const s={...defaults(),source:'laser',angle},[u,v]=slitPositions(s);
  near(incidentOpticalDistance(s,v)-incidentOpticalDistance(s,u),(v-u)*Math.sin(angle*Math.PI/180));
 }
});
test('reversing laser angle mirrors the interference pattern',()=>{
 const a={...defaults(),source:'laser',angle:13.4},b={...a,angle:-a.angle};
 for(let z=-2.5;z<2.5;z+=.1)near(brightness(a,z),brightness(b,-z));
});
test('single slit displacement changes the incident phase',()=>{
 const s=defaults(),shifted={...s,singleZ:.6};assert.ok(Math.abs(phaseDifference(shifted,0))>1);
});
test('optical delay equals (n-1)t for the branch crossing the cuboid',()=>{
 for(const source of ['point','laser'])for(const angle of [-30,0,30]){
  const s={...defaults(),source,angle,medium:true},[u,v]=slitPositions(s),m=mediumGeometry(s);
  near(distanceInMedium(s,incidentStart(s,u),[DOUBLE_X,u]),m.length);
  near(distanceInMedium(s,incidentStart(s,v),[DOUBLE_X,v]),0);
  near(incidentOpticalDistance(s,u)-incidentOpticalDistance({...s,medium:false},u),(s.n-1)*m.length);
 }
});
test('n=1 has no effect, and a whole-wavelength optical delay preserves fringes',()=>{
 const s=defaults();near(brightness({...s,medium:true,n:1},.7),brightness(s,.7));
 near(brightness({...s,medium:true,n:1.5,thickness:2},.7),brightness(s,.7));
 assert.ok(Math.abs(interferenceFactor({...s,medium:true,n:2,thickness:.5},0)-interferenceFactor(s,0))>.9);
});
test('incident and outgoing path wave phases are continuous at both slits',()=>{
 for(const source of ['point','laser'])for(const medium of [false,true]){
  const s={...defaults(),source,angle:20,medium};
  for(const z of slitPositions(s)){
   const a=incidentStart(s,z),b=[DOUBLE_X,z],P=[screenX(s),.4];
   const offset=source==='point'?Math.hypot(s.singleX+4.2,s.singleZ):(a[0]+4.2)*direction(s)[0]+a[1]*direction(s)[1]+2;
   near(pathPoint(s,a,b,1,offset,12,true)[1],pathPoint(s,b,P,0,incidentOpticalDistance(s,z),12)[1]);
  }
 }
});
test('wave oscillation is vertical, with no lateral displacement',()=>{
 const s=defaults(),a=[DOUBLE_X,-.65],b=[screenX(s),1];
 for(let i=0;i<=100;i++){
  const f=i/100,p=pathPoint(s,a,b,f,1,4);near(p[0],a[0]+(b[0]-a[0])*f);near(p[2],a[1]+(b[1]-a[1])*f);assert.ok(Math.abs(p[1])<=.16);
 }
});
test('medium dimensions stay inside the incoming path at parameter extremes',()=>{
 for(const source of ['point','laser'])for(const singleX of [-3.4,-2.3])for(const d of [.5,2])for(const wavelength of [.5,2]){
  const s={...defaults(),source,singleX,d,wavelength,thickness:5},m=mediumGeometry(s),z=slitPositions(s)[0],a=incidentStart(s,z);
  assert.ok(m.length<=.65*Math.hypot(DOUBLE_X-a[0],z-a[1])+1e-9);
 }
});

test('spherical intensity follows inverse square outside reference radius',()=>{
 near(spreadingAmplitude(4)**2/(spreadingAmplitude(2)**2),.25);
 assert.ok(Number.isFinite(spreadingAmplitude(0)));
});
test('laser incident plane wave has constant amplitude at both slits',()=>{
 for(const angle of [-30,0,30])for(const z of [-1.3,0,1.3])near(incidentAmplitude({...defaults(),source:'laser',angle},z),1);
});
test('screen intensity decreases with distance without automatic normalization',()=>{
 for(const source of ['point','laser']){
  const s={...defaults(),source},far={...s,L:2};
  const expected=(4**2+.65**2)/(8**2+.65**2);
  near(brightness(far,0)/brightness(s,0),expected);
  assert.ok(displayBrightness(brightness(far,0))<displayBrightness(brightness(s,0)));
 }
});
test('wider screen edges have lower illumination envelopes',()=>{
 const s=defaults();
 assert.ok(screenAmplitudes(s,5).every((a,i)=>a<screenAmplitudes(s,0)[i]));
});
test('unequal incident amplitudes retain a nonzero destructive minimum',()=>{
 const s={...defaults(),singleZ:.7};
 let lo=-5,hi=5;
 for(let i=0;i<60;i++){
  const mid=(lo+hi)/2;
  if(phaseDifference(s,mid)>-Math.PI)lo=mid;else hi=mid;
 }
 const z=(lo+hi)/2,[a,b]=screenAmplitudes(s,z);
 near(interferenceFactor(s,z),0);assert.ok((a-b)**2/4>1e-8);
 near(brightness(s,z),(a-b)**2/4);
});
test('default wave speed is half the previous value and screen width is doubled',()=>{
 near(SPEED,.85/2);near(SCREEN_HALF_WIDTH*2,5.2*2);
});
