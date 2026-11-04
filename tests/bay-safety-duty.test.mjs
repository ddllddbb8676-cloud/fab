import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,SAFETY_DUTY} from '../server/room-engine.js';
import {bays} from '../src/layout.js';
import {isSafety} from '../src/safety-team.js';

const id=n=>'visitor:'+n.toString(16).padStart(64,'0');
const request='00000000-0000-0000-0000-000000000456';
const initial=Date.parse('2026-11-04T21:00:00+09:00');
function fixture(at=initial,options={}){
  let clock=at;
  const room=createRoom({now:()=>clock,random:()=>.42,claimName:(id,kind,preferred)=>preferred||kind+id,...options});
  room.residents.update=()=>{};room.safety.update=()=>{};
  for(const p of [...room.residents.people,...room.safety.people])p.hidden=true;
  return {room,set:t=>clock=t,join(n,saved){const result=room.join(id(n),saved);assert.equal(result.ok,true);return {result,p:room.players.get(id(n))};},step(dt=0){for(const p of room.players.values())p.lastSeen=room.time;room.step(dt);}};
}
const guardProfile={name:'안전요원',civilianName:'기록보존',safetyName:'안전요원',role:'safety-red',safetyTurns:2,safetyCaughtIds:['caught-before'],activeSeconds:600,brokenCount:42,repairedCount:8,safetyDutyVersion:2};
function assertPreserved(before,after){
  for(const key of ['id','civilianName','brokenCount','repairedCount','wallet','nicknameChoiceVersion','nicknameChoiceKind','titlePreference','safetyTurns','safetyCaughtIds','optOut'])assert.deepEqual(after[key],before[key],key);
  assert.equal(after.name,before.civilianName);assert.equal(after.role,'visitor');
  assert.equal(after.eligibleAfter,after.activeSeconds+SAFETY_DUTY.cooldown);
}

for(const bayCount of [1,2])test(`${bayCount}-bay notice immediately returns human safety to their own name and preserves chips, items and records`,()=>{
  const saved=[],f=fixture(initial,{onProfileChange:p=>saved.push(p)}),r=f.room,{p}=f.join(1,guardProfile);
  assert.equal(r.command(p.id,'purchase',{itemId:'helmet-white'}).ok,true);
  const before=r.profile(p.id),position={x:p.x,y:p.y,z:p.z};
  assert.equal(isSafety(p.role),true);assert.equal(r.worldEvents.startManual('bay',request,bayCount).ok,true);
  assertPreserved(before,r.profile(p.id));assert.deepEqual({x:p.x,y:p.y,z:p.z},position);
  assert.equal(saved.at(-1).role,'visitor');assert.equal(saved.at(-1).wallet.chips,84);
  assert.equal(r.roster().find(row=>row[0]===p.id)[2],'visitor');
  assert.equal(r.worldEvents.bayRunning(),true);assert.equal(r.worldEvents.view().bay.phase,'preparing');
});

test('new human safety appointments are paused through preparation and both bays, then resume under ordinary cooldown rules',()=>{
  const f=fixture(),r=f.room,{p:guard}=f.join(1,guardProfile),{p:other}=f.join(2,{activeSeconds:400});
  Object.assign(other,{hidden:false,x:0,z:50,safeUntil:1e9});
  assert.equal(r.worldEvents.startManual('bay',request,2).ok,true);const b=r.worldEvents.view().bay;
  for(let i=0;i<160;i++)f.step(.1);
  assert.equal(other.role,'visitor','an eligible player is not appointed during the notice');
  f.set(b.startsAt);f.step();assert.equal(other.role,'visitor','no appointment on the starting tick');
  for(const m of bays[b.bayId].machines)r.destruction.trigger(m.id);
  f.set(b.startsAt+1000);f.step();assert.equal(r.worldEvents.view().bay.round,2);assert.equal(other.role,'visitor');
  f.set(b.endsAt-1);f.step();assert.equal(other.role,'visitor','second bay uses the same safety exclusion');
  f.set(b.endsAt);f.step();assert.equal(r.worldEvents.bayRunning(),false);assert.equal(isSafety(other.role),true);
  assert.equal(guard.role,'visitor','the former guard retains the normal ten-minute rest');
});

test('safety profiles reconnect as visitors before welcome even before the restored room first ticks',()=>{
  const f=fixture(),r=f.room,{p}=f.join(1,guardProfile),before=r.profile(p.id);
  r.worldEvents.startManual('bay',request,2);const checkpoint=r.worldEvents.checkpoint(),b=checkpoint.bay;
  for(const at of [b.announcedAt+1000,b.startsAt+1000]){
    const next=fixture(at);next.room.worldEvents.restore(checkpoint);
    const joined=next.join(1,before);
    assert.equal(joined.result.name,before.civilianName);assertPreserved(before,next.room.profile(p.id));
    assert.equal(joined.p.x,p.x);assert.equal(joined.p.z,p.z,'no safety-only exit movement on entry');
    next.room.worldEvents.update();assert.equal(joined.p.role,'visitor');
  }
});

test('restored active event also releases any already joined safety without waiting for a command',()=>{
  const source=fixture();source.room.worldEvents.startManual('bay',request,1);
  const next=fixture(),{p}=next.join(1,guardProfile);assert.equal(isSafety(p.role),true);
  next.room.worldEvents.restore(source.room.worldEvents.checkpoint());next.room.worldEvents.update();
  assert.equal(p.role,'visitor');assert.equal(p.name,p.civilianName);
});

test('the automatic fifteen-account event returns human safety to ordinary players too',()=>{
  const f=fixture(),r=f.room,{p}=f.join(1,guardProfile);
  for(let n=2;n<=15;n++)f.join(n);
  r.worldEvents.update();assert.equal(r.worldEvents.view().bay.bayLimit,1);assert.equal(p.role,'visitor');
});

test('golden FOUP events and expired bay checkpoints keep the normal human safety rules',()=>{
  const f=fixture(),{p}=f.join(1,guardProfile);
  assert.equal(f.room.worldEvents.startManual('golden',request).ok,true);f.step();assert.equal(isSafety(p.role),true);
  const source=fixture();source.room.worldEvents.startManual('bay',request,1);const checkpoint=source.room.worldEvents.checkpoint();
  const next=fixture(checkpoint.bay.endsAt);next.room.worldEvents.restore(checkpoint);const joined=next.join(1,guardProfile);
  next.room.worldEvents.update();assert.equal(isSafety(joined.p.role),true);
});
