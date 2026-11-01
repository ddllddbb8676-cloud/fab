import WebSocket from 'ws';
const lookup=process.env.FAB_TEST_IP ? (_host,options,cb)=>options?.all?cb(null,[{address:process.env.FAB_TEST_IP,family:4}]):cb(null,process.env.FAB_TEST_IP,4):undefined;
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const origin=process.argv[2]??'http://127.0.0.1:4173',seconds=Number(process.argv[3]??20);
const endpoint=new URL('/api/room?v=18',origin);endpoint.protocol=endpoint.protocol==='https:'?'wss:':'ws:';
const clients=[],stats={origin,seconds,clients:0,frames:0,maxFrameBytes:0,closes:0,sent:0,maxGapMs:0};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function connect(){return new Promise((resolve,reject)=>{
  const ws=new WebSocket(endpoint,{origin,lookup}),c={ws,frames:0,last:0};const timer=setTimeout(()=>reject(new Error('welcome timeout')),12000);
  ws.on('error',reject);ws.on('close',()=>{clearInterval(c.heartbeat);if(c.id)stats.closes++;});
  ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome'){clearTimeout(timer);Object.assign(c,{id:m.id,count:m.frame.count});c.heartbeat=setInterval(()=>{if(ws.readyState===1)ws.send(JSON.stringify({type:'pose',pose:{x:0,y:0,z:70,heading:0,speed:0,posture:'stand',hidden:false}}));},5000);clients.push(c);resolve(c);}
    else if(m.type==='full'){clearTimeout(timer);resolve({full:true});}
    else if(m.type==='frame'){const now=Date.now();if(c.last)stats.maxGapMs=Math.max(stats.maxGapMs,now-c.last);c.last=now;c.frames++;c.frame=m;stats.frames++;stats.maxFrameBytes=Math.max(stats.maxFrameBytes,raw.length);}
  });
});}
let interval;
try {
  let first=await connect();assert.ok(!first.full);const existing=first.count-1;
  for(let n=1;n<100-existing;n+=5){const batch=await Promise.all(Array.from({length:Math.min(5,99-existing-n+1)},()=>connect()));for(const c of batch)assert.ok(!c.full);}
  stats.clients=clients.length;stats.existing=existing;assert.equal((await connect()).full,true,'101st must wait');
  console.log(JSON.stringify({stage:'connected',clients:clients.length,total:100,overflow:'rejected'}));
  const start=Date.now();interval=setInterval(()=>{const t=(Date.now()-start)/1000;clients.forEach((c,i)=>{if(c.ws.readyState!==1)return;c.ws.send(JSON.stringify({type:'pose',pose:{x:(i%2?1:-1)*.8,y:0,z:70-(i%20)*.08+Math.sin(t)*.5,heading:t,speed:1,posture:'stand',hidden:false}}));stats.sent++;});},1000/6);
  await sleep(seconds*1000);clearInterval(interval);
  assert.equal(stats.closes,0);for(const c of clients){assert.ok(c.frames>=seconds*3,`too few frames: ${c.frames}`);assert.equal(c.frame.count,100);assert.equal(c.frame.people.length,130);}
  stats.minFrames=Math.min(...clients.map(c=>c.frames));stats.passed=true;console.log(JSON.stringify(stats));
  await mkdir('outputs',{recursive:true});await writeFile(`outputs/load-${origin.includes('127.')?'local':'public'}.json`,JSON.stringify(stats,null,2));
}finally{clearInterval(interval);for(const c of clients){clearInterval(c.heartbeat);c.ws.close();}}
