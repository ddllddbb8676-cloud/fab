import {bays} from '../src/layout.js';
import {CONTEST_ZONES} from '../src/foup-contest.js';

const targetWorking = 16;
const frontCount = 4;
const rowsByBay = bays.filter(bay => CONTEST_ZONES.some(zone => zone.z === bay.z))
  .map(bay => [...bay.machines].sort((a, b) => Math.abs(a.x) - Math.abs(b.x) || a.z - b.z));
export const contestMachineIds = new Set(rowsByBay.flat().map(machine => machine.id));

export function planContestRepairs(isDestroyed, available = () => true) {
  const groups = rowsByBay.map(machines => {
    const broken = machines.filter(machine => isDestroyed(machine.id));
    const needed = targetWorking - (machines.length - broken.length);
    const candidates = broken.filter(machine => available(machine.id));
    const front = machines.slice(0, frontCount);
    const brokenFront = candidates.filter(machine => front.includes(machine)).length;
    return candidates.slice(0, Math.max(0, needed, brokenFront));
  });
  // Each ring sees repairs from the first wave, even in a mostly broken fab.
  const plan = [];
  const longest = Math.max(...groups.map(group => group.length));
  for (let i = 0; i < longest; i++) {
    for (const group of groups) if (group[i]) plan.push(group[i].id);
  }
  return plan;
}
