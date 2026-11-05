// Two shared, game-scale two-deck trolleys beside the entrance stockers.
// +Z is the handle end. Keep the first home export for existing callers.
export const CART_HOMES=Object.freeze([
  Object.freeze({id:'CART01',x:1.5,z:82,yaw:Math.PI,stockerId:'STK02'}),
  Object.freeze({id:'CART02',x:-1.5,z:82,yaw:Math.PI,stockerId:'STK01'})
]);
export const CART_HOME=CART_HOMES[0];
export const CART_SIZE=Object.freeze({width:1.06,depth:1.70,lower:.27,upper:1.42,handle:1.2,tow:1.67});
export function cartPoint(c,x,y,z){const a=Math.cos(c.yaw),b=Math.sin(c.yaw);return {x:c.x+a*x+b*z,y,z:c.z-b*x+a*z};}
export function cartDriverPose(c){return {...cartPoint(c,0,0,CART_SIZE.tow),heading:c.yaw+Math.PI};}
export function cartCargoPose(c,slot){return {...cartPoint(c,0,(slot<2?CART_SIZE.lower:CART_SIZE.upper)+.24,slot%2?.44:-.44),yaw:c.yaw+Math.PI};}
export function cartSeatPose(c,level){return {...cartPoint(c,0,(level?CART_SIZE.upper:CART_SIZE.lower)-.12,-.73),heading:c.yaw+Math.PI,posture:'sit',speed:0};}
export function cartFits(c,blocked,clearance=.12){
  // Sample the full base, rather than letting a corner cut through a tool.
  for(const x of [-.48,0,.48])for(const z of [-1,-.5,0,.5,.8,1.2]){const p=cartPoint(c,x,0,z);if(blocked(p.x,p.z,clearance))return false;}
  return true;
}
export function pushCart(c,from,to,blocked){
  const distance=Math.hypot(to.x-from.x,to.z-from.z);
  if(!Number.isFinite(distance)||distance>4)return null;
  if(distance<.0001)return {...c};
  const next={...c},steps=Math.max(1,Math.ceil(distance/.06));
  const wanted=Math.atan2(from.x-to.x,from.z-to.z),maxTurn=distance/steps*.65;
  for(let i=1;i<=steps;i++){
    const x=from.x+(to.x-from.x)*i/steps,z=from.z+(to.z-from.z)*i/steps;
    let delta=Math.atan2(Math.sin(wanted-next.yaw),Math.cos(wanted-next.yaw));
    // A rearward input backs up the cart without spinning it around. Sideways
    // input steers gradually about the person's hands, at the back of the cart.
    if(delta>Math.PI/2)delta-=Math.PI;else if(delta<-Math.PI/2)delta+=Math.PI;
    next.yaw+=Math.max(-maxTurn,Math.min(maxTurn,delta));
    next.x=x-Math.sin(next.yaw)*CART_SIZE.tow;next.z=z-Math.cos(next.yaw)*CART_SIZE.tow;
    if(blocked(x,z,.295)||!cartFits(next,blocked))return null;
  }
  return next;
}
// Keep the old module export for a page that was opened before this update.
export const pullCart=pushCart;
