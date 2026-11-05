import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {bays,isBlocked} from '../src/layout.js';
import {isEventBay} from '../src/safety-team.js';
const request='00000000-0000-0000-0000-000000000aab';
function setup(){let at=Date.parse('2026-11-05T17:00:00+09:00');const room=createRoom({now:()=>at,random:()=>.42});return {room,set:t=>at=t,step(dt=.1){at+=dt*1000;room.step(dt);}};}
test('every NPC role leaves the announced bay immediately, all paths avoid it, and broken tools stay broken',()=>{
  const f=setup(),r=f.room;
  r.worldEvents.startManual('bay',request);const b=r.worldEvents.view().bay,bay=bays[b.bayId];
  const actors=[...r.residents.people,...r.safety.people];
  // Force every role, including resting/OHT passengers, into the event bay.
  for(const p of actors)Object.assign(p,{x:bay.x,z:bay.z,path:[{x:bay.x,z:bay.z}],time:8});
  for(const p of r.residents.people.filter(p=>p.role==='repairer')){p.targetId=bay.machines[0].id;p.phase='repair';r.destruction.trigger(p.targetId);r.destruction.beginRepair(p.targetId,p.id);}
  f.step();
  assert.ok(actors.every(p=>!isEventBay(p,bay.id,.32)));
  f.set(b.startsAt);f.step();assert.ok(bay.machines.every(m=>!r.destruction.isDestroyed(m.id)));
  const damaged=bay.machines.slice(0,19);for(const m of damaged)r.destruction.trigger(m.id);
  const before=r.residents.state.actions;
  for(let i=0;i<90;i++){
    f.step();assert.ok(actors.every(p=>!isEventBay(p,bay.id,.32)),`NPC entered at tick ${i}`);
    assert.ok(damaged.every(m=>r.destruction.isDestroyed(m.id)),'NPC cannot repair event tools');
  }
  assert.ok(actors.filter(p=>p.y===0).every(p=>!isBlocked(p.x,p.z,.2)));
  assert.ok(r.residents.state.actions.repairs>=before.repairs);
});
test('second bay and success view stay clear, restrictions restore after restart and end without changing users',()=>{
  const f=setup(),r=f.room,id='visitor:'+'a'.repeat(64);r.join(id,{brokenCount:7,repairedCount:2,hasEntered:true,optOut:true});
  const before=r.profile(id);r.worldEvents.startManual('bay',request,2);const b=r.worldEvents.view().bay;
  f.set(b.startsAt);f.step();for(const m of bays[b.bayId].machines)r.destruction.trigger(m.id);f.step();
  const second=r.worldEvents.view().bay;assert.equal(second.round,2);assert.notEqual(second.bayId,b.bayId);
  const saved=r.worldEvents.checkpoint(),restored=setup();restored.set(second.startsAt+1000);restored.room.worldEvents.restore(saved);restored.step();
  for(const id of [b.bayId,second.bayId])assert.ok([...restored.room.residents.people,...restored.room.safety.people].every(p=>!isEventBay(p,id,.32)));
  for(const m of bays[second.bayId].machines)r.destruction.trigger(m.id);f.step();assert.equal(r.worldEvents.view().bay.phase,'success');
  for(let i=0;i<50;i++)f.step();assert.ok([...r.residents.people,...r.safety.people].every(p=>!isEventBay(p,second.bayId,.32)));
  const after=r.profile(id);assert.equal(after.brokenCount,before.brokenCount);assert.equal(after.repairedCount,before.repairedCount);assert.equal(after.wallet.chips,before.wallet.chips+400);
  f.set(second.endsAt+12000);f.step();assert.equal(r.worldEvents.bayRunning(),false);
  // Residents may again use a formerly forbidden bay.
  const actor=r.residents.people.find(p=>p.role==='resting');Object.assign(actor,{x:bays[second.bayId].x,z:bays[second.bayId].z,y:0});f.step();assert.equal(actor.x,bays[second.bayId].x);
});
