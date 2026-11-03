import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomChannel,SWITCH_AFTER_MS,SILENT_AFTER_MS} from '../src/room-channel.js';
import {PROTOCOL} from '../src/shared-protocol.js';

function fixture(){
  const ws=[],http=[],received=[],closed=[],timers=new Map(),config={serverTime:12345,ws:'/api/room'};
  let t=0,index=0;
  class Peer extends EventTarget {
    constructor(){super();this.readyState=0;}
    close(){this.readyState=3;this.dispatchEvent(Object.assign(new Event('close'),{code:1000}));}
    say(data){this.readyState=1;this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}
    welcome(name){this.say({type:'welcome',v:PROTOCOL,name});}
  }
  const args={Socket:class extends Peer{constructor(url){super();this.order=Number(url.searchParams.get('o'));ws.push(this);}},
    Http:class extends Peer{constructor(_,order){super();this.order=order;http.push(this);}},
    schedule:(fn,ms)=>{timers.set(++index,{at:t+ms,fn});return index;},cancel:id=>timers.delete(id),
    now:()=>t,hidden:()=>false};
  const connect=()=>{const c=createRoomChannel(config,'https://local.test',args);
    c.addEventListener('message',e=>received.push(JSON.parse(e.data)));
    c.addEventListener('close',e=>closed.push(e.code));return c;};
  const advance=ms=>{const end=t+ms;for(;;){const item=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
    if(!item||item[1].at>end)break;t=item[1].at;timers.delete(item[0]);item[1].fn();}t=end;};
  return {ws,http,received,closed,connect,advance};
}
test('a healthy WebSocket keeps multiplayer on the fast path without polling',()=>{
  const h=fixture(),channel=h.connect();h.ws[0].welcome('original');
  for(let i=0;i<20;i++){h.advance(500);h.ws[0].say({type:'frame'});}
  assert.equal(channel.transport,'websocket');assert.equal(h.http.length,0);assert.deepEqual(h.closed,[]);channel.close();
});
test('a silent upgrade switches to HTTP once, ignoring late welcome and replacement from the retired socket',()=>{
  const h=fixture(),channel=h.connect();h.advance(SWITCH_AFTER_MS-1);assert.equal(h.http.length,0);
  h.advance(1);assert.equal(h.http.length,1);assert.equal(h.ws[0].readyState,3);assert.ok(h.http[0].order>h.ws[0].order);
  h.http[0].welcome('existing');h.ws[0].welcome('late');h.ws[0].say({type:'replaced'});
  assert.deepEqual(h.received.map(m=>m.name),['existing']);assert.deepEqual(h.closed,[]);
  channel.close();const next=h.connect();assert.equal(next.transport,'https');next.close();
});
test('an already connected but silent visible page reconnects through HTTP instead of keeping a dead link',()=>{
  const h=fixture();h.connect();h.ws[0].welcome('existing');h.advance(SILENT_AFTER_MS);
  assert.deepEqual(h.closed,[1006]);const next=h.connect();assert.equal(next.transport,'https');
  h.http[0].welcome('existing');next.close();
});
test('full, replaced and version messages from the room never trigger a competing fallback',()=>{
  for(const message of [{type:'full'},{type:'replaced'},{type:'welcome',v:-1}]){
    const h=fixture(),channel=h.connect();h.ws[0].say(message);h.ws[0].close();h.advance(30000);
    assert.equal(h.http.length,0);assert.deepEqual(h.received,[message]);channel.close();
  }
});
