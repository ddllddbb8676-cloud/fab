import test from 'node:test';
import assert from 'node:assert/strict';
import {checkNickname} from '../src/nickname-policy.js';
import {createProfileStore} from '../server/player-profiles.js';
import {createRoom} from '../server/room-engine.js';
import {resetInappropriateNickname} from '../server/nickname-moderation.js';
import {restoreWallet} from '../server/chip-wallet.js';
import {isSafety} from '../src/safety-team.js';

const owner='visitor:'+'a'.repeat(64),leader='visitor:'+'b'.repeat(64),other='visitor:'+'c'.repeat(64);
function disk(profiles=[]){const data=new Map(profiles.map(p=>['profile:'+p.id,structuredClone(p)]));return {data,get:async k=>structuredClone(data.get(k)),put:async rows=>{for(const [k,v]of Object.entries(rows))data.set(k,structuredClone(v));},list:async()=>new Map(data),delete:async k=>data.delete(k)};}
async function setup(storage=disk()){
  const profiles=createProfileStore(storage,{ownerId:owner});await profiles.loadRanking();await profiles.flush();
  const room=createRoom({ownerId:owner,claimName:(...a)=>profiles.claimName(...a),nicknameAvailable:(...a)=>profiles.nicknameAvailable(...a),replaceNickname:(...a)=>profiles.replaceNickname(...a),getHistoricalScores:()=>profiles.ranking(),onProfileChange:p=>profiles.save(p)});
  for(const p of [...room.residents.people,...room.safety.people])p.name=profiles.claimName(p.id,isSafety(p.role)?'safety':'visitor',p.name);
  return {storage,profiles,room};
}
function personalRecord(){const wallet=restoreWallet({brokenCount:1000,repairedCount:24});wallet.chips=321;wallet.owned.push('helmet-white','bag-bear');wallet.equipped.head='helmet-white';wallet.equipped.bag='bag-bear';return {id:leader,name:'흰 게이트',civilianName:'흰 게이트',brokenCount:1000,repairedCount:24,wallet,penalty:2,hasEntered:true,groundPosition:{x:0,y:0,z:50,heading:1},activeSeconds:90,safetyTurns:2,optOut:true};}
const untouched=p=>{const {name,civilianName,nicknameChoiceVersion,...rest}=p;return rest;};

test('nickname alphabet, length and reserved word are checked after Korean normalization',()=>{
  for(const name of ['반도체7','Fab123','밝은 칩','ㅋㅋ123'])assert.equal(checkNickname(name).ok,true,name);
  for(const name of ['', '12345678','FAB😀','칩_1','칩-1','칩\n왕','세미','FAB세미','세 미','ㅅㅔㅁㅣ','세미'.normalize('NFD'),'<b>칩'])assert.equal(checkNickname(name).ok,false,name);
  assert.equal(checkNickname('  작은  칩 ').name,'작은 칩');assert.equal(checkNickname(null).ok,false);
});

test('existing visitor changes only their nickname, ranking and durable one-time marker; all personal records survive',async()=>{
  const s=await setup(disk([personalRecord()]));s.room.join(leader,await s.profiles.get(leader));const before=s.room.profile(leader);
  assert.equal(s.room.nicknameState(leader).kind,'existing');assert.equal(s.room.nicknameState(leader).canChoose,true);
  assert.equal(s.room.command(leader,'nickname-check',{name:'새이름7'}).ok,true);assert.deepEqual(s.room.profile(leader),before);
  assert.equal(s.room.command(leader,'nickname-confirm',{name:'새이름7',confirmed:false}).ok,false);assert.equal(s.room.nicknameState(leader).canChoose,true);
  assert.equal(s.room.command(leader,'nickname-confirm',{name:'새이름7',confirmed:true}).ok,true);
  const after=s.room.profile(leader);assert.deepEqual(untouched(after),untouched(before));assert.equal(after.civilianName,'새이름7');
  assert.equal(s.room.roster().find(p=>p[0]===leader)[1],'새이름7');assert.equal(s.room.ranking()[0].name,'새이름7');assert.equal(s.room.ranking()[0].brokenCount,1000);
  assert.equal(s.room.command(leader,'nickname-confirm',{name:'새이름7',confirmed:true}).ok,true,'retry is harmless');
  assert.equal(s.room.command(leader,'nickname-confirm',{name:'또다른칩',confirmed:true}).ok,false);
  s.room.remove(leader);await s.profiles.flush();const restarted=await setup(s.storage);restarted.room.join(leader,await restarted.profiles.get(leader));
  assert.equal(restarted.room.nicknameState(leader).canChoose,false);assert.equal(restarted.room.profile(leader).civilianName,'새이름7');assert.deepEqual(restarted.room.wallet(leader),s.room.wallet(leader)??{...after.wallet,unlimited:false});
  assert.equal(restarted.room.ranking()[0].name,'새이름7');
});

test('new visitor has a prefilled recommendation; failed and racing confirmations never consume the chance',async()=>{
  const s=await setup(disk([{id:'visitor:offline',name:'Already',civilianName:'Already',brokenCount:0}]));s.room.join(leader);s.room.join(other);
  assert.equal(s.room.nicknameState(leader).kind,'new');assert.ok(s.room.nicknameState(leader).name);
  for(const name of ['세미짱','already','Bad🙂'])assert.equal(s.room.command(leader,'nickname-confirm',{name,confirmed:true}).ok,false);
  for(const id of [leader,other])assert.equal(s.room.command(id,'nickname-check',{name:'같은칩7'}).ok,true);
  assert.equal(s.room.command(leader,'nickname-confirm',{name:'같은칩7',confirmed:true,id:other}).ok,true);
  assert.equal(s.room.command(other,'nickname-confirm',{name:'같은칩7',confirmed:true}).ok,false);assert.equal(s.room.nicknameState(other).canChoose,true);
  assert.equal(s.room.command(other,'nickname-confirm',{name:'다른칩8',confirmed:true}).ok,true);assert.equal(s.room.wallet(other).chips,0);
});

test('unsaved confirmation can retry durable storage without resetting scores or granting another choice',async()=>{
  const s=await setup(disk([personalRecord()]));s.room.join(leader,await s.profiles.get(leader));s.room.command(leader,'nickname-confirm',{name:'저장할칩',confirmed:true});
  const put=s.storage.put;s.storage.put=async()=>{throw Error('temporary failure');};await assert.rejects(s.profiles.flush());assert.equal(s.profiles.hasPending,true);
  s.storage.put=put;await s.profiles.flush();const restarted=await setup(s.storage);restarted.room.join(leader,await restarted.profiles.get(leader));
  assert.equal(restarted.room.nicknameState(leader).canChoose,false);assert.equal(restarted.room.profile(leader).brokenCount,1000);assert.equal(restarted.room.wallet(leader).chips,321);
});

test('moderation replaces only the name for online and offline visitors and updates historical ranking, with owner-only authorization',async()=>{
  for(const online of [false,true]){
    const record=personalRecord();Object.assign(record.wallet,{nicknameTickets:1,nicknamePurchases:1});
    const s=await setup(disk([record]));s.room.join(owner);s.room.join(other);if(online)s.room.join(leader,await s.profiles.get(leader));
    const before=s.room.profile(leader)||await s.profiles.get(leader);
    assert.equal((await resetInappropriateNickname({...s,actorId:other,targetName:'흰 게이트'})).ok,false);
    const result=await resetInappropriateNickname({...s,actorId:owner,targetName:'흰 게이트'});assert.equal(result.ok,true);assert.notEqual(result.name,'흰 게이트');
    await s.profiles.flush();const after=await s.profiles.get(leader);assert.deepEqual(untouched(after),untouched(before));assert.equal(after.civilianName,result.name);assert.equal(s.profiles.ranking()[0].name,result.name);assert.equal(after.nicknameChoiceVersion,1);
    assert.equal((await resetInappropriateNickname({...s,actorId:owner,targetName:'FAB짱 세미'})).ok,false);assert.equal(s.room.nicknameState(owner).canChoose,false);
  }
});

test('a 1000-chip nickname ticket is available after the free choice, charged once and kept across reconnects',async()=>{
  const record=personalRecord();record.wallet.chips=2500;
  const s=await setup(disk([record]));s.room.join(leader,await s.profiles.get(leader));
  assert.equal(s.room.command(leader,'nickname-ticket-buy',{purchaseCount:0}).ok,false);
  assert.equal(s.room.wallet(leader).chips,2500);
  assert.equal(s.room.command(leader,'nickname-confirm',{name:'무료이름',confirmed:true}).ok,true);
  const before=s.room.wallet(leader);
  assert.equal(s.room.command(leader,'nickname-ticket-buy',{purchaseCount:0,price:0,chips:99999}).ok,true);
  const bought=s.room.wallet(leader);assert.equal(bought.chips,1500);assert.equal(bought.nicknameTickets,1);assert.equal(bought.nicknamePurchases,1);
  assert.deepEqual(bought.owned,before.owned);assert.deepEqual(bought.equipped,before.equipped);
  assert.equal(s.room.command(leader,'nickname-ticket-buy',{purchaseCount:0}).ok,true);assert.deepEqual(s.room.wallet(leader),bought);
  s.room.remove(leader);await s.profiles.flush();const again=await setup(s.storage);again.room.join(leader,await again.profiles.get(leader));
  assert.deepEqual(again.room.wallet(leader),bought);assert.equal(again.room.nicknameState(leader).kind,'ticket');assert.equal(again.room.nicknameState(leader).canChoose,true);
  again.room.join(owner);assert.equal(again.room.command(owner,'nickname-ticket-buy',{purchaseCount:0}).ok,false);
});

test('only a successful new-name confirmation consumes a ticket, with scores, items and ranking retained',async()=>{
  const record=personalRecord();record.nicknameChoiceVersion=1;Object.assign(record.wallet,{chips:1500,nicknameTickets:1,nicknamePurchases:1});
  const s=await setup(disk([record,{id:other,name:'이미있는칩',civilianName:'이미있는칩'}]));s.room.join(leader,await s.profiles.get(leader));const before=s.room.profile(leader),wallet=s.room.wallet(leader);
  for(const data of [{name:'세미짱',confirmed:true},{name:'이미있는칩',confirmed:true},{name:'흰 게이트',confirmed:true},{name:'바꿀이름',confirmed:false},{name:'바꿀이름',confirmed:true,ticketPurchase:0}]){
    assert.equal(s.room.command(leader,'nickname-confirm',data).ok,false);assert.deepEqual(s.room.wallet(leader),wallet);
  }
  assert.equal(s.room.command(leader,'nickname-check',{name:'바꿀이름'}).ok,true);assert.deepEqual(s.room.wallet(leader),wallet);
  assert.equal(s.room.command(leader,'nickname-confirm',{name:'바꿀이름',confirmed:true,ticketPurchase:1}).ok,true);
  assert.equal(s.room.wallet(leader).nicknameTickets,0);assert.equal(s.room.wallet(leader).chips,1500);assert.equal(s.room.nicknameState(leader).canChoose,false);
  const {wallet:oldWallet,...oldPersonal}=untouched(before),{wallet:newWallet,...newPersonal}=untouched(s.room.profile(leader));assert.deepEqual(newPersonal,oldPersonal);assert.deepEqual(newWallet.owned,oldWallet.owned);assert.deepEqual(newWallet.equipped,oldWallet.equipped);
  assert.equal(s.room.ranking()[0].name,'바꿀이름');assert.equal(s.room.ranking()[0].brokenCount,1000);
  assert.equal(s.room.command(leader,'nickname-confirm',{name:'바꿀이름',confirmed:true,ticketPurchase:1}).ok,true);assert.equal(s.room.wallet(leader).nicknameTickets,0);
});

test('tickets can be repurchased after use but stale purchase and confirm requests cannot spend another ticket or charge twice',async()=>{
  const record=personalRecord();record.nicknameChoiceVersion=1;record.wallet.chips=2500;
  const s=await setup(disk([record]));s.room.join(leader,await s.profiles.get(leader));
  assert.equal(s.room.command(leader,'nickname-ticket-buy',{purchaseCount:0}).ok,true);
  assert.equal(s.room.command(leader,'nickname-confirm',{name:'유료이름1',confirmed:true,ticketPurchase:1}).ok,true);
  assert.equal(s.room.command(leader,'nickname-ticket-buy',{purchaseCount:0}).ok,false);assert.equal(s.room.wallet(leader).chips,1500);
  assert.equal(s.room.command(leader,'nickname-ticket-buy',{purchaseCount:1}).ok,true);assert.equal(s.room.wallet(leader).chips,500);
  assert.equal(s.room.command(leader,'nickname-confirm',{name:'지난요청',confirmed:true,ticketPurchase:1}).ok,false);assert.equal(s.room.wallet(leader).nicknameTickets,1);
  assert.equal(s.room.command(leader,'nickname-confirm',{name:'유료이름2',confirmed:true,ticketPurchase:2}).ok,true);
  assert.equal(s.room.command(leader,'nickname-ticket-buy',{purchaseCount:2}).ok,false);assert.equal(s.room.wallet(leader).chips,500);assert.equal(s.room.wallet(leader).nicknameTickets,0);
});

test('ticket purchase and use persist atomically with the wallet and name even after a checkpoint failure',async()=>{
  const record=personalRecord();record.nicknameChoiceVersion=1;record.wallet.chips=2500;
  const s=await setup(disk([record]));s.room.join(leader,await s.profiles.get(leader));const put=s.storage.put;
  for(const [kind,data] of [['nickname-ticket-buy',{purchaseCount:0}],['nickname-confirm',{name:'저장된이름',confirmed:true,ticketPurchase:1}]]){
    assert.equal(s.room.command(leader,kind,data).ok,true);s.storage.put=async()=>{throw Error('temporary failure');};await assert.rejects(s.profiles.flush());
    s.storage.put=put;await s.profiles.flush();const restored=await setup(s.storage);restored.room.join(leader,await restored.profiles.get(leader));
    assert.equal(restored.room.wallet(leader).chips,1500);assert.equal(restored.room.wallet(leader).nicknameTickets,kind==='nickname-ticket-buy'?1:0);assert.equal(restored.room.profile(leader).brokenCount,1000);
    if(kind==='nickname-confirm')assert.equal(restored.room.ranking()[0].name,'저장된이름');
  }
});
