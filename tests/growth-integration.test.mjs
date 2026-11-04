import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {sessionId} from '../server/player-profiles.js';
import {restoreWallet} from '../server/chip-wallet.js';
import {createRoom} from '../server/room-engine.js';
import {machines} from '../src/layout.js';
import {getEmoApproach} from '../src/emo-interaction.js';
const bundle=await build({entryPoints:[fileURLToPath(new URL('../server/worker.js',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'platform',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'base',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export class DurableObject {constructor(ctx){this.ctx=ctx;}}'}));}}]});
const {FabRoom,FabAnalytics,default:worker}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const tokens=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)],ids=await Promise.all(tokens.map(sessionId));
const pageId='ab000000-0000-4000-8000-000000000001',event={id:pageId+':1',pageId,kind:'page_start',elapsedMs:4,source:'direct',build:'unknown'};
const req=(body={events:[event]},token=tokens[1],headers={})=>new Request('https://fab.test/api/telemetry',{method:'POST',headers:{Origin:'https://fab.test','Content-Type':'application/json',...(token?{Cookie:'fab-session-v1='+token}:{}),...headers},body:JSON.stringify(body)});
const peer=()=>({packets:[],send(raw){this.packets.push(JSON.parse(raw));},close(){},serializeAttachment(){}});
const ingest=body=>new Request('https://fab-analytics.internal/ingest',{method:'POST',body:JSON.stringify(body)});
const observation=(method,args,at=Date.now())=>({method,args,at});
const delivery=events=>({id:crypto.randomUUID(),events,dropped:0});
const row=f=>f.analytics.metrics.snapshot().daily.at(-1);
const copy=value=>structuredClone(value);

// Stage writes on a separate map and publish only after a successful transaction.
function memoryStorage(initial=[]){
  const state={records:new Map(initial),failTransactions:false,failReads:false,transactions:0,rollbacks:0,atomicWrites:[]};
  const api=records=>({
    get:async key=>{if(state.failReads)throw Error('storage unavailable');return copy(records.get(key));},
    put:async(batch,value)=>{for(const [key,item]of typeof batch==='string'?[[batch,value]]:Object.entries(batch))records.set(key,copy(item));},
    delete:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])records.delete(key);},
    list:async({prefix='',startAfter,limit=500}={})=>{if(state.failReads)throw Error('storage unavailable');return new Map([...records].filter(([key])=>key.startsWith(prefix)&&(!startAfter||key>startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit).map(([key,value])=>[key,copy(value)]));},
  });
  state.storage={...api(state.records),transaction:async callback=>{
    const staged=new Map([...state.records].map(([key,value])=>[key,copy(value)]));state.transactions++;
    try{await callback(api(staged));if(state.failTransactions)throw Error('atomic commit unavailable');}
    catch(error){state.rollbacks++;throw error;}
    state.records.clear();for(const [key,value]of staged)state.records.set(key,copy(value));
    state.atomicWrites.push([...staged.keys()]);
  }};
  return state;
}
async function bootAnalytics(state,env){
  let boot;const analytics=new FabAnalytics({storage:state.storage,blockConcurrencyWhile:f=>{boot=f();}},env);await boot;return analytics;
}
async function fixture({bindingFactory}={}){
  const game=memoryStorage([['profile:'+ids[1],{id:ids[1],name:'보존계정',civilianName:'보존계정',brokenCount:20,repairedCount:2,wallet:restoreWallet({brokenCount:20,repairedCount:2})}]]),analysis=memoryStorage(),pending=[];
  const env={FAB_OWNER_VISITOR_ID:ids[0],FAB_METRICS_EXCLUDED_IDS:ids[2]},analytics=await bootAnalytics(analysis,env);
  env.FAB_ANALYTICS=bindingFactory?bindingFactory(analytics):{getByName:name=>{assert.equal(name,'FAB-ANALYTICS-v1');return analytics;}};
  let boot;const room=new FabRoom({storage:game.storage,blockConcurrencyWhile:f=>{boot=f();},waitUntil:p=>pending.push(p),getWebSockets:()=>[]},env);room.start=()=>{};await boot;
  env.FAB_ROOM={getByName:()=>room};let drained=0;
  const drain=async()=>{while(drained<pending.length){const work=pending.slice(drained);drained=pending.length;await Promise.all(work);}};
  return {room,env,analytics,analysis,game,pending,drain,deliver:async()=>{room.growthMetrics.flush(true);await drain();}};
}
async function promptly(work){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('game waited for analytics')),500);})]);}finally{clearTimeout(timer);}}

test('telemetry edge and analytics DO reject unauthenticated or cross-origin reports without waking the game',async()=>{
  let wakes=0;const deniedBinding={getByName(){wakes++;throw Error('must not be woken');}},env={FAB_ROOM:deniedBinding,FAB_ANALYTICS:deniedBinding};
  assert.equal((await worker.fetch(req(undefined,''),env)).status,401);assert.equal((await worker.fetch(req(undefined,tokens[1],{Origin:'https://other.test'}),env)).status,403);assert.equal(wakes,0);
  const f=await fixture();assert.equal((await f.analytics.fetch(req(undefined,''))).status,401);await f.deliver();
});

test('client reports deduplicate in separate analytics storage, preserve profiles, and expose no identity',async()=>{
  const f=await fixture();await f.deliver();const before=copy([...f.game.records]);
  let gameWakes=0;f.env.FAB_ROOM={getByName(){gameWakes++;throw Error('analytics touched game');}};
  for(const token of [tokens[0],tokens[2],tokens[1],tokens[1]])assert.equal((await worker.fetch(req(undefined,token),f.env)).status,204);
  const growth=f.analytics.metrics.snapshot();assert.equal(row(f).funnel.pageStarts,1);assert.equal(gameWakes,0);assert.equal(f.room.room.players.size,0);assert.deepEqual([...f.game.records],before);
  assert.ok([...f.analysis.records.keys()].every(key=>key.startsWith('growth:v1:')));assert.ok([...f.game.records.keys()].every(key=>!key.startsWith('growth:v1:')));
  for(const secret of [...tokens,...ids,'보존계정',pageId])assert.equal(JSON.stringify(growth).includes(secret),false);
  assert.equal((await worker.fetch(req({events:[{...event,kind:'try_on',itemId:'missing-item'}]}),f.env)).status,400);
});

test('real purchases are observed once and analytics transaction failures cannot change chips or command acknowledgements',async()=>{
  const f=await fixture(),p=peer();await f.room.admit(p,ids[1],1);
  const purchase=JSON.stringify({type:'command',seq:1,kind:'purchase',data:{itemId:'suit-blue'}});
  await f.room.webSocketMessage(p,purchase);await f.room.webSocketMessage(p,purchase);await f.deliver();
  assert.equal(row(f).economy.purchases,1);assert.equal(row(f).economy.spentChips,50);assert.equal(f.room.room.wallet(ids[1]).chips,56);
  await f.room.webSocketMessage(p,JSON.stringify({type:'command',seq:2,kind:'purchase',data:{itemId:'suit-black'}}));await f.deliver();
  assert.equal(row(f).funnel.insufficientChips,1);assert.equal(row(f).economy.purchases,1);
  f.analysis.failTransactions=true;
  await promptly(f.room.webSocketMessage(p,JSON.stringify({type:'command',seq:3,kind:'equip',data:{itemId:'suit-blue'}})));assert.equal(p.packets.at(-1).ok,true);
  await f.deliver();assert.ok(f.analysis.rollbacks>0);
  await promptly(f.room.webSocketMessage(p,JSON.stringify({type:'command',seq:4,kind:'equip',data:{itemId:'suit-blue'}})));assert.equal(p.packets.at(-1).ok,true);
  f.room.growthMetrics.activity=()=>{throw Error('analytics callback unavailable');};
  await f.room.webSocketMessage(p,JSON.stringify({type:'command',seq:5,kind:'equip',data:{itemId:'suit-blue'}}));assert.equal(p.packets.at(-1).ok,true);
  assert.equal(f.room.room.profile(ids[1]).brokenCount,20);assert.equal(f.room.room.wallet(ids[1]).chips,56);assert.equal(f.game.records.get('profile:'+ids[1]).wallet.chips,56);
  assert.ok([...f.game.records.keys()].every(key=>!key.startsWith('growth:v1:')));await f.drain();
});

for(const failure of ['pending','throw'])test('welcome, move and command complete while analytics binding is '+failure,async()=>{
  let analyticsCalls=0;const f=await fixture({bindingFactory:()=>({getByName:()=>({fetch(){analyticsCalls++;if(failure==='throw')throw Error('analytics offline');return new Promise(()=>{});}})})}),p=peer();
  f.room.growthMetrics.presence([{id:ids[1],hidden:false,phase:'idle',role:'visitor',penalty:0}]);f.room.growthMetrics.flush(true);
  await promptly(f.room.admit(p,ids[1],1));assert.ok(p.packets.some(packet=>packet.type==='welcome'));
  assert.equal(f.room.pose(ids[1],{x:0,y:0,z:78.8,heading:0,hidden:false}),true);
  await promptly(f.room.webSocketMessage(p,JSON.stringify({type:'pose',pose:{x:.2,y:0,z:78.8,heading:0,hidden:false}})));assert.equal(f.room.room.players.get(ids[1]).x,.2);
  await promptly(f.room.webSocketMessage(p,JSON.stringify({type:'command',seq:1,kind:'purchase',data:{itemId:'suit-blue'}})));assert.equal(p.packets.at(-1).ok,true);assert.equal(f.room.room.wallet(ids[1]).chips,56);
  assert.ok(analyticsCalls>=1);await f.drain();
});

test('receipt and aggregates commit atomically, deduplicate replay, and survive analytics instance restart',async()=>{
  const f=await fixture();await f.deliver();const at=Date.now()-1000,batch=delivery([observation('connect',[ids[1],{existing:true}],at),observation('reward',[ids[1],'throw',1],at)]);
  f.analysis.failTransactions=true;const before=copy([...f.analysis.records]);
  assert.equal((await f.analytics.fetch(ingest(batch))).status,503);assert.deepEqual([...f.analysis.records],before);
  f.analysis.failTransactions=false;assert.equal((await f.analytics.fetch(ingest(batch))).status,204);
  assert.equal(row(f).economy.earnedBySource.throw,1);const committed=copy([...f.analysis.records]);
  assert.equal((await f.analytics.fetch(ingest(batch))).status,204);assert.deepEqual([...f.analysis.records],committed);
  const reboot=await bootAnalytics(f.analysis,f.env);assert.equal((await reboot.fetch(ingest(batch))).status,204);assert.equal(reboot.metrics.snapshot().daily.at(-1).economy.earnedBySource.throw,1);assert.deepEqual([...f.analysis.records],committed);
  const last=f.analysis.atomicWrites.at(-1);assert.ok(last.includes('growth:v1:delivery'));assert.ok(last.some(key=>key.startsWith('growth:v1:day:')));
});

test('failed transaction plus failed reload keeps requests unavailable until committed state can be restored',async()=>{
  const f=await fixture();await f.deliver();const batch=delivery([observation('connect',[ids[1]]),observation('reward',[ids[1],'throw',1])]);
  f.analysis.failTransactions=true;f.analysis.failReads=true;assert.equal((await f.analytics.fetch(ingest(batch))).status,503);
  f.analysis.failTransactions=false;assert.equal((await f.analytics.fetch(ingest(batch))).status,503,'uncommitted receipt must not answer successful replay');
  f.analysis.failReads=false;assert.equal((await f.analytics.fetch(ingest(batch))).status,204);assert.equal(row(f).economy.earnedBySource.throw,1);
});

test('delayed relay batches preserve event time and record stale observations as missing',async()=>{
  const f=await fixture();await f.deliver();const at=Date.now()-10000,batch=delivery([observation('connect',[ids[1]],at),observation('activity',[ids[1],'emote'],at),observation('activity',[ids[1],'emote'],at+5000),observation('activity',[ids[1],'emote'],at-60001)]);
  assert.equal((await f.analytics.fetch(ingest(batch))).status,204);assert.equal(row(f).activity.observedSeconds,5);assert.equal(row(f).activity.actions.emote.count,2);assert.equal(f.analytics.dropped,1);
  assert.equal((await f.analytics.fetch(ingest(batch))).status,204);assert.equal(row(f).activity.observedSeconds,5);assert.equal(f.analytics.dropped,1);
});

test('reward observation failure cannot change authoritative chip grants or replay protection',()=>{
  const rewards=[],r=createRoom({onReward:event=>{rewards.push(event);throw Error('observer unavailable');}}),id='a',tool=350;
  r.join(id);for(const p of r.residents.people)p.wait=1e9;
  r.pose(id,{...getEmoApproach(machines[tool]).destination,y:0,heading:0,speed:0,posture:'stand',hidden:false});
  assert.equal(r.command(id,'claim',{id:tool,kind:'emo'}).ok,true);r.command(id,'press',{id:tool});for(let i=0;i<16;i++)r.step(.05);
  assert.equal(r.command(id,'explode',{id:tool}).ok,true);r.command(id,'explode',{id:tool});
  assert.equal(r.wallet(id).chips,5);assert.deepEqual(rewards,[{id,kind:'destroy',amount:5}]);
});
