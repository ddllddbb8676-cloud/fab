import { isBlocked } from './layout.js?v=85d42af6a700';

// Rest in the current spot, rotating along a narrow aisle when necessary.
// This capsule includes the hood, boots and relaxed arms, not just the feet.
export function restPoseFits(position, heading, posture) {
  const half = posture === 'lie' ? .49 : .12;
  for (let i = 0; i <= 12; i++) {
    const offset = -half + 2 * half * i / 12;
    if (isBlocked(position.x + Math.sin(heading) * offset, position.z + Math.cos(heading) * offset, .28)) return false;
  }
  return true;
}

export function findRestHeading(position, heading, posture) {
  if (!['sit', 'lie'].includes(posture)) return null;
  const candidates = [heading, 0, Math.PI / 2, Math.PI, -Math.PI / 2];
  candidates.sort((a, b) => Math.abs(Math.atan2(Math.sin(a - heading), Math.cos(a - heading))) - Math.abs(Math.atan2(Math.sin(b - heading), Math.cos(b - heading))));
  return candidates.find(angle => restPoseFits(position, angle, posture)) ?? null;
}
