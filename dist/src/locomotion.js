export const WALK_SPEED = 3.2;
export const CHASE_CAMERA = Object.freeze({ distance: 5.8, elevation: .56, fov: 72 });
export const NPC_WALK_SPEED = 1.7;
export const NPC_REPAIR_SPEED = 2;
export const NPC_SAFETY_SPEED = 1.68; // Safety NPCs only: 20% slower than 2.1.

// nipplejs reports screen-right X and screen-up Y. Use a circular dead zone
// and cap the radius, so diagonals and dragging outside the base cannot sprint.
export function stickVector(x, y, deadZone = .12) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const length = Math.hypot(x, y);
  if (length <= deadZone) return { x: 0, y: 0 };
  const scale = (Math.min(1, length) - deadZone) / (1 - deadZone) / length;
  return { x: x * scale, y: y * scale };
}

export function cameraRelativeMove(x, y, yaw) {
  return { x: Math.cos(yaw) * x - Math.sin(yaw) * y,
    z: -Math.sin(yaw) * x - Math.cos(yaw) * y };
}
