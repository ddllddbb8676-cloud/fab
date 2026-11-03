import test from 'node:test';
import assert from 'node:assert/strict';
import {VISITOR_NAMES,createVisitorName,createUniqueNickname,nicknameKey,validNickname} from '../src/visitor-name.js';
import {createSafetyName,isSafety} from '../src/safety-team.js';
import {createProfileStore} from '../server/player-profiles.js';
import {createRoom,SAFETY_DUTY} from '../server/room-engine.js';

function disk(profiles=[]){
  const data=new Map(profiles.map(p=>['profile:'+p.id,structuredClone(p)])),batches=[];
  return {data,batches,get:async key=>structuredClone(data.get(key)),
    put:async rows=>{assert.ok(Object.keys(rows).length<=128);batches.push(rows);for(const [k,v]of Object.entries(rows))data.set(k,structuredClone(v));},
    delete:async key=>data.delete(key),
    list:async({prefix,startAfter,limit})=>new Map([...data].filter(([k])=>k.startsWith(prefix)&&(!startAfter||k>startAfter)).sort(([a],[b])=>a.localeCompare(b,'en')).slice(0,limit))};
}
function roomWith(store){
  const room=createRoom({random:()=>.42,claimName:(...args)=>store.claimName(...args),onProfileChange:p=>store.save(p),getHistoricalScores:()=>store.ranking()});
  for(const p of [...room.residents.people,...room.safety.people])p.name=store.claimName(p.id,isSafety(p.role)?'safety':'visitor',p.name,[],()=>.42);
  return room;
}
const unique=names=>assert.equal(new Set(names.map(nicknameKey)).size,names.length);

test('exhausted visitor and safety pools add numbers without repeating names or exceeding seven characters',()=>{
  const smallPool=['작은 칩','밝은 소터','흰 게이트'],names=[...smallPool];
  for(let i=0;i<1200;i++){const name=createUniqueNickname(smallPool,()=>0,names);assert.match(name,/\d$/);assert.ok(validNickname(name));names.push(name);}
  unique(names);
  const guards=[];for(let i=0;i<150;i++){const name=createSafetyName(()=>0,guards);assert.match(name,/안전팀\d*$/);assert.ok(validNickname(name));guards.push(name);}unique(guards);
  assert.notEqual(nicknameKey(createVisitorName(()=>0,['큰칩'],'큰 칩')),nicknameKey('큰 칩'));
});

test('legacy duplicates including offline zero-score people are renamed without losing personal records',async()=>{
  const original=[
    {id:'visitor:leader',name:'졸린 칩',civilianName:'졸린 칩',brokenCount:100,repairedCount:7,penalty:2,groundPosition:{x:0,z:50}},
    {id:'visitor:zero',name:'졸린 칩',civilianName:'졸린 칩',brokenCount:0,repairedCount:0},
    {id:'visitor:number',name:'졸린칩1',civilianName:'졸린칩1',brokenCount:5,repairedCount:3},
    {id:'visitor:space',name:'졸린칩',civilianName:'졸린칩',brokenCount:4,repairedCount:2},
    {id:'visitor:guard1',name:'큰 안전팀',civilianName:'작은 칩',role:'safety-red',brokenCount:9},
    {id:'visitor:guard2',name:'큰 안전팀',civilianName:'밝은 칩',role:'safety-orange',brokenCount:8}
  ];
  const storage=disk(original),store=createProfileStore(storage);await store.loadRanking();await store.flush();
  const rows=await Promise.all(original.map(p=>store.get(p.id)));
  unique(rows.flatMap(p=>[p.civilianName,...(p.safetyName?[p.safetyName]:[])]));
  assert.equal(rows[0].civilianName,'졸린 칩');assert.equal(rows[2].civilianName,'졸린칩1');assert.doesNotMatch(rows[1].civilianName,/\d$/);
  for(const [i,p]of rows.entries())for(const field of ['id','brokenCount','repairedCount','penalty','groundPosition','role'])assert.deepEqual(p[field],original[i][field],field);
  const next=createProfileStore(storage);await next.loadRanking();assert.equal(next.hasPending,false,'migration is stable on restart');
  for(const p of rows)assert.deepEqual(await next.get(p.id),p);
  const room=roomWith(next);room.join(rows[1].id,await next.get(rows[1].id));room.join('visitor:new');
  assert.equal(room.players.get(rows[1].id).name,rows[1].civilianName);
  unique([...rows.filter(p=>p.id!==rows[1].id).flatMap(p=>[p.civilianName,...(p.safetyName?[p.safetyName]:[])]),...room.roster().map(p=>p[1])]);
  assert.equal(room.ranking()[0].brokenCount,100);
});

test('paginated duplicate migration retries safely and reservations survive a full room restart',async()=>{
  const original=Array.from({length:530},(_,i)=>({id:`visitor:${String(i).padStart(4,'0')}`,name:'작은 칩',civilianName:'작은 칩',brokenCount:0,repairedCount:i}));
  const storage=disk(original),store=createProfileStore(storage);await store.loadRanking();
  const put=storage.put;let failures=1;storage.put=async batch=>{if(failures-->0)throw new Error('temporary failure');return put(batch);};
  await assert.rejects(store.flush());assert.equal(store.hasPending,true);await store.flush();
  const rows=await Promise.all(original.map(p=>store.get(p.id)));unique(rows.map(p=>p.civilianName));
  for(const p of rows){assert.ok(validNickname(p.civilianName));assert.equal(p.repairedCount,Number(p.id.split(':')[1]));}
  const r=roomWith(store);r.join('visitor:a');r.join('visitor:b');
  const a=r.profile('visitor:a'),b=r.profile('visitor:b');unique([...rows.map(p=>p.civilianName),...r.roster().map(p=>p[1])]);
  r.remove(a.id);r.remove(b.id);await store.flush();
  const restored=createProfileStore(storage);await restored.loadRanking();const next=roomWith(restored);
  next.join(a.id,await restored.get(a.id));next.join('visitor:c');
  assert.equal(next.players.get(a.id).name,a.name);assert.notEqual(next.players.get('visitor:c').name,b.name);
  unique([...rows.map(p=>p.civilianName),b.name,...next.roster().map(p=>p[1])]);
});

test('safety duty keeps its own reserved alias and returning civilian restores the same identity',async()=>{
  const storage=disk(),store=createProfileStore(storage);await store.loadRanking();const room=roomWith(store);
  room.join('visitor:guard');const p=room.players.get('visitor:guard'),civilian=p.name;
  for(const n of room.residents.people){n.hidden=true;n.wait=1e9;}for(const g of room.safety.people)g.hidden=true;
  room.pose(p.id,{x:0,y:0,z:50,heading:0,hidden:false,posture:'stand'});p.activeSeconds=SAFETY_DUTY.warmup;
  for(let i=0;i<310;i++){p.lastSeen=room.time;room.step(.05);}
  assert.ok(isSafety(p.role));const safety=p.name;unique(room.roster().map(r=>r[1]));room.remove(p.id);await store.flush();
  const store2=createProfileStore(storage);await store2.loadRanking();const next=roomWith(store2);next.join(p.id,await store2.get(p.id));
  assert.equal(next.players.get(p.id).name,safety);assert.equal(next.command(p.id,'civilian').ok,true);assert.equal(next.players.get(p.id).name,civilian);
  const alias=store2.claimName('visitor:other','safety',safety);assert.notEqual(nicknameKey(alias),nicknameKey(safety));
});
