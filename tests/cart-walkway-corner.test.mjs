import test from 'node:test';
import assert from 'node:assert/strict';
import {CART_SIZE,cartPoint,cartFits,pullCart,cartSeatPose} from '../src/cart-layout.js';
import {isBlocked} from '../src/layout.js';
import {applyWalkwayMotion} from '../src/moving-walkway.js';
import {stepWalker} from '../src/walking.js';
import {createRoom} from '../server/room-engine.js';

// Geometry only, read from the reported production cart. No player identity.
const stuck={id:'CART01',x:1.748,z:67.289,yaw:31.143};
const otherLane={...stuck,x:-stuck.x,z:-stuck.z,yaw:stuck.yaw+Math.PI};
function walk(position,dx,dz,dt){
  const state={position:stepWalker(position,dx*3.2*dt,dz*3.2*dt),mode:'walk',posture:'stand',path:[]};
  applyWalkwayMotion(state,position,dt);return state.position;
}

test('an angled cart beside a cabinet can roll with either belt and steer into the aisle',()=>{
  for(const start of [stuck,otherLane])for(const hz of [20,30,60,120])for(const steer of [false,true]){
    let cart={...start},position=cartPoint(cart,0,0,CART_SIZE.tow);
    const side=Math.sign(start.x);assert.ok(cartFits(cart,isBlocked));
    for(let frame=0;frame<hz/2;frame++){
      const to=walk(position,steer?-side:0,0,1/hz);assert.equal(isBlocked(to.x,to.z,.295),false);
      const next=pullCart(cart,position,to,isBlocked);assert.ok(next,`${hz}Hz ${steer?'steering':'belt'} move is not frozen`);
      assert.ok(cartFits(next,isBlocked));assert.ok(Math.hypot(next.x-cart.x,next.z-cart.z)<.4,'small continuous wheel movement');
      assert.ok(Math.abs(Math.hypot(to.x-next.x,to.z-next.z)-CART_SIZE.tow)<.02,'held handle stays attached');
      cart=next;position=to;
    }
    assert.ok(Math.hypot(cart.x-start.x,cart.z-start.z)>1);
    if(steer)assert.ok((position.x-cartPoint(start,0,0,CART_SIZE.tow).x)*side< -1.5,'driver can step toward the centre');
  }
});

test('wall-facing input remains blocked, but the next inward step immediately works',()=>{
  const start={...stuck},from=cartPoint(start,0,0,CART_SIZE.tow);
  assert.equal(pullCart(start,from,walk(from,1,0,1/60),isBlocked),null);
  const next=pullCart(start,from,walk(from,-1,0,1/60),isBlocked);assert.ok(next);assert.ok(cartFits(next,isBlocked));
  assert.equal(pullCart(start,from,{x:from.x-12,z:from.z},isBlocked),null,'collision recovery does not permit teleporting');
  assert.deepEqual(start,stuck,'a rejected probe never mutates the parked cart');
});

test('standing on either belt moves the same angled trolley for twenty metres without another jackknife',()=>{
  for(const start of [stuck,otherLane]){
    let cart={...start},position=cartPoint(cart,0,0,CART_SIZE.tow);
    for(let i=0;i<200;i++){
      const to=walk(position,0,0,1/60),next=pullCart(cart,position,to,isBlocked);assert.ok(next,'cart does not jam again at the next cabinet');
      assert.ok(cartFits(next,isBlocked));cart=next;position=to;
    }
    assert.ok(Math.abs(cart.z-start.z)>20);assert.ok(Math.abs(cart.x-start.x)<.001);assert.ok(Math.abs(cart.yaw-start.yaw)<.001,'backwards belt motion does not progressively rotate the trolley into the tools');
  }
});

test('delayed driver updates recover the same belt corner without losing passengers, cargo or records',()=>{
  for(const interval of [3,6,12,24]){
    let wall=Date.UTC(2026,10,9,2,10);const room=createRoom({random:()=>.5,now:()=>wall});
    const ids=['driver','rider','loader'];for(const id of ids)room.join(id,{hasEntered:true,optOut:true,brokenCount:13,repairedCount:9});
    const cart=room.store.carts.get('CART01');Object.assign(cart,stuck);const player=room.players.get(ids[0]);
    Object.assign(player,cartPoint(cart,0,0,CART_SIZE.tow),{phase:'cart-pulling',cartId:cart.id,posture:'stand'});cart.driver=player.id;cart.riders[0]=ids[1];
    const cargo=[2,3].map(slot=>{const item=[...room.store.records.values()].find(r=>r.mode==='port');assert.ok(room.store.pickup(item.id,ids[2]));assert.ok(room.store.loadCart(cart.id,slot,ids[2],item.id));return item;});
    const wallets=ids.map(id=>room.wallet(id));let predicted={...cart},position={x:player.x,z:player.z};
    for(let i=1;i<=48;i++){
      const to=walk(position,-1,0,1/60),next=pullCart(predicted,position,to,isBlocked);assert.ok(next);predicted=next;position=to;wall+=1000/60;
      if(i%interval===0){room.pose(player.id,{...position,y:0,heading:stuck.yaw,speed:3.2,posture:'stand',hidden:false});assert.ok(Math.hypot(player.x-position.x,player.z-position.z)<.001,'server accepts the client escape');assert.equal(room.carts.snapshot()[0].correction,undefined);}
    }
    assert.ok(cartFits(cart,isBlocked));assert.ok(Math.hypot(cart.x-stuck.x,cart.z-stuck.z)>1.5);assert.equal(cart.driver,ids[0]);
    const seat=cartSeatPose(cart,0),rider=room.players.get(ids[1]);assert.equal(rider.x,seat.x);assert.equal(rider.z,seat.z);
    assert.deepEqual(room.store.cartItems(cart.id).map(r=>r.id),cargo.map(r=>r.id));assert.deepEqual(ids.map(id=>room.wallet(id)),wallets);
    const restored=createRoom({random:()=>.5,now:()=>wall});restored.restoreFoups(room.store.checkpoint());assert.deepEqual(restored.store.cartItems(cart.id).map(r=>r.id),cargo.map(r=>r.id));
    assert.ok(Math.hypot(restored.store.carts.get(cart.id).x-cart.x,restored.store.carts.get(cart.id).z-cart.z)<.001,'checkpoint retains millimetre precision');
  }
});
