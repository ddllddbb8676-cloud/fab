// Doors and other changing obstacles stay separate from the static FAB layout.
let obstacles = Object.freeze([]);

export function setRuntimeObstacles(bounds = []) {
  if (!Array.isArray(bounds)) throw new TypeError('Runtime obstacles must be an array of bounds');
  const next = bounds.map(box => {
    if (!box || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => Number.isFinite(box[key])) || box.minX > box.maxX || box.minZ > box.maxZ) {
      throw new TypeError('Runtime obstacle bounds require finite ordered X and Z coordinates');
    }
    return Object.freeze({ ...box });
  });
  obstacles = Object.freeze(next);
  return obstacles;
}

export const getRuntimeObstacles = () => obstacles;

export function isRuntimeBlocked(x, z, margin = .28) {
  return obstacles.some(box => x >= box.minX - margin && x <= box.maxX + margin && z >= box.minZ - margin && z <= box.maxZ + margin);
}

export function canTraverseRuntimeObstacles(a, b, margin = .28) {
  // Clip the segment against each expanded rectangle. This also catches thin
  // obstacles between walk samples, without rescanning the static machines.
  for (const box of obstacles) {
    let near = 0, far = 1, intersects = true;
    for (const [axis, min, max] of [['x', box.minX - margin, box.maxX + margin], ['z', box.minZ - margin, box.maxZ + margin]]) {
      const delta = b[axis] - a[axis];
      if (delta === 0) {
        if (a[axis] < min || a[axis] > max) { intersects = false; break; }
        continue;
      }
      const first = (min - a[axis]) / delta, last = (max - a[axis]) / delta;
      near = Math.max(near, Math.min(first, last));
      far = Math.min(far, Math.max(first, last));
      if (near > far) { intersects = false; break; }
    }
    if (intersects) return false;
  }
  return true;
}
