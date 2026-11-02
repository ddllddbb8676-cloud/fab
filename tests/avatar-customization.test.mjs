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
    for(const head of ['helmet-white','helmet-orange','sprout','crown','bunny-ears','baby-chick'])for(const posture of ['stand','sit','lie'])for(const heading of [0,1.5,3.14]){
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

test('nearby nickname glyphs retain a readable screen size at wide camera distances with depth occlusion intact',()=>{
  const oldDocument=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},strokeText(){},fillText(){}})})};
  const scene=new THREE.Scene(),avatar=createAvatar(THREE),badge=createAvatarNameplate(THREE,scene,'읽기좋은칩',{resident:true}),camera=new THREE.PerspectiveCamera(64,390/844,.08,420);scene.add(avatar.root);
  try{
    for(const distance of [4,8,12,18,24]){
      camera.position.set(0,1.6,distance);camera.lookAt(0,1.6,0);camera.updateMatrixWorld();badge.update(avatar,'stand',{camera,viewportHeight:844});
      const depth=-badge.sprite.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const glyphPixels=badge.sprite.scale.y*.5*844/(2*Math.tan(camera.fov*Math.PI/360)*depth);
      assert.ok(glyphPixels>=13.99&&glyphPixels<=18.01,`distance ${distance}: ${glyphPixels}px`);
    }
    assert.equal(badge.sprite.material.depthTest,true);assert.equal(badge.sprite.material.fog,false);
  }finally{badge.dispose();avatar.dispose();globalThis.document=oldDocument;}
});

test('the self nickname uses a native screen label that follows renames and hides during destruction shots',()=>{
  const old={document:globalThis.document,width:globalThis.innerWidth,height:globalThis.innerHeight},labels=[];
  globalThis.innerWidth=390;globalThis.innerHeight=844;
  globalThis.document={hidden:false,body:{append:e=>labels.push(e)},createElement:tag=>tag==='canvas'?{getContext:()=>({clearRect(){},strokeText(){},fillText(){}})}:{style:{},setAttribute(){},remove(){this.removed=true;}}};
  const scene=new THREE.Scene(),avatar=createAvatar(THREE),badge=createAvatarNameplate(THREE,scene,'작은 칩',{screenLabel:true}),camera=new THREE.PerspectiveCamera(64,390/844,.08,420);scene.add(avatar.root);
  try{
    camera.position.set(0,3,12);camera.lookAt(0,1.5,0);camera.updateMatrixWorld();badge.update(avatar,'stand');badge.updateScreen(camera);
    assert.equal(labels.length,1);assert.equal(labels[0].textContent,'작은 칩');assert.equal(labels[0].hidden,false);assert.equal(badge.sprite.visible,false,'never show both a sprite and a screen label');
    assert.match(labels[0].style.transform,/translate\(195px,/);badge.rename('새 이름');assert.equal(labels[0].textContent,'새 이름');
    avatar.root.visible=false;badge.update(avatar,'stand');badge.updateScreen(camera);assert.equal(labels[0].hidden,true);
  }finally{badge.dispose();avatar.dispose();globalThis.document=old.document;globalThis.innerWidth=old.width;globalThis.innerHeight=old.height;}
  assert.equal(labels[0].removed,true);
});
