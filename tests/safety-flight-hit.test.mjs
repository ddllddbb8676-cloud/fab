import test from 'node:test';
import assert from 'node:assert/strict';
import {firstSafetyFlightHit,SAFETY_FLIGHT_RADIUS} from '../server/safety-flight-hit.js';
import {createFoupStore} from '../src/foup-play.js';
import {createRoom} from '../server/room-engine.js';
import {machines,isBlocked} from '../src/layout.js';

const guard=(id,z,x=0)=>({id,role:'safety-red',x,y:0,z,phase:'patrol',hidden:false});
const point=(z,y=1,x=0)=>({x,y,z});
const thrown={shatter:true,throwerId:'thrower'};

test('a swept flight hits the first safety body even when both frame endpoints miss it',()=>{
  const near=guard('near',2),far=guard('far',4);
  const hit=firstSafetyFlightHit(thrown,point(0),point(6),[far,near]);
  assert.equal(hit.guardId,'near');assert.ok(Math.abs(hit.point.z-(2-SAFETY_FLIGHT_RADIUS))<1e-9);assert.equal(hit.point.y,1);
  assert.equal(firstSafetyFlightHit(thrown,point(6),point(0),[near,far]).guardId,'far','reversed flight still finds its first contact');
});

test('a forgiving body width catches edge grazes but not sideways misses or high overhead flights',()=>{
  assert.ok(firstSafetyFlightHit(thrown,point(0),point(3),[guard('edge',1.5,.60)]));
  assert.equal(firstSafetyFlightHit(thrown,point(0),point(3),[guard('miss',1.5,.64)]),null);
  assert.equal(firstSafetyFlightHit(thrown,point(0,2.1),point(3,2.1),[guard('under',1.5)]),null);
  const falling=firstSafetyFlightHit(thrown,point(1.5,3),point(1.5,.5),[guard('below',1.5)]);
  assert.ok(falling);assert.ok(Math.abs(falling.point.y-1.75)<1e-8);
  assert.equal(firstSafetyFlightHit(thrown,point(0,3),point(3,1.8),[guard('under',1.5)]),null,'horizontal and vertical contacts must occur at the same time');
});

test('drops, the thrower, civilians, hidden or riding guards and paused safety are not flight targets',()=>{
  assert.equal(firstSafetyFlightHit({shatter:false},point(0),point(3),[guard('a',1.5)]),null);
  for(const change of [{id:'thrower'},{role:'visitor'},{hidden:true},{y:2.16},{phase:'riding'},{phase:'cart-riding'},{phase:'climb'},{phase:'event-rest'}]){
    assert.equal(firstSafetyFlightHit(thrown,point(0),point(3),[{...guard('a',1.5),...change}]),null,JSON.stringify(change));
  }
  assert.ok(firstSafetyFlightHit(thrown,point(0),point(3),[{...guard('immune',1.5),dizzyLeft:1,dizzyReadyAt:99}]),'immunity stops another stun, not the physical FOUP collision');
});

test('a flight cannot hit a safety guard through equipment',()=>{
  const m=machines[0],g={...guard('behind',m.z),x:m.x};
  assert.equal(firstSafetyFlightHit(thrown,{x:m.x-8,y:1,z:m.z},{x:m.x+8,y:1,z:m.z},[g]),null);
  // Real walkable points on opposite sides of a cabinet, beyond its front/back.
  const b=m.walkBounds.find(b=>b.part==='cabinet'),z=(b.minZ+b.maxZ)/2;
  const from={x:b.minX-.32,y:1,z},to={x:b.maxX+.32,y:1,z};
  assert.equal(isBlocked(from.x,z,.295),false);assert.equal(isBlocked(to.x,z,.295),false);
  assert.equal(firstSafetyFlightHit(thrown,from,to,[{...g,x:to.x,z}]),null);
});

test('the physics store shatters a fast airborne FOUP once at contact and preserves its identity',()=>{
  const g=guard('target',1.5);let shattered=0,contact=null;
  const store=createFoupStore({ports:[],hitFlight:(r,a,b)=>firstSafetyFlightHit(r,a,b,[g]),onShatter:(r,id)=>{shattered++;contact=id;}});
  const r=store.adopt('local-fixture',point(0,.225));store.pickup(r.id,'thrower');
  store.launch(r,point(0,.9),{x:0,y:3.1,z:150},{shatter:true});
  assert.equal(r.throwerId,'thrower');store.step(.016);
  assert.equal(r.mode,'broken');assert.equal(contact,g.id);assert.equal(shattered,1);assert.equal(r.breakSeq,1);
  assert.ok(Math.abs(r.z-(g.z-SAFETY_FLIGHT_RADIUS))<1e-7);assert.equal(r.y,.035);assert.equal(r.throwerId,undefined);assert.equal(store.records.size,1);
  for(let i=0;i<25;i++)store.step(.1);assert.equal(shattered,1);assert.equal(r.breakSeq,1);
});

function setup(human){
  const r=createRoom({random:()=>.5,now:()=>Date.parse('2026-11-09T13:45:00+09:00')});r.residents.update=()=>{};
  for(const p of r.safety.people)Object.assign(p,{hidden:true,path:[],nextThink:1e9});
  r.join('thrower',{optOut:true,hasEntered:true});r.pose('thrower',{x:0,y:0,z:0,heading:0,posture:'stand',hidden:false});r.players.get('thrower').safeUntil=1e9;
  let g=r.safety.people[0];if(human){r.join('guard',{optOut:true,hasEntered:true,brokenCount:17,repairedCount:9});g=r.players.get('guard');}
  Object.assign(g,{x:0,y:0,z:1.5,hidden:false,role:'safety-orange',phase:'patrol',nextThink:1e9,path:[]});
  const f=[...r.store.records.values()].find(f=>f.mode==='port');r.store.launch(f,point(0,.225),{x:0,y:0,z:0},{shatter:false});r.store.step(.1);
  const tick=seconds=>{for(let i=0;i<Math.round(seconds/.05);i++)r.step(.05);};
  return {r,g,f,tick};
}

test('ordinary player throws hit both NPC and human safety before the old landing distance, sharing angry and two-second recovery',()=>{
  for(const human of [false,true]){
    const {r,g,f,tick}=setup(human),wallet=human?structuredClone(g.wallet):null,chips=r.wallet('thrower').chips;
    assert.ok(r.command('thrower','pickup',{id:f.id}).ok);assert.ok(r.command('thrower','throw').ok);
    tick(.2);assert.equal(f.mode,'broken','hit around 1.5m, without waiting for the ~4m landing');assert.ok(g.dizzyLeft>1.85);assert.equal(g.emote,'angry');
    assert.ok(f.z<1.5);assert.equal(r.wallet('thrower').chips,chips+1,'only the existing throw reward');
    const row=r.snapshot(true).people.find(p=>p[0]===g.id);assert.equal(row[18],'angry');assert.ok(row[24]>0);
    const readyAt=g.dizzyReadyAt,until=g.dizzyUntil;
    const second=[...r.store.records.values()].find(f=>f.mode==='port');r.store.launch(second,point(0,.9),{x:0,y:3.1,z:40},{shatter:true});tick(.05);
    assert.equal(second.mode,'broken');assert.equal(g.dizzyUntil,until);assert.equal(g.dizzyReadyAt,readyAt,'repeat contact does not extend stun or immunity');
    tick(2);assert.equal(g.dizzyLeft,0);
    if(human){assert.deepEqual(g.wallet,wallet);assert.equal(g.brokenCount,17);assert.equal(g.repairedCount,9);assert.equal(g.penalty,0);}
    const saved=r.store.checkpoint(),restored=createRoom({random:()=>.5});restored.restoreFoups(saved);
    assert.equal(restored.store.records.get(f.id).mode,'broken');assert.equal(restored.store.records.get(f.id).breakSeq,1);
    assert.equal(JSON.stringify(saved).includes('thrower'),false,'transient throw ownership is not stored');
  }
});

test('a human safety thrower is not hit by their own FOUP when it leaves their hands',()=>{
  const {r,f,tick,g}=setup(false);g.hidden=true;
  const p=r.players.get('thrower');p.role='safety-red';
  assert.ok(r.command(p.id,'pickup',{id:f.id}).ok);assert.ok(r.command(p.id,'throw').ok);
  tick(.2);assert.equal(f.mode,'flying');assert.equal(p.dizzyLeft,0);tick(1);assert.equal(p.dizzyLeft,0);
});
