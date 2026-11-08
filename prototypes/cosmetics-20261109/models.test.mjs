import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAvatar} from '../../src/avatar.js';
import {candidates} from './catalog.js';
import {equipCandidate} from './models.js';

test('Thirty stable review IDs and positive chip proposals',()=>{
  assert.equal(candidates.length,30);
  assert.equal(new Set(candidates.map(i=>i.id)).size,30);
  assert.deepEqual(candidates.map(i=>i.number),Array.from({length:30},(_,i)=>i+1));
  assert.ok(candidates.every(i=>Number.isSafeInteger(i.price)&&i.price>0&&i.status==='proposal'));
});
for(const item of candidates)test(item.number+' '+item.name+' mounts, animates and detaches without changing a second avatar',()=>{
  const first=createAvatar(THREE),second=createAvatar(THREE);
  const originalHood=second.root.getObjectByName('hood').geometry;
  const originalColors=originalHood.attributes.color.array.slice();
  first.update(0,{snap:true});
  const equipped=equipCandidate(THREE,first,item);
  for(const posture of ['stand','sit','lie'])for(let t=0;t<1;t+=.1) {
    first.update(.1,{speed:posture==='stand'?2:0,posture,heading:t});
    equipped.update(t);
    first.root.updateMatrixWorld(true);
    first.root.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
  }
  first.update(0,{posture:'stand',heading:0,snap:true});
  first.root.updateMatrixWorld(true);
  const size=new THREE.Box3().setFromObject(first.root).getSize(new THREE.Vector3());
  assert.ok(size.x<1.15&&size.y<1.85&&size.z<1.1,JSON.stringify(size));
  let extraTriangles=0,drawCalls=0;
  equipped.root?.traverse(o=>{if(o.isMesh){extraTriangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;drawCalls++;}});
  assert.ok(extraTriangles<6500,'Accessory triangle budget: '+extraTriangles);
  assert.ok(drawCalls<=18,'Accessory draw calls: '+drawCalls);
  assert.equal(second.root.getObjectByName('hood').geometry,originalHood);
  assert.deepEqual(originalHood.attributes.color.array,originalColors);
  equipped.dispose();equipped.dispose();
  assert.equal(first.root.getObjectByName('hood').geometry,originalHood);
  first.dispose();second.dispose();
});
