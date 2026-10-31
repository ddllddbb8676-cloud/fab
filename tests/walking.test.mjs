import test from 'node:test';
import assert from 'node:assert/strict';
import { findWalkPath, canWalkSegment, stepWalker, walkNodes, WALK_RADIUS } from '../src/walking.js';
import { machines, bays, BAY_CENTERS, TOOL_SCALE_X, isBlocked } from '../src/layout.js';
import { getEmoButtonPose } from '../src/emo-controls.js';
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

test('all 360 EMO buttons have a reachable right-hand stance clear of real cabinet, loadports and monitor post', () => {
  assert.equal(machines.length, 360);
  assert.equal(WALK_RADIUS, .295);
  for (const machine of machines) {
    const button = getEmoButtonPose(machine), sign = machine.sign;
    const stance = { x: button.x + sign * .22, z: button.z + sign * .27 };
    const approach = { x: stance.x, z: bays[machine.bayId].z };
    assert.equal(isBlocked(stance.x, stance.z, WALK_RADIUS), false, `EMO ${machine.id} stance`);
    assert.ok(canWalkSegment(approach, stance), `EMO ${machine.id} direct approach from bay`);
    assert.ok(findWalkPath(approach, stance)?.length, `EMO ${machine.id} walk path exists`);
    const stepped = stepWalker(approach, stance.x - approach.x, stance.z - approach.z);
    assert.ok(Math.hypot(stepped.x - stance.x, stepped.z - stance.z) < 1e-7, `EMO ${machine.id} walker reaches exact stance`);
    assert.equal(button.y, 1.28);
    // Facing the cabinet puts the target to the visitor's right, regardless of bank direction.
    const heading = sign === 1 ? Math.PI : 0;
    const dx = button.x - stance.x, dz = button.z - stance.z;
    const localX = Math.cos(heading) * dx - Math.sin(heading) * dz;
    const localZ = Math.sin(heading) * dx + Math.cos(heading) * dz;
    assert.ok(Math.abs(localX - .22) < 1e-10 && Math.abs(localZ - .27) < 1e-10);
    const post = machine.walkBounds.find(b => b.part === 'monitor-post');
    const postFront = sign === 1 ? post.maxZ : post.minZ;
    assert.ok(sign * (stance.z - postFront) - WALK_RADIUS >= .0975 - 1e-10);
  }
});

test('splitting the broad bounds preserves actual front hardware and cabinet collision in both orientations', () => {
  for (const machine of machines) {
    const { x, z, sign } = machine;
    for (const local of [{ x: 0, z: 0 }, { x: -.2 * TOOL_SCALE_X, z: 3.1 }, { x: 2.12 * TOOL_SCALE_X, z: 2.65 }]) {
      assert.equal(isBlocked(x + sign * local.x, z + sign * local.z, WALK_RADIUS), true, `machine ${machine.id} hardware stays solid`);
    }
    for (const port of machine.ports) assert.equal(isBlocked(port.x, port.z, WALK_RADIUS), true);
    // This blank corner of the old rectangular footprint is the physical EMO approach.
    const corner = { x: x + sign * (2.12 * TOOL_SCALE_X + .22), z: z + sign * 3.14 };
    assert.ok(corner.x > machine.bounds.minX && corner.x < machine.bounds.maxX && corner.z > machine.bounds.minZ && corner.z < machine.bounds.maxZ);
    assert.equal(isBlocked(corner.x, corner.z, WALK_RADIUS), false);
  }
});
