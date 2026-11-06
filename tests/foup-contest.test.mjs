import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {CONTEST_ZONES as zones,contestZone,gatheringPoint} from '../src/foup-contest.js';
import {isBlocked,BAY_PITCH,bays,machines} from '../src/layout.js';
import {planContestRepairs} from '../server/contest-preparation.js';
import {canCatch,isSafety} from '../src/safety-team.js';
import {restoreWallet} from '../server/chip-wallet.js';
import {readEventRequest} from '../server/admin-events.js';

const id=n=>'visitor:'+String(n).padStart(64,'0');
const owner=id(9),white=id(1),black=id(2),spectator=id(3);
const uuid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const outfit={head:'cat-ears',face:'heart-glasses',bag:'bag-turtle',beauty:'eyes-default',suit:'suit-pink'};
const visible=(room,id,point)=>room.pose(id,{...point,y:0,heading:0,speed:0,posture:'stand',hidden:false});
function game({at=Date.parse('2026-11-05T10:00:00+09:00'),accounts=[white,black,owner,spectator],savedEvents,savedFoups,savedEquipment,onEquipmentChange,profiles=new Map()}={}){
  const room=createRoom({now:()=>at,ownerId:owner,onEquipmentChange,onProfileChange:p=>profiles.set(p.id,structuredClone(p))});
  if(savedEquipment)room.restoreEquipment(savedEquipment);
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

test('two reachable central circles one bay apart and enough safe gathering positions',()=>{
  assert.deepEqual(zones.map(z=>z.team),['black','white']);assert.equal(zones[1].z-zones[0].z,BAY_PITCH);
  for(const zone of zones)for(let i=0;i<16;i++){const angle=i*Math.PI/8;assert.equal(isBlocked(zone.x+2.4*Math.cos(angle),zone.z+2.4*Math.sin(angle),.295),false);}
  for(const team of ['white','black']){
    const seen=new Set();
    for(let i=0;i<51;i++){
      const p=gatheringPoint(team,i);assert.equal(isBlocked(p.x,p.z,.295),false);
      assert.equal(contestZone(p.x,p.z),team);seen.add(p.x+','+p.z);
    }
    assert.equal(seen.size,51);
  }
  assert.deepEqual(gatheringPoint('referee'),{x:0,z:(zones[0].z+zones[1].z)/2});
});
test('join order, double clicks, operator balance and suit-only display including accessory edits',()=>{
  const f=game(),r=f.room,receipt=f.start();assert.ok(receipt.ok);
  assert.equal(f.start().replayed,true);assert.equal(f.join(owner).ok,false);
  assert.equal(f.join(white).team,'white');assert.equal(f.join(white).team,'white');assert.equal(f.join(black).team,'black');
  assert.equal(contestZone(r.players.get(white).x,r.players.get(white).z),'white');
  assert.equal(contestZone(r.players.get(black).x,r.players.get(black).z),'black');
  assert.equal(r.worldEvents.view().contest.joined,2);assert.equal(r.worldEvents.startManual('bay',uuid(2)).status,409);
  const before=r.wallet(white),m=receipt.event;
  assert.equal(m.endsAt-m.startsAt,180000);f.clock(m.startsAt);
  for(const [id,expected] of [[white,'white'],[black,'black'],[owner,null]]) {
    const {contestGather:p}=r.players.get(id);assert.equal(contestZone(p.x,p.z),expected);
  }
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
  const pos=f.room.players.get(owner);assert.deepEqual({x:pos.x,z:pos.z},gatheringPoint('referee'));
  for(const count of [0,1]){const f=game({accounts:[white]});const m=f.start().event;if(count)f.join(white);f.clock(m.startsAt);
    assert.equal(f.room.worldEvents.view().contest.phase,'cancelled');assert.equal(f.room.wallet(white).chips,0);}
});
test('a departure during recruitment puts remaining players in their final team circles and leaves the operator at the midpoint',()=>{
  const f=game(),r=f.room,m=f.start().event;
  f.join(white);f.join(black);f.join(spectator);r.remove(white);f.clock(m.startsAt);
  assert.equal(r.worldEvents.contest.team(black),'white');assert.equal(r.worldEvents.contest.team(spectator),'black');
  for (const id of [black,spectator]) {
    const target=r.players.get(id).contestGather;
    assert.equal(contestZone(target.x,target.z),r.worldEvents.contest.team(id));
    visible(r,id,{x:0,z:65});
    assert.equal(contestZone(r.players.get(id).x,r.players.get(id).z),r.worldEvents.contest.team(id));
    f.ackGather(id);assert.equal(r.players.get(id).contestGather,undefined);
  }
  const p=r.players.get(owner);assert.deepEqual({x:p.x,z:p.z},gatheringPoint('referee'));
});
test('a real throw lands intact, stealing subtracts immediately, and the final counts pay each team once',()=>{
  const f=game(),r=f.room,m=f.start().event;f.join(white);f.join(black);f.clock(m.startsAt);
  const ball=takeAndThrow(f,white,zones[1]);assert.equal(r.worldEvents.view().contest.white,1);
  visible(r,spectator,ball);assert.equal(r.command(spectator,'pickup',{id:ball.id}).ok,false);
  assert.equal(r.store.pickup(ball.id,'resident:0'),false);f.ackGather(black);visible(r,black,ball);
  assert.ok(r.command(black,'pickup',{id:ball.id}).ok);assert.equal(r.worldEvents.view().contest.white,0);
  visible(r,black,{x:0,z:zones[0].z-4.4});r.command(black,'throw',{});for(let i=0;i<45;i++)r.store.step(.05);
  assert.equal(r.worldEvents.view().contest.black,1);
  takeAndThrow(f,white,zones[1]);takeAndThrow(f,black,zones[0]);
  const before=[r.wallet(white).chips,r.wallet(black).chips];f.clock(m.endsAt);
  assert.equal(r.worldEvents.view().contest.winner,'black');assert.equal(r.wallet(white).chips-before[0],15);assert.equal(r.wallet(black).chips-before[1],60);
  assert.deepEqual(r.worldEvents.view().contest.rewards,{black:60,white:15});
  f.clock(m.endsAt+1);assert.equal(r.wallet(black).chips-before[1],60);assert.equal(r.wallet(spectator).chips,0);assert.equal(r.wallet(owner).chips,0);
  visible(r,black,ball);r.command(black,'pickup',{id:ball.id});r.command(black,'throw',{});for(let i=0;i<45;i++)r.store.step(.05);assert.equal(ball.mode,'broken');
});
test('reconstruction and a disconnected player retain scores; a draw credits both wallets exactly once',()=>{
  const f=game(),r=f.room,m=f.start().event;f.join(white);f.join(black);f.clock(m.startsAt);
  takeAndThrow(f,white,zones[1]);takeAndThrow(f,black,zones[0]);r.remove(white);
  const before=f.profiles.get(white).wallet.chips;
  const resumed=game({at:m.endsAt-1,accounts:[black],savedEvents:r.worldEvents.checkpoint(),savedFoups:r.store.checkpoint(),profiles:f.profiles});
  resumed.clock(m.endsAt);assert.equal(resumed.room.worldEvents.view().contest.winner,'tie');
  assert.equal(f.profiles.get(white).wallet.chips,before+20);assert.equal(resumed.room.wallet(black).chips,before+20);
  const again=game({at:m.endsAt+1,accounts:[white],savedEvents:resumed.room.worldEvents.checkpoint(),profiles:f.profiles});
  again.clock(m.endsAt+2);assert.equal(again.room.wallet(white).chips,before+20);
});

test('an opponent throws a scored FOUP outside, either team can recover it there, and only its final ring counts',()=>{
  const f=game(),r=f.room,m=f.start().event;f.join(white);f.join(black);f.clock(m.startsAt);
  const ball=takeAndThrow(f,white,zones[1]);f.ackGather(black);visible(r,black,ball);
  const collect=player=>r.command(player,'pickup',{id:ball.id,contestPickup:true});
  assert.ok(collect(black).ok);assert.equal(r.worldEvents.view().contest.white,0);
  visible(r,black,{x:0,z:6});assert.ok(r.command(black,'throw',{}).contestThrow);
  assert.equal(collect(white).ok,false,'cannot take in flight');
  for(let i=0;i<45;i++)r.store.step(.05);
  assert.equal(ball.mode,'ground');assert.equal(contestZone(ball.x,ball.z),null);
  visible(r,white,{x:ball.x,z:ball.z+2.2});assert.equal(collect(white).ok,false,'out of reach');
  visible(r,spectator,ball);assert.equal(collect(spectator).ok,false);
  visible(r,white,{x:ball.x,z:ball.z+1.8});visible(r,black,ball);
  assert.ok(collect(white).ok);assert.equal(collect(black).ok,false,'same FOUP cannot go into two hands');
  visible(r,white,{x:0,z:zones[1].z-4.4});r.command(white,'throw',{});
  for(let i=0;i<45;i++)r.store.step(.05);
  const before=r.wallet(white).chips;f.clock(m.endsAt);
  assert.equal(r.worldEvents.view().contest.white,1);assert.equal(r.worldEvents.view().contest.black,0);
  assert.equal(r.wallet(white).chips-before,30);
});

test('the spectator operator travels with the lobby and can revisit without joining or gaining rewards',()=>{
  const f=game(),r=f.room,m=f.start().event;
  assert.deepEqual({x:r.players.get(owner).x,z:r.players.get(owner).z},gatheringPoint('referee'));
  f.join(white);f.join(black);f.clock(m.startsAt);f.ackGather(owner);visible(r,owner,{x:0,z:60});
  assert.equal(r.command(spectator,'contest-visit',{eventId:m.id}).ok,false);
  assert.equal(r.command(owner,'contest-visit',{eventId:'old'}).ok,false);
  assert.equal(r.command(owner,'contest-visit',{eventId:m.id}).ok,true);
  assert.equal(r.command(owner,'contest-visit',{eventId:m.id}).ok,false);
  assert.equal(r.worldEvents.view().contest.joined,2);assert.equal(r.worldEvents.contest.team(owner),'referee');
  assert.deepEqual({x:r.players.get(owner).x,z:r.players.get(owner).z},gatheringPoint('referee'));
  takeAndThrow(f,white,zones[1]);f.clock(m.endsAt);assert.equal(r.wallet(owner).chips,0);
  const odd=game(),om=odd.start().event;odd.join(white);odd.clock(om.startsAt);
  assert.equal(odd.room.command(owner,'contest-visit',{eventId:om.id}).ok,false,'a playing operator cannot teleport');
});

test('recruitment restores nearby load ports in waves and reaches 16 working per bay even after a delayed start',()=>{
  let writes=0;
  const f=game({onEquipmentChange:()=>writes++}),r=f.room;
  for(const m of machines)r.destruction.trigger(m.id);
  const occupied=bays[4].machines.at(-1).id;r.destruction.beginRepair(occupied,'someone');
  const plan=planContestRepairs(r.destruction.isDestroyed,id=>id!==occupied);
  assert.equal(plan.length,64);assert.equal(new Set(plan).size,64);
  assert.deepEqual([...new Set(plan.map(id=>machines[id].bayId))].sort((a,b)=>a-b),[4,5,13,14]);
  const before=[r.profile(white).wallet,r.profile(white).repairedCount],m=f.start().event;f.join(white);f.join(black);
  assert.equal(r.destruction.state.destroyedIds.length,360);
  writes=0;f.clock(m.startsAt-28500);assert.equal(r.destruction.state.destroyedIds.length,356);
  assert.equal(writes,1,'one equipment checkpoint for the whole wave');
  f.clock(m.startsAt-1000);assert.equal(r.destruction.state.destroyedIds.length,352);
  const checkpoint=r.worldEvents.checkpoint();
  checkpoint.contest.repairs=plan.slice(0,10); // Resume an old short queue using current damage.
  const resumed=game({at:m.startsAt-500,savedEvents:checkpoint,savedEquipment:r.equipmentState()});
  resumed.clock(m.startsAt);
  for(const bay of [4,5,13,14])assert.equal(bays[bay].machines.filter(m=>!resumed.room.destruction.isDestroyed(m.id)).length,16);
  writes=0;f.clock(m.startsAt);assert.equal(writes,1,'one final checkpoint for all remaining repairs');
  for(const bay of bays){
    const working=bay.machines.filter(m=>!r.destruction.isDestroyed(m.id));
    assert.equal(working.length,[4,5,13,14].includes(bay.id)?16:0);
    if(working.length)assert.ok(bay.machines.filter(m=>Math.abs(m.x)<11&&m.id!==occupied).every(m=>working.includes(m)));
  }
  assert.equal(r.destruction.isDestroyed(occupied),true);assert.deepEqual([r.profile(white).wallet,r.profile(white).repairedCount],before);
  const front=bays[4].machines.filter(m=>Math.abs(m.x)<11).map(m=>m.id);
  assert.deepEqual(new Set(planContestRepairs(id=>front.includes(id))),new Set(front),'restore visible front tools even when all distant tools are healthy');
  assert.deepEqual(planContestRepairs(()=>false),[]);
});

test('all safety duty pauses for spectators and players, including reconnect, then resumes after the result',()=>{
  const f=game(),r=f.room,p=r.players.get(spectator);r.residents.update=()=>{};
  Object.assign(p,{role:'safety-red',activeSeconds:600,name:'안전팀'});const before=r.profile(spectator);
  const m=f.start().event;f.join(white);f.join(black);
  assert.equal(p.role,'visitor');for(const key of ['wallet','brokenCount','repairedCount'])assert.deepEqual(r.profile(spectator)[key],before[key]);
  const guard=r.safety.people[0];Object.assign(guard,{x:0,z:40});visible(r,spectator,{x:0,z:40});p.safeUntil=0;
  for(let i=0;i<20;i++)r.step(.1);
  assert.equal(guard.phase,'event-rest');assert.equal(canCatch(guard,p,r.time),false);assert.equal(p.penalty,0);assert.equal(guard.speed,0);
  f.clock(m.startsAt);r.step(.05);assert.equal(p.penalty,0);assert.equal(r.safety.people.every(p=>p.phase==='event-rest'),true);
  const restored=game({at:m.startsAt+1,accounts:[],savedEvents:r.worldEvents.checkpoint()});restored.room.join(spectator,before);
  assert.equal(isSafety(restored.room.players.get(spectator).role),false);
  f.clock(m.endsAt+11999);r.step(.05);assert.equal(guard.phase,'event-rest');
  f.clock(m.endsAt+12000);assert.equal(guard.phase,'patrol');
});

test('start clears only old floor FOUPs and debris in both circles, with no new identities, chips or cleanup reward',()=>{
  const f=game(),r=f.room,m=f.start().event;f.join(white);f.join(black);
  const records=[...r.store.records.values()].filter(r=>r.mode==='port').slice(0,6);
  for(let i=0;i<4;i++){
    const p=i<3?zones[i%2]:{x:0,z:50};r.store.launch(records[i],{...p,y:.225},{x:0,y:0,z:0});
    Object.assign(records[i],{mode:i===1?'broken':i===2?'flying':'ground',damageAge:2});
  }
  // A spectator can be holding a FOUP inside a circle; the event must not take it.
  assert.ok(r.store.pickup(records[4].id,spectator));Object.assign(records[4],zones[0]);
  r.store.pickup(records[5].id,owner);assert.ok(r.store.loadCart('CART01',0,owner,records[5].id));
  const ids=[...r.store.records.keys()].sort(),wallets=[white,black,spectator,owner].map(id=>r.wallet(id));
  f.clock(m.startsAt);
  for(const old of records.slice(0,3)){assert.ok(['port','cleared'].includes(old.mode));assert.equal(old.cleaner,null);}
  assert.equal(records[3].mode,'ground');assert.equal(records[4].mode,'carried');assert.equal(records[4].owner,spectator);assert.equal(records[5].mode,'cart');
  assert.deepEqual([...r.store.records.keys()].sort(),ids);assert.deepEqual([white,black,spectator,owner].map(id=>r.wallet(id)),wallets);
  assert.deepEqual({black:r.worldEvents.view().contest.black,white:r.worldEvents.view().contest.white},{black:0,white:0});
  const saved=r.store.checkpoint(),again=game({accounts:[],savedFoups:saved,savedEvents:r.worldEvents.checkpoint(),at:m.startsAt+1});
  assert.deepEqual([...again.room.store.records.keys()].sort(),ids);
});
test('owner API parses only the new valid kind, and the normal schedule stays exclusive',async()=>{
  const body=value=>new Request('https://local.test/api/admin/events',{method:'POST',body:JSON.stringify(value)});
  assert.ok(await readEventRequest(body({kind:'contest',requestId:uuid(1)})));
  assert.equal(await readEventRequest(body({kind:'contest',requestId:uuid(1),bayCount:2})),null);
  const late=game({at:Date.parse('2026-11-05T11:57:00+09:00')});assert.equal(late.start().status,409);
  const f=game();f.start();assert.equal(f.room.worldEvents.startManual('golden',uuid(4)).status,409);
});
