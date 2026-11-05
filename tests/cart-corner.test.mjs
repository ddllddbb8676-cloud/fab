import test from 'node:test';
import assert from 'node:assert/strict';
import {CART_SIZE,cartPoint,cartFits,pullCart} from '../src/cart-layout.js';
import {isBlocked} from '../src/layout.js';
import {createRoom} from '../server/room-engine.js';

// Read-only production cart pose from the entrance corner report (no identity).
const corner={id:'CART01',x:2.889,z:84.536,yaw:-5.354};
// Steer around the stocker port before backing toward the open main aisle.
const exitMoves=[[-.06,0],[-.06,0],[-.06,.06],[-.06,0],[-.06,0],[-.06,0],...Array.from({length:30},()=>[-.06,-.06])];
test('a cart at the entrance corner can steer and reverse out without crossing a wall',()=>{
  let c={...corner},p=cartPoint(c,0,0,CART_SIZE.tow);
  assert.ok(cartFits(c,isBlocked));assert.equal(isBlocked(p.x,p.z,.295),false);
  for(const [dx,dz] of exitMoves){
    const to={x:p.x+dx,z:p.z+dz};
    assert.equal(isBlocked(to.x,to.z,.295),false);
    const next=pullCart(c,p,to,isBlocked);assert.ok(next,'reverse move is available');
    assert.ok(cartFits(next,isBlocked));
    assert.ok(Math.abs(Math.hypot(to.x-next.x,to.z-next.z)-CART_SIZE.tow)<.01,'keep the handle ahead of the body');
    c=next;p=to;
  }
  assert.ok(Math.hypot(c.x-corner.x,c.z-corner.z)>1.5,'cart backs out rather than leaving the player trapped against it');
});

test('corner recovery preserves passengers, FOUP identities and chips; reverse still stops at walls',()=>{
  const room=createRoom({random:()=>.5,now:()=>Date.UTC(2026,10,5,10)}),ids=['a','b','c'].map(c=>'visitor:'+c.repeat(64));
  ids.forEach(id=>room.join(id,{hasEntered:true,optOut:true,brokenCount:23,repairedCount:11}));
  const c=room.store.carts.get('CART01');Object.assign(c,corner);
  const driver=room.players.get(ids[0]);Object.assign(driver,cartPoint(c,0,0,CART_SIZE.tow),{phase:'cart-pulling',cartId:c.id,posture:'stand'});c.driver=driver.id;
  const rider=room.players.get(ids[1]);c.riders[0]=rider.id;
  const cargo=[2,3].map(slot=>{const r=[...room.store.records.values()].find(r=>r.mode==='port');room.store.pickup(r.id,ids[2]);assert.ok(room.store.loadCart(c.id,slot,ids[2],r.id));return r;});
  const wallets=ids.map(id=>room.wallet(id));
  for(const [dx,dz] of exitMoves)room.pose(driver.id,{x:driver.x+dx,y:0,z:driver.z+dz,heading:corner.yaw,speed:1,posture:'stand',hidden:false});
  assert.ok(Math.hypot(c.x-corner.x,c.z-corner.z)>1.5);
  assert.equal(c.driver,driver.id);assert.equal(c.riders[0],rider.id);
  assert.ok(Math.hypot(rider.x-c.x,rider.z-c.z)<1);
  assert.deepEqual(cargo.map(r=>[r.mode,r.cartId,r.cartSlot]),[['cart',c.id,2],['cart',c.id,3]]);
  assert.deepEqual(ids.map(id=>room.wallet(id)),wallets);
  const restored=createRoom({random:()=>.5,now:()=>Date.UTC(2026,10,5,10)});restored.restoreFoups(room.store.checkpoint());
  assert.deepEqual(restored.store.cartItems(c.id).map(r=>r.id),cargo.map(r=>r.id),'cargo survives a server restart after recovery');
  const open={x:0,z:0,yaw:0},handle=cartPoint(open,0,0,CART_SIZE.tow);
  assert.equal(pullCart(open,handle,{x:0,z:handle.z-.8},(x,z)=>z< -1.2),null,'reverse cannot pass through a wall');
  assert.equal(pullCart(open,handle,{x:0,z:handle.z-10},()=>false),null,'no large teleport');
});

test('a delayed reverse pose agrees with small client steps and keeps the handle attached',()=>{
  const room=createRoom({random:()=>.5,now:()=>Date.UTC(2026,10,5,10)}),id='visitor:'+'d'.repeat(64);
  room.join(id,{hasEntered:true,optOut:true});
  const c=room.store.carts.get('CART01');Object.assign(c,{x:0,z:30,yaw:0});
  const p=room.players.get(id),start=cartPoint(c,0,0,CART_SIZE.tow);Object.assign(p,start,{phase:'cart-pulling',cartId:c.id,posture:'stand'});c.driver=id;
  let predicted={...c},from=start;
  for(let i=0;i<40;i++){
    const to={x:from.x,z:from.z-.04};
    predicted=pullCart(predicted,from,to,isBlocked);assert.ok(predicted);from=to;
  }
  room.pose(id,{...from,y:0,heading:0,speed:1,posture:'stand',hidden:false});
  assert.equal(c.driver,id);
  assert.ok(Math.hypot(c.x-predicted.x,c.z-predicted.z)<1e-8);
  assert.ok(Math.hypot(p.x-from.x,p.z-from.z)<1e-8);
  assert.equal(c.yaw,0,'reversing straight must not swing the cart around');
});
