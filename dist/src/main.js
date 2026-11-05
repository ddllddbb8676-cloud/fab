import {createNicknameUI,createNicknameModeration} from './nickname-ui.js?v=85d42af6a700';
import {createAdminVisit} from './admin-visit.js?v=85d42af6a700';
import {createWorldEventsUI} from './world-events-ui.js?v=85d42af6a700';
import {createContestUI,createContestZones} from './foup-contest-view.js?v=85d42af6a700';
import {createSpeechBubbles,createSpeechComposer} from './owner-speech-ui.js?v=85d42af6a700';
import {contestOutfit} from './foup-contest.js?v=85d42af6a700';
import {createEventCamera} from './event-camera.js?v=85d42af6a700';
import {createChipRewardTracker,createChipRewardView,createDestructionRewardQueue} from './chip-rewards.js?v=85d42af6a700';
import {npcOutfit} from './npc-outfits.js?v=85d42af6a700';
import {createWardrobeNotice,WARDROBE_NOTICE,WARDROBE_NOTICE_DURATION} from './wardrobe-notice.js?v=85d42af6a700';
import {createAvatarAppearance} from './avatar-appearance.js?v=85d42af6a700';
import {createWardrobe} from './wardrobe-ui.js?v=85d42af6a700';
import {destructionTitle,findTitle} from './destruction-titles.js?v=85d42af6a700';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { machines as layoutMachines, bays, columns, TOUR_POINTS, isBlocked, TOOL_SCALE_X, TOOL_WIDTH, SEATED_FOUP_Y, VEHICLE_Y, RAIL_Y, AISLE, SERVICE_AISLE, SIDE_GAP } from './layout.js?v=85d42af6a700';
import { network, railPaths } from './rail-network.js?v=85d42af6a700';
import { createFleet, reservedPortIds } from './network-transport.js?v=85d42af6a700';
import { createAvatar } from './avatar.js?v=85d42af6a700';
import { createExplorer } from './explorer.js?v=85d42af6a700';
import { createTouchJoystick } from './touch-joystick.js?v=85d42af6a700';
import { CHASE_CAMERA } from './locomotion.js?v=85d42af6a700';
import { WALK_CLIPPING, createSceneDepth, createFloorFoundation } from './scene-depth.js?v=85d42af6a700';
import { createViewControls,createPhotoMode } from './view-controls.js?v=85d42af6a700';
import { AIR_SHOWER, createAirShower } from './air-shower.js?v=85d42af6a700';
import { createEntrySequence, entryCamera } from './entry-sequence.js?v=85d42af6a700';
import { ENTRANCE, entranceBounds } from './entrance-layout.js?v=85d42af6a700';
import { processFamilies, buildEquipmentCatalog, getBayPurpose } from './equipment-catalog.js?v=85d42af6a700';
import { createEquipmentLabels } from './equipment-labels.js?v=85d42af6a700';
import { createEquipmentDirectory } from './equipment-directory.js?v=85d42af6a700';
import { createBayLighting, applyBayWhiteLightMask } from './bay-lighting.js?v=85d42af6a700';
import { createAmbience } from './ambience.js?v=85d42af6a700';
import {stockerBounds} from './stocker-layout.js?v=85d42af6a700';
import {createStockerView} from './stocker-view.js?v=85d42af6a700';
import { setRuntimeObstacles } from './runtime-obstacles.js?v=85d42af6a700';
import { createEquipmentVisibility } from './equipment-visibility.js?v=85d42af6a700';
import { createEquipmentDestruction } from './equipment-destruction.js?v=85d42af6a700';
import { createEmoControls } from './emo-controls.js?v=85d42af6a700';
import { createSpatialBatch } from './spatial-batch.js?v=85d42af6a700';
import { createPlayActions } from './play-actions.js?v=85d42af6a700';
import { createVisitorName, createVisitorBadge } from './visitor-name.js?v=85d42af6a700';
import { createResidents } from './residents.js?v=85d42af6a700';
import { multiplayerConfiguration, createMultiplayer } from './multiplayer.js?v=85d42af6a700';
import {prepareRoomConnection} from './room-connection.js?v=85d42af6a700';
import { createSharedWorldView } from './shared-world-view.js?v=85d42af6a700';
import { createRemotePeople } from './remote-people.js?v=85d42af6a700';
import { createSafetyPatrols, canCatch, isSafety, safetyColor, PENALTY_MESSAGE, SAFETY_CATCH_GOAL, SAFETY_NO_EMO_MESSAGE } from './safety-team.js?v=85d42af6a700';
import { ROOM_CAPACITY, MAX_VISITORS, AUTOMATED_COUNT } from './room-population.js?v=85d42af6a700';
import {REST_AREAS,isRestArea,canSafetyTraverse,restAreaExit,SAFETY_CLEARANCE} from './rest-area.js?v=85d42af6a700';
import {createRestAreaView} from './rest-area-view.js?v=85d42af6a700';
import {createLeaderboard} from './leaderboard.js?v=85d42af6a700';
import {EMOTE_MENU,HEART_PATH,HEART_COLOR} from './emotes.js?v=85d42af6a700';
import {bindEmoteStrip} from './emote-strip.js?v=85d42af6a700';
import {createEmoteView} from './emote-view.js?v=85d42af6a700';
import {safetyProximity} from './safety-proximity.js?v=85d42af6a700';
import {startupStage,startupStep,startupFailure} from './startup-signals.js?v=85d42af6a700';
function recordUsageConnection(method, value) {
  try { window.__fabTelemetry?.[method](value); } catch {}
}

startupStage('connection');
const connectionConfig = await (window.__fabConnectionConfig||multiplayerConfiguration());
delete window.__fabConnectionConfig;
window.__fabPreparedRoom ||= prepareRoomConnection(connectionConfig);
await startupStep('graphics');
let multiplayer = null, sharedWorld = null, remotePeople = null, realVisitorCount = 0, totalCharacterCount = 0, adminVisit = null;
let eventCamera=null,worldEventsUI=null,contestUI=null,contestTeam=null;
const personalStats = { brokenCount: 0, repairedCount: 0 };
let personalStatsLoaded=false;
if(connectionConfig)for(const id of ['personal-broken','personal-repaired'])document.getElementById(id).textContent='…';
let safetyPatrols = null, safetyPeople = null, safetyState = {role:'visitor',penalty:0}, safetyGrace = 12;
const onlineLink = connectionConfig ? { get connected(){return Boolean(multiplayer?.connected);}, command:(...args)=>multiplayer?.command(...args)??Promise.resolve({ok:false,message:'팹에 연결 중이에요'}) } : null;

const $ = (id) => document.getElementById(id);
const leaderboard=createLeaderboard($('leaderboard'));leaderboard.setOnline(Boolean(connectionConfig));
const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const WIDTH = 120, LENGTH = 180, HEIGHT = 5, EYE = 1.68;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dce7eb');
scene.fog = new THREE.FogExp2('#e0e9eb', .0063);
const camera = new THREE.PerspectiveCamera(CHASE_CAMERA.fov, innerWidth / innerHeight, WALK_CLIPPING.near, WALK_CLIPPING.far);
const sceneDepth = createSceneDepth(THREE, camera, { width: WIDTH, length: LENGTH, height: HEIGHT });
camera.rotation.order = 'YXZ';
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  throw new Error('3D 화면 초기화 실패: '+error.message);
}
let firstFrameDrawn=false,captureFrame=null,captureTime=null;
renderer.domElement.addEventListener('webglcontextlost',()=>{if(!firstFrameDrawn)startupFailure('3D 그래픽 연결이 중단됐어요. 다시 연결해 주세요.');});
renderer.debug.onShaderError=()=>{if(!firstFrameDrawn)throw new Error('3D 화면의 셰이더를 준비하지 못했어요.');};
const maxPixelRatio = Math.min(devicePixelRatio, mobile ? 1.25 : 1.5);
let renderPixelRatio = maxPixelRatio;
renderer.setPixelRatio(renderPixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('world').appendChild(renderer.domElement);
await startupStep('lighting');
const pmrem = new THREE.PMREMGenerator(renderer);
const envSource = new RoomEnvironment();
const envTarget = pmrem.fromScene(envSource, .04);
scene.environment = envTarget.texture;
scene.environmentIntensity = .65;
envSource.dispose(); pmrem.dispose();
await startupStep('equipment');
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
const equipmentVisibility = createEquipmentVisibility();
let buildingMachineId = null, buildingPortId = null;
const initialPortIds = [], removedOriginalFoups = new Set(), originalFoupParts = new Map();
const spatialBatches = [], viewFrustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4();
function addSpatialBatch(parent, geometry, material, transforms, owners, maxDistance = Infinity, portIds = []) {
  const batch = createSpatialBatch(THREE, { geometry, material, transforms, owners, maxDistance });
  spatialBatches.push(batch); parent.add(batch.mesh);
  owners?.forEach((id, i) => {
    const portId = portIds[i];
    if (portId) { if (!originalFoupParts.has(portId)) originalFoupParts.set(portId, []); originalFoupParts.get(portId).push((visible=false) => batch.setVisible(i,visible && !destruction?.isDestroyed(id))); }
    if (id !== null && id !== undefined) equipmentVisibility.register(id, visible => batch.setVisible(i, visible && !removedOriginalFoups.has(portId)));
  });
  return batch;
}
const dummy = new THREE.Object3D();
function solid(geometry, material, x, y, z, sx, sy, sz, rotationY = 0) {
  // Retain every distant cabinet and rail; only sub-pixel tool fittings use LOD.
  const longest = Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz)), shortest = Math.min(Math.abs(sx), Math.abs(sy), Math.abs(sz));
  const detail = buildingMachineId !== null && (longest <= .7 || (shortest < .06 && longest < 3.6));
  const key = geometry.uuid + material.uuid + (detail ? ':detail' : ':body');
  if (!batches.has(key)) batches.set(key, { geometry, material, transforms: [], owners: [], portIds: [], maxDistance: detail ? 55 : Infinity });
  dummy.position.set(x, y, z); dummy.rotation.set(0, rotationY, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
  batches.get(key).transforms.push(dummy.matrix.clone());
  batches.get(key).owners.push(buildingMachineId);
  batches.get(key).portIds.push(buildingPortId);
}
const box = (material, x, y, z, sx, sy, sz, ry = 0) => solid(boxGeometry, material, x, y, z, sx, sy, sz, ry);
const cyl = (material, x, y, z, r, h) => solid(cylinderGeometry, material, x, y, z, r, h, r);
function mesh(parent, geometry, material, x, y, z, sx, sy, sz) {
  const obj = new THREE.Mesh(geometry, material); obj.position.set(x, y, z); obj.scale.set(sx, sy, sz); parent.add(obj);
  if (buildingMachineId !== null && parent === scene) obj.userData.equipmentId = buildingMachineId;
  return obj;
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
const floorBase = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, LENGTH), new THREE.MeshStandardMaterial({ map: floorTexture, roughness: .43, metalness: .28 }));
floorBase.rotation.x = -Math.PI / 2; floorBase.position.y = -.02; scene.add(floorBase);
// The shared room environment supplies a soft floor sheen in one render pass.
// A second live mirror pass over the entire 21,600 m² hall is unnecessary here.
scene.add(createFloorFoundation(THREE, M.dark, WIDTH, LENGTH));
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
// Close the unused rear strip while retaining a 1.9 m equipment service aisle.
// These solid wings remain visible in the overview, so the empty floor does
// not reappear when the perimeter walls and ceiling are hidden.
for (const b of entranceBounds) {
  const x = (b.minX + b.maxX) / 2, z = (b.minZ + b.maxZ) / 2, w = b.maxX - b.minX, d = b.maxZ - b.minZ;
  box(M.white, x, ENTRANCE.height / 2, z, w, ENTRANCE.height, d);
  box(M.edge, x, .12, b.minZ - .015, w, .24, .03);
  box(M.accent, x, 1.1, b.minZ - .018, w, .065, .015);
  for (let panelX = b.minX + 3; panelX < b.maxX; panelX += 3) box(M.panel, panelX, 2.5, b.minZ - .015, .025, 5, .02);
  const sideX = Math.sign(x) * (ENTRANCE.halfWidth - .015);
  box(M.edge, sideX, .12, z, .03, .24, d);
  box(M.accent, sideX, 1.1, z, .015, .065, d);
}
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
    if (!reservedPortIds.has(port.id) && (index + j) % 4 !== 0) {
      buildingPortId = port.id; initialPortIds.push(port.id);
      staticFoup(lx, SEATED_FOUP_Y, port.z, s); buildingPortId = null;
    }
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
  colliders.push({ ...layout.bounds, front: frontZ, x, z, family, equipment: equipmentById.get(index),
    cameraBounds: layout.walkBounds.map((bounds, i) => ({ ...bounds, minY: 0, maxY: i === 0 ? 3.4 : 1.45 })) });
  machinePositions.push({ x, z, family, equipment: equipmentById.get(index), index, sign, frontZ });
}
for (let i=0;i<layoutMachines.length;i++) {
  const layout=layoutMachines[i];buildingMachineId = layout.id;machine(layout, families[layout.familyIndex]);
  if((i+1)%60===0&&i+1<layoutMachines.length)await startupStep('equipment');
}
buildingMachineId = null;
const equipmentLabels = createEquipmentLabels(THREE, layoutMachines, equipment, families); scene.add(equipmentLabels);
for (const machine of layoutMachines) equipmentVisibility.register(machine.id, visible => equipmentLabels.setEquipmentVisible(machine.id, visible));
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
await startupStep('transport');
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
await startupStep('batches');
let staticInstances = 0;
for (const { geometry, material, transforms, owners, maxDistance, portIds } of batches.values()) {
  addSpatialBatch(scene, geometry, material, transforms, owners, maxDistance, portIds); staticInstances += transforms.length;
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
    if (objects.length < 2) { const obj = objects[0]; obj.updateMatrix(); obj.matrixAutoUpdate = false; if (obj.userData.equipmentId !== undefined) equipmentVisibility.register(obj.userData.equipmentId, visible => { obj.visible = visible; }); continue; }
    const transforms = objects.map(obj => { obj.updateMatrix(); return obj.matrix.clone(); });
    addSpatialBatch(parent, objects[0].geometry, objects[0].material, transforms, objects.map(obj => obj.userData.equipmentId));
    objects.forEach(obj => parent.remove(obj));
  }
}
consolidate(roof); consolidate(walls); consolidate(scene);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enabled = false; orbit.enableDamping = true; orbit.dampingFactor = .06;
orbit.minDistance = 16; orbit.maxDistance = 700; orbit.maxPolarAngle = Math.PI * .46; orbit.target.set(0, 0, 0);
await startupStep('people');
const avatar = createAvatar(THREE); scene.add(avatar.root);
const appearance=createAvatarAppearance(THREE,avatar);let currentWallet=null;
const airShower = createAirShower(THREE); scene.add(airShower.root);
const restAreaView=createRestAreaView(THREE,scene);
const bayWhiteMask = applyBayWhiteLightMask(THREE, scene, bays, { yellowBayIds: bayLighting.bayIds });
colliders.push(...AIR_SHOWER.bounds.map(b => ({ ...b, maxY: 3.15 })));
colliders.push(...stockerBounds);
colliders.push(...entranceBounds);
const stockerView=createStockerView(THREE,scene);
colliders.push(...AIR_SHOWER.overheadBounds);
const entry = createEntrySequence({ reducedMotion });
let mode = 'walk', elapsed = 0, lastTime = 0, currentZone = '', toastTimer, selectedEquipment = null, playActions = null;
let nextRefreshReminder=performance.now()+15*60*1000,lastToastAt=-Infinity;
const wardrobeNotice=createWardrobeNotice();
const visitorBadge = createVisitorBadge(THREE, scene, connectionConfig?'연결 중':createVisitorName(),{screenLabel:true});
const chipRewardTracker=createChipRewardTracker(),destructionRewardTracker=createChipRewardTracker('earnedDestructionChips'),chipRewards=createChipRewardView(THREE,{reducedMotion});
const destructionRewards=createDestructionRewardQueue(showChipReward);
function showChipReward(amount){if(amount>0&&!document.hidden){chipRewards.show(amount);audio.playChipReward();}}
function clearChipRewards(){chipRewards.clear();destructionRewards.clear();}
const visitorEmote=createEmoteView(THREE,scene,{self:true});
let lastEmoteClick=-Infinity,nearSafety=false,nextSafetyCheck=0;
for(const emote of EMOTE_MENU){
  const button=document.createElement('button');button.type='button';button.textContent=emote.emoji;
  if(emote.id==='heart'){
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
    icon.setAttribute('viewBox','0 0 128 128');icon.setAttribute('width','29');icon.setAttribute('height','29');icon.setAttribute('aria-hidden','true');
    path.setAttribute('d',HEART_PATH);path.setAttribute('fill',HEART_COLOR);icon.append(path);button.replaceChildren(icon);
  }
  button.setAttribute('aria-label',emote.label);button.title=emote.label;button.dataset.emote=emote.id;
  button.addEventListener('click',async()=>{
    if(entry.active||performance.now()-lastEmoteClick<650)return;lastEmoteClick=performance.now();
    const token=visitorEmote.play(emote.id);
    if(onlineLink){
      try{const result=await onlineLink.command('emote',{id:emote.id});if(!result.ok){visitorEmote.cancel(token);toast(result.message);}}
      catch{visitorEmote.cancel(token);toast('감정을 보내지 못했어요. 다시 눌러주세요.');}
    }
  });$('emote-controls').append(button);
}
bindEmoteStrip($('emote-controls'));
function toast(text,duration=3200) { lastToastAt=performance.now(); $('zone-toast').textContent = text; $('zone-toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('zone-toast').classList.remove('visible'), duration); }
function updatePersonalStats(next) {
  const broken=next.brokenCount||0,repaired=next.repairedCount||0;
  if(personalStatsLoaded&&broken===personalStats.brokenCount&&repaired===personalStats.repairedCount)return;
  personalStatsLoaded=true;
  personalStats.brokenCount=broken;personalStats.repairedCount=repaired;
  if(!connectionConfig)visitorBadge.setTitle(destructionTitle(broken)?.id);
  $('personal-broken').textContent=String(broken);$('personal-repaired').textContent=String(repaired);
  $('personal-stats').setAttribute('aria-label',`내 기록: 부순 장비 ${broken}대, 고친 장비 ${repaired}대`);
}
function showMachine(item) {
  selectedEquipment = item;
  $('tool-family').textContent = `${item.processCode} · ${item.familyName}`;
  $('tool-name').textContent = item.code; $('tool-type').textContent = item.typeName;
  $('tool-location').textContent = `${item.fabName} · ${item.bayLabel} ${item.bayPurpose} · ${String(item.ordinal).padStart(2, '0')}번 장비`;
  $('tool-description').textContent = item.description;
  $('tool-code-process').textContent = item.processCode; $('tool-code-fab').textContent = item.fabCode;
  $('tool-code-bay').textContent = item.code.slice(3, 5); $('tool-code-number').textContent = item.code.slice(5);
  $('tool-ports').textContent = '로드포트 ' + item.portCodes.join(' · ');
  updateEmoCard();
  $('tool-card').classList.remove('hidden');
}
await startupStep('controls');
const explorer = createExplorer({ THREE, camera, scene, canvas: renderer.domElement, avatar, orbit, colliders, vehicles,
  canTraverse:(a,b)=>!isSafety(safetyState.role)||canSafetyTraverse(a,b),
  isEquipmentVisible: id => equipmentVisibility.isVisible(id),
  pickRepairTarget: (ray, options) => destruction?.pick(ray, options),
  onToast: toast, onInspect: showMachine,
  onManualMove: () => {eventCamera?.cancel();adminVisit?.cancel();playActions?.clearPending();},
  onActionTap: ray => {if(eventCamera?.active){eventCamera.cancel();return true;}adminVisit?.cancel();return playActions?.tap(ray) || emoControls.press(ray);},
  onMode(next) {
    eventCamera?.cancel();
    mode = next; document.body.classList.add('exploring');
    document.body.dataset.viewMode = next;
    $('transfer-view').setAttribute('aria-pressed', String(next === 'transfer'));
    for (const id of ['tour', 'walk', 'ride', 'overview']) { $(id).classList.toggle('active', id === next); $(id).setAttribute('aria-pressed', String(id === next)); }
    roof.visible = walls.visible = next !== 'overview';
    bayLighting.setOverview(next === 'overview');
    restAreaView.setOverview(next === 'overview');
    bayWhiteMask.setOverview(next === 'overview');
    railOverview.visible = next === 'overview';
    airShower.root.visible = next !== 'overview';
    scene.fog.density = next === 'overview' ? .0015 : .0063;
    sceneDepth.update(next === 'overview');
    $('next-oht').classList.toggle('hidden', next !== 'ride'); $('tool-card').classList.add('hidden');
    if (next === 'overview') { $('view-title').textContent = '연결된 팹 전체 보기'; $('view-subtitle').textContent = `${bays.length} BAYS · ${layoutMachines.length} TOOLS · ${network.junctions.length} JUNCTIONS`; }
    if (next === 'blast') { $('view-title').textContent = `${selectedEquipment?.code ?? '장비'} · EMO`; $('view-subtitle').textContent = '파손 · 붕괴 · 폭발'; }
    if (next === 'ride') toast('교차로를 지나 다른 구역으로 향하는 OHT를 따라갑니다');
    currentZone = '';
  }
});
const directory = createEquipmentDirectory({ equipment, families,
  getPosition: () => explorer.state.position,
  onError: () => toast('장비 목록을 열지 못했어요. 다시 눌러주세요.'),
  onToggle(open) { explorer.lock(open); if (open) { $('help').classList.add('hidden'); $('tool-card').classList.add('hidden'); } },
  onSelect(item, { repair = false } = {}) {
    if (repair) { triggerRepair(item.id); return; }
    explorer.focusEquipment(layoutMachines.find(m => m.id === item.id)); showMachine(item);
  }
});
$('equipment-list').addEventListener('click', () => { if (!entry.active) directory.open(); });
for (const id of ['tour', 'walk', 'ride', 'overview']) $(id).addEventListener('click', () => explorer.setMode(id));
$('reset').addEventListener('click',async()=>{
  if(!confirm('이름·파괴/수리 기록·칩·구매한 꾸미기 아이템을 모두 지우고 완전히 새로 시작할까요?'))return;
  $('reset').disabled=true;
  try{if(multiplayer)await multiplayer.resetProfile();location.reload();}
  catch(error){toast(error.message);$('reset').disabled=false;}
});
$('transfer-view').addEventListener('click', () => explorer.focusTransfer());
$('rear-view').addEventListener('click', () => explorer.focusRear());
$('next-oht').addEventListener('click', () => explorer.nextVehicle());
$('help-toggle').addEventListener('click', () => $('help').classList.toggle('hidden'));
$('help-close').addEventListener('click', () => $('help').classList.add('hidden'));
$('close-card').addEventListener('click', () => $('tool-card').classList.add('hidden'));
const viewControls = createViewControls({
  onLock: value => explorer.lock(value),
  onOpen() { $('help').classList.add('hidden'); $('tool-card').classList.add('hidden'); }
});
let movementStyle = 'joystick';
try { if (localStorage.getItem('fab-movement-style') === 'tap') movementStyle = 'tap'; } catch {}
const joystick = createTouchJoystick({ zone: $('joystick-zone'),
  onStart: () => !playActions?.busy && explorer.beginJoystick(),
  onMove: (x, y) => explorer.moveJoystick(x, y), onEnd: () => explorer.endJoystick() });
function syncMovementStyle() {
  explorer.state.floorTapEnabled = movementStyle === 'tap';
  document.body.dataset.movement = movementStyle;
  $('movement-toggle').setAttribute('aria-pressed', String(movementStyle === 'joystick'));
  $('movement-label').textContent = movementStyle === 'joystick' ? '조이스틱 이동' : '바닥 터치 이동';
}
$('movement-toggle').addEventListener('click', () => {
  movementStyle = movementStyle === 'joystick' ? 'tap' : 'joystick';
  joystick.setEnabled(false); explorer.endJoystick(); explorer.state.path = [];
  try { localStorage.setItem('fab-movement-style', movementStyle); } catch {}
  syncMovementStyle(); toast(movementStyle === 'joystick' ? '왼쪽 조이스틱으로 이동 · 화면 드래그로 둘러보기' : '바닥을 누르면 그곳까지 걸어가요');
});
syncMovementStyle();
document.addEventListener('visibilitychange', () => { lastTime = 0;if(document.hidden)adminVisit?.cancel(); });
window.addEventListener('blur',()=>adminVisit?.cancel());

const entryUi = [...document.querySelectorAll('#controls-toggle,#controls-panel,#map-panel,.view-label,#posture-controls')];
const entryCopy = {
  ready: ['세미툰 | 팹뿌', 'ㄱㄱㄱㄱㄱ'],
  shower: ['깨끗한 바람으로 준비 중', '양옆 노즐에서 바람이 나옵니다. 잠시만 기다려주세요.'],
  settle: ['에어샤워 완료', '바람이 잦아들면 앞문이 열립니다.'],
  opening: ['자동문이 열립니다.', '문 너머로 넓은 팹이 펼쳐집니다.'],
  entering: ['팹뿌 ㄱㄱㄱㄱㄱ', '입장 중'],
  closing: ['입장 완료 · 문이 닫힙니다.', '캐릭터가 모두 나온 뒤 출입문을 닫습니다.']
};
let entryStage = '';
function startEntry() {
  if(!connectionConfig)visitorBadge.rename(createVisitorName(Math.random, residents?.state.people.map(p => p.name) ?? []));
  viewControls.closeAll();
  setRuntimeObstacles([]);
  explorer.lock(false); explorer.setMode('walk');
  explorer.state.position.set(AIR_SHOWER.start.x, 0, AIR_SHOWER.start.z);
  explorer.state.yaw = 0; explorer.state.heading = Math.PI;
  Object.assign(explorer.state, entryCamera(0)); explorer.state.manualLook = false;
  explorer.lock(true); entry.start(); entryStage = '';
  camera.fov = innerWidth < 700 ? 84 : 64; camera.updateProjectionMatrix();
  document.body.classList.add('entering'); $('entry-overlay').classList.remove('hidden');
  $('help').classList.add('hidden'); $('tool-card').classList.add('hidden'); $('zone-toast').classList.remove('visible'); clearTimeout(toastTimer);
  for (const element of entryUi) element.inert = true;
  airShower.update(entry.state);
}
function finishEntry({ resumed = false } = {}) {
  entry.finish(); explorer.state.position.set(AIR_SHOWER.exit.x, 0, AIR_SHOWER.exit.z);
  setRuntimeObstacles(AIR_SHOWER.closedDoorBounds);
  explorer.state.speed = 0; explorer.state.distance = CHASE_CAMERA.distance; explorer.state.elevation = CHASE_CAMERA.elevation;
  if (!resumed) Object.assign(explorer.state, entryCamera(1));
  camera.fov = CHASE_CAMERA.fov; camera.updateProjectionMatrix();
  explorer.lock(false); document.body.classList.remove('entering'); $('entry-overlay').classList.add('hidden');
  for (const element of entryUi) element.inert = false;
  $('reset').title = '이름과 기록을 초기화하고 새로 시작'; $('reset').setAttribute('aria-label', '완전히 새로 시작하기');
  toast(movementStyle === 'joystick' ? '왼쪽 조이스틱으로 이동 · 화면 드래그로 둘러보기' : '바닥을 눌러 걷기 · 드래그로 둘러보기');
}
function updateEntry(dt) {
  if (!entry.active||nicknameUI.isOpen) return;
  const before = explorer.state.position.z, s = entry.step(dt);
  airShower.update(s);
  explorer.state.position.set(s.position.x, 0, s.position.z);
  explorer.state.speed = Math.abs(s.position.z - before) / Math.max(dt, .001);
  Object.assign(explorer.state, entryCamera(s.walk));
  camera.fov = (innerWidth < 700 ? 84 : 64) * (1 - s.walk) + CHASE_CAMERA.fov * s.walk; camera.updateProjectionMatrix();
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
window.addEventListener('keydown', e => { if (entry.active && !nicknameUI.isOpen && e.key === 'Escape') skipEntry(); });

// Browsers require a user gesture; the first touch starts the intended ambience.
const audio = createAmbience();
let destruction, residents, burstShake = 0, emoPhase = '', stepDistance = 0, lastHammer = -1, previousPosture = 'stand';
const lastStepPosition = explorer.state.position.clone();
function localVolume(position, range = 22) {
  if (!position) return 1;
  const d = Math.hypot(position.x - explorer.state.position.x, position.z - explorer.state.position.z);
  return d >= range ? 0 : Math.min(1, (1 - d / range) ** 2 * 1.3);
}
function motionCue(kind, position) {
  if(kind==='stocker-prepare'){audio.prepareStocker();return;}
  if(kind==='stocker-out'){audio.playStocker(()=>localVolume(position,18));return;}
  const volume = localVolume(position);
  if (volume > .025) { if (kind === 'press') audio.playEmoPress(volume); else audio.playCue(kind, volume); }
}
const emoControls = createEmoControls({ THREE, scene, machines: layoutMachines, equipment,
  isDestroyed: id => destruction?.isDestroyed(id) ?? false,
  onPress: id => { const item=equipmentById.get(id);if(item){explorer.cancelEmo('tap');playActions?.clearPending();explorer.state.path=[];showMachine(item);} } });
destruction = createEquipmentDestruction({ THREE, scene, machines: layoutMachines, reducedMotion,
  onVisibility(id, visible) { equipmentVisibility.setVisible(id, visible); emoControls.setDestroyed(id, !visible); },
  onBurst(id, position) { const volume = localVolume(position, 34); if (volume > .02) audio.playExplosion(volume); if (!reducedMotion && volume > .25) burstShake = .45 * volume; },
  onChange() { updateEmoCard(); }
});
playActions = createPlayActions({ THREE, scene, materials: M, fleet, explorer, avatar, initialPortIds,seedStockers:!connectionConfig,
  hideOriginal(portId) { removedOriginalFoups.add(portId); for (const hide of originalFoupParts.get(portId) ?? []) hide(); },
  showOriginal(portId) { removedOriginalFoups.delete(portId);for(const show of originalFoupParts.get(portId)??[])show(true); },
  isDestroyed: id => destruction.isDestroyed(id), toast, onCue: motionCue, network:onlineLink, isRestricted: () => safetyState.penalty > 0&&!contestUI?.playing, reducedMotion });
const nicknameUI=createNicknameUI({command:(...args)=>onlineLink.command(...args),connected:()=>Boolean(onlineLink?.connected),onToggle:open=>{if(open){viewControls.closeAll();directory.close();$('help').classList.add('hidden');$('tool-card').classList.add('hidden');}explorer.lock(open||entry.active);}});
const nicknameModeration=createNicknameModeration({button:$('nickname-admin'),command:(...args)=>onlineLink.command(...args),onToggle:open=>explorer.lock(open||entry.active)});
let visitStorage;try{visitStorage=window.sessionStorage;}catch{}
adminVisit=createAdminVisit({storage:visitStorage,getWalker:()=>explorer.state,walkTo:point=>explorer.walkTo(point),stopWalk:()=>explorer.stopWalk(),canTraverse:(a,b)=>!isSafety(safetyState.role)||canSafetyTraverse(a,b),onToast:toast});
const wardrobe=createWardrobe({THREE,button:$('wardrobe-open'),command:(...args)=>onlineLink?.command(...args)??Promise.resolve({ok:false,message:'온라인 FAB에 연결해 주세요.'}),connected:()=>Boolean(onlineLink?.connected),getName:()=>visitorBadge.name,onChangeName:()=>nicknameUI.open(),onOpen:()=>{if(entry.active)return false;viewControls.closeAll();directory.close();$('help').classList.add('hidden');$('tool-card').classList.add('hidden');explorer.lock(true);},onClose:()=>explorer.lock(false)});
const photoMode=createPhotoMode({button:$('photo-toggle'),canOpen:()=>!entry.active&&!nicknameUI.isOpen&&!wardrobe.isOpen&&!captureTime?.isOpen,
  onToggle:open=>{if(open){viewControls.closeAll();directory.close();adminVisit?.cancel();joystick.setEnabled(false);explorer.endJoystick();$('help').classList.add('hidden');$('tool-card').classList.add('hidden');}}
});
// Capture code and image allocation are loaded only after the menu action.
let captureLoading=false;
$('capture-open').addEventListener('click',async()=>{
  if(captureLoading||captureTime?.isOpen)return;
  if(entry.active||nicknameUI.isOpen||connectionConfig&&(!multiplayer?.connected||!personalStatsLoaded)){toast('연결을 마친 뒤 캡쳐타임을 열어주세요.');return;}
  captureLoading=true;
  try{
    if(!captureTime){const {createCaptureTime}=await import('./capture-time.js?v=85d42af6a700');captureTime=createCaptureTime({
      getRecord:()=>({name:visitorBadge.name,title:findTitle(visitorBadge.titleId)?.name??'',...personalStats}),
      capture:draw=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{captureFrame=null;reject(Error('capture-timeout'));},2500);captureFrame=canvas=>{clearTimeout(timer);try{resolve(draw(canvas));}catch(error){reject(error);}};}),
      onToggle:open=>{if(open){viewControls.closeAll();directory.close();adminVisit?.cancel();$('help').classList.add('hidden');$('tool-card').classList.add('hidden');joystick.setEnabled(false);}explorer.lock(open||entry.active||nicknameUI.isOpen||wardrobe.isOpen);},
      onError:()=>toast('화면을 담지 못했어요. 잠시 후 다시 눌러주세요.'),
    });}
    if(!entry.active&&!nicknameUI.isOpen&&!document.hidden)await captureTime.open();
  }catch{toast('캡쳐타임을 열지 못했어요. 다시 눌러주세요.');}
  finally{captureLoading=false;}
});
const speechComposer=createSpeechComposer({
  button:$('speech-quick-open'),menuButton:$('owner-speech-open'),command:(...args)=>onlineLink.command(...args),toast,
  canOpen:()=>Boolean(multiplayer?.connected&&!entry.active&&!photoMode.isOpen&&!captureTime?.isOpen&&!wardrobe.isOpen&&!nicknameUI.isOpen),
  onToggle:open=>{
    if(open){viewControls.closeAll();directory.close();joystick.setEnabled(false);}
    explorer.lock(open||entry.active||nicknameUI.isOpen||wardrobe.isOpen||Boolean(captureTime?.isOpen));
  }
});
const speechBubble=createSpeechBubbles({THREE,getAnchor:(speaker,point)=>{
  if(entry.active||photoMode.isOpen||captureTime?.isOpen)return null;
  if(speaker===multiplayer?.id){
    if(!avatar.root.visible)return null;
    point.copy(visitorBadge.sprite.position);
    return (visitorBadge.titleId?48:30)+(visitorEmote.sprite.visible?40:0);
  }
  return remotePeople?.speechAnchor(speaker,point,mode==='overview'||eventCamera?.active);
}});
function applyNickname(nickname){wardrobe.setNickname(nickname);nicknameUI.sync(nickname);}
function applyTitles(titles){wardrobe.setTitles(titles);visitorBadge.setTitle(titles.titleId);}
eventCamera=createEventCamera({camera,bays,onOverview:open=>{
  const top=open||mode==='overview';roof.visible=walls.visible=!top;airShower.root.visible=!top;
  bayLighting.setOverview(top);restAreaView.setOverview(top);bayWhiteMask.setOverview(top);railOverview.visible=top;scene.fog.density=top?.0015:.0063;
}});
worldEventsUI=createWorldEventsUI({command:(...args)=>onlineLink.command(...args),toast,
  ready:()=>!entry.active&&!nicknameUI.isOpen&&!wardrobe.isOpen&&!captureTime?.isOpen&&!photoMode.isOpen&&!document.hidden,
  canCelebrate:id=>bays[id].machines.every(m=>destruction.collapseState(m.id)===true),
  onTravel:point=>{eventCamera.cancel();adminVisit?.cancel();viewControls.closeAll();directory.close();$('help').classList.add('hidden');$('tool-card').classList.add('hidden');playActions.resetOnline();explorer.arriveAtEvent(point);multiplayer?.sendPose(true);toast(`${point.bayId+1}번 BAY 앞에 도착했어요`);},
  onVictory:id=>{if(Number.isInteger(id))eventCamera.start(id);audio.playChipReward();}
});
const paintPlayingOutfit=()=>appearance.setOutfit(contestOutfit(currentWallet?.equipped,contestTeam),contestTeam?'visitor':safetyState.role);
contestUI=createContestUI({command:(...args)=>onlineLink.command(...args),toast,getId:()=>multiplayer?.id,
  ready:()=>!entry.active&&!nicknameUI.isOpen&&!wardrobe.isOpen&&!captureTime?.isOpen&&!photoMode.isOpen&&!document.hidden,
  onTeam:next=>{contestTeam=next;paintPlayingOutfit();},setZones:createContestZones(THREE,scene),
  onGather:point=>{
    const {heading,yaw}=explorer.state;
    if(!explorer.arriveAtEvent(point))return false;
    Object.assign(explorer.state,{heading,yaw});
    eventCamera.cancel();adminVisit?.cancel();viewControls.closeAll();directory.close();playActions.resetOnline();
    multiplayer?.sendPose(true);return true;
  }});
function applyWallet(wallet){const earned=chipRewardTracker.receive(wallet),delayed=Math.min(earned,destructionRewardTracker.receive(wallet)),eventReward=wallet.lastEventRewardId?.startsWith('bay:')&&wallet.lastEventRewardId!==currentWallet?.lastEventRewardId?Math.min(200,earned-delayed):0;currentWallet=wallet;worldEventsUI?.wallet(wallet);contestUI.wallet(wallet);paintPlayingOutfit();wardrobe.setWallet(wallet);if(!document.hidden){if(delayed)destructionRewards.add(delayed,wallet.lastDestructionId);showChipReward(earned-delayed-eventReward);}}
if(!connectionConfig)residents = createResidents({ THREE, scene, fleet, store: playActions.store, destruction, detachCargo: v => playActions.detachVehicleCargo(v),
  getNeighbors:()=>safetyPatrols?.people??[],
  excludedNames: [visitorBadge.name], onCue: motionCue,
  protectedIds: () => [explorer.state.emoInteraction?.id, explorer.state.repairInteraction?.id, playActions.protectedMachineId].filter(Number.isFinite) });
else {
  startupStage('room');
  remotePeople=createRemotePeople({THREE,scene,store:playActions.store,fleet,maxDetailed:mobile?32:48});
  sharedWorld=createSharedWorldView({fleet,store:playActions.store,destruction,onPeople:rows=>remotePeople.synchronize(rows),onCue:motionCue,onCount:(n,total)=>{realVisitorCount=n;totalCharacterCount=total;updateConnectionLabel();},onSelf:updateSafetyState});
  multiplayer=createMultiplayer({config:connectionConfig,prepared:window.__fabPreparedRoom,getPose:()=>({x:+explorer.state.position.x.toFixed(3),y:+explorer.state.position.y.toFixed(3),z:+explorer.state.position.z.toFixed(3),heading:+explorer.state.heading.toFixed(3),speed:+(explorer.state.speed||0).toFixed(2),posture:explorer.state.posture,hidden:entry.active||nicknameUI.isOpen}),
    onTitles:applyTitles,onNickname:applyNickname,onWallet:applyWallet,onWelcome:data=>{recordUsageConnection('connected',data.privileges);adminVisit.welcome(data);speechComposer.setAllowed(data.privileges?.speech);remotePeople.setViewerPrivileges(data.privileges);visitorEmote.reset();chipRewardTracker.reset(data.wallet);destructionRewardTracker.reset(data.wallet);clearChipRewards();sharedWorld.welcome(data.id);leaderboard.setSelf(data.id);visitorBadge.rename(data.name);if(data.resume){finishEntry({resumed:true});airShower.update(entry.state);explorer.state.path=[];explorer.state.position.set(data.resume.x,0,data.resume.z);explorer.state.heading=data.resume.heading;toast('이름과 기록을 이어서 접속했어요.');}$('nickname-admin').classList.toggle('hidden',!data.privileges?.unlimitedChips);$('operations-admin').classList.toggle('hidden',!data.privileges?.unlimitedChips);applyNickname(data.nickname);},onRoster:rows=>{remotePeople.setRoster(rows);contestUI.roster(rows);leaderboard.setRoster(rows);const self=rows.find(row=>row[0]===multiplayer?.id);if(self)visitorBadge.rename(self[1]);},onFrame:(frame,initial)=>{speechBubble.frame(frame,initial);adminVisit.frame(frame);worldEventsUI.frame(frame.worldEvents,initial);contestUI.frame(frame.worldEvents);sharedWorld.apply(frame,initial);leaderboard.setPeople(frame.people);leaderboard.setRanking(frame.leaderboard);},onError:toast,
    onCatch:data=>toast(`${data.targetName}님을 잡았어요! 장비 3대를 고쳐야 합니다. (${data.caught??0} / ${SAFETY_CATCH_GOAL})${data.completed?` ${SAFETY_CATCH_GOAL}명 잡기 완료! 원래 방진복으로 돌아왔어요.`:''}`,5000),
    onStatus:status=>{recordUsageConnection('connectionStatus',status);if(status!=='connected'){remotePeople.setViewerPrivileges(null);speechComposer.setAllowed(false);speechBubble.reset();worldEventsUI.disconnect();contestUI.disconnect();eventCamera.cancel();}updateConnectionLabel(status);wardrobe.refresh();nicknameUI.refresh();if(status==='reconnecting'){clearChipRewards();playActions.resetOnline();explorer.cancelEmo('disconnect');toast('연결이 끊겨 다시 접속하고 있어요');}}
  });
  delete window.__fabPreparedRoom;
}
if(!connectionConfig) {
  safetyPatrols=createSafetyPatrols({excludedNames:[visitorBadge.name,...residents.state.people.map(p=>p.name)]});
  safetyPeople=createRemotePeople({THREE,scene,store:playActions.store,maxDetailed:4});
  safetyPeople.setRoster(safetyPatrols.people.map(p=>[p.id,p.name,p.role,npcOutfit(p.id)]));
  realVisitorCount=1;totalCharacterCount=1+residents.state.people.length+safetyPatrols.people.length;
  updateConnectionLabel('offline');
}
function updateSafetyState(next) {
  if(!next)return;const previous=safetyState;
  if(connectionConfig)visitorEmote.set(next.emote,next.emoteSeq,next.emoteLeft);
  if(connectionConfig){updatePersonalStats(next);visitorBadge.setTitle(next.titleId);wardrobe.setTitleProgress(next.brokenCount,next.titleId);}
  safetyState={role:next.role||'visitor',penalty:next.penalty||0,caught:next.safetyCatchCount||0};explorer.state.penalty=safetyState.penalty;
  if(isSafety(safetyState.role)&&explorer.state.emoInteraction)explorer.cancelEmo('safety-duty');
  if(isSafety(safetyState.role)&&explorer.state.position.y<.5&&isRestArea(explorer.state.position,SAFETY_CLEARANCE)){
    const outside=Number.isFinite(next.x)&&!isRestArea(next,SAFETY_CLEARANCE)?next:restAreaExit(explorer.state.position);
    explorer.state.position.set(outside.x,0,outside.z);explorer.state.path=[];
  }
  if(previous.role!==safetyState.role){paintPlayingOutfit();if(isSafety(safetyState.role))toast(`이번에는 내 안전팀 차례! 서로 다른 ${SAFETY_CATCH_GOAL}명을 잡으면 원래 방진복으로 돌아와요.`,5000);}
  if(safetyState.penalty>previous.penalty){
    explorer.cancelEmo('safety');playActions.clearPending();explorer.state.posture='stand';
    if(directory.isOpen)directory.close();explorer.setMode('walk');$('tool-card').classList.add('hidden');
    toast(PENALTY_MESSAGE);
  } else if(previous.penalty && !safetyState.penalty) { safetyGrace=elapsed+12;toast('장비 3대 수리 완료! 다시 팹뿌를 즐겨주세요.'); }
  const guard=isSafety(safetyState.role),penalty=safetyState.penalty;
  $('safety-panel').classList.toggle('hidden',!guard&&(!penalty||isRestArea(explorer.state.position)));
  $('safety-title').textContent=penalty?`안전팀 패널티 · 수리 ${3-penalty} / 3`:`${safetyState.role==='safety-red'?'빨간':'주황'} 안전팀 · 잡기 ${safetyState.caught} / ${SAFETY_CATCH_GOAL}`;
  $('safety-description').textContent=penalty?`장비를 ${penalty}대 더 고쳐야 다시 팹뿌를 하실 수 있습니다.`:`서로 다른 ${SAFETY_CATCH_GOAL}명을 잡으면 복귀 · 수리 중 / OHT 탑승 중 제외`;
  $('safety-repairs').classList.toggle('hidden',!penalty);$('safety-restart').classList.toggle('hidden',!guard);
  updateEmoCard();
}
$('safety-repairs').addEventListener('click',()=>directory.open({ids:destruction.state.destroyedIds}));
$('safety-restart').addEventListener('click',async()=>{
  $('safety-restart').disabled=true;
  try{const result=await onlineLink?.command('civilian');if(result?.ok){toast('안전팀을 그만뒀어요. 이름과 기록은 그대로예요.');}}
  finally{$('safety-restart').disabled=false;}
});
function updateConnectionLabel(status=multiplayer?.status) {
  const ready=status==='connected'||status==='offline',capacity=connectionConfig?.capacity??ROOM_CAPACITY;
  const text=ready?`함께 ${totalCharacterCount} / ${capacity}명`:status==='full'?'정원 초과 · 입장 대기':status==='version'?'새로고침 필요':status==='replaced'?'다른 탭에서 접속 중':status==='resetting'?'새로 시작하는 중':'팹 연결 중';
  const description=ready?`전체 ${totalCharacterCount}명 · 방문자 ${realVisitorCount}명 + 자동 캐릭터 ${totalCharacterCount-realVisitorCount}명`:text;
  const label=document.querySelector('.brand-sub');label.classList.add('online-count');
  if(label.textContent!==text){label.textContent=text;label.setAttribute('aria-label',description);label.title=description;}
  if($('population-summary').textContent!==description)$('population-summary').textContent=description;
}
$('oht-dismount').addEventListener('click', () => playActions.dismount());
$('foup-drop').addEventListener('click', () => playActions.throwFoup(true));
$('foup-throw').addEventListener('click', () => playActions.throwFoup());
function updateEmoCard() {
  if (!destruction) return;
  const id = selectedEquipment?.id, damaged = id !== undefined && destruction.isDestroyed(id);
  const busy = Boolean(explorer.state.emoInteraction || explorer.state.repairInteraction);
  const guard=isSafety(safetyState.role);
  $('tool-emo').disabled = id === undefined || damaged || busy || safetyState.penalty > 0 || guard;
  $('tool-emo').setAttribute('aria-label', id === undefined ? 'EMO 누르기' : `${selectedEquipment.code} EMO 누르기`);
  $('tool-emo').querySelector('strong').textContent = guard ? '안전팀은 EMO 사용 불가' : damaged ? '파손된 장비' : busy ? '캐릭터가 누르러 가는 중' : 'EMO 누르기';
  $('tool-emo').querySelector('small').textContent = guard ? `${SAFETY_CATCH_GOAL}명을 잡고 복귀하면 다시 사용할 수 있어요` : '걸어가서 꾹 누르면 작동';
  $('tool-repair').classList.toggle('hidden', !damaged);
  $('tool-repair').disabled = busy;
  $('tool-repair').textContent = explorer.state.repairInteraction?.id === id ? '열심히 수리하는 중…' : '이 장비 수리하기 🔧';
  const count = destruction.state.destroyedIds.length;
  $('restore-equipment').classList.toggle('hidden', count === 0);
  $('destroyed-count').textContent = `${count}대`;
}
function triggerEmo(id, claimed = false) {
  if(isSafety(safetyState.role)){toast(SAFETY_NO_EMO_MESSAGE);return false;}
  if(safetyState.penalty){toast(`장비를 ${safetyState.penalty}대 더 수리해 주세요`);return false;}
  if (entry.active || directory.isOpen || explorer.state.locked) return false;
  if (playActions?.state.carriedId) { toast('FOUP을 먼저 내려놓아 주세요'); return false; }
  const item = equipmentById.get(id); if (!item) return false;
  if (destruction.isDestroyed(id)) { toast(`${item.code} · 먼저 장비를 복구해 주세요`); return false; }
  if(onlineLink&&!claimed){if(!onlineLink.connected){toast('팹에 연결 중이에요');return false;}onlineLink.command('claim',{id,kind:'emo'}).then(r=>{if(r.ok&&!triggerEmo(id,true))onlineLink.command('cancel');});return true;}
  selectedEquipment = item;
  const machine = layoutMachines.find(machine => machine.id === id);
  residents?.yieldMachine(id);
  const accepted = explorer.approachEmo(machine, {
    isValid: () => !entry.active && !directory.isOpen && !destruction.isDestroyed(id),
    onPress() {
      emoControls.setPress(null);
      if(onlineLink){onlineLink.command('explode',{id}).then(r=>{if(r.ok){explorer.focusDestruction(machine);updateEmoCard();toast(`${item.code} · EMO 작동`);}});return;}
      if (!destruction.trigger(id)) return;
      updatePersonalStats({...personalStats,brokenCount:personalStats.brokenCount+1});
      explorer.focusDestruction(machine);
      updateEmoCard(); toast(`${item.code} · EMO 작동`);
    },
    onCancel(reason) {
      if(onlineLink)onlineLink.command('cancel');
      emoControls.setPress(null); updateEmoCard();
      if (['movement', 'tap', 'look-input', 'escape', 'mode-change'].includes(reason)) toast('EMO 누르기를 취소했어요');
    }
  });
  if (accepted) {
    $('tool-card').classList.add('hidden'); updateEmoCard();
    toast(`${item.code} · 캐릭터가 버튼 앞으로 걸어가요`);
  }
  return accepted;
}
$('tool-emo').addEventListener('click', () => { if (selectedEquipment) triggerEmo(selectedEquipment.id); });
function triggerRepair(id, claimed = false) {
  if (entry.active || directory.isOpen || explorer.state.locked || !destruction.isDestroyed(id)) return false;
  if (playActions?.state.carriedId) { toast('FOUP을 먼저 내려놓아 주세요'); return false; }
  const item = equipmentById.get(id), machine = layoutMachines.find(m => m.id === id);
  if (!item || !machine) return false;
  if(onlineLink&&!claimed){if(!onlineLink.connected){toast('팹에 연결 중이에요');return false;}onlineLink.command('claim',{id,kind:'repair'}).then(r=>{if(r.ok&&!triggerRepair(id,true))onlineLink.command('cancel');});return true;}
  residents?.yieldMachine(id);
  selectedEquipment = item;
  const accepted = explorer.approachRepair(machine, {
    isValid: () => !entry.active && !directory.isOpen && destruction.isDestroyed(id),
    onStart() { destruction.beginRepair(id); if(onlineLink)onlineLink.command('repair',{id}).then(r=>{if(!r.ok)explorer.cancelEmo('server');});toast(`${item.code} · 뚝딱뚝딱 수리 중`); },
    onProgress(progress) { if(!onlineLink)destruction.setRepairProgress(id, progress); },
    onComplete() { if(onlineLink)onlineLink.command('finish',{id}).then(r=>{if(r.ok){updateEmoCard();toast(`${item.code} · 수리 완료!`);}});else{if(!destruction.reset(id))return;updatePersonalStats({...personalStats,repairedCount:personalStats.repairedCount+1});motionCue('complete'); if(safetyState.penalty)updateSafetyState({...safetyState,penalty:safetyState.penalty-1}); updateEmoCard(); toast(`${item.code} · 수리 완료!`);} },
    onCancel() { if(onlineLink)onlineLink.command('cancel');destruction.cancelRepair(id); updateEmoCard(); toast(`${item.code} · 수리를 멈췄어요`); }
  });
  if (accepted) { $('tool-card').classList.add('hidden'); updateEmoCard(); }
  return accepted;
}
$('tool-repair').addEventListener('click', () => { if (selectedEquipment) triggerRepair(selectedEquipment.id); });
$('restore-equipment').addEventListener('click', () => directory.open({ ids: destruction.state.destroyedIds }));
for (const posture of ['sit', 'lie']) $(`posture-${posture}`).addEventListener('click', () => explorer.setPosture(explorer.state.posture === posture ? 'stand' : posture));
updateEmoCard();
function updateSoundButton() {
  const s = audio.state;
  for (const [id, desired, label, full] of [['sound',s.ambienceDesired,'공조음','공조 소리'],['effects-sound',s.effectsDesired,'효과음','효과음']]) {
    const button = $(id); button.setAttribute('aria-pressed',String(desired));
    button.setAttribute('aria-label',`${full} ${desired ? '끄기' : '켜기'}`);
    button.dataset.soundState = desired ? s.status : 'muted';
    $(`${id}-label`).textContent = `${label}${desired ? '' : ' ×'}`;
    button.title = `${full} ${desired ? '끄기' : '켜기'}`;
  }
}
async function activateSound(event) {
  if (!event.isTrusted || event.target.closest?.('#sound,#effects-sound')) return;
  await audio.activate(); updateSoundButton();
}
document.addEventListener('pointerdown', activateSound, { capture: true, passive: true });
document.addEventListener('keydown', activateSound, { capture: true });
$('sound').addEventListener('click', async () => {
  await audio.toggleAmbience();
  updateSoundButton();
});
$('effects-sound').addEventListener('click', async () => {
  await audio.toggleEffects(); updateSoundButton();
});
document.addEventListener('visibilitychange', () => { audio.update({ hidden: document.hidden }); if(document.hidden)clearChipRewards(); updateSoundButton(); });
updateSoundButton();

function observedVehicle() { return vehicles[mode === 'transfer' ? explorer.state.transferVehicleId : mode === 'ride' ? explorer.state.followId : 0] ?? vehicles[0]; }
function viewFocus() { return mode === 'ride' ? observedVehicle().state.car : mode === 'transfer' ? (explorer.state.transferTarget ?? observedVehicle().state.target) : explorer.state.position; }

const mapCanvas = $('minimap'), mapCtx = mapCanvas.getContext('2d');
const mapBase = document.createElement('canvas'); mapBase.width = mapCanvas.width; mapBase.height = mapCanvas.height;
let mapBaseReady = false;
function drawMap() {
  let ctx = mapCtx;
  const w = mapCanvas.width, h = mapCanvas.height, pad = 16;
  const sx = (w - pad * 2) / WIDTH, sz = (h - pad * 2) / LENGTH;
  const mx = (x) => pad + (x + WIDTH / 2) * sx, mz = (z) => pad + (z + LENGTH / 2) * sz;
  if (!mapBaseReady) {
  ctx = mapBase.getContext('2d');
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#eef3f2'; ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.strokeStyle = '#bacdd0'; ctx.lineWidth = 2; ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  ctx.fillStyle = '#dae7e7'; ctx.fillRect(mx(-AISLE / 2), pad, sx * AISLE, h - pad * 2);
  for (const m of machinePositions) { ctx.fillStyle = m.family.color + 'aa'; ctx.fillRect(mx(m.x - TOOL_WIDTH / 2), mz(m.z - 2.4), sx * TOOL_WIDTH, sz * 4.8); }
  ctx.strokeStyle = '#397e8c88'; ctx.lineWidth = .8;
  for (const path of railPaths) { if (path.kind === 'switch') continue; ctx.beginPath(); path.points.forEach((p, i) => i ? ctx.lineTo(mx(p.x), mz(p.z)) : ctx.moveTo(mx(p.x), mz(p.z))); ctx.stroke(); }
  ctx.fillStyle='#35b36f';for(const area of REST_AREAS)ctx.fillRect(mx(area.minX),mz(area.minZ),Math.max(3,sx*(area.maxX-area.minX)),Math.max(3,sz*(area.maxZ-area.minZ)));
  mapBaseReady = true;
  }
  ctx = mapCtx; ctx.clearRect(0, 0, w, h); ctx.drawImage(mapBase, 0, 0);
  ctx.fillStyle = '#bd874a'; for (const v of vehicles) { ctx.beginPath(); ctx.arc(mx(v.state.car.x), mz(v.state.car.z), 1.6, 0, Math.PI * 2); ctx.fill(); }
  if (mode !== 'overview') {
    const focus = viewFocus();
    const x = mx(focus.x), y = mz(focus.z), angle = -camera.rotation.y - Math.PI / 2;
    ctx.fillStyle = '#306d751c'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 29, angle - .5, angle + .5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2d7379'; ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
  }
}
function updateZone() {
  const restingHere=!entry.active&&isRestArea(explorer.state.position)&&!isSafety(safetyState.role);
  $('safety-panel').classList.toggle('hidden',!isSafety(safetyState.role)&&(!safetyState.penalty||restingHere));
  const repair = explorer.state.repairInteraction;
  const play = playActions.state;
  $('oht-dismount').classList.toggle('hidden', !playActions.busy || play.phase==='cleaning');
  $('oht-dismount').disabled = !play.canDismount;
  $('oht-dismount').textContent = play.phase === 'riding' ? '내리기 ↓' : play.phase === 'climb' ? '올라가는 중…' : '내려오는 중…';
  $('foup-actions').classList.toggle('hidden', !play.carriedId || entry.active);
  for (const id of ['walk', 'tour', 'ride', 'overview', 'equipment-list', 'restore-equipment', 'reset', 'rear-view', 'transfer-view']) $(id).disabled = playActions.busy || Boolean(safetyState.penalty && !['walk','overview','equipment-list','restore-equipment'].includes(id));
  for (const posture of ['sit', 'lie']) {
    const active = explorer.state.posture === posture, button = $(`posture-${posture}`);
    button.setAttribute('aria-pressed', String(active)); button.textContent = active ? '일어나기' : posture === 'sit' ? '앉기' : '눕기';
  }
  $('posture-controls').classList.toggle('hidden', entry.active || safetyState.penalty > 0&&!restingHere || playActions.busy&&play.phase!=='cleaning' || !['walk', 'tour'].includes(mode));
  if(play.phase==='cleaning'){$('view-title').textContent='파티클 청소';$('view-subtitle').textContent='슥삭슥삭 · 완료하면 2칩';currentZone='';return;}
  if (playActions.busy) { $('view-title').textContent = play.phase === 'riding' ? 'OHT · 만세 산책' : 'OHT 타기'; $('view-subtitle').textContent = play.phase === 'riding' ? '드래그로 둘러보기 · 내리기 ↓' : play.phase === 'climb' ? '장비를 딛고 점프!' : '바닥으로 착지하는 중'; currentZone = ''; return; }
  if (repair) {
    $('view-title').textContent = `${equipmentById.get(repair.id)?.code ?? '장비'} · 수리`;
    $('view-subtitle').textContent = repair.phase === 'repair' ? `뚝딱뚝딱 · ${Math.round(repair.progress * 100)}%` : '장비 앞으로 걸어가는 중'; currentZone = ''; return;
  }
  if (mode === 'overview' || mode === 'blast') return;
  let text = '중앙 통로', sub = mode === 'tour' ? '자동 산책 중' : '바닥을 눌러 이동';
  const focus = viewFocus();
  if (Math.abs(focus.x) > AISLE / 2) {
    const nearest = bays.reduce((a, b) => Math.hypot(focus.x - a.x, focus.z - a.z) < Math.hypot(focus.x - b.x, focus.z - b.z) ? a : b);
    text = 'BAY ' + String(nearest.id + 1).padStart(2, '0') + ' · ' + getBayPurpose(nearest.id).name; sub = '10 + 10 TOOLS · AISLE 5.2m';
    const offsetZ = Math.abs(focus.z - nearest.z);
    if (offsetZ > 8.2 && Math.abs(focus.x) < 54.8) { text = '장비 뒤쪽 통로'; sub = 'REAR SERVICE AISLE · 1.4m'; }
    else if (offsetZ > 2.6 && offsetZ < 8.2 && Math.abs(focus.x) < 54.8) { text = '옆 장비 사이 통로'; sub = 'TOOL SIDE CLEARANCE · 0.65m'; }
  }
  if(isRestArea(focus)){text='초록 휴식 구역';sub='안전팀 출입 금지 · 편하게 쉬세요';}
  if (mode === 'ride') { const v = vehicles[explorer.state.followId]; text = 'OHT ' + String(explorer.state.followId + 1).padStart(2, '0') + ' · ' + v.state.label; sub = 'BAY ' + (v.state.origin.bayId + 1) + ' → BAY ' + (v.state.destination.bayId + 1); }
  if (mode === 'transfer') { const v = observedVehicle(); text = 'FOUP 반송 · OHT ' + String(explorer.state.transferVehicleId + 1).padStart(2, '0'); sub = 'BAY ' + String(focus.bayId + 1).padStart(2, '0') + ' · ' + (explorer.state.transferLabel || v.state.label); }
  if (text !== currentZone) { currentZone = text; $('view-title').textContent = text; $('map-location').textContent = mode === 'ride' ? 'OHT ' + String(explorer.state.followId + 1).padStart(2, '0') : text.split(' · ')[0]; }
  if (explorer.state.posture !== 'stand') sub = explorer.state.posture === 'sit' ? '앉아서 쉬는 중' : '누워서 쉬는 중';
  if ($('view-subtitle').textContent !== sub) $('view-subtitle').textContent = sub;
}
// Static transforms are composed once. Dynamic branches still update normally.
scene.updateMatrixWorld(true);
for (const batch of spatialBatches) batch.mesh.matrixAutoUpdate = false;
for (const parent of [roof, walls]) parent.traverse(obj => { obj.updateMatrix(); obj.matrixAutoUpdate = false; });
// FOUP roots and the grippers are animated each frame, including standalone roots.
for (const v of vehicles) for (const group of [v.root, v.foup]) group.traverse(obj => { obj.matrixAutoUpdate = true; });
scene.matrixAutoUpdate = false; scene.matrixWorldAutoUpdate = false;
let frameCount = 0, fpsStart = 0, displayedFPS = 0, nextMapAt = 0, nextDiagnosticAt = 0;
let budgetTotal = 0, budgetFrames = 0, budgetAt = 0, lastQualityChange = 0;
const frameIntervals = new Float32Array(120); let frameCursor = 0, frameSamples = 0, frameMedian = 0, frameP95 = 0;
function updateFrameBudget(now, frameMs) {
  if (frameMs <= 0 || frameMs > 250 || entry.active) return;
  frameIntervals[frameCursor++ % frameIntervals.length] = frameMs; frameSamples = Math.min(frameSamples + 1, frameIntervals.length);
  budgetTotal += frameMs; budgetFrames++;
  if (now - budgetAt < 2000) return;
  const sorted = Array.from(frameIntervals.subarray(0, frameSamples)).sort((a, b) => a - b);
  frameMedian = sorted[Math.floor(sorted.length * .5)] || 0; frameP95 = sorted[Math.floor(sorted.length * .95)] || 0;
  const mean = budgetTotal / Math.max(1, budgetFrames); budgetTotal = 0; budgetFrames = 0; budgetAt = now;
  const floorRatio = Math.min(maxPixelRatio, mobile ? .8 : 1);
  let next = renderPixelRatio;
  if (now - lastQualityChange > 5000 && mean > 23) next = Math.max(floorRatio, renderPixelRatio - .15);
  else if (now - lastQualityChange > 12000 && mean < 17.5) next = Math.min(maxPixelRatio, renderPixelRatio + .1);
  if (Math.abs(next - renderPixelRatio) > .01) { renderPixelRatio = next; renderer.setPixelRatio(next); lastQualityChange = now; }
}
function animate(now) {
  requestAnimationFrame(animate);
  if (document.hidden) { lastTime = 0; return; }
  const frameMs = lastTime ? now - lastTime : 0;
  const frameSeconds = frameMs ? frameMs / 1000 : .016;
  const dt = Math.min(frameSeconds, .05); lastTime = now; elapsed += dt;
  updateFrameBudget(now, frameMs);
  if(connectionConfig)sharedWorld.update(dt);else fleet.step(dt);
  for (const v of vehicles) {
    const state = v.controller.state; v.state = state;
    v.foup.scale.setScalar(v.controller.cargoDetached || destruction.isDestroyed(state.target.machineId) && (state.parked || !state.travelling) ? 0 : 1);
    v.root.position.set(state.car.x, VEHICLE_Y, state.car.z); v.root.rotation.y = state.car.yaw;
    v.foup.position.set(state.foup.x, state.foup.y, state.foup.z); v.foup.rotation.y = state.foup.yaw;
    v.gripper.position.y = state.gripperY - VEHICLE_Y;
    const upper = .32, bottom = v.gripper.position.y + .0275;
    for (const belt of v.belts) { belt.position.y = (upper + bottom) / 2; belt.scale.y = Math.max(.02, upper - bottom); }
  }
  // The entry cinematic follows visible time even on slow PCs; movement and
  // game effects retain their bounded simulation step. Hidden tabs pause above.
  updateEntry(frameSeconds); playActions.update(dt);
  if(photoMode.isOpen&&(entry.active||nicknameUI.isOpen||wardrobe.isOpen))photoMode.close();
  adminVisit.update(dt,{connected:Boolean(multiplayer?.connected),ready:!entry.active&&!nicknameUI.isOpen&&!captureTime?.isOpen&&!document.hidden});
  joystick.setEnabled(movementStyle === 'joystick' && !photoMode.isOpen && !entry.active && !document.hidden && !explorer.state.locked && (!playActions.busy||playActions.state.phase==='cleaning') && $('help').classList.contains('hidden') && $('tool-card').classList.contains('hidden') && ['walk','tour','blast'].includes(mode));
  worldEventsUI.update();contestUI.update();eventCamera.restore();explorer.update(dt);eventCamera.apply();restAreaView.update(viewFocus());
  if(now>=nextRefreshReminder&&!nearSafety&&!entry.active&&!explorer.state.emoInteraction&&!explorer.state.repairInteraction&&!playActions.busy&&!directory.isOpen&&!$('zone-toast').classList.contains('visible')&&$('help').classList.contains('hidden')){
    toast('가끔 새로고침해 최신 업데이트를 받아보세요. 이름과 기록은 이어져요.',4500);nextRefreshReminder=now+15*60*1000;
  }
  if(connectionConfig){remotePeople.update(dt,camera,mode==='overview'||eventCamera.active);explorer.state.carrying=Boolean(playActions.store.carried);multiplayer.update();}
  else if (!entry.active) {
    residents.update(dt, camera, mode === 'overview');
    const p={...explorer.state.position,role:safetyState.role,penalty:safetyState.penalty,safeUntil:safetyGrace,
      phase:explorer.state.repairInteraction?.phase==='repair'?'repair':playActions.state.phase};
    safetyPatrols.update(dt,[p,...residents.people],elapsed);
    if(safetyPatrols.people.some(g=>canCatch(g,p,elapsed))){if(playActions.store.carried)playActions.throwFoup(true);updateSafetyState({...safetyState,penalty:3});}
    for(const g of safetyPatrols.people)for(const actor of residents.people)if(canCatch(g,actor,elapsed))residents.beginSafetyLap(actor);
    safetyPeople.synchronize(safetyPatrols.people);safetyPeople.update(dt,camera,mode==='overview');
  }
  playActions.render(dt,camera);stockerView.update(playActions.store);appearance.update(avatar.root.visible); visitorBadge.update(avatar, explorer.state.posture,{headwear:appearance.headwear});
  visitorEmote.update(avatar,explorer.state.posture,dt,!entry.active,{camera,anchor:visitorBadge.sprite.position,title:Boolean(visitorBadge.titleId)});
  if(now>=nextSafetyCheck){
    const person={...explorer.state.position,id:multiplayer?.id??'self',...safetyState,hidden:entry.active||nicknameUI.isOpen||mode==='overview',phase:explorer.state.repairInteraction?.phase==='repair'?'repair':playActions.state.phase};
    const warning=safetyProximity(person,remotePeople?.safetyActors??safetyPatrols?.people??[],nearSafety);
    nearSafety=warning.near;nextSafetyCheck=now+200;
    $('safety-proximity').classList.toggle('hidden',!nearSafety);$('safety-warning').classList.toggle('hidden',!nearSafety);
    $('safety-proximity').style.setProperty('--danger-strength',warning.strength.toFixed(2));
  }
  if(wardrobeNotice.tick(dt,{wallet:currentWallet,active:Boolean(multiplayer?.connected&&currentWallet&&!entry.active),eligible:!nearSafety&&!safetyState.penalty&&!explorer.state.locked&&!explorer.state.emoInteraction&&!explorer.state.repairInteraction&&!playActions.busy&&!directory.isOpen&&!wardrobe.isOpen&&!viewControls.isOpen&&$('help').classList.contains('hidden')&&$('tool-card').classList.contains('hidden')&&!$('zone-toast').classList.contains('visible')&&now-lastToastAt>12000})){
    toast(WARDROBE_NOTICE+' · 메뉴 → 꾸미기 · 내 옷장',WARDROBE_NOTICE_DURATION);
  }
  const walked = lastStepPosition.distanceTo(explorer.state.position);
  if (mode === 'walk' || mode === 'tour') { if (walked < 1) stepDistance += walked; if (stepDistance > .86) { motionCue('step'); stepDistance = 0; } }
  lastStepPosition.copy(explorer.state.position);
  if (previousPosture !== explorer.state.posture) { previousPosture = explorer.state.posture; motionCue(previousPosture); }
  const repair = explorer.state.repairInteraction;
  const hammer = repair?.phase === 'repair' ? Math.floor(repair.progress * 5 * 15 / (Math.PI * 2)) : -1;
  if (hammer !== lastHammer) { lastHammer = hammer; if (hammer >= 0) motionCue('repair'); }
  const press = explorer.state.emoInteraction;
  emoControls.setPress(press?.id, press?.phase === 'hold' ? Math.min(1, press.holdProgress * 6) : 0);
  const nextEmoPhase = press ? `${press.id}:${press.phase}` : '';
  if (nextEmoPhase !== emoPhase) {
    emoPhase = nextEmoPhase; updateEmoCard();
    if (press?.phase === 'hold') {
      if(onlineLink)onlineLink.command('press',{id:press.id});else audio.playEmoPress();
      toast(`${equipmentById.get(press.id)?.code ?? 'EMO'} · 꾹 누르는 중`);
    }
  }
  emoControls.update({ mode, locked: entry.active || directory.isOpen || !$('help').classList.contains('hidden') });
  destruction.update(dt);
  if (burstShake > 0) {
    burstShake = Math.max(0, burstShake - dt);
    if(!eventCamera.active&&!['passenger','ride','transfer'].includes(mode)) {
      camera.position.x += Math.sin(elapsed * 83) * burstShake * .07;
      camera.position.y += Math.cos(elapsed * 71) * burstShake * .05;
    }
  }
  audio.update({ jet: entry.active ? entry.state.jet : 0, hidden: false });
  if (now >= nextMapAt) { if (viewControls.mapVisible) drawMap(); updateZone(); nextMapAt = now + 125; }
  sceneDepth.update(mode === 'overview'||eventCamera.active);
  camera.updateMatrixWorld();
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); viewFrustum.setFromProjectionMatrix(viewProjection);
  for (const batch of spatialBatches) batch.update(viewFrustum, camera.position);
  scene.updateMatrixWorld();
  for (const batch of movingBatches.values()) { batch.sources.forEach((source, i) => batch.instance.setMatrixAt(i, source.matrixWorld)); batch.instance.instanceMatrix.needsUpdate = true; }
  renderer.render(scene, camera);
  if(captureFrame){const draw=captureFrame;captureFrame=null;draw(renderer.domElement);}
  visitorBadge.updateScreen(camera);
  speechBubble.update(camera);
  destructionRewards.update({cameraBusy:mode==='blast'||mode==='overview'||!avatar.root.visible,collapseState:destruction.collapseState});
  chipRewards.update(now,camera,visitorBadge.sprite.position,avatar.root.visible&&!entry.active&&mode!=='overview'&&!eventCamera.active);
  frameCount++;
  if (now - fpsStart > 1500) { displayedFPS = Math.round(frameCount * 1000 / (now - fpsStart)); frameCount = 0; fpsStart = now; }
  // Read-only diagnostics for local acceptance checks.
  if (now >= nextDiagnosticAt) {
    nextDiagnosticAt = now + 500;
    const demo = observedVehicle();
    updateSoundButton();
    $('world').dataset.diagnostics = JSON.stringify({ ready: true, revision: 'fab-reward-after-blast-nameplate-1', movementStyle, joystickActive: explorer.state.joystickActive, cameraFov: camera.fov, safety: safetyState, safetyPatrols: safetyPeople?.state.people, mode, audio: audio.state, multiplayer: multiplayer ? {status:multiplayer.status,id:multiplayer.id,count:realVisitorCount,total:totalCharacterCount,capacity:ROOM_CAPACITY,visitorCapacity:MAX_VISITORS} : null, residents: residents?.state ?? {total:AUTOMATED_COUNT,simulated:true,actions:sharedWorld.totals,people:remotePeople.state.people.filter(p=>p.id.startsWith('resident:')||p.id.startsWith('safety:'))}, remotePlayers:remotePeople?.state.people.filter(p=>!p.id.startsWith('resident:')&&!p.id.startsWith('safety:')), destruction: destruction.state, equipmentVisibility: equipmentVisibility.state, emoInteraction: explorer.state.emoInteraction, repairInteraction: explorer.state.repairInteraction, posture: explorer.state.posture, play: playActions.state, actionTargets: new URLSearchParams(location.search).has('qa') ? playActions.targets(camera, { width: innerWidth, height: innerHeight }) : undefined, visitorName: visitorBadge.name, controlsOpen: viewControls.isOpen, mapVisible: viewControls.mapVisible, emoButtons: layoutMachines.length, amberBays: bayLighting.bayIds.map(id => id + 1), amberLights: bayLighting.lights.length, amberLightsVisible: bayLighting.root.visible, entry: { active: entry.active, ...entry.state }, width: WIDTH, length: LENGTH, ceiling: HEIGHT,
      equipmentCount: equipment.length, equipmentFamilies: families.length, uniqueEquipmentCodes: new Set(equipment.map(e => e.code)).size, selectedEquipment: selectedEquipment?.code ?? null,
      machines: machinePositions.length, bays: bays.length, toolsPerRow: 10, loadports: layoutMachines.length * 3,
      frontAisle: AISLE, rearAisle: SERVICE_AISLE, sideGap: SIDE_GAP, vehicles: vehicles.length, junctions: network.junctions.length,
      networkNodes: network.nodes.length, networkEdges: network.edges.length, traffic: fleet.stats, instances: staticInstances, fps: displayedFPS,
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, renderPixelRatio, frameMedianMs: frameMedian, frameP95Ms: frameP95, visibleInstances: spatialBatches.reduce((n, b) => n + (b.mesh.parent.visible ? b.visibleCount : 0), 0), mirrorPass: false, position: { x: explorer.state.position.x, y: explorer.state.position.y, z: explorer.state.position.z },
      camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, character: { visible: avatar.root.visible, height: avatar.height, speed: explorer.state.speed, heading: explorer.state.heading,
        pressReachable: avatar.root.userData.pressReachable, pressHand: avatar.root.userData.pressHandWorld },
      walkPathPoints: explorer.state.path.length, cameraDistance: explorer.state.distance, cameraYaw: explorer.state.yaw,
      roofVisible: roof.visible, parkedFoups: vehicles.filter(v => v.state.parked).length, transfer: demo.state, transferVehicleId: explorer.state.transferVehicleId, transferTarget: explorer.state.transferTarget, transferWaiting: explorer.state.transferWaiting, transferInTransit: explorer.state.transferInTransit, transferLabel: explorer.state.transferLabel, followId: explorer.state.followId, tourTime: explorer.state.tourTime });
    $('transfer-status').textContent = mode === 'transfer' ? (explorer.state.transferLabel || demo.state.label) : demo.state.label;

  }
  if(!firstFrameDrawn){firstFrameDrawn=true;renderer.debug.onShaderError=null;startupStage('ready');}
}
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
// All declarations are ready before yielding: socket callbacks can now safely
// restore the existing player while the first frame is being prepared.
startEntry();
await startupStep('render');
requestAnimationFrame(animate);
