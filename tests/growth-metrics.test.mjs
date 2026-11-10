import test from 'node:test';
import assert from 'node:assert/strict';
import {createGrowthMetrics,GROWTH_LIMITS} from '../server/growth-metrics.js';

const id=n=>'visitor:'+n.toString(16).padStart(24,'0')+'0'.repeat(40);
const DAY=86400000;
function setup(at='2026-11-04T03:00:00Z',options={}){
  let time=Date.parse(at);const metrics=createGrowthMetrics({now:()=>time,...options});
  return {metrics,add:ms=>time+=ms,set:at=>time=typeof at==='number'?at:Date.parse(at),now:()=>time};
}
function memoryStorage(){
  const data=new Map(),batches=[];
  return {data,batches,put:async rows=>{batches.push(Object.keys(rows).length);for(const [k,v] of Object.entries(rows)){assert.ok(k.startsWith('growth:v1:'));assert.ok(Buffer.byteLength(JSON.stringify(v))<=GROWTH_LIMITS.valueBytes);data.set(k,structuredClone(v));}},delete:async keys=>keys.forEach(k=>data.delete(k))};
}
const profile=(n,changes={})=>({id:id(n),brokenCount:50,repairedCount:10,wallet:{chips:1000,earnedChips:100,owned:['suit-default','eyes-default'],nicknamePurchases:0},...changes});
const person=(n,changes={})=>({id:id(n),hidden:false,phase:'walking',role:'visitor',penalty:0,...changes});
const row=metrics=>metrics.snapshot().daily.at(-1);
const event=(kind,index=1,changes={})=>({kind,id:`550e8400-e29b-41d4-a716-446655440000:${index}`,pageId:'550e8400-e29b-41d4-a716-446655440000',elapsedMs:1000,platform:'ios-instagram',source:'instagram',build:'abc1234',...changes});

test('owner, verifier, NPC and malformed IDs never create growth records',async()=>{
  const {metrics}=setup(undefined,{ownerId:id(1),excludedIds:[id(2)]});
  for(const excluded of [id(1),id(2),'resident:1','safety:1','visitor:bad']){
    assert.equal(metrics.connect(excluded,{existing:false}),false);
    assert.equal(metrics.client(excluded,event('page_start')),false);
    assert.equal(metrics.activity(excluded,'destroy'),false);
    assert.equal(metrics.reward(excluded,'throw',1),false);
    assert.equal(metrics.purchaseRejected(excluded,'sprout'),false);
    metrics.observeProfile({...profile(3),id:excluded});
  }
  metrics.presence([person(1),person(2)]);
  assert.deepEqual(metrics.snapshot().daily,[]);
  const storage=memoryStorage();await metrics.flush(storage);
  assert.deepEqual([...storage.data.keys()],['growth:v1:meta']);
});

test('legacy history is unknown; visits deduplicate daily and new cohorts require a truly new profile',()=>{
  const {metrics,add}=setup();
  metrics.connect(id(1),{existing:true});metrics.connect(id(2),{existing:false});
  metrics.connect(id(1),{existing:false});metrics.connect(id(2),{existing:false});
  let today=row(metrics);assert.equal(today.visits.accounts,2);assert.equal(today.visits.newAccounts,1);
  assert.equal(today.visits.legacyFirstObserved,1);assert.equal(today.visits.unknownHistoryAccounts,1);assert.equal(today.visits.returnRate,0);
  assert.equal(today.retention.d1.status,'pending');assert.equal(today.retention.d1.rate,null);
  add(DAY);metrics.connect(id(1),{existing:true});metrics.connect(id(2),{existing:true});
  today=row(metrics);assert.equal(today.visits.returningAccounts,2);assert.equal(today.visits.returnRate,1);
  const first=metrics.snapshot().daily[0];assert.equal(first.retention.d1.returnedAccounts,1);assert.equal(first.retention.d1.status,'pending');
  add(DAY);assert.equal(metrics.snapshot().daily[0].retention.d1.rate,1);
  assert.equal(row(metrics).visits.accounts,2,'snapshot does not manufacture absent dates');
});

test('D1 and D7 count exact KST dates and remain pending until their follow-up day has ended',()=>{
  const {metrics,set}=setup('2026-11-04T14:59:59Z');metrics.connect(id(1),{existing:false});metrics.connect(id(2),{existing:false});
  set('2026-11-04T15:00:00Z');metrics.connect(id(1));
  set('2026-11-05T15:00:00Z');metrics.connect(id(2));
  let cohort=metrics.snapshot().daily[0];assert.equal(cohort.date,'2026-11-04');assert.equal(cohort.retention.d1.rate,.5);
  assert.equal(cohort.retention.d7.status,'pending');
  set('2026-11-10T15:00:00Z');metrics.connect(id(1));metrics.connect(id(1));
  cohort=metrics.snapshot().daily[0];assert.equal(cohort.retention.d7.returnedAccounts,1);assert.equal(cohort.retention.d7.rate,null);
  set('2026-11-11T15:00:00Z');cohort=metrics.snapshot().daily[0];assert.equal(cohort.retention.d7.rate,.5);
  assert.deepEqual(metrics.snapshot().daily.map(d=>d.date),['2026-11-04','2026-11-05','2026-11-06','2026-11-11']);
});

test('a follow-up day without visit observations stays unknown; observed zero returns is measurable',()=>{
  const {metrics,set}=setup('2026-11-04T04:00:00Z');
  metrics.connect(id(1),{existing:false});
  set('2026-11-06T04:00:00Z');
  const d1=metrics.snapshot().daily[0].retention.d1;
  assert.equal(d1.status,'unobserved');assert.equal(d1.rate,null);
  set('2026-11-11T04:00:00Z');metrics.connect(id(2),{existing:false});
  set('2026-11-12T04:00:00Z');
  const d7=metrics.snapshot().daily[0].retention.d7;
  assert.equal(d7.status,'complete');assert.equal(d7.rate,0);assert.equal(d7.cohortAccounts,1);
});

test('observed activity excludes idle, hidden, reconnect and restart gaps; one-action accounts stay in duration distributions',async()=>{
  const state=setup(),{metrics,add}=state;metrics.connect(id(1));metrics.connect(id(2));metrics.presence([person(1),person(2)]);
  metrics.activity(id(1),'move');metrics.activity(id(2),'emote');add(10000);metrics.activity(id(1),'move');
  let current=row(metrics);assert.equal(current.activity.observedSeconds,10);assert.equal(current.activity.togetherSeconds,10);
  assert.equal(current.activity.medianAccountSeconds,0);assert.equal(current.activity.p95AccountSeconds,10);
  add(31000);metrics.activity(id(1),'emote');assert.equal(row(metrics).activity.observedSeconds,10);
  metrics.presence([person(1,{hidden:true}),person(2)]);add(1000);assert.equal(metrics.activity(id(1),'emote'),false);
  metrics.connect(id(1));metrics.presence([person(1),person(2)]);add(1000);metrics.activity(id(1),'emote');
  assert.equal(row(metrics).activity.observedSeconds,10);
  const storage=memoryStorage();await metrics.flush(storage);
  const reboot=setup('2026-11-04T04:00:00Z');reboot.metrics.restore(storage.data);reboot.metrics.connect(id(1));reboot.metrics.activity(id(1),'move');
  assert.equal(row(reboot.metrics).activity.observedSeconds,10);
  assert.equal(row(reboot.metrics).visits.accounts,2);
  reboot.add(30001);assert.equal(reboot.metrics.snapshot().live.activeAccounts30s,0);
});

test('KST action intervals split between days and weekly repeat play requires two distinct dates',()=>{
  const {metrics,add}=setup('2026-11-04T14:59:50Z');metrics.connect(id(1),{existing:false});metrics.activity(id(1),'emote');
  add(20000);metrics.activity(id(1),'board');
  const daily=metrics.snapshot().daily;assert.deepEqual(daily.map(d=>d.activity.observedSeconds),[10,10]);
  assert.deepEqual(daily.map(d=>d.visits.accounts),[1,1]);
  assert.deepEqual(metrics.snapshot().last7Days,{activeAccounts:1,repeatActiveAccounts:1});
  assert.equal(daily[0].partial,true);assert.equal(daily[0].ongoing,false);assert.equal(daily[1].partial,false);assert.equal(daily[1].ongoing,true);
});

test('profile baselines do not backfill history, exact deltas count completed actions and actual purchase spend once',()=>{
  const {metrics,add}=setup();const p=profile(1);metrics.observeProfile(p);metrics.connect(id(1),{existing:true});
  assert.equal(metrics.observeProfile(p),true);assert.equal(row(metrics).economy.earnedChips,0);
  add(1000);p.brokenCount++;p.repairedCount++;p.wallet.chips+=8;p.wallet.earnedChips+=8;
  metrics.reward(id(1),'destroy',5);metrics.reward(id(1),'repair',3);metrics.observeProfile(p);metrics.observeProfile(p);
  let current=row(metrics);assert.deepEqual(current.activity.actions.destroy,{count:1,accounts:1});assert.deepEqual(current.activity.actions.repair,{count:1,accounts:1});
  assert.equal(current.economy.earnedChips,8);assert.equal(current.economy.earnedBySource.destroy,5);
  p.wallet.chips-=35;p.wallet.owned.push('sprout');metrics.observeProfile(p);metrics.observeProfile(p);
  current=row(metrics);assert.equal(current.economy.purchases,1);assert.equal(current.economy.spentChips,35,'uses balance delta, not current catalog price');
  assert.deepEqual(current.economy.items,[{id:'sprout',name:'작은 새싹',price:50,copies:1,spentChips:35}]);
  assert.equal(current.funnel.purchased,1);
  p.wallet.chips-=500;p.wallet.nicknamePurchases++;metrics.observeProfile(p);assert.equal(row(metrics).economy.nicknamePurchases,1);assert.equal(row(metrics).economy.spentChips,535);
  metrics.reward(id(1),'throw',1);p.wallet.earnedChips++;p.wallet.chips++;metrics.observeProfile(p);
  metrics.reward(id(1),'clean',2);p.wallet.earnedChips+=2;p.wallet.chips+=2;metrics.observeProfile(p);
  current=row(metrics);assert.deepEqual(current.activity.actions.throw,{count:1,accounts:1});assert.deepEqual(current.activity.actions.clean,{count:1,accounts:1});
  assert.equal(current.economy.earnedChips,11);assert.equal(current.economy.earnedBySource.throw,1);assert.equal(current.economy.earnedBySource.clean,2);
});

test('repeat safety-pass purchases count actual spend once, consumption is not another purchase',()=>{
  const {metrics}=setup(),p=profile(1);metrics.connect(p.id);metrics.observeProfile(p);
  p.wallet.safetyPassPurchases=2;p.wallet.safetyPasses=2;p.wallet.chips-=60;metrics.observeProfile(p);metrics.observeProfile(p);
  assert.equal(row(metrics).economy.purchases,2);assert.equal(row(metrics).economy.spentChips,60);assert.equal(row(metrics).funnel.purchased,1);
  assert.deepEqual(row(metrics).economy.items,[{id:'safety-pass',name:'안전팀 패널티 해제 쿠폰',price:30,copies:2,spentChips:60}]);
  p.wallet.safetyPasses--;p.wallet.safetyPassUses=1;metrics.observeProfile(p);assert.equal(row(metrics).economy.purchases,2);assert.equal(row(metrics).economy.spentChips,60);
});
test('ambiguous multi-item profile deltas do not invent per-item sale prices; reset baselines remain non-retroactive',()=>{
  const {metrics}=setup();const p=profile(1);metrics.connect(id(1));metrics.observeProfile(p);
  p.wallet.owned.push('sprout','suit-pink');p.wallet.chips-=80;metrics.observeProfile(p);
  let current=row(metrics);assert.equal(current.economy.purchases,2);assert.equal(current.economy.unattributedSpend,80);
  assert.ok(current.economy.items.every(item=>item.spentChips===null));
  metrics.forget(id(1));p.wallet.owned.push('suit-blue');p.wallet.chips-=50;metrics.observeProfile(p);metrics.connect(id(1));
  assert.equal(row(metrics).economy.purchases,2);
});

test('event rewards remain attributed after restoring a day written before events existed',async()=>{
  const {metrics}=setup();metrics.connect(id(1));metrics.observeProfile(profile(1));
  const storage=memoryStorage();await metrics.flush(storage);
  for(const value of storage.data.values())if(value.economy)for(const kind of ['golden-deposit','golden-throw','golden-clean','bay-event'])delete value.economy.earnedBySource[kind];
  const next=setup().metrics;next.restore(storage.data);next.connect(id(1));next.observeProfile(profile(1));
  for(const [kind,amount]of [['golden-deposit',200],['golden-throw',50],['golden-clean',10],['bay-event',200]])assert.equal(next.reward(id(1),kind,amount),true);
  const p=profile(1);p.wallet.chips+=460;p.wallet.earnedChips+=460;next.observeProfile(p);
  const data=row(next);assert.equal(data.economy.earnedChips,460);assert.equal(data.economy.earnedBySource['bay-event'],200);assert.equal(data.activity.actions.throw.count,1);assert.equal(data.activity.actions.clean.count,1);
});

test('page quality accepts UUID:sequence IDs, deduplicates persisted events, and separates pages from account funnel stages',async()=>{
  const {metrics}=setup();metrics.client(id(1),event('page_start'));metrics.client(id(1),event('scene_ready',2));metrics.client(id(1),event('connected',3));
  metrics.client(id(1),event('connected',4));metrics.connect(id(1));
  for(const [kind,index] of [['shop_open',5],['shop_open',6],['try_on',7],['connect_error',8],['reconnect',9],['client_error',10]])metrics.client(id(1),event(kind,index,{itemId:'sprout'}));
  metrics.purchaseRejected(id(1),'sprout');metrics.purchaseRejected(id(1),'sprout');
  let current=row(metrics);assert.equal(current.funnel.pageStarts,1);assert.equal(current.funnel.sceneReady,1);assert.equal(current.funnel.connected,1);
  assert.equal(current.funnel.shopOpen,1);assert.equal(current.funnel.tryOn,1);assert.equal(current.funnel.insufficientChips,1);
  assert.equal(current.quality.connectErrors,1);assert.equal(current.quality.reconnects,1);assert.equal(current.quality.clientErrors,1);
  assert.equal(current.quality.connectMs.p50,1000);assert.equal(current.quality.platforms[0].pages,1);
  const storage=memoryStorage();await metrics.flush(storage);const next=setup();next.metrics.restore(storage.data);
  assert.equal(next.metrics.client(id(1),event('connect_error',8)),false);assert.equal(next.metrics.client(id(1),event('connect_error',11)),true);
  assert.equal(row(next.metrics).quality.connectErrors,2);
  assert.ok(!JSON.stringify(next.metrics.snapshot()).includes(id(1).slice(8,32)));assert.ok(!JSON.stringify(next.metrics.snapshot()).includes('550e8400'));
});

test('reported partial flows never imply a page start; arbitrary client tags remain bounded and prototype safe',async()=>{
  const {metrics}=setup();metrics.client(id(1),event('connect_error',1,{platform:'constructor',source:'x'.repeat(100000),build:{secret:'do-not-store'}}));
  const current=row(metrics);assert.equal(current.quality.reportedPages,1);assert.equal(current.funnel.pageStarts,0);assert.equal(current.funnel.connected,0);
  assert.deepEqual(current.quality.platforms,[{label:'constructor',pages:0,connected:0,connectErrors:1,clientErrors:0}]);
  assert.equal(current.quality.sources[0].label,'unknown');assert.equal(current.quality.builds[0].label,'unknown');
  const storage=memoryStorage();await metrics.flush(storage);assert.ok(!JSON.stringify([...storage.data.values()]).includes('do-not-store'));
  assert.equal(metrics.client(id(1),event('page_start',2,{elapsedMs:Infinity})),false);
  assert.equal(metrics.client(id(1),event('page_start',2,{pageId:'invalid:page'})),false);
});

test('safety first-presence state is a baseline; only transitions and confirmed short departures count',()=>{
  const {metrics,add}=setup();metrics.connect(id(1),{transport:'restored'});metrics.presence([person(1,{role:'safety-red',penalty:3})]);
  assert.equal(row(metrics).safety.assignments,0);assert.equal(row(metrics).safety.penalties,0);
  metrics.presence([person(1)]);add(1000);metrics.presence([person(1,{role:'safety-orange',penalty:3})]);
  let current=row(metrics);assert.equal(current.safety.assignments,1);assert.equal(current.safety.penalties,1);
  add(10000);metrics.presence([]);add(59000);assert.equal(row(metrics).safety.departuresWithin60s,0);
  metrics.connect(id(1));metrics.presence([person(1,{role:'safety-orange',penalty:3})]);add(1000);
  assert.equal(row(metrics).safety.departuresWithin60s,0);assert.equal(row(metrics).safety.assignments,1);
  metrics.presence([person(1)]);add(1000);metrics.presence([person(1,{role:'safety-red'})]);add(1000);metrics.presence([]);add(120000);
  current=row(metrics);assert.equal(current.safety.departuresWithin60s,1);assert.equal(current.safety.afterAssignment,1);assert.equal(current.safety.afterPenalty,0);
  assert.equal(row(metrics).safety.departuresWithin60s,1,'settling twice does not duplicate');
});

test('8000 account cap and checkpoints remain bounded per value and batch, with explicit limited status',async()=>{
  const {metrics}=setup(),storage=memoryStorage();
  for(let n=1;n<=GROWTH_LIMITS.accounts+1;n++)metrics.connect(id(n),{existing:false});
  assert.equal(row(metrics).visits.accounts,GROWTH_LIMITS.accounts);assert.equal(metrics.snapshot().limited,true);assert.equal(row(metrics).limited,true);
  await metrics.flush(storage);assert.equal([...storage.data.values()].filter(v=>v.kind==='account').length,GROWTH_LIMITS.accounts);
  assert.ok(storage.batches.every(n=>n<=128));
});

test('page/event caps are explicit and expired pages release storage capacity',async()=>{
  const {metrics,add}=setup(),storage=memoryStorage();
  for(let n=0;n<GROWTH_LIMITS.eventsPerPage;n++)assert.equal(metrics.client(id(1),event('connect_error',n)),true);
  assert.equal(metrics.client(id(1),event('connect_error',999)),false);
  for(let n=1;n<GROWTH_LIMITS.pages;n++)assert.equal(metrics.client(id(1),event('page_start',1,{pageId:`page-${n}`})),true);
  assert.equal(metrics.client(id(1),event('page_start',1,{pageId:'overflow'})),false);assert.equal(metrics.snapshot().limited,true);
  await metrics.flush(storage);add(DAY+60000);assert.equal(metrics.client(id(1),event('page_start',1,{pageId:'fresh'})),true);
  await metrics.flush(storage);assert.equal([...storage.data.values()].filter(v=>v.kind==='page').length,1);
});

test('flush failures retry and changes while writes await remain dirty',async()=>{
  const {metrics}=setup(),storage=memoryStorage();metrics.connect(id(1));
  await assert.rejects(metrics.flush({...storage,put:async()=>{throw Error('temporary');}}),/temporary/);await metrics.flush(storage);
  metrics.activity(id(1),'emote');let release,started;const holding=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>started=resolve);
  const pending=metrics.flush({...storage,put:async rows=>{started();await holding;await storage.put(rows);}});await ready;
  metrics.activity(id(1),'emote');release();await pending;await metrics.flush(storage);
  const next=setup();next.metrics.restore(storage.data);assert.equal(row(next.metrics).activity.actions.emote.count,2);
});

test('30-day retention removes expired checkpoints without fabricating absent days or persisting profiles',async()=>{
  const {metrics,add}=setup(),storage=memoryStorage();metrics.connect(id(1),{existing:false});metrics.observeProfile(profile(1));metrics.activity(id(1),'emote');metrics.presence([]);await metrics.flush(storage);
  add(29*DAY);metrics.connect(id(2));await metrics.flush(storage);assert.equal(metrics.snapshot().daily.length,2);
  add(DAY);await metrics.flush(storage);assert.equal(metrics.snapshot().daily.length,1);assert.equal([...storage.data.values()].filter(v=>v.kind==='account').length,1);
  assert.ok([...storage.data.values()].every(v=>!('wallet' in v)&&!('name' in v)&&!('id' in v)));
  const report=metrics.snapshot();report.daily[0].activity.actions.move.count=999;
  assert.equal(row(metrics).activity.actions.move.count,0,'public snapshots are detached');
});

test('trusted batched timestamps preserve action gaps after a snapshot and reject old or future timestamps',()=>{
  const {metrics,now,add}=setup();const initial=now();add(10000);
  metrics.at(initial,()=>metrics.connect(id(1),{existing:false}));
  metrics.at(initial+1000,()=>metrics.activity(id(1),'emote'));
  metrics.snapshot();
  metrics.at(initial+6000,()=>metrics.activity(id(1),'emote'));
  assert.equal(row(metrics).activity.observedSeconds,5);
  assert.equal(row(metrics).quality.firstActionMs.p50,1000);
  assert.equal(metrics.at(now()-60001,()=>assert.fail('expired callback ran')),false);
  assert.equal(metrics.at(now()+1,()=>assert.fail('future callback ran')),false);
  assert.throws(()=>metrics.at(initial+7000,()=>{throw Error('reset scope');}),/reset scope/);
  add(1000);metrics.activity(id(1),'emote');assert.equal(row(metrics).activity.observedSeconds,10);
});

test('late relay delivery preserves a reconnect inside the 60-second grace period',()=>{
  const {metrics,now,add}=setup();metrics.connect(id(1));metrics.presence([person(1)]);add(1000);metrics.presence([person(1,{role:'safety-red'})]);
  add(1000);metrics.presence([]);const disconnected=now();add(61000);
  assert.equal(row(metrics).safety.departuresWithin60s,0,'wait for the maximum relay delay before concluding departure');
  metrics.at(disconnected+59000,()=>metrics.connect(id(1)));metrics.presence([person(1,{role:'safety-red'})]);add(60000);
  assert.equal(row(metrics).safety.departuresWithin60s,0);
});

test('maximum growth checkpoint stream fits bounded values and produces 30-day snapshots', {skip:!process.env.FAB_GROWTH_BENCH},async t=>{
  const at=Date.parse('2026-11-04T03:00:00Z'),date=Math.floor((at+32400000)/DAY),metrics=createGrowthMetrics({now:()=>at});
  const source=setup(),sourceStorage=memoryStorage();source.metrics.connect(id(1));await source.metrics.flush(sourceStorage);
  const template=[...sourceStorage.data.values()].find(v=>v.kind==='day');metrics.restore(new Map());
  const began=performance.now();let page=new Map(),loadPeak=0;
  const accept=()=>{metrics.restorePage(page);page.clear();global.gc?.();loadPeak=Math.max(loadPeak,process.memoryUsage().heapUsed);};
  page.set('growth:v1:meta',{version:1,startedAt:new Date(at-29*DAY).toISOString(),reasons:[]});
  for(let d=date-29;d<=date;d++){const value=structuredClone(template);value.day=d;value.visits.accounts=GROWTH_LIMITS.accounts;value.activity.accounts=GROWTH_LIMITS.accounts;value.activity.activeMs=GROWTH_LIMITS.accounts*600000;page.set('growth:v1:day:'+d,value);}
  for(let n=1;n<=GROWTH_LIMITS.accounts;n++){
    const fp=id(n).slice(8,32),days=[];for(let d=date-29;d<=date;d++)days.push(d,32767,600000,d*DAY-32400000+3600000);
    page.set('growth:v1:account:'+fp,{version:1,kind:'account',fp,firstObserved:date-29,firstConnected:date-29,legacy:false,lastSeen:at,days});if(page.size>=500)accept();
  }
  for(let n=0;n<GROWTH_LIMITS.pages;n++){
    const account=id(n+1).slice(8,32);
    page.set('growth:v1:page:'+account+':'+n.toString(16).padStart(16,'0'),{version:1,kind:'page',account,day:date,at,seen:Array.from({length:GROWTH_LIMITS.eventsPerPage},(_,i)=>(n*128+i).toString(16).padStart(16,'0')),flags:7,platform:'ios-instagram',source:'instagram',build:'1'.repeat(40)});if(page.size>=500)accept();
  }
  accept();const loadMs=performance.now()-began,retained=process.memoryUsage().heapUsed,beforeSnapshot=performance.now(),snapshot=metrics.snapshot(),snapshotMs=performance.now()-beforeSnapshot;
  assert.equal(snapshot.daily.length,30);assert.equal(snapshot.daily.at(-1).visits.accounts,GROWTH_LIMITS.accounts);assert.equal(snapshot.daily.at(-1).activity.medianAccountSeconds,600);
  const active=Array.from({length:100},(_,n)=>person(n+1));
  for(let n=1;n<=GROWTH_LIMITS.accounts;n++){metrics.connect(id(n));metrics.observeProfile(profile(n));}metrics.presence(active);
  const staged=new Map();let largest=0,batches=0,writePeak=0;const beforeFlush=performance.now();
  await metrics.flush({put:async values=>{
    assert.ok(Object.keys(values).length<=128);batches++;
    for(const [k,v] of Object.entries(values)){largest=Math.max(largest,Buffer.byteLength(JSON.stringify(v)));staged.set(k,v);}
    writePeak=Math.max(writePeak,process.memoryUsage().heapUsed);
  },delete:async()=>{}});
  const flushMs=performance.now()-beforeFlush;global.gc?.();const stagedRetained=process.memoryUsage().heapUsed;
  assert.ok(largest<GROWTH_LIMITS.valueBytes);assert.ok(staged.size>=GROWTH_LIMITS.accounts);
  t.diagnostic(JSON.stringify({loadMs,snapshotMs,flushMs,loadPostGcMiB:loadPeak/1048576,retainedMiB:retained/1048576,writePeakMiB:writePeak/1048576,stagedRetainedMiB:stagedRetained/1048576,largestValueBytes:largest,batches}));
});

test('shop observations arriving before the delayed server connect survive checkpoints and count each account once',async()=>{
  const {metrics,add}=setup(),storage=memoryStorage();
  metrics.client(id(1),event('shop_open',1));metrics.client(id(1),event('try_on',2,{itemId:'sprout'}));metrics.client(id(1),event('shop_open',3));
  assert.equal(row(metrics).funnel.shopOpen,0);assert.equal(row(metrics).visits.accounts,0);
  await metrics.flush(storage);const next=setup();next.metrics.restore(new Map());
  for(const [k,v] of storage.data)next.metrics.restorePage(new Map([[k,v]]));
  next.metrics.connect(id(1),{existing:false});next.metrics.connect(id(1));
  assert.equal(row(next.metrics).funnel.shopOpen,1);assert.equal(row(next.metrics).funnel.tryOn,1);assert.equal(row(next.metrics).visits.newAccounts,1);
  await next.metrics.flush(storage);assert.ok([...storage.data.values()].filter(v=>v.kind==='page').every(v=>!v.pending));
});

test('private registration lookup preserves unknown legacy dates and returns only dates for at most fifty requested accounts',()=>{
 const now=Date.parse('2026-11-10T04:00:00Z'),fresh='visitor:'+'1'.repeat(64),legacy='visitor:'+'2'.repeat(64),owner='visitor:'+'3'.repeat(64),r=createGrowthMetrics({now:()=>now,ownerId:owner});
 r.connect(fresh,{existing:false});r.connect(legacy,{existing:true});r.connect(owner,{existing:false});
 assert.deepEqual(r.registrationDates([fresh,legacy,owner,'invalid']),['2026-11-10',null,null,null]);assert.equal(r.registrationDates(Array(60).fill(fresh)).length,50);
});
