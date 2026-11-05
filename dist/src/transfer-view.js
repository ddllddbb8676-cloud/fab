import { VEHICLE_Y, RAIL_Y, PORT_SURFACE_Y } from './layout.js?v=9063703070a2';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const activeRank = new Map([[1, 0], [7, 0], [5, 1], [0, 2], [6, 3], [2, 3], [3, 4], [4, 5]]);
export function selectTransferVehicle(vehicles, observer = { x: 0, z: 0 }) {
  if (!vehicles.length) return null;
  return vehicles.map((vehicle, vehicleId) => {
    const s = vehicle.state, handlingRank = activeRank.get(s.phase);
    const score = handlingRank === undefined
      ? 100000 + Math.max(0, (s.routeLength || 0) - (s.routeDistance || 0))
      : handlingRank * 1000 + (s.phase === 4
        ? Math.max(0, (s.routeLength || 0) - (s.routeDistance || 0))
        : Math.min(500, distance(observer, s.target)));
    return { vehicleId, score };
  }).sort((a, b) => a.score - b.score || a.vehicleId - b.vehicleId)[0].vehicleId;
}
export function createTransferSession(vehicles, observer) {
  const vehicleId = selectTransferVehicle(vehicles, observer);
  if (vehicleId === null) return null;
  const s = vehicles[vehicleId].state;
  return { vehicleId, port: s.phase === 8 ? s.destination : s.target, waiting: false, inTransit: s.phase === 8 };
}
// Keep one vehicle selected throughout release, circulation and pickup.
export function updateTransferSession(session, vehicles) {
  const s = vehicles[session.vehicleId].state;
  session.inTransit = s.phase === 8;
  session.port = session.inTransit ? s.destination : s.target;
  session.waiting = s.phase === 4 && distance(s.car, session.port) > 5;
  session.label = session.waiting ? 'FOUP 착좌 · 빈 OHT 회수 대기' : s.label;
  return session;
}

// A dedicated front-side observation shot, below the ceiling and inside the
// 5.2 m shared aisle. Both tool orientations use the same mirrored composition.
export function transferCameraFrame(port, aspect = 16 / 9, fov = 64) {
  const narrow = aspect < .75;
  const setback = narrow ? 4.48 : 4.12;
  return {
    position: { x: port.x + port.sign * .64, y: 2.84, z: port.z + port.sign * setback },
    target: { x: port.x + (narrow ? port.sign * .24 : 0), y: 2.83, z: port.z },
    // A very narrow portrait viewport needs a slightly wider lens, not a camera
    // pushed into the opposing tool. Normal desktop/mobile retains its own FOV.
    fov: Math.max(fov, aspect < .35 ? 76 : 64),
    landmarks: transferLandmarks(port)
  };
}
// If every available vehicle is travelling loaded, show its real cargo first;
// an empty destination platform is not a useful transfer demonstration.
export function transferTransitFrame(car, aspect = 16 / 9, fov = 64) {
  const distance = aspect < .75 ? 3.2 : 2.65;
  return {
    position: { x: car.x - Math.sin(car.yaw) * distance - Math.cos(car.yaw) * .42,
      y: 3.04, z: car.z - Math.cos(car.yaw) * distance + Math.sin(car.yaw) * .42 },
    target: { x: car.x, y: 3.78, z: car.z }, fov: Math.max(fov, aspect < .35 ? 76 : 64)
  };
}
export function transferLandmarks(port) {
  const points = [];
  for (const x of [-.62, .62]) for (const y of [PORT_SURFACE_Y - .06, RAIL_Y + .12]) for (const z of [-.43, .43]) {
    points.push({ x: port.x + x, y, z: port.z + z });
  }
  points.push({ x: port.x, y: VEHICLE_Y, z: port.z });
  return points;
}
