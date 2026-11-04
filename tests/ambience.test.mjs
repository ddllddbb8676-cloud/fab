import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmbience, createFanNoise, createExplosionSound, createEmoPressSound, EMO_PRESS_DURATION, EXPLOSION_DURATION, MAX_EXPLOSION_VOICES } from '../src/ambience.js';
import { MOTION_CUES, createMotionSound, createChipRewardSound, CHIP_REWARD_DURATION } from '../src/ambience.js';

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
    createDynamicsCompressor() { const node = this.node(); for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = new Parameter(); return node; }
    createBufferSource() { return this.node(); }
    createBiquadFilter() { return this.node(); }
    createOscillator() { return this.node(); }
    createAnalyser() { const node = this.node(); node.getFloatTimeDomainData = values => values.fill(.04); return node; }
    createBuffer(channels, length) { const values = new Float32Array(length); return { getChannelData: () => values }; }
    async resume() { this.resumeCalls++; if (this.rejectResume) throw new Error('Gesture required'); if (this.pendingResume) await this.pendingResume; if (this.state !== 'closed') this.state = 'running'; }
    async close() { this.closeCalls++; this.state = 'closed'; }
  };
}

test('stocker music loads on demand, shares one voice, fades with distance, and follows mute/visibility',async()=>{
  const Context=fakeContextClass();Context.prototype.decodeAudioData=async()=>({duration:10.2});let fetches=0,volume=1;
  const audio=createAmbience({AudioContext:Context,fetch:async()=>{fetches++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};}});
  assert.equal(await audio.playStocker(),false);assert.equal(fetches,0);await audio.activate();assert.equal(fetches,0);
  await Promise.all([audio.prepareStocker(),audio.prepareStocker()]);assert.equal(fetches,1);
  assert.equal(await audio.playStocker(()=>volume),true);assert.equal(await audio.playStocker(),false);assert.equal(audio.state.cueCounts['stocker-out'],1);
  volume=0;audio.update();assert.equal(audio.state.activeEffects,0);
  await audio.toggleEffects();assert.equal(await audio.playStocker(),false);await audio.toggleEffects();
  audio.update({hidden:true});assert.equal(await audio.playStocker(),false);await audio.dispose();
});

test('muting while stocker music downloads cancels that cue without breaking other sounds',async()=>{
  const Context=fakeContextClass();Context.prototype.decodeAudioData=async()=>({duration:10.2});let finish;
  const audio=createAmbience({AudioContext:Context,fetch:()=>new Promise(resolve=>{finish=resolve;})});await audio.activate();
  const playing=audio.playStocker();await audio.toggleEffects();finish({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
  assert.equal(await playing,false);assert.equal(audio.state.activeEffects,0);await audio.toggleEffects();assert.equal(audio.playEmoPress(),true);await audio.dispose();
});

test('unavailable stocker audio never rejects or blocks gameplay cues',async()=>{
  const audio=createAmbience({AudioContext:fakeContextClass(),fetch:()=>{throw Error('offline');}});await audio.activate();
  assert.equal(await audio.prepareStocker(),null);assert.equal(await audio.playStocker(),false);assert.equal(audio.playEmoPress(),true);await audio.dispose();
});

test('independent sound switches persist through gestures, with HVAC ducking and recovery',async()=>{
  const Context=fakeContextClass(),audio=createAmbience({AudioContext:Context});
  await audio.activate();const ctx=Context.instances[0],bus=ctx.nodes[2];
  await audio.toggleAmbience();assert.equal(audio.state.ambienceDesired,false);assert.equal(bus.gain.value,0);
  assert.equal(audio.playCue('repair'),true);assert.equal(audio.state.totalCues,1);assert.equal(audio.state.totalExplosions,0);
  await audio.activate();assert.equal(audio.state.ambienceDesired,false);
  await audio.toggleAmbience();assert.equal(bus.gain.value,.32);assert.equal(audio.state.ducked,true);
  ctx.currentTime+=1;audio.update();assert.equal(bus.gain.value,1);
  await audio.toggleEffects();assert.equal(audio.playExplosion(),false);assert.equal(audio.playCue('step'),false);
  await audio.activate();assert.equal(audio.state.effectsDesired,false);assert.equal(audio.state.ambienceEnabled,true);
  await audio.toggleEffects();assert.equal(audio.playCue('land'),true);
  audio.update({hidden:true});assert.equal(audio.playCue('throw'),false);
  await audio.dispose();
});

test('all motion cues are short, bounded and have silent ends at phone sample rates',()=>{
  for(const rate of [8000,48000])for(const kind of Object.keys(MOTION_CUES)) {
    const data=createMotionSound(kind,{sampleRate:rate});
    assert.ok(data.length<=rate*.6);assert.equal(Math.abs(data[0]),0);assert.ok(Math.abs(data.at(-1))<.001);
    assert.ok(data.every(v=>Number.isFinite(v)&&Math.abs(v)<=.65));assert.ok(data.some(v=>Math.abs(v)>.1),kind);
  }
});

test('coin jingle is short, deterministic and bounded at phone sample rates',()=>{
  for(const sampleRate of [8000,44100,48000]){
    const data=createChipRewardSound({sampleRate});assert.equal(data.length,Math.floor(sampleRate*CHIP_REWARD_DURATION));
    assert.equal(Math.abs(data[0]),0);assert.equal(Math.abs(data.at(-1)),0);
    assert.ok(data.every(v=>Number.isFinite(v)&&Math.abs(v)<=.62));assert.ok(data.some(v=>Math.abs(v)>.3));
    for(const start of [.035,.115,.205,.295])assert.ok(data.slice(Math.floor(start*sampleRate),Math.floor((start+.035)*sampleRate)).some(v=>Math.abs(v)>.15));
    assert.deepEqual(data,createChipRewardSound({sampleRate}));
  }
});

test('coin jingle uses the effects switch and can be heard at the existing voice limit without increasing it',async()=>{
  const Context=fakeContextClass(),audio=createAmbience({AudioContext:Context});
  assert.equal(audio.playChipReward(),false);assert.equal(Context.instances.length,0);
  await audio.activate();for(let i=0;i<MAX_EXPLOSION_VOICES;i++)assert.equal(audio.playExplosion(),true);
  assert.equal(audio.playChipReward(),true);assert.equal(audio.state.cueCounts.chip,1);assert.equal(audio.state.activeEffects,MAX_EXPLOSION_VOICES);
  await audio.toggleEffects();assert.equal(audio.playChipReward(),false);await audio.activate();assert.equal(audio.playChipReward(),false);
  await audio.toggleEffects();audio.update({hidden:true});assert.equal(audio.playChipReward(),false);
  audio.update({hidden:false});assert.equal(audio.playChipReward(),true);await audio.dispose();assert.equal(audio.playChipReward(),false);
});

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

test('explosion has a big transient, sustained cascading debris and a smooth fading tail', () => {
  for (const sampleRate of [8000, 48000]) {
    const data = createExplosionSound({ sampleRate });
    const rms = values => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    assert.equal(data.length, Math.floor(sampleRate * EXPLOSION_DURATION));
    assert.ok(data.every(value => Number.isFinite(value) && Math.abs(value) <= .78));
    assert.ok(rms(data.subarray(0, sampleRate / 5)) > .1);
    assert.ok(rms(data.subarray(Math.floor(sampleRate * .8), Math.floor(sampleRate * 1.6))) > .035);
    assert.ok(rms(data.subarray(Math.floor(sampleRate * 2.6))) < .015);
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

test('button clack is short, bounded and works at phone sample rates', () => {
  for (const sampleRate of [8000, 44100, 48000]) {
    const data = createEmoPressSound({ sampleRate });
    assert.equal(data.length, Math.floor(sampleRate * EMO_PRESS_DURATION));
    assert.ok(data.every(value => Number.isFinite(value) && Math.abs(value) <= .7));
    assert.equal(Math.abs(data[0]), 0); assert.equal(Math.abs(data.at(-1)), 0);
    assert.ok(Math.sqrt(data.reduce((n, x) => n + x * x, 0) / data.length) > .08);
  }
});

test('press cue observes mute/visibility, expires, and does not count as an explosion', async () => {
  const Context = fakeContextClass(), ambience = createAmbience({ AudioContext: Context });
  assert.equal(ambience.playEmoPress(), false); assert.equal(Context.instances.length, 0);
  await ambience.activate(); const context = Context.instances[0];
  assert.equal(ambience.playEmoPress(), true);
  assert.equal(ambience.state.totalPresses, 1); assert.equal(ambience.state.totalExplosions, 0);
  context.currentTime += EMO_PRESS_DURATION + .01;
  assert.equal(ambience.state.activeEffects, 0);
  await ambience.toggle(); assert.equal(ambience.playEmoPress(), false);
  await ambience.activate(); assert.equal(ambience.state.desired, false);
  await ambience.toggle(); ambience.update({ hidden: true }); assert.equal(ambience.playEmoPress(), false);
  ambience.update({ hidden: false }); assert.equal(ambience.playEmoPress(), true);
  await ambience.dispose(); assert.equal(ambience.playEmoPress(), false);
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
