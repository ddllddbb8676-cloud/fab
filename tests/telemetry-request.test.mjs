import test from 'node:test';
import assert from 'node:assert/strict';
import {telemetryAccess,telemetryEvents,telemetryPlatform,readTelemetry,createTelemetryLimiter} from '../server/telemetry-request.js';
const pageId='ab000000-0000-4000-8000-000000000001';
const event={id:pageId+':1',pageId,kind:'page_start',elapsedMs:4,source:'direct',build:'unknown'};
const request=(body={events:[event]},headers={},method='POST')=>new Request('https://fab.test/api/telemetry',{method,headers:{Origin:'https://fab.test','Content-Type':'application/json',...headers},...(method==='GET'?{}:{body:body instanceof ReadableStream?body:JSON.stringify(body)}),...(body instanceof ReadableStream?{duplex:'half'}:{})});
test('telemetry gate rejects unassociated, cross-origin and oversized observations',()=>{
  assert.equal(telemetryAccess(request(),true),null);
  for(const [r,session,status] of [[request(),false,401],[request({}, {},'GET'),true,405],[request({}, {Origin:'https://other.test'}),true,403],[request({}, {'Content-Type':'text/plain'}),true,415],[request({}, {'Content-Length':'8193'}),true,413]])assert.equal(telemetryAccess(r,session),status);
});
test('telemetry accepts only bounded aggregate event inputs, never identity or raw error fields',()=>{
  assert.equal(telemetryEvents({events:[event]},'ios-instagram')[0].platform,'ios-instagram');
  for(const value of [null,[],{}, {events:[]},{events:Array(13).fill(event)},{events:[event],user:'anything'},...[
    {id:pageId+':0'},{id:pageId+':-1'},{pageId:'bad'},{kind:'purchase'},{elapsedMs:-1},{elapsedMs:86400001},{elapsedMs:'3'},
    {source:'https://private.example/path'},{build:'private build string'},{stack:'secret'},{userId:'someone'},{platform:'spoof'},
    {itemId:'suit-blue'},{kind:'try_on'},{kind:'try_on',itemId:'<script>'}
  ].map(p=>({events:[{...event,...p}]}))])assert.equal(telemetryEvents(value),null);
  assert.ok(telemetryEvents({events:[{...event,kind:'try_on',itemId:'suit-blue'}]}));
});
test('telemetry stream validation counts UTF-8 bytes and cancels a never-ending oversize body',async()=>{
  let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(8193));},cancel(){cancelled=true;}});
  assert.equal((await readTelemetry(request(stream))).status,413);assert.equal(cancelled,true);
  assert.equal((await readTelemetry(request({events:[event]}))).events.length,1);
  assert.equal((await readTelemetry(request({events:[{...event,source:'가'.repeat(4000)}]}))).status,413);
});
test('platform tags are coarse and telemetry rate limits bound both writes and memory',()=>{
  assert.equal(telemetryPlatform('iPhone Instagram Safari'),'ios-instagram');assert.equal(telemetryPlatform('iPhone Safari'),'ios-safari');
  assert.equal(telemetryPlatform('Android Chrome'),'android-chrome');assert.equal(telemetryPlatform('unknown secret'),'other');
  let now=0;const allow=createTelemetryLimiter({now:()=>now,capacity:2,batchesPerMinute:2});
  assert.equal(allow('a'),true);assert.equal(allow('a'),true);assert.equal(allow('a'),false);assert.equal(allow('b'),true);assert.equal(allow('c'),false);
  now=60000;assert.equal(allow('c'),true);assert.equal(allow('a'),true);
});
