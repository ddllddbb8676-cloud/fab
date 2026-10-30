import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEntrySequence, sampleEntry, ENTRY_TIMES } from '../src/entry-sequence.js';
import { AIR_SHOWER, createAirShower } from '../src/air-shower.js';
import { canWalkSegment, stepWalker, WALK_RADIUS } from '../src/walking.js';

test('entry interlocks keep doors closed during airflow and walking waits for full opening', () => {
  let previous = sampleEntry(0);
  for (let t = 0; t <= ENTRY_TIMES.done + .05; t += .025) {
    const s = sampleEntry(t);
    if (s.jet > 0) assert.equal(s.door, 0);
    if (s.walk > 0 && s.walk < 1) assert.equal(s.door, 1);
    assert.ok(Math.abs(s.position.z - previous.position.z) < .07);
    assert.ok(s.progress >= previous.progress);
    if (t < ENTRY_TIMES.closing) assert.ok(s.door >= previous.door);
    else assert.ok(s.door <= previous.door);
    previous = s;
  }
  assert.deepEqual(sampleEntry(ENTRY_TIMES.done).position, AIR_SHOWER.exit);
  assert.ok(canWalkSegment(AIR_SHOWER.start, AIR_SHOWER.exit));
  const blocked = stepWalker(AIR_SHOWER.start, 5, 0);
  assert.ok(blocked.x < 1.65, 'the chamber side wall stops free walking');
});

test('doors close smoothly only after the whole avatar has cleared the doorway', () => {
  const start = sampleEntry(ENTRY_TIMES.closing);
  assert.equal(start.stage, 'closing');
  assert.equal(start.complete, false);
  assert.equal(start.walk, 1);
  assert.equal(start.door, 1);
  assert.deepEqual(start.position, AIR_SHOWER.exit);
  for (let t = ENTRY_TIMES.closing; t <= ENTRY_TIMES.done; t += .025) {
    const state = sampleEntry(t);
    assert.deepEqual(state.position, AIR_SHOWER.exit);
    assert.equal(state.jet, 0);
    assert.ok(AIR_SHOWER.closedDoorBounds.every(bounds => state.position.z + WALK_RADIUS < bounds.minZ));
  }
  const middle = sampleEntry((ENTRY_TIMES.closing + ENTRY_TIMES.done) / 2);
  assert.ok(Math.abs(middle.door - .5) < 1e-12);
  for (const boundary of [ENTRY_TIMES.closing, ENTRY_TIMES.done]) {
    assert.ok(Math.abs(sampleEntry(boundary - .001).door - sampleEntry(boundary + .001).door) < .00001, 'smooth easing at both closing boundaries');
  }
  const done = sampleEntry(ENTRY_TIMES.done);
  assert.equal(done.complete, true);
  assert.equal(done.door, 0);
  assert.equal(done.walk, 1);
  assert.equal(done.jet, 0);
  assert.deepEqual(sampleEntry(ENTRY_TIMES.done + 30).position, AIR_SHOWER.exit);
  assert.equal(sampleEntry(ENTRY_TIMES.done + 30).door, 0);
});

test('skip, replay and reduced motion finish at the clear exit with both door leaves closed', () => {
  const entry = createEntrySequence();
  entry.start(); entry.step(2); assert.equal(entry.state.stage, 'shower');
  entry.skip(); assert.equal(entry.state.complete, true); assert.equal(entry.state.jet, 0); assert.equal(entry.state.door, 0);
  assert.deepEqual(entry.state.position, AIR_SHOWER.exit);
  entry.finish(); assert.equal(entry.active, false);
  assert.equal(entry.step(1).door, 0);
  entry.start(); assert.equal(entry.state.time, 0); assert.equal(entry.state.door, 0);
  assert.deepEqual(entry.state.position, AIR_SHOWER.start);
  entry.step(ENTRY_TIMES.closing + .6); assert.equal(entry.state.stage, 'closing');
  entry.skip(); assert.equal(entry.state.door, 0);
  const quiet = createEntrySequence({ reducedMotion: true });
  const quietState = quiet.start();
  assert.equal(quietState.complete, true);
  assert.equal(quietState.door, 0);
  assert.equal(quietState.jet, 0);
  assert.deepEqual(quietState.position, AIR_SHOWER.exit);
  quiet.finish(); assert.equal(quiet.active, false);
  assert.equal(quiet.step(1).door, 0);
});

test('the rendered door returns to the closed collision footprint after entry', () => {
  const shower = createAirShower(THREE);
  try {
    shower.update(sampleEntry(ENTRY_TIMES.walking));
    assert.deepEqual(shower.doors.map(door => door.position.x), [-1.85, 1.85]);
    shower.update(sampleEntry((ENTRY_TIMES.closing + ENTRY_TIMES.done) / 2));
    assert.ok(shower.doors[0].position.x > -1.85 && shower.doors[0].position.x < -.6);
    shower.update(sampleEntry(ENTRY_TIMES.done));
    assert.deepEqual(shower.doors.map(door => door.position.x), [-.6, .6]);
    assert.equal(shower.jets.visible, false);
    assert.equal(shower.closedDoorBounds, AIR_SHOWER.closedDoorBounds);
    for (const door of shower.doors) {
      const visibleBounds = new THREE.Box3().setFromObject(door);
      const collider = AIR_SHOWER.closedDoorBounds[0];
      assert.ok(visibleBounds.min.x >= collider.minX && visibleBounds.max.x <= collider.maxX);
      assert.ok(visibleBounds.min.z >= collider.minZ && visibleBounds.max.z <= collider.maxZ);
    }
  } finally {
    shower.dispose();
  }
});
