// Ventilation is generated locally. Construction is silent until activate() is
// called from a trusted gesture; a later gesture never overrides explicit mute.
const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

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

/**
 * activate(): call only in a trusted user gesture, also to recover interruption.
 * toggle(): changes explicit preference; muted preference survives activate().
 * update(): safe in requestAnimationFrame; never creates/resumes a context.
 * state.rms/peak: measured after the master gain, before the destination.
 */
export function createAmbience(options = {}) {
  const Context = Object.hasOwn(options, 'AudioContext') ? options.AudioContext : (globalThis.AudioContext || globalThis.webkitAudioContext);
  let context = null, master = null, wash = null, lowpass = null, analyser = null, waveform = null;
  let sources = [], nodes = [], desired = true, hidden = false, jet = 0, disposed = false;
  let error = null, starting = false, generation = 0, appliedJet = NaN, ready = false;
  const supported = typeof Context === 'function';

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
    for (const source of sources) { try { source.stop(); } catch { /* already stopped */ } }
    for (const node of nodes) { try { node.disconnect(); } catch { /* disconnected */ } }
    sources = []; nodes = [];
    master = wash = lowpass = analyser = waveform = null;
    ready = false;
  }

  function build() {
    context = new Context({ latencyHint: 'playback' });
    const keep = node => { nodes.push(node); return node; };
    master = keep(context.createGain()); master.gain.value = 0;
    analyser = keep(context.createAnalyser()); analyser.fftSize = 2048;
    waveform = new Float32Array(analyser.fftSize);
    master.connect(analyser); analyser.connect(context.destination);

    const data = createFanNoise({ sampleRate: context.sampleRate });
    const buffer = context.createBuffer(1, data.length, context.sampleRate);
    buffer.getChannelData(0).set(data);
    const source = keep(context.createBufferSource());
    source.buffer = buffer; source.loop = true; sources.push(source);
    const highpass = keep(context.createBiquadFilter()); highpass.type = 'highpass'; highpass.frequency.value = 135; highpass.Q.value = .55;
    lowpass = keep(context.createBiquadFilter()); lowpass.type = 'lowpass'; lowpass.frequency.value = 4700; lowpass.Q.value = .55;
    wash = keep(context.createGain()); wash.gain.value = .30;
    source.connect(highpass); highpass.connect(lowpass); lowpass.connect(wash); wash.connect(master);
    source.start();

    // Quiet motor harmonics add recognizable fan body without musical notes.
    for (const [frequency, level] of [[180, .009], [360, .005], [720, .0028]]) {
      const motor = keep(context.createOscillator()); motor.type = 'sine'; motor.frequency.value = frequency;
      const gain = keep(context.createGain()); gain.gain.value = level;
      motor.connect(gain); gain.connect(master); sources.push(motor); motor.start();
    }
    ready = true;
  }

  function snapshot() {
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
    return { enabled: enabled && !error, desired, status, contextState, rms, peak, jet, hidden, error };
  }

  async function activate() {
    if (disposed || !desired || hidden || !supported) return snapshot();
    const operation = ++generation;
    error = null; starting = true;
    try {
      if (!context || context.state === 'closed') { releaseNodes(); build(); }
      // Invoke resume synchronously before awaiting, retaining gesture activation.
      if (context.state !== 'running') await context.resume();
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
    applyLevels();
    return snapshot();
  }

  function update(next = {}) {
    const nextJet = Object.hasOwn(next, 'jet') ? clamp01(next.jet) : jet;
    const nextHidden = typeof next.hidden === 'boolean' ? next.hidden : hidden;
    const changed = Math.abs(nextJet - appliedJet) > .005 || nextHidden !== hidden;
    jet = nextJet; hidden = nextHidden;
    if (!disposed && changed) applyLevels();
    return snapshot();
  }

  async function dispose() {
    if (disposed) return;
    disposed = true; desired = false; starting = false; generation++;
    releaseNodes();
    if (context && context.state !== 'closed') {
      try { await context.close(); } catch { /* no live graph remains */ }
    }
  }

  return { activate, toggle, update, dispose, get state() { return snapshot(); } };
}
