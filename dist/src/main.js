import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { machines as layoutMachines, bays, columns, TOUR_POINTS, isBlocked, TOOL_SCALE_X, TOOL_WIDTH, SEATED_FOUP_Y, VEHICLE_Y, RAIL_Y, AISLE, SERVICE_AISLE, SIDE_GAP } from './layout.js';
import { network, railPaths } from './rail-network.js';
import { createFleet, reservedPortIds } from './network-transport.js';
import { createAvatar } from './avatar.js';
import { createExplorer } from './explorer.js';
import { AIR_SHOWER, createAirShower } from './air-shower.js';
import { createEntrySequence } from './entry-sequence.js';
import { processFamilies, buildEquipmentCatalog, getBayPurpose } from './equipment-catalog.js';
import { createEquipmentLabels } from './equipment-labels.js';
import { createEquipmentDirectory } from './equipment-directory.js';
import { createBayLighting, applyBayWhiteLightMask } from './bay-lighting.js';
import { createAmbience } from './ambience.js';
import { setRuntimeObstacles } from './runtime-obstacles.js';

const $ = (id) => document.getElementById(id);
const mobile = matchMedia('(pointer: coarse)').matches;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const WIDTH = 120, LENGTH = 180, HEIGHT = 5, EYE = 1.68;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dce7eb');
scene.fog = new THREE.FogExp2('#e0e9eb', .0063);
const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, .08, 420);
camera.rotation.order = 'YXZ';
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch {
  $('loading').classList.add('done');
  $('error').classList.remove('hidden');
  $('error').textContent = '이 브라우저에서 3D 화면을 열 수 없어요. 하드웨어 가속을 켠 Chrome 또는 Edge에서 다시 열어주세요.';
  throw new Error('WebGL initialization failed');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.35 : 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('world').appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
const envSource = new RoomEnvironment();
const envTarget = pmrem.fromScene(envSource, .04);
scene.environment = envTarget.texture;
scene.environmentIntensity = .65;
envSource.dispose(); pmrem.dispose();
scene.add(new THREE.HemisphereLight('#effaff', '#8199a0', 1.65));
const sun = new THREE.DirectionalLight('#ffffff', 2.1); sun.position.set(15, 30, 20); scene.add(sun);
const fill = new THREE.DirectionalLight('#c0e4ff', .8); fill.position.set(-40, 10, -40); scene.add(fill);

const mat = (color, roughness = .5, metalness = .05, extras = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extras });
const M = {
  white: mat('#e9eff0', .32, .28), panel: mat('#d2dde0', .4, .4), edge: mat('#849aa3', .29, .7), dark: mat('#344b57', .42, .45),
  black: mat('#1a2e3b', .36, .2), rail: mat('#b8cbd2', .25, .72), ceiling: mat('#d5e0e3', .75), frame: mat('#9db2bc', .5, .5),
  light: mat('#f7ffff', .25, .1, { emissive: '#def5ff', emissiveIntensity: 2 }), green: mat('#66bea0', .4, .1, { emissive: '#3ebc7d', emissiveIntensity: .7 }),
  amber: mat('#e7b56b', .38, .1, { emissive: '#b87823', emissiveIntensity: .12 }), blue: mat('#567d98', .4, .4),
  foup: mat('#d2cabc', .36, .12), foupDoor: mat('#8d642f', .25, .12), foupRib: mat('#b49e76', .42, .15),
  accent: mat('#377985', .4, .2), purple: mat('#7c7299', .4, .2), yellow: mat('#d6bb79', .4, .2), screen: mat('#142f40', .3, .1, { emissive: '#1c4c63', emissiveIntensity: .22 })
};
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
const planeGeometry = new THREE.PlaneGeometry(1, 1);
const batches = new Map();
const dummy = new THREE.Object3D();
function solid(geometry, material, x, y, z, sx, sy, sz, rotationY = 0) {
  const key = geometry.uuid + material.uuid;
  if (!batches.has(key)) batches.set(key, { geometry, material, transforms: [] });
  dummy.position.set(x, y, z); dummy.rotation.set(0, rotationY, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
  batches.get(key).transforms.push(dummy.matrix.clone());
}
const box = (material, x, y, z, sx, sy, sz, ry = 0) => solid(boxGeometry, material, x, y, z, sx, sy, sz, ry);
const cyl = (material, x, y, z, r, h) => solid(cylinderGeometry, material, x, y, z, r, h, r);
function mesh(parent, geometry, material, x, y, z, sx, sy, sz) {
  const obj = new THREE.Mesh(geometry, material); obj.position.set(x, y, z); obj.scale.set(sx, sy, sz); parent.add(obj); return obj;
}
const roof = new THREE.Group(); scene.add(roof);
const ceilingMat = M.ceiling;
const walls = new THREE.Group(); scene.add(walls);
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); return texture;
}

// A continuous cleanroom floor. All scene units are metres.
const floorTexture = canvasTexture(512, 512, (ctx, w, h) => {
  ctx.fillStyle = '#c1d0d5'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#9eb3bc'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.strokeStyle = '#d9e4e7'; ctx.lineWidth = 1; ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.fillStyle = '#6d8c9a';
  for (let x = 21; x < w; x += 24) for (let y = 21; y < h; y += 24) { ctx.beginPath(); ctx.arc(x, y, 1.45, 0, Math.PI * 2); ctx.fill(); }
});
floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping; floorTexture.repeat.set(WIDTH / 1.2, LENGTH / 1.2);
const floorBase = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, LENGTH), new THREE.MeshStandardMaterial({ map: floorTexture, roughness: .3, metalness: .32 }));
floorBase.rotation.x = -Math.PI / 2; floorBase.position.y = -.02; scene.add(floorBase);
let reflector;
if (!mobile) {
  reflector = new Reflector(new THREE.PlaneGeometry(WIDTH, LENGTH), { textureWidth: 960, textureHeight: 640, color: '#9dbac5', clipBias: .003 });
  reflector.rotation.x = -Math.PI / 2; reflector.position.y = -.015; scene.add(reflector);
  const floorOverlay = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, LENGTH), new THREE.MeshStandardMaterial({ map: floorTexture, transparent: true, opacity: .83, roughness: .43, metalness: .22 }));
  floorOverlay.rotation.x = -Math.PI / 2; floorOverlay.position.y = -.008; scene.add(floorOverlay);
}
box(M.dark, 0, -.19, 0, WIDTH + .3, .3, LENGTH + .3);
for (const x of [-60, 60]) box(M.edge, x, .003, 0, .12, .006, LENGTH);
for (const z of [-90, 90]) box(M.edge, 0, .003, z, WIDTH, .006, .12);
// One FFU/luminaire tile, repeated over the 5 m ceiling.
const ceilingTexture = canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#d5e1e5'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#a9bdc5'; ctx.fillRect(12, 12, w - 24, h - 24);
  ctx.fillStyle = '#c4d3d9'; ctx.fillRect(17, 17, w - 34, h - 34);
  ctx.strokeStyle = '#9fb3bc'; ctx.lineWidth = 1;
  for (let y = 24; y < 236; y += 5) { ctx.beginPath(); ctx.moveTo(22, y); ctx.lineTo(234, y); ctx.stroke(); }
  ctx.fillStyle = '#f0faff'; ctx.fillRect(5, 4, 5, 248); ctx.fillRect(246, 4, 5, 248);
});
ceilingTexture.wrapS = ceilingTexture.wrapT = THREE.RepeatWrapping; ceilingTexture.repeat.set(WIDTH / 3, LENGTH / 3);
const ceilingSurface = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, LENGTH), mat('#e5edf0', .8, 0, { map: ceilingTexture, emissive: '#b3c7d0', emissiveIntensity: .12 }));
ceilingSurface.rotation.x = Math.PI / 2; ceilingSurface.position.y = HEIGHT; roof.add(ceilingSurface);
const bayLighting = createBayLighting(THREE, { bays, families: processFamilies, yellowBayIds: bays.filter(b => getBayPurpose(b.id).yellowLight).map(b => b.id), roof, scene, ceilingTexture });
for (let x = -57; x <= 57; x += 6) for (let z = -87; z <= 87; z += 6) {
  const strip = mesh(roof, boxGeometry, bayLighting.isAmberAt(x, z) ? bayLighting.luminaireMaterial : M.light, x, 4.975, z, .14, .025, 2.6);
}
for (let x = -60; x <= 60; x += 6) mesh(roof, boxGeometry, M.frame, x, 4.95, 0, .04, .07, LENGTH);
for (let z = -90; z <= 90; z += 6) mesh(roof, boxGeometry, M.frame, 0, 4.95, z, WIDTH, .07, .04);

// Perimeter, structural columns and service windows.
mesh(walls, boxGeometry, M.white, 0, 2.5, -90, WIDTH, 5, .2);
mesh(walls, boxGeometry, M.white, 0, 2.5, 90, WIDTH, 5, .2);
mesh(walls, boxGeometry, M.white, -60, 2.5, 0, .2, 5, LENGTH);
mesh(walls, boxGeometry, M.white, 60, 2.5, 0, .2, 5, LENGTH);
const glass = new THREE.MeshPhysicalMaterial({ color: '#88b2c5', roughness: .12, metalness: .18, transparent: true, opacity: .28, side: THREE.DoubleSide });
for (let z = -78; z <= 78; z += 12) {
  for (const side of [-1, 1]) {
    box(M.panel, side * 59.8, .48, z, .12, .96, 8);
    mesh(walls, boxGeometry, glass, side * 59.7, 2.3, z, .05, 2.7, 7.8);
    box(M.edge, side * 59.6, .96, z, .1, .07, 8); box(M.edge, side * 59.6, 3.65, z, .1, .07, 8);
  }
}
for (const { x, z } of columns) {
  box(M.white, x, 2.5, z, .5, 5, .5); box(M.edge, x, .16, z, .53, .32, .53);
  box(M.accent, x, 1.1, z + .253, .51, .075, .012);
}
// Subtle guidance strips in the main aisle, interrupted at cross-aisles.
for (let z = -87; z < 88; z += 3) for (const x of [-2.35, 2.35]) box(M.accent, x, .002, z, .045, .004, 1.55);

const families = processFamilies.map(f => ({ ...f, material: M[f.materialKey] }));
const equipment = buildEquipmentCatalog(layoutMachines), equipmentById = new Map(equipment.map(e => [e.id, e]));
const machinePositions = [], colliders = [];
const labelTextures = [];
const labelCache = new Map();
function labelTexture(text, subtitle, color = '#467b89') {
  const cacheKey = text + subtitle + color;
  if (labelCache.has(cacheKey)) return labelCache.get(cacheKey);
  const texture = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e7eff1'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = color; ctx.fillRect(0, 0, 9, h);
    ctx.fillStyle = '#344f5c'; ctx.font = '600 43px sans-serif'; ctx.fillText(text, 29, 60);
    ctx.fillStyle = '#7a929d'; ctx.font = '19px sans-serif'; ctx.fillText(subtitle, 31, 98);
  }); labelTextures.push(texture); labelCache.set(cacheKey, texture); return texture;
}
const screenTexture = canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#142c3d'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#7bc5d0'; ctx.font = '17px sans-serif'; ctx.fillText('PROCESS MONITOR', 18, 28);
  for (let j = 0; j < 4; j++) { ctx.strokeStyle = '#335a6e'; ctx.strokeRect(17, 47 + j * 44, 220, 33); ctx.fillStyle = j === 2 ? '#baaa65' : '#6bb8ac'; ctx.fillRect(22, 54 + j * 44, 110 + j * 23, 18); }
  ctx.fillStyle = '#97b0bc'; ctx.font = '12px sans-serif'; ctx.fillText('SYSTEM READY    ● AUTO', 20, 242);
});
const screenMat = mat('#ffffff', .3, .1, { map: screenTexture, emissive: '#ffffff', emissiveMap: screenTexture, emissiveIntensity: .32 });
const aoTexture = canvasTexture(128, 128, (ctx) => { const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64); gradient.addColorStop(0, 'rgba(22,46,58,.24)'); gradient.addColorStop(.6, 'rgba(22,46,58,.12)'); gradient.addColorStop(1, 'rgba(22,46,58,0)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128); });
const aoMat = new THREE.MeshBasicMaterial({ map: aoTexture, transparent: true, depthWrite: false });
function localBox(x, z, sign, material, ox, y, oz, sx, sy, sz) { box(material, x + sign * ox * TOOL_SCALE_X, y, z + sign * oz, sx * TOOL_SCALE_X, sy, sz, sign === 1 ? 0 : Math.PI); }
function staticFoup(x, y, z, sign = 1) {
  box(M.foup, x, y, z, .43, .38, .36);
  box(M.foupDoor, x, y, z - sign * .187, .38, .32, .025);
  box(M.foupRib, x, y + .215, z, .19, .045, .13);
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) box(M.foupRib, x + s * .222, y -.13 + i * .065, z, .025, .023, .31);
  box(M.dark, x, y - .205, z, .45, .035, .38);
}
function machine(layout, family) {
  const { x, z, id: index, sign } = layout;
  const s = sign;
  const frontZ = z + s * 2.6;
  localBox(x, z, s, M.dark, 0, .12, 0, 5.4, .24, 4.8);
  localBox(x, z, s, M.white, 0, 1.49, 0, 5.25, 2.68, 4.7);
  localBox(x, z, s, M.panel, 0, 2.86, 0, 5.28, .07, 4.75);
  localBox(x, z, s, family.material, 0, 2.65, 2.361, 5.15, .07, .018);
  for (const side of [-1, 1]) {
    // Equipment side faces remain detailed when seen down the long main aisle.
    localBox(x, z, s, M.panel, side * 2.635, 1.47, -.25, .014, 2.32, 3.8);
    for (const seamZ of [-1.6, -.35, .95]) localBox(x, z, s, M.edge, side * 2.65, 1.46, seamZ, .018, 2.2, .015);
    for (let vent = 0; vent < 9; vent++) localBox(x, z, s, M.dark, side * 2.66, .47 + vent * .045, -1.02, .02, .014, .8);
    localBox(x, z, s, family.material, side * 2.66, 2.39, -.3, .02, .055, 3.6);
    localBox(x, z, s, M.edge, side * 2.68, 1.52, .7, .045, .22, .055);
    localBox(x, z, s, M.dark, side * 2.66, 2.09, -1.17, .02, .12, .4);
    localBox(x, z, s, M.white, side * 2.67, 2.09, -1.17, .023, .055, .26);
  }
  for (let j = -2; j <= 2; j++) {
    localBox(x, z, s, M.edge, j * 1.02, 1.4, 2.363, .016, 2.35, .018);
    localBox(x, z, s, M.edge, j * 1.02 + .38, 1.3, 2.39, .035, .2, .045);
  }
  // Rear maintenance doors face the narrow service aisle; there are no load ports here.
  for (let j = -1; j <= 1; j++) {
    localBox(x, z, s, M.panel, j * 1.7, 1.46, -2.357, 1.64, 2.34, .018);
    localBox(x, z, s, M.edge, j * 1.7 + .64, 1.43, -2.381, .035, .23, .024);
    for (let v = 0; v < 6; v++) localBox(x, z, s, M.dark, j * 1.7, .43 + v * .055, -2.373, .94, .018, .015);
  }
  // Wafer front-end module, real FOUP-sized loadports, equipment monitor.
  localBox(x, z, s, M.panel, -.2, .72, 2.73, 3.3, 1.25, .77);
  localBox(x, z, s, M.dark, -.2, 1.38, 2.81, 3.4, .09, .93);
  for (let j = 0; j < 3; j++) {
    const port = layout.ports[j], lx = port.x;
    box(M.edge, lx, 1.43, port.z, .71, .065, .66);
    localBox(x, z, s, M.black, -1.23 + j * 1.02, 1.76, 2.4, .57, .64, .035);
    if (!reservedPortIds.has(port.id) && (index + j) % 4 !== 0) staticFoup(lx, SEATED_FOUP_Y, port.z, s);
  }
  localBox(x, z, s, M.edge, 2.12, 1.61, 2.57, .065, .8, .13);
  const monitor = mesh(scene, planeGeometry, screenMat, x + s * 2.12 * TOOL_SCALE_X, 1.91, z + s * 2.66, .56, .46, 1); monitor.rotation.y = s === 1 ? 0 : Math.PI;
  localBox(x, z, s, M.edge, 2.12, 1.59, 2.7, .64, .04, .33);
  localBox(x, z, s, M.dark, 2.35, 3.05, 1.8, .06, .32, .06);
  cyl(index % 6 === 0 ? M.amber : M.green, x + s * 2.35 * TOOL_SCALE_X, 3.23, z + s * 1.8, .055, .13);
  if (family.key === 'ETCH' || family.key === 'DEPO') {
    for (let j = -1; j <= 1; j++) { cyl(M.panel, x + j * 1.55 * TOOL_SCALE_X, 2.94, z - s * .35, .57, .18); cyl(M.edge, x + j * 1.55 * TOOL_SCALE_X, 3.07, z - s * .35, .45, .08); }
  } else if (family.key === 'PHOTO') {
    localBox(x, z, s, M.panel, -.8, 3.1, -.55, 3.35, .46, 2.65);
    localBox(x, z, s, M.dark, -1.2, 1.92, 2.381, 1.35, .39, .025);
  } else if (family.key === 'CLEAN') {
    for (let j = -1; j <= 1; j++) localBox(x, z, s, M.blue, j * 1.4, 2.22, 2.383, .95, .35, .018);
  }
  const shadow = mesh(scene, planeGeometry, aoMat, x, .001, z, 6.5, 7.1, 1); shadow.rotation.x = -Math.PI / 2;
  colliders.push({ ...layout.bounds, front: frontZ, x, z, family, equipment: equipmentById.get(index) });
  machinePositions.push({ x, z, family, equipment: equipmentById.get(index), index, sign, frontZ });
}
for (const layout of layoutMachines) machine(layout, families[layout.familyIndex]);
scene.add(createEquipmentLabels(THREE, layoutMachines, equipment, families));
// Utility mains above equipment, below the ceiling. Cleanroom equipment is schematic.
for (const bay of bays) for (const sign of [-1, 1]) {
  const z = bay.z + sign * 6.7;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, 51, 10), M.rail);
  pipe.rotation.z = Math.PI / 2; pipe.position.set(bay.x, 4.63, z); roof.add(pipe);
  for (let dx = -24; dx <= 24; dx += 8) mesh(roof, boxGeometry, M.frame, bay.x + dx, 4.73, z, .09, .08, 3);
}

// Hanging zone signs at human-scaled distances, not giant decorative letters.
for (const bay of bays) {
  const family = families[bay.familyIndex];
  const sign = new THREE.Group(); sign.position.set(bay.bank === 0 ? -3.1 : 3.1, 3.42, bay.z); sign.rotation.y = bay.bank === 0 ? Math.PI / 2 : -Math.PI / 2;
  mesh(sign, boxGeometry, M.white, 0, 0, 0, 2.85, .63, .09);
  const tex = labelTexture('BAY ' + String(bay.id + 1).padStart(2, '0'), 'FAB A  ·  ' + family.processCode + '  ' + getBayPurpose(bay.id).name, family.color);
  mesh(sign, planeGeometry, mat('#ffffff', .8, 0, { map: tex }), 0, 0, .05, 2.7, .57, 1);
  mesh(sign, boxGeometry, M.edge, -1, .75, 0, .025, .9, .025); mesh(sign, boxGeometry, M.edge, 1, .75, 0, .025, .9, .025);
  roof.add(sign);
}

// Service lines and inter-bay trunks share actual routing geometry with vehicles.
for (const path of railPaths) {
    for (let i = 0; i < path.points.length - 1; i++) {
      const a = path.points[i], b = path.points[i + 1];
      const angle = Math.atan2(b.x - a.x, b.z - a.z), length = Math.hypot(b.x - a.x, b.z - a.z);
      for (const offset of [-.19, .19]) box(M.rail, (a.x + b.x) / 2 + Math.cos(angle) * offset, RAIL_Y, (a.z + b.z) / 2 - Math.sin(angle) * offset, .075, .12, length + .008, angle);
      box(M.dark, (a.x + b.x) / 2, RAIL_Y + .03, (a.z + b.z) / 2, .18, .06, length + .008, angle);
      if (path.kind !== 'switch') for (let d = 0; d < length; d += 7) {
        const f = d / length, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
        box(M.edge, x, 4.64, z, .045, .64, .045);
        box(M.rail, x, 4.3, z, .58, .065, .1, angle);
      }
    }
}
// Compact switch enclosures distinguish actual crossings and merge points.
for (const node of network.junctions) {
  box(M.dark, node.x, 4.43, node.z, .46, .13, .46);
  box(M.accent, node.x, 4.505, node.z, .3, .025, .3);
  box(M.green, node.x + .21, 4.43, node.z + .21, .045, .04, .045);
}
// A plan-view highlight keeps the real rail network legible at hall-wide scale.
const railOverview = new THREE.Group(); railOverview.visible = false; scene.add(railOverview);
const railVertices = [];
for (const path of railPaths) for (let i = 1; i < path.points.length; i++) {
  const a = path.points[i - 1], b = path.points[i]; railVertices.push(a.x, 4.52, a.z, b.x, 4.52, b.z);
}
const routeGeometry = new THREE.BufferGeometry(); routeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(railVertices, 3));
const routeLines = new THREE.LineSegments(routeGeometry, new THREE.LineBasicMaterial({ color: '#226a7b', transparent: true, opacity: .8, depthTest: false }));
routeLines.renderOrder = 10; railOverview.add(routeLines);
const junctionGeometry = new THREE.BufferGeometry(); junctionGeometry.setAttribute('position', new THREE.Float32BufferAttribute(network.junctions.flatMap(p => [p.x, 4.53, p.z]), 3));
const junctionDots = new THREE.Points(junctionGeometry, new THREE.PointsMaterial({ color: '#bf8946', size: 3, sizeAttenuation: false, depthTest: false }));
junctionDots.renderOrder = 11; railOverview.add(junctionDots);
function movingFoup(parent) {
  const foup = new THREE.Group();
  mesh(foup, boxGeometry, M.foup, 0, 0, 0, .43, .38, .36);
  mesh(foup, boxGeometry, M.foupDoor, 0, 0, .19, .38, .32, .025);
  mesh(foup, boxGeometry, M.foupRib, 0, .215, 0, .19, .045, .13);
  mesh(foup, boxGeometry, M.dark, 0, -.205, 0, .45, .035, .38);
  for (let i = 0; i < 5; i++) for (const side of [-1, 1]) mesh(foup, boxGeometry, M.foupRib, side * .222, -.13 + i * .065, 0, .025, .024, .31);
  parent.add(foup); return foup;
}
const fleet = createFleet(), vehicles = [];
function createOHT(controller) {
  const root = new THREE.Group(); root.position.set(controller.state.car.x, VEHICLE_Y, controller.state.car.z); scene.add(root);
  mesh(root, boxGeometry, M.dark, 0, .41, 0, .39, .16, 1.05);
  mesh(root, boxGeometry, M.white, 0, .25, -.49, .82, .46, .23);
  mesh(root, boxGeometry, M.white, 0, .25, .49, .82, .46, .23);
  mesh(root, boxGeometry, M.panel, 0, .42, 0, .84, .1, 1.15);
  // Slender side frames preserve a visibly open central carrying bay.
  for (const side of [-1, 1]) mesh(root, boxGeometry, M.rail, side * .36, -.02, 0, .07, .45, .74);
  mesh(root, boxGeometry, M.accent, 0, .27, .612, .6, .08, .012);
  mesh(root, boxGeometry, M.green, .27, .31, .619, .07, .05, .014);
  const foup = movingFoup(scene);
  const gripper = mesh(root, boxGeometry, M.dark, 0, .12, 0, .24, .055, .16);
  gripper.rotation.y = Math.PI / 2;
  const belts = [-1, 1].map(side => mesh(root, boxGeometry, M.edge, 0, .25, side * .095, .025, .2, .017));
  vehicles.push({ root, foup, belts, gripper, controller, state: controller.state });
}
for (const controller of fleet.vehicles) createOHT(controller);
const movingBatches = new Map();
for (const vehicle of vehicles) for (const group of [vehicle.root, vehicle.foup]) group.traverse((obj) => {
  if (!obj.isMesh) return;
  const key = obj.geometry.uuid + obj.material.uuid;
  if (!movingBatches.has(key)) movingBatches.set(key, { geometry: obj.geometry, material: obj.material, sources: [] });
  movingBatches.get(key).sources.push(obj); obj.visible = false;
});
for (const batch of movingBatches.values()) {
  batch.instance = new THREE.InstancedMesh(batch.geometry, batch.material, batch.sources.length);
  batch.instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage); batch.instance.frustumCulled = false; scene.add(batch.instance);
}

// Static geometry is instanced by material so the huge hall stays lightweight.
let staticInstances = 0;
for (const { geometry, material, transforms } of batches.values()) {
  const instance = new THREE.InstancedMesh(geometry, material, transforms.length);
  transforms.forEach((matrix, i) => instance.setMatrixAt(i, matrix));
  instance.computeBoundingSphere(); scene.add(instance); staticInstances += transforms.length;
}
// Batch repeated roof lights, screens, labels and contact shadows as well.
function consolidate(parent) {
  const groups = new Map();
  for (const obj of parent.children) {
    if (!obj.isMesh || obj.isInstancedMesh || obj.isReflector) continue;
    const key = obj.geometry.uuid + obj.material.uuid;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(obj);
  }
  for (const objects of groups.values()) {
    if (objects.length < 2) continue;
    const instance = new THREE.InstancedMesh(objects[0].geometry, objects[0].material, objects.length);
    objects.forEach((obj, i) => { obj.updateMatrix(); instance.setMatrixAt(i, obj.matrix); parent.remove(obj); });
    instance.computeBoundingSphere(); parent.add(instance);
  }
}
consolidate(roof); consolidate(walls); consolidate(scene);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enabled = false; orbit.enableDamping = true; orbit.dampingFactor = .06;
orbit.minDistance = 16; orbit.maxDistance = 700; orbit.maxPolarAngle = Math.PI * .46; orbit.target.set(0, 0, 0);
const avatar = createAvatar(THREE); scene.add(avatar.root);
const airShower = createAirShower(THREE); scene.add(airShower.root);
const bayWhiteMask = applyBayWhiteLightMask(THREE, scene, bays, { yellowBayIds: bayLighting.bayIds });
colliders.push(...AIR_SHOWER.bounds.map(b => ({ ...b, maxY: 3.15 })));
colliders.push({ minX: -2.02, maxX: 2.02, minZ: 82.2, maxZ: 88.92, minY: 3.07, maxY: 3.23 },
  { minX: -2.58, maxX: 2.58, minZ: 82.02, maxZ: 82.38, minY: 2.65, maxY: 3.23 });
const entry = createEntrySequence({ reducedMotion });
let mode = 'walk', elapsed = 0, lastTime = 0, currentZone = '', toastTimer, selectedEquipment = null;
function toast(text) { $('zone-toast').textContent = text; $('zone-toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('zone-toast').classList.remove('visible'), 3200); }
function showMachine(item) {
  selectedEquipment = item;
  $('tool-family').textContent = `${item.processCode} · ${item.familyName}`;
  $('tool-name').textContent = item.code; $('tool-type').textContent = item.typeName;
  $('tool-location').textContent = `${item.fabName} · ${item.bayLabel} ${item.bayPurpose} · ${String(item.ordinal).padStart(2, '0')}번 장비`;
  $('tool-description').textContent = item.description;
  $('tool-code-process').textContent = item.processCode; $('tool-code-fab').textContent = item.fabCode;
  $('tool-code-bay').textContent = item.code.slice(3, 5); $('tool-code-number').textContent = item.code.slice(5);
  $('tool-ports').textContent = '로드포트 ' + item.portCodes.join(' · ');
  $('tool-card').classList.remove('hidden');
}
const explorer = createExplorer({ THREE, camera, scene, canvas: renderer.domElement, avatar, orbit, colliders, vehicles,
  onToast: toast, onInspect: showMachine,
  onMode(next) {
    mode = next; document.body.classList.add('exploring'); $('intro').classList.add('hidden');
    document.body.dataset.viewMode = next;
    $('transfer-view').setAttribute('aria-pressed', String(next === 'transfer'));
    for (const id of ['tour', 'walk', 'ride', 'overview']) { $(id).classList.toggle('active', id === next); $(id).setAttribute('aria-pressed', String(id === next)); }
    roof.visible = walls.visible = next !== 'overview'; if (reflector) reflector.visible = next !== 'overview';
    bayLighting.setOverview(next === 'overview');
    bayWhiteMask.setOverview(next === 'overview');
    railOverview.visible = next === 'overview';
    airShower.root.visible = next !== 'overview';
    scene.fog.density = next === 'overview' ? .0015 : .0063;
    camera.far = next === 'overview' ? 1000 : 420; camera.updateProjectionMatrix();
    $('walk-hint').classList.toggle('hidden', next !== 'walk'); $('mobile-pad').classList.toggle('hidden', next !== 'walk' || !(mobile || innerWidth < 700));
    $('next-oht').classList.toggle('hidden', next !== 'ride'); $('tool-card').classList.add('hidden');
    if (next === 'overview') { $('view-title').textContent = '연결된 팹 전체 보기'; $('view-subtitle').textContent = `${bays.length} BAYS · ${layoutMachines.length} TOOLS · ${network.junctions.length} JUNCTIONS`; }
    if (next === 'ride') toast('교차로를 지나 다른 구역으로 향하는 OHT를 따라갑니다');
    currentZone = '';
  }
});
const directory = createEquipmentDirectory({ equipment, families,
  onToggle(open) { explorer.lock(open); if (open) { $('help').classList.add('hidden'); $('tool-card').classList.add('hidden'); } },
  onSelect(item) { explorer.focusEquipment(layoutMachines.find(m => m.id === item.id)); showMachine(item); }
});
$('equipment-list').addEventListener('click', () => { if (!entry.active) directory.open(); });
for (const id of ['tour', 'walk', 'ride', 'overview']) $(id).addEventListener('click', () => explorer.setMode(id));
$('explore').addEventListener('click', () => explorer.setMode('walk')); $('reset').addEventListener('click', startEntry);
$('transfer-view').addEventListener('click', () => explorer.focusTransfer());
$('rear-view').addEventListener('click', () => explorer.focusRear());
$('next-oht').addEventListener('click', () => explorer.nextVehicle());
$('help-toggle').addEventListener('click', () => $('help').classList.toggle('hidden'));
$('help-close').addEventListener('click', () => $('help').classList.add('hidden'));
$('close-card').addEventListener('click', () => $('tool-card').classList.add('hidden'));
document.addEventListener('visibilitychange', () => { lastTime = 0; });

const entryUi = [...document.querySelectorAll('.bottom-bar,.map-panel,.scene-shortcuts,.mobile-pad,.walk-hint,#help-toggle')];
const entryCopy = {
  ready: ['에어샤워실에 오신 걸 환영해요.', '잠시 뒤 바람이 나옵니다.'],
  shower: ['깨끗한 바람으로 준비 중', '양옆 노즐에서 바람이 나옵니다. 잠시만 기다려주세요.'],
  settle: ['에어샤워 완료', '바람이 잦아들면 앞문이 열립니다.'],
  opening: ['자동문이 열립니다.', '문 너머로 넓은 팹이 펼쳐집니다.'],
  entering: ['FAB에 오신 걸 환영해요.', '캐릭터를 따라 안으로 들어갑니다.'],
  closing: ['입장 완료 · 문이 닫힙니다.', '캐릭터가 모두 나온 뒤 출입문을 닫습니다.']
};
let entryStage = '';
function startEntry() {
  setRuntimeObstacles([]);
  explorer.lock(false); explorer.setMode('walk');
  explorer.state.position.set(AIR_SHOWER.start.x, 0, AIR_SHOWER.start.z);
  explorer.state.yaw = 0; explorer.state.heading = Math.PI;
  explorer.state.elevation = .3; explorer.state.distance = 2.65; explorer.state.manualLook = false;
  explorer.lock(true); entry.start(); entryStage = '';
  camera.fov = innerWidth < 700 ? 84 : 64; camera.updateProjectionMatrix();
  document.body.classList.add('entering'); $('entry-overlay').classList.remove('hidden');
  $('help').classList.add('hidden'); $('tool-card').classList.add('hidden'); $('zone-toast').classList.remove('visible'); clearTimeout(toastTimer);
  for (const element of entryUi) element.inert = true;
  airShower.update(entry.state);
}
function finishEntry() {
  entry.finish(); explorer.state.position.set(AIR_SHOWER.exit.x, 0, AIR_SHOWER.exit.z);
  setRuntimeObstacles(AIR_SHOWER.closedDoorBounds);
  explorer.state.speed = 0; explorer.state.distance = 4.4; explorer.state.elevation = .36;
  camera.fov = 64; camera.updateProjectionMatrix();
  explorer.lock(false); document.body.classList.remove('entering'); $('entry-overlay').classList.add('hidden');
  for (const element of entryUi) element.inert = false;
  $('reset').title = '에어샤워부터 다시 입장'; $('reset').setAttribute('aria-label', '에어샤워부터 다시 입장');
  toast('바닥을 눌러 걷기 · 드래그로 둘러보기');
}
function updateEntry(dt) {
  if (!entry.active) return;
  const before = explorer.state.position.z, s = entry.step(dt);
  airShower.update(s);
  explorer.state.position.set(s.position.x, 0, s.position.z);
  explorer.state.speed = Math.abs(s.position.z - before) / Math.max(dt, .001);
  explorer.state.distance = 2.65 + 1.75 * s.walk;
  explorer.state.elevation = .3 + .06 * s.walk;
  camera.fov = innerWidth < 700 ? 84 - 20 * s.walk : 64; camera.updateProjectionMatrix();
  if (s.complete) { finishEntry(); return; }
  if (s.stage !== entryStage) {
    entryStage = s.stage;
    const [title, description] = entryCopy[s.stage];
    $('entry-title').textContent = title; $('entry-description').textContent = description;
    $('entry-step-air').classList.toggle('active', ['ready', 'shower', 'settle'].includes(s.stage));
    $('entry-step-door').classList.toggle('active', s.stage === 'opening' || s.stage === 'closing');
    $('entry-step-walk').classList.toggle('active', s.stage === 'entering');
  }
  $('entry-progress-fill').style.transform = `scaleX(${s.progress})`;
  $('entry-progress-fill').parentElement.setAttribute('aria-valuenow', String(Math.round(s.progress * 100)));
}
function skipEntry() { if (!entry.active) return; airShower.update(entry.skip()); finishEntry(); }
$('entry-skip').addEventListener('click', skipEntry);
window.addEventListener('keydown', e => { if (entry.active && e.key === 'Escape') skipEntry(); });

// Browsers require a user gesture; the first touch starts the intended ambience.
const audio = createAmbience();
function updateSoundButton() {
  const s = audio.state, button = $('sound');
  button.setAttribute('aria-pressed', String(s.enabled));
  button.setAttribute('aria-label', s.enabled ? '공조 소리 끄기' : '공조 소리 켜기');
  button.dataset.soundState = s.status;
  $('sound-label').textContent = s.enabled ? '공조 켜짐' : !s.desired ? '공조 꺼짐' : s.error ? '소리 재시도' : '터치로 소리 켜기';
  button.title = s.enabled ? '공조 소리 끄기' : '화면을 터치하면 공조 소리가 시작됩니다';
}
async function activateSound(event) {
  if (!event.isTrusted || event.target.closest?.('#sound')) return;
  await audio.activate(); updateSoundButton();
}
document.addEventListener('pointerdown', activateSound, { capture: true, passive: true });
document.addEventListener('keydown', activateSound, { capture: true });
$('sound').addEventListener('click', async () => {
  if (audio.state.desired && !audio.state.enabled) await audio.activate();
  else await audio.toggle();
  updateSoundButton();
  toast(audio.state.enabled ? '공조 소리를 켰어요' : audio.state.desired ? '소리를 시작하려면 다시 눌러주세요' : '공조 소리를 껐어요');
});
document.addEventListener('visibilitychange', () => { audio.update({ hidden: document.hidden }); updateSoundButton(); });
updateSoundButton();

function observedVehicle() { return vehicles[mode === 'transfer' ? explorer.state.transferVehicleId : mode === 'ride' ? explorer.state.followId : 0] ?? vehicles[0]; }
function viewFocus() { return mode === 'ride' ? observedVehicle().state.car : mode === 'transfer' ? (explorer.state.transferTarget ?? observedVehicle().state.target) : explorer.state.position; }

const mapCanvas = $('minimap'), mapCtx = mapCanvas.getContext('2d');
function drawMap() {
  const ctx = mapCtx, w = mapCanvas.width, h = mapCanvas.height, pad = 16;
  const sx = (w - pad * 2) / WIDTH, sz = (h - pad * 2) / LENGTH;
  const mx = (x) => pad + (x + WIDTH / 2) * sx, mz = (z) => pad + (z + LENGTH / 2) * sz;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#eef3f2'; ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.strokeStyle = '#bacdd0'; ctx.lineWidth = 2; ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.fillStyle = '#dae7e7'; ctx.fillRect(mx(-AISLE / 2), pad, sx * AISLE, h - pad * 2);
  for (const m of machinePositions) { ctx.fillStyle = m.family.color + 'aa'; ctx.fillRect(mx(m.x - TOOL_WIDTH / 2), mz(m.z - 2.4), sx * TOOL_WIDTH, sz * 4.8); }
  ctx.strokeStyle = '#397e8c88'; ctx.lineWidth = .8;
  for (const path of railPaths) { if (path.kind === 'switch') continue; ctx.beginPath(); path.points.forEach((p, i) => i ? ctx.lineTo(mx(p.x), mz(p.z)) : ctx.moveTo(mx(p.x), mz(p.z))); ctx.stroke(); }
  ctx.fillStyle = '#bd874a'; for (const v of vehicles) { ctx.beginPath(); ctx.arc(mx(v.state.car.x), mz(v.state.car.z), 1.6, 0, Math.PI * 2); ctx.fill(); }
  if (mode !== 'overview') {
    const focus = viewFocus();
    const x = mx(focus.x), y = mz(focus.z), angle = -camera.rotation.y - Math.PI / 2;
    ctx.fillStyle = '#306d751c'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 29, angle - .5, angle + .5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2d7379'; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
  }
}
function updateZone() {
  if (mode === 'overview') return;
  let text = '중앙 통로', sub = 'CONNECTED FAB · THIRD PERSON';
  const focus = viewFocus();
  if (Math.abs(focus.x) > AISLE / 2) {
    const nearest = bays.reduce((a, b) => Math.hypot(focus.x - a.x, focus.z - a.z) < Math.hypot(focus.x - b.x, focus.z - b.z) ? a : b);
    text = 'BAY ' + String(nearest.id + 1).padStart(2, '0') + ' · ' + getBayPurpose(nearest.id).name; sub = '10 + 10 TOOLS · AISLE 5.2m';
    const offsetZ = Math.abs(focus.z - nearest.z);
    if (offsetZ > 8.2 && Math.abs(focus.x) < 54.8) { text = '장비 뒤쪽 통로'; sub = 'REAR SERVICE AISLE · 1.4m'; }
    else if (offsetZ > 2.6 && offsetZ < 8.2 && Math.abs(focus.x) < 54.8) { text = '옆 장비 사이 통로'; sub = 'TOOL SIDE CLEARANCE · 0.65m'; }
  }
  if (mode === 'ride') { const v = vehicles[explorer.state.followId]; text = 'OHT ' + String(explorer.state.followId + 1).padStart(2, '0') + ' · ' + v.state.label; sub = 'BAY ' + (v.state.origin.bayId + 1) + ' → BAY ' + (v.state.destination.bayId + 1); }
  if (mode === 'transfer') { const v = observedVehicle(); text = 'FOUP 반송 · OHT ' + String(explorer.state.transferVehicleId + 1).padStart(2, '0'); sub = 'BAY ' + String(focus.bayId + 1).padStart(2, '0') + ' · ' + (explorer.state.transferLabel || v.state.label); }
  if (text !== currentZone) { currentZone = text; $('view-title').textContent = text; $('map-location').textContent = mode === 'ride' ? 'OHT ' + String(explorer.state.followId + 1).padStart(2, '0') : text.split(' · ')[0]; }
  if ($('view-subtitle').textContent !== sub) $('view-subtitle').textContent = sub;
}
let frameCount = 0, fpsStart = 0, displayedFPS = 0;
function animate(now) {
  requestAnimationFrame(animate);
  if (document.hidden) return;
  const dt = lastTime ? Math.min((now - lastTime) / 1000, .05) : .016; lastTime = now; elapsed += dt;
  fleet.step(dt);
  for (const v of vehicles) {
    const state = v.controller.state; v.state = state;
    v.root.position.set(state.car.x, VEHICLE_Y, state.car.z); v.root.rotation.y = state.car.yaw;
    v.foup.position.set(state.foup.x, state.foup.y, state.foup.z); v.foup.rotation.y = state.foup.yaw;
    v.gripper.position.y = state.gripperY - VEHICLE_Y;
    const upper = .32, bottom = v.gripper.position.y + .0275;
    for (const belt of v.belts) { belt.position.y = (upper + bottom) / 2; belt.scale.y = Math.max(.02, upper - bottom); }
  }
  updateEntry(dt); explorer.update(dt);
  audio.update({ jet: entry.active ? entry.state.jet : 0, hidden: false });
  if (frameCount % 5 === 0) { drawMap(); updateZone(); }
  scene.updateMatrixWorld(true);
  for (const batch of movingBatches.values()) { batch.sources.forEach((source, i) => batch.instance.setMatrixAt(i, source.matrixWorld)); batch.instance.instanceMatrix.needsUpdate = true; }
  renderer.render(scene, camera);
  frameCount++;
  if (now - fpsStart > 1500) { displayedFPS = Math.round(frameCount * 1000 / (now - fpsStart)); frameCount = 0; fpsStart = now; }
  // Read-only diagnostics for local acceptance checks.
  if (frameCount % 15 === 0) {
    const demo = observedVehicle();
    updateSoundButton();
    $('world').dataset.diagnostics = JSON.stringify({ ready: true, revision: 'experience-fixes-7', mode, audio: audio.state, amberBays: bayLighting.bayIds.map(id => id + 1), amberLights: bayLighting.lights.length, amberLightsVisible: bayLighting.root.visible, entry: { active: entry.active, ...entry.state }, width: WIDTH, length: LENGTH, ceiling: HEIGHT,
      equipmentCount: equipment.length, equipmentFamilies: families.length, uniqueEquipmentCodes: new Set(equipment.map(e => e.code)).size, selectedEquipment: selectedEquipment?.code ?? null,
      machines: machinePositions.length, bays: bays.length, toolsPerRow: 10, loadports: layoutMachines.length * 3,
      frontAisle: AISLE, rearAisle: SERVICE_AISLE, sideGap: SIDE_GAP, vehicles: vehicles.length, junctions: network.junctions.length,
      networkNodes: network.nodes.length, networkEdges: network.edges.length, traffic: fleet.stats, instances: staticInstances, fps: displayedFPS,
      calls: renderer.info.render.calls, position: { x: explorer.state.position.x, y: 0, z: explorer.state.position.z },
      camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, character: { visible: avatar.root.visible, height: avatar.height, speed: explorer.state.speed, heading: explorer.state.heading },
      walkPathPoints: explorer.state.path.length, cameraDistance: explorer.state.distance, cameraYaw: explorer.state.yaw,
      roofVisible: roof.visible, parkedFoups: vehicles.filter(v => v.state.parked).length, transfer: demo.state, transferVehicleId: explorer.state.transferVehicleId, transferTarget: explorer.state.transferTarget, transferWaiting: explorer.state.transferWaiting, transferInTransit: explorer.state.transferInTransit, transferLabel: explorer.state.transferLabel, followId: explorer.state.followId, tourTime: explorer.state.tourTime });
    $('transfer-status').textContent = mode === 'transfer' ? (explorer.state.transferLabel || demo.state.label) : demo.state.label;

  }
}
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); $('mobile-pad').classList.toggle('hidden', mode !== 'walk' || !(mobile || innerWidth < 700)); });
startEntry(); requestAnimationFrame(animate);
requestAnimationFrame(() => { $('loading').classList.add('done'); setTimeout(() => $('loading').remove(), 800); });
