import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPlayfulAccessories} from '../src/playful-accessories.js';
import {createAvatar} from '../src/avatar.js';
import {createAvatarAppearance} from '../src/avatar-appearance.js';
import {createAvatarNameplate} from '../src/avatar-nameplate.js';
import {items,findItem,DEFAULT_OUTFIT} from '../src/cosmetics-catalog.js';
import {itemIcon} from '../src/icons.js';
import {createRoom} from '../server/room-engine.js';

const approved=['cat-ears','puppy-ears','moon-cap','flower-glasses','spiral-glasses',
  'bag-axolotl','bag-peach','bag-jellyfish','bag-cloud','bag-gamepad','bag-whale'];

test('all eleven approved designs are finite, compact, individually illustrated and include translucent grid bags',()=>{
  const roots=createPlayfulAccessories(THREE,new THREE.Group()),icons=new Set();
  assert.deepEqual(Object.keys(roots),approved);
  assert.equal(new Set(items.map(i=>i.id)).size,items.length);
  for(const id of approved){
    assert.ok(findItem(id)?.price>0);icons.add(itemIcon(id));
    const box=new THREE.Box3().setFromObject(roots[id]),size=box.getSize(new THREE.Vector3());
    assert.ok(box.min.y>.45&&box.max.y<1.8,`${id} stays above legs and within nameplate framing`);
    assert.ok(size.x<.80&&size.z<.56,`${id} remains close to the body`);
    let triangles=0;
    roots[id].traverse(o=>{if(!o.geometry)return;const p=o.geometry.getAttribute('position');assert.ok(Array.from(p.array).every(Number.isFinite),id);if(o.isMesh)triangles+=(o.geometry.index?.count??p.count)/3;});
    assert.ok(triangles<14000,`${id}: ${triangles} triangles`);
    if(id.startsWith('bag-')){
      const shell=roots[id].getObjectByName('pvc-shell'),grid=roots[id].getObjectByName('pvc-grid');
      assert.equal(shell.material.transparent,true);assert.equal(shell.material.depthWrite,false);
      assert.ok(shell.material.opacity>.3&&shell.material.opacity<.7);
      assert.ok(grid.geometry.getAttribute('position').count>30&&grid.geometry.getAttribute('position').count<200,'grid uses whole clipped segments');
      assert.ok(box.max.z<.16,'bags sit behind the face, with straps around shoulders');
    }
  }
  assert.equal(icons.size,11,'no new item falls back to another icon');
  assert.equal(findItem('big-ribbon'),undefined,'withdrawn ribbon is not sold');
  assert.equal(roots['big-ribbon'],undefined);
  for(const ear of roots['cat-ears'].children){const box=new THREE.Box3().setFromObject(ear);assert.ok(box.min.x>0||box.max.x<0,'cat ears have no connecting band');}
  const cap=roots['moon-cap'].children.find(o=>o.isMesh&&o.geometry.type==='BufferGeometry'),n=cap.geometry.getAttribute('normal');
  assert.ok(n.getX(0)>0,'nightcap faces outward with front-face culling');
});

test('both cat-ear bases overlap the real curved hood across their full attachment width',()=>{
  const roots=createPlayfulAccessories(THREE,new THREE.Group()),avatar=createAvatar(THREE);
  const hood=new THREE.Mesh(avatar.root.getObjectByName('hood').geometry,avatar.root.getObjectByName('hood').material);
  hood.updateMatrixWorld(true);roots['cat-ears'].updateWorldMatrix(true,true);
  try{for(const side of [-1,1])for(const x of [.105,.13,.155,.18,.205,.23]){
    const top=new THREE.Raycaster(new THREE.Vector3(side*x,2,0),new THREE.Vector3(0,-1,0)).intersectObject(hood)[0];
    const base=new THREE.Raycaster(new THREE.Vector3(side*x,.9,0),new THREE.Vector3(0,1,0)).intersectObject(roots['cat-ears'],true)[0];
    assert.ok(top&&base,'hood and ear meet on every sampled vertical section');
    assert.ok(base.point.y<top.point.y-.005,`ear base embeds in hood at ${side*x}`);
  }}finally{avatar.dispose();}
});

test('new outfits match between self and remote avatars, preserve other users, and clear titles in every pose',()=>{
  const previous=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},strokeText(){},fillText(){}})})};
  const scene=new THREE.Scene(),a=createAvatar(THREE),b=createAvatar(THREE);scene.add(a.root,b.root);
  const local=createAvatarAppearance(THREE,a),remote=createAvatarAppearance(THREE,b,{scene,external:true}),badge=createAvatarNameplate(THREE,scene,'새 옷 테스트');
  try{
    badge.setTitle('operator');
    for(let i=0;i<6;i++)for(const posture of ['stand','sit','lie']){
      const outfit={...DEFAULT_OUTFIT,head:approved[i%3],face:approved[3+i%2],bag:approved[5+i]};
      local.setOutfit(outfit);remote.setOutfit(outfit);
      a.update(.1,{posture,heading:.7,snap:true});b.update(.1,{posture,heading:.7,snap:true});
      local.update();remote.update();badge.update(a,posture,{headwear:local.headwear});
      const one=new THREE.Box3().setFromObject(local.root),two=new THREE.Box3().setFromObject(remote.root);
      assert.ok(one.min.distanceTo(two.min)<.0001&&one.max.distanceTo(two.max)<.0001);
      assert.ok(badge.sprite.position.y-badge.sprite.scale.y/2>new THREE.Box3().setFromObject(local.headwear[0]).max.y,'title and nickname clear all new headwear');
    }
    local.setOutfit(DEFAULT_OUTFIT);assert.equal(local.root.children.length,0);assert.equal(remote.root.children.length,3);
  }finally{badge.dispose();local.dispose();remote.dispose();a.dispose();b.dispose();globalThis.document=previous;}
});

test('buying eleven items charges once, preserves prior inventory and records, persists after a new room, and enforces ownership',()=>{
  let room=createRoom({random:()=>.42});room.join('buyer',{brokenCount:6000,repairedCount:17});room.join('other',{});
  const advance=()=>{for(let n=0;n<11;n++)room.step(.1);};
  for(const itemId of ['helmet-white','bag-bear','eyes-smile'])assert.equal(room.command('buyer','purchase',{itemId}).ok,true);
  const before=room.profile('buyer'),balance=room.wallet('buyer').chips;
  for(const itemId of approved){
    advance();
    const untouched=room.wallet('other');
    assert.equal(room.command('other','equip',{itemId}).ok,false);assert.equal(room.command('other','purchase',{itemId}).ok,false);assert.deepEqual(room.wallet('other'),untouched);
    assert.equal(room.command('buyer','purchase',{itemId}).ok,true);
  }
  const purchased=room.profile('buyer');assert.equal(purchased.wallet.chips,balance-18100);
  for(const id of [...approved,'helmet-white','bag-bear','eyes-smile'])assert.ok(purchased.wallet.owned.includes(id));
  for(const itemId of approved){advance();assert.equal(room.command('buyer','purchase',{itemId}).ok,true);}
  assert.equal(room.wallet('buyer').chips,purchased.wallet.chips,'repeat purchase does not charge twice');
  room=createRoom({random:()=>.2});assert.equal(room.join('buyer',JSON.parse(JSON.stringify(purchased))).ok,true);
  assert.deepEqual(room.profile('buyer').wallet,purchased.wallet);assert.equal(room.profile('buyer').brokenCount,before.brokenCount);assert.equal(room.profile('buyer').repairedCount,before.repairedCount);assert.equal(room.profile('buyer').name,before.name);
  for(const itemId of approved){advance();assert.equal(room.command('buyer','equip',{itemId}).ok,true);assert.equal(room.wallet('buyer').equipped[findItem(itemId).slot],itemId);}
  assert.equal(room.wallet('buyer').chips,purchased.wallet.chips,'owned outfits change for free');
  const costume=room.roster().find(p=>p[0]==='buyer')[3];assert.equal(costume.head,'moon-cap');assert.equal(costume.face,'spiral-glasses');assert.equal(costume.bag,'bag-whale');
  assert.equal(room.command('buyer','equip',{itemId:'unapproved-item'}).ok,false);
  assert.equal(room.command('buyer','purchase',{itemId:'big-ribbon'}).ok,false);
});
