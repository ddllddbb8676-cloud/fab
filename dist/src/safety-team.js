import { bays, BAY_PITCH } from './layout.js?v=1b5f80f35e53';
import { NPC_SAFETY_SPEED } from './locomotion.js?v=1b5f80f35e53';
import { canWalkSegment, findWalkPath } from './walking.js?v=1b5f80f35e53';
import {stepNpc,rerouteNpc} from './npc-navigation.js?v=1b5f80f35e53';
import { VISITOR_ADJECTIVES, createUniqueNickname } from './visitor-name.js?v=1b5f80f35e53';
import { SAFETY_PATROL_ROLES } from './room-population.js?v=1b5f80f35e53';
import {isRestArea,canSafetyTraverse,restAreaExit,SAFETY_CLEARANCE} from './rest-area.js?v=1b5f80f35e53';

export const PENALTY_MESSAGE = '안전팀에게 걸려 패널티를 부여받았습니다. 장비를 3대 고쳐야 다시 팹뿌를 하실 수 있습니다.';
export const SAFETY_CATCH_GOAL=3;
export const SAFETY_NO_EMO_MESSAGE=`안전팀은 장비를 부술 수 없어요. ${SAFETY_CATCH_GOAL}명을 잡고 일반 방진복으로 돌아오세요.`;
export const isSafety = role => role === 'safety-red' || role === 'safety-orange';
export const safetyColor = role => role === 'safety-red' ? '#ed4942' : role === 'safety-orange' ? '#ed751c' : '#ffffff';
export const isSuitMesh = name => ['hood','torso','pants','upperArm','forearm'].includes(name);
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
export function createSafetyName(random=Math.random,excluded=[],preferred='') {
  return createUniqueNickname(VISITOR_ADJECTIVES.map(a=>`${a} 안전팀`).filter(n=>[...n].length<=7),random,excluded,preferred);
}
export function canCatch(guard, person, time) {
  if(guard.id?.startsWith('safety:')&&(guard.avoidBayIds??[guard.avoidBayId]).some(id=>isEventBay(person,id,1)))return false;
  return isSafety(guard.role) && !guard.hidden && !person.hidden && !isSafety(person.role) && !isRestArea(person) && !isRestArea(guard) &&
    !person.penalty && time >= (person.safeUntil || 0) && !['repair','riding','climb'].includes(person.phase) &&
    !['riding','climb','repair','event-rest'].includes(guard.phase) && distance(guard,person) < .95 && canWalkSegment(guard,person);
}
export function isEventBay(point,id,margin=0){
  const bay=bays[id];return Boolean(bay&&Math.abs(point.x-bay.x)<=27.5+margin&&Math.abs(point.z-bay.z)<=BAY_PITCH/2+margin);
}
export function avoidsEventBay(a,b,id){
  const bay=bays[id];if(!bay)return true;
  let near=0,far=1;
  for(const [axis,half]of [['x',27.5],['z',BAY_PITCH/2]]){
    const min=bay[axis]-half-SAFETY_CLEARANCE,max=bay[axis]+half+SAFETY_CLEARANCE,delta=b[axis]-a[axis];
    if(!delta){if(a[axis]<min||a[axis]>max)return true;continue;}
    const first=(min-a[axis])/delta,last=(max-a[axis])/delta;
    near=Math.max(near,Math.min(first,last));far=Math.min(far,Math.max(first,last));if(near>far)return true;
  }
  return false;
}

// Four extra residents share the same corridor routing as visitors.
export function createSafetyPatrols({random=Math.random,excludedNames=[]}={}) {
  const names=[...excludedNames],people=[];let planner=0;
  let eventBays=[],paused=false;
  const inEventBay=(p,margin=0)=>eventBays.some(id=>isEventBay(p,id,margin));
  const canPatrolTraverse=(a,b)=>canSafetyTraverse(a,b)&&eventBays.every(id=>avoidsEventBay(a,b,id));
  function leaveEventBay(p,index){
    const id=eventBays.find(id=>isEventBay(p,id,SAFETY_CLEARANCE));if(id===undefined)return;
    Object.assign(p,{x:0,y:0,z:bays[id].z+(index-1.5)*.9,speed:0,path:[],nextThink:0,chasingId:null,phase:'patrol'});
  }
  for(let i=0;i<SAFETY_PATROL_ROLES.length;i++) {
    const bay=bays[(i*4+1)%bays.length],name=createSafetyName(random,names);names.push(name);
    people.push({id:`safety:${i}`,name,role:SAFETY_PATROL_ROLES[i],x:bay.x,y:0,z:bay.z,
      heading:0,speed:0,phase:'patrol',posture:'stand',time:0,path:[],nextThink:0,brokenCount:8+(i*3)%4,repairedCount:0});
  }
  function setEventBay(id){
    const next=[...new Set((Array.isArray(id)?id:[id]).filter(n=>Number.isInteger(n)&&bays[n]))];
    if(next.length===eventBays.length&&next.every((n,i)=>n===eventBays[i]))return;eventBays=next;
    people.forEach((p,i)=>{delete p.eventBayId;delete p.eventSlot;delete p.avoidBayId;delete p.avoidBayIds;p.chasingId=null;p.path=[];p.nextThink=0;if(next.length){p.avoidBayId=next[0];p.avoidBayIds=[...next];leaveEventBay(p,i);}});
  }
  function setPaused(value){
    value=Boolean(value);if(paused===value)return;paused=value;
    for(const p of people)Object.assign(p,{phase:paused?'event-rest':'patrol',speed:0,path:[],chasingId:null,nextThink:0});
  }
  function update(dt,visitors,time) {
    if(paused)return;
    const neighbors=[...people,...visitors.filter(p=>p.id?.startsWith('resident:'))];
    for(const p of people) {
      leaveEventBay(p,people.indexOf(p));
      if(isRestArea(p,SAFETY_CLEARANCE)){Object.assign(p,restAreaExit(p));p.path=[];p.nextThink=0;}
      p.time+=dt;p.speed=0;
      const goal=p.path[0];if(!goal)continue;
      if(!canPatrolTraverse(p,goal)){p.path=[];p.nextThink=0;continue;}
      const d=distance(p,goal);
      if(d>.001){const next=stepNpc(p,goal,dt,NPC_SAFETY_SPEED,neighbors,{canTraverse:canPatrolTraverse});p.speed=distance(p,next)/dt;if(p.speed>.01)p.heading=Math.atan2(next.x-p.x,next.z-p.z);Object.assign(p,next);}
      if(distance(p,goal)<.03)p.path.shift();
    }
    // At most one route calculation each tick; each guard replans at most once a second.
    const p=people[planner++%people.length];if(time<p.nextThink)return;p.nextThink=time+1;
    if(rerouteNpc(p,neighbors,time,{canTraverse:canPatrolTraverse})){p.nextThink=time+3;return;}
    const candidates=visitors.filter(v=>!inEventBay(v,1)&&!v.hidden&&!isRestArea(v)&&!isSafety(v.role)&&!v.penalty&&time>=(v.safeUntil||0)&&!['repair','riding','climb'].includes(v.phase)&&distance(p,v)<15).sort((a,b)=>distance(p,a)-distance(p,b));
    if(candidates.length){const target=candidates.find(v=>!people.some(other=>other!==p&&other.chasingId===v.id))??candidates[0];p.chasingId=target.id;p.path=findWalkPath(p,target,{canTraverse:canPatrolTraverse})||[];p.phase='chase';}
    else if(!p.path.length||p.phase==='chase'){p.chasingId=null;const choices=bays.filter(b=>!eventBays.includes(b.id)),bay=choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];let target={x:bay.x+(random()-.5)*36,z:bay.z+(random()-.5)*1.8};if(isRestArea(target,SAFETY_CLEARANCE))target=restAreaExit(target);p.path=findWalkPath(p,target,{canTraverse:canPatrolTraverse})||[];p.phase='patrol';}
  }
  return {people,update,setEventBay,setPaused};
}
