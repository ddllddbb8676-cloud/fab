import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {createProfileStore} from '../server/player-profiles.js';
import {createSharedWorldView} from '../src/shared-world-view.js';

function storage(){
  const data=new Map(),batches=[];return {data,batches,get:async key=>structuredClone(data.get(key)),
    put:async rows=>{batches.push(structuredClone(rows));for(const [k,v] of Object.entries(rows))data.set(k,structuredClone(v));},delete:async key=>data.delete(key)};
}
test('damage and matching player records commit together and survive a completely new room',async()=>{
  const disk=storage(),store=createProfileStore(disk),room=createRoom({now:()=>10000,onEquipmentChange:s=>store.saveEquipment(s),onProfileChange:p=>store.save(p)});
  room.join('visitor:test');room.players.get('visitor:test').brokenCount=2;
  room.destruction.trigger(12);room.destruction.trigger(35);store.save(room.profile('visitor:test'));await store.flush();
  const batch=disk.batches.at(-1);assert.ok(batch['world:equipment:v1']);assert.equal(batch['profile:visitor:test'].brokenCount,2);
  const nextStore=createProfileStore(disk),next=createRoom({now:()=>20000});next.restoreEquipment(await nextStore.getEquipment());
  assert.deepEqual(next.destruction.state.destroyedIds,[12,35]);assert.ok(next.snapshot(true).broken.every(r=>r[1]>=6));
  assert.equal(next.join('visitor:test',await nextStore.get('visitor:test')).ok,true);assert.equal(next.players.get('visitor:test').brokenCount,2);
});
test('interrupted repairs stay damaged and unlocked, while only completed repairs remain repaired',async()=>{
  const disk=storage(),store=createProfileStore(disk),room=createRoom({onEquipmentChange:s=>store.saveEquipment(s)});
  room.destruction.trigger(8);room.destruction.trigger(9);room.destruction.trigger(10);
  room.destruction.beginRepair(8,'visitor:a');room.destruction.setRepairProgress(8,.8);
  room.destruction.reset(9);await store.flush();
  const next=createRoom();next.restoreEquipment(await createProfileStore(disk).getEquipment());
  assert.deepEqual(next.destruction.state.destroyedIds,[8,10]);
  assert.equal(next.snapshot(true).broken.find(r=>r[0]===8)[2],null,'no fake completed or ownerless repair');
  assert.equal(next.destruction.beginRepair(8,'visitor:b'),true,'interrupted owner cannot lock the tool forever');
});
test('an explicitly empty saved fab is retained and resetting a player never clears shared damage',async()=>{
  const disk=storage(),store=createProfileStore(disk),room=createRoom({onEquipmentChange:s=>store.saveEquipment(s)});
  room.destruction.trigger(3);store.save({id:'visitor:reset',name:'방문자',brokenCount:1});await store.flush();
  await store.remove('visitor:reset');assert.equal((await store.getEquipment()).broken.length,1);
  room.destruction.reset(3);await store.flush();const saved=await createProfileStore(disk).getEquipment();
  assert.deepEqual(saved,{version:1,broken:[]});const next=createRoom();next.restoreEquipment(saved);assert.equal(next.snapshot(true).broken.length,0);
});
test('failed and in-flight writes cannot replace newer equipment changes with an older checkpoint',async()=>{
  const disk=storage(),original=disk.put;let reject=true;
  disk.put=async batch=>{if(reject){reject=false;throw new Error('temporary storage failure');}await original(batch);};
  const store=createProfileStore(disk),room=createRoom({onEquipmentChange:s=>store.saveEquipment(s)});
  room.destruction.trigger(1);await assert.rejects(store.flush());assert.equal(store.hasPending,true);
  room.destruction.trigger(2);room.destruction.reset(1);await store.flush();
  assert.deepEqual((await store.getEquipment()).broken.map(r=>r.id),[2]);
});
test('corrupt saved state is rejected without clearing the existing damaged set',()=>{
  const room=createRoom();room.destruction.trigger(17);
  for(const invalid of [null,{version:99,broken:[]},{version:1,broken:[{id:999,destroyedAt:1}]},{version:1,broken:[{id:0,destroyedAt:NaN}]}]){
    assert.throws(()=>room.restoreEquipment(invalid));assert.equal(room.destruction.isDestroyed(17),true);
  }
});
test('reconnecting does not visually repair every tool before receiving the authoritative snapshot',()=>{
  const damaged=new Set([2,8]),destruction={get state(){return {destroyedIds:[...damaged]};},resetAll(){damaged.clear();}};
  const view=createSharedWorldView({fleet:{vehicles:[]},store:{reset(){}},destruction});
  view.welcome('visitor:test');assert.deepEqual([...damaged],[2,8]);
});
