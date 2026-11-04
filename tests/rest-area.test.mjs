import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {REST_AREAS,isRestArea,canSafetyTraverse,restAreaExit,SAFETY_CLEARANCE} from '../src/rest-area.js';
import {createRestAreaView} from '../src/rest-area-view.js';
import {isBlocked} from '../src/layout.js';
import {findWalkPath,canWalkSegment} from '../src/walking.js';
import {restPoseFits} from '../src/posture.js';
import {canCatch,createSafetyPatrols} from '../src/safety-team.js';
import {createRoom} from '../server/room-engine.js';

const center=a=>({x:(a.minX+a.maxX)/2,y:0,z:(a.minZ+a.maxZ)/2});
test('nineteen small marked zones fit the corridors, allow sitting/lying and provide safe guard exits',()=>{
  assert.equal(REST_AREAS.length,19);
  for(const area of REST_AREAS){
    for(let x=area.minX+.3;x<area.maxX-.3;x+=.4)for(let z=area.minZ+.3;z<area.maxZ-.3;z+=.4)assert.equal(isBlocked(x,z,.295),false,area.id);
    const p=center(area);for(const pose of ['sit','lie'])assert.ok(restPoseFits(p,0,pose));
    const exit=restAreaExit(p);assert.equal(isRestArea(exit,SAFETY_CLEARANCE),false);assert.equal(isBlocked(exit.x,exit.z,.295),false);
    assert.ok(findWalkPath(exit,p),'visitors can enter');assert.equal(findWalkPath(exit,p,{canTraverse:canSafetyTraverse}),null,'guards cannot enter');
  }
});

test('cross-zone shortcuts are blocked but guard routes can go around without crossing equipment',()=>{
  for(const area of REST_AREAS.filter(a=>!a.central)){
    const p=center(area),start={x:area.minX-3,z:p.z},end={x:area.maxX+3,z:p.z};
    assert.equal(canSafetyTraverse(start,end),false);
    const path=findWalkPath(start,end,{canTraverse:canSafetyTraverse});assert.ok(path?.length>1,area.id);
    let previous=start;for(const next of path){assert.ok(canSafetyTraverse(previous,next));assert.ok(canWalkSegment(previous,next));previous=next;}
  }
});

test('safe boundary immediately protects standing, sitting and lying visitors from both guard kinds',()=>{
  for(const area of REST_AREAS)for(const role of ['safety-red','safety-orange'])for(const posture of ['stand','sit','lie']){
    const p={...center(area),x:area.minX+.02,role:'visitor',phase:'idle',posture,penalty:0,safeUntil:0};
    const guard={...p,x:area.minX-.4,role};assert.equal(canCatch(guard,p,100),false);
  }
  const p={x:0,z:60,role:'visitor',phase:'idle',posture:'lie',penalty:0,safeUntil:0};
  assert.equal(canCatch({...p,z:60.5,role:'safety-red'},p,100),true,'leaving the zone restores ordinary catch rules');
});

test('server enforces no guard entry and lets penalized visitors rest without erasing their repair debt',()=>{
  const r=createRoom();r.join('guard');r.join('visitor');const g=r.players.get('guard'),p=r.players.get('visitor');
  g.role='safety-orange';p.penalty=3;
  for(const area of REST_AREAS){
    const at=center(area),exit=restAreaExit(at);Object.assign(g,exit);
    r.pose(g.id,{...at,heading:0,posture:'stand',hidden:false});assert.equal(isRestArea(g,SAFETY_CLEARANCE),false);
    for(const posture of ['sit','lie']){r.pose(p.id,{...at,heading:0,posture,hidden:false});assert.equal(p.posture,posture);assert.equal(p.penalty,3);}
  }
  r.pose(p.id,{x:0,y:0,z:50,heading:0,posture:'lie',hidden:false});assert.equal(p.posture,'stand');assert.equal(p.penalty,3);
});

test('safe visitors never receive a safety turn and patrols never enter even with stale paths',()=>{
  const r=createRoom();for(const p of r.residents.people)p.hidden=true;for(const g of r.safety.people)g.hidden=true;
  for(const area of REST_AREAS){r.join(area.id);const p=r.players.get(area.id);r.pose(p.id,{...center(area),heading:0,posture:'stand',hidden:false});p.activeSeconds=300;}
  for(let i=0;i<400;i++){for(const p of r.players.values())p.lastSeen=r.time;r.step(.05);}
  assert.ok([...r.players.values()].every(p=>p.role==='visitor'&&!p.penalty));
  const patrols=createSafetyPatrols({random:()=>.42}),targets=REST_AREAS.map(a=>({...center(a),role:'visitor',phase:'idle',posture:'lie'}));
  patrols.people.forEach((g,i)=>Object.assign(g,{...center(REST_AREAS[i]),path:[center(REST_AREAS[i])]}));
  for(let i=0;i<1200;i++){patrols.update(.05,targets,i*.05);for(const g of patrols.people)assert.equal(isRestArea(g,SAFETY_CLEARANCE),false);}
});

test('nineteen green zones and distant beacons share five instance batches and one actual light',()=>{
  const view=createRestAreaView(THREE,new THREE.Scene()),instances=[];view.root.traverse(o=>{if(o.isInstancedMesh)instances.push(o);});
  assert.deepEqual(instances.map(o=>o.count).sort((a,b)=>a-b),[19,19,19,38,76]);
  for(const area of REST_AREAS){const p=center(area);view.update(p);assert.equal(view.light.position.x,p.x);assert.equal(view.light.position.z,p.z);assert.ok(view.light.intensity>0);}
  const normal=new THREE.Vector3(0,0,-1).applyQuaternion(view.light.quaternion);assert.ok(normal.y<-.99);
});

test('the opposite main-aisle end is ordinary floor while the entrance remains a refuge',()=>{
  assert.deepEqual(REST_AREAS.filter(a=>a.central).map(a=>a.id),['entry']);
  const end={x:0,z:-79,role:'visitor',phase:'idle',posture:'stand',penalty:0,safeUntil:0};
  assert.equal(isRestArea(end),false);assert.ok(canSafetyTraverse({x:0,z:-84},{x:0,z:-75}));
  assert.equal(canCatch({...end,z:-79.5,role:'safety-red'},end,100),true);
  assert.ok(isRestArea({x:0,z:81.5}));
});
