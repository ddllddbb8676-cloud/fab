import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {createProfileStore} from '../server/player-profiles.js';
import {bays,isBlocked} from '../src/layout.js';
import {canCatch} from '../src/safety-team.js';
import {eventPresentation,victoryPresentation} from '../src/world-events-ui.js';
const id=n=>'visitor:'+n.toString(16).padStart(64,'0');
const request='00000000-0000-0000-0000-000000000123';
function fixture(at=Date.parse('2026-11-04T21:00:00+09:00'),options={}){
 let time=at;const room=createRoom({random:()=>.42,now:()=>time,...options});room.residents.update=()=>{};room.safety.update=()=>{};
 return {room,set:t=>time=t,join(n,saved){assert.equal(room.join(id(n),saved).ok,true);Object.assign(room.players.get(id(n)),{hidden:false,x:0,z:50,safeUntil:1e9});},start(bayCount=2){room.worldEvents.startManual('bay',request,bayCount);const b=room.worldEvents.view().bay;time=b.startsAt;room.worldEvents.update();return b;},clear(){const b=room.worldEvents.view().bay;for(const m of bays[b.bayId].machines)assert.equal(room.destruction.trigger(m.id),true);room.worldEvents.update();return room.worldEvents.view();}};
}
test('two cleared bays pay 400 within the original sixty seconds, select unvisited tools and expose an immediate travel button',()=>{
 const f=fixture(),r=f.room;f.join(1);f.join(2);f.join(3);const b=f.start();f.set(b.startsAt+38000);const one=f.clear();
 assert.equal(one.lastResult.clearedCount,1);assert.equal(one.bay.round,2);assert.equal(one.bay.startsAt,b.startsAt);assert.equal(one.bay.endsAt,b.endsAt);assert.equal(one.bay.remaining,20);assert.notEqual(one.bay.bayId,b.bayId);
 assert.equal(r.wallet(id(1)).chips,200);assert.equal(r.wallet(id(1)).eventSeriesChips,200);
 assert.match(eventPresentation(one,one.serverNow).button,/다음 베이로 바로 가기/);assert.match(eventPresentation(one,one.serverNow).bay,/0:22/);
 const before=r.profile(id(1)),move=r.command(id(1),'bay-travel',{eventId:b.id,x:999,z:999});assert.equal(move.ok,true);assert.equal(move.eventTravel.bayId,one.bay.bayId);assert.equal(isBlocked(move.eventTravel.x,move.eventTravel.z,.295),false);assert.deepEqual(r.profile(id(1)).wallet,before.wallet);
 f.set(b.startsAt+59000);const two=f.clear();assert.equal(two.lastResult.clearedCount,2);assert.equal(two.bay.endsAt,b.endsAt);assert.equal(two.bay.remaining,0);assert.equal(two.bay.phase,'success');assert.equal(two.lastResult.next,undefined);assert.equal(eventPresentation(two,two.serverNow).button,'');
 for(let n=1;n<=3;n++){assert.equal(r.wallet(id(n)).chips,400);assert.equal(r.wallet(id(n)).eventSeriesChips,400);}
 f.set(b.endsAt);r.worldEvents.update();assert.equal(r.worldEvents.view().bay.phase,'success');assert.equal(r.worldEvents.view().bay.clearedCount,2);assert.equal(r.command(id(1),'bay-travel',{eventId:b.id}).ok,false);assert.equal(r.wallet(id(1)).chips,400);
});
test('an unfinished bonus bay or exact deadline never removes the first award or grants another',()=>{
 const f=fixture(),r=f.room;f.join(1);const b=f.start();f.set(b.startsAt+50000);const one=f.clear();
 for(const m of bays[one.bay.bayId].machines.slice(0,19))r.destruction.trigger(m.id);
 f.set(b.endsAt);r.destruction.trigger(bays[one.bay.bayId].machines.at(-1).id);r.worldEvents.update();
 assert.equal(r.wallet(id(1)).chips,200);assert.equal(r.worldEvents.view().bay.clearedCount,1);
});
test('late arrivals receive only wins while connected, with an accurate personal total and no replay on reconnect',()=>{
 const f=fixture(),r=f.room;f.join(1);const b=f.start();f.set(b.startsAt+20000);f.clear();f.join(2);f.set(b.startsAt+40000);const two=f.clear();
 assert.equal(r.wallet(id(1)).chips,400);assert.equal(r.wallet(id(2)).chips,200);
 const p=victoryPresentation(two.lastResult,r.wallet(id(2)));assert.equal(p.total,400);assert.equal(p.personal,200);assert.equal(p.title,'더블 클리어!');
 const saved=r.profile(id(2));r.remove(id(2));f.join(2,saved);r.worldEvents.update();assert.equal(r.wallet(id(2)).chips,200);
});
test('second award and completion commit together; restart preserves the shared deadline and never repeats rewards',async()=>{
 const records=new Map(),batches=[],storage={get:async k=>structuredClone(records.get(k)),put:async rows=>{batches.push(structuredClone(rows));for(const [k,v]of Object.entries(rows))records.set(k,structuredClone(v));},list:async()=>new Map(),delete:async k=>records.delete(k)};
 const profiles=createProfileStore(storage),options={onProfileChange:p=>profiles.save(p),onEquipmentChange:s=>profiles.saveEquipment(s),onEventsChange:s=>profiles.saveEvents(s),onFoupChange:s=>profiles.saveFoups(s)};
 const f=fixture(undefined,options),r=f.room;f.join(1);profiles.saveFoups(r.store.checkpoint());const b=f.start();f.set(b.startsAt+20000);f.clear();await profiles.flush();f.set(b.startsAt+40000);f.clear();await profiles.flush();
 const batch=batches.at(-1);assert.equal(batch['world:events:v1'].lastResult.clearedCount,2);assert.equal(batch['profile:'+id(1)].wallet.chips,400);assert.ok(batch['world:equipment:v1']);assert.ok(Object.keys(batch).length<=128);
 const next=fixture(b.startsAt+41000);next.room.restoreEquipment(await profiles.getEquipment());next.room.restoreFoups(await profiles.getFoups());next.room.worldEvents.restore(await profiles.getEvents());next.join(1,await profiles.get(id(1)));next.room.worldEvents.update();
 assert.equal(next.room.wallet(id(1)).chips,400);assert.equal(next.room.worldEvents.view().bay.endsAt,b.endsAt);assert.equal(next.room.worldEvents.view().bay.round,2);assert.equal(next.room.worldEvents.view().bay.phase,'success');
 next.set(b.endsAt+1);next.room.worldEvents.update();assert.equal(next.room.wallet(id(1)).chips,400);
});
test('safety NPCs avoid both the newly active bay and the just-cleared celebration bay',()=>{
 const f=fixture(),r=f.room;f.join(1);const b=f.start();f.set(b.startsAt+40000);const one=f.clear();
 const guard=r.safety.people[0];assert.deepEqual(new Set(guard.avoidBayIds),new Set([b.bayId,one.bay.bayId]));
 for(const bayId of guard.avoidBayIds){const point={x:bays[bayId].x,z:bays[bayId].z-5,role:'visitor',phase:'idle',safeUntil:0};assert.equal(canCatch({...guard,...point,role:'safety-red'},point,1000),false);}
 f.set(b.startsAt+51000);r.worldEvents.update();assert.deepEqual(guard.avoidBayIds,[one.bay.bayId]);
});
test('one shared deadline protects the regular golden slot even with multiple clears',()=>{
 const f=fixture(Date.parse('2026-11-04T19:58:00+09:00')),r=f.room;f.join(1);const b=f.start();f.set(b.startsAt+20000);f.clear();f.set(b.startsAt+40000);f.clear();
 f.set(b.endsAt);r.worldEvents.update();assert.equal(r.worldEvents.view().bay,null);assert.ok(r.worldEvents.view().golden);assert.equal(r.wallet(id(1)).chips,400);assert.equal(r.worldEvents.view().golden.total,20);
});
test('malformed clear histories are rejected and old checkpoints remain readable',()=>{
 const f=fixture();f.join(1);const b=f.start(),s=f.room.worldEvents.checkpoint();delete s.bay.round;delete s.bay.clearedCount;delete s.bay.clearedBayIds;delete s.bay.seriesId;delete s.bay.bayLimit;delete s.lastResult;
 const old=fixture(b.startsAt+1000);old.room.worldEvents.restore(s);old.room.worldEvents.update();old.join(1);old.clear();assert.equal(old.room.wallet(id(1)).chips,200);
 const invalid=structuredClone(s);invalid.bay.clearedCount=2;invalid.bay.clearedBayIds=[1,1];assert.throws(()=>f.room.worldEvents.restore(invalid));
});
test('success visuals distinguish single and double with exact total rewards',()=>{
 const one=victoryPresentation({clearedCount:1}),two=victoryPresentation({clearedCount:2});
 assert.equal(one.total,200);assert.equal(two.total,400);assert.notEqual(one.theme,two.theme);assert.match(two.title,/더블/);
});
test('single mode retains the original one-bay finish and manual request IDs cannot switch modes',()=>{
 const f=fixture(),r=f.room;f.join(1);const b=f.start(1);assert.equal(r.worldEvents.startManual('bay',request,2).status,409);assert.equal(r.worldEvents.startManual('bay',request,1).replayed,true);
 const done=f.clear();assert.equal(done.bay.phase,'success');assert.equal(done.bay.bayLimit,1);assert.equal(done.bay.bayId,b.bayId);assert.equal(done.lastResult.next,undefined);assert.equal(r.wallet(id(1)).chips,200);assert.equal(r.worldEvents.travel(b.id),null);
 assert.equal(r.worldEvents.startManual('bay',request,3).status,400);assert.equal(r.worldEvents.startManual('bay',request,'2').status,400);
});
