import test from 'node:test';
import assert from 'node:assert/strict';
import {startGame} from '../src/startup-controller.js';
import {canonicalRedirect} from '../server/canonical-url.js';

class Element extends EventTarget{
  constructor(){super();this.hidden=true;this.dataset={};this.textContent='';this.classList={add:value=>this.className=value};}
  remove(){this.removed=true;}focus(){}select(){}
}
function harness(loadModule=async()=>{}){
  const names=['p','[data-loading-detail]','[data-loading-retry]','[data-loading-copy]','[data-loading-result]'];
  const nodes=Object.fromEntries(names.map(key=>[key,new Element()])),root=new Element();root.querySelector=key=>nodes[key];
  const document=new EventTarget();document.getElementById=()=>root;document.hidden=false;
  const window=new EventTarget();let reloads=0,copied='',calls=0,clock=0;
  window.location={href:'https://fab.semitoon.com/',reload:()=>reloads++};window.navigator={userAgent:'test',clipboard:{writeText:async value=>copied=value}};
  const timers=new Set(),schedule=(callback,ms)=>{const token={callback,at:clock+ms};timers.add(token);return token;};
  const cancel=token=>timers.delete(token);
  const game=startGame({entry:'/src/main.js?v=test',document,window,loadModule:url=>{calls++;return loadModule(url);},schedule,cancel,now:()=>clock});
  function advance(ms){clock+=ms;for(const timer of [...timers])if(timer.at<=clock){timers.delete(timer);timer.callback();}}
  function stage(value){document.dispatchEvent(Object.assign(new Event('fab-startup'),{detail:value}));}
  return {game,root,nodes,document,window,stage,advance,timers,get calls(){return calls;},get reloads(){return reloads;},get copied(){return copied;}};
}

test('a completed module does not hide the loader before the first real frame',async()=>{
  const h=harness();await h.game.started;assert.equal(h.calls,1);assert.notEqual(h.root.className,'done');
  h.stage('render');h.stage('ready');assert.equal(h.root.className,'done');h.advance(800);assert.equal(h.root.removed,true);
});
test('slow initialization exposes retry and diagnostics without duplicating the game',async()=>{
  let finish;const h=harness(()=>new Promise(resolve=>finish=resolve));await Promise.resolve();
  h.stage('lighting');h.advance(12000);assert.equal(h.root.dataset.loadingState,'slow');
  assert.equal(h.nodes['[data-loading-retry]'].hidden,false);assert.equal(h.calls,1);
  h.stage('equipment');assert.equal(h.nodes['[data-loading-retry]'].hidden,true);
  h.nodes['[data-loading-retry]'].dispatchEvent(new Event('click'));assert.equal(h.reloads,1);
  finish();await h.game.started;h.game.dispose();
});
test('failed downloads show an actionable error rather than infinite loading',async()=>{
  const h=harness(async()=>{throw Error('Network load failed');});await h.game.started;
  assert.equal(h.root.dataset.loadingState,'failed');assert.match(h.game.report(),/Network load failed/);assert.equal(h.calls,1);
});
test('initialization rejection retains the exact last stage and never retries a partly initialized game',async()=>{
  let reject;const h=harness(()=>new Promise((_,r)=>reject=r));await Promise.resolve();h.stage('lighting');reject(Error('GPU failed'));await h.game.started;
  assert.match(h.game.report(),/lighting/);assert.match(h.game.report(),/GPU failed/);assert.equal(h.calls,1);
  h.stage('ready');assert.equal(h.root.dataset.loadingState,'failed');
});
test('a first-frame error is caught but injected third-party script errors are ignored',async()=>{
  const h=harness();await h.game.started;h.stage('render');
  h.window.dispatchEvent(Object.assign(new Event('error'),{filename:'https://instagram.com/injected.js',message:'injected'}));
  h.window.dispatchEvent(Object.assign(new Event('unhandledrejection'),{reason:{message:'unrelated',stack:'Error: unrelated\n at injected (https://instagram.com/script.js:3:1)'}}));
  assert.equal(h.root.dataset.loadingState,'loading');
  h.window.dispatchEvent(Object.assign(new Event('error'),{filename:'https://fab.semitoon.com/src/main.js',message:'render failed'}));
  assert.equal(h.root.dataset.loadingState,'failed');assert.match(h.game.report(),/render failed/);
});
test('context loss reports a failure and later success cannot dismiss it',async()=>{
  const h=harness();await h.game.started;
  h.document.dispatchEvent(Object.assign(new Event('fab-startup-error'),{detail:'context lost'}));h.stage('ready');
  assert.equal(h.root.dataset.loadingState,'failed');assert.match(h.game.report(),/context lost/);
});
test('copying startup stages contains no identity or wallet fields and cannot reset a session',async()=>{
  const h=harness();await h.game.started;h.stage('people');h.advance(12000);
  h.nodes['[data-loading-copy]'].dispatchEvent(new Event('click'));await Promise.resolve();
  assert.match(h.copied,/people: 0ms/);assert.doesNotMatch(h.copied,/cookie|visitor:|wallet|session/i);assert.equal(h.reloads,0);h.game.dispose();
});
test('disposal prevents late module failures from changing the page',async()=>{
  let reject;const h=harness(()=>new Promise((_,r)=>reject=r));await Promise.resolve();h.game.dispose();reject(Error('late'));
  await h.game.started;assert.equal(h.timers.size,0);assert.notEqual(h.root.dataset.loadingState,'failed');
});
test('HTTP requests upgrade on the same host before any session is created',()=>{
  for(const path of ['/','/?from=instagram','/api/config','/src/main.js?v=abc','/connection-check.html']){
    const r=canonicalRedirect(new Request('http://fab.semitoon.com'+path));assert.equal(r.status,308);
    assert.equal(r.headers.get('location'),'https://fab.semitoon.com'+path);assert.equal(r.headers.has('set-cookie'),false);
  }
});
test('HTTPS and local development keep their existing origin without redirect loops',()=>{
  for(const url of ['https://fab.semitoon.com/','https://fab.semitoon.com/api/config','http://localhost:4173/'])assert.equal(canonicalRedirect(new Request(url)),null);
});
