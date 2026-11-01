import { machines, bays, ports } from './layout.js';
import { findWalkPath, stepWalker } from './walking.js';
import { getEmoApproach } from './emo-interaction.js';
import { findRestHeading } from './posture.js';
import { VISITOR_NAMES, createVisitorBadge } from './visitor-name.js';
import { createAvatar } from './avatar.js';
import { floorSpot } from './foup-play.js';
import { reservedPortIds } from './network-transport.js';

export const RESIDENT_ROLES = Object.freeze({ thrower: 5, rider: 5, resting: 10, repairer: 5, breaker: 5 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = n => Math.max(0, Math.min(1, n));

/** World state, separate from rendering: shared cargo identities and per-tool claims. */
export function createResidentSimulation({ fleet, store, destruction, detachCargo, protectedIds = () => [], onCue = () => {}, random = Math.random, excludedNames = [] }) {
  const remainingNames = VISITOR_NAMES.filter(name => !excludedNames.includes(name));
  const people = [], claims = new Map(), portMap = new Map(ports.map(p => [p.id, p]));
  const totals = { throws: 0, repairs: 0, breaks: 0, pickups: 0, placements: 0 };
  let elapsed = 0, planner = 0;
  const choose = items => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  for (const [role, count] of Object.entries(RESIDENT_ROLES)) for (let i = 0; i < count; i++) {
    const index = people.length, bay = bays[(index * 7 + 8) % bays.length];
    const name = remainingNames.splice(Math.floor(random() * remainingNames.length), 1)[0];
    const actor = { id: `resident:${index}`, role, name, index, x: bay.x + (i % 3 - 1) * 7, y: 0, z: bay.z,
      heading: random() * Math.PI * 2, speed: 0, posture: 'stand', phase: 'idle', path: [], time: 0, wait: i * .8,
      bayId: bay.id, targetId: null, recordId: null, homePortId: null, nextThink: 0, stepDistance: 0, actions: 0 };
    if (role === 'resting') {
      const m = bay.machines[2 + i % 5], next = bay.machines[3 + i % 5];
      // Some rest in the narrow equipment gaps, some at the edge of the broad aisle.
      if (i % 2 === 0) { actor.x = (m.x + next.x) / 2; actor.z = m.z; }
      else { actor.x = bay.x + (i - 4) * 3; actor.z = bay.z + (i % 3 - 1) * 1.4; }
      if (i === 1 || i === 6) { actor.x = i === 1 ? -1.5 : 1.5; actor.z = i === 1 ? 74 : 69; }
      actor.posture = i < 5 ? 'sit' : 'lie';
      actor.heading = findRestHeading(actor, actor.heading, actor.posture) ?? 0;
      actor.phase = 'rest'; actor.wait = 35 + random() * 40;
    }
    if (role === 'rider') {
      const v = fleet.vehicles[(i * 7 + 2) % fleet.vehicles.length];
      actor.vehicleId = v.id; v.residentId = actor.id;
      detachCargo(v); fleet.boardPassenger(v.id);
      actor.phase = 'riding'; Object.assign(actor, { x: v.state.car.x, z: v.state.car.z, y: 2.16, heading: v.state.car.yaw });
    }
    people.push(actor);
  }
  function reserved(id) { return protectedIds().includes(id); }
  function release(actor) {
    if (claims.get(actor.targetId) === actor.id) claims.delete(actor.targetId);
    if (actor.phase === 'repair') destruction.cancelRepair(actor.targetId);
    actor.targetId = null; actor.plan = null; actor.path = []; actor.phase = 'idle'; actor.time = 0;
  }
  function yieldMachine(id) {
    for (const actor of people) if (actor.targetId === id) { release(actor); actor.wait = 4; }
  }
  function go(actor, destination, phase) {
    const path = findWalkPath(actor, destination);
    if (!path) return false;
    actor.path = path; actor.phase = phase; actor.time = 0; actor.posture = 'stand'; return true;
  }
  function cue(actor, kind) { onCue(kind, actor); }
  function patrol(actor) {
    const bay = choose(bays), destination = { x: bay.x + (random() - .5) * 40, z: bay.z };
    if (!go(actor, destination, 'patrol')) actor.wait = 2;
  }
  function selectWork(actor) {
    const repairing = actor.role === 'repairer';
    const damaged = destruction.state.destroyedIds;
    const candidates = machines.filter(m => !reserved(m.id) && !claims.has(m.id) && (repairing ? damaged.includes(m.id) : !damaged.includes(m.id)));
    if (!repairing && damaged.length >= 18) { patrol(actor); return; }
    candidates.sort((a, b) => distance(actor, a) - distance(actor, b));
    const nearby = candidates.slice(0, repairing ? 5 : 16), machine = choose(nearby);
    if (!machine) { patrol(actor); return; }
    const plan = getEmoApproach(machine);
    if (!go(actor, plan.destination, 'work-walk')) { actor.wait = 1; return; }
    actor.targetId = machine.id; actor.plan = plan; claims.set(machine.id, actor.id);
  }
  function pickTarget(actor) {
    // Reuse the last thrown FOUP before taking another; the world never fills with copies.
    const previous = store.records.get(actor.recordId);
    if (previous && previous.mode === 'ground') {
      const target = floorSpot({ x: previous.x, z: previous.z + .55 });
      if (target && go(actor, target, 'retrieve')) return;
    }
    if (previous && ['flying', 'carried'].includes(previous.mode)) { actor.wait = 2; return; }
    const candidates = ports.filter(p => !reservedPortIds.has(p.id) && !reserved(p.machineId) && store.atPort(p.id))
      .sort((a,b) => distance(actor, a) - distance(actor,b)).slice(0, 12);
    const p = choose(candidates);
    if (!p) { patrol(actor); return; }
    if (go(actor, { x: p.x, z: p.z + p.sign * .96 }, 'pickup-walk')) {
      actor.recordId = store.atPort(p.id).id; actor.homePortId = p.id;
    }
  }
  function returnFoup(actor) {
    const empty = ports.filter(p => !reservedPortIds.has(p.id) && !reserved(p.machineId) && !destruction.isDestroyed(p.machineId) && !store.occupied(p.id))
      .sort((a,b) => distance(actor,a) - distance(actor,b));
    const p = empty[0];
    if (p && go(actor, { x: p.x, z: p.z + p.sign * .96 }, 'return-walk')) actor.homePortId = p.id;
    else actor.wait = 1;
  }
  function arrived(actor) {
    actor.time = 0; actor.speed = 0;
    if (actor.phase === 'work-walk') { actor.phase = 'align'; actor.heading = actor.plan.heading; }
    else if (['pickup-walk', 'retrieve'].includes(actor.phase)) {
      const record = store.records.get(actor.recordId), retrieving = actor.phase === 'retrieve';
      if (record && store.pickup(record.id, actor.id)) {
        actor.heading = Math.atan2(record.x - actor.x, record.z - actor.z); cue(actor, 'pickup'); totals.pickups++;
        actor.phase = retrieving ? 'return-plan' : 'carry';
      } else { actor.phase = 'idle'; actor.recordId = null; actor.wait = 1; }
    } else if (actor.phase === 'return-walk') {
      if (store.place(actor.homePortId, actor.id)) { cue(actor, 'place'); totals.placements++; actor.recordId = null; actor.phase = 'idle'; actor.wait = 1 + random() * 3; }
      else actor.phase = 'return-plan';
    } else if (actor.phase === 'patrol') { actor.phase = 'idle'; actor.wait = 1; }
  }
  function think(actor) {
    if (actor.wait > 0 || actor.role === 'rider' || actor.role === 'resting') return;
    if (actor.phase === 'return-plan') { returnFoup(actor); return; }
    if (actor.phase === 'patrol' && actor.role === 'repairer' && destruction.state.destroyedIds.length && actor.time > 3) release(actor);
    if (actor.phase !== 'idle') return;
    if (actor.role === 'thrower') pickTarget(actor); else selectWork(actor);
  }
  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .1); elapsed += dt;
    for (const actor of people) {
      actor.time += dt; actor.wait = Math.max(0, actor.wait - dt); actor.speed = 0;
      if (actor.role === 'rider') {
        const car = fleet.vehicles.find(v => v.id === actor.vehicleId).state.car;
        Object.assign(actor, { x: car.x, z: car.z, heading: car.yaw }); continue;
      }
      if (actor.role === 'resting') {
        if (!actor.wait) { const next = actor.posture === 'sit' ? 'lie' : 'sit', heading = findRestHeading(actor, actor.heading, next);
          if (heading !== null) { actor.posture = next; actor.heading = heading; cue(actor, next); }
          actor.wait = 35 + random() * 40; }
        continue;
      }
      if (actor.targetId !== null && (reserved(actor.targetId) || (actor.role === 'repairer') !== destruction.isDestroyed(actor.targetId))) { release(actor); actor.wait = 1; }
      if (actor.path.length) {
        const target = actor.path[0], length = distance(actor, target), step = Math.min(length, dt * (actor.role === 'repairer' ? 1.65 : 1.4));
        if (length > .0001) {
          const next = stepWalker(actor, (target.x - actor.x) / length * step, (target.z - actor.z) / length * step);
          const moved = distance(actor,next); actor.heading = Math.atan2(target.x - actor.x, target.z - actor.z);
          Object.assign(actor,next); actor.speed = moved / dt; actor.stepDistance += moved;
          if (actor.stepDistance > .86) { actor.stepDistance = 0; cue(actor,'step'); }
        }
        if (distance(actor,target) < .015) actor.path.shift();
        if (!actor.path.length) arrived(actor);
        else if (actor.time > 180) { release(actor); actor.wait = 1; }
      } else if (actor.phase === 'align' && actor.time >= .65) {
        actor.time = 0;
        if (actor.role === 'repairer') {
          if (destruction.beginRepair(actor.targetId, actor.id)) { actor.phase = 'repair'; actor.lastHammer = -1; }
          else { release(actor); actor.wait = 2; }
        } else actor.phase = 'press';
      } else if (actor.phase === 'repair') {
        destruction.setRepairProgress(actor.targetId, actor.time / 7);
        const hammer = Math.floor(actor.time * 15 / (Math.PI * 2));
        if (hammer !== actor.lastHammer) { actor.lastHammer = hammer; cue(actor,'repair'); }
        if (actor.time >= 7) { destruction.reset(actor.targetId); totals.repairs++; actor.actions++; cue(actor,'complete'); release(actor); actor.wait = 2; }
      } else if (actor.phase === 'press') {
        if (actor.time >= .5 && !actor.pressed) { actor.pressed = true; cue(actor,'press'); }
        if (actor.time >= 1.35) { if (destruction.trigger(actor.targetId)) { totals.breaks++; actor.actions++; } actor.pressed = false; release(actor); actor.wait = 12 + random() * 10; }
      } else if (actor.phase === 'carry' && actor.time >= .8) {
        const record = store.getCarried(actor.id), p = portMap.get(actor.homePortId);
        if (record) {
          // Turn from the loadport toward its open aisle before throwing.
          actor.heading = p?.sign === 1 ? 0 : Math.PI;
          if (actor.time >= 1.3) {
            store.launch(record, { x: actor.x + Math.sin(actor.heading) * .4, y: .9, z: actor.z + Math.cos(actor.heading) * .4, yaw: actor.heading },
              { x: Math.sin(actor.heading) * 2.8, y: 3.2, z: Math.cos(actor.heading) * 2.8 });
            totals.throws++; actor.actions++; cue(actor,'throw'); actor.phase = 'idle'; actor.wait = 2.5;
          }
        } else { actor.phase = 'idle'; actor.wait = 1; }
      }
      const held = store.getCarried(actor.id);
      if (held) Object.assign(held, { x: actor.x + Math.sin(actor.heading) * .34, y: .82, z: actor.z + Math.cos(actor.heading) * .34, yaw: actor.heading + Math.PI });
    }
    // At most one path search per rendered frame, regardless of population.
    think(people[planner++ % people.length]);
  }
  return { people, update, yieldMachine,
    get state() { return { total: people.length, simulated: true, roles: { ...RESIDENT_ROLES }, actions: { ...totals },
      people: people.map(p => ({ id:p.id, name:p.name, role:p.role, phase:p.phase, posture:p.posture, x:p.x,y:p.y,z:p.z,targetId:p.targetId,vehicleId:p.vehicleId,actions:p.actions })) }; }
  };
}

/** One instanced draw per shared body part, rather than 30 separate characters. */
export function createResidents({ THREE, scene, ...options }) {
  const simulation = createResidentSimulation(options), groups = new Map();
  const visuals = simulation.people.map(actor => {
    const avatar = createAvatar(THREE), badge = createVisitorBadge(THREE, scene, actor.name, { resident: true });
    // Build the optional tool once; identical hammer shapes are also batched.
    if (actor.role === 'repairer') avatar.update(0, { repairTime: 0 });
    avatar.update(0, {});
    const parts = []; avatar.root.traverse(mesh => { if (mesh.isMesh) {
      const hammer = mesh.parent.name === 'repair-hammer';
      const key = hammer ? `hammer:${mesh.geometry.type}` : mesh.geometry.uuid + mesh.material.uuid;
      if (!groups.has(key)) groups.set(key, { geometry:mesh.geometry, material:mesh.material, sources:[] });
      groups.get(key).sources.push({ mesh, actor }); parts.push(mesh);
    } });
    return { actor, avatar, badge, clock: 1, parts };
  });
  const zero = new THREE.Matrix4().makeScale(0,0,0);
  for (const group of groups.values()) {
    group.instance = new THREE.InstancedMesh(group.geometry, group.material, group.sources.length);
    group.instance.name = 'Resident avatars'; group.instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.instance.frustumCulled = false;
    group.sources.forEach((_,i) => group.instance.setMatrixAt(i,zero));
    scene.add(group.instance);
  }
  function update(dt, camera, overview = false) {
    simulation.update(dt);
    for (const visual of visuals) {
      const {actor:a, avatar, badge} = visual;
      visual.clock += dt;
      const d = distance(a,camera.position), near = d < 22, visible = overview || d < 88;
      if (visible && visual.clock >= (near ? 1/30 : 1/10)) {
        const step = Math.min(.1, visual.clock); visual.clock = 0;
        avatar.root.position.set(a.x,a.y,a.z);
        const repairing = a.phase === 'repair', pressing = a.phase === 'press';
        const target = repairing ? { ...a.plan.button, y:.96 + .16*Math.sin(a.time*15), z:a.plan.button.z+a.plan.button.sign*.09 } : pressing ? a.plan.button : null;
        avatar.update(step, { speed:a.speed, heading:a.heading, posture:a.posture, hanging:a.role==='rider', carrying:Boolean(options.store.getCarried(a.id)),
          repairTime:repairing?a.time:null, pressTarget:target, pressProgress:repairing?1:pressing?clamp(a.time/.48):0 });
      }
      a.renderVisible = visible;
      badge.update(avatar,a.posture); badge.sprite.visible = visible && d < 13 && !overview;
    }
    for (const group of groups.values()) {
      group.sources.forEach(({mesh,actor},i) => {
        let shown = actor.renderVisible;
        for (let node=mesh;node && shown;node=node.parent) shown = node.visible;
        group.instance.setMatrixAt(i, shown ? mesh.matrixWorld : zero);
      });
      group.instance.instanceMatrix.needsUpdate = true;
    }
  }
  return { update, yieldMachine: simulation.yieldMachine, get state() { return simulation.state; },
    dispose() { for (const group of groups.values()) { group.instance.removeFromParent(); group.instance.dispose(); } for (const v of visuals) { v.badge.dispose(); v.avatar.dispose(); } }
  };
}
