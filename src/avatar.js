// Small, articulated cleanroom visitor. Local origin is the floor; forward is +Z.
// Caller owns root.position and visibility. No external models or textures.
export function createAvatar(THREE) {
  const root = new THREE.Group(); root.name = 'cleanroom-visitor';
  const body = new THREE.Group(); root.add(body);
  const upper = new THREE.Group(); body.add(upper);
  const sphere = new THREE.SphereGeometry(1, 14, 10);
  const capsule = new THREE.CapsuleGeometry(.5, 1, 4, 10);
  const plane = new THREE.PlaneGeometry(1, 1);
  const materials = [];
  const material = (color, options = {}) => {
    const result = new THREE.MeshStandardMaterial({ color, roughness: .77, metalness: 0, ...options });
    materials.push(result); return result;
  };
  const fabric = material('#eaf3f3'), hood = material('#d5e9ed'), seam = material('#4e8b99');
  const boots = material('#b0ccd6'), gloves = material('#f8fbf7'), face = material('#e8d8c8');
  const frame = material('#3b6877'), lens = material('#c6e4e8', { roughness: .22 });
  const eyes = material('#1e414d'), mask = material('#f5fbf9');
  function ellipsoid(parent, mat, x, y, z, sx, sy, sz) {
    const mesh = new THREE.Mesh(sphere, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  }
  function patch(parent, mat, x, y, z, width, height, rotation = 0) {
    const mesh = new THREE.Mesh(plane, mat); mesh.position.set(x, y, z); mesh.scale.set(width, height, 1); mesh.rotation.y = rotation; parent.add(mesh); return mesh;
  }
  function limb(parent, mat, radius) {
    const mesh = new THREE.Mesh(capsule, mat); parent.add(mesh); mesh.userData.radius = radius; return mesh;
  }
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();
  function between(mesh, a, b) {
    direction.subVectors(b, a); const length = direction.length();
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.scale.set(mesh.userData.radius * 2, length / 2, mesh.userData.radius * 2);
    mesh.quaternion.setFromUnitVectors(up, direction.normalize());
  }

  // Rounded, continuous coverall silhouette. The hood overlaps the neck/collar.
  const torso = new THREE.Mesh(capsule, fabric); torso.position.set(0, 1.025, 0); torso.scale.set(.37, .245, .32); upper.add(torso);
  ellipsoid(upper, fabric, 0, .795, 0, .182, .15, .15);
  ellipsoid(upper, hood, 0, 1.26, .005, .142, .075, .135);
  ellipsoid(upper, hood, 0, 1.44, 0, .214, .22, .204);
  ellipsoid(upper, face, 0, 1.445, .168, .153, .13, .084);
  ellipsoid(upper, frame, 0, 1.485, .213, .163, .061, .045);
  ellipsoid(upper, lens, 0, 1.49, .242, .143, .043, .023);
  for (const side of [-1, 1]) ellipsoid(upper, eyes, side * .054, 1.485, .264, .012, .016, .008);
  ellipsoid(upper, mask, 0, 1.383, .215, .136, .073, .045);
  // A zipper, small ID tab and back seam make the outfit readable in follow view.
  patch(upper, seam, 0, 1.042, .162, .014, .30);
  patch(upper, hood, .102, 1.121, .154, .083, .092);
  patch(upper, seam, .102, 1.137, .157, .059, .014);
  patch(upper, seam, 0, 1.09, -.164, .17, .068, Math.PI);
  patch(upper, gloves, 0, 1.09, -.166, .11, .016, Math.PI);
  patch(upper, hood, 0, .962, -.163, .013, .17, Math.PI);

  const legs = [-1, 1].map(side => ({ side,
    thigh: limb(body, fabric, .081), shin: limb(body, fabric, .074),
    boot: ellipsoid(body, boots, side * .115, .085, .055, .094, .085, .159),
    sole: ellipsoid(body, seam, side * .115, .027, .065, .097, .026, .16),
    hip: new THREE.Vector3(), knee: new THREE.Vector3(), ankle: new THREE.Vector3()
  }));
  const arms = [-1, 1].map(side => ({ side,
    sleeve: limb(body, fabric, .067), forearm: limb(body, hood, .06),
    hand: ellipsoid(body, gloves, side * .22, .78, 0, .062, .078, .061),
    shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3()
  }));

  let shadowTexture = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(29,65,78,.28)'); gradient.addColorStop(.5, 'rgba(29,65,78,.15)'); gradient.addColorStop(1, 'rgba(29,65,78,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    shadowTexture = new THREE.CanvasTexture(canvas);
    const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }); materials.push(shadowMaterial);
    const shadow = new THREE.Mesh(plane, shadowMaterial); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .007; shadow.scale.set(.85, .78, 1); root.add(shadow);
  }

  let phase = 0, activity = 0, facing = 0, currentSpeed = 0;
  function update(dt, { speed = 0, heading = facing } = {}) {
    const step = Math.max(0, Math.min(dt, .1));
    currentSpeed += (Math.max(0, speed) - currentSpeed) * (1 - Math.exp(-step * 14));
    activity += ((speed > .02 ? 1 : 0) - activity) * (1 - Math.exp(-step * 13));
    const turn = Math.atan2(Math.sin(heading - facing), Math.cos(heading - facing));
    facing += turn * (1 - Math.exp(-step * 13)); body.rotation.y = facing;
    const frequency = 1.25 + Math.min(currentSpeed, 4) * .32;
    phase = (phase + step * frequency * activity) % 1;
    const stride = Math.min(.27, .09 + currentSpeed * .075) * activity;
    const bob = -Math.abs(Math.sin(phase * Math.PI * 2)) * .012 * activity;
    upper.position.y = bob;
    for (const leg of legs) {
      const p = (phase + (leg.side === 1 ? .5 : 0)) % 1;
      // Stance occupies most of the step; only the returning foot lifts.
      const stance = p < .6;
      const q = stance ? p / .6 : (p - .6) / .4;
      const footZ = stance ? stride * (1 - q * 2) : stride * (-1 + 2 * (q * q * (3 - 2 * q)));
      const lift = stance ? 0 : Math.sin(q * Math.PI) * .075 * activity;
      leg.hip.set(leg.side * .115, .785 + bob, 0);
      leg.ankle.set(leg.side * .115, .15 + lift, footZ);
      const dy = leg.ankle.y - leg.hip.y, dz = leg.ankle.z - leg.hip.z;
      const d = Math.min(Math.hypot(dy, dz), .729), lengthA = .37, lengthB = .37;
      const along = (lengthA * lengthA - lengthB * lengthB + d * d) / (2 * d);
      const bend = Math.sqrt(Math.max(0, lengthA * lengthA - along * along));
      leg.knee.set(leg.hip.x, leg.hip.y + dy / d * along + dz / d * bend, leg.hip.z + dz / d * along - dy / d * bend);
      between(leg.thigh, leg.hip, leg.knee); between(leg.shin, leg.knee, leg.ankle);
      leg.boot.position.set(leg.ankle.x, .085 + lift, footZ + .055);
      leg.sole.position.set(leg.ankle.x, .027 + lift, footZ + .065);
    }
    for (const arm of arms) {
      const swing = -Math.sin((phase + (arm.side === 1 ? .5 : 0)) * Math.PI * 2) * .17 * activity;
      arm.shoulder.set(arm.side * .175, 1.2 + bob, 0);
      arm.elbow.set(arm.side * .202, .99 + bob + Math.abs(swing) * .12, swing * .5 - .015);
      arm.wrist.set(arm.side * .207, .785 + bob + Math.abs(swing) * .18, swing + .035);
      between(arm.sleeve, arm.shoulder, arm.elbow); between(arm.forearm, arm.elbow, arm.wrist);
      arm.hand.position.copy(arm.wrist); arm.hand.position.y -= .023;
      arm.hand.rotation.x = swing * 1.2;
    }
    root.userData.walking = activity > .05;
    root.userData.heading = facing;
  }
  update(0, { speed: 0, heading: 0 });
  return { root, body, update, height: 1.66, radius: .295,
    dispose() { sphere.dispose(); capsule.dispose(); plane.dispose(); shadowTexture?.dispose(); for (const mat of materials) mat.dispose(); }
  };
}
