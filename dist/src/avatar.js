import { createFacePixels, EYE_STYLES } from "./face-styles.js?v=46e019d9e853";
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
  const textureSize = 256, facePixels = createFacePixels('eyes-default', textureSize);
  const faceTexture = new THREE.DataTexture(facePixels, textureSize, textureSize);
  faceTexture.colorSpace = THREE.SRGBColorSpace; faceTexture.magFilter = THREE.LinearFilter; faceTexture.minFilter = THREE.LinearFilter; faceTexture.needsUpdate = true;
  // Compact chest/hips leave the trouser legs visible instead of forming a long pouch.
  const zipper = geometry([-.004,.56,.1191, .004,.56,.1191, -.004,.61,.131, .004,.61,.131,
    -.004,.73,.138, .004,.73,.138, -.004,.83,.128, .004,.83,.128, -.004,.86,.118, .004,.86,.118],
    [0,1,2,1,3,2,2,3,4,3,5,4,4,5,6,5,7,6,6,7,8,7,9,8]);
  const torso = merge([[profile([[.49, .100, .083], [.53, .145, .110], [.61, .169, .129], [.73, .175, .136], [.83, .166, .126], [.89, .137, .106], [.94, .098, .089]], 16), cloth],
    [zipper, '#8faeb9']]);
  const upperArm = merge([[profile([[-.57, .058, .057], [-.35, .069, .067], [.12, .074, .071], [.4, .068, .064], [.55, .052, .05]], 12), cloth]]);
  const forearm = merge([[profile([[-.11, .041, .042], [-.085, .048, .047], [.02, .058, .056], [.1, .058, .055]], 12), cloth],
    [profile([[-.113, .043, .043], [-.096, .046, .046]], 12), cuff]]);
  const glove = merge([[ellipsoid(0, -.035, 0, .049, .06, .047), gloveColor]]);
  const pants = merge([[profile([[-.55, .060, .063], [-.36, .072, .075], [.05, .082, .084], [.4, .080, .078], [.57, .073, .071]], 12), cloth],
    [profile([[-.57, .061, .064], [-.50, .063, .066]], 12), cuff]]);
  const boot = merge([[profile([[.012, .071, .098, .027], [.025, .078, .108, .029], [.066, .076, .105, .027], [.105, .061, .073, .007], [.127, .055, .059, -.004]], 16, .75), shoe],
    [profile([[0, .067, .1, .031], [.013, .073, .106, .031], [.026, .076, .108, .031]], 16, .75), '#b2c0c3']]);
  torso.scale(.88, 1, .90);
  upperArm.scale(.90, 1, .90); forearm.scale(.90, 1, .90);
  pants.scale(.88, 1, .92); glove.scale(.94, 1, .94); boot.scale(.94, 1, .95);
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
  let seated = 0, reclining = 0, hammer = null, broom = null;
  const broomGrip=new THREE.Vector3();
  function makeBroom(){
    const group=new THREE.Group();group.name='sweep-broom';body.add(group);
    function part(name,geometry,color,x,y,z){const m=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.78}));m.name=name;m.position.set(x,y,z);group.add(m);}
    part('broom-handle',new THREE.CylinderGeometry(.025,.03,1.14,8),'#cc9a58',0,.73,0);
    part('broom-head',new THREE.BoxGeometry(.76,.085,.15),'#36858a',0,.19,0);
    const bristles=new THREE.BufferGeometry(),vertices=[],indices=[];
    for(let i=0;i<9;i++){
      const x=(i-4)*.081,g=new THREE.BoxGeometry(.071,.15,.115);g.translate(x,.075,.012);
      const base=vertices.length/3;vertices.push(...g.attributes.position.array);indices.push(...Array.from(g.index.array,n=>n+base));g.dispose();
    }
    bristles.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));bristles.setIndex(indices);bristles.computeVertexNormals();
    part('broom-bristles',bristles,'#e1c37a',0,0,0);return group;
  }
  function makeHammer() {
    const group = new THREE.Group(); group.name = 'repair-hammer';
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(.018, .023, .19, 8), new THREE.MeshStandardMaterial({ color: '#dbac66', roughness: .65 }));
    handle.position.y = -.1;
    const head = new THREE.Mesh(new THREE.BoxGeometry(.16, .06, .065), new THREE.MeshStandardMaterial({ color: '#5d8991', metalness: .5, roughness: .32 }));
    head.position.y = -.21; group.add(handle, head); rightArm.glove.add(group); return group;
  }
  function update(dt, { speed = 0, heading = facing, turnRate = 12, pressTarget = null, pressProgress = 0, posture = 'stand', repairTime = null, cleanTime = null, hanging = false, carrying = false, crouch = 0, snap = false } = {}) {
    if (disposed) return;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .1)) : 0;
    speed = Number.isFinite(speed) ? Math.max(0, speed) : 0; heading = Number.isFinite(heading) ? heading : facing;
    const pressing = pressTarget && [pressTarget.x, pressTarget.y, pressTarget.z].every(Number.isFinite)
      ? Math.max(0, Math.min(1, Number.isFinite(pressProgress) ? pressProgress : 0)) : 0;
    const working = Number.isFinite(repairTime);
    const cleaning = Number.isFinite(cleanTime), sweep=cleaning?Math.sin(cleanTime*Math.PI*2*1.25):0;
    // A pooled body can represent a different visitor next frame. Its first
    // visible pose must belong entirely to that visitor, not the prior owner.
    if(snap){facing=heading;seated=posture==='sit'?1:0;reclining=posture==='lie'?1:0;phase=0;currentSpeed=speed;activity=speed>.02?1:0;}
    if (posture !== 'stand' || seated + reclining > .01 || working || cleaning) speed = 0;
    currentSpeed += (speed - currentSpeed) * (1 - Math.exp(-step * 12)); activity += ((speed > .02 ? 1 : 0) - activity) * (1 - Math.exp(-step * 10));
    const turn = Math.atan2(Math.sin(heading - facing), Math.cos(heading - facing));
    facing += turn * (1 - Math.exp(-step * turnRate));
    const restReady = Math.abs(turn) < .07;
    const approach = (value, goal) => { const next = value + Math.sign(goal - value) * Math.min(Math.abs(goal - value), step * 1.7); return Math.abs(goal - next) < 1e-6 ? goal : next; };
    seated = approach(seated, posture === 'sit' && restReady ? 1 : 0);
    reclining = approach(reclining, posture === 'lie' && restReady ? 1 : 0);
    const sit = seated * seated * (3 - 2 * seated), lie = reclining * reclining * (3 - 2 * reclining);
    body.rotation.order = 'YXZ'; body.rotation.set(-Math.PI / 2 * lie, facing, 0, 'YXZ');
    const restShift = .72 * lie - .10 * sit;
    body.position.set(Math.sin(facing) * restShift, .26 * Math.sin(Math.PI / 2 * lie), Math.cos(facing) * restShift);
    shadow.scale.set(1, 1 + 1.9 * lie, 1); shadow.rotation.y = facing;
    root.userData.resting = seated + reclining > .01;
    root.userData.posture = posture;
    root.userData.viewHeight = 1.02 - .36 * sit - .68 * lie;
    if (working && !hammer) hammer = makeHammer();
    if (hammer) hammer.visible = working;
    if(cleaning&&!broom)broom=makeBroom();
    if(broom){broom.visible=cleaning;broom.position.set(sweep*.35,.025+Math.abs(sweep)*.105,.65);broom.rotation.set(-.26,0,sweep*.25);}
    phase = (phase + step * (1.35 + Math.min(currentSpeed, 4.3) * .25) * activity) % 1;
    const wave = Math.sin(phase * Math.PI * 2), stride = Math.min(.065, .025 + currentSpeed * .010) * activity, bob = -Math.abs(wave) * .006 * activity;
    const duck = Math.max(0, Math.min(1, crouch)) * .16;
    upper.position.set(wave * .002 * activity, bob - .37 * sit - duck, 0); upper.rotation.z = wave * .003 * activity;
    upper.rotation.x = cleaning ? .10+.035*Math.cos(cleanTime*8) : working ? .035 + .025 * Math.sin(repairTime * 15) : 0;
    if(cleaning){upper.rotation.z=sweep*.045;root.updateMatrixWorld(true);}
    for (const leg of legs) {
      const p = (phase + (leg.side === 1 ? .5 : 0)) % 1, stance = p < .6, q = stance ? p / .6 : (p - .6) / .4;
      const footZ = stride * (stance ? 1 - 2 * q : -1 + 2 * q * q * (3 - 2 * q));
      const lift = stance ? 0 : Math.sin(q * Math.PI) ** 2 * .034 * activity;
      leg.footZ = footZ;
      leg.hip.set(leg.side * .088, .55 + bob - .37 * sit - duck, 0); leg.ankle.set(leg.side * .088, .105 + lift, footZ + .30 * sit);
      between(leg.pants, leg.ankle, leg.hip); leg.boot.position.set(leg.side * .088, lift, footZ + .30 * sit);
    }
    root.userData.pressReachable = false;
    if (pressing > 0) { root.updateMatrixWorld(true); pressLocal.set(pressTarget.x, pressTarget.y, pressTarget.z); upper.worldToLocal(pressLocal); }
    for (const arm of arms) {
      // Relaxed, downward arms. The same-side foot moving forward sends the hand back.
      const swing = -legs.find(leg => leg.side === arm.side).footZ * 1.15;
      arm.shoulder.set(arm.side * .155, .89, 0);
      arm.elbow.set(arm.side * .194, .69 + Math.abs(swing) * .04, -.010 + swing * .45);
      arm.wrist.set(arm.side * .200, .49 + Math.abs(swing) * .06, .012 + swing);
      if (sit > 0) { arm.elbow.lerp(reachElbow.set(arm.side * .20, .71, .10), sit); arm.wrist.lerp(reachWrist.set(arm.side * .17, .63, .24), sit); }
      if (working && arm !== rightArm) { arm.elbow.set(-.21, .72, .13); arm.wrist.set(-.17, .74, .24); }
      if (carrying) { arm.elbow.set(arm.side * .22, .69, .16); arm.wrist.set(arm.side * .23, .83, .34); }
      if (hanging) { arm.shoulder.y = .95; arm.elbow.set(arm.side * .24, 1.27, .035); arm.wrist.set(arm.side * .20, 1.60, .015); }
      if(cleaning){
        broomGrip.set(0,arm.side===1?.66:.94,0);broom.localToWorld(broomGrip);upper.worldToLocal(broomGrip);
        arm.wrist.copy(broomGrip);arm.elbow.copy(arm.shoulder).lerp(arm.wrist,.5);arm.elbow.x+=arm.side*.10;arm.elbow.z-=.025;
      }
      if (arm === rightArm && pressing > 0) {
        // Lift the shoulder only for the deliberate press; ordinary walking stays relaxed.
        arm.shoulder.y += .065 * pressing;
        reachDirection.copy(pressLocal).sub(arm.shoulder);
        const requestedDistance = reachDirection.length(), lengthA = .205, lengthB = .295;
        const minimumReach = Math.abs(lengthA - lengthB) + .001;
        const distance = Math.max(minimumReach, Math.min(lengthA + lengthB - .001, requestedDistance));
        root.userData.pressReachable = requestedDistance <= lengthA + lengthB - .001 && requestedDistance >= minimumReach;
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
  let suitMaterial = null, customFaceMaterial = null, customFaceTexture = null, eyeStyle = 'eyes-default';
  function setEyeStyle(style) {
    if (!EYE_STYLES.includes(style)) style = 'eyes-default';
    if (eyeStyle === style) return;
    eyeStyle = style;
    if (!customFaceMaterial) {
      customFaceTexture = new THREE.DataTexture(createFacePixels(style), 256, 256);
      customFaceTexture.colorSpace = THREE.SRGBColorSpace; customFaceTexture.magFilter = THREE.LinearFilter; customFaceTexture.minFilter = THREE.LinearFilter;
      customFaceMaterial = resources.faceMaterial.clone(); customFaceMaterial.map = customFaceTexture;
      root.getObjectByName('face').material = customFaceMaterial;
    } else customFaceTexture.image.data.set(createFacePixels(style));
    customFaceTexture.needsUpdate = true;
  }
  function setSuitColor(color) {
    if (!suitMaterial) { suitMaterial = resources.material.clone(); root.traverse(m => { if (m.isMesh && ['hood','torso','pants','upperArm','forearm'].includes(m.name)) m.material = suitMaterial; }); }
    suitMaterial.color.set(color);
  }
  return { root, body, update, setSuitColor, setEyeStyle, height: 1.44, radius: .295,
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      suitMaterial?.dispose(); customFaceMaterial?.dispose(); customFaceTexture?.dispose();
      if (hammer) hammer.traverse(node => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } });
      if (broom) broom.traverse(node => { if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); } });
      if (--resources.references !== 0) return;
      for (const name of ['hood', 'face', 'torso', 'upperArm', 'forearm', 'glove', 'pants', 'boot', 'shadow']) resources[name].dispose();
      resources.material.dispose(); resources.faceMaterial.dispose(); resources.shadowMaterial.dispose(); resources.faceTexture.dispose(); resources.shadowTexture.dispose(); resourcePools.delete(THREE);
    }
  };
}
