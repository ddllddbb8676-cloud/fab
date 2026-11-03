import test from 'node:test';
import assert from 'node:assert/strict';
import {HttpRoomPeer,connectionOrder,readRoomBody} from '../server/http-room-peer.js';

const key='d8ef0452-92f4-41a8-8c65-f6de3ceef726';
const json=body=>new Request('https://example.test/api/room-http?v=20',{method:'POST',body:JSON.stringify(body)});

test('lost polls replay private acknowledgments exactly and merge only undelivered world frames',()=>{
  const peer=new HttpRoomPeer();
  const send=data=>peer.send(JSON.stringify(data));
  const frame=(foups,events,extra={})=>send({type:'frame',foups,events,...extra});
  send({type:'welcome',name:'테스트'});
  frame([['x',1]],['a'],{leaderboard:['old']});
  const lost=peer.delivery();
  frame([['y',1]],['b'],{leaderboard:['new'],t:2});
  frame([['x',3]],['c'],{t:3});
  send({type:'ack',seq:7,ok:true,wallet:{chips:50}});
  const retry=peer.delivery();
  assert.deepEqual(retry.messages.slice(0,2),lost.messages);
  assert.deepEqual(retry.messages.map(([id])=>id),[1,2,3,4]);
  assert.deepEqual(JSON.parse(retry.messages[2][1]),{type:'frame',foups:[['y',1],['x',3]],events:['b','c'],leaderboard:['new'],t:3});
  assert.equal(peer.acknowledge(3),true);
  assert.deepEqual(peer.delivery().messages,retry.messages.slice(-1));
  assert.equal(peer.acknowledge(2),false);assert.equal(peer.acknowledge(5),false);
  peer.close(4001);assert.equal(peer.status,409);assert.deepEqual(peer.rows,[]);
});

test('a client that never acknowledges cannot grow the replay queue without a bound',()=>{
  const peer=new HttpRoomPeer();
  assert.throws(()=>{for(let i=0;i<200;i++)peer.send('{"type":"wallet"}');},/limit/);
  assert.equal(peer.status,410);assert.equal(peer.bytes,0);
});

test('an HTTP command batch preserves action order, coalesces adjacent poses and validates input size',async()=>{
  const pose=x=>({type:'pose',pose:{x}});
  const command={type:'command',kind:'purchase',seq:9,data:{itemId:'suit-blue'}};
  const request={op:'poll',key,cursor:1,messages:[pose(1),pose(2),JSON.stringify(command),pose(3)]};
  const {body}=await readRoomBody(json(request));
  assert.deepEqual(body.inputs.map(input=>JSON.parse(input.raw)),[pose(2),command,pose(3)]);
  for(const invalid of [{cursor:-1},{key:'other-account'},{messages:[{}]},{messages:Array(17).fill(pose(1))},{op:'close'}]){
    assert.equal((await readRoomBody(json({...request,...invalid}))).status,400);
  }
  for(const length of [2100,17000]){
    const message={...command,data:{payload:'x'.repeat(length)}};
    assert.equal((await readRoomBody(json({...request,messages:[message]}))).status,413);
  }
});

test('old open pages can reconnect using their original order but malformed or far-future clocks cannot preempt',()=>{
  assert.equal(connectionOrder(null),null);
  assert.equal(connectionOrder('10000',Date.now()),10000);
  for(const invalid of ['1e10',-1,0,Date.now()*1000+500000000])assert.ok(Number.isNaN(connectionOrder(invalid)));
});
