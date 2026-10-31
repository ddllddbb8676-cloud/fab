import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEquipmentVisibility } from '../src/equipment-visibility.js';

test('destroying and restoring one tool preserves every neighbouring instance and original transform', () => {
  const visibility = createEquipmentVisibility();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 4);
  const originals = [];
  for (let i = 0; i < 4; i++) {
    const original = new THREE.Matrix4().compose(new THREE.Vector3(i * 3, 2, 1), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * .7), new THREE.Vector3(1, 2, 3));
    originals.push(original); mesh.setMatrixAt(i, original);
    visibility.register(i < 2 ? 0 : 1, show => mesh.setMatrixAt(i, show ? original : new THREE.Matrix4().makeScale(0, 0, 0)));
  }
  const before = [...mesh.instanceMatrix.array];
  assert.equal(visibility.setVisible(0, false), true);
  assert.deepEqual([...mesh.instanceMatrix.array.slice(32)], before.slice(32));
  assert.equal(visibility.setVisible(0, false), false);
  assert.deepEqual(visibility.state.hiddenIds, [0]);
  visibility.setVisible(0, true);
  assert.deepEqual([...mesh.instanceMatrix.array], before);
  assert.deepEqual(visibility.state.hiddenIds, []);
  mesh.geometry.dispose(); mesh.material.dispose();
});

test('late registered labels follow the hidden state and all parts restore together', () => {
  const visibility = createEquipmentVisibility(), writes = [];
  visibility.register(7, value => writes.push(['body', value]));
  visibility.setVisible(7, false);
  visibility.register(7, value => writes.push(['label', value]));
  assert.deepEqual(writes, [['body', false], ['label', false]]);
  visibility.setVisible(7, true);
  assert.deepEqual(writes.slice(-2), [['body', true], ['label', true]]);
  assert.equal(visibility.setVisible(999, false), false);
});
