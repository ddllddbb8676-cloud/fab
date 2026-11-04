import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoom} from '../server/room-engine.js';
import {createProfileStore} from '../server/player-profiles.js';
import {EVENT_RULES,goldenSlot,nextGoldenSlot} from '../server/world-events.js';
import {bays,ports,isBlocked} from '../src/layout.js';
import {stockerById} from '../src/stocker-layout.js';
import {foupFromPacket,foupPacket,initialSharedPorts} from '../src/shared-protocol.js';
import {createFoupStore,createFoupRenderer} from '../src/foup-play.js';
import {eventPresentation} from '../src/world-events-ui.js';
import {bayTopFrame,createEventCamera} from '../src/event-camera.js';
import {getEmoApproach} from '../src/emo-interaction.js';
const stamp=s=>Date.parse('2026-11-04T'+s+'+09:00'),id=n=>'visitor:'+n.toString(16).padStart(64,'0');
function make({at=stamp('17:00:00'),count=1,...options}={}){
  let time=at;const room=createRoom({now:()=>time,random:()=>.42,...options});
  room.residents.update=()=>{};room.safety.update=()=>{};
  for(const g of room.safety.people)g.hidden=true;
  for(let i=1;i<=count;i++){room.join(id(i));room.players.get(id(i)).safeUntil=1e9;move(room,id(i),{x:0,z:50});}
  return {r:room,set:t=>time=t,advance(seconds){for(let n=0;n<Math.ceil(seconds/.05);n++){time+=50;for(const p of room.players.values())p.lastSeen=room.time;room.step(.05);}},tick(){for(const p of room.players.values())p.lastSeen=room.time;room.step(.05);}};
}
function move(r,who,p){assert.equal(r.pose(who,{...p,y:0,heading:0,speed:0,posture:'stand',hidden:false}),true);}
function golden(r){return [...r.store.records.values()].filter(r=>r.gold);}
function pickup(r,who,item){move(r,who,item);assert.equal(r.command(who,'pickup',{id:item.id}).ok,true);}
function disk(){const records=new Map(),batches=[];return {records,batches,storage:{get:async k=>structuredClone(records.get(k)),put:async rows=>{batches.push(structuredClone(rows));for(const [k,v]of Object.entries(rows))records.set(k,structuredClone(v));},list:async()=>new Map(),delete:async k=>records.delete(k)}};}

test('gold hunt uses four Korean slots, exact ten-minute intervals, and no late catch-up',()=>{
  for(const hour of ['08','12','16','20']){
    const start=stamp(hour+':00:00');assert.equal(goldenSlot(start-1),null);assert.equal(goldenSlot(start),start);assert.equal(goldenSlot(start+599999),start);assert.equal(goldenSlot(start+600000),null);
  }
  assert.equal(nextGoldenSlot(stamp('20:10:00')),Date.parse('2026-11-05T08:00:00+09:00'));
  const f=make({at:stamp('08:09:55')});f.tick();assert.equal(golden(f.r).length,20);assert.equal(f.r.snapshot().worldEvents.golden.endsAt,stamp('08:10:00'));
  f.set(stamp('08:10:00'));f.tick();assert.equal(golden(f.r).length,0);assert.equal(f.r.snapshot().worldEvents.golden,null);
});
test('twenty shared gold carriers cover all bays without taking held or broken objects',()=>{
  const f=make({at:stamp('07:59:50'),count:2}),r=f.r;
  const held=[...r.store.records.values()].find(r=>r.original);pickup(r,id(1),held);
  const before=[...r.store.records.keys()].sort();f.set(stamp('08:00:00'));f.tick();
  assert.equal(golden(r).length,20);assert.equal(r.store.getCarried(id(1)).id,held.id);assert.equal(held.gold,undefined);
  assert.deepEqual([...r.store.records.keys()].sort(),before);
  assert.equal(new Set(golden(r).map(r=>bays.reduce((a,b)=>Math.hypot(a.x-r.x,a.z-r.z)<Math.hypot(b.x-r.x,b.z-r.z)?a:b).id)).size,18);
  for(const item of golden(r)){assert.equal(isBlocked(item.x,item.z,.295),false);assert.equal(r.store.pickup(item.id,'resident:0'),false);}
  const firstIds=golden(r).map(r=>r.id);f.advance(1);assert.deepEqual(golden(r).map(r=>r.id),firstIds);
});
test('gold IN deposits pay 200 once and cannot be withdrawn to farm rewards',()=>{
  const f=make({at:stamp('12:00:00')}),r=f.r;f.tick();const item=golden(r)[0];pickup(r,id(1),item);
  const port=stockerById.get('STK01').ports.find(p=>p.kind==='IN');
  assert.equal(r.command(id(1),'stocker',{id:'STK01',port:'IN',recordId:item.id}).ok,false,'requires reaching IN');
  move(r,id(1),port.approach);const result=r.command(id(1),'stocker',{id:'STK01',port:'IN',recordId:item.id});
  assert.equal(result.phase,'golden-deposit');assert.equal(r.wallet(id(1)).chips,200);assert.equal(item.mode,'cleared');assert.equal(item.gold,null);
  assert.equal(r.command(id(1),'stocker',{id:'STK01',port:'IN',recordId:item.id}).ok,false);
  assert.equal(r.wallet(id(1)).chips,200);assert.equal(r.snapshot().worldEvents.golden.remaining,19);
});
test('a shattering gold throw pays 50, a completed exclusive cleanup pays 10, and neither stacks ordinary rewards',()=>{
  const f=make({at:stamp('16:00:00'),count:2}),r=f.r;f.tick();const item=golden(r)[0];pickup(r,id(1),item);move(r,id(1),{x:0,z:50});
  assert.equal(r.command(id(1),'throw',{}).ok,true);assert.equal(r.wallet(id(1)).chips,50);f.advance(4);
  assert.equal(item.mode,'broken');assert.ok(item.gold.throwPaid);assert.equal(r.command(id(1),'throw',{}).ok,false);
  move(r,id(2),{x:item.x,z:item.z-.7});assert.equal(r.command(id(2),'clean',{id:item.id,breakSeq:item.breakSeq}).ok,true);
  f.advance(3.25);assert.equal(r.wallet(id(2)).chips,10);assert.equal(item.mode,'cleared');assert.equal(item.gold,null);
  assert.equal(r.command(id(2),'clean',{id:item.id,breakSeq:item.breakSeq}).ok,false);assert.equal(r.wallet(id(2)).chips,10);
});
test('gold drops stay intact and unpaid; expiry retains held FOUPs and removes the special reward',()=>{
  const f=make({at:stamp('20:00:00')}),r=f.r;f.tick();const item=golden(r)[0];pickup(r,id(1),item);move(r,id(1),{x:0,z:40});
  r.command(id(1),'throw',{drop:true});f.advance(3);assert.equal(item.mode,'ground');assert.equal(r.wallet(id(1)).chips,0);pickup(r,id(1),item);
  f.set(stamp('20:10:00'));f.tick();assert.equal(r.store.getCarried(id(1)).id,item.id);assert.equal(item.gold,null);
  assert.equal(r.command(id(1),'throw',{}).ok,true);assert.equal(r.wallet(id(1)).chips,1);
});
test('gold checkpoint preserves claims and settles interrupted throws; legacy rows and wire remain compatible',()=>{
  const f=make({at:stamp('12:00:00')}),r=f.r;f.tick();const item=golden(r)[0];pickup(r,id(1),item);r.command(id(1),'throw',{});
  const snapshot=r.store.checkpoint(),next=createFoupStore({ports,initialPortIds:initialSharedPorts});next.restore(snapshot);
  assert.equal(next.records.get(item.id).mode,'broken');assert.equal(next.records.get(item.id).gold.throwPaid,true);
  const legacy=structuredClone(snapshot);delete legacy.golden;next.restore(legacy);assert.equal(golden({store:next}).length,0);
  assert.ok(snapshot.records.every(row=>/^(port:\d{1,3}:\d|vehicle:\d{1,2})$/.test(row[0])));
  const decoded=foupFromPacket(foupPacket(item));assert.equal(decoded.gold.eventId,item.gold.eventId);assert.equal(foupFromPacket(foupPacket(item).slice(0,16)).gold,null);
  next.restore(snapshot);next.synchronize([foupFromPacket(foupPacket({...item,gold:null}))],null);assert.equal(next.records.get(item.id).gold,null,'delta explicitly removes an expired colour');
});
test('15 real connected accounts trigger a minute of preparation; NPCs and verification accounts do not count',()=>{
  const f=make({count:14,eventExcludedIds:[id(15)]}),r=f.r;r.join(id(15));f.tick();assert.equal(r.snapshot().worldEvents.bay,null);
  r.join(id(16));r.players.get(id(1)).role='safety-orange';f.tick();const b=r.snapshot().worldEvents.bay;
  assert.equal(b.phase,'preparing');assert.equal(b.startsAt-b.announcedAt,60000);assert.equal(b.endsAt-b.startsAt,60000);assert.equal(b.total,20);
  assert.equal(r.safety.people.filter(p=>p.eventBayId!==undefined).length,0);assert.ok(r.safety.people.every(p=>p.avoidBayId===b.bayId));assert.equal(r.safety.people.length,4);
});
test('all 20 tools are restored, protected until GO, and the challenge is exactly sixty seconds',()=>{
  const f=make({count:15}),r=f.r;for(const m of bays[7].machines)r.destruction.trigger(m.id);
  f.tick();let b=r.snapshot().worldEvents.bay;assert.equal(b.bayId,7);assert.equal(b.remaining,20);
  for(const m of bays[b.bayId].machines)assert.equal(r.destruction.trigger(m.id),false);
  const m=bays[b.bayId].machines[0];move(r,id(1),getEmoApproach(m).destination);
  assert.equal(r.command(id(1),'claim',{id:m.id,kind:'emo'}).ok,false);
  for(const n of [3,2,1]){f.set(b.startsAt-n*1000);f.tick();const frame=r.snapshot().worldEvents;assert.equal(eventPresentation(frame,frame.serverNow).countdown,String(n));assert.equal(frame.bay.remaining,20);}
  f.set(b.startsAt);f.tick();b=r.snapshot().worldEvents.bay;assert.equal(b.phase,'active');assert.equal(b.remaining,20);
  f.set(b.endsAt-1);f.tick();assert.equal(r.snapshot().worldEvents.bay.phase,'active');
  f.set(b.endsAt);f.tick();assert.equal(r.snapshot().worldEvents.bay.phase,'failed');assert.equal(r.wallet(id(1)).chips,0);
});
test('victory pays every currently connected real account once, including owner, safety and late arrivals',()=>{
  const f=make({count:15,ownerId:id(1),eventExcludedIds:[id(16)]}),r=f.r;r.join(id(16));f.tick();const b=r.snapshot().worldEvents.bay;
  f.set(b.startsAt);f.tick();r.remove(id(15));r.join(id(17));r.players.get(id(2)).role='safety-red';
  for(const m of bays[b.bayId].machines)assert.equal(r.destruction.trigger(m.id),true);f.tick();
  assert.equal(r.snapshot().worldEvents.lastResult.phase,'success');assert.equal(r.snapshot().worldEvents.bay.phase,'success');assert.equal(r.snapshot().worldEvents.bay.round,1);
  for(const who of [...Array.from({length:14},(_,n)=>id(n+1)),id(17)]){assert.equal(r.wallet(who).chips,200);assert.equal(r.wallet(who).lastEventRewardId,b.id);}
  assert.equal(r.wallet(id(16)).chips,0);assert.equal(r.safety.people.filter(p=>p.eventBayId!==undefined).length,0);
  f.advance(1);assert.equal(r.wallet(id(1)).chips,200);
  const saved=r.profile(id(1));r.remove(id(1));r.join(id(1),saved);f.tick();assert.equal(r.wallet(id(1)).chips,200);
});
test('the final accepted destruction before the deadline succeeds immediately with normal 5 chips plus the 200 bonus',()=>{
  const f=make({count:15}),r=f.r;f.tick();const b=r.snapshot().worldEvents.bay;f.set(b.startsAt);f.tick();
  const [last,...other]=bays[b.bayId].machines;for(const m of other)r.destruction.trigger(m.id);
  move(r,id(1),getEmoApproach(last).destination);assert.equal(r.command(id(1),'claim',{id:last.id,kind:'emo'}).ok,true);assert.equal(r.command(id(1),'press',{id:last.id}).ok,true);f.advance(.6);
  f.set(b.endsAt-1);assert.equal(r.command(id(1),'explode',{id:last.id}).ok,true);assert.equal(r.snapshot().worldEvents.lastResult.phase,'success');assert.equal(r.wallet(id(1)).chips,205);
  assert.equal(r.wallet(id(1)).earnedDestructionChips,5);assert.equal(r.players.get(id(1)).brokenCount,1);
});
test('two-hour bay cooldown survives restart and golden hunts take priority, including the two-minute lead-in',()=>{
  const f=make({at:stamp('19:58:01'),count:15}),r=f.r;f.tick();assert.equal(r.snapshot().worldEvents.bay,null);
  f.set(stamp('20:00:00'));f.tick();assert.ok(r.snapshot().worldEvents.golden);assert.equal(r.snapshot().worldEvents.bay,null);
  f.set(stamp('20:09:59'));f.tick();assert.equal(r.snapshot().worldEvents.bay,null);
  f.set(stamp('20:10:00'));f.tick();const b=r.snapshot().worldEvents.bay;assert.equal(b.phase,'preparing');assert.equal(r.snapshot().worldEvents.golden,null);
  const next=make({at:b.startsAt+EVENT_RULES.bayCooldown-1,count:15});next.r.worldEvents.restore(r.worldEvents.checkpoint());next.tick();assert.notEqual(next.r.snapshot().worldEvents.bay?.phase,'preparing');
  next.set(b.startsAt+EVENT_RULES.bayCooldown);next.tick();assert.equal(next.r.snapshot().worldEvents.bay.phase,'preparing');
});
test('event travel only targets the current bay front, preserves identity and penalty, and rejects forged or expired events',()=>{
  const f=make({count:15}),r=f.r;f.tick();const b=r.snapshot().worldEvents.bay,p=r.players.get(id(1)),before=r.profile(id(1));p.penalty=3;
  assert.equal(r.command(id(1),'bay-travel',{eventId:'forged',x:30,z:30}).ok,false);
  const result=r.command(id(1),'bay-travel',{eventId:b.id,x:30,z:30});assert.equal(result.ok,true);assert.equal(isBlocked(result.eventTravel.x,result.eventTravel.z,.295),false);
  assert.equal(p.penalty,3);assert.equal(p.name,before.name);assert.deepEqual(p.wallet,before.wallet);assert.equal(p.brokenCount,before.brokenCount);
  f.set(b.endsAt);f.tick();assert.equal(r.command(id(1),'bay-travel',{eventId:b.id}).ok,false);
});
test('bay rewards and completion checkpoint are in one durable write and cannot replay after reconstruction',async()=>{
  const d=disk(),profiles=createProfileStore(d.storage),options={onProfileChange:p=>profiles.save(p),onEquipmentChange:s=>profiles.saveEquipment(s),onEventsChange:s=>profiles.saveEvents(s),onFoupChange:s=>profiles.saveFoups(s)};
  const f=make({count:15,...options}),r=f.r;profiles.saveFoups(r.store.checkpoint());f.tick();const b=r.snapshot().worldEvents.bay;f.set(b.startsAt);f.tick();await profiles.flush();
  for(const m of bays[b.bayId].machines)r.destruction.trigger(m.id);f.tick();await profiles.flush();
  const batch=d.batches.at(-1);assert.equal(batch['world:events:v1'].lastResult.phase,'success');assert.equal(batch['world:events:v1'].bay.phase,'success');for(let n=1;n<=15;n++)assert.equal(batch['profile:'+id(n)].wallet.chips,200);
  assert.ok(Object.keys(batch).length<=128);assert.ok(batch['world:equipment:v1']);
  const next=make({at:b.startsAt+1000,count:0,...options});next.r.restoreEquipment(await profiles.getEquipment());next.r.restoreFoups(await profiles.getFoups());next.r.worldEvents.restore(await profiles.getEvents());
  for(let n=1;n<=15;n++)next.r.join(id(n),await profiles.get(id(n)));next.tick();assert.equal(next.r.wallet(id(1)).chips,200);
});
test('a suspended active event expires instead of extending the deadline or inventing a win',()=>{
  const f=make({count:15});f.tick();const b=f.r.snapshot().worldEvents.bay;f.set(b.startsAt);f.tick();
  const next=make({count:15,at:b.endsAt+1000});next.r.worldEvents.restore(f.r.worldEvents.checkpoint());next.tick();assert.equal(next.r.snapshot().worldEvents.bay.phase,'failed');assert.equal(next.r.wallet(id(1)).chips,0);
});
test('victory camera fits one entire bay on portrait and landscape screens and restores the exact normal camera',()=>{
  for(const aspect of [390/844,16/9]){
    const c=new THREE.PerspectiveCamera(72,aspect,.08,500);c.position.set(1,2,3);c.lookAt(0,0,0);const original={p:c.position.clone(),q:c.quaternion.clone(),up:c.up.clone(),fov:c.fov};let time=0;const visibility=[];
    const view=createEventCamera({camera:c,bays,now:()=>time,onOverview:v=>visibility.push(v)});view.start(17);assert.equal(view.apply(),true);c.updateMatrixWorld();
    for(const x of [-27,27])for(const z of [-8,8]){const p=new THREE.Vector3(bays[17].x+x,0,bays[17].z+z).project(c);assert.ok(Math.abs(p.x)<.95&&Math.abs(p.y)<.95);}
    view.restore();assert.ok(c.position.equals(original.p));assert.ok(c.quaternion.equals(original.q));assert.equal(c.fov,72);view.apply();time=3000;view.restore();assert.equal(view.apply(),false);assert.ok(c.position.equals(original.p));assert.ok(c.up.equals(original.up));assert.deepEqual(visibility,[true,false]);
    assert.ok(Number.isFinite(bayTopFrame(bays[17],aspect).position.y));
  }
});

test('gold rendering preserves ordinary colours, adds at most twenty cheap markers and removes them on expiry',()=>{
  const scene=new THREE.Scene(),materials=Object.fromEntries(['foup','foupDoor','dark','foupRib'].map((key,i)=>[key,new THREE.MeshStandardMaterial({color:['#c8b995','#967854','#223333','#dcceae'][i]})]));
  const original=materials.foup.color.clone(),renderer=createFoupRenderer(THREE,scene,materials);
  const a={id:'port:0:0',x:0,y:.225,z:0,mode:'ground',original:false},b={...a,id:'port:0:1',x:1,gold:{eventId:'gold:1',expiresAt:1000}};
  renderer.update([a,b]);const body=scene.getObjectByName('Interactive FOUPs'),color=new THREE.Color();body.getColorAt(0,color);assert.equal(color.getHexString(),original.getHexString());body.getColorAt(1,color);assert.equal(color.getHexString(),'ffc928');assert.ok(materials.foup.color.equals(original));
  const version=body.instanceColor.version;renderer.update([a,b]);assert.equal(body.instanceColor.version,version,'no repeated colour upload when nothing changed');
  assert.equal(scene.getObjectByName('Golden FOUP markers').count,1);b.gold=null;renderer.update([a,b]);body.getColorAt(1,color);assert.equal(color.getHexString(),original.getHexString());assert.equal(scene.getObjectByName('Golden FOUP markers').visible,false);
  renderer.dispose();assert.equal(scene.children.length,0);Object.values(materials).forEach(m=>m.dispose());
});
