import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createExplorer } from '../src/explorer.js';
import { WALK_SPEED, CHASE_CAMERA, stickVector, cameraRelativeMove } from '../src/locomotion.js';
import { stepWalker, WALK_RADIUS } from '../src/walking.js';
import { bays, isBlocked } from '../src/layout.js';
import { setRuntimeObstacles } from '../src/runtime-obstacles.js';

function setup(options = {}) {
  const priorDocument = globalThis.document, priorWindow = globalThis.window;
  const events = new Map(), windowEvents = new Map(), docEvents = new Map();
  let actions = 0, manual = 0, help = false;
  globalThis.document = { hidden: false, getElementById: id => ({ classList: {
    contains: () => id === 'help' ? !help : true, add() {} } }), addEventListener: (key, fn) => docEvents.set(key, fn) };
  globalThis.window = { addEventListener: (key, fn) => windowEvents.set(key, fn) };
  const camera = new THREE.PerspectiveCamera(CHASE_CAMERA.fov, 390 / 844, .08, 420);
  const explorer = createExplorer({ THREE, camera, scene: new THREE.Scene(),
    canvas: { addEventListener: (key, fn) => events.set(key, fn), setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) },
    avatar: { root: new THREE.Group(), update() {} }, orbit: { target: new THREE.Vector3(), update() {} },
    vehicles: [], colliders: [], onMode() {}, onInspect() {}, onToast() {},
    onManualMove() { manual++; }, onActionTap() { actions++; return true; }, ...options });
  explorer.state.position.set(0, 0, 78); explorer.state.yaw = 0; explorer.update(0);
  return { explorer, camera, events, windowEvents, docEvents, setHelp(value) { help = value; },
    get actions() { return actions; }, get manual() { return manual; },
    close() { setRuntimeObstacles([]); globalThis.document = priorDocument; globalThis.window = priorWindow; } };
}

test('stick has a circular dead zone, bounded diagonals and camera-relative axes', () => {
  assert.deepEqual(stickVector(.05, -.05), { x: 0, y: 0 });
  assert.deepEqual(stickVector(NaN, 1), { x: 0, y: 0 });
  assert.ok(Math.abs(Math.hypot(...Object.values(stickVector(3, 3))) - 1) < 1e-10);
  assert.ok(Math.abs(stickVector(.56, 0).x - .5) < 1e-10);
  const move = cameraRelativeMove(0, 1, Math.PI / 2);
  assert.ok(Math.abs(move.x + 1) < 1e-10 && Math.abs(move.z) < 1e-10);
});

test('joystick travel is equal at 30/60/120 Hz, holds camera heading and stops on release', () => {
  const distances = [];
  for (const hz of [30, 60, 120]) {
    const h = setup();
    try {
      const e = h.explorer, start = e.state.position.clone();
      assert.equal(e.beginJoystick(), true); e.moveJoystick(0, 1);
      for (let i = 0; i < hz; i++) e.update(1 / hz);
      distances.push(start.distanceTo(e.state.position));
      assert.equal(e.state.yaw, 0); assert.ok(e.state.speed <= WALK_SPEED + 1e-9);
      const beforeTurn = e.state.position.clone(); e.moveJoystick(0, -1); e.update(1 / hz);
      assert.ok(e.state.position.z > beforeTurn.z, 'reversal responds on the next frame');
      e.endJoystick(); const stopped = e.state.position.clone();
      for (let i = 0; i < hz; i++) e.update(1 / hz);
      assert.ok(e.state.position.equals(stopped)); assert.equal(e.state.speed, 0);
    } finally { h.close(); }
  }
  assert.ok(distances[0] > 3 && distances[0] < 3.2);
  for (const d of distances) assert.ok(Math.abs(d - distances[0]) < 1e-8);
});

test('camera finger can turn while moving and never triggers an equipment tap in either release order', () => {
  for (const releaseMovementFirst of [true, false]) {
    const h = setup();
    try {
      const e = h.explorer, p = { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 400 };
      e.beginJoystick(); e.moveJoystick(0, 1); h.events.get('pointerdown')(p);
      h.events.get('pointermove')({ ...p, clientX: 340 }); e.update(.05);
      assert.ok(e.state.yaw < 0); assert.ok(e.state.speed > 0);
      if (releaseMovementFirst) e.endJoystick();
      h.events.get('pointerup')({ ...p, clientX: 340 });
      if (!releaseMovementFirst) { assert.equal(e.state.joystickActive, true); e.endJoystick(); }
      assert.equal(h.actions, 0);
      e.beginJoystick(); e.moveJoystick(0, 1); h.events.get('pointerdown')(p);
      e.endJoystick(); h.events.get('pointerup')(p); assert.equal(h.actions, 0, 'even a stationary camera finger is not an action tap');
    } finally { h.close(); }
  }
});

test('manual movement cancels approach and old routes, and lock/help/hidden/blur cannot leave held movement', () => {
  const h = setup();
  try {
    const e = h.explorer;
    e.state.path = [{ x: 0, z: 70 }]; assert.ok(e.beginJoystick()); assert.equal(e.state.path.length, 0); assert.equal(h.manual, 1);
    for (const stop of [() => e.lock(true), () => h.setHelp(true), () => { document.hidden = true; }, () => h.windowEvents.get('blur')()]) {
      e.lock(false); h.setHelp(false); document.hidden = false; e.beginJoystick(); e.moveJoystick(0, 1); stop(); e.update(.05);
      assert.equal(e.state.joystickActive, false); assert.equal(e.state.speed, 0);
    }
    e.lock(false); h.setHelp(false); document.hidden = false;
    e.state.position.set(-28.7, 0, bays[4].z);
    let pressed = 0, cancelled = 0;
    assert.ok(e.approachEmo(bays[4].machines[4], { onPress: () => pressed++, onCancel: () => cancelled++ }));
    e.beginJoystick(); assert.equal(e.state.emoInteraction, null); assert.equal(cancelled, 1); assert.equal(pressed, 0);
  } finally { h.close(); }
});

test('manual sliding preserves 65 cm passages and stops at doors and protected-zone boundaries', () => {
  const row = bays[4].machines.filter(m => m.sign === 1), x = (row[3].x + row[4].x) / 2;
  let p = { x, z: bays[4].z };
  for (let i = 0; i < 150; i++) { p = stepWalker(p, 0, -.05); assert.equal(isBlocked(p.x, p.z, WALK_RADIUS), false); }
  assert.ok(Math.abs(p.z - (bays[4].z - 7.5)) < 1e-8);
  p = stepWalker({ x: -.01, z: 78 }, 1, -1, { canTraverse: (_, b) => b.x <= 0 });
  assert.equal(p.x, -.01); assert.ok(p.z < 77.1, 'slides along a protected boundary');
  setRuntimeObstacles([{ minX: -3, maxX: 3, minZ: 77, maxZ: 77.001 }]);
  try { p = stepWalker({ x: 0, z: 78 }, 0, -10); assert.ok(p.z >= 77 + WALK_RADIUS); }
  finally { setRuntimeObstacles([]); }
});

test('repair penalty permits overview and returning to walking without clearing the penalty', () => {
  const h=setup();
  try {
    const e=h.explorer;e.state.penalty=3;
    const before=e.state.position.clone();e.setMode('overview');
    assert.equal(e.state.mode,'overview');assert.ok(e.state.position.equals(before));
    e.setMode('ride');assert.equal(e.state.mode,'overview','OHT spectator mode is still restricted');
    e.setMode('walk');assert.equal(e.state.mode,'walk');assert.equal(e.state.penalty,3);
    assert.equal(e.beginJoystick(),true);e.moveJoystick(0,1);e.update(.05);
    assert.ok(e.state.position.distanceTo(before)>0);
  } finally {h.close();}
});
