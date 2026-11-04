import test from 'node:test';
import assert from 'node:assert/strict';
import {createLeaderboard} from '../src/leaderboard.js';

class Element extends EventTarget{
  constructor(document){super();this.ownerDocument=document;this.children=[];this.attrs={};this.hidden=false;const classes=new Set();this.classList={toggle:(name,on)=>on?classes.add(name):classes.delete(name),contains:name=>classes.has(name)};}
  setAttribute(name,value){this.attrs[name]=String(value);}
  getAttribute(name){return this.attrs[name];}
  append(...children){this.children.push(...children);}
  appendChild(child){this.children.push(child);}
  replaceChildren(fragment){this.children=[...fragment.children];}
}
function event(type,props={}){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:1,clientX:100,clientY:100,button:0,detail:1},props);return e;}
function fixture(){
  const document=new EventTarget();document.createElement=()=>new Element(document);document.createDocumentFragment=document.createElement;
  const element=document.createElement(),list=document.createElement(),empty=document.createElement(),button=document.createElement();
  element.querySelector=name=>({'ol':list,'.leaderboard-empty':empty,'button.leaderboard-heading':button})[name];
  const view=createLeaderboard(element);return {document,element,list,empty,button,view,tap:()=>{button.dispatchEvent(event('pointerdown'));document.dispatchEvent(event('pointerup'));button.dispatchEvent(event('click'));}};
}
test('folded ranking stays folded through score changes, name changes, empty results and reconnection',()=>{
  const f=fixture();f.view.setRanking([{id:'a',name:'name',brokenCount:4}]);assert.equal(f.list.hidden,false);f.tap();
  for(let i=0;i<20;i++){f.view.setRanking([{id:'a',name:'changed-'+i,brokenCount:5+i}]);f.view.setSelf('a');f.view.setPeople([]);f.view.setRoster([]);f.view.setOnline(false);f.view.setOnline(true);assert.equal(f.button.getAttribute('aria-expanded'),'false');assert.equal(f.list.hidden,true);assert.equal(f.empty.hidden,true);}
  f.view.setRanking([]);assert.equal(f.empty.hidden,true);f.view.setRanking([{id:'a',name:'latest',brokenCount:42}]);f.tap();assert.equal(f.list.hidden,false);assert.equal(f.list.children[0].children[1].textContent,'latest');assert.equal(f.list.children[0].children[2].textContent,'42');
});
test('rebinding the same screen neither reopens it nor creates duplicate toggle handlers',()=>{
  const f=fixture();f.tap();const again=createLeaderboard(f.element);assert.equal(again,f.view);assert.equal(f.list.hidden,true);again.setOnline(true);assert.equal(f.list.hidden,true);f.tap();assert.equal(f.button.getAttribute('aria-expanded'),'true');
});
test('a fresh screen starts expanded without persisting a prior screen choice',()=>{
  const old=fixture();old.tap();const fresh=fixture();assert.equal(fresh.button.getAttribute('aria-expanded'),'true');assert.equal(fresh.list.hidden,false);assert.equal(old.list.hidden,true);
});
test('dragging or cancelling over the heading cannot accidentally unfold, but new taps and keyboard still work',()=>{
  const f=fixture();f.tap();f.button.dispatchEvent(event('pointerdown'));f.document.dispatchEvent(event('pointermove',{clientX:140}));f.document.dispatchEvent(event('pointerup',{clientX:140}));const click=event('click');f.button.dispatchEvent(click);assert.equal(click.defaultPrevented,true);assert.equal(f.list.hidden,true);
  f.tap();assert.equal(f.list.hidden,false);f.tap();f.button.dispatchEvent(event('pointerdown'));f.document.dispatchEvent(event('pointercancel'));f.button.dispatchEvent(event('click'));assert.equal(f.list.hidden,true);f.button.dispatchEvent(event('click',{detail:0}));assert.equal(f.list.hidden,false);
});
