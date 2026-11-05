import { rankRepairEquipment } from './repair-ranking.js?v=9063703070a2';
import { setRuntimeObstacles } from './runtime-obstacles.js?v=9063703070a2';
import { createWalkPlanner } from './walking.js?v=9063703070a2';

self.onmessage = event => {
  try {
    const { ids, position, obstacles } = event.data;
    setRuntimeObstacles(obstacles);
    const rows = [], planner = createWalkPlanner(position);
    for (const id of ids) {
      rows.push(...rankRepairEquipment([{ id }], position, {planner}));
      if (rows.length % 8 === 0 || rows.length === ids.length) self.postMessage({ completed: rows.length });
    }
    rows.sort((a,b) => a.distance-b.distance || a.item.id-b.item.id);
    self.postMessage({ rows: rows.map(({ item, distance }) => ({ id: item.id, distance })) });
  } catch { self.postMessage({ error: true }); }
};
