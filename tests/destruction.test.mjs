import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { machines } from '../src/layout.js';
import { createEquipmentDestruction, DESTRUCTION_LIMITS } from '../src/equipment-destruction.js';

function create(list = machines.slice(0, 3), options = {}) {
  const scene = new THREE.Scene(), visibility = [], bursts = [];
  const effect = createEquipmentDestruction({ THREE, scene, machines: list, onVisibility: (...args) => visibility.push(args), onBurst: (...args) => bursts.push(args), ...options });
  return { scene, effect, visibility, bursts };
}
function assertDebrisBounds(effect, list) {
  const matrix = new THREE.Matrix4(), corner = new THREE.Vector3();
  effect.root.traverse(mesh => {
    if (mesh.userData.destructionKind !== 'debris') return;
    for (let slot = 0; slot < mesh.count; slot++) {
      mesh.getMatrixAt(slot, matrix);
      assert.ok(matrix.elements.every(Number.isFinite));
      if (matrix.elements[0] === 0 && matrix.elements[5] === 0 && matrix.elements[10] === 0) continue;
      const machineId = mesh.userData.machineIds[Math.floor(slot / mesh.userData.partsPerMachine)];
      const machine = list.find(item => item.id === machineId), b = machine.bounds;
      for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
        corner.set(x, y, z).applyMatrix4(matrix);
        assert.ok(corner.x >= b.minX - .00001 && corner.x <= b.maxX + .00001, `piece outside equipment X footprint: ${machine.id}`);
        assert.ok(corner.z >= b.minZ - .00001 && corner.z <= b.maxZ + .00001, `piece outside equipment Z footprint: ${machine.id}`);
        assert.ok(corner.y >= -.00001 && corner.y <= DESTRUCTION_LIMITS.maxHeight + .00001, `piece outside floor/ceiling: ${machine.id}`);
      }
    }
  });
}

test('single-machine repair reassembles bounded pieces and leaves other damaged tools alone', () => {
  const list = machines.slice(0, 3), { effect, visibility } = create(list);
  try {
    effect.trigger(0); effect.trigger(1); effect.update(6);
    assert.equal(effect.beginRepair(0), true); assert.equal(effect.beginRepair(1), false);
    for (let i = 0; i <= 50; i++) { effect.setRepairProgress(0, i / 50); assertDebrisBounds(effect, list); }
    assert.equal(effect.isDestroyed(0), true, 'restoration waits for completion');
    assert.equal(effect.reset(0), true); assert.deepEqual(effect.state.destroyedIds, [1]);
    assert.deepEqual(visibility, [[0, false], [1, false], [0, true]]);
    assert.equal(effect.beginRepair(1), true); effect.setRepairProgress(1, .5);
    assert.equal(effect.cancelRepair(1), true); assert.equal(effect.isDestroyed(1), true);
    assert.equal(effect.state.repairing.length, 0); assertDebrisBounds(effect, list);
  } finally { effect.dispose(); }
});

test('one press destroys one unique machine and repeated presses do not replay it', () => {
  const { effect, visibility, bursts } = create();
  try {
    assert.equal(effect.trigger(99999), false);
    assert.equal(effect.trigger(1), true);
    assert.equal(effect.trigger(1), false);
    assert.deepEqual(effect.state.destroyedIds, [1]);
    assert.equal(effect.isDestroyed(0), false);
    assert.equal(effect.isDestroyed(1), true);
    assert.deepEqual(visibility, [[1, false]]);
    assert.equal(bursts.length, 1);
    assert.equal(effect.state.partsPerMachine, 35);
    assert.equal(effect.state.drawnDebrisSlots, 35, 'one destroyed tool does not draw all reserved tool slots');
    assert.equal(effect.reset(1), true);
    assert.equal(effect.reset(1), false);
    assert.deepEqual(visibility, [[1, false], [1, true]]);
    assert.equal(effect.state.activeCount, 0);
    assert.equal(effect.state.debrisCount, 0);
    assert.equal(effect.state.drawnDebrisSlots, 0);
    assert.equal(effect.trigger(1), true);
  } finally { effect.dispose(); }
});

test('collapse remains finite inside the original footprint and settles above the floor', () => {
  const list = [machines[0], machines[10], machines[180]], { effect } = create(list);
  try {
    list.forEach(machine => effect.trigger(machine.id));
    for (let i = 0; i < 60; i++) { assertDebrisBounds(effect, list); effect.update(.05); }
    assert.equal(effect.state.settledCount, list.length);
    effect.update(100); effect.update(NaN); effect.update(Infinity); effect.update(-1);
    assert.equal(effect.state.activeCount, 0);
    assert.equal(effect.state.debrisCount, list.length * 35);
    assertDebrisBounds(effect, list);
    assert.equal(effect.root.visible, true, 'settled metal remains visible after smoke ends');
  } finally { effect.dispose(); }
});

test('all 360 tools retain debris while active fire and smoke stay within a fixed pool', () => {
  const { effect, scene } = create(machines);
  try {
    let meshCount = 0; effect.root.traverse(node => { if (node.isMesh) meshCount++; });
    for (const machine of machines) {
      assert.equal(effect.trigger(machine.id), true);
      assert.ok(effect.state.activeCount <= 8);
    }
    assert.equal(effect.state.destroyedCount, 360);
    assert.equal(new Set(effect.state.destroyedIds).size, 360);
    assert.equal(effect.state.poolSize, 8);
    assert.equal(effect.state.debrisCount, 12600);
    assert.equal(effect.state.settledCount, 352);
    let afterMeshCount = 0; effect.root.traverse(node => { if (node.isMesh) afterMeshCount++; });
    assert.equal(afterMeshCount, meshCount);
    assert.equal(scene.children.length, 1);
    effect.update(6); assertDebrisBounds(effect, machines);
    assert.equal(effect.state.activeCount, 0);
    assert.equal(effect.resetAll(), true);
    assert.equal(effect.root.visible, false);
    assert.equal(effect.state.destroyedCount, 0);
    effect.trigger(359);
    assert.equal(effect.state.drawnDebrisSlots, 35, 'resetting all tools reuses the first draw slot even for the last physical machine');
  } finally { effect.dispose(); }
});

test('fire, sparks and smoke also stay finite below the ceiling and within the selected tool', () => {
  const list = [machines[9]], { effect } = create(list), b = list[0].bounds;
  const matrix = new THREE.Matrix4(), vertex = new THREE.Vector3();
  try {
    effect.trigger(list[0].id);
    for (const dt of [.1, .15, .35, .6, 1.2, 1.5]) {
      effect.update(dt);
      for (const group of effect.root.children.filter(item => item.isGroup && item.visible)) for (const mesh of group.children.filter(item => item.visible)) {
        const positions = mesh.geometry.getAttribute('position');
        for (let slot = 0; slot < mesh.count; slot++) {
          mesh.getMatrixAt(slot, matrix);
          assert.ok(matrix.elements.every(Number.isFinite));
          for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix);
            assert.ok(vertex.x >= b.minX - .00001 && vertex.x <= b.maxX + .00001);
            assert.ok(vertex.z >= b.minZ - .00001 && vertex.z <= b.maxZ + .00001);
            assert.ok(vertex.y >= -.00001 && vertex.y <= DESTRUCTION_LIMITS.maxHeight + .00001);
          }
        }
      }
    }
  } finally { effect.dispose(); }
});

test('one sustained burst is visible above and in front of either facing casing', () => {
  for (const machine of [machines[0], machines[10]]) {
    const { effect } = create([machine]);
    try {
      effect.trigger(machine.id); effect.update(.12);
      const fire = effect.root.children.find(item => item.isGroup && item.visible).getObjectByName('Equipment fireburst');
      assert.equal(fire.visible, true);
      assert.ok(fire.material.opacity > .9);
      const matrix = new THREE.Matrix4(), vertex = new THREE.Vector3(); fire.getMatrixAt(0, matrix);
      let top = -Infinity, front = -Infinity;
      const positions = fire.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix);
        top = Math.max(top, vertex.y);
        front = Math.max(front, (vertex.z - machine.z) * machine.sign);
      }
      assert.ok(top > 3.3, 'the first fire lobe is above the 2.9m casing');
      assert.ok(front > 2.7, 'the first fire lobe reaches beyond the 2.325m opaque front casing');
      effect.update(.58);
      assert.equal(fire.visible, true);
      assert.ok(fire.material.opacity > .3, 'burst still reads clearly at 0.7 seconds');
      let opacity = fire.material.opacity;
      for (let i = 0; i < 7; i++) {
        effect.update(.05);
        assert.ok(fire.material.opacity <= opacity + 1e-12, 'single fade without rebrightening'); opacity = fire.material.opacity;
      }
      effect.update(.01); assert.equal(fire.visible, false);
      assertDebrisBounds(effect, [machine]);
    } finally { effect.dispose(); }
  }
});

test('reduced motion suppresses fire and sparks, and disposal restores originals once', () => {
  const { effect, scene, visibility } = create(machines.slice(0, 2), { reducedMotion: true });
  effect.trigger(0); effect.update(.2);
  const visibleBasicEffects = [];
  effect.root.traverse(node => { if (node.isInstancedMesh && node.material.isMeshBasicMaterial && node.visible) visibleBasicEffects.push(node); });
  assert.equal(visibleBasicEffects.length, 0);
  const resources = new Set();
  effect.root.traverse(node => { if (node.isInstancedMesh) { resources.add(node); resources.add(node.geometry); resources.add(node.material); } });
  let disposedResources = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => disposedResources++);
  effect.dispose(); effect.dispose();
  assert.equal(disposedResources, resources.size, 'every instancing buffer, shared geometry and material is disposed exactly once');
  assert.equal(scene.children.length, 0);
  assert.deepEqual(visibility, [[0, false], [0, true]]);
  assert.equal(effect.state.disposed, true);
  assert.equal(effect.trigger(0), false);
  assert.equal(effect.resetAll(), false);
});

test('duplicate physical IDs are rejected before attaching any effect root', () => {
  const scene = new THREE.Scene();
  assert.throws(() => createEquipmentDestruction({ THREE, scene, machines: [machines[0], machines[0]] }), /unique integer/);
  assert.equal(scene.children.length, 0);
});
