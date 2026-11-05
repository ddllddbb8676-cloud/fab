import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createContestUI} from '../src/foup-contest-view.js';
import {createContestPhotos} from '../src/contest-photos.js';

function element(){return {hidden:false,children:[],queries:new Map(),listeners:new Map(),textContent:'',innerHTML:'',append(...e){this.children.push(...e);},replaceChildren(...e){this.children=e;},setAttribute(){},querySelector(key){if(!this.queries.has(key))this.queries.set(key,element());return this.queries.get(key);},addEventListener(key,listener){this.listeners.set(key,listener);}};}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  let time=0,visible=true;const shots=[],commands=[],zones=[],doc={createElement:element,body:element()};
  const ui=createContestUI({doc,now:()=>time,command:async(...args)=>{commands.push(args);return {ok:true,team:'referee'};},ready:()=>visible,getId:()=>1,onGather:()=>true,onTeam:()=>{},setZones:(...v)=>zones.push(v),toast:()=>{},onResult:async id=>{shots.push(id);return {black:element(),white:element()};}});
  const card=doc.body.children[0],result=doc.body.children[1];
  return {ui,card,result,commands,shots,zones,clock:v=>time=v,visible:v=>visible=v};
}
const active={id:'contest:0',phase:'active',startsAt:30000,endsAt:210000,black:2,white:1,joined:2};
const ended={...active,phase:'finished',winner:'black',rewards:{black:60,white:15}};
test('the referee can gather and receives a composed two-zone result with both per-person awards',async()=>{
  const f=fixture();f.ui.roster([[1,'operator','visitor',{},'referee']]);f.ui.frame({serverNow:30000,contest:active});
  const button=f.card.querySelector('button');assert.equal(button.hidden,false);assert.equal(button.textContent,'함께 이동하기');await button.listeners.get('click')();
  assert.deepEqual(f.commands,[['contest-visit',{eventId:active.id}]]);
  f.ui.roster([[1,'operator','visitor',{}]]);f.ui.frame({serverNow:210000,contest:ended});await flush();
  assert.equal(f.result.hidden,false);assert.equal(f.card.hidden,true);
  for(const [team,value]of [['black',60],['white',15]]){const figure=f.result.querySelector('.result-'+team);assert.equal(figure.querySelector('.contest-award').textContent,`1인당 +${value}칩`);assert.equal(figure.querySelector('.contest-photo').children.length,1);}
  assert.match(f.result.querySelector('.contest-receipt').textContent,/관전/);assert.deepEqual(f.shots,[active.id]);
  f.ui.frame({serverNow:210001,contest:ended});await flush();assert.equal(f.shots.length,1);
  f.result.querySelector('button').listeners.get('click')();f.ui.frame({serverNow:210002,contest:ended});assert.equal(f.result.hidden,true);
});
test('receipt waits for the authoritative wallet and survives end-roster reset; zero awards never say pending',()=>{
  const f=fixture();f.ui.roster([[1,'player','visitor',{},'black']]);f.ui.frame({serverNow:30000,contest:active});
  f.ui.roster([[1,'player','visitor',{}]]);f.ui.frame({serverNow:210000,contest:ended});
  const receipt=f.result.querySelector('.contest-receipt');assert.match(receipt.textContent,/60칩 · 적립 확인 중/);assert.doesNotMatch(receipt.textContent,/완료/);
  f.ui.wallet({lastEventRewardId:active.id,lastEventRewardAmount:60});assert.match(receipt.textContent,/60칩 적립 완료/);
  f.visible(false);f.ui.update();assert.equal(f.result.hidden,true);f.visible(true);f.ui.update();assert.equal(f.result.hidden,false);
  f.clock(12000);f.ui.update();assert.equal(f.result.hidden,true);assert.deepEqual(f.zones.at(-1),[false,false]);
  const zero=fixture();zero.ui.roster([[1,'p','visitor',{},'white']]);zero.ui.frame({serverNow:30000,contest:active});zero.ui.frame({serverNow:210000,contest:{...ended,white:0,rewards:{black:60,white:0}}});assert.equal(zero.result.querySelector('.contest-receipt').textContent,'내 보상 0칩');
});
test('two small offscreen renders restore renderer and overview state and leave the game camera untouched',async()=>{
  const camera=new THREE.PerspectiveCamera();camera.position.set(3,4,5);const before=camera.toJSON();
  let target=null,renders=0,reads=0,disposed=0;const overview=[],shots=[];
  class Target extends THREE.WebGLRenderTarget{dispose(){disposed++;super.dispose();}}
  const renderer={getRenderTarget:()=>target,setRenderTarget:t=>target=t,render:(_s,c)=>{renders++;shots.push(c.position.clone());},readRenderTargetPixelsAsync:async(_t,_x,_y,w,h,buffer)=>{reads++;buffer.fill(200);assert.equal(w,256);assert.equal(h,256);}};
  const doc={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})})};
  const photos=createContestPhotos({THREE:{...THREE,WebGLRenderTarget:Target},renderer,scene:{},batches:[],overview:v=>overview.push(v),doc});
  const done=photos.request('match');for(let i=0;i<5;i++){photos.renderNext();await flush();}
  assert.deepEqual(Object.keys(await done),['black','white']);assert.equal(renders,2);assert.equal(reads,2);assert.equal(disposed,2);assert.equal(target,null);assert.deepEqual(overview,[true,false,true,false]);assert.notEqual(shots[0].z,shots[1].z);assert.deepEqual(camera.toJSON(),before);
});
test('a failed GPU readback cannot block the second view or retain its target; cancellation resolves pending work',async()=>{
  let target=null,attempt=0;const renderer={getRenderTarget:()=>target,setRenderTarget:t=>target=t,render(){},readRenderTargetPixelsAsync:async()=>{attempt++;throw Error('context lost');}};
  const photos=createContestPhotos({THREE,renderer,scene:{},batches:[],overview:()=>{},doc:{}});
  const done=photos.request('failed');photos.renderNext();await flush();photos.renderNext();await flush();assert.deepEqual(await done,{});assert.equal(attempt,2);assert.equal(target,null);
  const cancelled=photos.request('cancel');photos.cancel();assert.deepEqual(await cancelled,{});photos.renderNext();assert.equal(attempt,2);
});
