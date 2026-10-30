import { TOUR_POINTS, HALL, bays, isBlocked } from './layout.js';
import { findWalkPath, stepWalker } from './walking.js';
import { createTourRoute } from './tour-route.js';
import { createTransferSession, updateTransferSession, transferCameraFrame, transferTransitFrame } from './transfer-view.js';
import { getRuntimeObstacles } from './runtime-obstacles.js';

export function createExplorer({ THREE, camera, scene, canvas, avatar, orbit, colliders, vehicles, onMode, onInspect, onToast }) {
  const $ = id => document.getElementById(id);
  const state = { mode: 'walk', position: new THREE.Vector3(TOUR_POINTS[0][0], 0, TOUR_POINTS[0][1]),
    yaw: Math.PI / 2, elevation: .36, distance: 4.4, heading: -Math.PI / 2, speed: 0,
    path: [], tourTime: 0, followId: 0, rideYaw: 0, manualLook: false, locked: false,
    transferVehicleId: null, transferTarget: null, transferWaiting: false, transferLabel: '', transferInTransit: false };
  const keys = new Set(), moves = new Set(), pointers = new Map();
  let dragged = 0, pinchDistance = 0, pinched = false, cameraSnap = true;
  let tourRoute = null, transferSession = null, transferBaseFov = camera.fov;
  const colliderBoxes = colliders.map(c => new THREE.Box3(new THREE.Vector3(c.minX - .12, c.minY ?? 0, c.minZ - .12), new THREE.Vector3(c.maxX + .12, c.maxY ?? 3.4, c.maxZ + .12)));
  const cast = new THREE.Raycaster(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const cameraRay = new THREE.Ray(), cameraHit = new THREE.Vector3();
  const target = new THREE.Vector3(), desired = new THREE.Vector3(), direction = new THREE.Vector3();
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(.21, .29, 36), new THREE.MeshBasicMaterial({ color: '#3d9fa7', transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
  targetRing.rotation.x = -Math.PI / 2; targetRing.position.y = .012; targetRing.visible = false; scene.add(targetRing);
  function clearInput() { keys.clear(); moves.clear(); pointers.clear(); state.speed = 0; }
  function setMode(next) {
    if (state.locked) return;
    if (next === 'tour' && state.mode === 'tour') return;
    if (next === 'tour' && (!tourRoute || Math.hypot(tourRoute.position.x - state.position.x, tourRoute.position.z - state.position.z) > .01)) {
      tourRoute = createTourRoute(state.position);
      if (!tourRoute) { onToast('현재 위치에서 산책 통로에 연결할 수 없어요. 통로로 이동해 주세요.'); return; }
    }
    if (state.mode === 'transfer' && next !== 'transfer') { camera.fov = transferBaseFov; camera.updateProjectionMatrix(); }
    if (next === 'transfer' && state.mode !== 'transfer') transferBaseFov = camera.fov;
    state.mode = next; clearInput(); state.path = []; targetRing.visible = false; state.manualLook = false; cameraSnap = true;
    avatar.root.visible = next !== 'transfer';
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
    state.distance = 4.4; state.elevation = .36; setMode('walk');
    onToast('바닥을 누르거나 WASD로 이동 · 드래그로 둘러보기');
  }
  function followCamera(focus, yaw, distance, elevation, dt, obstacles = true) {
    desired.set(focus.x + Math.sin(yaw) * Math.cos(elevation) * distance,
      Math.min(HALL.height - .28, focus.y + Math.sin(elevation) * distance),
      focus.z + Math.cos(yaw) * Math.cos(elevation) * distance);
    if (cameraSnap) { camera.position.copy(desired); cameraSnap = false; }
    else camera.position.lerp(desired, 1 - Math.exp(-dt * 12));
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -59.3, 59.3);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -89.3, 89.3);
    if (obstacles) {
      direction.copy(camera.position).sub(focus); let length = direction.length(); direction.normalize(); cameraRay.set(focus, direction);
      for (const box of colliderBoxes) {
        const p = cameraRay.intersectBox(box, cameraHit);
        if (p) length = Math.min(length, Math.max(.08, focus.distanceTo(p) - .15));
      }
      for (const obstacle of getRuntimeObstacles()) {
        const box = new THREE.Box3(new THREE.Vector3(obstacle.minX - .12, obstacle.minY ?? 0, obstacle.minZ - .12), new THREE.Vector3(obstacle.maxX + .12, obstacle.maxY ?? HALL.height, obstacle.maxZ + .12));
        const p = cameraRay.intersectBox(box, cameraHit);
        if (p) length = Math.min(length, Math.max(.08, focus.distanceTo(p) - .15));
      }
      camera.position.copy(focus).addScaledVector(direction, length);
    }
    camera.lookAt(focus);
  }
  function walk(dt) {
    let forward = Number(keys.has('w') || keys.has('arrowup') || moves.has('forward')) - Number(keys.has('s') || keys.has('arrowdown') || moves.has('back'));
    let right = Number(keys.has('d') || keys.has('arrowright') || moves.has('right')) - Number(keys.has('a') || keys.has('arrowleft') || moves.has('left'));
    let dx = 0, dz = 0;
    const speed = keys.has('shift') ? 4.3 : 2.6;
    if (forward || right) {
      state.path = []; targetRing.visible = false;
      const norm = Math.hypot(forward, right); forward /= norm; right /= norm;
      dx = (-Math.sin(state.yaw) * forward + Math.cos(state.yaw) * right) * speed * dt;
      dz = (-Math.cos(state.yaw) * forward - Math.sin(state.yaw) * right) * speed * dt;
    } else if (state.path.length) {
      const p = state.path[0], distance = Math.hypot(p.x - state.position.x, p.z - state.position.z);
      if (distance < .055) state.path.shift();
      else { const step = Math.min(distance, speed * dt); dx = (p.x - state.position.x) / distance * step; dz = (p.z - state.position.z) / distance * step; }
      if (!state.path.length) targetRing.visible = false;
    }
    const next = stepWalker(state.position, dx, dz);
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
    const next = tourRoute.advance(dt);
    state.speed = next.speed;
    if (next.heading !== null && state.speed > .01) {
      state.heading = next.heading;
      if (!state.manualLook) { const wanted = state.heading + Math.PI; state.yaw += Math.atan2(Math.sin(wanted - state.yaw), Math.cos(wanted - state.yaw)) * (1 - Math.exp(-dt * 2)); }
    }
    state.position.set(next.x, 0, next.z);
  }
  function update(dt) {
    if (!state.locked) state.speed = 0;
    if (!state.locked && $('help').classList.contains('hidden')) {
      if (state.mode === 'walk') walk(dt);
      if (state.mode === 'tour' && !pointers.size) tour(dt);
    }
    avatar.root.position.copy(state.position); avatar.update(dt, { speed: state.speed, heading: state.heading });
    if (state.mode === 'overview') { orbit.update(); return; }
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
      target.copy(state.position); target.y = 1.02;
      followCamera(target, state.yaw, state.distance, state.elevation, dt);
    }
  }
  function tap(event) {
    const r = canvas.getBoundingClientRect(); cast.setFromCamera(new THREE.Vector2((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1), camera);
    const floorHit = cast.ray.intersectPlane(floor, hit), groundDistance = floorHit ? camera.position.distanceTo(floorHit) : Infinity;
    let nearest = null, nearestDistance = Math.min(groundDistance, 24);
    for (let i = 0; i < colliderBoxes.length; i++) {
      const p = cast.ray.intersectBox(colliderBoxes[i], cameraHit);
      if (p && camera.position.distanceTo(p) < nearestDistance) { nearest = colliders[i]; nearestDistance = camera.position.distanceTo(p); }
    }
    if (nearest) { if (nearest.equipment) onInspect(nearest.equipment); return; }
    if (!floorHit || Math.abs(floorHit.x) >= 58.8 || Math.abs(floorHit.z) >= 88.5) return;
    const destination = { x: floorHit.x, z: floorHit.z }, route = findWalkPath(state.position, destination);
    if (!route) { onToast('장비를 피해 통로 바닥을 눌러주세요'); return; }
    if (state.mode !== 'walk') setMode('walk');
    state.path = route; targetRing.position.set(destination.x, .012, destination.z); targetRing.visible = true;
  }
  canvas.addEventListener('pointerdown', e => {
    if (state.locked || state.mode === 'overview' || state.mode === 'transfer') return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) { dragged = 0; pinched = false; }
    if (pointers.size === 2) { const p = [...pointers.values()]; pinchDistance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); pinched = true; }
  });
  canvas.addEventListener('pointermove', e => {
    const old = pointers.get(e.pointerId); if (!old || state.mode === 'overview') return;
    const dx = e.clientX - old.x, dy = e.clientY - old.y; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const p = [...pointers.values()], distance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (distance > 1 && pinchDistance > 1) state.distance = THREE.MathUtils.clamp(state.distance * pinchDistance / distance, 2, 6.8);
      pinchDistance = distance; return;
    }
    dragged += Math.abs(dx) + Math.abs(dy);
    if (dragged > 4) {
      state.manualLook = true;
      if (state.mode === 'ride') state.rideYaw -= dx * .005;
      else { state.yaw -= dx * .005; state.elevation = THREE.MathUtils.clamp(state.elevation + dy * .004, .08, .72); }
    }
  });
  canvas.addEventListener('pointerup', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!pointers.size && !pinched && dragged < 6 && state.mode !== 'ride') tap(e);
  });
  canvas.addEventListener('pointercancel', e => pointers.delete(e.pointerId));
  canvas.addEventListener('wheel', e => {
    if (state.locked || state.mode === 'overview' || state.mode === 'transfer') return; e.preventDefault(); state.distance = THREE.MathUtils.clamp(state.distance + e.deltaY * .004, 2, 6.8);
  }, { passive: false });
  const movement = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'];
  window.addEventListener('keydown', e => {
    if (state.locked) return;
    const key = e.key.toLowerCase();
    if (key === 'escape') { $('tool-card').classList.add('hidden'); $('help').classList.add('hidden'); state.path = []; targetRing.visible = false; }
    if (!movement.includes(key) || e.target.closest('input,textarea,select,[contenteditable=true]')) return;
    e.preventDefault(); if (state.mode !== 'walk') setMode('walk'); keys.add(key);
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });
  for (const button of document.querySelectorAll('[data-move]')) {
    const release = () => { moves.delete(button.dataset.move); button.classList.remove('pressed'); };
    button.addEventListener('pointerdown', e => { if (state.locked) return; e.preventDefault(); button.setPointerCapture(e.pointerId); moves.add(button.dataset.move); button.classList.add('pressed'); });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, release);
  }
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
  return { state, setMode, reset, update, focusTransfer,
    lock(value) { state.locked = value; clearInput(); state.path = []; targetRing.visible = false; cameraSnap = true; },
    focusEquipment(machine) {
      if (state.locked) return;
      setMode('walk'); const bay = bays[machine.bayId];
      state.position.set(machine.x, 0, bay.z);
      state.yaw = machine.sign === 1 ? .15 : Math.PI + .15;
      state.heading = machine.sign === 1 ? Math.PI : 0;
      state.distance = 3.6; state.elevation = .12;
    },
    focusRear() {
      setMode('walk'); const bay = bays[7], previous = bays[6];
      state.position.set(-28.7, 0, (bay.z + previous.z) / 2); state.yaw = Math.PI / 2; state.heading = -Math.PI / 2; state.distance = 4.2; state.elevation = .3;
      onToast('장비 뒤쪽 통로 1.4m · 옆 장비 사이 틈 0.65m');
    },
    nextVehicle() { state.followId = (state.followId + 1) % vehicles.length; cameraSnap = true; onToast('OHT ' + String(state.followId + 1).padStart(2, '0') + '의 경로를 따라갑니다'); } };
}
