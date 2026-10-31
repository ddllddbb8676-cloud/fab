// A round, small cleanroom visitor with shared clothing and an inset face.
// Feet are the local origin; +Z is forward. The caller owns root.position/visibility.
const resourcePools = new WeakMap();

function acquireResources(THREE) {
  let resources = resourcePools.get(THREE);
  if (resources) { resources.references++; return resources; }
  const cloth = '#b0c9d1', hoodColor = '#d0e0e3', cuff = '#9fbac4', gloveColor = '#eff4ed', shoe = '#d2dfdf';
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
  const headY = 1.145, rx = .272, ry = .295, rz = .252, sides = 24, rows = 18;
  const faceWidth = .216, faceHeight = .175, faceOffset = -.035, faceFront = .238;
  const boundaryZ = angle => rz * Math.sqrt(Math.max(0, 1 - (faceWidth * Math.cos(angle) / rx) ** 2 - ((faceOffset + faceHeight * Math.sin(angle)) / ry) ** 2));
  const hp = [], hi = [], rp = [], ri = [];
  for (let row = 0; row <= rows; row++) {
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * Math.PI * 2, nx = faceWidth * Math.cos(a) / rx, ny = (faceOffset + faceHeight * Math.sin(a)) / ry;
      const opening = Math.asin(Math.hypot(nx, ny)), phi = opening + (Math.PI - opening) * row / rows, azimuth = Math.atan2(ny, nx);
      hp.push(rx * Math.sin(phi) * Math.cos(azimuth), headY + ry * Math.sin(phi) * Math.sin(azimuth), rz * Math.cos(phi));
    }
  }
  for (let row = 0; row < rows; row++) for (let i = 0; i < sides; i++) {
    const a = row * (sides + 1) + i, b = a + sides + 1; hi.push(a, b, a + 1, b, b + 1, a + 1);
  }
  for (let i = 0; i <= sides; i++) for (let j = 0; j <= 4; j++) {
    const a = i / sides * Math.PI * 2, b = j / 4 * Math.PI * 2;
    rp.push((faceWidth + Math.cos(b) * .007) * Math.cos(a), headY + faceOffset + (faceHeight + Math.cos(b) * .007) * Math.sin(a), boundaryZ(a) + Math.sin(b) * .006);
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
    [profile([[.87, .111, .09], [.89, .122, .104], [.95, .116, .106], [.97, .092, .079]], 12), hoodColor]]);
  // A shallow cheek/forehead surface, with all facial details painted on it.
  const fp = [], fi = [], fu = [], faceRings = 7;
  for (let ring = 0; ring <= faceRings; ring++) for (let i = 0; i <= sides; i++) {
    const r = ring / faceRings, a = i / sides * Math.PI * 2, x = Math.cos(a) * r, y = Math.sin(a) * r;
    fp.push(x * faceWidth, headY + faceOffset + y * faceHeight, faceFront + r * r * (boundaryZ(a) - faceFront)); fu.push((x + 1) / 2, (y + 1) / 2);
  }
  for (let ring = 0; ring < faceRings; ring++) for (let i = 0; i < sides; i++) {
    const a = ring * (sides + 1) + i, b = a + sides + 1;
    if (ring > 0) fi.push(a, b, a + 1); fi.push(b, b + 1, a + 1);
  }
  const face = geometry(fp, fi, fu), faceNormals = face.getAttribute('normal');
  const faceDepth = (x, y) => faceFront + ((x / faceWidth) ** 2 + (y / faceHeight) ** 2) * (boundaryZ(Math.atan2(y / faceHeight, x / faceWidth)) - faceFront);
  for (let i = 0; i < fp.length / 3; i++) {
    const x = fp[i * 3], y = fp[i * 3 + 1] - headY - faceOffset, epsilon = .0001;
    normal.set(-(faceDepth(x + epsilon, y) - faceDepth(x - epsilon, y)) / (2 * epsilon), -(faceDepth(x, y + epsilon) - faceDepth(x, y - epsilon)) / (2 * epsilon), 1).normalize();
    faceNormals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  const textureSize = 256, facePixels = new Uint8Array(textureSize * textureSize * 4);
  const blend = (base, color, amount) => base.map((c, i) => c * (1 - amount) + color[i] * amount);
  for (let py = 0; py < textureSize; py++) for (let px = 0; px < textureSize; px++) {
    const x = (px + .5) / textureSize * 2 - 1, y = (py + .5) / textureSize * 2 - 1;
    let color = [238, 198, 174];
    const warmCheek = Math.exp(-((Math.abs(x) - .54) ** 2 / .027 + (y + .10) ** 2 / .035)) * .36;
    color = blend(color, [222, 132, 123], warmCheek);
    const eyeX = Math.abs(x) - .32;
    if ((eyeX / .074) ** 2 + ((y - .16) / .102) ** 2 < 1) color = [49, 45, 43];
    if (((eyeX + .021) / .016) ** 2 + ((y - .194) / .022) ** 2 < 1) color = [236, 231, 219];
    const top = -.23 + .055 * Math.exp(-x * x / .08), bottom = -.69 + .12 * x * x;
    const maskWidth = .64 - .08 * ((y + .3) / .55) ** 2;
    const masked = y < top && y > bottom && Math.abs(x) < maskWidth;
    const strap = Math.abs(x) > .60 && (Math.abs(y + .26 + (Math.abs(x) - .64) * .12) < .010 || Math.abs(y + .52 - (Math.abs(x) - .64) * .12) < .010);
    if (strap) color = [219, 230, 230];
    if (masked) {
      color = [237, 244, 241];
      if (top - y < .015 || y - bottom < .015 || maskWidth - Math.abs(x) < .012) color = [183, 203, 207];
      for (const pleat of [-.38, -.51]) if (Math.abs(y - (pleat + .035 * x * x)) < .006) color = [215, 228, 225];
    }
    const index = (py * textureSize + px) * 4;
    facePixels[index] = color[0]; facePixels[index + 1] = color[1]; facePixels[index + 2] = color[2]; facePixels[index + 3] = 255;
  }
  const faceTexture = new THREE.DataTexture(facePixels, textureSize, textureSize);
  faceTexture.colorSpace = THREE.SRGBColorSpace; faceTexture.magFilter = THREE.LinearFilter; faceTexture.minFilter = THREE.LinearFilter; faceTexture.needsUpdate = true;
  const torso = merge([[profile([[.285, .095, .087], [.32, .145, .12], [.42, .184, .15], [.60, .194, .16], [.75, .185, .15], [.85, .149, .118], [.93, .098, .089]], 16), cloth],
    [new THREE.BoxGeometry(.008, .25, .003).translate(0, .65, .160), '#8faeb9']]);
  const upperArm = merge([[profile([[-.57, .058, .057], [-.35, .069, .067], [.12, .074, .071], [.4, .068, .064], [.55, .052, .05]], 12), cloth]]);
  const forearm = merge([[profile([[-.11, .041, .042], [-.085, .048, .047], [.02, .058, .056], [.1, .058, .055]], 12), cloth],
    [profile([[-.113, .043, .043], [-.096, .046, .046]], 12), cuff]]);
  const glove = merge([[ellipsoid(0, -.035, 0, .049, .06, .047), gloveColor]]);
  const pants = merge([[profile([[-.55, .060, .063], [-.36, .072, .075], [.05, .082, .084], [.4, .080, .078], [.57, .073, .071]], 12), cloth],
    [profile([[-.57, .061, .064], [-.50, .063, .066]], 12), cuff]]);
  const boot = merge([[profile([[.012, .071, .098, .027], [.025, .078, .108, .029], [.066, .076, .105, .027], [.105, .061, .073, .007], [.127, .055, .059, -.004]], 16, .75), shoe],
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
  const geometries = { hood, face, torso, upperArm, forearm, glove, pants, boot, shadow };
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
  const legs = [-1, 1].map(side => ({ side, pants: mesh('pants', body), boot: mesh('boot', body), hip: new THREE.Vector3(), ankle: new THREE.Vector3() }));
  const arms = [-1, 1].map(side => ({ side, sleeve: mesh('upperArm', upper), forearm: mesh('forearm', upper), glove: mesh('glove', upper), shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3() }));
  const shadow = mesh('shadow', root, resources.shadowMaterial); shadow.position.y = .006;
  const direction = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const pressLocal = new THREE.Vector3(), reachDirection = new THREE.Vector3(), bendDirection = new THREE.Vector3();
  const reachElbow = new THREE.Vector3(), reachWrist = new THREE.Vector3(), reachTip = new THREE.Vector3(), handWorld = new THREE.Vector3();
  const rightArm = arms.find(arm => arm.side === 1), handTip = new THREE.Vector3(0, -.095, 0);
  function between(object, bottom, top, baseLength = 1) {
    direction.subVectors(top, bottom); object.position.copy(top).add(bottom).multiplyScalar(.5);
    object.scale.y = direction.length() / baseLength; object.quaternion.setFromUnitVectors(up, direction.normalize());
  }
  let phase = 0, activity = 0, facing = 0, currentSpeed = 0, disposed = false;
  function update(dt, { speed = 0, heading = facing, pressTarget = null, pressProgress = 0 } = {}) {
    if (disposed) return;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .1)) : 0;
    speed = Number.isFinite(speed) ? Math.max(0, speed) : 0; heading = Number.isFinite(heading) ? heading : facing;
    const pressing = pressTarget && [pressTarget.x, pressTarget.y, pressTarget.z].every(Number.isFinite)
      ? Math.max(0, Math.min(1, Number.isFinite(pressProgress) ? pressProgress : 0)) : 0;
    currentSpeed += (speed - currentSpeed) * (1 - Math.exp(-step * 12)); activity += ((speed > .02 ? 1 : 0) - activity) * (1 - Math.exp(-step * 10));
    facing += Math.atan2(Math.sin(heading - facing), Math.cos(heading - facing)) * (1 - Math.exp(-step * 12)); body.rotation.y = facing;
    phase = (phase + step * (1.35 + Math.min(currentSpeed, 4.3) * .25) * activity) % 1;
    const wave = Math.sin(phase * Math.PI * 2), stride = Math.min(.065, .025 + currentSpeed * .010) * activity, bob = -Math.abs(wave) * .006 * activity;
    upper.position.set(wave * .002 * activity, bob, 0); upper.rotation.z = wave * .003 * activity;
    for (const leg of legs) {
      const p = (phase + (leg.side === 1 ? .5 : 0)) % 1, stance = p < .6, q = stance ? p / .6 : (p - .6) / .4;
      const footZ = stride * (stance ? 1 - 2 * q : -1 + 2 * q * q * (3 - 2 * q));
      const lift = stance ? 0 : Math.sin(q * Math.PI) ** 2 * .034 * activity;
      leg.hip.set(leg.side * .088, .395 + bob, 0); leg.ankle.set(leg.side * .088, .105 + lift, footZ);
      between(leg.pants, leg.ankle, leg.hip); leg.boot.position.set(leg.side * .088, lift, footZ);
    }
    root.userData.pressReachable = false;
    if (pressing > 0) { root.updateMatrixWorld(true); pressLocal.set(pressTarget.x, pressTarget.y, pressTarget.z); upper.worldToLocal(pressLocal); }
    for (const arm of arms) {
      const swing = -wave * arm.side * .050 * activity;
      arm.shoulder.set(arm.side * .167, .875, 0); arm.elbow.set(arm.side * .208, .755, -.015 + swing * .4); arm.wrist.set(arm.side * .200, .715, .055 + swing);
      if (arm === rightArm && pressing > 0) {
        // A little shoulder lift keeps the normal arms short while reaching a 1.28 m EMO.
        arm.shoulder.y += .065 * pressing;
        reachDirection.copy(pressLocal).sub(arm.shoulder);
        const requestedDistance = reachDirection.length(), lengthA = .19, lengthB = .27;
        const distance = Math.max(.081, Math.min(lengthA + lengthB - .001, requestedDistance));
        root.userData.pressReachable = requestedDistance <= lengthA + lengthB - .001 && requestedDistance >= .081;
        if (requestedDistance > 1e-8) reachDirection.multiplyScalar(1 / requestedDistance); else reachDirection.set(0, 0, 1);
        reachTip.copy(arm.shoulder).addScaledVector(reachDirection, distance);
        const along = (lengthA * lengthA - lengthB * lengthB + distance * distance) / (2 * distance);
        const bend = Math.sqrt(Math.max(0, lengthA * lengthA - along * along));
        bendDirection.set(1, -.25, -.15).addScaledVector(reachDirection, -bendDirection.dot(reachDirection));
        if (bendDirection.lengthSq() < 1e-8) bendDirection.set(0, 0, 1).addScaledVector(reachDirection, -reachDirection.z);
        bendDirection.normalize(); reachElbow.copy(arm.shoulder).addScaledVector(reachDirection, along).addScaledVector(bendDirection, bend);
        reachWrist.copy(reachTip).addScaledVector(direction.copy(reachTip).sub(reachElbow).normalize(), -.095);
        arm.elbow.lerp(reachElbow, pressing); arm.wrist.lerp(reachWrist, pressing);
      }
      between(arm.sleeve, arm.elbow, arm.shoulder); between(arm.forearm, arm.wrist, arm.elbow, .2);
      arm.glove.position.copy(arm.wrist); arm.glove.quaternion.copy(arm.forearm.quaternion);
    }
    root.updateMatrixWorld(true); handWorld.copy(handTip); rightArm.glove.localToWorld(handWorld);
    root.userData.pressHandWorld ??= { x: 0, y: 0, z: 0 };
    Object.assign(root.userData.pressHandWorld, { x: handWorld.x, y: handWorld.y, z: handWorld.z });
    root.userData.walking = activity > .05; root.userData.heading = facing;
  }
  update(0);
  return { root, body, update, height: 1.44, radius: .295,
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      if (--resources.references !== 0) return;
      for (const name of ['hood', 'face', 'torso', 'upperArm', 'forearm', 'glove', 'pants', 'boot', 'shadow']) resources[name].dispose();
      resources.material.dispose(); resources.faceMaterial.dispose(); resources.shadowMaterial.dispose(); resources.faceTexture.dispose(); resources.shadowTexture.dispose(); resourcePools.delete(THREE);
    }
  };
}
