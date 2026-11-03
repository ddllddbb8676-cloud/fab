import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRoomConnection,WELCOME_TIMEOUT_MS} from '../src/room-connection.js';

function fixture(){
  let time=0;const timers=new Set(),microtasks=[],sockets=[],lifecycle=new EventTarget();
  const schedule=(fn,ms)=>{const token={fn,at:time+ms};timers.add(token);return token;},cancel=t=>timers.delete(t);
  class Socket extends EventTarget{
    constructor(url){super();this.url=url.href;this.readyState=0;this.sent=[];sockets.push(this);}
    send(data){this.sent.push(data);}close(){this.readyState=3;this.closed=true;this.dispatchEvent(new Event('close'));}
    message(data){this.dispatchEvent(Object.assign(new Event('message'),{data:JSON.stringify(data)}));}
  }
  const prepared=prepareRoomConnection({ws:'/api/room'},{Socket,base:'https://fab.semitoon.com/',schedule,cancel,enqueue:fn=>microtasks.push(fn),now:()=>time,lifecycle});
  function advance(ms){time+=ms;for(const timer of [...timers])if(timer.at<=time){timers.delete(timer);timer.fn();}}
  return {prepared,sockets,timers,lifecycle,advance,flush:()=>microtasks.splice(0).forEach(fn=>fn())};
}
test('the socket starts before 3D initialization and keeps welcome and later deltas in order',()=>{
  const h=fixture();assert.equal(h.sockets.length,1);const raw=h.sockets[0];raw.readyState=1;
  raw.message({type:'welcome',name:'unchanged',wallet:{chips:777}});raw.message({type:'frame',t:1,foups:[['a',1]]});
  const socket=h.prepared.take(),received=[];socket.addEventListener('message',e=>received.push(JSON.parse(e.data)));
  socket.activate();assert.equal(received.length,0,'callbacks wait until the game finishes assigning its client');
  h.flush();raw.message({type:'frame',t:2,foups:[['b',2]]});
  assert.deepEqual(received.map(e=>e.type),['welcome','frame','frame']);assert.equal(received[0].wallet.chips,777);
  assert.equal(h.prepared.take(),null,'cannot open a duplicate consumer');assert.equal(h.timers.size,0);
  socket.send('pose');assert.deepEqual(raw.sent,['pose']);socket.close();assert.equal(raw.closed,true);
});
test('a stalled early socket expires, allowing the normal client to reconnect',()=>{
  const h=fixture();h.advance(WELCOME_TIMEOUT_MS);assert.equal(h.sockets[0].closed,true);assert.equal(h.prepared.take(),null);
});
test('a successful early connection is released if the game never finishes loading',()=>{
  const h=fixture();h.sockets[0].message({type:'welcome'});h.advance(20000);assert.equal(h.sockets[0].closed,true);assert.equal(h.prepared.take(),null);
});
test('initial scene delays do not grant an additional eight seconds to a stuck handshake',()=>{
  const h=fixture();h.advance(3000);const socket=h.prepared.take();assert.equal(socket.welcomeTimeout,5000);h.prepared.dispose();
});
test('queue overflow discards the stale snapshot and requires a fresh connection',()=>{
  for(const large of [false,true]){
    const h=fixture();h.sockets[0].message({type:'welcome'});
    if(large)h.sockets[0].message({value:'x'.repeat(1024*1024)});
    else for(let n=0;n<64;n++)h.sockets[0].message({type:'roster',roster:[]});
    assert.equal(h.prepared.take(),null);assert.equal(h.sockets[0].closed,true);
  }
});
test('full and replaced messages are retained along with their close event',()=>{
  for(const type of ['full','replaced']){
    const h=fixture();h.sockets[0].message({type});h.sockets[0].close();const socket=h.prepared.take(),events=[];
    socket.addEventListener('message',e=>events.push(JSON.parse(e.data).type));socket.addEventListener('close',()=>events.push('close'));socket.activate();h.flush();
    assert.deepEqual(events,[type,'close']);
  }
});
test('offline mode and a denied constructor fall back without breaking startup',()=>{
  const settings={base:'https://fab.semitoon.com/',Socket:class{constructor(){throw Error('denied');}}};
  assert.equal(prepareRoomConnection(null,settings),null);assert.equal(prepareRoomConnection({ws:'/api/room'},settings),null);
});

test('slow scene construction keeps a ready socket, latest movement, leaderboard and all FOUP deltas',()=>{
  const h=fixture(),raw=h.sockets[0];raw.readyState=1;raw.message({type:'welcome',wallet:{chips:77},frame:{foups:[['initial']]}});
  for(let n=0;n<100;n++)raw.message({type:'frame',t:n,people:[n],foups:[[n%2?'b':'a',n]],...(n===5?{leaderboard:[['leader',5]]}:{}),events:[['past-blast',n]]});
  const socket=h.prepared.take(),received=[];assert.ok(socket);assert.equal(raw.closed,undefined);
  socket.addEventListener('message',event=>received.push(JSON.parse(event.data)));socket.activate();h.flush();
  assert.equal(received.length,2);assert.equal(received[0].wallet.chips,77);assert.equal(received[1].t,99);
  assert.deepEqual(received[1].foups,[['a',98],['b',99]]);assert.deepEqual(received[1].leaderboard,[['leader',5]]);assert.deepEqual(received[1].events,[]);
});

test('a failed handshake or a page leaving during scene setup releases the early socket',()=>{
  for(const event of ['error','pagehide']){
    const h=fixture();(event==='error'?h.sockets[0]:h.lifecycle).dispatchEvent(new Event(event));
    assert.equal(h.sockets[0].closed,true);assert.equal(h.prepared.take(),null);assert.equal(h.timers.size,0);
  }
});
