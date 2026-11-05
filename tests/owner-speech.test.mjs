import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {createRoom} from '../server/room-engine.js';
import {HttpRoomPeer} from '../server/http-room-peer.js';
import {createSpeechBubbles} from '../src/owner-speech-ui.js';
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
test('the legacy operator command remains limited to the configured operator',()=>{
  const {room,enter,say}=setup();enter(visitor);
  assert.equal(say(visitor,'권한 사칭').ok,false);assert.equal(say(owner,'입장 전').ok,false);
  enter(owner);const profile=room.profile(owner),world=room.worldEvents.checkpoint();
  assert.equal(say(owner,'시작할게요!').ok,true);
  assert.equal(say(visitor,'덮어쓰기').ok,false);
  assert.equal(room.snapshot(true).ownerSpeech.text,'시작할게요!');
  assert.deepEqual(room.profile(owner),profile);assert.deepEqual(room.worldEvents.checkpoint(),world);
  const missing=setup('');missing.enter(owner);assert.equal(missing.say(owner,'test').ok,false);
});
test('the legacy owner field and late join snapshots do not consume broadcasts',()=>{
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
  for(const character of ['팹','🍀','🧑🏽‍🚀','🇰🇷','❤️','가'.normalize('NFD')]){
    assert.equal(readSpeech(character.repeat(20)).length,20);
    assert.equal(readSpeech(character.repeat(20)).ok,true);assert.equal(readSpeech(character.repeat(21)).ok,false);
  }
  for(const v of [null,{},' \n ','\u200b\u200d','ab'.repeat(300)])assert.equal(readSpeech(v).ok,false);
});
test('HTTP fallback retains the latest speech revision across merged frames, including clear',()=>{
  const f=setup();f.enter(owner);const peer=new HttpRoomPeer();
  const send=()=>peer.send(JSON.stringify(f.room.snapshot()));
  f.say(owner,'하나');send();send();f.say(owner,'둘');send();send();
  const [cursor,raw]=peer.delivery().messages[0];assert.equal(JSON.parse(raw).ownerSpeech.text,'둘');peer.acknowledge(cursor);
  f.advance(SPEECH_DURATION_MS);send();send();assert.equal(JSON.parse(peer.delivery().messages[0][1]).ownerSpeech.text,undefined);
});
test('room speech uses each actual session and updates only that speaker, regardless of costume or role',()=>{
  const {room,enter,advance}=setup();enter(owner);
  const speak=(id,text)=>room.command(id,'say',{text,speaker:owner,role:'operator',chipUnlimited:true});
  assert.equal(speak(visitor,'아직 입장 전').ok,false);
  enter(visitor);room.players.get(visitor).role='safety-orange';
  const profile=room.profile(visitor),world=room.worldEvents.checkpoint();
  assert.equal(speak(owner,'같이 가요').ok,true);advance(4000);
  assert.equal(speak(visitor,'네').ok,true);assert.equal(speak(visitor,'출발!').ok,true);
  assert.equal(speak(visitor,'가'.repeat(21)).ok,false);assert.equal(speak(owner,'가'.repeat(21)).ok,false);
  const next=room.snapshot(true);
  assert.deepEqual(next.speech.bubbles.map(b=>[b.speaker,b.text]),[[owner,'같이 가요'],[visitor,'출발!']]);
  assert.equal(next.ownerSpeech.text,'같이 가요');assert.deepEqual(room.snapshot().speech,next.speech);
  assert.equal(room.snapshot().speech,undefined);advance(4000);
  const firstExpired=room.snapshot();
  assert.deepEqual(firstExpired.speech.bubbles.map(b=>b.speaker),[visitor]);assert.equal(firstExpired.ownerSpeech.text,undefined);
  assert.deepEqual(room.profile(visitor),profile);assert.deepEqual(room.worldEvents.checkpoint(),world);
  room.remove(visitor);assert.deepEqual(room.snapshot().speech.bubbles,[]);
  room.join(visitor);assert.deepEqual(room.snapshot(true).speech.bubbles,[]);
});
test('ordinary accounts can speak without a configured operator and HTTP merging keeps both latest bubbles',()=>{
  const {room,enter,advance}=setup('');enter(owner);enter(visitor);
  const peer=new HttpRoomPeer(),send=()=>peer.send(JSON.stringify(room.snapshot()));
  assert.deepEqual(room.command(owner,'say',{text:'첫 말'}),{ok:true});send();
  assert.deepEqual(room.command(visitor,'say',{text:'같이!'}),{ok:true});send();send();
  room.command(owner,'say',{text:'다음 말'});send();
  const [cursor,raw]=peer.delivery().messages[0],first=JSON.parse(raw);
  assert.deepEqual(first.speech.bubbles.map(b=>b.text),['다음 말','같이!']);assert.equal(first.ownerSpeech,undefined);
  peer.acknowledge(cursor);advance(SPEECH_DURATION_MS);send();send();
  assert.deepEqual(JSON.parse(peer.delivery().messages[0][1]).speech.bubbles,[]);
});
test('nearby labels coexist, stack at the same anchor, expire independently and ignore older frames',()=>{
  let local=0,show=true;
  const nodes=new Set();
  const doc={hidden:false,documentElement:{clientWidth:390,clientHeight:844},
    createElement:()=>({hidden:true,setAttribute(){},classList:{toggle(){}},style:{setProperty(){}},offsetWidth:120,offsetHeight:45,remove(){nodes.delete(this);}}),
    body:{append(e){nodes.add(e);}}};
  const view=createSpeechBubbles({THREE:{Vector3},doc,now:()=>local,getAnchor:(_id,point)=>{
    point.set(0,0,-3);return show?48:null;
  }});
  const camera=new PerspectiveCamera(52,390/844,.1,500);camera.updateMatrixWorld();
  const first={speaker:owner,text:'<b>시작</b>',revision:1,expiresAt:9000};
  const second={speaker:visitor,text:'나도!',revision:2,expiresAt:10000};
  const frame=(revision,bubbles,serverNow)=>({worldEvents:{serverNow},speech:{revision,bubbles}});
  view.frame(frame(1,[first],1000),true);view.update(camera);
  local=1000;view.frame(frame(2,[first,second],2000));view.update(camera);
  const [a,b]=[...nodes];
  assert.equal(a.textContent,'<b>시작</b>');assert.equal(b.textContent,'나도!');assert.notEqual(a.style.transform,b.style.transform);
  view.frame(frame(1,[],1000));show=false;view.update(camera);assert.ok(a.hidden&&b.hidden);
  show=true;view.update(camera);assert.ok(!a.hidden&&!b.hidden);
  local=8000;view.update(camera);assert.deepEqual([...nodes],[b]);
  view.frame(frame(2,[first,second],2000));view.update(camera);assert.deepEqual([...nodes],[b]);
  view.frame(frame(1,[first],8500),true);view.update(camera);assert.equal(nodes.size,1);
  local+=500;view.update(camera);assert.equal(nodes.size,0);
});
