import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntrySequence, sampleEntry, ENTRY_TIMES } from '../src/entry-sequence.js';
import { AIR_SHOWER } from '../src/air-shower.js';
import { canWalkSegment, stepWalker } from '../src/walking.js';

test('entry interlocks keep doors closed during airflow and walking waits for full opening', () => {
  let previous = sampleEntry(0);
  for (let t = 0; t <= ENTRY_TIMES.done + .05; t += .025) {
    const s = sampleEntry(t);
    if (s.jet > 0) assert.equal(s.door, 0);
    if (s.walk > 0) assert.equal(s.door, 1);
    assert.ok(Math.abs(s.position.z - previous.position.z) < .07);
    assert.ok(s.progress >= previous.progress && s.door >= previous.door);
    previous = s;
  }
  assert.deepEqual(sampleEntry(ENTRY_TIMES.done).position, AIR_SHOWER.exit);
  assert.ok(canWalkSegment(AIR_SHOWER.start, AIR_SHOWER.exit));
  const blocked = stepWalker(AIR_SHOWER.start, 5, 0);
  assert.ok(blocked.x < 1.65, 'the chamber side wall stops free walking');
});

test('skip, replay and reduced motion finish in the same clear entrance position', () => {
  const entry = createEntrySequence();
  entry.start(); entry.step(2); assert.equal(entry.state.stage, 'shower');
  entry.skip(); assert.equal(entry.state.complete, true); assert.equal(entry.state.jet, 0); assert.equal(entry.state.door, 1);
  entry.finish(); assert.equal(entry.active, false);
  entry.start(); assert.equal(entry.state.time, 0); assert.equal(entry.state.door, 0);
  const quiet = createEntrySequence({ reducedMotion: true });
  assert.equal(quiet.start().complete, true);
});
