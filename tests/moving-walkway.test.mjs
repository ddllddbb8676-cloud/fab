import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyWalkwayMotion,walkwayAt,WALKWAY_LANES,WALKWAY_SPEED} from '../src/moving-walkway.js';
import {WALK_SPEED} from '../src/locomotion.js';
import {isBlocked} from '../src/layout.js';
import {canWalkSegment} from '../src/walking.js';
import {createExplorer} from '../src/explorer.js';
import {createRoom} from '../server/room-engine.js';
import {CART_SIZE,cartPoint,cartSeatPose,cartCargoPose,cartFits} from '../src/cart-layout.js';

const state=(x=1.05,z=0)=>({mode:'walk',position:{x,y:0,z},posture:'stand',path:[],heading:.34,yaw:.75,speed:0});
function carry(s,dt=1/60,options={}){return applyWalkwayMotion(s,{...s.position,routed:!!s.path.length},dt,options);}
test('both right-hand belts carry an idle person at exactly twice normal speed at 30/60/120 Hz',()=>{
  assert.equal(WALKWAY_SPEED,WALK_SPEED*2);
  for(const lane of WALKWAY_LANES)for(const hz of [30,60,120]){
    assert.ok(lane.x*lane.direction<0,'each belt stays to the right of its travel direction');
    const s=state(lane.x);
    for(let i=0;i<hz*2;i++)carry(s,1/hz);
    assert.ok(Math.abs(s.position.z-lane.direction*12.8)<1e-8);
    assert.equal(s.yaw,.75);assert.equal(s.heading,.34);assert.equal(s.speed,0);
  }
});
test('full length and sides accept a cart, no rail blocks sideways entry/exit, and ends stop before rest area',()=>{
  for(const lane of WALKWAY_LANES){
    for(let z=lane.minZ;z<=lane.maxZ;z+=1){
      assert.ok(cartFits({x:lane.x,z,yaw:lane.direction>0?0:Math.PI},isBlocked));
      assert.ok(canWalkSegment({x:0,z},{x:lane.x+Math.sign(lane.x)*.9,z}));
    }
    const s=state(lane.x,lane.direction>0?lane.maxZ-.01:lane.minZ+.01);
    for(let i=0;i<120;i++)carry(s);
    assert.equal(walkwayAt(s.position),null);assert.ok(Math.abs(s.position.z)<79);
    const stopped=s.position.z;carry(s);assert.equal(s.position.z,stopped);
  }
  assert.equal(walkwayAt({x:0,z:0}),null);assert.equal(walkwayAt({x:1.05,z:76}),null);
});
test('walking forward never triples belt speed, side exit restores ordinary movement immediately',()=>{
  const s=state(),dt=.05;
  for(let i=0;i<20;i++){const before={...s.position};s.position.z-=WALK_SPEED*dt;applyWalkwayMotion(s,before,dt);}
  assert.ok(Math.abs(s.position.z+WALKWAY_SPEED)<1e-8);
  for(let i=0;i<20;i++){const before={...s.position};s.position.x+=WALK_SPEED*dt;applyWalkwayMotion(s,before,dt);}
  const z=s.position.z;carry(s);assert.equal(s.position.z,z);assert.equal(walkwayAt(s.position),null);
});
test('protected zones, modal lock, seated riders, height, cleanup and disabled events cannot drift',()=>{
  for(const patch of [{locked:true},{mode:'overview'},{mode:'passenger'},{posture:'sit'},{posture:'lie'},{cleaningTime:0},{emoInteraction:{}},{repairInteraction:{}}]){
    const s=Object.assign(state(),patch);assert.equal(carry(s),null);assert.equal(s.position.z,0);
  }
  const s=state();carry(s,.05,{enabled:false});assert.equal(s.position.z,0);
  carry(s,.05,{canTraverse:()=>false});assert.equal(s.position.z,0);
  s.position.y=1;assert.equal(carry(s),null);s.position.y=0;
  carry(s,10);assert.equal(s.position.z,0);
});
test('tap targets never overshoot; crossing and reverse routes retain their normal path',()=>{
  const s=state();s.path=[{x:s.position.x,z:-.02}];carry(s,.05);assert.equal(s.position.z,-.02);
  for(const target of [{x:2,z:-3},{x:1.05,z:3}]){const q=state();q.path=[target];carry(q,.05);assert.equal(q.position.z,0);assert.deepEqual(q.path,[target]);}
});
test('real explorer carries both directions while keeping chosen view and allows leaving with the joystick',()=>{
  const old={document:globalThis.document,window:globalThis.window},events=new Map();
  globalThis.document={hidden:false,getElementById:()=>({classList:{contains:()=>true,add(){},remove(){}}}),querySelectorAll:()=>[],addEventListener(){}};
  globalThis.window={addEventListener(){}};
  try{
    const scene=new THREE.Scene(),avatar={root:new THREE.Group(),update(){}};
    const camera=new THREE.PerspectiveCamera(72,390/844,.08,420);
    const explorer=createExplorer({THREE,scene,camera,avatar,colliders:[],vehicles:[],orbit:{target:new THREE.Vector3(),update(){}},
      canvas:{addEventListener:(k,v)=>events.set(k,v),setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:390,height:844})},onMode(){},onInspect(){},onToast(){},onGroundMotion:applyWalkwayMotion});
    const s=explorer.state;s.position.set(1.05,0,20);s.yaw=0;s.manualLook=true;explorer.update(0);
    const yaw=s.yaw,elevation=s.elevation,distance=s.distance;
    for(let i=0;i<60;i++)explorer.update(1/60);
    assert.ok(Math.abs(s.position.z-13.6)<1e-8);assert.equal(s.yaw,yaw);assert.equal(s.elevation,elevation);assert.equal(s.distance,distance);
    explorer.beginJoystick();explorer.moveJoystick(1,0);for(let i=0;i<65;i++)explorer.update(1/60);explorer.endJoystick();
    const z=s.position.z;assert.equal(walkwayAt(s.position),null);for(let i=0;i<60;i++)explorer.update(1/60);assert.equal(s.position.z,z);
    // Crossing the centre onto the opposite strip works without mounting buttons.
    s.position.set(-1.05,0,0);for(let i=0;i<60;i++)explorer.update(1/60);assert.ok(Math.abs(s.position.z-6.4)<1e-8);
    assert.equal(avatar.root.position.z,s.position.z);
  }finally{Object.assign(globalThis,old);}
});
test('server cart pose accepts two-times travel with all four original cargo IDs or two riders, without rewards',()=>{
  for(const lane of WALKWAY_LANES)for(const passengers of [false,true]){
    const room=createRoom({random:()=>.5,now:()=>Date.UTC(2026,10,5,4,0)}),ids=['a','b','c'].map(c=>'visitor:'+c.repeat(64));
    const c=room.store.carts.get('CART01');Object.assign(c,{x:lane.x,z:0,yaw:lane.direction>0?0:Math.PI});
    const cmd=(id,kind,data={})=>{room.players.get(id).rate=0;return room.command(id,kind,{id:c.id,...data});};
    for(const id of ids){room.join(id,{hasEntered:true,optOut:true});room.pose(id,{x:c.x+.8,z:c.z,y:0,heading:0,speed:0,posture:'stand',hidden:false});}
    const wallets=ids.map(id=>room.wallet(id));
    const cargo=[];
    if(passengers){for(let level=0;level<2;level++)assert.ok(cmd(ids[level+1],'cart-board',{level}).ok);}
    else for(let slot=0;slot<4;slot++){const r=[...room.store.records.values()].find(r=>r.mode==='port');assert.ok(room.store.pickup(r.id,ids[0]));assert.ok(cmd(ids[0],'cart-load',{slot,recordId:r.id}).ok);cargo.push(r.id);}
    assert.ok(cmd(ids[0],'cart-pull').ok);
    const handle=cartPoint(c,0,0,CART_SIZE.tow),s=state(handle.x,handle.z);
    for(let i=0;i<60;i++){carry(s);room.pose(ids[0],{...s.position,heading:c.yaw,speed:0,posture:'stand',hidden:false});}
    assert.ok(Math.abs(c.z-lane.direction*6.4)<1e-8);assert.equal(c.driver,ids[0]);
    if(passengers)for(let level=0;level<2;level++){const p=room.players.get(ids[level+1]),seat=cartSeatPose(c,level);assert.equal(p.z,seat.z);assert.equal(p.y,seat.y);}
    else {assert.deepEqual(room.store.cartItems(c.id).map(r=>r.id),cargo);for(const r of room.store.cartItems(c.id)){const expected=cartCargoPose(c,r.cartSlot);assert.ok(Math.abs(r.z-expected.z)<1e-8);}}
    assert.deepEqual(ids.map(id=>room.wallet(id)),wallets);
  }
});
test('a one-second delayed cart pose stays attached only on the same forward belt',()=>{
  const room=createRoom({random:()=>.5,now:()=>Date.UTC(2026,10,5,4,0)}),id='visitor:'+'d'.repeat(64),c=room.store.carts.get('CART01');
  Object.assign(c,{x:1.05,z:20,yaw:Math.PI});room.join(id,{hasEntered:true,optOut:true});room.pose(id,{x:1.05,y:0,z:18.5,heading:Math.PI,posture:'stand'});
  assert.ok(room.command(id,'cart-pull',{id:c.id}).ok);const p=room.players.get(id),start=p.z;
  for(let i=0;i<10;i++)room.step(.1);
  room.pose(id,{x:p.x,y:0,z:start-6.4,heading:Math.PI,posture:'stand',speed:0});assert.equal(c.driver,id);assert.ok(Math.abs(c.z-13.6)<1e-8);
  room.pose(id,{x:p.x,y:0,z:p.z-20,heading:Math.PI,posture:'stand',speed:0});assert.equal(c.driver,null,'unbounded jump still releases the handle');
});
