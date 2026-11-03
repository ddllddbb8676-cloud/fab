import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,SAFETY_DUTY} from '../server/room-engine.js';
import {isSafety} from '../src/safety-team.js';

const TICK=1/16;
function quiet(room){
  for(const npc of room.residents.people){npc.hidden=true;npc.wait=1e9;npc.path=[];}
  for(const guard of room.safety.people)guard.hidden=true;
}
function room(options={}){
  const r=createRoom({random:()=>.42,claimName:(id,kind,preferred)=>preferred||`${kind}-${id}`,...options});
  quiet(r);return r;
}
function enter(r,id='a',saved=null,z=50){
  assert.equal(r.join(id,saved).ok,true);
  assert.equal(r.pose(id,{x:0,y:0,z,heading:0,posture:'stand',hidden:false}),true);
  return r.players.get(id);
}
function step(r,dt=TICK){
  for(const p of r.players.values())p.lastSeen=r.time;
  r.step(dt);
}
function advance(r,seconds){
  assert.equal(seconds/TICK,Math.floor(seconds/TICK),'use exact binary time boundaries');
  for(let i=0;i<seconds/TICK;i++)step(r);
}
function appoint(r,p){
  advance(r,15);p.activeSeconds=300-TICK;step(r);
  assert.equal(p.activeSeconds,300);assert.equal(isSafety(p.role),true);
}
function complete(r,p){
  const targets=r.residents.people.filter(npc=>npc.role==='thrower').slice(0,3);
  assert.equal(targets.length,3);
  for(const npc of targets){
    Object.assign(npc,{x:p.x,y:0,z:p.z+.3,hidden:false,penalty:0,safeUntil:0,phase:'idle',path:[],wait:1e9});
    step(r);npc.hidden=true;
  }
  assert.equal(p.safetyCaughtIds.size,3);assert.equal(p.role,'visitor');
  return p.activeSeconds;
}

test('first safety duty requires 300 active seconds, including the exact threshold',()=>{
  assert.deepEqual(SAFETY_DUTY,{warmup:300,handover:15,cooldown:600,goal:3});
  const r=room(),p=enter(r);advance(r,15);
  for(const active of [60,90,150,299]){
    p.activeSeconds=active;step(r,0);assert.equal(p.role,'visitor',`${active} seconds is still too early`);
  }
  p.activeSeconds=300-2*TICK;step(r);
  assert.equal(p.activeSeconds,300-TICK);assert.equal(p.role,'visitor');
  step(r);assert.equal(p.activeSeconds,300);assert.equal(isSafety(p.role),true);assert.equal(p.safetyTurns,1);
});

test('even the only connected user gets a full 600 active seconds off after three catches',()=>{
  const r=room(),p=enter(r);appoint(r,p);const endedAt=complete(r,p);
  assert.equal(p.eligibleAfter,endedAt+600);assert.equal(r.players.size,1);
  advance(r,15);
  for(const elapsed of [90,300,599,600-TICK]){
    p.activeSeconds=endedAt+elapsed;step(r,0);
    assert.equal(p.role,'visitor',`cannot assign again after only ${elapsed} active seconds`);
    assert.equal(p.safetyTurns,1);
  }
  step(r);assert.equal(p.activeSeconds,endedAt+600);assert.equal(isSafety(p.role),true);assert.equal(p.safetyTurns,2);
  assert.equal(p.safetyCaughtIds.size,0,'the next duty starts with new capture progress');
});

test('legacy cooldown is converted once and reconnects or room restarts never extend it again',()=>{
  const writes=[],r=room({onProfileChange:profile=>writes.push(profile)});
  let p=enter(r,'a',{name:'기록보존',civilianName:'기록보존',activeSeconds:150,eligibleAfter:190,safetyTurns:1});
  assert.equal(p.eligibleAfter,700,'the former 100 + 90 deadline becomes 100 + 600');
  assert.equal(writes.at(-1).safetyDutyVersion,2,'migration is saved on join');
  let saved=r.profile(p.id);
  for(let i=0;i<3;i++){
    r.remove(p.id);p=enter(r,'a',saved);saved=r.profile(p.id);
    assert.equal(saved.eligibleAfter,700);assert.equal(saved.activeSeconds,150);assert.equal(saved.safetyDutyVersion,2);
  }
  let restored;
  for(let i=0;i<3;i++){
    restored=room();p=enter(restored,'a',saved);saved=restored.profile(p.id);
    assert.equal(saved.eligibleAfter,700);assert.equal(saved.eligibleAfter-saved.activeSeconds,550);
  }
  advance(restored,15);p.activeSeconds=700-TICK;step(restored,0);assert.equal(p.role,'visitor');
  step(restored);assert.equal(p.activeSeconds,700);assert.equal(isSafety(p.role),true);
});

test('new and already converted profiles keep their own cooldown deadline',()=>{
  for(const [saved,expected] of [
    [{activeSeconds:100,eligibleAfter:0},0],
    [{activeSeconds:150,eligibleAfter:700,safetyDutyVersion:2},700],
    [{activeSeconds:150,eligibleAfter:190,safetyDutyVersion:1},700],
    [{activeSeconds:1000,eligibleAfter:190},700]
  ]){
    const r=room(),p=enter(r,'a',saved);assert.equal(p.eligibleAfter,expected);assert.equal(r.profile(p.id).safetyDutyVersion,2);
    if(saved.activeSeconds===1000){advance(r,15);assert.equal(isSafety(p.role),true,'elapsed historical cooldown is not restarted at login');}
  }
});

test('finishing safety duty preserves nickname, scores, purchased items and chip balance through reconnect',()=>{
  const r=room(),p=enter(r,'a',{name:'기록보존',civilianName:'기록보존',brokenCount:42,repairedCount:8});
  assert.equal(r.command(p.id,'purchase',{itemId:'helmet-white'}).ok,true);
  const before=r.profile(p.id),position={x:p.x,y:p.y,z:p.z};
  appoint(r,p);complete(r,p);const after=r.profile(p.id);
  for(const key of ['id','name','civilianName','brokenCount','repairedCount','wallet','nicknameChoiceVersion','nicknameChoiceKind','titlePreference']){
    assert.deepEqual(after[key],before[key],`${key} survives duty completion`);
  }
  assert.deepEqual({x:p.x,y:p.y,z:p.z},position);assert.equal(after.wallet.chips,84);assert.ok(after.wallet.owned.includes('helmet-white'));
  const next=room();enter(next,p.id,after);const reloaded=next.profile(p.id);
  for(const key of ['id','name','civilianName','brokenCount','repairedCount','wallet','eligibleAfter','safetyDutyVersion']){
    assert.deepEqual(reloaded[key],after[key],`${key} survives reconnect`);
  }
});

test('handover selects another eligible user instead of the recent guard still resting',()=>{
  const r=room(),recent=enter(r,'a'),other=enter(r,'b',null,30);
  appoint(r,recent);complete(r,recent);
  other.activeSeconds=300;other.safetyTurns=5;
  advance(r,15-TICK);assert.equal(other.role,'visitor','the fifteen-second handover remains in effect');
  step(r);assert.equal(isSafety(other.role),true);assert.equal(recent.role,'visitor');
  assert.ok(recent.activeSeconds<recent.eligibleAfter);assert.equal(recent.safetyTurns,1);
  assert.equal([...r.players.values()].filter(p=>isSafety(p.role)).length,1);
});
