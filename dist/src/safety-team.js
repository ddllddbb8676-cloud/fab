import { bays } from './layout.js?v=4b21b3c206ef';
import { NPC_SAFETY_SPEED } from './locomotion.js?v=4b21b3c206ef';
import { canWalkSegment, findWalkPath } from './walking.js?v=4b21b3c206ef';
import {stepNpc,rerouteNpc} from './npc-navigation.js?v=4b21b3c206ef';
import { VISITOR_ADJECTIVES, createUniqueNickname } from './visitor-name.js?v=4b21b3c206ef';
import { SAFETY_PATROL_ROLES } from './room-population.js?v=4b21b3c206ef';
import {isRestArea,canSafetyTraverse,restAreaExit,SAFETY_CLEARANCE} from './rest-area.js?v=4b21b3c206ef';

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
  return isSafety(guard.role) && !guard.hidden && !person.hidden && !isSafety(person.role) && !isRestArea(person) && !isRestArea(guard) &&
    !person.penalty && time >= (person.safeUntil || 0) && !['repair','riding','climb'].includes(person.phase) &&
    !['riding','climb','repair'].includes(guard.phase) && distance(guard,person) < .95 && canWalkSegment(guard,person);
}

// Four extra residents share the same corridor routing as visitors.
export function createSafetyPatrols({random=Math.random,excludedNames=[]}={}) {
  const names=[...excludedNames],people=[];let planner=0;
  for(let i=0;i<SAFETY_PATROL_ROLES.length;i++) {
    const bay=bays[(i*4+1)%bays.length],name=createSafetyName(random,names);names.push(name);
    people.push({id:`safety:${i}`,name,role:SAFETY_PATROL_ROLES[i],x:bay.x,y:0,z:bay.z,
      heading:0,speed:0,phase:'patrol',posture:'stand',time:0,path:[],nextThink:0,brokenCount:8+(i*3)%4,repairedCount:0});
  }
  function update(dt,visitors,time) {
    const neighbors=[...people,...visitors.filter(p=>p.id?.startsWith('resident:'))];
    for(const p of people) {
      if(isRestArea(p,SAFETY_CLEARANCE)){Object.assign(p,restAreaExit(p));p.path=[];p.nextThink=0;}
      p.time+=dt;p.speed=0;
      const goal=p.path[0];if(!goal)continue;
      if(!canSafetyTraverse(p,goal)){p.path=[];p.nextThink=0;continue;}
      const d=distance(p,goal);
      if(d>.001){const next=stepNpc(p,goal,dt,NPC_SAFETY_SPEED,neighbors,{canTraverse:canSafetyTraverse});p.speed=distance(p,next)/dt;if(p.speed>.01)p.heading=Math.atan2(next.x-p.x,next.z-p.z);Object.assign(p,next);}
      if(distance(p,goal)<.03)p.path.shift();
    }
    // At most one route calculation each tick; each guard replans at most once a second.
    const p=people[planner++%people.length];if(time<p.nextThink)return;p.nextThink=time+1;
    if(rerouteNpc(p,neighbors,time,{canTraverse:canSafetyTraverse})){p.nextThink=time+3;return;}
    const candidates=visitors.filter(v=>!v.hidden&&!isRestArea(v)&&!isSafety(v.role)&&!v.penalty&&time>=(v.safeUntil||0)&&!['repair','riding','climb'].includes(v.phase)&&distance(p,v)<15).sort((a,b)=>distance(p,a)-distance(p,b));
    if(candidates.length){const target=candidates.find(v=>!people.some(other=>other!==p&&other.chasingId===v.id))??candidates[0];p.chasingId=target.id;p.path=findWalkPath(p,target,{canTraverse:canSafetyTraverse})||[];p.phase='chase';}
    else if(!p.path.length||p.phase==='chase'){p.chasingId=null;const bay=bays[Math.min(bays.length-1,Math.floor(random()*bays.length))];p.path=findWalkPath(p,{x:bay.x+(random()-.5)*36,z:bay.z+(random()-.5)*1.8},{canTraverse:canSafetyTraverse})||[];p.phase='patrol';}
  }
  return {people,update};
}
