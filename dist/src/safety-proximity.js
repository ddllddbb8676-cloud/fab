import {isSafety} from './safety-team.js?v=b2d839209a1c';
import {isRestArea} from './rest-area.js?v=b2d839209a1c';

export function safetyProximity(person,guards,previous=false){
  const protectedPhases=['repair','riding','climb'];
  if(person.hidden||person.penalty||isSafety(person.role)||isRestArea(person)||protectedPhases.includes(person.phase))return {near:false,strength:0};
  let distance=Infinity;
  for(const guard of guards){
    if(guard.id===person.id||!isSafety(guard.role)||guard.hidden||protectedPhases.includes(guard.phase))continue;
    distance=Math.min(distance,Math.hypot(guard.x-person.x,guard.z-person.z));
  }
  const near=distance<(previous?10.5:8.5);
  return {near,strength:near?Math.max(.25,Math.min(1,1-distance/11)):0,distance};
}
