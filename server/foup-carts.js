import {isBlocked} from '../src/layout.js';
import {floorSpot} from '../src/foup-play.js';
import {cartPoint,cartDriverPose,cartSeatPose,cartFits,pushCart} from '../src/cart-layout.js';

const fail=message=>({ok:false,message});
export function createFoupCarts({store,players,now=()=>0}){
  let dirty=false,lastSaved=0;
  const lastUse=new Map([...store.carts.keys()].map(id=>[id,now()]));
  const touch=(c,p)=>{if(!p||!p.id.startsWith('resident:'))lastUse.set(c.id,now());};
  const membership=id=>[...store.carts.values()].find(c=>c.driver===id||c.riders.includes(id));
  function nearby(p,c){
    if(Math.hypot(p.x-c.x,p.z-c.z)>2.2)return false;
    for(let i=1;i<=8;i++)if(isBlocked(p.x+(c.x-p.x)*i/8,p.z+(c.z-p.z)*i/8,.1))return false;
    return true;
  }
  function placeRiders(c){c.riders.forEach((id,level)=>{const p=players.get(id);if(p)Object.assign(p,cartSeatPose(c,level),{phase:'cart-riding'});});}
  function save(){dirty=false;lastSaved=now();store.notifyChange();}
  function leave(p){
    const c=membership(p.id);if(!c)return null;
    touch(c,p);
    if(c.driver===p.id)c.driver=null;
    const level=c.riders.indexOf(p.id);
    if(level>=0){
      c.riders[level]=null;
      const spot=floorSpot(cartPoint(c,level?1.05:-1.05,0,-.15))??floorSpot(cartPoint(c,0,0,-1.2))??{x:c.x,z:c.z};
      Object.assign(p,spot,{y:0,posture:'stand',speed:0});
    }
    p.phase='idle';p.cartId=null;p.cartLevel=null;save();
    return {x:p.x,y:p.y,z:p.z,heading:p.heading};
  }
  function pose(p,data){
    const c=membership(p.id);if(!c)return data;
    if(data.hidden){leave(p);return {...data,x:p.x,y:0,z:p.z};}
    if(c.driver!==p.id)return {...data,...cartSeatPose(c,c.riders.indexOf(p.id))};
    if(data.y>.15||Math.hypot(data.x-p.x,data.z-p.z)>4){leave(p);return data;}
    const next=pushCart(c,p,data,isBlocked);
    if(!next)return {...data,x:p.x,y:0,z:p.z,heading:c.yaw+Math.PI,speed:0,posture:'stand'};
    if(Math.hypot(next.x-c.x,next.z-c.z)>.0001||Math.abs(next.yaw-c.yaw)>.0001){Object.assign(c,{x:next.x,z:next.z,yaw:next.yaw});store.moveCart(c);placeRiders(c);dirty=true;touch(c,p);}
    return {...data,y:0,heading:next.yaw+Math.PI,posture:'stand'};
  }
  function command(p,kind,data){
    if(kind==='cart-leave'){const position=leave(p);return position?{ok:true,cartExit:position}:{ok:true};}
    const c=store.carts.get(data.id);
    if(!c||p.hidden||p.y>.15||p.posture!=='stand'||p.vehicleId!=null||!['idle','approach'].includes(p.phase)||membership(p.id)||!nearby(p,c))return fail('카트 옆으로 가까이 와주세요');
    if(c.returning&&c.returning!==p.id)return fail('NPC가 카트를 정리하고 있어요. 잠시만 기다려주세요');
    if(c.driver)return fail('이동 중이에요. 손잡이를 놓은 뒤 이용해 주세요');
    if(kind==='cart-pull'){
      if(store.getCarried(p.id))return fail('FOUP을 카트에 싣거나 내려놓아 주세요');
      const handle=cartDriverPose(c);
      if(isBlocked(handle.x,handle.z,.295))return fail('손잡이 앞이 좁아요. 반대편에서 카트를 이용해 주세요');
      // Mounting only moves the player the short distance to the handle.
      // Retain the wire command/phase names so already-open clients can leave.
      Object.assign(p,handle,{posture:'stand',speed:0,phase:'cart-pulling',cartId:c.id,cartLevel:null});
      c.driver=p.id;touch(c,p);save();return {ok:true,cartHandle:handle};
    }
    if(kind==='cart-board'){
      const level=data.level;
      if(!Number.isInteger(level)||level<0||level>1)return fail('아래칸 또는 위칸을 골라주세요');
      if(c.riders[level])return fail('이미 다른 사람이 타고 있어요');
      if(store.getCarried(p.id))return fail('들고 있는 FOUP을 먼저 싣거나 내려놓아 주세요');
      const cargo=store.cartItems(c.id).filter(r=>Math.floor(r.cartSlot/2)===level);
      const drops=cargo.map(r=>floorSpot(cartPoint(c,r.cartSlot%2?1.0:-1.0,0,-.25),.24));
      if(drops.some(p=>!p))return fail('주변에 FOUP을 내려놓을 공간이 없어요');
      c.riders[level]=p.id;p.cartId=c.id;p.cartLevel=level;
      cargo.forEach((r,i)=>store.launch(r,{...drops[i],y:r.y,yaw:r.yaw},{x:0,y:0,z:0},{shatter:false}));
      placeRiders(c);touch(c,p);save();return {ok:true};
    }
    if(kind==='cart-load'||kind==='cart-take'){
      const slot=data.slot;
      if(!Number.isInteger(slot)||slot<0||slot>3||c.riders[Math.floor(slot/2)])return fail('빈 FOUP 칸을 골라주세요');
      const ok=kind==='cart-load'?store.loadCart(c.id,slot,p.id,data.recordId):store.takeCart(c.id,slot,p.id,data.recordId);
      if(!ok)return fail('FOUP 상태가 바뀌었어요. 다시 눌러주세요');
      p.carrying=Boolean(store.getCarried(p.id));touch(c,p);return {ok:true};
    }
    return fail('카트를 다시 눌러주세요');
  }
  function step(){for(const c of store.carts.values())placeRiders(c);if(dirty&&now()-lastSaved>=5)save();}
  function moveNpc(c,p,next,dt){
    if(c.driver!==p.id||!p.cartTask||dt<=0||Math.hypot(next.x-c.x,next.z-c.z)>dt*1.36)return false;
    const handle=cartDriverPose(next);
    if(!cartFits(next,isBlocked)||isBlocked(handle.x,handle.z,.295))return false;
    const speed=Math.hypot(p.x-handle.x,p.z-handle.z)/dt;
    Object.assign(c,{x:next.x,z:next.z,yaw:next.yaw});Object.assign(p,handle,{speed,phase:'cart-pulling'});
    store.moveCart(c);dirty=true;return true;
  }
  function snapshot(){return [...store.carts.values()].map(c=>({id:c.id,x:+c.x.toFixed(3),z:+c.z.toFixed(3),yaw:+c.yaw.toFixed(3),driver:c.driver,riders:[...c.riders],returning:Boolean(c.returning)}));}
  return {command,pose,leave,membership,step,snapshot,moveNpc,lastUsed:id=>lastUse.get(id)??now(),touch};
}
