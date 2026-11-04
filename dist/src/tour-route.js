import { TOUR_POINTS } from './layout.js?v=9de751eb80da';
import { findWalkPath, canWalkSegment } from './walking.js?v=9de751eb80da';

const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const point = p => ({ x: p.x, z: p.z });

// Join the nearest reachable part of the loop from the visitor's actual position.
// Never replace the starting position with a route waypoint.
export function createTourRoute(start, speed = 1.85) {
  const loop = TOUR_POINTS.slice(0, -1).map(([x, z]) => ({ x, z }));
  const candidates = loop.map((a, index) => {
    const b = loop[(index + 1) % loop.length], dx = b.x - a.x, dz = b.z - a.z;
    const f = Math.max(0, Math.min(1, ((start.x - a.x) * dx + (start.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const anchor = { x: a.x + dx * f, z: a.z + dz * f };
    return { index, anchor, distance: distance(start, anchor) };
  }).sort((a, b) => a.distance - b.distance);
  let selected = null, connector = null;
  for (const candidate of candidates) {
    const path = findWalkPath(start, candidate.anchor);
    if (path) { selected = candidate; connector = path; break; }
  }
  if (!selected) return null;
  const waypoints = [];
  let last = point(start);
  function append(p) {
    if (distance(last, p) < 1e-7) return;
    if (!canWalkSegment(last, p)) throw new Error('Tour segment must have walking clearance');
    waypoints.push(point(p)); last = point(p);
  }
  connector.forEach(append);
  const loopStart = waypoints.length;
  for (let step = 1; step <= loop.length; step++) append(loop[(selected.index + step) % loop.length]);
  append(selected.anchor);
  const position = point(start);
  let cursor = 0;
  return {
    position, waypoints, loopStart, anchor: selected.anchor, speed,
    advance(dt) {
      let remaining = Math.max(0, dt) * speed, travelled = 0, heading = null, guard = 0;
      while (remaining > 1e-8 && waypoints.length && guard++ < 1000) {
        if (cursor >= waypoints.length) cursor = loopStart;
        const next = waypoints[cursor], d = distance(position, next);
        if (d < 1e-7) { cursor++; continue; }
        const amount = Math.min(d, remaining), dx = (next.x - position.x) / d, dz = (next.z - position.z) / d;
        // Check only this bounded step: checking an entire long aisle every frame
        // would make the walking controller unnecessarily expensive on mobile.
        if (!canWalkSegment(position, { x: position.x + dx * amount, z: position.z + dz * amount })) break;
        position.x += dx * amount; position.z += dz * amount;
        heading = Math.atan2(dx, dz); remaining -= amount; travelled += amount;
        if (amount >= d - 1e-8) cursor++;
      }
      return { ...position, speed: dt > 0 ? travelled / dt : 0, heading, cursor };
    }
  };
}
