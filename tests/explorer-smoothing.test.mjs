import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WALK_SPEED } from '../src/locomotion.js';
import { createExplorer } from '../src/explorer.js';
import { bays, machines, isBlocked, HALL } from '../src/layout.js';
import { stockers, stockerBounds } from '../src/stocker-layout.js';
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
    key(type, key) { windowEvents.get(type)?.({ key, target: { closest: () => false }, preventDefault() {} }); },
    tapFloor(point, pointerType = 'mouse') {
      camera.updateMatrixWorld(true);
      const p = new THREE.Vector3(point.x, 0, point.z).project(camera);
      assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1, 'the tapped destination is visible in the canvas');
      const event = { pointerId: 1, pointerType, clientX: (p.x + 1) * 640, clientY: (1 - p.y) * 360 };
      canvasEvents.get('pointerdown')(event); canvasEvents.get('pointerup')(event);
    },
    drag(dx, dy = 0) {
      canvasEvents.get('pointerdown')({ pointerId: 1, clientX: 640, clientY: 360 });
      canvasEvents.get('pointermove')({ pointerId: 1, clientX: 640 + dx, clientY: 360 + dy });
      canvasEvents.get('pointerup')({ pointerId: 1, clientX: 640 + dx, clientY: 360 + dy });
    },
    dispose() { setRuntimeObstacles([]); globalThis.document = priorDocument; globalThis.window = priorWindow; }
  };
}

const actualColliders = () => [
  ...machines.map(m => ({ ...m.bounds, cameraBounds: m.walkBounds.map((b, i) => ({ ...b, minY: 0, maxY: i ? 1.45 : 3.4 })) })),
  ...stockerBounds
];
function assertClearCamera(h, colliders) {
  const focus = h.explorer.state.position.clone(); focus.y = 1.02;
  const distance = focus.distanceTo(h.camera.position), ray = new THREE.Ray(focus, h.camera.position.clone().sub(focus).normalize());
  assert.ok(distance >= 3.19, `camera has room around the avatar: ${distance}`);
  assert.ok(h.camera.position.y <= HALL.height - .28 + 1e-8, 'camera remains under the ceiling');
  for (const b of colliders.flatMap(c => c.cameraBounds ?? [c])) {
    const box = new THREE.Box3(new THREE.Vector3(b.minX, b.minY ?? 0, b.minZ), new THREE.Vector3(b.maxX, b.maxY ?? 3.4, b.maxZ));
    const hit = ray.intersectBox(box, new THREE.Vector3());
    assert.ok(!hit || hit.distanceTo(focus) > distance, 'no cabinet between the avatar and camera');
  }
}

test('65 cm side gaps and rear aisles keep a distant camera without changing the chosen yaw or zoom', () => {
  const colliders = actualColliders(), row = bays[4].machines.filter(m => m.sign === 1);
  const gapX = (row[3].x + row[4].x) / 2;
  for (const hz of [30, 60, 120]) for (const pose of [
    { x: gapX, z: row[3].z, yaw: Math.PI / 2 },
    { x: row[3].x, z: (bays[3].z + bays[4].z) / 2, yaw: 0 }
  ]) {
    const h = setup({ colliders });
    try {
      h.camera.aspect = 390 / 844; h.camera.fov = 72; h.camera.updateProjectionMatrix();
      h.explorer.state.position.set(pose.x, 0, pose.z); h.explorer.state.yaw = pose.yaw;
      for (let i = 0; i < hz * 3; i++) h.explorer.update(1 / hz);
      assertClearCamera(h, colliders);
      assert.equal(h.explorer.state.yaw, pose.yaw); assert.equal(h.explorer.state.distance, 5.8);
      h.camera.updateMatrixWorld();
      for (const x of [-.4, .4]) for (const y of [0, 1.85]) for (const z of [-.4, .4]) {
        const p = new THREE.Vector3(pose.x + x, y, pose.z + z).project(h.camera);
        assert.ok(Math.abs(p.x) < .85 && Math.abs(p.y) < .85, 'avatar and headwear fit in the mobile view');
      }
    } finally { h.dispose(); }
  }
});

test('both stocker IN and OUT approaches keep space even when the orbit points into the tall cabinet', () => {
  const colliders = actualColliders();
  for (const stocker of stockers) for (const port of stocker.ports) for (const yaw of [stocker.yaw, stocker.yaw + Math.PI]) {
    const h = setup({ colliders });
    try {
      h.explorer.state.position.set(port.approach.x, 0, port.approach.z);
      h.explorer.state.yaw = yaw; h.explorer.state.elevation = .3;
      for (let i = 0; i < 180; i++) h.explorer.update(1 / 60);
      assertClearCamera(h, colliders);
      assert.equal(h.explorer.state.yaw, yaw); assert.equal(h.explorer.state.distance, 5.8);
    } finally { h.dispose(); }
  }
});

test('leaving a cabinet lowers the lifted camera smoothly and restores the original orbit', () => {
  const colliders = [{ minX: -27.2, maxX: -27, minZ: -3, maxZ: 3, minY: 0, maxY: 3.4 }], h = setup({ colliders });
  try {
    for (let i = 0; i < 180; i++) h.explorer.update(1 / 60);
    const lifted = h.camera.position.clone();
    assert.ok(lifted.y > 3, 'view lifts beside the cabinet');
    h.explorer.state.path = [{ x: -28.7, z: 8 }];
    let previous = lifted;
    for (let i = 0; i < 480; i++) {
      h.explorer.update(1 / 60);
      assert.ok(h.camera.position.distanceTo(previous) < .35, 'moving into the aisle does not snap the camera down');
      previous = h.camera.position.clone();
    }
    const focus = h.explorer.state.position.clone(); focus.y = 1.02;
    assert.ok(Math.abs(h.camera.position.distanceTo(focus) - 5.8) < .01);
    assert.ok(Math.abs(h.camera.position.y - (1.02 + Math.sin(.56) * 5.8)) < .01);
  } finally { h.dispose(); }
});

test('stocker framing eases out of a close orbit and includes the loading port on mobile without moving the visitor', () => {
  const colliders = actualColliders();
  for (const stocker of stockers) for (const port of stocker.ports) {
    const h = setup({ colliders });
    try {
      h.camera.aspect = 390 / 844; h.camera.fov = 72; h.camera.updateProjectionMatrix();
      h.explorer.state.position.set(port.approach.x, 0, port.approach.z);
      h.explorer.state.yaw = stocker.yaw + Math.PI; h.explorer.state.distance = 2;
      for (let i = 0; i < 180; i++) h.explorer.update(1 / 60);
      const cameraBefore = h.camera.position.clone(), visitorBefore = h.explorer.state.position.clone();
      h.explorer.frameStocker(port);
      assert.ok(h.camera.position.equals(cameraBefore), 'request does not snap the camera');
      assert.ok(h.explorer.state.position.equals(visitorBefore));
      for (let i = 0; i < 240; i++) h.explorer.update(1 / 60);
      assertClearCamera(h, colliders); h.camera.updateMatrixWorld();
      for (const y of [1.46, 2.3]) {
        const p = new THREE.Vector3(port.x, y, port.z).project(h.camera);
        assert.ok(Math.abs(p.x) < .8 && Math.abs(p.y) < .8, 'port and sign stay in the screen');
      }
      const yaw = h.explorer.state.yaw; h.drag(80);
      assert.notEqual(h.explorer.state.yaw, yaw, 'player can still adjust the view immediately');
    } finally { h.dispose(); }
  }
});

test('lifting the view in a narrow gap does not steer a held joystick toward the neighbouring cabinet', () => {
  const row = bays[4].machines.filter(m => m.sign === 1), x = (row[3].x + row[4].x) / 2;
  const h = setup({ colliders: actualColliders() });
  try {
    h.explorer.state.position.set(x, 0, row[3].z); h.explorer.state.yaw = Math.PI / 2;
    for (let i = 0; i < 120; i++) h.explorer.update(1 / 60);
    assert.ok(h.explorer.beginJoystick()); h.explorer.moveJoystick(-1, 0);
    for (let i = 0; i < 60; i++) h.explorer.update(1 / 60);
    assert.ok(Math.abs(h.explorer.state.position.x - x) < .015, 'camera lift must not turn the joystick direction');
    assert.ok(h.explorer.state.position.z > row[3].z + 2.9);
    h.explorer.endJoystick(); const stopped = h.explorer.state.position.clone(); h.explorer.update(1 / 60);
    assert.ok(h.explorer.state.position.equals(stopped));
  } finally { h.dispose(); }
});

test('floor clicks and touch taps accelerate smoothly with equal travel at 30, 60 and 120 Hz', () => {
  const results = [];
  for (const hz of [30, 60, 120]) {
    const h = setup();
    try {
      const start = h.explorer.state.position.clone(), destination = { x: start.x - 6, z: start.z };
      h.tapFloor(destination, hz === 60 ? 'touch' : 'mouse');
      assert.ok(h.explorer.state.path.length > 0); assert.ok(h.explorer.state.position.equals(start));
      h.explorer.update(1 / hz);
      assert.ok(h.explorer.state.speed > 0 && h.explorer.state.speed < .65, 'first movement frame accelerates gradually');
      for (let i = 1; i < hz; i++) h.explorer.update(1 / hz);
      results.push({ travel: start.distanceTo(h.explorer.state.position), camera: h.camera.position.clone() });
      for (let i = 0; i < 3 * hz; i++) h.explorer.update(1 / hz);
      assert.ok(Math.hypot(h.explorer.state.position.x - destination.x, h.explorer.state.position.z - destination.z) < 1e-8);
      assert.equal(h.explorer.state.path.length, 0); assert.equal(h.explorer.state.speed, 0);
    } finally { h.dispose(); }
  }
  for (const r of results.slice(1)) {
    assert.ok(Math.abs(r.travel - results[0].travel) < 1e-8);
    assert.ok(r.camera.distanceTo(results[0].camera) < .002, 'camera trailing distance is stable across frame rates');
  }
});

test('WASD, arrow keys and Shift do not move, reroute, accelerate or switch the visitor mode', () => {
  const h = setup();
  try {
    const keys = ['w', 'a', 's', 'd', 'W', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift'];
    const start = h.explorer.state.position.clone();
    for (const key of keys) {
      h.key('keydown', key);
      for (let i = 0; i < 30; i++) h.explorer.update(1 / 60);
      h.key('keyup', key);
      assert.ok(h.explorer.state.position.equals(start), `${key} does not cause movement`);
    }
    const destination = { x: start.x - 6, z: start.z }; h.tapFloor(destination);
    const path = JSON.stringify(h.explorer.state.path);
    for (const key of keys) h.key('keydown', key);
    assert.equal(JSON.stringify(h.explorer.state.path), path, 'keyboard input does not replace a floor route');
    for (let i = 0; i < 120; i++) { h.explorer.update(1 / 60); assert.ok(h.explorer.state.speed <= WALK_SPEED + 1e-8); }
    h.explorer.setMode('tour');
    for (const key of keys) h.key('keydown', key);
    assert.equal(h.explorer.state.mode, 'tour', 'keys do not leave automatic walking');
  } finally { h.dispose(); }
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

test('OHT rider camera keeps a steady relative view through uneven motion and eases turns',()=>{
  for(const hz of [30,60,120]) {
    const h=setup();
    try {
      h.explorer.setMode('passenger');
      const pose={x:0,y:2.16,z:70,heading:0,hanging:true};
      for(let i=0;i<hz*4;i++){h.explorer.setScriptedPose(pose);h.explorer.update(1/hz);}
      const offset=h.camera.position.clone().sub(new THREE.Vector3(pose.x,pose.y,pose.z));
      for(let i=0;i<hz;i++) {
        pose.x+=(i%6===0?.16:.018);h.explorer.setScriptedPose(pose);h.explorer.update(1/hz);
        assert.ok(h.camera.position.clone().sub(new THREE.Vector3(pose.x,pose.y,pose.z)).distanceTo(offset)<.001,'camera transports with rider instead of repeatedly lagging behind');
      }
      const before=h.camera.position.clone();pose.heading=Math.PI/2;h.explorer.setScriptedPose(pose);h.explorer.update(1/hz);
      assert.ok(h.camera.position.distanceTo(before)<.15,'a junction turn does not whip the camera');
      for(let i=0;i<hz*3;i++)h.explorer.update(1/hz);
      assert.ok(Math.abs(h.camera.position.y-4.55)<.001);
    }finally{h.dispose();}
  }
});
