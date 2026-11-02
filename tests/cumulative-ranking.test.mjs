import test from 'node:test';
import assert from 'node:assert/strict';
import {createProfileStore} from '../server/player-profiles.js';
import {createRoom} from '../server/room-engine.js';
function memoryStorage(rows=[]){
  const data=new Map(rows.map(p=>['profile:'+p.id,p]));let pages=0;
  return {get:async key=>structuredClone(data.get(key)),put:async rows=>{for(const [k,v]of Object.entries(rows))data.set(k,structuredClone(v));},delete:async key=>data.delete(key),
    list:async({prefix,startAfter,limit})=>{pages++;return new Map([...data].filter(([k])=>k.startsWith(prefix)&&(!startAfter||k>startAfter)).sort(([a],[b])=>a<b?-1:1).slice(0,limit));},get pages(){return pages;}};
}
test('cumulative ranking restores offline 100-count visitors from paginated storage and survives room restart',async()=>{
  const rows=Array.from({length:505},(_,i)=>({id:`visitor:${String(i).padStart(4,'0')}`,name:'지난 방문자 '+i,brokenCount:i===504?100:0}));
  const storage=memoryStorage(rows),profiles=createProfileStore(storage);await profiles.loadRanking();
  assert.equal(storage.pages,2);assert.equal(profiles.ranking()[0].brokenCount,100);
  const create=store=>createRoom({getHistoricalScores:()=>store.ranking(),onProfileChange:p=>store.save(p)});
  const room=create(profiles);room.join('visitor:new');
  assert.equal(room.ranking()[0].id,'visitor:0504');assert.ok(!room.players.has('visitor:0504'));
  const saved={id:'visitor:other',name:'안전팀 이름',civilianName:'원래 이름',brokenCount:105,repairedCount:2};profiles.save(saved);
  assert.equal(room.ranking()[0].name,'원래 이름');
  room.remove('visitor:new');await profiles.flush();
  const reloaded=createProfileStore(storage);await reloaded.loadRanking();assert.deepEqual(create(reloaded).ranking().slice(0,2),room.ranking().slice(0,2));
  await reloaded.remove(saved.id);assert.equal(create(reloaded).ranking()[0].brokenCount,100,'explicit reset removes only that identity');
});
test('only changed cumulative rankings are broadcast, while welcomes always include them',()=>{
  const old={id:'visitor:old',name:'예전 이름',brokenCount:100},room=createRoom({getHistoricalScores:()=>[old]});
  assert.equal(room.snapshot(true).leaderboard[0].brokenCount,100);
  assert.ok(room.snapshot().leaderboard);assert.equal(room.snapshot().leaderboard,undefined);
  assert.ok(room.snapshot(true).leaderboard);assert.equal(room.snapshot().leaderboard,undefined);
  old.brokenCount=101;assert.equal(room.snapshot().leaderboard[0].brokenCount,101);
});
