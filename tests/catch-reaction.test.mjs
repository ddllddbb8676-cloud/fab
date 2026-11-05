import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAvatar} from '../src/avatar.js';
import {createRoom} from '../server/room-engine.js';
import {actorPacket,actorFromPacket} from '../src/shared-protocol.js';
import {markCatch,CAUGHT_SECONDS} from '../src/catch-reaction.js';

test('a caught avatar visibly raises both hands, recoils and returns to its ordinary pose',()=>{
  const avatar=createAvatar(THREE),hands=[];
  avatar.root.traverse(o=>{if(o.name==='glove')hands.push(o);});
  const height=()=>hands.map(h=>h.getWorldPosition(new THREE.Vector3()).y);
  try{
    avatar.update(0,{heading:0,snap:true});const idle=height();
    avatar.root.userData.caughtLeft=CAUGHT_SECONDS/2;avatar.update(.05,{heading:0});
    assert.ok(height().every((y,i)=>y>idle[i]+.7),'both hands rise visibly');
    assert.equal(avatar.root.position.y,0,'reaction does not relocate the character');
    avatar.root.userData.caughtLeft=0;avatar.update(.05,{heading:0});
    assert.ok(height().every((y,i)=>Math.abs(y-idle[i])<.001));
  }finally{avatar.dispose();}
});
test('capture reactions are shared, expire quickly and do not become profile history or another penalty',()=>{
  const room=createRoom({random:()=>.5}),id='visitor:'+'a'.repeat(64),guardId='visitor:'+'b'.repeat(64);
  for(const who of [id,guardId])room.join(who,{hasEntered:true,optOut:true});
  const p=room.players.get(id),guard=room.players.get(guardId);
  Object.assign(p,{x:0,z:0,y:0,hidden:false,safeUntil:0,phase:'idle'});
  Object.assign(guard,{x:.5,z:0,y:0,hidden:false,role:'safety-orange'});
  const wallet=room.wallet(id);room.step(.05);
  assert.equal(p.penalty,3);assert.ok(p.caughtLeft>1);assert.ok(guard.catchLeft>0);
  const remote=actorFromPacket(room.snapshot(true).people.find(r=>r[0]===id));assert.ok(remote.caughtLeft>1);
  room.pose(id,{x:0,z:5,y:0,heading:0,posture:'stand',hidden:false});assert.equal(p.z,0,'brief caught motion stays in place');
  assert.equal('caughtLeft' in room.profile(id),false);assert.deepEqual(room.wallet(id),wallet);
  for(let i=0;i<14;i++)room.step(.1);
  assert.equal(p.caughtLeft,0);assert.equal(p.penalty,3);
  room.pose(id,{x:0,z:1,y:0,heading:0,posture:'stand',hidden:false});assert.equal(p.z,1,'movement resumes');
});
test('old actor packets have no reaction; the guard and captured visitor have independent timers',()=>{
  const guard={},person={};markCatch(guard,person);
  assert.ok(guard.catchLeft<person.caughtLeft);
  const row=actorPacket({id:'example',x:0,y:0,z:0,heading:0,...person});
  assert.equal(actorFromPacket(row).caughtLeft,CAUGHT_SECONDS);
  assert.equal(actorFromPacket(row.slice(0,22)).caughtLeft,0);
});
