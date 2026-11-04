// The entrance opens into a small central forecourt. Recessed service wings
// replace the unused 8 m strip behind the final equipment rows.
export const ENTRANCE = Object.freeze({ halfWidth: 14, wallZ: 82, rearZ: 90, serviceZ: 81.2, height: 5 });
export const entranceBounds = Object.freeze([
  Object.freeze({ minX: -60, maxX: -ENTRANCE.halfWidth, minZ: ENTRANCE.wallZ, maxZ: ENTRANCE.rearZ, minY: 0, maxY: ENTRANCE.height }),
  Object.freeze({ minX: ENTRANCE.halfWidth, maxX: 60, minZ: ENTRANCE.wallZ, maxZ: ENTRANCE.rearZ, minY: 0, maxY: ENTRANCE.height })
]);
