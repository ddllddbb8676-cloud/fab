import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoom } from '../server/room-engine.js';
import { canCatch, createSafetyPatrols, isSafety } from '../src/safety-team.js';
import { machines, bays, isBlocked } from '../src/layout.js';
import { getEmoApproach } from '../src/emo-interaction.js';
import { createAvatar } from '../src/avatar.js';
function tick(r,n){for(let i=0;i<n*20;i++)r.step(.05);}
function move(r,id,p){r.pose(id,{...p,y:0,heading:0,hidden:false,posture:'stand'});}

test('human safety cannot claim, press or explode equipment and regains EMO after three captures',()=>{
  for(const role of ['safety-red','safety-orange']){
    const r=createRoom({random:()=>.42});for(const p of r.residents.people){p.hidden=true;p.wait=1e9;}for(const g of r.safety.people)g.hidden=true;
    r.join('guard');const p=r.players.get('guard'),m=machines[0];move(r,p.id,getEmoApproach(m).destination);
    assert.equal(r.command(p.id,'claim',{id:m.id,kind:'emo'}).ok,true);
    assert.equal(r.command(p.id,'press',{id:m.id}).ok,true);tick(r,.6);p.role=role;
    for(const [kind,data] of [['claim',{id:m.id,kind:'emo'}],['press',{id:m.id}],['explode',{id:m.id}]]){
      const denied=r.command(p.id,kind,data);assert.equal(denied.ok,false);assert.match(denied.message,/안전팀은 장비를 부술 수 없어요/);
    }
    assert.equal(r.destruction.isDestroyed(m.id),false);assert.equal(p.brokenCount,0);r.command(p.id,'cancel');
    move(r,p.id,{x:0,z:70});
    for(const target of r.residents.people.filter(n=>n.role==='thrower').slice(0,3)){
      Object.assign(target,{x:0,z:70.4,y:0,hidden:false,penalty:0,safeUntil:0,phase:'idle',path:[],wait:1e9});r.step(.05);target.hidden=true;
    }
    assert.equal(p.role,'visitor');move(r,p.id,getEmoApproach(m).destination);
    assert.equal(r.command(p.id,'claim',{id:m.id,kind:'emo'}).ok,true);assert.equal(r.command(p.id,'press',{id:m.id}).ok,true);tick(r,.7);
    assert.equal(r.command(p.id,'explode',{id:m.id}).ok,true);assert.equal(p.brokenCount,1);
  }
});

test('every new visitor enters as a civilian; safety duty starts later inside the fab',()=>{
  const r=createRoom({random:()=>.42});for(let i=0;i<66;i++)assert.equal(r.join(`p${i}`).ok,true);
  assert.ok([...r.players.values()].every(p=>p.role==='visitor'));
  for(const p of r.residents.people){p.hidden=true;p.wait=1e9;}
  for(const g of r.safety.people)g.hidden=true;
  const a=r.players.get('p0'),b=r.players.get('p1');
  move(r,a.id,{x:0,z:60});move(r,b.id,{x:0,z:30});
  for(let n=0;n<1199;n++){if(n%100===0)for(const p of r.players.values())r.pose(p.id,{...p});r.step(.05);}
  assert.ok([...r.players.values()].every(p=>p.role==='visitor'));
  tick(r,.2);assert.equal(a.role,'safety-orange');assert.equal(b.role,'visitor');
  assert.equal(a.z,60);assert.equal(a.x,0);assert.match(a.name,/安全|안전팀$/u);
  const oldName=a.civilianName;a.brokenCount=7;a.repairedCount=2;
  assert.equal(r.command(a.id,'civilian').ok,true);assert.equal(a.role,'visitor');assert.equal(a.name,oldName);
  assert.equal(a.brokenCount,7);assert.equal(a.repairedCount,2);assert.equal(a.optOut,true);
  tick(r,14);assert.equal(b.role,'visitor');
  move(r,b.id,{x:0,z:30});tick(r,1.2);assert.equal(b.role,'safety-orange');
});

test('four patrols keep 2 red and 2 orange suits, unique names and walkable routes',()=>{
  const s=createSafetyPatrols({random:()=>.42});assert.equal(s.people.length,4);
  assert.equal(s.people.filter(p=>p.role==='safety-red').length,2);assert.equal(s.people.filter(p=>p.role==='safety-orange').length,2);assert.equal(new Set(s.people.map(p=>p.name)).size,4);
  const start=s.people.map(p=>[p.x,p.z]);
  for(let i=0;i<300;i++)s.update(.05,[],i*.05);
  assert.ok(s.people.some((p,i)=>Math.hypot(p.x-start[i][0],p.z-start[i][1])>1));
  for(const p of s.people)assert.equal(isBlocked(p.x,p.z,.295),false);
});

test('contact excludes repair, OHT, entry, grace periods and people on the other side of equipment',()=>{
  const g={role:'safety-red',x:0,z:70,phase:'patrol'},p={role:'visitor',x:0,z:70.5};
  assert.equal(canCatch(g,p,20),true);
  for(const phase of ['repair','riding','climb'])assert.equal(canCatch(g,{...p,phase},20),false);
  assert.equal(canCatch(g,{...p,hidden:true},20),false);assert.equal(canCatch(g,{...p,penalty:2},20),false);
  assert.equal(canCatch(g,{...p,safeUntil:25},20),false);
  assert.equal(canCatch({...g,x:machines[0].x,z:machines[0].z},{...p,x:machines[0].x,z:machines[0].z+.1},20),false);
});

test('server catches visitors, blocks play, counts only three completed personal repairs and then unlocks',()=>{
  const r=createRoom({random:()=>.42});r.join('civilian');const p=r.players.get('civilian');p.role='visitor';p.safeUntil=0;
  for(const n of r.residents.people)n.wait=1e9;
  const g=r.safety.people[0];g.x=0;g.z=70;g.path=[];g.nextThink=1e9;move(r,p.id,{x:0,z:70.4});tick(r,.1);
  assert.equal(p.penalty,3);tick(r,.2);assert.equal(p.penalty,3,'repeated contact does not stack');
  for(const kind of ['pickup','throw','board','ride','climb','explode'])assert.equal(r.command(p.id,kind,{id:0}).ok,false);
  assert.equal(r.command(p.id,'claim',{id:0,kind:'emo'}).ok,false);
  for(let n=0;n<3;n++) {
    tick(r,1.1);const m=machines[350+n];r.destruction.trigger(m.id);move(r,p.id,getEmoApproach(m).destination);
    assert.equal(r.command(p.id,'claim',{id:m.id,kind:'repair'}).ok,true);
    assert.equal(r.command(p.id,'repair',{id:m.id}).ok,true);
    assert.equal(r.command(p.id,'finish',{id:m.id}).ok,false);assert.equal(p.penalty,3-n);
    tick(r,5);assert.equal(r.command(p.id,'finish',{id:m.id}).ok,true);assert.equal(p.penalty,2-n);
    assert.equal(r.command(p.id,'finish',{id:m.id}).ok,false,'duplicate finish never counts twice');
  }
  tick(r,1.1);assert.equal(r.command(p.id,'claim',{id:350,kind:'emo'}).ok,true);assert.ok(p.safeUntil>r.time);
});

test('safety colors cover the entire suit without tinting another avatar or its face',()=>{
  const a=createAvatar(THREE),b=createAvatar(THREE);try{
    const face=a.root.getObjectByName('face').material,original=b.root.getObjectByName('torso').material;
    a.setSuitColor('#ed4942');const cloth=a.root.getObjectByName('torso').material;
    for(const name of ['hood','pants','upperArm','forearm'])assert.equal(a.root.getObjectByName(name).material,cloth);
    assert.notEqual(cloth,original);assert.equal(a.root.getObjectByName('face').material,face);assert.equal(original.color.getHexString(),'ffffff');
  }finally{a.dispose();b.dispose();}
});

test('a human safety player gets one named success notice only after applying the penalty',()=>{
  const notices=[],r=createRoom({random:()=>.42,onCatch:event=>{
    assert.equal(r.players.get(event.targetId).penalty,3);notices.push(event);
  }});
  for(const id of ['guard','victim','other-guard'])r.join(id);
  for(const p of r.safety.people){p.x=40;p.z=-70;p.path=[];p.nextThink=1e9;}
  for(const p of r.residents.people)p.wait=1e9;
  r.players.get('guard').role='safety-red';r.players.get('other-guard').role='safety-orange';
  const victim=r.players.get('victim');victim.role='visitor';victim.safeUntil=0;
  move(r,'guard',{x:0,z:70});move(r,'other-guard',{x:0,z:70});move(r,'victim',{x:0,z:70.4});
  victim.phase='repair';tick(r,.1);assert.equal(notices.length,0);
  victim.phase='riding';tick(r,.1);assert.equal(notices.length,0);
  victim.phase='idle';tick(r,.1);
  assert.deepEqual(notices,[{guardId:'guard',targetId:'victim',targetName:victim.name,penalty:3,caught:1,goal:3,completed:false}]);
  tick(r,1);assert.equal(notices.length,1,'continued proximity and a second guard must not duplicate success');
});

test('automated safety catches never send a human success notice',()=>{
  const notices=[],r=createRoom({random:()=>.42,onCatch:event=>notices.push(event)});
  r.join('victim');const p=r.players.get('victim');p.role='visitor';p.safeUntil=0;
  const guard=r.safety.people[0];guard.x=0;guard.z=70;guard.path=[];guard.nextThink=1e9;
  move(r,p.id,{x:0,z:70.4});tick(r,.1);
  assert.equal(p.penalty,3);assert.deepEqual(notices,[]);
});

test('caught residents walk a lap and give human safety the same three-repair notice as visitors',()=>{
  for(const human of [true,false]) {
    const notices=[],r=createRoom({random:()=>.42,onCatch:event=>notices.push(event)});
    for(const p of r.residents.people){p.hidden=true;p.wait=1e9;}
    for(const g of r.safety.people){g.x=40;g.z=-70;g.path=[];g.nextThink=1e9;}
    const target=r.residents.people.find(p=>p.role==='breaker');Object.assign(target,{x:0,z:70.4,hidden:false});
    let guard;
    if(human){r.join('guard');guard=r.players.get('guard');guard.role='safety-orange';move(r,guard.id,{x:0,z:70});}
    else {guard=r.safety.people[0];guard.x=0;guard.z=70;}
    tick(r,.1);assert.equal(target.penalty,3);assert.ok(target.phase.startsWith('caught-lap'));
    const packet=r.snapshot(true).people.find(row=>row[0]===target.id);
    assert.equal(packet[14],3);assert.ok(packet[7].startsWith('caught-lap'));
    tick(r,.3);assert.equal(notices.length,human?1:0);
    if(human)assert.deepEqual(notices[0],{guardId:guard.id,targetId:target.id,targetName:target.name,penalty:3,caught:1,goal:3,completed:false});
  }
});
