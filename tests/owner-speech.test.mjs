import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {createRoom} from '../server/room-engine.js';
import {HttpRoomPeer} from '../server/http-room-peer.js';
import {createSpeechBubble} from '../src/owner-speech-ui.js';
import {readSpeech,SPEECH_DURATION_MS} from '../src/owner-speech.js';

const owner='visitor:'+'a'.repeat(64),visitor='visitor:'+'b'.repeat(64);
function setup(configured=owner){
  let time=Date.parse('2026-11-05T10:00:00+09:00');
  const room=createRoom({ownerId:configured,now:()=>time});
  room.join(owner);room.join(visitor,{name:'FAB짱 세미',chipUnlimited:true});
  const enter=id=>room.pose(id,{x:0,y:0,z:3,heading:0,speed:0,posture:'stand',hidden:false});
  const say=(id,text)=>room.command(id,'owner-say',{speaker:owner,role:'operator',chipUnlimited:true,text});
  return {room,enter,say,advance:n=>{time+=n;room.worldEvents.update();}};
}
test('speech author is taken from the configured session, even when another visitor claims owner identity',()=>{
  const {room,enter,say}=setup();enter(visitor);
  assert.equal(say(visitor,'권한 사칭').ok,false);assert.equal(say(owner,'입장 전').ok,false);
  enter(owner);const profile=room.profile(owner),world=room.worldEvents.checkpoint();
  assert.equal(say(owner,'시작할게요!').ok,true);
  assert.equal(say(visitor,'덮어쓰기').ok,false);
  assert.equal(room.snapshot(true).ownerSpeech.text,'시작할게요!');
  assert.deepEqual(room.profile(owner),profile);assert.deepEqual(room.worldEvents.checkpoint(),world);
  const missing=setup('');missing.enter(owner);assert.equal(missing.say(owner,'test').ok,false);
});
test('only one transient bubble is broadcast; welcome and ACK snapshots do not consume updates for others',()=>{
  const {room,enter,say,advance}=setup();enter(owner);
  assert.equal(room.snapshot().ownerSpeech,undefined);
  say(owner,'첫 문장');const full=room.snapshot(true).ownerSpeech;
  assert.deepEqual(room.snapshot(true).ownerSpeech,full);
  assert.deepEqual(room.snapshot().ownerSpeech,full);assert.equal(room.snapshot().ownerSpeech,undefined);
  advance(4000);assert.equal(room.snapshot(true).ownerSpeech.expiresAt,full.expiresAt);
  say(owner,'다음 문장');const next=room.snapshot().ownerSpeech;
  assert.equal(next.text,'다음 문장');assert.ok(next.revision>full.revision);
  advance(SPEECH_DURATION_MS);const cleared=room.snapshot().ownerSpeech;
  assert.deepEqual(cleared,{revision:next.revision+1});assert.equal(room.snapshot().ownerSpeech,undefined);
  say(owner,'잠시 뒤에 봐요');room.remove(owner);assert.equal(room.snapshot(true).ownerSpeech.text,undefined);
  room.join(owner);assert.equal(room.snapshot(true).ownerSpeech.text,undefined);
});
test('Korean and emoji use a bounded single line, preserve literal markup, and reject invisible-only or forged objects',()=>{
  assert.equal(readSpeech('  안녕\n  팹! 👋 ').text,'안녕 팹! 👋');
  assert.equal(readSpeech('<b>안녕</b>').text,'<b>안녕</b>');
  assert.equal(readSpeech('🍀'.repeat(60)).ok,true);assert.equal(readSpeech('🍀'.repeat(61)).ok,false);
  for(const v of [null,{},' \n ','\u200b\u200d','ab'.repeat(300)])assert.equal(readSpeech(v).ok,false);
});
test('HTTP fallback retains the latest speech revision across merged frames, including clear',()=>{
  const f=setup();f.enter(owner);const peer=new HttpRoomPeer();
  const send=()=>peer.send(JSON.stringify(f.room.snapshot()));
  f.say(owner,'하나');send();send();f.say(owner,'둘');send();send();
  const [cursor,raw]=peer.delivery().messages[0];assert.equal(JSON.parse(raw).ownerSpeech.text,'둘');peer.acknowledge(cursor);
  f.advance(SPEECH_DURATION_MS);send();send();assert.equal(JSON.parse(peer.delivery().messages[0][1]).ownerSpeech.text,undefined);
});
test('the speech label tracks the visible speaker, treats text literally, expires locally, and ignores older frames',()=>{
  let local=0,show=true,node;
  const doc={hidden:false,documentElement:{clientWidth:390,clientHeight:844},
    createElement:()=>({hidden:true,setAttribute(){},classList:{toggle(){}},style:{setProperty(){}},offsetWidth:120,offsetHeight:45}),
    body:{append(e){node=e;}}};
  const view=createSpeechBubble({THREE:{Vector3},doc,now:()=>local,getAnchor:(id,point)=>{
    assert.equal(id,owner);point.set(0,0,-3);return show?48:null;
  }});
  const camera=new PerspectiveCamera(52,390/844,.1,500);camera.updateMatrixWorld();
  const frame=(text,revision,serverNow=1000)=>({worldEvents:{serverNow},ownerSpeech:{speaker:owner,text,revision,expiresAt:9000}});
  view.frame(frame('<b>시작</b>',2),true);view.update(camera);assert.equal(node.textContent,'<b>시작</b>');assert.equal(node.hidden,false);
  view.frame(frame('늦은 문장',1));assert.equal(node.textContent,'<b>시작</b>');
  show=false;view.update(camera);assert.equal(node.hidden,true);show=true;view.update(camera);assert.equal(node.hidden,false);
  local=8000;view.update(camera);assert.equal(node.hidden,true);assert.equal(node.textContent,'');
  view.frame(frame('<b>시작</b>',2));view.update(camera);assert.equal(node.hidden,true);
  view.frame(frame('새 연결',1,8500),true);view.update(camera);assert.equal(node.hidden,false);local+=500;view.update(camera);assert.equal(node.hidden,true);
});
