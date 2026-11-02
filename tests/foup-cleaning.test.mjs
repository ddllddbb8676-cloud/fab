import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoom} from '../server/room-engine.js';
import {createProfileStore} from '../server/player-profiles.js';
import {createFoupStore,FOUP_CLEAN_SECONDS,FOUP_CLEAN_REWARD} from '../src/foup-play.js';
import {ports} from '../src/layout.js';
import {initialSharedPorts,foupPacket,foupFromPacket} from '../src/shared-protocol.js';
import {createFoupDebris,foupDebrisPattern} from '../src/foup-debris.js';
import {createAvatar} from '../src/avatar.js';

const a='visitor:test-a',b='visitor:test-b';
function move(r,id,x,z){return r.pose(id,{x,y:0,z,heading:0,speed:0,posture:'stand',hidden:false});}
function advance(r,seconds){for(let i=0;i<Math.ceil(seconds/.05);i++){for(const p of r.players.values())p.lastSeen=r.time;r.step(.05);}}
function room(options={}){const r=createRoom(options);for(const p of r.residents.people){p.wait=1e9;p.hidden=true;}r.join(a);r.join(b);for(const p of r.players.values())p.safeUntil=1e9;return r;}
function toss(r,{drop=false}={}){
  const port=ports.find(p=>initialSharedPorts.includes(p.id)),id=`port:${port.id}`;
  move(r,a,port.x,port.z+port.sign*.9);assert.equal(r.command(a,'pickup',{id}).ok,true);
  move(r,a,0,50);assert.equal(r.command(a,'throw',{drop}).ok,true);return r.store.records.get(id);
}
function clean(r,id,record){move(r,id,record.x,record.z-.8);return r.command(id,'clean',{id:record.id,breakSeq:record.breakSeq});}

test('a thrown FOUP breaks once, scatters for all peers and remains until someone cleans it',()=>{
  const r=room(),item=toss(r);assert.equal(r.wallet(a).chips,1);assert.equal(item.mode,'flying');
  advance(r,4);assert.equal(item.mode,'broken');assert.equal(item.breakSeq,1);assert.equal(r.command(a,'throw').ok,false);assert.equal(r.wallet(a).chips,1);
  move(r,b,item.x,item.z);assert.equal(r.command(b,'pickup',{id:item.id}).ok,false);
  advance(r,100);assert.equal(item.mode,'broken','no expiry or automatic cleanup');
  const wire=r.snapshot(true).foups.find(row=>row[0]===item.id),incoming=foupFromPacket(wire);
  assert.equal(incoming.mode,'broken');assert.equal(incoming.breakSeq,1);assert.ok(incoming.damageAge>=1.4);
  const client=createFoupStore({ports,initialPortIds:initialSharedPorts});client.synchronize([incoming],b,true);assert.equal(client.records.get(item.id).damageAge,2,'late visitors see settled fragments');
});

test('cleanup takes time, is exclusive, pays exactly two chips and cannot replay after a restock',()=>{
  const r=room(),item=toss(r);advance(r,4);assert.equal(FOUP_CLEAN_REWARD,2);
  assert.equal(clean(r,b,item).ok,true);assert.equal(clean(r,a,item).ok,false);
  advance(r,FOUP_CLEAN_SECONDS-.2);assert.equal(item.mode,'broken');assert.equal(r.wallet(b).chips,0);
  advance(r,.3);assert.equal(item.mode,'cleared');assert.equal(r.wallet(b).chips,2);assert.equal(r.wallet(a).chips,1);assert.equal(r.players.get(b).repairedCount,0);
  assert.equal(r.command(b,'clean',{id:item.id,breakSeq:1}).ok,false);assert.equal(r.wallet(b).chips,2);
  advance(r,13);assert.equal(item.mode,'port','a replacement appears only after completed cleanup');assert.equal(r.store.atPort(item.portId).id,item.id);
  assert.equal(r.command(b,'clean',{id:item.id,breakSeq:1}).ok,false);assert.equal(r.wallet(b).chips,2);
});

test('moving away, leaving, hiding and forged cleanup generations cannot award chips or lock debris',()=>{
  const r=room(),item=toss(r);advance(r,4);
  move(r,b,0,10);assert.equal(r.command(b,'clean',{id:item.id,breakSeq:item.breakSeq}).ok,false);
  assert.equal(clean(r,b,item).ok,true);advance(r,1);move(r,b,item.x+.5,item.z-.8);assert.equal(item.cleaner,null);advance(r,4);assert.equal(r.wallet(b).chips,0);
  assert.equal(clean(r,b,item).ok,true);r.pose(b,{...r.players.get(b),hidden:true});assert.equal(item.cleaner,null);assert.equal(r.wallet(b).chips,0);
  assert.equal(clean(r,b,item).ok,true);advance(r,1);const saved=r.profile(b);r.remove(b);assert.equal(item.cleaner,null);assert.equal(saved.wallet.chips,0);
  assert.equal(clean(r,a,item).ok,true);advance(r,3.3);assert.equal(r.wallet(a).chips,3);r.join(b,saved);assert.equal(r.wallet(b).chips,0);
});

test('drop stays intact and neither drop nor disconnect pays throw or cleanup rewards',()=>{
  const r=room(),item=toss(r,{drop:true});advance(r,4);assert.equal(item.mode,'ground');assert.equal(r.wallet(a).chips,0);assert.equal(clean(r,b,item).ok,false);
  move(r,a,item.x,item.z);assert.equal(r.command(a,'pickup',{id:item.id}).ok,true);r.remove(a);advance(r,4);assert.equal(item.mode,'ground');
});

test('debris and cleanup rewards persist together; interrupted throws and sweeps restore without duplicated rewards',async()=>{
  const data=new Map(),batches=[];
  const disk={get:async k=>structuredClone(data.get(k)),put:async rows=>{batches.push(structuredClone(rows));for(const [k,v]of Object.entries(rows))data.set(k,structuredClone(v));},list:async()=>new Map(),delete:async k=>data.delete(k)};
  const saved=createProfileStore(disk),r=room({onFoupChange:s=>saved.saveFoups(s),onProfileChange:p=>saved.save(p)}),item=toss(r);
  await saved.flush();let next=createRoom();next.restoreFoups(await saved.getFoups());assert.equal(next.store.records.get(item.id).mode,'broken','an interrupted throw does not respawn as a fresh FOUP');assert.equal((await saved.get(a)).wallet.chips,1);
  assert.ok(Math.hypot(next.store.records.get(item.id).x,next.store.records.get(item.id).z-50)<2,'restore at the saved throw position, not its original loadport');
  advance(r,4);assert.equal(clean(r,b,item).ok,true);advance(r,1);saved.saveFoups(r.store.checkpoint());await saved.flush();
  next=createRoom();next.restoreFoups(await saved.getFoups());const restored=next.store.records.get(item.id);assert.equal(restored.mode,'broken');assert.equal(restored.cleaner,null);assert.equal(restored.cleanProgress,0);
  advance(r,2.3);await saved.flush();const batch=batches.at(-1);assert.ok(batch['world:foups:v1']);assert.equal(batch['profile:'+b].wallet.chips,2);
  next=createRoom();next.restoreFoups(await saved.getFoups());next.join(b,await saved.get(b));assert.equal(next.store.records.get(item.id).mode,'cleared');assert.equal(next.wallet(b).chips,2);assert.equal(next.store.atPort(item.homePortId),null);
  await saved.remove(b);assert.equal((await saved.getFoups()).records.find(row=>row[0]===item.id)[1],'cleared','nickname/profile operations never clear world debris');
});

test('FOUP checkpoint rejects corrupt data before mutating and fits the storage value limit',()=>{
  const store=createFoupStore({ports,initialPortIds:initialSharedPorts});const before=store.records.size;
  assert.throws(()=>store.restore({version:1,records:[['port:0:0','broken',null,NaN,0,0,0,1,false,null]]}));assert.equal(store.records.size,before);
  for(const r of store.records.values())Object.assign(r,{original:false,mode:'broken',portId:null,damageAge:2,breakSeq:1,x:12.123456789,z:54.987654321});
  assert.ok(Buffer.byteLength(JSON.stringify(store.checkpoint()))<128*1024);
});

test('wafer spill, stable shards and disappearing cleanup dust render as bounded instances',()=>{
  const scene=new THREE.Scene(),fx=createFoupDebris(THREE,scene),r={id:'port:0:0',mode:'broken',x:0,z:0,y:.035,breakSeq:1,damageAge:.4};
  assert.deepEqual(foupDebrisPattern(r.id,1),foupDebrisPattern(r.id,1));
  fx.update([r],{focus:r});assert.ok(fx.counts.wafers>0);assert.equal(fx.counts.panels,6);
  r.damageAge=2;fx.update([r],{focus:r});assert.equal(fx.counts.wafers,0);assert.equal(fx.counts.shards,32);
  r.cleaner=a;r.cleanProgress=.6;fx.update([r],{focus:r});assert.ok(fx.counts.dust>0);
  r.mode='cleared';fx.update([r],{focus:r});assert.equal(fx.counts.shards,0);assert.ok(fx.counts.dust>0);
  for(let i=0;i<80;i++)fx.update([r],{dt:.02,focus:r});assert.equal(fx.counts.dust,0);
  for(const mesh of fx.group.children)assert.ok(mesh.instanceMatrix.array.every(Number.isFinite));fx.dispose();assert.equal(scene.children.length,0);
});

test('big broom appears only while sweeping, moves left and right, and does not enter the floor',()=>{
  const avatar=createAvatar(THREE),positions=[];
  for(const t of [0,.2,.6,1,1.4]){avatar.update(.1,{cleanTime:t,heading:0,snap:true});const broom=avatar.root.getObjectByName('sweep-broom');assert.equal(broom.visible,true);positions.push(broom.position.x);avatar.root.updateMatrixWorld(true);assert.ok(new THREE.Box3().setFromObject(broom).min.y>=-.005);}
  assert.ok(Math.min(...positions)<-.3&&Math.max(...positions)>.3);avatar.update(.1,{});assert.equal(avatar.root.getObjectByName('sweep-broom').visible,false);avatar.dispose();
});
