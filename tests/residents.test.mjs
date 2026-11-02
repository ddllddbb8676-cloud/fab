import test from 'node:test';
import assert from 'node:assert/strict';
import { createResidentSimulation, RESIDENT_ROLES } from '../src/residents.js';
import { createFleet, reservedPortIds } from '../src/network-transport.js';
import { createFoupStore } from '../src/foup-play.js';
import { machines, ports, isBlocked } from '../src/layout.js';
import { restPoseFits } from '../src/posture.js';
import * as THREE from 'three';
import { createEquipmentDestruction } from '../src/equipment-destruction.js';
import {createRoom} from '../server/room-engine.js';

test('caught residents stand, walk an unobstructed loop, return home and resume their role without multiplying FOUPs',()=>{
  const r=createRoom({random:()=>.42}),sim=r.residents;
  for(const p of sim.people)p.wait=1e9;
  const targets=sim.people.filter(p=>p.role==='resting');
  for(const role of ['thrower','breaker','repairer'])targets.push(sim.people.find(p=>p.role===role));
  const totalCargo=r.store.records.size;
  for(const actor of targets) {
    const origin={x:actor.x,z:actor.z},role=actor.role,posture=actor.posture;
    if(role==='thrower') {
      const cargo=[...r.store.records.values()].find(p=>p.mode==='port');actor.recordId=cargo.id;
      assert.equal(r.store.pickup(cargo.id,actor.id),true);
    }
    assert.equal(sim.beginSafetyLap(actor),true);assert.equal(actor.posture,'stand');
    assert.equal(r.store.getCarried(actor.id),null);assert.equal(sim.beginSafetyLap(actor),false);
    let travelled=0;
    for(let n=0;n<6000&&actor.penalty;n++) {
      const before={x:actor.x,z:actor.z};sim.update(.05);r.store.step(.05);
      travelled+=Math.hypot(actor.x-before.x,actor.z-before.z);
      assert.equal(isBlocked(actor.x,actor.z,.295),false,`${role} walks around equipment`);
    }
    assert.equal(actor.penalty,0,`${role} finishes the lap`);assert.ok(travelled>30,`${role} actually walks a loop`);
    assert.ok(Math.hypot(actor.x-origin.x,actor.z-origin.z)<.04);assert.equal(actor.role,role);
    assert.equal(actor.phase,role==='resting'?'rest':'idle');
    if(role==='resting')assert.equal(actor.posture,posture);
    assert.equal(sim.beginSafetyLap(actor),false,'completion grants a short grace period');
    actor.wait=1e9;
  }
  assert.equal(r.store.records.size,totalCargo);
  const riding=sim.people.find(p=>p.role==='rider');assert.equal(sim.beginSafetyLap(riding),false);
  const repairing=sim.people.find(p=>p.role==='repairer');repairing.phase='repair';assert.equal(sim.beginSafetyLap(repairing),false);
});

test('thirty distinct named residents keep their roles and share a finite FOUP inventory over repeated work cycles', () => {
  let seed = 15879;
  const random = () => { seed ^= seed<<13;seed ^= seed>>>17;seed ^= seed<<5; return (seed>>>0)/4294967296; };
  const fleet = createFleet(36), broken = new Set(), repairs = new Map();
  const destruction = { get state(){return {destroyedIds:[...broken]};}, isDestroyed:id=>broken.has(id),
    trigger(id){ if(broken.has(id)) return false;broken.add(id);return true; },
    beginRepair(id,owner){if(!broken.has(id)||repairs.has(id)||[...repairs.values()].includes(owner))return false;repairs.set(id,owner);return true;},
    setRepairProgress(){}, cancelRepair:id=>repairs.delete(id), reset(id){repairs.delete(id);broken.delete(id);return true;} };
  const initial = ports.filter(p=>!reservedPortIds.has(p.id) && p.index!==2).map(p=>p.id);
  const store = createFoupStore({ports,initialPortIds:initial,isDestroyed:destruction.isDestroyed});
  const protectedTools = [0,41,359];
  const sim = createResidentSimulation({fleet,store,destruction,random,excludedNames:['느긋한 칩'],protectedIds:()=>protectedTools,
    detachCargo(v){const r=store.adopt(`vehicle:${v.id}`,v.state.foup,v.state.parked?v.state.target.id:null);fleet.detachCargo(v.id);if(!v.state.parked)store.launch(r,{...v.state.foup},{x:0,y:0,z:2});} });
  assert.equal(sim.people.length,30); assert.deepEqual(sim.state.roles,RESIDENT_ROLES);
  assert.equal(new Set(sim.people.map(p=>p.name)).size,30);
  assert.ok(sim.people.every(p=>[...p.name].length<=7&&p.name!=='느긋한 칩'));
  assert.equal(fleet.vehicles.filter(v=>v.residentId&&v.passenger).length,5);
  const count=store.records.size;
  const travel=new Map(sim.people.filter(p=>p.role==='rider').map(p=>[p.id,{x:p.x,z:p.z,length:0}]));
  for(let tick=0;tick<18000;tick++) {
    fleet.step(.05);store.step(.05);sim.update(.05);
    for(const p of sim.people.filter(p=>p.role==='rider')) { const prior=travel.get(p.id);prior.length+=Math.hypot(p.x-prior.x,p.z-prior.z);prior.x=p.x;prior.z=p.z; }
    if(tick%200===0) {
      for(const p of sim.people) {
        assert.ok([p.x,p.y,p.z].every(Number.isFinite));
        if(p.role!=='rider')assert.equal(isBlocked(p.x,p.z,.295),false,`${p.id} blocked ${p.phase}`);
        if(p.role==='resting')assert.ok(restPoseFits(p,p.heading,p.posture));
      }
      assert.ok(protectedTools.every(id=>!broken.has(id)));
      const occupied=[...store.records.values()].filter(r=>r.mode==='port').map(r=>r.portId);
      assert.equal(new Set(occupied).size,occupied.length);
      assert.equal(store.records.size,count,'No FOUP copies accumulate');
    }
  }
  assert.ok(sim.state.actions.throws>15,JSON.stringify(sim.state.actions));
  assert.ok(sim.state.actions.placements>10,JSON.stringify(sim.state.actions));
  assert.ok(sim.state.actions.repairs>10,JSON.stringify(sim.state.actions));
  assert.ok(sim.state.actions.breaks>10,JSON.stringify(sim.state.actions));
  for(const [id,trip] of travel)assert.ok(trip.length>150,`${id} must keep touring: ${trip.length}m`);
  for(const role of ['thrower','breaker','repairer'])assert.ok(sim.people.filter(p=>p.role===role).every(p=>p.actions>0),`${role}: ${JSON.stringify(sim.state.people.filter(p=>p.role===role))}`);
  const working=sim.people.find(p=>p.targetId!==null);
  if(working){const id=working.targetId;sim.yieldMachine(id);assert.equal(working.targetId,null);assert.ok(!repairs.has(id));}
});

test('two resident repairers may each rebuild one tool while the player keeps a separate single-tool repair',()=>{
  const scene=new THREE.Scene(), effect=createEquipmentDestruction({THREE,scene,machines:machines.slice(0,8)});
  try {
    for(let id=0;id<8;id++)effect.trigger(id);
    for(let id=0;id<2;id++)assert.equal(effect.beginRepair(id,`resident:${id}`),true);
    assert.equal(effect.beginRepair(5,'resident:0'),false);
    assert.equal(effect.beginRepair(0,'player'),false);
    assert.equal(effect.beginRepair(5),true); assert.equal(effect.beginRepair(6),false);
    for(let id=0;id<6;id++)effect.setRepairProgress(id,.5);
    assert.equal(effect.state.repairing.length,3);
    effect.cancelRepair(0); assert.equal(effect.beginRepair(6,'resident:0'),true);
    effect.reset(5); assert.ok(!effect.isDestroyed(5));assert.ok(effect.isDestroyed(7));
  }finally{effect.dispose();}
});

test('FOUP ownership is exclusive between the player and all resident hands',()=>{
  const p=ports[0], store=createFoupStore({ports,initialPortIds:[p.id]});
  assert.equal(store.pickup(`port:${p.id}`,'resident:0'),true);
  assert.equal(store.pickup(`port:${p.id}`),false);assert.equal(store.carried,null);
  assert.equal(store.pickup(`port:${p.id}`,'resident:1'),false);
  assert.equal(store.place(ports[1].id,'resident:0'),true);
  assert.equal(store.pickup(`port:${p.id}`),true);assert.ok(store.carried);
  assert.equal(store.getCarried('resident:0'),null);assert.equal(store.records.size,1);
});
