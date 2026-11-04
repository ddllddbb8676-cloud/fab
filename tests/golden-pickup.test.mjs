import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoupStore} from '../src/foup-play.js';
import {groundPickupCandidates} from '../src/play-actions.js';
import {createWalkPlanner} from '../src/walking.js';
import {ports,isBlocked,bays} from '../src/layout.js';
import {initialSharedPorts} from '../src/shared-protocol.js';
import {AIR_SHOWER} from '../src/air-shower.js';
import {setRuntimeObstacles} from '../src/runtime-obstacles.js';
import {stockerById} from '../src/stocker-layout.js';
import {createRoom} from '../server/room-engine.js';

test('all eighteen golden spawn rotations yield twenty reachable pickups while the air-shower door is closed',()=>{
  setRuntimeObstacles(AIR_SHOWER.closedDoorBounds);
  try{
    const planner=createWalkPlanner(AIR_SHOWER.exit);
    for(let hour=0;hour<bays.length;hour++){
      const store=createFoupStore({ports,initialPortIds:initialSharedPorts}),startsAt=hour*3600000;
      const ids=store.spawnGolden({id:'gold:'+startsAt,startsAt,endsAt:startsAt+600000});
      assert.equal(ids.length,20);assert.equal(new Set(ids).size,20);
      for(const id of ids){
        const r=store.records.get(id);assert.equal(isBlocked(r.x,r.z,.295),false);
        assert.ok(r.z<78,'initial golden spawns are in the bays, away from the entrance recess');
        const destination=groundPickupCandidates(r,AIR_SHOWER.exit).find(p=>planner.findPath(p));
        assert.ok(destination,`rotation ${hour}, ${id} can be approached from the entrance`);
        assert.ok(Math.hypot(destination.x-r.x,destination.z-r.z)<2,'within the authoritative pickup range');
      }
    }
  }finally{setRuntimeObstacles([]);}
});

test('a golden FOUP beside the entrance is reachable, accepted by the server and deposits for exactly 200 chips',()=>{
  const at=Date.parse('2026-11-04T21:00:00+09:00'),who='visitor:'+'a'.repeat(64);
  const room=createRoom({now:()=>at,random:()=>.42});room.join(who);
  assert.equal(room.worldEvents.startManual('golden','00000000-0000-0000-0000-000000000789').ok,true);
  const r=[...room.store.records.values()].find(r=>r.gold);
  Object.assign(r,{x:-.795,y:.225,z:85.004});
  const before=room.profile(who),metadata=structuredClone(r.gold),recordId=r.id;
  const move=p=>assert.equal(room.pose(who,{...p,y:0,heading:0,speed:0,posture:'stand',hidden:false}),true);
  setRuntimeObstacles(AIR_SHOWER.closedDoorBounds);
  try{
    const planner=createWalkPlanner(AIR_SHOWER.exit),target=groundPickupCandidates(r,AIR_SHOWER.exit).find(p=>planner.findPath(p));
    assert.ok(target);assert.ok(target.z<AIR_SHOWER.doorZ);move(target);
    assert.equal(room.command(who,'pickup',{id:recordId}).ok,true);
    assert.equal(room.store.getCarried(who).id,recordId);assert.deepEqual(r.gold,metadata);
    assert.deepEqual(room.profile(who).wallet,before.wallet,'picking up does not grant or consume chips');
    const input=stockerById.get('STK01').ports[0];move(input.approach);
    assert.equal(room.command(who,'stocker',{id:'STK01',port:'IN',recordId}).phase,'golden-deposit');
    assert.equal(room.wallet(who).chips,200);assert.equal(room.store.getCarried(who),null);
    assert.equal(r.mode,'cleared');assert.equal(r.id,recordId);assert.equal(r.gold,null);
    assert.equal(room.command(who,'stocker',{id:'STK01',port:'IN',recordId}).ok,false);
    assert.equal(room.wallet(who).chips,200);
    for(const key of ['id','name','civilianName','brokenCount','repairedCount'])assert.deepEqual(room.profile(who)[key],before[key]);
  }finally{setRuntimeObstacles([]);}
});
