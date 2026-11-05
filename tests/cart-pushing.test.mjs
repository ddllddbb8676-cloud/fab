import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAvatar} from '../src/avatar.js';
import {createRoom} from '../server/room-engine.js';
import {cartDriverPose,cartPoint,cartSeatPose,pushCart,CART_SIZE} from '../src/cart-layout.js';

const facesCart=(p,c)=>(c.x-p.x)*Math.sin(p.heading)+(c.z-p.z)*Math.cos(p.heading);
test('pushing keeps the cart ahead of the operator; backing up never flips the cart and sideways steering stays gradual',()=>{
  for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    let c={x:0,z:0,yaw},p=cartDriverPose(c);
    for(let i=0;i<20;i++){
      const to={x:p.x+Math.sin(p.heading)*.05,z:p.z+Math.cos(p.heading)*.05};
      c=pushCart(c,p,to,()=>false);assert.ok(c);p={...to,heading:c.yaw+Math.PI};
      assert.ok(facesCart(p,c)>1.66);assert.ok(Math.abs(Math.hypot(p.x-c.x,p.z-c.z)-CART_SIZE.tow)<1e-8);
    }
    assert.ok(c.x*Math.sin(p.heading)+c.z*Math.cos(p.heading)>.99);
    const before=c.yaw,to={x:p.x-Math.sin(p.heading)*.1,z:p.z-Math.cos(p.heading)*.1};
    c=pushCart(c,p,to,()=>false);assert.ok(Math.abs(c.yaw-before)<1e-8);p={...to,heading:c.yaw+Math.PI};
    const side={x:p.x+Math.cos(p.heading)*.1,z:p.z-Math.sin(p.heading)*.1};
    const next=pushCart(c,p,side,()=>false);assert.ok(Math.abs(next.yaw-c.yaw)<=.06501);
    assert.equal(pushCart(c,p,side,()=>true),null,'operator and cart collision is checked');
  }
});

test('both hands grip in front of the body on their own side, including when the walker reports the opposite heading',()=>{
  const avatar=createAvatar(THREE),hands=[];avatar.root.traverse(o=>{if(o.name==='glove')hands.push(o);});
  try{
    for(const yaw of [0,.8,Math.PI]){
      const c={x:0,z:0,yaw},p=cartDriverPose(c);
      avatar.root.position.set(p.x,0,p.z);avatar.root.userData.cartGrip={...cartPoint(c,0,.87,CART_SIZE.handle),yaw};
      avatar.update(0,{heading:yaw,snap:true});
      assert.ok(facesCart({...p,heading:avatar.root.userData.heading},c)>1.66);
      const local=hands.map(h=>avatar.body.worldToLocal(h.getWorldPosition(new THREE.Vector3())));
      assert.ok(local.every(h=>h.z>.4),'both hands reach forward');
      assert.ok(local[0].x<-.18&&local[1].x>.18,'arms are not crossed');
    }
  }finally{avatar.dispose();}
});

test('the authoritative room moves forward when pushing and keeps the rider attached without changing the wallet',()=>{
  const room=createRoom({random:()=>.5}),driver='visitor:'+'a'.repeat(64),rider='visitor:'+'b'.repeat(64),c=room.store.carts.get('CART01');
  for(const id of [driver,rider]){room.join(id,{hasEntered:true,optOut:true});room.pose(id,{x:c.x-.95,y:0,z:c.z,heading:0,posture:'stand'});}
  const wallet=room.wallet(driver);assert.ok(room.command(rider,'cart-board',{id:c.id,level:1}).ok);
  assert.ok(room.command(driver,'cart-pull',{id:c.id}).ok);
  const p=room.players.get(driver),start={x:c.x,z:c.z},forward=p.heading;
  for(let i=0;i<15;i++){
    room.pose(driver,{x:p.x+Math.sin(forward)*.05,y:0,z:p.z+Math.cos(forward)*.05,heading:c.yaw,speed:1,posture:'stand'});
    assert.ok(facesCart(p,c)>1.66);
  }
  assert.ok((c.x-start.x)*Math.sin(forward)+(c.z-start.z)*Math.cos(forward)>.7);
  assert.equal(room.players.get(rider).z,cartSeatPose(c,1).z);assert.deepEqual(room.wallet(driver),wallet);
});
