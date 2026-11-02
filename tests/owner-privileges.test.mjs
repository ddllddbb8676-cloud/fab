import test from 'node:test';
import assert from 'node:assert/strict';
import {hasUnlimitedChips,OWNER_DISPLAY_NAME} from '../server/owner-privileges.js';
import {createProfileStore} from '../server/player-profiles.js';
import {createRoom} from '../server/room-engine.js';
import {VISITOR_NAMES,createVisitorName,nicknameKey,validNickname} from '../src/visitor-name.js';
import {MAX_VISITORS,ROOM_CAPACITY} from '../src/room-population.js';

const ownerId='visitor:'+'a'.repeat(64),otherId='visitor:'+'b'.repeat(64);
function memory(profiles){const data=new Map(profiles.map(p=>['profile:'+p.id,structuredClone(p)]));return {data,get:async k=>structuredClone(data.get(k)),put:async rows=>{for(const [k,v] of Object.entries(rows))data.set(k,structuredClone(v));},delete:async k=>data.delete(k),list:async({prefix,startAfter,limit})=>new Map([...data].filter(([k])=>k.startsWith(prefix)&&(!startAfter||k>startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit))};}
test('owner privilege only matches the configured complete ID, never a name or inherited flag',()=>{
  assert.equal(hasUnlimitedChips(ownerId,ownerId),true);
  for(const id of [otherId,OWNER_DISPLAY_NAME,'',null])assert.equal(hasUnlimitedChips(id,ownerId),false);
  assert.equal(hasUnlimitedChips(ownerId,''),false);assert.equal(hasUnlimitedChips('',undefined),false);
  const room=createRoom({ownerId});room.join(ownerId,{brokenCount:96,repairedCount:24});room.join(otherId,{name:OWNER_DISPLAY_NAME,chipUnlimited:true});
  assert.equal(room.profile(ownerId).chipUnlimited,true);assert.equal(room.profile(otherId).chipUnlimited,undefined);
});

test('a full room admits only its configured owner in one extra seat and preserves everyone on reconnect',()=>{
  const room=createRoom({ownerId,random:()=>.42});
  for(let i=0;i<MAX_VISITORS;i++)assert.equal(room.join(`visitor:regular-${i}`).ok,true);
  const guests=[...room.players.keys()].map(id=>room.profile(id));
  assert.equal(room.snapshot().people.length,ROOM_CAPACITY);assert.equal(room.join(otherId).error,'full');
  assert.equal(room.join(ownerId,{brokenCount:96,repairedCount:24}).ok,true);
  assert.equal(room.snapshot().people.length,ROOM_CAPACITY+1);assert.equal(room.join(ownerId).error,'duplicate');
  assert.equal(room.join(otherId,{name:OWNER_DISPLAY_NAME,chipUnlimited:true,owner:true}).error,'full');
  for(const p of guests)assert.deepEqual(room.profile(p.id),p);
  assert.equal(room.command(ownerId,'purchase',{itemId:'helmet-white'}).ok,true);
  const saved=room.profile(ownerId);room.remove(ownerId);
  assert.equal(room.join(otherId).error,'full','leaving the reserved seat cannot admit another regular visitor');
  assert.equal(room.join(ownerId,saved).ok,true);assert.deepEqual(room.profile(ownerId).wallet,saved.wallet);
  assert.equal(room.profile(ownerId).brokenCount,96);assert.equal(room.profile(ownerId).repairedCount,24);
  assert.equal(room.profile(ownerId).name,saved.name);assert.equal(room.snapshot().people.length,ROOM_CAPACITY+1);
});

test('owner-first entry and any restart order retain all ordinary seats without evicting visitors',()=>{
  const room=createRoom({ownerId,random:()=>.42});assert.equal(room.join(ownerId).ok,true);
  for(let i=0;i<MAX_VISITORS;i++)assert.equal(room.join(`visitor:regular-${i}`,{brokenCount:i}).ok,true);
  assert.equal(room.join(otherId).error,'full');const profiles=[...room.players.keys()].map(id=>room.profile(id));
  for(const restored of [profiles,profiles.toReversed(),[...profiles.slice(1,34),profiles[0],...profiles.slice(34)]]){
    const restarted=createRoom({ownerId,random:()=>.42});
    for(const p of restored)assert.equal(restarted.join(p.id,p).ok,true);
    assert.equal(restarted.snapshot().people.length,ROOM_CAPACITY+1);assert.equal(restarted.join(otherId).error,'full');
    for(const p of profiles){assert.deepEqual(restarted.profile(p.id).wallet,p.wallet);assert.equal(restarted.profile(p.id).brokenCount,p.brokenCount);}
    const regular=profiles[1];restarted.remove(regular.id);assert.equal(restarted.join(regular.id,regular).ok,true);
    assert.equal(restarted.snapshot().people.length,ROOM_CAPACITY+1);assert.equal(restarted.join(otherId).error,'full');
  }
});

test('missing or malformed owner configuration and forged profile flags cannot add capacity',()=>{
  for(const configured of ['',OWNER_DISPLAY_NAME,'visitor:short',undefined]){
    const room=createRoom({ownerId:configured,random:()=>.42});
    assert.equal(room.join(otherId,{name:OWNER_DISPLAY_NAME,chipUnlimited:true,owner:true}).ok,true);
    for(let i=1;i<MAX_VISITORS;i++)assert.equal(room.join(`visitor:regular-${i}`).ok,true);
    for(const id of [ownerId,OWNER_DISPLAY_NAME,'visitor:short',''])assert.equal(room.join(id,{chipUnlimited:true}).error,'full');
    assert.equal(room.snapshot().people.length,ROOM_CAPACITY);
  }
});
test('owner rename preserves records and retries safely without changing another profile',async()=>{
  const owner={id:ownerId,name:'흰 게이트',civilianName:'흰 게이트',brokenCount:96,repairedCount:24,groundPosition:{x:1,z:2},penalty:0};
  const other={id:otherId,name:'밝은 소터',civilianName:'밝은 소터',brokenCount:1138,repairedCount:2};
  const storage=memory([owner,other]),store=createProfileStore(storage,{ownerId});await store.loadRanking();await store.flush();
  const updated=await store.get(ownerId);assert.equal(updated.name,OWNER_DISPLAY_NAME);assert.equal(updated.civilianName,OWNER_DISPLAY_NAME);assert.equal(updated.chipUnlimited,true);
  for(const key of ['id','brokenCount','repairedCount','groundPosition','penalty'])assert.deepEqual(updated[key],owner[key]);
  const {wallet,...unchanged}=await store.get(otherId);assert.deepEqual(unchanged,other);assert.equal(wallet.chips,1138*5+2*3);assert.equal(unchanged.chipUnlimited,undefined);
  const restarted=createProfileStore(storage,{ownerId});await restarted.loadRanking();assert.equal(restarted.hasPending,false);
  assert.notEqual(restarted.claimName('visitor:someone','visitor',OWNER_DISPLAY_NAME),OWNER_DISPLAY_NAME);
});
test('more than ten thousand normalized unique short names exist, and free combinations precede numeric suffixes',()=>{
  assert.ok(VISITOR_NAMES.length>=10000);assert.equal(new Set(VISITOR_NAMES.map(nicknameKey)).size,VISITOR_NAMES.length);
  assert.ok(VISITOR_NAMES.every(validNickname));
  const occupied=VISITOR_NAMES.slice(0,10000),name=createVisitorName(()=>0,occupied,occupied[0]);
  assert.ok(!occupied.map(nicknameKey).includes(nicknameKey(name)));assert.doesNotMatch(name,/\d$/);
  assert.equal(createVisitorName(()=>0,[],'흰게이트3'),'흰게이트3','existing numbered nicknames remain stable');
});
