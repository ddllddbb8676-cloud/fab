import {CART_HOMES,CART_SIZE,cartPoint,cartFits} from '../src/cart-layout.js';
import {isBlocked} from '../src/layout.js';
import {findWalkPath} from '../src/walking.js';
import {stepNpc} from '../src/npc-navigation.js';
import {floorSpot} from '../src/foup-play.js';
import {stockerById,STOCKER_CAPACITY} from '../src/stocker-layout.js';

export const CART_RETURN_RULES=Object.freeze({idleSeconds:120,away:15,nearby:5,scanSeconds:2});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const turn=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

// One existing resident at a time. Jobs are transient; cart/cargo identities are
// saved by the normal FOUP checkpoint. No rewards or account writes occur here.
export function createCartReturner({store,carts,residents,players,now,canRun=()=>true,onCue=()=>{},rules=CART_RETURN_RULES}){
  let job=null,nextScan=now();
  const nearPeople=c=>[...players.values()].some(p=>!p.hidden&&(p.y||0)<.5&&distance(p,c)<rules.nearby);
  function route(actor,target,phase){
    const path=findWalkPath(actor,target);if(!path)return false;
    actor.path=path;actor.phase=phase;actor.time=0;actor.speed=0;return true;
  }
  function cartRoute(c,target){
    const cache=new Map();
    function clear(a,b){
      const key=`${a.x},${a.z}:${b.x},${b.z}`;if(cache.has(key))return cache.get(key);
      const length=distance(a,b),yaw=length>.001?Math.atan2(b.x-a.x,b.z-a.z):c.yaw;
      const count=Math.max(1,Math.ceil(length/.45));let ok=true;
      for(let n=0;n<=count;n++){
        const p={x:a.x+(b.x-a.x)*n/count,z:a.z+(b.z-a.z)*n/count,yaw},handle=cartPoint(p,0,0,CART_SIZE.tow);
        if(!cartFits(p,isBlocked)||isBlocked(handle.x,handle.z,.295)){ok=false;break;}
      }
      cache.set(key,ok);return ok;
    }
    return findWalkPath(c,target,{canTraverse:clear});
  }
  function heldPose(actor){
    const held=store.getCarried(actor.id);if(!held)return;
    const lift=actor.phase==='cart-unload'?Math.min(1,actor.time/.8):0;
    Object.assign(held,{x:actor.x+Math.sin(actor.heading)*(.34+.16*lift),y:.82+.70*lift,z:actor.z+Math.cos(actor.heading)*(.34+.16*lift),yaw:actor.heading+Math.PI});
  }
  function finish(){
    if(!job)return;
    const {actor,c,slot}=job;
    carts.leave(actor);
    const held=store.getCarried(actor.id);
    if(held&&!store.loadCart(c.id,slot,actor.id,held.id)){
      const point=floorSpot(actor,.24)??{x:c.x,z:c.z};
      store.launch(held,{...point,y:.82,yaw:actor.heading},{x:0,y:0,z:0},{shatter:false});
    }
    delete c.returning;carts.touch(c);residents.releaseCart(actor);store.notifyChange();job=null;
  }
  function begin(){
    if(!canRun())return;
    for(const home of CART_HOMES){
      const c=store.carts.get(home.id);
      if(!c||c.driver||c.riders.some(Boolean)||distance(c,home)<=rules.away||now()-carts.lastUsed(c.id)<rules.idleSeconds||nearPeople(c)||store.cartItems(c.id).some(r=>r.gold))continue;
      // A nearby idle/patrolling worker can help without interrupting repairs,
      // OHT passengers, safety duties, or the seated people at the entrance.
      const actor=residents.people.filter(p=>!['resting','rider'].includes(p.role)&&!p.cartTask&&!p.penalty&&!p.caughtLeft&&p.vehicleId==null&&!store.getCarried(p.id)&&['idle','patrol'].includes(p.phase))
        .sort((a,b)=>distance(a,c)-distance(b,c))[0];
      if(!actor)return;
      const handle=cartPoint(c,0,0,CART_SIZE.tow),path=findWalkPath(actor,handle);
      if(!path){carts.touch(c);continue;}
      if(!residents.reserveCart(actor))continue;
      job={c,home,actor,phase:'approach',started:now(),stuck:0,slot:0,path:null,wait:0};
      c.returning=actor.id;actor.path=path;actor.phase='cart-return-walk';actor.time=0;return;
    }
  }
  function walk(dt){
    const {actor}=job,target=actor.path[0];if(!target){actor.speed=0;return true;}
    const next=stepNpc(actor,target,dt,1.5,[...residents.people,...players.values()]);
    const moved=distance(actor,next);if(moved>.0001)actor.heading=Math.atan2(next.x-actor.x,next.z-actor.z);
    Object.assign(actor,next);actor.speed=moved/dt;job.stuck=moved>.001?0:job.stuck+dt;
    if(distance(actor,target)<.02)actor.path.shift();
    heldPose(actor);return !actor.path.length;
  }
  function nextCargo(){
    const {actor,c,home}=job,r=store.cartItems(c.id).sort((a,b)=>a.cartSlot-b.cartSlot)[0];
    if(!r||r.gold){finish();return;}
    const s=stockerById.get(home.stockerId),state=store.stockerState(s.id);
    if(state.items.length>=STOCKER_CAPACITY){finish();return;}
    job.slot=r.cartSlot;job.recordId=r.id;job.stocker=s;job.wait=0;
    // Visit a side of the shelf so the pickup is visible before walking to IN.
    const pickup=floorSpot(cartPoint(c,home.x>0?1.05:-1.05,0,r.cartSlot%2?.44:-.44));
    if(!pickup||!route(actor,pickup,'cart-fetch-walk')){finish();return;}
    job.phase='fetch';
  }
  function update(dt){
    if(!job){if(now()>=nextScan){nextScan=now()+rules.scanSeconds;begin();}return;}
    const {actor,c,home}=job;actor.time+=dt;
    if(!canRun()||now()-job.started>300||job.stuck>8||c.riders.some(Boolean)){finish();return;}
    if(job.phase==='approach'){
      // Leave an abandoned cart alone again if somebody comes back to it.
      if(nearPeople(c)||c.driver){finish();return;}
      if(walk(dt)){
        const path=cartRoute(c,home);if(!path){finish();return;}
        actor.phase='idle';
        if(!carts.command(actor,'cart-pull',{id:c.id}).ok){finish();return;}
        job.path=path;actor.path=[];job.phase='return';job.stuck=0;
      }
    }else if(job.phase==='return'){
      const target=job.path[0];
      if(!target){carts.leave(actor);nextCargo();return;}
      const d=distance(c,target),desired=d>.01?Math.atan2(target.x-c.x,target.z-c.z):c.yaw;
      const angle=turn(c.yaw,desired),yaw=c.yaw+Math.max(-dt*1.35,Math.min(dt*1.35,angle));
      const travel=Math.abs(angle)<.15?Math.min(d,dt*1.2):0;
      const next={x:c.x+Math.sin(desired)*travel,z:c.z+Math.cos(desired)*travel,yaw};
      const handle=cartPoint(next,0,0,CART_SIZE.tow);
      const blocked=[...players.values()].some(p=>!p.hidden&&(p.y||0)<.5&&(distance(p,next)<.85||distance(p,handle)<.65));
      if(!blocked&&carts.moveNpc(c,actor,next,dt))job.stuck=0;else{job.stuck+=dt;actor.speed=0;}
      if(distance(c,target)<.02)job.path.shift();
    }else if(job.phase==='fetch'){
      if(walk(dt)){
        actor.phase='idle';
        if(!carts.command(actor,'cart-take',{id:c.id,slot:job.slot,recordId:job.recordId}).ok){finish();return;}
        onCue('pickup',actor);actor.time=0;job.phase='lift';actor.phase='cart-lift';
      }
    }else if(job.phase==='lift'){
      heldPose(actor);actor.speed=0;
      if(actor.time>=.6){
        const port=job.stocker.ports[0];
        const target={x:port.x+(port.approach.x-port.x)*.6,z:port.z+(port.approach.z-port.z)*.6};
        if(!route(actor,target,'cart-in-walk')){finish();return;}
        job.phase='deposit-walk';
      }
    }else if(job.phase==='deposit-walk'){
      if(walk(dt)){const port=job.stocker.ports[0];actor.heading=Math.atan2(port.x-actor.x,port.z-actor.z);actor.phase='cart-unload';actor.time=0;actor.speed=0;job.phase='deposit';}
    }else if(job.phase==='deposit'){
      actor.speed=0;heldPose(actor);
      if(actor.time>=1){
        const state=store.stockerState(job.stocker.id);
        if(state.busy){job.wait+=dt;if(job.wait>10)finish();return;}
        if(!store.stockerPut(job.stocker.id,actor.id,job.recordId).ok){finish();return;}
        onCue('place',actor);actor.phase='cart-stow';actor.time=0;job.phase='stow';
      }
    }else if(job.phase==='stow'){
      actor.speed=0;if(actor.time>=3.1)nextCargo();
    }
  }
  return {update,get state(){return job?{cartId:job.c.id,actorId:job.actor.id,phase:job.phase}:null;}};
}
