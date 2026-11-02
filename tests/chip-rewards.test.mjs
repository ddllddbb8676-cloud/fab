import test from 'node:test';
import assert from 'node:assert/strict';
import {createChipRewardTracker} from '../src/chip-rewards.js';
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
