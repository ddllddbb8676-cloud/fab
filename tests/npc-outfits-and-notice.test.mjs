import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom} from '../server/room-engine.js';
import {findItem,DEFAULT_OUTFIT} from '../src/cosmetics-catalog.js';
import {createWardrobeNotice,hasPurchasedCosmetics} from '../src/wardrobe-notice.js';

test('NPC roster gives only modest single items to some NPCs, consistently for all visitors, without changing human wallets',()=>{
  const room=createRoom({random:()=>.42});room.join('visitor:human',{brokenCount:1000,repairedCount:24});
  const before=room.profile('visitor:human');
  const roster=room.roster(),npc=roster.filter(([id])=>/^(resident|safety):/.test(id));
  const outfits=npc.map(row=>row[3]);let dressed=0;const seen=new Set();
  assert.equal(npc.length,34);
  for(const outfit of outfits){
    const extras=Object.entries(outfit).filter(([slot,id])=>id!==DEFAULT_OUTFIT[slot]);
    assert.ok(extras.length<=1);
    if(extras.length)dressed++;
    for(const [,id]of extras){seen.add(id);assert.ok(findItem(id).price<=600);}
    assert.equal(outfit.suit,'suit-default');assert.equal(outfit.beauty,'eyes-default');
  }
  assert.ok(dressed>0&&dressed<npc.length);assert.equal(seen.size,6);
  assert.deepEqual(room.roster(),roster);assert.deepEqual(room.profile('visitor:human'),before);
  const restarted=createRoom({random:()=>.18});assert.deepEqual(restarted.roster().map(row=>[row[0],row[3]]),npc.map(row=>[row[0],row[3]]));
});

test('notice waits for active play and a quiet moment, then keeps a five-minute cooldown across reloads',()=>{
  let time=1000000;const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  let notice=createWardrobeNotice({storage,now:()=>time});
  const advance=(seconds,options)=>{const shown=[];for(let i=0;i<seconds;i++){time+=1000;if(notice.tick(1,options))shown.push(i+1);}return shown;};
  assert.deepEqual(advance(500,{active:false}),[]);
  assert.deepEqual(advance(59),[]);assert.deepEqual(advance(20,{eligible:false}),[]);
  assert.deepEqual(advance(1),[1]);
  // Reloading cannot spam the same message; blocked action messages always win.
  notice=createWardrobeNotice({storage,now:()=>time});
  assert.deepEqual(advance(299),[]);assert.deepEqual(advance(10,{eligible:false}),[]);
  assert.deepEqual(advance(1),[1]);assert.deepEqual(advance(299),[]);assert.deepEqual(advance(1),[1]);
});

test('blocked browser storage never interrupts play or makes the notice repeat immediately',()=>{
  let time=1000000;const storage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  const notice=createWardrobeNotice({storage,now:()=>time}),shown=[];
  for(let i=1;i<=361;i++){time+=1000;if(notice.tick(1))shown.push(i);}
  assert.deepEqual(shown,[60,360]);
});

test('default items do not count as a purchase, but any purchased item suppresses the notice even when unequipped or after reconnect',()=>{
  const starter={owned:['suit-default','eyes-default'],equipped:{...DEFAULT_OUTFIT}};
  assert.equal(hasPurchasedCosmetics(starter),false);
  let time=1000000;const notice=createWardrobeNotice({now:()=>time});let shown=0;
  for(let i=0;i<60;i++){time+=1000;if(notice.tick(1,{wallet:starter}))shown++;}
  assert.equal(shown,1);
  const purchased={...starter,owned:[...starter.owned,'sprout']};assert.equal(hasPurchasedCosmetics(purchased),true);
  for(let i=0;i<1000;i++){time+=1000;assert.equal(notice.tick(1,{wallet:purchased}),false);}
  const reconnected=createWardrobeNotice({now:()=>time});
  for(let i=0;i<1000;i++){time+=1000;assert.equal(reconnected.tick(1,{wallet:structuredClone(purchased)}),false);}
  assert.equal(hasPurchasedCosmetics({...starter,owned:[...starter.owned,'eyes-flat'],unlimited:true}),true);
});
