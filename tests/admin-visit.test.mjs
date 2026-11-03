import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminVisit,ADMIN_VISIT_STORAGE_KEY} from '../src/admin-visit.js';
import {findWalkPath,canWalkSegment} from '../src/walking.js';
import {machines} from '../src/layout.js';

const owner='visitor:'+'a'.repeat(64),targetId='visitor:'+'b'.repeat(64);
function fixture({raw,walk,clear=()=>true,canTraverse=()=>true}={}){
  let time=1000,removed=0,stopped=0;
  const saved=new Map([[ADMIN_VISIT_STORAGE_KEY,raw??JSON.stringify({target:{id:targetId,name:'찾을사람'},expiresAt:time+120000})]]);
  const storage={getItem:k=>saved.get(k)??null,removeItem:k=>{removed++;saved.delete(k);}};
  const walker={position:{x:0,y:0,z:70},path:[],mode:'walk',locked:false,joystickActive:false,posture:'stand'};
  const routes=[],toasts=[];
  const options={storage,now:()=>time,getWalker:()=>walker,canTraverse,canWalk:clear,onToast:message=>toasts.push(message),
    walkTo:p=>{routes.push({...p});const path=walk?walk(walker.position,p):[{...p}];if(!path)return false;walker.path=path;return true;},
    stopWalk:()=>{stopped++;walker.path=[];}};
  const controller=createAdminVisit(options);
  const frame=(x=0,z=50,extra={})=>controller.frame({t:extra.t,people:[[targetId,x,extra.y??0,z,0,0,'stand',extra.phase??'idle',0,null,null,false,extra.hidden??false]]});
  const welcome=(privilege=true,id=owner)=>controller.welcome({id,privileges:{unlimitedChips:privilege}});
  const tick=(ms=0,flags={})=>{time+=ms;controller.update(ms/1000,{connected:true,ready:true,...flags});};
  return {controller,options,walker,routes,toasts,frame,welcome,tick,saved,get time(){return time;},get removed(){return removed;},get stopped(){return stopped;}};
}

test('consumes one dashboard intention and waits for owner welcome, ready entry and a frame',()=>{
  const f=fixture();assert.equal(f.removed,1);assert.equal(f.saved.size,0);
  f.frame();f.tick();assert.equal(f.routes.length,0);
  f.welcome();f.tick(0,{ready:false});assert.equal(f.routes.length,0);
  f.tick();assert.equal(f.controller.state.status,'walking');assert.equal(f.routes.length,1);
  assert.equal(createAdminVisit(f.options).state.status,'idle');
});

test('uses ordinary collision-aware walking and never changes coordinates directly',()=>{
  const f=fixture({walk:(start,end)=>findWalkPath(start,end),clear:canWalkSegment});
  const original=f.walker.position;
  f.welcome();f.frame();f.tick();
  assert.equal(f.walker.position,original);assert.deepEqual(original,{x:0,y:0,z:70});
  assert.equal(f.controller.state.status,'walking');assert.ok(f.walker.path.length);
  // Simulate the existing walk engine, which consumes a route over many frames.
  let frames=0;
  while(f.controller.state.status==='walking'&&frames++<200){
    const p=f.walker.path[0],d=Math.hypot(p.x-original.x,p.z-original.z),step=Math.min(d,.2);
    original.x+=(p.x-original.x)/d*step;original.z+=(p.z-original.z)/d*step;
    if(step===d)f.walker.path.shift();f.frame();f.tick(100);
  }
  assert.ok(frames>20);assert.equal(f.controller.state.status,'arrived');assert.equal(f.stopped,1);
  assert.ok(Math.hypot(original.x,original.z-50)<=1.1);assert.ok(Math.hypot(original.x,original.z-50)>.5);
});

test('moving target replans at bounded intervals and retains the same chosen identity',()=>{
  const f=fixture();f.welcome();f.frame();f.tick();
  f.walker.position.z-=.1;f.frame(0,46);f.tick(500);assert.equal(f.routes.length,1);
  f.walker.position.z-=.1;f.frame(0,44);f.tick(1000);assert.equal(f.routes.length,2);
  f.walker.position.z-=.1;f.frame(0,40);f.tick(100);assert.equal(f.routes.length,2);
  assert.ok(f.routes[1].z<46);assert.equal(f.controller.state.targetName,'찾을사람');
});

test('older and duplicate timestamped frames cannot rewind the target or refresh stale presence',()=>{
  const f=fixture();f.welcome();f.frame(0,50,{t:20});f.tick();
  f.controller.frame({t:19,people:[]});f.walker.position.z-=.1;f.tick(1500);
  assert.equal(f.controller.state.status,'walking');assert.equal(f.routes.length,1);
  f.frame(0,40,{t:20});f.walker.position.z-=.1;f.tick();assert.equal(f.routes.length,1);
  f.frame(0,40,{t:21});f.tick();assert.equal(f.routes.length,2);assert.ok(f.routes[1].z<42);
  const stale=fixture();stale.welcome();stale.frame(0,50,{t:0});stale.tick();
  stale.tick(5001,{ready:false});stale.frame(0,50,{t:0});stale.tick();
  assert.equal(stale.controller.state.status,'unavailable');assert.match(stale.toasts.at(-1),/위치를 확인/);
});

test('manual route replacement is preserved, while joystick cancellation stops only the owned route',()=>{
  const a=fixture();a.welcome();a.frame();a.tick();
  const manual=[{x:3,z:60}];a.walker.path=manual;a.tick();
  assert.equal(a.controller.state.status,'cancelled');assert.equal(a.walker.path,manual);assert.equal(a.stopped,0);
  const b=fixture();b.welcome();b.frame();b.tick();b.walker.joystickActive=true;b.tick();
  assert.equal(b.controller.state.status,'cancelled');assert.equal(b.stopped,1);
  b.frame();b.tick(2000);assert.equal(b.routes.length,1);
});

test('connection loss, target exit and inaccessible OHT/hidden targets stop safely',()=>{
  for(const mode of ['connection','exit','hidden','oht','climb','climbing']){
    const f=fixture();f.welcome();f.frame();f.tick();
    if(mode==='exit')f.controller.frame({people:[]});
    else if(mode==='hidden')f.frame(0,50,{hidden:true});
    else if(mode==='oht')f.frame(0,50,{y:2.16,phase:'riding'});
    else if(mode==='climb'||mode==='climbing')f.frame(0,50,{phase:mode});
    f.tick(10,{connected:mode!=='connection'});
    assert.notEqual(f.controller.state.status,'walking',mode);assert.equal(f.stopped,1,mode);
    f.welcome();f.frame();f.tick();assert.equal(f.routes.length,1,'must not restart after a reconnect');
  }
});

test('blocked routes and no-progress walking stop instead of retrying forever',()=>{
  const blocked=fixture({walk:()=>null});blocked.welcome();blocked.frame();blocked.tick();
  assert.equal(blocked.controller.state.status,'unavailable');assert.ok(blocked.routes.length>0&&blocked.routes.length<=8);
  const stalled=fixture();stalled.welcome();stalled.frame();stalled.tick();stalled.frame();stalled.tick(3001);
  assert.equal(stalled.controller.state.status,'unavailable');assert.equal(stalled.stopped,1);assert.match(stalled.toasts.at(-1),/막혀/);
});

test('a visitor in an actual 65 cm tool gap remains reachable through its corridor axis',()=>{
  const row=machines.filter(machine=>machine.bayId===4&&machine.sign===1);
  const target={x:(row[3].x+row[4].x)/2,z:row[3].z};
  const f=fixture({walk:(start,end)=>findWalkPath(start,end),clear:canWalkSegment});
  f.welcome();f.frame(target.x,target.z);f.tick();
  assert.equal(f.controller.state.status,'walking');assert.ok(f.walker.path.length>1);
  let previous=f.walker.position;
  for(const point of f.walker.path){assert.ok(canWalkSegment(previous,point));previous=point;}
  assert.ok(canWalkSegment(previous,target));assert.ok(Math.abs(distanceForTest(previous,target)-.9)<1e-9);
});
const distanceForTest=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

test('nearby targets across a wall do not count as arrived',()=>{
  const f=fixture({clear:(a,b)=>!(a.x===0&&a.z===70&&b.x===1&&b.z===70)});
  f.welcome();f.frame(1,70);f.tick();
  assert.equal(f.controller.state.status,'walking');assert.equal(f.toasts.some(text=>text.includes('도착')),false);
});

test('non-owner, self, malformed and expired intents never start walking',()=>{
  for(const raw of ['{',JSON.stringify({target:{id:targetId,name:'만료'},expiresAt:999}),JSON.stringify({target:{id:targetId,name:'미래'},expiresAt:121001}),JSON.stringify({target:{id:'resident:1',name:'NPC'},expiresAt:2000})]){
    const f=fixture({raw});f.welcome();f.frame();f.tick();assert.equal(f.routes.length,0);assert.equal(f.saved.size,0);
  }
  const ordinary=fixture();ordinary.welcome(false);ordinary.frame();ordinary.tick();assert.equal(ordinary.routes.length,0);
  const self=fixture();self.welcome(true,targetId);self.frame();self.tick();assert.equal(self.routes.length,0);
  const expiresWaiting=fixture();expiresWaiting.welcome();expiresWaiting.frame();expiresWaiting.tick(120001);assert.equal(expiresWaiting.routes.length,0);
});

test('explicit cancellation, locked view, stale frames and duration limit do not restart navigation',()=>{
  for(const mode of ['cancel','lock','stale','duration']){
    const f=fixture();f.welcome();f.frame();f.tick();
    if(mode==='cancel')f.controller.cancel();
    if(mode==='lock')f.walker.locked=true;
    if(mode==='duration'){f.walker.position.z-=.1;f.tick(120000,{ready:false});f.frame();}
    f.tick(mode==='stale'?5001:0);assert.notEqual(f.controller.state.status,'walking',mode);assert.equal(f.stopped,1,mode);
  }
});
