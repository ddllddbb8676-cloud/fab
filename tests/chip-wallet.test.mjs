import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {restoreWallet} from '../server/chip-wallet.js';
import {createProfileStore} from '../server/player-profiles.js';
import {machines,ports,TOOL_FRONT} from '../src/layout.js';
import {getEmoApproach} from '../src/emo-interaction.js';
import {boardingMachine} from '../src/play-actions.js';
import {initialSharedPorts} from '../src/shared-protocol.js';
const step=(r,seconds)=>{for(let i=0;i<Math.round(seconds/.05);i++)r.step(.05);};
const move=(r,id,p)=>r.pose(id,{x:p.x,y:0,z:p.z,heading:0,speed:0,posture:'stand',hidden:false});
function fixture(saved={}){const r=createRoom({random:()=>.42});for(const p of r.residents.people)p.wait=1e9;r.join('a',saved);return r;}
test('retroactive grant is only broken × 5 + repaired × 3 and survives reconnect after spending',()=>{
  const r=fixture({brokenCount:1000,repairedCount:24});assert.equal(r.wallet('a').chips,5072);
  assert.equal(r.command('a','purchase',{itemId:'bag-bear',price:0,unlimited:true}).ok,true);assert.equal(r.wallet('a').chips,2072);
  const saved=r.profile('a');r.remove('a');r.join('a',saved);assert.equal(r.wallet('a').chips,2072);assert.equal(r.wallet('a').retroGrant,5072);assert.equal(r.wallet('a').equipped.bag,'bag-bear');assert.equal(r.profile('a').brokenCount,1000);
  assert.throws(()=>restoreWallet({wallet:{version:1,chips:-1}}));
});
test('offline migration persists wallet with existing records and restart cannot pay again',async()=>{
  const id='visitor:offline',p={id,name:'느긋한 칩',civilianName:'느긋한 칩',brokenCount:95,repairedCount:24},rows=new Map([['profile:'+id,p]]);
  const storage={list:async()=>new Map(rows),get:async k=>rows.get(k),put:async values=>{for(const [k,v]of Object.entries(values))rows.set(k,structuredClone(v));}};
  const first=createProfileStore(storage);await first.loadRanking();await first.flush();assert.equal(rows.get('profile:'+id).wallet.chips,547);
  rows.get('profile:'+id).wallet.chips=147;const again=createProfileStore(storage);await again.loadRanking();await again.flush();assert.equal(rows.get('profile:'+id).wallet.chips,147);assert.equal(rows.get('profile:'+id).brokenCount,95);
});
test('purchase cannot double-charge or equip unowned items; invalid client fields cannot grant chips',()=>{
  const r=fixture({brokenCount:50});r.join('b',{chipUnlimited:true});
  assert.equal(r.command('a','equip',{itemId:'suit-black'}).ok,false);
  assert.equal(r.command('a','purchase',{itemId:'suit-black',price:0,chips:999999}).ok,false);
  assert.equal(r.command('a','purchase',{itemId:'helmet-white'}).ok,true);assert.equal(r.wallet('a').chips,100);
  assert.equal(r.command('a','purchase',{itemId:'helmet-white'}).ok,true);assert.equal(r.wallet('a').chips,100);
  assert.equal(r.command('a','unequip',{slot:'head'}).ok,true);assert.equal(r.wallet('a').equipped.head,null);
  assert.equal(r.command('a','equip',{itemId:'helmet-white'}).ok,true);assert.equal(r.wallet('a').chips,100);
  for(const itemId of ['__proto__','wafer',null])assert.equal(r.command('a','purchase',{itemId}).ok,false);
  assert.equal(r.wallet('b').chips,0);assert.equal(r.wallet('b').unlimited,false);assert.equal(r.roster().find(row=>row[0]==='a')[3].head,'helmet-white');
});
test('only configured owner can purchase a 10000-chip suit without enough chips',()=>{
  const owner='visitor:'+'a'.repeat(64),r=createRoom({ownerId:owner});r.join(owner);r.join('other',{name:'FAB짱 세미',chipUnlimited:true});
  assert.equal(r.command(owner,'purchase',{itemId:'suit-black'}).ok,true);assert.equal(r.wallet(owner).chips,0);assert.equal(r.wallet(owner).unlimited,true);
  assert.equal(r.command('other','purchase',{itemId:'suit-black'}).ok,false);
});
test('completed destruction and repair grant exactly 5 and 3; failed/replayed actions grant nothing',()=>{
  const r=fixture(),id=350;move(r,'a',getEmoApproach(machines[id]).destination);
  r.command('a','claim',{id,kind:'emo'});r.command('a','press',{id});assert.equal(r.command('a','explode',{id}).ok,false);assert.equal(r.wallet('a').chips,0);
  step(r,.8);assert.equal(r.command('a','explode',{id}).ok,true);assert.equal(r.wallet('a').chips,5);r.command('a','explode',{id});assert.equal(r.wallet('a').chips,5);
  step(r,1);r.command('a','claim',{id,kind:'repair'});r.command('a','repair',{id});step(r,5);assert.equal(r.command('a','finish',{id}).ok,true);assert.equal(r.wallet('a').chips,8);r.command('a','finish',{id});assert.equal(r.wallet('a').chips,8);
});
test('only a successful FOUP throw earns a chip, not drop, replay or disconnect',()=>{
  const r=fixture(),port=ports.find(p=>initialSharedPorts.includes(p.id)),id=`port:${port.id}`;move(r,'a',port);assert.equal(r.command('a','pickup',{id}).ok,true);
  assert.equal(r.command('a','throw',{drop:true}).ok,true);assert.equal(r.wallet('a').chips,0);step(r,3);move(r,'a',r.store.records.get(id));assert.equal(r.command('a','pickup',{id}).ok,true);
  assert.equal(r.command('a','throw').ok,true);assert.equal(r.wallet('a').chips,1);r.command('a','throw');assert.equal(r.wallet('a').chips,1);
});
test('actual OHT passenger earns every ten seconds; climb, remainder, reconnect and dismount cannot combine',()=>{
  const r=fixture(),p=r.players.get('a');
  function board(){const v=r.fleet.vehicles.find(v=>!v.residentId&&!v.playerId&&boardingMachine(v.state.car));const m=boardingMachine(v.state.car);move(r,'a',{x:v.state.car.x,z:m.z+m.sign*(TOOL_FRONT+.43)});assert.equal(r.command('a','board',{id:v.id}).ok,true);assert.equal(r.command('a','climb').ok,true);step(r,3);assert.equal(r.command('a','ride').ok,true);return v;}
  board();assert.equal(r.wallet('a').chips,0);step(r,9);assert.equal(r.wallet('a').chips,0);step(r,1);assert.equal(r.wallet('a').chips,1);step(r,7);assert.equal(r.command('a','dismount').ok,true);assert.equal(p.rideSeconds,0);
  board();step(r,3);assert.equal(r.wallet('a').chips,1);step(r,7);assert.equal(r.wallet('a').chips,2);step(r,4);const saved=r.profile('a');r.remove('a');r.join('a',saved);assert.equal(r.players.get('a').rideSeconds,0);assert.equal(r.wallet('a').chips,2);
});
