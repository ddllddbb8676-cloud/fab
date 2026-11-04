import {DurableObject} from 'cloudflare:workers';
import {createGrowthMetrics} from './growth-metrics.js';
import {telemetryAccess,readTelemetry,createTelemetryLimiter} from './telemetry-request.js';
import {isAdmin,ADMIN_HEADERS,metricExclusions} from './admin-access.js';
import {sessionId,sessionToken} from './player-profiles.js';
import {items as catalog} from '../src/cosmetics-catalog.js';
const PRIVATE={'Cache-Control':'private, no-store','Vary':'Cookie'};
const METHODS=new Set(['connect','observeProfile','activity','reward','purchaseRejected','presence','forget']);
const DELIVERY='growth:v1:delivery',MAX_AGE=60000;
export class FabAnalytics extends DurableObject{
  constructor(ctx,env){
    super(ctx,env);this.env=env;this.excluded=new Set([env.FAB_OWNER_VISITOR_ID,...metricExclusions(env)]);
    this.allowed=createTelemetryLimiter();this.serial=Promise.resolve();this.receipts=[];this.dropped=0;
    this.metrics=createGrowthMetrics({ownerId:env.FAB_OWNER_VISITOR_ID,excludedIds:metricExclusions(env)});
    ctx.blockConcurrencyWhile(()=>this.load());
  }
  async load(){
    this.metrics.restore(new Map());let startAfter,delivery;
    do{const page=await this.ctx.storage.list({prefix:'growth:v1:',limit:500,...(startAfter?{startAfter}:{})});this.metrics.restorePage(page);if(page.has(DELIVERY))delivery=page.get(DELIVERY);if(page.size<500)break;startAfter=[...page.keys()].at(-1);}while(startAfter);
    this.receipts=Array.isArray(delivery?.receipts)?delivery.receipts.slice(-512):[];this.dropped=Number.isSafeInteger(delivery?.dropped)?delivery.dropped:0;
  }
  enqueue(fn){const task=this.serial.catch(()=>{}).then(async()=>{if(this.reloadRequired){await this.load();this.reloadRequired=false;}return fn();});this.serial=task;return task;}
  async persist(){
    // Stage bounded metric writes, then atomically commit them together with
    // relay receipt IDs. A retry cannot double-count a committed batch.
    const puts=new Map(),deletes=new Set();
    await this.metrics.flush({put:async rows=>{for(const [k,v] of Object.entries(rows)){puts.set(k,v);deletes.delete(k);}},delete:async keys=>{for(const k of Array.isArray(keys)?keys:[keys]){deletes.add(k);puts.delete(k);}}});
    puts.set(DELIVERY,{receipts:this.receipts,dropped:this.dropped});
    try{
      await this.ctx.storage.transaction(async tx=>{
        const entries=[...puts];for(let i=0;i<entries.length;i+=128)await tx.put(Object.fromEntries(entries.slice(i,i+128)));
        const keys=[...deletes];for(let i=0;i<keys.length;i+=128)await tx.delete(keys.slice(i,i+128));
      });
    }catch(error){this.reloadRequired=true;try{await this.load();this.reloadRequired=false;}catch{}throw error;}
  }
  async fetch(request){
    const url=new URL(request.url);
    if(url.hostname==='fab-analytics.internal'&&url.pathname==='/ingest'&&request.method==='POST'){
      const text=await request.text();if(text.length>120000)return new Response(null,{status:413});
      let body;try{body=JSON.parse(text);}catch{return new Response(null,{status:400});}
      if(!body||typeof body.id!=='string'||!/^[a-f0-9-]{36}$/.test(body.id)||!Array.isArray(body.events)||body.events.length>512||!Number.isSafeInteger(body.dropped)||body.dropped<0||body.events.some(e=>!e||!METHODS.has(e.method)||!Array.isArray(e.args)||!Number.isFinite(e.at)))return new Response(null,{status:400});
      return this.enqueue(async()=>{
        if(this.receipts.some(row=>row.id===body.id))return new Response(null,{status:204});
        const now=Date.now();this.dropped+=body.dropped;
        for(const event of body.events){
          if(event.at>now||now-event.at>MAX_AGE){this.dropped++;continue;}
          this.metrics.at(event.at,()=>this.metrics[event.method](...event.args));
        }
        this.receipts.push({id:body.id,at:now});this.receipts=this.receipts.filter(row=>now-row.at<MAX_AGE*2).slice(-512);
        await this.persist();return new Response(null,{status:204});
      }).catch(()=>new Response(null,{status:503}));
    }
    if(url.pathname==='/api/telemetry'){
      const denied=telemetryAccess(request,Boolean(sessionToken(request)));if(denied)return new Response(null,{status:denied,headers:PRIVATE});
      const id=await sessionId(sessionToken(request));if(!id)return new Response(null,{status:401,headers:PRIVATE});
      if(!this.allowed(id))return new Response(null,{status:429,headers:PRIVATE});
      const parsed=await readTelemetry(request);if(!parsed.events)return new Response(null,{status:parsed.status,headers:PRIVATE});
      if(parsed.events.some(e=>e.itemId&&!catalog.some(item=>item.id===e.itemId)))return new Response(null,{status:400,headers:PRIVATE});
      return this.enqueue(async()=>{
        if(!this.excluded.has(id))for(const event of parsed.events)this.metrics.client(id,event);
        await this.persist();return new Response(null,{status:204,headers:PRIVATE});
      }).catch(()=>new Response(null,{status:503,headers:PRIVATE}));
    }
    if(url.pathname==='/api/admin/metrics'){
      if(!await isAdmin(request,this.env))return new Response(null,{status:403,headers:PRIVATE});
      if(request.method!=='GET')return new Response(null,{status:405,headers:PRIVATE});
      return this.enqueue(async()=>{
        const value=this.metrics.snapshot();value.delivery={droppedEvents:this.dropped};
        if(this.dropped){value.limited=true;value.notes.push('게임 응답을 우선해 전송하지 못한 분석 기록이 있어요. 일부 수치는 누락될 수 있어요.');}
        await this.persist();return Response.json(value,{headers:ADMIN_HEADERS});
      }).catch(()=>new Response(null,{status:503,headers:PRIVATE}));
    }
    return new Response(null,{status:404,headers:PRIVATE});
  }
}
