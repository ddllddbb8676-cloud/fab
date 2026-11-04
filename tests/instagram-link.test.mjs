import test from 'node:test';
import assert from 'node:assert/strict';
import {connectInstagramLink} from '../src/view-controls.js';

const web='https://www.instagram.com/semi.toon/';
function fixture(userAgent='iPhone',extra={}){
  const link=new EventTarget(),document=new EventTarget(),window=new EventTarget(),visits=[];
  link.href=web;document.hidden=false;window.location={assign:url=>visits.push(url)};
  connectInstagramLink({link,window,document,navigator:{userAgent,maxTouchPoints:1},...extra});
  const click=(props={})=>{const e=new Event('click',{cancelable:true});Object.assign(e,props);link.dispatchEvent(e);return e;};
  return {link,document,window,visits,click};
}
test('iPhone tap tries the app then falls back to the same public profile',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const f=fixture();
  assert.equal(f.click().defaultPrevented,true);assert.deepEqual(f.visits,['instagram://user?username=semi.toon']);
  t.mock.timers.tick(1600);assert.deepEqual(f.visits,['instagram://user?username=semi.toon',web]);assert.equal(f.link.href,web);
});
test('app backgrounding and return do not cause a second navigation',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const f=fixture();f.click();
  f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));f.document.hidden=false;
  t.mock.timers.tick(5000);assert.equal(f.visits.length,1);
});
test('leaving, resuming interaction, and suspended timers cancel fallback',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  for(const [owner,event] of [['window','pagehide'],['document','pointerdown'],['document','keydown']]){
    const f=fixture();f.click();f[owner].dispatchEvent(new Event(event));t.mock.timers.tick(1600);assert.equal(f.visits.length,1);
  }
  let clock=0;const f=fixture('iPhone',{now:()=>clock});f.click();clock=8000;t.mock.timers.tick(1600);assert.equal(f.visits.length,1);
});
test('Android intent includes the official app package and HTTPS fallback',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const f=fixture('Android');f.click();
  assert.ok(f.visits[0].startsWith('intent://instagram.com/_u/semi.toon/#Intent;scheme=https;package=com.instagram.android;'));
  assert.ok(f.visits[0].includes('S.browser_fallback_url='+encodeURIComponent(web)+';end'));f.window.dispatchEvent(new Event('pagehide'));
});
test('desktop and modified link taps retain normal browser navigation',()=>{
  const desktop=fixture('Windows NT');assert.equal(desktop.click().defaultPrevented,false);assert.deepEqual(desktop.visits,[]);
  const phone=fixture();for(const props of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{button:1}])assert.equal(phone.click(props).defaultPrevented,false);
  assert.deepEqual(phone.visits,[]);
});
