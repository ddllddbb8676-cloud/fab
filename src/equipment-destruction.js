// Playful viewing effect only: not a model of real semiconductor equipment failure.
export const DESTRUCTION_LIMITS = Object.freeze({ activeEffects: 8, burstSeconds: 1.05, collapseSeconds: 2.7, effectSeconds: 5.2, maxHeight: 4.75 });
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
function randomFor(id) {
  let seed = ((Number(id) + 1) * 2654435761) >>> 0;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

// 35 casing, roof, frame and load-port parts reconstruct the original silhouette.
function makeTemplates() {
  const result = [], counts = [0, 0, 0];
  const add = (material, x, y, z, sx, sy, sz) => result.push({ material, offset: counts[material]++, x, y, z, sx, sy, sz });
  for (const side of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      add(0, i * 1.73, 1.49, side * 2.325, 1.69, 2.6, .08);
      add(0, side * 2.59, 1.49, i * 1.54, .08, 2.6, 1.49);
    }
    add(1, side * 1.95, .15, 0, .18, .18, 4.45);
    for (const z of [-2.27, 2.27]) add(1, side * 2.5, 1.5, z, .11, 2.7, .11);
    add(1, 0, 2.79, side * 2.27, 5.12, .11, .11);
    add(1, side * 2.5, 2.79, 0, .11, .11, 4.55);
  }
  for (let x = -1; x <= 1; x++) for (const z of [-1.16, 1.16]) add(0, x * 1.73, 2.86, z, 1.72, .12, 2.3);
  for (let i = 0; i < 3; i++) {
    add(1, -1.23 + i * 1.02, 1.43, 2.89, .71, .08, .66);
    add(0, -1.3 + i * 1.1, .72, 3.08, 1.04, 1.16, .08);
  }
  add(2, 2.12, 1.91, 2.66, .56, .46, .08);
  return { parts: result, counts };
}

export function createEquipmentDestruction({ THREE, scene, machines, reducedMotion = false, onVisibility = () => {}, onBurst = () => {}, onChange = () => {} }) {
  const templates = makeTemplates(), byId = new Map();
  for (let index = 0; index < machines.length; index++) {
    const machine = machines[index], b = machine.bounds;
    if (!Number.isInteger(machine.id) || byId.has(machine.id)) throw new Error('Destruction requires unique integer machine IDs');
    if (![machine.x, machine.z, b?.minX, b?.maxX, b?.minZ, b?.maxZ].every(Number.isFinite) || b.minX >= b.maxX || b.minZ >= b.maxZ) throw new Error('Destruction requires finite machine positions and bounds');
    byId.set(machine.id, { machine, index });
  }
  const root = new THREE.Group(); root.name = 'Equipment collapse effects'; root.visible = false; scene.add(root);
  const cube = new THREE.BoxGeometry(1, 1, 1), cloud = new THREE.IcosahedronGeometry(1, 1);
  const materials = [
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .76, metalness: .22 }),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .58, metalness: .68 }),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .84, metalness: .12 })
  ];
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), transform = new THREE.Object3D();
  const slotOwners = Array(machines.length).fill(null), freeSlots = machines.map((_, i) => machines.length - i - 1);
  let drawnSlots = 0;
  const debris = materials.map((material, index) => {
    const mesh = new THREE.InstancedMesh(cube, material, machines.length * templates.counts[index]);
    mesh.name = ['Broken casing panels', 'Collapsed metal frame', 'Broken control panels'][index];
    mesh.userData.destructionKind = 'debris'; mesh.userData.partsPerMachine = templates.counts[index];
    mesh.userData.machineIds = slotOwners;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, zero);
    mesh.count = 0;
    root.add(mesh); return mesh;
  });
  const effects = Array.from({ length: DESTRUCTION_LIMITS.activeEffects }, () => {
    const group = new THREE.Group(); group.visible = false; root.add(group);
    const fireMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const smokeMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0, roughness: 1, depthWrite: false });
    const sparkMaterial = new THREE.MeshBasicMaterial({ color: '#ffb456', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const fire = new THREE.InstancedMesh(cloud, fireMaterial, 5);
    const smoke = new THREE.InstancedMesh(cloud, smokeMaterial, 12);
    const sparks = new THREE.InstancedMesh(cube, sparkMaterial, 28);
    fire.name = 'Equipment fireburst'; smoke.name = 'Equipment smoke'; sparks.name = 'Equipment sparks';
    for (const mesh of [fire, smoke, sparks]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.visible = false; group.add(mesh);
      for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, zero);
    }
    for (let i = 0; i < fire.count; i++) fire.setColorAt(i, new THREE.Color(['#ffb94d', '#ff6726', '#ef3e17', '#ffd780', '#ff8e32'][i]));
    for (let i = 0; i < smoke.count; i++) smoke.setColorAt(i, new THREE.Color().setRGB(.12 + (i % 4) * .045, .13 + (i % 4) * .045, .14 + (i % 4) * .045));
    return { group, fire, smoke, sparks, record: null };
  });
  const destroyed = new Map(), active = new Set();
  const half = new THREE.Vector3(), matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  const position = new THREE.Vector3(), color = new THREE.Color(), effectSize = new THREE.Vector3();
  let disposed = false, serial = 0;

  function state() {
    return { destroyedIds: [...destroyed.keys()], destroyedCount: destroyed.size, activeCount: active.size,
      activeEffects: [...active].map(record => ({ id: record.id, age: record.age, stage: record.age < DESTRUCTION_LIMITS.burstSeconds ? 'burst' : record.age < DESTRUCTION_LIMITS.collapseSeconds ? 'collapse' : 'smoke' })),
      activeIds: [...active].map(record => record.id), settledCount: [...destroyed.values()].filter(record => record.settled).length,
      debrisCount: destroyed.size * templates.parts.length, partsPerMachine: templates.parts.length,
      debrisSlots: machines.length * templates.parts.length, drawnDebrisSlots: drawnSlots * templates.parts.length, poolSize: effects.length, disposed };
  }
  function changed() { onChange(state()); }
  function markDebris() {
    for (const mesh of debris) {
      if (!mesh.count) continue;
      for (const attribute of [mesh.instanceMatrix, mesh.instanceColor].filter(Boolean)) {
        attribute.clearUpdateRanges(); attribute.addUpdateRange(0, mesh.count * attribute.itemSize); attribute.needsUpdate = true;
      }
    }
  }
  function updateDrawCounts() {
    while (drawnSlots > 0 && slotOwners[drawnSlots - 1] === null) drawnSlots--;
    debris.forEach((mesh, index) => { mesh.count = drawnSlots * templates.counts[index]; });
  }
  function clampPart(point, extent, bounds) {
    point.x = clamp(point.x, bounds.minX + extent.x + .015, bounds.maxX - extent.x - .015);
    point.z = clamp(point.z, bounds.minZ + extent.z + .015, bounds.maxZ - extent.z - .015);
    point.y = clamp(point.y, extent.y + .015, DESTRUCTION_LIMITS.maxHeight - extent.y);
  }
  function partExtents(size, quaternion) {
    matrix.makeRotationFromQuaternion(quaternion);
    const m = matrix.elements;
    half.set((Math.abs(m[0]) * size.x + Math.abs(m[4]) * size.y + Math.abs(m[8]) * size.z) / 2,
      (Math.abs(m[1]) * size.x + Math.abs(m[5]) * size.y + Math.abs(m[9]) * size.z) / 2,
      (Math.abs(m[2]) * size.x + Math.abs(m[6]) * size.y + Math.abs(m[10]) * size.z) / 2);
    return half;
  }
  function makeParts(record) {
    const { machine, storageIndex } = record, rand = randomFor(record.id), scaleX = (machine.bounds.maxX - machine.bounds.minX) / 5.4;
    const sign = machine.sign === -1 ? -1 : 1, centerZ = (machine.bounds.minZ + machine.bounds.maxZ) / 2;
    const colors = ['#e3e9e9', '#8e9da3', '#34414a'];
    return templates.parts.map(template => {
      const size = new THREE.Vector3(template.sx * scaleX, template.sy, template.sz);
      const flat = new THREE.Quaternion();
      if (size.x < size.y && size.x < size.z) flat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      else if (size.z < size.y) flat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      const endRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - .5) * .22, rand() * Math.PI * 2, (rand() - .5) * .22)).multiply(flat);
      const baseColor = new THREE.Color(colors[template.material]);
      return { material: template.material, slot: storageIndex * templates.counts[template.material] + template.offset, size,
        start: new THREE.Vector3(machine.x + sign * template.x * scaleX, template.y, machine.z + sign * template.z),
        end: new THREE.Vector3(machine.x + (rand() - .5) * (machine.bounds.maxX - machine.bounds.minX) * .68, .07 + rand() * .42, centerZ + (rand() - .5) * (machine.bounds.maxZ - machine.bounds.minZ) * .68),
        startRotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sign === 1 ? 0 : Math.PI), endRotation,
        lift: reducedMotion ? 0 : .45 + rand() * .85, delay: rand() * .14, baseColor,
        endColor: baseColor.clone().lerp(new THREE.Color('#272c30'), template.material === 0 ? .30 + rand() * .55 : .48 + rand() * .35) };
    });
  }
  function updateParts(record, finish = false) {
    for (const part of record.parts) {
      const u = finish ? 1 : clamp((record.age - part.delay) / (DESTRUCTION_LIMITS.collapseSeconds - part.delay));
      const travel = smooth(u);
      const kick = finish || reducedMotion ? 0 : smooth((record.age - part.delay) / .14) * (1 - smooth((record.age - .25) / .9));
      rotation.copy(part.startRotation).slerp(part.endRotation, clamp(travel + .18 * kick * (1 - travel)));
      position.copy(part.start).lerp(part.end, travel);
      position.x += Math.sign(part.start.x - record.machine.x) * .18 * kick;
      position.z += Math.sign(part.start.z - record.machine.z) * .25 * kick;
      position.y += Math.sin(u * Math.PI) * part.lift + .36 * kick;
      clampPart(position, partExtents(part.size, rotation), record.machine.bounds);
      transform.position.copy(position); transform.quaternion.copy(rotation); transform.scale.copy(part.size); transform.updateMatrix();
      debris[part.material].setMatrixAt(part.slot, transform.matrix);
      color.copy(part.baseColor).lerp(part.endColor, smooth(u * 1.4)); debris[part.material].setColorAt(part.slot, color);
    }
    if (finish || record.age >= DESTRUCTION_LIMITS.collapseSeconds) record.settled = true;
  }
  function effectTransform(mesh, index, record, x, y, z, sx, sy = sx, sz = sx, tilt = 0) {
    position.set(x, y, z); effectSize.set(sx, sy, sz);
    transform.rotation.set(tilt, tilt * .7, tilt * .4);
    // Cloud geometries have radius 1; box geometry has full side length 1.
    if (mesh.geometry === cloud) half.setScalar(Math.max(sx, sy, sz));
    else partExtents(effectSize, transform.quaternion);
    clampPart(position, half, record.machine.bounds);
    transform.position.copy(position); transform.scale.copy(effectSize); transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  }
  function updateEffect(record) {
    const effect = record.effect, t = record.age, m = record.machine;
    const centerZ = (m.bounds.minZ + m.bounds.maxZ) / 2;
    const sign = m.sign === -1 ? -1 : 1, frontZ = sign === 1 ? m.bounds.maxZ : m.bounds.minZ;
    const fireLife = clamp(t / DESTRUCTION_LIMITS.burstSeconds), fireRadius = .22 + smooth(t / .3) * 1.02;
    effect.fire.visible = !reducedMotion && t < DESTRUCTION_LIMITS.burstSeconds;
    // One quick rise followed by a long fade; never a repeated flash or strobe.
    effect.fire.material.opacity = .94 * smooth(t / .10) * (1 - smooth((t - .27) / .78));
    if (effect.fire.visible) for (let i = 0; i < effect.fire.count; i++) {
      const radius = fireRadius * (i === 0 ? 1 : .72);
      // The main lobes break above and in front of the casing, rather than
      // spending their brief visible lifetime hidden inside opaque panels.
      const x = m.x + [0, -.63, .63, -.35, .4][i];
      const y = [3.02, 2.7, 2.78, 3.45, 2.55][i] + fireLife * .2;
      const z = i < 3 ? frontZ - sign * (radius + .07 + i * .08) : centerZ + sign * (i === 3 ? .55 : -.45);
      effectTransform(effect.fire, i, record, x, y, z, radius, radius * .92, radius, i * .4);
    }
    effect.sparks.visible = !reducedMotion && t < 1.35;
    effect.sparks.material.opacity = Math.max(0, 1 - t / 1.35);
    if (effect.sparks.visible) for (let i = 0; i < effect.sparks.count; i++) {
      const angle = i * 2.39996, speed = 1 + (i % 5) * .24;
      effectTransform(effect.sparks, i, record, m.x + Math.cos(angle) * speed * t, 2.8 + (2.3 + i % 3) * t - 4.9 * t * t,
        frontZ - sign * .45 + Math.sin(angle) * speed * t, .055, .055, .28 + (i % 3) * .035, angle + t * 4);
    }
    effect.smoke.visible = t > .12 && t < DESTRUCTION_LIMITS.effectSeconds;
    effect.smoke.material.opacity = (reducedMotion ? .18 : .34) * smooth((t - .12) / .55) * (1 - smooth((t - 3.1) / 2.1));
    if (effect.smoke.visible) for (let i = 0; i < effect.smoke.count; i++) {
      const age = Math.max(0, t - i * .065), angle = i * 2.39996;
      const radius = Math.min(.82, .20 + age * .17) * (.85 + i % 3 * .06);
      const spread = Math.min(.95, age * .3);
      effectTransform(effect.smoke, i, record, m.x + Math.cos(angle) * spread, 1.2 + age * .5 + (i % 4) * .28,
        centerZ + Math.sin(angle) * spread, radius, radius * 1.12, radius, i * .6 + age * .08);
    }
    for (const mesh of [effect.fire, effect.smoke, effect.sparks]) mesh.instanceMatrix.needsUpdate = true;
  }
  function finishEffect(record) {
    if (!record.settled) updateParts(record, true);
    record.effect.group.visible = false; record.effect.record = null; record.effect = null;
    active.delete(record);
  }
  function trigger(id) {
    if (disposed || destroyed.has(id) || !byId.has(id)) return false;
    let effect = effects.find(item => item.record === null);
    if (!effect) {
      const oldest = [...active].reduce((a, b) => a.serial < b.serial ? a : b);
      effect = oldest.effect; finishEffect(oldest);
    }
    const storageIndex = freeSlots.pop(); slotOwners[storageIndex] = id;
    drawnSlots = Math.max(drawnSlots, storageIndex + 1); updateDrawCounts();
    const record = { id, ...byId.get(id), storageIndex, age: 0, serial: serial++, settled: false, effect };
    record.parts = makeParts(record); destroyed.set(id, record); active.add(record);
    effect.record = record; effect.group.userData.machineId = id; effect.group.visible = true; root.visible = true;
    updateParts(record); updateEffect(record); markDebris();
    onVisibility(id, false); onBurst(id, { x: record.machine.x, z: record.machine.z, reducedMotion }); changed(); return true;
  }
  function update(dt) {
    if (disposed || !Number.isFinite(dt) || dt <= 0 || !active.size) return;
    let finished = false, movedDebris = false;
    for (const record of [...active]) {
      record.age = Math.min(DESTRUCTION_LIMITS.effectSeconds, record.age + dt);
      if (!record.settled) { updateParts(record); movedDebris = true; }
      if (record.age >= DESTRUCTION_LIMITS.effectSeconds) { finishEffect(record); finished = true; }
      else updateEffect(record);
    }
    if (movedDebris) markDebris(); if (finished) changed();
  }
  function restore(id) {
    const record = destroyed.get(id); if (!record) return false;
    if (record.effect) finishEffect(record);
    for (const part of record.parts) debris[part.material].setMatrixAt(part.slot, zero);
    slotOwners[record.storageIndex] = null; freeSlots.push(record.storageIndex); freeSlots.sort((a, b) => b - a); updateDrawCounts();
    destroyed.delete(id); onVisibility(id, true); return true;
  }
  function resetAll() {
    if (disposed) return false;
    const hadDestroyed = destroyed.size > 0;
    for (const id of [...destroyed.keys()]) restore(id);
    root.visible = false; markDebris(); if (hadDestroyed) changed(); return hadDestroyed;
  }
  function reset(id) {
    if (id === undefined) return resetAll();
    if (disposed || !restore(id)) return false;
    root.visible = destroyed.size > 0; markDebris(); changed(); return true;
  }
  function dispose() {
    if (disposed) return;
    resetAll(); disposed = true; root.removeFromParent();
    root.traverse(node => { if (node.isInstancedMesh) node.dispose(); });
    cube.dispose(); cloud.dispose(); materials.forEach(material => material.dispose());
    for (const effect of effects) for (const mesh of [effect.fire, effect.smoke, effect.sparks]) mesh.material.dispose();
    root.clear(); changed();
  }
  return { root, trigger, update, reset, resetAll, dispose, isDestroyed: id => destroyed.has(id), get state() { return state(); } };
}
