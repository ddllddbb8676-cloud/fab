import test from 'node:test';
import assert from 'node:assert/strict';
import {HttpRoomSocket} from '../src/http-room-socket.js';
import {PROTOCOL} from '../src/shared-protocol.js';

const row=(cursor,data)=>[cursor,JSON.stringify(data)];
const welcome=row(1,{type:'welcome',v:PROTOCOL,id:'existing-visitor'});
function harness(){
  const requests=[],received=[],closed=[],timers=new Map(),page=new EventTarget();let time=0,nextTimer=0;
  const settle=async()=>{for(let n=0;n<6;n++)await Promise.resolve();};
  const schedule=(fn,ms)=>{timers.set(++nextTimer,{at:time+ms,fn});return nextTimer;};
  const fetcher=(url,options)=>new Promise((resolve,reject)=>{
    const body=JSON.parse(options.body),request={url,options,body,reject,
      reply:(messages=[],status=200)=>resolve({ok:status>=200&&status<300,status,json:async()=>({messages})})};
    requests.push(request);if(body.op==='close')request.reply();
  });
  const socket=new HttpRoomSocket({ws:'/api/room'},42,{fetcher,makeKey:()=> 'fixed-ephemeral-key',schedule,cancel:id=>timers.delete(id),lifecycle:page});
  socket.addEventListener('message',e=>received.push(JSON.parse(e.data)));
  socket.addEventListener('close',e=>closed.push(e.code));
  async function advance(ms=0){
    const end=time+ms;await settle();
    for(;;){const first=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!first)break;
      const [id,t]=first;time=t.at;timers.delete(id);t.fn();await settle();}
    time=end;
  }
  return {socket,requests,received,closed,page,advance,settle};
}

test('HTTPS-only startup retries with the same transport and cookie, publishing welcome before frames',async()=>{
  const h=harness();await h.advance();const initial=h.requests[0];
  assert.equal(initial.url,'/api/room-http?v='+PROTOCOL);assert.equal(initial.options.credentials,'same-origin');
  assert.equal(initial.options.cache,'no-store');assert.equal(initial.body.order,42);initial.reply([],503);
  await h.advance(249);assert.equal(h.requests.length,1);await h.advance(1);
  assert.deepEqual(h.requests[1].body,initial.body);h.requests[1].reply([row(1,{type:'frame',t:-1}),row(2,{type:'welcome',v:PROTOCOL}),row(3,{type:'frame',t:0})]);await h.settle();
  assert.equal(h.socket.readyState,1);assert.deepEqual(h.received.map(m=>m.type),['welcome','frame']);
  await h.advance(350);assert.equal(h.requests.at(-1).body.cursor,3);
  h.requests.at(-1).reply([row(3,{type:'frame',t:0}),row(4,{type:'frame',t:1})]);await h.settle();
  assert.deepEqual(h.received.filter(m=>m.type==='frame').map(m=>m.t),[0,1]);h.socket.close();
});

test('lost poll response replays identical command sequences and cursor; new commands cannot reorder the batch',async()=>{
  const h=harness();await h.advance();h.requests[0].reply([welcome]);await h.settle();
  const pose=x=>JSON.stringify({type:'pose',pose:{x}}),command=seq=>JSON.stringify({type:'command',seq,kind:'purchase'});
  h.socket.send(pose(1));h.socket.send(pose(2));h.socket.send(command(8));h.socket.send(pose(3));
  await h.advance();assert.deepEqual(h.requests[1].body.messages,[pose(2),command(8),pose(3)]);
  h.socket.send(command(9));await h.advance(350);assert.equal(h.requests.length,2,'one request in flight');
  h.requests[1].reject(Error('response lost after commit'));await h.advance(249);assert.equal(h.requests.length,2);
  await h.advance(1);assert.deepEqual(h.requests[2].body,h.requests[1].body);
  h.requests[2].reply([welcome,row(2,{type:'ack',seq:8,ok:true})]);await h.advance();
  assert.deepEqual(h.requests[3].body.messages,[command(9)]);assert.equal(h.requests[3].body.cursor,2);
  h.requests[3].reply([row(2,{type:'ack',seq:8,ok:true}),row(3,{type:'ack',seq:9,ok:true})]);await h.settle();
  assert.deepEqual(h.received.filter(m=>m.type==='ack').map(m=>m.seq),[8,9]);h.socket.close();
});

test('pagehide closes only the current key; a late fetch result cannot deliver a welcome or reconnect',async()=>{
  const h=harness();await h.advance();h.page.dispatchEvent(new Event('pagehide'));h.socket.close();
  assert.ok(h.requests[0].options.signal.aborted);assert.deepEqual(h.closed,[1000]);
  assert.ok(h.requests[1].options.keepalive);assert.deepEqual(h.requests[1].body,{op:'close',key:h.requests[0].body.key,order:42});
  h.requests[0].reply([welcome]);await h.advance(30000);assert.equal(h.requests.length,2);assert.deepEqual(h.received,[]);
  const neverSent=harness();neverSent.socket.close();await neverSent.advance();assert.equal(neverSent.requests.length,0);
});

test('replacement is terminal and a missing or unreachable transport reports loss',async()=>{
  for(const [status,code] of [[409,4001],[410,1006]]){
    const h=harness();await h.advance();h.requests[0].reply([],status);await h.advance(30000);
    assert.deepEqual(h.closed,[code]);assert.equal(h.socket.readyState,3);assert.equal(h.requests.length,1);
  }
  const h=harness();await h.advance();h.requests[0].reject(Error());await h.advance(250);
  h.requests[1].reject(Error());await h.advance(500);h.requests[2].reject(Error());await h.advance(30000);
  assert.deepEqual(h.closed,[1006]);assert.deepEqual(h.requests.map(r=>r.body.op),['open','open','open','close']);
});

test('a request that ignores abort cannot strand the adapter or deliver its late welcome',async()=>{
  const h=harness();await h.advance(4750);assert.ok(h.requests[0].options.signal.aborted);
  assert.equal(h.requests.length,2);h.requests[1].reply([welcome]);await h.settle();
  h.requests[0].reply([row(5,{type:'welcome',id:'stale'})]);await h.settle();
  assert.deepEqual(h.received.map(m=>m.id),['existing-visitor']);h.socket.close();
});
