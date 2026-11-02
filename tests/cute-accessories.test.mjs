import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAvatar} from '../src/avatar.js';
import {createAvatarAppearance} from '../src/avatar-appearance.js';
import {createCuteAccessories} from '../src/cute-accessories.js';
import {findItem,DEFAULT_OUTFIT} from '../src/cosmetics-catalog.js';
import {itemIcon} from '../src/icons.js';
import {createRoom} from '../server/room-engine.js';
const approved=['bunny-ears','heart-glasses','baby-chick','bag-star'];

test('approved four items have matching catalog, icon and finite geometry; no FOUP bag is offered',()=>{
  const root=new THREE.Group(),accessories=createCuteAccessories(THREE,root);
  assert.deepEqual(Object.keys(accessories),approved);assert.deepEqual(approved.map(id=>findItem(id).price),[300,600,900,2200]);assert.equal(findItem('bag-foup'),undefined);
  for(const id of approved){assert.match(itemIcon(id),/<svg/);assert.ok(!new THREE.Box3().setFromObject(accessories[id]).isEmpty());accessories[id].traverse(o=>{if(o.geometry)assert.ok(Array.from(o.geometry.getAttribute('position').array).every(Number.isFinite));});}
  const bunnyBounds=new THREE.Box3().setFromObject(accessories['bunny-ears']);assert.ok(bunnyBounds.min.y>1.35,'only the ears remain above the hood; no band around its sides');
  accessories['heart-glasses'].traverse(o=>{if(o.isMesh&&!o.material.transparent)assert.equal(o.material.color.getHexString(),'ff1685');});
  const star=accessories['bag-star'];assert.equal(star.getObjectByName('pvc-shell').material.transparent,true);assert.ok(star.getObjectByName('pvc-grid').geometry.getAttribute('position').count>100);
});

test('new items attach to local and remote avatars through all movement poses without changing other outfits',()=>{
  const scene=new THREE.Scene(),a=createAvatar(THREE),b=createAvatar(THREE);scene.add(a.root,b.root);
  const local=createAvatarAppearance(THREE,a),remote=createAvatarAppearance(THREE,b,{scene,external:true});
  try{
    for(const head of ['bunny-ears','baby-chick'])for(const posture of ['stand','sit','lie'])for(const heading of [0,1.5,3.14]){
      const outfit={...DEFAULT_OUTFIT,head,face:'heart-glasses',bag:'bag-star'};local.setOutfit(outfit);remote.setOutfit(outfit);
      a.update(.1,{posture,heading,snap:true});b.update(.1,{posture,heading,snap:true});a.root.updateMatrixWorld(true);b.root.updateMatrixWorld(true);local.update();remote.update();
      assert.equal(local.root.children.length,3);assert.equal(remote.root.children.length,3);
      const localBox=new THREE.Box3().setFromObject(local.root),remoteBox=new THREE.Box3().setFromObject(remote.root);
      assert.ok(localBox.min.distanceTo(remoteBox.min)<.001);assert.ok(localBox.max.distanceTo(remoteBox.max)<.001);
    }
    local.setOutfit(DEFAULT_OUTFIT);assert.equal(local.root.children.length,0);assert.equal(remote.root.children.length,3);
  }finally{local.dispose();remote.dispose();a.dispose();b.dispose();}
});

test('purchasing all four preserves prior purchases, counters and wallet across reconnect with exact prices',()=>{
  const room=createRoom({random:()=>.42});room.join('buyer',{brokenCount:1000,repairedCount:3});
  assert.equal(room.command('buyer','purchase',{itemId:'helmet-white'}).ok,true);
  for(const id of approved)assert.equal(room.command('buyer','purchase',{itemId:id}).ok,true);
  const wallet=room.wallet('buyer');assert.equal(wallet.chips,859);assert.ok(wallet.owned.includes('helmet-white'));for(const id of approved)assert.ok(wallet.owned.includes(id));
  assert.equal(room.command('buyer','purchase',{itemId:'bunny-ears'}).ok,true);assert.equal(room.wallet('buyer').chips,859);
  const before=room.profile('buyer');room.remove('buyer');assert.equal(room.join('buyer',before).ok,true);const after=room.profile('buyer');
  assert.deepEqual(after.wallet,before.wallet);assert.equal(after.brokenCount,1000);assert.equal(after.repairedCount,3);assert.equal(after.name,before.name);
  assert.equal(room.roster().find(r=>r[0]==='buyer')[3].head,'bunny-ears');assert.equal(room.roster().find(r=>r[0]==='buyer')[3].face,'heart-glasses');assert.equal(room.roster().find(r=>r[0]==='buyer')[3].bag,'bag-star');
  assert.equal(room.command('buyer','purchase',{itemId:'bag-foup'}).ok,false);assert.equal(room.wallet('buyer').chips,859);
});
