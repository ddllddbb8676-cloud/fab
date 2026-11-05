import {bays} from '../src/layout.js';
import {CONTEST_ZONES} from '../src/foup-contest.js';

// A modest supply near the two circles; interleave bays and both machine rows.
// Plan once, then the recruitment timer applies at most one repair per tick.
export function planContestRepairs(isDestroyed, available=()=>true) {
  const nearby=bays.filter(b=>CONTEST_ZONES.some(z=>Math.abs(z.z-b.z)<.01));
  const groups=nearby.map(b=>{
    const needed=Math.min(4,Math.max(0,12-b.machines.filter(m=>!isDestroyed(m.id)).length));
    return b.machines.filter(m=>isDestroyed(m.id)&&available(m.id))
      .sort((a,c)=>Math.abs(a.x)-Math.abs(c.x)||a.z-c.z).slice(0,needed).map(m=>m.id);
  });
  return Array.from({length:4},(_,i)=>groups.map(ids=>ids[i]).filter(Number.isInteger)).flat();
}
