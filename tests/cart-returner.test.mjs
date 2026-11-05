import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoupStore} from '../src/foup-play.js';
import {createFoupCarts} from '../server/foup-carts.js';
import {createCartReturner,CART_RETURN_RULES} from '../server/cart-returner.js';
import {CART_HOMES,cartFits} from '../src/cart-layout.js';
import {ports,isBlocked} from '../src/layout.js';
import {createRoom} from '../server/room-engine.js';

function setup(position={x:0,z:55,yaw:Math.PI}){
  let clock=0,enabled=true;
  const store=createFoupStore({ports,initialPortIds:ports.slice(0,8).map(p=>p.id)}),players=new Map();
  const carts=createFoupCarts({store,players,now:()=>clock});
  const c=store.carts.get('CART01');Object.assign(c,position);
  const actor={id:'resident:0',role:'thrower',x:0,z:58,y:0,heading:0,phase:'idle',path:[],posture:'stand',speed:0,vehicleId:null};
  const residents={people:[actor],reserveCart(p){p.cartTask=true;return true;},releaseCart(p){delete p.cartTask;p.phase='idle';p.path=[];p.speed=0;}};
  const cues=[],returner=createCartReturner({store,carts,residents,players,now:()=>clock,canRun:()=>enabled,onCue:(kind)=>cues.push(kind)});
  function fill(id='CART01'){
    return [0,1,2,3].map(slot=>{const r=[...store.records.values()].find(r=>r.mode==='port');assert.ok(store.pickup(r.id,'loader'));assert.ok(store.loadCart(id,slot,'loader',r.id));return r;});
  }
  function step(n=1){for(let i=0;i<n;i++){clock+=.1;store.step(.1);returner.update(.1);carts.step();}}
  return {store,carts,c,actor,residents,players,returner,cues,step,fill,jump(t){clock=t;},disable(){enabled=false;}};
}

test('two home carts have independent cargo and riders; old one-cart checkpoints still restore',()=>{
  const s=setup(),first=s.fill(),second=s.fill('CART02');
  assert.equal(s.store.carts.size,2);assert.equal(new Set([...first,...second].map(r=>r.id)).size,8);
  for(const c of s.store.carts.values())assert.ok(cartFits(c,isBlocked));
  const saved=s.store.checkpoint(),copy=createFoupStore({ports});copy.restore(saved);
  assert.deepEqual(copy.cartItems('CART02').map(r=>r.id),second.map(r=>r.id));
  const legacy=structuredClone(saved);legacy.carts.positions=legacy.carts.positions.slice(0,1);legacy.carts.entries=legacy.carts.entries.filter(row=>row[1]==='CART01');
  copy.restore(legacy);assert.equal(copy.carts.size,2);assert.equal(copy.cartItems('CART01').length,4);assert.equal(copy.cartItems('CART02').length,0);
});

test('an abandoned cart returns visibly with an existing NPC and stows all four original carriers one at a time',()=>{
  const s=setup(),cargo=s.fill(),ids=cargo.map(r=>r.id),originalCount=s.store.records.size,phases=new Set();
  s.step(1190);assert.equal(s.returner.state,null);assert.equal(s.c.z,55);
  for(let i=0;i<1600;i++){
    s.step();if(s.returner.state)phases.add(s.returner.state.phase);
    assert.ok(cartFits(s.c,isBlocked));assert.ok(cargo.filter(r=>r.mode==='carried').length<=1);
    if(s.c.driver){const a=s.actor;assert.ok((s.c.x-a.x)*Math.sin(a.heading)+(s.c.z-a.z)*Math.cos(a.heading)>1.66,'NPC faces the cart while pushing from behind');}
    if(cargo.every(r=>r.mode==='stored')&&!s.returner.state)break;
  }
  assert.deepEqual(cargo.map(r=>r.mode),Array(4).fill('stored'));
  assert.ok(cargo.every(r=>r.stockerId==='STK02'&&r.breakSeq===0));
  assert.equal(s.store.records.size,originalCount);assert.deepEqual(cargo.map(r=>r.id),ids);
  assert.ok(Math.hypot(s.c.x-CART_HOMES[0].x,s.c.z-CART_HOMES[0].z)<.03);
  for(const phase of ['approach','return','fetch','lift','deposit-walk','deposit','stow'])assert.ok(phases.has(phase),phase);
  assert.equal(s.residents.people.length,1);assert.equal(s.actor.cartTask,undefined);assert.equal(s.c.driver,null);assert.equal(s.c.returning,undefined);
  assert.equal(s.cues.filter(c=>c==='place').length,4);
});

test('occupied, nearby, recently used, close-to-home and golden cargo carts are never collected',()=>{
  for(const kind of ['rider','driver','nearby','recent','home','gold']){
    const s=setup();const [r]=s.fill();s.jump(121);
    if(kind==='rider')s.c.riders[0]='someone';
    if(kind==='driver')s.c.driver='someone';
    if(kind==='nearby')s.players.set('person',{id:'person',x:s.c.x,z:s.c.z,y:0,hidden:false});
    if(kind==='recent')s.carts.touch(s.c);
    if(kind==='home')Object.assign(s.c,CART_HOMES[0]);
    if(kind==='gold')r.gold={eventId:'gold:1',expiresAt:Date.now()+600000};
    s.step(30);assert.equal(s.returner.state,null,kind);assert.equal(s.actor.cartTask,undefined,kind);
  }
});

test('retrieval crosses a bay corner through broad aisles without cutting through equipment',()=>{
  for(const position of [{x:28,z:0,yaw:Math.PI},{x:-28,z:-35.9,yaw:0}]){
    const s=setup(position),cargo=s.fill();Object.assign(s.actor,{x:position.x+.9,z:position.z,phase:'idle'});s.jump(121);
    for(let i=0;i<2800;i++){s.step();assert.ok(cartFits(s.c,isBlocked));if(cargo.every(r=>r.mode==='stored')&&!s.returner.state)break;}
    assert.ok(cargo.every(r=>r.mode==='stored'),JSON.stringify({position,phase:s.returner.state?.phase,cart:{x:s.c.x,z:s.c.z}}));
  }
});

test('a returning visitor cancels collection before pickup; event cancellation and a full stocker preserve cargo',()=>{
  const s=setup();s.fill();s.jump(121);s.step();assert.equal(s.returner.state.phase,'approach');
  s.players.set('person',{id:'person',x:s.c.x,z:s.c.z,y:0});s.step();assert.equal(s.returner.state,null);assert.equal(s.store.cartItems(s.c.id).length,4);
  s.players.clear();s.jump(245);s.step(30);assert.ok(s.returner.state);s.disable();s.step();assert.equal(s.returner.state,null);assert.equal(s.store.cartItems(s.c.id).length,4);
  const full=setup();const cargo=full.fill();full.jump(121);
  const state=full.store.stockerState;full.store.stockerState=id=>id==='STK02'?{items:new Array(48),busy:false}:state(id);
  full.step(1000);assert.ok(cargo.every(r=>r.mode==='cart'));assert.equal(full.returner.state,null);assert.equal(full.store.getCarried(full.actor.id),null);
});

test('real room resident reservation suspends ordinary work and safety capture without changing population or player records',()=>{
  const room=createRoom({random:()=>.5,now:()=>Date.UTC(2026,10,5,4)}),p=room.residents.people.find(p=>p.role==='thrower');
  const count=room.residents.people.length;assert.ok(room.residents.reserveCart(p));
  Object.assign(p,{x:0,z:55,phase:'cart-return-walk',path:[{x:0,z:56}]});
  room.residents.update(.1);assert.equal(p.z,55);assert.equal(room.residents.beginSafetyLap(p),false);
  room.residents.releaseCart(p);assert.equal(p.phase,'idle');assert.equal(room.residents.people.length,count);assert.equal(room.players.size,0);
  assert.equal(CART_RETURN_RULES.idleSeconds,120);
});
