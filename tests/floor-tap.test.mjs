import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createExplorer} from '../src/explorer.js';
import {bays,machines,isBlocked} from '../src/layout.js';
import {resolveWalkTap} from '../src/walking.js';

function harness(colliders=[],isEquipmentVisible=()=>true,pickRepairTarget=()=>null){
  const oldDocument=globalThis.document,oldWindow=globalThis.window,events=new Map();let inspections=0,actions=0;
  globalThis.document={hidden:false,getElementById:()=>({classList:{contains:()=>true,add(){},remove(){}}}),addEventListener(){}};globalThis.window={addEventListener(){}};
  const canvas={addEventListener:(n,f)=>events.set(n,f),setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:390,height:844})};
  const camera=new THREE.PerspectiveCamera(64,390/844,.08,420),scene=new THREE.Scene();
  const explorer=createExplorer({THREE,camera,scene,canvas,colliders,isEquipmentVisible,pickRepairTarget,vehicles:[],avatar:{root:new THREE.Group(),update(){}},orbit:{target:new THREE.Vector3(),update(){}},onMode(){},onToast(){},onInspect(){inspections++;},onActionTap(){actions++;return false;}});
  function tap(target,{touch=false,jitter=false}={}){camera.lookAt(target.x,0,target.z);camera.updateMatrixWorld(true);const e={pointerId:1,clientX:195,clientY:422,pointerType:touch?'touch':'mouse'};events.get('pointerdown')(e);if(jitter)for(const dx of [2,-2,3,-1,0])events.get('pointermove')({...e,clientX:195+dx});events.get('pointerup')(e);}
  return {camera,explorer,tap,get inspections(){return inspections;},get actions(){return actions;},dispose(){globalThis.document=oldDocument;globalThis.window=oldWindow;}};
}

test('visible floor over low loadports is not blocked by the old full-height equipment box',()=>{
  const c={minX:-2,maxX:2,minZ:72.5,maxZ:73,equipment:{id:0},cameraBounds:[{minX:-2,maxX:2,minZ:72.5,maxZ:73,maxY:1.4}]},h=harness([c]);
  try{h.explorer.state.position.set(0,0,74);h.camera.position.set(0,3,74);h.tap({x:0,z:70});assert.ok(h.explorer.state.path.length);assert.equal(h.inspections,0);}finally{h.dispose();}
});

test('camera inside a back-face box still accepts visible floor, while an opaque body never opens a card',()=>{
  const h=harness([{minX:-1,maxX:1,minZ:72,maxZ:76,maxY:3.4,equipment:{id:0}}]);
  try{h.explorer.state.position.set(0,0,70);h.camera.position.set(0,2,74);h.tap({x:0,z:70});assert.ok(h.explorer.state.path.length);h.explorer.state.path=[];
    h.camera.position.set(0,2,78);h.tap({x:0,z:70});assert.equal(h.explorer.state.path.length,0);assert.equal(h.inspections,0);
  }finally{h.dispose();}
});

test('small finger jitter remains a floor tap instead of becoming a drag',()=>{
  const h=harness();try{h.explorer.state.position.set(0,0,74);h.camera.position.set(0,2,76);h.tap({x:0,z:70},{touch:true,jitter:true});assert.ok(h.explorer.state.path.length);assert.equal(h.actions,1);}finally{h.dispose();}
});

test('a hidden equipment instance never blocks the visible floor behind it',()=>{
  const h=harness([{minX:-1,maxX:1,minZ:72,maxZ:76,maxY:3.4,equipment:{id:0}}],()=>false);
  try{h.explorer.state.position.set(0,0,78);h.camera.position.set(0,2,78);h.tap({x:0,z:70});assert.ok(h.explorer.state.path.length);assert.equal(h.inspections,0);}finally{h.dispose();}
});

test('a tap on the visible 65 cm gap finds safe body clearance without crossing equipment',()=>{
  const row=bays[4].machines.filter(m=>m.sign===1),center=(row[3].x+row[4].x)/2,start={x:center,z:bays[4].z};
  const result=resolveWalkTap(start,{x:center+.18,z:row[3].z});assert.ok(result);assert.equal(isBlocked(result.destination.x,result.destination.z,.295),false);
  assert.ok(Math.abs(result.destination.x-center)<.04);assert.ok(Math.hypot(result.destination.x-center-.18,result.destination.z-row[3].z)<.65);
});

test('visible debris opens repair actions, while an empty floor tap still walks',()=>{
  let repair={id:7,distance:5};
  const h=harness([{minX:-1,maxX:1,minZ:68,maxZ:72,equipment:{id:7}}],()=>false,()=>repair);
  try{
    h.explorer.state.position.set(0,0,78);h.camera.position.set(0,2,78);
    h.explorer.state.path=[{x:0,z:72}];h.tap({x:0,z:70},{touch:true});
    assert.equal(h.inspections,1);assert.equal(h.explorer.state.path.length,0);
    repair=null;h.tap({x:0,z:70},{touch:true});
    assert.equal(h.inspections,1);assert.ok(h.explorer.state.path.length);
  }finally{h.dispose();}
});

test('an intact cabinet occludes debris behind it without opening either card',()=>{
  const h=harness([
    {minX:-1,maxX:1,minZ:74,maxZ:76,maxY:3.4,equipment:{id:1}},
    {minX:-1,maxX:1,minZ:68,maxZ:72,equipment:{id:7}}
  ],id=>id===1,()=>({id:7,distance:7}));
  try{h.camera.position.set(0,2,78);h.tap({x:0,z:70});assert.equal(h.inspections,0);assert.equal(h.explorer.state.path.length,0);}
  finally{h.dispose();}
});
