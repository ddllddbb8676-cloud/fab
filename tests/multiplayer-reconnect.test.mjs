import test from 'node:test';
import assert from 'node:assert/strict';
import {createMultiplayer,WELCOME_TIMEOUT_MS} from '../src/multiplayer.js';
import {PROTOCOL} from '../src/shared-protocol.js';

function harness({throwConstructor=false}={}){
  const saved=new Map(['WebSocket','location','document','setTimeout','clearTimeout','setInterval','clearInterval'].map(k=>[k,globalThis[k]]));
  let time=0;const timers=new Map(),sockets=[],statuses=[],welcomes=[];let next=1;
  globalThis.setTimeout=(fn,ms)=>{const id=next++;timers.set(id,{fn,at:time+ms});return id;};globalThis.clearTimeout=id=>timers.delete(id);
  globalThis.setInterval=()=>0;globalThis.clearInterval=()=>{};
  globalThis.location={href:'https://fab.semitoon.com/'};globalThis.document=new EventTarget();
  class Socket extends EventTarget{
    constructor(url){super();if(throwConstructor)throw Error('connection unavailable');this.url=url.href;this.readyState=0;this.sent=[];sockets.push(this);}
    close(){this.closed=true;this.readyState=3;this.dispatchEvent(Object.assign(new Event('close'),{code:1000}));}
    send(value){this.sent.push(JSON.parse(value));}
    message(value){this.dispatchEvent(Object.assign(new Event('message'),{data:JSON.stringify(value)}));}
  }
  globalThis.WebSocket=Socket;
  const client=createMultiplayer({config:{ws:'/api/room'},getPose:()=>({x:0,z:80}),onStatus:value=>statuses.push(value),onWelcome:value=>welcomes.push(value)});
  function advance(ms){const end=time+ms;while(true){const nextEntry=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!nextEntry)break;timers.delete(nextEntry[0]);time=nextEntry[1].at;nextEntry[1].fn();}time=end;}
  function welcome(socket=sockets.at(-1)){socket.readyState=1;socket.message({type:'welcome',v:PROTOCOL,id:'same-account',name:'same-name',wallet:{chips:1234},frame:{}});}
  return {client,sockets,statuses,welcomes,advance,welcome,close(){client.dispose();for(const[k,v]of saved)globalThis[k]=v;}};
}
test('an indefinitely CONNECTING socket retries with the same origin and no account reset',()=>{
  const h=harness();try{
    h.advance(WELCOME_TIMEOUT_MS);assert.equal(h.sockets[0].closed,true);assert.equal(h.client.status,'reconnecting');
    h.advance(250);assert.equal(h.sockets.length,2);assert.equal(h.sockets[1].url,`wss://fab.semitoon.com/api/room?v=${PROTOCOL}`);
    h.welcome();assert.equal(h.client.id,'same-account');assert.equal(h.client.connected,true);assert.equal(h.welcomes[0].wallet.chips,1234);
    h.advance(WELCOME_TIMEOUT_MS*2);assert.equal(h.sockets.length,2);
  }finally{h.close();}
});
test('a socket that opens but never sends a welcome is also retried',()=>{
  const h=harness();try{h.sockets[0].readyState=1;h.advance(WELCOME_TIMEOUT_MS+250);assert.equal(h.sockets.length,2);}finally{h.close();}
});
test('late welcome and close events from retired sockets cannot replace the new identity',()=>{
  const h=harness();try{
    const old=h.sockets[0];h.advance(WELCOME_TIMEOUT_MS+250);h.welcome();
    old.message({type:'welcome',v:PROTOCOL,id:'stale-account'});old.close();assert.equal(h.client.id,'same-account');assert.equal(h.welcomes.length,1);
  }finally{h.close();}
});
test('normal disconnect retries and disposal cancels all reconnect attempts',()=>{
  const h=harness();try{h.welcome();h.sockets[0].close();h.advance(1500);assert.equal(h.sockets.length,2);h.client.dispose();h.advance(30000);assert.equal(h.sockets.length,2);}finally{h.close();}
});
test('full rooms retain the existing 15 second retry interval',()=>{
  const h=harness();try{h.sockets[0].message({type:'full',message:'full'});h.sockets[0].close();h.advance(14999);assert.equal(h.sockets.length,1);h.advance(1);assert.equal(h.sockets.length,2);}finally{h.close();}
});
test('replaced sessions and incompatible protocol do not reconnect automatically',()=>{
  for(const message of [{type:'replaced'},{type:'welcome',v:-1}]){
    const h=harness();try{h.sockets[0].message(message);h.advance(30000);assert.equal(h.sockets.length,1);}finally{h.close();}
  }
});
test('synchronous WebSocket constructor failures do not crash game initialization',()=>{
  const h=harness({throwConstructor:true});try{assert.equal(h.client.status,'reconnecting');h.advance(1500);assert.equal(h.client.status,'reconnecting');}finally{h.close();}
});
