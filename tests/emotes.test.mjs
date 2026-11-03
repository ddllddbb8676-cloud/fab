import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoom} from '../server/room-engine.js';
import {actorFromPacket} from '../src/shared-protocol.js';
import {EMOTES,EMOTE_SECONDS} from '../src/emotes.js';
import {createEmoteView} from '../src/emote-view.js';

test('seventeen validated emotes are shared, rate limited, expire and never alter saved scores',()=>{
  const room=createRoom();room.join('a');const player=room.players.get('a');
  player.hidden=false;player.penalty=3;player.brokenCount=7;player.repairedCount=2;
  const walletBefore=structuredClone(player.wallet);
  assert.equal(EMOTES.length,17);assert.equal(new Set(EMOTES.map(e=>e.id)).size,17);assert.equal(new Set(EMOTES.map(e=>e.emoji)).size,17);
  assert.deepEqual(EMOTES.slice(10).map(e=>e.emoji),['😆','😁','😪','❌','👻','💤','🤔']);assert.equal(room.command('a','emote',{id:'<script>'}).ok,false);
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
  assert.deepEqual(profile.wallet,walletBefore,'expressions do not spend or grant chips or change purchases');
});

test('bubbles follow standing/sitting/lying heads, expire despite repeated packets, and never leak across owners',()=>{
  const previous=globalThis.document;
  const previousPath=globalThis.Path2D;globalThis.Path2D=class {constructor(path){this.path=path;}};
  globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},beginPath(){},roundRect(){},fill(){},fillText(){}})})};
  const view=createEmoteView(THREE,new THREE.Scene()),self=createEmoteView(THREE,new THREE.Scene(),{self:true});const avatar={root:new THREE.Object3D()};
  try{
    for(const {id} of EMOTES){
      view.set(id,1,3,'a');self.set(id,1,3,'a');view.update(avatar,'stand',.1);self.update(avatar,'stand',.1);
      assert.equal(view.sprite.visible,true);assert.equal(self.sprite.visible,true);
      assert.equal(view.sprite.material.map,self.sprite.material.map,'local and remote bubbles share the same expression');
    }
    view.set('heart',1,3,'a');view.update(avatar,'stand',.1);const standing=view.sprite.position.y;
    view.update(avatar,'sit',.1);assert.ok(view.sprite.position.y<standing);
    view.update(avatar,'lie',.1);assert.ok(view.sprite.position.y<1.4);
    for(let i=0;i<120;i++){view.set('heart',1,3,'a');view.update(avatar,'lie',1/30);}
    assert.equal(view.sprite.visible,false,'repeated snapshots do not restart old expressions');
    view.set('wave',1,3,'b');view.update(avatar,'stand',.1);assert.equal(view.sprite.visible,true);
    view.set('',0,0,'c');view.update(avatar,'stand',.1);assert.equal(view.sprite.visible,false);
    view.set('wave',2,.2,'b');view.update(avatar,'stand',.3);assert.equal(view.sprite.visible,false,'late arrivals only see remaining duration');
  }finally{view.dispose();self.dispose();globalThis.document=previous;globalThis.Path2D=previousPath;}
});

test('old packets without expression fields remain compatible',()=>{
  const actor=actorFromPacket(['old',0,0,0,0,0,'lie','idle',0,null,null,false,false,'visitor',0,12,3,0]);
  assert.equal(actor.emote,'');assert.equal(actor.emoteLeft,0);assert.equal(actor.brokenCount,12);assert.equal(actor.posture,'lie');
});

function emoteFixture() {
  const previous=globalThis.document,previousPath=globalThis.Path2D;
  globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},beginPath(){},roundRect(){},fill(){},fillText(){}})})};
  globalThis.Path2D=class {};
  const view=createEmoteView(THREE,new THREE.Scene(),{self:true}),avatar={root:new THREE.Object3D()};
  return {view,avatar,close(){view.dispose();globalThis.document=previous;globalThis.Path2D=previousPath;}};
}

test('self feedback appears before the reply, survives queued frames and ignores a rejected older tap',()=>{
  const {view,avatar,close}=emoteFixture();
  try {
    view.set('',0,0);
    const first=view.play('plead');view.update(avatar,'stand',.01);assert.equal(view.sprite.visible,true);
    view.set('',0,0);view.update(avatar,'stand',.2);assert.equal(view.sprite.visible,true,'pre-tap snapshots cannot hide local feedback');
    const second=view.play('cool'),current=view.sprite.material.map;
    view.cancel(first);view.set('plead',1,2.8);view.update(avatar,'stand',.2);
    assert.equal(view.sprite.visible,true);assert.equal(view.sprite.material.map,current,'older reply cannot replace the latest tap');
    view.set('cool',2,2.6);view.update(avatar,'stand',.2);
    for(let i=0;i<30;i++){view.set('cool',2,2.6);view.update(avatar,'stand',.1);}
    assert.equal(view.sprite.visible,false,'echoed snapshots do not prolong the expression');
    const rejected=view.play('thumbs-up');view.update(avatar,'stand',.01);view.cancel(rejected);
    assert.equal(view.sprite.visible,false,'failed transmission rolls back its own preview');
    view.play('wave');view.update(avatar,'stand',3.1);assert.equal(view.sprite.visible,false,'no reply still expires');
    view.play('heart');view.reset();view.set('clap',1,3);view.update(avatar,'stand',.1);
    assert.equal(view.sprite.visible,true,'reconnection accepts fresh server sequences');
    assert.equal(view.play('invalid'),null);assert.notEqual(second,first);
  } finally {close();}
});

test('self expressions stay readable above the title in close and distant top views',()=>{
  const {view,avatar,close}=emoteFixture();
  try {
    for(const viewportHeight of [390,844])for(const distance of [3,6,24,220,400])for(const title of [false,true]) {
      const anchor=new THREE.Vector3(0,1.6,0),camera=new THREE.PerspectiveCamera(72,390/viewportHeight,.08,1000);
      camera.position.set(0,anchor.y+distance*.9,distance*.43);camera.lookAt(anchor);camera.updateMatrixWorld();
      view.play('heart');view.update(avatar,'stand',.1,true,{camera,anchor,title,viewportHeight});
      assert.equal(view.sprite.visible,true);
      const depth=-view.sprite.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const perPixel=2*Math.tan(camera.fov*Math.PI/360)*depth/viewportHeight;
      assert.ok(Math.abs(view.sprite.scale.y/perPixel-38)<1e-8,`38px at distance ${distance}`);
      assert.ok(-view.sprite.center.y*view.sprite.scale.y/perPixel>=(title?42:26)-1e-8,'bubble clears nickname and title');
      assert.equal(view.sprite.material.fog,false);assert.equal(view.sprite.material.depthTest,false);
    }
  } finally {close();}
});
