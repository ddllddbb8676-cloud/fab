import test from 'node:test';
import assert from 'node:assert/strict';
import {bindEmoteStrip} from '../src/emote-strip.js';

class Target {
  listeners=new Map();scrollLeft=0;scrollWidth=804;clientWidth=366;
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  emit(type,data={}){
    const event={pointerId:1,clientX:100,clientY:100,button:0,detail:1,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...data};
    for(const fn of this.listeners.get(type)||[]){fn(event);if(event.stopped)break;}
    return event;
  }
}
function fixture(){
  const document=new Target(),strip=new Target(),window=new Target();document.defaultView=window;document.hidden=false;strip.ownerDocument=document;let time=0;
  const dispose=bindEmoteStrip(strip,{now:()=>time});
  return {strip,document,window,dispose,advance:ms=>{time+=ms;},down:(data)=>strip.emit('pointerdown',data),move:(data)=>document.emit('pointermove',data),up:(data)=>document.emit('pointerup',data),click:(data)=>strip.emit('click',data)};
}
test('a tap and small finger jitter activate while a horizontal or vertical drag does not',()=>{
  const f=fixture();f.down();f.move({clientX:108});f.up({clientX:108});assert.equal(f.click().defaultPrevented,false);
  for(const point of [{clientX:109},{clientY:109}]){f.down();f.move(point);f.up(point);const click=f.click();assert.equal(click.defaultPrevented,true);assert.equal(click.stopped,true);}
  f.dispose();
});
test('dragging back to the starting point is still a drag, including a long hold',()=>{
  const f=fixture();f.down();f.move({clientX:140});f.advance(2000);f.move({clientX:100});f.up();assert.equal(f.click().defaultPrevented,true);f.dispose();
});
test('a new pointer gesture immediately restores normal tapping after a swipe or cancel',()=>{
  const f=fixture();f.down();f.move({clientX:160});f.up({clientX:160});assert.equal(f.click().defaultPrevented,true);
  f.down();f.up();assert.equal(f.click().defaultPrevented,false);
  f.down();f.document.emit('pointercancel');assert.equal(f.click().defaultPrevented,true);
  f.down();f.up();assert.equal(f.click().defaultPrevented,false);f.dispose();
});
test('native scrolling suppresses its trailing click even if the scroll event arrives after pointerup',()=>{
  const f=fixture();f.down();f.strip.scrollLeft=50;f.up();assert.equal(f.click().defaultPrevented,true);
  f.strip.emit('scroll');assert.equal(f.click().defaultPrevented,true);
  f.down();f.up();assert.equal(f.click().defaultPrevented,false);f.dispose();
});
test('keyboard and assistive clicks work during the pointer suppression period',()=>{
  const f=fixture();f.down();f.move({clientX:160});f.up({clientX:160});assert.equal(f.click({detail:0}).defaultPrevented,false);assert.equal(f.click().defaultPrevented,true);f.dispose();
});
test('a backgrounded tab or blurred window recovers even when a pointer never ends',()=>{
  const f=fixture();f.down();f.document.hidden=true;f.document.emit('visibilitychange');assert.equal(f.click().defaultPrevented,true,'late click after hiding is ignored');
  f.document.hidden=false;f.document.emit('visibilitychange');f.down({pointerId:2});f.up({pointerId:2});assert.equal(f.click().defaultPrevented,false,'new pointer after returning works');
  f.down({pointerId:3});f.window.emit('blur');assert.equal(f.click().defaultPrevented,true);
  f.down({pointerId:4});f.up({pointerId:4});assert.equal(f.click().defaultPrevented,false,'blur cannot leave an old pointer tracked');f.dispose();
});
test('a scroll without a tracked pointer briefly blocks pointer-style clicks but not keyboard activation',()=>{
  const f=fixture();f.strip.scrollLeft=50;f.strip.emit('scroll');assert.equal(f.click().defaultPrevented,true);assert.equal(f.click({detail:0}).defaultPrevented,false);
  f.advance(751);assert.equal(f.click().defaultPrevented,false,'old scrolling does not leave a permanent block');f.dispose();
});
test('unrelated canvas or joystick pointer events cannot cancel an emote tap',()=>{
  const f=fixture();f.down({pointerId:2});f.move({pointerId:1,clientX:250});f.document.emit('pointercancel',{pointerId:1});f.up({pointerId:2});assert.equal(f.click().defaultPrevented,false);f.dispose();
});
test('two fingers within the strip do not trigger an emote and the next tap works',()=>{
  const f=fixture();f.down({pointerId:1});f.down({pointerId:2});f.up({pointerId:1});f.up({pointerId:2});assert.equal(f.click().defaultPrevented,true);
  f.down();f.up();assert.equal(f.click().defaultPrevented,false);f.dispose();
});
test('vertical and horizontal mouse wheels scroll the strip within its limits',()=>{
  const f=fixture();assert.equal(f.strip.emit('wheel',{deltaY:3,deltaMode:1}).defaultPrevented,true);assert.equal(f.strip.scrollLeft,48);
  assert.equal(f.click().defaultPrevented,true);assert.equal(f.click({detail:0}).defaultPrevented,false);
  f.strip.emit('wheel',{deltaX:1000,deltaY:2,deltaMode:0});assert.equal(f.strip.scrollLeft,438);
  assert.equal(f.strip.emit('wheel',{deltaY:2}).defaultPrevented,false,'wheel at the edge is not swallowed');
  f.strip.emit('wheel',{deltaY:-1,deltaMode:2});assert.equal(f.strip.scrollLeft,72);
  assert.equal(f.strip.emit('wheel',{deltaY:100,ctrlKey:true}).defaultPrevented,false);assert.equal(f.strip.scrollLeft,72,'pinch zoom is untouched');f.dispose();
});
test('an overflowing strip is required for wheel conversion and cleanup removes all listeners',()=>{
  const f=fixture();f.strip.scrollWidth=f.strip.clientWidth;assert.equal(f.strip.emit('wheel',{deltaY:50}).defaultPrevented,false);assert.equal(f.strip.scrollLeft,0);
  f.dispose();assert.ok([...f.strip.listeners.values(),...f.document.listeners.values(),...f.window.listeners.values()].every(set=>set.size===0));
});
