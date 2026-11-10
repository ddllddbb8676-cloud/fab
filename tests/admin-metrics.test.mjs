import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {sessionId} from '../server/player-profiles.js';
import {restoreWallet} from '../server/chip-wallet.js';
import {createWorldEvents} from '../server/world-events.js';

const bundle=await build({entryPoints:[fileURLToPath(new URL('../server/worker.js',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'platform',setup(build){
  build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'base',namespace:'test'}));
  build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export class DurableObject {constructor(ctx){this.ctx=ctx;}}'}));
}}]});
const {FabRoom,default:worker}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const token='a'.repeat(64),ordinaryToken='b'.repeat(64),probeToken='c'.repeat(64);
const owner=await sessionId(token),ordinary=await sessionId(ordinaryToken),probe=await sessionId(probeToken);
const origin='https://fab.test';
const request=(path,cookie='',method='GET')=>new Request(origin+path,{method,headers:cookie?{Cookie:'fab-session-v1='+cookie}:{}});
const visitRequest=(value,{cookie=token,method='POST',headers={},raw}={})=>new Request(origin+'/api/admin/visit',{
  method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:'fab-session-v1='+cookie}:{}),...headers},
  ...(method==='GET'?{}:{body:raw??JSON.stringify(value)}),...(raw instanceof ReadableStream?{duplex:'half'}:{})
});
const eventRequest=(value,{cookie=token,method='POST',headers={},raw}={})=>new Request(origin+'/api/admin/events',{
  method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:'fab-session-v1='+cookie}:{}),...headers},
  ...(method==='GET'?{}:{body:raw??JSON.stringify(value)})
});
const peer=()=>({packets:[],send(raw){this.packets.push(JSON.parse(raw));},close(){},serializeAttachment(){}});
async function fixture(db){
  const wallet=restoreWallet({brokenCount:10});wallet.owned.push('helmet-orange');wallet.equipped.head='helmet-orange';
  const records=new Map([[`profile:${ordinary}`,{id:ordinary,name:'기록보존',brokenCount:10,repairedCount:2,wallet}],
    [`profile:${owner}`,{id:owner,name:'운영자',brokenCount:300}],
    [`profile:${probe}`,{id:probe,name:'검증',brokenCount:200}]]);
  let boot,reads=0;const pending=[];
  const storage={get:async key=>structuredClone(records.get(key)),put:async batch=>{for(const [key,value] of Object.entries(batch))records.set(key,structuredClone(value));},
    delete:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])records.delete(key);},list:async({prefix,startAfter,limit=500})=>{reads++;return new Map([...records].filter(([key])=>key.startsWith(prefix)&&(!startAfter||key>startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit));}};
  if(db){
    storage.sql={exec(query,...args){const rows=db.prepare(query).all(...args);return {toArray:()=>rows};}};
    storage.transactionSync=fn=>{db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
  }
  const env={FAB_OWNER_VISITOR_ID:owner,FAB_METRICS_EXCLUDED_IDS:probe,ASSETS:{fetch:async()=>new Response('<!doctype html><title>admin</title>',{headers:{'Content-Type':'text/html'}})}};
  const room=new FabRoom({storage,blockConcurrencyWhile:f=>{boot=f();},getWebSockets:()=>[],waitUntil:promise=>pending.push(promise)},env);
  room.start=()=>{};await boot;env.FAB_ROOM={getByName:()=>room};
  return {room,env,records,storage,pending,reads:()=>reads,metrics:async()=>{const res=await worker.fetch(request('/api/admin/metrics',token),env);assert.equal(res.status,200);assert.match(res.headers.get('Cache-Control'),/private, no-store/);return res.json();}};
}

test('only server configured owner cookie opens admin or metrics; unauthorized requests never wake room',async()=>{
  let calls=0;const env={FAB_OWNER_VISITOR_ID:owner,FAB_ROOM:{getByName(){calls++;throw Error('Must not reach storage');}}};
  for(const path of ['/admin','/admin/','/admin.html','/api/admin/metrics','/api/admin/rankings']){
    for(const cookie of ['',ordinaryToken])assert.equal((await worker.fetch(request(path,cookie),env)).status,403);
  }
  assert.equal(calls,0);
  assert.equal((await worker.fetch(request('/api/admin/metrics',token,'POST'),env)).status,405);
  assert.equal((await worker.fetch(request('/api/admin/metrics',token),{...env,FAB_OWNER_VISITOR_ID:''})).status,403);
});

test('operator sees only current FAB nicknames across sessions, including offline, with bounded pages',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());const f=await fixture(db);
  assert.deepEqual((await f.metrics()).googleLinks,{total:0,page:1,pages:1,names:[]});
  f.room.accounts.start(ordinary);
  const insert=db.prepare('INSERT INTO google_links VALUES (?,?)');
  insert.run('owner-google',owner);insert.run('ordinary-google',ordinary);insert.run('test-google',probe);
  const reads=f.reads(),first=(await f.metrics()).googleLinks;
  assert.deepEqual(first,{total:2,page:1,pages:1,names:['기록보존','FAB짱 세미']});
  assert.equal((await f.metrics()).live.connectedAccounts,0);
  for(let i=1;i<=25;i++)insert.run('google-'+i,'visitor:'+i.toString(16).padStart(64,'0'));
  const page=async n=>(await (await worker.fetch(request('/api/admin/metrics?googlePage='+n,token),f.env)).json()).googleLinks;
  assert.equal((await page(1)).names.length,25);assert.ok((await page(1)).names.every(name=>name===null));
  assert.deepEqual(await page(99),{total:27,page:2,pages:2,names:first.names});
  db.prepare('DELETE FROM google_links WHERE profile=?').run(ordinary);
  assert.deepEqual((await page(2)).names,['FAB짱 세미']);assert.equal(f.reads(),reads);
  assert.equal((await worker.fetch(request('/api/admin/metrics?googlePage=2',ordinaryToken),f.env)).status,403);
});

test('a legacy link credits the existing wallet once before welcome and preserves shopping and gameplay progress',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());const f=await fixture(db);
  const initial=structuredClone(f.records.get('profile:'+ordinary));f.room.accounts.start(ordinary);
  db.prepare('INSERT INTO google_links VALUES (?,?)').run('already-linked',ordinary);
  const p=peer();await f.room.admit(p,ordinary,1);
  const welcome=p.packets.find(m=>m.type==='welcome');
  assert.equal(welcome.googleReward,1000);
  const record=f.records.get('profile:'+ordinary);
  assert.deepEqual(record.wallet,{...initial.wallet,chips:initial.wallet.chips+1000,earnedChips:initial.wallet.earnedChips+1000,revision:initial.wallet.revision+1,googleLinkReward:true});
  assert.equal(record.brokenCount,initial.brokenCount);assert.equal(record.repairedCount,initial.repairedCount);
  await f.room.webSocketMessage(p,JSON.stringify({type:'command',seq:10,kind:'purchase',data:{itemId:'suit-blue'}}));f.room.close(p);
  await f.room.checkpoint();const spent=f.records.get('profile:'+ordinary).wallet;
  await Promise.all([f.room.payGoogleLink(ordinary),f.room.payGoogleLink(ordinary)]);
  const again=peer();await f.room.admit(again,ordinary,2);
  const next=again.packets.find(m=>m.type==='welcome');
  assert.equal(next.googleReward,undefined);assert.equal(next.wallet.chips,spent.chips);assert.ok(next.wallet.owned.includes('suit-blue'));
});

test('an offline reward racing a reconnect survives a stale read and cannot return after an account reset',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());const f=await fixture(db);
  f.room.accounts.start(ordinary);db.prepare('INSERT INTO google_links VALUES (?,?)').run('legacy-id',ordinary);
  assert.equal(f.room.accounts.rewardEntitled(ordinary),true);
  let release,started;const staleRead=new Promise(r=>{release=r;}),waiting=new Promise(r=>{started=r;});
  const originalGet=f.storage.get;let stall=true;
  f.storage.get=async key=>{
    const value=await originalGet(key);
    if(stall && key==='profile:'+ordinary){stall=false;started();await staleRead;}
    return value;
  };
  const p=peer(),joining=f.room.admit(p,ordinary,1);await waiting;
  const initial=f.records.get('profile:'+ordinary).wallet.chips;
  assert.equal(await f.room.payGoogleLink(ordinary),1000);release();await joining;
  assert.equal(p.packets.find(m=>m.type==='welcome').wallet.chips,initial+1000);
  db.prepare('DELETE FROM google_links WHERE profile=?').run(ordinary);
  await f.room.fetch(request('/api/session/reset',ordinaryToken,'POST'));
  const fresh=peer();await f.room.admit(fresh,ordinary,2);
  assert.equal(fresh.packets.find(m=>m.type==='welcome').wallet.chips,0);
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

test('only owner sees current human nicknames, including safety original names, without identifiers or database scans',async()=>{
  const f=await fixture(),p=peer(),o=peer(),v=peer();
  assert.deepEqual((await f.metrics()).live.users,[]);
  await f.room.admit(p,ordinary,1);await f.room.admit(o,owner,1);await f.room.admit(v,probe,1);
  const player=f.room.room.players.get(ordinary);player.role='safety-orange';player.name='안전팀 임시이름';player.chipUnlimited=true;
  const reads=f.reads(),data=await f.metrics();
  assert.equal(f.reads(),reads);assert.equal(data.live.users.length,data.live.connectedAccounts);assert.equal(data.live.users.length,2);
  assert.deepEqual(data.live.users.find(row=>row.role==='safety'),{name:'기록보존',role:'safety'});
  assert.deepEqual(data.live.users.find(row=>row.role==='operator'),{name:'FAB짱 세미',role:'operator'});
  for(const value of [ordinary,owner,probe,token,ordinaryToken,'검증','안전팀 임시이름'])assert.equal(JSON.stringify(data.live.users).includes(value),false);
  assert.ok(data.live.users.every(row=>Object.keys(row).sort().join(',')==='name,role'));
  assert.equal((await worker.fetch(request('/api/admin/metrics',ordinaryToken),f.env)).status,403);
  player.civilianName='새 닉네임';assert.equal((await f.metrics()).live.users.find(row=>row.role==='safety').name,'새 닉네임');
  f.room.close(p);assert.equal((await f.metrics()).live.users.some(row=>row.name==='새 닉네임'),false);
  await Promise.all(f.pending);
});

test('visit resolver authenticates before waking room and rejects wrong method, origin, type or declared size',async()=>{
  let calls=0;const env={FAB_OWNER_VISITOR_ID:owner,FAB_ROOM:{getByName(){calls++;throw Error('Must not wake room');}}};
  for(const cookie of ['',ordinaryToken])assert.equal((await worker.fetch(visitRequest({name:'기록보존'},{cookie}),env)).status,403);
  for(const [options,status] of [[{method:'GET'},405],[{headers:{Origin:'https://elsewhere.test'}},403],[{headers:{Origin:''}},403],[{headers:{'Content-Type':'text/plain'}},415],[{headers:{'Content-Length':'1025'}},413]]){
    const response=await worker.fetch(visitRequest({name:'기록보존'},options),env);
    assert.equal(response.status,status);assert.match(response.headers.get('Cache-Control'),/private, no-store/);
  }
  assert.equal(calls,0);
  const f=await fixture();
  for(const [options,status] of [[{cookie:ordinaryToken},403],[{method:'GET'},405],[{headers:{Origin:'https://elsewhere.test'}},403],[{headers:{'Content-Type':'text/plain'}},415]])assert.equal((await f.room.fetch(visitRequest({name:'기록보존'},options))).status,status,'Durable Object independently validates access');
});

test('visit resolver rejects invalid names and bounds both declared and streamed bodies',async()=>{
  const f=await fixture();
  for(const value of [null,[],{},'기록보존',{name:null},{name:4},{name:''},{name:'   '},{name:' 기록보존'},{name:'기록보존 '},{name:'가'.repeat(33)},{name:'🙂'},{name:'기록\n보존'},{name:'<script>'},{name:'기록보존',id:ordinary}]){
    const response=await worker.fetch(visitRequest(value),f.env);assert.equal(response.status,400);assert.equal(typeof (await response.json()).message,'string');
  }
  assert.equal((await worker.fetch(visitRequest(undefined),f.env)).status,400);
  assert.equal((await worker.fetch(visitRequest(null,{raw:'{broken'}),f.env)).status,400);
  assert.equal((await worker.fetch(visitRequest({name:'가'.repeat(400)}),f.env)).status,413,'limit counts UTF-8 bytes');
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1025));},cancel(){cancelled=true;}});
  const response=await worker.fetch(visitRequest(null,{raw:stream}),f.env);
  assert.equal(response.status,413);assert.equal(cancelled,true,'oversized open stream is cancelled without waiting for its end');
});

test('visit resolver handles missing, self, hidden, airborne, duplicate and excluded targets without guessing',async()=>{
  const f=await fixture();await f.room.admit(peer(),ordinary,1);await f.room.admit(peer(),owner,1);await f.room.admit(peer(),probe,1);
  const player=f.room.room.players.get(ordinary),visit=name=>worker.fetch(visitRequest({name}),f.env);
  assert.equal((await visit('없는사람')).status,404);assert.equal((await visit('FAB짱 세미')).status,409);assert.equal((await visit('검증')).status,404);
  assert.equal((await visit('기록보존')).status,409,'entry-hidden visitors are unavailable');
  player.hidden=false;
  for(const changed of [{y:.31},{phase:'climb'},{phase:'climbing'},{phase:'riding'}]){
    Object.assign(player,{y:0,phase:'idle'},changed);const response=await visit('기록보존');assert.equal(response.status,409);assert.match((await response.json()).message,/OHT/);
  }
  Object.assign(player,{y:0,phase:'idle'});
  const duplicate='visitor:'+'d'.repeat(64);f.room.room.players.set(duplicate,{...player,id:duplicate});
  assert.equal((await visit('기록보존')).status,409);f.room.room.players.delete(duplicate);
  f.room.room.players.set('resident:fake',{...player,id:'resident:fake',civilianName:'자동캐릭터'});assert.equal((await visit('자동캐릭터')).status,404);f.room.room.players.delete('resident:fake');
  f.room.room.players.delete(ordinary);assert.equal((await visit('기록보존')).status,404,'stored profile is not treated as online');
  await Promise.all(f.pending);
});

test('visit resolves human safety civilian name to a short-lived target without storage access or moving any actor',async()=>{
  const f=await fixture();await f.room.admit(peer(),ordinary,1);
  const player=f.room.room.players.get(ordinary);Object.assign(player,{hidden:false,y:0,role:'safety-red',name:'안전팀 임시이름'});
  const records=structuredClone(f.records),players=structuredClone([...f.room.room.players]);
  for(const method of ['get','put','delete','list'])f.storage[method]=()=>{throw Error('Visit resolution must not touch storage');};
  const before=Date.now(),response=await worker.fetch(visitRequest({name:'기록보존'}),f.env),after=Date.now();
  assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/private, no-store/);assert.equal(response.headers.get('Vary'),'Cookie');
  const data=await response.json();assert.deepEqual(Object.keys(data).sort(),['expiresAt','target']);assert.deepEqual(data.target,{id:ordinary,name:'기록보존'});
  assert.ok(data.expiresAt>=before+120000&&data.expiresAt<=after+120000);
  assert.equal((await worker.fetch(visitRequest({name:'안전팀 임시이름'}),f.env)).status,404);
  assert.deepEqual(f.records,records);assert.deepEqual([...f.room.room.players],players);
  assert.equal(f.room.room.players.has(owner),false,'resolving a visit does not join the operator to the room');
});

test('manual event API is owner-only at the edge and room, requires same-origin POST and bounds request bodies',async()=>{
  let wakes=0;const env={FAB_OWNER_VISITOR_ID:owner,FAB_ROOM:{getByName(){wakes++;throw Error('Unauthorized wake');}}};
  const input={kind:'bay',requestId:'00000000-0000-0000-0000-000000000001'};
  for(const cookie of ['',ordinaryToken,probeToken])for(const method of ['GET','POST'])assert.equal((await worker.fetch(eventRequest(input,{cookie,method}),env)).status,403);
  assert.equal(wakes,0);
  const f=await fixture();
  for(const cookie of ['',ordinaryToken])assert.equal((await f.room.fetch(eventRequest(input,{cookie}))).status,403);
  for(const badOrigin of ['', 'https://elsewhere.test'])assert.equal((await worker.fetch(eventRequest(input,{headers:{Origin:badOrigin}}),f.env)).status,403);
  assert.equal((await worker.fetch(eventRequest(input,{headers:{'Content-Type':'text/plain'}}),f.env)).status,415);
  for(const value of [{...input,amount:20000},{...input,bayCount:3},{...input,bayCount:'2'},{...input,kind:'golden',bayCount:2},{kind:'golden',requestId:'bad'},[],null])assert.equal((await worker.fetch(eventRequest(value),f.env)).status,400);
  assert.equal((await worker.fetch(eventRequest(input,{raw:' '.repeat(513)}),f.env)).status,400);
});

test('owner start is persisted before success, duplicate requests replay once, and event GET does not change profiles or join',async()=>{
  const f=await fixture(),before=structuredClone(f.records),at=Date.parse('2026-11-04T17:00:00+09:00');
  f.room.room.worldEvents=createWorldEvents({now:()=>at,random:()=>.42,isDestroyed:()=>false,prepareBay(){},assignSafety(){},spawnGolden:()=>[],expireGolden(){},goldenRemaining:()=>0,reward(){},onChange:s=>f.room.profiles.saveEvents(s)});
  const read=await worker.fetch(eventRequest(null,{method:'GET'}),f.env);assert.equal(read.status,200);assert.match(read.headers.get('Cache-Control'),/private, no-store/);assert.deepEqual(f.records,before);
  const input={kind:'bay',bayCount:2,requestId:'00000000-0000-0000-0000-000000000002'};
  const results=await Promise.all([worker.fetch(eventRequest(input),f.env),worker.fetch(eventRequest(input),f.env)]);
  for(const response of results){assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/private, no-store/);}
  const data=await Promise.all(results.map(r=>r.json()));assert.equal(data.filter(r=>r.replayed).length,1);
  assert.equal(data[0].event.id,data[1].event.id);assert.equal(f.records.get('world:events:v1').bay.id,data[0].event.id);
  assert.equal(f.records.get('world:events:v1').manualRequests.length,1);
  assert.equal(f.records.get('world:events:v1').bay.bayLimit,2);
  assert.equal((await worker.fetch(eventRequest({...input,bayCount:1}),f.env)).status,409);
  for(const key of [...before.keys()].filter(k=>k.startsWith('profile:')))assert.deepEqual(f.records.get(key),before.get(key));
  assert.equal(f.room.room.players.size,0);
});

test('private ranking pages contain fifty offline profiles and no credentials, use batched Google checks and never rescan',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());const f=await fixture(db);
  f.room.accounts.start(ordinary);db.prepare('INSERT INTO google_links VALUES (?,?)').run('private-google-subject',ordinary);
  for(let i=1000;i<1101;i++)f.room.profiles.save({id:'visitor:'+i.toString(16).padStart(64,'0'),name:'유저'+i,brokenCount:i%11,repairedCount:i%7});
  f.env.FAB_ANALYTICS={getByName:()=>({registrationDates:async ids=>{assert.ok(ids.length<=50);return ids.map(id=>id===ordinary?'2026-11-04':null);}})};
  const before=structuredClone(f.records),reads=f.reads();
  const page=async n=>{const res=await worker.fetch(request('/api/admin/rankings?page='+n,token),f.env);assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/private, no-store/);return res.json();};
  const a=await page(1),b=await page(2),c=await page(999);assert.equal(a.total,103);assert.equal(a.rows.length,50);assert.equal(b.rows.length,50);assert.equal(c.rows.length,3);assert.equal(c.page,3);
  const all=[...a.rows,...b.rows,...c.rows],p=all.find(r=>r.name==='기록보존');assert.equal(p.googleLinked,true);assert.equal(p.joinedDate,'2026-11-04');assert.equal(p.visitCount,0);assert.ok(all.some(r=>r.name==='FAB짱 세미'));assert.ok(!all.some(r=>r.name==='검증'));
  for(const secret of [owner,ordinary,probe,token,'private-google-subject','wallet','subject'])assert.ok(!JSON.stringify(all).includes(secret));
  assert.equal(f.reads(),reads);assert.equal(f.room.room.players.size,0);
  for(const [key,value] of before)if(key.startsWith('profile:'))assert.deepEqual(f.records.get(key),value);
  assert.equal((await worker.fetch(request('/api/admin/rankings',token,'POST'),f.env)).status,405);
  assert.equal((await f.room.fetch(request('/api/admin/rankings',ordinaryToken))).status,403);
  await Promise.all(f.pending);
});

test('ranking failure stays independent of admission; automatic reconnection does not inflate new visit counts',async()=>{
  const f=await fixture(),p=peer();await f.room.admit(p,ordinary,1);await f.room.admit(peer(),ordinary,2);
  f.env.FAB_ANALYTICS={getByName:()=>({registrationDates:async()=>{throw Error('offline');}})};
  const res=await worker.fetch(request('/api/admin/rankings',token),f.env),data=await res.json();assert.equal(res.status,200);assert.equal(data.rows.find(p=>p.name==='기록보존').visitCount,1);
  const put=f.storage.put;f.storage.put=async batch=>{if(Object.keys(batch).some(k=>k.startsWith('admin:visits:')))throw Error('analytics storage unavailable');return put(batch);};
  await f.room.flushMetrics(true);assert.equal(f.room.rankingWriteDelayed,true);const peer2=peer();await f.room.admit(peer2,ordinary,3);assert.ok(peer2.packets.some(p=>p.type==='welcome'));
  f.storage.put=put;await Promise.all(f.pending);await f.room.flushMetrics(true);
});
