import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAvatar } from '../src/avatar.js';
import { findRestHeading, restPoseFits } from '../src/posture.js';
import { machines, isBlocked } from '../src/layout.js';

test('sitting and lying fit all 65 cm equipment gaps without moving the root', () => {
  const avatar = createAvatar(THREE), vertex = new THREE.Vector3();
  try {
    for (const machine of machines.filter(m => m.column < 9)) {
      const next = machines.find(m => m.bayId === machine.bayId && m.sign === machine.sign && m.column === machine.column + 1);
      const spot = { x: (machine.x + next.x) / 2, z: machine.z };
      for (const posture of ['sit', 'lie']) {
        const heading = findRestHeading(spot, Math.PI / 2, posture);
        assert.notEqual(heading, null); assert.ok(restPoseFits(spot, heading, posture));
        avatar.root.position.set(spot.x, 0, spot.z);
        for (let i = 0; i < 180; i++) avatar.update(1 / 60, { posture, heading });
        assert.equal(avatar.root.position.x, spot.x); assert.equal(avatar.root.position.z, spot.z);
        let maxY = 0, minY = Infinity;
        avatar.root.traverse(mesh => {
          if (!mesh.isMesh || mesh.name === 'shadow') return;
          const points = mesh.geometry.getAttribute('position');
          for (let i = 0; i < points.count; i++) {
            vertex.fromBufferAttribute(points, i).applyMatrix4(mesh.matrixWorld);
            assert.equal(isBlocked(vertex.x, vertex.z, 0), false, `${posture} does not overlap machine ${machine.id}`);
            maxY = Math.max(maxY, vertex.y); minY = Math.min(minY, vertex.y);
          }
        });
        assert.ok(minY >= -1e-6); assert.ok(maxY < (posture === 'lie' ? .55 : 1.1));
      }
    }
  } finally { avatar.dispose(); }
});

test('rest poses return to the original standing shape', () => {
  const avatar = createAvatar(THREE);
  try {
    for (const posture of ['sit', 'lie', 'stand']) for (let i = 0; i < 120; i++) avatar.update(1 / 60, { posture, heading: 0 });
    assert.equal(avatar.root.userData.resting, false); assert.ok(Math.abs(avatar.body.rotation.x) < 1e-8);
    assert.equal(avatar.body.position.length(), 0); assert.equal(avatar.root.userData.viewHeight, 1.02);
  } finally { avatar.dispose(); }
});
