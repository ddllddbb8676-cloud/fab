import {bays} from './layout.js?v=de3c32eddc76';
// The short central aisle just outside the air-shower doors, in metres.
export const REST_AREA=Object.freeze({minX:-2.2,maxX:2.2,minZ:73.5,maxZ:81.5});
export const REST_AREAS=Object.freeze([
  Object.freeze({...REST_AREA,id:'entry',central:true}),
  ...bays.map(bay=>{const x=bay.x+(bay.id%3-1)*8;return Object.freeze({id:`bay-${bay.id}`,minX:x-1.2,maxX:x+1.2,minZ:bay.z-.9,maxZ:bay.z+.9});}),
  Object.freeze({id:'far-end',central:true,minX:-2.2,maxX:2.2,minZ:-81.5,maxZ:-76.5})
]);
export const SAFETY_CLEARANCE=.32;
export const REST_AREA_MESSAGE='초록 휴식 구역은 안전팀이 들어갈 수 없어요';
export const restAreaAt=(point,margin=0)=>REST_AREAS.find(area=>point.x>=area.minX-margin&&point.x<=area.maxX+margin&&point.z>=area.minZ-margin&&point.z<=area.maxZ+margin);
export const isRestArea=(point,margin=0)=>Boolean(restAreaAt(point,margin));
function avoidsArea(a,b,area) {
  let near=0,far=1;
  for(const [axis,min,max] of [['x',area.minX-SAFETY_CLEARANCE,area.maxX+SAFETY_CLEARANCE],['z',area.minZ-SAFETY_CLEARANCE,area.maxZ+SAFETY_CLEARANCE]]) {
    const delta=b[axis]-a[axis];
    if(!delta){if(a[axis]<min||a[axis]>max)return true;continue;}
    const first=(min-a[axis])/delta,last=(max-a[axis])/delta;
    near=Math.max(near,Math.min(first,last));far=Math.min(far,Math.max(first,last));
    if(near>far)return true;
  }
  return false;
}
export const canSafetyTraverse=(a,b)=>REST_AREAS.every(area=>avoidsArea(a,b,area));
export function restAreaExit(point) {
  const area=restAreaAt(point,SAFETY_CLEARANCE);if(!area)return {...point};
  const x=(area.minX+area.maxX)/2,z=(area.minZ+area.maxZ)/2;
  return area.central?{x,y:0,z:area.minZ-.65,heading:Math.PI}:{x:point.x<=x?area.minX-.65:area.maxX+.65,y:0,z,heading:point.x<=x?-Math.PI/2:Math.PI/2};
}
