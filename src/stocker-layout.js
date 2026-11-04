// Game-scale carrier stockers: narrow front, long body, nearly ceiling height.
// Dimensions are our 5 m hall fit, not an industry-wide specification.
export const STOCKER_SIZE=Object.freeze({width:2.6,depth:6.2,height:4.88});
export const STOCKER_CAPACITY=48, STOCKER_TRANSFER_SECONDS=3, STOCKER_OUT_CUE_AT=1.8;
export function stockerPoint(s,x,y,z){const c=Math.cos(s.yaw),n=Math.sin(s.yaw);return {x:s.x+c*x+n*z,y,z:s.z-n*x+c*z};}
function bounds(s,x,z,w,d){const a=stockerPoint(s,x-w/2,0,z-d/2),b=stockerPoint(s,x+w/2,0,z+d/2);return {minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z)};}
export const stockers=Object.freeze([
  [-7.7,83.5,Math.PI/2],[7.7,83.5,-Math.PI/2],
  [-57.8,0,0],[57.8,0,0],[-7.7,-84,Math.PI/2],[7.7,-84,-Math.PI/2]
].map(([x,z,yaw],index)=>{
  const s={id:`STK${String(index+1).padStart(2,'0')}`,index,x,z,yaw};
  s.bounds={...bounds(s,0,0,2.6,6.2),minY:0,maxY:STOCKER_SIZE.height};
  s.ports=['IN','OUT'].map((kind,i)=>({id:`${s.id}:${kind}`,stockerId:s.id,kind,index:i,
    ...stockerPoint(s,(i-.5)*1.24,1.4625,3.45),yaw:s.yaw+Math.PI,
    bounds:{...bounds(s,(i-.5)*1.24,3.45,.74,.7),minY:0,maxY:1.47},
    approach:stockerPoint(s,(i-.5)*1.24,0,4.7)}));
  return Object.freeze(s);
}));
export const stockerById=new Map(stockers.map(s=>[s.id,s]));
export const stockerPorts=stockers.flatMap(s=>s.ports);
export const stockerBounds=stockers.flatMap(s=>[s.bounds,...s.ports.map(p=>p.bounds)]);
export const STOCKER_WALK_OUTER_X=55.65;
export function stockerSlot(s,index){
  return {...stockerPoint(s,index%2? .82:-.82,.72+Math.floor(index/8)*.65,-2.4+Math.floor(index/2)%4*1.15),yaw:s.yaw+(index%2?-Math.PI/2:Math.PI/2)};
}
export function stockerRecordPose(record){
  const s=stockerById.get(record.stockerId);if(!s)return null;
  const slot=stockerSlot(s,record.stockSlot||0),out=record.mode==='retrieving'||record.mode==='stocker-out',port=s.ports[out?1:0];
  const seated={x:port.x,y:port.y+.2225,z:port.z,yaw:port.yaw};
  if(record.mode==='stored')return slot;
  if(record.mode==='stocker-out')return seated;
  const age=Math.min(STOCKER_TRANSFER_SECONDS,Math.max(0,record.stockAge||0));
  const t=out?age/STOCKER_TRANSFER_SECONDS:1-age/STOCKER_TRANSFER_SECONDS;
  const inside={...stockerPoint(s,(port.index-.5)*1.24,seated.y,2.65),yaw:port.yaw};
  const a=t<.6?slot:inside,b=t<.6?inside:seated,f=t<.6?t/.6:(t-.6)/.4;
  return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,z:a.z+(b.z-a.z)*f,yaw:port.yaw};
}
