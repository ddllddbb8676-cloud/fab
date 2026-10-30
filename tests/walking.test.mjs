import test from 'node:test';
import assert from 'node:assert/strict';
import { findWalkPath, canWalkSegment, stepWalker, walkNodes } from '../src/walking.js';
import { machines, bays, BAY_CENTERS, isBlocked } from '../src/layout.js';
test('tap walking routes through both banks and into the narrow rear aisle', () => {
  const start = { x: -4, z: BAY_CENTERS.at(-1) };
  for (const target of [{ x: 40, z: BAY_CENTERS[0] }, { x: -30, z: (BAY_CENTERS[4] + BAY_CENTERS[5]) / 2 }]) {
    const route = findWalkPath(start, target); assert.ok(route?.length);
    let last = start; for (const point of route) { assert.ok(canWalkSegment(last, point)); last = point; }
    assert.deepEqual(last, target);
  }
});
test('65 cm side passage is traversable between neighbouring tools', () => {
  const row = machines.filter(m => m.bayId === 4 && m.sign === 1), x = (row[3].x + row[4].x) / 2;
  const back = (BAY_CENTERS[3] + BAY_CENTERS[4]) / 2;
  assert.ok(canWalkSegment({ x, z: back }, { x, z: BAY_CENTERS[4] }));
});
test('a tap inside a machine is rejected and large movement cannot tunnel through one', () => {
  const m = machines[0], start = { x: m.x, z: bays[0].z };
  assert.equal(findWalkPath(start, m), null);
  const result = stepWalker(start, 0, -12); assert.ok(result.z > m.bounds.maxZ); assert.ok(!isBlocked(result.x, result.z, .23));
});
