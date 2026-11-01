import WebSocket from 'ws';
const lookup=process.env.FAB_TEST_IP ? (_host,options,cb)=>options?.all?cb(null,[{address:process.env.FAB_TEST_IP,family:4}]):cb(null,process.env.FAB_TEST_IP,4):undefined;
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {machines,ports,TOOL_FRONT} from '../src/layout.js';
import {getEmoApproach} from '../src/emo-interaction.js';
import {boardingMachine} from '../src/play-actions.js';
import {initialSharedPorts} from '../src/shared-protocol.js';
const origin=process.argv[2]??'http://127.0.0.1:4173';const endpoint=new URL('/api/room?v=18',origin);endpoint.protocol=origin.startsWith('https')?'wss:':'ws:';
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),clients=[];
async function connect(){return new Promise((resolve,reject)=>{const ws=new WebSocket(endpoint,{origin,lookup}),pending=new Map(),c={ws,pose:{x:0,y:0,z:70,heading:0,speed:0,posture:'stand',hidden:false}};let seq=0;
  const timer=setTimeout(()=>reject(new Error('welcome timeout')),12000);ws.on('error',reject);
  ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome'){clearTimeout(timer);c.id=m.id;c.frame=m.frame;clients.push(c);resolve(c);}if(m.type==='frame')c.frame=m;
    if(m.type==='ack'){c.frame=m.frame;const p=pending.get(m.seq);if(p){clearTimeout(p.timer);pending.delete(m.seq);p.resolve(m);}}});
  c.move=p=>{c.pose={...c.pose,...p};ws.send(JSON.stringify({type:'pose',pose:c.pose}));};
  c.command=(kind,data={})=>new Promise((resolve,reject)=>{const n=++seq;pending.set(n,{resolve,timer:setTimeout(()=>reject(new Error(`${kind} timeout`)),8000)});ws.send(JSON.stringify({type:'command',seq:n,kind,data,pose:c.pose}));});
});}
async function until(fn){const end=Date.now()+5000;while(Date.now()<end){if(fn())return;await sleep(100);}assert.fail('peer state not synchronized');}
const report={origin,checks:[]};
try{
  const a=await connect(),b=await connect();a.move({x:0,z:70,posture:'sit'});await until(()=>b.frame.people.some(r=>r[0]===a.id&&r[6]==='sit'));report.checks.push('peer position and posture');
  const m=machines.find(m=>!a.frame.broken.some(r=>r[0]===m.id));a.move({...getEmoApproach(m).destination,posture:'stand'});
  assert.equal((await a.command('claim',{id:m.id,kind:'emo'})).ok,true);assert.equal((await b.command('claim',{id:m.id,kind:'emo'})).ok,false);
  assert.equal((await a.command('press',{id:m.id})).ok,true);assert.equal((await a.command('explode',{id:m.id})).ok,false);await sleep(850);assert.equal((await a.command('explode',{id:m.id})).ok,true);
  await until(()=>b.frame.broken.some(r=>r[0]===m.id));report.checks.push('exclusive EMO contact and shared damage');
  assert.equal((await a.command('claim',{id:m.id,kind:'repair'})).ok,true);assert.equal((await a.command('repair',{id:m.id})).ok,true);await sleep(5250);assert.equal((await a.command('finish',{id:m.id})).ok,true);
  await until(()=>!b.frame.broken.some(r=>r[0]===m.id));report.checks.push('timed repair shared with peer');
  const p=ports.find(p=>initialSharedPorts.includes(p.id)&&!a.frame.broken.some(r=>r[0]===p.machineId)&&!a.frame.foups.some(r=>r[0]===`port:${p.id}`));const foupId=`port:${p.id}`;
  a.move({x:p.x,z:p.z+p.sign*.96});b.move({x:p.x,z:p.z+p.sign*.96});assert.equal((await a.command('pickup',{id:foupId})).ok,true);assert.equal((await b.command('pickup',{id:foupId})).ok,false);
  assert.equal((await a.command('throw')).ok,true);await until(()=>b.frame.foups.some(r=>r[0]===foupId&&r[1]==='flying'));report.checks.push('exclusive FOUP pickup and shared throw');
  const row=a.frame.fleet.find(row=>!row[17]&&boardingMachine({x:row[1],z:row[2]})&&!a.frame.broken.some(r=>r[0]===boardingMachine({x:row[1],z:row[2]}).id));assert.ok(row);
  const tool=boardingMachine({x:row[1],z:row[2]});a.move({x:row[1],z:tool.z+tool.sign*(TOOL_FRONT+.43)});
  assert.equal((await a.command('board',{id:row[0]})).ok,true);const frozen=a.frame.fleet.find(r=>r[0]===row[0]);a.move({x:frozen[1],z:tool.z+tool.sign*(TOOL_FRONT+.43)});
  assert.equal((await a.command('climb')).ok,true);await sleep(2700);assert.equal((await a.command('ride')).ok,true);
  await until(()=>b.frame.fleet.some(r=>r[0]===row[0]&&r[15]&&r[17]===a.id));assert.equal((await a.command('dismount')).ok,true);
  await until(()=>b.frame.fleet.some(r=>r[0]===row[0]&&!r[15]&&!r[17]));report.checks.push('shared OHT boarding climb ride and dismount');
  report.passed=true;console.log(JSON.stringify(report));await writeFile(`outputs/actions-${origin.includes('127.')?'local':'public'}.json`,JSON.stringify(report,null,2));
}finally{for(const c of clients)c.ws.close();}
