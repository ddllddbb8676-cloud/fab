import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,SAFETY_DUTY} from '../server/room-engine.js';
import {isSafety} from '../src/safety-team.js';
import {sessionToken,sessionId,sessionCookie,newSessionToken,createProfileStore} from '../server/player-profiles.js';

function quiet(room){for(const p of room.residents.people){p.hidden=true;p.wait=1e9;}for(const g of room.safety.people)g.hidden=true;}
function wait(room,seconds){for(let i=0;i<Math.ceil(seconds/.05);i++){if(i%100===0)for(const p of room.players.values())room.pose(p.id,{...p});room.step(.05);}}
function enter(room,id,z=50){room.join(id);room.pose(id,{x:0,y:0,z,heading:0,posture:'stand',hidden:false});return room.players.get(id);}

test('three distinct captures including NPCs end one duty and hand over later without moving or resetting scores',()=>{
  const notices=[],r=createRoom({random:()=>.42,onCatch:e=>notices.push(e)});quiet(r);
  const a=enter(r,'a'),b=enter(r,'b',30),original=a.name;a.brokenCount=8;a.repairedCount=3;
  wait(r,SAFETY_DUTY.warmup+.1);assert.equal(isSafety(a.role),true);assert.equal(b.role,'visitor');
  const targets=r.residents.people.filter(p=>p.role==='thrower');
  function catchNpc(p){Object.assign(p,{x:0,z:50.3,y:0,hidden:false,penalty:0,safeUntil:0,phase:'idle',path:[],wait:1e9});r.step(.05);p.hidden=true;}
  catchNpc(targets[0]);assert.equal(a.safetyCaughtIds.size,1);catchNpc(targets[0]);assert.equal(a.safetyCaughtIds.size,1,'same person is not counted twice');
  for(const p of targets.slice(1))catchNpc(p);
  assert.equal(a.role,'visitor');assert.equal(a.name,original);assert.equal(a.z,50);
  assert.equal(a.brokenCount,8);assert.equal(a.repairedCount,3);assert.equal(notices.at(-1).completed,true);
  assert.equal(notices.at(-1).caught,3);assert.equal(b.role,'visitor');
  wait(r,14);assert.equal(b.role,'visitor');wait(r,1.1);assert.equal(isSafety(b.role),true);
  assert.equal([...r.players.values()].filter(p=>isSafety(p.role)).length,1);
});

test('entry area, hidden visitors, penalties, repair, OHT and held cargo are never chosen for duty',()=>{
  for(const override of [{x:0,z:78.8},{hidden:true},{penalty:3},{phase:'repair'},{phase:'riding'},{phase:'climb'},{phase:'approach'},{carrying:true},{posture:'sit'},{posture:'lie'}]) {
    const r=createRoom();quiet(r);const p=enter(r,'a');p.activeSeconds=100;Object.assign(p,override);
    if(override.carrying){const cargo=[...r.store.records.values()].find(c=>c.mode==='port');r.store.pickup(cargo.id,p.id);}
    for(let i=0;i<310;i++){p.lastSeen=r.time;r.step(.05);}
    assert.equal(p.role,'visitor',JSON.stringify(override));
  }
});

test('saved identity, counters, penalty and position restore across room reconstruction',()=>{
  const stored=[],r=createRoom({onProfileChange:p=>stored.push(p)});quiet(r);
  const p=enter(r,'visitor:test',50);p.brokenCount=12;p.repairedCount=7;p.penalty=2;
  const original=p.name;r.remove(p.id);const saved=stored.at(-1);
  const next=createRoom();assert.equal(next.join(p.id,saved).ok,true);const restored=next.players.get(p.id);
  assert.equal(restored.name,original);assert.equal(restored.brokenCount,12);assert.equal(restored.repairedCount,7);
  assert.equal(restored.penalty,2);assert.equal(restored.z,50);assert.equal(restored.hasEntered,true);
  next.remove(p.id);next.join(p.id);const fresh=next.players.get(p.id);
  assert.equal(fresh.brokenCount,0);assert.equal(fresh.repairedCount,0);assert.equal(fresh.penalty,0);
});

test('refresh resumes an existing safety duty and progress without creating a second user guard',()=>{
  const r=createRoom();quiet(r);const p=enter(r,'visitor:a',40);wait(r,61);
  assert.equal(isSafety(p.role),true);p.safetyCaughtIds.add('resident:1');p.safetyCaughtIds.add('resident:2');
  const saved=r.profile(p.id),next=createRoom();next.join(p.id,saved);
  assert.equal(next.players.get(p.id).name,p.name);assert.equal(next.players.get(p.id).safetyCaughtIds.size,2);
  next.join('visitor:b',{...saved,id:'visitor:b'});
  assert.equal([...next.players.values()].filter(p=>isSafety(p.role)).length,1);
});

test('private cookie gives a stable non-secret public id and durable profile writes survive reload or explicit removal',async()=>{
  const token=newSessionToken(),cookie=sessionCookie(token,'https://fab.semitoon.com');
  assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/Max-Age=31536000/);
  const request=new Request('https://fab.semitoon.com/api/room',{headers:{Cookie:cookie.split(';')[0]}});
  assert.equal(sessionToken(request),token);const id=await sessionId(token);assert.notEqual(id,token);assert.equal(await sessionId(token),id);
  const data=new Map(),storage={get:k=>Promise.resolve(data.get(k)),put:async rows=>{for(const [k,v] of Object.entries(rows))data.set(k,v);},delete:async k=>data.delete(k)};
  const store=createProfileStore(storage);store.save({id,name:'작은 칩',brokenCount:3,repairedCount:2});await store.flush();
  assert.equal((await createProfileStore(storage).get(id)).brokenCount,3);
  store.save({id,name:'작은 칩',brokenCount:4,repairedCount:2});await store.remove(id);await store.flush();assert.equal(await store.get(id),undefined);
});

test('a fast reconnect reads the newest pending profile instead of an older stored score',async()=>{
  const id='visitor:pending',data=new Map([['profile:'+id,{id,brokenCount:1}]]);
  let finishWrite;
  const store=createProfileStore({get:async key=>data.get(key),put:rows=>new Promise(resolve=>{finishWrite=()=>{for(const [key,value] of Object.entries(rows))data.set(key,value);resolve();};}),delete:async key=>data.delete(key)});
  store.save({id,brokenCount:2});assert.equal((await store.get(id)).brokenCount,2);
  const write=store.flush();await Promise.resolve();await Promise.resolve();
  store.save({id,brokenCount:3});assert.equal((await store.get(id)).brokenCount,3);finishWrite();await write;
  assert.equal((await store.get(id)).brokenCount,3,'older in-flight storage writes never replace the pending score');
});
