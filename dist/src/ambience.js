// Ventilation is generated locally. Construction is silent until activate() is
// called from a trusted gesture; a later gesture never overrides explicit mute.
const clamp01 = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export const EXPLOSION_DURATION = 2.8;
export const MAX_EXPLOSION_VOICES = 4;
const EXPLOSION_GAIN = 1.2;
export const EMO_PRESS_DURATION = .16;
export const CHIP_REWARD_DURATION = .58;
export const MOTION_CUES = {
  step: [.13, 120, .28], sit: [.26, 220, .36], lie: [.4, 160, .38], stand: [.26, 300, .32],
  repair: [.19, 740, .62], complete: [.6, 690, .45], climb: [.2, 175, .48],
  jump: [.32, 420, .46], grab: [.2, 1050, .58], land: [.3, 110, .7],
  pickup: [.22, 380, .48], place: [.28, 260, .6], throw: [.34, 650, .5], bounce: [.3, 430, .6],
  shatter: [.6, 1900, .85], sweep: [.42, 0, .55],
  chip: [CHIP_REWARD_DURATION, 1600, .92]
};
/** Small cloth, shoe, metal and air gestures; buffers are cached by the mixer. */
export function createMotionSound(kind, { sampleRate = 48000 } = {}) {
  const spec = MOTION_CUES[kind];
  if (!spec) throw new RangeError('Unknown motion cue');
  if (kind === 'chip') return createChipRewardSound({sampleRate});
  if (kind === 'shatter' || kind === 'sweep') return createFoupSound(kind,{sampleRate});
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('Unsupported motion sample rate');
  const [duration, frequency] = spec, data = new Float32Array(Math.floor(sampleRate * duration));
  const cloth = ['sit', 'lie', 'stand', 'throw', 'jump'].includes(kind);
  let seed = 0x7fa51, filtered = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate, p = t / duration;
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const noise = (seed >>> 0) / 0x100000000 * 2 - 1;
    filtered += .22 * (noise - filtered);
    const f = kind === 'complete' ? frequency * (p < .33 ? 1 : p < .66 ? 1.25 : 1.5) : frequency;
    const tone = Math.sin(2 * Math.PI * f * t) + .3 * Math.sin(2 * Math.PI * f * 1.46 * t);
    const envelope = cloth ? Math.sin(Math.PI * p) ** 2 : Math.min(1, t / .003) * Math.exp(-p * 5) * Math.min(1, (1 - p) * 12);
    data[i] = .65 * Math.tanh(cloth ? filtered * 3 : tone * .7 + noise * .45) * envelope;
  }
  return data;
}

/** A hollow case crack, cascading silicon clinks, and a soft broom swish. */
export function createFoupSound(kind,{sampleRate=48000}={}){
  if(!['shatter','sweep'].includes(kind)||!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw new RangeError('Unsupported FOUP sound');
  const duration=MOTION_CUES[kind][0],data=new Float32Array(Math.floor(sampleRate*duration));let seed=0x51f0a,low=0;
  const hits=[[.005,190,1],[.065,1720,.5],[.14,2310,.5],[.23,1530,.38],[.33,2780,.3],[.42,2070,.23]];
  for(let i=0;i<data.length;i++){
    const t=i/sampleRate,p=t/duration;seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const noise=(seed>>>0)/4294967296*2-1;low+=(noise-low)*.12;let value=0;
    if(kind==='sweep')value=(noise-low)*.45+low*1.8;
    else for(const [start,hz,level]of hits){const age=t-start;if(age>=0)value+=level*(Math.sin(age*TAU_AUDIO*Math.min(hz,sampleRate*.34))*Math.exp(-age/.055)+noise*Math.exp(-age/.012)*1.4);}
    const envelope=kind==='sweep'?Math.sin(Math.PI*p)**1.4:Math.min(1,t/.003)*Math.min(1,(duration-t)/.06);
    data[i]=.64*Math.tanh(value*1.5)*envelope*Math.min(1,(data.length-1-i)/(sampleRate*.008));
  }
  return data;
}
const TAU_AUDIO=Math.PI*2;

/** Four tiny metal coin impacts, with a short bright ring for phone speakers. */
export function createChipRewardSound({sampleRate=48000}={}) {
  if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw new RangeError('Unsupported chip sample rate');
  const data=new Float32Array(Math.floor(sampleRate*CHIP_REWARD_DURATION));
  const hits=[[.035,1530,1],[.115,2070,.8],[.205,1780,.65],[.295,2390,.5]];
  let seed=0x6c01;
  for(let i=0;i<data.length;i++){
    const t=i/sampleRate;seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    const noise=(seed>>>0)/0x100000000*2-1;let value=0;
    for(const [start,hz,strength]of hits){
      const age=t-start;if(age<0)continue;
      const f=Math.min(hz,sampleRate*.2),ring=Math.sin(2*Math.PI*f*age)+.42*Math.sin(2*Math.PI*f*1.47*age)+.22*Math.sin(2*Math.PI*f*2.13*age);
      value+=strength*Math.min(1,age/.0015)*(ring*Math.exp(-age/.075)+noise*.2*Math.exp(-age/.007));
    }
    data[i]=.62*Math.tanh(value)*Math.min(1,(data.length-1-i)/(sampleRate*.035));
  }
  return data;
}

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
  let ambienceDesired = true, effectsDesired = true, totalCues = 0;
  const cueBuffers = new Map(), cueCounts = {};
  let error = null, starting = false, generation = 0, appliedJet = NaN, ready = false;
  let explosionBuffer = null, pressBuffer = null, totalEffects = 0, totalPresses = 0, totalExplosions = 0, effectError = null;
  const effects = new Set();
  let stockerBuffer=null,stockerLoading=null,stockerRequest=0;
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
    fade(ambienceBus.gain, ambienceDesired ? (active ? .32 : 1) : 0, active ? .025 : .25);
  }

  function stopEffects(immediate = false) {
    stockerRequest++;
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
    updateDucking();
  }

  function releaseNodes() {
    stopEffects(true); explosionBuffer = pressBuffer = null;
    stockerBuffer=null;stockerLoading=null;
    cueBuffers.clear();
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
    return { enabled: enabled && !error, desired, ambienceDesired, effectsDesired, ambienceEnabled: enabled && ambienceDesired, effectsEnabled: enabled && effectsDesired, ducked: effects.size > 0 && ambienceDesired, status, contextState, rms, peak, jet, hidden, error, activeEffects: effects.size, totalEffects, totalPresses, totalExplosions, totalCues, cueCounts: { ...cueCounts }, effectError };
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
    if(context?.state==='running')for(const effect of effects)if(effect.localVolume&&!effect.stopping){const volume=clamp01(effect.localVolume());if(volume<.015)finishEffect(effect,true);else effect.gain.gain.setTargetAtTime(.42*volume,context.currentTime,.15);}
    if (!disposed && changed) applyLevels();
    return snapshot();
  }

  function prepareStocker(){
    if(stockerBuffer)return Promise.resolve(stockerBuffer);
    if(stockerLoading)return stockerLoading;
    if(disposed||!effectsDesired||hidden||!ready||!context)return Promise.resolve(null);
    const audioContext=context,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
    const pending=Promise.resolve().then(async()=>{
      try{
        const response=await (options.fetch??globalThis.fetch)('/audio/entertainer/fab-entertainer-stocker.mp3',{signal:controller.signal});
        if(!response.ok)throw Error('Stocker audio unavailable');
        const buffer=await audioContext.decodeAudioData(await response.arrayBuffer());
        if(!disposed&&context===audioContext)stockerBuffer=buffer;
        return context===audioContext?buffer:null;
      }catch{return null;}finally{clearTimeout(timer);if(stockerLoading===pending)stockerLoading=null;}
    });stockerLoading=pending;return pending;
  }
  async function playStocker(localVolume=()=>1){
    if(disposed||!effectsDesired||!desired||hidden||!ready||context?.state!=='running'||localVolume()<=.025||[...effects].some(e=>e.stocker))return false;
    const request=++stockerRequest,started=Date.now(),buffer=await prepareStocker();
    const elapsed=(Date.now()-started)/1000;
    if(!buffer||request!==stockerRequest||elapsed>2||disposed||hidden||!effectsDesired||!desired||context?.state!=='running'||localVolume()<=.025||effects.size>=MAX_EXPLOSION_VOICES)return false;
    const effect={source:null,gain:null,motion:true,reward:false,stocker:true,localVolume,endsAt:context.currentTime+buffer.duration-elapsed,finished:false,stopping:false};
    try{
      effect.source=context.createBufferSource();effect.source.buffer=buffer;
      effect.gain=context.createGain();effect.gain.gain.value=.42*clamp01(localVolume());
      effect.source.connect(effect.gain);effect.gain.connect(effectsBus);effect.source.onended=()=>finishEffect(effect);
      effects.add(effect);updateDucking();effect.source.start(context.currentTime,elapsed);totalEffects++;totalCues++;cueCounts['stocker-out']=(cueCounts['stocker-out']??0)+1;return true;
    }catch{finishEffect(effect,true);return false;}
  }

  function playEffect(kind, volume = 1) {
    if (disposed || !desired || !effectsDesired || hidden || !ready || error || context?.state !== 'running' || volume <= 0) return false;
    pruneEffects();
    const motion = MOTION_CUES[kind], reward = kind === 'chip';
    if (effects.size >= MAX_EXPLOSION_VOICES) {
      if (motion && !reward && kind!=='shatter') return false;
      const quiet = [...effects].find(e => e.motion && !e.reward) || (reward ? [...effects].find(e => !e.reward) || effects.values().next().value : null);
      if (!quiet) return false;
      finishEffect(quiet, true);
    }
    const press = kind === 'press';
    const effect = { source: null, gain: null, motion: Boolean(motion), reward, endsAt: context.currentTime + (motion?.[0] ?? (press ? EMO_PRESS_DURATION : EXPLOSION_DURATION)), finished: false, stopping: false };
    try {
      if (motion && !cueBuffers.has(kind)) {
        const data = createMotionSound(kind, { sampleRate: context.sampleRate }), buffer = context.createBuffer(1, data.length, context.sampleRate);
        buffer.getChannelData(0).set(data); cueBuffers.set(kind, buffer);
      }
      effect.source = context.createBufferSource(); effect.source.buffer = motion ? cueBuffers.get(kind) : press ? pressBuffer : explosionBuffer;
      effect.gain = context.createGain(); effect.gain.gain.value = (motion?.[2] ?? (press ? .58 : EXPLOSION_GAIN)) * clamp01(volume);
      effect.source.connect(effect.gain); effect.gain.connect(effectsBus);
      effect.source.onended = () => finishEffect(effect);
      effects.add(effect);
      updateDucking();
      effect.source.start(context.currentTime);
      totalEffects++; effectError = null;
      if (motion) { totalCues++; cueCounts[kind] = (cueCounts[kind] ?? 0) + 1; }
      else if (press) totalPresses++; else totalExplosions++;
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

  async function toggleAmbience() { ambienceDesired = !ambienceDesired; updateDucking(); if (ambienceDesired) await activate(); return snapshot(); }
  async function toggleEffects() { effectsDesired = !effectsDesired; if (!effectsDesired) stopEffects(); else await activate(); return snapshot(); }
  return { activate, toggle, toggleAmbience, toggleEffects, update, prepareStocker,playStocker, playCue: (kind, volume) => MOTION_CUES[kind] ? playEffect(kind, volume) : false,
    playChipReward: volume => playEffect('chip', volume), playExplosion: volume => playEffect('explosion', volume), playEmoPress: volume => playEffect('press', volume), dispose, get state() { return snapshot(); } };
}
