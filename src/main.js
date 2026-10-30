import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { machines as layoutMachines, bays, columns, TOUR_POINTS, isBlocked, sampleLoop, TOOL_SCALE_X, TOOL_WIDTH, PORT_Z, SEATED_FOUP_Y, VEHICLE_Y, RAIL_Y, AISLE } from './layout.js';
import { sampleTransport } from './transport.js';

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
for (let x = -57; x <= 57; x += 6) for (let z = -87; z <= 87; z += 6) {
  const strip = mesh(roof, boxGeometry, M.light, x, 4.975, z, .14, .025, 2.6);
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

const families = [
  { key: 'PHOTO', name: '포토 · 빛으로 그리는 회로', short: 'LITHOGRAPHY', description: '웨이퍼 위 감광막에 빛을 비춰 미세한 회로 모양을 옮깁니다. 노광 장비와 코팅·현상 장비가 함께 배치된 구역을 표현했어요.', color: '#6a96b4', material: M.blue },
  { key: 'ETCH', name: '식각 · 필요한 모양만 남기기', short: 'PLASMA ETCH', description: '패턴을 따라 얇은 막의 일부를 제거합니다. 여러 공정 챔버를 가진 장비와 웨이퍼를 받아들이는 로드포트를 볼 수 있어요.', color: '#73a99f', material: M.accent },
  { key: 'DEPO', name: '증착 · 아주 얇은 막 쌓기', short: 'THIN FILM', description: '웨이퍼 위에 공정에 필요한 얇은 막을 형성합니다. 서로 다른 막과 조건에 맞춰 여러 종류의 장비가 사용됩니다.', color: '#a58daf', material: M.purple },
  { key: 'CLEAN', name: '세정 · 다음 공정을 위한 준비', short: 'WET CLEAN', description: '웨이퍼 표면의 입자와 잔류물을 제거합니다. 다음 공정이 안정적으로 이루어질 수 있도록 표면을 준비하는 단계예요.', color: '#7fa7bc', material: M.blue },
  { key: 'CMP', name: 'CMP · 표면을 고르게', short: 'PLANARIZATION', description: '화학 반응과 기계적인 연마를 이용해 웨이퍼 표면을 평탄하게 만듭니다. 여러 층을 쌓는 공정에서 중요한 역할을 합니다.', color: '#b5a17b', material: M.yellow },
  { key: 'METRO', name: '계측 · 작은 차이 들여다보기', short: 'METROLOGY', description: '막의 두께와 패턴의 치수 등 공정 결과를 확인합니다. 이 모형은 실제 특정 제조사의 장비나 팹 배치를 재현한 설계가 아닙니다.', color: '#8a9cb7', material: M.blue }
];
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
  // Wafer front-end module, real FOUP-sized loadports, equipment monitor.
  localBox(x, z, s, M.panel, -.2, .72, 2.73, 3.3, 1.25, .77);
  localBox(x, z, s, M.dark, -.2, 1.38, 2.81, 3.4, .09, .93);
  for (let j = 0; j < 3; j++) {
    const port = layout.ports[j], lx = port.x;
    box(M.edge, lx, 1.43, port.z, .71, .065, .66);
    localBox(x, z, s, M.black, -1.23 + j * 1.02, 1.76, 2.4, .57, .64, .035);
    if (!port.reserved && (index + j) % 4 !== 0) staticFoup(lx, SEATED_FOUP_Y, port.z, s);
  }
  localBox(x, z, s, M.edge, 2.12, 1.61, 2.57, .065, .8, .13);
  const monitor = mesh(scene, planeGeometry, screenMat, x + s * 2.12 * TOOL_SCALE_X, 1.91, z + s * 2.66, .56, .46, 1); monitor.rotation.y = s === 1 ? 0 : Math.PI;
  localBox(x, z, s, M.edge, 2.12, 1.59, 2.7, .64, .04, .33);
  const label = labelTexture(family.key, family.short, family.color);
  if (!family.labelMat) family.labelMat = mat('#ffffff', .65, .02, { map: label });
  const labelMesh = mesh(scene, planeGeometry, family.labelMat, x, 2.38, z + s * 2.37, 1.2, .3, 1); labelMesh.rotation.y = s === 1 ? 0 : Math.PI;
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
  colliders.push({ ...layout.bounds, front: frontZ, x, z, family });
  machinePositions.push({ x, z, family, index, sign, frontZ });
}
for (const layout of layoutMachines) machine(layout, families[layout.familyIndex]);
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
  const tex = labelTexture('BAY ' + String(bay.id + 1).padStart(2, '0'), family.key + '    10 + 10 TOOLS', family.color);
  mesh(sign, planeGeometry, mat('#ffffff', .8, 0, { map: tex }), 0, 0, .05, 2.7, .57, 1);
  mesh(sign, boxGeometry, M.edge, -1, .75, 0, .025, .9, .025); mesh(sign, boxGeometry, M.edge, 1, .75, 0, .025, .9, .025);
  roof.add(sign);
}

// Each service run is generated from the very same port centres as the tools.
// Rounded end turns form continuous closed loops with no vehicle teleportation.
for (const bay of bays) {
  for (const segment of bay.loop.segments) {
    const steps = segment.type === 'arc' ? 12 : 1;
    for (let i = 0; i < steps; i++) {
      const a = sampleLoop(bay.loop, segment.start + i * segment.length / steps);
      const b = sampleLoop(bay.loop, segment.start + (i + 1) * segment.length / steps);
      const angle = Math.atan2(b.x - a.x, b.z - a.z), length = Math.hypot(b.x - a.x, b.z - a.z);
      for (const offset of [-.19, .19]) box(M.rail, (a.x + b.x) / 2 + Math.cos(angle) * offset, RAIL_Y, (a.z + b.z) / 2 - Math.sin(angle) * offset, .075, .12, length + .008, angle);
      box(M.dark, (a.x + b.x) / 2, RAIL_Y + .03, (a.z + b.z) / 2, .18, .06, length + .008, angle);
    }
  }
  for (let d = 0; d < bay.loop.length; d += 7) {
    const p = sampleLoop(bay.loop, d);
    box(M.edge, p.x, 4.64, p.z, .045, .64, .045);
    box(M.rail, p.x, 4.3, p.z, .58, .065, .1, p.yaw);
  }
}
function movingFoup(parent) {
  const foup = new THREE.Group();
  mesh(foup, boxGeometry, M.foup, 0, 0, 0, .43, .38, .36);
  mesh(foup, boxGeometry, M.foupDoor, 0, 0, .19, .38, .32, .025);
  mesh(foup, boxGeometry, M.foupRib, 0, .215, 0, .19, .045, .13);
  mesh(foup, boxGeometry, M.dark, 0, -.205, 0, .45, .035, .38);
  for (let i = 0; i < 5; i++) for (const side of [-1, 1]) mesh(foup, boxGeometry, M.foupRib, side * .222, -.13 + i * .065, 0, .025, .024, .31);
  parent.add(foup); return foup;
}
const vehicles = [];
function createOHT(bay) {
  const root = new THREE.Group(); root.position.set(bay.target.x, VEHICLE_Y, bay.target.z); scene.add(root);
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
  vehicles.push({ root, foup, belts, gripper, bay, offset: bay.id === 7 ? 0 : bay.id * 9.7, state: null });
}
for (const bay of bays) createOHT(bay);
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
orbit.minDistance = 16; orbit.maxDistance = 240; orbit.maxPolarAngle = Math.PI * .46; orbit.target.set(0, 0, 0);
let mode = reducedMotion ? 'walk' : 'tour', elapsed = 0, lastTime = 0, tourTime = 0, transition = null;
let yaw = .04, pitch = -.015, manualLook = false, dragging = false, dragDistance = 0;
let pointerStart = null, currentZone = '', introVisible = true, toastTimer;
const keys = new Set(), touchMoves = new Set();
const walkDirection = new THREE.Vector3(), previousPosition = new THREE.Vector3();
const tourKeyframes = TOUR_POINTS.map(([x, z], i) => {
  const [nx, nz] = TOUR_POINTS[(i + 1) % (TOUR_POINTS.length - 1)];
  const length = Math.hypot(nx - x, nz - z) || 1;
  return { p: [x, EYE, z], t: [x + (nx - x) / length * 40, 2.2, z + (nz - z) / length * 40] };
});
tourKeyframes.at(-1).t = tourKeyframes[0].t;
// Piecewise straight routes turn only in clear cross-aisles, avoiding equipment.
const smooth = (t) => t * t * (3 - 2 * t);
function tourPose(t) {
  const segment = (t / 24) % (tourKeyframes.length - 1), i = Math.floor(segment), f = smooth(segment - i);
  const a = tourKeyframes[i], b = tourKeyframes[i + 1];
  return { p: new THREE.Vector3(...a.p).lerp(new THREE.Vector3(...b.p), f), t: new THREE.Vector3(...a.t).lerp(new THREE.Vector3(...b.t), f) };
}
function toast(text) { $('zone-toast').textContent = text; $('zone-toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('zone-toast').classList.remove('visible'), 2800); }
function dismissIntro() { if (introVisible) { document.body.classList.add('exploring'); introVisible = false; } }
function setMode(next) {
  const old = mode; mode = next; manualLook = false; dragging = false; keys.clear(); touchMoves.clear();
  for (const id of ['tour', 'walk', 'overview']) { $(id).classList.toggle('active', id === next); $(id).setAttribute('aria-pressed', String(id === next)); }
  orbit.enabled = next === 'overview'; roof.visible = next !== 'overview'; walls.visible = next !== 'overview';
  if (reflector) reflector.visible = next !== 'overview';
  $('walk-hint').classList.toggle('hidden', next !== 'walk'); $('mobile-pad').classList.toggle('hidden', next !== 'walk' || !(mobile || innerWidth < 700));
  $('tool-card').classList.add('hidden');
  if (next === 'overview') {
    dismissIntro(); orbit.target.set(0, 0, 0); camera.position.set(78, 115, 125); camera.lookAt(orbit.target); orbit.update(); scene.fog.density = .0015;
    $('view-title').textContent = '팹 전체 보기'; $('view-subtitle').textContent = '16 BAYS · 320 TOOLS · 10 + 10 PER BAY';
    toast('지붕을 열어 팹 전체를 봅니다');
  } else {
    scene.fog.density = .0063;
    if (old === 'overview') { const pose = tourPose(0); camera.position.copy(pose.p); camera.lookAt(pose.t); }
    if (next === 'walk') { dismissIntro(); camera.position.y = EYE; yaw = camera.rotation.y; pitch = THREE.MathUtils.clamp(camera.rotation.x, -.9, .9); toast('드래그로 시선을 돌리고, WASD로 걸어보세요'); }
    if (next === 'tour') { if (old !== 'tour') dismissIntro(); tourTime = 0; transition = null; const pose = tourPose(0); camera.position.copy(pose.p); camera.lookAt(pose.t); toast('긴 장비열을 따라 천천히 산책합니다'); }
    currentZone = ''; updateZone();
  }
}
function reset() {
  introVisible = true; document.body.classList.remove('exploring'); mode = 'tour'; tourTime = 0; transition = null;
  const pose = tourPose(0); camera.position.copy(pose.p); camera.lookAt(pose.t); setMode(reducedMotion ? 'walk' : 'tour');
  if (!reducedMotion) { introVisible = true; document.body.classList.remove('exploring'); }
}
for (const id of ['tour', 'walk', 'overview']) $(id).addEventListener('click', () => setMode(id));
$('explore').addEventListener('click', () => setMode('walk')); $('reset').addEventListener('click', reset);
$('transfer-view').addEventListener('click', () => {
  setMode('walk');
  const v = vehicles.find(v => v.bay.id === 7), port = v.bay.target;
  v.offset = -elapsed;
  camera.position.set(port.x + 3.8, EYE, v.bay.z + .3);
  camera.lookAt(port.x, 2.7, port.z); yaw = camera.rotation.y; pitch = camera.rotation.x;
  toast('실제 로드포트에서 내려놓고, 빈 OHT가 돌아와 회수합니다');
});
$('help-toggle').addEventListener('click', () => $('help').classList.toggle('hidden'));
$('help-close').addEventListener('click', () => $('help').classList.add('hidden'));
$('close-card').addEventListener('click', () => $('tool-card').classList.add('hidden'));

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (mode === 'overview') return;
  dragging = true; dragDistance = 0; pointerStart = { x: event.clientX, y: event.clientY }; renderer.domElement.setPointerCapture(event.pointerId);
  yaw = camera.rotation.y; pitch = camera.rotation.x;
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!dragging || mode === 'overview') return;
  const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y;
  pointerStart = { x: event.clientX, y: event.clientY }; dragDistance += Math.abs(dx) + Math.abs(dy);
  if (dragDistance > 4) { manualLook = true; yaw -= dx * .003; pitch = THREE.MathUtils.clamp(pitch - dy * .0025, -1.15, 1.15); camera.rotation.set(pitch, yaw, 0); }
});
const raycaster = new THREE.Raycaster();
renderer.domElement.addEventListener('pointerup', (event) => {
  if (mode === 'overview') return;
  dragging = false;
  if (dragDistance < 6) {
    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1), camera);
    let nearest = null, nearestDistance = 28;
    for (const c of colliders) {
      const hit = raycaster.ray.intersectBox(new THREE.Box3(new THREE.Vector3(c.minX, 0, c.minZ), new THREE.Vector3(c.maxX, 3.4, c.maxZ)), new THREE.Vector3());
      if (hit && hit.distanceTo(camera.position) < nearestDistance) { nearest = c; nearestDistance = hit.distanceTo(camera.position); }
    }
    if (nearest) showMachine(nearest.family);
  }
});
renderer.domElement.addEventListener('pointercancel', () => { dragging = false; });
function showMachine(family) { $('tool-family').textContent = family.short; $('tool-name').textContent = family.name; $('tool-description').textContent = family.description; $('tool-card').classList.remove('hidden'); dismissIntro(); }
const movementKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'];
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'escape') { $('tool-card').classList.add('hidden'); $('help').classList.add('hidden'); }
  if (!movementKeys.includes(key) || event.target.closest('input,textarea,select,[contenteditable=true]')) return;
  event.preventDefault(); if (mode !== 'walk') setMode('walk'); keys.add(key);
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); touchMoves.clear(); dragging = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); touchMoves.clear(); } lastTime = 0; });
for (const button of document.querySelectorAll('[data-move]')) {
  const release = () => { touchMoves.delete(button.dataset.move); button.classList.remove('pressed'); };
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); touchMoves.add(button.dataset.move); button.classList.add('pressed'); });
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
}
function blocked(x, z) {
  return isBlocked(x, z);
}
function move(dt) {
  let forward = Number(keys.has('w') || keys.has('arrowup') || touchMoves.has('forward')) - Number(keys.has('s') || keys.has('arrowdown') || touchMoves.has('back'));
  let right = Number(keys.has('d') || keys.has('arrowright') || touchMoves.has('right')) - Number(keys.has('a') || keys.has('arrowleft') || touchMoves.has('left'));
  if (!forward && !right) return;
  const norm = Math.hypot(forward, right); forward /= norm; right /= norm;
  const speed = keys.has('shift') ? 6 : 2.8;
  const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * right) * dt * speed;
  const dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * right) * dt * speed;
  if (!blocked(camera.position.x + dx, camera.position.z)) camera.position.x += dx;
  if (!blocked(camera.position.x, camera.position.z + dz)) camera.position.z += dz;
  camera.position.y = EYE; camera.rotation.set(pitch, yaw, 0);
}

// Optional quiet ventilation ambience is synthesized locally, after user input.
let audio = null;
$('sound').setAttribute('aria-pressed', 'false');
$('sound').addEventListener('click', async () => {
  try {
    if (!audio) {
      const Context = window.AudioContext || window.webkitAudioContext, context = new Context();
      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const data = buffer.getChannelData(0); let brown = 0;
      for (let i = 0; i < data.length; i++) { brown = (brown + (Math.random() * 2 - 1) * .02) / 1.02; data[i] = brown * 3.5; }
      const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
      const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 650;
      const gain = context.createGain(); gain.gain.value = .13; source.connect(filter).connect(gain).connect(context.destination); source.start();
      audio = { context, gain, enabled: true }; await context.resume();
    } else { audio.enabled = !audio.enabled; if (audio.enabled) await audio.context.resume(); audio.gain.gain.setTargetAtTime(audio.enabled ? .13 : 0, audio.context.currentTime, .3); }
    $('sound').setAttribute('aria-pressed', String(audio.enabled)); $('sound').setAttribute('aria-label', audio.enabled ? '공간 소리 끄기' : '공간 소리 켜기'); toast(audio.enabled ? '은은한 공조 소리를 켰어요' : '공간 소리를 껐어요');
  } catch { toast('이 브라우저에서는 소리를 켤 수 없어요'); }
});

const mapCanvas = $('minimap'), mapCtx = mapCanvas.getContext('2d');
function drawMap() {
  const ctx = mapCtx, w = mapCanvas.width, h = mapCanvas.height, pad = 16;
  const sx = (w - pad * 2) / WIDTH, sz = (h - pad * 2) / LENGTH;
  const mx = (x) => pad + (x + WIDTH / 2) * sx, mz = (z) => pad + (z + LENGTH / 2) * sz;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#eef3f2'; ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.strokeStyle = '#bacdd0'; ctx.lineWidth = 2; ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.fillStyle = '#dae7e7'; ctx.fillRect(mx(-AISLE / 2), pad, sx * AISLE, h - pad * 2);
  for (const m of machinePositions) { ctx.fillStyle = m.family.color + 'aa'; ctx.fillRect(mx(m.x - TOOL_WIDTH / 2), mz(m.z - 2.4), sx * TOOL_WIDTH, sz * 4.8); }
  if (mode !== 'overview') {
    const x = mx(camera.position.x), y = mz(camera.position.z), angle = -camera.rotation.y - Math.PI / 2;
    ctx.fillStyle = '#306d751c'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 29, angle - .5, angle + .5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2d7379'; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
  }
}
function updateZone() {
  if (mode === 'overview') return;
  let text = '중앙 통로', sub = 'MAIN CONCOURSE · EYE LEVEL 1.68m';
  if (Math.abs(camera.position.x) > AISLE / 2) {
    const nearest = bays.reduce((a, b) => Math.hypot(camera.position.x - a.x, camera.position.z - a.z) < Math.hypot(camera.position.x - b.x, camera.position.z - b.z) ? a : b);
    text = 'BAY ' + String(nearest.id + 1).padStart(2, '0') + ' · ' + families[nearest.familyIndex].name.split(' · ')[0]; sub = '10 + 10 TOOLS · AISLE 5.2m';
  }
  if (text !== currentZone) { currentZone = text; $('view-title').textContent = text; $('view-subtitle').textContent = sub; $('map-location').textContent = text; }
}
let frameCount = 0, fpsStart = 0, displayedFPS = 0;
const poseTarget = new THREE.PerspectiveCamera();
function animate(now) {
  requestAnimationFrame(animate);
  if (document.hidden) return;
  const dt = lastTime ? Math.min((now - lastTime) / 1000, .05) : .016; lastTime = now; elapsed += dt;
  if (mode === 'tour') {
    if (!dragging && !reducedMotion && $('help').classList.contains('hidden')) tourTime += dt;
    const pose = tourPose(tourTime);
    if (transition) {
      transition.time += dt; const t = smooth(Math.min(transition.time / 1.8, 1)); camera.position.copy(transition.position).lerp(pose.p, t);
      poseTarget.position.copy(pose.p); poseTarget.lookAt(pose.t); camera.quaternion.slerpQuaternions(transition.quaternion, poseTarget.quaternion, t);
      if (t >= 1) transition = null;
    } else { camera.position.copy(pose.p); if (!manualLook) camera.lookAt(pose.t); }
  } else if (mode === 'walk') { if ($('help').classList.contains('hidden')) move(dt); }
  else orbit.update();
  for (const v of vehicles) {
    const state = sampleTransport(v.bay, elapsed + v.offset); v.state = state;
    v.root.position.set(state.car.x, VEHICLE_Y, state.car.z); v.root.rotation.y = state.car.yaw;
    v.foup.position.set(state.foup.x, state.foup.y, state.foup.z); v.foup.rotation.y = state.foup.yaw;
    v.gripper.position.y = state.gripperY - VEHICLE_Y;
    const upper = .32, bottom = v.gripper.position.y + .0275;
    for (const belt of v.belts) { belt.position.y = (upper + bottom) / 2; belt.scale.y = Math.max(.02, upper - bottom); }
  }
  if (frameCount % 5 === 0) { drawMap(); updateZone(); }
  scene.updateMatrixWorld(true);
  for (const batch of movingBatches.values()) { batch.sources.forEach((source, i) => batch.instance.setMatrixAt(i, source.matrixWorld)); batch.instance.instanceMatrix.needsUpdate = true; }
  renderer.render(scene, camera);
  frameCount++;
  if (now - fpsStart > 1500) { displayedFPS = Math.round(frameCount * 1000 / (now - fpsStart)); frameCount = 0; fpsStart = now; }
  // Read-only diagnostics for local acceptance checks.
  if (frameCount % 15 === 0) {
    const demo = vehicles.find(v => v.bay.id === 7);
    $('world').dataset.diagnostics = JSON.stringify({ ready: true, revision: 'bay-layout-2', mode, width: WIDTH, length: LENGTH, ceiling: HEIGHT, eyeHeight: EYE, machines: machinePositions.length, bays: bays.length, toolsPerRow: 10, loadports: layoutMachines.length * 3, aisleWidth: AISLE, sideGap: .4, vehicles: vehicles.length, instances: staticInstances, fps: displayedFPS, calls: renderer.info.render.calls, position: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, roofVisible: roof.visible, parkedFoups: vehicles.filter(v => v.state.parked).length, transfer: { ...demo.state, target: demo.bay.target }, tourTime });
    $('transfer-status').textContent = demo.state.label;
  }
}
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); $('mobile-pad').classList.toggle('hidden', mode !== 'walk' || !(mobile || innerWidth < 700)); });
reset(); requestAnimationFrame(animate);
requestAnimationFrame(() => { $('loading').classList.add('done'); setTimeout(() => $('loading').remove(), 800); });
