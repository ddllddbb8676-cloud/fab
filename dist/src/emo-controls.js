import { TOOL_SCALE_X } from './layout.js?v=04bae36020c1';
import { getRuntimeObstacles } from './runtime-obstacles.js?v=04bae36020c1';

export const EMO_MAX_DISTANCE = 12;
export const EMO_HIT_SIZE = Object.freeze({ width: .48, height: .48 });

// The mushroom protrudes toward the operator from the monitor's mounting post.
export function getEmoButtonPose(machine) {
  return { id: machine.id, x: machine.x + machine.sign * 2.12 * TOOL_SCALE_X,
    y: 1.28, z: machine.z + machine.sign * 2.87, sign: machine.sign,
    plateZ: machine.z + machine.sign * 2.73, rotationY: machine.sign === 1 ? 0 : Math.PI };
}

// Split the machine body from its waist-height front-end projection. Using a
// full-height loadport AABB would incorrectly hide the neighbouring EMO button.
export function getEmoOccluders(machines) {
  return machines.flatMap(m => {
    const sign = m.sign, front = m.z + sign * 2.73, fx = m.x - sign * .2 * TOOL_SCALE_X;
    return [
      { machineId: m.id, minX: m.x - 2.7 * TOOL_SCALE_X, maxX: m.x + 2.7 * TOOL_SCALE_X,
        minY: 0, maxY: 3.35, minZ: m.z - 2.4, maxZ: m.z + 2.4 },
      { machineId: m.id, minX: fx - 1.7 * TOOL_SCALE_X, maxX: fx + 1.7 * TOOL_SCALE_X,
        minY: 0, maxY: 1.43, minZ: front - .55, maxZ: front + .55 }
    ];
  });
}

function boxHitDistance(origin, direction, box) {
  let near = 0, far = Infinity;
  for (const [axis, low, high] of [['x', box.minX, box.maxX], ['y', box.minY ?? 0, box.maxY ?? 5], ['z', box.minZ, box.maxZ]]) {
    const d = direction[axis], o = origin[axis];
    if (Math.abs(d) < 1e-10) { if (o < low || o > high) return Infinity; continue; }
    const a = (low - o) / d, b = (high - o) / d;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    if (near > far) return Infinity;
  }
  return near;
}

export function pickEmoTarget(ray, targets, occluders, { isDestroyed = () => false, maxDistance = EMO_MAX_DISTANCE } = {}) {
  if (!ray?.origin || !ray?.direction) return null;
  const origin = ray.origin, length = Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z);
  if (!Number.isFinite(length) || length < 1e-9) return null;
  const direction = { x: ray.direction.x / length, y: ray.direction.y / length, z: ray.direction.z / length };
  let nearestId = null, nearest = Math.min(EMO_MAX_DISTANCE, maxDistance);
  for (const target of targets) {
    if (isDestroyed(target.id) || (origin.z - target.z) * target.sign < .025 || direction.z * target.sign > -.025) continue;
    const distance = (target.z - origin.z) / direction.z;
    if (distance < 0 || distance > nearest) continue;
    const x = origin.x + direction.x * distance, y = origin.y + direction.y * distance;
    if (Math.abs(x - target.x) > EMO_HIT_SIZE.width / 2 || Math.abs(y - target.y) > EMO_HIT_SIZE.height / 2) continue;
    let blocked = false;
    for (const box of occluders) {
      if (box.machineId !== undefined && isDestroyed(box.machineId)) continue;
      if (boxHitDistance(origin, direction, box) < distance - .015) { blocked = true; break; }
    }
    if (!blocked) { nearest = distance; nearestId = target.id; }
  }
  return nearestId;
}

// A tiny shared bitmap keeps EMO readable without an external font or texture.
function makeLabelTexture(THREE) {
  const width = 128, height = 40, pixels = new Uint8Array(width * height * 4);
  const glyphs = [
    ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    ['01110', '10001', '10001', '10001', '10001', '10001', '01110']
  ];
  glyphs.forEach((glyph, letter) => glyph.forEach((row, y) => [...row].forEach((pixel, x) => {
    if (pixel !== '1') return;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 5; dx++) {
      const p = ((height - 1 - (6 + y * 4 + dy)) * width + 16 + letter * 34 + x * 5 + dx) * 4;
      pixels[p] = 37; pixels[p + 1] = 37; pixels[p + 2] = 28; pixels[p + 3] = 255;
    }
  })));
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter; texture.needsUpdate = true;
  return texture;
}

export function createEmoControls({ THREE, scene, machines, equipment = [], onPress = () => {}, isDestroyed = () => false }) {
  const root = new THREE.Group(); root.name = 'Equipment EMO buttons';
  const targets = machines.map(getEmoButtonPose), indexes = new Map(targets.map((p, i) => [p.id, i]));
  const metadata = new Map(equipment.map(e => [e.id, e]));
  const occluders = getEmoOccluders(machines), destroyed = new Set(), hiddenIds = new Set();
  const geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    collar: new THREE.CylinderGeometry(.12, .12, .055, 18).rotateX(Math.PI / 2),
    mushroom: new THREE.CylinderGeometry(.113, .095, .08, 20).rotateX(Math.PI / 2),
    label: new THREE.PlaneGeometry(.25, .075)
  };
  const labelTexture = makeLabelTexture(THREE);
  const materials = [
    new THREE.MeshStandardMaterial({ color: '#546b73', metalness: .45, roughness: .4 }),
    new THREE.MeshStandardMaterial({ color: '#f3cd43', metalness: .1, roughness: .48 }),
    new THREE.MeshStandardMaterial({ color: '#20292c', roughness: .65 }),
    new THREE.MeshStandardMaterial({ color: '#db242b', roughness: .34, metalness: .08, emissive: '#751017', emissiveIntensity: .12 }),
    new THREE.MeshBasicMaterial({ map: labelTexture, transparent: true, depthWrite: false })
  ];
  const parts = [
    { geometry: geometry.box, material: materials[0], y: 1.31, z: 2.66, scale: [.31, .38, .15] },
    { geometry: geometry.box, material: materials[1], y: 1.31, z: 2.73, scale: [.34, .38, .035] },
    { geometry: geometry.collar, material: materials[2], y: 1.28, z: 2.773, scale: [1, 1, 1] },
    { geometry: geometry.mushroom, material: materials[3], y: 1.28, z: 2.826, scale: [1, 1, 1] },
    { geometry: geometry.label, material: materials[4], y: 1.443, z: 2.752, scale: [1, 1, 1] }
  ];
  const dummy = new THREE.Object3D(), hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const instances = parts.map(part => {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, machines.length), matrices = [];
    mesh.name = 'EMO ' + parts.indexOf(part);
    machines.forEach((m, i) => {
      dummy.position.set(targets[i].x, part.y, m.z + m.sign * part.z);
      dummy.rotation.set(0, targets[i].rotationY, 0); dummy.scale.set(...part.scale); dummy.updateMatrix();
      matrices.push(dummy.matrix.clone()); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.computeBoundingSphere(); root.add(mesh); return { mesh, matrices };
  });
  let enabled = true, pressedId = null, pressedDepth = 0;
  const pressedMatrix = new THREE.Matrix4();
  function setPress(id, depth = 0) {
    const nextDepth = Number.isFinite(depth) ? Math.min(1, Math.max(0, depth)) : 0;
    const nextId = nextDepth > 0 && indexes.has(id) && !disabled(id) ? id : null;
    if (nextId === pressedId && nextDepth === pressedDepth) return;
    const mushroom = instances[3];
    if (pressedId !== null && !hiddenIds.has(pressedId)) {
      const index = indexes.get(pressedId); mushroom.mesh.setMatrixAt(index, mushroom.matrices[index]);
    }
    pressedId = nextId; pressedDepth = nextId === null ? 0 : nextDepth;
    if (pressedId !== null) {
      const index = indexes.get(pressedId);
      pressedMatrix.copy(mushroom.matrices[index]);
      pressedMatrix.elements[14] -= targets[index].sign * .025 * pressedDepth;
      mushroom.mesh.setMatrixAt(index, pressedMatrix);
    }
    mushroom.mesh.instanceMatrix.needsUpdate = true;
  }
  function applyHidden(id, value) {
    const index = indexes.get(id); if (index === undefined) return false;
    if (hiddenIds.has(id) === value) return true;
    if (value) hiddenIds.add(id); else hiddenIds.delete(id);
    for (const { mesh, matrices } of instances) { mesh.setMatrixAt(index, value ? hiddenMatrix : matrices[index]); mesh.instanceMatrix.needsUpdate = true; }
    return true;
  }
  function disabled(id) { return destroyed.has(id) || isDestroyed(id); }
  function setDestroyed(id, value = true) {
    if (!indexes.has(id)) return false;
    if (value && pressedId === id) setPress(null);
    if (value) destroyed.add(id); else destroyed.delete(id);
    return applyHidden(id, Boolean(disabled(id)));
  }
  function pick(ray) {
    if (!enabled) return null;
    return pickEmoTarget(ray, targets, [...occluders, ...getRuntimeObstacles()], { isDestroyed: disabled });
  }
  function press(ray) {
    const id = pick(ray); if (id === null) return false;
    onPress(id); return true;
  }
  function update({ mode = 'walk', locked = false } = {}) {
    enabled = !locked && (mode === 'walk' || mode === 'tour');
    for (const target of targets) applyHidden(target.id, Boolean(disabled(target.id)));
  }
  scene?.add(root); update();
  return { root, targets, pick, press, setDestroyed, setPress, update,
    getButton(id) { const index = indexes.get(id); return index === undefined ? null : { ...targets[index], equipment: metadata.get(id) }; },
    dispose() { root.removeFromParent(); for (const item of Object.values(geometry)) item.dispose(); for (const material of materials) material.dispose(); labelTexture.dispose(); }
  };
}
