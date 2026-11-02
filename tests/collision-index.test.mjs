import test from 'node:test';
import assert from 'node:assert/strict';
import { machines, columns, isBlocked } from '../src/layout.js';
import { AIR_SHOWER } from '../src/air-shower.js';
import { isRuntimeBlocked, setRuntimeObstacles } from '../src/runtime-obstacles.js';

// Independent reference: the pre-optimization full cabinet scan. This guards
// against missing collisions at bucket seams, rotated hardware, or tiny gaps.
function fullScan(x,z,margin=.28) {
  if (Math.abs(x)>58.8 || Math.abs(z)>88.5) return true;
  if (isRuntimeBlocked(x,z,margin)) return true;
  if (AIR_SHOWER.bounds.some(c=>x>c.minX-margin&&x<c.maxX+margin&&z>c.minZ-margin&&z<c.maxZ+margin)) return true;
  if (columns.some(c=>Math.abs(x-c.x)<.27+margin&&Math.abs(z-c.z)<.27+margin)) return true;
  return machines.some(({bounds:c,walkBounds})=>{
    if(x<=c.minX-margin||x>=c.maxX+margin||z<=c.minZ-margin||z>=c.maxZ+margin)return false;
    return walkBounds.some(b=>x>b.minX-margin&&x<b.maxX+margin&&z>b.minZ-margin&&z<b.maxZ+margin);
  });
}

test('collision index exactly preserves cabinet boundaries and cell seams at every used clearance', () => {
  for (const margin of [0,.05,.23,.28,.295,.3]) {
    for (const machine of machines) {
      for (const b of [machine.bounds,...machine.walkBounds]) {
        for (const x of [b.minX-margin,b.maxX+margin,(b.minX+b.maxX)/2]) {
          for (const z of [b.minZ-margin,b.maxZ+margin,(b.minZ+b.maxZ)/2]) {
            for (const delta of [-1e-9,0,1e-9]) {
              assert.equal(isBlocked(x+delta,z+delta,margin),fullScan(x+delta,z+delta,margin), `tool ${machine.id}, ${x}, ${z}, ${margin}`);
            }
          }
        }
      }
    }
    for (let x=-56;x<=56;x+=8) for(let z=-88;z<=88;z+=8) {
      for (const delta of [-margin,0,margin]) assert.equal(isBlocked(x+delta,z-delta,margin),fullScan(x+delta,z-delta,margin));
    }
  }
});

test('indexed collisions match full scan throughout the hall with current runtime doors', () => {
  let seed=360;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  try {
    setRuntimeObstacles(AIR_SHOWER.closedDoorBounds);
    for (let n=0;n<20000;n++) {
      const x=random()*124-62,z=random()*184-92,margin=random()*.65;
      assert.equal(isBlocked(x,z,margin),fullScan(x,z,margin));
    }
    for(const margin of [-.05,8,10])for(const machine of machines)assert.equal(isBlocked(machine.x,machine.z,margin),fullScan(machine.x,machine.z,margin));
    assert.equal(isBlocked(0,AIR_SHOWER.doorZ,.295),true);
    setRuntimeObstacles([]);assert.equal(isBlocked(0,AIR_SHOWER.doorZ,.295),false);
  } finally { setRuntimeObstacles([]); }
});
