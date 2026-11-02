import test from 'node:test';
import assert from 'node:assert/strict';
import {rankVisitors} from '../src/leaderboard.js';
import {actorPacket} from '../src/shared-protocol.js';
import {createRoom} from '../server/room-engine.js';
const packet=(id,n,role='visitor')=>actorPacket({id,role,x:0,y:0,z:0,heading:0,brokenCount:n});

test('top five mixes resident and visitor records and hides zero-count people',()=>{
  const people=[packet('resident:0',9,'breaker'),packet('safety:0',8,'safety-red'),...Array.from({length:7},(_,i)=>packet(`human:${i}`,i,i===6?'safety-orange':'visitor'))];
  const roster=people.map(p=>[p[0],p[0]+' 이름',p[13]]),ranked=rankVisitors(people,roster);
  assert.deepEqual(ranked.map(p=>p.brokenCount),[9,8,6,5,4]);assert.equal(ranked[0].name,'resident:0 이름');
  assert.ok(rankVisitors(people,roster,100).every(p=>p.brokenCount>0));
  assert.deepEqual(rankVisitors(people,[]),[]);
});

test('ties remain stable when packet order changes, and reconnect restores identity and ranking score',()=>{
  const r=createRoom();r.join('visitor:a');r.join('visitor:b');r.players.get('visitor:a').brokenCount=17;r.players.get('visitor:b').brokenCount=17;
  const before=rankVisitors(r.snapshot(true).people,r.roster());
  assert.deepEqual(rankVisitors([...r.snapshot(true).people].reverse(),r.roster()),before);
  const profile=r.profile('visitor:a');r.remove('visitor:a');r.join('visitor:a',profile);
  assert.deepEqual(rankVisitors(r.snapshot(true).people,r.roster()),before);
  r.remove('visitor:a');r.join('visitor:a');assert.equal(rankVisitors(r.snapshot(true).people,r.roster()).find(p=>p.id==='visitor:a'),undefined);
});

test('all 34 residents start with 8 to 11 simulated records and live work adds only completed actions',()=>{
  const room=createRoom({random:()=>.42}),people=[...room.residents.people,...room.safety.people];
  assert.equal(people.length,34);assert.ok(people.every(p=>p.brokenCount>=8&&p.brokenCount<=11));
  const actor=room.residents.people.find(p=>p.role==='breaker'),initial=actor.brokenCount;
  const machine=room.residents.people.find(p=>p.role==='breaker')?.index;
  actor.targetId=machine;actor.phase='press';actor.time=1.34;actor.path=[];room.residents.update(.05);
  assert.equal(actor.brokenCount,initial+1);assert.equal(room.destruction.isDestroyed(machine),true);
  assert.equal(rankVisitors(room.snapshot(true).people,room.roster()).length,5);
});
