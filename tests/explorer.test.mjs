import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTourRoute } from '../src/tour-route.js';
import { createTransferSession, updateTransferSession, selectTransferVehicle, transferCameraFrame, transferTransitFrame } from '../src/transfer-view.js';
import { createExplorer, destructionCameraFrame } from '../src/explorer.js';
import { bays, machines, ports, BAY_CENTERS, isBlocked } from '../src/layout.js';
import { canWalkSegment } from '../src/walking.js';
import { AIR_SHOWER } from '../src/air-shower.js';
import { setRuntimeObstacles } from '../src/runtime-obstacles.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fixtures = () => {
  const row = machines.filter(m => m.bayId === 4 && m.sign === 1);
  return [AIR_SHOWER.exit, { x: -30, z: (BAY_CENTERS[3] + BAY_CENTERS[4]) / 2 },
    { x: (row[3].x + row[4].x) / 2, z: row[3].z }, { x: 37, z: BAY_CENTERS[8] }];
};

test('automatic tour joins from entrance, rear aisle and 65 cm side passage without a jump', () => {
  setRuntimeObstacles(AIR_SHOWER.closedDoorBounds);
  try {
    for (const start of fixtures()) {
      const copy = { ...start }, route = createTourRoute(start);
      assert.ok(route); assert.deepEqual(start, copy); assert.deepEqual(route.position, copy);
      let last = copy;
      for (const waypoint of route.waypoints) { assert.ok(canWalkSegment(last, waypoint)); last = waypoint; }
      last = copy;
      for (let i = 0; i < 900; i++) {
        const pose = route.advance(.05);
        assert.ok(distance(last, pose) <= route.speed * .05 + 1e-7, 'every frame is bounded by walking speed');
        assert.ok(!isBlocked(pose.x, pose.z, .23)); last = pose;
      }
    }
  } finally { setRuntimeObstacles([]); }
});

test('transfer selection prioritizes actual handling, then the parked FOUP with earliest return', () => {
  const port = bays[0].target, destination = bays[10].target;
  const vehicle = (phase, remaining) => ({ state: { phase, target: port, destination, car: { x: 0, z: 0, yaw: 0 },
    travelling: phase === 4 || phase === 8, routeLength: 200, routeDistance: 200 - remaining, label: 'test' } });
  const vehicles = [vehicle(8, 1), vehicle(4, 80), vehicle(4, 6), vehicle(1, 0)];
  assert.equal(selectTransferVehicle(vehicles), 3);
  vehicles.pop(); assert.equal(selectTransferVehicle(vehicles), 2);
  vehicles.splice(1); assert.equal(selectTransferVehicle(vehicles), 0);
});

test('selected vehicle stays stable and a loaded trip uses its actual cargo view until arrival', () => {
  const origin = bays[0].target, destination = bays[10].target;
  const vehicles = [{ state: { phase: 8, target: origin, destination, car: { x: origin.x, z: origin.z, yaw: Math.PI / 2 },
    travelling: true, routeLength: 150, routeDistance: 80, label: '다른 BAY로 운반' } }];
  const session = createTransferSession(vehicles, origin);
  updateTransferSession(session, vehicles); assert.equal(session.inTransit, true); assert.equal(session.vehicleId, 0);
  assert.equal(session.port.id, destination.id); assert.equal(session.waiting, false);
  vehicles[0].state = { ...vehicles[0].state, phase: 1, travelling: false, target: destination,
    car: { x: destination.x, z: destination.z, yaw: Math.PI / 2 }, label: 'FOUP 내려놓기' };
  updateTransferSession(session, vehicles); assert.equal(session.inTransit, false); assert.equal(session.vehicleId, 0);
  assert.equal(session.port.id, destination.id);
  vehicles[0].state = { ...vehicles[0].state, phase: 4, travelling: true, car: { x: 0, z: 0, yaw: 0 } };
  updateTransferSession(session, vehicles); assert.equal(session.inTransit, false); assert.equal(session.waiting, true);
  assert.equal(session.port.id, destination.id); assert.match(session.label, /FOUP 착좌/);
});

function projected(frame, aspect, points = frame.landmarks) {
  const camera = new THREE.PerspectiveCamera(frame.fov, aspect, .08, 420);
  camera.position.set(frame.position.x, frame.position.y, frame.position.z);
  camera.lookAt(frame.target.x, frame.target.y, frame.target.z); camera.updateMatrixWorld(true);
  return points.map(p => new THREE.Vector3(p.x, p.y, p.z).project(camera));
}
test('every loadport orientation frames OHT, seated FOUP and platform on desktop and portrait mobile', () => {
  for (const aspect of [16 / 9, 390 / 844, 360 / 800]) for (const port of ports) {
    const frame = transferCameraFrame(port, aspect);
    assert.ok(!isBlocked(frame.position.x, frame.position.z, .05));
    for (const p of projected(frame, aspect)) {
      assert.ok(Math.abs(p.x) < .86, 'mechanism stays inside the horizontal frame');
      assert.ok(p.y > -.72 && p.y < .72, 'mechanism clears top/bottom controls');
      assert.ok(p.z > -1 && p.z < 1);
    }
  }
});
test('transfer sight lines stay in front of the chosen tool and clear all neighbouring equipment', () => {
  const ray = new THREE.Ray(), hit = new THREE.Vector3();
  for (const bay of bays) for (const sign of [1, -1]) {
    const machine = bay.machines.find(m => m.sign === sign && m.column === 4), port = machine.ports[1];
    const frame = transferCameraFrame(port, 390 / 844), eye = new THREE.Vector3(frame.position.x, frame.position.y, frame.position.z);
    for (const landmark of [{ x: port.x, y: 1.685, z: port.z }, { x: port.x, y: 3.59, z: port.z },
      { x: port.x, y: port.y, z: port.z + sign * .33 }]) {
      const point = new THREE.Vector3(landmark.x, landmark.y, landmark.z), length = eye.distanceTo(point);
      ray.set(eye, point.clone().sub(eye).normalize());
      for (const m of machines) {
        const bounds = { ...m.bounds };
        // The target's waist-height loadport projection is not a 3.4 m wall.
        if (m.id === machine.id) { if (sign === 1) bounds.maxZ = m.z + 2.35; else bounds.minZ = m.z - 2.35; }
        const box = new THREE.Box3(new THREE.Vector3(bounds.minX, 0, bounds.minZ), new THREE.Vector3(bounds.maxX, 3.4, bounds.maxZ));
        const obstruction = ray.intersectBox(box, hit);
        assert.ok(!obstruction || eye.distanceTo(obstruction) >= length - 1e-6);
      }
    }
  }
});
test('loaded transit shot contains real OHT and FOUP through every turn heading', () => {
  for (const aspect of [16 / 9, 390 / 844]) for (let yaw = -Math.PI; yaw < Math.PI; yaw += Math.PI / 12) {
    const car = { x: 0, z: 0, yaw }, frame = transferTransitFrame(car, aspect), landmarks = [];
    for (const x of [-.43, .43]) for (const z of [-.62, .62]) for (const y of [3.36, 4.2]) {
      landmarks.push({ x: Math.cos(yaw) * x + Math.sin(yaw) * z, y, z: -Math.sin(yaw) * x + Math.cos(yaw) * z });
    }
    for (const p of projected(frame, aspect, landmarks)) assert.ok(Math.abs(p.x) < .9 && Math.abs(p.y) < .85 && p.z > -1 && p.z < 1);
  }
});

test('destruction shot frames every cabinet and the 4.85 m plume with clearance from the facing tools', () => {
  for (const aspect of [16 / 9, 390 / 844, 360 / 800]) for (const machine of machines) {
    const frame = destructionCameraFrame(machine, aspect);
    assert.ok(!isBlocked(frame.position.x, frame.position.z, .3), 'camera has 30 cm clearance inside the front aisle');
    assert.ok(frame.fov < 100, 'portrait fit avoids an excessive ultra-wide camera');
    for (const p of projected(frame, aspect)) {
      assert.ok(Math.abs(p.x) <= .900001 && Math.abs(p.y) <= .760001, 'tool and plume stay clear of screen edges');
      assert.ok(p.z > -1 && p.z < 1);
    }
  }
});

test('destruction view hides the avatar, stays fixed for 4.8 seconds and restores position, zoom and FOV', () => {
  const priorDocument = globalThis.document, priorWindow = globalThis.window;
  globalThis.document = { getElementById: () => ({ classList: { contains: name => name === 'hidden', add() {}, remove() {} } }), querySelectorAll: () => [], addEventListener() {} };
  globalThis.window = { addEventListener() {} };
  try {
    const camera = new THREE.PerspectiveCamera(67, 390 / 844, .08, 420), avatar = { root: new THREE.Group(), update() {} }, modes = [];
    const port = bays[4].target, vehicles = [{ state: { phase: 1, target: port, destination: port, car: { x: port.x, z: port.z, yaw: 0 }, travelling: false } }];
    const explorer = createExplorer({ THREE, camera, scene: new THREE.Scene(), canvas: { addEventListener() {}, setPointerCapture() {} }, avatar,
      orbit: { enabled: false, target: new THREE.Vector3(), update() {} }, colliders: [], vehicles, onMode: mode => modes.push(mode), onInspect() {}, onToast() {} });
    explorer.state.position.set(-30, 0, bays[4].z); explorer.state.distance = 6.1;
    const saved = explorer.state.position.clone(), orientation = [explorer.state.yaw, explorer.state.elevation, explorer.state.heading];
    explorer.state.path = [{ x: 0, z: 0 }]; assert.equal(explorer.focusDestruction(machines[0]), true);
    assert.equal(explorer.state.mode, 'blast'); assert.equal(avatar.root.visible, false); assert.equal(explorer.state.path.length, 0);
    const shot = camera.position.clone(); explorer.update(4.7);
    assert.ok(camera.position.equals(shot)); assert.ok(explorer.state.position.equals(saved)); assert.ok(avatar.root.position.equals(saved));
    explorer.update(.11); assert.equal(explorer.state.mode, 'walk'); assert.equal(avatar.root.visible, true); assert.equal(camera.fov, 67);
    assert.ok(explorer.state.position.equals(saved)); assert.equal(explorer.state.distance, 6.1);
    assert.deepEqual([explorer.state.yaw, explorer.state.elevation, explorer.state.heading], orientation);
    for (const next of ['walk', 'tour', 'ride', 'overview']) {
      explorer.focusDestruction(machines[10]); explorer.setMode(next);
      assert.equal(explorer.state.mode, next); assert.equal(avatar.root.visible, true); assert.equal(camera.fov, 67);
      assert.ok(explorer.state.position.equals(saved)); explorer.setMode('walk');
    }
    explorer.focusTransfer(); explorer.update(.01); explorer.focusDestruction(machines[0]); explorer.setMode('walk'); assert.equal(camera.fov, 67);
    explorer.focusDestruction(machines[0]); explorer.focusTransfer(); assert.equal(explorer.state.mode, 'transfer'); explorer.setMode('walk'); assert.equal(camera.fov, 67);
    explorer.focusDestruction(machines[0]); explorer.lock(true); assert.equal(explorer.state.mode, 'walk'); assert.equal(camera.fov, 67); assert.equal(avatar.root.visible, true);
    assert.equal(explorer.focusDestruction(machines[0]), false); explorer.lock(false);
    explorer.focusDestruction(machines[0]); explorer.reset(); assert.equal(explorer.state.mode, 'walk'); assert.equal(camera.fov, 67);
    assert.equal(modes.filter(mode => mode === 'blast').length, 9);
  } finally { globalThis.document = priorDocument; globalThis.window = priorWindow; }
});

test('explorer mode changes preserve position, hide avatar during transfer and respect a closed door camera collider', () => {
  const priorDocument = globalThis.document, priorWindow = globalThis.window;
  const makeClassList = () => ({ contains: name => name === 'hidden', add() {}, remove() {} });
  globalThis.document = { getElementById: () => ({ classList: makeClassList() }), querySelectorAll: () => [], addEventListener() {} };
  globalThis.window = { addEventListener() {} };
  try {
    const camera = new THREE.PerspectiveCamera(64, 16 / 9, .08, 420), avatar = { root: new THREE.Group(), update() {} };
    const port = bays[4].target, vehicles = [{ state: { phase: 1, target: port, destination: port, car: { x: port.x, z: port.z, yaw: Math.PI / 2 }, travelling: false, label: 'FOUP 내려놓기' } }];
    const explorer = createExplorer({ THREE, camera, scene: new THREE.Scene(), canvas: { addEventListener() {}, setPointerCapture() {} }, avatar,
      orbit: { enabled: false, target: new THREE.Vector3(), update() {} }, colliders: [], vehicles, onMode() {}, onInspect() {}, onToast() {} });
    explorer.state.position.set(AIR_SHOWER.exit.x, 0, AIR_SHOWER.exit.z);
    const before = explorer.state.position.clone(); explorer.setMode('tour'); assert.ok(explorer.state.position.equals(before));
    explorer.update(.05); assert.ok(explorer.state.position.distanceTo(before) < .1);
    const pause = explorer.state.position.clone(); explorer.setMode('walk'); explorer.setMode('tour'); explorer.setMode('tour');
    assert.ok(explorer.state.position.equals(pause)); explorer.update(.05); assert.ok(explorer.state.position.distanceTo(pause) < .1);
    const saved = explorer.state.position.clone(); explorer.focusTransfer(); explorer.update(.05);
    assert.equal(explorer.state.mode, 'transfer'); assert.equal(explorer.state.transferVehicleId, 0); assert.equal(avatar.root.visible, false);
    assert.ok(explorer.state.position.equals(saved)); explorer.setMode('walk'); assert.equal(avatar.root.visible, true); assert.ok(explorer.state.position.equals(saved));
    setRuntimeObstacles(AIR_SHOWER.closedDoorBounds);
    explorer.state.position.set(0, 0, AIR_SHOWER.doorZ - .8); explorer.state.yaw = 0; explorer.state.distance = 4.4; explorer.state.elevation = .08;
    explorer.update(.1); assert.ok(camera.position.z < AIR_SHOWER.closedDoorBounds[0].minZ - .1, 'camera remains in front of the closed entry door');
  } finally { setRuntimeObstacles([]); globalThis.document = priorDocument; globalThis.window = priorWindow; }
});
