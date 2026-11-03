import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {REPAIR_STOCK} from '../src/residents.js';
import {machines,bays} from '../src/layout.js';
import {getEmoApproach} from '../src/emo-interaction.js';

function fixture(ids=[]){
  const room=createRoom({random:()=>0});for(const p of room.residents.people)p.wait=1e9;
  for(const id of ids)room.destruction.trigger(id);
  return room;
}
function think(room,seconds=1.6){for(let t=0;t<seconds;t+=.05)room.residents.update(.05);}
function activate(room,role){const people=room.residents.people.filter(p=>p.role===role);for(const p of people)p.wait=0;return people;}

test('breakers distribute simultaneous destinations across bays with the least damage',()=>{
  const r=fixture(Array.from({length:40},(_,i)=>i)),breakers=activate(r,'breaker');think(r);
  const targets=breakers.map(p=>p.targetId);assert.equal(targets.filter(id=>id!==null).length,13);
  const chosenBays=targets.map(id=>machines[id].bayId);assert.ok(chosenBays.every(id=>id>=2));
  assert.equal(new Set(chosenBays).size,13,'pending work is counted so breakers do not all choose the same bay');
});
test('pending breaker claims stop the 60 tool buffer from being overbooked',()=>{
  const r=fixture(Array.from({length:59},(_,i)=>i)),breakers=activate(r,'breaker');think(r);
  assert.equal(breakers.filter(p=>p.targetId!==null).length,1);
});
test('NPCs reserve fifty broken tools for visitors and count repair work already assigned',()=>{
  for(const count of [50,51]){
    const r=fixture(Array.from({length:count},(_,i)=>i)),repairers=activate(r,'repairer');think(r);
    assert.equal(repairers.filter(p=>p.targetId!==null).length,count-50);
  }
});
test('simultaneous NPC repair completions cannot reduce the remaining stock below fifty',()=>{
  const r=fixture(Array.from({length:51},(_,i)=>i)),repairers=activate(r,'repairer');
  repairers.forEach((p,id)=>{p.phase='repair';p.targetId=id;p.time=7;p.path=[];assert.equal(r.destruction.beginRepair(id,p.id),true);});
  r.residents.update(.05);assert.equal(r.destruction.state.destroyedIds.length,50);assert.equal(r.residents.state.actions.repairs,1);
  assert.equal(repairers.reduce((sum,p)=>sum+p.repairedCount,0),1,'only a completed repair gets a score');
});
test('a visitor repair remains allowed at the floor and keeps its normal reward',()=>{
  const r=fixture(Array.from({length:50},(_,i)=>i));r.join('visitor:repair');
  const destination=getEmoApproach(machines[0]).destination;
  r.pose('visitor:repair',{...destination,y:0,heading:0,speed:0,posture:'stand',hidden:false});
  assert.equal(r.command('visitor:repair','claim',{id:0,kind:'repair'}).ok,true);
  assert.equal(r.command('visitor:repair','repair',{id:0}).ok,true);
  for(let i=0;i<101;i++)r.step(.05);
  assert.equal(r.command('visitor:repair','finish',{id:0}).ok,true);
  assert.equal(r.players.get('visitor:repair').repairedCount,1);assert.equal(r.wallet('visitor:repair').chips,3);
  assert.equal(r.destruction.state.destroyedIds.length,49);
});
test('NPCs leave a newly repaired tool alone for forty five seconds',()=>{
  const r=fixture([0]),actor=r.residents.people.find(p=>p.role==='breaker');
  Object.assign(actor,getEmoApproach(machines[0]).destination);r.residents.update(.05);
  r.destruction.reset(0);actor.wait=0;think(r);assert.notEqual(actor.targetId,0);
  r.residents.yieldMachine(actor.targetId);actor.wait=1e9;
  for(let n=0;n<460;n++)r.residents.update(.1);
  Object.assign(actor,getEmoApproach(machines[0]).destination);actor.wait=0;think(r);
  assert.equal(actor.targetId,0,'the grace period does not remove the tool permanently');
});
test('a visitor equipment claim takes priority over replenishment',()=>{
  const r=fixture();r.join('visitor:claim');assert.equal(r.command('visitor:claim','claim',{id:0,kind:'emo'}).ok,true);
  const breakers=activate(r,'breaker');think(r);assert.ok(breakers.every(p=>p.targetId!==0));
  const target=breakers.find(p=>p.targetId!==null);assert.equal(r.command('visitor:claim','claim',{id:target.targetId,kind:'emo'}).ok,true);
  assert.equal(target.targetId,null);
});
test('refilling from eighteen damaged tools reaches the reserve with ordinary NPC walks and EMO presses',()=>{
  let seed=1537;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
  const r=createRoom({random});for(const b of bays)r.destruction.trigger(b.machines[0].id);
  let firstFloor=null,minAfterFloor=Infinity,max=0;
  for(let i=0;i<3000;i++){
    r.step(.1);const n=r.destruction.state.destroyedIds.length;max=Math.max(max,n);
    if(n>=REPAIR_STOCK.minimum&&firstFloor===null)firstFloor=r.time;
    if(firstFloor!==null)minAfterFloor=Math.min(minAfterFloor,n);
  }
  assert.ok(firstFloor!==null&&firstFloor<180,`refill time ${firstFloor}`);assert.ok(minAfterFloor>=50);assert.ok(max<=60);
  const distribution=bays.map(b=>b.machines.filter(m=>r.destruction.isDestroyed(m.id)).length);
  assert.ok(distribution.every(n=>n>=1));assert.ok(Math.max(...distribution)-Math.min(...distribution)<=3,JSON.stringify(distribution));
  assert.ok(r.residents.state.actions.breaks>=32);assert.equal(r.players.size,0);
});
