import {isSafety} from './safety-team.js';
import {canWalkSegment} from './walking.js';
import {isRestArea} from './rest-area.js';

export const SAFETY_DIZZY_SECONDS=2;
export const SAFETY_DIZZY_COOLDOWN=10;
export const SAFETY_DIZZY_RADIUS=1.65;

export function isFoupHitTarget(actor){
  // Normal on-foot movement and standing only. Work, its approach, seats and
  // NPC cart recovery keep their state even when a FOUP passes through them.
  return !actor.hidden&&(actor.y||0)<=.15&&!isRestArea(actor)&&
    (actor.posture||'stand')==='stand'&&['idle','patrol','chase'].includes(actor.phase||'idle')&&
    actor.targetId==null&&actor.vehicleId==null&&!actor.cartTask&&!actor.cleanTask&&!actor.lap&&
    actor.cleanTargetId==null&&!(actor.caughtLeft>0)&&!(actor.catchLeft>0);
}

// Called only for a newly shattered FOUP, never for a restored debris record.
// All timers are transient room time; no penalty, score or profile is changed.
export function markFoupDizzy(actor,impact,time){
  if(!isFoupHitTarget(actor)||
    (actor.dizzyLeft||0)>0||time<(actor.dizzyReadyAt||0)||
    Math.hypot(actor.x-impact.x,actor.z-impact.z)>SAFETY_DIZZY_RADIUS||!canWalkSegment(impact,actor))return false;
  actor.dizzyUntil=time+SAFETY_DIZZY_SECONDS;actor.dizzyLeft=SAFETY_DIZZY_SECONDS;
  actor.dizzyReadyAt=time+SAFETY_DIZZY_COOLDOWN;
  actor.speed=0;actor.posture='stand';actor.catchLeft=0;
  // Safety replans its chase. Other walkers resume their original route.
  if(isSafety(actor.role)&&Array.isArray(actor.path)){actor.path=[];actor.chasingId=null;actor.nextThink=actor.dizzyUntil;}
  actor.emote='angry';actor.emoteSeq=(actor.emoteSeq||0)+1;
  actor.emoteUntil=actor.dizzyUntil;actor.emoteLeft=SAFETY_DIZZY_SECONDS;
  return true;
}
