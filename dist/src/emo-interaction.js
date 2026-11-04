import { getEmoButtonPose } from './emo-controls.js?v=909760559972';
import { findWalkPath, smoothWalkPath, WALK_RADIUS, canWalkSegment } from './walking.js?v=909760559972';
import { isBlocked, bays } from './layout.js?v=909760559972';

export const EMO_REACH_SECONDS = .48;
export const EMO_HOLD_SECONDS = .75;
export const EMO_CONTACT_TOLERANCE = .035;

export function getEmoApproach(machine) {
  if (!machine || !Number.isFinite(machine.id) || !Number.isFinite(machine.x) || !Number.isFinite(machine.z) || ![1, -1].includes(machine.sign)) return null;
  const button = getEmoButtonPose(machine);
  return { id: machine.id, machine, button,
    destination: { x: button.x + button.sign * .22, z: button.z + button.sign * .27 },
    heading: button.sign === 1 ? Math.PI : 0 };
}

export function planEmoApproach(machine, position, {canTraverse=()=>true,planner}={}) {
  const plan = getEmoApproach(machine);
  if (!plan || isBlocked(plan.destination.x, plan.destination.z, WALK_RADIUS)) return null;
  const findPath = target => planner ? planner.findPath(target) : findWalkPath(position,target,{canTraverse});
  const canWalk = planner?.canWalkSegment ?? canWalkSegment;
  const direct=findPath(plan.destination);if(!direct)return null;
  if(Math.hypot(position.x-plan.destination.x,position.z-plan.destination.z)<.65)return {...plan,path:direct};
  const candidates=[direct];
  // Approach from the open front aisle, rather than overshooting to a distant
  // graph junction then doubling back into the small EMO stance.
  for(const z of [plan.destination.z+machine.sign*.85,plan.destination.z+machine.sign*1.4,bays[machine.bayId].z]){
    const gate={x:plan.destination.x,z};
    if(!canTraverse(gate,plan.destination)||!canWalk(gate,plan.destination))continue;
    const route=findPath(gate);if(route)candidates.push([...route,plan.destination]);
    const exit={x:position.x,z};
    if(canTraverse(position,exit)&&canWalk(position,exit)&&canTraverse(exit,gate)&&canWalk(exit,gate))candidates.push([exit,gate,plan.destination]);
  }
  function cost(path){
    let length=0,previous=position,heading=null;
    for(const p of path){const dx=p.x-previous.x,dz=p.z-previous.z;if(Math.hypot(dx,dz)<1e-6)continue;
      const next=Math.atan2(dx,dz);length+=Math.hypot(dx,dz);
      if(heading!==null)length+=.18*Math.abs(Math.atan2(Math.sin(next-heading),Math.cos(next-heading)));
      heading=next;previous=p;
    }
    return length+.8*Math.abs(Math.atan2(Math.sin((heading??plan.heading)-plan.heading),Math.cos((heading??plan.heading)-plan.heading)));
  }
  candidates.sort((a,b)=>cost(a)-cost(b));
  return {...plan,path:smoothWalkPath(position,candidates[0],{canTraverse,canWalk})};
}

// The operator's right side and the mushroom stay visible together. This is a
// safe front-aisle shot, not a camera inside the monitor or neighbouring EFEM.
export function emoPressCameraFrame(plan, aspect = 1, baseFov = 64) {
  const { button, destination } = plan, sign = button.sign;
  const position = { x: button.x - sign * 1.35, y: 1.7, z: button.z + sign * 1.85 };
  const target = { x: button.x + sign * .08, y: .93, z: button.z + sign * .15 };
  const landmarks = [];
  for (const x of [-.295, .295]) for (const z of [-.295, .295]) for (const y of [0, 1.44]) {
    landmarks.push({ x: destination.x + x, y, z: destination.z + z });
  }
  for (const x of [-.13, .13]) for (const y of [-.13, .13]) landmarks.push({ x: button.x + x, y: button.y + y, z: button.z });
  const dx = target.x - position.x, dy = target.y - position.y, dz = target.z - position.z;
  const length = Math.hypot(dx, dy, dz), horizontal = Math.hypot(dx, dz);
  const forward = { x: dx / length, y: dy / length, z: dz / length }, right = { x: -dz / horizontal, z: dx / horizontal };
  const up = { x: -right.z * forward.y, y: right.z * forward.x - right.x * forward.z, z: right.x * forward.y };
  let tangent = Math.tan(baseFov * Math.PI / 360);
  for (const p of landmarks) {
    const x = p.x - position.x, y = p.y - position.y, z = p.z - position.z;
    const depth = x * forward.x + y * forward.y + z * forward.z;
    tangent = Math.max(tangent, Math.abs(x * right.x + z * right.z) / depth / Math.max(.1, aspect) / .8,
      Math.abs(x * up.x + y * up.y + z * up.z) / depth / .71);
  }
  return { position, target, landmarks, fov: Math.atan(tangent) * 360 / Math.PI };
}
