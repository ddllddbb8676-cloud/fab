import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createExplorer } from '../src/explorer.js';
import { bays, machines, isBlocked } from '../src/layout.js';
import { setRuntimeObstacles } from '../src/runtime-obstacles.js';
import { findWalkPath } from '../src/walking.js';

function setup({ colliders = [] } = {}) {
  const priorDocument = globalThis.document, priorWindow = globalThis.window;
  const canvasEvents = new Map(), windowEvents = new Map();
  globalThis.document = { getElementById: () => ({ classList: { contains: name => name === 'hidden', add() {}, remove() {} } }), querySelectorAll: () => [], addEventListener() {} };
  globalThis.window = { addEventListener: (name, fn) => windowEvents.set(name, fn) };
  const camera = new THREE.PerspectiveCamera(64, 16 / 9, .08, 420);
  const canvas = { addEventListener: (name, fn) => canvasEvents.set(name, fn), setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) };
  const port = bays[4].target;
  const explorer = createExplorer({ THREE, camera, canvas, scene: new THREE.Scene(), avatar: { root: new THREE.Group(), update() {} },
    orbit: { enabled: false, target: new THREE.Vector3(), update() {} }, colliders,
    vehicles: [{ state: { phase: 1, target: port, destination: port, car: { x: port.x, z: port.z, yaw: 0 }, travelling: false } }],
    onMode() {}, onInspect() {}, onToast() {} });
  explorer.state.position.set(-28.7, 0, bays[4].z); explorer.update(0);
  return { explorer, camera,
    key(type, key) { windowEvents.get(type)({ key, target: { closest: () => false }, preventDefault() {} }); },
    drag(dx, dy = 0) {
      canvasEvents.get('pointerdown')({ pointerId: 1, clientX: 640, clientY: 360 });
      canvasEvents.get('pointermove')({ pointerId: 1, clientX: 640 + dx, clientY: 360 + dy });
      canvasEvents.get('pointerup')({ pointerId: 1, clientX: 640 + dx, clientY: 360 + dy });
    },
    dispose() { setRuntimeObstacles([]); globalThis.document = priorDocument; globalThis.window = priorWindow; }
  };
}

test('keyboard acceleration and release are eased and give equal travel at 30, 60 and 120 Hz', () => {
  const results = [];
  for (const hz of [30, 60, 120]) {
    const h = setup();
    try {
      const start = h.explorer.state.position.clone(); h.key('keydown', 'w');
      h.explorer.update(1 / hz);
      assert.ok(h.explorer.state.speed > 0 && h.explorer.state.speed < .55, 'first movement frame accelerates gradually');
      for (let i = 1; i < hz; i++) h.explorer.update(1 / hz);
      const release = h.explorer.state.position.clone(); h.key('keyup', 'w');
      for (let i = 0; i < hz; i++) h.explorer.update(1 / hz);
      assert.ok(h.explorer.state.position.distanceTo(release) < .15, 'release has a short controlled deceleration');
      assert.ok(h.explorer.state.speed < 1e-5);
      results.push({ travel: start.distanceTo(h.explorer.state.position), camera: h.camera.position.clone() });
    } finally { h.dispose(); }
  }
  for (const r of results.slice(1)) {
    assert.ok(Math.abs(r.travel - results[0].travel) < 1e-8);
    assert.ok(r.camera.distanceTo(results[0].camera) < .002, 'camera trailing distance is stable across frame rates');
  }
});

test('drag input eases into the orbit and walk/tour switching does not snap to the target angle', () => {
  const h = setup();
  try {
    const start = h.camera.position.clone(); h.drag(150, 20);
    assert.ok(h.camera.position.equals(start), 'pointer events update only the orbit target');
    h.explorer.update(1 / 60);
    const firstStep = h.camera.position.distanceTo(start);
    assert.ok(firstStep > .05 && firstStep < .9, 'one drag does not jump the camera to its full target');
    const beforeToggle = h.camera.position.clone(); h.explorer.setMode('tour'); h.explorer.update(1 / 60);
    assert.ok(h.camera.position.distanceTo(beforeToggle) < .8, 'walk to tour retains the partially eased view');
    const beforeWalk = h.camera.position.clone(); h.explorer.setMode('walk'); h.explorer.update(1 / 60);
    assert.ok(h.camera.position.distanceTo(beforeWalk) < .8);
  } finally { h.dispose(); }
});

test('collision shortens the camera immediately but restores distance smoothly after the obstacle clears', () => {
  const h = setup();
  try {
    h.explorer.state.yaw = 0; h.explorer.state.elevation = .1;
    for (let i = 0; i < 90; i++) h.explorer.update(1 / 60);
    const x = h.explorer.state.position.x, z = h.explorer.state.position.z;
    setRuntimeObstacles([{ minX: x - 2, maxX: x + 2, minZ: z + 1.5, maxZ: z + 1.7, minY: 0, maxY: 5 }]);
    h.explorer.update(1 / 60);
    assert.ok(h.camera.position.z < z + 1.38, 'the first frame already stays on the near side of the collider');
    for (let i = 0; i < 60; i++) h.explorer.update(1 / 60);
    const shortened = h.camera.position.clone();
    setRuntimeObstacles([]); h.explorer.update(1 / 60);
    assert.ok(h.camera.position.distanceTo(shortened) < .3, 'clearing an obstacle does not cause an outward camera jump');
    let previousZ = h.camera.position.z;
    for (let i = 0; i < 60; i++) {
      h.explorer.update(1 / 60);
      assert.ok(h.camera.position.z >= previousZ - 1e-9); previousZ = h.camera.position.z;
    }
    assert.ok(h.camera.position.z > z + 4, 'full orbit distance returns after easing');
  } finally { h.dispose(); }
});

test('a tap route consumes corners without an idle frame and retains the narrow side passage', () => {
  const h = setup({ colliders: machines.map(m => ({ ...m.bounds })) });
  try {
    const row = bays[4].machines.filter(m => m.sign === 1), x = (row[3].x + row[4].x) / 2;
    h.explorer.state.position.set(x, 0, bays[4].z); h.explorer.state.yaw = 0;
    const target = { x, z: (bays[3].z + bays[4].z) / 2 };
    h.explorer.state.path = findWalkPath(h.explorer.state.position, target);
    assert.ok(h.explorer.state.path);
    for (let i = 0; i < 600 && h.explorer.state.path.length; i++) {
      h.explorer.update(1 / 60);
      assert.ok(!isBlocked(h.explorer.state.position.x, h.explorer.state.position.z, .23));
    }
    assert.ok(Math.hypot(h.explorer.state.position.x - target.x, h.explorer.state.position.z - target.z) < 1e-5);
    h.explorer.state.position.set(-28.7, 0, bays[4].z);
    h.explorer.state.path = [{ x: -29.7, z: bays[4].z }, { x: -29.7, z: bays[4].z + 1 }];
    let sawCorner = false;
    for (let i = 0; i < 100 && h.explorer.state.path.length; i++) {
      const before = h.explorer.state.path.length; h.explorer.update(1 / 60);
      if (before === 2 && h.explorer.state.path.length === 1) sawCorner = true;
      if (i > 20 && h.explorer.state.path.length) assert.ok(h.explorer.state.speed > .05, 'no zero-motion frame at a waypoint');
    }
    assert.ok(sawCorner);
  } finally { h.dispose(); }
});
