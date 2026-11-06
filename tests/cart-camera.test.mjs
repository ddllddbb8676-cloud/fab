import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createExplorer} from '../src/explorer.js';
import {createCartControls} from '../src/cart-controls.js';
import {cartPoint,cartSeatPose,CART_SIZE} from '../src/cart-layout.js';
import {applyWalkwayMotion,WALKWAY_LANES} from '../src/moving-walkway.js';

function element(){
  const children=[],queries=new Map(),classes=new Set(['hidden']);
  return {children,dataset:{},append(...items){children.push(...items);},setAttribute(){},addEventListener(){},
    classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(k,v){v?classes.add(k):classes.delete(k);}},
    querySelector(k){if(!queries.has(k))queries.set(k,element());return queries.get(k);},
    querySelectorAll(k){return k==='[data-level]'?[0,1].map(level=>({dataset:{level}})):[];},
    getContext:()=>({fillRect(){},fillText(){}})};
}
function setup(level){
  const old={document:globalThis.document,window:globalThis.window},events=new Map();
  globalThis.document={hidden:false,body:element(),createElement:element,getElementById:element,querySelectorAll:()=>[],addEventListener(){}};
  globalThis.window={addEventListener(){}};
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(72,390/844,.08,420),avatar={root:new THREE.Group(),update(){}};
  const explorer=createExplorer({THREE,scene,camera,avatar,colliders:[],vehicles:[],orbit:{target:new THREE.Vector3(),update(){}},
    canvas:{addEventListener:(k,v)=>events.set(k,v),setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:390,height:844})},
    onMode(){},onInspect(){},onToast(){},onActionTap:()=>true,onGroundMotion:applyWalkwayMotion});
  const carts=createCartControls({THREE,scene,explorer,avatar,store:{carts:new Map(),cartItems:()=>[],moveCart(){}},network:{},getId:()=> 'rider',ready:()=>true,toast(){}});
  const cart={id:'CART01',x:0,z:0,yaw:0,driver:'driver',riders:level===null?[null,null]:level?[null,'rider']:['rider',null]};
  const tick=()=>{carts.prepare(1/60);explorer.update(1/60);carts.update();};
  carts.frame({carts:[cart]},true);tick();
  return {cart,carts,explorer,camera,events,tick,close(){scene.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});Object.assign(globalThis,old);}};
}

test('both cart seats retain a camera drag across render frames and cart movement without moving the rider off the seat',()=>{
  for(const level of [0,1]){
    const h=setup(level);
    try{
      const {state}=h.explorer,p={pointerId:1,pointerType:'touch',clientX:300,clientY:400},yaw=state.yaw,elevation=state.elevation;
      const original=h.camera.position.clone();h.events.get('pointerdown')(p);
      for(let i=1;i<=12;i++){
        h.tick();
        h.events.get('pointermove')({...p,clientX:300-i*8,clientY:400-i*2});
        h.carts.frame({carts:[{...h.cart,x:i*.02,z:-i*.05,yaw:i*.005}]},false);h.tick();
        const seat=cartSeatPose(h.carts.state,level);
        assert.ok(state.position.distanceTo(new THREE.Vector3(seat.x,seat.y,seat.z))<1e-8);
        assert.equal(state.posture,'sit');assert.equal(state.path.length,0);
      }
      assert.ok(state.yaw>yaw+.4,'drag changes camera yaw while seated');
      assert.ok(state.elevation<elevation-.08,'vertical drag changes camera elevation');
      assert.ok(original.distanceTo(h.camera.position)>.1,'rendered camera actually moves');
      h.events.get('pointerup')({...p,clientX:204,clientY:376});
      const chosen=state.yaw;for(let i=0;i<30;i++)h.tick();assert.equal(state.yaw,chosen);
      const a={...p,pointerId:2,clientX:160},b={...p,pointerId:3,clientX:240},distance=state.distance;
      h.events.get('pointerdown')(a);h.tick();h.events.get('pointerdown')(b);h.tick();
      h.events.get('pointermove')({...b,clientX:300});h.tick();assert.ok(state.distance<distance-.5,'pinch survives render frames');
      h.events.get('pointerup')(a);h.events.get('pointerup')({...b,clientX:300});
      h.carts.frame({carts:[{...h.cart,driver:null,riders:[null,null]}],people:[['rider',1,0,0,0]]},false);h.tick();
      assert.equal(state.posture,'stand');assert.equal(state.position.y,0);assert.ok(h.explorer.beginJoystick());
      h.explorer.moveJoystick(0,1);h.tick();assert.ok(state.speed>0,'normal movement returns after dismount');
    }finally{h.close();}
  }
});

test('late snapshots on both belts never rewind the local cart, and a rejected pose corrects the pair once',()=>{
  for(const lane of WALKWAY_LANES){
    const h=setup(null);
    try{
      const row={...h.cart,x:lane.x,z:0,yaw:lane.direction>0?0:Math.PI,driver:'rider'};
      const handle=cartPoint(row,0,0,CART_SIZE.tow),s=h.explorer.state;
      const packet=(t,cart,driver)=>({t,carts:[cart],people:[['rider',driver.x,0,driver.z,cart.yaw]]});
      h.carts.frame(packet(1,row,handle),false);
      const history=[];
      for(let i=1;i<=210;i++){
        h.tick();
        const current=h.carts.state;
        assert.ok(Math.abs(s.position.z-current.z-lane.direction*CART_SIZE.tow)<1e-6);
        history.push({t:1+i/60,cart:{...row,z:current.z},driver:{x:s.position.x,z:s.position.z}});
        if(i%12===0&&i>=60){
          const delayed=history[i-60];
          h.carts.frame(packet(delayed.t,delayed.cart,delayed.driver),false);
          assert.equal(h.carts.state.z,current.z,'a one-second-old observation must not move the drawn cart');
        }
      }
      assert.ok(Math.abs(h.carts.state.z-lane.direction*22.4)<1e-6);
      const blocked=packet(5,{...row,correction:1},handle);
      h.carts.frame(blocked,false);
      assert.equal(h.carts.state.z,row.z);assert.equal(s.position.z,handle.z);
      h.tick();const advanced=h.carts.state.z;
      h.carts.frame({...blocked,t:5.1},false);assert.equal(h.carts.state.z,advanced);
      h.carts.frame(packet(6,{...row,driver:null},handle),false);assert.equal(h.carts.active,false);
      h.carts.frame(blocked,false);assert.equal(h.carts.active,false,'a late packet cannot grab a released handle again');
    }finally{h.close();}
  }
});
