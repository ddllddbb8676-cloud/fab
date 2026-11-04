import { AIR_SHOWER } from './air-shower.js?v=f55723afdac4';
import { bayFamilyIndices } from './equipment-catalog.js?v=f55723afdac4';
import { isRuntimeBlocked } from './runtime-obstacles.js?v=f55723afdac4';
import { stockerBounds, STOCKER_WALK_OUTER_X } from './stocker-layout.js?v=f55723afdac4';
import { entranceBounds, ENTRANCE } from './entrance-layout.js?v=f55723afdac4';
// Metres. A viewing model informed by bay-layout research, not a construction plan.
export const HALL = { width: 120, length: 180, height: 5 };
export const AISLE = 5.2, SERVICE_AISLE = 1.4, SIDE_GAP = .65, TOOL_SCALE_X = 103 / 120;
export const TOOL_WIDTH = 5.4 * TOOL_SCALE_X, TOOL_BACK = 2.4, TOOL_FRONT = 3.275;
export const PORT_Z = 2.89, PORT_SURFACE_Y = 1.4625;
export const FOUP_BASE_OFFSET = .2225, SEATED_FOUP_Y = PORT_SURFACE_Y + FOUP_BASE_OFFSET;
export const CARRIED_FOUP_Y = 3.59, VEHICLE_Y = 3.71, RAIL_Y = 4.26;
export const ROW_OFFSET = TOOL_FRONT + AISLE / 2;
export const BAY_PITCH = ROW_OFFSET * 2 + TOOL_BACK * 2 + SERVICE_AISLE;
export const BAY_CENTERS = Array.from({ length: 9 }, (_, i) => (i - 4) * BAY_PITCH);
export const BANK_CENTERS = [-28.7, 28.7];
export const machines = [], bays = [], ports = [];

// Keep the broad machine.bounds for inspection/camera framing, but walk against
// the real cabinet, projecting EFEM and monitor/EMO mounting post separately.
// The monitor keyboard is above the 1.45 m visitor; the red mushroom is the
// intentional hand-contact target rather than an obstacle across the whole bay.
export function getMachineWalkBounds(machine) {
  const { x, z, sign } = machine;
  const localBox = (part, x0, x1, z0, z1) => ({ part,
    minX: x + Math.min(sign * x0, sign * x1), maxX: x + Math.max(sign * x0, sign * x1),
    minZ: z + Math.min(sign * z0, sign * z1), maxZ: z + Math.max(sign * z0, sign * z1) });
  const monitorX = 2.12 * TOOL_SCALE_X;
  return [
    localBox('cabinet', -TOOL_WIDTH / 2, TOOL_WIDTH / 2, -TOOL_BACK, TOOL_BACK),
    localBox('efem', -1.9 * TOOL_SCALE_X, 1.5 * TOOL_SCALE_X, 2.345, TOOL_FRONT),
    localBox('monitor-post', monitorX - .17, monitorX + .17, 2.505, 2.7475)
  ];
}

// Clockwise rounded loop. Top service run travels toward +X.
export function makeLoop(minX, maxX, minZ, maxZ, radius = .7) {
  const segments = [], addLine = (x, z, dx, dz, length) => segments.push({ type: 'line', x, z, dx, dz, length });
  const addArc = (x, z, angle) => segments.push({ type: 'arc', x, z, angle, radius, length: Math.PI * radius / 2 });
  addLine(minX + radius, minZ, 1, 0, maxX - minX - radius * 2);
  addArc(maxX - radius, minZ + radius, -Math.PI / 2);
  addLine(maxX, minZ + radius, 0, 1, maxZ - minZ - radius * 2);
  addArc(maxX - radius, maxZ - radius, 0);
  addLine(maxX - radius, maxZ, -1, 0, maxX - minX - radius * 2);
  addArc(minX + radius, maxZ - radius, Math.PI / 2);
  addLine(minX, maxZ - radius, 0, -1, maxZ - minZ - radius * 2);
  addArc(minX + radius, minZ + radius, Math.PI);
  let length = 0;
  for (const s of segments) { s.start = length; length += s.length; }
  return { minX, maxX, minZ, maxZ, radius, segments, length };
}
export function sampleLoop(loop, distance) {
  let d = ((distance % loop.length) + loop.length) % loop.length;
  const s = loop.segments.find(s => d < s.start + s.length) || loop.segments.at(-1);
  d -= s.start;
  if (s.type === 'line') return { x: s.x + s.dx * d, z: s.z + s.dz * d, yaw: Math.atan2(s.dx, s.dz) };
  const a = s.angle + d / s.radius;
  return { x: s.x + Math.cos(a) * s.radius, z: s.z + Math.sin(a) * s.radius, yaw: Math.atan2(-Math.sin(a), Math.cos(a)) };
}
for (let bank = 0; bank < 2; bank++) for (let b = 0; b < BAY_CENTERS.length; b++) {
  const x = BANK_CENTERS[bank], z = BAY_CENTERS[b], id = bank * BAY_CENTERS.length + b;
  const bay = { id, bank, z, x, familyIndex: bayFamilyIndices[id], machines: [] };
  bay.loop = makeLoop(x - 26.9, x + 26.9, z - ROW_OFFSET + PORT_Z, z + ROW_OFFSET - PORT_Z);
  for (const sign of [1, -1]) for (let column = 0; column < 10; column++) {
    const m = { id: machines.length, bayId: id, bank, column, sign, familyIndex: bay.familyIndex,
      x: x + (column - 4.5) * (TOOL_WIDTH + SIDE_GAP), z: z - sign * ROW_OFFSET };
    m.bounds = { minX: m.x - TOOL_WIDTH / 2, maxX: m.x + TOOL_WIDTH / 2,
      minZ: m.z - (sign === 1 ? TOOL_BACK : TOOL_FRONT), maxZ: m.z + (sign === 1 ? TOOL_FRONT : TOOL_BACK) };
    m.walkBounds = getMachineWalkBounds(m);
    m.ports = Array.from({ length: 3 }, (_, j) => ({ id: `${m.id}:${j}`, machineId: m.id, bayId: id,
      x: m.x + sign * (-1.23 + j * 1.02) * TOOL_SCALE_X, z: m.z + sign * PORT_Z, y: PORT_SURFACE_Y,
      sign, index: j, reserved: sign === 1 && column === 4 && j === 1 }));
    ports.push(...m.ports); machines.push(m); bay.machines.push(m);
  }
  bay.target = bay.machines.flatMap(m => m.ports).find(p => p.reserved);
  bay.stopDistance = bay.target.x - (bay.loop.minX + bay.loop.radius);
  bays.push(bay);
}
export const columns = [-59.2, 59.2].flatMap(x => Array.from({ length: 8 }, (_, i) => ({ x, z: -84 + i * 24 })));
// The cabinets never move. Index their broad bounds once so each clearance
// sample checks nearby cabinets instead of scanning all 360. The narrow-phase
// comparisons below remain identical, including their boundary inequalities.
const collisionCellSize = 8, collisionCells = new Map();
for (const machine of machines) {
  const b = machine.bounds;
  for (let ix = Math.floor(b.minX / collisionCellSize); ix <= Math.floor(b.maxX / collisionCellSize); ix++) {
    for (let iz = Math.floor(b.minZ / collisionCellSize); iz <= Math.floor(b.maxZ / collisionCellSize); iz++) {
      const key = `${ix},${iz}`;
      if (!collisionCells.has(key)) collisionCells.set(key, []);
      collisionCells.get(key).push(machine);
    }
  }
}
export function isBlocked(x, z, margin = .28) {
  if (Math.abs(x) > 58.8 || Math.abs(z) > 88.5) return true;
  if (z > ENTRANCE.wallZ - margin && entranceBounds.some(b => x > b.minX - margin && x < b.maxX + margin && z < b.maxZ + margin)) return true;
  if((Math.abs(x)>56.5-margin||Math.abs(z)>82.2-margin)&&stockerBounds.some(b=>x>b.minX-margin&&x<b.maxX+margin&&z>b.minZ-margin&&z<b.maxZ+margin))return true;
  if (isRuntimeBlocked(x, z, margin)) return true;
  if (AIR_SHOWER.bounds.some(c => x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin)) return true;
  if (columns.some(c => Math.abs(x - c.x) < .27 + margin && Math.abs(z - c.z) < .27 + margin)) return true;
  const hits = ({ bounds: c, walkBounds }) => {
    if (x <= c.minX - margin || x >= c.maxX + margin || z <= c.minZ - margin || z >= c.maxZ + margin) return false;
    return walkBounds.some(b => x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin);
  };
  if (!Number.isFinite(margin) || margin < 0 || margin > collisionCellSize) return machines.some(hits);
  for (let ix = Math.floor((x - margin) / collisionCellSize); ix <= Math.floor((x + margin) / collisionCellSize); ix++) {
    for (let iz = Math.floor((z - margin) / collisionCellSize); iz <= Math.floor((z + margin) / collisionCellSize); iz++) {
      if (collisionCells.get(`${ix},${iz}`)?.some(hits)) return true;
    }
  }
  return false;
}
export const TOUR_POINTS = [
  [-4, BAY_CENTERS[7]], [-49, BAY_CENTERS[7]], [-STOCKER_WALK_OUTER_X, BAY_CENTERS[7]],
  [-STOCKER_WALK_OUTER_X, BAY_CENTERS[5]], [-48, BAY_CENTERS[5]], [0, BAY_CENTERS[5]],
  [0, BAY_CENTERS[3]], [49, BAY_CENTERS[3]], [STOCKER_WALK_OUTER_X, BAY_CENTERS[3]],
  [STOCKER_WALK_OUTER_X, BAY_CENTERS[7]], [4, BAY_CENTERS[7]], [-4, BAY_CENTERS[7]]
];
