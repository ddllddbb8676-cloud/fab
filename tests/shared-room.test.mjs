import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {machines,ports,TOOL_FRONT} from '../src/layout.js';
import {getEmoApproach} from '../src/emo-interaction.js';
import {boardingMachine,boardingApproach,NO_LOADPORT_MESSAGE} from '../src/play-actions.js';
import {createFoupStore} from '../src/foup-play.js';
import {initialSharedPorts,actorFromPacket} from '../src/shared-protocol.js';

function fixture(){const room=createRoom({random:()=>.42});for(const p of room.residents.people)p.wait=1e9;room.join('a');room.join('b');return room;}
function move(room,id,p){assert.equal(room.pose(id,{x:p.x,y:p.y??0,z:p.z,heading:0,speed:0,posture:'stand',hidden:false}),true);}
function step(room,seconds){for(let i=0;i<Math.ceil(seconds/.05);i++)room.step(.05);}

test('34 automated characters reserve capacity: 66 visitors enter, the 67th waits, and leaving frees one slot',()=>{
  const room=createRoom();assert.equal(room.roster().length,34);
  assert.equal(room.residents.people.filter(p=>p.role==='repairer').length,2);
  assert.equal(room.residents.people.filter(p=>p.role==='breaker').length,13);
  for(let i=0;i<66;i++)assert.equal(room.join(`p${i}`).ok,true);
  const rejected=room.join('overflow');assert.equal(rejected.error,'full');assert.match(rejected.message,/100명/);
  const names=room.roster().map(r=>r[1]);
  assert.equal(names.length,100);assert.equal(new Set(names).size,100);assert.ok(names.every(n=>[...n].length<=7));
  assert.equal(room.players.has('overflow'),false);
  room.remove('p0');assert.equal(room.snapshot().people.length,99);
  assert.equal(room.join('next').ok,true);assert.equal(room.snapshot().count,66);
  assert.equal(room.snapshot().people.length,100);assert.equal(room.join('overflow-again').error,'full');
});

test('positions and posture become the same shared snapshot for every reader',()=>{
  const room=fixture();move(room,'a',{x:0,z:70});room.pose('a',{x:0,y:0,z:70,heading:1,speed:0,posture:'lie',hidden:false});
  const state=room.snapshot(true);const a=state.people.map(actorFromPacket).find(p=>p.id==='a');assert.equal(a.z,70);assert.equal(a.posture,'lie');assert.equal(a.hidden,false);
  assert.deepEqual(state,room.snapshot(true));assert.equal(state.people.length,36);
});

test('exclusive equipment claim requires contact and a hold before damage; repairs take time',()=>{
  const r=fixture(),id=350,destination=getEmoApproach(machines[id]).destination;
  const score=who=>{const p=r.snapshot(true).people.map(actorFromPacket).find(p=>p.id===who);return [p.brokenCount,p.repairedCount];};
  assert.deepEqual(score('a'),[0,0]);assert.deepEqual(score('b'),[0,0]);
  assert.equal(r.command('a','claim',{id,kind:'emo'}).ok,true);assert.equal(r.command('b','claim',{id,kind:'emo'}).ok,false);
  assert.equal(r.command('a','press',{id}).ok,false);move(r,'a',destination);assert.equal(r.command('a','press',{id}).ok,true);
  assert.equal(r.command('a','explode',{id}).ok,false);assert.deepEqual(score('a'),[0,0]);step(r,.8);assert.equal(r.command('a','explode',{id}).ok,true);assert.ok(r.destruction.isDestroyed(id));
  assert.deepEqual(score('a'),[1,0]);assert.deepEqual(score('b'),[0,0]);
  assert.equal(r.command('a','explode',{id}).ok,false);assert.deepEqual(score('a'),[1,0]);
  step(r,1);assert.equal(r.command('b','claim',{id,kind:'repair'}).ok,true);move(r,'b',destination);assert.equal(r.command('b','repair',{id}).ok,true);
  assert.equal(r.command('b','finish',{id}).ok,false);assert.deepEqual(score('b'),[0,0]);step(r,5);assert.equal(r.command('b','finish',{id}).ok,true);assert.equal(r.destruction.isDestroyed(id),false);
  assert.deepEqual(score('b'),[0,1]);assert.deepEqual(score('a'),[1,0]);
  assert.equal(r.command('b','finish',{id}).ok,false);assert.deepEqual(score('b'),[0,1]);
  r.destruction.trigger(351);r.destruction.reset(351);
  assert.deepEqual(score('a'),[1,0]);assert.deepEqual(score('b'),[0,1],'shared world changes do not increase personal totals');
});

test('FOUP ownership and throws are authoritative, and disconnect drops the same object',()=>{
  const r=fixture(),port=ports.find(p=>initialSharedPorts.includes(p.id)),id=`port:${port.id}`;
  for(const who of ['a','b'])move(r,who,{x:port.x,z:port.z+port.sign*.96});
  const count=r.store.records.size;assert.equal(r.command('a','pickup',{id}).ok,true);assert.equal(r.command('b','pickup',{id}).ok,false);
  assert.equal(r.command('a','throw').ok,true);assert.equal(r.store.records.get(id).mode,'flying');step(r,3);
  const landed=r.store.records.get(id);move(r,'b',landed);assert.equal(r.command('b','pickup',{id}).ok,true);
  r.remove('b');assert.equal(landed.mode,'flying');assert.equal(r.store.records.size,count);assert.equal(r.store.getCarried('b'),null);
});

test('OHT requires equipment, exclusive boarding, timed climb and frees its seat on disconnect',()=>{
  const r=fixture(),v=r.fleet.vehicles.find(v=>!v.residentId&&boardingMachine(v.state.car));const m=boardingMachine(v.state.car);
  move(r,'a',{x:v.state.car.x,z:m.z+m.sign*(TOOL_FRONT+.43)});move(r,'b',r.players.get('a'));
  assert.equal(r.command('a','board',{id:v.id}).ok,true);assert.equal(r.command('b','board',{id:v.id}).ok,false);
  assert.equal(r.command('a','ride').ok,false);assert.equal(r.command('a','climb').ok,true);assert.equal(r.command('a','ride').ok,false);
  step(r,2.6);assert.equal(r.command('a','ride').ok,true);assert.equal(v.passenger,true);const start={...v.state.car};step(r,3);
  assert.ok(Math.hypot(v.state.car.x-start.x,v.state.car.z-start.z)>1);r.remove('a');assert.equal(v.passenger,false);assert.equal(v.playerId,undefined);
  const other=r.fleet.vehicles.find(v=>!v.residentId&&boardingMachine(v.state.car));const tool=boardingMachine(other.state.car);r.destruction.trigger(tool.id);
  assert.match(r.command('b','board',{id:other.id}).message,/부셔져서/);
});

test('OHT distinguishes absent loadports from broken equipment and confirms its held boarding position',()=>{
  const r=fixture(),v=r.fleet.vehicles.find(v=>!v.residentId&&boardingMachine(v.state.car)),car={...v.state.car},m=boardingMachine(car);
  v.state.car={...car,x:0,z:0};assert.equal(boardingMachine(v.state.car),null);
  assert.equal(r.command('a','board',{id:v.id}).message,NO_LOADPORT_MESSAGE);
  assert.equal(v.playerId,undefined);assert.equal(r.players.get('a').vehicleId,undefined);
  v.state.car=car;move(r,'a',boardingApproach(car,m));
  r.destruction.trigger(m.id);assert.match(r.command('a','board',{id:v.id}).message,/부셔져서/);
  r.destruction.reset(m.id);const result=r.command('a','board',{id:v.id});
  assert.equal(result.ok,true);assert.equal(result.machineId,m.id);assert.deepEqual(result.approach,boardingApproach(car,m));assert.deepEqual(result.boardingCar,car);
  move(r,'a',{x:result.approach.x+2,z:result.approach.z});assert.match(r.command('a','climb').message,/로드포트 앞으로/);
  move(r,'a',result.approach);const climbed=r.command('a','climb');assert.equal(climbed.ok,true);assert.deepEqual(climbed.boardingCar,result.boardingCar);
});

test('malformed controls, impossible coordinates and command floods do not mutate the world',()=>{
  const r=fixture();assert.equal(r.pose('a',{x:Infinity,y:0,z:0,heading:0}),false);
  for(const data of [null,[],{id:'__proto__',kind:'emo'},{id:'map',kind:'emo'},{id:-1,kind:'emo'}])assert.equal(r.command('a','claim',data).ok,false);
  for(let n=0;n<20;n++)r.command('a','cancel');assert.equal(r.command('a','claim',{id:0,kind:'emo'}).ok,false);assert.equal(r.destruction.state.destroyedIds.length,0);
});

test('full welcome does not consume events or FOUP deltas intended for other peers',()=>{
  const r=fixture(),p=ports.find(p=>initialSharedPorts.includes(p.id));move(r,'a',{x:p.x,z:p.z});r.command('a','pickup',{id:`port:${p.id}`});
  r.snapshot(true);const next=r.snapshot();assert.ok(next.foups.some(row=>row[0]===`port:${p.id}`));assert.ok(next.events.some(row=>row[0]==='pickup'));
  assert.equal(r.snapshot().foups.length,0);
});

test('client snapshot swaps preserve both port occupancies and reset restores original FOUPs',()=>{
  const [a,b]=ports,hidden=[],shown=[];const s=createFoupStore({ports,initialPortIds:[a.id,b.id],hideOriginal:id=>hidden.push(id),showOriginal:id=>shown.push(id)});
  s.synchronize([{id:`port:${a.id}`,mode:'port',portId:b.id,x:b.x,y:1,z:b.z},{id:`port:${b.id}`,mode:'port',portId:a.id,x:a.x,y:1,z:a.z}],'self');
  assert.equal(s.atPort(a.id).id,`port:${b.id}`);assert.equal(s.atPort(b.id).id,`port:${a.id}`);assert.equal(hidden.length,2);
  s.reset();assert.equal(s.atPort(a.id).id,`port:${a.id}`);assert.equal(shown.length,4);
});
