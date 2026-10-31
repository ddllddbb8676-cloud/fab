/**
 * One draw call with CPU culling of fixed world-space instance bounds.
 * Public indices always refer to the original transforms, not compacted GPU slots.
 * The caller retains ownership of geometry/material and adds mesh at the scene root.
 */
export function createSpatialBatch(THREE, { geometry, material, transforms, cellSize = 24, maxDistance = Infinity }) {
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('cellSize must be a positive finite number');
  if (!(maxDistance >= 0) || (maxDistance !== Infinity && !Number.isFinite(maxDistance))) throw new RangeError('maxDistance must be a nonnegative number or Infinity');

  const totalCount = transforms.length;
  const mesh = new THREE.InstancedMesh(geometry, material, totalCount);
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;

  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const localBounds = geometry.boundingBox.clone();
  const worldBounds = new THREE.Box3();
  const cellMap = new Map();
  const cells = [];
  const logicalCell = new Uint32Array(totalCount);
  const enabled = new Uint8Array(totalCount).fill(1);

  // The cell key is only an index. Culling uses the union of complete transformed
  // geometry bounds, so long or rotated parts can cross any number of cells.
  for (let i = 0; i < totalCount; i++) {
    const transform = transforms[i], elements = transform.elements;
    const key = `${Math.floor(elements[12] / cellSize)},${Math.floor(elements[14] / cellSize)}`;
    let cell = cellMap.get(key);
    if (!cell) {
      cell = { id: cells.length, bounds: new THREE.Box3(), indices: [], offset: 0, hiddenCount: 0, visible: false };
      cellMap.set(key, cell);
      cells.push(cell);
    }
    worldBounds.copy(localBounds).applyMatrix4(transform);
    cell.bounds.union(worldBounds);
    cell.indices.push(i);
    logicalCell[i] = cell.id;
  }

  // Keep each cell contiguous in an immutable source buffer. Entire visible cells
  // normally need one TypedArray.set; hidden equipment splits that into runs.
  const source = new Float32Array(totalCount * 16);
  let sourceOffset = 0;
  for (const cell of cells) {
    cell.indices = Uint32Array.from(cell.indices);
    cell.offset = sourceOffset;
    for (const index of cell.indices) {
      source.set(transforms[index].elements, sourceOffset);
      sourceOffset += 16;
    }
  }

  let dirty = true, disposed = false, visibleCount = 0;
  const target = mesh.instanceMatrix.array;

  function setVisible(index, visible) {
    if (!Number.isInteger(index) || index < 0 || index >= totalCount) throw new RangeError('Instance index is outside the original transforms');
    if (disposed) return;
    const next = visible ? 1 : 0;
    if (enabled[index] === next) return;
    enabled[index] = next;
    cells[logicalCell[index]].hiddenCount += next ? -1 : 1;
    dirty = true;
  }

  function update(frustum, cameraPosition) {
    if (disposed) return 0;
    const limitDistance = Number.isFinite(maxDistance) && cameraPosition != null;
    for (const cell of cells) {
      // Use the nearest point on the full bounds, never the cell/object centre.
      // Omitting the camera preserves the original frustum-only API.
      const visible = !cell.bounds.isEmpty() && frustum.intersectsBox(cell.bounds)
        && (!limitDistance || cell.bounds.distanceToPoint(cameraPosition) <= maxDistance);
      if (visible !== cell.visible) { cell.visible = visible; dirty = true; }
    }
    if (!dirty) return visibleCount;

    let writeOffset = 0;
    for (const cell of cells) {
      if (!cell.visible || cell.hiddenCount === cell.indices.length) continue;
      if (!cell.hiddenCount) {
        const end = cell.offset + cell.indices.length * 16;
        target.set(source.subarray(cell.offset, end), writeOffset);
        writeOffset += end - cell.offset;
        continue;
      }
      let runStart = -1;
      for (let i = 0; i <= cell.indices.length; i++) {
        const showing = i < cell.indices.length && enabled[cell.indices[i]];
        if (showing && runStart < 0) runStart = i;
        if (!showing && runStart >= 0) {
          const start = cell.offset + runStart * 16, end = cell.offset + i * 16;
          target.set(source.subarray(start, end), writeOffset);
          writeOffset += end - start;
          runStart = -1;
        }
      }
    }

    visibleCount = writeOffset / 16;
    mesh.count = visibleCount;
    mesh.visible = visibleCount > 0;
    if (visibleCount > 0) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, writeOffset);
      mesh.instanceMatrix.needsUpdate = true;
    }
    dirty = false;
    return visibleCount;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    visibleCount = mesh.count = 0;
    mesh.visible = false;
    // InstancedMesh.dispose releases its instance-specific renderer resources;
    // it does not dispose the shared geometry or material.
    mesh.dispose();
  }

  return { mesh, totalCount, get visibleCount() { return visibleCount; }, setVisible, update, dispose };
}
