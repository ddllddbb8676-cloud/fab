import test from 'node:test';
import assert from 'node:assert/strict';
import {createGrowthRelay} from '../server/growth-relay.js';

const id=n=>'visitor:'+n.toString(16).padStart(64,'0');
const profile=n=>({id:id(n),name:'never relay names',brokenCount:20,repairedCount:2,wallet:{chips:106,earnedChips:0,nicknamePurchases:0,owned:['suit-default']}});
function setup({fetch,now=1700000000000,...options}={}){
  let time=now,drained=0;const requests=[],pending=[];
  const binding={getByName(name){assert.equal(name,'FAB-ANALYTICS-v1');return {fetch(request){requests.push(request.clone());return fetch?fetch(request,requests.length):Promise.resolve(new Response(null,{status:204}));}};}};
  const relay=createGrowthRelay({binding,now:()=>time,waitUntil:p=>pending.push(p),timeoutMs:30,...options});
  return {relay,requests,set:t=>time=t,add:ms=>time+=ms,now:()=>time,drain:async()=>{while(drained<pending.length){const work=pending.slice(drained);drained=pending.length;await Promise.all(work);}},bodies:()=>Promise.all(requests.map(request=>request.json()))};
}

test('move observations sample once a second and ordinary delivery batches for five seconds',async()=>{
  const s=setup();s.relay.connect(id(1),{profile:profile(1)});
  for(let i=0;i<50;i++){s.relay.activity(id(1),'move');s.relay.flush();s.add(100);}
  assert.equal(s.requests.length,0);s.relay.flush();assert.equal(s.requests.length,1);await s.drain();
  const [body]=await s.bodies(),moves=body.events.filter(event=>event.method==='activity');
  assert.equal(moves.length,5);assert.deepEqual(moves.map(event=>event.at),Array.from({length:5},(_,i)=>1700000000000+i*1000));assert.equal(body.dropped,0);
  s.relay.flush(true);assert.equal(s.requests.length,1,'empty flush does not make a request');
});

test('owner, probes, NPCs and disconnected activity do not enter relay bodies',async()=>{
  const s=setup({ownerId:id(1),excludedIds:[id(2)]});
  for(const blocked of [id(1),id(2),'resident:1','visitor:bad']){
    s.relay.connect(blocked,{profile:{...profile(1),id:blocked}});s.relay.activity(blocked,'move');s.relay.reward(blocked,'throw',1);s.relay.purchaseRejected(blocked,'sprout');s.relay.observeProfile({...profile(1),id:blocked});s.relay.forget(blocked);
  }
  s.relay.activity(id(3),'emote');s.relay.connect(id(3),{profile:profile(3)});s.relay.presence([{id:id(1)},{id:id(2)},{id:id(3),hidden:false}]);s.relay.presence([]);s.relay.activity(id(3),'move');
  s.relay.flush(true);await s.drain();const [body]=await s.bodies(),raw=JSON.stringify(body);
  for(const blocked of [id(1),id(2),'resident:1','visitor:bad','never relay names'])assert.equal(raw.includes(blocked),false);
  assert.equal(body.events.filter(event=>event.method==='activity').length,0);assert.equal(body.events.filter(event=>event.method==='connect').length,1);
});

test('queue caps events at 512 and reports overflow instead of growing without bound',async()=>{
  const s=setup();s.relay.connect(id(1));for(let i=0;i<5000;i++)s.relay.activity(id(1),'emote');s.relay.flush(true);await s.drain();
  const [body]=await s.bodies();assert.equal(body.events.length,512);assert.equal(body.dropped,4489);assert.ok(JSON.stringify(body).length<110100);
});

test('large presence snapshots respect the 110 KB queue cap before the event cap',async()=>{
  const s=setup(),people=Array.from({length:100},(_,n)=>({id:id(n+1),hidden:false,phase:'idle',role:'visitor',penalty:0}));
  for(let i=0;i<1000;i++)s.relay.presence(people);s.relay.flush(true);await s.drain();const [body]=await s.bodies();
  assert.ok(body.events.length>0&&body.events.length<512);assert.ok(body.events.reduce((sum,event)=>sum+JSON.stringify(event).length,0)<=110000);assert.equal(body.dropped,1000-body.events.length);
});

test('503 retry reuses exact batch ID, timestamps and body without mutating queued profile snapshots',async()=>{
  const s=setup({fetch:(_request,n)=>Promise.resolve(new Response(null,{status:n===1?503:204}))}),p=profile(1);
  s.relay.connect(id(1),{profile:p});p.wallet.owned.push('suit-blue');p.wallet.chips=56;s.add(1500);s.relay.activity(id(1),'emote');s.relay.flush(true);await s.drain();
  const [first,retry]=await s.bodies();assert.deepEqual(retry,first);assert.equal(first.events[0].at,1700000000000);assert.equal(first.events.at(-1).at,1700000001500);assert.deepEqual(first.events[0].args[0].wallet.owned,['suit-default']);assert.equal(first.events[0].args[0].wallet.chips,106);
});

test('throwing and never-resolving bindings release their in-flight slot and report lost observations',async()=>{
  for(const failure of ['throw','pending']){
    const s=setup({fetch:()=>{if(failure==='throw')throw Error('unavailable');return new Promise(()=>{});}});s.relay.connect(id(1));
    assert.doesNotThrow(()=>s.relay.flush(true));s.relay.activity(id(1),'emote');await s.drain();
    s.relay.flush(true);await s.drain();const bodies=await s.bodies();assert.equal(bodies.length,2);assert.equal(bodies[1].dropped,1);assert.equal(bodies[1].events[0].method,'activity');
  }
});

test('forced idle drain delivers observations queued while the previous batch is still in flight',async()=>{
  let release;const held=new Promise(resolve=>release=resolve),s=setup({fetch:(_request,n)=>n===1?held:Promise.resolve(new Response(null,{status:204}))});
  s.relay.connect(id(1));s.relay.flush(true);s.relay.activity(id(1),'emote');s.relay.presence([]);s.relay.flush(true);
  assert.equal(s.requests.length,1);release(new Response(null,{status:204}));await s.drain();const bodies=await s.bodies();
  assert.equal(bodies.length,2);assert.deepEqual(bodies[1].events.map(event=>event.method),['activity','presence']);assert.notEqual(bodies[0].id,bodies[1].id);
});

test('no analytics binding has no delivery, timer, or promise dependency',()=>{
  let waits=0;const relay=createGrowthRelay({waitUntil(){waits++;}});relay.connect(id(1));relay.activity(id(1),'move');relay.presence([]);relay.flush(true);assert.equal(waits,0);
});
