import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { machines } from '../src/layout.js';
import { getEmoButtonPose, getEmoOccluders, pickEmoTarget, createEmoControls, EMO_MAX_DISTANCE } from '../src/emo-controls.js';
import { createExplorer } from '../src/explorer.js';
import { setRuntimeObstacles } from '../src/runtime-obstacles.js';

const targets = machines.map(getEmoButtonPose), occluders = getEmoOccluders(machines);
function rayFor(target, distance = 3, dx = 0, dy = 0) {
  return new THREE.Ray(new THREE.Vector3(target.x + dx, target.y + dy, target.z + target.sign * distance), new THREE.Vector3(0, 0, -target.sign));
}

test('all 360 physical buttons are mapped to the correct tool from either facing row', () => {
  assert.equal(targets.length, 360); assert.equal(new Set(targets.map(p => p.id)).size, 360);
  for (const target of targets) assert.equal(pickEmoTarget(rayFor(target), targets, occluders), target.id);
  assert.ok(targets.some(t => t.sign === -1)); assert.ok(targets.some(t => t.sign === 1));
});
test('physical EMO picking allows a larger touch target but rejects rear, distance and occluded presses', () => {
  const target = targets[0];
  assert.equal(pickEmoTarget(rayFor(target, 3, .22, .2), targets, occluders), target.id);
  assert.equal(pickEmoTarget(rayFor(target, 3, .25), targets, occluders), null);
  const reverse = new THREE.Ray(new THREE.Vector3(target.x, target.y, target.z - 1), new THREE.Vector3(0, 0, 1));
  assert.equal(pickEmoTarget(reverse, targets, []), null);
  assert.equal(pickEmoTarget(rayFor(target, EMO_MAX_DISTANCE + .01), [target], []), null);
  // This origin is behind the facing equipment row. Front-facing alone must not
  // let a click pass through its body and trigger the tool beyond it.
  const throughFacingTool = rayFor(target, 11.8);
  assert.equal(pickEmoTarget(throughFacingTool, [target], []), target.id);
  assert.equal(pickEmoTarget(throughFacingTool, [target], occluders), null);
  assert.equal(pickEmoTarget(rayFor(target), targets, occluders, { isDestroyed: id => id === target.id }), null);
});
test('buttons use five draw batches and destroyed/restore state changes only the corresponding tool', () => {
  const pressed = [], externallyDestroyed = new Set();
  const controls = createEmoControls({ THREE, scene: new THREE.Scene(), machines, onPress: id => pressed.push(id), isDestroyed: id => externallyDestroyed.has(id) });
  try {
    assert.equal(controls.root.children.length, 5);
    assert.ok(controls.root.children.every(m => m.isInstancedMesh && m.count === 360));
    assert.equal(controls.press(rayFor(targets[0])), true); assert.deepEqual(pressed, [0]);
    const beforeOther = new THREE.Matrix4(); controls.root.children[0].getMatrixAt(1, beforeOther);
    controls.setDestroyed(0, true); controls.update({ mode: 'walk', locked: false });
    assert.equal(controls.press(rayFor(targets[0])), false);
    for (const mesh of controls.root.children) {
      const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
      assert.equal(matrix.elements[0], 0); assert.equal(matrix.elements[5], 0); assert.equal(matrix.elements[10], 0);
    }
    const afterOther = new THREE.Matrix4(); controls.root.children[0].getMatrixAt(1, afterOther); assert.ok(beforeOther.equals(afterOther));
    controls.setDestroyed(0, false); assert.equal(controls.pick(rayFor(targets[0])), 0);
    externallyDestroyed.add(1); controls.update(); assert.equal(controls.pick(rayFor(targets[1])), null);
    externallyDestroyed.delete(1); controls.update(); assert.equal(controls.pick(rayFor(targets[1])), 1);
    controls.update({ mode: 'walk', locked: true }); assert.equal(controls.press(rayFor(targets[0])), false);
    controls.update({ mode: 'transfer', locked: false }); assert.equal(controls.press(rayFor(targets[0])), false);
    controls.update({ mode: 'walk', locked: false }); assert.equal(controls.pick(rayFor(targets[0])), 0);
  } finally { controls.dispose(); }
});
test('dynamic doors and other temporary blockers also prevent a direct button press', () => {
  const target = targets[0], controls = createEmoControls({ THREE, machines });
  setRuntimeObstacles([{ minX: target.x - .3, maxX: target.x + .3, minY: .5, maxY: 2,
    minZ: target.z + .8, maxZ: target.z + 1 }]);
  try { assert.equal(controls.pick(rayFor(target)), null); }
  finally { setRuntimeObstacles([]); controls.dispose(); }
});
test('explorer dispatches a real short button tap before inspect and never fires after drag, pinch or lock', () => {
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  const handlers = new Map(), canvas = { addEventListener: (name, fn) => handlers.set(name, fn), setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) };
  globalThis.document = { getElementById: () => ({ classList: { contains: name => name === 'hidden', add() {}, remove() {} } }), querySelectorAll: () => [], addEventListener() {} };
  globalThis.window = { addEventListener() {} };
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(64, 390 / 844, .08, 420), target = targets[0], pressed = [];
  const controls = createEmoControls({ THREE, scene, machines, onPress: id => pressed.push(id) });
  let inspected = 0;
  try {
    camera.position.copy(rayFor(target).origin); camera.lookAt(target.x, target.y, target.z); camera.updateMatrixWorld(true);
    const explorer = createExplorer({ THREE, camera, scene, canvas, avatar: { root: new THREE.Group(), update() {} },
      orbit: { enabled: false, target: new THREE.Vector3(), update() {} }, colliders: [{ ...machines[0].bounds, equipment: { id: 0 } }], vehicles: [],
      onMode() {}, onInspect() { inspected++; }, onToast() {}, onActionTap: ray => controls.press(ray) });
    const event = (id = 1, x = 195, y = 422) => ({ pointerId: id, clientX: x, clientY: y });
    handlers.get('pointerdown')(event()); handlers.get('pointerup')(event());
    assert.deepEqual(pressed, [0]); assert.equal(inspected, 0); assert.equal(explorer.state.path.length, 0);
    handlers.get('pointerdown')(event()); handlers.get('pointermove')(event(1, 200)); handlers.get('pointerup')(event(1, 200));
    assert.equal(pressed.length, 1, 'five pixel orbit gesture must not also press EMO');
    handlers.get('pointerdown')(event()); explorer.lock(true); handlers.get('pointerup')(event()); assert.equal(pressed.length, 1);
    explorer.lock(false);
    handlers.get('pointerdown')(event()); handlers.get('pointerdown')(event(2, 220));
    handlers.get('pointermove')(event(2, 240)); handlers.get('pointerup')(event(2, 240)); handlers.get('pointerup')(event());
    assert.equal(pressed.length, 1, 'pinching must not fire the button');
    handlers.get('pointerdown')(event()); handlers.get('pointerup')(event()); assert.deepEqual(pressed, [0, 0]);
  } finally { controls.dispose(); globalThis.document = previousDocument; globalThis.window = previousWindow; }
});
