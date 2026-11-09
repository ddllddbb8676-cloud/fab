import test from 'node:test';
import assert from 'node:assert/strict';
import {createSafetyThrowDemo,SAFETY_DEMO_MIN_INTERVAL} from '../server/safety-throw-demo.js';
import {createRoom} from '../server/room-engine.js';

function scene(){
  let time=3,paused=false;
  const actor={id:'resident:0',role:'thrower',phase:'carry',x:0,y:0,z:0};
  const guards=[{id:'safety:0',role:'safety-red',phase:'patrol',x:3.5,y:0,z:0}];
  const viewers=[{x:0,z:-3,hidden:false}];
  const demo=createSafetyThrowDemo({now:()=>time,random:()=>0,guards:()=>guards,viewers:()=>viewers,paused:()=>paused});
  return {actor,guards,viewers,demo,setTime:v=>time=v,setPaused:v=>paused=v};
}

test('nearby NPC throws demonstrate the effect at most once per 90 seconds across the whole room',()=>{
  const h=scene();assert.deepEqual(h.demo.aim(h.actor),{x:3.5,z:0});
  assert.equal(h.demo.aim({...h.actor,id:'resident:1'}),null);
  h.setTime(3+SAFETY_DEMO_MIN_INTERVAL-.01);assert.equal(h.demo.aim(h.actor),null);
  h.setTime(3+SAFETY_DEMO_MIN_INTERVAL);assert.deepEqual(h.demo.aim(h.actor),{x:3.5,z:0});
});

test('NPC demonstration needs an audience, avoids events and never interrupts a guard chasing a user',()=>{
  for(const change of [h=>h.viewers.splice(0),h=>h.viewers[0].hidden=true,h=>h.viewers[0].z=40,h=>h.setPaused(true),h=>h.guards[0].chasingId='visitor:someone',h=>h.guards[0].dizzyLeft=1,h=>h.guards[0].dizzyReadyAt=10,h=>h.guards[0].phase='event-rest',h=>h.guards[0].x=10,h=>h.actor.penalty=3]){
    const h=scene();change(h);assert.equal(h.demo.aim(h.actor),null);
  }
  const h=scene();h.guards[0].chasingId='resident:0';assert.ok(h.demo.aim(h.actor));
});

test('waiting throwers may fetch another existing FOUP only occasionally and near a visible demonstration opportunity',()=>{
  const h=scene();assert.equal(h.demo.refresh(h.actor),false);
  h.setTime(30);assert.ok(h.demo.refresh(h.actor));assert.equal(h.demo.refresh({...h.actor,id:'resident:1'}),false);
  h.setTime(120);h.setPaused(true);assert.equal(h.demo.refresh(h.actor),false);
  h.setPaused(false);h.guards[0].x=7;assert.equal(h.demo.refresh(h.actor),false);
  h.guards[0].x=5.5;assert.ok(h.demo.refresh(h.actor));assert.equal(h.demo.aim(h.actor),null,'preparation range is wider than an actual safe throw');
});

test('a real resident uses its carried FOUP to hit a safety NPC and shares angry/dizzy without new cargo or user rewards',()=>{
  const room=createRoom({random:()=>.5,now:()=>Date.parse('2026-11-09T13:30:00+09:00')});
  for(const p of room.residents.people)p.cartTask=true;
  for(const g of room.safety.people)Object.assign(g,{hidden:true,path:[],nextThink:1e9});
  room.join('observer',{optOut:true,hasEntered:true});room.pose('observer',{x:0,y:0,z:-3,heading:0,posture:'stand',hidden:false});
  const tick=n=>{for(let i=0;i<n;i++)room.step(.1);};tick(40);
  const actor=room.residents.people.find(p=>p.role==='thrower'),guard=room.safety.people[0];
  Object.assign(guard,{x:3.5,y:0,z:0,phase:'patrol',hidden:false});
  Object.assign(actor,{x:0,y:0,z:0,phase:'carry',posture:'stand',hidden:false,path:[],time:1.25,targetId:null,homePortId:null,wait:0});delete actor.cartTask;
  const foup=[...room.store.records.values()].find(r=>r.mode==='port');assert.ok(room.store.pickup(foup.id,actor.id));actor.recordId=foup.id;
  const count=room.store.records.size,wallet=structuredClone(room.wallet('observer')),throws=room.residents.state.actions.throws;
  tick(1);assert.equal(foup.mode,'flying');assert.ok(foup.vx>3);assert.ok(Math.abs(foup.vz)<.001,'NPC aims at safety instead of its normal open-aisle heading');
  tick(10);assert.equal(foup.mode,'broken');assert.equal(guard.emote,'angry');assert.ok(guard.dizzyLeft>1.5);
  assert.equal(room.residents.state.actions.throws,throws+1);assert.equal(room.store.records.size,count);assert.deepEqual(room.wallet('observer'),wallet);
  const row=room.snapshot(true).people.find(p=>p[0]===guard.id);assert.equal(row[18],'angry');assert.ok(row[24]>0);
});
