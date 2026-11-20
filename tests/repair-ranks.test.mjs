import test from 'node:test';
import assert from 'node:assert/strict';
import {repairRank,nextRepairRank,REPAIR_RANKS} from '../src/repair-ranks.js';
import {createRoom} from '../server/room-engine.js';
import {actorFromPacket} from '../src/shared-protocol.js';
import {machines} from '../src/layout.js';
import {getEmoApproach} from '../src/emo-interaction.js';
const owner='visitor:'+'a'.repeat(64),guest='visitor:'+'b'.repeat(64);
test('repair promotions use approved lifetime thresholds and cap at president',()=>{
  assert.deepEqual(REPAIR_RANKS.map(r=>[r.count,r.name]),[[0,'인턴'],[20,'사원'],[100,'선임'],[250,'대리'],[500,'책임'],[1000,'수석'],[2000,'팀장'],[4000,'상무'],[6000,'전무'],[10000,'부사장'],[20000,'사장']]);
  for(let i=1;i<REPAIR_RANKS.length;i++){
    const rank=REPAIR_RANKS[i];assert.equal(repairRank(rank.count-1),REPAIR_RANKS[i-1]);
    assert.equal(nextRepairRank(rank.count-1),rank);assert.equal(repairRank(rank.count),rank);
  }
  for(const value of [undefined,-1,NaN,Infinity,'20000',1.2])assert.equal(repairRank(value).name,'인턴');
  assert.equal(repairRank(1e6).name,'사장');assert.equal(nextRepairRank(20000),null);
});
test('legacy repairs determine rank without profile changes; only authenticated owner is chairman',()=>{
  const room=createRoom({ownerId:owner});room.join(owner,{repairedCount:0});
  room.join(guest,{name:'FAB짱 세미',repairedCount:20000,brokenCount:20000,chipUnlimited:true,titlePreference:'operator'});
  const before=structuredClone(room.profile(guest));
  for(const id of [owner,guest]){
    const state=room.titleState(id),peer=actorFromPacket(room.snapshot(true).people.find(p=>p[0]===id));
    assert.equal(repairRank(state.repairedCount,state.operator).name,id===owner?'회장':'사장');
    assert.equal(repairRank(peer.repairedCount,peer.titleId==='operator').name,id===owner?'회장':'사장');
  }
  assert.deepEqual(room.profile(guest),before);
  room.pose(guest,{x:0,y:0,z:45,heading:0,repairedCount:999999,titleId:'operator'});
  room.command(guest,'title-select',{preference:'operator',operator:true});
  assert.equal(room.titleState(guest).operator,false);
  assert.equal(room.titleState(guest).repairedCount,20000);
  assert.deepEqual(room.profile(guest).wallet,before.wallet);
  const restored=createRoom();restored.join(guest,before);
  assert.equal(repairRank(restored.titleState(guest).repairedCount).name,'사장');
  assert.deepEqual(restored.wallet(guest),room.wallet(guest));
});
test('successful repair crossing 500 promotes locally and for peers once, without extra chip rewards',()=>{
  const room=createRoom();room.join(guest,{repairedCount:499,brokenCount:3000});
  for(const p of [...room.residents.people,...room.safety.people]){p.hidden=true;p.wait=1e9;}
  const m=machines[350],destination=getEmoApproach(m).destination;
  room.pose(guest,{x:destination.x,y:0,z:destination.z,heading:0,posture:'stand',hidden:false});
  assert.equal(room.command(guest,'claim',{id:m.id,kind:'emo'}).ok,true);
  assert.equal(room.command(guest,'press',{id:m.id}).ok,true);
  for(let i=0;i<16;i++)room.step(.05);
  assert.equal(room.command(guest,'explode',{id:m.id}).ok,true);
  const wallet=room.wallet(guest),broken=room.profile(guest).brokenCount;
  assert.equal(room.command(guest,'claim',{id:m.id,kind:'repair'}).ok,true);
  assert.equal(room.command(guest,'repair',{id:m.id}).ok,true);
  assert.equal(room.command(guest,'finish',{id:m.id}).ok,false);
  assert.equal(repairRank(room.titleState(guest).repairedCount).name,'대리');
  for(let i=0;i<100;i++)room.step(.05);
  assert.equal(room.command(guest,'finish',{id:m.id}).ok,true);
  assert.equal(room.command(guest,'finish',{id:m.id}).ok,false);
  const state=room.titleState(guest),peer=actorFromPacket(room.snapshot(true).people.find(p=>p[0]===guest));
  assert.equal(state.repairedCount,500);assert.equal(peer.repairedCount,500);
  assert.equal(repairRank(state.repairedCount).name,'책임');
  assert.equal(room.wallet(guest).chips,wallet.chips+3);assert.equal(room.profile(guest).brokenCount,broken);
  assert.deepEqual(room.wallet(guest).owned,wallet.owned);
});
