import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {bays,isBlocked} from '../src/layout.js';
import {createSafetyPatrols,canCatch,isEventBay} from '../src/safety-team.js';
import {isRestArea,SAFETY_CLEARANCE} from '../src/rest-area.js';
const stamp=s=>Date.parse('2026-11-04T'+s+'+09:00');
const request=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
function fixture(at=stamp('17:00:00')){let time=at;const room=createRoom({now:()=>time,random:()=>.42});return {room,set:at=>time=at};}

test('manual bay bypasses population/cooldown once, protects 20 tools and preserves request receipt across restart',()=>{
  const f=fixture(),r=f.room,s=r.worldEvents.checkpoint();s.nextBayAt=stamp('19:00:00');r.worldEvents.restore(s);
  for(const m of bays[7].machines)r.destruction.trigger(m.id);
  const first=r.worldEvents.startManual('bay',request(1)),b=r.worldEvents.view().bay;
  assert.equal(first.ok,true);assert.equal(b.phase,'preparing');assert.equal(b.remaining,20);assert.equal(b.startsAt-b.announcedAt,60000);assert.equal(b.endsAt-b.startsAt,60000);
  assert.ok(r.safety.people.every(g=>g.avoidBayId===b.bayId));assert.equal(r.worldEvents.startManual('bay',request(2)).status,409);
  f.set(b.startsAt);r.worldEvents.update();r.destruction.trigger(bays[b.bayId].machines[0].id);
  assert.equal(r.worldEvents.startManual('bay',request(1)).replayed,true);assert.equal(r.worldEvents.view().bay.remaining,19);
  assert.equal(r.worldEvents.startManual('golden',request(1)).status,409);
  const next=fixture(b.endsAt+1);next.room.worldEvents.restore(r.worldEvents.checkpoint());next.room.worldEvents.update();
  assert.equal(next.room.worldEvents.startManual('bay',request(1)).event.id,first.event.id);
  const second=next.room.worldEvents.startManual('bay',request(2));assert.equal(second.ok,true);assert.notEqual(second.event.id,first.event.id);assert.notEqual(second.event.bayId,first.event.bayId);
});

test('manual golden event has 20 carriers for ten minutes and leaves the four regular slots unchanged',()=>{
  const f=fixture(),r=f.room,slot=r.worldEvents.checkpoint().lastGoldenSlot;
  const result=r.worldEvents.startManual('golden',request(3)),g=r.worldEvents.view().golden;
  assert.equal(result.ok,true);assert.equal(g.total,20);assert.equal(g.endsAt-g.startsAt,600000);assert.equal(r.worldEvents.checkpoint().lastGoldenSlot,slot);
  assert.equal(r.worldEvents.startManual('golden',request(3)).replayed,true);assert.equal(r.worldEvents.view().golden.id,g.id);
  assert.equal(r.worldEvents.startManual('bay',request(4)).status,409);
  f.set(g.endsAt);r.worldEvents.update();assert.equal(r.worldEvents.view().golden,null);
  f.set(stamp('20:00:00'));r.worldEvents.update();assert.equal(r.worldEvents.view().golden.startsAt,stamp('20:00:00'));assert.equal(r.worldEvents.view().golden.total,20);
});

test('manual starts cannot overlap a scheduled golden slot, another event or invalid input',()=>{
  for(const kind of ['bay','golden']){const f=fixture(stamp('19:58:01'));assert.equal(f.room.worldEvents.startManual(kind,request(5)).status,409);assert.equal(f.room.worldEvents.view().bay,null);}
  const f=fixture(stamp('19:50:00')),r=f.room;assert.equal(r.worldEvents.startManual('golden',request(6)).ok,true);
  f.set(stamp('20:00:00'));r.worldEvents.update();assert.equal(r.worldEvents.view().golden.startsAt,stamp('20:00:00'));assert.equal(r.worldEvents.startManual('golden',request(7)).status,409);
  assert.equal(r.worldEvents.startManual('other',request(7)).status,400);assert.equal(r.worldEvents.startManual('bay','bad').status,400);
  const b=fixture();b.room.worldEvents.startManual('bay',request(8));assert.equal(b.room.worldEvents.startManual('golden',request(9)).status,409);
});

test('all patrols leave event bays, reject stale paths and cannot chase or catch across the protected boundary',()=>{
  for(const id of [0,8,9,17]){
    const bay=bays[id],s=createSafetyPatrols({random:()=>.42});
    s.people.forEach((g,i)=>Object.assign(g,{x:bay.x+(i-2)*3,z:bay.z,path:[{x:bay.x,z:bay.z+1}]}));s.setEventBay(id);
    const target={id:'visitor:test',x:bay.x-27.4,z:bay.z+1,role:'visitor',phase:'idle',safeUntil:0};
    for(let n=0;n<160;n++){if(n===40)s.people[0].path=[target];s.update(.05,[target],n*.05);for(const g of s.people){assert.equal(isEventBay(g,id,SAFETY_CLEARANCE),false);assert.equal(isRestArea(g,SAFETY_CLEARANCE),false);assert.equal(isBlocked(g.x,g.z,.295),false);assert.notEqual(g.chasingId,target.id);}}
    const guard={id:'safety:0',role:'safety-red',x:target.x-.4,z:target.z,avoidBayId:id};
    assert.equal(canCatch(guard,target,100),false);assert.equal(canCatch({...guard,id:'visitor:guard'},target,100),true);
    s.setEventBay(null);assert.ok(s.people.every(g=>g.avoidBayId===undefined));assert.equal(canCatch({...guard,avoidBayId:undefined},target,100),true);
  }
});
