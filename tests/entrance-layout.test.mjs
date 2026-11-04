import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {entranceBounds,ENTRANCE} from '../src/entrance-layout.js';
import {AIR_SHOWER,createAirShower} from '../src/air-shower.js';
import {entryCamera} from '../src/entry-sequence.js';
import {machines,ports,isBlocked} from '../src/layout.js';
import {stockers,stockerPorts,stockerPoint,stockerBounds} from '../src/stocker-layout.js';
import {isRestArea} from '../src/rest-area.js';
import {canWalkSegment,findWalkPath,WALK_RADIUS} from '../src/walking.js';
import {setRuntimeObstacles} from '../src/runtime-obstacles.js';
import {createFoupStore,supportHeight} from '../src/foup-play.js';
import {createRoom} from '../server/room-engine.js';

test('compact forecourt retains both rear service passages and all entrance stocker approaches',()=>{
  const lastCabinet=Math.max(...machines.flatMap(m=>m.walkBounds.map(b=>b.maxZ)));
  assert.ok(ENTRANCE.wallZ-lastCabinet>1.8);
  assert.ok(isRestArea(AIR_SHOWER.exit),'new exit remains safe from patrols');
  assert.ok(AIR_SHOWER.exit.z + WALK_RADIUS < 82.1,'saved exit also clears the previous release doorway on rollback');
  for(const b of entranceBounds){
    assert.ok(isBlocked((b.minX+b.maxX)/2,86));
    assert.equal(supportHeight((b.minX+b.maxX)/2,86),ENTRANCE.height);
    const side=Math.sign(b.minX+b.maxX);
    assert.ok(canWalkSegment({x:side*3,z:ENTRANCE.serviceZ},{x:side*55.65,z:ENTRANCE.serviceZ}));
    for(const s of stockers)assert.ok(b.maxX<=s.bounds.minX||b.minX>=s.bounds.maxX||b.maxZ<=s.bounds.minZ||b.minZ>=s.bounds.maxZ);
  }
  try{
    setRuntimeObstacles(AIR_SHOWER.closedDoorBounds);
    for(const p of stockerPorts){
      const route=findWalkPath(AIR_SHOWER.exit,p.approach);assert.ok(route?.length,p.id);
      let previous=AIR_SHOWER.exit;for(const point of route){assert.ok(canWalkSegment(previous,point));previous=point;}
    }
  }finally{setRuntimeObstacles([]);}
});

test('portrait first view frames the complete STK01 front through a clear camera ray',()=>{
  const v=entryCamera(1),target=new THREE.Vector3(AIR_SHOWER.exit.x,1.02,AIR_SHOWER.exit.z);
  const camera=new THREE.PerspectiveCamera(72,390/844,.1,200);
  camera.position.copy(target).add(new THREE.Vector3(Math.sin(v.yaw)*Math.cos(v.elevation)*v.distance,Math.sin(v.elevation)*v.distance,Math.cos(v.yaw)*Math.cos(v.elevation)*v.distance));
  camera.lookAt(target);camera.updateMatrixWorld();
  const ray=new THREE.Ray(target,camera.position.clone().sub(target).normalize());
  for(const b of [...AIR_SHOWER.bounds,...AIR_SHOWER.overheadBounds,...entranceBounds,...stockerBounds,...machines.map(m=>m.bounds)]){
    const box=new THREE.Box3(new THREE.Vector3(b.minX-.12,b.minY??0,b.minZ-.12),new THREE.Vector3(b.maxX+.12,b.maxY??3.4,b.maxZ+.12));
    const hit=ray.intersectBox(box,new THREE.Vector3());assert.ok(!hit||hit.distanceTo(target)>v.distance,'camera stays out of equipment');
  }
  for(const x of [-1.3,1.3])for(const y of [.1,4.88]){
    const p=stockerPoint(stockers[0],x,y,3.1),screen=new THREE.Vector3(p.x,p.y,p.z).project(camera);
    assert.ok(Math.abs(screen.x)<.9&&Math.abs(screen.y)<.95,JSON.stringify(screen));
  }
  const shower=createAirShower(THREE);
  try{
    shower.root.updateMatrixWorld(true);const rendered=new THREE.Box3();
    for(const child of shower.root.children)if(child!==shower.jets)rendered.expandByObject(child);
    assert.ok(rendered.min.z>=85.1&&rendered.max.z<=89);
    assert.ok(canWalkSegment(AIR_SHOWER.start,AIR_SHOWER.exit));
  }finally{shower.dispose();}
});

test('returning profiles retain identity and records, and old rear-strip FOUPs remain reachable',()=>{
  const room=createRoom(),saved={civilianName:'입구검증',name:'입구검증',brokenCount:123,repairedCount:45,hasEntered:true,groundPosition:{x:30,y:0,z:86,heading:1}};
  room.join('entrance-test',saved);const p=room.players.get('entrance-test');
  assert.equal(p.id,'entrance-test');assert.equal(p.name,'입구검증');assert.equal(p.brokenCount,123);assert.equal(p.repairedCount,45);
  assert.equal(isBlocked(p.x,p.z,WALK_RADIUS),false);assert.equal(p.z,AIR_SHOWER.exit.z);
  const store=createFoupStore({ports,initialPortIds:[ports[0].id,ports[1].id]}),snapshot=store.checkpoint();
  snapshot.records.forEach((r,i)=>{r[1]=i?'broken':'ground';r[2]=null;r[3]=i?-35:35;r[4]=.225;r[5]=88;r[7]=3;});
  store.restore(snapshot);
  for(const row of snapshot.records){const r=store.records.get(row[0]);assert.equal(r.mode,row[1]);assert.equal(r.breakSeq,3);assert.equal(isBlocked(r.x,r.z,WALK_RADIUS),false);}
  const unchanged={...saved,groundPosition:{x:0,y:0,z:20,heading:1}};room.join('valid-resume',unchanged);
  assert.equal(room.players.get('valid-resume').z,20,'valid saved positions do not move to entrance');
});

test('bringing stockers forward preserves loose FOUPs, debris, event metadata and returning accounts',()=>{
  const room=createRoom(),saved={civilianName:'위치검증',name:'위치검증',brokenCount:21,repairedCount:8,hasEntered:true,groundPosition:{x:-5.2,y:0,z:84.12,heading:1}};
  assert.ok(isBlocked(saved.groundPosition.x,saved.groundPosition.z,WALK_RADIUS),'old loading approach is now inside the moved body');
  room.join('stocker-front-test',saved);const person=room.players.get('stocker-front-test');
  assert.equal(person.name,saved.name);assert.equal(person.brokenCount,21);assert.equal(person.repairedCount,8);
  assert.equal(isBlocked(person.x,person.z,WALK_RADIUS),false);
  const store=createFoupStore({ports,initialPortIds:ports.slice(0,4).map(p=>p.id)});
  const checkpoint={version:1,records:[...store.records.values()].map((r,i)=>[r.id,i===1?'broken':i===2?'cleared':'ground',null,i===3?0:-5.2,i===1?.035:.225,i===3?70:84.12,0,3,false,r.homePortId])};
  checkpoint.golden={version:1,entries:[[checkpoint.records[1][0],'gold:1793782800000',1793783400000,true]]};
  const untouched=checkpoint.records[3].slice();store.restore(checkpoint);
  assert.equal(store.records.size,4);
  for(const row of checkpoint.records){const r=store.records.get(row[0]);assert.equal(r.mode,row[1]);assert.equal(r.breakSeq,3);assert.equal(isBlocked(r.x,r.z,WALK_RADIUS),false);}
  assert.deepEqual(store.checkpoint().golden,checkpoint.golden,'no new reward or lost golden state');
  assert.deepEqual(store.checkpoint().records.find(r=>r[0]===untouched[0]),untouched,'unobstructed floor carrier stays in place');
  const once=store.checkpoint();store.restore(once);assert.deepEqual(store.checkpoint(),once,'subsequent restart does not shift or duplicate carriers');
});
