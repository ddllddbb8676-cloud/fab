import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {isFoupHitTarget,markFoupDizzy} from '../src/safety-dizzy.js';
import {firstFoupFlightHit} from '../server/safety-flight-hit.js';
import {canCatch} from '../src/safety-team.js';
import {actorFromPacket} from '../src/shared-protocol.js';
import {getEmoApproach} from '../src/emo-interaction.js';
import {machines} from '../src/layout.js';

const standing=(id='target')=>({id,role:'visitor',x:0,y:0,z:1.5,heading:0,speed:0,posture:'stand',phase:'idle',hidden:false,targetId:null,vehicleId:null});
function setup(){
  const r=createRoom({random:()=>.5,now:()=>Date.parse('2026-11-09T13:30:00+09:00')});
  const updateResidents=r.residents.update;r.residents.update=()=>{};
  for(const p of [...r.residents.people,...r.safety.people])Object.assign(p,{hidden:true,path:[],wait:1e9,nextThink:1e9});
  for(const id of ['thrower','target']){r.join(id,{optOut:true,hasEntered:true,brokenCount:17,repairedCount:9});Object.assign(r.players.get(id),standing(id),{safeUntil:1e9});}
  const source=r.players.get('thrower'),target=r.players.get('target');source.z=0;
  const tick=seconds=>{for(let i=0;i<Math.round(seconds/.05);i++)r.step(.05);};
  function foupAt(point){const f=[...r.store.records.values()].find(f=>f.mode==='port');r.store.launch(f,{x:point.x,z:point.z,y:.225},{x:0,y:0,z:0},{shatter:false});r.store.step(.1);return f;}
  function toss(){const f=foupAt(source);assert.ok(r.command(source.id,'pickup',{id:f.id}).ok);assert.ok(r.command(source.id,'throw').ok);return f;}
  return {r,source,target,tick,toss,foupAt,updateResidents};
}

test('ordinary standing and walking players share angry/dizzy, recover after two seconds, and keep their records',()=>{
  for(const speed of [0,3.2]){
    const {r,source,target,tick,toss}=setup();target.speed=speed;
    const wallet=structuredClone(target.wallet),count=r.store.records.size,sourceChips=r.wallet(source.id).chips;
    const f=toss();tick(.2);
    assert.equal(f.mode,'broken');assert.ok(f.z<1.5);assert.ok(target.dizzyLeft>1.8);assert.equal(target.emote,'angry');
    assert.equal(source.dizzyLeft,0,'the shooter is immune to their own nearby splash as well as body contact');
    assert.ok(Math.hypot(source.x-f.x,source.z-f.z)<1.65,'this impact actually splashes the shooter position');
    const position={x:target.x,y:target.y,z:target.z};
    r.pose(target.id,{x:0,y:0,z:8,heading:1,speed:3.2,hidden:false,posture:'stand'});
    assert.deepEqual({x:target.x,y:target.y,z:target.z},position);assert.equal(target.speed,0);
    assert.equal(r.command(target.id,'pickup',{id:f.id}).ok,false);
    const shared=actorFromPacket(r.snapshot(true).people.find(p=>p[0]===target.id));
    assert.equal(shared.role,'visitor');assert.equal(shared.emote,'angry');assert.ok(shared.dizzyLeft>0);
    tick(2);assert.equal(target.dizzyLeft,0);assert.equal(target.emote,'');
    r.pose(target.id,{x:0,y:0,z:8,heading:1,speed:3.2,hidden:false,posture:'stand'});assert.equal(target.z,8);
    const saved=r.profile(target.id);assert.deepEqual(saved.wallet,wallet);assert.equal(saved.brokenCount,17);assert.equal(saved.repairedCount,9);assert.equal(saved.penalty,0);
    assert.equal(r.wallet(source.id).chips,sourceChips+1);assert.equal(r.store.records.size,count);
    for(const key of ['dizzyLeft','dizzyReadyAt','dizzyUntil'])assert.equal(key in saved,false);
  }
});

test('a standing player holding a FOUP keeps that exact cargo through the hit and can throw it after recovery',()=>{
  const {r,target,tick,toss,foupAt}=setup(),held=foupAt(target);
  assert.ok(r.command(target.id,'pickup',{id:held.id}).ok);toss();tick(.2);
  assert.ok(target.dizzyLeft>0);assert.equal(r.store.getCarried(target.id),held);assert.equal(held.owner,target.id);
  assert.equal(r.command(target.id,'throw').ok,false);tick(2);
  assert.equal(r.store.getCarried(target.id),held);assert.ok(r.command(target.id,'throw').ok);
});

test('working, work approach, carts, seats, riders, entry and rest areas are protected for every role',()=>{
  const busy=[...['approach','press','repair','cleaning','climb','riding','cart-pulling','cart-riding','work-walk','pickup-walk','retrieve','carry','return-plan','return-walk','align','caught-lap','event-rest'].map(phase=>({phase})),
    {targetId:0},{vehicleId:0},{cartTask:true},{lap:{}},{cleanTargetId:'spill'},{caughtLeft:.5},{catchLeft:.5},{posture:'sit'},{posture:'lie'},{hidden:true},{y:.8},{z:78}];
  for(const role of ['visitor','breaker','repairer','safety-orange'])for(const override of busy){
    const actor={...standing(),role,...override},before=structuredClone(actor);
    assert.equal(isFoupHitTarget(actor),false,JSON.stringify({role,...override}));
    assert.equal(markFoupDizzy(actor,actor,5),false);assert.deepEqual(actor,before,'protected work state must not be touched');
    assert.equal(firstFoupFlightHit({shatter:true,throwerId:'source'},{x:0,y:1,z:0},{x:0,y:1,z:3},[actor]),null);
  }
});

test('a protected worker does not absorb a thrown FOUP meant for a walker farther away',()=>{
  const worker={...standing('worker'),phase:'repair'},walker={...standing('walker'),z:2.7,speed:3};
  const hit=firstFoupFlightHit({shatter:true,throwerId:'source'},{x:0,y:1,z:0},{x:0,y:1,z:5},[worker,walker]);
  assert.equal(hit.targetId,'walker');assert.ok(hit.point.z>worker.z);
});

test('an actual equipment repair keeps its lease and finishes normally through nearby thrown debris',()=>{
  const {r,target,tick,foupAt}=setup(),m=machines[350],destination=getEmoApproach(m).destination;
  r.destruction.trigger(m.id);Object.assign(target,destination);
  assert.ok(r.command(target.id,'claim',{id:m.id,kind:'repair'}).ok);
  assert.ok(r.command(target.id,'repair',{id:m.id}).ok);const chips=r.wallet(target.id).chips;
  const f=foupAt(destination);r.store.launch(f,{...destination,y:.5},{x:0,y:0,z:0},{shatter:true});tick(.5);
  assert.equal(f.mode,'broken');assert.equal(target.dizzyLeft,0);assert.equal(target.phase,'repair');assert.equal(target.targetId,m.id);
  tick(4.5);assert.ok(r.command(target.id,'finish',{id:m.id}).ok);assert.equal(r.destruction.isDestroyed(m.id),false);
  assert.equal(target.repairedCount,10);assert.equal(r.wallet(target.id).chips,chips+3);
});

test('normal NPC walkers freeze without losing their path, cannot be recruited for cart recovery, then resume',()=>{
  const {r,target,tick,toss,updateResidents}=setup();target.hidden=true;
  for(const npc of r.residents.people)npc.cartTask=true;
  const npc=r.residents.people.find(p=>p.role==='thrower');
  Object.assign(npc,standing(npc.id),{role:'thrower',phase:'patrol',path:[{x:0,z:8}],time:0,wait:1e9});delete npc.cartTask;
  r.residents.update=updateResidents;toss();tick(.2);assert.ok(npc.dizzyLeft>0);assert.equal(npc.emote,'angry');
  const position={x:npc.x,z:npc.z},path=structuredClone(npc.path);
  assert.equal(r.residents.reserveCart(npc),false);tick(1.5);
  assert.deepEqual({x:npc.x,z:npc.z},position);assert.deepEqual(npc.path,path);assert.equal(npc.speed,0);
  tick(1);assert.equal(npc.dizzyLeft,0);assert.ok(npc.z>position.z+.1);assert.equal(npc.phase,'patrol');assert.ok(npc.path.length);
});

test('ground splash affects ordinary idle people but leaves busy people unchanged; repeated hits do not extend it',()=>{
  const {r,target,tick}=setup();target.z=4;target.x=.8;
  r.join('busy',{optOut:true});const busy=r.players.get('busy');Object.assign(busy,standing(busy.id),{z:4,x:-.8,phase:'cart-pulling',safeUntil:1e9});
  const f=[...r.store.records.values()].find(f=>f.mode==='port');r.store.launch(f,{x:0,y:.3,z:4},{x:0,y:0,z:0},{shatter:true});tick(.2);
  assert.equal(f.mode,'broken');assert.ok(target.dizzyLeft>0);assert.equal(busy.dizzyLeft,0);
  const until=target.dizzyUntil,ready=target.dizzyReadyAt,seq=target.emoteSeq;tick(2);
  assert.equal(markFoupDizzy(target,target,r.time),false);assert.equal(target.dizzyUntil,until);assert.equal(target.emoteSeq,seq);
  tick(8);assert.ok(r.time>=ready);assert.ok(markFoupDizzy(target,target,r.time));
});

test('an already dizzy person cannot also receive a safety capture until the two-second reaction ends',()=>{
  const actor=standing(),guard={...standing('guard'),role:'safety-red',z:1.8};
  assert.ok(canCatch(guard,actor,0));assert.ok(markFoupDizzy(actor,actor,0));assert.equal(canCatch(guard,actor,1),false);
  actor.dizzyLeft=0;assert.ok(canCatch(guard,actor,2));
});
