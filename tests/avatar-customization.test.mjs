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
  globalThis.document={hidden:false,body:{append:e=>labels.push(e)},createElement:tag=>tag==='canvas'?{getContext:()=>({clearRect(){},strokeText(){},fillText(){}})}:{style:{setProperty(){}},setAttribute(){},remove(){this.removed=true;}}};
  const scene=new THREE.Scene(),avatar=createAvatar(THREE),badge=createAvatarNameplate(THREE,scene,'작은 칩',{screenLabel:true}),camera=new THREE.PerspectiveCamera(64,390/844,.08,420);scene.add(avatar.root);
  try{
    camera.position.set(0,3,12);camera.lookAt(0,1.5,0);camera.updateMatrixWorld();badge.update(avatar,'stand');badge.updateScreen(camera);
    assert.equal(labels.length,1);assert.equal(labels[0].textContent,'작은 칩');assert.equal(labels[0].hidden,false);assert.equal(badge.sprite.visible,false,'never show both a sprite and a screen label');
    assert.match(labels[0].style.transform,/translate\(195px,/);badge.rename('새 이름');assert.equal(labels[0].textContent,'새 이름');
    avatar.root.visible=false;badge.update(avatar,'stand');badge.updateScreen(camera);assert.equal(labels[0].hidden,true);
  }finally{badge.dispose();avatar.dispose();globalThis.document=old.document;globalThis.innerWidth=old.width;globalThis.innerHeight=old.height;}
  assert.equal(labels[0].removed,true);
});

test('titles extend above the unchanged nickname without reducing its pixels or crossing headwear',()=>{
  const old=globalThis.document,draws=[];
  globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},strokeText(){},fillText(text,x,y){draws.push({text,x,y,color:this.fillStyle});}})})};
  const scene=new THREE.Scene(),avatar=createAvatar(THREE),appearance=createAvatarAppearance(THREE,avatar),badge=createAvatarNameplate(THREE,scene,'FAB짱 세미',{resident:true}),camera=new THREE.PerspectiveCamera(64,390/844,.08,420);scene.add(avatar.root);
  try{
    for(const head of ['helmet-white','bunny-ears','crown'])for(const posture of ['stand','sit','lie'])for(const distance of [4,8,18]){
      appearance.setOutfit({...DEFAULT_OUTFIT,head});avatar.update(.1,{posture,snap:true});appearance.update();
      camera.position.set(0,1.6,distance);camera.lookAt(0,1.6,0);camera.updateMatrixWorld();
      badge.setTitle('');badge.update(avatar,posture,{camera,viewportHeight:844,headwear:appearance.headwear});
      const original=badge.sprite.position.clone(),height=badge.sprite.scale.y;
      badge.setTitle('operator');badge.update(avatar,posture,{camera,viewportHeight:844,headwear:appearance.headwear});
      const canvas=badge.sprite.material.map.image;
      assert.ok(Math.abs(badge.sprite.scale.y*96/canvas.height-height)<1e-10,'nickname glyph size stays unchanged');
      assert.ok(Math.abs(badge.sprite.position.y-height*80/96/2-original.y)<1e-10,'nickname baseline stays in place');
      assert.ok(badge.sprite.position.y-badge.sprite.scale.y/2>new THREE.Box3().setFromObject(appearance.headwear[0]).max.y);
      const depth=-badge.sprite.position.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const pixels=badge.sprite.scale.y*38/canvas.height*844/(2*Math.tan(camera.fov*Math.PI/360)*depth);
      assert.ok(pixels>=11&&pixels<=14.3,`title remains legible: ${pixels}px`);
    }
    assert.deepEqual(draws.slice(-2).map(d=>[d.text,d.color]),[['〈운영자〉','#b02d78'],['FAB짱 세미','#204e55']]);
    const texture=badge.sprite.material.map;badge.setTitle('operator');assert.equal(badge.sprite.material.map,texture,'unchanged titles do not create textures');
    badge.setTitle('unknown');assert.equal(badge.titleId,'');badge.update(avatar,'lie');assert.equal(badge.sprite.material.map.image.height,96);
  }finally{badge.dispose();appearance.dispose();avatar.dispose();globalThis.document=old;}
});

test('self title uses separate colored text above the nickname, follows hiding and preserves renames',()=>{
  const old={document:globalThis.document,width:globalThis.innerWidth,height:globalThis.innerHeight},labels=[];
  globalThis.innerWidth=390;globalThis.innerHeight=844;
  globalThis.document={hidden:false,body:{append:e=>labels.push(e)},createElement:tag=>tag==='canvas'?{getContext:()=>({clearRect(){},strokeText(){},fillText(){}})}:{attributes:{},style:{setProperty(k,v){this[k]=v;}},setAttribute(k,v){this.attributes[k]=v;},remove(){}}};
  const scene=new THREE.Scene(),avatar=createAvatar(THREE),badge=createAvatarNameplate(THREE,scene,'작은 칩',{screenLabel:true}),camera=new THREE.PerspectiveCamera(64,390/844,.08,420);scene.add(avatar.root);
  try{
    camera.position.set(0,3,12);camera.lookAt(0,1.5,0);camera.updateMatrixWorld();badge.update(avatar,'stand');badge.updateScreen(camera);const anchor=labels[0].style.transform;
    badge.setTitle('break-5');badge.rename('다른 이름');badge.update(avatar,'stand');badge.updateScreen(camera);
    assert.equal(labels[0].textContent,'다른 이름');assert.equal(labels[0].attributes['data-title'],'〈꼬마 사고뭉치〉');assert.equal(labels[0].style['--title-color'],'#277044');assert.equal(labels[0].style.transform,anchor);
    badge.setTitle('');assert.equal(labels[0].attributes['data-title'],'');assert.equal(labels[0].textContent,'다른 이름');
    globalThis.document.hidden=true;badge.updateScreen(camera);assert.equal(labels[0].hidden,true);
  }finally{badge.dispose();avatar.dispose();globalThis.document=old.document;globalThis.innerWidth=old.width;globalThis.innerHeight=old.height;}
});

test('NPC markers fit beside short and long names without shifting centered titles or reducing readable glyph size',()=>{
  const old=globalThis.document,draws=[],pills=[];
  globalThis.document={createElement:()=>({getContext:()=>({clearRect(){draws.length=0;pills.length=0;},strokeText(){},measureText:text=>({width:text.length*48}),beginPath(){},roundRect(x,y,width,height){pills.push({x,y,width,height});},fill(){},fillText(text,x,y,maxWidth){draws.push({text,x,y,maxWidth,color:this.fillStyle});}})})};
  const scene=new THREE.Scene(),avatar=createAvatar(THREE),badge=createAvatarNameplate(THREE,scene,'칩',{resident:true}),camera=new THREE.PerspectiveCamera(64,390/844,.08,420);scene.add(avatar.root);
  try{
    for(const name of ['칩','반짝이는웨이퍼','long-name-overflow'])for(const title of ['', 'break-100'])for(const distance of [4,18]){
      camera.position.set(0,1.6,distance);camera.lookAt(0,1.6,0);camera.updateMatrixWorld();
      badge.setNpcMarker(false);badge.rename(name);badge.setTitle(title);badge.update(avatar,'stand',{camera,viewportHeight:844});
      const position=badge.sprite.position.clone(),scale=badge.sprite.scale.clone();
      badge.setNpcMarker(true);badge.update(avatar,'stand',{camera,viewportHeight:844});
      const canvas=badge.sprite.material.map.image,nameDraw=draws.find(d=>d.text===name),marker=draws.find(d=>d.text==='NPC'),pill=pills[0];
      assert.deepEqual(badge.sprite.position,position,'headwear/name/title anchors stay centered');
      assert.equal(badge.sprite.scale.y,scale.y);assert.ok(Math.abs(badge.sprite.scale.x/canvas.width-scale.x/512)<1e-12,'nickname and title pixels stay unchanged');
      assert.equal(nameDraw.x,canvas.width/2);if(title)assert.equal(draws[0].x,nameDraw.x);
      assert.ok(pill.x>nameDraw.x+Math.min(480,name.length*48)/2);assert.ok(pill.x+pill.width<canvas.width,'marker remains inside the texture');
      assert.equal(marker.color,'#315c84');assert.equal(badge.sprite.material.depthTest,true,'NPC badge follows ordinary equipment occlusion');
      const texture=badge.sprite.material.map;badge.setNpcMarker(true);assert.equal(badge.sprite.material.map,texture,'stable markers do not allocate every frame');
    }
    badge.setNpcMarker(false);assert.equal(badge.sprite.material.map.image.width,512);assert.ok(!draws.some(d=>d.text==='NPC'));
  }finally{badge.dispose();avatar.dispose();globalThis.document=old;}
});
