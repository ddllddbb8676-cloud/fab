import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {createFoupStore} from '../src/foup-play.js';
import {ports,isBlocked} from '../src/layout.js';
import {CART_HOME,CART_SIZE,cartPoint,cartSeatPose,cartFits,pullCart} from '../src/cart-layout.js';
import {foupPacket,foupFromPacket} from '../src/shared-protocol.js';

const id='visitor:'+'a'.repeat(64),second='visitor:'+'b'.repeat(64),third='visitor:'+'c'.repeat(64);
function setup(){
  const room=createRoom({random:()=>.5,now:()=>Date.UTC(2026,10,5,4,0)});
  for(const who of [id,second,third]){room.join(who,{hasEntered:true,optOut:true});room.pose(who,{x:CART_HOME.x-.95,y:0,z:CART_HOME.z,heading:0,speed:0,posture:'stand',hidden:false});}
  return room;
}
function command(room,who,kind,data={}){room.players.get(who).rate=0;return room.command(who,kind,{id:CART_HOME.id,...data});}
function load(room,slot,who=id){
  const rid=[...room.store.records.values()].find(r=>r.mode==='port').id;
  assert.equal(room.store.pickup(rid,who),true);
  assert.equal(command(room,who,'cart-load',{slot,recordId:rid}).ok,true);
  return room.store.records.get(rid);
}
test('four unique carriers fill two tiers; mounting each tier spills only its two intact FOUPs without chips',()=>{
  const room=setup(),wallets=[id,second,third].map(id=>room.wallet(id));
  const cargo=[0,1,2,3].map(slot=>load(room,slot));
  assert.equal(room.store.cartItems(CART_HOME.id).length,4);
  assert.equal(command(room,second,'cart-board',{level:0}).ok,true);
  assert.deepEqual(cargo.map(r=>r.mode),['flying','flying','cart','cart']);
  assert.equal(command(room,third,'cart-board',{level:1}).ok,true);
  assert.equal(room.store.cartItems(CART_HOME.id).length,0);
  for(let i=0;i<45;i++)room.store.step(.1);
  assert.ok(cargo.every(r=>r.mode==='ground'&&!r.shatter&&r.breakSeq===0));
  assert.deepEqual([id,second,third].map(id=>room.wallet(id)),wallets);
  assert.equal(command(room,id,'cart-board',{level:0}).ok,false);
});
test('a rider blocks both slots; unload is atomic and a stale command cannot steal another carrier',()=>{
  const room=setup(),r=load(room,0);
  assert.equal(command(room,second,'cart-take',{slot:0,recordId:'wrong'}).ok,false);
  assert.equal(command(room,second,'cart-take',{slot:0,recordId:r.id}).ok,true);
  assert.equal(command(room,third,'cart-take',{slot:0,recordId:r.id}).ok,false);
  assert.equal(room.store.getCarried(second)?.id,r.id);
  assert.equal(command(room,third,'cart-board',{level:0}).ok,true);
  assert.equal(command(room,second,'cart-load',{slot:1,recordId:r.id}).ok,false);
  assert.equal(room.store.getCarried(second)?.id,r.id);
});
test('one puller moves both riders; rider poses cannot move the cart; disconnect stops it and frees the handle',()=>{
  const room=setup();
  assert.equal(command(room,second,'cart-board',{level:0}).ok,true);
  assert.equal(command(room,third,'cart-board',{level:1}).ok,true);
  assert.equal(command(room,id,'cart-pull').ok,true);
  const c=room.store.carts.get(CART_HOME.id),p=room.players.get(id),start=c.z;
  for(let i=0;i<20;i++)room.pose(id,{x:p.x,y:0,z:p.z-.05,heading:Math.PI,speed:1,posture:'stand',hidden:false});
  assert.ok(c.z<start-.5);
  for(const [who,level]of [[second,0],[third,1]]){
    const seat=cartSeatPose(c,level);assert.equal(room.players.get(who).y,seat.y);assert.equal(room.players.get(who).z,seat.z);
  }
  room.pose(second,{x:40,y:0,z:-30,heading:0,posture:'stand',hidden:false});
  assert.equal(room.players.get(second).z,cartSeatPose(c,0).z);
  assert.equal(command(room,second,'pickup',{id:'vehicle:0'}).ok,false);
  room.remove(id);assert.equal(c.driver,null);assert.equal(c.riders[0],second);
  room.players.get(second).penalty=3;
  const exit=command(room,second,'cart-leave');assert.ok(exit.ok);assert.equal(exit.cartExit.y,0);assert.equal(c.riders[0],null);
  assert.equal(isBlocked(exit.cartExit.x,exit.cartExit.z,.295),false);
});
test('moving cart saves existing FOUP identities with rollback-safe floor rows; reboot removes riders but retains load',()=>{
  const room=setup(),r=load(room,2);r.gold={eventId:'gold:123',expiresAt:Date.UTC(2027,0,1),throwPaid:true};
  assert.equal(command(room,second,'cart-board',{level:0}).ok,true);
  const saved=room.store.checkpoint();
  assert.equal(saved.records.find(row=>row[0]===r.id)[1],'ground');
  const restored=createRoom({random:()=>.5,now:()=>Date.UTC(2026,10,5,4,0)});restored.restoreFoups(saved);
  const result=restored.store.records.get(r.id);
  assert.equal(result.mode,'cart');assert.equal(result.cartSlot,2);assert.equal(result.gold.throwPaid,true);
  assert.deepEqual(restored.store.carts.get(CART_HOME.id).riders,[null,null]);
  assert.equal(restored.store.carts.get(CART_HOME.id).driver,null);
  const fallback=structuredClone(saved);delete fallback.carts;
  const store=createFoupStore({ports});store.restore(fallback);assert.equal(store.records.get(r.id).mode,'ground');
  assert.equal(isBlocked(result.x,result.z,.24),false);
  const corrupt=structuredClone(saved);corrupt.carts.entries.push([...corrupt.carts.entries[0]]);
  assert.throws(()=>store.restore(corrupt),/cart cargo/);
});
test('cargo modes and slots survive wire packets; ordinary pickup cannot bypass the cart slots',()=>{
  const room=setup(),r=load(room,3),wire=foupFromPacket(foupPacket(r));
  assert.equal(wire.cartId,CART_HOME.id);assert.equal(wire.cartSlot,3);assert.equal(wire.mode,'cart');
  assert.equal(room.store.pickup(r.id,second),false);
  assert.equal(command(room,second,'cart-take',{slot:3,recordId:r.id}).ok,true);
  assert.equal(room.store.records.get(r.id).cartId,undefined);
});
test('pull collision sweeps the full footprint and refuses teleports; home and handle are accessible',()=>{
  assert.equal(cartFits(CART_HOME,isBlocked),true);
  const handle=cartPoint(CART_HOME,0,0,CART_SIZE.tow);
  assert.equal(isBlocked(handle.x,handle.z,.295),false);
  assert.equal(pullCart(CART_HOME,handle,{x:0,z:0},()=>false),null);
  const c={x:0,z:0,yaw:0},from={x:0,z:CART_SIZE.tow},to={x:0,z:3};
  assert.equal(pullCart(c,from,to,(x,z)=>z>1),null);
  assert.ok(pullCart(c,from,to,()=>false).z>1);
});
test('remote commands, occupied handle and malformed slots cannot mutate cargo or wallet',()=>{
  const room=setup(),wallet=room.wallet(id);
  room.pose(id,{x:0,y:0,z:0,heading:0,posture:'stand',hidden:false});
  assert.equal(command(room,id,'cart-pull').ok,false);
  assert.equal(command(room,second,'cart-board',{level:2}).ok,false);
  assert.equal(command(room,second,'cart-pull').ok,true);
  assert.equal(command(room,third,'cart-pull').ok,false);
  assert.equal(command(room,third,'cart-board',{level:1}).ok,false);
  assert.deepEqual(room.wallet(id),wallet);
});
