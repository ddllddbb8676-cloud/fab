import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {sessionId} from '../server/player-profiles.js';

// Load the real Worker/room engine, substituting only the platform base class.
// Cloudflare WebSocket upgrade/close and storage behavior are also exercised
// separately against Wrangler during release verification.
const bundle=await build({entryPoints:[fileURLToPath(new URL('../server/worker.js',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',
  plugins:[{name:'durable-base',setup(build){
    build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'base',namespace:'test'}));
    build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export class DurableObject {constructor(ctx){this.ctx=ctx;}}'}));
  }}]});
const {FabRoom,default:worker}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const origin='https://fab.test',token='a'.repeat(64),key='f705cd9e-a03b-4094-ba7a-378724377efc';
const visitor=await sessionId(token);
function peer(){
  return {packets:[],send(raw){this.packets.push(JSON.parse(raw));},close(code){this.closed=code;},
    serializeAttachment(value){this.attachment=value;},deserializeAttachment(){return this.attachment;}};
}
async function fixture(records,sockets=[]){
  let boot;
  const storage={get:async key=>structuredClone(records.get(key)),list:async({prefix})=>new Map([...records].filter(([key])=>key.startsWith(prefix))),
    put:async batch=>{for(const [key,value] of Object.entries(batch))records.set(key,structuredClone(value));}};
  const room=new FabRoom({storage,blockConcurrencyWhile:f=>{boot=f();},getWebSockets:()=>sockets,waitUntil:()=>{}},{});
  room.start=()=>{};await boot;
  const env={FAB_ROOM:{getByName:()=>room}};
  const post=(body,cookie=token,requestOrigin=origin)=>worker.fetch(new Request(origin+'/api/room-http?v=20',{method:'POST',headers:{
    'Content-Type':'application/json',Origin:requestOrigin,Cookie:'fab-session-v1='+cookie},body:JSON.stringify({key,...body})}),env);
  return {room,post};
}

test('ordered refresh and late close keep one account and the exact durable wallet across HTTPS, WebSocket and room restore',async()=>{
  const records=new Map([['profile:'+visitor,{id:visitor,name:'새로고침',brokenCount:100,repairedCount:2}]]);
  const {room,post}=await fixture(records);
  const order=Date.now()*1000,old=peer();await room.admit(old,visitor,order);
  assert.equal(old.packets[0].type,'welcome');
  assert.equal((await post({op:'open',order:order+1},'','https://bad.test')).status,403);
  assert.equal((await post({op:'open',order:order+1},'')).status,401);
  const opened=await (await post({op:'open',order:order+1})).json();
  const hello=JSON.parse(opened.messages[0][1]);
  assert.equal(hello.type,'welcome');assert.equal(hello.id,visitor);assert.equal(hello.wallet.chips,506);
  assert.equal(old.closed,4001);room.webSocketClose(old,1000,'late');
  const foreign='b'.repeat(64);
  assert.equal((await post({op:'close'},foreign)).status,410);
  const cursor=opened.messages.at(-1)[0];
  const input={op:'poll',cursor,messages:[{type:'command',seq:1,kind:'purchase',data:{itemId:'suit-blue'}}]};
  const ack=async()=>{const response=await post(input);assert.equal(response.status,200);
    return (await response.json()).messages.map(([,raw])=>JSON.parse(raw)).find(data=>data.type==='ack');};
  const first=await ack();assert.equal(first.ok,true);assert.equal(first.wallet.chips,456);
  assert.deepEqual(await ack(),first);assert.equal(records.get('profile:'+visitor).wallet.revision,first.wallet.revision);
  const stale=peer();await room.admit(stale,visitor,order);assert.equal(stale.closed,4001);
  const latest=peer();await room.admit(latest,visitor,order+2);
  assert.equal(latest.packets[0].wallet.chips,456);
  assert.equal((await post({op:'close'})).status,409);assert.equal(room.sockets.size,1);
  const restored=await fixture(records,[latest]);
  assert.equal(latest.attachment.order,order+2);
  assert.equal((await restored.post({op:'poll',cursor:0})).status,410);
  assert.equal((await restored.post({op:'open',order:order+1})).status,409);
  const p=restored.room.room.profile(visitor);
  assert.equal(p.name,'새로고침');assert.equal(p.brokenCount,100);assert.equal(p.repairedCount,2);
  assert.deepEqual(p.wallet.owned,['suit-default','eyes-default','suit-blue']);assert.equal(p.wallet.chips,456);
});
