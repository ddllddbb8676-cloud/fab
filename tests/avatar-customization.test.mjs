import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAvatar} from '../src/avatar.js';
import {createAvatarAppearance} from '../src/avatar-appearance.js';
import {createAvatarNameplate} from '../src/avatar-nameplate.js';
import {DEFAULT_OUTFIT} from '../src/cosmetics-catalog.js';
test('name clears headwear across poses and angles, while outfit changes stay local to each avatar',()=>{
  const oldDocument=globalThis.document,calls=[];
  globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},strokeText(){calls.push(['stroke',this.strokeStyle]);},fillText(){calls.push(['fill',this.fillStyle]);}})})};
  const scene=new THREE.Scene(),a=createAvatar(THREE),b=createAvatar(THREE);scene.add(a.root,b.root);
  const appearance=createAvatarAppearance(THREE,a),other=createAvatarAppearance(THREE,b),badge=createAvatarNameplate(THREE,scene,'FAB짱 세미');
  try{
    assert.deepEqual(calls,[['stroke','#f4fbf8'],['fill','#204e55']]);
    for(const head of ['helmet-white','helmet-orange','sprout','crown'])for(const posture of ['stand','sit','lie'])for(const heading of [0,1.5,3.14]){
      appearance.setOutfit({...DEFAULT_OUTFIT,head,bag:'bag-bear',face:'glasses',beauty:'eyes-cry',suit:'suit-black'});
      a.update(.1,{posture,heading,snap:true});a.root.updateMatrixWorld(true);appearance.update();badge.update(a,posture,{headwear:appearance.headwear});
      const box=new THREE.Box3().setFromObject(appearance.headwear[0]);assert.ok(badge.sprite.position.y-.09>box.max.y,'name never crosses the headwear');assert.ok(badge.sprite.position.toArray().every(Number.isFinite));
    }
    assert.equal(b.root.getObjectByName('torso').material.color.getHexString(),'ffffff');
    assert.notEqual(a.root.getObjectByName('face').material,b.root.getObjectByName('face').material);
    appearance.setOutfit({...DEFAULT_OUTFIT,suit:'suit-black'},'safety-orange');assert.notEqual(a.root.getObjectByName('torso').material.color.getHexString(),'35434f');
    appearance.setOutfit({...DEFAULT_OUTFIT,suit:'suit-black'},'visitor');assert.equal(a.root.getObjectByName('torso').material.color.getHexString(),'35434f');
  }finally{badge.dispose();appearance.dispose();other.dispose();a.dispose();b.dispose();globalThis.document=oldDocument;}
});
