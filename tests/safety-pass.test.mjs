import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {restoreWallet} from '../server/chip-wallet.js';
import {createSafetyPassControl,safetyPassCount,SAFETY_PASS_PRICE} from '../src/safety-pass.js';
const id='visitor:'+'e'.repeat(64);
function fixture(saved={}){const room=createRoom({random:()=>.5,now:()=>Date.UTC(2026,10,5,4)});room.join(id,{hasEntered:true,optOut:true,brokenCount:20,repairedCount:3,...saved});const p=room.players.get(id);p.rate=0;return {room,p,command:(kind,data)=>{p.rate=0;return room.command(id,kind,data);}};}
test('30-chip repeat purchases keep cosmetics and records, stale/repeated requests cannot charge twice',()=>{
  const {room,p,command}=fixture(),before=room.profile(id);
  assert.equal(SAFETY_PASS_PRICE,30);assert.equal(safetyPassCount(p.wallet),0);
  assert.ok(command('safety-pass-buy',{purchaseCount:0,price:0,quantity:500,chipUnlimited:true}).ok);
  assert.equal(p.wallet.chips,before.wallet.chips-30);assert.equal(p.wallet.safetyPasses,1);
  assert.equal(command('safety-pass-buy',{purchaseCount:0}).ok,false);assert.equal(p.wallet.safetyPasses,1);
  assert.ok(command('safety-pass-buy',{purchaseCount:1}).ok);assert.equal(p.wallet.safetyPasses,2);assert.equal(p.wallet.chips,before.wallet.chips-60);
  assert.deepEqual(p.wallet.equipped,before.wallet.equipped);assert.deepEqual(p.wallet.owned,before.wallet.owned);
  assert.equal(p.brokenCount,before.brokenCount);assert.equal(p.repairedCount,before.repairedCount);assert.equal(p.civilianName,before.civilianName);
});
test('use requires a real penalty and one stored pass; use during catch frees player once with brief protection',()=>{
  const {p,room,command}=fixture();
  assert.equal(command('safety-pass-use',{useCount:0}).ok,false);
  assert.ok(command('safety-pass-buy',{purchaseCount:0}).ok);assert.ok(command('safety-pass-buy',{purchaseCount:1}).ok);
  assert.equal(command('safety-pass-use',{useCount:0}).ok,false);assert.equal(p.wallet.safetyPasses,2);
  p.penalty=3;p.caughtLeft=1.15;const chips=p.wallet.chips;
  assert.equal(command('safety-pass-use',{useCount:0}).penaltyCleared,true);
  assert.equal(p.penalty,0);assert.equal(p.caughtLeft,0);assert.equal(p.safeUntil,room.time+12);assert.equal(p.wallet.safetyPasses,1);assert.equal(p.wallet.chips,chips);
  p.penalty=1;assert.equal(command('safety-pass-use',{useCount:0}).ok,false);assert.equal(p.penalty,1);assert.equal(p.wallet.safetyPasses,1);
  assert.ok(command('safety-pass-use',{useCount:1}).ok);assert.equal(p.wallet.safetyPasses,0);p.penalty=3;
  assert.equal(command('safety-pass-use',{useCount:2}).ok,false);assert.equal(p.penalty,3);
});
test('insufficient funds and malformed counters preserve balance; only configured owner keeps unlimited purchasing',()=>{
  const {p,command}=fixture({brokenCount:0,repairedCount:0,chipUnlimited:true});
  const before=structuredClone(p.wallet);assert.equal(command('safety-pass-buy',{purchaseCount:0}).ok,false);assert.deepEqual(p.wallet,before);
  for(const purchaseCount of [-1,NaN,undefined,'0',Infinity])assert.equal(command('safety-pass-buy',{purchaseCount}).ok,false);
  const r=createRoom({ownerId:id});r.join(id);assert.ok(r.command(id,'safety-pass-buy',{purchaseCount:0}).ok);assert.equal(r.wallet(id).chips,0);assert.equal(r.wallet(id).safetyPasses,1);
});
test('new/legacy profiles are not migrated or recredited, passes and use counters survive save/reconnect',()=>{
  const {room,p,command}=fixture(),initial=structuredClone(p.wallet);assert.deepEqual(restoreWallet({wallet:initial}),initial);assert.equal(Object.hasOwn(initial,'safetyPasses'),false);
  command('safety-pass-buy',{purchaseCount:0});command('safety-pass-buy',{purchaseCount:1});p.penalty=3;command('safety-pass-use',{useCount:0});
  const saved=room.profile(id),next=fixture(saved);assert.deepEqual(next.p.wallet,saved.wallet);assert.equal(next.p.penalty,0);assert.equal(safetyPassCount(next.p.wallet),1);
  assert.equal(next.command('safety-pass-buy',{purchaseCount:1}).ok,false);assert.equal(next.command('safety-pass-use',{useCount:0}).ok,false);
});
test('penalty button displays stored quantity, ignores double clicks and sends only a versioned use request',async()=>{
  const classes=new Set(),events=new Map(),button={classList:{toggle:(c,v)=>v?classes.add(c):classes.delete(c)},addEventListener:(k,v)=>events.set(k,v)};
  let wallet={safetyPasses:2,safetyPassUses:4},penalty=3,calls=0,resolve,onUsed=0;
  const control=createSafetyPassControl({button,getWallet:()=>wallet,getPenalty:()=>penalty,connected:()=>true,onMessage(){},onUsed(){onUsed++;},command:(kind,data)=>{calls++;assert.equal(kind,'safety-pass-use');assert.deepEqual(data,{useCount:4});return new Promise(r=>resolve=r);}});
  control.refresh();assert.match(button.textContent,/2장/);assert.equal(button.disabled,false);
  const pending=events.get('click')();await events.get('click')();assert.equal(calls,1);assert.equal(button.disabled,true);
  wallet={safetyPasses:1,safetyPassUses:5};penalty=0;resolve({ok:true});await pending;assert.equal(onUsed,1);assert.ok(classes.has('hidden'));
  penalty=3;wallet.safetyPasses=0;control.refresh();assert.match(button.textContent,/0장/);assert.equal(button.disabled,true);
});
