import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoupStore,STOCKER_REFILL_COUNT,FOUP_RESTOCK_SECONDS} from '../src/foup-play.js';
import {createRoom} from '../server/room-engine.js';
import {ports} from '../src/layout.js';
import {stockers} from '../src/stocker-layout.js';
import {initialSharedPorts,foupPacket,foupFromPacket} from '../src/shared-protocol.js';

const make=(options={})=>{const s=createFoupStore({ports,initialPortIds:initialSharedPorts,seedStockers:true,...options});s.initializeStockers();return s;};
const step=(s,seconds=3.1)=>{for(let i=0;i<Math.ceil(seconds/.05);i++)s.step(.05);};
function emptyCheckpoint(store){const saved=store.checkpoint();saved.stockers.entries=saved.stockers.entries.filter(r=>r[1]!=='STK01');return saved;}
const identitySet=s=>[...s.records.keys()].sort();

test('taking the final OUT automatically refills twelve once while preserving all carried FOUPs and world identities',()=>{
  const writes=[];let store;store=make({onChange:()=>writes.push(store.checkpoint())});
  const ids=identitySet(store),held=[];
  for(let i=0;i<STOCKER_REFILL_COUNT;i++){
    const owner='visitor:take-'+i;assert.equal(store.stockerGet('STK01',owner).ok,true);step(store);
    const out=store.stockerState('STK01').out,before=writes.length;held.push(out.id);
    assert.equal(store.stockerGet('STK01',owner,out.id).phase,'pickup');
    assert.equal(writes.length,before+1,'pickup and any refill publish together');
    assert.equal(store.stockerState('STK01').count,i===11?12:11-i);
  }
  assert.equal(new Set(held).size,12);
  for(let i=0;i<held.length;i++)assert.equal(store.getCarried('visitor:take-'+i).id,held[i]);
  assert.equal(store.stockerState('STK02').count,12);assert.deepEqual(identitySet(store),ids);
  assert.equal(new Set(store.stockerState('STK01').items.map(r=>r.stockSlot)).size,12);
  const last=writes.at(-1);assert.equal(last.stockers.entries.filter(r=>r[1]==='STK01').length,12);
  assert.equal(last.records.filter(r=>r[1]==='carried').length,12);
});

test('an already empty checkpoint refills on the next OUT, keeps floor objects and cannot duplicate transfers',()=>{
  const store=make();store.restore(emptyCheckpoint(store));const before=identitySet(store);
  const floor=[...store.records.values()].filter(r=>r.mode==='ground').map(r=>structuredClone(r));
  assert.equal(store.stockerState('STK01').count,0);
  assert.equal(store.stockerGet('STK01','a','stale-id').ok,false);assert.equal(store.stockerState('STK01').count,0);
  assert.equal(store.stockerGet('STK01','a').phase,'retrieving');
  assert.equal(store.stockerState('STK01').items.length,12);assert.equal(store.stockerState('STK01').count,11);
  assert.equal(store.stockerGet('STK01','b').ok,false);assert.equal(store.stockerState('STK01').items.length,12);
  for(const r of floor)assert.deepEqual(store.records.get(r.id),r);
  step(store);const out=store.stockerState('STK01').out;
  assert.equal(store.stockerGet('STK01','b',out.id).ok,true);assert.equal(store.stockerGet('STK01','a',out.id).ok,false);
  assert.deepEqual(identitySet(store),before);assert.equal(store.stockerState('STK01').count,11);
});

test('refill never consumes gold, hands, flying carriers, ground objects, debris, cleanup waits or reserved supplies',()=>{
  let allowed=new Set(),reserved='';const store=make({canSupplyStocker:r=>allowed.has(r.id)&&r.id!==reserved});store.restore(emptyCheckpoint(store));
  const sources=[...store.records.values()].filter(r=>r.mode==='port').slice(0,10);allowed=new Set(sources.map(r=>r.id));reserved=sources[7].id;
  const states=[{mode:'carried',owner:'held'},{mode:'flying',vx:0,vy:0,vz:0},{mode:'ground'},{mode:'broken',cleaner:'cleaner'},
    {gold:{eventId:'gold:1',expiresAt:1e15,throwPaid:false}},{mode:'cleared',refillIn:1},{mode:'cleared',refillIn:0,gold:{eventId:'gold:2',expiresAt:1e15}},
    {},{}, {mode:'cleared',refillIn:0}];
  sources.forEach((r,i)=>{const patch=states[i];store.synchronize([{...r,...patch,portId:patch.mode&&patch.mode!=='port'?null:r.portId,original:false}],null);});
  const protectedRecords=sources.slice(0,8).map(r=>structuredClone(store.records.get(r.id)));
  assert.equal(store.stockerGet('STK01','requester').ok,true);assert.equal(store.stockerState('STK01').items.length,2);
  for(const r of protectedRecords)assert.deepEqual(store.records.get(r.id),r);
  assert.equal(store.getCarried('held').id,sources[0].id);
});

test('destroyed equipment cannot starve stockers while idle port stock remains; existing debris stays until cleaned',()=>{
  const store=make({isDestroyed:()=>true});assert.equal(store.stockerState('STK01').count,0);
  const ids=identitySet(store);assert.equal(store.stockerGet('STK01','a').ok,true);assert.equal(store.stockerState('STK01').items.length,12);assert.deepEqual(identitySet(store),ids);
  const exhausted=make({isDestroyed:()=>true});
  exhausted.synchronize([...exhausted.records.values()].map(r=>({...r,mode:'broken',portId:null,damageAge:2,breakSeq:4,cleaner:null})),null);
  const broken=exhausted.checkpoint();assert.equal(exhausted.stockerGet('STK01','a').ok,false);assert.deepEqual(exhausted.checkpoint(),broken);
  const r=exhausted.records.values().next().value;assert.equal(exhausted.beginCleanup(r.id,'cleaner',4),true);r.cleanProgress=1;assert.equal(exhausted.finishCleanup(r.id,'cleaner',4),true);
  assert.equal(exhausted.stockerGet('STK01','a').ok,false,'cleanup refill delay still applies');step(exhausted,FOUP_RESTOCK_SECONDS+.1);
  assert.equal(exhausted.stockerGet('STK01','a').ok,true);assert.equal(exhausted.stockerState('STK01').items.length,1);assert.equal(r.breakSeq,4);
});

test('refilled shelves and in-progress OUT survive restart without another refill or any new identities',()=>{
  const store=make();store.restore(emptyCheckpoint(store));const ids=identitySet(store);store.stockerGet('STK01','a');step(store,.4);
  const saved=store.checkpoint(),next=make();next.restore(saved);
  assert.equal(next.stockerState('STK01').items.length,12);assert.ok(next.stockerState('STK01').out);
  const stable=next.checkpoint();for(let i=0;i<3;i++){next.restore(stable);assert.deepEqual(next.checkpoint(),stable);}
  assert.deepEqual(identitySet(next),ids);
  const client=createFoupStore({ports,initialPortIds:initialSharedPorts});client.synchronize([...next.records.values()].filter(r=>!r.original).map(r=>foupFromPacket(foupPacket(r))),null,true);
  assert.equal(client.stockerState('STK01').items.length,12);assert.equal(client.stockerState('STK01').out.id,next.stockerState('STK01').out.id);
});

test('server refill preserves profiles, avoids nearby users and NPC targets, and grants no chips',()=>{
  const room=createRoom({random:()=>.42,now:()=>Date.parse('2026-11-04T21:00:00+09:00')});room.restoreFoups(emptyCheckpoint(room.store));
  room.join('requester',{name:'꺼내기',brokenCount:12,repairedCount:4});room.join('nearby',{name:'가까이',brokenCount:2});
  const out=stockers[0].ports[1],portRecord=[...room.store.records.values()].find(r=>r.mode==='port');
  const move=(id,p)=>room.pose(id,{...p,y:0,heading:0,speed:0,posture:'stand',hidden:false});move('requester',out.approach);move('nearby',portRecord);
  const npcTarget=[...room.store.records.values()].find(r=>r.mode==='port'&&r.id!==portRecord.id);room.residents.people[0].recordId=npcTarget.id;
  const profiles=['requester','nearby'].map(id=>room.profile(id)),ids=identitySet(room.store);
  assert.equal(room.command('requester','stocker',{id:'STK01',port:'OUT'}).ok,true);
  const refill=room.store.stockerState('STK01').items;assert.equal(refill.length,12);
  assert.ok(!refill.some(r=>r.id===portRecord.id||r.id===npcTarget.id));
  for(const r of refill)assert.ok(Math.hypot(ports.find(p=>p.id===r.homePortId).x-portRecord.x,ports.find(p=>p.id===r.homePortId).z-portRecord.z)>20);
  assert.deepEqual(['requester','nearby'].map(id=>room.profile(id)),profiles);assert.deepEqual(identitySet(room.store),ids);
});
