import test from 'node:test';
import assert from 'node:assert/strict';
import {stat} from 'node:fs/promises';
import * as THREE from 'three';
import {collectionItems} from '../src/collection-catalog.js';
import {items,findItem,DEFAULT_OUTFIT} from '../src/cosmetics-catalog.js';
import {createAvatar} from '../src/avatar.js';
import {createAvatarAppearance} from '../src/avatar-appearance.js';
import {createRemotePeople} from '../src/remote-people.js';
import {createWardrobeView} from '../src/wardrobe-view.js';
import {createCollectionAccessory,updateCollectionAccessory} from '../src/collection-accessories.js';
import {itemIcon} from '../src/icons.js';
import {safetyColor} from '../src/safety-team.js';
import {createRoom} from '../server/room-engine.js';
import {candidates} from '../prototypes/cosmetics-20261109/catalog.js';
import {equipCandidate} from '../prototypes/cosmetics-20261109/models.js';

const selected=[1,2,4,6,7,8,10,11,13,15,17,20,21,22,24,25,26,29,30];
function textureThree(){
  const requests=[];
  return {requests,three:{...THREE,TextureLoader:class{load(url,done,progress,failed){const texture=new THREE.Texture();requests.push({url,texture,done,failed});return texture;}}}};
}
const cloth=avatar=>{const result=[];avatar.root.traverse(o=>{if(o.isMesh&&['hood','torso','pants','upperArm','forearm'].includes(o.name))result.push(o);});return result;};
const fakeDocument=()=>({createElement:()=>({getContext:()=>({clearRect(){},beginPath(){},roundRect(){},fill(){},measureText:text=>({width:String(text).length*48}),fillText(){},strokeText(){}})})});

test('only the nineteen approved numbered designs ship at their reviewed prices, with bounded local images',async()=>{
  assert.deepEqual(collectionItems.map(i=>i.reviewNumber),selected);
  assert.equal(new Set(items.map(i=>i.id)).size,items.length);
  for(const candidate of candidates){
    const item=findItem(candidate.id);
    if(!selected.includes(candidate.number)){assert.equal(item,undefined);continue;}
    assert.equal(item.name,candidate.name);assert.equal(item.price,candidate.price);assert.equal(item.slot,candidate.slot);
    assert.match(itemIcon(item.id),new RegExp(item.id+'-v1.webp'));
    for(const ext of item.slot==='suit'?['png','webp']:['webp']){
      const file=new URL('../assets/cosmetics/'+item.id+'-v1.'+ext,import.meta.url),size=(await stat(file)).size;
      assert.ok(size>100&&size<180000,'textures and thumbnails remain small: '+item.id);
    }
  }
  assert.equal(findItem('suit-pink').price,50);assert.equal(findItem('suit-blue').price,50);assert.equal(findItem('suit-green').price,50);
});

test('approved accessories retain prototype geometry, motion and pose attachment with shared resources',()=>{
  for(const item of collectionItems.filter(i=>i.slot!=='suit')){
    const production=createCollectionAccessory(THREE,item),avatar=createAvatar(THREE),original=equipCandidate(THREE,avatar,candidates.find(c=>c.id===item.id));
    try{
      avatar.root.getObjectByName('hood').parent.add(production.root);
      updateCollectionAccessory(production.root,.7);original.update(.7);
      for(const posture of ['stand','sit','lie']){
        avatar.update(.1,{posture,heading:.63,snap:true});avatar.root.updateMatrixWorld(true);
        const one=new THREE.Box3().setFromObject(production.root),two=new THREE.Box3().setFromObject(original.root);
        assert.ok(one.min.distanceTo(two.min)<1e-6&&one.max.distanceTo(two.max)<1e-6,item.id+' matches approved bounds');
      }
      let triangles=0,draws=0;production.root.traverse(o=>{if(o.isMesh){draws++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));}});
      assert.ok(draws<=12&&triangles<=4032,item.id+' stays within approved geometry budget');
      const clone=production.root.clone(true);updateCollectionAccessory(clone,2);updateCollectionAccessory(production.root,2);
      assert.deepEqual(clone.toJSON().object.children.map(c=>c.matrix),production.root.toJSON().object.children.map(c=>c.matrix));
    }finally{production.dispose();original.dispose();avatar.dispose();}
  }
});

test('pattern loading is lazy and shared, UVs match review, uniforms override it and switching restores the body',()=>{
  const {three,requests}=textureThree(),a=createAvatar(three),b=createAvatar(three),ap=createAvatarAppearance(three,a),bp=createAvatarAppearance(three,b);
  const originalGeometry=cloth(a).map(m=>m.geometry);
  try{
    assert.equal(requests.length,0,'no costume download during ordinary entry');
    const outfit={...DEFAULT_OUTFIT,suit:'suit-prism',head:'head-ufo',bag:'bag-rockets'};
    ap.setOutfit(outfit);bp.setOutfit(outfit);assert.equal(requests.length,1);
    assert.equal(cloth(a).length,8);
    for(let i=0;i<8;i++){assert.equal(cloth(a)[i].geometry,cloth(b)[i].geometry);assert.equal(cloth(a)[i].material,cloth(b)[i].material);}
    const reference=createAvatar(three);reference.update(0,{snap:true});const reviewed=equipCandidate(three,reference,candidates.find(c=>c.number===1));
    try{for(let i=0;i<8;i++)assert.deepEqual(cloth(a)[i].geometry.attributes.uv.array,cloth(reference)[i].geometry.attributes.uv.array);}finally{reviewed.dispose();reference.dispose();}
    assert.equal(cloth(a)[0].material.map,null,'the game can render before texture response');
    const shared=cloth(a)[0].material;let disposed=0;shared.addEventListener('dispose',()=>disposed++);
    requests[0].done(requests[0].texture);assert.equal(shared.map,requests[0].texture);assert.equal(shared.color.getHexString(),'ffffff');
    ap.setOutfit(outfit,'safety-red');assert.equal(cloth(a)[0].userData.patternedSuit,undefined);assert.equal(cloth(a)[0].material.color.getHexString(),new THREE.Color(safetyColor('safety-red')).getHexString());
    assert.equal(ap.root.children.length,2,'only suit changes for the uniform');assert.equal(cloth(b)[0].material,shared);
    ap.setOutfit({...outfit,suit:'suit-black'});assert.equal(cloth(a)[0].userData.patternedSuit,undefined,'event team colors hide the pattern');
    ap.setOutfit(outfit);assert.equal(cloth(a)[0].material,shared);assert.equal(requests.length,1);
    ap.setOutfit(DEFAULT_OUTFIT);assert.equal(ap.root.children.length,0);for(let i=0;i<8;i++)assert.equal(cloth(a)[i].geometry,originalGeometry[i]);
    ap.dispose();assert.equal(disposed,0,'another visitor still uses the shared suit');bp.dispose();assert.equal(disposed,1);
  }finally{ap.dispose();bp.dispose();a.dispose();b.dispose();}
});

test('texture failure stays playable and a late response cannot resurrect disposed cosmetics',()=>{
  const {three,requests}=textureThree(),avatar=createAvatar(three),appearance=createAvatarAppearance(three,avatar);
  appearance.setOutfit({...DEFAULT_OUTFIT,suit:'suit-aurora'});assert.equal(appearance.needsAnimation,true);
  requests[0].failed();assert.equal(appearance.needsAnimation,false);assert.equal(cloth(avatar)[0].material.map,null);
  appearance.setOutfit({...DEFAULT_OUTFIT,suit:'suit-magma'});const material=cloth(avatar)[0].material;
  appearance.dispose();avatar.dispose();requests[1].done(requests[1].texture);assert.equal(material.map,null);
});

test('a suit texture finishing between preview frames gets a final redraw, and closing stops the loop',()=>{
  const names=['document','devicePixelRatio','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'],previous=names.map(n=>globalThis[n]);
  const frames=new Map(),renders=[];let serial=0;
  globalThis.document=fakeDocument();globalThis.devicePixelRatio=1;globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  const step=time=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time));};
  const {three,requests}=textureThree();three.WebGLRenderer=class{setPixelRatio(){}setSize(){}dispose(){}render(scene){renders.push(scene.getObjectByName('hood').material.map);}};
  let preview;
  try{
    preview=createWardrobeView(three,{clientWidth:320,clientHeight:240},'검수');preview.setOutfit({...DEFAULT_OUTFIT,suit:'suit-prism'});
    step(100);const before=renders.length;requests[0].done(requests[0].texture);step(115);assert.equal(renders.length,before);step(180);
    assert.equal(renders.length,before+1);assert.equal(renders.at(-1),requests[0].texture);
    step(280);assert.equal(renders.length,before+1,'settled static previews stop drawing');preview.dispose();preview=null;assert.equal(frames.size,0);
  }finally{preview?.dispose();names.forEach((name,i)=>{if(previous[i]===undefined)delete globalThis[name];else globalThis[name]=previous[i];});}
});

test('forty patterned remote bodies batch by shared parts and discard stale instances on reuse',()=>{
  const previous=globalThis.document;globalThis.document=fakeDocument();
  const {three,requests}=textureThree(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(0,2,4);
  const view=createRemotePeople({THREE:three,scene,store:{getCarried:()=>null},maxDetailed:40});
  const outfit={...DEFAULT_OUTFIT,suit:'suit-checker'};
  const rows=Array.from({length:40},(_,i)=>({id:'guest-'+i,x:(i%8)*.4,y:0,z:Math.floor(i/8)*.4,heading:0,speed:0,time:0,phase:'idle',posture:'stand',role:'visitor',hidden:false,carrying:false}));
  const active=()=>scene.children.filter(o=>o.name==='remote-suit-batch'&&o.count);
  try{
    view.setRoster(rows.map(r=>[r.id,r.id,r.role,outfit]));view.synchronize(rows);view.update(1/30,camera);
    assert.equal(view.state.details,40);assert.equal(requests.length,1);assert.equal(active().length,8);assert.equal(active().reduce((n,m)=>n+m.count,0),320);
    for(const batch of active()){assert.match(batch.material.name,/suit-checker/);const color=new THREE.Color();batch.getColorAt(0,color);assert.equal(color.getHexString(),'ffffff');}
    const mixed=rows.slice(0,3);mixed[0].role='safety-orange';
    view.setRoster(mixed.map((r,i)=>[r.id,r.id,r.role,i===1?DEFAULT_OUTFIT:outfit]));view.synchronize(mixed);view.update(1/30,camera);
    assert.equal(active().reduce((n,m)=>n+m.count,0),24,'no abandoned body remains drawn');
    assert.equal(active().filter(m=>m.material.name==='patterned-suit:suit-checker').reduce((n,m)=>n+m.count,0),8,'only the ordinary patterned visitor has the pattern');
    view.synchronize([]);view.update(1/30,camera);assert.equal(active().length,0);
  }finally{view.dispose();globalThis.document=previous;}
});

test('all nineteen purchases charge once, reject unapproved designs and survive room restart with old inventory',()=>{
  let room=createRoom({random:()=>.42});room.join('buyer',{name:'컬렉션',brokenCount:60000,repairedCount:23});room.join('other',{});
  const advance=()=>{for(let i=0;i<11;i++)room.step(.1);};
  for(const itemId of ['helmet-white','bag-bear','eyes-smile'])assert.equal(room.command('buyer','purchase',{itemId}).ok,true);
  const before=room.profile('buyer');
  for(const item of collectionItems){advance();const other=room.wallet('other');assert.equal(room.command('other','equip',{itemId:item.id}).ok,false);assert.equal(room.command('other','purchase',{itemId:item.id}).ok,false);assert.deepEqual(room.wallet('other'),other);assert.equal(room.command('buyer','purchase',{itemId:item.id}).ok,true);}
  const purchased=room.profile('buyer');assert.equal(purchased.wallet.chips,before.wallet.chips-collectionItems.reduce((n,i)=>n+i.price,0));
  for(const id of [...collectionItems.map(i=>i.id),'helmet-white','bag-bear','eyes-smile'])assert.ok(purchased.wallet.owned.includes(id));
  for(const item of collectionItems){advance();assert.equal(room.command('buyer','purchase',{itemId:item.id}).ok,true);assert.equal(room.command('buyer','equip',{itemId:item.id}).ok,true);}
  assert.equal(room.wallet('buyer').chips,purchased.wallet.chips);
  const saved=room.profile('buyer');room=createRoom({random:()=>.42});assert.equal(room.join('buyer',structuredClone(saved)).ok,true);assert.deepEqual(room.profile('buyer').wallet,saved.wallet);
  for(const key of ['name','brokenCount','repairedCount'])assert.equal(room.profile('buyer')[key],before[key]);
  for(const item of candidates.filter(i=>!selected.includes(i.number))){advance();assert.equal(room.command('buyer','purchase',{itemId:item.id}).ok,false);assert.equal(room.command('buyer','equip',{itemId:item.id}).ok,false);}
});
