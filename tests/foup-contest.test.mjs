import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {CONTEST_ZONES as zones,contestZone,gatheringPoint} from '../src/foup-contest.js';
import {isBlocked} from '../src/layout.js';
import {restoreWallet} from '../server/chip-wallet.js';
import {readEventRequest} from '../server/admin-events.js';

const id=n=>'visitor:'+String(n).padStart(64,'0');
const owner=id(9),white=id(1),black=id(2),spectator=id(3);
const uuid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const outfit={head:'cat-ears',face:'heart-glasses',bag:'bag-turtle',beauty:'eyes-default',suit:'suit-pink'};
const visible=(room,id,point)=>room.pose(id,{...point,y:0,heading:0,speed:0,posture:'stand',hidden:false});
function game({at=Date.parse('2026-11-05T10:00:00+09:00'),accounts=[white,black,owner,spectator],savedEvents,savedFoups,profiles=new Map()}={}){
  const room=createRoom({now:()=>at,ownerId:owner,onProfileChange:p=>profiles.set(p.id,structuredClone(p))});
  if(savedFoups)room.restoreFoups(savedFoups);
  if(savedEvents)room.worldEvents.restore(savedEvents);
  for(const p of profiles.values())room.rememberContestProfile(p);
  for(const account of accounts){
    const wallet=restoreWallet({});wallet.owned.push(...Object.values(outfit),'goggles');wallet.equipped={...outfit};
    room.join(account,profiles.get(account)??{wallet,brokenCount:7,repairedCount:3});
    visible(room,account,{x:0,z:2});
  }
  const clock=t=>{at=t;room.worldEvents.update();};
  function join(account){return room.command(account,'contest-join',{eventId:room.worldEvents.view().contest?.id});}
  function ackGather(account){const p=room.players.get(account);if(p?.contestGather)visible(room,account,p.contestGather);}
  return {room,profiles,clock,join,ackGather,start(){return room.worldEvents.startManual('contest',uuid(1));}};
}
function takeAndThrow(f,account,zone,r){
  const {room}=f;
  r??=[...room.store.records.values()].find(r=>r.mode==='port');
  f.ackGather(account);visible(room,account,r);
  assert.equal(room.command(account,'pickup',{id:r.id}).ok,true);
  visible(room,account,{x:zone.x,z:zone.z-4.4});
  assert.equal(room.command(account,'throw',{}).contestThrow,true);
  for(let i=0;i<45;i++)room.store.step(.05);
  assert.equal(r.mode,'ground');assert.equal(contestZone(r.x,r.z),zone.team);
  return r;
}

test('six alternating reachable circles and enough safe central gathering positions',()=>{
  assert.deepEqual(zones.map(z=>z.team),['black','white','black','white','black','white']);
  for(const zone of zones)for(let i=0;i<16;i++){const angle=i*Math.PI/8;assert.equal(isBlocked(zone.x+2.4*Math.cos(angle),zone.z+2.4*Math.sin(angle),.295),false);}
  for(let i=0;i<68;i++){const p=gatheringPoint(i);assert.equal(isBlocked(p.x,p.z,.295),false);assert.equal(contestZone(p.x,p.z),null);}
});
test('join order, double clicks, operator balance and suit-only display including accessory edits',()=>{
  const f=game(),r=f.room,receipt=f.start();assert.ok(receipt.ok);
  assert.equal(f.start().replayed,true);assert.equal(f.join(owner).ok,false);
  assert.equal(f.join(white).team,'white');assert.equal(f.join(white).team,'white');assert.equal(f.join(black).team,'black');
  assert.equal(r.worldEvents.view().contest.joined,2);assert.equal(r.worldEvents.startManual('bay',uuid(2)).status,409);
  const before=r.wallet(white),m=receipt.event;
  assert.equal(m.endsAt-m.startsAt,180000);f.clock(m.startsAt);
  const display=account=>r.roster().find(row=>row[0]===account);
  assert.equal(display(owner)[4],'referee');assert.deepEqual(display(owner)[3],{...outfit,suit:'suit-blue'});
  assert.deepEqual(display(white)[3],{...outfit,suit:'suit-default'});assert.deepEqual(display(black)[3],{...outfit,suit:'suit-black'});
  assert.deepEqual(r.wallet(white),before);assert.equal(f.join(spectator).ok,false);
  assert.ok(r.command(white,'equip',{itemId:'goggles'}).ok);assert.deepEqual(display(white)[3],{...outfit,face:'goggles',suit:'suit-default'});
  f.clock(m.endsAt);assert.deepEqual(display(white)[3],{...outfit,face:'goggles'});assert.equal(display(owner)[3].suit,'suit-pink');
  assert.ok(r.players.get(white).assignAfter>r.time+12);
  assert.equal(r.profile(white).brokenCount,7);assert.equal(r.profile(white).repairedCount,3);
});
test('odd visitors get the operator on black; a missing operator or empty lobby cancels fairly',()=>{
  const f=game();const m=f.start().event;f.join(white);f.clock(m.startsAt);
  assert.equal(f.room.worldEvents.contest.team(owner),'black');assert.equal(f.room.worldEvents.view().contest.joined,2);
  for(const count of [0,1]){const f=game({accounts:[white]});const m=f.start().event;if(count)f.join(white);f.clock(m.startsAt);
    assert.equal(f.room.worldEvents.view().contest.phase,'cancelled');assert.equal(f.room.wallet(white).chips,0);}
});
test('a real throw lands intact, stealing subtracts immediately, and the final counts pay each team once',()=>{
  const f=game(),r=f.room,m=f.start().event;f.join(white);f.join(black);f.clock(m.startsAt);
  const ball=takeAndThrow(f,white,zones[1]);assert.equal(r.worldEvents.view().contest.white,1);
  visible(r,spectator,ball);assert.equal(r.command(spectator,'pickup',{id:ball.id}).ok,false);
  assert.equal(r.store.pickup(ball.id,'resident:0'),false);f.ackGather(black);visible(r,black,ball);
  assert.ok(r.command(black,'pickup',{id:ball.id}).ok);assert.equal(r.worldEvents.view().contest.white,0);
  visible(r,black,{x:0,z:zones[0].z-4.4});r.command(black,'throw',{});for(let i=0;i<45;i++)r.store.step(.05);
  assert.equal(r.worldEvents.view().contest.black,1);
  takeAndThrow(f,white,zones[3]);takeAndThrow(f,black,zones[2]);
  const before=[r.wallet(white).chips,r.wallet(black).chips];f.clock(m.endsAt);
  assert.equal(r.worldEvents.view().contest.winner,'black');assert.equal(r.wallet(white).chips-before[0],15);assert.equal(r.wallet(black).chips-before[1],60);
  f.clock(m.endsAt+1);assert.equal(r.wallet(black).chips-before[1],60);assert.equal(r.wallet(spectator).chips,0);assert.equal(r.wallet(owner).chips,0);
  visible(r,black,ball);r.command(black,'pickup',{id:ball.id});r.command(black,'throw',{});for(let i=0;i<45;i++)r.store.step(.05);assert.equal(ball.mode,'broken');
});
test('reconstruction and a disconnected player retain scores; a draw credits both wallets exactly once',()=>{
  const f=game(),r=f.room,m=f.start().event;f.join(white);f.join(black);f.clock(m.startsAt);
  takeAndThrow(f,white,zones[3]);takeAndThrow(f,black,zones[2]);r.remove(white);
  const before=f.profiles.get(white).wallet.chips;
  const resumed=game({at:m.endsAt-1,accounts:[black],savedEvents:r.worldEvents.checkpoint(),savedFoups:r.store.checkpoint(),profiles:f.profiles});
  resumed.clock(m.endsAt);assert.equal(resumed.room.worldEvents.view().contest.winner,'tie');
  assert.equal(f.profiles.get(white).wallet.chips,before+20);assert.equal(resumed.room.wallet(black).chips,before+20);
  const again=game({at:m.endsAt+1,accounts:[white],savedEvents:resumed.room.worldEvents.checkpoint(),profiles:f.profiles});
  again.clock(m.endsAt+2);assert.equal(again.room.wallet(white).chips,before+20);
});
test('owner API parses only the new valid kind, and the normal schedule stays exclusive',async()=>{
  const body=value=>new Request('https://local.test/api/admin/events',{method:'POST',body:JSON.stringify(value)});
  assert.ok(await readEventRequest(body({kind:'contest',requestId:uuid(1)})));
  assert.equal(await readEventRequest(body({kind:'contest',requestId:uuid(1),bayCount:2})),null);
  const late=game({at:Date.parse('2026-11-05T11:57:00+09:00')});assert.equal(late.start().status,409);
  const f=game();f.start();assert.equal(f.room.worldEvents.startManual('golden',uuid(4)).status,409);
});
