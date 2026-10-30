// An entrance vestibule in the open end of the central concourse. Metres.
// The sliding leaves are omitted from the permanent colliders: input is locked
// during the entry sequence and they remain open afterwards.
export const AIR_SHOWER = Object.freeze({
  start: { x: 0, z: 85.8 },
  exit: { x: 0, z: 78.8 },
  doorZ: 82.2,
  bounds: [
    { minX: -2.02, maxX: -1.78, minZ: 82.2, maxZ: 88.92 },
    { minX: 1.78, maxX: 2.02, minZ: 82.2, maxZ: 88.92 },
    { minX: -2.02, maxX: 2.02, minZ: 88.68, maxZ: 88.92 },
    { minX: -2.58, maxX: -1.2, minZ: 82.02, maxZ: 82.38 },
    { minX: 1.2, maxX: 2.58, minZ: 82.02, maxZ: 82.38 }
  ]
});

export function createAirShower(THREE) {
  const root = new THREE.Group(); root.name = 'Air shower entrance';
  const roof = new THREE.Group(); root.add(roof);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const materials = [];
  const metal = (color, roughness = .4, metalness = .35, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    materials.push(m); return m;
  };
  const white = metal('#e9eff1', .3, .3);
  const panel = metal('#d4e0e4', .38, .55);
  const steel = metal('#92a9b2', .24, .78);
  const dark = metal('#35505c', .48, .4);
  const black = metal('#1b3543', .54, .15);
  const teal = metal('#468e96', .38, .3);
  const light = metal('#effdff', .24, .1, { emissive: '#d4f5ff', emissiveIntensity: 1.8 });
  const status = metal('#e3b671', .3, .2, { emissive: '#b67729', emissiveIntensity: .8 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#a7cbd4', transparent: true, opacity: .33,
    roughness: .08, metalness: .08, side: THREE.DoubleSide, depthWrite: false });
  materials.push(glass);
  function box(parent, material, x, y, z, w, h, d) {
    const m = new THREE.Mesh(unitBox, material);
    m.position.set(x, y, z); m.scale.set(w, h, d); parent.add(m); return m;
  }
  function sign(parent, text, subtitle, x, y, z, w, h, rotation = 0) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e8f1f3'; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#315d68'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '600 70px Arial, sans-serif'; ctx.fillText(text, 512, 96);
    ctx.font = '30px Arial, sans-serif'; ctx.fillStyle = '#76939b'; ctx.fillText(subtitle, 512, 183);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture }); materials.push(material);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(x, y, z); m.rotation.y = rotation; parent.add(m); return m;
  }

  // Narrow wall modules with stainless seams, a low return-air grille, and
  // the characteristic two banks of adjustable air nozzles.
  const nozzles = [];
  const nozzleShell = new THREE.CylinderGeometry(.095, .112, .075, 16);
  const nozzleBore = new THREE.CylinderGeometry(.053, .053, .008, 14);
  const nozzleRim = new THREE.TorusGeometry(.071, .012, 6, 18);
  for (const side of [-1, 1]) {
    box(root, white, side * 1.9, 1.575, 85.5, .24, 3.15, 6.6);
    box(root, steel, side * 1.765, .13, 85.5, .035, .26, 6.6);
    box(root, steel, side * 1.765, 2.91, 85.5, .035, .065, 6.6);
    for (const z of [83.1, 84.3, 85.5, 86.7, 87.9]) {
      box(root, panel, side * 1.767, 1.64, z, .028, 2.42, 1.145);
      box(root, white, side * 1.744, 1.64, z, .022, 2.32, 1.065);
      box(root, dark, side * 1.742, .34, z, .022, .23, .88);
      for (let i = 0; i < 5; i++) box(root, steel, side * 1.724, .25 + i * .045, z, .022, .012, .84);
    }
    for (const z of [83.65, 84.85, 86.05, 87.25]) for (const y of [.88, 1.51, 2.14]) {
      const shell = new THREE.Mesh(nozzleShell, steel);
      shell.position.set(side * 1.699, y, z); shell.rotation.z = Math.PI / 2; root.add(shell);
      const bore = new THREE.Mesh(nozzleBore, black);
      bore.position.set(side * 1.655, y, z); bore.rotation.z = Math.PI / 2; root.add(bore);
      const rim = new THREE.Mesh(nozzleRim, panel);
      rim.position.set(side * 1.648, y, z); rim.rotation.y = Math.PI / 2; root.add(rim);
      nozzles.push({ side, x: side * 1.635, y, z });
    }
  }
  // The grille stays almost flush with the FAB floor; no step traps the avatar.
  box(root, panel, 0, -.016, 85.5, 3.55, .03, 6.6);
  box(root, dark, 0, .002, 85.5, 2.7, .008, 5.85);
  for (let z = 82.64; z < 88.4; z += .12) box(root, steel, 0, .008, z, 2.69, .012, .065);
  for (const x of [-1.37, 1.37]) box(root, panel, x, .011, 85.5, .045, .018, 5.85);
  for (const z of [82.54, 88.46]) box(root, steel, 0, .012, z, 3.54, .018, .1);
  // A restrained floor mark gives the waiting character a visual home.
  for (const x of [-.4, .4]) {
    box(root, teal, x, .018, 85.8, .035, .008, .8);
    box(root, teal, x * .77, .018, 85.39, .22, .008, .035);
    box(root, teal, x * .77, .018, 86.21, .22, .008, .035);
  }

  box(roof, white, 0, 3.15, 85.5, 4.04, .16, 6.84);
  box(roof, panel, 0, 3.057, 85.5, 1.15, .035, 4.95);
  for (let z = 83.18; z < 87.9; z += .12) box(roof, steel, 0, 3.035, z, .97, .02, .025);
  for (const x of [-1.03, 1.03]) {
    box(roof, dark, x, 3.052, 85.5, .27, .055, 5.22);
    box(roof, light, x, 3.017, 85.5, .19, .025, 5.12);
  }

  // An opaque rear door closes the vestibule behind the opening camera.
  box(root, white, 0, 1.575, 88.8, 4.04, 3.15, .24);
  box(root, steel, 0, 1.35, 88.664, 2.3, 2.7, .04);
  for (const side of [-1, 1]) {
    box(root, panel, side * .555, 1.33, 88.631, 1.09, 2.6, .035);
    box(root, dark, side * .555, 1.8, 88.604, .72, .65, .02);
    box(root, glass, side * .555, 1.8, 88.584, .67, .6, .018);
  }
  box(root, teal, 0, 2.84, 88.647, 1.4, .07, .025);

  // Full-width pockets are in the otherwise empty cross-aisle, in front of
  // the chamber walls. Each solid leaf can retract completely clear of 2.4 m.
  const doors = [];
  for (const side of [-1, 1]) {
    box(root, white, side * 1.89, 1.4, AIR_SHOWER.doorZ, 1.38, 2.8, .36);
    box(root, panel, side * 1.92, 1.4, AIR_SHOWER.doorZ + .191, 1.2, 2.58, .024);
    box(root, steel, side * 1.21, 1.37, AIR_SHOWER.doorZ + .211, .065, 2.74, .08);
    const leaf = new THREE.Group(); leaf.position.set(side * .6, 0, AIR_SHOWER.doorZ);
    root.add(leaf); doors.push(leaf);
    for (const x of [-.575, .575]) box(leaf, steel, x, 1.325, 0, .045, 2.65, .1);
    box(leaf, steel, 0, .62, 0, 1.15, 1.24, .1);
    box(leaf, steel, 0, 2.385, 0, 1.15, .53, .1);
    box(leaf, white, 0, .62, .059, 1.13, 1.19, .025);
    box(leaf, white, 0, 2.385, .059, 1.13, .47, .025);
    // The window is a real opening, not glass laid over an opaque door box.
    // Thin frames surround a lightly tinted double-sided pane.
    for (const x of [-.55, .55]) box(leaf, white, x, 1.68, .066, .095, .92, .025);
    for (const x of [-.507, .507]) box(leaf, dark, x, 1.68, .073, .025, .89, .014);
    for (const y of [1.247, 2.113]) box(leaf, dark, 0, y, .073, 1.01, .025, .014);
    box(leaf, glass, 0, 1.68, .095, .99, .85, .02);
    box(leaf, teal, side * -.46, 1.34, .133, .025, 2.42, .012);
    box(leaf, steel, 0, .1, .085, 1.13, .15, .02);
    box(leaf, panel, 0, .62, -.064, 1.13, 1.19, .025);
    box(leaf, panel, 0, 2.385, -.064, 1.13, .47, .025);
  }
  box(root, white, 0, 2.94, AIR_SHOWER.doorZ, 5.16, .58, .45);
  box(root, steel, 0, 2.678, AIR_SHOWER.doorZ + .245, 2.48, .055, .05);
  box(root, dark, 0, 2.67, AIR_SHOWER.doorZ - .17, 2.4, .06, .025);
  const indicator = box(root, status, 0, 2.698, AIR_SHOWER.doorZ + .285, 1.3, .036, .024);
  sign(root, 'AIR SHOWER', 'CLEANROOM ENTRY  /  FAB A', 0, 2.965, AIR_SHOWER.doorZ + .232, 2.1, .42);
  sign(root, 'FAB A', 'CLEANROOM', 0, 2.97, AIR_SHOWER.doorZ - .232, 2.1, .42, Math.PI);
  // A small local control panel on the interior pocket.
  box(root, dark, 1.52, 1.55, AIR_SHOWER.doorZ + .235, .33, .53, .06);
  box(root, black, 1.52, 1.63, AIR_SHOWER.doorZ + .27, .25, .24, .025);
  for (let i = 0; i < 3; i++) box(root, status, 1.45 + i * .07, 1.63, AIR_SHOWER.doorZ + .29, .033, .1 + i * .03, .014);
  box(root, teal, 1.52, 1.38, AIR_SHOWER.doorZ + .27, .1, .055, .015);

  // Sparse line streaks show jet direction without a cloud of fake fog.
  const streakCount = 84, positions = new Float32Array(streakCount * 6);
  const jetGeometry = new THREE.BufferGeometry();
  jetGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const jetMaterial = new THREE.LineBasicMaterial({ color: '#79b9cc', transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.NormalBlending });
  materials.push(jetMaterial);
  const jets = new THREE.LineSegments(jetGeometry, jetMaterial); jets.visible = false; jets.frustumCulled = false; root.add(jets);
  // Keep the entrance inexpensive on phones: repeated grille slats, wall
  // panels, and nozzle parts share one draw call per geometry/material.
  function batchStatic(parent) {
    const groups = new Map();
    for (const child of parent.children) {
      if (!child.isMesh || child === indicator || child.material.transparent) continue;
      const key = child.geometry.uuid + child.material.uuid;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(child);
    }
    for (const entries of groups.values()) {
      if (entries.length < 2) continue;
      const instance = new THREE.InstancedMesh(entries[0].geometry, entries[0].material, entries.length);
      entries.forEach((entry, i) => { entry.updateMatrix(); instance.setMatrixAt(i, entry.matrix); parent.remove(entry); });
      instance.computeBoundingSphere(); parent.add(instance);
    }
  }
  for (const parent of [root, roof, ...doors]) batchStatic(parent);
  const colorReady = new THREE.Color('#72c7b2'), colorAir = new THREE.Color('#e1b56c');
  function update({ time = 0, jet = 0, door = 0 } = {}) {
    const intensity = THREE.MathUtils.clamp(Number.isFinite(jet) ? jet : 0, 0, 1);
    const open = THREE.MathUtils.clamp(Number.isFinite(door) ? door : 0, 0, 1);
    const t = Number.isFinite(time) ? time : 0;
    doors[0].position.x = -.6 - open * 1.25;
    doors[1].position.x = .6 + open * 1.25;
    status.color.copy(open > .01 ? colorReady : colorAir);
    status.emissive.copy(status.color); status.emissiveIntensity = .42 + intensity * .32;
    jets.visible = intensity > .001;
    jetMaterial.opacity = intensity * .5;
    if (jets.visible) {
      for (let i = 0; i < streakCount; i++) {
        const n = nozzles[i % nozzles.length];
        const phase = ((t * (1.3 + (i % 5) * .07) + i * .381966) % 1 + 1) % 1;
        const reach = phase * 1.39;
        const flutter = Math.sin(t * 7 + i * 2.17) * .025;
        const x = n.x - n.side * reach;
        const y = n.y - reach * .05 + flutter;
        const z = n.z + Math.sin(i * 1.7) * .07 + reach * Math.sin(i) * .06;
        const p = i * 6;
        positions[p] = x; positions[p + 1] = y; positions[p + 2] = z;
        positions[p + 3] = x + n.side * .16;
        positions[p + 4] = y + .008; positions[p + 5] = z;
      }
      jetGeometry.attributes.position.needsUpdate = true;
    }
  }
  update();
  return { root, roof, doors, jets, indicator, update, bounds: AIR_SHOWER.bounds,
    dispose() {
      const geometries = new Set(); root.traverse(o => { if (o.geometry) geometries.add(o.geometry); });
      for (const g of geometries) g.dispose();
      for (const m of materials) { m.map?.dispose(); m.dispose(); }
      root.removeFromParent();
    }
  };
}
