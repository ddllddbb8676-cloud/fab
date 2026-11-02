import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { machines } from '../src/layout.js';
import { getEmoApproach, planEmoApproach } from '../src/emo-interaction.js';
import { setRuntimeObstacles } from '../src/runtime-obstacles.js';
import { rankRepairEquipment, startRepairRanking } from '../src/repair-ranking.js';
import { createWalkPlanner } from '../src/walking.js';
import { AIR_SHOWER } from '../src/air-shower.js';

function browserWorker() {
  const url = new URL('../src/repair-ranking-worker.js', import.meta.url).href;
  const code = `import {parentPort} from 'node:worker_threads';
    globalThis.self={postMessage:data=>parentPort.postMessage(data)};
    await import(${JSON.stringify(url)});
    parentPort.on('message',data=>self.onmessage({data}));`;
  const thread = new NodeWorker(new URL('data:text/javascript,' + encodeURIComponent(code)));
  const adapter = { postMessage: data => thread.postMessage(data), terminate: () => thread.terminate() };
  thread.on('message', data => adapter.onmessage?.({ data }));
  thread.on('error', error => adapter.onerror?.({ error, preventDefault() {} }));
  return adapter;
}

test('all 360 repair routes run outside the UI loop, preserve walking distances and door obstacles', async () => {
  const items = machines, position = {x:0,z:0};
  const point = getEmoApproach(items[0]).destination;
  setRuntimeObstacles([{minX:point.x-.4,maxX:point.x+.4,minZ:point.z-.4,maxZ:point.z+.4}]);
  try {
    const expected = rankRepairEquipment(items.slice(0, 4), position);
    let ticks = 0, finished = false;
    const clock = setInterval(() => ticks++, 5);
    try {
      const promise = new Promise((resolve, reject) => startRepairRanking(items, position, {
        createWorker: browserWorker, onComplete: rows => { finished = true; resolve(rows); }, onError: reject
      }));
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal(finished, false, 'opening/closing the UI gets a turn before routes finish');
      const rows = await promise;
      assert.equal(rows.length, 360); assert.ok(ticks > 0, 'UI timers continue during all 360 routes');
      for (let i=1;i<rows.length;i++) assert.ok(rows[i-1].distance <= rows[i].distance);
      for (const row of expected) assert.equal(rows.find(r => r.item.id === row.item.id).distance, row.distance);
      assert.equal(rows.find(r => r.item.id === 0).distance, Infinity, 'worker respects current doors/obstacles');
    } finally { clearInterval(clock); }
  } finally { setRuntimeObstacles([]); }
});

test('batch planning preserves every original EMO route across all 360 tools', () => {
  const position = {x:0,z:0}, planner = createWalkPlanner(position);
  for (const machine of machines) {
    assert.deepEqual(planEmoApproach(machine,position,{planner}),planEmoApproach(machine,position), `tool ${machine.id}`);
  }
});

test('route cache preserves side passages and invalidates when a door closes or opens', () => {
  const middle = machines[88], neighbour = machines[89];
  const positions = [{x:-4,z:78.8},{x:57.4,z:-70},{x:(middle.x+neighbour.x)/2,z:middle.z},AIR_SHOWER.start];
  try {
    for (const position of positions) {
      const planner = createWalkPlanner(position);
      for (const obstacles of [[],AIR_SHOWER.closedDoorBounds,[]]) {
        setRuntimeObstacles(obstacles);
        for (const id of [0,19,88,170,180,299,359]) {
          assert.deepEqual(planEmoApproach(machines[id],position,{planner}),planEmoApproach(machines[id],position), `tool ${id}`);
        }
      }
    }
    const position={x:0,z:0},machine=machines[80],planner=createWalkPlanner(position);
    const point=getEmoApproach(machine).destination;
    assert.ok(planEmoApproach(machine,position,{planner}));
    setRuntimeObstacles([{minX:point.x-.4,maxX:point.x+.4,minZ:point.z-.4,maxZ:point.z+.4}]);
    assert.equal(planEmoApproach(machine,position,{planner}),null);
    setRuntimeObstacles([]);assert.ok(planEmoApproach(machine,position,{planner}));
  } finally { setRuntimeObstacles([]); }
});

test('closing a repair lookup terminates work and ignores a queued result', () => {
  let calls=0, stopped=0;
  const worker={postMessage(){},terminate(){stopped++;}};
  const cancel=startRepairRanking([machines[0]],{x:0,z:0},{createWorker:()=>worker,onComplete:()=>calls++});
  cancel(); worker.onmessage({data:{rows:[{id:0,distance:1}]}});
  assert.equal(stopped,1); assert.equal(calls,0);
});

test('embedded browsers without workers yield between routes and allow cancellation', async () => {
  let completed=false, calls=0;
  const options={createWorker:()=>{throw new Error('Workers unavailable');},onComplete:()=>{completed=true;calls++;}};
  const cancel=startRepairRanking(machines.slice(0,30),{x:0,z:0},options);
  assert.equal(completed,false); cancel();
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls,0);
  const rows=await new Promise((resolve,reject)=>startRepairRanking(machines.slice(0,3),{x:0,z:0},{...options,onComplete:resolve,onError:reject}));
  assert.equal(rows.length,3);assert.ok(rows.every(row=>Number.isFinite(row.distance)));
});
