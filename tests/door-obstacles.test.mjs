import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AIR_SHOWER } from '../src/air-shower.js';
import { isBlocked } from '../src/layout.js';
import { canWalkSegment, findWalkPath, stepWalker, WALK_RADIUS, walkNodes } from '../src/walking.js';
import { setRuntimeObstacles, getRuntimeObstacles, isRuntimeBlocked, canTraverseRuntimeObstacles } from '../src/runtime-obstacles.js';

afterEach(() => setRuntimeObstacles([]));

test('open entry stays traversable and closing blocks walking and tap routes in both directions', () => {
  assert.deepEqual(getRuntimeObstacles(), []);
  assert.ok(canWalkSegment(AIR_SHOWER.start, AIR_SHOWER.exit));
  assert.ok(findWalkPath(AIR_SHOWER.exit, AIR_SHOWER.start));
  setRuntimeObstacles(AIR_SHOWER.closedDoorBounds);
  assert.equal(isBlocked(0, AIR_SHOWER.doorZ, WALK_RADIUS), true);
  assert.equal(canWalkSegment(AIR_SHOWER.start, AIR_SHOWER.exit), false);
  assert.equal(findWalkPath(AIR_SHOWER.exit, AIR_SHOWER.start), null);
  assert.equal(findWalkPath(AIR_SHOWER.start, AIR_SHOWER.exit), null);
  const outside = stepWalker(AIR_SHOWER.exit, 0, 12);
  assert.ok(outside.z < AIR_SHOWER.closedDoorBounds[0].minZ - WALK_RADIUS);
  const inside = stepWalker(AIR_SHOWER.start, 0, -12);
  assert.ok(inside.z > AIR_SHOWER.closedDoorBounds[0].maxZ + WALK_RADIUS);
  setRuntimeObstacles([]);
  assert.ok(canWalkSegment(AIR_SHOWER.start, AIR_SHOWER.exit));
  assert.ok(findWalkPath(AIR_SHOWER.exit, AIR_SHOWER.start));
});

test('existing corridor graph edges are filtered when a new obstacle divides the hall', () => {
  const start = { x: 0, z: -30 }, target = { x: 0, z: 30 };
  assert.ok(findWalkPath(start, target));
  assert.ok(walkNodes.some(node => node.links.some(edge => node.z < 10 && walkNodes[edge.id].z > 10)), 'the static graph already contains an edge crossing the future obstacle');
  setRuntimeObstacles([{ minX: -60, maxX: 60, minZ: 9.99, maxZ: 10.01 }]);
  assert.equal(findWalkPath(start, target), null);
  setRuntimeObstacles([]);
  assert.ok(findWalkPath(start, target));
});

test('segment clearance handles thin, diagonal, tangent and zero-length intersections', () => {
  setRuntimeObstacles([{ minX: -.02, maxX: .02, minZ: -.02, maxZ: .02 }]);
  assert.equal(canTraverseRuntimeObstacles({ x: -2, z: 0 }, { x: 2, z: 0 }, 0), false);
  assert.equal(canTraverseRuntimeObstacles({ x: 2, z: 2 }, { x: -2, z: -2 }, 0), false);
  assert.equal(canTraverseRuntimeObstacles({ x: -2, z: .25 }, { x: 2, z: .25 }, .23), false);
  assert.equal(canTraverseRuntimeObstacles({ x: -2, z: .26 }, { x: 2, z: .26 }, .23), true);
  assert.equal(canTraverseRuntimeObstacles({ x: 0, z: 0 }, { x: 0, z: 0 }, 0), false);
  assert.equal(canTraverseRuntimeObstacles({ x: 1, z: 1 }, { x: 1, z: 1 }, 0), true);
  assert.equal(isRuntimeBlocked(0, 0, 0), true);
  assert.equal(isRuntimeBlocked(1, 1, 0), false);
});

test('runtime bounds are a stable read-only snapshot with camera height metadata', () => {
  const source = [{ minX: -1, maxX: 1, minZ: 4, maxZ: 5, minY: 0, maxY: 2.65 }];
  const snapshot = setRuntimeObstacles(source);
  source[0].minX = -99;
  assert.equal(getRuntimeObstacles(), snapshot);
  assert.equal(snapshot[0].minX, -1);
  assert.equal(snapshot[0].maxY, 2.65);
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot[0]));
  assert.throws(() => setRuntimeObstacles([{ minX: 5, maxX: 1, minZ: 0, maxZ: 1 }]), /finite ordered/);
  assert.equal(getRuntimeObstacles(), snapshot);
});
