// Each instanced part keeps its own original transform. Hiding one tool must
// never change another tool sharing the same material or draw call.
export function createEquipmentVisibility() {
  const parts = new Map(), hidden = new Set();
  return {
    register(id, writeVisibility) {
      if (!Number.isInteger(id) || typeof writeVisibility !== 'function') throw new TypeError('Invalid equipment part');
      if (!parts.has(id)) parts.set(id, []);
      parts.get(id).push(writeVisibility);
      if (hidden.has(id)) writeVisibility(false);
    },
    setVisible(id, visible) {
      if (!parts.has(id)) return false;
      visible = Boolean(visible);
      if (visible === !hidden.has(id)) return false;
      if (visible) hidden.delete(id); else hidden.add(id);
      for (const write of parts.get(id)) write(visible);
      return true;
    },
    isVisible(id) { return parts.has(id) && !hidden.has(id); },
    get state() { return { machineCount: parts.size, partCount: [...parts.values()].reduce((n, p) => n + p.length, 0), hiddenIds: [...hidden] }; }
  };
}
