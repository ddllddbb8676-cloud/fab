import { bays, ports, CARRIED_FOUP_Y, SEATED_FOUP_Y } from './layout.js?v=2956557327b1';
import { network, findRoute, sampleRoute, joinRoutes } from './rail-network.js?v=2956557327b1';

const smooth = t => t * t * (3 - 2 * t);
const half = bays.length / 2;
const bayOrder = [bays[7], ...bays.filter(b => b.id !== 7)];
const secondaryPort = (bay, lane = 0) => bay.machines.find(m => m.sign === -1 && m.column === (lane === 0 ? 6 : 3)).ports[1];
const homePortFor = (bay, lane) => lane === 0 ? bay.target : bay.machines.find(m => m.sign === 1 && m.column === 1).ports[1];
const pairFor = bay => bays[(1 - bay.bank) * half + ((bay.id % half + 3) % half)];
export const DEFAULT_FLEET_SIZE = bays.length * 2;
const assignments = [0, 1].flatMap(lane => bayOrder.map(bay => ({ bay, lane })));
export const reservedPortIds = new Set(assignments.flatMap(({ bay, lane }) => [homePortFor(bay, lane).id, secondaryPort(bay, lane).id]));
const labels = ['로드포트 정차', 'FOUP 내려놓기', 'FOUP 분리', '빈 호이스트 회수', '빈 OHT 순환', '빈 호이스트 하강', 'FOUP 체결', 'FOUP 들어올리기', '다른 BAY로 운반'];
const durations = [1.5, 4, .8, 3.5, Infinity, 3.5, .8, 4, Infinity];
const circuitCache = new Map(), tripCache = new Map();
const portsById = new Map(ports.map(port => [port.id, port]));
function trip(a, b) {
  const k = `${a.id}>${b.id}`;
  if (!tripCache.has(k)) tripCache.set(k, findRoute(a.id, b.id));
  return tripCache.get(k);
}
function circuit(port) {
  if (!circuitCache.has(port.id)) {
    const bay = bays[port.bayId], waypointBay = bays[bay.bank * half + ((bay.id % half + 1) % half)];
    const waypoint = secondaryPort(waypointBay);
    circuitCache.set(port.id, joinRoutes(trip(port, waypoint), trip(waypoint, port)));
  }
  return circuitCache.get(port.id);
}
function poseAtPort(port) { return { x: port.x, z: port.z, yaw: port.sign === 1 ? Math.PI / 2 : -Math.PI / 2 }; }
function makeState(v) {
  const travelling = v.phase === 4 || v.phase === 8;
  const car = travelling ? sampleRoute(v.route, v.distance) : poseAtPort(v.currentPort);
  const f = Math.min(1, v.time / (durations[v.phase] || 1)), e = smooth(f);
  const lowered = v.passenger ? 0 : v.phase === 1 || v.phase === 5 ? e : v.phase === 2 || v.phase === 6 ? 1 : v.phase === 3 || v.phase === 7 ? 1 - e : 0;
  const gripperY = CARRIED_FOUP_Y + .265 - lowered * (CARRIED_FOUP_Y - SEATED_FOUP_Y);
  const parked = v.phase >= 2 && v.phase <= 6;
  const foup = parked ? { x: v.currentPort.x, y: SEATED_FOUP_Y, z: v.currentPort.z, yaw: v.currentPort.sign === 1 ? Math.PI : 0 } :
    { x: car.x, y: gripperY - .265, z: car.z, yaw: car.yaw + Math.PI / 2 };
  return { car, foup, gripperY, parked, lowered, phase: v.phase, hasCargo: !v.cargoDetached, passenger: Boolean(v.passenger), label: v.passenger ? '함께 FAB 산책' : v.waiting ? '교차로 양보' : labels[v.phase],
    travelling, waiting: v.waiting, target: v.currentPort, origin: v.currentPort, destination: v.destinationPort,
    delivered: v.delivered, routeDistance: v.distance, routeLength: v.route?.length ?? 0 };
}

// Lightweight one-way dispatch. Each junction is reserved before entry; nearby
// junctions are acquired together. Following cars keep a physical gap. The
// dispatcher is visual simulation, not a production AMHS controller.
export function createFleet(count = DEFAULT_FLEET_SIZE) {
  const junctionLocks = new Map();
  const vehicles = assignments.slice(0, Math.max(0, Math.min(Math.floor(count), assignments.length))).map(({ bay, lane }, id) => {
    const homePort = homePortFor(bay, lane), destinationPort = secondaryPort(pairFor(bay), lane);
    const phase = id % 3 === 0 ? 0 : 8;
    const v = { id, homePort, destinationPort, currentPort: homePort, phase, time: 0, distance: 0,
      route: phase === 8 ? trip(homePort, destinationPort) : null, speed: 2.35 + (id % 3) * .12, waiting: false, delivered: 0, state: null };
    v.state = makeState(v); return v;
  });
  let elapsed = 0;
  function releasePassed(v) {
    for (const [id, owner] of junctionLocks) {
      if (owner !== v.id) continue;
      const remains = v.route?.events.some(e => e.junctionId === id && e.distance >= v.distance - 2.4 && e.distance <= v.distance + 7);
      if (!remains || (v.phase !== 4 && v.phase !== 8)) junctionLocks.delete(id);
    }
  }
  function beginPhase(v, phase) {
    v.phase = phase; v.time = 0; v.distance = 0; v.waiting = false;
    v.route = phase === 4 ? circuit(v.currentPort) : phase === 8 ? trip(v.currentPort, v.destinationPort) : null;
    releasePassed(v);
  }
  function advance(v, dt) {
    if (v.boardingHold) { v.state = makeState(v); return; }
    releasePassed(v); v.waiting = false;
    if (v.phase !== 4 && v.phase !== 8) {
      v.time += dt;
      if (v.time >= durations[v.phase]) beginPhase(v, v.phase + 1);
      v.state = makeState(v); return;
    }
    const nextDistance = Math.min(v.route.length, v.distance + v.speed * dt);
    const events = v.route.events.filter(e => e.distance >= v.distance - 2.4 && e.distance <= nextDistance + 6);
    const unavailable = events.some(e => junctionLocks.has(e.junctionId) && junctionLocks.get(e.junctionId) !== v.id);
    const firstConflict = unavailable ? events.find(e => junctionLocks.get(e.junctionId) !== v.id) : null;
    let candidateDistance = firstConflict ? Math.min(nextDistance, Math.max(v.distance, firstConflict.distance - 3)) : nextDistance;
    const p = sampleRoute(v.route, candidateDistance);
    // A parked/hoisting OHT also occupies rail space and must be respected.
    const occupied = vehicles.some(other => other !== v && Math.hypot(p.x - other.state.car.x, p.z - other.state.car.z) < 1.65);
    if (occupied) {
      candidateDistance = v.distance;
      // A following car must not lock the junction needed by the car ahead.
      for (const e of events) if (e.distance > v.distance + 2.4 && junctionLocks.get(e.junctionId) === v.id) junctionLocks.delete(e.junctionId);
    } else if (!unavailable) for (const e of events) junctionLocks.set(e.junctionId, v.id);
    v.waiting = candidateDistance < nextDistance - 1e-7;
    v.distance = candidateDistance;
    if (v.distance >= v.route.length - 1e-8) {
      if (v.passenger || v.cargoDetached) {
        v.currentPort = portsById.get(v.route.to);
        v.tourIndex = ((v.tourIndex ?? v.currentPort.bayId) + 1) % bays.length;
        v.destinationPort = bays[v.tourIndex].target;
        beginPhase(v, 8);
      } else if (v.phase === 4) beginPhase(v, 5);
      else {
        const prior = v.currentPort; v.currentPort = v.destinationPort; v.destinationPort = prior; v.delivered++;
        beginPhase(v, 0);
      }
    }
    v.state = makeState(v);
  }
  return {
    vehicles, junctionLocks,
    holdVehicle(id, held = true) { const v = vehicles.find(v => v.id === id); if (!v) return false; v.boardingHold = held; return true; },
    detachCargo(id) { const v = vehicles.find(v => v.id === id); if (!v || v.cargoDetached) return false; v.cargoDetached = true; v.state = makeState(v); return true; },
    boardPassenger(id) {
      const v = vehicles.find(v => v.id === id); if (!v) return false;
      v.passenger = true; v.boardingHold = false;
      if (![4, 8].includes(v.phase)) beginPhase(v, 8);
      v.state = makeState(v); return true;
    },
    leavePassenger(id) { const v = vehicles.find(v => v.id === id); if (!v) return false; v.passenger = false; v.boardingHold = false; v.state = makeState(v); return true; },
    get elapsed() { return elapsed; },
    step(dt) {
      if (!Number.isFinite(dt) || dt < 0) return;
      let remaining = Math.min(dt, 1);
      while (remaining > 1e-8) {
        const step = Math.min(remaining, .04); elapsed += step;
        for (const v of vehicles) advance(v, step);
        remaining -= step;
      }
    },
    // Focus a real current operation without teleporting a vehicle or its FOUP.
    focusDemo() { return vehicles[0]; },
    get stats() { return { junctions: network.junctions.length, reservedJunctions: junctionLocks.size,
      waiting: vehicles.filter(v => v.state.waiting).length, delivered: vehicles.reduce((n, v) => n + v.delivered, 0) }; }
  };
}
