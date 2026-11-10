import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminRanking} from '../server/admin-ranking.js';
const id=n=>'visitor:'+n.toString(16).padStart(64,'0');
function storage(){const records=new Map();return {records,list:async({prefix,startAfter,limit})=>new Map([...records].filter(([k])=>k.startsWith(prefix)&&(!startAfter||k>startAfter)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit)),put:async batch=>{for(const [k,v] of Object.entries(batch))records.set(k,structuredClone(v));},delete:async keys=>{for(const k of keys)records.delete(k);}};}
test('all offline and zero-score users paginate by 50 with stable ties, excluding only NPC and verification IDs',async()=>{
 const db=storage(),r=createAdminRanking({excludedIds:[id(999)]});await r.load(db);
 for(let i=1;i<=103;i++)r.observe({id:id(i),name:'이용자'+i,brokenCount:i%5,repairedCount:i});
 r.observe({id:id(999),name:'검증',brokenCount:9999});r.observe({id:'npc:1',name:'NPC',brokenCount:9999});
 const a=r.page(1),b=r.page(2),c=r.page(3);assert.equal(a.total,103);assert.equal(a.rows.length,50);assert.equal(b.rows.length,50);assert.equal(c.rows.length,3);assert.equal(c.rows.at(-1).rank,103);
 const all=[...a.rows,...b.rows,...c.rows];assert.equal(new Set(all.map(p=>p.id)).size,103);assert.ok(all.some(p=>p.brokenCount===0));
 for(let i=1;i<all.length;i++)assert.ok(all[i-1].brokenCount>all[i].brokenCount||(all[i-1].brokenCount===all[i].brokenCount&&all[i-1].id<all[i].id));
 for(const p of [-1,NaN,1.5])assert.equal(r.page(p).page,1);assert.equal(r.page(999).page,3);
 r.observe({id:id(5),civilianName:'본래 이름',name:'안전팀',brokenCount:200,repairedCount:6});assert.equal(r.page().rows[0].name,'본래 이름');assert.equal(r.page().rows[0].repairedCount,6);
 r.remove(id(5));assert.equal(r.page().total,102);
});
test('visits deduplicate reconnects and active sessions; a return after 30 minutes counts again and survives restart',async()=>{
 let at=Date.parse('2026-11-10T04:00:00Z');const db=storage(),options={now:()=>at};let r=createAdminRanking(options);await r.load(db);
 const p={id:id(1),name:'손님',brokenCount:10};r.observe(p);r.connect(p.id,{existing:true});assert.equal(r.page().rows[0].joinedDate,null);
 at+=3600000;r.sync([p.id]);r.connect(p.id);assert.equal(r.page().rows[0].visitCount,1);
 r.sync([]);at+=5*60000;r.connect(p.id);assert.equal(r.page().rows[0].visitCount,1);
 r.sync([]);at+=31*60000;r.connect(p.id);assert.equal(r.page().rows[0].visitCount,2);await r.flush(db);
 const stamp=r.page().visitTrackingStartedAt;r=createAdminRanking(options);await r.load(db);r.observe(p);at+=3600000;r.connect(p.id,{restored:true});assert.equal(r.page().rows[0].visitCount,2);assert.equal(r.page().visitTrackingStartedAt,stamp);
 r.observe({id:id(2),name:'신규'});r.connect(id(2),{existing:false});assert.equal(r.page().rows.find(p=>p.id===id(2)).joinedDate,'2026-11-10');
});
test('historical dates can be recovered without inventing lifetime visit counts or changing game profiles',async()=>{
 const db=storage(),r=createAdminRanking();await r.load(db);const p={id:id(1),name:'기존',wallet:{chips:123},brokenCount:7};db.records.set('profile:'+p.id,structuredClone(p));r.observe(p);
 r.rememberDates([id(1),id(2)],['2026-11-05','2026-11-04']);assert.equal(r.page().rows[0].joinedDate,'2026-11-05');assert.equal(r.page().rows[0].visitCount,0);
 r.rememberDates([id(1)],['2026-11-09']);assert.equal(r.page().rows[0].joinedDate,'2026-11-05');await r.flush(db);assert.deepEqual(db.records.get('profile:'+p.id),p);
 const reads=db.list;db.list=()=>{throw Error('No rescans on page reads');};r.page(1);r.page(2);db.list=reads;
 r.remove(id(1));await r.flush(db);assert.equal(db.records.has('admin:visits:v1:'+id(1)),false);assert.deepEqual(db.records.get('profile:'+p.id),p);
});
test('failed and overlapping visit writes retain the latest count, and metadata batches are bounded',async()=>{
 let at=Date.now();const db=storage(),r=createAdminRanking({now:()=>at});await r.load(db);for(let i=1;i<=300;i++){r.observe({id:id(i),name:'유저'});r.connect(id(i));}
 const put=db.put;let fail=true;db.put=async batch=>{assert.ok(Object.keys(batch).length<=128);if(fail)throw Error('storage');return put(batch);};await assert.rejects(r.flush(db));
 r.sync([]);at+=31*60000;r.connect(id(1));fail=false;await r.flush(db);assert.equal(db.records.get('admin:visits:v1:'+id(1)).count,2);
 let release;db.put=async batch=>{await new Promise(r=>{release=r;});return put(batch);};r.sync([]);at+=31*60000;r.connect(id(1));const writing=r.flush(db);await Promise.resolve();await Promise.resolve();r.sync([]);at+=31*60000;r.connect(id(1));release();await writing;db.put=put;await r.flush(db);assert.equal(db.records.get('admin:visits:v1:'+id(1)).count,4);
 let rejectWrite;db.put=async()=>new Promise((resolve,reject)=>{rejectWrite=reject;});r.sync([]);at+=31*60000;r.connect(id(1));const failed=r.flush(db);const rejected=assert.rejects(failed);await Promise.resolve();await Promise.resolve();r.sync([]);at+=31*60000;r.connect(id(1));const queued=assert.rejects(r.flush(db));rejectWrite(Error('overlapping storage failure'));await Promise.all([rejected,queued]);db.put=put;await r.flush(db);await r.flush(db);assert.equal(db.records.get('admin:visits:v1:'+id(1)).count,6);
});
