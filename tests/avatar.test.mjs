import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAvatar } from '../src/avatar.js';
import { machines } from '../src/layout.js';
import { getEmoButtonPose } from '../src/emo-controls.js';

function meshesOf(avatar) { const meshes = []; avatar.root.traverse(object => { if (object.isMesh) meshes.push(object); }); return meshes; }
const vector = new THREE.Vector3();

test('chibi visitor keeps grounded feet and its narrow-aisle envelope through walking and turns', () => {
  const avatar = createAvatar(THREE), meshes = meshesOf(avatar);
  try {
    assert.equal(meshes.length, 14);
    assert.ok(meshes.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0) <= 3500);
    for (let frame = 0; frame < 720; frame++) {
      avatar.update(1 / 60, { speed: frame < 600 ? 4.3 : 0, heading: frame * .04 });
      let grounded = Infinity, height = 0;
      for (const mesh of meshes) {
        if (mesh.name === 'shadow') continue;
        const position = mesh.geometry.getAttribute('position');
        for (let i = 0; i < position.count; i++) {
          vector.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
          assert.ok([vector.x, vector.y, vector.z].every(Number.isFinite));
          assert.ok(Math.hypot(vector.x, vector.z) <= avatar.radius + 1e-6);
          assert.ok(vector.y >= -1e-7); height = Math.max(height, vector.y);
          if (mesh.name === 'boot') grounded = Math.min(grounded, vector.y);
        }
      }
      assert.ok(Math.abs(grounded) < 1e-7); assert.ok(height <= 1.45);
    }
  } finally { avatar.dispose(); }
});

test('right glove visibly reaches all 360 WORLD EMO targets from the agreed stance, then releases', () => {
  const avatar = createAvatar(THREE);
  try {
    for (const sign of [1, -1]) {
      const heading = sign === 1 ? Math.PI : 0;
      for (let i = 0; i < 120; i++) avatar.update(1 / 60, { heading });
      for (const machine of machines.filter(machine => machine.sign === sign)) {
        const target = getEmoButtonPose(machine);
        avatar.root.position.set(target.x + sign * .22, 0, target.z + sign * .27);
        const before = avatar.root.position.clone();
        avatar.update(1 / 60, { heading, pressTarget: target, pressProgress: 1 });
        const hand = avatar.root.userData.pressHandWorld;
        assert.equal(avatar.root.userData.pressReachable, true);
        assert.ok(Math.hypot(hand.x - target.x, hand.y - target.y, hand.z - target.z) < 1e-6);
        assert.ok(avatar.root.position.equals(before));
        avatar.update(1 / 60, { heading, pressTarget: target, pressProgress: 0 });
        assert.equal(avatar.root.userData.pressReachable, false);
        assert.ok(avatar.root.userData.pressHandWorld.y < .85);
      }
    }
    avatar.update(.016, { pressTarget: { x: 900, y: 900, z: 900 }, pressProgress: 1 });
    assert.equal(avatar.root.userData.pressReachable, false);
    avatar.update(NaN, { speed: Infinity, heading: NaN, pressTarget: { x: NaN, y: 1, z: 0 }, pressProgress: Infinity });
    for (const mesh of meshesOf(avatar)) assert.ok(mesh.matrixWorld.elements.every(Number.isFinite));
  } finally { avatar.dispose(); }
});

test('avatars share geometry, materials and face textures until their final idempotent disposal', () => {
  const a = createAvatar(THREE), b = createAvatar(THREE), left = meshesOf(a), right = meshesOf(b);
  assert.ok(left.every((mesh, i) => mesh.geometry === right[i].geometry && mesh.material === right[i].material));
  const resources = new Set(left.flatMap(mesh => [mesh.geometry, mesh.material, mesh.material.map].filter(Boolean)));
  let disposed = 0; for (const resource of resources) resource.addEventListener('dispose', () => disposed++);
  a.dispose(); a.dispose(); assert.equal(disposed, 0);
  b.update(.016, { speed: 2 }); b.dispose(); assert.equal(disposed, resources.size);
  const c = createAvatar(THREE); assert.notEqual(meshesOf(c)[0].geometry, left[0].geometry); c.dispose();
});
