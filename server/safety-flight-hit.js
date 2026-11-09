import {isSafetyHitTarget} from '../src/safety-dizzy.js';
import {canWalkSegment} from '../src/walking.js';

// Body width plus the FOUP half-width, with a little touch-control tolerance.
export const SAFETY_FLIGHT_RADIUS=.62;
const MIN_HEIGHT=.05,MAX_HEIGHT=1.75;

function entryFraction(from,to,guard){
  const dx=to.x-from.x,dz=to.z-from.z,dy=to.y-from.y;
  const x=from.x-guard.x,z=from.z-guard.z,y=from.y-(guard.y||0);
  let near=0,far=1;
  if(Math.abs(dy)<1e-10){if(y<MIN_HEIGHT||y>MAX_HEIGHT)return null;}
  else {
    const a=(MIN_HEIGHT-y)/dy,b=(MAX_HEIGHT-y)/dy;
    near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
  }
  const a=dx*dx+dz*dz,c=x*x+z*z-SAFETY_FLIGHT_RADIUS**2;
  if(a<1e-12){if(c>0)return null;}
  else {
    const b=2*(x*dx+z*dz),discriminant=b*b-4*a*c;
    if(discriminant<0)return null;
    const root=Math.sqrt(discriminant);
    near=Math.max(near,(-b-root)/(2*a));far=Math.min(far,(-b+root)/(2*a));
  }
  return near<=far?near:null;
}

// Check the whole traveled segment, not just its end, so a fast carrier cannot
// skip a body between server ticks. Only the first body stops this FOUP.
export function firstSafetyFlightHit(record,from,to,guards){
  if(!record.shatter)return null;
  let first=null,fraction=Infinity;
  for(const guard of guards){
    if(guard.id===record.throwerId||!isSafetyHitTarget(guard))continue;
    const t=entryFraction(from,to,guard);
    if(t===null||t>=fraction||!canWalkSegment(from,guard))continue;
    fraction=t;first={guardId:guard.id,point:{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t}};
  }
  return first;
}
