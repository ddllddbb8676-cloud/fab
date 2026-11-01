// Ventilation is generated locally. Construction is silent until activate() is
// called from a trusted gesture; a later gesture never overrides explicit mute.
const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export const EXPLOSION_DURATION = 2.8;
export const MAX_EXPLOSION_VOICES = 4;
const EXPLOSION_GAIN = 1.2;
export const EMO_PRESS_DURATION = .16;

/** A spring-loaded button clack with enough midrange for phone speakers. */
export function createEmoPressSound({ sampleRate = 48000 } = {}) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('Unsupported button sample rate');
  const samples = new Float32Array(Math.floor(sampleRate * EMO_PRESS_DURATION));
  let randomState = 0x517cc12;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5;
    const white = (randomState >>> 0) / 0x100000000 * 2 - 1;
    const latchTime = Math.max(0, t - .022);
    const body = Math.sin(2 * Math.PI * 620 * t) * Math.exp(-t / .025);
    const latch = t > .022 ? Math.sin(2 * Math.PI * 1350 * latchTime) * Math.exp(-latchTime / .012) : 0;
    const attack = Math.min(1, t / .002);
    const release = Math.min(1, (samples.length - 1 - i) / (sampleRate * .015));
    samples[i] = .7 * Math.tanh(body + .55 * latch + .6 * white * Math.exp(-t / .014)) * attack * release;
  }
  return samples;
}

/** A deterministic, bounded fan wash with a quiet, continuous loop boundary. */
export function createFanNoise({ sampleRate = 48000, duration = 6, seed = 0x6fab0321 } = {}) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('Unsupported noise sample rate');
  if (!Number.isFinite(duration) || duration < .1 || duration > 30) throw new RangeError('Unsupported noise duration');
  const samples = new Float32Array(Math.floor(sampleRate * duration));
  const fastAlpha = 1 - Math.exp(-2 * Math.PI * 1800 / sampleRate);
  const slowAlpha = 1 - Math.exp(-2 * Math.PI * 170 / sampleRate);
  const edgeSamples = Math.min(Math.floor(sampleRate * .018), Math.floor(samples.length / 4));
  let randomState = (seed >>> 0) || 1, fast = 0, slow = 0, energy = 0;
  for (let i = 0; i < samples.length; i++) {
    randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5;
    const white = (randomState >>> 0) / 0x100000000 * 2 - 1;
    fast += fastAlpha * (white - fast);
    slow += slowAlpha * (white - slow);
    const value = .7 * (fast - slow) + .24 * fast + .06 * white;
    samples[i] = value;
    energy += value * value;
  }
  const scale = .34 / Math.max(1e-6, Math.sqrt(energy / samples.length));
  for (let i = 0; i < samples.length; i++) {
    const edge = Math.min(1, i / edgeSamples, (samples.length - 1 - i) / edgeSamples);
    samples[i] = .9 * Math.tanh(samples[i] * scale / .9) * Math.sin(edge * Math.PI / 2) ** 2;
  }
  return samples;
}

/** Big initial bang, then staggered casing crashes and bouncing metal fragments. */
export function createExplosionSound({ sampleRate = 48000, seed = 0x3eaf0127 } = {}) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('Unsupported explosion sample rate');
  const samples = new Float32Array(Math.floor(sampleRate * EXPLOSION_DURATION));
  const fastAlpha = 1 - Math.exp(-2 * Math.PI * Math.min(5200, sampleRate * .42) / sampleRate);
  const slowAlpha = 1 - Math.exp(-2 * Math.PI * 380 / sampleRate);
  // Irregular hits keep the collapse sounding like falling panels, not a tone.
  const impacts = [
    [.055, .90, 274], [.13, .85, 419], [.235, .82, 327], [.36, .75, 587],
    [.49, .73, 231], [.65, .64, 743], [.82, .58, 362], [1.02, .49, 926],
    [1.24, .41, 477], [1.48, .34, 1129], [1.75, .25, 653], [2.07, .17, 1381],
    [2.31, .09, 827]
  ];
  let randomState = (seed >>> 0) || 1, fast = 0, slow = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5;
    const white = (randomState >>> 0) / 0x100000000 * 2 - 1;
    fast += fastAlpha * (white - fast); slow += slowAlpha * (white - slow);
    const phase = 2 * Math.PI * (52 * t + 128 * (1 - Math.exp(-18 * t)) / 18);
    const thump = 1.25 * Math.sin(phase) * Math.exp(-t / .23);
    const punch = .45 * Math.sin(2 * Math.PI * 172 * t) * Math.exp(-t / .13);
    const blast = (fast - slow) * 2.5 * Math.exp(-t / .24);
    let debris = 0;
    for (const [start, strength, frequency] of impacts) {
      const age = t - start;
      if (age < 0 || age > .7) continue;
      const attack = Math.min(1, age / .003);
      const clank = Math.sin(2 * Math.PI * frequency * age) +
        .57 * Math.sin(2 * Math.PI * frequency * 1.47 * age) +
        .31 * Math.sin(2 * Math.PI * frequency * 2.31 * age);
      const plate = (fast - slow) * 2.1 * Math.exp(-age / .055);
      const rattle = white * .7 * Math.exp(-age / .1) * (.5 + .5 * Math.sin(age * 237));
      debris += strength * attack * (plate + rattle + .38 * clank * Math.exp(-age / .13));
    }
    const attack = Math.sin(Math.min(1, t / .006) * Math.PI / 2) ** 2;
    const release = Math.sin(Math.min(1, (samples.length - 1 - i) / (sampleRate * .18)) * Math.PI / 2) ** 2;
    samples[i] = .78 * Math.tanh(thump + punch + blast + debris) * attack * release;
  }
  return samples;
}

/**
 * activate(): call only in a trusted user gesture, also to recover interruption.
 * toggle(): changes explicit preference; muted preference survives activate().
 * update(): safe in requestAnimationFrame; never creates/resumes a context.
 * playExplosion()/playEmoPress(): return false while muted, hidden, interrupted, or at the
 * four-voice limit. It never creates/resumes a context or changes preference.
 * state.rms/peak: measured after the master gain, before the destination.
 */
export function createAmbience(options = {}) {
  const Context = Object.hasOwn(options, 'AudioContext') ? options.AudioContext : (globalThis.AudioContext || globalThis.webkitAudioContext);
  let context = null, master = null, ambienceBus = null, effectsBus = null, wash = null, lowpass = null, analyser = null, waveform = null;
  let sources = [], nodes = [], desired = true, hidden = false, jet = 0, disposed = false;
  let error = null, starting = false, generation = 0, appliedJet = NaN, ready = false;
  let explosionBuffer = null, pressBuffer = null, totalEffects = 0, totalPresses = 0, totalExplosions = 0, effectError = null;
  const effects = new Set();
  const supported = typeof Context === 'function';

  function finishEffect(effect, stop = false) {
    if (effect.finished) return;
    effect.finished = true;
    if (effect.source) {
      effect.source.onended = null;
      if (stop) { try { effect.source.stop(); } catch { /* already ended */ } }
      try { effect.source.disconnect(); } catch { /* partially initialized */ }
    }
    try { effect.gain?.disconnect(); } catch { /* partially initialized */ }
    effects.delete(effect);
    updateDucking();
  }

  function updateDucking() {
    if (!ambienceBus || context?.state === 'closed') return;
    const active = effects.size > 0;
    fade(ambienceBus.gain, active ? .4 : 1, active ? .025 : .25);
  }

  function stopEffects(immediate = false) {
    for (const effect of [...effects]) {
      if (immediate || context?.state !== 'running') { finishEffect(effect, true); continue; }
      if (effect.stopping) continue;
      effect.stopping = true;
      effect.endsAt = Math.min(effect.endsAt, context.currentTime + .035);
      try {
        effect.gain.gain.cancelScheduledValues(context.currentTime);
        effect.gain.gain.setTargetAtTime(0, context.currentTime, .006);
        effect.source.stop(effect.endsAt);
      } catch { finishEffect(effect, true); }
    }
  }

  function pruneEffects() {
    if (!context) return;
    for (const effect of [...effects]) if (context.currentTime >= effect.endsAt) finishEffect(effect, true);
  }

  function fade(parameter, value, seconds = .18) {
    const time = context.currentTime;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(time);
    else {
      parameter.cancelScheduledValues(time);
      parameter.setValueAtTime(parameter.value, time);
    }
    parameter.setTargetAtTime(value, time, seconds);
  }

  function applyLevels() {
    if (!master || !context || context.state === 'closed') return;
    fade(master.gain, desired && !hidden && !disposed ? .72 : 0, .16);
    fade(wash.gain, .30 + .28 * jet, .12);
    fade(lowpass.frequency, 4700 + 900 * jet, .18);
    appliedJet = jet;
  }

  function releaseNodes() {
    stopEffects(true); explosionBuffer = pressBuffer = null;
    for (const source of sources) { try { source.stop(); } catch { /* already stopped */ } }
    for (const node of nodes) { try { node.disconnect(); } catch { /* disconnected */ } }
    sources = []; nodes = [];
    master = ambienceBus = effectsBus = wash = lowpass = analyser = waveform = null;
    ready = false;
  }

  function build() {
    context = new Context({ latencyHint: 'playback' });
    const keep = node => { nodes.push(node); return node; };
    master = keep(context.createGain()); master.gain.value = 0;
    analyser = keep(context.createAnalyser()); analyser.fftSize = 2048;
    waveform = new Float32Array(analyser.fftSize);
    master.connect(analyser); analyser.connect(context.destination);
    ambienceBus = keep(context.createGain()); ambienceBus.gain.value = 1; ambienceBus.connect(master);
    // Keep overlapping effects controlled while retaining the initial impact.
    effectsBus = keep(context.createDynamicsCompressor());
    effectsBus.threshold.value = -4; effectsBus.knee.value = 6; effectsBus.ratio.value = 12;
    effectsBus.attack.value = .002; effectsBus.release.value = .18; effectsBus.connect(master);

    const data = createFanNoise({ sampleRate: context.sampleRate });
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    const source = keep(context.createBufferSource());
    source.buffer = buffer; source.loop = true; sources.push(source);
    const highpass = keep(context.createBiquadFilter()); highpass.type = 'highpass'; highpass.frequency.value = 135; highpass.Q.value = .55;
    lowpass = keep(context.createBiquadFilter()); lowpass.type = 'lowpass'; lowpass.frequency.value = 4700; lowpass.Q.value = .55;
    wash = keep(context.createGain()); wash.gain.value = .30;
    source.connect(highpass); highpass.connect(lowpass); lowpass.connect(wash); wash.connect(ambienceBus);
    source.start();

    const explosion = createExplosionSound({ sampleRate: context.sampleRate });
    explosionBuffer = context.createBuffer(1, explosion.length, context.sampleRate);
    explosionBuffer.getChannelData(0).set(explosion);
    const press = createEmoPressSound({ sampleRate: context.sampleRate });
    pressBuffer = context.createBuffer(1, press.length, context.sampleRate);
    pressBuffer.getChannelData(0).set(press);

    // Quiet motor harmonics add recognizable fan body without musical notes.
    for (const [frequency, level] of [[180, .009], [360, .005], [720, .0028]]) {
      const motor = keep(context.createOscillator()); motor.type = 'sine'; motor.frequency.value = frequency;
      const gain = keep(context.createGain()); gain.gain.value = level;
      motor.connect(gain); gain.connect(ambienceBus); sources.push(motor); motor.start();
    }
    ready = true;
  }

  function snapshot() {
    pruneEffects();
    const contextState = context?.state || (supported ? 'idle' : 'not-supported');
    const enabled = !disposed && !error && desired && !hidden && contextState === 'running' && ready;
    let rms = 0, peak = 0;
    if (!disposed && analyser && contextState === 'running') {
      try {
        analyser.getFloatTimeDomainData(waveform);
        let energy = 0;
        for (const value of waveform) { energy += value * value; peak = Math.max(peak, Math.abs(value)); }
        rms = Math.sqrt(energy / waveform.length);
      } catch (cause) { error = String(cause?.message || cause); }
    }
    const status = disposed ? 'disposed' : !supported ? 'not-supported' : error ? 'error' : !desired ? 'muted' : hidden ? 'hidden' : enabled ? 'running' : starting ? 'starting' : context ? contextState : 'idle';
    return { enabled: enabled && !error, desired, status, contextState, rms, peak, jet, hidden, error, activeEffects: effects.size, totalEffects, totalPresses, totalExplosions, effectError };
  }

  async function activate() {
    if (disposed || !desired || hidden || !supported) return snapshot();
    const operation = ++generation;
    error = null; starting = true;
    try {
      if (!context || context.state === 'closed') { releaseNodes(); build(); }
      // Invoke resume synchronously before awaiting, retaining gesture activation.
      if (context.state !== 'running') { stopEffects(true); await context.resume(); }
      if (disposed || operation !== generation) return snapshot();
      applyLevels();
    } catch (cause) {
      if (!disposed && operation === generation) {
        error = String(cause?.message || cause);
        if (ready) fade(master.gain, 0, .08);
        else {
          const failedContext = context;
          releaseNodes(); context = null;
          try { Promise.resolve(failedContext?.close()).catch(() => {}); } catch { /* partial initialization */ }
        }
      }
    } finally { if (operation === generation) starting = false; }
    return snapshot();
  }

  async function toggle() {
    if (disposed) return snapshot();
    desired = !desired;
    if (desired) return activate();
    generation++; starting = false;
    stopEffects();
    applyLevels();
    return snapshot();
  }

  function update(next = {}) {
    const nextJet = Object.hasOwn(next, 'jet') ? clamp01(next.jet) : jet;
    const nextHidden = typeof next.hidden === 'boolean' ? next.hidden : hidden;
    const changed = Math.abs(nextJet - appliedJet) > .005 || nextHidden !== hidden;
    jet = nextJet; hidden = nextHidden;
    if (hidden) stopEffects();
    if (!disposed && changed) applyLevels();
    return snapshot();
  }

  function playEffect(kind) {
    if (disposed || !desired || hidden || !ready || error || context?.state !== 'running') return false;
    pruneEffects();
    if (effects.size >= MAX_EXPLOSION_VOICES) return false;
    const press = kind === 'press';
    const effect = { source: null, gain: null, endsAt: context.currentTime + (press ? EMO_PRESS_DURATION : EXPLOSION_DURATION), finished: false, stopping: false };
    try {
      effect.source = context.createBufferSource(); effect.source.buffer = press ? pressBuffer : explosionBuffer;
      effect.gain = context.createGain(); effect.gain.gain.value = press ? .58 : EXPLOSION_GAIN;
      effect.source.connect(effect.gain); effect.gain.connect(effectsBus);
      effect.source.onended = () => finishEffect(effect);
      effects.add(effect);
      updateDucking();
      effect.source.start(context.currentTime);
      totalEffects++; effectError = null;
      if (press) totalPresses++; else totalExplosions++;
      return true;
    } catch (cause) {
      effectError = String(cause?.message || cause);
      finishEffect(effect, true);
      return false;
    }
  }

  async function dispose() {
    if (disposed) return;
    disposed = true; desired = false; starting = false; generation++;
    releaseNodes();
    if (context && context.state !== 'closed') {
      try { await context.close(); } catch { /* no live graph remains */ }
    }
  }

  return { activate, toggle, update, playExplosion: () => playEffect('explosion'), playEmoPress: () => playEffect('press'), dispose, get state() { return snapshot(); } };
}
