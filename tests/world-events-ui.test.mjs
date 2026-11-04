import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldEventsUI} from '../src/world-events-ui.js';
function element(){return {hidden:false,children:[],queries:new Map(),listeners:new Map(),textContent:'',innerHTML:'',append(...e){this.children.push(...e);},setAttribute(){},remove(){},querySelector(key){if(!this.queries.has(key))this.queries.set(key,element());return this.queries.get(key);},addEventListener(key,listener){this.listeners.set(key,listener);}};}
function setup(){let time=0,settled=false,visible=true;const calls=[],travel=[],commands=[],doc={createElement:element,body:element()};const ui=createWorldEventsUI({document:doc,now:()=>time,canCelebrate:()=>settled,ready:()=>visible,onVictory:id=>calls.push(id),onTravel:p=>travel.push(p),command:async(...args)=>{commands.push(args);return {ok:true,eventTravel:{x:4,z:71.8,bayId:17}};}});return {ui,calls,travel,commands,card:doc.body.children[0],result:doc.body.children[1],clock:n=>time=n,settle:()=>settled=true,visible:v=>visible=v};}
const success={serverNow:1000,golden:null,bay:{id:'bay:1',bayId:17,phase:'success',startsAt:1,endsAt:60001,finishedAt:1000,total:20,remaining:0,reward:200}};
test('large 200-chip receipt waits for the persisted personal award and completed collapse, then lasts three seconds once',()=>{
  const f=setup();f.ui.frame(success);assert.equal(f.calls.length,0);assert.equal(f.result.hidden,true);
  f.ui.wallet({lastEventRewardId:'other'});assert.equal(f.calls.length,0);
  f.ui.wallet({lastEventRewardId:'bay:1'});assert.equal(f.calls.length,0,'collapse still running');
  f.settle();f.ui.update();assert.deepEqual(f.calls,[17]);assert.match(f.result.innerHTML,/\+200/);assert.match(f.result.innerHTML,/칩 적립/);assert.equal(f.result.hidden,false);
  f.visible(false);f.ui.update();assert.equal(f.result.hidden,true);f.visible(true);f.clock(2999);f.ui.update();assert.equal(f.result.hidden,false);f.clock(3000);f.ui.update();assert.equal(f.result.hidden,true);
  f.ui.frame({...success,serverNow:4000});assert.deepEqual(f.calls,[17]);
});
test('late join and reconnect do not replay a historical success reward or camera',()=>{
  const f=setup();f.settle();f.ui.wallet({lastEventRewardId:'bay:1'});f.ui.frame(success,true);f.ui.frame({...success,serverNow:1200});assert.deepEqual(f.calls,[]);assert.equal(f.result.hidden,true);
  f.ui.disconnect();f.ui.frame({...success,serverNow:1500},true);assert.equal(f.calls.length,0);
});
test('a hidden game waits to present the receipt; bay travel sends only the current event ID and uses the server destination',async()=>{
  const f=setup();f.settle();f.visible(false);f.ui.frame(success);f.ui.wallet({lastEventRewardId:'bay:1'});assert.equal(f.calls.length,0);f.visible(true);f.ui.update();assert.equal(f.calls.length,1);
  f.ui.frame({...success,serverNow:2000,bay:{...success.bay,id:'bay:2',phase:'preparing',startsAt:62000}});
  const button=f.card.querySelector('.event-bay').querySelector('button');await button.listeners.get('click')();
  assert.deepEqual(f.commands,[['bay-travel',{eventId:'bay:2'}]]);assert.deepEqual(f.travel,[{x:4,z:71.8,bayId:17}]);assert.equal(button.disabled,false);
});
