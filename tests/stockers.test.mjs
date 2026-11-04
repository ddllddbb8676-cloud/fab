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

test('six narrow ceiling-height stockers clear every tool and retain walkable approaches and tour',()=>{
  assert.equal(stockers.length,6);assert.equal(stockerPorts.length,12);assert.equal(STOCKER_SIZE.height,4.88);
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

test('relocated corner stockers keep stored identities and restore pending OUT at the new port',()=>{
  const store=make(),ids=[...store.records.keys()].sort();
  store.stockerGet('STK03','a');step(store,.5);
  const beforeCounts=['STK03','STK04'].map(id=>store.stockerState(id).items.length);
  const saved=store.checkpoint(),oldStock=new Map(saved.stockers.entries.filter(e=>['STK03','STK04'].includes(e[1])).map(e=>[e[0],e[1]]));
  // The previous release saved these same carriers beside the middle bays.
  for(const row of saved.records)if(oldStock.has(row[0])){row[3]=oldStock.get(row[0])==='STK03'?-57.8:57.8;row[5]=4.7;}
  const restored=make();restored.restore(saved);
  assert.deepEqual([...restored.records.keys()].sort(),ids);
  assert.deepEqual(['STK03','STK04'].map(id=>restored.stockerState(id).items.length),beforeCounts);
  for(const s of stockers.slice(2,4)){
    assert.ok(s.bounds.minZ>-90&&s.bounds.minZ< -89.5,'back sits against far wall');
    for(const r of restored.stockerState(s.id).items){
      assert.ok(r.z< -80,'old middle coordinates are replaced');
      assert.deepEqual({x:r.x,y:r.y,z:r.z,yaw:r.yaw},stockerRecordPose(r));
    }
  }
  assert.ok(restored.stockerState('STK03').out,'interrupted OUT is ready at the new loading port');
});

test('invalid stocker checkpoints fail before changing world state and full shelves reject IN',()=>{
  const store=make(),saved=store.checkpoint(),before=JSON.stringify(saved);
  const bad=structuredClone(saved);bad.stockers.entries.push(bad.stockers.entries[0]);assert.throws(()=>store.restore(bad));assert.equal(JSON.stringify(store.checkpoint()),before);
  const full=structuredClone(saved);full.stockers.entries=[];
  for(let i=0;i<48;i++)full.stockers.entries.push([full.records[i][0],'STK01','stored',i]);
  store.restore(full);const r=[...store.records.values()].find(r=>r.mode==='port');assert.ok(store.pickup(r.id));
  assert.equal(store.stockerPut('STK01').ok,false);assert.equal(store.carried.id,r.id);
});

test('authoritative stocker commands require port contact, keep chips, and sync carrier state',()=>{
  const room=createRoom({random:()=>.42});for(const p of room.residents.people)p.wait=1e9;
  room.join('a');room.join('b');const s=stockers[0],out=s.ports[1];
  const move=(id,p)=>room.pose(id,{...p,y:0,heading:0,speed:0,posture:'stand',hidden:false});
  const wallets=['a','b'].map(id=>JSON.stringify(room.players.get(id).wallet));
  assert.equal(room.command('a','stocker',{id:s.id,port:'OUT'}).ok,false);
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
