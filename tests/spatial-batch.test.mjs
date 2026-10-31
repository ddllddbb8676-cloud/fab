import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSpatialBatch } from '../src/spatial-batch.js';

const matrix = (x, y = 0, z = 0, yaw = 0, scale = [1, 1, 1]) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(...scale)
);
function boxFrustum(minX, maxX, minZ = -5, maxZ = 5, minY = -5, maxY = 5) {
  return new THREE.Frustum(
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -minX), new THREE.Plane(new THREE.Vector3(-1, 0, 0), maxX),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), -minY), new THREE.Plane(new THREE.Vector3(0, -1, 0), maxY),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -minZ), new THREE.Plane(new THREE.Vector3(0, 0, -1), maxZ)
  );
}
const make = (transforms, options = {}) => createSpatialBatch(THREE, {
  geometry: new THREE.BoxGeometry(2, 2, 2), material: new THREE.MeshBasicMaterial(), transforms, ...options
});
function renderedMatrices(batch) {
  return Array.from({ length: batch.mesh.count }, (_, index) => {
    const value = new THREE.Matrix4(); batch.mesh.getMatrixAt(index, value); return value.elements;
  });
}
function renderedX(batch) { return renderedMatrices(batch).map(elements => elements[12]); }
const all = () => boxFrustum(-1000, 1000, -1000, 1000, -1000, 1000);

test('one mesh compacts only visible cells, including a move between distant cells', () => {
  const batch = make([matrix(-60), matrix(0), matrix(60)]);
  assert.equal(batch.totalCount, 3);
  assert.equal(batch.visibleCount, 0);
  assert.equal(batch.mesh.count, 0);
  assert.equal(batch.mesh.visible, false);
  assert.equal(batch.mesh.frustumCulled, false);
  assert.equal(batch.mesh.matrixAutoUpdate, false);
  assert.equal(batch.mesh.instanceMatrix.usage, THREE.DynamicDrawUsage);
  const mesh = batch.mesh;
  assert.equal(batch.update(boxFrustum(-3, 3)), 1);
  assert.deepEqual(renderedX(batch), [0]);
  batch.update(boxFrustum(57, 63));
  assert.equal(batch.mesh, mesh, 'camera movement reuses the one draw-call mesh');
  assert.equal(batch.visibleCount, 1);
  assert.deepEqual(renderedX(batch), [60]);
  batch.update(boxFrustum(200, 210));
  assert.equal(batch.visibleCount, 0);
  assert.equal(batch.mesh.count, 0);
  assert.equal(batch.mesh.visible, false);
});

test('a long object remains visible when its centre and nominal cell are outside the view', () => {
  const transform = matrix(60, 0, 0, 0, [40, 1, 1]);
  const batch = make([transform]); // x bounds 20..100, centre cell starts at 48.
  const frustum = boxFrustum(21, 23);
  assert.equal(frustum.containsPoint(new THREE.Vector3(60, 0, 0)), false);
  batch.update(frustum);
  assert.equal(batch.visibleCount, 1);
  assert.deepEqual(renderedMatrices(batch)[0], Array.from(new Float32Array(transform.elements)));
  batch.update(boxFrustum(5, 15));
  assert.equal(batch.visibleCount, 0);
});

test('rotated, scaled and locally offset geometry uses its complete transformed bounds', () => {
  const geometry = new THREE.BoxGeometry(20, 2, 2);
  geometry.translate(10, 0, 0); // local x spans 0..20.
  const transform = matrix(60, 0, 40, Math.PI / 2, [3, 1, 1]);
  const batch = make([transform], { geometry }); // world z spans -20..40.
  const frustum = boxFrustum(58, 62, -18, -15);
  assert.equal(frustum.containsPoint(new THREE.Vector3(60, 0, 40)), false);
  batch.update(frustum);
  assert.equal(batch.visibleCount, 1);
  assert.deepEqual(renderedMatrices(batch)[0], Array.from(new Float32Array(transform.elements)));
  batch.update(boxFrustum(58, 62, -30, -25));
  assert.equal(batch.visibleCount, 0);
});

test('logical visibility indices survive grouped ordering, compaction and camera movement', () => {
  const transforms = [matrix(-60), matrix(0), matrix(60), matrix(1), matrix(-59)];
  const batch = make(transforms);
  batch.update(all());
  assert.deepEqual(renderedX(batch), [-60, -59, 0, 1, 60], 'source is grouped by cell');
  const initialVersion = batch.mesh.instanceMatrix.version;
  batch.setVisible(3, false);
  assert.equal(batch.visibleCount, 5, 'setVisible only marks the update dirty');
  assert.equal(batch.mesh.instanceMatrix.version, initialVersion);
  batch.update(all());
  assert.deepEqual(renderedX(batch), [-60, -59, 0, 60], 'logical index 3 removes x=1, not packed slot 3');
  batch.update(boxFrustum(57, 63));
  assert.deepEqual(renderedX(batch), [60]);
  batch.setVisible(0, false);
  batch.setVisible(1, false);
  batch.setVisible(3, true);
  batch.update(all());
  assert.deepEqual(renderedX(batch), [-59, 1, 60], 'hidden off-screen equipment stays hidden, restored original index returns');
  assert.equal(batch.totalCount, 5);
  assert.equal(batch.mesh.instanceMatrix.array.length, 5 * 16, 'capacity remains fixed');
});

test('unchanged cell masks and repeated visibility settings do not upload the buffer', () => {
  const batch = make([matrix(0), matrix(60)]);
  batch.update(boxFrustum(-3, 3));
  const firstVersion = batch.mesh.instanceMatrix.version;
  batch.update(boxFrustum(-3, 3));
  batch.update(boxFrustum(-4, 4));
  batch.setVisible(0, true);
  batch.update(boxFrustum(-4, 4));
  assert.equal(batch.mesh.instanceMatrix.version, firstVersion);
  batch.update(boxFrustum(57, 63));
  assert.equal(batch.mesh.instanceMatrix.version, firstVersion + 1);
  assert.deepEqual(batch.mesh.instanceMatrix.updateRanges, [{ start: 0, count: 16 }]);
  batch.setVisible(1, false);
  batch.update(boxFrustum(57, 63));
  const emptyVersion = batch.mesh.instanceMatrix.version;
  batch.setVisible(1, false);
  batch.update(boxFrustum(57, 63));
  assert.equal(batch.mesh.instanceMatrix.version, emptyVersion);
  assert.equal(batch.mesh.visible, false);
  batch.setVisible(1, true);
  batch.update(boxFrustum(57, 63));
  assert.equal(batch.mesh.instanceMatrix.version, emptyVersion + 1);
  assert.deepEqual(renderedX(batch), [60]);
});

test('hidden runs within one cell compact without copying disabled transforms', () => {
  const batch = make(Array.from({ length: 8 }, (_, i) => matrix(i)));
  for (const index of [0, 2, 3, 6, 7]) batch.setVisible(index, false);
  batch.update(all());
  assert.deepEqual(renderedX(batch), [1, 4, 5]);
  for (const index of [1, 4, 5]) batch.setVisible(index, false);
  batch.update(all());
  assert.equal(batch.mesh.count, 0);
  batch.setVisible(7, true);
  batch.update(all());
  assert.deepEqual(renderedX(batch), [7]);
});

test('source matrices are snapshots, so external mutation cannot invalidate fixed bounds', () => {
  const transforms = [matrix(0), matrix(60)];
  const batch = make(transforms);
  transforms[0].makeTranslation(500, 0, 500);
  batch.update(boxFrustum(-3, 3));
  assert.deepEqual(renderedX(batch), [0]);
});

test('finite distance limits omit distant cells and reveal them when the camera approaches', () => {
  const batch = make([matrix(0), matrix(60), matrix(120)], { maxDistance: 55 });
  batch.update(all(), new THREE.Vector3(0, 0, 0));
  assert.deepEqual(renderedX(batch), [0]);
  const version = batch.mesh.instanceMatrix.version;
  batch.update(all(), new THREE.Vector3(1, 0, 0));
  assert.equal(batch.mesh.instanceMatrix.version, version, 'camera movement within the same mask does not upload');
  batch.update(all(), new THREE.Vector3(5, 0, 0));
  assert.deepEqual(renderedX(batch), [0, 60], 'nearest bounds point enters the allowed distance');
  batch.update(all(), new THREE.Vector3(120, 0, 0));
  assert.deepEqual(renderedX(batch), [120]);
});

test('distance is measured from transformed bounds, preserving long parts with distant centres', () => {
  const batch = make([matrix(100, 0, 0, 0, [50, 1, 1])], { maxDistance: 55 });
  batch.update(all(), new THREE.Vector3(0, 0, 0));
  assert.equal(batch.visibleCount, 1, 'centre is 100 m away, but near edge is only 50 m away');
  batch.update(all(), new THREE.Vector3(-6, 0, 0));
  assert.equal(batch.visibleCount, 0, 'nearest bounds point is now beyond the distance limit');
});

test('default infinite distance and an omitted camera retain frustum-only compatibility', () => {
  const unlimited = make([matrix(0), matrix(600)]);
  unlimited.update(all(), new THREE.Vector3(0, 0, 0));
  assert.deepEqual(renderedX(unlimited), [0, 600]);
  const limited = make([matrix(0), matrix(600)], { maxDistance: 55 });
  limited.update(all());
  assert.deepEqual(renderedX(limited), [0, 600]);
  limited.update(all(), new THREE.Vector3(0, 0, 0));
  assert.deepEqual(renderedX(limited), [0]);
  limited.update(all());
  assert.deepEqual(renderedX(limited), [0, 600], 'omitting the camera again restores uncapped rendering');
});

test('empty batches and invalid indices are handled without renderer access', () => {
  const batch = make([]);
  assert.equal(batch.update(all()), 0);
  assert.equal(batch.mesh.visible, false);
  assert.equal(batch.mesh.instanceMatrix.version, 0);
  assert.throws(() => batch.setVisible(0, false), RangeError);
  const nonempty = make([matrix(0)]);
  for (const index of [-1, 1, .5, NaN]) assert.throws(() => nonempty.setVisible(index, false), RangeError);
  for (const cellSize of [0, -1, NaN, Infinity]) assert.throws(() => make([], { cellSize }), RangeError);
});

test('dispose only releases instance resources and preserves shared geometry/material', () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2), material = new THREE.MeshBasicMaterial();
  let geometryDisposals = 0, materialDisposals = 0, meshDisposals = 0;
  geometry.addEventListener('dispose', () => geometryDisposals++);
  material.addEventListener('dispose', () => materialDisposals++);
  const batch = make([matrix(0)], { geometry, material });
  batch.mesh.addEventListener('dispose', () => meshDisposals++);
  batch.update(all());
  batch.dispose(); batch.dispose();
  assert.equal(meshDisposals, 1);
  assert.equal(geometryDisposals, 0);
  assert.equal(materialDisposals, 0);
  assert.equal(batch.mesh.visible, false);
  assert.equal(batch.visibleCount, 0);
  assert.equal(batch.update(all()), 0);
});
