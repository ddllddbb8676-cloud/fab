import { machines, bays, BAY_CENTERS, TOOL_WIDTH, isBlocked } from './layout.js?v=2f7b71c7919c';
import { canTraverseRuntimeObstacles, getRuntimeObstacles } from './runtime-obstacles.js?v=2f7b71c7919c';
import { stockerPorts, STOCKER_WALK_OUTER_X } from './stocker-layout.js?v=2f7b71c7919c';
import { ENTRANCE } from './entrance-layout.js?v=2f7b71c7919c';
export const WALK_RADIUS = .295;
export function canWalkSegment(a, b) {
  if (!canTraverseRuntimeObstacles(a, b, WALK_RADIUS)) return false;
  const length = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(length / .12));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    if (isBlocked(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f, WALK_RADIUS)) return false;
  }
  return true;
}
// A small corridor graph retains the 65 cm side passages that a coarse grid misses.
const xs = [-STOCKER_WALK_OUTER_X, 0, STOCKER_WALK_OUTER_X];
for (const bank of [0, 1]) {
  const row = machines.filter(m => m.bank === bank && m.bayId === bank * BAY_CENTERS.length && m.sign === 1);
  for (let i = 0; i < row.length - 1; i++) xs.push((row[i].x + row[i + 1].x) / 2);
}
xs.sort((a, b) => a - b);
const zs = [-84, ENTRANCE.serviceZ, ...BAY_CENTERS];
for (let i = 0; i < BAY_CENTERS.length - 1; i++) zs.push((BAY_CENTERS[i] + BAY_CENTERS[i + 1]) / 2);
zs.sort((a, b) => a - b);
export const walkNodes = zs.flatMap((z, iz) => xs.map((x, ix) => ({ id: iz * xs.length + ix, x, z, links: [] })));
for (let iz = 0; iz < zs.length; iz++) for (let ix = 0; ix < xs.length; ix++) {
  const node = walkNodes[iz * xs.length + ix];
  for (const [dx, dz] of [[1, 0], [0, 1]]) {
    const other = walkNodes[(iz + dz) * xs.length + ix + dx];
    if (ix + dx >= xs.length || iz + dz >= zs.length || !other || !canWalkSegment(node, other)) continue;
    const cost = Math.hypot(other.x - node.x, other.z - node.z);
    node.links.push({ id: other.id, cost }); other.links.push({ id: node.id, cost });
  }
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// Sparse apron/entrance corners, rather than multiplying the navigation grid.
for(const point of [...[-ENTRANCE.halfWidth,-3,0,3,ENTRANCE.halfWidth].map(x=>({x,z:ENTRANCE.serviceZ})),...stockerPorts.map(p=>p.approach)]){
  const node={id:walkNodes.length,x:point.x,z:point.z,links:[]};
  const near=walkNodes.map(n=>({n,cost:distance(n,node)})).sort((a,b)=>a.cost-b.cost).slice(0,32)
    .filter(({n})=>canWalkSegment(n,node)).slice(0,8);
  for(const {n,cost}of near){node.links.push({id:n.id,cost});n.links.push({id:node.id,cost});}
  walkNodes.push(node);
}
const pointKey = point => `${point.x},${point.z}`;
function connections(point,canTraverse,cache) {
  const key = pointKey(point);
  if (cache?.connections.has(key)) return cache.connections.get(key);
  const clear = cache?.clear ?? canWalkSegment;
  const result = walkNodes.map(n => ({ id: n.id, cost: distance(point, n) })).sort((a, b) => a.cost - b.cost)
    .slice(0, 18).filter(c => canTraverse(point,walkNodes[c.id])&&clear(point, walkNodes[c.id])).slice(0, 6);
  cache?.connections.set(key, result);
  return result;
}
export function findWalkPath(start, target, {canTraverse=()=>true, cache}={}) {
  const clear = cache?.clear ?? canWalkSegment;
  if(!canTraverse(target,target))return null;
  if (isBlocked(target.x, target.z, WALK_RADIUS)) return null;
  if (canTraverse(start,target)&&clear(start, target)) return [{ x: target.x, z: target.z }];
  const starts = connections(start,canTraverse,cache), ends = connections(target,canTraverse,cache), endCosts = new Map(ends.map(c => [c.id, c.cost]));
  if (!starts.length || !ends.length) return null;
  const costs = new Map(), previous = new Map(), open = new Set();
  for (const c of starts) { costs.set(c.id, c.cost); open.add(c.id); }
  let found = null, best = Infinity;
  while (open.size) {
    let id = null, score = Infinity;
    for (const n of open) { const value = costs.get(n) + distance(walkNodes[n], target); if (value < score) { id = n; score = value; } }
    if (score >= best) break;
    open.delete(id);
    if (endCosts.has(id) && costs.get(id) + endCosts.get(id) < best) { best = costs.get(id) + endCosts.get(id); found = id; }
    for (const edge of walkNodes[id].links) {
      const a = walkNodes[id], b = walkNodes[edge.id];
      if (!canTraverse(a,b)||!(cache ? cache.edgeClear(a,b) : canTraverseRuntimeObstacles(a,b,WALK_RADIUS))) continue;
      const next = costs.get(id) + edge.cost;
      if (next < (costs.get(edge.id) ?? Infinity)) { costs.set(edge.id, next); previous.set(edge.id, id); open.add(edge.id); }
    }
  }
  if (found === null) return null;
  const route = [{ x: target.x, z: target.z }];
  for (let id = found; id !== undefined; id = previous.get(id)) route.unshift({ x: walkNodes[id].x, z: walkNodes[id].z });
  // Remove unnecessary corners only when the entire shortcut has walking clearance.
  const result = [], all = [start, ...route];
  for (let i = 0; i < all.length - 1;) {
    let next = i + 1;
    for (let j = all.length - 1; j > next; j--) if (canTraverse(all[i],all[j])&&clear(all[i], all[j])) { next = j; break; }
    result.push(all[next]); i = next;
  }
  return result;
}

// A directory lookup has one origin and hundreds of destinations. Reuse its
// entrance connections and repeated segment checks without changing A* choices,
// turn smoothing, collision tolerances, or the actual player's movement path.
// Cache lifetime is one lookup; moving doors invalidate it immediately.
export function createWalkPlanner(start) {
  const position = { x: start.x, z: start.z };
  const segments = new Map(), edges = new Map(), links = new Map();
  let obstacles = getRuntimeObstacles();
  function refresh() {
    const current = getRuntimeObstacles();
    if (current === obstacles) return;
    obstacles = current; segments.clear(); edges.clear(); links.clear();
  }
  function memo(map, a, b, check) {
    refresh();
    const key = `${pointKey(a)}>${pointKey(b)}`;
    if (!map.has(key)) map.set(key, check(a,b));
    return map.get(key);
  }
  const cache = { connections: links,
    clear: (a,b) => memo(segments,a,b,canWalkSegment),
    edgeClear: (a,b) => memo(edges,a,b,(from,to) => canTraverseRuntimeObstacles(from,to,WALK_RADIUS)) };
  return {
    canWalkSegment: cache.clear,
    findPath(target) { refresh(); return findWalkPath(position,target,{cache}); }
  };
}
export function stepWalker(position, dx, dz, { canTraverse = () => true } = {}) {
  // Substeps prevent tunnelling through a tool on a slow frame.
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .1));
  const result = { x: position.x, z: position.z };
  for (let i = 0; i < n; i++) {
    // Slide along a blocked axis, including the protected-zone boundary.
    // Segment checks also catch a thin closed door between substeps.
    for (const [axis, delta] of [['x', dx / n], ['z', dz / n]]) {
      if (!delta) continue;
      const next = { ...result, [axis]: result[axis] + delta };
      if (!isBlocked(next.x, next.z, WALK_RADIUS) && canTraverse(result, next) && canTraverseRuntimeObstacles(result, next, WALK_RADIUS)) result[axis] = next[axis];
    }
  }
  return result;
}

// Round only corners whose entire replacement curve has real walking
// clearance. Tight equipment gaps retain their exact safe centreline.
export function smoothWalkPath(start,path,{canTraverse=()=>true,radius=.55,canWalk=canWalkSegment}={}) {
  if(!path||path.length<2)return path;
  const points=[start,...path],result=[];
  const clear=(a,b)=>canTraverse(a,b)&&canWalk(a,b);
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1],before=distance(a,b),after=distance(b,c);
    if(before<.01||after<.01){result.push(b);continue;}
    const ux=(b.x-a.x)/before,uz=(b.z-a.z)/before,vx=(c.x-b.x)/after,vz=(c.z-b.z)/after;
    if(ux*vx+uz*vz>.995){result.push(b);continue;}
    let replacement=null;
    for(let trim=Math.min(radius,before*.3,after*.3);trim>=.05;trim*=.5){
      const entry={x:b.x-ux*trim,z:b.z-uz*trim},exit={x:b.x+vx*trim,z:b.z+vz*trim};
      const curve=[entry];for(let n=1;n<=8;n++){const t=n/8,s=1-t;curve.push({x:s*s*entry.x+2*s*t*b.x+t*t*exit.x,z:s*s*entry.z+2*s*t*b.z+t*t*exit.z});}
      let previous=result.at(-1)??start;
      if(curve.every(p=>{const ok=clear(previous,p);previous=p;return ok;})){replacement=curve;break;}
    }
    result.push(...(replacement??[b]));
  }
  result.push(path.at(-1));return result;
}

// A floor tap next to a cabinet may need a few centimetres of body clearance.
export function resolveWalkTap(start, point, options={}) {
  if(options.canTraverse&&!options.canTraverse(point,point))return null;
  const direct=findWalkPath(start,point,options);if(direct)return {destination:point,route:direct};
  if(!isBlocked(point.x,point.z,WALK_RADIUS))return null;
  for(let radius=.05;radius<=.651;radius+=.05){
    const candidates=Array.from({length:48},(_,i)=>({x:point.x+Math.cos(i*Math.PI/24)*radius,z:point.z+Math.sin(i*Math.PI/24)*radius}));
    candidates.sort((a,b)=>distance(start,a)-distance(start,b));
    for(const p of candidates){if(isBlocked(p.x,p.z,WALK_RADIUS))continue;const route=findWalkPath(start,p,options);if(route)return {destination:p,route};}
  }
  return null;
}
