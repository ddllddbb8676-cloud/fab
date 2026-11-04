import test from 'node:test';
import assert from 'node:assert/strict';
import {bindEmoteStrip} from '../src/emote-strip.js';

class Target {
  listeners=new Map();children=[];attrs={};dataset={};hidden=false;clientWidth=386;
  style={setProperty(){}};
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  append(...nodes){for(const node of nodes){node.remove();node.parent=this;this.children.push(node);}}
  remove(){if(this.parent){this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}}
  setAttribute(name,value){this.attrs[name]=String(value);}
  getAttribute(name){return this.attrs[name];}
  querySelectorAll(){return this.children.flatMap(child=>[...(child.dataset.emote?[child]:[]),...child.querySelectorAll()]);}
  focus(){this.ownerDocument.activeElement=this;}
  emit(type,data={}){
    const event={pointerId:1,clientX:100,clientY:100,button:0,detail:1,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=true;},...data};
    for(const fn of this.listeners.get(type)||[]){fn(event);if(event.stopped)break;}
    return event;
  }
}
function fixture({width=386,count=27}={}){
  const document=new Target(),strip=new Target(),window=new Target();document.defaultView=window;document.hidden=false;strip.ownerDocument=document;strip.clientWidth=width;
  document.createElement=()=>{const el=new Target();el.ownerDocument=document;return el;};
  const buttons=Array.from({length:count},(_,i)=>{const b=document.createElement();b.dataset.emote='emote-'+i;return b;});strip.append(...buttons);
  let time=0;
  const dispose=bindEmoteStrip(strip,{now:()=>time});
  const next=strip.children.find(el=>el.className==='emote-next');
  return {strip,document,window,buttons,next,dispose,visible:()=>buttons.filter(b=>!b.hidden).map(b=>b.dataset.emote),advance:ms=>{time+=ms;},resize:width=>{strip.clientWidth=width;window.emit('resize');},down:data=>strip.emit('pointerdown',data),move:data=>document.emit('pointermove',data),up:data=>document.emit('pointerup',data),click:data=>strip.emit('click',data)};
}
const ids=(start,count)=>Array.from({length:count},(_,i)=>'emote-'+(start+i));

test('every supported width keeps the same nine choices per row',()=>{
  for(const width of [304,344,374,386,414,426]){
    const f=fixture({width});assert.deepEqual(f.visible(),ids(0,9));f.dispose();
  }
});
test('one short down swipe advances exactly one whole row and up returns to the previous row',()=>{
  const f=fixture();f.down();f.move({clientY:130});f.up({clientY:130});assert.deepEqual(f.visible(),ids(9,9));assert.equal(f.click().defaultPrevented,true);
  f.down();f.move({clientY:90});f.up({clientY:85});assert.deepEqual(f.visible(),ids(0,9));
  f.down();f.move({clientY:500});f.up({clientY:500});f.up({clientY:500});assert.deepEqual(f.visible(),ids(9,9),'long swipes cannot skip multiple rows');f.dispose();
});
test('small jitter taps work; horizontal, diagonal, and returned drags never select or advance',()=>{
  const f=fixture();f.down();f.move({clientX:108});f.up({clientX:108});assert.equal(f.click().defaultPrevented,false);
  for(const point of [{clientX:140},{clientX:140,clientY:120},{clientY:113}]){f.down();f.move(point);f.up(point);assert.deepEqual(f.visible(),ids(0,9));assert.equal(f.click().defaultPrevented,true);}
  f.down();f.move({clientY:140});f.advance(2000);f.move({clientY:100});f.up();assert.equal(f.click().defaultPrevented,true);assert.deepEqual(f.visible(),ids(0,9));f.dispose();
});
test('a deliberate new tap is allowed immediately after a swipe or cancellation',()=>{
  const f=fixture();f.down();f.up({clientY:125});assert.equal(f.click().defaultPrevented,true);
  f.down();f.up();assert.equal(f.click().defaultPrevented,false);
  f.down();f.document.emit('pointercancel');assert.equal(f.click().defaultPrevented,true);
  f.down();f.up();assert.equal(f.click().defaultPrevented,false);f.dispose();
});
test('next-row button reaches every emoji and wraps, with only one row in the tab order',()=>{
  const f=fixture(),seen=[];
  for(let i=0;i<3;i++){seen.push(...f.visible());f.next.emit('click');}
  assert.deepEqual(seen,ids(0,27));assert.deepEqual(f.visible(),ids(0,9));assert.match(f.next.getAttribute('aria-label'),/1\/3/);f.dispose();
});
test('keyboard paging keeps focus visible, stops game keys, and permits assistive clicks',()=>{
  const f=fixture();f.buttons[0].focus();const event=f.strip.emit('keydown',{key:'ArrowDown'});assert.equal(event.defaultPrevented,true);assert.equal(event.stopped,true);assert.equal(f.document.activeElement,f.buttons[9]);
  f.down();f.up({clientY:125});assert.equal(f.click({detail:0}).defaultPrevented,false);assert.equal(f.click().defaultPrevented,true);
  f.strip.emit('keydown',{key:'PageUp'});assert.ok(!f.document.activeElement.hidden);f.dispose();
});
test('multiple fingers, cancellation, backgrounding and blur cannot advance or trigger an emote',()=>{
  const f=fixture();f.down({pointerId:1});f.down({pointerId:2});f.up({pointerId:1,clientY:150});f.up({pointerId:2,clientY:150});assert.deepEqual(f.visible(),ids(0,9));assert.equal(f.click().defaultPrevented,true);
  for(const kind of ['cancel','hidden','blur']){f.down();f.move({clientY:150});if(kind==='cancel')f.document.emit('pointercancel');if(kind==='hidden'){f.document.hidden=true;f.document.emit('visibilitychange');f.document.hidden=false;}if(kind==='blur')f.window.emit('blur');f.up({clientY:150});assert.deepEqual(f.visible(),ids(0,9));}
  f.down();f.up();assert.equal(f.click().defaultPrevented,false);f.dispose();
});
test('canvas and joystick pointers are not consumed or counted as emoji gestures',()=>{
  const f=fixture();f.down({pointerId:2});assert.equal(f.move({pointerId:1,clientY:300}).defaultPrevented,false);f.document.emit('pointercancel',{pointerId:1});f.up({pointerId:2});assert.equal(f.click().defaultPrevented,false);assert.deepEqual(f.visible(),ids(0,9));f.dispose();
});
test('wheel advances by one row per burst while pinch and horizontal movement are untouched',()=>{
  const f=fixture();assert.equal(f.strip.emit('wheel',{deltaY:40}).defaultPrevented,true);assert.deepEqual(f.visible(),ids(9,9));f.strip.emit('wheel',{deltaY:40});assert.deepEqual(f.visible(),ids(9,9));
  f.advance(250);f.strip.emit('wheel',{deltaY:-40});assert.deepEqual(f.visible(),ids(0,9));assert.equal(f.strip.emit('wheel',{deltaY:40,ctrlKey:true}).defaultPrevented,false);assert.equal(f.strip.emit('wheel',{deltaX:40,deltaY:0}).defaultPrevented,false);f.dispose();
});
test('resize keeps the current focused emoji available and disposal restores original buttons',()=>{
  const f=fixture();f.next.emit('click');f.buttons[10].focus();f.resize(304);assert.ok(!f.buttons[10].hidden);assert.equal(f.visible().length,9);
  f.dispose();assert.deepEqual(f.strip.children,f.buttons);assert.ok(f.buttons.every(b=>!b.hidden));assert.ok([...f.strip.listeners.values(),...f.document.listeners.values(),...f.window.listeners.values(),...f.next.listeners.values()].every(set=>set.size===0));
});
test('a single row hides the page button and empty strips need no listeners',()=>{
  const f=fixture({count:3});assert.equal(f.next.hidden,true);assert.equal(f.strip.emit('wheel',{deltaY:10}).defaultPrevented,false);f.dispose();const empty=fixture({count:0});assert.equal(empty.next,undefined);empty.dispose();
});
