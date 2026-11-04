import test from 'node:test';
import assert from 'node:assert/strict';
import {createEventControls} from '../admin/events.js';
const at=Date.parse('2026-11-04T17:00:00+09:00'),idle={serverNow:at,nextGoldenAt:at+3*3600000,bay:null,golden:null};
function setup(fetcher){const nodes=new Map();const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,{textContent:'',disabled:false,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});return nodes.get(id);}};const ui=createEventControls(doc,{fetcher,now:()=>at,newId:()=> '00000000-0000-0000-0000-000000000003'});return {ui,get:id=>doc.getElementById(id)};}
test('manual start buttons wait for known state, send one request on double click, and display preparation',async()=>{
 let posts=0,body;const f=setup(async(url,options)=>{if(options.method!=='POST')return Response.json({worldEvents:idle});posts++;body=JSON.parse(options.body);return Response.json({ok:true,event:{bayId:4},worldEvents:{...idle,bay:{bayId:4,phase:'preparing',startsAt:at+60000,endsAt:at+120000}}});});
 assert.equal(f.get('start-bay-event').disabled,true);await f.ui.refresh();assert.equal(f.get('start-bay-event').disabled,false);
 await Promise.all([f.get('start-bay-event').listeners.click(),f.get('start-bay-event').listeners.click()]);assert.equal(posts,1);assert.equal(body.kind,'bay');assert.match(f.get('event-message').textContent,/5번 BAY 예고 시작/);assert.equal(f.get('start-golden-event').disabled,true);
});
test('a lost response retries the same request and denied status leaves controls disabled',async()=>{
 const sent=[];const f=setup(async(url,options)=>{if(options.method!=='POST')return Response.json({worldEvents:idle});sent.push(JSON.parse(options.body));if(sent.length===1)throw Error('Disconnected');return Response.json({ok:true,replayed:true,event:{},worldEvents:idle});});
 await f.ui.refresh();await f.get('start-golden-event').listeners.click();await f.get('start-golden-event').listeners.click();assert.deepEqual(sent[0],sent[1]);assert.match(f.get('event-message').textContent,/이미 접수/);
 const denied=setup(async()=>new Response('',{status:403}));await denied.ui.refresh();assert.equal(denied.get('start-bay-event').disabled,true);
});
test('status blocks overlap and protects the upcoming regular golden slot',()=>{
 const f=setup();f.ui.render({...idle,nextGoldenAt:at+9*60000});assert.equal(f.get('start-golden-event').disabled,true);assert.equal(f.get('start-bay-event').disabled,false);
 f.ui.render({...idle,nextGoldenAt:at+119000});assert.equal(f.get('start-bay-event').disabled,true);
 f.ui.render({...idle,golden:{endsAt:at+600000,total:20,remaining:18}});assert.equal(f.get('start-bay-event').disabled,true);assert.match(f.get('event-status').textContent,/18\/20/);
});
test('the two-bay button sends an explicit bounded mode and disables all start buttons together',async()=>{
 let body;const f=setup(async(url,options)=>{if(options.method!=='POST')return Response.json({worldEvents:idle});body=JSON.parse(options.body);return Response.json({ok:true,event:{bayId:4,bayLimit:2},worldEvents:{...idle,bay:{bayId:4,bayLimit:2,phase:'preparing',startsAt:at+60000,endsAt:at+120000}}});});
 await f.ui.refresh();await f.get('start-double-bay-event').listeners.click();assert.equal(body.bayCount,2);assert.match(f.get('event-message').textContent,/2개 베이 모드/);assert.match(f.get('event-status').textContent,/2개 베이 모드/);
 for(const id of ['start-bay-event','start-double-bay-event','start-golden-event'])assert.equal(f.get(id).disabled,true);
});
