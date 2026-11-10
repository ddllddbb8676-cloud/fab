import { machines, ports, TOOL_WIDTH, TOOL_FRONT, PORT_Z, VEHICLE_Y, SEATED_FOUP_Y, isBlocked } from './layout.js?v=a6e059616081';
import { reservedPortIds } from './network-transport.js?v=a6e059616081';
import { floorSpot, supportHeight, createFoupStore, createFoupRenderer, canReachGroundFoup, FOUP_PICKUP_REACH, FOUP_CLEAN_SECONDS } from './foup-play.js?v=a6e059616081';
import { createFoupDebris } from './foup-debris.js?v=a6e059616081';
import {stockerPorts,stockers,stockerById,stockerPoint} from './stocker-layout.js?v=a6e059616081';
import {canTraverseRuntimeObstacles} from './runtime-obstacles.js?v=a6e059616081';

const smooth = t => { const p = Math.max(0, Math.min(1, t)); return p * p * (3 - 2 * p); };
export function boardingMachine(car) {
  return machines.find(m => Math.abs(car.x - m.x) <= TOOL_WIDTH / 2 && Math.abs(car.z - (m.z + m.sign * PORT_Z)) < .65) ?? null;
}
export const NO_LOADPORT_MESSAGE='로드포트가 있는 곳에서 타야 해요';
export function boardingApproach(car,machine=boardingMachine(car)) {
  return machine?{x:car.x,z:machine.z+machine.sign*(TOOL_FRONT+.43)}:null;
}

export function groundPickupCandidates(record,from){
  const angle=Math.atan2(from.x-record.x,from.z-record.z);
  // Approach from the visitor's side first. A fixed +Z offset could put the
  // destination inside the closed air shower, even when the FOUP was outside.
  const turns=[0,1,-1,2,-2,3,-3,4,-4,5,-5,6,-6,7,-7,8];
  return [...turns.map(n=>({x:record.x+Math.sin(angle+n*Math.PI/8)*.55,z:record.z+Math.cos(angle+n*Math.PI/8)*.55})),{x:record.x,z:record.z}]
    .filter(p=>!isBlocked(p.x,p.z,.295)&&canTraverseRuntimeObstacles(p,record,.08)&&
      Array.from({length:7},(_,i)=>i/6).every(t=>!isBlocked(p.x+(record.x-p.x)*t,p.z+(record.z-p.z)*t,.08)));
}

export function createPlayActions({ THREE, scene, materials, fleet, explorer, avatar, initialPortIds, hideOriginal, showOriginal, isDestroyed, toast, onCue = () => {}, network = null, isRestricted = () => false, contestPlaying = () => false, reducedMotion = false, seedStockers=false }) {
  const store = createFoupStore({ ports, initialPortIds, hideOriginal, showOriginal, isDestroyed, seedStockers, onStockerOut:p=>onCue('stocker-out',p), onImpact: record => onCue('bounce', record), onShatter:record=>onCue('shatter',record) });
  if(seedStockers)store.initializeStockers();
  const renderer = createFoupRenderer(THREE, scene, materials);
  const debris = createFoupDebris(THREE,scene,{reducedMotion});
  const byPort = new Map(ports.map(port => [port.id, port]));
  const box = new THREE.Box3(), hit = new THREE.Vector3();
  let action = null, pending = null, passengerId = null, awaiting = false, requestGeneration = 0, cleanRequest = false;
  let landingPickup = null;
  const visibility=()=>{if(document.hidden)clearPending();};
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',visibility);
  const pose = () => ({ x: explorer.state.position.x, y: explorer.state.position.y, z: explorer.state.position.z, heading: explorer.state.heading });
  const vehicle = id => fleet.vehicles.find(v => v.id === id);
  function onFoot() { return !isRestricted() && !awaiting && !action && passengerId === null && (!network || network.connected) && ['walk', 'tour'].includes(explorer.state.mode) && !explorer.state.locked; }
  function remote(kind,data,success,failure) {
    if(!network)return false;awaiting=true;const generation=++requestGeneration;
    network.command(kind,data).then(result=>{if(generation!==requestGeneration)return;awaiting=false;if(result.ok)success?.(result);else {failure?.();if(['climb','ride'].includes(kind)){network.command('cancel');resetOnline();}toast(result.message??'다시 시도해 주세요');}});return true;
  }
  function reserved(port) {
    return reservedPortIds.has(port.id) && fleet.vehicles.some(v => !v.cargoDetached && [v.homePort.id, v.currentPort.id, v.destinationPort.id].includes(port.id));
  }
  function movingAtPort(port) {
    return fleet.vehicles.find(v => !v.cargoDetached && v.state.parked && v.currentPort.id === port.id);
  }
  function clearPending() {
    landingPickup = null;
    if(cleanRequest){cleanRequest=false;requestGeneration++;awaiting=false;network?.command('cancel');}
    if(action?.phase==='cleaning')cancelCleanup();
    if (!pending) return;
    if (pending.kind === 'board') { if(network)network.command('cancel');else fleet.holdVehicle(pending.vehicleId, false); }
    pending = null;
  }
  function startWalk(target, task) {
    clearPending();
    if (!explorer.walkTo(target)) { toast('앞쪽 통로에서 다시 눌러주세요'); return false; }
    pending = { ...task, destination: target }; return true;
  }
  function detachedVehicleCargo(v) {
    if (v.cargoDetached) return;
    const state = v.state;
    const record = store.adopt(`vehicle:${v.id}`, { ...state.foup }, state.parked ? state.target.id : null);
    fleet.detachCargo(v.id);
    if (!state.parked) {
      const m = boardingMachine(state.car), sign = m?.sign ?? 1;
      store.launch(record, { ...state.foup }, { x: 0, y: .6, z: sign * 2.2 });
    }
  }
  function requestBoard(id) {
    if (!onFoot()) return false;
    if(pending?.kind==='board'&&pending.vehicleId===id)return true;
    if (store.carried) { toast('FOUP을 내려놓고 타주세요'); return true; }
    const v = vehicle(id), m = v && boardingMachine(v.state.car);
    if(!v)return false;
    // The rendered OHT is interpolated behind the server. Always approach the
    // held car's confirmed position, not that earlier rendered position.
    if(network){clearPending();remote('board',{id},result=>{const actual=machines[result.machineId],destination=result.approach??(actual&&boardingApproach(v.state.car,actual));if(!actual||!destination||!startWalk(destination,{kind:'board',vehicleId:id,machine:actual,boardingCar:result.boardingCar}))network.command('cancel');else toast('장비를 딛고 올라가 OHT에 점프해요');});return true;}
    if (v.residentId || v.playerId) { toast('친구가 타고 있는 OHT예요. 다른 OHT를 눌러주세요'); return true; }
    if (!m) { toast(NO_LOADPORT_MESSAGE); return true; }
    if (isDestroyed(m.id)) { toast('장비가 부셔져서 탈 수가 없어요'); return true; }
    const destination = boardingApproach(v.state.car,m);
    if (!startWalk(destination, { kind: 'board', vehicleId: id, machine: m })) return true;
    fleet.holdVehicle(id, true); toast('장비를 딛고 올라가 OHT에 점프해요'); return true;
  }
  function requestPickup(record, port = null, v = null) {
    if (!onFoot()) return false;
    if (store.carried) { toast('이미 FOUP을 들고 있어요. 빈 로드포트에 내려놓거나 던져보세요'); return true; }
    if (port && isDestroyed(port.machineId)) return false;
    const task={kind:'pickup',recordId:record?.id,portId:port?.id,vehicleId:v?.id};
    if(port)return startWalk({x:port.x,z:port.z+port.sign*.96},task);
    clearPending();
    if (contestPlaying() && record && !record.gold) {
      if (record.mode === 'flying') {
        // A tap on the last bounce should use the actual landing spot.
        landingPickup = {id:record.id, until:performance.now()+3000};
        return true;
      }
      task.contestPickup = true;
      if (explorer.state.posture === 'stand' && canReachGroundFoup(explorer.state.position, record)) {
        if (explorer.state.path.length) explorer.stopWalk();
        begin(task);
        return true;
      }
    }
    for(const destination of groundPickupCandidates(record,pose()))if(explorer.walkTo(destination)){
      pending={...task,destination};return true;
    }
    toast('앞쪽 통로에서 다시 눌러주세요');return false;
  }
  function nearbyContestFoup() {
    if (!contestPlaying() || !onFoot() || store.carried || explorer.state.posture !== 'stand') return null;
    const from = explorer.state.position;
    let nearest = null, best = FOUP_PICKUP_REACH ** 2;
    for (const record of store.records.values()) {
      if (record.mode !== 'ground' || record.gold) continue;
      const d = (record.x - from.x) ** 2 + (record.z - from.z) ** 2;
      if (d <= best && canReachGroundFoup(from, record)) { nearest = record; best = d; }
    }
    return nearest;
  }
  function pickupNearby() {
    const record = nearbyContestFoup();
    return record ? requestPickup(record) : false;
  }
  function requestPlace(port) {
    if (!onFoot() || !store.carried) return false;
    if (isDestroyed(port.machineId)) { toast('고장 난 장비에는 FOUP을 내려놓을 수 없어요'); return true; }
    if (store.occupied(port.id) || movingAtPort(port) || reserved(port)) { toast('비어 있는 다른 로드포트를 눌러주세요'); return true; }
    return startWalk({ x: port.x, z: port.z + port.sign * .96 }, { kind: 'place', portId: port.id });
  }
  function requestStocker(port){
    if(!onFoot())return false;
    if(port.kind==='IN'&&!store.carried){toast('FOUP을 들고 IN을 누르면 보관해요');return true;}
    if(port.kind==='OUT'&&store.carried){toast('들고 있는 FOUP을 먼저 내려놓아 주세요');return true;}
    onCue('stocker-prepare',port);
    return startWalk(port.approach,{kind:'stocker',stockerId:port.stockerId,portKind:port.kind,
      recordId:port.kind==='IN'?store.carried.id:store.stockerState(port.stockerId).out?.id??null});
  }
  function requestCleanup(record){
    if(!onFoot())return false;
    if(store.carried){toast('FOUP을 내려놓고 청소해 주세요');return true;}
    if(record.cleaner){toast('다른 사람이 청소하고 있어요');return true;}
    const p=pose(),angle=Math.atan2(p.x-record.x,p.z-record.z);
    const destination=floorSpot({x:record.x+Math.sin(angle)*.78,z:record.z+Math.cos(angle)*.78});
    if(!destination)return false;
    if(startWalk(destination,{kind:'clean',recordId:record.id,breakSeq:record.breakSeq}))toast('잔해 앞으로 이동해요 · 청소 완료 시 2칩');
    return true;
  }
  function startCleanup(task){
    const r=store.records.get(task.recordId);if(!r||r.mode!=='broken')return;
    explorer.cancelEmo('cleaning');explorer.endJoystick?.();explorer.state.path=[];explorer.state.posture='stand';explorer.state.speed=0;
    explorer.state.heading=Math.atan2(r.x-pose().x,r.z-pose().z);
    r.cleanHeading=explorer.state.heading;
    action={...task,phase:'cleaning',elapsed:0,from:pose(),nextSweep:0};explorer.state.cleaningTime=0;toast('슥삭슥삭! 파티클 청소 중…');
  }
  function cancelCleanup(){
    if(action?.phase!=='cleaning')return;
    if(network)network.command('cancel');else store.cancelCleanup('player');
    action=null;explorer.state.cleaningTime=null;
  }
  function rayDistance(ray, x, y, z, sx, sy, sz) {
    box.min.set(x - sx / 2, y - sy / 2, z - sz / 2); box.max.set(x + sx / 2, y + sy / 2, z + sz / 2);
    return ray.intersectBox(box, hit) ? ray.origin.distanceTo(hit) : Infinity;
  }
  function unobstructed(ray, distance, ownMachine = null) {
    for(const s of stockers){const b=s.bounds;
      if(rayDistance(ray,(b.minX+b.maxX)/2,b.maxY/2,(b.minZ+b.maxZ)/2,b.maxX-b.minX,b.maxY,b.maxZ-b.minZ)<distance-.05)return false;
    }
    for (const m of machines) {
      if (m.id === ownMachine || isDestroyed(m.id)) continue;
      for (const b of m.walkBounds) {
        const height = b.part === 'cabinet' ? 3.4 : 1.45;
        const d = rayDistance(ray, (b.minX + b.maxX) / 2, height / 2, (b.minZ + b.maxZ) / 2, b.maxX - b.minX, height, b.maxZ - b.minZ);
        if (d < distance - .05) return false;
      }
    }
    return true;
  }
  function tap(ray) {
    if (!onFoot()) return false;
    let candidate = null, nearest = 20;
    const consider = (distance, task, ownMachine) => {
      if (distance < nearest && unobstructed(ray, distance, ownMachine)) { nearest = distance; candidate = task; }
    };
    for (const v of fleet.vehicles) {
      const p = v.state.car;
      consider(rayDistance(ray, p.x, VEHICLE_Y + .23, p.z, 1.12, .85, 1.3), { kind: 'board', id: v.id });
    }
    for(const port of stockerPorts){const b=port.bounds,s=stockerById.get(port.stockerId),label=stockerPoint(s,(port.index-.5)*1.24,2.3,3.145),side=Math.abs(Math.sin(s.yaw))>.5;
      const task={kind:'stocker',port};
      consider(rayDistance(ray,port.x,1.46,port.z,b.maxX-b.minX+.06,.2,b.maxZ-b.minZ+.06),task);
      // OUT's shutter and label are one target. Keep a 22 cm gap to IN and
      // a shallow front plane, so diagonal taps cannot hit its neighbour.
      const out=port.kind==='OUT',width=out?1.08:.96;
      consider(rayDistance(ray,label.x,out?1.96:label.y,label.z,side?.06:width,out?1.2:.4,side?width:.06),task);
      if(port.kind==='OUT'&&store.stockerState(port.stockerId).out)consider(rayDistance(ray,port.x,port.y+.2225,port.z,.6,.5,.55),task);
    }
    for (const port of ports) {
      if (isDestroyed(port.machineId)) continue;
      if (store.carried) consider(rayDistance(ray, port.x, port.y + .12, port.z, .78, .5, .72), { kind: 'place', port }, port.machineId);
      else {
        const record = store.atPort(port.id), v = movingAtPort(port);
        if (record || v) consider(rayDistance(ray, port.x, SEATED_FOUP_Y, port.z, .6, .55, .55), { kind: 'pickup', record, port, v }, port.machineId);
      }
    }
    const contest = contestPlaying();
    if (!store.carried) for (const record of store.records.values()) {
      if (record.mode === 'ground' || (contest && !record.gold && record.mode === 'flying')) {
        consider(rayDistance(ray, record.x, record.y, record.z, contest ? .88 : .6, .55, contest ? .88 : .55), { kind: 'pickup', record });
      }
      if (record.mode === 'broken') consider(rayDistance(ray, record.x, .15, record.z, 1.8, .3, 1.8), { kind: 'clean', record });
    }
    if (!candidate) { clearPending(); return false; }
    if (candidate.kind === 'board') return requestBoard(candidate.id);
    if (candidate.kind === 'place') return requestPlace(candidate.port);
    if (candidate.kind === 'clean') return requestCleanup(candidate.record);
    if (candidate.kind === 'stocker') return requestStocker(candidate.port);
    return requestPickup(candidate.record, candidate.port, candidate.v);
  }
  function begin(task) {
    if(task.kind==='stocker'){
      const s=stockerById.get(task.stockerId),port=s.ports.find(p=>p.kind===task.portKind);
      explorer.state.heading=Math.atan2(port.x-pose().x,port.z-pose().z);
      const complete=result=>{explorer.state.carrying=Boolean(store.carried);toast(result.phase==='golden-deposit'?'황금 FOUP 입고 완료! +200칩 적립':result.phase==='stocking'?'IN · FOUP을 보관하고 있어요':result.phase==='retrieving'?'OUT · FOUP이 나오면 한 번 더 눌러 가져가세요':'FOUP을 들었어요');};
      if(network)remote('stocker',{id:s.id,port:port.kind,recordId:task.recordId},complete);
      else {const result=port.kind==='IN'?store.stockerPut(s.id,'player',task.recordId):store.stockerGet(s.id,'player',task.recordId);if(result.ok)complete(result);else toast(result.message);}
      return;
    }
    if(task.kind==='clean'){
      if(network){cleanRequest=true;remote('clean',{id:task.recordId,breakSeq:task.breakSeq},()=>{cleanRequest=false;startCleanup(task);},()=>{cleanRequest=false;});}
      else if(store.beginCleanup(task.recordId,'player',task.breakSeq))startCleanup(task);
      else toast('잔해를 다시 눌러주세요');
      return;
    }
    if(network) {
      if(task.kind==='board')remote('climb',{},result=>startClimb(task,result));
      else {
        const port=byPort.get(task.portId);if(port)explorer.state.heading=port.sign===1?Math.PI:0;
        remote(task.kind==='pickup'?'pickup':'place',task.kind==='pickup'?{id:task.recordId,portId:task.portId,vehicleId:task.vehicleId,...(task.contestPickup?{contestPickup:true}:{})}:{id:task.portId},()=>{
          explorer.state.carrying=Boolean(store.carried);toast(task.kind==='pickup'?'FOUP을 들었어요 · 빈 로드포트를 누르면 내려놓아요':'FOUP을 이 로드포트에 내려놓았어요');
        });
      }
      return;
    }
    if (task.kind === 'board') {
      const v = vehicle(task.vehicleId);
      if (!v || isDestroyed(task.machine.id)) { fleet.holdVehicle(task.vehicleId, false); toast('장비가 부셔져서 탈 수가 없어요'); return; }
      detachedVehicleCargo(v);
      action = { ...task, phase: 'climb', elapsed: 0, from: pose(), car: { ...v.state.car } };
      onCue('climb');
      explorer.setMode('passenger'); explorer.state.rideYaw = .5;
    } else {
      const port = byPort.get(task.portId);
      if (port && isDestroyed(port.machineId)) return;
      explorer.state.heading = port ? port.sign === 1 ? Math.PI : 0 : Math.atan2((store.records.get(task.recordId)?.x ?? pose().x) - pose().x, (store.records.get(task.recordId)?.z ?? pose().z) - pose().z);
      if (task.kind === 'pickup') {
        let record = store.records.get(task.recordId);
        if (task.vehicleId !== undefined) {
          const v = vehicle(task.vehicleId);
          if (!v || v.cargoDetached || !v.state.parked || v.currentPort.id !== port?.id) { toast('OHT가 FOUP을 가져갔어요. 다른 FOUP을 눌러주세요'); return; }
          record = store.adopt(`vehicle:${v.id}`, { ...v.state.foup }, port.id); fleet.detachCargo(v.id);
        }
        if (record && store.pickup(record.id)) { explorer.state.carrying = true; onCue('pickup'); toast('FOUP을 들었어요 · 빈 로드포트를 누르면 내려놓아요'); }
      } else if (port && !reserved(port) && !movingAtPort(port) && store.place(port.id)) { explorer.state.carrying = false; onCue('place'); toast('FOUP을 이 로드포트에 내려놓았어요'); }
    }
  }
  function startClimb(task,result={}) {
    const v=vehicle(task.vehicleId);
    action={...task,phase:'climb',elapsed:0,from:pose(),car:{...(result.boardingCar??task.boardingCar??v.state.car)}};
    onCue('climb');explorer.setMode('passenger');explorer.state.rideYaw=.5;
  }
  function dismount() {
    if (passengerId === null || action) return false;
    if(network){if(awaiting)return false;return remote('dismount',{},dropFromOht);}
    return dropFromOht();
  }
  function dropFromOht() {
    const from = pose(); if(!network)fleet.leavePassenger(passengerId); passengerId = null;
    const landingY = Math.min(from.y, supportHeight(from.x, from.z));
    const destination = floorSpot(from);
    action = { phase: 'fall', elapsed: 0, from, landingY, destination: destination ?? { x: from.x, z: from.z } };
    onCue('jump'); toast('OHT에서 내려와요'); return true;
  }
  function throwFoup(drop = false) {
    const record = store.carried; if (!record || action || passengerId !== null) return false;
    if(network){if(awaiting)return false;return remote('throw',{drop},result=>{explorer.state.carrying=Boolean(store.carried);toast(drop?'FOUP을 내려놓았어요':result.contestThrow?'풉을 던졌어요! 우리 원 안에 멈추면 득점이에요.':'FOUP을 던졌어요 · 깨진 잔해를 누르면 청소해요');});}
    const p = pose(), heading = p.heading;
    store.launch(record, { x: record.x, y: record.y, z: record.z, yaw: record.yaw }, { x: Math.sin(heading) * (drop ? .8 : 4.7), y: drop ? .2 : 3.1, z: Math.cos(heading) * (drop ? .8 : 4.7) }, {shatter:!drop});
    explorer.state.carrying = false; onCue(drop ? 'place' : 'throw'); toast(drop ? 'FOUP을 바닥에 내려놓았어요' : 'FOUP을 던졌어요'); return true;
  }
  function update(dt) {
    if(!network)store.step(dt);
    if (landingPickup) {
      const record = store.records.get(landingPickup.id);
      if (!contestPlaying() || !onFoot() || store.carried || performance.now() > landingPickup.until) {
        landingPickup = null;
      } else if (record?.mode !== 'flying') {
        landingPickup = null;
        if (record?.mode === 'ground') requestPickup(record);
      }
    }
    if (pending) {
      const distance = Math.hypot(explorer.state.position.x - pending.destination.x, explorer.state.position.z - pending.destination.z);
      const last = explorer.state.path.at(-1);
      if (explorer.state.locked || explorer.state.posture !== 'stand' || explorer.state.mode !== 'walk' || (last && Math.hypot(last.x - pending.destination.x, last.z - pending.destination.z) > .02)) clearPending();
      else if (pending.contestPickup && (!contestPlaying() || store.records.get(pending.recordId)?.mode !== 'ground')) clearPending();
      else if (pending.contestPickup && canReachGroundFoup(explorer.state.position, store.records.get(pending.recordId))) {
        const task=pending;pending=null;explorer.stopWalk();begin(task);
      }
      else if (distance < .025 && !explorer.state.path.length && !avatar.root.userData.resting) { const task = pending; pending = null; begin(task); }
      else if (!explorer.state.path.length && distance > .05) clearPending();
    }
    if (action) {
      action.elapsed += Math.min(dt, .05); const a = action;
      if(a.phase==='cleaning'){
        const r=store.records.get(a.recordId);
        if(explorer.state.locked||explorer.state.mode!=='walk'||explorer.state.posture!=='stand'||explorer.state.path.length||explorer.state.joystickActive||typeof document!=='undefined'&&document.hidden){cancelCleanup();return;}
        if(!r||r.mode!=='broken'){
          action=null;explorer.state.cleaningTime=null;if(r?.mode==='cleared')toast('파티클 청소 완료!');return;
        }
        if(network&&!r.cleaner){cancelCleanup();return;}
        explorer.state.cleaningTime=a.elapsed;
        if(!network){
          r.cleanProgress=Math.min(1,a.elapsed/FOUP_CLEAN_SECONDS);
          if(a.elapsed>=a.nextSweep){onCue('sweep',r);a.nextSweep=a.elapsed+.52;}
          if(a.elapsed>=FOUP_CLEAN_SECONDS){store.finishCleanup(r.id,'player',a.breakSeq);action=null;explorer.state.cleaningTime=null;toast('파티클 청소 완료!');}
        }
      } else if (a.phase === 'climb') {
        if (a.elapsed >= 1.7 && !a.jumped) { a.jumped = true; onCue('jump'); }
        if (isDestroyed(a.machine.id)) { if(network)network.command('cancel');else fleet.holdVehicle(a.vehicleId, false); resetOnline();toast('장비가 부셔져서 탈 수가 없어요'); return; }
        const sign = a.machine.sign, ledge = { x: a.car.x, y: 1.47, z: a.machine.z + sign * 2.92 };
        const roof = { x: a.car.x, y: 3.4, z: a.machine.z + sign * 1.9 };
        const hang = { x: a.car.x, y: 2.16, z: a.car.z };
        const segments = [[a.from, ledge, .8], [ledge, roof, .9], [roof, hang, .8]];
        let time = a.elapsed, segment = segments[0];
        for (const item of segments) { segment = item; if (time <= item[2]) break; time -= item[2]; }
        const p = smooth(time / segment[2]), [start, end] = segment;
        explorer.setScriptedPose({ x: start.x + (end.x - start.x) * p, y: start.y + (end.y - start.y) * p + Math.sin(p * Math.PI) * .12, z: start.z + (end.z - start.z) * p,
          heading: sign === 1 ? Math.PI : 0, crouch: .7, hanging: a.elapsed > 1.7, cameraYaw: sign === 1 ? .55 : Math.PI + .55, cameraDistance: 4.5 });
        if (a.elapsed >= 2.5) {
          const complete=()=>{passengerId=a.vehicleId;if(!network)fleet.boardPassenger(passengerId);action=null;onCue('grab');toast('만세! OHT와 FAB 산책 중 · 아래의 내리기를 눌러보세요');};
          if(network){a.elapsed=2.5;if(!a.requestedRide){a.requestedRide=true;remote('ride',{},complete);}}
          else complete();
        }
      } else if (a.phase === 'fall') {
        const y = Math.max(a.landingY, a.from.y - 4.9 * a.elapsed * a.elapsed);
        explorer.setScriptedPose({ ...a.from, y, hanging: false, crouch: .5, cameraY: Math.max(2.8, y + 1.5) });
        if (y <= a.landingY) {
          if (a.landingY > .02 || isBlocked(a.from.x, a.from.z, .295)) { a.phase = 'step-off'; a.elapsed = 0; a.from = { ...a.from, y: a.landingY }; }
          else finishLanding(a.destination);
        }
      } else if (a.phase === 'step-off') {
        const p = smooth(a.elapsed / .7);
        explorer.setScriptedPose({ x: a.from.x + (a.destination.x - a.from.x) * p, y: a.from.y * (1 - p) + Math.sin(p * Math.PI) * .18, z: a.from.z + (a.destination.z - a.from.z) * p,
          heading: a.from.heading, crouch: .5, cameraY: 2.8 });
        if (p >= 1) finishLanding(a.destination);
      }
    }
    if (passengerId !== null) {
      const v = vehicle(passengerId), p = v.state.car;
      explorer.setScriptedPose({ x: p.x, y: 2.16, z: p.z, heading: p.yaw, hanging: true });
    }
  }
  function finishLanding(destination) {
    onCue('land');
    action = null; explorer.setScriptedPose(null); explorer.state.position.set(destination.x, 0, destination.z); explorer.setMode('walk'); toast('착지! 다시 걸어갈 수 있어요');
  }
  function render(dt=.016,camera=null) {
    const record = store.carried;
    if (record) {
      const p = pose(), heading = avatar.root.userData.heading ?? p.heading;
      const y = explorer.state.posture === 'sit' ? .48 : explorer.state.posture === 'lie' ? .62 : .82;
      Object.assign(record, { x: p.x + Math.sin(heading) * .34, y: p.y + y, z: p.z + Math.cos(heading) * .34, yaw: heading + Math.PI });
    }
    const records = [...store.records.values()];
    for (const r of records) r.hidden = r.mode === 'port' && isDestroyed(byPort.get(r.portId)?.machineId);
    renderer.update(records);
    debris.update(records,{dt,focus:explorer.state.position,overview:explorer.state.mode==='overview',camera});
  }
  function targets(camera, viewport) {
    const result = [], point = new THREE.Vector3(), ray = new THREE.Ray();
    const add = (kind, id, x, y, z, machineId = null) => {
      point.set(x,y,z); const distance = point.distanceTo(camera.position);
      if (distance > 18) return;
      ray.set(camera.position, point.clone().sub(camera.position).normalize());
      if (!unobstructed(ray, distance, machineId)) return;
      point.project(camera);
      if (Math.abs(point.x) > .95 || Math.abs(point.y) > .85 || Math.abs(point.z) > 1) return;
      result.push({ kind, id, x: Math.round((point.x + 1) * viewport.width / 2), y: Math.round((1 - point.y) * viewport.height / 2), distance, machineId });
    };
    for (const v of fleet.vehicles) add('oht', v.id, v.state.car.x, VEHICLE_Y + .23, v.state.car.z, boardingMachine(v.state.car)?.id);
    for (const p of ports) if (!isDestroyed(p.machineId)) {
      if (store.atPort(p.id) || movingAtPort(p)) add('foup', p.id, p.x, SEATED_FOUP_Y, p.z, p.machineId);
      else if (!reserved(p)) add('port', p.id, p.x, p.y + .05, p.z, p.machineId);
    }
    for(const r of store.records.values())if(r.mode==='broken')add('debris',r.id,r.x,.15,r.z);
    for(const p of stockerPorts){const label=stockerPoint(stockerById.get(p.stockerId),(p.index-.5)*1.24,2.3,3.145);add('stocker',p.id,label.x,label.y,label.z);}
    return result.sort((a,b) => a.distance - b.distance).slice(0, 30);
  }
  function resetOnline() {
    requestGeneration++;awaiting=false;cleanRequest=false;pending=null;landingPickup=null;action=null;passengerId=null;
    explorer.state.cleaningTime=null;
    explorer.setScriptedPose(null);const p=floorSpot(explorer.state.position);if(p)explorer.state.position.set(p.x,0,p.z);
    explorer.state.carrying=false;explorer.setMode('walk');
  }
  return { tap, update, render, requestBoard, requestPlace, requestStocker, requestCleanup, dismount, throwFoup, nearbyContestFoup, pickupNearby, clearPending, targets, store, resetOnline,
    dispose(){clearPending();if(typeof document!=='undefined')document.removeEventListener?.('visibilitychange',visibility);renderer.dispose();debris.dispose();},
    detachVehicleCargo: detachedVehicleCargo,
    get protectedMachineId() { return pending?.machine?.id ?? action?.machine?.id ?? byPort.get(pending?.portId)?.machineId ?? null; },
    get busy() { return Boolean(action || passengerId !== null); },
    get state() { return { phase: action?.phase ?? (passengerId !== null ? 'riding' : pending ? 'approach' : 'idle'), passengerId, targetVehicleId: pending?.vehicleId ?? action?.vehicleId ?? null, canDismount: passengerId !== null && !action, ...store.state }; }
  };
}
