// Keep close-up precision unchanged, but spend overview depth precision on the
// hall itself instead of the hundreds of metres of empty space before it.
export const WALK_CLIPPING = Object.freeze({ near: .08, far: 420 });

export function createSceneDepth(THREE, camera, { width = 120, length = 180, height = 5 } = {}) {
  // Include the perimeter, entry, rail, flying props and destruction effects.
  const corners = [];
  for (const x of [-width / 2 - 12, width / 2 + 12])
    for (const y of [-8, height + 15])
      for (const z of [-length / 2 - 12, length / 2 + 12]) corners.push(new THREE.Vector3(x, y, z));
  const point = new THREE.Vector3();
  return {
    update(overview = false) {
      let { near, far } = WALK_CLIPPING;
      if (overview) {
        camera.updateMatrixWorld();
        let closest = Infinity, furthest = -Infinity;
        for (const corner of corners) {
          point.copy(corner).applyMatrix4(camera.matrixWorldInverse);
          closest = Math.min(closest, -point.z); furthest = Math.max(furthest, -point.z);
        }
        near = Math.max(near, closest - 8);
        far = Math.max(far, furthest + 16, near + 100);
      }
      if (camera.near === near && camera.far === far) return;
      camera.near = near; camera.far = far; camera.updateProjectionMatrix();
    }
  };
}

// The textured floor is the only horizontal top surface. A second, dark top
// just 2 cm underneath it can win the depth test at distant/mobile views.
// Retain the foundation's side rim and underside without that hidden top face.
export function createFloorFoundation(THREE, material, width = 120, length = 180) {
  const geometry = new THREE.BoxGeometry(width + .3, .3, length + .3);
  const indices = geometry.index.array, kept = [];
  for (const group of geometry.groups) {
    if (group.materialIndex === 2) continue; // BoxGeometry's positive-Y face.
    for (let i = group.start; i < group.start + group.count; i++) kept.push(indices[i]);
  }
  geometry.setIndex(kept); geometry.clearGroups();
  const foundation = new THREE.Mesh(geometry, material);
  foundation.name = 'floor-foundation'; foundation.position.y = -.19;
  return foundation;
}
