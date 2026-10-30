import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HALL, AISLE, SIDE_GAP, PORT_SURFACE_Y, FOUP_BASE_OFFSET,
  SEATED_FOUP_Y, CARRIED_FOUP_Y, RAIL_Y, VEHICLE_Y,
  machines, bays, ports, TOUR_POINTS, sampleLoop, isBlocked
} from '../src/layout.js';
import { sampleTransport, transportSchedule } from '../src/transport.js';

const near = (actual, expected, tolerance = 1e-8, context = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${context}: expected ${expected}, received ${actual}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const sameXZ = (a, b, tolerance = 1e-8, context = '') => near(distance(a, b), 0, tolerance, context);
const directionDistance = (a, b) => Math.hypot(Math.sin(a) - Math.sin(b), Math.cos(a) - Math.cos(b));
function phaseStart(bay, phase) { return transportSchedule(bay).durations.slice(0, phase).reduce((a, b) => a + b, 0); }
function atPhase(bay, phase, fraction = .5) {
  return sampleTransport(bay, phaseStart(bay, phase) + transportSchedule(bay).durations[phase] * fraction);
}

test('the 120 × 180 × 5 m hall contains 16 bays of two facing ten-tool rows', () => {
  assert.deepEqual(HALL, { width: 120, length: 180, height: 5 });
  assert.equal(bays.length, 16);
  assert.equal(machines.length, 320);
  assert.equal(ports.length, 960);
  assert.equal(new Set(machines.map(m => m.id)).size, 320);
  assert.equal(new Set(ports.map(p => p.id)).size, 960);
  for (const bay of bays) {
    assert.equal(bay.machines.length, 20);
    for (const sign of [-1, 1]) {
      const row = bay.machines.filter(m => m.sign === sign);
      assert.equal(row.length, 10);
      assert.equal(new Set(row.map(m => m.z)).size, 1);
      assert.ok(row.every(m => sign * (bay.z - m.z) > 0), `bay ${bay.id}: tool fronts face the aisle`);
    }
    const reserved = bay.machines.flatMap(m => m.ports).filter(p => p.reserved);
    assert.equal(reserved.length, 1, 'one empty static port reserved for the single animated FOUP');
    assert.equal(reserved[0], bay.target);
  }
});

test('all 960 load-port centres lie directly under a straight service rail', () => {
  for (const port of ports) {
    const bay = bays.find(b => b.id === port.bayId);
    const railZ = port.sign === 1 ? bay.loop.minZ : bay.loop.maxZ;
    near(port.z, railZ, 1e-8, `port ${port.id} vertical alignment`);
    assert.ok(port.x > bay.loop.minX + bay.loop.radius && port.x < bay.loop.maxX - bay.loop.radius);
    const run = bay.loop.segments.find(s => s.type === 'line' && s.z === railZ && s.dx === port.sign);
    assert.ok(run, `port ${port.id} has a straight rail above it`);
    const along = (port.x - run.x) / run.dx;
    sameXZ(sampleLoop(bay.loop, run.start + along), port, 1e-8, `port ${port.id} sample`);
  }
  assert.ok(RAIL_Y < HALL.height && RAIL_Y > VEHICLE_Y && VEHICLE_Y > CARRIED_FOUP_Y);
});

test('front, rear, central and nominal perimeter aisles are 5.2 m; tool side gaps are 0.4 m', () => {
  near(AISLE, 5.2); near(SIDE_GAP, .4);
  for (const bay of bays) {
    const forward = bay.machines.filter(m => m.sign === 1).sort((a, b) => a.x - b.x);
    const backward = bay.machines.filter(m => m.sign === -1).sort((a, b) => a.x - b.x);
    near(backward[0].bounds.minZ - forward[0].bounds.maxZ, 5.2, 1e-8, `bay ${bay.id} front aisle`);
    for (const row of [forward, backward]) for (let i = 1; i < row.length; i++) {
      near(row[i].bounds.minX - row[i - 1].bounds.maxX, .4, 1e-8, `bay ${bay.id} side gap`);
    }
  }
  for (const bank of [0, 1]) {
    const bankBays = bays.filter(b => b.bank === bank).sort((a, b) => a.z - b.z);
    for (let i = 1; i < bankBays.length; i++) {
      const previousEnd = Math.max(...bankBays[i - 1].machines.map(m => m.bounds.maxZ));
      const nextStart = Math.min(...bankBays[i].machines.map(m => m.bounds.minZ));
      near(nextStart - previousEnd, 5.2, 1e-8, `bank ${bank} rear aisle`);
    }
  }
  const leftEdge = Math.min(...machines.map(m => m.bounds.minX));
  const rightEdge = Math.max(...machines.map(m => m.bounds.maxX));
  const leftBankEnd = Math.max(...machines.filter(m => m.bank === 0).map(m => m.bounds.maxX));
  const rightBankStart = Math.min(...machines.filter(m => m.bank === 1).map(m => m.bounds.minX));
  near(rightBankStart - leftBankEnd, 5.2, 1e-8, 'central aisle');
  near(leftEdge + HALL.width / 2, 5.2, 1e-8, 'left perimeter to nominal wall');
  near(HALL.width / 2 - rightEdge, 5.2, 1e-8, 'right perimeter to nominal wall');
});

test('equipment footprints do not overlap or extend outside the hall', () => {
  for (let i = 0; i < machines.length; i++) {
    const a = machines[i].bounds;
    assert.ok(a.minX > -HALL.width / 2 && a.maxX < HALL.width / 2 && a.minZ > -HALL.length / 2 && a.maxZ < HALL.length / 2);
    for (let j = i + 1; j < machines.length; j++) {
      const b = machines[j].bounds;
      const overlapping = a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
      assert.equal(overlapping, false, `tools ${machines[i].id} and ${machines[j].id} overlap`);
    }
  }
});

test('the entire guided tour remains in walkable corridors, including every turn', () => {
  assert.deepEqual(TOUR_POINTS[0], TOUR_POINTS.at(-1));
  for (let i = 1; i < TOUR_POINTS.length; i++) {
    const [x0, z0] = TOUR_POINTS[i - 1], [x1, z1] = TOUR_POINTS[i];
    assert.ok(x0 === x1 || z0 === z1, 'tour segments are axis aligned');
    const samples = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / .1);
    for (let j = 0; j <= samples; j++) {
      const f = j / samples, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f;
      assert.equal(isBlocked(x, z), false, `tour segment ${i}, x=${x}, z=${z}`);
    }
  }
});

test('walking collision includes projected load ports and rejects tool centres', () => {
  for (const machine of machines) {
    assert.equal(isBlocked(machine.x, machine.z), true);
    for (const port of machine.ports) assert.equal(isBlocked(port.x, port.z), true);
  }
  assert.equal(isBlocked(0, 0), false);
  assert.equal(isBlocked(60, 0), true);
  assert.equal(isBlocked(0, 90), true);
});

test('rail loops are closed with continuous position and tangent at all joins', () => {
  for (const bay of bays) {
    const loop = bay.loop;
    assert.ok(loop.length > 0);
    for (const s of loop.segments) {
      assert.ok(s.length > 0);
      const before = sampleLoop(loop, s.start - 1e-6), after = sampleLoop(loop, s.start + 1e-6);
      assert.ok(distance(before, after) < 2.1e-6, `bay ${bay.id}: disconnected rail join`);
      assert.ok(directionDistance(before.yaw, after.yaw) < 4e-6, `bay ${bay.id}: abrupt rail tangent`);
    }
    sameXZ(sampleLoop(loop, 0), sampleLoop(loop, loop.length), 1e-8, 'closed loop');
    sameXZ(sampleLoop(loop, bay.stopDistance), bay.target, 1e-8, 'actual port stop');
  }
});

test('every lowered hoist stops over its target and reaches the exact seated height', () => {
  near(SEATED_FOUP_Y - FOUP_BASE_OFFSET, PORT_SURFACE_Y);
  for (const bay of bays) {
    for (const phase of [1, 2, 3, 5, 6, 7]) {
      for (const f of [.01, .25, .5, .75, .99]) {
        const state = atPhase(bay, phase, f);
        assert.equal(state.travelling, false);
        sameXZ(state.car, bay.target, 1e-8, 'extended hoist above target');
        assert.ok(state.gripperY >= SEATED_FOUP_Y + .265 - 1e-8 && state.gripperY <= CARRIED_FOUP_Y + .265 + 1e-8);
      }
    }
    const seated = atPhase(bay, 2);
    near(seated.foup.y - FOUP_BASE_OFFSET, bay.target.y);
    near(seated.gripperY - .265, seated.foup.y);
  }
});

test('a released FOUP stays on its real port while the empty vehicle travels a full lap', () => {
  for (const bay of bays) for (const phase of [2, 3, 4, 5, 6]) {
    for (const f of [.001, .25, .5, .75, .999]) {
      const state = atPhase(bay, phase, f);
      assert.equal(state.parked, true);
      sameXZ(state.foup, bay.target);
      near(state.foup.y, SEATED_FOUP_Y);
      near(state.foup.yaw, Math.PI);
      if (phase === 4) {
        assert.equal(state.travelling, true);
        near(state.lowered, 0);
        near(state.gripperY, CARRIED_FOUP_Y + .265);
        if (f > .1 && f < .9) assert.ok(distance(state.car, state.foup) > 1);
      }
    }
  }
});

test('the returning OHT picks up the same parked FOUP before moving loaded', () => {
  for (const bay of bays) {
    const approach = atPhase(bay, 4, 1 - 1e-7), grip = atPhase(bay, 6), lift = atPhase(bay, 7);
    sameXZ(approach.car, bay.target, 2e-5, 'empty vehicle returns to original stop');
    sameXZ(grip.car, grip.foup); near(grip.gripperY, grip.foup.y + .265);
    assert.equal(lift.parked, false); assert.equal(lift.travelling, false);
    sameXZ(lift.car, lift.foup); assert.ok(lift.foup.y > SEATED_FOUP_Y && lift.foup.y < CARRIED_FOUP_Y);
    const loaded = atPhase(bay, 8);
    assert.equal(loaded.parked, false); assert.equal(loaded.travelling, true);
    sameXZ(loaded.car, loaded.foup); near(loaded.foup.y, CARRIED_FOUP_Y);
    near(loaded.lowered, 0);
  }
});

test('FOUP, hoist and car transforms remain continuous through every phase and cycle boundary', () => {
  for (const bay of bays) {
    const { durations, total } = transportSchedule(bay);
    const joins = [0]; let t = 0;
    for (const duration of durations) { t += duration; joins.push(t); }
    for (const join of joins) {
      const before = sampleTransport(bay, join - 1e-7), after = sampleTransport(bay, join + 1e-7);
      sameXZ(before.car, after.car, 1e-5, `bay ${bay.id}: car boundary ${join}`);
      sameXZ(before.foup, after.foup, 1e-5, `bay ${bay.id}: FOUP boundary ${join}`);
      near(before.foup.y, after.foup.y, 1e-5, 'FOUP vertical continuity');
      near(before.gripperY, after.gripperY, 1e-5, 'hoist vertical continuity');
      assert.ok(directionDistance(before.car.yaw, after.car.yaw) < 1e-5);
      assert.ok(directionDistance(before.foup.yaw, after.foup.yaw) < 1e-5);
    }
    assert.ok(total > 0);
    sameXZ(sampleTransport(bay, 0).car, sampleTransport(bay, total).car);
  }
});
