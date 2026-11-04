import {resetInappropriateNickname} from './nickname-moderation.js';
import { DurableObject } from 'cloudflare:workers';
import { createRoom } from './room-engine.js';
import { PROTOCOL, MAX_VISITORS } from '../src/shared-protocol.js';
import { ROOM_CAPACITY, AUTOMATED_COUNT } from '../src/room-population.js';
import {sessionToken,newSessionToken,sessionCookie,sessionId,createProfileStore} from './player-profiles.js';
import equipmentBootstrap from './equipment-bootstrap.json';
import {canonicalRedirect} from './canonical-url.js';
import {rejectOutdatedRoom} from './room-version.js';
import {serveEntry} from './entry-response.js';
import {HttpRoomPeer,HTTP_IDLE_MS,connectionOrder,readRoomBody} from './http-room-peer.js';
import {ADMIN_HEADERS,isAdmin,adminDenied,metricExclusions} from './admin-access.js';
import {createProfileMetrics} from './profile-metrics.js';
import {createActivityMetrics} from './activity-metrics.js';
import {items as cosmeticItems} from '../src/cosmetics-catalog.js';
import {isSafety} from '../src/safety-team.js';
import {createGrowthRelay} from './growth-relay.js';
import {telemetryAccess} from './telemetry-request.js';
import {eventAccess,eventResponse,readEventRequest} from './admin-events.js';
export {FabAnalytics} from './analytics-worker.js';

const PRIVATE_HEADERS = {'Cache-Control':'private, no-store','Vary':'Cookie'};
const httpResult = (status, data = {}) => Response.json(data,{status,headers:PRIVATE_HEADERS});
const VISIT_BODY_LIMIT=1024;
async function visitAccess(request,env){
  if(!await isAdmin(request,env))return httpResult(403,{message:'운영자만 이용할 수 있어요.'});
  if(request.method!=='POST')return httpResult(405,{message:'방문할 닉네임을 선택해 주세요.'});
  if(request.headers.get('Origin')!==new URL(request.url).origin)return httpResult(403,{message:'FAB 관리자 페이지에서 다시 선택해 주세요.'});
  if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return httpResult(415,{message:'닉네임 요청 형식을 확인해 주세요.'});
  if(Number(request.headers.get('Content-Length'))>VISIT_BODY_LIMIT)return httpResult(413,{message:'닉네임 요청이 너무 길어요.'});
  return null;
}
async function readVisitName(request){
  const reader=request.body?.getReader();if(!reader)return {status:400};
  let bytes=0,text='',timer,ended=false;
  const decoder=new TextDecoder('utf-8',{fatal:true}),deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('deadline')),3000);});
  try{
    for(;;){
      const {done,value}=await Promise.race([reader.read(),deadline]);
      if(done){ended=true;break;}
      bytes+=value.byteLength;if(bytes>VISIT_BODY_LIMIT)return {status:413};
      text+=decoder.decode(value,{stream:true});
    }
    const body=JSON.parse(text+decoder.decode()),name=body?.name;
    if(!body||Array.isArray(body)||Object.keys(body).length!==1||typeof name!=='string'||name!==name.trim()||![...name].length||[...name].length>32||!/^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 ]+$/u.test(name))return {status:400};
    return {name};
  }catch(error){return {status:error.message==='deadline'?408:400};}
  finally{clearTimeout(timer);if(!ended)void reader.cancel().catch(()=>{});reader.releaseLock();}
}

export default {
  async fetch(request,env) {
    const redirect=canonicalRedirect(request);if(redirect)return redirect;
    const url=new URL(request.url);
    if(url.pathname==='/api/admin/events'){
      const denied=await eventAccess(request,env);if(denied)return denied;
      return env.FAB_ROOM.getByName('FAB-A-v20').fetch(request);
    }
    if(url.pathname==='/api/telemetry'){
      const denied=telemetryAccess(request,Boolean(sessionToken(request)));if(denied)return httpResult(denied);
      if(!env.FAB_ANALYTICS)return httpResult(503);
      return env.FAB_ANALYTICS.getByName('FAB-ANALYTICS-v1').fetch(request);
    }
    if(url.pathname==='/api/admin/visit'){
      const denied=await visitAccess(request,env);if(denied)return denied;
      return env.FAB_ROOM.getByName('FAB-A-v20').fetch(request);
    }
    if(['/admin','/admin/','/admin.html','/api/admin/metrics'].includes(url.pathname)){
      if(!await isAdmin(request,env))return url.pathname.startsWith('/api/')?httpResult(403):adminDenied();
      if(request.method!=='GET')return httpResult(405);
      if(url.pathname==='/api/admin/metrics'){
        const legacy=env.FAB_ROOM.getByName('FAB-A-v20').fetch(request);
        let timer;
        const analysis=env.FAB_ANALYTICS?Promise.race([env.FAB_ANALYTICS.getByName('FAB-ANALYTICS-v1').fetch(request).then(async response=>response.ok?response.json():null),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),2500);})]).catch(()=>null).finally(()=>clearTimeout(timer)):Promise.resolve(null);
        const [response,growth]=await Promise.all([legacy,analysis]);if(!response.ok)return response;
        const data=await response.json();return Response.json({...data,growth,notes:[...(data.notes||[]),...(!growth?['이용 흐름 분석 응답이 늦어 기존 현황을 먼저 표시했어요. 다음 갱신에 다시 확인해요.']:[])]},{headers:ADMIN_HEADERS});
      }
      if(url.pathname!=='/admin')return new Response(null,{status:302,headers:{...ADMIN_HEADERS,Location:'/admin'}});
      const asset=await env.ASSETS.fetch(request),headers=new Headers(asset.headers);
      for(const [key,value] of Object.entries(ADMIN_HEADERS))headers.set(key,value);
      headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      return new Response(asset.body,{status:asset.status,headers});
    }
    if(url.pathname==='/api/leaderboard'){
      if(request.method!=='GET')return new Response('Method not allowed',{status:405});
      return env.FAB_ROOM.getByName('FAB-A-v20').fetch(request);
    }
    if(url.pathname==='/api/config') {
      const headers={'Cache-Control':'no-store'};
      if(!sessionToken(request))headers['Set-Cookie']=sessionCookie(newSessionToken(),request.url);
      return Response.json({multiplayer:true,protocol:PROTOCOL,room:'FAB A',capacity:ROOM_CAPACITY,visitorCapacity:MAX_VISITORS,automatedCount:AUTOMATED_COUNT,ws:'/api/room',serverTime:Date.now(),persistentProfile:true,persistentEquipment:true,uniqueNicknames:true},{headers});
    }
    if(url.pathname==='/api/room-http') {
      if(request.method!=='POST')return httpResult(405);
      if(request.headers.get('Origin')!==url.origin)return httpResult(403);
      if(!sessionToken(request))return httpResult(401);
      if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return httpResult(415);
      if(url.searchParams.get('v')!==String(PROTOCOL))return httpResult(426);
      return env.FAB_ROOM.getByName('FAB-A-v20').fetch(request);
    }
    if(url.pathname==='/api/session/reset') {
      if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)return new Response('Not allowed',{status:403});
      const response=await env.FAB_ROOM.getByName('FAB-A-v20').fetch(request);
      if(!response.ok)return response;
      return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie(newSessionToken(),request.url)}});
    }
    if(url.pathname==='/api/room') {
      if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
      const origin=request.headers.get('Origin');
      if(origin!==url.origin)return new Response('Origin not allowed',{status:403});
      const outdated=rejectOutdatedRoom(request);if(outdated)return outdated;
      return env.FAB_ROOM.getByName('FAB-A-v20').fetch(request);
    }
    if(url.pathname.startsWith('/api/'))return new Response('Not found',{status:404});
    const asset=await env.ASSETS.fetch(request);
    if(asset.headers.get('Content-Type')?.includes('text/html'))return serveEntry(asset,request);
    return asset;
  }
};

export class FabRoom extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);this.adminEnv=env;this.sockets=new Map();this.rosterDirty=false;
    const excludedIds=metricExclusions(env);this.metricExcludedIds=new Set(excludedIds);
    this.growthMetrics=createGrowthRelay({binding:env.FAB_ANALYTICS,waitUntil:p=>ctx.waitUntil(p),ownerId:env.FAB_OWNER_VISITOR_ID,excludedIds});this.lastGrowthPresence=0;
    this.activityMetrics=createActivityMetrics({excludedIds});this.profileMetrics=createProfileMetrics({ownerId:env.FAB_OWNER_VISITOR_ID,excludedIds});
    this.metricProfiles=new Map();this.paidItems=new Set(cosmeticItems.filter(item=>item.price>0).map(item=>item.id));this.lastMetricsFlush=Date.now();
    this.profiles=createProfileStore(ctx.storage,{ownerId:env.FAB_OWNER_VISITOR_ID,onProfileObserved:p=>this.observeProfile(p),onProfileRemoved:id=>{this.profileMetrics.remove(id);this.metricProfiles.delete(id);}});
    this.httpPeers=new Map();this.connectionOrders=new Map();
    this.room=createRoom({ownerId:env.FAB_OWNER_VISITOR_ID,eventExcludedIds:excludedIds,onEventsChange:s=>this.profiles.saveEvents(s),nicknameAvailable:(...args)=>this.profiles.nicknameAvailable(...args),replaceNickname:(...args)=>this.profiles.replaceNickname(...args),claimName:(...args)=>this.profiles.claimName(...args),getHistoricalScores:()=>this.profiles.ranking(),onEquipmentChange:s=>this.profiles.saveEquipment(s),onFoupChange:s=>this.profiles.saveFoups(s),onProfileChange:p=>this.profiles.save(p),onReward:event=>this.trackGrowth(()=>this.growthMetrics.reward(event.id,event.kind,event.amount)),onRosterChange:()=>{this.rosterDirty=true;},onCatch:event=>{
      for(const [ws,s] of this.sockets)if(s.id===event.guardId)this.send(ws,{type:'safety-catch',...event});
    }});this.timer=null;this.tickCount=0;this.previous=Date.now();
    ctx.blockConcurrencyWhile(async()=>{
      try{
        let startAfter;const records=new Map();
        do{const page=await ctx.storage.list({prefix:'metrics:v1:',limit:500,...(startAfter?{startAfter}:{})});for(const [key,value] of page)records.set(key,value);if(page.size<500)break;startAfter=[...page.keys()].at(-1);}while(startAfter);
        this.activityMetrics.restore(records);
      }catch{this.metricsUnavailable=true;}
      const saved=await this.profiles.getEquipment();
      this.room.restoreEquipment(saved===undefined?(env.FAB_ENVIRONMENT==='production'?equipmentBootstrap:{version:1,broken:[]}):saved);
      if(saved===undefined)this.profiles.saveEquipment(this.room.equipmentState());
      const foups=await this.profiles.getFoups();
      if(foups!==undefined)this.room.restoreFoups(foups);else this.profiles.saveFoups(this.room.store.checkpoint());
      this.room.worldEvents.restore(await this.profiles.getEvents());
      await this.checkpoint();
      await this.profiles.loadRanking();
      for(const p of [...this.room.residents.people,...this.room.safety.people])p.name=this.profiles.claimName(p.id,p.role.startsWith('safety-')?'safety':'visitor',p.name);
      // Finish any legacy duplicate-name migration before exposing profiles or rankings.
      await this.checkpoint();
      for(const ws of ctx.getWebSockets()) {
        const {id,order}=ws.deserializeAttachment()||{},saved=id?await this.profiles.get(id):null;
        if(id&&this.room.join(id,saved).ok){this.sockets.set(ws,{id,rate:0,at:Date.now()});this.connectionOrders.set(id,{order:order??0,at:Date.now()});this.welcome(ws,id);this.trackGrowth(()=>this.growthMetrics.connect(id,{existing:Boolean(saved),transport:'restored',profile:this.room.profile(id)}));}
        else try{ws.close(1012,'다시 연결해 주세요');}catch{}
      }
      await this.checkpoint();if(this.sockets.size)this.start();
      this.track(()=>this.activityMetrics.sync(this.room.players.keys()));
      this.updateGrowthPresence(true);
      this.trackGrowth(()=>this.growthMetrics.flush(true));
    });
  }
  track(callback){try{if(!this.metricsUnavailable)callback();}catch{this.metricsUnavailable=true;}}
  trackGrowth(callback){try{if(!this.growthUnavailable)return callback();}catch{this.growthUnavailable=true;}}
  updateGrowthPresence(force=false){
    const now=Date.now();if(!force&&now-this.lastGrowthPresence<1000)return;this.lastGrowthPresence=now;
    this.trackGrowth(()=>this.growthMetrics.presence([...this.room.players.values()].map(p=>({id:p.id,hidden:p.hidden,phase:p.phase,role:p.role,penalty:p.penalty}))));
  }
  observeProfile(p){
    this.trackGrowth(()=>this.growthMetrics.observeProfile(p));
    try{
      this.profileMetrics.observe(p);
      const previous=this.metricProfiles.get(p.id),owned=new Set((p.wallet?.owned||[]).filter(id=>this.paidItems.has(id)));
      const current={broken:p.brokenCount||0,repaired:p.repairedCount||0,owned};this.metricProfiles.set(p.id,current);
      if(previous)this.track(()=>this.activityMetrics.action(p.id,{destructions:Math.max(0,current.broken-previous.broken),repairs:Math.max(0,current.repaired-previous.repaired),purchases:p.id===this.adminEnv.FAB_OWNER_VISITOR_ID?0:[...owned].filter(id=>!previous.owned.has(id)).length}));
    }catch{this.profileMetricsUnavailable=true;}
  }
  async flushMetrics(force=false){
    if(this.metricsUnavailable)return;
    if(this.flushingMetrics){if(force){await this.flushingMetrics;return this.flushMetrics(true);}return;}
    if(!force&&Date.now()-this.lastMetricsFlush<60000)return;
    this.lastMetricsFlush=Date.now();
    this.flushingMetrics=(async()=>{try{await this.activityMetrics.flush(this.ctx.storage);this.metricsWriteDelayed=false;}catch{this.metricsWriteDelayed=true;}})();
    try{await this.flushingMetrics;}finally{this.flushingMetrics=null;}
  }
  pose(id,data){
    const p=this.room.players.get(id),before=p?{x:p.x,z:p.z,hidden:p.hidden}:null;
    const accepted=this.room.pose(id,data);
    if(accepted&&before&&before.hidden!==p.hidden)this.updateGrowthPresence(true);
    if(accepted&&before&&!p.hidden&&!before.hidden&&Math.hypot(p.x-before.x,p.z-before.z)>.03){this.track(()=>this.activityMetrics.activity(id));this.trackGrowth(()=>this.growthMetrics.activity(id,'move'));}
    return accepted;
  }
  send(ws,data){try{ws.send(typeof data==='string'?data:JSON.stringify(data));return true;}catch{return false;}}
  connectedUsers(){
    return [...this.room.players.values()].filter(p=>/^visitor:[a-f0-9]{64}$/.test(p.id)&&!this.metricExcludedIds.has(p.id))
      .map(p=>({name:p.civilianName||p.name,role:p.id===this.adminEnv.FAB_OWNER_VISITOR_ID?'operator':isSafety(p.role)?'safety':'visitor'}))
      .sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  }
  async checkpoint(){do{await this.profiles.flush();}while(this.profiles.hasPending);}
  welcome(ws,id){const p=this.room.players.get(id);this.send(ws,{type:'welcome',v:PROTOCOL,id,name:p.name,privileges:{unlimitedChips:Boolean(p.chipUnlimited)},wallet:this.room.wallet(id),nickname:this.room.nicknameState(id),titles:this.room.titleState(id),resume:p.hasEntered?p.groundPosition:null,roster:this.room.roster(),frame:this.room.snapshot(true)});}
  sendWallets(){for(const [ws,s] of this.sockets){const player=this.room.players.get(s.id);if(s.ready!==false&&player&&s.walletRevision!==player.wallet.revision){const wallet=this.room.wallet(s.id);this.send(ws,{type:'wallet',wallet});s.walletRevision=wallet.revision;}}}
  broadcastRoster(){const data=JSON.stringify({type:'roster',roster:this.room.roster(),count:this.room.players.size});for(const [ws,s] of this.sockets)if(s.ready!==false)this.send(ws,data);}
  async fetch(request) {
    if(new URL(request.url).pathname==='/api/admin/events'){
      const denied=await eventAccess(request,this.adminEnv);if(denied)return denied;
      if(request.method==='GET')return eventResponse(200,{worldEvents:this.room.worldEvents.controlState()});
      const input=await readEventRequest(request);if(!input)return eventResponse(400,{message:'이벤트 요청을 확인해 주세요.'});
      const result=this.room.worldEvents.startManual(input.kind,input.requestId);
      await this.checkpoint();
      if(result.ok&&this.sockets.size)this.start();
      return eventResponse(result.ok?200:result.status,{...result,worldEvents:this.room.worldEvents.controlState()});
    }
    if(new URL(request.url).pathname==='/api/admin/visit'){
      const denied=await visitAccess(request,this.adminEnv);if(denied)return denied;
      const input=await readVisitName(request);
      if(input.status)return httpResult(input.status,{message:input.status===413?'닉네임 요청이 너무 길어요.':input.status===408?'요청이 늦어졌어요. 다시 선택해 주세요.':'올바른 닉네임을 선택해 주세요.'});
      const matches=[...this.room.players.values()].filter(p=>/^visitor:[a-f0-9]{64}$/.test(p.id)&&!this.metricExcludedIds.has(p.id)&&(p.civilianName||p.name)===input.name);
      if(!matches.length)return httpResult(404,{message:'지금 접속해 있지 않아요. 목록을 새로고침해 주세요.'});
      if(matches.length!==1)return httpResult(409,{message:'같은 닉네임을 확인했어요. 목록을 새로고침해 주세요.'});
      const target=matches[0];
      if(target.id===this.adminEnv.FAB_OWNER_VISITOR_ID)return httpResult(409,{message:'내 캐릭터에게는 이동할 수 없어요.'});
      if(target.hidden||!Number.isFinite(target.y)||target.y>.3||['climb','climbing','riding'].includes(target.phase))return httpResult(409,{message:'입장 중이거나 OHT에 있는 이용자예요. 바닥에 내려오면 다시 선택해 주세요.'});
      return Response.json({target:{id:target.id,name:target.civilianName||target.name},expiresAt:Date.now()+120000},{headers:ADMIN_HEADERS});
    }
    if(new URL(request.url).pathname==='/api/admin/metrics'){
      if(!await isAdmin(request,this.adminEnv))return httpResult(403);
      if(request.method!=='GET')return httpResult(405);
      this.track(()=>this.activityMetrics.sync(this.room.players.keys()));
      if(this.metricsUnavailable)return httpResult(503,{error:'통계를 준비하지 못했어요. 게임은 계속 이용할 수 있어요.'});
      const activity=this.activityMetrics.snapshot();
      this.ctx.waitUntil(this.flushMetrics());
      return Response.json({...activity,generatedAt:Date.now(),timezone:'Asia/Seoul',live:{...activity.live,npcs:AUTOMATED_COUNT,users:this.connectedUsers()},profiles:this.profileMetricsUnavailable?null:this.profileMetrics.snapshot(),notes:['평균 동시 접속은 서버가 관측한 시간 기준이에요. 수집 공백과 수집 이전 시간은 포함하지 않아요.',...(this.metricsWriteDelayed?['최근 통계 저장이 지연되어 서버 재시작 시 일부 수집값이 누락될 수 있어요.']:[])]},{headers:ADMIN_HEADERS});
    }
    if(new URL(request.url).pathname==='/api/room-http')return this.httpRoom(request);
    if(new URL(request.url).pathname==='/api/leaderboard')return Response.json({scope:'all-time',rows:this.room.ranking(),recordedVisitors:this.profiles.rankedVisitorCount,highestVisitorScore:this.profiles.ranking()[0]?.brokenCount??0},{headers:{'Cache-Control':'no-store'}});
    if(new URL(request.url).pathname==='/api/session/reset') {
      const id=await sessionId(sessionToken(request));
      if(id){
        for(const [ws,s] of this.sockets)if(s.id===id){ws.serializeAttachment?.({retired:true});this.send(ws,{type:'resetting'});this.sockets.delete(ws);try{ws.close(4002,'새로 시작하기');}catch{}}
        this.room.remove(id);await this.profiles.remove(id);this.broadcastRoster();
      }
      return Response.json({ok:true});
    }
    if(new URL(request.url).searchParams.get('v')!==String(PROTOCOL))return new Response('새로고침 후 다시 입장해 주세요',{status:409});
    const [client,server]=Object.values(new WebSocketPair());
    const incomingToken=sessionToken(request),token=incomingToken||newSessionToken();
    const id=await sessionId(token);
    const headers=incomingToken?undefined:{'Set-Cookie':sessionCookie(token,request.url)};
    const order=connectionOrder(new URL(request.url).searchParams.get('o'));
    if(Number.isNaN(order))return new Response('Invalid connection order',{status:400});
    this.ctx.acceptWebSocket(server);
    await this.admit(server,id,order);
    return new Response(null,{status:101,headers,webSocket:client});
  }
  retire(peer) {
    peer.serializeAttachment?.({retired:true});
    this.send(peer,{type:'replaced'});
    this.sockets.delete(peer);
    try{peer.close(4001,'다른 탭에서 이어서 접속했습니다');}catch{}
  }
  async admit(peer,id,order) {
    const prior=this.connectionOrders.get(id);
    if(order!==null && prior && order<=prior.order){this.retire(peer);return;}
    // Reserve before any storage await. An older pending read cannot take the
    // account back or overwrite a command saved on its newer connection.
    // Keep a bounded history of inactive accounts for reordered mobile attempts.
    if(this.connectionOrders.size>=512){
      for(const [account,entry] of this.connectionOrders){
        if(account!==id && !entry.reading && !this.room.players.has(account)){
          this.connectionOrders.delete(account);
          if(this.connectionOrders.size<512)break;
        }
      }
    }
    const ticket={order:order??prior?.order??0,at:Date.now(),reading:true};
    this.connectionOrders.delete(id);
    this.connectionOrders.set(id,ticket);
    let saved;
    try{saved=this.room.profile(id)||await this.profiles.get(id);}
    finally{ticket.reading=false;}
    if(this.connectionOrders.get(id)!==ticket){this.retire(peer);return;}
    const current=this.room.profile(id)||saved;
    for(const [other,s] of this.sockets)if(s.id===id)this.retire(other);
    if(this.room.players.has(id))this.room.remove(id);
    const joined=this.room.join(id,current);
    if(!joined.ok){
      const full={type:'full',message:joined.message};this.send(peer,full);peer.close(1008,'Room full');return full;
    }
    peer.serializeAttachment?.({id,order:ticket.order});
    const session={id,rate:0,at:Date.now(),ready:false};
    this.sockets.set(peer,session);
    try{await this.checkpoint();}
    catch(error){try{peer.close(1013,'Try again');}catch{}this.close(peer);throw error;}
    if(!this.sockets.has(peer))return;
    this.welcome(peer,id);session.ready=true;session.walletRevision=this.room.players.get(id).wallet.revision;this.broadcastRoster();this.start();
    this.track(()=>{this.activityMetrics.sync(this.room.players.keys());this.activityMetrics.connect(id,peer instanceof HttpRoomPeer?'https':'websocket');});
    this.trackGrowth(()=>this.growthMetrics.connect(id,{existing:Boolean(current),transport:peer instanceof HttpRoomPeer?'https':'websocket',profile:this.room.profile(id)}));this.updateGrowthPresence(true);
  }
  async httpRoom(request) {
    const parsed=await readRoomBody(request);
    if(!parsed.body)return httpResult(parsed.status);
    const {op,key,cursor,order,inputs}=parsed.body;
    const id=await sessionId(sessionToken(request));
    if(!id)return httpResult(401);
    // A key is a transport lease, never an account credential.
    const lookup=id+'/'+key;
    let peer=this.httpPeers.get(lookup);
    if(op==='open' && !peer){
      for(const [oldKey,old] of this.httpPeers)if(old.status && (Date.now()-old.closedAt>120000 || this.httpPeers.size>=256))this.httpPeers.delete(oldKey);
      if(this.httpPeers.size>=256)return httpResult(429);
      peer=new HttpRoomPeer();this.httpPeers.set(lookup,peer);
      peer.opening=this.admit(peer,id,order);
    }
    if(!peer)return httpResult(410);
    let full;
    try{full=await peer.opening;}catch{peer.close(1013);return httpResult(503);}
    if(full&&op==='open')return httpResult(200,{messages:[[1,JSON.stringify(full)]]});
    if(peer.status)return httpResult(peer.status);
    if(!this.sockets.has(peer))return httpResult(410);
    if(op==='close'||Date.now()-peer.lastPoll>HTTP_IDLE_MS){
      peer.close(1000);this.close(peer);
      return op==='close'?httpResult(200,{messages:[]}):httpResult(410);
    }
    if(!peer.allowPoll(Date.now()))return httpResult(429);
    if(!peer.acknowledge(cursor))return httpResult(410);
    for(const input of inputs){
      if(input.type==='command'){
        if(input.seq<=peer.lastCommand)continue;
        peer.lastCommand=input.seq;
      }
      await this.webSocketMessage(peer,input.raw);
      if(peer.status)return httpResult(peer.status);
    }
    return httpResult(200,peer.delivery());
  }
  start() {
    if(this.timer)return;this.previous=Date.now();
    this.timer=setInterval(()=>this.ctx.waitUntil(this.tick().catch(()=>console.error('Room checkpoint delayed; retrying before broadcast'))),50);
  }
  async tick(){
    if(this.ticking)return;this.ticking=true;
    try{
      await this.checkpoint();
      const now=Date.now(),dt=Math.min(.1,(now-this.previous)/1000);this.previous=now;this.room.step(dt);
      let changed=false;
      for(const [ws,s] of this.sockets){
        const expired=ws instanceof HttpRoomPeer && (ws.status || now-ws.lastPoll>HTTP_IDLE_MS);
        if(expired||!this.room.players.has(s.id)){try{ws.close(1001,'Idle connection');}catch{}this.room.remove(s.id);this.sockets.delete(ws);changed=true;}
      }
      // Persist damage and matching human scores in the same storage.put batch
      // before telling any client that a tool broke or finished being repaired.
      await this.checkpoint();
      this.sendWallets();
      if(changed||this.rosterDirty){this.rosterDirty=false;this.broadcastRoster();}
      if(++this.tickCount%4===0){const data=JSON.stringify(this.room.snapshot());for(const [ws,s] of this.sockets)if(s.ready!==false&&!this.send(ws,data)){this.room.remove(s.id);this.sockets.delete(ws);}}
      this.track(()=>this.activityMetrics.sync(this.room.players.keys()));this.ctx.waitUntil(this.flushMetrics(!this.sockets.size));
      this.updateGrowthPresence();
      this.trackGrowth(()=>this.growthMetrics.flush(!this.sockets.size));
      if(!this.sockets.size){clearInterval(this.timer);this.timer=null;}
    }finally{this.ticking=false;}
  }
  async webSocketMessage(ws,message) {
    const session=this.sockets.get(ws);if(!session)return;
    const now=Date.now();if(now-session.at>=1000){session.rate=0;session.at=now;}
    if(typeof message!=='string'||message.length>2048||++session.rate>24){try{ws.close(1008,'Message limit');}catch{}this.close(ws);return;}
    let data;try{data=JSON.parse(message);}catch{return;}
    if(!data||typeof data!=='object'||Array.isArray(data))return;
    if(data.type==='pose'){this.pose(session.id,data.pose);return;}
    if(data.type==='command'&&Number.isSafeInteger(data.seq)&&typeof data.kind==='string') {
      if(data.pose)this.pose(session.id,data.pose);
      const beforePlayer=this.room.players.get(session.id),beforeItem=cosmeticItems.find(item=>item.id===data.data?.itemId);
      const insufficient=data.kind==='purchase'&&beforeItem&&!beforePlayer?.chipUnlimited&&!beforePlayer?.wallet?.owned?.includes(beforeItem.id)&&beforePlayer?.wallet?.chips<beforeItem.price;
      const result=data.kind==='nickname-reset'?await resetInappropriateNickname({actorId:session.id,targetName:data.data?.name,profiles:this.profiles,room:this.room}):this.room.command(session.id,data.kind,data.data);
      if(data.kind==='civilian'&&result.ok)this.broadcastRoster();
      try{await this.checkpoint();}catch{this.send(ws,{type:'ack',seq:data.seq,ok:false,message:'기록 저장이 지연되고 있어요. 잠시 후 다시 확인해 주세요.'});return;}
      if(result.ok&&['emote','press','repair','clean','pickup','place','throw','board','climb','ride','dismount','equip','unequip'].includes(data.kind))this.track(()=>this.activityMetrics.activity(session.id));
      if(result.ok&&['emote','ride','equip','unequip','purchase'].includes(data.kind))this.trackGrowth(()=>this.growthMetrics.activity(session.id,data.kind==='ride'?'board':data.kind==='emote'?'emote':'equip'));
      if(!result.ok&&insufficient)this.trackGrowth(()=>this.growthMetrics.purchaseRejected(session.id,beforeItem.id));
      this.updateGrowthPresence(true);
      if(result.ok&&['nickname-confirm','nickname-reset'].includes(data.kind)){this.broadcastRoster();for(const [peer,s] of this.sockets)this.send(peer,{type:'nickname',nickname:this.room.nicknameState(s.id)});}
      this.send(ws,{type:'ack',seq:data.seq,...result,wallet:this.room.wallet(session.id),titles:this.room.titleState(session.id),frame:this.room.snapshot(true)});
    }
  }
  close(ws){const s=this.sockets.get(ws);if(s){const ticket=this.connectionOrders.get(s.id);if(ticket)ticket.at=Date.now();this.room.remove(s.id);this.sockets.delete(ws);this.broadcastRoster();this.ctx.waitUntil(this.checkpoint());this.track(()=>this.activityMetrics.sync(this.room.players.keys()));this.updateGrowthPresence(true);}if(!this.sockets.size){if(this.timer){clearInterval(this.timer);this.timer=null;}this.ctx.waitUntil(this.flushMetrics(true));this.trackGrowth(()=>this.growthMetrics.flush(true));}}
  webSocketClose(ws,code,reason){
    // Hibernatable sockets may already have auto-replied. A peer that sends
    // an empty or abnormal close cannot have that synthetic code echoed.
    try{if(code===1005||code===1006||code===1015||!code)ws.close();else ws.close(code,reason);}catch{}
    this.close(ws);
  }
  webSocketError(ws){this.close(ws);}
}
