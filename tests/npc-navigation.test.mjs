import test from 'node:test';
import assert from 'node:assert/strict';
import {stepNpc,rerouteNpc,npcSpeed,NPC_SPACING} from '../src/npc-navigation.js';
import {findWalkPath} from '../src/walking.js';
import {machines,bays,isBlocked} from '../src/layout.js';
import {createRoom} from '../server/room-engine.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const actor=(id,x,z,target)=>({id,x,y:0,z,path:findWalkPath({x,z},target),speed:0,phase:'patrol'});
function step(p,people,time,base=1.4){
  if(!p.path.length){p.speed=0;return;}
  const before={x:p.x,z:p.z},next=stepNpc(p,p.path[0],.05,base,people);Object.assign(p,next);p.speed=distance(before,p)/.05;
  if(distance(p,p.path[0])<.015)p.path.shift();rerouteNpc(p,people,time);
  assert.equal(isBlocked(p.x,p.z,.295),false);
}
test('a faster follower keeps space and both NPCs progress without merging',()=>{
  const people=[actor('resident:a',0,20,{x:0,z:42}),actor('resident:b',0,18.7,{x:0,z:40})];
  for(let n=0;n<300;n++){step(people[0],people,n*.05,1.2);step(people[1],people,n*.05,1.7);assert.ok(distance(...people)>=NPC_SPACING-.001);}
  assert.ok(people.every(p=>p.z>32));assert.notEqual(npcSpeed(people[0],1.4),npcSpeed(people[1],1.4));
});
test('opposing NPCs pass in a broad aisle and yield/replan in a 65 cm equipment gap',()=>{
  const m=machines.find(m=>m.bayId===4&&m.sign===1&&m.column===4),neighbor=machines[m.id+1],gap=(m.x+neighbor.x)/2;
  for(const x of [0,gap]){
    const people=[actor('resident:a',x,m.z-1.6,{x,z:m.z+4}),actor('resident:b',x,m.z+1.6,{x,z:m.z-4})];
    for(let n=0;n<4000&&people.some(p=>p.path.length);n++){
      for(const p of people)step(p,people,n*.05);
      assert.ok(distance(...people)>=NPC_SPACING-.001,`overlap at x ${x}`);
    }
    assert.ok(people.every(p=>!p.path.length),`both visitors eventually pass at x ${x}`);
  }
});
test('spawn points are distinct and a running room has no ground NPC overlap or wall penetration',()=>{
  let seed=15879;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
  const room=createRoom({random});
  for(let n=0;n<1200;n++){
    room.step(.05);if(n%4)continue;
    const people=[...room.residents.people,...room.safety.people].filter(p=>p.y<.5);
    for(let i=0;i<people.length;i++){
      assert.equal(isBlocked(people[i].x,people[i].z,.295),false);
      for(let j=i+1;j<people.length;j++)assert.ok(distance(people[i],people[j])>.55,`${people[i].id} overlaps ${people[j].id}`);
    }
  }
  assert.ok(room.residents.state.actions.throws>0);assert.ok(room.residents.state.actions.breaks>0);
});
