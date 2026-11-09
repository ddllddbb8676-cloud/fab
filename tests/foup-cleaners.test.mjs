import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {createFoupCleaners,FOUP_CLEANER_RULES} from '../server/foup-cleaners.js';
import {createFoupStore,FOUP_RESTOCK_SECONDS} from '../src/foup-play.js';
import {ports,machines,isBlocked} from '../src/layout.js';
import {canCatch} from '../src/safety-team.js';
import {isFoupHitTarget} from '../src/safety-dizzy.js';

function fixture({age=0,count=6,roomLoop=false}={}){
  const r=createRoom({random:()=>.42,now:()=>Date.parse('2026-11-09T13:30:00+09:00')});
  r.residents.update=()=>{};
  for(const p of [...r.residents.people,...r.safety.people])Object.assign(p,{hidden:true,path:[],nextThink:1e9});
  const debris=[];
  for(let i=0;i<count;i++){
    const f=[...r.store.records.values()].find(f=>f.mode==='port');
    r.store.launch(f,{x:0,y:.225,z:12+i*4},{x:0,y:0,z:0},{shatter:true});r.store.step(.1);debris.push(f);
  }
  const crew=r.residents.people.filter(p=>p.role==='breaker').slice(0,3);
  crew.forEach((p,i)=>Object.assign(p,{x:0,y:0,z:[7,41,-10][i],hidden:false,phase:'idle',path:[],posture:'stand',targetId:null,vehicleId:null,wait:1e9}));
  r.join('observer',{optOut:true,hasEntered:true,brokenCount:9,repairedCount:4});
  let clock=0,enabled=true;const cues=[];
  const cleaner=roomLoop?r.foupCleaners:createFoupCleaners({store:r.store,residents:r.residents,players:r.players,now:()=>clock,canRun:()=>enabled,onCue:kind=>cues.push(kind),rules:{...FOUP_CLEANER_RULES,age,scan:.2}});
  function step(seconds){for(let i=0;i<Math.round(seconds/.1);i++){
    clock+=.1;if(roomLoop){for(const p of r.players.values())p.lastSeen=r.time;r.step(.1);}else{r.store.step(.1);cleaner.update(.1);}
  }}
  function until(condition,max=30){for(let i=0;i<max*10&&!condition();i++)step(.1);assert.ok(condition(),'condition completes');}
  return {r,crew,debris,cleaner,cues,step,until,setEnabled:v=>enabled=v};
}

test('two existing NPCs walk and sweep old debris, recycle the same carriers and award nobody chips',()=>{
  const s=fixture({age:60}),ids=[...s.r.store.records.keys()],before=s.r.profile('observer');
  assert.equal(FOUP_CLEANER_RULES.workers,2);assert.equal(FOUP_CLEANER_RULES.age,60);
  s.step(59);assert.equal(s.cleaner.state.active,0);assert.ok(s.debris.every(r=>r.mode==='broken'));
  const phases=new Set();let active=0,moved=0;
  for(let i=0;i<400&&s.cleaner.state.completed<4;i++){
    const prior=s.crew.map(p=>({x:p.x,z:p.z}));s.step(.1);active=Math.max(active,s.cleaner.state.active);
    s.crew.forEach((p,i)=>{phases.add(p.phase);assert.equal(isBlocked(p.x,p.z,.295),false);const d=Math.hypot(p.x-prior[i].x,p.z-prior[i].z);assert.ok(d<.23,'normal walking, never a teleport');moved+=d;});
  }
  assert.equal(active,2);assert.ok(moved>5);assert.ok(phases.has('clean-walk'));assert.ok(phases.has('cleaning'));assert.ok(s.cues.includes('sweep'));assert.ok(s.cleaner.state.completed>=4);
  s.step(13);assert.ok(s.debris.some(r=>r.mode==='port'));assert.deepEqual([...s.r.store.records.keys()],ids);assert.equal(s.r.residents.people.length,30);
  assert.deepEqual(s.r.profile('observer'),before);
});

test('a player takes over an NPC sweep immediately, completes it once and receives only the existing two chips',()=>{
  const s=fixture({roomLoop:true,count:1});s.until(()=>s.debris[0].cleaner,85);
  const f=s.debris[0],npc=s.crew.find(p=>p.id===f.cleaner),chips=s.r.wallet('observer').chips;assert.ok(npc);assert.equal(npc.phase,'cleaning');
  assert.equal(s.r.residents.reserveCart(npc),false);assert.equal(s.r.residents.beginSafetyLap(npc),false);assert.equal(isFoupHitTarget(npc),false);
  assert.equal(canCatch({id:'safety:0',role:'safety-red',x:npc.x,z:npc.z,y:0},npc,1e9),false);
  s.r.pose('observer',{x:f.x,y:0,z:f.z-.8,heading:0,speed:0,posture:'stand',hidden:false});
  assert.ok(s.r.command('observer','clean',{id:f.id,breakSeq:f.breakSeq}).ok);assert.equal(f.cleaner,'observer');assert.equal(npc.cleanTask,undefined);assert.equal(npc.phase,'idle');
  s.step(3.3);assert.equal(f.mode,'cleared');assert.equal(s.r.wallet('observer').chips,chips+2);assert.equal(s.cleaner.state.completed,0);
  assert.equal(s.r.command('observer','clean',{id:f.id,breakSeq:f.breakSeq}).ok,false);s.step(13);assert.equal(f.mode,'port');assert.equal(s.r.wallet('observer').chips,chips+2);
});

test('new spills, golden event debris, player cleanup and nearby players are never taken',()=>{
  for(const kind of ['new','gold','claimed','nearby']){
    const s=fixture({age:kind==='new'?60:0,count:1}),f=s.debris[0];
    if(kind==='gold')f.gold={eventId:'gold:test',expiresAt:1e15};
    if(kind==='claimed'){f.damageAge=2;assert.ok(s.r.store.beginCleanup(f.id,'visitor:busy',f.breakSeq));f.cleanProgress=.35;}
    if(kind==='nearby')Object.assign(s.r.players.get('observer'),{x:f.x,y:0,z:f.z-2,hidden:false});
    s.step(15);assert.equal(s.cleaner.state.active,0,kind);assert.equal(s.cleaner.state.completed,0,kind);assert.equal(f.mode,'broken',kind);
    if(kind==='claimed'){assert.equal(f.cleaner,'visitor:busy');assert.equal(f.cleanProgress,.35);}
  }
});

test('event pause releases the job and lock, stops work, and resumes after the event without duplicate cargo',()=>{
  const s=fixture({count:1});s.until(()=>s.debris[0].cleaner);s.step(.5);const f=s.debris[0],ids=[...s.r.store.records.keys()];
  s.setEnabled(false);s.cleaner.update(0);assert.equal(s.cleaner.state.active,0);assert.equal(f.cleaner,null);assert.equal(f.cleanProgress,0);
  assert.ok(s.crew.every(p=>!p.cleanTask));s.step(30);assert.equal(f.mode,'broken');assert.equal(s.cleaner.state.completed,0);
  s.setEnabled(true);s.until(()=>f.mode==='cleared');s.step(13);assert.equal(f.mode,'port');assert.equal(s.cleaner.state.completed,1);assert.deepEqual([...s.r.store.records.keys()],ids);
});

test('an approaching player makes the cleaner yield before touching their spill',()=>{
  const s=fixture({count:1});s.until(()=>s.cleaner.state.active===1);assert.equal(s.cleaner.state.jobs[0].phase,'clean-walk');
  const f=s.debris[0];Object.assign(s.r.players.get('observer'),{hidden:false,x:f.x,y:0,z:f.z+2});s.step(.1);
  assert.equal(s.cleaner.state.active,0);assert.equal(f.mode,'broken');assert.equal(f.cleaner,null);assert.ok(s.crew.every(p=>!p.cleanTask));
});

test('NPCs doing another task, carrying, dizzy, caught or seated cannot be assigned to cleanup',()=>{
  const s=fixture({count:0}),p=s.crew[0],base=structuredClone(p);
  for(const patch of [{role:'repairer'},{role:'resting'},{phase:'repair'},{phase:'work-walk'},{targetId:0},{vehicleId:0},{cartTask:true},{cleanTask:true},{dizzyLeft:1},{caughtLeft:1},{penalty:3},{posture:'sit'},{hidden:true}]){
    Object.assign(p,base,patch);assert.equal(s.r.residents.reserveCleanup(p),false,JSON.stringify(patch));for(const key of Object.keys(patch))if(!(key in base))delete p[key];
  }
  Object.assign(p,base);const f=[...s.r.store.records.values()].find(r=>r.mode==='port');s.r.store.pickup(f.id,p.id);assert.equal(s.r.residents.reserveCleanup(p),false);
});

test('restart during an NPC sweep restores debris without a stranded cleanup lock or extra identities',()=>{
  const s=fixture({count:1});s.until(()=>s.debris[0].cleaner);s.step(1);
  const saved=s.r.store.checkpoint(),next=createRoom();next.restoreFoups(saved);const f=next.store.records.get(s.debris[0].id);
  assert.equal(f.mode,'broken');assert.equal(f.cleaner,null);assert.equal(f.cleanProgress,0);assert.equal(next.foupCleaners.state.active,0);
  assert.deepEqual([...next.store.records.keys()].sort(),[...s.r.store.records.keys()].sort());assert.equal(f.breakSeq,s.debris[0].breakSeq);
});

test('cleaned FOUPs refill the least supplied working bays and spread across tools instead of all returning to their original bay',()=>{
  const chosen=[0,9,17],initial=chosen.flatMap(b=>ports.filter(p=>machines[p.machineId].bayId===b).slice(0,6).map(p=>p.id));
  const store=createFoupStore({ports,initialPortIds:initial}),rows=[...store.records.values()].filter(r=>machines[ports.find(p=>p.id===r.portId).machineId].bayId!==0);
  const home=initial[0];store.synchronize(rows.map(r=>({...r,mode:'broken',portId:null,original:false,homePortId:home,breakSeq:1,damageAge:2,cleaner:null})),null);
  function recycle(r){assert.ok(store.beginCleanup(r.id,'cleaner',1));r.cleanProgress=1;assert.ok(store.finishCleanup(r.id,'cleaner',1));for(let i=0;i<(FOUP_RESTOCK_SECONDS+.2)*10;i++)store.step(.1);}
  const bayOf=r=>machines[ports.find(p=>p.id===r.portId).machineId].bayId;
  recycle(rows[0]);recycle(rows[1]);assert.deepEqual([bayOf(rows[0]),bayOf(rows[1])].sort((a,b)=>a-b),[9,17]);
  for(const r of rows.slice(2))recycle(r);assert.ok(rows.every(r=>r.mode==='port'));assert.equal(store.records.size,18);
  for(const bay of chosen)assert.equal([...store.records.values()].filter(r=>bayOf(r)===bay).length,6);
});
