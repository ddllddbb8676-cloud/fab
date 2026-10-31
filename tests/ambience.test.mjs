import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmbience, createFanNoise, createExplosionSound, EXPLOSION_DURATION, MAX_EXPLOSION_VOICES } from '../src/ambience.js';

class Parameter {
  constructor() { this.value = 0; }
  cancelScheduledValues() {}
  setValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
}
class AudioNode {
  constructor() { this.gain = new Parameter(); this.frequency = new Parameter(); this.Q = new Parameter(); }
  connect(next) { return next; }
  disconnect() { this.disconnected = true; }
  start(time = 0) { this.started = true; this.startTime = time; }
  stop(time = 0) { this.stopped = true; this.stopTime = time; }
}
function fakeContextClass() {
  return class FakeContext {
    static instances = [];
    constructor() { this.state = 'suspended'; this.sampleRate = 8000; this.currentTime = 0; this.destination = {}; this.resumeCalls = 0; this.closeCalls = 0; this.nodes = []; this.constructor.instances.push(this); }
    node() { const node = new AudioNode(); this.nodes.push(node); return node; }
    createGain() { return this.node(); }
    createBufferSource() { return this.node(); }
    createBiquadFilter() { return this.node(); }
    createOscillator() { return this.node(); }
    createAnalyser() { const node = this.node(); node.getFloatTimeDomainData = values => values.fill(.04); return node; }
    createBuffer(channels, length) { const values = new Float32Array(length); return { getChannelData: () => values }; }
    async resume() { this.resumeCalls++; if (this.rejectResume) throw new Error('Gesture required'); if (this.pendingResume) await this.pendingResume; if (this.state !== 'closed') this.state = 'running'; }
    async close() { this.closeCalls++; this.state = 'closed'; }
  };
}

test('generated wash has bounded energy and a smooth loop boundary at mobile sample rates', () => {
  for (const sampleRate of [8000, 44100, 48000]) {
    const data = createFanNoise({ sampleRate, duration: 1 });
    const energy = data.reduce((sum, value) => sum + value * value, 0);
    const rms = Math.sqrt(energy / data.length);
    assert.ok(rms > .23 && rms < .36, `RMS ${rms}`);
    assert.ok(data.every(value => Number.isFinite(value) && Math.abs(value) <= .9));
    assert.equal(data[0], 0); assert.equal(Math.abs(data.at(-1)), 0);
    assert.ok(Math.abs(data[1] - data[0]) < .001);
    assert.ok(Math.abs(data.at(-2) - data.at(-1)) < .001);
    assert.deepEqual(data, createFanNoise({ sampleRate, duration: 1 }));
  }
});

test('explosion signal has a bounded transient, softer tail and smooth endpoints', () => {
  for (const sampleRate of [8000, 48000]) {
    const data = createExplosionSound({ sampleRate });
    const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    assert.equal(data.length, Math.floor(sampleRate * EXPLOSION_DURATION));
    assert.ok(data.every(value => Number.isFinite(value) && Math.abs(value) <= .65));
    assert.ok(rms(data.subarray(0, sampleRate / 5)) > .1);
    assert.ok(rms(data.subarray(sampleRate)) < .015);
    assert.equal(Math.abs(data[0]), 0); assert.equal(Math.abs(data.at(-1)), 0);
    assert.ok(Math.abs(data[1]) < .001); assert.ok(Math.abs(data.at(-2)) < .001);
    assert.deepEqual(data, createExplosionSound({ sampleRate }));
  }
});

test('explosions require the existing running context and preserve mute preference', async () => {
  const Context = fakeContextClass(), ambience = createAmbience({ AudioContext: Context });
  assert.equal(ambience.playExplosion(), false); assert.equal(Context.instances.length, 0);
  await ambience.activate(); const context = Context.instances[0];
  assert.equal(ambience.playExplosion(), true); assert.equal(ambience.state.totalEffects, 1);
  await ambience.toggle();
  assert.equal(ambience.playExplosion(), false);
  await ambience.activate();
  assert.equal(ambience.state.desired, false); assert.equal(context.resumeCalls, 1);
  context.currentTime += .04;
  assert.equal(ambience.state.activeEffects, 0);
  await ambience.toggle();
  assert.equal(ambience.playExplosion(), true);
  ambience.update({ hidden: true }); assert.equal(ambience.playExplosion(), false);
  context.currentTime += .04;
  assert.equal(ambience.state.activeEffects, 0);
  ambience.update({ hidden: false }); assert.equal(ambience.playExplosion(), true);
  assert.equal(Context.instances.length, 1);
  await ambience.dispose();
});

test('interruption recovery cancels stale explosions instead of replaying their tails', async () => {
  const Context = fakeContextClass(), ambience = createAmbience({ AudioContext: Context });
  await ambience.activate(); const context = Context.instances[0];
  assert.equal(ambience.playExplosion(), true);
  context.state = 'interrupted';
  assert.equal(ambience.playExplosion(), false); assert.equal(context.resumeCalls, 1);
  await ambience.activate();
  assert.equal(context.resumeCalls, 2); assert.equal(ambience.state.activeEffects, 0);
  assert.equal(ambience.playExplosion(), true); assert.equal(ambience.state.totalEffects, 2);
  await ambience.dispose();
});

test('explosion voices are capped and disconnect on ended, expiry and disposal', async () => {
  const Context = fakeContextClass(), ambience = createAmbience({ AudioContext: Context });
  await ambience.activate(); const context = Context.instances[0];
  const baseNodeCount = context.nodes.length;
  for (let i = 0; i < MAX_EXPLOSION_VOICES; i++) assert.equal(ambience.playExplosion(), true);
  const fullNodeCount = context.nodes.length;
  for (let i = 0; i < 30; i++) assert.equal(ambience.playExplosion(), false);
  assert.equal(context.nodes.length, fullNodeCount);
  assert.equal(ambience.state.activeEffects, MAX_EXPLOSION_VOICES);
  const firstSource = context.nodes.slice(baseNodeCount).find(node => typeof node.onended === 'function');
  firstSource.onended();
  assert.equal(firstSource.disconnected, true);
  assert.equal(firstSource.onended, null);
  assert.equal(ambience.state.activeEffects, MAX_EXPLOSION_VOICES - 1);
  assert.equal(ambience.playExplosion(), true);
  context.currentTime += EXPLOSION_DURATION + .01;
  assert.equal(ambience.state.activeEffects, 0);
  assert.ok(context.nodes.slice(baseNodeCount).every(node => node.disconnected));
  assert.equal(ambience.playExplosion(), true);
  await ambience.dispose();
  assert.equal(ambience.state.activeEffects, 0); assert.equal(ambience.playExplosion(), false);
  assert.ok(context.nodes.every(node => node.disconnected));
  assert.equal(Context.instances.length, 1);
});

test('construction and animation updates stay silent until a gesture activates audio', async () => {
  const Context = fakeContextClass(), ambience = createAmbience({ AudioContext: Context });
  assert.equal(ambience.state.status, 'idle');
  assert.equal(ambience.state.desired, true);
  ambience.update({ jet: 1 });
  assert.equal(Context.instances.length, 0);
  const state = await ambience.activate();
  assert.equal(state.contextState, 'running'); assert.equal(state.enabled, true);
  assert.ok(state.rms > .039 && state.rms < .041);
  assert.ok(state.peak > 0);
  await ambience.dispose();
});

test('explicit mute survives later gestures and visibility changes', async () => {
  const Context = fakeContextClass(), ambience = createAmbience({ AudioContext: Context });
  await ambience.activate(); const context = Context.instances[0];
  assert.equal((await ambience.toggle()).status, 'muted');
  context.state = 'suspended';
  await ambience.activate(); ambience.update({ hidden: true }); ambience.update({ hidden: false });
  assert.equal(context.resumeCalls, 1); assert.equal(ambience.state.desired, false);
  assert.equal(ambience.state.enabled, false); assert.equal(ambience.state.rms, 0);
  assert.equal((await ambience.toggle()).enabled, true);
  assert.equal(context.resumeCalls, 2);
  await ambience.dispose();
});

test('interruption and rejected resume report truthfully and recover on a new gesture', async () => {
  const Context = fakeContextClass(), ambience = createAmbience({ AudioContext: Context });
  await ambience.activate(); const context = Context.instances[0];
  context.state = 'interrupted';
  assert.equal(ambience.state.enabled, false); assert.equal(ambience.state.rms, 0);
  context.rejectResume = true;
  assert.equal((await ambience.activate()).status, 'error');
  assert.match(ambience.state.error, /Gesture/);
  context.rejectResume = false;
  assert.equal((await ambience.activate()).status, 'running');
  assert.equal(context.resumeCalls, 3);
  await ambience.dispose();
});

test('mute or dispose during a pending resume cannot turn sound back on', async () => {
  const Context = fakeContextClass(), ambience = createAmbience({ AudioContext: Context });
  await ambience.activate(); const context = Context.instances[0];
  context.state = 'suspended';
  let resolve; context.pendingResume = new Promise(done => { resolve = done; });
  const pending = ambience.activate();
  await ambience.toggle();
  resolve(); await pending;
  assert.equal(ambience.state.status, 'muted'); assert.equal(ambience.state.enabled, false);
  context.state = 'suspended';
  let resolveSecond; context.pendingResume = new Promise(done => { resolveSecond = done; });
  const pendingTurnOn = ambience.toggle();
  await ambience.dispose();
  resolveSecond(); await pendingTurnOn;
  assert.equal(ambience.state.status, 'disposed'); assert.equal(context.closeCalls, 1);
  assert.ok(context.nodes.every(node => node.disconnected));
  await ambience.activate(); await ambience.toggle(); await ambience.dispose();
  assert.equal(Context.instances.length, 1); assert.equal(context.closeCalls, 1);
});

test('unsupported audio and a mute preference before first activation do not construct a context', async () => {
  const unsupported = createAmbience({ AudioContext: null });
  assert.equal((await unsupported.activate()).status, 'not-supported');
  assert.equal(unsupported.state.enabled, false); assert.equal(unsupported.state.rms, 0);
  const Context = fakeContextClass(), ambience = createAmbience({ AudioContext: Context });
  await ambience.toggle(); await ambience.activate();
  assert.equal(Context.instances.length, 0); assert.equal(ambience.state.status, 'muted');
});
