import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoom} from '../server/room-engine.js';
import {markFoupDizzy,SAFETY_DIZZY_SECONDS,SAFETY_DIZZY_COOLDOWN,SAFETY_DIZZY_RADIUS} from '../src/safety-dizzy.js';
import {canCatch,createSafetyPatrols} from '../src/safety-team.js';
import {safetyProximity} from '../src/safety-proximity.js';
import {actorPacket,actorFromPacket} from '../src/shared-protocol.js';
import {createAvatar} from '../src/avatar.js';
import {createCatchReaction} from '../src/catch-reaction.js';
import {createExplorer} from '../src/explorer.js';
import {createEmoteView} from '../src/emote-view.js';
import {machines} from '../src/layout.js';

const guard=()=>({id:'guard',role:'safety-orange',x:0,y:0,z:4,heading:0,posture:'stand',phase:'patrol',path:[],penalty:0});
function setup(human=false){
  const room=createRoom({random:()=>.5,now:()=>Date.parse('2026-11-09T13:30:00+09:00')});
  room.residents.update=()=>{};for(const g of room.safety.people){g.hidden=true;g.path=[];g.nextThink=1e9;}
  room.join('thrower',{optOut:true,hasEntered:true});room.pose('thrower',{x:0,y:0,z:0,heading:0,hidden:false,posture:'stand'});
  room.players.get('thrower').safeUntil=1e9;
  let g=room.safety.people[0];
  if(human){room.join('guard',{optOut:true,hasEntered:true,brokenCount:19,repairedCount:8});g=room.players.get('guard');}
  Object.assign(g,guard(),{id:human?'guard':g.id,hidden:false,x:.6,nextThink:1e9});
  const tick=seconds=>{for(let n=0;n<Math.ceil(seconds/.05);n++)room.step(.05);};
  let number=0;
  function toss(drop=false){
    const r=room.store.adopt('local-test:'+number++,{x:0,y:.225,z:0});
    assert.ok(room.command('thrower','pickup',{id:r.id}).ok);
    assert.ok(room.command('thrower','throw',{drop}).ok);return r;
  }
  return {room,g,tick,toss};
}

test('a real thrown FOUP stuns a nearby NPC on impact, sends angry, and then restores catching',()=>{
  const {room,g,tick,toss}=setup();const r=toss();
  assert.equal(g.dizzyLeft,undefined,'launch alone is not a hit');
  tick(.9);assert.equal(r.mode,'broken');assert.ok(g.dizzyLeft>1.8&&g.dizzyLeft<=2);
  const hitAt=g.dizzyUntil-2,position={x:g.x,z:g.z},sequence=g.emoteSeq;
  assert.equal(g.emote,'angry');assert.equal(g.emoteUntil,g.dizzyUntil);
  const visitor={role:'visitor',x:g.x+.3,y:0,z:g.z};
  assert.equal(canCatch(g,visitor,room.time),false);assert.equal(safetyProximity(visitor,[g]).near,false);
  tick(1.5);assert.deepEqual({x:g.x,z:g.z},position);assert.equal(g.speed,0);assert.ok(g.dizzyLeft>0);
  tick(.6);assert.equal(g.dizzyLeft,0);assert.equal(g.emote,'');assert.equal(g.emoteSeq,sequence);
  assert.ok(room.time>=hitAt+SAFETY_DIZZY_SECONDS);assert.equal(canCatch({...g,...position},visitor,room.time),true);
});

test('human safety players cannot move or start an action while dizzy, without changing rewards or records',()=>{
  const {room,g,tick,toss}=setup(true),wallet=structuredClone(g.wallet);
  toss();tick(.9);assert.ok(g.dizzyLeft>0);
  const point={x:g.x,y:g.y,z:g.z};
  room.pose(g.id,{x:2,y:0,z:20,heading:2,speed:5,posture:'lie',hidden:false});
  assert.deepEqual({x:g.x,y:g.y,z:g.z},point);assert.equal(g.speed,0);assert.equal(g.posture,'stand');
  for(const kind of ['pickup','throw','board','cart-pull','emote'])assert.equal(room.command(g.id,kind,{id:kind==='emote'?'heart':0}).ok,false);
  const row=room.snapshot(true).people.find(p=>p[0]===g.id),decoded=actorFromPacket(row);
  assert.equal(decoded.emote,'angry');assert.ok(decoded.dizzyLeft>0);
  const saved=room.profile(g.id);assert.deepEqual(saved.wallet,wallet);assert.equal(saved.brokenCount,19);assert.equal(saved.repairedCount,8);assert.equal(saved.penalty,0);assert.equal(saved.role,'safety-orange');
  for(const key of ['dizzyLeft','dizzyUntil','dizzyReadyAt','emote','emoteLeft'])assert.equal(key in saved,false);
  tick(2.1);room.pose(g.id,{x:0,y:0,z:8,heading:0,speed:3,posture:'stand',hidden:false});assert.equal(g.z,8);
  assert.deepEqual(g.wallet,wallet);
});

test('repeat impacts cannot extend the two seconds or bypass the ten-second immunity',()=>{
  const g=guard(),impact={x:0,z:4};assert.ok(markFoupDizzy(g,impact,12));
  const until=g.dizzyUntil,sequence=g.emoteSeq;
  assert.equal(markFoupDizzy(g,impact,13),false);assert.equal(g.dizzyUntil,until);assert.equal(g.emoteSeq,sequence);
  g.dizzyLeft=0;assert.equal(markFoupDizzy(g,impact,21.99),false);
  assert.ok(markFoupDizzy(g,impact,12+SAFETY_DIZZY_COOLDOWN));assert.equal(g.emoteSeq,sequence+1);
});

test('drops, intact contest-style throws and restored shattering flights do not stun',()=>{
  const {room,g,tick,toss}=setup();const dropped=toss(true);tick(2);assert.notEqual(dropped.mode,'broken');assert.equal(g.dizzyLeft,0);
  const intact=room.store.adopt('intact',{x:0,y:.225,z:4});room.store.launch(intact,{x:0,y:.3,z:4},{x:0,y:0,z:0},{shatter:false});tick(.3);
  assert.notEqual(intact.mode,'broken');assert.equal(g.dizzyLeft,0);
  const restored=setup(),interrupted=[...restored.room.store.records.values()].find(r=>r.mode==='port');
  restored.room.store.launch(interrupted,{x:0,y:1,z:4},{x:0,y:0,z:0},{shatter:true});
  const snapshot=restored.room.store.checkpoint();restored.room.store.restore(snapshot);
  assert.equal(restored.room.store.records.get(interrupted.id).mode,'broken');assert.equal(restored.g.dizzyLeft||0,0);
});

test('impact range excludes busy, hidden or elevated actors, paused events and barriers',()=>{
  const impact={x:0,z:4};
  for(const override of [{posture:'sit'},{phase:'repair'},{hidden:true},{y:.8},{phase:'climb'},{phase:'riding'},{phase:'cart-riding'},{phase:'event-rest'},{x:SAFETY_DIZZY_RADIUS+.01}]){
    assert.equal(markFoupDizzy({...guard(),...override},impact,5),false,JSON.stringify(override));
  }
  assert.ok(markFoupDizzy({...guard(),x:SAFETY_DIZZY_RADIUS},impact,5));
  const m=machines[0];assert.equal(markFoupDizzy({...guard(),x:m.x,z:m.z},{x:m.x,z:m.z+.2},5),false,'no hit through an equipment cabinet');
});

test('NPC route planning stays frozen even if a visitor comes close while dizzy',()=>{
  const patrol=createSafetyPatrols({random:()=>.5}),g=patrol.people[0];Object.assign(g,guard(),{id:g.id});
  assert.ok(markFoupDizzy(g,{x:0,z:4},1));g.path=[{x:0,z:7}];g.nextThink=0;
  for(let i=0;i<8;i++)patrol.update(.1,[{role:'visitor',x:0,z:5}],1.1+i*.1);
  assert.equal(g.x,0);assert.equal(g.z,4);assert.equal(g.speed,0);assert.equal(g.chasingId,null);
});

test('dizzy animation sways in both directions and returns to normal without moving the avatar or camera anchor',()=>{
  const avatar=createAvatar(THREE),hood=avatar.root.getObjectByName('hood');
  try{
    avatar.root.position.set(2,0,4);avatar.update(0,{heading:.7,snap:true});const start=hood.getWorldPosition(new THREE.Vector3()),anchor=avatar.root.position.clone();
    const leans=[];for(const left of [1.8,1.4,1,.6,.2]){avatar.root.userData.dizzyLeft=left;avatar.update(.05,{heading:.7});leans.push(hood.parent.rotation.z);assert.deepEqual(avatar.root.position,anchor);assert.equal(avatar.root.userData.viewHeight,1.02);}
    assert.ok(Math.max(...leans)>.15&&Math.min(...leans)<-.15);
    avatar.root.userData.dizzyLeft=0;avatar.update(.05,{heading:.7});assert.ok(hood.getWorldPosition(new THREE.Vector3()).distanceTo(start)<1e-7);
  }finally{avatar.dispose();}
});

test('actor packet extension accepts old packets and contains the exact remaining dizzy time',()=>{
  const row=actorPacket({...guard(),dizzyLeft:1.25,emote:'angry',emoteLeft:1.25});
  assert.equal(actorFromPacket(row).dizzyLeft,1.25);assert.equal(actorFromPacket(row.slice(0,24)).dizzyLeft,0);
});

function element(){const classes=new Set(['hidden']);return {append(){},setAttribute(){},addEventListener(){},classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(k,v){v?classes.add(k):classes.delete(k);}},style:{},getContext:()=>({clearRect(){},beginPath(){},roundRect(){},fill(){},fillText(){},fillRect(){}})};}
test('a dizzy local player stays still while camera drag works and movement resumes after expiry',()=>{
  const old={document:globalThis.document,window:globalThis.window},events=new Map();
  globalThis.document={hidden:false,body:element(),createElement:element,getElementById:element,querySelectorAll:()=>[],addEventListener(){}};globalThis.window={addEventListener(){}};
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(72,390/844,.08,420),avatar={root:new THREE.Group(),update(){}};
  const explorer=createExplorer({THREE,scene,camera,avatar,colliders:[],vehicles:[],orbit:{target:new THREE.Vector3(),update(){}},canvas:{addEventListener:(k,v)=>events.set(k,v),setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:390,height:844})},onMode(){},onInspect(){},onToast(){},onGroundMotion:state=>{state.position.z+=1;}});
  const reaction=createCatchReaction({THREE,avatar,explorer,toast(){}});
  try{
    reaction.receive({...guard(),dizzyLeft:2});const chosen={yaw:explorer.state.yaw,elevation:explorer.state.elevation,distance:explorer.state.distance};
    for(let i=0;i<6;i++){reaction.prepare(.05);explorer.update(.05);}
    assert.deepEqual({yaw:explorer.state.yaw,elevation:explorer.state.elevation,distance:explorer.state.distance},chosen,'effect never changes the selected camera');
    assert.equal(explorer.beginJoystick(),false);assert.equal(explorer.walkTo({x:0,z:8}),false);
    const pointer={pointerId:1,pointerType:'touch',clientX:280,clientY:400};events.get('pointerdown')(pointer);
    for(let i=1;i<=12;i++){reaction.prepare(.05);explorer.update(.05);events.get('pointermove')({...pointer,clientX:280-i*8,clientY:400-i*2});assert.equal(explorer.state.position.z,4);}
    assert.ok(Math.abs(explorer.state.yaw-chosen.yaw)>.4,'manual view drag is still available');assert.equal(explorer.state.locked,false);
    for(let i=0;i<23;i++)reaction.prepare(.05);assert.equal(reaction.active,false);assert.equal(explorer.state.reactionFrozen,false);assert.ok(explorer.beginJoystick());
    reaction.receive({...guard(),dizzyLeft:2});reaction.reset();assert.equal(avatar.root.userData.dizzyLeft,0);assert.equal(explorer.state.reactionFrozen,false);
  }finally{scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});Object.assign(globalThis,old);}
});

test('automatic angry emote replaces an unconfirmed tap without restarting on repeated frames',()=>{
  const old=globalThis.document;globalThis.document={createElement:element};const scene=new THREE.Scene(),view=createEmoteView(THREE,scene,{self:true}),avatar={root:new THREE.Group()};
  try{
    view.set('angry',0,2);const angry=view.sprite.material.map;
    view.play('wave');assert.notEqual(view.sprite.material.map,angry);
    view.set('angry',1,2,'self',true);view.update(avatar,'stand',.1);assert.equal(view.sprite.visible,true);assert.equal(view.sprite.material.map,angry);
    for(let i=0;i<20;i++){view.set('angry',1,2,'self',true);view.update(avatar,'stand',.1);assert.equal(view.sprite.material.map,angry);}
    assert.equal(view.sprite.visible,false);
  }finally{view.dispose();globalThis.document=old;}
});
