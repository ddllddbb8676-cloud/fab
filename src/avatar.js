// Rounded cleanroom visitor. Feet are at the local origin; forward is +Z.
// Instances share immutable geometry/materials, released after the last dispose.
const resourcePools = new WeakMap();

function acquireResources(THREE) {
  let resources = resourcePools.get(THREE);
  if (resources) { resources.references++; return resources; }
  const fabric = '#eff6f5', ice = '#e1eff1', glove = '#f8fcfa', boot = '#b8d5dc';
  const sphere = (segments = 8, rings = 6) => new THREE.SphereGeometry(1, segments, rings);
  const part = (geometry, color, position, scale = [1, 1, 1]) => ({ geometry, color, position, scale });
  function merge(parts) {
    const positions = [], normals = [], colors = [], indices = [];
    for (const item of parts) {
      const geometry = item.geometry;
      geometry.scale(...item.scale); geometry.translate(...item.position);
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
      const color = new THREE.Color(item.color), offset = positions.length / 3;
      for (let i = 0; i < p.count; i++) {
        positions.push(p.getX(i), p.getY(i), p.getZ(i));
        normals.push(n.getX(i), n.getY(i), n.getZ(i));
        colors.push(color.r, color.g, color.b);
      }
      if (geometry.index) for (const index of geometry.index.array) indices.push(index + offset);
      else for (let i = 0; i < p.count; i++) indices.push(i + offset);
      geometry.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  }
  const head = merge([
    part(sphere(16, 10), ice, [0, 1.345, 0], [.275, .315, .232]),
    part(sphere(10, 6), '#bdd5db', [0, 1.365, .192], [.181, .134, .075]),
    part(sphere(), glove, [0, 1.291, .234], [.146, .088, .051]),
    ...[-1, 1].map(side => part(sphere(6, 4), '#173c45', [side * .061, 1.407, .265], [.015, .022, .012]))
  ]);
  const torso = merge([
    part(new THREE.CapsuleGeometry(.185, .33, 4, 10), fabric, [0, .755, 0], [1, 1, .9]),
    // A fine zipper is enough to identify a continuous coverall; no waistband.
    part(new THREE.BoxGeometry(.009, .24, .003), '#80adb7', [0, .875, .167])
  ]);
  const arm = merge([
    part(new THREE.CapsuleGeometry(.055, .225, 3, 8), fabric, [0, -.16, 0]),
    part(sphere(), glove, [0, -.333, 0], [.057, .07, .055])
  ]);
  const bootGeometry = sphere();
  bootGeometry.scale(.083, .075, .12); bootGeometry.translate(0, -.405, .025);
  const bootVertices = bootGeometry.getAttribute('position');
  for (let i = 0; i < bootVertices.count; i++) {
    if (bootVertices.getY(i) < -.46) bootVertices.setY(i, -.48);
  }
  bootGeometry.computeVertexNormals();
  // Each latitude contributes just its front/back extremes to the floor support.
  const supportRings = new Map();
  for (let i = 0; i < bootVertices.count; i++) {
    const y = bootVertices.getY(i), z = bootVertices.getZ(i), key = y.toFixed(6);
    const ring = supportRings.get(key) ?? { y, minZ: z, maxZ: z };
    ring.minZ = Math.min(ring.minZ, z); ring.maxZ = Math.max(ring.maxZ, z); supportRings.set(key, ring);
  }
  const footSupport = [...supportRings.values()].flatMap(ring => [[ring.y, ring.minZ], [ring.y, ring.maxZ]]);
  const leg = merge([
    part(new THREE.CapsuleGeometry(.073, .23, 3, 8), fabric, [0, -.175, 0]),
    part(bootGeometry, boot, [0, 0, 0])
  ]);
  const shadow = new THREE.PlaneGeometry(.56, .52); shadow.rotateX(-Math.PI / 2);
  const size = 32, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + .5 - size / 2) / (size / 2), (y + .5 - size / 2) / (size / 2));
    const i = (y * size + x) * 4;
    pixels[i] = 29; pixels[i + 1] = 65; pixels[i + 2] = 78;
    pixels[i + 3] = Math.round(Math.max(0, 1 - radius) ** 2 * 65);
  }
  const shadowTexture = new THREE.DataTexture(pixels, size, size);
  shadowTexture.colorSpace = THREE.SRGBColorSpace; shadowTexture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .83, metalness: 0 });
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
  resources = { references: 1, head, torso, arm, leg, shadow, material, shadowMaterial, shadowTexture, footSupport };
  resourcePools.set(THREE, resources); return resources;
}

export function createAvatar(THREE) {
  const resources = acquireResources(THREE), root = new THREE.Group(); root.name = 'cleanroom-visitor';
  const body = new THREE.Group(), upper = new THREE.Group(); root.add(body); body.add(upper);
  const mesh = (geometry, parent, name) => {
    const result = new THREE.Mesh(geometry, resources.material); result.name = name; parent.add(result); return result;
  };
  mesh(resources.head, upper, 'hood-face-mask'); mesh(resources.torso, upper, 'coverall');
  const arms = [-1, 1].map(side => {
    const result = mesh(resources.arm, upper, side < 0 ? 'left-arm' : 'right-arm'); result.position.set(side * .202, .94, 0);
    return { side, mesh: result };
  });
  const legs = [-1, 1].map(side => {
    const result = mesh(resources.leg, body, side < 0 ? 'left-leg' : 'right-leg'); result.position.set(side * .105, .48, 0);
    return { side, mesh: result };
  });
  const shadow = new THREE.Mesh(resources.shadow, resources.shadowMaterial);
  shadow.name = 'contact-shadow'; shadow.position.y = .006; root.add(shadow);
  let phase = 0, activity = 0, facing = 0, currentSpeed = 0, disposed = false;
  function update(dt, { speed = 0, heading = facing } = {}) {
    if (disposed) return;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .1)) : 0;
    speed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    heading = Number.isFinite(heading) ? heading : facing;
    currentSpeed += (speed - currentSpeed) * (1 - Math.exp(-step * 14));
    activity += ((speed > .02 ? 1 : 0) - activity) * (1 - Math.exp(-step * 13));
    const turn = Math.atan2(Math.sin(heading - facing), Math.cos(heading - facing));
    facing += turn * (1 - Math.exp(-step * 13)); body.rotation.y = facing;
    phase = (phase + step * (1.3 + Math.min(currentSpeed, 4) * .28) * activity) % 1;
    const wave = Math.sin(phase * Math.PI * 2), stride = Math.min(.18, .07 + currentSpeed * .026) * activity;
    upper.position.set(wave * .006 * activity, -Math.abs(wave) * .008 * activity, 0);
    upper.rotation.z = wave * .009 * activity;
    for (const leg of legs) {
      const p = (phase + (leg.side === 1 ? .5 : 0)) % 1;
      const stance = p < .6, q = stance ? p / .6 : (p - .6) / .4;
      const swing = stance ? 1 - q * 2 : -1 + 2 * q * q * (3 - 2 * q);
      const angle = swing * stride, lift = stance ? 0 : Math.sin(q * Math.PI) * .045 * activity;
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      let floor = Infinity;
      for (const [y, z] of resources.footSupport) floor = Math.min(floor, y * cosine - z * sine);
      leg.mesh.rotation.x = angle; leg.mesh.position.y = -floor + lift;
    }
    for (const arm of arms) arm.mesh.rotation.x = -wave * arm.side * .24 * activity;
    root.userData.walking = activity > .05; root.userData.heading = facing;
  }
  update(0);
  return { root, body, update, height: 1.66, radius: .295,
    dispose() {
      if (disposed) return;
      disposed = true; root.removeFromParent();
      if (--resources.references !== 0) return;
      for (const geometry of [resources.head, resources.torso, resources.arm, resources.leg, resources.shadow]) geometry.dispose();
      resources.material.dispose(); resources.shadowMaterial.dispose(); resources.shadowTexture.dispose();
      resourcePools.delete(THREE);
    }
  };
}
