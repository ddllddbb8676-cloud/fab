import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoMode} from '../src/view-controls.js';
import {createCaptureTime,captureImage} from '../src/capture-time.js';

class Element extends EventTarget{
  constructor(tag,doc){super();this.tagName=tag;this.doc=doc;this.children=[];this.hidden=false;this.inert=false;this.attrs={};this.nodes=new Map();this.classes=new Set();this.classList={add:x=>this.classes.add(x),remove:x=>this.classes.delete(x),contains:x=>this.classes.has(x)};}
  append(...children){this.children.push(...children);}
  setAttribute(k,v){this.attrs[k]=String(v);}
  removeAttribute(k){delete this.attrs[k];if(k==='src')this.src='';}
  getAttribute(k){return this.attrs[k];}
  focus(){this.doc.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;this.dispatchEvent(new Event('close'));}
  set innerHTML(html){for(const match of html.matchAll(/class="([^"]+)"/g))for(const name of match[1].split(' '))this.nodes.set('.'+name,new Element('div',this.doc));this.nodes.set('button',new Element('button',this.doc));}
  querySelector(q){return this.nodes.get(q);}
}
function documentFixture(){const doc=new EventTarget();doc.createElement=tag=>new Element(tag,doc);doc.body=doc.createElement('body');doc.head=doc.createElement('head');return doc;}
function photoFixture(options={}){const document=documentFixture(),button=document.createElement('button'),world=document.createElement('main'),panel=document.createElement('section');panel.inert=true;document.body.append(button,world,panel);const toggles=[];const mode=createPhotoMode({button,document,onToggle:value=>toggles.push(value),...options});return {document,button,world,panel,toggles,mode,exit:document.body.children.find(e=>e.id==='photo-exit'),hint:document.body.children.find(e=>e.id==='photo-hint')};}
test('photo tap restores prior UI access and cannot also trigger a game click',()=>{
  const f=photoFixture();f.button.dispatchEvent(new Event('click'));assert.equal(f.mode.isOpen,true);assert.equal(f.document.body.classList.contains('photo-mode'),true);assert.equal(f.world.inert,true);
  let stray=0;f.exit.addEventListener('click',()=>stray++);const tap=new Event('click',{cancelable:true});f.exit.dispatchEvent(tap);
  assert.equal(tap.defaultPrevented,true);assert.equal(stray,0);assert.equal(f.mode.isOpen,false);assert.equal(f.world.inert,false);assert.equal(f.panel.inert,true);assert.equal(f.document.activeElement,f.button);assert.deepEqual(f.toggles,[true,false]);
});
test('photo hint clears, Escape and backgrounding restore controls, and entry can deny activation',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const f=photoFixture();f.mode.open();t.mock.timers.tick(1601);assert.equal(f.hint.hidden,true);
  const key=new Event('keydown',{cancelable:true});key.key='Escape';f.document.dispatchEvent(key);assert.equal(f.mode.isOpen,false);assert.equal(key.defaultPrevented,true);
  f.mode.open();f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.mode.isOpen,false);assert.equal(f.world.inert,false);
  const blocked=photoFixture({canOpen:()=>false});assert.equal(blocked.mode.open(),false);assert.deepEqual(blocked.toggles,[]);
});
function captureFixture(capture){const document=documentFixture(),focus=document.createElement('button');focus.focus();const record=Object.freeze({name:'<b>검증</b>',title:'버튼 장인',brokenCount:1000,repairedCount:3}),toggles=[],errors=[];const ui=createCaptureTime({document,getRecord:()=>record,capture,onToggle:v=>toggles.push(v),onError:()=>errors.push(true)});return {document,record,toggles,errors,ui,sheet:document.body.children[0],focus};}
test('record card uses current counters as text and releases its image on close',async()=>{
  const f=captureFixture(async()=> 'data:image/jpeg;base64,local-only');await f.ui.open();
  assert.equal(f.ui.isOpen,true);assert.equal(f.sheet.querySelector('.capture-name').textContent,f.record.name);assert.equal(f.sheet.querySelector('.capture-broken').textContent,'1,000');assert.equal(f.record.brokenCount,1000);
  f.ui.close();assert.equal(f.sheet.querySelector('.capture-image').src,'');assert.equal(f.document.activeElement,f.focus);assert.deepEqual(f.toggles,[true,false]);
});
test('capture failure and closing while an image is pending never leave input locked',async()=>{
  const failed=captureFixture(()=>Promise.reject(Error('frame timeout')));await failed.ui.open();assert.equal(failed.ui.isOpen,false);assert.deepEqual(failed.toggles,[true,false]);assert.equal(failed.errors.length,1);
  let resolve;const pending=captureFixture(()=>new Promise(r=>resolve=r)),opened=pending.ui.open();pending.ui.close();resolve('data:image/jpeg;base64,stale');await opened;
  assert.equal(pending.ui.isOpen,false);assert.equal(pending.sheet.querySelector('.capture-image').src,'');assert.deepEqual(pending.toggles,[true,false]);
});
test('one-frame card image is bounded and does not alter the source renderer canvas',()=>{
  let made,drawn;const document={createElement:()=>made={getContext:()=>({drawImage:(...args)=>drawn=args}),toDataURL:(type,quality)=>{assert.equal(type,'image/jpeg');assert.equal(quality,.86);return 'local-data';}}};
  const source=Object.freeze({width:4000,height:3000});assert.equal(captureImage(source,document),'local-data');assert.equal(made.width,1100);assert.equal(made.height,825);assert.equal(drawn[0],source);assert.throws(()=>captureImage({width:0,height:0},document));
});
