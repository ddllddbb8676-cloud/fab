import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRemotePeople} from '../src/remote-people.js';
import {createAvatar} from '../src/avatar.js';

function harness(maxDetailed=32){
  const oldDocument=globalThis.document;
  globalThis.document={createElement:()=>{const draws=[];return {draws,getContext:()=>({clearRect(){draws.length=0;},beginPath(){},roundRect(){},fill(){},measureText:text=>({width:String(text).length*48}),fillText(text){draws.push(text);},strokeText(){}})};}};
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),reference=createAvatar(THREE),geometry=reference.root.getObjectByName('hood').geometry;
  const view=createRemotePeople({THREE,scene,store:{getCarried:()=>null},maxDetailed});
  const actor=(id,x,posture)=>({id,name:id,role:'visitor',x,y:0,z:0,heading:0,speed:0,posture,phase:'idle',time:0,targetId:null,vehicleId:null,carrying:false,hidden:false});
  const rows=[actor('lying',-1,'lie'),actor('standing',1,'stand')];view.setRoster(rows.map(a=>[a.id,a.name,a.role]));view.synchronize(rows);
  function heads(){const batch=scene.children.find(o=>o.isInstancedMesh&&o.geometry===geometry),result=[];if(!batch)return result;
    for(let i=0;i<batch.count;i++){const matrix=new THREE.Matrix4();batch.getMatrixAt(i,matrix);if(Math.abs(matrix.determinant())<.001)continue;result.push(geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(matrix));}return result;}
  return {view,scene,camera,rows,heads,actor,dispose(){view.dispose();reference.dispose();globalThis.document=oldDocument;}};
}

test('a stationary lying visitor stays lying as distance order changes at mobile frame rates',()=>{
  for(const hz of [20,30,60]){const h=harness();try{
    h.camera.position.set(-.2,2,3);for(let i=0;i<hz*2;i++)h.view.update(1/hz,h.camera);
    for(let i=0;i<hz*3;i++){
      h.camera.position.x=(Math.floor(i/(hz/4))%2?1:-1)*.2;h.view.update(1/hz,h.camera);
      const heads=h.heads(),lying=heads.find(p=>p.x<0),standing=heads.find(p=>p.x>0);
      assert.equal(heads.length,2);assert.ok(lying.y<.6,`lying body rose to ${lying.y} at ${hz} Hz`);assert.ok(standing.y>1,`standing body inherited another pose at ${hz} Hz`);
    }
  }finally{h.dispose();}}
});

test('reusing a body at the detail limit applies the new actor pose before its first visible frame',()=>{
  const h=harness(1);try{
    for(let i=0;i<30;i++){
      const left=i%2===0;h.camera.position.set(left?-4:4,2,3);h.view.update(1/60,h.camera);
      const [head]=h.heads();assert.ok(left?head.x<0:head.x>0,'no stale body is drawn at the old position');
      assert.ok(left?head.y<.6:head.y>1,'no stand/lie transition is borrowed from the old actor');
    }
  }finally{h.dispose();}
});

test('real posture changes still animate for the same visitor',()=>{
  const h=harness();try{
    h.camera.position.set(0,2,3);h.view.update(1/30,h.camera);assert.ok(h.heads().find(p=>p.x<0).y<.6);
    h.rows[0].posture='stand';h.view.synchronize(h.rows);h.view.update(1/30,h.camera);
    assert.ok(h.heads().find(p=>p.x<0).y<1,'the same visitor does not snap upright');
    for(let i=0;i<60;i++)h.view.update(1/30,h.camera);assert.ok(h.heads().find(p=>p.x<0).y>1);
    h.rows[0].posture='lie';h.view.synchronize(h.rows);for(let i=0;i<60;i++)h.view.update(1/30,h.camera);
    assert.ok(h.heads().find(p=>p.x<0).y<.6);
  }finally{h.dispose();}
});

test('pooled nameplates refresh title changes and never lend an operator title to the next visitor',()=>{
  const h=harness(1);try{
    h.rows[0].titleId='operator';h.rows[1].titleId='break-1000';h.view.synchronize(h.rows);
    h.camera.position.set(-4,2,3);h.view.update(1/30,h.camera);
    const badge=h.scene.children.find(o=>o.name==='visitor-nickname');assert.equal(badge.material.map.image.height,176);
    h.rows[1].titleId='';h.view.synchronize(h.rows);h.camera.position.set(4,2,3);h.view.update(1/30,h.camera);
    assert.equal(badge.material.map.image.height,96,'reused body clears its previous title');
    h.rows[1].titleId='break-1000';h.view.synchronize(h.rows);h.view.update(1/30,h.camera);assert.equal(badge.material.map.image.height,176,'the current body updates from a new frame');
  }finally{h.dispose();}
});

test('only an owner viewer sees resident and safety NPC markers; names, titles and human safety roles never enable them',()=>{
  const h=harness();try{
    const rows=[{...h.actor('resident:0',-2,'stand'),name:'작은 칩',role:'breaker'},
      {...h.actor('safety:0',0,'stand'),name:'안전 순찰',role:'safety-red'},
      {...h.actor('visitor:human',2,'stand'),name:'FAB짱 세미',role:'safety-red',titleId:'operator',chipUnlimited:true}];
    const original=structuredClone(rows);
    h.view.setRoster(rows.map(a=>[a.id,a.name,a.role]));h.view.synchronize(rows);h.camera.position.set(0,2,3);
    const badges=()=>h.scene.children.filter(o=>o.name==='visitor-nickname'&&o.visible);
    const marked=()=>badges().filter(b=>b.material.map.image.draws.includes('NPC'));
    h.view.update(1/30,h.camera);assert.equal(marked().length,0,'hidden by default, including before welcome');
    for(const privileges of [{},null,{unlimitedChips:false},{unlimitedChips:'true'},{unlimitedChips:1},{name:'FAB짱 세미',titleId:'operator',owner:true}]){
      h.view.setViewerPrivileges({unlimitedChips:true});h.view.update(1/30,h.camera);
      assert.equal(marked().length,2);assert.ok(marked().every(b=>!b.material.map.image.draws.includes('FAB짱 세미')));
      for(const name of ['작은 칩','안전 순찰'])assert.ok(marked().some(b=>b.material.map.image.draws.includes(name)));
      h.view.setViewerPrivileges(privileges);assert.equal(marked().length,0,'privilege loss clears markers immediately');
      h.view.update(1/30,h.camera);assert.equal(marked().length,0);
    }
    assert.deepEqual(rows,original,'viewing aids never rename or modify shared actors');
    assert.deepEqual(h.view.state.people.map(p=>p.name),rows.map(p=>p.name));
  }finally{h.dispose();}
});

test('pooled NPC markers are removed before the same body draws a human or becomes idle',()=>{
  const h=harness(1);try{
    const rows=[h.actor('resident:0',-1,'stand'),{...h.actor('visitor:human',1,'stand'),role:'safety-orange'}];
    h.view.setRoster(rows.map(a=>[a.id,a.name,a.role]));h.view.synchronize(rows);h.view.setViewerPrivileges({unlimitedChips:true});
    for(let i=0;i<12;i++){
      const npc=i%2===0;h.camera.position.set(npc?-4:4,2,3);h.view.update(1/60,h.camera);
      const badge=h.scene.children.find(o=>o.name==='visitor-nickname');
      assert.equal(badge.material.map.image.draws.includes('NPC'),npc);
      assert.equal(badge.material.map.image.width,npc?768:512);
    }
    h.camera.position.set(-4,2,3);h.view.update(1/60,h.camera);
    const badge=h.scene.children.find(o=>o.name==='visitor-nickname');assert.ok(badge.material.map.image.draws.includes('NPC'));
    h.view.synchronize([]);h.view.update(1/60,h.camera);assert.equal(badge.visible,false);assert.equal(badge.material.map.image.draws.includes('NPC'),false);
  }finally{h.dispose();}
});
