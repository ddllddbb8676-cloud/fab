import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createExplorer} from '../src/explorer.js';
import {createAdminVisit,ADMIN_VISIT_STORAGE_KEY} from '../src/admin-visit.js';
import {canWalkSegment} from '../src/walking.js';
import {machines} from '../src/layout.js';

function setup(){
  const priorDocument=globalThis.document,priorWindow=globalThis.window;
  globalThis.document={getElementById:()=>({classList:{contains:()=>true,add(){},remove(){}}}),querySelectorAll:()=>[],addEventListener(){}};
  globalThis.window={addEventListener(){}};
  let controller,time=1000;
  const id='visitor:'+'b'.repeat(64),saved=new Map([[ADMIN_VISIT_STORAGE_KEY,JSON.stringify({target:{id,name:'통로친구'},expiresAt:121000})]]);
  const explorer=createExplorer({THREE,camera:new THREE.PerspectiveCamera(67,390/844,.08,420),scene:new THREE.Scene(),
    canvas:{addEventListener(){},setPointerCapture(){}},avatar:{root:new THREE.Group(),update(){}},
    orbit:{enabled:false,target:new THREE.Vector3(),update(){}},colliders:[],vehicles:[],onMode(){},onInspect(){},onToast(){},onManualMove(){controller.cancel();}});
  explorer.state.position.set(0,0,70);
  controller=createAdminVisit({storage:{getItem:k=>saved.get(k),removeItem:k=>saved.delete(k)},now:()=>time,
    getWalker:()=>explorer.state,walkTo:p=>explorer.walkTo(p),stopWalk:()=>explorer.stopWalk()});
  controller.welcome({id:'visitor:'+'a'.repeat(64),privileges:{unlimitedChips:true}});
  return {explorer,controller,tick(target,dt=.05){time+=dt*1000;controller.frame({t:time,people:[[id,target.x,0,target.z,0,0,'stand','idle',0,null,null,false,false]]});controller.update(dt,{connected:true,ready:true});explorer.update(dt);},
    close(){globalThis.document=priorDocument;globalThis.window=priorWindow;}};
}

test('dashboard visit uses the real explorer to walk around tools and arrive without teleporting',()=>{
  const h=setup();
  try{
    const row=machines.filter(m=>m.bayId===4&&m.sign===1),target={x:(row[3].x+row[4].x)/2,z:row[3].z};
    let travelled=0,frames=0;
    do{
      const before=h.explorer.state.position.clone();h.tick(target);
      const after=h.explorer.state.position,step=before.distanceTo(after);
      assert.ok(step<.25,'a frame follows ordinary walking speed');
      assert.ok(canWalkSegment(before,after),'movement never cuts through a tool');
      travelled+=step;frames++;
    }while(h.controller.state.status==='walking'&&frames<2300);
    assert.equal(h.controller.state.status,'arrived');assert.ok(frames>100);assert.ok(travelled>20);
    assert.ok(Math.hypot(h.explorer.state.position.x-target.x,h.explorer.state.position.z-target.z)<=1.1);
    assert.equal(h.explorer.state.path.length,0);assert.equal(h.explorer.state.speed,0);
  }finally{h.close();}
});

test('the real joystick immediately takes control from a dashboard visit and no old route resumes',()=>{
  const h=setup(),target={x:0,z:50};
  try{
    for(let i=0;i<10;i++)h.tick(target);
    assert.equal(h.controller.state.status,'walking');
    assert.equal(h.explorer.beginJoystick(),true);h.explorer.moveJoystick(0,1);
    assert.equal(h.controller.state.status,'cancelled');assert.equal(h.explorer.state.path.length,0);
    const before=h.explorer.state.position.clone();h.tick(target);assert.ok(h.explorer.state.position.distanceTo(before)>0);
    h.explorer.endJoystick();const stopped=h.explorer.state.position.clone();
    for(let i=0;i<40;i++)h.tick(target);
    assert.ok(h.explorer.state.position.equals(stopped));assert.equal(h.explorer.state.speed,0);
  }finally{h.close();}
});
