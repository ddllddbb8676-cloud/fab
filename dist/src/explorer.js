import { TOUR_POINTS, HALL, TOOL_WIDTH, bays, isBlocked } from './layout.js?v=e86319ae060b';
import { findWalkPath, stepWalker, resolveWalkTap } from './walking.js?v=e86319ae060b';
import { createTourRoute } from './tour-route.js?v=e86319ae060b';
import { createTransferSession, updateTransferSession, transferCameraFrame, transferTransitFrame } from './transfer-view.js?v=e86319ae060b';
import { getRuntimeObstacles } from './runtime-obstacles.js?v=e86319ae060b';
import { planEmoApproach, emoPressCameraFrame, EMO_REACH_SECONDS, EMO_HOLD_SECONDS, EMO_CONTACT_TOLERANCE } from './emo-interaction.js?v=e86319ae060b';
import { findRestHeading } from './posture.js?v=e86319ae060b';
import {isRestArea,REST_AREA_MESSAGE} from './rest-area.js?v=e86319ae060b';
import { WALK_SPEED, CHASE_CAMERA, stickVector, cameraRelativeMove } from './locomotion.js?v=e86319ae060b';

export const REPAIR_SECONDS = 5;

const damp = (value, wanted, rate, dt) => wanted + (value - wanted) * Math.exp(-rate * Math.max(0, dt));
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
// Integrate the whole eased velocity over the frame, rather than multiplying
// its final value by dt. Tap routes accelerate equally at 30/120 Hz.
function easeVelocity(value, wanted, rate, dt) {
  const decay = Math.exp(-rate * dt);
  return { value: wanted + (value - wanted) * decay,
    travel: wanted * dt + (value - wanted) * (1 - decay) / rate };
}

export function destructionCameraFrame(machine, aspect = 1, baseFov = 64) {
  const sign = machine.sign, setback = aspect < 1 ? 7.9 : 6.4;
  const position = { x: machine.x + .7 * sign, y: 2.6, z: machine.z + sign * setback };
  const target = { x: machine.x, y: 1.6, z: machine.z + sign * .5 }, landmarks = [];
  // Fit the complete cabinet, the projecting loadports and a plume below the 5 m ceiling.
  for (const x of [-TOOL_WIDTH / 2, TOOL_WIDTH / 2]) for (const z of [-2.4, 2.4]) for (const y of [0, 3.4]) {
    landmarks.push({ x: machine.x + x, y, z: machine.z + z });
  }
  for (const x of [-TOOL_WIDTH * .4, TOOL_WIDTH * .4]) for (const y of [.1, 1.6]) landmarks.push({ x: machine.x + x, y, z: machine.z + sign * 3.275 });
  for (const x of [-2.7, 2.7]) for (const z of [-1.5, 1.5]) landmarks.push({ x: machine.x + x, y: 4.85, z: machine.z + z });
  const dx = target.x - position.x, dy = target.y - position.y, dz = target.z - position.z;
  const length = Math.hypot(dx, dy, dz), horizontal = Math.hypot(dx, dz), forward = { x: dx / length, y: dy / length, z: dz / length };
  const right = { x: -dz / horizontal, z: dx / horizontal };
  const up = { x: -right.z * forward.y, y: right.z * forward.x - right.x * forward.z, z: right.x * forward.y };
  let tangent = Math.tan(Math.max(baseFov, aspect < 1 ? 82 : 64) * Math.PI / 360);
  for (const point of landmarks) {
    const x = point.x - position.x, y = point.y - position.y, z = point.z - position.z;
    const depth = x * forward.x + y * forward.y + z * forward.z;
    tangent = Math.max(tangent, Math.abs(x * right.x + z * right.z) / depth / Math.max(.1, aspect) / .9,
      Math.abs(x * up.x + y * up.y + z * up.z) / depth / .76);
  }
  return { position, target, landmarks, fov: Math.atan(tangent) * 360 / Math.PI };
}

export function createExplorer({ THREE, camera, scene, canvas, avatar, orbit, colliders, vehicles, onMode, onInspect, onToast, onManualMove = () => {}, onActionTap = () => false, pickRepairTarget = () => null, isEquipmentVisible = () => true, canTraverse = () => true }) {
  const $ = id => document.getElementById(id);
  const state = { mode: 'walk', position: new THREE.Vector3(TOUR_POINTS[0][0], 0, TOUR_POINTS[0][1]),
    yaw: Math.PI / 2, elevation: CHASE_CAMERA.elevation, distance: CHASE_CAMERA.distance, heading: -Math.PI / 2, speed: 0,
    path: [], tourTime: 0, followId: 0, rideYaw: 0, manualLook: false, locked: false,
    transferVehicleId: null, transferTarget: null, transferWaiting: false, transferLabel: '', transferInTransit: false, emoInteraction: null, repairInteraction: null, posture: 'stand', joystickActive: false, joystick: { x: 0, y: 0 } };
  const pointers = new Map();
  let dragged = 0, gestureDragged = false, pinchDistance = 0, pinched = false, cameraSnap = true;
  let tourRoute = null, transferSession = null, transferBaseFov = camera.fov, blastSession = null, blastBaseFov = camera.fov;
  let emoSession = null;
  let scriptedPose = null;
  const scriptedAnchor = new THREE.Vector3();
  let scriptedCameraActive = false, scriptedYaw = 0;
  const tapColliders=colliders.flatMap(c=>(c.cameraBounds??[c]).map(b=>({machineId:c.equipment?.id,box:new THREE.Box3(new THREE.Vector3(b.minX,b.minY??0,b.minZ),new THREE.Vector3(b.maxX,b.maxY??3.4,b.maxZ))})));
  const cameraColliderBoxes = colliders.flatMap(c => c.cameraBounds ?? [c]).map(c => new THREE.Box3(new THREE.Vector3(c.minX - .12, c.minY ?? 0, c.minZ - .12), new THREE.Vector3(c.maxX + .12, c.maxY ?? 3.4, c.maxZ + .12)));
  const cast = new THREE.Raycaster(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const cameraRay = new THREE.Ray(), cameraHit = new THREE.Vector3();
  const target = new THREE.Vector3(), desired = new THREE.Vector3(), direction = new THREE.Vector3();
  const cameraFocus = new THREE.Vector3(), previousFocus = new THREE.Vector3();
  const cameraRig = { yaw: state.yaw, elevation: state.elevation, distance: state.distance, clearance: state.distance };
  let pathSpeed = 0, tourBlend = 0, runtimeSnapshot = null, runtimeCameraBoxes = [];
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(.21, .29, 36), new THREE.MeshBasicMaterial({ color: '#3d9fa7', transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
  targetRing.rotation.x = -Math.PI / 2; targetRing.position.y = .012; targetRing.visible = false; scene.add(targetRing);
  let stickSpeed = 0;
  function endJoystick() { state.joystickActive = false; state.joystick = { x: 0, y: 0 }; stickSpeed = 0; state.speed = 0; }
  function clearInput() { pointers.clear(); endJoystick(); state.speed = 0; pathSpeed = 0; }
  function beginJoystick() {
    if (state.locked || document.hidden || !$('help').classList.contains('hidden') || scriptedPose || !['walk', 'tour', 'blast'].includes(state.mode)) return false;
    cancelEmo('movement'); onManualMove();
    if (state.mode !== 'walk') setMode('walk');
    state.path = []; pathSpeed = 0; targetRing.visible = false; state.posture = 'stand';
    $('tool-card').classList.add('hidden');
    for (const pointer of pointers.values()) pointer.suppressTap = true;
    state.manualLook = true; state.joystickActive = true;
    return true;
  }
  function cancelEmo(reason = 'cancelled') {
    if (!emoSession) return false;
    const previous = emoSession; emoSession = null; state.emoInteraction = state.repairInteraction = null;
    state.path = []; targetRing.visible = false;
    state.speed = 0; pathSpeed = 0;
    camera.fov = previous.baseFov; camera.updateProjectionMatrix();
    if (previous.phase !== 'approach') cameraSnap = true;
    previous.onCancel?.(reason, previous.plan.machine);
    return true;
  }
  function syncEmoState() {
    if (!emoSession) { state.emoInteraction = state.repairInteraction = null; return; }
    const s = emoSession;
    if (s.kind === 'repair') {
      state.emoInteraction = null;
      state.repairInteraction = { id: s.plan.id, phase: s.phase, progress: s.phase === 'repair' ? Math.min(1, s.elapsed / REPAIR_SECONDS) : 0 };
      return;
    }
    state.repairInteraction = null;
    state.emoInteraction = { id: s.plan.id, phase: s.phase, pressProgress: s.progress,
      holdProgress: Math.min(1, s.held / EMO_HOLD_SECONDS), button: s.plan.button, destination: s.plan.destination };
  }
  function approachEmo(machine, { onPress, onCancel, isValid = () => true, kind = 'emo', onStart, onProgress } = {}) {
    if (state.locked || typeof onPress !== 'function') return false;
    if (emoSession && emoSession.plan.id === machine?.id && emoSession.kind === kind) return true;
    cancelEmo('replaced');
    if (!isValid()) return false;
    const plan = planEmoApproach(machine, state.position,{canTraverse});
    if (!plan) { onToast('버튼 앞까지 걸어갈 수 있는 통로가 없어요'); return false; }
    setMode('walk');
    emoSession = { plan, kind, onPress, onCancel, onStart, onProgress, isValid, phase: 'approach', elapsed: 0, held: 0, progress: 0, stalled: 0, baseFov: camera.fov };
    state.path = plan.path; targetRing.position.set(plan.destination.x, .012, plan.destination.z); targetRing.visible = true;
    syncEmoState(); onToast(kind === 'repair' ? '장비 앞으로 걸어가 한 대씩 수리합니다' : '장비 앞으로 걸어가 버튼을 길게 누릅니다'); return true;
  }
  function updateEmo(dt) {
    const s = emoSession;
    if (!s) return;
    if (!s.isValid()) { cancelEmo('unavailable'); return; }
    const distance = Math.hypot(state.position.x - s.plan.destination.x, state.position.z - s.plan.destination.z);
    if (s.phase === 'approach') {
      s.stalled = distance > .02 && state.speed < .02 && !avatar.root.userData.resting ? s.stalled + dt : 0;
      if (s.stalled > 1.5 || (!state.path.length && distance > .02)) { cancelEmo('path-blocked'); onToast('통로가 막혀 버튼 누르기를 멈췄어요'); return; }
      if (distance <= .015 && !state.path.length) {
        s.phase = 'align'; s.elapsed = 0; clearInput(); targetRing.visible = false;
        state.heading = s.plan.heading;
      }
    } else {
      if (distance > .035) { cancelEmo('moved-away'); return; }
      state.heading = s.plan.heading; state.speed = 0;
      const actionDt = Math.min(Math.max(dt, 0), .05);
      s.elapsed += actionDt;
      const facing = avatar.root.userData.heading ?? avatar.body?.rotation.y ?? avatar.root.rotation.y;
      if (s.phase === 'align' && s.elapsed >= .24 && Math.abs(angleDelta(facing, s.plan.heading)) < .055) {
        s.phase = s.kind === 'repair' ? 'repair' : 'reach'; s.elapsed = 0;
        if (s.kind === 'repair') s.onStart?.(s.plan.machine);
      }
      if (s.phase === 'reach') {
        const p = Math.min(1, s.elapsed / EMO_REACH_SECONDS); s.progress = p * p * (3 - 2 * p);
        if (p >= 1) { s.phase = 'hold'; s.elapsed = 0; }
      }
      if (s.phase === 'repair') {
        s.onProgress?.(Math.min(1, s.elapsed / REPAIR_SECONDS), s.plan.machine);
        if (s.elapsed + 1e-8 >= REPAIR_SECONDS) {
          emoSession = null; state.emoInteraction = state.repairInteraction = null; clearInput();
          camera.fov = s.baseFov; camera.updateProjectionMatrix(); cameraSnap = true;
          s.onPress(s.plan.machine); return;
        }
      }
    }
    syncEmoState();
  }
  function finishEmoContact(dt) {
    const s = emoSession;
    if (!s || s.kind !== 'emo' || s.phase !== 'hold') return;
    const hand = avatar.root.userData.pressHandWorld, button = s.plan.button;
    const touching = avatar.root.userData.pressReachable === true && hand &&
      Math.hypot(hand.x - button.x, hand.y - button.y, hand.z - button.z) <= EMO_CONTACT_TOLERANCE;
    s.held = touching ? s.held + Math.min(Math.max(dt, 0), .05) : 0;
    if (!touching && s.elapsed > 1.5) { cancelEmo('out-of-reach'); return; }
    syncEmoState();
    if (s.held + 1e-8 < EMO_HOLD_SECONDS) return;
    // Clear before calling into the app: the resulting blast mode cannot fire a
    // cancellation callback, nor can a second tap reuse a completed press.
    emoSession = null; state.emoInteraction = null; state.path = []; clearInput();
    camera.fov = s.baseFov; camera.updateProjectionMatrix(); cameraSnap = true;
    s.onPress(s.plan.machine);
  }
  function setMode(next) {
    if (state.locked) return;
    if (state.penalty && !['walk', 'overview'].includes(next)) { onToast(`장비를 ${state.penalty}대 더 수리해 주세요`); return; }
    cancelEmo('mode-change');
    state.posture = 'stand';
    if (next === 'tour' && state.mode === 'tour') return;
    if (next === 'tour' && (!tourRoute || Math.hypot(tourRoute.position.x - state.position.x, tourRoute.position.z - state.position.z) > .01)) {
      tourRoute = createTourRoute(state.position);
      if (!tourRoute) { onToast('현재 위치에서 산책 통로에 연결할 수 없어요. 통로로 이동해 주세요.'); return; }
    }
    if (state.mode === 'transfer' && next !== 'transfer') { camera.fov = transferBaseFov; camera.updateProjectionMatrix(); }
    if (state.mode === 'blast' && next !== 'blast') { camera.fov = blastBaseFov; camera.updateProjectionMatrix(); blastSession = null; }
    if (next === 'transfer' && state.mode !== 'transfer') transferBaseFov = camera.fov;
    if (next === 'blast' && state.mode !== 'blast') blastBaseFov = camera.fov;
    const walkingView = mode => mode === 'walk' || mode === 'tour';
    // Walking and automatic walking share the same camera rig. Preserve its
    // current pose rather than cutting back to an uneased orbit on each toggle.
    if (!walkingView(state.mode) || !walkingView(next)) cameraSnap = true;
    if (next === 'tour') tourBlend = 0;
    state.mode = next; clearInput(); state.path = []; targetRing.visible = false; state.manualLook = false;
    avatar.root.visible = next !== 'transfer' && next !== 'blast';
    orbit.enabled = next === 'overview';
    if (next === 'overview') {
      orbit.target.set(0, 0, 0);
      const halfFov = Math.atan(Math.tan(camera.fov * Math.PI / 360) * Math.min(camera.aspect, 1));
      const fitDistance = Math.max(220, 115 / Math.sin(halfFov) * 1.08);
      camera.position.set(.46, .82, .6).normalize().multiplyScalar(fitDistance); camera.lookAt(orbit.target); orbit.update();
    }
    if (next === 'ride') state.rideYaw = 0;
    onMode(next);
  }
  function reset() {
    tourRoute = null;
    state.position.set(TOUR_POINTS[0][0], 0, TOUR_POINTS[0][1]); state.yaw = Math.PI / 2; state.heading = -Math.PI / 2;
    state.distance = CHASE_CAMERA.distance; state.elevation = CHASE_CAMERA.elevation; cameraSnap = true; setMode('walk');
    onToast('왼쪽 조이스틱으로 이동 · 화면 드래그로 둘러보기');
  }
  function followCamera(focus, yaw, distance, elevation, dt, obstacles = true) {
    const snap = cameraSnap || previousFocus.distanceToSquared(focus) > 64;
    if (snap) {
      cameraRig.yaw = yaw; cameraRig.elevation = elevation; cameraRig.distance = distance;
      cameraFocus.copy(focus); previousFocus.copy(focus);
    } else {
      cameraRig.yaw += angleDelta(cameraRig.yaw, yaw) * (1 - Math.exp(-dt * 16));
      cameraRig.elevation = damp(cameraRig.elevation, elevation, 16, dt);
      cameraRig.distance = damp(cameraRig.distance, distance, 12, dt);
      // Exact damping for a target moving linearly during this frame. This
      // avoids the frame-rate-dependent trailing distance of position.lerp.
      const decay = Math.exp(-dt * 14);
      for (const axis of ['x', 'y', 'z']) {
        const perSecond = dt > 0 ? (focus[axis] - previousFocus[axis]) / dt : 0;
        cameraFocus[axis] = focus[axis] - perSecond / 14 + (cameraFocus[axis] - previousFocus[axis] + perSecond / 14) * decay;
      }
      previousFocus.copy(focus);
    }
    desired.set(cameraFocus.x + Math.sin(cameraRig.yaw) * Math.cos(cameraRig.elevation) * cameraRig.distance,
      Math.min(HALL.height - .28, cameraFocus.y + Math.sin(cameraRig.elevation) * cameraRig.distance),
      cameraFocus.z + Math.cos(cameraRig.yaw) * Math.cos(cameraRig.elevation) * cameraRig.distance);
    desired.x = THREE.MathUtils.clamp(desired.x, -59.3, 59.3);
    desired.z = THREE.MathUtils.clamp(desired.z, -89.3, 89.3);
    direction.copy(desired).sub(focus);
    let clearDistance = direction.length();
    if (clearDistance < .0001) { camera.position.copy(desired); cameraSnap = false; return; }
    direction.multiplyScalar(1 / clearDistance);
    if (obstacles) {
      const snapshot = getRuntimeObstacles();
      if (snapshot !== runtimeSnapshot) {
        runtimeSnapshot = snapshot;
        runtimeCameraBoxes = snapshot.map(o => new THREE.Box3(new THREE.Vector3(o.minX - .12, o.minY ?? 0, o.minZ - .12), new THREE.Vector3(o.maxX + .12, o.maxY ?? HALL.height, o.maxZ + .12)));
      }
      cameraRay.set(focus, direction);
      const minX = Math.min(focus.x, desired.x), maxX = Math.max(focus.x, desired.x);
      const minZ = Math.min(focus.z, desired.z), maxZ = Math.max(focus.z, desired.z);
      for (const boxes of [cameraColliderBoxes, runtimeCameraBoxes]) for (const box of boxes) {
        if (box.max.x < minX || box.min.x > maxX || box.max.z < minZ || box.min.z > maxZ) continue;
        const p = cameraRay.intersectBox(box, cameraHit);
        if (p) clearDistance = Math.min(clearDistance, Math.max(.08, focus.distanceTo(p) - .15));
      }
    }
    // Collision shortening never feeds back into the ideal orbit. Move inward
    // immediately for safety, then ease outward when a cabinet/door clears.
    cameraRig.clearance = snap ? clearDistance : Math.min(clearDistance, damp(cameraRig.clearance, clearDistance, 3.2, dt));
    camera.position.copy(focus).addScaledVector(direction, cameraRig.clearance);
    cameraSnap = false;
    camera.lookAt(focus);
  }
  function walk(dt) {
    if (state.joystickActive) {
      const strength = Math.hypot(state.joystick.x, state.joystick.y);
      if (strength < 1e-6) { stickSpeed = 0; state.speed = 0; return; }
      const yaw = Math.atan2(camera.position.x - cameraFocus.x, camera.position.z - cameraFocus.z);
      const move = cameraRelativeMove(state.joystick.x / strength, state.joystick.y / strength, yaw);
      const eased = easeVelocity(stickSpeed, WALK_SPEED * strength, 24, dt); stickSpeed = eased.value;
      const next = stepWalker(state.position, move.x * eased.travel, move.z * eased.travel, { canTraverse });
      const dx = next.x - state.position.x, dz = next.z - state.position.z;
      state.speed = Math.hypot(dx, dz) / Math.max(dt, .001);
      if (state.speed > .02) state.heading = Math.atan2(dx, dz);
      state.position.set(next.x, 0, next.z);
      return;
    }
    if (!state.path.length) { pathSpeed = 0; state.speed = 0; return; }
    const speed = WALK_SPEED;
    let next = { x: state.position.x, z: state.position.z };
    while (state.path.length && Math.hypot(state.path[0].x - state.position.x, state.path[0].z - state.position.z) < 1e-6) state.path.shift();
    const remaining = state.path.reduce((length, p, i) => {
      const a = i ? state.path[i - 1] : state.position;
      return length + Math.hypot(p.x - a.x, p.z - a.z);
    }, 0);
    const eased = easeVelocity(pathSpeed, Math.min(speed, Math.sqrt(remaining * (emoSession?4.8:18))), 12, dt);
    pathSpeed = eased.value;
    let budget = eased.travel;
    // Consume a corner and the remainder of this frame together. Previously
    // each waypoint inserted a complete zero-motion frame, visible as a hitch.
    while (budget > 1e-8 && state.path.length) {
      const p = state.path[0], distance = Math.hypot(p.x - next.x, p.z - next.z);
      if (distance < 1e-6) { state.path.shift(); continue; }
      const amount = Math.min(distance, budget), sx = (p.x - next.x) / distance * amount, sz = (p.z - next.z) / distance * amount;
      const moved = stepWalker(next, sx, sz), travelled = Math.hypot(moved.x - next.x, moved.z - next.z);
      if(!canTraverse(next,moved)){state.path=[];pathSpeed=0;onToast(REST_AREA_MESSAGE);break;}
      next = moved; budget -= amount;
      if (Math.hypot(p.x - next.x, p.z - next.z) < 1e-6) state.path.shift();
      if (travelled < amount * .5) { pathSpeed = 0; break; }
    }
    if (!state.path.length) { targetRing.visible = false; pathSpeed = 0; }
    const movedX = next.x - state.position.x, movedZ = next.z - state.position.z;
    state.speed = Math.hypot(movedX, movedZ) / Math.max(dt, .001);
    if (state.speed > .02) state.heading = Math.atan2(movedX, movedZ);
    if (state.path.length && state.speed > .02 && !state.manualLook) {
      const wanted = state.heading + Math.PI;
      state.yaw += Math.atan2(Math.sin(wanted - state.yaw), Math.cos(wanted - state.yaw)) * (1 - Math.exp(-dt * 3));
    }
    state.position.set(next.x, 0, next.z);
  }
  function tour(dt) {
    if (!tourRoute) return;
    state.tourTime += dt;
    const eased = easeVelocity(tourBlend, 1, 10, dt); tourBlend = eased.value;
    const next = tourRoute.advance(eased.travel);
    if(!canTraverse(state.position,next)){setMode('walk');state.path=[];state.speed=0;onToast(REST_AREA_MESSAGE);return;}
    state.speed = dt > 0 ? next.speed * eased.travel / dt : 0;
    if (next.heading !== null && state.speed > .01) {
      state.heading = next.heading;
      if (!state.manualLook) { const wanted = state.heading + Math.PI; state.yaw += Math.atan2(Math.sin(wanted - state.yaw), Math.cos(wanted - state.yaw)) * (1 - Math.exp(-dt * 2)); }
    }
    state.position.set(next.x, 0, next.z);
  }
  function update(dt) {
    if (scriptedPose) {
      const p = scriptedPose;
      state.position.set(p.x, p.y, p.z); state.heading = p.heading; state.speed = 0;
      avatar.root.position.copy(state.position); avatar.root.visible = true;
      avatar.update(dt, { heading: p.heading, speed: p.speed ?? 0, hanging: p.hanging ?? false, carrying: p.carrying ?? false, crouch: p.crouch ?? 0 });
      const yaw = p.cameraYaw ?? p.heading + Math.PI + state.rideYaw;
      // Carry the camera with its rider before easing only the relative orbit.
      // Otherwise the position lags while lookAt follows every network update.
      if(scriptedCameraActive)camera.position.add(state.position).sub(scriptedAnchor);
      else {scriptedCameraActive=true;scriptedYaw=Math.atan2(camera.position.x-p.x,camera.position.z-p.z);}
      scriptedAnchor.copy(state.position);
      scriptedYaw+=angleDelta(scriptedYaw,yaw)*(1-Math.exp(-dt*3.5));
      const distance = p.cameraDistance ?? 3.2;
      const wanted = new THREE.Vector3(p.x + Math.sin(scriptedYaw) * distance, p.cameraY ?? 4.55, p.z + Math.cos(scriptedYaw) * distance);
      camera.position.lerp(wanted, 1 - Math.exp(-dt * 8));
      camera.lookAt(p.x, p.y + (p.hanging ? .7 : .8), p.z);
      return;
    }
    const helpVisible = !$('help').classList.contains('hidden');
    if (state.joystickActive && (state.locked || helpVisible || document.hidden)) endJoystick();
    if (emoSession && (state.locked || helpVisible || document.hidden)) cancelEmo(state.locked ? 'locked' : helpVisible ? 'help' : 'hidden');
    if (!state.locked) state.speed = 0;
    if (!state.locked && !helpVisible) {
      if (state.mode === 'walk' && !Number.isFinite(state.cleaningTime) && state.posture === 'stand' && !avatar.root.userData.resting && (!emoSession || emoSession.phase === 'approach')) walk(dt);
      if (state.mode === 'tour' && !pointers.size) tour(dt);
    }
    updateEmo(dt);
    const repairing = emoSession?.phase === 'repair';
    const repairTarget = repairing ? { ...emoSession.plan.button, y: .96 + .16 * Math.sin(emoSession.elapsed * 15), z: emoSession.plan.button.z + emoSession.plan.button.sign * .09 } : null;
    avatar.root.position.copy(state.position); avatar.update(dt, { speed: state.speed, heading: state.heading, posture: state.posture,
      turnRate: state.joystickActive ? 22 : 12, repairTime: repairing ? emoSession.elapsed : null, cleanTime:state.cleaningTime??null, carrying: Boolean(state.carrying),
      pressTarget: repairTarget ?? (emoSession && emoSession.kind === 'emo' && emoSession.phase !== 'approach' ? emoSession.plan.button : null), pressProgress: repairing ? 1 : emoSession?.progress ?? 0 });
    finishEmoContact(dt);
    if (state.mode === 'blast' && blastSession) {
      blastSession.elapsed += dt;
      if (blastSession.elapsed < 4.8) { applyBlastCamera(); return; }
      setMode('walk');
    }
    if (state.mode === 'overview') { orbit.update(); return; }
    if (emoSession && emoSession.phase !== 'approach') {
      const frame = emoSession.kind === 'repair'
        ? destructionCameraFrame(emoSession.plan.machine, camera.aspect, emoSession.baseFov)
        : emoPressCameraFrame(emoSession.plan, camera.aspect, emoSession.baseFov);
      if (camera.fov !== frame.fov) { camera.fov = frame.fov; camera.updateProjectionMatrix(); }
      camera.position.set(frame.position.x, frame.position.y, frame.position.z); camera.lookAt(frame.target.x, frame.target.y, frame.target.z);
      cameraSnap = false; return;
    }
    if (state.mode === 'transfer' && transferSession) {
      updateTransferSession(transferSession, vehicles);
      state.transferVehicleId = transferSession.vehicleId; state.transferTarget = transferSession.port;
      state.transferWaiting = transferSession.waiting; state.transferLabel = transferSession.label; state.transferInTransit = transferSession.inTransit;
      const frame = transferSession.inTransit
        ? transferTransitFrame(vehicles[transferSession.vehicleId].state.car, camera.aspect, transferBaseFov)
        : transferCameraFrame(transferSession.port, camera.aspect, transferBaseFov);
      if (camera.fov !== frame.fov) { camera.fov = frame.fov; camera.updateProjectionMatrix(); }
      camera.position.set(frame.position.x, frame.position.y, frame.position.z);
      camera.lookAt(frame.target.x, frame.target.y, frame.target.z); cameraSnap = false;
      return;
    }
    if (state.mode === 'ride') {
      const p = vehicles[state.followId].state.car;
      // Keep the tracking camera below the running rail instead of inside it.
      target.set(p.x, 3.65, p.z); followCamera(target, p.yaw + Math.PI + state.rideYaw, 3, -.07, dt, false);
    } else {
      target.copy(state.position); target.y = avatar.root.userData.viewHeight ?? 1.02;
      followCamera(target, state.yaw, state.distance, state.elevation, dt);
    }
  }
  function tap(event) {
    if (state.locked || (state.mode !== 'walk' && state.mode !== 'tour')) return;
    const r = canvas.getBoundingClientRect(); cast.setFromCamera(new THREE.Vector2((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1), camera);
    // The accepted interaction owns its approach path (FOUP/OHT as well as EMO).
    if (onActionTap(cast.ray) === true) return;
    cancelEmo('tap');
    const floorHit = cast.ray.intersectPlane(floor, hit), groundDistance = floorHit ? camera.position.distanceTo(floorHit) : Infinity;
    const repair = pickRepairTarget(cast.ray, { near: camera.near });
    let occluderDistance = Infinity;
    for (const {box,machineId} of tapColliders) {
      if(machineId!==undefined&&!isEquipmentVisible(machineId))continue;
      // A clipped back face behind the camera must not swallow visible floor taps.
      if(box.containsPoint(cast.ray.origin))continue;
      const p = cast.ray.intersectBox(box, cameraHit);
      if(p&&camera.position.distanceTo(p)<camera.near+.02)continue;
      if (p) occluderDistance = Math.min(occluderDistance, camera.position.distanceTo(p));
    }
    if (repair && repair.distance < groundDistance && repair.distance < occluderDistance + .015) {
      const equipment = colliders.find(c => c.equipment?.id === repair.id)?.equipment;
      if (equipment) {
        if (state.mode !== 'walk') setMode('walk');
        state.path = []; pathSpeed = 0; targetRing.visible = false;
        onInspect(equipment); return;
      }
    }
    if (state.floorTapEnabled === false) { $('tool-card').classList.add('hidden'); return; }
    // Only the red EMO area opens equipment actions; broad cabinet boxes never do.
    if (occluderDistance < groundDistance - .02) { onToast('통로 바닥을 누르면 걸어가요'); return; }
    if (!floorHit || Math.abs(floorHit.x) >= 58.8 || Math.abs(floorHit.z) >= 88.5) return;
    if(!canTraverse(floorHit,floorHit)){onToast(REST_AREA_MESSAGE);return;}
    const resolved = resolveWalkTap(state.position,{ x: floorHit.x, z: floorHit.z },{canTraverse});
    if (!resolved) { onToast('장비를 피해 통로 바닥을 눌러주세요'); return; }
    const {destination,route}=resolved;$('tool-card').classList.add('hidden');
    if (state.mode !== 'walk') setMode('walk');
    state.posture = 'stand';
    state.path = route; targetRing.position.set(destination.x, .012, destination.z); targetRing.visible = true;
  }
  canvas.addEventListener('pointerdown', e => {
    if (state.locked || state.mode === 'overview' || state.mode === 'transfer') return;
    if(state.mode==='blast')setMode('walk');
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX:e.clientX, startY:e.clientY, suppressTap: state.joystickActive }); canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) { dragged = 0; gestureDragged = false; pinched = false; }
    if (pointers.size === 2) { const p = [...pointers.values()]; pinchDistance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); pinched = true; }
  });
  canvas.addEventListener('pointermove', e => {
    const old = pointers.get(e.pointerId); if (!old || state.mode === 'overview') return;
    const dx = e.clientX - old.x, dy = e.clientY - old.y; pointers.set(e.pointerId, { ...old, x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      cancelEmo('look-input');
      const p = [...pointers.values()], distance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (distance > 1 && pinchDistance > 1) state.distance = THREE.MathUtils.clamp(state.distance * pinchDistance / distance, 2, 6.8);
      pinchDistance = distance; return;
    }
    dragged = Math.max(dragged, Math.hypot(e.clientX-old.startX,e.clientY-old.startY));
    if (dragged > (e.pointerType==='touch'?10:4)) {
      cancelEmo('look-input');
      gestureDragged = true;
      state.manualLook = true;
      if (state.mode === 'ride' || state.mode === 'passenger') state.rideYaw -= dx * .005;
      else { state.yaw -= dx * .005; state.elevation = THREE.MathUtils.clamp(state.elevation + dy * .004, .08, .72); }
    }
  });
  canvas.addEventListener('pointerup', e => {
    if (!pointers.has(e.pointerId)) return;
    const pointer = pointers.get(e.pointerId); pointers.delete(e.pointerId);
    if (!pointer.suppressTap && !state.joystickActive && !pointers.size && !pinched && !gestureDragged && dragged <= (e.pointerType==='touch'?10:4) && state.mode !== 'ride') tap(e);
  });
  canvas.addEventListener('pointercancel', e => pointers.delete(e.pointerId));
  canvas.addEventListener('wheel', e => {
    if (state.locked || state.mode === 'overview' || state.mode === 'transfer' || state.mode === 'blast') return;
    e.preventDefault(); cancelEmo('look-input');
    const units = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.getBoundingClientRect().height : 1;
    state.distance = THREE.MathUtils.clamp(state.distance + e.deltaY * units * .004, 2, 6.8);
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (state.locked || e.key.toLowerCase() !== 'escape') return;
    cancelEmo('escape'); $('tool-card').classList.add('hidden'); $('help').classList.add('hidden');
    state.path = []; pathSpeed = 0; targetRing.visible = false;
  });
  window.addEventListener('blur', () => { cancelEmo('blur'); clearInput(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelEmo('hidden'); clearInput(); } });
  function focusTransfer() {
    if (state.locked) return;
    transferSession = createTransferSession(vehicles, state.position);
    if (!transferSession) { onToast('반송 차량을 준비 중입니다'); return; }
    updateTransferSession(transferSession, vehicles);
    state.transferVehicleId = transferSession.vehicleId; state.transferTarget = transferSession.port;
    state.transferWaiting = transferSession.waiting; state.transferLabel = transferSession.label; state.transferInTransit = transferSession.inTransit;
    setMode('transfer');
    onToast('OHT ' + String(state.transferVehicleId + 1).padStart(2, '0') + ' · 로드포트와 호이스트를 함께 봅니다');
  }
  function applyBlastCamera() {
    const frame = destructionCameraFrame(blastSession.machine, camera.aspect, blastBaseFov);
    if (camera.fov !== frame.fov) { camera.fov = frame.fov; camera.updateProjectionMatrix(); }
    camera.position.set(frame.position.x, frame.position.y, frame.position.z);
    camera.lookAt(frame.target.x, frame.target.y, frame.target.z); cameraSnap = false;
  }
  function focusDestruction(machine) {
    if (state.locked || !machine || !Number.isFinite(machine.x) || !Number.isFinite(machine.z) || ![1, -1].includes(machine.sign)) return false;
    blastSession = { machine, elapsed: 0 }; setMode('blast'); applyBlastCamera(); return true;
  }
  function setPosture(posture) {
    if (state.penalty && !isRestArea(state.position) && posture !== 'stand') { onToast(`장비를 ${state.penalty}대 더 수리해 주세요`); return false; }
    if (state.locked || !['stand', 'sit', 'lie'].includes(posture) || !['walk', 'tour'].includes(state.mode)) return false;
    const heading = posture === 'stand' ? state.heading : findRestHeading(state.position, state.heading, posture);
    if (heading === null) { onToast('바로 옆 통로에 조금만 여유를 두고 다시 눌러주세요'); return false; }
    cancelEmo('posture');
    if (state.mode !== 'walk') setMode('walk');
    state.path = []; clearInput(); targetRing.visible = false;
    state.heading = heading; state.posture = posture;
    onToast(posture === 'sit' ? '여기 앉아서 잠깐 쉬어요' : posture === 'lie' ? '통로를 따라 편하게 누워요' : '다시 일어났어요'); return true;
  }
  return { state, setMode, reset, update, focusTransfer, focusDestruction, approachEmo, cancelEmo, setPosture, beginJoystick, endJoystick,
    moveJoystick(x, y) { if (state.joystickActive) state.joystick = stickVector(x, y); },
    setScriptedPose(pose) { scriptedPose = pose; if (!pose) { scriptedCameraActive=false;state.position.y = 0; cameraSnap = false; } },
    walkTo(point) {
      if (state.locked) return false;
      const path = findWalkPath(state.position, point,{canTraverse}); if (!path) return false;
      setMode('walk'); state.path = path; targetRing.position.set(point.x, .012, point.z); targetRing.visible = true; return true;
    },
    approachRepair(machine, options = {}) { return approachEmo(machine, { ...options, kind: 'repair', onPress: options.onComplete }); },
    lock(value) { cancelEmo('locked'); if (value && state.mode === 'blast') setMode('walk'); state.locked = value; clearInput(); state.path = []; targetRing.visible = false; },
    focusEquipment(machine) {
      if (state.locked) return;
      setMode('walk'); const bay = bays[machine.bayId];
      state.position.set(machine.x, 0, bay.z);
      state.yaw = machine.sign === 1 ? .15 : Math.PI + .15;
      state.heading = machine.sign === 1 ? Math.PI : 0;
      state.distance = 3.6; state.elevation = .12; cameraSnap = true;
    },
    focusRear() {
      setMode('walk'); const bay = bays[7], previous = bays[6];
      state.position.set(-28.7, 0, (bay.z + previous.z) / 2); state.yaw = Math.PI / 2; state.heading = -Math.PI / 2; state.distance = 4.2; state.elevation = .3; cameraSnap = true;
      onToast('장비 뒤쪽 통로 1.4m · 옆 장비 사이 틈 0.65m');
    },
    nextVehicle() { state.followId = (state.followId + 1) % vehicles.length; cameraSnap = true; onToast('OHT ' + String(state.followId + 1).padStart(2, '0') + '의 경로를 따라갑니다'); } };
}
