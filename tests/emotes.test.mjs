import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoom} from '../server/room-engine.js';
import {actorFromPacket} from '../src/shared-protocol.js';
import {EMOTES,EMOTE_SECONDS} from '../src/emotes.js';
import {createEmoteView} from '../src/emote-view.js';

test('six validated emotes are shared, rate limited, expire and never alter saved scores',()=>{
  const room=createRoom();room.join('a');const player=room.players.get('a');
  player.hidden=false;player.penalty=3;player.brokenCount=7;player.repairedCount=2;
  assert.equal(EMOTES.length,6);assert.equal(room.command('a','emote',{id:'<script>'}).ok,false);
  for(const {id} of EMOTES){
    assert.equal(room.command('a','emote',{id}).ok,true,'penalized people can express emotion');
    const actor=actorFromPacket(room.snapshot(true).people.find(p=>p[0]==='a'));
    assert.equal(actor.emote,id);assert.equal(actor.emoteLeft,EMOTE_SECONDS);
    assert.equal(room.command('a','emote',{id}).ok,false,'burst clicks cannot spam others');
    for(let i=0;i<7;i++)room.step(.1);
  }
  for(let i=0;i<31;i++)room.step(.1);
  const expired=actorFromPacket(room.snapshot(true).people.find(p=>p[0]==='a'));
  assert.equal(expired.emote,'');assert.equal(expired.emoteLeft,0);
  const profile=room.profile('a');assert.equal(profile.brokenCount,7);assert.equal(profile.repairedCount,2);assert.equal(profile.penalty,3);assert.equal(profile.emote,undefined);
});

test('bubbles follow standing/sitting/lying heads, expire despite repeated packets, and never leak across owners',()=>{
  const previous=globalThis.document;
  const previousPath=globalThis.Path2D;globalThis.Path2D=class {constructor(path){this.path=path;}};
  globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},beginPath(){},roundRect(){},fill(){},fillText(){}})})};
  const view=createEmoteView(THREE,new THREE.Scene());const avatar={root:new THREE.Object3D()};
  try{
    view.set('heart',1,3,'a');view.update(avatar,'stand',.1);const standing=view.sprite.position.y;
    view.update(avatar,'sit',.1);assert.ok(view.sprite.position.y<standing);
    view.update(avatar,'lie',.1);assert.ok(view.sprite.position.y<1.4);
    for(let i=0;i<120;i++){view.set('heart',1,3,'a');view.update(avatar,'lie',1/30);}
    assert.equal(view.sprite.visible,false,'repeated snapshots do not restart old expressions');
    view.set('wave',1,3,'b');view.update(avatar,'stand',.1);assert.equal(view.sprite.visible,true);
    view.set('',0,0,'c');view.update(avatar,'stand',.1);assert.equal(view.sprite.visible,false);
    view.set('wave',2,.2,'b');view.update(avatar,'stand',.3);assert.equal(view.sprite.visible,false,'late arrivals only see remaining duration');
  }finally{view.dispose();globalThis.document=previous;globalThis.Path2D=previousPath;}
});

test('old packets without expression fields remain compatible',()=>{
  const actor=actorFromPacket(['old',0,0,0,0,0,'lie','idle',0,null,null,false,false,'visitor',0,12,3,0]);
  assert.equal(actor.emote,'');assert.equal(actor.emoteLeft,0);assert.equal(actor.brokenCount,12);assert.equal(actor.posture,'lie');
});
