import { WALK_SPEED } from './locomotion.js?v=9063703070a2';
import { stepWalker } from './walking.js?v=9063703070a2';

// The 5.2 m centre aisle keeps a normal strip down the middle and open sides.
// Stop before the entrance rest area; these surfaces are never colliders.
export const WALKWAY_SPEED = WALK_SPEED * 2;
export const WALKWAY_LANES = Object.freeze([
  Object.freeze({ id: 'outbound', x: -1.05, width: 1.35, minZ: -78, maxZ: 72, direction: -1, label: '팹 안쪽', colour: '#3d817e' }),
  Object.freeze({ id: 'inbound', x: 1.05, width: 1.35, minZ: -78, maxZ: 72, direction: 1, label: '입구', colour: '#4b7395' })
]);
export function walkwayAt(p) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z) || (p.y ?? 0) > .15) return null;
  return WALKWAY_LANES.find(l => Math.abs(p.x-l.x) <= l.width/2 && p.z >= l.minZ && p.z <= l.maxZ) ?? null;
}

// Called after normal foot movement, before the existing avatar/camera update.
// Intent stays unchanged: a passenger may look around or step off either side.
export function applyWalkwayMotion(state, before, dt, { enabled = true, canTraverse = () => true } = {}) {
  if (!enabled || !Number.isFinite(dt) || dt <= 0 || dt > .1 || state.mode !== 'walk' || state.locked || state.posture !== 'stand' ||
      state.emoInteraction || state.repairInteraction || Number.isFinite(state.cleaningTime)) return null;
  const p = state.position, lane = walkwayAt(p);
  if (!lane) return null;
  const dx = p.x-before.x, dz = p.z-before.z;
  // Tap routes retain their waypoints and can leave/cross/travel against a belt.
  // Only boost a straight forward leg; never carry past a target or fight a route.
  const target = state.path?.[0];
  if (before.routed && (!target || Math.abs(target.x-p.x) > .025 || (target.z-p.z)*lane.direction <= 0)) return null;
  const forward = dz*lane.direction;
  const totalForward = Math.sqrt(Math.max(0, (WALKWAY_SPEED*dt)**2-dx*dx));
  let carry = Math.max(0, totalForward-Math.max(0, forward));
  if (target) carry = Math.min(carry, Math.max(0, (target.z-p.z)*lane.direction));
  const end = lane.direction > 0 ? lane.maxZ+.025 : lane.minZ-.025;
  carry = Math.min(carry, Math.max(0, (end-p.z)*lane.direction));
  const next = stepWalker(p, 0, carry*lane.direction, { canTraverse });
  p.x = next.x; p.z = next.z;
  // Deliberately keep heading, gait and camera angles: standing riders glide.
  return { id: lane.id, direction: lane.direction, speed: WALKWAY_SPEED };
}
