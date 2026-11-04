import { AIR_SHOWER } from './air-shower.js?v=2628ec24ca43';

const clamp = t => Math.max(0, Math.min(1, t));
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const ENTRY_TIMES = { shower: .8, settle: 4.8, opening: 5.45, walking: 7.05, closing: 11.25, done: 12.45 };

// Cinematic timings only; this is not a real air-shower operating cycle.
export function sampleEntry(time) {
  const t = Math.max(0, time), T = ENTRY_TIMES;
  const stage = t < T.shower ? 'ready' : t < T.settle ? 'shower' : t < T.opening ? 'settle' : t < T.walking ? 'opening' : t < T.closing ? 'entering' : t < T.done ? 'closing' : 'done';
  // Finish walking to the clear exit before either door leaf starts closing.
  const walk = smooth((t - T.walking) / (T.closing - T.walking));
  const door = smooth((t - T.opening) / (T.walking - T.opening)) * (1 - smooth((t - T.closing) / (T.done - T.closing)));
  return { time: t, stage, complete: stage === 'done',
    jet: t < T.settle ? smooth((t - T.shower) / .35) : 1 - smooth((t - T.settle) / .5),
    door, walk,
    progress: clamp(t / T.done), remaining: Math.max(0, Math.ceil(T.settle - t)),
    position: { x: AIR_SHOWER.start.x, z: AIR_SHOWER.start.z + (AIR_SHOWER.exit.z - AIR_SHOWER.start.z) * walk } };
}

export function createEntrySequence({ reducedMotion = false } = {}) {
  let time = 0, active = false;
  return {
    get active() { return active; },
    get state() { return sampleEntry(time); },
    start() { time = reducedMotion ? ENTRY_TIMES.done : 0; active = true; return sampleEntry(time); },
    skip() { time = ENTRY_TIMES.done; return sampleEntry(time); },
    step(dt) { if (active && Number.isFinite(dt) && dt > 0) time = Math.min(ENTRY_TIMES.done, time + dt); return sampleEntry(time); },
    finish() { active = false; }
  };
}
