// Shared by admission control, NPC creation and the visitor count display.
export const ROOM_CAPACITY = 100;
export const RESIDENT_ROLES = Object.freeze({ thrower: 5, rider: 5, resting: 5, repairer: 2, breaker: 13 });
export const SAFETY_PATROL_ROLES = Object.freeze(['safety-red', 'safety-red', 'safety-orange', 'safety-orange']);
export const AUTOMATED_COUNT = Object.values(RESIDENT_ROLES).reduce((total, count) => total + count, 0) + SAFETY_PATROL_ROLES.length;
export const MAX_VISITORS = ROOM_CAPACITY - AUTOMATED_COUNT;
