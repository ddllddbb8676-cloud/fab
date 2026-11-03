import test from 'node:test';
import assert from 'node:assert/strict';
import {rejectOutdatedRoom} from '../server/room-version.js';
import {PROTOCOL} from '../src/shared-protocol.js';

test('the current protocol continues normally without opening a rejection socket',()=>{
  assert.equal(rejectOutdatedRoom(new Request('https://fab.semitoon.com/api/room?v='+PROTOCOL)),null);
});

test('legacy clients receive their understood version notice without creating or exposing a profile',()=>{
  const saved={pair:globalThis.WebSocketPair,response:globalThis.Response};
  try{
    for(const query of ['?v=18','?v=19','','?v=undefined']){
      const sent=[],server={accept(){this.accepted=true;},send(data){sent.push(JSON.parse(data));},close(code){this.code=code;}},client={};
      globalThis.WebSocketPair=class{constructor(){return {0:client,1:server};}};
      globalThis.Response=class{constructor(body,options){this.body=body;Object.assign(this,options);}};
      const response=rejectOutdatedRoom({url:'https://fab.semitoon.com/api/room'+query});
      assert.equal(response.status,101);assert.equal(response.webSocket,client);assert.equal(server.accepted,true);assert.equal(server.code,1008);
      assert.equal(sent[0].type,'welcome');assert.equal(sent[0].v,PROTOCOL);assert.match(sent[0].message,/새로고침/);
      assert.equal(sent[0].id,undefined);assert.equal(sent[0].wallet,undefined);assert.equal(response.headers['Set-Cookie'],undefined);
    }
  }finally{globalThis.WebSocketPair=saved.pair;globalThis.Response=saved.response;}
});
