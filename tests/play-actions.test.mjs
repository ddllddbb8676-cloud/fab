import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAvatar } from '../src/avatar.js';
import { createExplorer } from '../src/explorer.js';
import { createPlayActions, boardingMachine, boardingApproach, NO_LOADPORT_MESSAGE } from '../src/play-actions.js';
import { createFleet, reservedPortIds } from '../src/network-transport.js';
import { machines, ports, isBlocked, SEATED_FOUP_Y } from '../src/layout.js';
import { createFoupStore } from '../src/foup-play.js';
import { VISITOR_NAMES, createVisitorName } from '../src/visitor-name.js';

function harness({ destroyed = false,networkFactory=null } = {}) {
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  globalThis.document = { hidden: false, getElementById: () => ({ classList: { contains: () => true, add() {}, remove() {} } }), addEventListener() {} };
  globalThis.window = { addEventListener() {} };
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(64, 390 / 844, .08, 420), avatar = createAvatar(THREE), fleet = createFleet(1), toasts = [], hidden = [];
  const v = fleet.vehicles[0], m = boardingMachine(v.state.car);
  const initial = m.ports.find(p => !reservedPortIds.has(p.id)), empty = m.ports.find(p => p.id !== initial.id && !reservedPortIds.has(p.id));
  const listeners = new Map(); let play;
  const canvas = { addEventListener(name,fn) { listeners.set(name,fn); }, setPointerCapture() {}, getBoundingClientRect:()=>({left:0,top:0,width:390,height:844}) };
  const explorer = createExplorer({ THREE, camera, scene, avatar, canvas, orbit: { target: new THREE.Vector3(), update() {} }, colliders: [], vehicles: [{ state: v.state }], onMode() {}, onToast: t => toasts.push(t), onInspect() {}, onActionTap:ray=>play.tap(ray) });
  explorer.state.position.set(v.state.car.x, 0, m.z + m.sign * 4.1);
  const materials = Object.fromEntries(['foup', 'foupDoor', 'dark', 'foupRib'].map(k => [k, new THREE.MeshStandardMaterial()]));
  const network=networkFactory?.({fleet,explorer,avatar,v,m});
  play = createPlayActions({ THREE, scene, materials, fleet, explorer, avatar, network, initialPortIds: [initial.id], hideOriginal: id => hidden.push(id), isDestroyed: id => destroyed && id === m.id, toast: t => toasts.push(t) });
  return { scene, camera, listeners, avatar, fleet, explorer, play, v, m, initial, empty, toasts, hidden,
    step(seconds) { for (let t = 0; t < seconds; t += 1 / 60) { if(!network)fleet.step(1 / 60); play.update(1 / 60); explorer.update(1 / 60); play.render(); } },
    dispose() { play.dispose();avatar.dispose(); for (const material of Object.values(materials)) material.dispose(); globalThis.document = previousDocument; globalThis.window = previousWindow; }
  };
}

test('all generated visitor names include an adjective and stay within seven characters including the space', () => {
  assert.ok(VISITOR_NAMES.length > 200);
  assert.ok(VISITOR_NAMES.every(name => [...name].length <= 7 && name.includes(' ')));
  for (let i = 0; i <= 1000; i++) assert.ok(VISITOR_NAMES.includes(createVisitorName(() => i / 1000)));
});

test('a real canvas pointer tap retains the FOUP approach path until pickup',()=>{
  const h=harness();
  try {
    const p=h.initial;
    h.camera.position.set(p.x,2.1,p.z+p.sign*4);h.camera.lookAt(p.x,SEATED_FOUP_Y,p.z);h.camera.updateMatrixWorld();
    const event={pointerId:1,clientX:195,clientY:422};
    h.listeners.get('pointerdown')(event);h.listeners.get('pointerup')(event);
    assert.equal(h.play.state.phase,'approach');assert.ok(h.explorer.state.path.length>0);
    h.step(5);assert.equal(h.play.state.carriedId,`port:${p.id}`);
  }finally{h.dispose();}
});

test('a canvas tap on a passing OHT retains its path, climbs and boards',()=>{
  const h=harness();
  try {
    const p=h.v.state.car;
    h.camera.position.set(p.x,3,p.z+h.m.sign*4);h.camera.lookAt(p.x,3.94,p.z);h.camera.updateMatrixWorld();
    const event={pointerId:1,clientX:195,clientY:422};
    h.listeners.get('pointerdown')(event);h.listeners.get('pointerup')(event);
    assert.equal(h.play.state.phase,'approach');assert.ok(h.explorer.state.path.length>0);
    h.step(7);assert.equal(h.play.state.phase,'riding');assert.equal(h.v.passenger,true);
  }finally{h.dispose();}
});

test('boarding climbs the intact tool, hangs from the OHT, drops its cargo once and lands in a walkable spot', () => {
  const h = harness();
  try {
    assert.equal(h.play.requestBoard(h.v.id), true); assert.equal(h.v.boardingHold, true);
    const initial = { ...h.v.state.car }; h.step(.1); assert.deepEqual(h.v.state.car, initial);
    h.step(7);
    assert.equal(h.play.state.phase, 'riding'); assert.equal(h.v.passenger, true);
    assert.equal(h.v.cargoDetached, true); assert.equal(h.play.state.moved.length, 1);
    assert.equal(h.explorer.state.position.y, 2.16);
    assert.ok(h.avatar.root.userData.pressHandWorld.y > 3.7, 'both raised arms reach the OHT');
    h.step(15); assert.equal(h.play.state.moved.length, 1);
    assert.equal(h.play.state.moved[0].mode, 'ground');
    assert.equal(h.play.dismount(), true); h.step(3);
    assert.equal(h.play.state.phase, 'idle'); assert.equal(h.v.passenger, false);
    assert.equal(h.explorer.state.position.y, 0); assert.equal(h.explorer.state.mode, 'walk');
    assert.equal(isBlocked(h.explorer.state.position.x, h.explorer.state.position.z, .295), false);
  } finally { h.dispose(); }
});

test('destroyed equipment denies boarding with the requested message and does not stop or empty the OHT', () => {
  const h = harness({ destroyed: true });
  try {
    assert.equal(h.play.requestBoard(h.v.id), true);
    assert.equal(h.toasts.at(-1), '장비가 부셔져서 탈 수가 없어요');
    assert.equal(h.play.state.phase, 'idle'); assert.ok(!h.v.boardingHold && !h.v.cargoDetached);
  } finally { h.dispose(); }
});

test('an OHT over a route without loadports explains the boarding location instead of reporting broken equipment',()=>{
  const h=harness();try{
    h.v.state.car={x:0,z:0,yaw:0};assert.equal(boardingMachine(h.v.state.car),null);
    assert.equal(h.play.requestBoard(h.v.id),true);assert.equal(h.toasts.at(-1),NO_LOADPORT_MESSAGE);
    assert.equal(h.play.state.phase,'idle');assert.ok(!h.v.boardingHold&&!h.v.cargoDetached);
  }finally{h.dispose();}
});

test('online boarding reaches the server-held position even when the displayed OHT is two metres behind',async()=>{
  let destination,climbedAt,boardCalls=0;
  const h=harness({networkFactory:({explorer,v,m})=>{
    const actual={x:m.x+1,z:v.state.car.z,yaw:v.state.car.yaw};v.state.car={...actual,x:m.x-1};destination=boardingApproach(actual,m);
    return {connected:true,async command(kind){
      if(kind==='board'){boardCalls++;return {ok:true,machineId:m.id,approach:destination,boardingCar:actual};}
      if(kind==='climb'){climbedAt={x:explorer.state.position.x,z:explorer.state.position.z};return {ok:Math.hypot(climbedAt.x-actual.x,climbedAt.z-actual.z)<=1.6,boardingCar:actual,message:'로드포트 앞으로 조금 더 가까이 와 주세요'};}
      if(kind==='ride'){v.state.car={...actual};return {ok:true};}
      return {ok:true};
    }};
  }});
  try{
    assert.equal(h.play.requestBoard(h.v.id),true);await Promise.resolve();
    assert.deepEqual(h.explorer.state.path.at(-1),destination);
    h.play.requestBoard(h.v.id);assert.equal(boardCalls,1,'repeated taps keep the same reservation');
    for(let i=0;i<40;i++){h.step(.2);await Promise.resolve();}
    assert.ok(climbedAt);assert.ok(Math.hypot(climbedAt.x-destination.x,climbedAt.z-destination.z)<.03);
    assert.equal(h.play.state.phase,'riding');assert.ok(!h.toasts.some(t=>t.includes('가까이 와')));
  }finally{h.dispose();}
});

test('a clicked port FOUP is carried to another empty port then thrown without duplicating it', () => {
  const h = harness();
  try {
    const p = h.initial, origin = new THREE.Vector3(p.x, 1.7, p.z + p.sign * 2);
    assert.equal(h.play.tap(new THREE.Ray(origin, new THREE.Vector3(p.x, SEATED_FOUP_Y, p.z).sub(origin).normalize())), true);
    h.step(4); assert.equal(h.play.state.carriedId, `port:${p.id}`); assert.deepEqual(h.hidden, [p.id]);
    assert.equal(h.play.requestPlace(h.empty), true); h.step(4);
    assert.equal(h.play.state.carriedId, null); assert.equal(h.play.state.moved[0].portId, h.empty.id);
    const target = h.empty, from = new THREE.Vector3(target.x, 1.7, target.z + target.sign * 2);
    h.play.tap(new THREE.Ray(from, new THREE.Vector3(target.x, SEATED_FOUP_Y, target.z).sub(from).normalize())); h.step(3);
    assert.equal(h.play.throwFoup(), true); h.step(4);
    assert.equal(h.play.state.moved.length, 1); assert.equal(h.play.state.moved[0].mode, 'broken');
    assert.equal(h.play.state.carriedId, null); assert.deepEqual(h.hidden, [p.id]);
  } finally { h.dispose(); }
});

test('tapping scattered wafers walks over, shows a broom and removes the debris after sweeping',()=>{
  const h=harness();try{
    h.explorer.state.position.set(0,0,30);const record=h.play.store.records.get(`port:${h.initial.id}`);
    h.play.store.launch(record,{x:0,y:1,z:31,yaw:0},{x:0,y:2,z:1},{shatter:true});h.step(4);
    assert.equal(record.mode,'broken');h.camera.position.set(record.x,3,record.z-5);h.camera.lookAt(record.x,.15,record.z);h.camera.updateMatrixWorld();
    const event={pointerId:1,clientX:195,clientY:422};h.listeners.get('pointerdown')(event);h.listeners.get('pointerup')(event);
    assert.equal(h.play.state.phase,'approach');h.step(2);assert.equal(h.play.state.phase,'cleaning');assert.equal(h.avatar.root.getObjectByName('sweep-broom').visible,true);
    h.step(3.3);assert.equal(record.mode,'cleared');assert.equal(h.play.state.phase,'idle');assert.equal(h.avatar.root.getObjectByName('sweep-broom').visible,false);assert.equal(h.explorer.state.mode,'walk');
  }finally{h.dispose();}
});

test('canceling a sweep restores normal movement and leaves debris available to clean',()=>{
  const h=harness();try{
    h.explorer.state.position.set(0,0,30);const record=h.play.store.records.get(`port:${h.initial.id}`);
    h.play.store.launch(record,{x:0,y:1,z:31,yaw:0},{x:0,y:2,z:1},{shatter:true});h.step(4);
    h.play.requestCleanup(record);h.step(2);assert.equal(h.play.state.phase,'cleaning');h.play.clearPending();h.step(.2);
    assert.equal(record.mode,'broken');assert.equal(record.cleaner,null);assert.equal(h.play.state.phase,'idle');assert.equal(h.explorer.state.cleaningTime,null);
    assert.equal(h.explorer.beginJoystick(),true);
  }finally{h.dispose();}
});

test('FOUP inventory refuses occupied/destroyed ports and preserves identity across pickup and placement', () => {
  const selected = ports.slice(0, 3), hidden = [];
  const store = createFoupStore({ ports: selected, initialPortIds: [selected[0].id, selected[1].id], hideOriginal: id => hidden.push(id) });
  assert.equal(store.pickup(`port:${selected[0].id}`), true);
  assert.equal(store.place(selected[1].id), false);
  assert.equal(store.place(selected[2].id), true); assert.equal(store.records.size, 2);
  assert.equal(store.atPort(selected[0].id), null); assert.equal(store.atPort(selected[2].id).id, `port:${selected[0].id}`);
});

test('passenger routes visit every bay without unloading or moving off the rail', () => {
  const fleet = createFleet(1), v = fleet.vehicles[0], visited = new Set();
  fleet.detachCargo(v.id); fleet.boardPassenger(v.id);
  let previous = { ...v.state.car };
  for (let time = 0; time < 2400; time += .5) {
    fleet.step(.5); visited.add(v.currentPort.bayId);
    assert.ok(Math.hypot(v.state.car.x - previous.x, v.state.car.z - previous.z) <= v.speed * .5 + .001);
    assert.equal(v.state.lowered, 0); assert.ok([4, 8].includes(v.phase)); previous = { ...v.state.car };
  }
  assert.equal(visited.size, 18);
});
