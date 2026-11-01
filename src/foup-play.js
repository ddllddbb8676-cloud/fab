import { isBlocked, machines, SEATED_FOUP_Y } from './layout.js';

export function floorSpot(point, radius = .295) {
  if (!isBlocked(point.x, point.z, radius)) return { x: point.x, z: point.z };
  for (let r = .12; r <= 4; r += .12) for (let i = 0; i < 32; i++) {
    const a = i * Math.PI / 16, x = point.x + Math.sin(a) * r, z = point.z + Math.cos(a) * r;
    if (!isBlocked(x, z, radius)) return { x, z };
  }
  return null;
}

export function supportHeight(x, z) {
  let height = 0;
  for (const machine of machines) for (const b of machine.walkBounds) {
    if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) height = Math.max(height, b.part === 'cabinet' ? 3.4 : b.part === 'efem' ? 1.4625 : 2.05);
  }
  return height;
}

// A FOUP keeps the same identity across port, hands, throw and ground states.
export function createFoupStore({ ports, initialPortIds = [], hideOriginal = () => {}, isDestroyed = () => false, onImpact = () => {} }) {
  const byPort = new Map(ports.map(p => [p.id, p])), records = new Map(), occupancy = new Map();
  const hands = new Map();
  for (const id of initialPortIds) {
    const p = byPort.get(id); if (!p) continue;
    const record = { id: `port:${id}`, mode: 'port', portId: id, original: true, x: p.x, y: SEATED_FOUP_Y, z: p.z, yaw: p.sign === 1 ? Math.PI : 0 };
    records.set(record.id, record); occupancy.set(id, record.id);
  }
  function atPort(id) { const p = byPort.get(id); return p && !isDestroyed(p.machineId) ? records.get(occupancy.get(id)) ?? null : null; }
  function adopt(id, pose, portId = null) {
    if (records.has(id)) return records.get(id);
    const record = { id, mode: portId ? 'port' : 'ground', portId, original: false, ...pose };
    records.set(id, record); if (portId) occupancy.set(portId, id); return record;
  }
  function pickup(id, owner = 'player') {
    const record = records.get(id);
    if (hands.has(owner) || !record || !['port', 'ground'].includes(record.mode)) return false;
    if (record.portId && atPort(record.portId) !== record) return false;
    if (record.original) { hideOriginal(record.portId); record.original = false; }
    if (record.portId) occupancy.delete(record.portId);
    record.portId = null; record.mode = 'carried'; record.owner = owner; hands.set(owner, id); return true;
  }
  function place(portId, owner = 'player') {
    const record = records.get(hands.get(owner)), p = byPort.get(portId);
    if (!record || !p || occupancy.has(portId) || isDestroyed(p.machineId)) return false;
    Object.assign(record, { mode: 'port', portId, x: p.x, y: SEATED_FOUP_Y, z: p.z, yaw: p.sign === 1 ? Math.PI : 0 });
    occupancy.set(portId, record.id); hands.delete(owner); delete record.owner; return true;
  }
  function launch(record, pose, velocity) {
    if (!record || !records.has(record.id)) return false;
    if (record.original) { hideOriginal(record.portId); record.original = false; }
    if (record.portId) occupancy.delete(record.portId);
    if (record.owner) hands.delete(record.owner); delete record.owner;
    Object.assign(record, pose, { mode: 'flying', portId: null, vx: velocity.x, vy: velocity.y, vz: velocity.z, bounce: 0 }); return true;
  }
  function step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const steps = Math.max(1, Math.ceil(Math.min(dt, .1) / .016)), h = Math.min(dt, .1) / steps;
    for (let i = 0; i < steps; i++) for (const record of records.values()) {
      if (record.mode !== 'flying') continue;
      const x = record.x + record.vx * h, z = record.z + record.vz * h;
      if (Math.abs(x) < 58.5 && Math.abs(z) < 88.2 && record.y - .22 > supportHeight(x, z)) { record.x = x; record.z = z; }
      else { record.vx *= -.25; record.vz *= -.25; }
      record.vy -= 9.8 * h; record.y += record.vy * h; record.yaw += h * 5;
      if (record.y <= .225) {
        if (Math.abs(record.vy) > 1) onImpact(record, Math.abs(record.vy));
        record.y = .225;
        if (Math.abs(record.vy) > 1 && record.bounce++ < 2) { record.vy = -record.vy * .25; record.vx *= .4; record.vz *= .4; }
        else { const spot = floorSpot(record, .24); if (spot) Object.assign(record, spot); record.mode = 'ground'; }
      }
    }
  }
  return { records, atPort, adopt, pickup, place, launch, step, occupied: id => occupancy.has(id),
    getCarried: owner => records.get(hands.get(owner)) ?? null,
    get carried() { return records.get(hands.get('player')) ?? null; },
    get state() { return { carriedId: hands.get('player') ?? null, managed: records.size, moved: [...records.values()].filter(r => !r.original).map(r => ({ id: r.id, mode: r.mode, owner: r.owner, portId: r.portId, x: r.x, y: r.y, z: r.z })) }; }
  };
}

// Only moved FOUPs enter these four instanced draws; untouched ports stay static.
export function createFoupRenderer(THREE, scene, materials, capacity = 1200) {
  const geometry = new THREE.BoxGeometry(1, 1, 1), transform = new THREE.Object3D(), part = new THREE.Object3D(), matrix = new THREE.Matrix4();
  const pieces = [
    { material: materials.foup, shapes: [[0, 0, 0, .43, .38, .36]] },
    { material: materials.foupDoor, shapes: [[0, 0, .19, .38, .32, .025]] },
    { material: materials.dark, shapes: [[0, -.205, 0, .45, .035, .38]] },
    { material: materials.foupRib, shapes: [[0, .215, 0, .19, .045, .13], ...Array.from({ length: 10 }, (_, i) => [(i % 2 ? 1 : -1) * .222, -.13 + Math.floor(i / 2) * .065, 0, .025, .024, .31])] }
  ];
  for (const group of pieces) {
    group.mesh = new THREE.InstancedMesh(geometry, group.material, capacity * group.shapes.length);
    group.mesh.name = 'Interactive FOUPs'; group.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.mesh.count = 0; group.mesh.frustumCulled = false; scene.add(group.mesh);
    group.locals = group.shapes.map(([x,y,z,sx,sy,sz]) => { part.position.set(x,y,z); part.scale.set(sx,sy,sz); part.updateMatrix(); return part.matrix.clone(); });
  }
  return {
    update(records) {
      const visible = records.filter(r => !r.original && !r.hidden).slice(0, capacity);
      for (const group of pieces) {
        group.mesh.count = visible.length * group.locals.length;
        visible.forEach((record, index) => {
          transform.position.set(record.x, record.y, record.z); transform.rotation.set(0, record.yaw ?? 0, 0); transform.scale.setScalar(1); transform.updateMatrix();
          group.locals.forEach((local, j) => { matrix.multiplyMatrices(transform.matrix, local); group.mesh.setMatrixAt(index * group.locals.length + j, matrix); });
        });
        if (visible.length) group.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() { for (const group of pieces) { group.mesh.removeFromParent(); group.mesh.dispose(); } geometry.dispose(); }
  };
}
