import {isSafety} from './safety-team.js';
import {canWalkSegment} from './walking.js';
import {isRestArea} from './rest-area.js';

export const SAFETY_DIZZY_SECONDS=2;
export const SAFETY_DIZZY_COOLDOWN=10;
export const SAFETY_DIZZY_RADIUS=1.65;

// Called only for a newly shattered FOUP, never for a restored debris record.
// All timers are transient room time; no penalty, score or profile is changed.
export function markSafetyDizzy(guard,impact,time){
  if(!isSafety(guard.role)||guard.hidden||(guard.y||0)>.15||isRestArea(guard)||
    ['riding','climb','cart-riding','event-rest'].includes(guard.phase)||
    (guard.dizzyLeft||0)>0||time<(guard.dizzyReadyAt||0)||
    Math.hypot(guard.x-impact.x,guard.z-impact.z)>SAFETY_DIZZY_RADIUS||!canWalkSegment(impact,guard))return false;
  guard.dizzyUntil=time+SAFETY_DIZZY_SECONDS;guard.dizzyLeft=SAFETY_DIZZY_SECONDS;
  guard.dizzyReadyAt=time+SAFETY_DIZZY_COOLDOWN;
  guard.speed=0;guard.posture='stand';guard.catchLeft=0;
  if(Array.isArray(guard.path)){guard.path=[];guard.chasingId=null;guard.nextThink=guard.dizzyUntil;}
  guard.emote='angry';guard.emoteSeq=(guard.emoteSeq||0)+1;
  guard.emoteUntil=guard.dizzyUntil;guard.emoteLeft=SAFETY_DIZZY_SECONDS;
  return true;
}
