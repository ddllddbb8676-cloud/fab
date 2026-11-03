import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {sessionId} from '../server/player-profiles.js';
import {restoreWallet} from '../server/chip-wallet.js';

const bundle=await build({entryPoints:[fileURLToPath(new URL('../server/worker.js',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'platform',setup(build){
  build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'base',namespace:'test'}));
  build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export class DurableObject {constructor(ctx){this.ctx=ctx;}}'}));
}}]});
const {FabRoom,default:worker}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const token='a'.repeat(64),ordinaryToken='b'.repeat(64),probeToken='c'.repeat(64);
const owner=await sessionId(token),ordinary=await sessionId(ordinaryToken),probe=await sessionId(probeToken);
const origin='https://fab.test';
const request=(path,cookie='',method='GET')=>new Request(origin+path,{method,headers:cookie?{Cookie:'fab-session-v1='+cookie}:{}});
const peer=()=>({packets:[],send(raw){this.packets.push(JSON.parse(raw));},close(){},serializeAttachment(){}});
async function fixture(){
  const wallet=restoreWallet({brokenCount:10});wallet.owned.push('helmet-orange');wallet.equipped.head='helmet-orange';
  const records=new Map([[`profile:${ordinary}`,{id:ordinary,name:'기록보존',brokenCount:10,repairedCount:2,wallet}],
    [`profile:${owner}`,{id:owner,name:'운영자',brokenCount:300}],
    [`profile:${probe}`,{id:probe,name:'검증',brokenCount:200}]]);
  let boot,reads=0;const pending=[];
  const storage={get:async key=>structuredClone(records.get(key)),put:async batch=>{for(const [key,value] of Object.entries(batch))records.set(key,structuredClone(value));},
    delete:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])records.delete(key);},list:async({prefix,startAfter,limit=500})=>{reads++;return new Map([...records].filter(([key])=>key.startsWith(prefix)&&(!startAfter||key>startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit));}};
  const env={FAB_OWNER_VISITOR_ID:owner,FAB_METRICS_EXCLUDED_IDS:probe,ASSETS:{fetch:async()=>new Response('<!doctype html><title>admin</title>',{headers:{'Content-Type':'text/html'}})}};
  const room=new FabRoom({storage,blockConcurrencyWhile:f=>{boot=f();},getWebSockets:()=>[],waitUntil:promise=>pending.push(promise)},env);
  room.start=()=>{};await boot;env.FAB_ROOM={getByName:()=>room};
  return {room,env,records,storage,pending,reads:()=>reads,metrics:async()=>{const res=await worker.fetch(request('/api/admin/metrics',token),env);assert.equal(res.status,200);assert.match(res.headers.get('Cache-Control'),/private, no-store/);return res.json();}};
}

test('only server configured owner cookie opens admin or metrics; unauthorized requests never wake room',async()=>{
  let calls=0;const env={FAB_OWNER_VISITOR_ID:owner,FAB_ROOM:{getByName(){calls++;throw Error('Must not reach storage');}}};
  for(const path of ['/admin','/admin/','/admin.html','/api/admin/metrics']){
    for(const cookie of ['',ordinaryToken])assert.equal((await worker.fetch(request(path,cookie),env)).status,403);
  }
  assert.equal(calls,0);
  assert.equal((await worker.fetch(request('/api/admin/metrics',token,'POST'),env)).status,405);
  assert.equal((await worker.fetch(request('/api/admin/metrics',token),{...env,FAB_OWNER_VISITOR_ID:''})).status,403);
});

test('admin reads aggregates without joining, rescanning, leaking identifiers or altering saved wallet',async()=>{
  const f=await fixture(),before=structuredClone(f.records.get('profile:'+ordinary)),reads=f.reads();
  const first=await f.metrics();await f.metrics();
  assert.equal(first.live.connectedAccounts,0);assert.equal(first.today.destructions,0);assert.equal(first.today.purchases,0);
  assert.equal(first.profiles.accounts,1);assert.equal(first.profiles.totalBroken,10);assert.equal(first.profiles.buyers,1);
  assert.equal(first.profiles.paidCopies,1);assert.equal(first.profiles.priceValue,150);
  assert.equal(f.reads(),reads);assert.equal(f.room.room.players.size,0);
  assert.deepEqual(f.records.get('profile:'+ordinary),before);
  for(const secret of [owner,ordinary,probe,token,'기록보존'])assert.equal(JSON.stringify(first).includes(secret),false);
  assert.equal((await f.room.fetch(request('/api/admin/metrics',ordinaryToken))).status,403);
  const page=await worker.fetch(request('/admin',token),f.env);assert.equal(page.status,200);assert.match(page.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  await Promise.all(f.pending);
});

test('real owner/safety users count, probe does not; reconnects and idle poses do not inflate unique or activity counts',async()=>{
  const f=await fixture(),p=peer(),o=peer(),v=peer();
  await f.room.admit(p,ordinary,1);await f.room.admit(o,owner,1);await f.room.admit(v,probe,1);
  let data=await f.metrics();assert.equal(data.live.connectedAccounts,2);assert.equal(data.today.uniqueAccounts,2);assert.equal(data.today.connections,2);
  const position={x:0,y:0,z:78.8,heading:0,hidden:false};
  f.room.pose(ordinary,position);f.room.pose(ordinary,position);data=await f.metrics();assert.equal(data.live.activeAccounts5m,0);
  f.room.pose(ordinary,{...position,x:.2});data=await f.metrics();assert.equal(data.live.activeAccounts5m,1);
  await f.room.admit(peer(),ordinary,2);data=await f.metrics();assert.equal(data.today.uniqueAccounts,2);assert.equal(data.today.connections,3);
  f.room.close(o);assert.equal((await f.metrics()).live.connectedAccounts,1);
  await Promise.all(f.pending);
});

test('successful purchase counted once, historical balances stay untouched, metrics storage failure does not stop game',async()=>{
  const f=await fixture(),p=peer();await f.room.admit(p,ordinary,1);
  const command=JSON.stringify({type:'command',seq:1,kind:'purchase',data:{itemId:'suit-blue'}});
  await f.room.webSocketMessage(p,command);await f.room.webSocketMessage(p,command);
  const metrics=await f.metrics();assert.equal(metrics.today.purchases,1);assert.equal(metrics.profiles.paidCopies,2);
  assert.equal(f.room.room.wallet(ordinary).chips,0);assert.equal(f.room.room.profile(ordinary).brokenCount,10);
  const realPut=f.storage.put;f.storage.put=async batch=>{if(Object.keys(batch).some(key=>key.startsWith('metrics:')))throw Error('stats unavailable');return realPut(batch);};
  await f.room.flushMetrics(true);assert.equal(f.room.metricsWriteDelayed,true);
  await f.room.webSocketMessage(p,JSON.stringify({type:'command',seq:2,kind:'equip',data:{itemId:'suit-blue'}}));
  assert.equal(p.packets.at(-1).type,'ack');assert.equal(p.packets.at(-1).ok,true);
  await Promise.all(f.pending);
});

test('last forced flush follows an in-flight write and final frame-send failure clears observed occupancy',async()=>{
  const f=await fixture(),p=peer();await f.room.admit(p,ordinary,1);
  let unblock,started;const entered=new Promise(resolve=>{started=resolve;}),blocked=new Promise(resolve=>{unblock=resolve;});
  const realPut=f.storage.put;let once=true,metricWrites=0;
  f.storage.put=async(batch,options)=>{
    if(Object.keys(batch).some(key=>key.startsWith('metrics:'))){
      metricWrites++;assert.equal(options.allowUnconfirmed,true);
      if(once){once=false;started();await blocked;}
    }
    return realPut(batch);
  };
  const first=f.room.flushMetrics(true);await entered;
  f.room.activityMetrics.action(ordinary,{repairs:1});f.room.close(p);
  unblock();await first;await Promise.all(f.pending);
  assert.ok(metricWrites>=2);
  assert.equal([...f.records.values()].find(value=>value.kind==='day').repairs,1);
  const bad=peer();await f.room.admit(bad,ordinary,2);bad.send=()=>{throw Error('dead peer');};
  f.room.tickCount=3;await f.room.tick();
  assert.equal(f.room.room.players.size,0);assert.equal(f.room.activityMetrics.snapshot().live.connectedAccounts,0);
  await Promise.all(f.pending);
});
