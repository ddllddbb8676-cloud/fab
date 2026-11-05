import { sampleLoop, SEATED_FOUP_Y, CARRIED_FOUP_Y } from './layout.js?v=1b5f80f35e53';
const smooth = t => t * t * (3 - 2 * t);
export function transportSchedule(bay, speed = 2.3) {
  const travel = bay.loop.length / speed;
  const durations = [2, 4, .8, 4, travel, 4, .8, 4, travel];
  return { durations, total: durations.reduce((a, b) => a + b, 0) };
}
// A single FOUP stays on the real load port while its empty OHT completes a lap.
// The car must be stopped throughout every extended-hoist phase.
export function sampleTransport(bay, time) {
  const { durations, total } = transportSchedule(bay);
  let t = ((time % total) + total) % total, phase = 0;
  while (phase < durations.length - 1 && t >= durations[phase]) t -= durations[phase++];
  const f = t / durations[phase], e = smooth(f);
  const names = ['정차', 'FOUP 내려놓기', 'FOUP 분리', '빈 호이스트 회수', '빈 OHT 주행', '빈 호이스트 하강', 'FOUP 체결', 'FOUP 들어올리기', 'FOUP 운반'];
  const travelling = phase === 4 || phase === 8;
  const car = sampleLoop(bay.loop, bay.stopDistance + (travelling ? f * bay.loop.length : 0));
  const lowered = phase === 1 ? e : phase === 2 || phase === 6 ? 1 : phase === 3 || phase === 7 ? 1 - e : phase === 5 ? e : 0;
  const gripperY = CARRIED_FOUP_Y + .265 - lowered * (CARRIED_FOUP_Y - SEATED_FOUP_Y);
  const parked = phase >= 2 && phase <= 6;
  const foup = parked ? { x: bay.target.x, y: SEATED_FOUP_Y, z: bay.target.z, yaw: Math.PI } :
    { x: car.x, y: gripperY - .265, z: car.z, yaw: car.yaw + Math.PI / 2 };
  return { car, foup, gripperY, parked, lowered, phase, label: names[phase], travelling, total };
}
