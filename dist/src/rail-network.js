import { ports, BAY_CENTERS, PORT_Z, ROW_OFFSET } from './layout.js?v=935ae134356b';

// Alternating one-way process runs and four one-way inter-bay trunks.
// Port coordinates are unchanged. Every port is a real graph vertex.
export const TURN_RADIUS = .65;
const TRUNKS = [-55.6, -1.8, 1.8, 55.6];
const levels = BAY_CENTERS.flatMap(z => [z - ROW_OFFSET + PORT_Z, z + ROW_OFFSET - PORT_Z]);
const key = (x, z) => `${x.toFixed(5)},${z.toFixed(5)}`;
const nodeMap = new Map(), nodes = [], edges = [], portNodes = new Map();
function node(x, z) {
  const k = key(x, z);
  if (!nodeMap.has(k)) { const n = { id: nodes.length, x, z, outgoing: [], incoming: [], portIds: [] }; nodeMap.set(k, n); nodes.push(n); }
  return nodeMap.get(k);
}
function edge(a, b, kind) {
  const e = { id: edges.length, from: a.id, to: b.id, length: Math.hypot(b.x - a.x, b.z - a.z), kind };
  edges.push(e); a.outgoing.push(e.id); b.incoming.push(e.id);
}
for (const p of ports) { const n = node(p.x, p.z); n.portIds.push(p.id); portNodes.set(p.id, n.id); }
for (let i = 0; i < levels.length; i++) {
  const z = levels[i], direction = i % 2 === 0 ? 1 : -1;
  for (const x of TRUNKS) node(x, z);
  const row = nodes.filter(n => Math.abs(n.z - z) < 1e-6).sort((a, b) => direction * (a.x - b.x));
  for (let j = 1; j < row.length; j++) edge(row[j - 1], row[j], 'service');
}
for (let i = 0; i < TRUNKS.length; i++) {
  const direction = i % 2 === 0 ? -1 : 1;
  const row = levels.map(z => node(TRUNKS[i], z)).sort((a, b) => direction * (a.z - b.z));
  for (let j = 1; j < row.length; j++) edge(row[j - 1], row[j], 'trunk');
}
const junctions = nodes.filter(n => n.incoming.length + n.outgoing.length >= 3);
const junctionIds = new Set(junctions.map(n => n.id));
export const network = { nodes, edges, junctions, portNodes, levels, trunks: TRUNKS };

function arcPoints(a, corner, b, radius = TURN_RADIUS) {
  const d1 = { x: Math.sign(corner.x - a.x), z: Math.sign(corner.z - a.z) };
  const d2 = { x: Math.sign(b.x - corner.x), z: Math.sign(b.z - corner.z) };
  const start = { x: corner.x - d1.x * radius, z: corner.z - d1.z * radius };
  const end = { x: corner.x + d2.x * radius, z: corner.z + d2.z * radius };
  const center = { x: start.x + d2.x * radius, z: start.z + d2.z * radius };
  const angle = Math.atan2(start.z - center.z, start.x - center.x);
  const turn = d1.x * d2.z - d1.z * d2.x;
  return { start, end, center, angle, turn, radius, length: Math.PI * radius / 2 };
}
function pointOnArc(arc, distance) {
  const a = arc.angle + arc.turn * distance / arc.radius;
  return { x: arc.center.x + Math.cos(a) * arc.radius, z: arc.center.z + Math.sin(a) * arc.radius,
    yaw: Math.atan2(-Math.sin(a) * arc.turn, Math.cos(a) * arc.turn) };
}
export const railPaths = [
  ...levels.map(z => ({ kind: 'service', points: [{ x: TRUNKS[0], z }, { x: TRUNKS.at(-1), z }] })),
  ...TRUNKS.map(x => ({ kind: 'trunk', points: [{ x, z: levels[0] }, { x, z: levels.at(-1) }] }))
];
const switchKeys = new Set();
for (const n of nodes) for (const incoming of n.incoming) for (const outgoing of n.outgoing) {
  const a = nodes[edges[incoming].from], b = nodes[edges[outgoing].to];
  if ((n.x - a.x) * (b.z - n.z) === (n.z - a.z) * (b.x - n.x)) continue;
  const arc = arcPoints(a, n, b);
  const k = [key(arc.start.x, arc.start.z), key(arc.end.x, arc.end.z)].sort().join('|');
  if (switchKeys.has(k)) continue;
  switchKeys.add(k);
  railPaths.push({ kind: 'switch', junctionId: n.id, points: Array.from({ length: 17 }, (_, i) => pointOnArc(arc, arc.length * i / 16)) });
}

function resolveNode(id) {
  if (typeof id === 'number') return id;
  const n = portNodes.get(id);
  if (n === undefined) throw new Error(`Unknown load port: ${id}`);
  return n;
}
export function findRoute(fromPortId, toPortId) {
  const start = resolveNode(fromPortId), goal = resolveNode(toPortId);
  const dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1), visited = new Uint8Array(nodes.length);
  dist[start] = 0;
  for (let count = 0; count < nodes.length; count++) {
    let current = -1, best = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!visited[i] && dist[i] < best) { current = i; best = dist[i]; }
    if (current < 0) break;
    if (current === goal) break;
    visited[current] = 1;
    for (const id of nodes[current].outgoing) {
      const e = edges[id], cost = best + e.length;
      if (cost < dist[e.to]) { dist[e.to] = cost; prev[e.to] = current; }
    }
  }
  if (!Number.isFinite(dist[goal])) throw new Error(`Disconnected rail route: ${fromPortId} → ${toPortId}`);
  const ids = [goal]; while (ids[0] !== start) ids.unshift(prev[ids[0]]);
  const raw = ids.map(id => nodes[id]), compact = raw.filter((n, i) => !i || i === raw.length - 1 ||
    (n.x - raw[i - 1].x) * (raw[i + 1].z - n.z) !== (n.z - raw[i - 1].z) * (raw[i + 1].x - n.x));
  const segments = [], events = []; let cursor = compact[0], length = 0;
  function line(a, b) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-8) return;
    const s = { type: 'line', a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z }, length: len, start: length, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
    segments.push(s);
    for (const n of junctions) {
      const projection = ((n.x - a.x) * (b.x - a.x) + (n.z - a.z) * (b.z - a.z)) / len;
      const perpendicular = Math.abs((n.x - a.x) * (b.z - a.z) - (n.z - a.z) * (b.x - a.x)) / len;
      if (perpendicular < 1e-6 && projection >= 0 && projection <= len) events.push({ junctionId: n.id, distance: length + projection });
    }
    length += len;
  }
  for (let i = 1; i < compact.length - 1; i++) {
    const n = compact[i], arc = arcPoints(compact[i - 1], n, compact[i + 1]);
    line(cursor, arc.start);
    segments.push({ ...arc, type: 'arc', start: length });
    if (junctionIds.has(n.id)) events.push({ junctionId: n.id, distance: length + arc.length / 2 });
    length += arc.length; cursor = arc.end;
  }
  if (compact.length > 1) line(cursor, compact.at(-1));
  events.sort((a, b) => a.distance - b.distance);
  return { from: fromPortId, to: toPortId, nodeIds: ids, segments, events, length, startPoint: raw[0], endPoint: raw.at(-1) };
}
export function sampleRoute(route, distance) {
  const d = Math.max(0, Math.min(distance, route.length));
  const s = route.segments.find(s => d < s.start + s.length) || route.segments.at(-1);
  if (!s) return { x: route.startPoint.x, z: route.startPoint.z, yaw: 0 };
  const along = Math.max(0, Math.min(s.length, d - s.start));
  if (s.type === 'arc') return pointOnArc(s, along);
  return { x: s.a.x + (s.b.x - s.a.x) * along / s.length, z: s.a.z + (s.b.z - s.a.z) * along / s.length, yaw: s.yaw };
}
export function joinRoutes(...routes) {
  let length = 0; const segments = [], events = [], nodeIds = [];
  for (const r of routes) {
    segments.push(...r.segments.map(s => ({ ...s, start: s.start + length })));
    events.push(...r.events.map(e => ({ ...e, distance: e.distance + length })));
    nodeIds.push(...r.nodeIds); length += r.length;
  }
  return { from: routes[0].from, to: routes.at(-1).to, segments, events, nodeIds, length, startPoint: routes[0].startPoint, endPoint: routes.at(-1).endPoint };
}
