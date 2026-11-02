import test from 'node:test';
import assert from 'node:assert/strict';
import {DESTRUCTION_TITLES,OPERATOR_TITLE,destructionTitle,npcDestructionTitle,findTitle,canSelectTitle,restoreTitlePreference} from '../src/destruction-titles.js';
import {createRoom} from '../server/room-engine.js';
import {createProfileStore} from '../server/player-profiles.js';
import {actorFromPacket} from '../src/shared-protocol.js';
import {createSharedWorldView} from '../src/shared-world-view.js';
import {machines} from '../src/layout.js';
import {getEmoApproach} from '../src/emo-interaction.js';
const ownerId='visitor:'+'c'.repeat(64),guestId='visitor:'+'d'.repeat(64);
const step=(room,seconds)=>{for(let i=0;i<Math.round(seconds/.05);i++)room.step(.05);};
function quiet(room){for(const p of [...room.residents.people,...room.safety.people]){p.hidden=true;p.wait=1e9;}}
function damage(room,id,machineId=350){
  const destination=getEmoApproach(machines[machineId]).destination;
  room.pose(id,{x:destination.x,y:0,z:destination.z,heading:0,posture:'stand',hidden:false});
  assert.equal(room.command(id,'claim',{id:machineId,kind:'emo'}).ok,true);
  assert.equal(room.command(id,'press',{id:machineId}).ok,true);
  assert.equal(room.command(id,'explode',{id:machineId}).ok,false);
  step(room,.8);
  assert.equal(room.command(id,'explode',{id:machineId}).ok,true);
}

test('each earned threshold unlocks exactly at its destruction count; zero and invalid counts grant nothing',()=>{
  assert.equal(destructionTitle(0),null);
  for(const [index,title] of DESTRUCTION_TITLES.entries()){
    assert.equal(destructionTitle(title.count-1)?.id,DESTRUCTION_TITLES[index-1]?.id);
    assert.equal(destructionTitle(title.count).id,title.id);
    assert.equal(canSelectTitle(title.id,title.count-1),false);
    assert.equal(canSelectTitle(title.id,title.count),true);
  }
  for(const value of [-1,NaN,Infinity,'3000',1.5])assert.equal(destructionTitle(value),null);
  for(const preference of ['operator','break-9999','__proto__',{},null])assert.equal(restoreTitlePreference(preference,3000),'auto');
  assert.equal(destructionTitle(3000,'break-1').id,'break-1');
  assert.equal(destructionTitle(3000,'hidden'),null);
});

test('legacy counts grant titles on entry without consuming chips, changing names, records, purchases or ranking',()=>{
  const room=createRoom();room.join(guestId,{name:'기존닉네임',civilianName:'기존닉네임',brokenCount:1138,repairedCount:24});
  assert.equal(room.titleState(guestId).titleId,'break-1000');
  assert.equal(room.command(guestId,'purchase',{itemId:'bag-bear'}).ok,true);
  const before=room.profile(guestId),ranking=room.ranking();
  for(const preference of ['break-1','hidden','auto']){
    assert.equal(room.command(guestId,'title-select',{preference}).ok,true);
    assert.deepEqual(room.wallet(guestId),{...before.wallet,unlimited:false});
    assert.deepEqual(room.ranking(),ranking);
    const {titlePreference,...after}=room.profile(guestId),{titlePreference:old,...previous}=before;
    assert.deepEqual(after,previous);
  }
  for(const preference of ['break-3000','operator','__proto__',undefined,{}])assert.equal(room.command(guestId,'title-select',{preference,brokenCount:99999,operator:true}).ok,false);
  assert.equal(room.titleState(guestId).titleId,'break-1000');
  assert.deepEqual(room.wallet(guestId),{...before.wallet,unlimited:false});
});

test('only successful destruction advances auto titles; selected and hidden titles survive earning a higher one',()=>{
  for(const preference of ['auto','break-1','hidden']){
    const room=createRoom();quiet(room);room.join(guestId,{brokenCount:4,repairedCount:3,titlePreference:preference});
    const wallet=room.wallet(guestId),before=room.titleState(guestId);
    assert.equal(room.command(guestId,'explode',{id:350}).ok,false);
    assert.deepEqual(room.titleState(guestId),before);
    damage(room,guestId);
    assert.equal(room.profile(guestId).brokenCount,5);
    assert.equal(room.profile(guestId).repairedCount,3);
    assert.equal(room.wallet(guestId).chips,wallet.chips+5);
    const expected=preference==='hidden'?'':preference==='auto'?'break-5':'break-1';
    assert.equal(room.titleState(guestId).titleId,expected);
    assert.equal(actorFromPacket(room.snapshot(true).people.find(p=>p[0]===guestId)).titleId,expected);
    room.command(guestId,'explode',{id:350});assert.equal(room.profile(guestId).brokenCount,5);
  }
});

test('operator title depends exclusively on the configured owner identity and cannot be claimed or hidden by commands',()=>{
  const room=createRoom({ownerId});room.join(ownerId,{brokenCount:0,titlePreference:'hidden'});
  room.join(guestId,{name:'FAB짱 세미',chipUnlimited:true,titlePreference:'operator',brokenCount:3000});
  assert.equal(room.titleState(ownerId).titleId,OPERATOR_TITLE.id);
  assert.equal(room.titleState(guestId).titleId,'break-3000');
  for(const preference of ['operator','auto','hidden','break-1'])assert.equal(room.command(ownerId,'title-select',{preference}).ok,false);
  assert.equal(room.command(guestId,'title-select',{preference:'operator',owner:true}).ok,false);
  room.pose(guestId,{x:0,y:0,z:50,heading:0,titleId:'operator',chipUnlimited:true});
  assert.equal(room.titleState(guestId).operator,false);
  const frame=room.snapshot(true);
  assert.equal(frame.people.filter(p=>p[21]==='operator').length,1);
  assert.ok(frame.people.filter(p=>p[0].startsWith('resident:')||p[0].startsWith('safety:')).every(p=>p[21]!=='operator'));
  const unconfigured=createRoom();unconfigured.join(ownerId,room.profile(ownerId));
  assert.equal(unconfigured.titleState(ownerId).operator,false);
  assert.notEqual(unconfigured.titleState(ownerId).titleId,'operator');
});

test('chosen or hidden titles persist through profile storage and room reconstruction without resetting the wallet',async()=>{
  const rows=new Map(),storage={get:async key=>structuredClone(rows.get(key)),put:async batch=>{for(const [key,value] of Object.entries(batch))rows.set(key,structuredClone(value));}};
  const profiles=createProfileStore(storage),room=createRoom({onProfileChange:p=>profiles.save(p)});
  room.join(guestId,{name:'오래된칩',brokenCount:500,repairedCount:7});
  room.command(guestId,'purchase',{itemId:'helmet-white'});
  for(const preference of ['break-20','hidden']){
    room.command(guestId,'title-select',{preference});await profiles.flush();
    const saved=await createProfileStore(storage).get(guestId),restarted=createRoom();restarted.join(guestId,saved);
    assert.equal(restarted.titleState(guestId).preference,preference);
    assert.deepEqual(restarted.wallet(guestId),room.wallet(guestId));
    assert.equal(restarted.profile(guestId).name,'오래된칩');
    assert.equal(restarted.profile(guestId).brokenCount,500);
    assert.equal(restarted.profile(guestId).repairedCount,7);
    assert.equal(restarted.titleState(guestId).titleId,preference==='hidden'?'':'break-20');
  }
});

test('other visitors receive the same current title and older packets remain readable',()=>{
  const room=createRoom({ownerId});room.join(ownerId);room.join(guestId,{brokenCount:1000});let people,self;
  const view=createSharedWorldView({fleet:{vehicles:[]},store:{reset(){},synchronize(){}},destruction:{state:{destroyedIds:[]}},onPeople:value=>people=value,onSelf:value=>self=value,onCount(){},onCue(){}});
  view.welcome(guestId);view.apply(room.snapshot(true),true);
  assert.equal(self.titleId,'break-1000');assert.equal(people.find(p=>p.id===ownerId).titleId,'operator');
  room.command(guestId,'title-select',{preference:'hidden'});view.apply(room.snapshot(true));assert.equal(self.titleId,'');
  const packet=room.snapshot(true).people.find(p=>p[0]===guestId);
  assert.deepEqual({...actorFromPacket(packet.slice(0,21)),titleId:packet[21]},actorFromPacket(packet));
});

test('all 34 NPCs receive a stable role-appropriate title up to 100 without modifying scores or human records',()=>{
  const room=createRoom({random:()=>.42});room.join(guestId,{brokenCount:1138,repairedCount:24});
  const before=room.profile(guestId),scores=room.ranking(),npc=room.snapshot(true).people.filter(p=>/^(resident|safety):/.test(p[0]));
  assert.equal(npc.length,34);assert.equal(new Set(npc.map(p=>p[21])).size,5);
  for(const row of npc){const title=findTitle(row[21]);assert.ok(title&&title.count<=100);if(row[13]==='breaker')assert.ok(title.count>=20);else assert.ok(title.count<=20);}
  assert.deepEqual(room.profile(guestId),before);assert.deepEqual(room.ranking(),scores);
  const restarted=createRoom({random:()=>.18}),next=restarted.snapshot(true).people;
  for(const row of npc){const other=next.find(p=>p[0]===row[0]);assert.equal(other[21],row[21]);assert.equal(other[15],row[15]);}
  assert.equal(npcDestructionTitle(guestId,'breaker'),null);
});
