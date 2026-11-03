import test from 'node:test';
import assert from 'node:assert/strict';
import {createActivityMetrics} from '../server/activity-metrics.js';

const id=n=>'visitor:'+n.toString(16).padStart(24,'0')+'0'.repeat(40);
function setup(at='2026-11-03T03:00:00.000Z',options={}) {
  let time=Date.parse(at);
  const metrics=createActivityMetrics({now:()=>time,...options});
  return {metrics,set:at=>time=typeof at==='number'?at:Date.parse(at),add:ms=>time+=ms,now:()=>time};
}
function memoryStorage(){
  const data=new Map();
  return {data,put:async rows=>{for(const [k,v] of Object.entries(rows))data.set(k,structuredClone(v));},delete:async keys=>keys.forEach(k=>data.delete(k))};
}

test('reconnects count connections but deduplicate hourly and daily accounts, including owner and human safety roles',()=>{
  const {metrics,add}=setup(undefined,{excludedIds:[id(99)]});
  metrics.sync([id(1),id(2),id(99),'resident:1','safety:1']);
  metrics.connect(id(1));metrics.connect(id(2),'https');metrics.connect(id(99));
  add(30000);metrics.sync([id(1)]);metrics.connect(id(1),'https');
  add(30000);const report=metrics.snapshot();
  assert.deepEqual(report.live,{connectedAccounts:1,activeAccounts5m:0});
  assert.equal(report.today.uniqueAccounts,2);assert.equal(report.today.connections,3);
  assert.equal(report.today.httpsConnections,2);assert.equal(report.today.peakConcurrent,2);
  assert.equal(report.hourly[0].averageConcurrent,1.5);assert.equal(report.hourly[0].observedSeconds,60);
  assert.ok(!JSON.stringify(report).includes('visitor:'));
});

test('KST midnight splits hourly/day buckets and daily unique count is not the sum of hourly unique counts',()=>{
  const {metrics,add}=setup('2026-11-03T14:59:30.000Z');
  metrics.sync([id(1)]);metrics.connect(id(1));metrics.action(id(1),{destructions:2});
  add(60000);let report=metrics.snapshot();
  assert.equal(report.today.date,'2026-11-04');assert.equal(report.today.uniqueAccounts,1);
  assert.equal(report.today.connections,0);assert.equal(report.today.destructions,0);
  assert.equal(report.hourly.length,2);assert.equal(report.hourly[0].observedSeconds,30);assert.equal(report.hourly[1].observedSeconds,30);
  assert.equal(report.hourly[1].uniqueAccounts,1);
  add(3600000);metrics.sync([id(1),id(2)]);report=metrics.snapshot();
  assert.equal(report.today.uniqueAccounts,2);
  assert.equal(report.hourly.at(-1).uniqueAccounts,2);
});

test('connections and repeated heartbeat sync do not count as active play; valid movement/action expires after five minutes',()=>{
  const {metrics,add}=setup();metrics.sync([id(1),id(2)]);metrics.connect(id(1));
  for(let n=0;n<10;n++){add(1000);metrics.sync([id(1),id(2)]);}
  assert.equal(metrics.snapshot().live.activeAccounts5m,0);
  metrics.activity(id(1));metrics.action(id(2),{repairs:1,purchases:2});
  assert.equal(metrics.snapshot().live.activeAccounts5m,2);
  assert.equal(metrics.action(id(2),{repairs:-1,purchases:0.5}),false);
  add(299999);assert.equal(metrics.snapshot().live.activeAccounts5m,2);
  add(1);assert.equal(metrics.snapshot().live.activeAccounts5m,0);
  assert.equal(metrics.snapshot().today.repairs,1);assert.equal(metrics.snapshot().today.purchases,2);
});

test('restart preserves current bucket deduplication but does not count the offline gap as observed occupancy',async()=>{
  const storage=memoryStorage(),first=setup();first.metrics.sync([id(1)]);first.metrics.connect(id(1));
  first.add(60000);await first.metrics.flush(storage);
  const next=setup('2026-11-03T03:10:00.000Z');next.metrics.restore(storage.data);
  let report=next.metrics.snapshot();assert.equal(report.live.connectedAccounts,0);
  assert.equal(report.hourly[0].observedSeconds,60);assert.equal(report.hourly[0].averageConcurrent,1);
  next.metrics.sync([id(1)]);next.metrics.connect(id(1));next.add(60000);report=next.metrics.snapshot();
  assert.equal(report.today.uniqueAccounts,1);assert.equal(report.today.connections,2);
  assert.equal(report.hourly[0].observedSeconds,120);assert.equal(report.hourly[0].averageConcurrent,1);
  assert.equal(report.startedAt,'2026-11-03T03:00:00.000Z');
});

test('closed bucket identities are stripped and the collection gap is not filled on restoration',async()=>{
  const storage=memoryStorage(),first=setup();first.metrics.sync([id(1)]);first.metrics.connect(id(1));await first.metrics.flush(storage);
  const next=setup('2026-11-04T05:00:00.000Z');next.metrics.restore(storage.data);await next.metrics.flush(storage);
  const oldHour=[...storage.data.values()].find(v=>v.kind==='hour'&&v.start===Date.parse('2026-11-03T03:00:00.000Z'));
  const oldDay=[...storage.data.values()].find(v=>v.kind==='day'&&v.start===Date.parse('2026-11-02T15:00:00.000Z'));
  assert.equal(oldHour.ids,undefined);assert.equal(oldDay.ids,undefined);
  assert.equal(next.metrics.snapshot().hourly.length,2);
  assert.equal(oldHour.uniqueAccounts,1);
});

test('failed storage writes retry and a change during await is not discarded',async()=>{
  const state=setup(),storage=memoryStorage();state.metrics.sync([id(1)]);state.metrics.connect(id(1));
  await assert.rejects(state.metrics.flush({...storage,put:async()=>{throw Error('retry');}}),/retry/);
  await state.metrics.flush(storage);
  assert.equal([...storage.data.values()].find(v=>v.kind==='hour').connections,1);
  let release,started;const queued=new Promise(resolve=>started=resolve),hold=new Promise(resolve=>release=resolve);
  const ongoing=state.metrics.flush({...storage,put:async rows=>{started();await hold;await storage.put(rows);}});
  await queued;state.metrics.action(id(1),{destructions:1});release();await ongoing;
  await state.metrics.flush(storage);
  assert.equal([...storage.data.values()].find(v=>v.kind==='hour').destructions,1);
});

test('unique account cap remains below a single Durable Object value limit and is explicitly marked',async()=>{
  const {metrics}=setup(),storage=memoryStorage();
  for(let n=1;n<=4100;n++)metrics.connect(id(n));
  const report=metrics.snapshot();assert.equal(report.today.uniqueAccounts,4096);assert.equal(report.today.limited,true);
  assert.equal(report.today.connections,4100);await metrics.flush(storage);
  for(const value of storage.data.values())assert.ok(Buffer.byteLength(JSON.stringify(value))<128*1024);
});

test('backward clocks never subtract occupancy and retention removes old records',async()=>{
  const state=setup(),storage=memoryStorage();state.metrics.sync([id(1)]);state.add(60000);await state.metrics.flush(storage);
  state.add(-30000);assert.equal(state.metrics.snapshot().hourly[0].observedSeconds,60);
  const next=setup('2026-12-05T03:00:00.000Z');next.metrics.restore(storage.data);await next.metrics.flush(storage);
  assert.equal(next.metrics.snapshot().hourly.length,1);
  assert.ok([...storage.data.values()].filter(v=>v.kind).every(v=>v.start>=Date.parse('2026-12-04T15:00:00.000Z')));
});
