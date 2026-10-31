import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAvatar } from '../src/avatar.js';
import { createExplorer } from '../src/explorer.js';
import { getEmoApproach, planEmoApproach, emoPressCameraFrame, EMO_HOLD_SECONDS } from '../src/emo-interaction.js';
import { getEmoOccluders } from '../src/emo-controls.js';
import { machines, bays, isBlocked } from '../src/layout.js';
import { canWalkSegment, stepWalker, WALK_RADIUS } from '../src/walking.js';
import { setRuntimeObstacles } from '../src/runtime-obstacles.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const example = sign => machines.find(m => m.bayId === 4 && m.sign === sign && m.column === 4);

function setup({ sign = 1, aspect = 16 / 9, onActionTap } = {}) {
  const priorDocument = globalThis.document, priorWindow = globalThis.window;
  const canvasEvents = new Map(), windowEvents = new Map(), documentEvents = new Map();
  let helpVisible = false;
  globalThis.document = { hidden: false,
    getElementById: () => ({ classList: { contains: name => name === 'hidden' && !helpVisible, add() {}, remove() {} } }),
    querySelectorAll: () => [], addEventListener: (name, fn) => documentEvents.set(name, fn) };
  globalThis.window = { addEventListener: (name, fn) => windowEvents.set(name, fn) };
  const camera = new THREE.PerspectiveCamera(64, aspect, .08, 420), avatar = createAvatar(THREE);
  const machine = example(sign), port = bays[machine.bayId].target;
  const canvas = { addEventListener: (name, fn) => canvasEvents.set(name, fn), setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) };
  const explorer = createExplorer({ THREE, camera, canvas, avatar, scene: new THREE.Scene(),
    orbit: { enabled: false, target: new THREE.Vector3(), update() {} },
    colliders: machines.map(m => ({ ...m.bounds, cameraBounds: m.walkBounds.map((b, i) => ({ ...b, minY: 0, maxY: i === 0 ? 3.4 : 1.45 })) })),
    vehicles: [{ state: { phase: 1, target: port, destination: port, car: { x: port.x, z: port.z, yaw: 0 }, travelling: false } }],
    onMode() {}, onInspect() {}, onToast() {}, onActionTap: ray => onActionTap?.(ray, explorer) ?? false });
  explorer.state.position.set(machine.x, 0, bays[machine.bayId].z); explorer.update(0);
  return { explorer, avatar, camera, machine,
    key(key = 'w') { windowEvents.get('keydown')({ key, target: { closest: () => false }, preventDefault() {} }); },
    tap() { const event = { pointerId: 1, clientX: 640, clientY: 600 }; canvasEvents.get('pointerdown')(event); canvasEvents.get('pointerup')(event); },
    drag() { canvasEvents.get('pointerdown')({ pointerId: 1, clientX: 640, clientY: 360 }); canvasEvents.get('pointermove')({ pointerId: 1, clientX: 660, clientY: 360 }); },
    blur() { windowEvents.get('blur')(); },
    hide() { document.hidden = true; documentEvents.get('visibilitychange')(); },
    showHelp() { helpVisible = true; explorer.update(1 / 60); },
    dispose() { avatar.dispose(); setRuntimeObstacles([]); globalThis.document = priorDocument; globalThis.window = priorWindow; }
  };
}

function advanceTo(h, phase) {
  for (let i = 0; i < 900 && h.explorer.state.emoInteraction?.phase !== phase; i++) h.explorer.update(1 / 60);
  assert.equal(h.explorer.state.emoInteraction?.phase, phase);
}

test('every EMO has a clear real-avatar stance and a walkable front-aisle approach', () => {
  assert.equal(machines.length, 360);
  for (const machine of machines) {
    const start = { x: machine.x, z: bays[machine.bayId].z }, plan = planEmoApproach(machine, start);
    assert.ok(plan, `machine ${machine.id} has a route`);
    assert.equal(isBlocked(plan.destination.x, plan.destination.z, WALK_RADIUS), false);
    let position = start;
    for (const point of plan.path) {
      assert.ok(canWalkSegment(position, point));
      const length = distance(position, point), steps = Math.max(1, Math.ceil(length / .04));
      const dx = (point.x - position.x) / steps, dz = (point.z - position.z) / steps;
      for (let i = 0; i < steps; i++) { position = stepWalker(position, dx, dz); assert.ok(!isBlocked(position.x, position.z, WALK_RADIUS)); }
      assert.ok(distance(position, point) < 1e-7);
    }
    assert.ok(distance(position, plan.destination) < 1e-7);
  }
});

test('both real avatar orientations walk, align, reach and hold before one callback at 30/60/120 Hz', () => {
  for (const sign of [1, -1]) for (const hz of [30, 60, 120]) {
    const h = setup({ sign });
    try {
      const { explorer, avatar, machine } = h, start = explorer.state.position.clone(), phases = new Set();
      let pressed = 0, duplicatePressed = 0, cancelled = 0, heldFrames = 0, commitTime = null;
      assert.equal(explorer.approachEmo(machine, { onPress: m => { assert.equal(m.id, machine.id); pressed++; }, onCancel: () => cancelled++ }), true);
      assert.equal(pressed, 0); assert.ok(explorer.state.position.equals(start));
      for (let i = 0; i < hz * 10; i++) {
        const before = explorer.state.position.clone(), previous = explorer.state.emoInteraction;
        if (previous) phases.add(previous.phase);
        if (previous?.phase === 'hold') heldFrames++;
        explorer.update(1 / hz);
        assert.ok(explorer.state.position.distanceTo(before) <= 2.6 / hz + 1e-8, 'approach never teleports');
        assert.ok(!isBlocked(explorer.state.position.x, explorer.state.position.z, WALK_RADIUS));
        if (explorer.state.emoInteraction?.phase === 'hold' && heldFrames === 0) {
          assert.equal(pressed, 0);
          assert.equal(avatar.root.userData.pressReachable, true);
          const hand = avatar.root.userData.pressHandWorld, button = explorer.state.emoInteraction.button;
          assert.ok(Math.hypot(hand.x - button.x, hand.y - button.y, hand.z - button.z) < 1e-6);
          assert.equal(explorer.approachEmo(machine, { onPress: () => duplicatePressed++ }), true);
          assert.equal(explorer.state.emoInteraction.phase, 'hold', 'duplicate click does not restart the action');
        }
        if (pressed && commitTime === null) {
          commitTime = (i + 1) / hz;
          assert.ok((heldFrames + 1) / hz >= EMO_HOLD_SECONDS - 1e-8, 'contact persists for the whole hold');
          assert.ok(commitTime > 1.2);
        }
      }
      assert.deepEqual([...phases], ['approach', 'align', 'reach', 'hold']);
      assert.equal(pressed, 1); assert.equal(duplicatePressed, 0); assert.equal(cancelled, 0);
      assert.equal(explorer.state.emoInteraction, null);
      assert.equal(avatar.root.rotation.y, 0, 'alignment uses actual body heading, not the unmoving root');
    } finally { h.dispose(); }
  }
});

test('floor taps, Escape, view changes, help and interruption cancel approach or hold without delayed activation', () => {
  const actions = [
    ['escape', h => h.key('Escape')], ['tap', h => h.tap()], ['drag', h => h.drag()],
    ['mode', h => h.explorer.setMode('ride')], ['reset', h => h.explorer.reset()], ['lock', h => h.explorer.lock(true)],
    ['help', h => h.showHelp()], ['blur', h => h.blur()], ['hidden', h => h.hide()]
  ];
  for (const phase of ['approach', 'hold']) for (const [name, action] of actions) {
    const h = setup();
    try {
      let pressed = 0; const cancellations = [];
      h.explorer.approachEmo(h.machine, { onPress: () => pressed++, onCancel: reason => cancellations.push(reason) });
      if (phase === 'hold') advanceTo(h, phase);
      action(h);
      assert.equal(h.explorer.state.emoInteraction, null, `${name} cancels ${phase}`);
      for (let i = 0; i < 360; i++) h.explorer.update(1 / 60);
      assert.equal(pressed, 0); assert.equal(cancellations.length, 1);
    } finally { h.dispose(); }
  }
});

test('unused movement keys do not cancel or restart a physical EMO press', () => {
  const h = setup();
  try {
    let pressed = 0, cancelled = 0;
    h.explorer.approachEmo(h.machine, { onPress: () => pressed++, onCancel: () => cancelled++ });
    for (const phase of ['approach', 'hold']) {
      advanceTo(h, phase);
      const before = h.explorer.state.emoInteraction;
      for (const key of ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift']) h.key(key);
      assert.deepEqual(h.explorer.state.emoInteraction, before);
    }
    for (let i = 0; i < 180; i++) h.explorer.update(1 / 60);
    assert.equal(pressed, 1); assert.equal(cancelled, 0);
  } finally { h.dispose(); }
});

test('invalid, blocked or newly unavailable EMO targets never activate', () => {
  const h = setup();
  try {
    const { explorer, machine } = h, plan = getEmoApproach(machine); let pressed = 0, valid = true;
    const opts = { onPress: () => pressed++, isValid: () => valid };
    assert.equal(explorer.approachEmo(null, opts), false);
    assert.equal(explorer.approachEmo({ ...machine, x: NaN }, opts), false);
    setRuntimeObstacles([{ minX: plan.destination.x - .3, maxX: plan.destination.x + .3, minZ: plan.destination.z - .3, maxZ: plan.destination.z + .3 }]);
    assert.equal(explorer.approachEmo(machine, opts), false);
    setRuntimeObstacles([]); assert.equal(explorer.approachEmo(machine, opts), true);
    advanceTo(h, 'hold'); valid = false; explorer.update(1 / 60);
    assert.equal(explorer.state.emoInteraction, null);
    for (let i = 0; i < 360; i++) explorer.update(1 / 60);
    assert.equal(pressed, 0);
  } finally { h.dispose(); }
});

test('a missing hand contact times out without granting a press', () => {
  const h = setup();
  try {
    let pressed = 0, cancelled;
    const update = h.avatar.update;
    h.avatar.update = (...args) => { update(...args); h.avatar.root.userData.pressReachable = false; };
    h.explorer.approachEmo(h.machine, { onPress: () => pressed++, onCancel: reason => cancelled = reason });
    for (let i = 0; i < 600; i++) h.explorer.update(1 / 60);
    assert.equal(pressed, 0); assert.equal(cancelled, 'out-of-reach'); assert.equal(h.explorer.state.emoInteraction, null);
  } finally { h.dispose(); }
});

test('an action tap retains the newly planned walking path', () => {
  let pressed = 0;
  const h = setup({ onActionTap: (_, explorer) => explorer.approachEmo(example(1), { onPress: () => pressed++ }) });
  try {
    h.tap(); assert.equal(pressed, 0); assert.equal(h.explorer.state.emoInteraction.phase, 'approach');
    assert.ok(h.explorer.state.path.length > 0);
    for (let i = 0; i < 600; i++) h.explorer.update(1 / 60);
    assert.equal(pressed, 1);
  } finally { h.dispose(); }
});

test('all press shots show the avatar and unobstructed button on desktop and portrait mobile', () => {
  const boxes = getEmoOccluders(machines).map(b => new THREE.Box3(new THREE.Vector3(b.minX, b.minY, b.minZ), new THREE.Vector3(b.maxX, b.maxY, b.maxZ)));
  const ray = new THREE.Ray(), hit = new THREE.Vector3();
  for (const machine of machines) for (const aspect of [16 / 9, 390 / 844]) {
    const plan = getEmoApproach(machine), frame = emoPressCameraFrame(plan, aspect);
    const camera = new THREE.PerspectiveCamera(frame.fov, aspect, .08, 420);
    camera.position.set(frame.position.x, frame.position.y, frame.position.z); camera.lookAt(frame.target.x, frame.target.y, frame.target.z); camera.updateMatrixWorld(true);
    assert.ok(!isBlocked(frame.position.x, frame.position.z, .05));
    for (const landmark of frame.landmarks) {
      const p = new THREE.Vector3(landmark.x, landmark.y, landmark.z).project(camera);
      assert.ok(Math.abs(p.x) <= .801 && Math.abs(p.y) <= .711 && Math.abs(p.z) < 1, 'visitor and EMO clear the mobile controls');
    }
    const button = new THREE.Vector3(plan.button.x, plan.button.y, plan.button.z);
    ray.set(camera.position, button.clone().sub(camera.position).normalize());
    const buttonDistance = camera.position.distanceTo(button);
    for (const box of boxes) {
      const intersection = ray.intersectBox(box, hit);
      assert.ok(!intersection || camera.position.distanceTo(intersection) >= buttonDistance - 1e-7, `machine ${machine.id} button remains visible`);
    }
  }
});
