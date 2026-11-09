import {canWalkSegment} from '../src/walking.js';
import {isRestArea} from '../src/rest-area.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const SAFETY_DEMO_MIN_INTERVAL=90;

// Borrow an existing NPC throw, near someone who can see it. No spawned FOUP,
// forced player encounter, extra path search, or persistent timer is needed.
export function createSafetyThrowDemo({now,random=Math.random,guards,viewers,paused}){
  let nextAt=3,nextRefreshAt=30;
  function candidate(actor,maxDistance=4.4){
    const time=now();
    if(time<nextAt||paused()||actor.role!=='thrower'||actor.hidden||actor.penalty||actor.caughtLeft>0||actor.y>.15)return null;
    const audience=[...viewers()].filter(p=>!p.hidden&&distance(p,actor)<18);
    if(!audience.length)return null;
    const target=guards().filter(g=>{
      const d=distance(g,actor);
      return !g.hidden&&g.y<.15&&['patrol','chase'].includes(g.phase)&&!g.dizzyLeft&&time>=(g.dizzyReadyAt||0)&&
        (!g.chasingId||g.chasingId.startsWith('resident:'))&&!isRestArea(g)&&d>=2.5&&d<=maxDistance&&
        audience.some(p=>distance(p,g)<18)&&canWalkSegment(actor,g);
    }).sort((a,b)=>Math.abs(distance(actor,a)-3.5)-Math.abs(distance(actor,b)-3.5))[0];
    return target??null;
  }
  return {
    aim(actor){
      const target=candidate(actor);if(!target)return null;
      nextAt=now()+SAFETY_DEMO_MIN_INTERVAL+random()*60;
      return {x:target.x,z:target.z};
    },
    refresh(actor){
      // An old broken carrier normally keeps its thrower waiting for cleanup.
      // Occasionally let one visible NPC fetch a different existing port FOUP;
      // the old debris remains available for player cleanup and its reward.
      if(now()<nextRefreshAt||!candidate(actor,6))return false;
      nextRefreshAt=now()+SAFETY_DEMO_MIN_INTERVAL;return true;
    }
  };
}
