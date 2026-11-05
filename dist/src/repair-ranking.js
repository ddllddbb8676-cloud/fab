import { machines } from './layout.js?v=3b5478afa86e';
import { getEmoApproach, planEmoApproach } from './emo-interaction.js?v=3b5478afa86e';
import { getRuntimeObstacles } from './runtime-obstacles.js?v=3b5478afa86e';
import { createWalkPlanner } from './walking.js?v=3b5478afa86e';

const machineById = new Map(machines.map(m => [m.id, m]));
const compare = (a, b) => a.distance - b.distance || a.item.id - b.item.id;

export function rankRepairEquipment(equipment, position, {planner = createWalkPlanner(position)} = {}) {
  return equipment.map(item => {
    const plan = planEmoApproach(machineById.get(item.id), position, {planner});
    let distance = plan ? 0 : Infinity, previous = position;
    for (const point of plan?.path ?? []) {
      distance += Math.hypot(point.x - previous.x, point.z - previous.z); previous = point;
    }
    return { item, distance };
  }).sort(compare);
}

// Cheap initial order. These estimates are never labelled as walking distances.
export function pendingRepairEquipment(equipment, position) {
  return equipment.map(item => {
    const point = getEmoApproach(machineById.get(item.id))?.destination ?? item;
    return { item, distance: undefined, estimate: Math.hypot(point.x - position.x, point.z - position.z) };
  }).sort((a, b) => a.estimate - b.estimate || a.item.id - b.item.id);
}

export function startRepairRanking(equipment, position, { onComplete, onError = () => {}, onProgress = () => {},
  createWorker = () => new Worker(new URL('./repair-ranking-worker.js?v=3b5478afa86e', import.meta.url), { type: 'module' }) } = {}) {
  let worker = null, timer = null, cancelled = false, fallingBack = false;
  const stopWorker = () => { worker?.terminate(); worker = null; };
  function complete(rows) {
    if (cancelled) return;
    stopWorker(); onComplete(rows);
  }
  // Older embedded browsers may reject module workers. Yield between individual
  // routes so the visible dialog can still be closed and movement restored.
  function fallback() {
    if (cancelled || fallingBack) return;
    fallingBack = true; stopWorker(); const rows = [], planner = createWalkPlanner(position); let index = 0;
    function step() {
      if (cancelled) return;
      try {
        if (index < equipment.length) rows.push(...rankRepairEquipment([equipment[index++]], position, {planner}));
        onProgress(index);
        if (index < equipment.length) timer = setTimeout(step, 0);
        else complete(rows.sort(compare));
      } catch (error) { if (!cancelled) onError(error); }
    }
    timer = setTimeout(step, 0);
  }
  try {
    worker = createWorker();
    worker.onmessage = event => {
      if (cancelled || fallingBack) return;
      if (Number.isInteger(event.data?.completed)) { onProgress(event.data.completed); return; }
      if (!Array.isArray(event.data?.rows)) { fallback(); return; }
      const byId = new Map(equipment.map(item => [item.id, item]));
      complete(event.data.rows.filter(row => byId.has(row.id)).map(row => ({ item: byId.get(row.id), distance: row.distance })));
    };
    worker.onerror = event => { event.preventDefault?.(); fallback(); };
    worker.postMessage({ ids: equipment.map(item => item.id), position, obstacles: getRuntimeObstacles() });
  } catch { fallback(); }
  return () => { cancelled = true; clearTimeout(timer); stopWorker(); };
}
