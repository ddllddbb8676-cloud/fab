// Two shared, game-scale two-deck trolleys beside the entrance stockers.
// +Z is the handle end. Keep the first home export for existing callers.
export const CART_HOMES=Object.freeze([
  Object.freeze({id:'CART01',x:1.5,z:82,yaw:Math.PI,stockerId:'STK02'}),
  Object.freeze({id:'CART02',x:-1.5,z:82,yaw:Math.PI,stockerId:'STK01'})
]);
export const CART_HOME=CART_HOMES[0];
export const CART_SIZE=Object.freeze({width:1.06,depth:1.70,lower:.27,upper:1.42,handle:1.2,tow:1.67});
export function cartPoint(c,x,y,z){const a=Math.cos(c.yaw),b=Math.sin(c.yaw);return {x:c.x+a*x+b*z,y,z:c.z-b*x+a*z};}
export function cartCargoPose(c,slot){return {...cartPoint(c,0,(slot<2?CART_SIZE.lower:CART_SIZE.upper)+.24,slot%2?.44:-.44),yaw:c.yaw+Math.PI};}
export function cartSeatPose(c,level){return {...cartPoint(c,0,(level?CART_SIZE.upper:CART_SIZE.lower)-.12,-.73),heading:c.yaw+Math.PI,posture:'sit',speed:0};}
export function cartFits(c,blocked,clearance=.12){
  // Sample the full base, rather than letting a corner cut through a tool.
  for(const x of [-.48,0,.48])for(const z of [-1,-.5,0,.5,.8,1.2]){const p=cartPoint(c,x,0,z);if(blocked(p.x,p.z,clearance))return false;}
  return true;
}
export function pullCart(c,from,to,blocked){
  const distance=Math.hypot(to.x-from.x,to.z-from.z);
  if(!Number.isFinite(distance)||distance>4)return null;
  const next={...c},steps=Math.max(1,Math.ceil(distance/.10));
  for(let i=1;i<=steps;i++){
    const x=from.x+(to.x-from.x)*i/steps,z=from.z+(to.z-from.z)*i/steps;
    const dx=x-next.x,dz=z-next.z,length=Math.hypot(dx,dz);
    if(length>CART_SIZE.tow){
      const angle=Math.atan2(dx,dz),delta=Math.atan2(Math.sin(angle-next.yaw),Math.cos(angle-next.yaw));
      // Keep turns gradual, including a player changing direction beside a wall.
      next.yaw+=Math.max(-.12,Math.min(.12,delta));
      next.x=x-dx/length*CART_SIZE.tow;next.z=z-dz/length*CART_SIZE.tow;
      if(!cartFits(next,blocked))return null;
    }
  }
  return next;
}
