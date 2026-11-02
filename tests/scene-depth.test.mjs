import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSceneDepth, createFloorFoundation } from '../src/scene-depth.js';

function view(distance, elevation, yaw = 0, target = new THREE.Vector3(), aspect = 390 / 844) {
  const camera = new THREE.PerspectiveCamera(72, aspect, .08, 1000);
  camera.position.set(Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation))
    .multiplyScalar(distance).add(target);
  camera.lookAt(target); camera.updateMatrixWorld();
  return camera;
}
function bucket(camera, point) {
  return Math.round((point.clone().project(camera).z * .5 + .5) * (2 ** 24 - 1));
}

test('overview separates the formerly colliding floor depths across distant zoom and rotation', () => {
  let oldCollisions = 0;
  for (const distance of [220, 400, 550, 700]) for (const elevation of [.04 * Math.PI, .55, 1, 1.56]) for (const yaw of [0, .7, 2, 3.8]) {
    const camera = view(distance, elevation, yaw), depth = createSceneDepth(THREE, camera);
    const samples = [];
    for (const x of [-55, -20, 0, 20, 55]) for (const z of [-85, -40, 0, 40, 85]) {
      const floor = new THREE.Vector3(x, -.02, z), hiddenTop = new THREE.Vector3(x, -.04, z);
      if (bucket(camera, floor) === bucket(camera, hiddenTop)) oldCollisions++;
      samples.push([floor, hiddenTop]);
    }
    depth.update(true);
    for (const [floor, hiddenTop] of samples) assert.ok(bucket(camera, hiddenTop) - bucket(camera, floor) > 16,
      `separate 2 cm surfaces at distance=${distance}, elevation=${elevation}, yaw=${yaw}`);
  }
  assert.ok(oldCollisions > 100, 'regression reproduces the old depth collisions, not only the new range');
});

test('overview clipping retains the entire hall through pan, orbit, zoom and portrait/landscape changes', () => {
  const points = [];
  for (const x of [-60.15, 0, 60.15]) for (const y of [-.34, 0, 5, 12]) for (const z of [-96, 0, 96]) points.push(new THREE.Vector3(x, y, z));
  for (const distance of [16, 48, 160, 400, 700]) for (const elevation of [.04 * Math.PI, .7, 1.56]) for (const yaw of [0, 1.7, 4.3]) {
    const camera = view(distance, elevation, yaw), depth = createSceneDepth(THREE, camera);
    for (const target of [new THREE.Vector3(), new THREE.Vector3(36, 0, -65), new THREE.Vector3(-70, 3, 110)]) {
      camera.position.add(target); camera.lookAt(target); camera.updateMatrixWorld();
      depth.update(true);
      for (const aspect of [390 / 844, 844 / 390, 16 / 9]) {
        camera.aspect = aspect; camera.updateProjectionMatrix();
        for (const point of points) {
          const viewDepth = -point.clone().applyMatrix4(camera.matrixWorldInverse).z;
          if (viewDepth < .08) continue;
          const projected = point.clone().project(camera);
          assert.ok(projected.z >= -1 && projected.z <= 1, 'no new near/far clipping of visible geometry');
        }
      }
      camera.position.sub(target);
    }
  }
});

test('leaving overview restores the original close-up projection without changing camera framing', () => {
  const camera = view(700, 1), depth = createSceneDepth(THREE, camera);
  const position = camera.position.clone(), quaternion = camera.quaternion.clone();
  depth.update(true); assert.ok(camera.near > 500);
  for (const fov of [72, 67, 50]) {
    camera.fov = fov; camera.updateProjectionMatrix();
    depth.update(false);
    const original = new THREE.PerspectiveCamera(fov, camera.aspect, .08, 420);
    assert.deepEqual(camera.projectionMatrix.elements, original.projectionMatrix.elements);
    assert.ok(camera.position.equals(position)); assert.ok(camera.quaternion.equals(quaternion));
    depth.update(true);
  }
});

test('the foundation retains its sides and underside but cannot paint a dark top through the floor', () => {
  const material = new THREE.MeshBasicMaterial(), foundation = createFloorFoundation(THREE, material);
  foundation.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  for (const x of [-59, -20, 0, 20, 59]) for (const z of [-89, -40, 0, 40, 89]) {
    ray.set(new THREE.Vector3(x, 700, z), new THREE.Vector3(0, -1, 0));
    assert.equal(ray.intersectObject(foundation).length, 0, 'no dark upward-facing surface under the floor');
  }
  ray.set(new THREE.Vector3(0, -2, 0), new THREE.Vector3(0, 1, 0));
  assert.ok(ray.intersectObject(foundation).length > 0, 'underside retained');
  for (const axis of ['x', 'z']) for (const sign of [-1, 1]) {
    const origin = new THREE.Vector3(0, -.19, 0), direction = new THREE.Vector3();
    origin[axis] = sign * 150; direction[axis] = -sign; ray.set(origin, direction);
    assert.ok(ray.intersectObject(foundation).length > 0, 'outer rim retained');
  }
  foundation.geometry.dispose(); material.dispose();
});
