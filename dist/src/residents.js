import { machines, bays, ports, BAY_CENTERS } from './layout.js?v=9d9367db83f5';
import { NPC_WALK_SPEED, NPC_REPAIR_SPEED } from './locomotion.js?v=9d9367db83f5';
import { findWalkPath } from './walking.js?v=9d9367db83f5';
import {stepNpc,rerouteNpc,npcDestination} from './npc-navigation.js?v=9d9367db83f5';
import { getEmoApproach } from './emo-interaction.js?v=9d9367db83f5';
import { findRestHeading } from './posture.js?v=9d9367db83f5';
import { createVisitorName, createVisitorBadge } from './visitor-name.js?v=9d9367db83f5';
import {npcDestructionTitle} from './destruction-titles.js?v=9d9367db83f5';
import { createAvatar } from './avatar.js?v=9d9367db83f5';
import {createAvatarAppearance} from './avatar-appearance.js?v=9d9367db83f5';
import {npcOutfit} from './npc-outfits.js?v=9d9367db83f5';
import { floorSpot } from './foup-play.js?v=9d9367db83f5';
import { reservedPortIds } from './network-transport.js?v=9d9367db83f5';

import { RESIDENT_ROLES } from './room-population.js?v=9d9367db83f5';
export { RESIDENT_ROLES };
export const REPAIR_STOCK=Object.freeze({minimum:50,target:60,repairGraceSeconds:45});
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = n => Math.max(0, Math.min(1, n));

/** World state, separate from rendering: shared cargo identities and per-tool claims. */
export function createResidentSimulation({ fleet, store, destruction, detachCargo, protectedIds = () => [], getNeighbors=()=>[], onCue = () => {}, random = Math.random, excludedNames = [] }) {
  const reservedNames = [...excludedNames];
  const people = [], claims = new Map(), portMap = new Map(ports.map(p => [p.id, p]));
  const totals = { throws: 0, repairs: 0, breaks: 0, pickups: 0, placements: 0 };
  const recentRepairs=new Map();let previousDamage=new Set(destruction.state.destroyedIds);
  let elapsed = 0, planner = 0;
  const choose = items => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  for (const [role, count] of Object.entries(RESIDENT_ROLES)) for (let i = 0; i < count; i++) {
    const index = people.length, bay = bays[(index * 7 + 8) % bays.length];
    const name = createVisitorName(random, reservedNames); reservedNames.push(name);
    const actor = { id: `resident:${index}`, role, name, index, x: bay.x + (i % 3 - 1) * 7, y: 0, z: bay.z+(Math.floor(index/18)-1)*.85,
      heading: random() * Math.PI * 2, speed: 0, posture: 'stand', phase: 'idle', path: [], time: 0, wait: i * .8,
      bayId: bay.id, targetId: null, recordId: null, homePortId: null, nextThink: 0, stepDistance: 0, actions: 0, brokenCount:8+(index*7)%4, repairedCount:0 };
    if (role === 'resting') {
      const m = bay.machines[2 + i % 5], next = bay.machines[3 + i % 5];
      // Some rest in the narrow equipment gaps, some at the edge of the broad aisle.
      if (i % 2 === 0) { actor.x = (m.x + next.x) / 2; actor.z = m.z; }
      else { actor.x = bay.x + (i - 4) * 3; actor.z = bay.z + (i % 3 - 1) * 1.4; }
      if (i === 1 || i === 6) { actor.x = i === 1 ? -1.5 : 1.5; actor.z = i === 1 ? 74 : 69; }
      actor.posture = i % 2 === 0 ? 'sit' : 'lie';
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
    if(['caught-lap','patrol'].includes(phase))destination=npcDestination(actor,destination,[...people,...getNeighbors()]);
    const path = findWalkPath(actor, destination);
    if (!path) return false;
    actor.path = path; actor.phase = phase; actor.time = 0; actor.posture = 'stand'; return true;
  }
  function cue(actor, kind) { onCue(kind, actor); }
  function patrol(actor) {
    const bay = choose(bays), destination = { x: bay.x + (random() - .5) * 40, z: bay.z+(random()-.5)*1.8 };
    if (!go(actor, destination, 'patrol')) actor.wait = 2;
  }
  function beginSafetyLap(actor) {
    if(!people.includes(actor)||actor.penalty||elapsed<(actor.safeUntil||0)||['repair','riding','climb'].includes(actor.phase))return false;
    const home={x:actor.x,z:actor.z},posture=actor.posture,heading=actor.heading;
    const bay=bays.reduce((best,b)=>distance(actor,b)<distance(actor,best)?b:best,bays[0]);
    const row=bay.machines.filter(m=>m.sign===1);
    const edges=[bay.bank===0?-57.4:0,...row.slice(0,-1).map((m,i)=>(m.x+row[i+1].x)/2),bay.bank===0?0:57.4];
    const nearest=edges.reduce((best,x,i)=>Math.abs(x-actor.x)<Math.abs(edges[best]-actor.x)?i:best,0);
    const other=nearest===edges.length-1?nearest-1:nearest+1;
    const nextBay=bays[bay.id+(bay.id%BAY_CENTERS.length===BAY_CENTERS.length-1?-1:1)];
    const corners=[{x:edges[nearest],z:bay.z},{x:edges[other],z:bay.z},{x:edges[other],z:nextBay.z},{x:edges[nearest],z:nextBay.z}];
    const first=corners.reduce((best,p,i)=>distance(actor,p)<distance(actor,corners[best])?i:best,0);
    const loop=corners.slice(first).concat(corners.slice(0,first));
    const held=store.getCarried(actor.id);
    if(held)store.launch(held,{x:actor.x,y:.6,z:actor.z},{x:0,y:0,z:0});
    release(actor);actor.pressed=false;actor.posture='stand';actor.y=0;actor.penalty=3;actor.wait=0;
    actor.lap={waypoints:[...loop,loop[0],home],posture,heading};actor.phase='caught-lap-plan';
    return true;
  }
  function finishSafetyLap(actor) {
    const previous=actor.lap;delete actor.lap;actor.penalty=0;actor.safeUntil=elapsed+12;
    release(actor);actor.wait=1;
    if(actor.role==='resting') {
      actor.phase='rest';actor.posture=previous.posture;
      actor.heading=findRestHeading(actor,previous.heading,actor.posture)??previous.heading;
      actor.wait=35+random()*40;
    }
  }
  function selectWork(actor) {
    const repairing = actor.role === 'repairer';
    const damaged = new Set(destruction.state.destroyedIds),pressure=new Array(bays.length).fill(0);
    let repairingCount=0,breakingCount=0;
    for(const id of damaged)pressure[machines[id].bayId]++;
    for(const person of people)if(person.targetId!==null){
      if(person.role==='repairer'&&damaged.has(person.targetId))repairingCount++;
      if(person.role==='breaker'&&!damaged.has(person.targetId)){breakingCount++;pressure[machines[person.targetId].bayId]++;}
    }
    if(repairing?damaged.size-repairingCount<=REPAIR_STOCK.minimum:damaged.size+breakingCount>=REPAIR_STOCK.target){patrol(actor);return;}
    const candidates = machines.filter(m => !reserved(m.id) && !claims.has(m.id) && (repairing ? damaged.has(m.id) : !damaged.has(m.id)&&!recentRepairs.has(m.id)));
    // Count both broken tools and other breakers' destinations before assigning
    // the least damaged bay. Claims stop all thirteen NPCs picking the same bay.
    const preferred=repairing?Math.max(...candidates.map(m=>pressure[m.bayId])):Math.min(...candidates.map(m=>pressure[m.bayId]));
    const balanced=candidates.filter(m=>pressure[m.bayId]===preferred).sort((a,b)=>distance(actor,a)-distance(actor,b));
    const nearby = balanced.slice(0, repairing ? 5 : 8), machine = choose(nearby);
    if (!machine) { patrol(actor); return; }
    const plan = getEmoApproach(machine);
    if (!go(actor, plan.destination, 'work-walk')) { actor.wait = 1; return; }
    actor.targetId = machine.id; actor.plan = plan; claims.set(machine.id, actor.id);
  }
  function pickTarget(actor) {
    // Reuse the last thrown FOUP before taking another; the world never fills with copies.
    const previous = store.records.get(actor.recordId);
    if (previous && !previous.gold && previous.mode === 'ground') {
      const target = floorSpot({ x: previous.x, z: previous.z + .55 });
      if (target && go(actor, target, 'retrieve')) return;
    }
    if (previous && ['flying', 'carried', 'broken', 'cleared'].includes(previous.mode)) { actor.wait = 2; return; }
    const candidates = ports.filter(p => !reservedPortIds.has(p.id) && !reserved(p.machineId) && store.atPort(p.id)&&!store.atPort(p.id).gold&&!people.some(other=>other!==actor&&other.recordId===store.atPort(p.id).id))
      .sort((a,b) => distance(actor, a) - distance(actor,b)).slice(0, 12);
    const p = choose(candidates);
    if (!p) { patrol(actor); return; }
    if (go(actor, { x: p.x, z: p.z + p.sign * .96 }, 'pickup-walk')) {
      actor.recordId = store.atPort(p.id).id; actor.homePortId = p.id;
    }
  }
  function returnFoup(actor) {
    const empty = ports.filter(p => !reservedPortIds.has(p.id) && !reserved(p.machineId) && !destruction.isDestroyed(p.machineId) && !store.occupied(p.id)&&!people.some(other=>other!==actor&&other.phase==='return-walk'&&other.homePortId===p.id))
      .sort((a,b) => distance(actor,a) - distance(actor,b));
    const p = empty[0];
    if (p && go(actor, { x: p.x, z: p.z + p.sign * .96 }, 'return-walk')) actor.homePortId = p.id;
    else actor.wait = 1;
  }
  function arrived(actor) {
    actor.time = 0; actor.speed = 0;
    if (actor.phase === 'caught-lap') {
      if(actor.lap.waypoints.length)actor.phase='caught-lap-plan';else finishSafetyLap(actor);
    } else if (actor.phase === 'work-walk') { actor.phase = 'align'; actor.heading = actor.plan.heading; }
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
    if(actor.phase==='caught-lap-plan') {
      if(actor.wait>0)return;
      if(go(actor,actor.lap.waypoints[0],'caught-lap'))actor.lap.waypoints.shift();else actor.wait=1;
      return;
    }
    if (actor.wait > 0 || actor.role === 'rider' || actor.role === 'resting') return;
    if (actor.phase === 'return-plan') { returnFoup(actor); return; }
    const damagedCount=destruction.state.destroyedIds.length;
    if(actor.phase==='patrol'&&actor.time>1&&((actor.role==='repairer'&&damagedCount>REPAIR_STOCK.minimum)||(actor.role==='breaker'&&damagedCount<REPAIR_STOCK.target)))release(actor);
    if (actor.phase !== 'idle') return;
    if (actor.role === 'thrower') pickTarget(actor); else selectWork(actor);
  }
  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .1); elapsed += dt;
    const damage=new Set(destruction.state.destroyedIds);
    for(const id of previousDamage)if(!damage.has(id))recentRepairs.set(id,elapsed+REPAIR_STOCK.repairGraceSeconds);
    previousDamage=damage;
    for(const [id,until]of recentRepairs)if(elapsed>=until)recentRepairs.delete(id);
    const neighbors=[...people,...getNeighbors()];
    for (const actor of people) {
      actor.time += dt; actor.wait = Math.max(0, actor.wait - dt); actor.speed = 0;
      if (actor.role === 'rider') {
        const car = fleet.vehicles.find(v => v.id === actor.vehicleId).state.car;
        Object.assign(actor, { x: car.x, z: car.z, heading: car.yaw }); continue;
      }
      if (actor.role === 'resting' && !actor.lap) {
        if (!actor.wait) { const next = actor.posture === 'sit' ? 'lie' : 'sit', heading = findRestHeading(actor, actor.heading, next);
          if (heading !== null) { actor.posture = next; actor.heading = heading; cue(actor, next); }
          actor.wait = 35 + random() * 40; }
        continue;
      }
      if (actor.targetId !== null && (reserved(actor.targetId) || (actor.role === 'repairer') !== destruction.isDestroyed(actor.targetId))) { release(actor); actor.wait = 1; }
      if (actor.path.length) {
        const target = actor.path[0], length = distance(actor, target);
        if (length > .0001) {
          const next = stepNpc(actor,target,dt,actor.role==='repairer'?NPC_REPAIR_SPEED:NPC_WALK_SPEED,neighbors);
          const moved = distance(actor,next); if(moved>.0001)actor.heading = Math.atan2(next.x-actor.x,next.z-actor.z);
          Object.assign(actor,next); actor.speed = moved / dt; actor.stepDistance += moved;
          if (actor.stepDistance > .86) { actor.stepDistance = 0; cue(actor,'step'); }
        }
        if (distance(actor,target) < .015) actor.path.shift();
        if (!actor.path.length) arrived(actor);
        else if (actor.time > 180) {
          if(actor.lap){actor.lap.waypoints.unshift(actor.path.at(-1));actor.path=[];actor.phase='caught-lap-plan';actor.time=0;}
          else release(actor);
          actor.wait = 1;
        }
      } else if (actor.phase === 'align' && actor.time >= .65) {
        actor.time = 0;
        if (actor.role === 'repairer') {
          if (destruction.state.destroyedIds.length>REPAIR_STOCK.minimum&&destruction.beginRepair(actor.targetId, actor.id)) { actor.phase = 'repair'; actor.lastHammer = -1; }
          else { release(actor); actor.wait = 2; }
        } else if(destruction.state.destroyedIds.length<REPAIR_STOCK.target)actor.phase = 'press';
        else{release(actor);actor.wait=2;}
      } else if (actor.phase === 'repair') {
        destruction.setRepairProgress(actor.targetId, actor.time / 7);
        const hammer = Math.floor(actor.time * 15 / (Math.PI * 2));
        if (hammer !== actor.lastHammer) { actor.lastHammer = hammer; cue(actor,'repair'); }
        if (actor.time >= 7) {
          if(destruction.state.destroyedIds.length>REPAIR_STOCK.minimum&&destruction.reset(actor.targetId)){
            recentRepairs.set(actor.targetId,elapsed+REPAIR_STOCK.repairGraceSeconds);totals.repairs++;actor.repairedCount++;actor.actions++;cue(actor,'complete');
          }
          release(actor);actor.wait=2;
        }
      } else if (actor.phase === 'press') {
        if (actor.time >= .5 && !actor.pressed) { actor.pressed = true; cue(actor,'press'); }
        if (actor.time >= 1.35) {
          if(destruction.state.destroyedIds.length<REPAIR_STOCK.target&&destruction.trigger(actor.targetId)){totals.breaks++;actor.brokenCount++;actor.actions++;}
          actor.pressed=false;release(actor);actor.wait=destruction.state.destroyedIds.length<REPAIR_STOCK.target?1+random():12+random()*10;
        }
      } else if (actor.phase === 'carry' && actor.time >= .8) {
        const record = store.getCarried(actor.id), p = portMap.get(actor.homePortId);
        if (record) {
          // Turn from the loadport toward its open aisle before throwing.
          actor.heading = p?.sign === 1 ? 0 : Math.PI;
          if (actor.time >= 1.3) {
            store.launch(record, { x: actor.x + Math.sin(actor.heading) * .4, y: .9, z: actor.z + Math.cos(actor.heading) * .4, yaw: actor.heading },
              { x: Math.sin(actor.heading) * 2.8, y: 3.2, z: Math.cos(actor.heading) * 2.8 }, {shatter:true});
            totals.throws++; actor.actions++; cue(actor,'throw'); actor.phase = 'idle'; actor.wait = 2.5;
          }
        } else { actor.phase = 'idle'; actor.wait = 1; }
      }
      const held = store.getCarried(actor.id);
      if (held) Object.assign(held, { x: actor.x + Math.sin(actor.heading) * .34, y: .82, z: actor.z + Math.cos(actor.heading) * .34, yaw: actor.heading + Math.PI });
    }
    // At most one path search per rendered frame, regardless of population.
    const next=people[planner++ % people.length];
    if(!rerouteNpc(next,neighbors,elapsed))think(next);
  }
  return { people, update, yieldMachine, beginSafetyLap,
    get state() { return { total: people.length, simulated: true, roles: { ...RESIDENT_ROLES }, actions: { ...totals },
      people: people.map(p => ({ id:p.id, name:p.name, role:p.role, phase:p.phase, posture:p.posture, x:p.x,y:p.y,z:p.z,targetId:p.targetId,vehicleId:p.vehicleId,actions:p.actions,penalty:p.penalty||0 })) }; }
  };
}

/** One instanced draw per shared body part, rather than 30 separate characters. */
export function createResidents({ THREE, scene, ...options }) {
  const simulation = createResidentSimulation(options), groups = new Map();
  const visuals = simulation.people.map(actor => {
    const avatar = createAvatar(THREE), badge = createVisitorBadge(THREE, scene, actor.name, { resident: true });
    badge.setTitle(npcDestructionTitle(actor.id,actor.role)?.id);
    const appearance=createAvatarAppearance(THREE,avatar,{scene,external:true});appearance.setOutfit(npcOutfit(actor.id),actor.role);
    // Build the optional tool once; identical hammer shapes are also batched.
    if (actor.role === 'repairer') avatar.update(0, { repairTime: 0 });
    avatar.update(0, {});
    const parts = []; avatar.root.traverse(mesh => { if (mesh.isMesh&&mesh.name!=='face') {
      const hammer = mesh.parent.name === 'repair-hammer';
      const key = hammer ? `hammer:${mesh.geometry.type}` : mesh.geometry.uuid + mesh.material.uuid;
      if (!groups.has(key)) groups.set(key, { geometry:mesh.geometry, material:mesh.material, sources:[] });
      groups.get(key).sources.push({ mesh, actor }); parts.push(mesh);
    } });
    return { actor, avatar, badge, appearance, clock: 1, parts };
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
      visual.appearance.update(visible&&!overview&&d<32);
      badge.update(avatar,a.posture,{headwear:visual.appearance.headwear,camera}); badge.sprite.visible = visible && d < 18 && !overview;
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
  return { update, people:simulation.people, beginSafetyLap:simulation.beginSafetyLap, yieldMachine: simulation.yieldMachine, get state() { return simulation.state; },
    dispose() { for (const group of groups.values()) { group.instance.removeFromParent(); group.instance.dispose(); } for (const v of visuals) { v.badge.dispose(); v.appearance.dispose(); v.avatar.dispose(); } }
  };
}
