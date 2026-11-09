import {canWalkSegment,findWalkPath,stepWalker} from './walking.js?v=2cab4ff9c4d9';

export const NPC_SPACING=.68;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const ground=p=>!p.hidden&&(p.y||0)<.5&&!['riding','climb'].includes(p.phase)&&p.role!=='rider';
export function npcSpeed(actor,base){
  let hash=0;for(const char of actor.id)hash=(hash*31+char.charCodeAt(0))>>>0;
  return base*(.9+(hash%23)/100);
}
function segmentDistance(a,b,p){
  const dx=b.x-a.x,dz=b.z-a.z,d=dx*dx+dz*dz;
  const t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/d)):0;
  return Math.hypot(a.x+dx*t-p.x,a.z+dz*t-p.z);
}
function clearPerson(a,b,p){
  const before=distance(a,p);
  // Also let an old overlapping state separate instead of permanently locking.
  if(before<NPC_SPACING-.001)return distance(b,p)>before+.00001&&segmentDistance(a,b,p)>=before-.00001;
  return segmentDistance(a,b,p)>=NPC_SPACING-.00001;
}
const direction=p=>{const goal=p.path?.[0];if(!goal)return {x:0,z:0};const d=distance(p,goal);return d?{x:(goal.x-p.x)/d,z:(goal.z-p.z)/d}:{x:0,z:0};};

export function npcDestination(actor,target,people,{canTraverse=()=>true}={}){
  const occupied=point=>people.some(p=>p.id!==actor.id&&ground(p)&&distance(point,p)<NPC_SPACING+.08);
  if(!occupied(target))return target;
  const candidates=[];
  for(const radius of [.85,1.2])for(let n=0;n<16;n++){
    const point={x:target.x+Math.cos(n*Math.PI/8)*radius,z:target.z+Math.sin(n*Math.PI/8)*radius};
    if(!occupied(point)&&canTraverse(point,point)&&canWalkSegment(point,point))candidates.push(point);
  }
  candidates.sort((a,b)=>distance(actor,a)-distance(actor,b));return candidates[0]??target;
}

// Local collision avoidance is shared by the server and the offline preview.
// Only NPCs participate, so a visitor's own controls and capture distance stay intact.
export function stepNpc(actor,goal,dt,baseSpeed,people,{canTraverse=()=>true}={}){
  const length=distance(actor,goal);if(length<.00001)return {x:actor.x,z:actor.z};
  const speed=npcSpeed(actor,baseSpeed),travel=Math.min(length,speed*dt),dx=(goal.x-actor.x)/length,dz=(goal.z-actor.z)/length;
  const nearby=people.filter(p=>p.id!==actor.id&&ground(p)&&distance(actor,p)<3);
  if(length<1&&nearby.some(p=>distance(goal,p)<NPC_SPACING)){
    actor.trafficWait=(actor.trafficWait||0)+dt;actor.trafficBlocker=nearby.find(p=>distance(goal,p)<NPC_SPACING).id;
    return {x:actor.x,z:actor.z};
  }
  let best=null,bestScore=-Infinity;
  const turns=nearby.length?[0,-.35,-.7,-1.1,-Math.PI/2,.35,.7,1.1,Math.PI/2]:[0];
  for(const angle of turns){
    const vx=dx*Math.cos(angle)-dz*Math.sin(angle),vz=dx*Math.sin(angle)+dz*Math.cos(angle);
    const next=stepWalker(actor,vx*travel,vz*travel),moved=distance(actor,next);
    if(moved<travel*.8||!canTraverse(actor,next)||!nearby.every(p=>clearPerson(actor,next,p)))continue;
    let score=(length-distance(next,goal))/Math.max(travel,.0001)*2.5-Math.abs(angle)*.08;
    for(const p of nearby){
      const other=direction(p),rvx=vx*speed-other.x*(p.speed||0),rvz=vz*speed-other.z*(p.speed||0),rx=actor.x-p.x,rz=actor.z-p.z;
      const vv=rvx*rvx+rvz*rvz,t=vv?Math.max(0,Math.min(.85,-(rx*rvx+rz*rvz)/vv)):0;
      const closest=Math.hypot(rx+rvx*t,rz+rvz*t);
      score-=Math.max(0,1.05-closest)*5;
      if(distance(actor,p)<NPC_SPACING){
        score+=(distance(next,p)-distance(actor,p))/Math.max(travel,.0001)*6;
        if(Math.abs(angle)>1)score+=(actor.id>p.id?angle:-angle)*.1;
      }
    }
    // Prefer passing to the right when two equally good routes are available.
    if(angle<0)score+=.015;
    if(score>bestScore){best=next;bestScore=score;}
  }
  const next=best??{x:actor.x,z:actor.z},progress=length-distance(next,goal);
  actor.trafficWait=progress<travel*.18?(actor.trafficWait||0)+dt:0;
  actor.trafficBlocker=nearby.sort((a,b)=>distance(actor,a)-distance(actor,b))[0]?.id;
  return next;
}

export function rerouteNpc(actor,people,time,{canTraverse=()=>true}={}){
  if(!actor.path?.length||(actor.trafficWait||0)<1.6||time<(actor.nextTrafficPlan||0))return false;
  const blockers=people.filter(p=>p.id!==actor.id&&ground(p)&&distance(actor,p)<10);
  const blocker=blockers.find(p=>p.id===actor.trafficBlocker);
  // One of an opposing pair yields first; the other keeps its route.
  if(blocker?.path?.length&&actor.id<blocker.id&&actor.trafficWait<5)return false;
  actor.nextTrafficPlan=time+2.5;
  const target=['caught-lap','patrol','chase'].includes(actor.phase)?npcDestination(actor,actor.path.at(-1),blockers,{canTraverse}):actor.path.at(-1);
  const path=findWalkPath(actor,target,{canTraverse:(a,b)=>canTraverse(a,b)&&blockers.every(p=>clearPerson(a,b,p))});
  if(!path)return false;
  actor.path=path;actor.trafficWait=0;return true;
}
