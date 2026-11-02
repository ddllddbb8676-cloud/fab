import test from 'node:test';
import assert from 'node:assert/strict';
import {createChipRewardTracker,createDestructionRewardQueue} from '../src/chip-rewards.js';
import {grantChips,restoreWallet,wardrobeCommand} from '../server/chip-wallet.js';

test('reward tracking ignores initial retroactive balances, purchases, duplicate and stale packets',()=>{
  const tracker=createChipRewardTracker(),p={wallet:restoreWallet({brokenCount:1000,repairedCount:24})};
  tracker.reset(p.wallet);assert.equal(tracker.receive(p.wallet),0);
  grantChips(p,5);const first=structuredClone(p.wallet);assert.equal(tracker.receive(first),5);assert.equal(tracker.receive(first),0);
  // A spend between network snapshots cannot hide an actual grant.
  wardrobeCommand(p,'purchase',{itemId:'helmet-white'});grantChips(p,3);
  assert.ok(p.wallet.chips<first.chips);assert.equal(tracker.receive(p.wallet),3);
  assert.equal(tracker.receive(first),0);assert.equal(tracker.receive(p.wallet),0);
  wardrobeCommand(p,'purchase',{itemId:'helmet-orange'});assert.equal(tracker.receive(p.wallet),0);
  const saved=structuredClone(p.wallet);tracker.reset(saved);assert.equal(tracker.receive(saved),0);
  grantChips(p,1);assert.equal(tracker.receive(p.wallet),1);
});

test('old wallets and unlimited owners earn feedback without resetting wallet data or replaying reconnect rewards',()=>{
  const tracker=createChipRewardTracker(),p={chipUnlimited:true,wallet:restoreWallet({brokenCount:1000})};delete p.wallet.earnedChips;
  const before=structuredClone(p.wallet);assert.equal(tracker.receive(p.wallet),0);
  grantChips(p,5);assert.equal(tracker.receive(p.wallet),5);assert.equal(p.wallet.chips,before.chips+5);
  assert.deepEqual(p.wallet.owned,before.owned);assert.deepEqual(p.wallet.equipped,before.equipped);
  const restored=restoreWallet({wallet:p.wallet});tracker.reset(restored);assert.equal(tracker.receive(restored),0);
  assert.equal(restored.earnedChips,5);assert.equal(restored.retroGrant,5000);
  for(const amount of [0,-1,NaN,Infinity])assert.equal(grantChips(p,amount),false);
  assert.equal(tracker.receive(p.wallet),0);
});

test('only destruction feedback waits for both the completed collapse and the returning character camera',()=>{
  const shown=[],queue=createDestructionRewardQueue(n=>shown.push(n)),all=createChipRewardTracker(),broken=createChipRewardTracker('earnedDestructionChips');
  const p={wallet:restoreWallet()};all.reset(p.wallet);broken.reset(p.wallet);
  const receive=()=>{const total=all.receive(p.wallet),delayed=Math.min(total,broken.receive(p.wallet));if(delayed)queue.add(delayed,p.wallet.lastDestructionId);if(total-delayed)shown.push(total-delayed);};
  grantChips(p,5,{destructionId:12});grantChips(p,3);receive();
  assert.equal(p.wallet.chips,8,'actual credit is immediate');assert.deepEqual(shown,[3],'repair remains immediate even in the same packet');
  queue.update({cameraBusy:false,collapseState:()=>null});assert.deepEqual(shown,[3],'wait for the first animation frame');
  queue.update({cameraBusy:false,collapseState:()=>false});assert.deepEqual(shown,[3],'interrupting the camera cannot skip the actual collapse');
  queue.update({cameraBusy:true,collapseState:()=>true});assert.deepEqual(shown,[3],'settled debris alone is not enough while the character is hidden');
  grantChips(p,1);receive();assert.deepEqual(shown,[3,1]);
  queue.update({cameraBusy:false,collapseState:()=>true});assert.deepEqual(shown,[3,1,5]);
  receive();queue.update({cameraBusy:false,collapseState:()=>true});assert.deepEqual(shown,[3,1,5]);
  const restored=restoreWallet({wallet:p.wallet});assert.equal(restored.earnedDestructionChips,5);assert.equal(restored.lastDestructionId,12);
});

test('destruction feedback cannot become stuck if the debris is repaired, and clearing cancels pending effects',()=>{
  const shown=[],queue=createDestructionRewardQueue(n=>shown.push(n));queue.add(5,9);
  queue.update({cameraBusy:true,collapseState:()=>false});queue.update({cameraBusy:false,collapseState:()=>null});assert.deepEqual(shown,[5]);
  queue.add(5,10);queue.clear();queue.update({cameraBusy:false,collapseState:()=>true});assert.deepEqual(shown,[5]);
});
