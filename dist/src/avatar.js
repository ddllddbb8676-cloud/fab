// A small cleanroom visitor: shared clothing geometry, an inset face and a real hood opening.
// Feet are the local origin; +Z is forward. The caller owns root.position/visibility.
const resourcePools = new WeakMap();

function acquireResources(THREE) {
  let resources = resourcePools.get(THREE);
  if (resources) { resources.references++; return resources; }
  const cloth = '#93adba', hoodColor = '#adc3cc', cuff = '#8ca7b4', glove = '#d7e3e0', shoe = '#b3c6ca';
  function geometry(positions, indices, uvs) {
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (uvs) result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    result.setIndex(indices); result.computeVertexNormals(); return result;
  }
  function profile(rings, sides = 12, roundness = .83) {
    const positions = [], indices = [];
    for (const [y, width, depth, z = 0] of rings) for (let i = 0; i <= sides; i++) {
      const a = i / sides * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
      positions.push(Math.sign(sx) * Math.abs(sx) ** roundness * width, y, z + Math.sign(sz) * Math.abs(sz) ** roundness * depth);
    }
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < sides; i++) {
      const a = r * (sides + 1) + i, b = a + sides + 1; indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    for (const row of [0, rings.length - 1]) {
      const center = positions.length / 3; positions.push(0, rings[row][0], rings[row][3] ?? 0);
      for (let i = 0; i < sides; i++) {
        const a = row * (sides + 1) + i;
        if (row === 0) indices.push(center, a + 1, a); else indices.push(center, a, a + 1);
      }
    }
    const result = geometry(positions, indices), normals = result.getAttribute('normal'), average = new THREE.Vector3();
    for (let row = 0; row < rings.length; row++) {
      const first = row * (sides + 1), last = first + sides;
      average.set(normals.getX(first) + normals.getX(last), normals.getY(first) + normals.getY(last), normals.getZ(first) + normals.getZ(last)).normalize();
      normals.setXYZ(first, average.x, average.y, average.z); normals.setXYZ(last, average.x, average.y, average.z);
    }
    return result;
  }
  function merge(parts) {
    const positions = [], normals = [], colors = [], indices = [];
    for (const [source, hex] of parts) {
      const p = source.getAttribute('position'), n = source.getAttribute('normal'), color = new THREE.Color(hex), offset = positions.length / 3;
      for (let i = 0; i < p.count; i++) {
        positions.push(p.getX(i), p.getY(i), p.getZ(i)); normals.push(n.getX(i), n.getY(i), n.getZ(i)); colors.push(color.r, color.g, color.b);
      }
      for (const index of source.index.array) indices.push(index + offset); source.dispose();
    }
    const result = geometry(positions, indices); result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); return result;
  }
  function ellipsoid(x, y, z, sx, sy, sz) {
    const result = new THREE.SphereGeometry(1, 10, 6); result.scale(sx, sy, sz); result.translate(x, y, z); return result;
  }
  // The front of the hood is open, rather than an intact sphere behind a second face.
  const headY = 1.37, rx = .231, ry = .27, rz = .203, opening = .86, sides = 24, rows = 13;
  const faceWidth = rx * Math.sin(opening), faceHeight = ry * Math.sin(opening), rimZ = rz * Math.cos(opening);
  const hp = [], hi = [], rp = [], ri = [];
  for (let row = 0; row <= rows; row++) {
    const phi = opening + (Math.PI - opening) * row / rows;
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * Math.PI * 2;
      hp.push(rx * Math.sin(phi) * Math.cos(a), headY + ry * Math.sin(phi) * Math.sin(a), rz * Math.cos(phi));
    }
  }
  for (let row = 0; row < rows; row++) for (let i = 0; i < sides; i++) {
    const a = row * (sides + 1) + i, b = a + sides + 1; hi.push(a, b, a + 1, b, b + 1, a + 1);
  }
  for (let i = 0; i <= sides; i++) for (let j = 0; j <= 4; j++) {
    const a = i / sides * Math.PI * 2, b = j / 4 * Math.PI * 2;
    rp.push((faceWidth + Math.cos(b) * .008) * Math.cos(a), headY + (faceHeight + Math.cos(b) * .008) * Math.sin(a), rimZ + Math.sin(b) * .007);
  }
  for (let i = 0; i < sides; i++) for (let j = 0; j < 4; j++) {
    const a = i * 5 + j, b = a + 5; ri.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const hoodShell = geometry(hp, hi), hoodNormals = hoodShell.getAttribute('normal'), normal = new THREE.Vector3();
  for (let i = 0; i < hp.length / 3; i++) {
    normal.set(hp[i * 3] / (rx * rx), (hp[i * 3 + 1] - headY) / (ry * ry), hp[i * 3 + 2] / (rz * rz)).normalize();
    hoodNormals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  const hood = merge([[hoodShell, hoodColor], [geometry(rp, ri), '#d6e1e3'],
    [profile([[1.105, .111, .09], [1.13, .122, .104], [1.19, .116, .106], [1.215, .092, .079]], 12), hoodColor]]);
  // A shallow cheek/forehead surface, with all facial details painted on it.
  const fp = [], fi = [], fu = [], faceRings = 7;
  for (let ring = 0; ring <= faceRings; ring++) for (let i = 0; i <= sides; i++) {
    const r = ring / faceRings, a = i / sides * Math.PI * 2, x = Math.cos(a) * r, y = Math.sin(a) * r;
    fp.push(x * faceWidth, headY + y * faceHeight, rimZ + .067 * (1 - r * r)); fu.push((x + 1) / 2, (y + 1) / 2);
  }
  for (let ring = 0; ring < faceRings; ring++) for (let i = 0; i < sides; i++) {
    const a = ring * (sides + 1) + i, b = a + sides + 1;
    if (ring > 0) fi.push(a, b, a + 1); fi.push(b, b + 1, a + 1);
  }
  const face = geometry(fp, fi, fu), faceNormals = face.getAttribute('normal');
  for (let i = 0; i < fp.length / 3; i++) {
    normal.set(.134 * fp[i * 3] / (faceWidth * faceWidth), .134 * (fp[i * 3 + 1] - headY) / (faceHeight * faceHeight), 1).normalize();
    faceNormals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  const textureSize = 256, facePixels = new Uint8Array(textureSize * textureSize * 4);
  const blend = (base, color, amount) => base.map((c, i) => c * (1 - amount) + color[i] * amount);
  for (let py = 0; py < textureSize; py++) for (let px = 0; px < textureSize; px++) {
    const x = (px + .5) / textureSize * 2 - 1, y = (py + .5) / textureSize * 2 - 1;
    let color = [230, 186, 157];
    const warmCheek = Math.exp(-((Math.abs(x) - .54) ** 2 / .025 + (y - .07) ** 2 / .035)) * .32;
    color = blend(color, [222, 132, 123], warmCheek);
    const eyeX = Math.abs(x) - .32, eye = .35 + .055 * (1 - (eyeX / .135) ** 2);
    if (Math.abs(eyeX) < .135 && Math.abs(y - eye) < .014) color = [64, 54, 47];
    const brow = .56 + .025 * (1 - (eyeX / .14) ** 2);
    if (Math.abs(eyeX) < .14 && Math.abs(y - brow) < .008) color = blend(color, [109, 79, 59], .62);
    const top = .035 + .095 * Math.exp(-x * x / .085), bottom = -.70 + .12 * x * x;
    const maskWidth = .80 - .10 * ((y + .12) / .65) ** 2;
    const masked = y < top && y > bottom && Math.abs(x) < maskWidth;
    const strap = Math.abs(x) > .76 && (Math.abs(y + .04 + (Math.abs(x) - .8) * .25) < .012 || Math.abs(y + .48 - (Math.abs(x) - .8) * .16) < .012);
    if (strap) color = [219, 230, 230];
    if (masked) {
      color = [237, 244, 241];
      if (top - y < .015 || y - bottom < .015 || maskWidth - Math.abs(x) < .012) color = [183, 203, 207];
      for (const pleat of [-.18, -.34, -.50]) if (Math.abs(y - (pleat + .035 * x * x)) < .008) color = [210, 223, 222];
    }
    const index = (py * textureSize + px) * 4;
    facePixels[index] = color[0]; facePixels[index + 1] = color[1]; facePixels[index + 2] = color[2]; facePixels[index + 3] = 255;
  }
  const faceTexture = new THREE.DataTexture(facePixels, textureSize, textureSize);
  faceTexture.colorSpace = THREE.SRGBColorSpace; faceTexture.magFilter = THREE.LinearFilter; faceTexture.minFilter = THREE.LinearFilter; faceTexture.needsUpdate = true;
  const torso = merge([[profile([[.53, .105, .092], [.56, .147, .119], [.67, .166, .133], [.87, .174, .139], [1.035, .179, .125], [1.105, .149, .105], [1.16, .105, .089]], 16), cloth],
    [new THREE.BoxGeometry(.008, .37, .003).translate(0, .866, .140), '#91abb8']]);
  const upperArm = merge([[profile([[-.57, .055, .055], [-.35, .064, .063], [.12, .069, .067], [.4, .064, .06], [.55, .05, .047]], 12), cloth]]);
  const forearm = merge([[profile([[-.11, .041, .042], [-.085, .048, .047], [.02, .058, .056], [.1, .058, .055]], 12), cloth],
    [profile([[-.113, .043, .043], [-.096, .046, .046]], 12), cuff], [ellipsoid(0, -.148, .006, .046, .06, .044), glove]]);
  const thigh = merge([[profile([[-.56, .069, .071], [-.15, .077, .077], [.28, .081, .08], [.56, .076, .074]], 12), cloth]]);
  const shin = merge([[profile([[-.55, .054, .057], [-.42, .058, .061], [.15, .068, .07], [.56, .069, .072]], 12), cloth],
    [profile([[-.57, .055, .058], [-.50, .057, .060]], 12), cuff]]);
  const boot = merge([[profile([[.012, .071, .103, .031], [.025, .079, .115, .033], [.073, .078, .112, .03], [.13, .061, .081, .009], [.156, .055, .061, -.004]], 16, .75), shoe],
    [profile([[0, .067, .1, .031], [.013, .073, .106, .031], [.026, .076, .108, .031]], 16, .75), '#b2c0c3']]);
  const shadow = new THREE.PlaneGeometry(.56, .52); shadow.rotateX(-Math.PI / 2);
  const size = 32, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot((x + .5 - size / 2) / (size / 2), (y + .5 - size / 2) / (size / 2)), i = (y * size + x) * 4;
    pixels[i] = 30; pixels[i + 1] = 51; pixels[i + 2] = 59; pixels[i + 3] = Math.round(Math.max(0, 1 - radius) ** 2 * 64);
  }
  const shadowTexture = new THREE.DataTexture(pixels, size, size); shadowTexture.colorSpace = THREE.SRGBColorSpace; shadowTexture.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .89, metalness: 0 });
  const faceMaterial = new THREE.MeshStandardMaterial({ map: faceTexture, roughness: .94, metalness: 0 });
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
  const geometries = { hood, face, torso, upperArm, forearm, thigh, shin, boot, shadow };
  for (const item of Object.values(geometries)) { item.computeBoundingBox(); item.computeBoundingSphere(); }
  resources = { references: 1, ...geometries, material, faceMaterial, shadowMaterial, faceTexture, shadowTexture };
  resourcePools.set(THREE, resources); return resources;
}

export function createAvatar(THREE) {
  const resources = acquireResources(THREE), root = new THREE.Group(); root.name = 'cleanroom-visitor';
  const body = new THREE.Group(), upper = new THREE.Group(); root.add(body); body.add(upper);
  function mesh(name, parent, material = resources.material) {
    const result = new THREE.Mesh(resources[name], material); result.name = name; parent.add(result); return result;
  }
  mesh('hood', upper); mesh('face', upper, resources.faceMaterial); mesh('torso', upper);
  const legs = [-1, 1].map(side => ({ side, thigh: mesh('thigh', body), shin: mesh('shin', body), boot: mesh('boot', body), hip: new THREE.Vector3(), knee: new THREE.Vector3(), ankle: new THREE.Vector3() }));
  const arms = [-1, 1].map(side => ({ side, sleeve: mesh('upperArm', upper), forearm: mesh('forearm', upper), shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3() }));
  const shadow = mesh('shadow', root, resources.shadowMaterial); shadow.position.y = .006;
  const direction = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function between(object, bottom, top, baseLength = 1) {
    direction.subVectors(top, bottom); object.position.copy(top).add(bottom).multiplyScalar(.5);
    object.scale.y = direction.length() / baseLength; object.quaternion.setFromUnitVectors(up, direction.normalize());
  }
  let phase = 0, activity = 0, facing = 0, currentSpeed = 0, disposed = false;
  function update(dt, { speed = 0, heading = facing } = {}) {
    if (disposed) return;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .1)) : 0;
    speed = Number.isFinite(speed) ? Math.max(0, speed) : 0; heading = Number.isFinite(heading) ? heading : facing;
    currentSpeed += (speed - currentSpeed) * (1 - Math.exp(-step * 12)); activity += ((speed > .02 ? 1 : 0) - activity) * (1 - Math.exp(-step * 10));
    facing += Math.atan2(Math.sin(heading - facing), Math.cos(heading - facing)) * (1 - Math.exp(-step * 12)); body.rotation.y = facing;
    phase = (phase + step * (1.35 + Math.min(currentSpeed, 4.3) * .25) * activity) % 1;
    const wave = Math.sin(phase * Math.PI * 2), stride = Math.min(.087, .035 + currentSpeed * .013) * activity, bob = -Math.abs(wave) * .008 * activity;
    upper.position.set(wave * .0035 * activity, bob, 0); upper.rotation.z = wave * .005 * activity;
    for (const leg of legs) {
      const p = (phase + (leg.side === 1 ? .5 : 0)) % 1, stance = p < .6, q = stance ? p / .6 : (p - .6) / .4;
      const footZ = stride * (stance ? 1 - 2 * q : -1 + 2 * q * q * (3 - 2 * q));
      const lift = stance ? 0 : Math.sin(q * Math.PI) ** 2 * .045 * activity;
      leg.hip.set(leg.side * .088, .63 + bob, 0); leg.ankle.set(leg.side * .088, .13 + lift, footZ);
      const dy = leg.ankle.y - leg.hip.y, dz = leg.ankle.z - leg.hip.z, d = Math.min(Math.hypot(dy, dz), .5099);
      const along = (.26 * .26 - .25 * .25 + d * d) / (2 * d), bend = Math.sqrt(Math.max(0, .26 * .26 - along * along));
      leg.knee.set(leg.hip.x, leg.hip.y + dy / d * along + dz / d * bend, leg.hip.z + dz / d * along - dy / d * bend);
      between(leg.thigh, leg.knee, leg.hip); between(leg.shin, leg.ankle, leg.knee); leg.boot.position.set(leg.side * .088, lift, footZ);
    }
    for (const arm of arms) {
      const swing = -wave * arm.side * .075 * activity;
      arm.shoulder.set(arm.side * .166, 1.065, 0); arm.elbow.set(arm.side * .211, .91, -.025 + swing * .5); arm.wrist.set(arm.side * .214, .755, .015 + swing);
      between(arm.sleeve, arm.elbow, arm.shoulder); between(arm.forearm, arm.wrist, arm.elbow, .2);
    }
    root.userData.walking = activity > .05; root.userData.heading = facing;
  }
  update(0);
  return { root, body, update, height: 1.64, radius: .295,
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      if (--resources.references !== 0) return;
      for (const name of ['hood', 'face', 'torso', 'upperArm', 'forearm', 'thigh', 'shin', 'boot', 'shadow']) resources[name].dispose();
      resources.material.dispose(); resources.faceMaterial.dispose(); resources.shadowMaterial.dispose(); resources.faceTexture.dispose(); resources.shadowTexture.dispose(); resourcePools.delete(THREE);
    }
  };
}
