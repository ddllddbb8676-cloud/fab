import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoom} from '../server/room-engine.js';
import {createAvatar} from '../src/avatar.js';
import {createAvatarAppearance} from '../src/avatar-appearance.js';
import {DEFAULT_OUTFIT,findItem,suitColor} from '../src/cosmetics-catalog.js';
import {itemIcon} from '../src/icons.js';

test('baby pink uses the original item identity and costs fifty chips once',()=>{
  const room=createRoom();room.join('visitor:pink',{id:'visitor:pink',name:'분홍칩',brokenCount:10,repairedCount:0});
  assert.equal(findItem('suit-pink').price,50);assert.equal(room.wallet('visitor:pink').chips,50);
  assert.equal(room.command('visitor:pink','purchase',{itemId:'suit-pink'}).ok,true);assert.equal(room.wallet('visitor:pink').chips,0);
  assert.equal(room.command('visitor:pink','purchase',{itemId:'suit-pink'}).ok,true);assert.equal(room.wallet('visitor:pink').chips,0);
  assert.equal(room.wallet('visitor:pink').owned.filter(id=>id==='suit-pink').length,1);
});
test('previous pink suit owners restore ownership, outfit, balance and records without a new purchase',()=>{
  const profile={id:'visitor:existing-pink',name:'분홍칩',brokenCount:123,repairedCount:45,wallet:{version:1,revision:7,chips:678,retroGrant:0,owned:['suit-default','eyes-default','suit-pink'],equipped:{...DEFAULT_OUTFIT,suit:'suit-pink'}}};
  const room=createRoom();room.join(profile.id,profile);
  assert.equal(room.wallet(profile.id).chips,678);assert.equal(room.wallet(profile.id).equipped.suit,'suit-pink');
  assert.equal(room.players.get(profile.id).brokenCount,123);assert.equal(room.players.get(profile.id).repairedCount,45);
  assert.equal(room.command(profile.id,'equip',{itemId:'suit-pink'}).ok,true);assert.equal(room.wallet(profile.id).chips,678);
  const saved=room.profile(profile.id);room.remove(profile.id);room.join(profile.id,saved);assert.equal(room.wallet(profile.id).equipped.suit,'suit-pink');
});
test('baby pink changes only the selected avatar suit and restores correctly after a safety duty',()=>{
  const document=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},fillText(){},strokeText(){}})})};
  const a=createAvatar(THREE),b=createAvatar(THREE),appearance=createAvatarAppearance(THREE,a),other=createAvatarAppearance(THREE,b);
  try{
    const face=a.root.getObjectByName('face').material.color.clone();
    appearance.setOutfit({...DEFAULT_OUTFIT,suit:'suit-pink'});
    assert.equal(suitColor({suit:'suit-pink'}),'#f6d1dc');assert.match(itemIcon('suit-pink'),/#f6d1dc/);
    for(const name of ['hood','torso'])assert.equal(a.root.getObjectByName(name).material.color.getHexString(),'f6d1dc');
    assert.equal(b.root.getObjectByName('torso').material.color.getHexString(),'ffffff');assert.equal(a.root.getObjectByName('face').material.color.equals(face),true);
    appearance.setOutfit({suit:'suit-pink'},'safety-orange');assert.notEqual(a.root.getObjectByName('torso').material.color.getHexString(),'f6d1dc');
    appearance.setOutfit({suit:'suit-pink'},'visitor');assert.equal(a.root.getObjectByName('torso').material.color.getHexString(),'f6d1dc');
  }finally{appearance.dispose();other.dispose();a.dispose();b.dispose();globalThis.document=document;}
});
