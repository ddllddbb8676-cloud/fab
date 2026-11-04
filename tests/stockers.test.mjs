import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFoupStore} from '../src/foup-play.js';
import {createRoom} from '../server/room-engine.js';
import {ports,machines,columns,isBlocked,TOUR_POINTS} from '../src/layout.js';
import {findWalkPath,canWalkSegment} from '../src/walking.js';
import {stockers,stockerPorts,STOCKER_SIZE,stockerRecordPose} from '../src/stocker-layout.js';
import {initialSharedPorts,foupPacket,foupFromPacket} from '../src/shared-protocol.js';
import {createStockerView} from '../src/stocker-view.js';

const make=(opts={})=>{const store=createFoupStore({ports,initialPortIds:initialSharedPorts,seedStockers:true,...opts});store.initializeStockers();return store;};
const step=(store,seconds=3.1)=>{for(let t=0;t<seconds;t+=.05)store.step(.05);};
const overlap=(a,b)=>a.minX<b.maxX&&a.maxX>b.minX&&a.minZ<b.maxZ&&a.maxZ>b.minZ;

test('two entrance ceiling-height stockers clear every tool and retain walkable approaches and tour',()=>{
  assert.equal(stockers.length,2);assert.equal(stockerPorts.length,4);assert.equal(STOCKER_SIZE.height,4.88);
  assert.ok(STOCKER_SIZE.depth>STOCKER_SIZE.width*2);
  for(const s of stockers){
    for(const m of machines)for(const b of m.walkBounds)assert.equal(overlap(s.bounds,b),false,`${s.id}/${m.id}`);
    for(const c of columns)assert.equal(c.x>s.bounds.minX&&c.x<s.bounds.maxX&&c.z>s.bounds.minZ&&c.z<s.bounds.maxZ,false);
  }
  for(const start of [{x:0,z:78.8},{x:0,z:0},{x:0,z:-80}])for(const p of stockerPorts){
    assert.equal(isBlocked(p.approach.x,p.approach.z,.295),false);
    const path=findWalkPath(start,p.approach);assert.ok(path?.length,`${p.id} route`);
    for(let i=0,prev=start;i<path.length;prev=path[i++])assert.ok(canWalkSegment(prev,path[i]));
  }
  const tour=TOUR_POINTS.map(([x,z])=>({x,z}));
  for(let i=0;i<tour.length;i++)assert.ok(canWalkSegment(tour[i],tour[(i+1)%tour.length]),`tour ${i}`);
});

test('stockers move existing identities, serialize OUT requests, and only expose ready carriers',()=>{
  const cues=[],store=make({onStockerOut:p=>cues.push(p.stockerId)}),ids=[...store.records.keys()].sort();
  assert.equal(store.stockerState('STK01').count,12);
  const first=store.stockerState('STK01').items[0];assert.equal(store.pickup(first.id,'a'),false);
  assert.equal(store.stockerGet('STK01','a').ok,true);
  assert.equal(store.stockerGet('STK01','b').ok,false);assert.equal(store.pickup(first.id,'b'),false);
  step(store,1.7);assert.equal(cues.length,0);step(store,.2);assert.deepEqual(cues,['STK01']);step(store,1.3);
  assert.equal(store.stockerGet('STK01','b',first.id).phase,'pickup');assert.equal(store.stockerGet('STK01','a',first.id).ok,false);
  assert.equal(store.stockerPut('STK02','b',first.id).phase,'stocking');assert.equal(store.getCarried('b'),null);
  assert.equal(store.pickup(first.id,'a'),false);step(store);assert.equal(first.mode,'stored');assert.equal(first.stockerId,'STK02');
  assert.equal(cues.length,1);assert.deepEqual([...store.records.keys()].sort(),ids);
});

test('stocker restart settles transfers silently and preserves identity and empty shelves',()=>{
  let cues=0;const store=make({onStockerOut:()=>cues++}),ids=[...store.records.keys()].sort();
  store.stockerGet('STK01','a');step(store,.4);const outgoing=store.stockerState('STK01').items.find(r=>r.mode==='retrieving');
  const carried=[...store.records.values()].find(r=>r.mode==='port');store.pickup(carried.id,'b');store.stockerPut('STK02','b',carried.id);
  const saved=store.checkpoint(),restored=make({onStockerOut:()=>cues++});restored.restore(saved);step(restored,5);
  assert.equal(restored.records.get(outgoing.id).mode,'stocker-out');assert.equal(restored.records.get(carried.id).mode,'stored');assert.equal(cues,0);
  assert.deepEqual([...restored.records.keys()].sort(),ids);
  for(const row of saved.records)assert.ok(['port','carried','flying','ground','broken','cleared'].includes(row[1]),'rollback accepts old v1 modes');
  const legacy=createFoupStore({ports,initialPortIds:initialSharedPorts});legacy.restore({version:1,records:saved.records});
  assert.equal(legacy.records.get(outgoing.id).mode,'ground');assert.equal(legacy.records.size,store.records.size);
  const empty={...saved,stockers:{version:1,initialized:true,entries:[]}};restored.restore(empty);
  assert.equal(restored.stockerState('STK01').count,0);assert.equal(restored.checkpoint().stockers.entries.length,0);
});

// Checkpoints written by the former six-unit layout, including full shelves.
function sixUnitCheckpoint(counts=[12,12,12,12,12,12]){
  const records=[],entries=[],fallbacks=[[-5.2,82.88],[5.2,84.12],[-57.3,-82],[57.3,-82],[-3,-84.62],[3,-83.38]];
  let index=0;
  for(let unit=0;unit<6;unit++)for(let slot=0;slot<counts[unit];slot++){
    const portId=initialSharedPorts[index++],id=`port:${portId}`,[x,z]=fallbacks[unit];
    records.push([id,'ground',null,x,.225,z,0,2,false,portId]);
    entries.push([id,`STK0${unit+1}`,'stored',slot]);
  }
  return {version:1,records,stockers:{version:1,initialized:true,entries}};
}

test('retired stocker contents move into entrance shelves once without losing existing OUT or identities',()=>{
  let cues=0;const saved=sixUnitCheckpoint(),store=make({onStockerOut:()=>cues++}),ids=[...store.records.keys()].sort();
  saved.stockers.entries[0][2]='retrieving';
  saved.stockers.entries[24][2]='stocker-out';saved.stockers.entries[36][2]='stocking';
  // Active shelf slots must be reserved even when a retired row appears first.
  saved.stockers.entries.reverse();store.restore(saved);step(store);
  assert.deepEqual([...store.records.keys()].sort(),ids);
  assert.equal(store.stockerState('STK01').items.length,36);assert.equal(store.stockerState('STK02').items.length,36);
  assert.equal(store.stockerState('STK01').out.id,saved.records[0][0]);assert.equal(cues,0);
  for(const [id,sid] of saved.stockers.entries){
    const r=store.records.get(id);assert.equal(r.breakSeq,2);
    assert.ok(['STK01','STK02'].includes(r.stockerId));
    assert.deepEqual({x:r.x,y:r.y,z:r.z,yaw:r.yaw},stockerRecordPose(r));
    if(!['STK01','STK02'].includes(sid))assert.equal(r.mode,'stored');
  }
  const migrated=store.checkpoint();assert.ok(migrated.stockers.entries.every(e=>['STK01','STK02'].includes(e[1])));
  store.restore(migrated);assert.deepEqual(store.checkpoint(),migrated,'no duplicate migration or refill on reconnect');
});

test('a full old six-unit world preserves every excess FOUP when two entrance shelves are full',()=>{
  for(const destroyed of [false,true]){
    const snapshots=[];
    const store=make({isDestroyed:()=>destroyed,onChange:()=>snapshots.push(store.checkpoint())}),ids=[...store.records.keys()].sort(),saved=sixUnitCheckpoint([48,48,48,48,48,48]);
    store.restore(saved);
    assert.equal(snapshots.length,1,'only the completed restoration is published');
    assert.equal(snapshots[0].stockers.entries.length,96);
    assert.ok(snapshots[0].stockers.entries.every(e=>['STK01','STK02'].includes(e[1])));
    assert.deepEqual([...store.records.keys()].sort(),ids);
    for(const s of stockers)assert.equal(store.stockerState(s.id).items.length,48);
    for(const [id]of saved.stockers.entries.slice(96)){
      const r=store.records.get(id);assert.equal(r.mode,destroyed?'ground':'port');assert.equal(r.breakSeq,2);
      if(destroyed)assert.equal(isBlocked(r.x,r.z,.295),false,'fallback remains reachable');
      else assert.equal(store.atPort(r.portId)?.id,id,'returned to one unique intact port');
    }
    assert.equal(store.checkpoint().stockers.entries.length,96);
  }
});

test('invalid stocker checkpoints fail before changing world state and full shelves reject IN',()=>{
  const store=make(),saved=store.checkpoint(),before=JSON.stringify(saved);
  const bad=structuredClone(saved);bad.stockers.entries.push(bad.stockers.entries[0]);assert.throws(()=>store.restore(bad));assert.equal(JSON.stringify(store.checkpoint()),before);
  const unknown=structuredClone(saved);unknown.stockers.entries[0][1]='STK07';assert.throws(()=>store.restore(unknown));assert.equal(JSON.stringify(store.checkpoint()),before);
  const full=sixUnitCheckpoint([48,0,0,0,0,0]);
  store.restore(full);const r=[...store.records.values()].find(r=>r.mode==='port');assert.ok(store.pickup(r.id));
  assert.equal(store.stockerPut('STK01').ok,false);assert.equal(store.carried.id,r.id);
});

test('authoritative stocker commands require port contact, keep chips, and sync carrier state',()=>{
  const room=createRoom({random:()=>.42});for(const p of room.residents.people)p.wait=1e9;
  room.join('a');room.join('b');const s=stockers[0],out=s.ports[1];
  const move=(id,p)=>room.pose(id,{...p,y:0,heading:0,speed:0,posture:'stand',hidden:false});
  const wallets=['a','b'].map(id=>JSON.stringify(room.players.get(id).wallet));
  assert.equal(room.command('a','stocker',{id:s.id,port:'OUT'}).ok,false);
  for(const id of ['STK03','STK04','STK05','STK06'])assert.equal(room.command('a','stocker',{id,port:'OUT'}).ok,false);
  move('a',out.approach);move('b',out.approach);
  assert.equal(room.command('a','stocker',{id:s.id,port:'OUT'}).ok,true);assert.equal(room.command('b','stocker',{id:s.id,port:'OUT'}).ok,false);
  const r=room.store.stockerState(s.id).items.find(r=>r.mode==='retrieving'),packet=foupFromPacket(foupPacket(r));
  assert.equal(packet.stockerId,s.id);assert.equal(packet.mode,'retrieving');
  step(room,3.1);assert.equal(room.command('a','stocker',{id:s.id,port:'OUT',recordId:r.id}).ok,true);
  assert.equal(room.command('b','stocker',{id:s.id,port:'OUT',recordId:r.id}).ok,false);
  move('a',s.ports[0].approach);assert.equal(room.command('a','stocker',{id:s.id,port:'IN',recordId:r.id}).ok,true);
  assert.deepEqual(['a','b'].map(id=>JSON.stringify(room.players.get(id).wallet)),wallets);
});

test('stockers are bounded instanced geometry and dispose their labels and materials',()=>{
  const canvas=()=>({getContext:()=>({fillRect(){},fillText(){}})}),scene=new THREE.Scene(),view=createStockerView(THREE,scene,{makeCanvas:canvas}),store=make();
  assert.equal(view.root.children.filter(m=>m.isInstancedMesh).length,7);assert.ok(view.root.children.length<50);
  const bounds=new THREE.Box3().setFromObject(view.root);assert.ok(bounds.max.y<5);assert.ok(bounds.min.y>=-.001);
  store.stockerGet('STK01');step(store,2);view.update(store);view.dispose();assert.equal(scene.children.length,0);
});
