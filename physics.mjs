// x: propagation, z: lateral, y: height. All distances share one world-unit scale.
export const SOURCE_X=-4.2, DOUBLE_X=-1, HALF_WIDTH=2.6, SPEED=0.85;
export const defaults=()=>({source:'point',mode:'wave',L:1,d:1,wavelength:1,n:1.5,thickness:2,medium:false,angle:0,singleX:-2.9,singleZ:0,pick:0});
export const wavelength=s=>0.25*s.wavelength;
export const slitPositions=s=>[-0.65*s.d,0.65*s.d];
export const screenX=s=>DOUBLE_X+4*s.L;
export const direction=s=>[Math.cos(s.angle*Math.PI/180),Math.sin(s.angle*Math.PI/180)];
export function incidentStart(s,z) {
 const [dx,dz]=direction(s);
 return s.source==='point'?[s.singleX,s.singleZ]:[SOURCE_X,z-(DOUBLE_X-SOURCE_X)*dz/dx];
}
export function mediumGeometry(s) {
 const z=slitPositions(s)[0],a=incidentStart(s,z),length=Math.hypot(DOUBLE_X-a[0],z-a[1]);
 const axis=[(DOUBLE_X-a[0])/length,(z-a[1])/length];
 return {center:[(a[0]+DOUBLE_X)/2,(a[1]+z)/2],axis,length:Math.min(wavelength(s)*s.thickness,0.65*length),width:0.16,maxThickness:0.65*length/wavelength(s)};
}
// Slab intersection accumulates optical delay only over the actual box crossing.
export function distanceInMedium(s,a,b) {
 if(!s.medium) return 0;
 const m=mediumGeometry(s),normal=[-m.axis[1],m.axis[0]],delta=[b[0]-a[0],b[1]-a[1]],len=Math.hypot(...delta);
 let near=0,far=1;
 for(const [axis,half] of [[m.axis,m.length/2],[normal,m.width/2]]) {
  const origin=(a[0]-m.center[0])*axis[0]+(a[1]-m.center[1])*axis[1],step=delta[0]*axis[0]+delta[1]*axis[1];
  if(Math.abs(step)<1e-10) {if(Math.abs(origin)>half)return 0;continue;}
  const t1=(-half-origin)/step,t2=(half-origin)/step;
  near=Math.max(near,Math.min(t1,t2));far=Math.min(far,Math.max(t1,t2));
 }
 return Math.max(0,far-near)*len;
}
export function incidentOpticalDistance(s,z) {
 const a=incidentStart(s,z),b=[DOUBLE_X,z];
 const base=s.source==='point'?Math.hypot(s.singleX-SOURCE_X,s.singleZ)+Math.hypot(b[0]-a[0],b[1]-a[1]):(DOUBLE_X-SOURCE_X)*direction(s)[0]+z*direction(s)[1]+2;
 return base+(s.n-1)*distanceInMedium(s,a,b);
}
export function phaseDifference(s,z) {
 const [u,v]=slitPositions(s),L=4*s.L;
 const diff=incidentOpticalDistance(s,v)-incidentOpticalDistance(s,u)+Math.hypot(L,z-v)-Math.hypot(L,z-u);
 return 2*Math.PI*diff/wavelength(s);
}
export const brightness=(s,z)=>(1+Math.cos(phaseDifference(s,z)))/2;
export function pathPoint(s,a,b,f,offset,time,throughMedium=false) {
 const x=a[0]+(b[0]-a[0])*f,z=a[1]+(b[1]-a[1])*f;
 const optical=offset+Math.hypot(x-a[0],z-a[1])+(throughMedium?(s.n-1)*distanceInMedium(s,a,[x,z]):0);
 return [x,0.16*Math.sin(2*Math.PI*(optical-SPEED*time)/wavelength(s)),z];
}
