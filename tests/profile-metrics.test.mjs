import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfileMetrics} from '../server/profile-metrics.js';
import {createProfileStore} from '../server/player-profiles.js';

const ownerId = 'visitor:'+'a'.repeat(64);
const verifierId = 'visitor:'+'b'.repeat(64);
const profile = (id='visitor:person', extra={}) => ({id, name:'작은 칩', brokenCount:3, repairedCount:2,
  wallet:{version:1, revision:0, chips:20, owned:['suit-default','eyes-default','suit-pink'], equipped:{suit:'suit-pink',beauty:'eyes-default'}}, ...extra});
const item = (metrics,id) => metrics.snapshot().items.find(row => row.id===id);

test('profile projection is idempotent, private, and does not change the saved profile',()=>{
  const metrics=createProfileMetrics(), p=profile(), original=structuredClone(p);
  metrics.observe(p);const first=metrics.snapshot();metrics.observe(p);
  assert.deepEqual(metrics.snapshot(),first);
  assert.deepEqual(p,original);
  assert.equal(first.accounts,1);assert.equal(first.brokenAccounts,1);
  assert.equal(first.totalBroken,3);assert.equal(first.totalRepaired,2);
  assert.equal(first.buyers,1);assert.equal(first.paidCopies,1);assert.equal(first.priceValue,50);
  assert.equal(JSON.stringify(first).includes(p.id),false);
  assert.equal(JSON.stringify(first).includes(p.name),false);
  assert.equal(item(metrics,'suit-pink').owned,1);assert.equal(item(metrics,'suit-pink').equipped,1);
  first.items[0].owned=400;
  assert.notEqual(metrics.snapshot().items[0].owned,400,'snapshot cannot mutate internal totals');
});

test('only configured owner and verification IDs are excluded; human safety roles are included',()=>{
  const metrics=createProfileMetrics({ownerId,excludedIds:[verifierId]});
  for(const id of [ownerId,verifierId,'resident:1','safety:1'])metrics.observe(profile(id));
  metrics.observe(profile('visitor:human',{role:'safety-red',chipUnlimited:true}));
  assert.equal(metrics.snapshot().accounts,1);assert.equal(metrics.snapshot().paidCopies,1);
  const invalidOwner=createProfileMetrics({ownerId:'visitor:human'});
  invalidOwner.observe(profile('visitor:human'));
  assert.equal(invalidOwner.snapshot().accounts,1,'malformed owner configuration does not hide a human');
});

test('purchases, equipped changes, duplicate/free/unknown items and nickname tickets use their actual scopes',()=>{
  const metrics=createProfileMetrics(), p=profile();
  p.wallet.owned.push('suit-pink','unlisted-item');p.wallet.equipped.head='helmet-orange';
  p.wallet.nicknamePurchases=2;metrics.observe(p);
  assert.equal(metrics.snapshot().paidCopies,1);
  assert.equal(item(metrics,'helmet-orange').equipped,0,'unowned previews do not count');
  p.wallet.owned.push('helmet-orange');metrics.observe(p);
  assert.equal(metrics.snapshot().paidCopies,2);assert.equal(metrics.snapshot().priceValue,200);
  assert.equal(metrics.snapshot().nicknamePurchases,2);assert.equal(item(metrics,'helmet-orange').equipped,1);
  p.name='바뀐 이름';p.brokenCount=4;p.wallet.equipped.suit='suit-default';metrics.observe(p);
  assert.equal(metrics.snapshot().accounts,1);assert.equal(metrics.snapshot().totalBroken,4);
  assert.equal(item(metrics,'suit-pink').owned,1);assert.equal(item(metrics,'suit-pink').equipped,0);
  metrics.remove(p.id);metrics.remove(p.id);
  assert.equal(metrics.snapshot().accounts,0);assert.equal(metrics.snapshot().totalBroken,0);
  assert.equal(metrics.snapshot().priceValue,0);assert.equal(metrics.snapshot().nicknamePurchases,0);
  assert.ok(metrics.snapshot().items.every(row=>row.owned===0&&row.equipped===0));
});

test('store observers reuse the startup scan and report saves and successful removal without extra reads',async()=>{
  const p=profile(), data=new Map([['profile:'+p.id,p]]), metrics=createProfileMetrics();
  let scans=0,gets=0,observations=0;
  const storage={
    list:async()=>{scans++;return new Map(data);},get:async key=>{gets++;return data.get(key);},
    put:async rows=>{for(const [key,value] of Object.entries(rows))data.set(key,value);},delete:async key=>data.delete(key)
  };
  const store=createProfileStore(storage,{onProfileObserved:p=>{observations++;metrics.observe(p);},onProfileRemoved:id=>metrics.remove(id)});
  await store.loadRanking();assert.equal(scans,1);assert.equal(gets,0);assert.equal(observations,1);
  assert.equal(metrics.snapshot().accounts,1);
  store.save({...p,brokenCount:5});await store.flush();
  assert.equal(metrics.snapshot().totalBroken,5);assert.equal(observations,2);
  assert.equal(scans,1);assert.equal(gets,0);
  await store.remove(p.id);assert.equal(metrics.snapshot().accounts,0);
});

test('observer failures cannot interrupt saved records and a failed deletion is not reported',async()=>{
  const data=new Map(),p=profile();let removed=0;
  const storage={get:async key=>data.get(key),put:async rows=>{for(const [key,value] of Object.entries(rows))data.set(key,value);},delete:async()=>{throw new Error('storage unavailable');}};
  const store=createProfileStore(storage,{onProfileObserved:()=>{throw new Error('observer failed');},onProfileRemoved:()=>{removed++;}});
  assert.doesNotThrow(()=>store.save(p));await store.flush();assert.equal(data.get('profile:'+p.id).brokenCount,3);
  await assert.rejects(store.remove(p.id),/storage unavailable/);assert.equal(removed,0);
});
