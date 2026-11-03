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

const PRIVATE_HEADERS = {'Cache-Control':'private, no-store','Vary':'Cookie'};
const httpResult = (status, data = {}) => Response.json(data,{status,headers:PRIVATE_HEADERS});

export default {
  async fetch(request,env) {
    const redirect=canonicalRedirect(request);if(redirect)return redirect;
    const url=new URL(request.url);
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
    super(ctx,env);this.sockets=new Map();this.profiles=createProfileStore(ctx.storage,{ownerId:env.FAB_OWNER_VISITOR_ID});this.rosterDirty=false;
    this.httpPeers=new Map();this.connectionOrders=new Map();
    this.room=createRoom({ownerId:env.FAB_OWNER_VISITOR_ID,nicknameAvailable:(...args)=>this.profiles.nicknameAvailable(...args),replaceNickname:(...args)=>this.profiles.replaceNickname(...args),claimName:(...args)=>this.profiles.claimName(...args),getHistoricalScores:()=>this.profiles.ranking(),onEquipmentChange:s=>this.profiles.saveEquipment(s),onFoupChange:s=>this.profiles.saveFoups(s),onProfileChange:p=>this.profiles.save(p),onRosterChange:()=>{this.rosterDirty=true;},onCatch:event=>{
      for(const [ws,s] of this.sockets)if(s.id===event.guardId)this.send(ws,{type:'safety-catch',...event});
    }});this.timer=null;this.tickCount=0;this.previous=Date.now();
    ctx.blockConcurrencyWhile(async()=>{
      const saved=await this.profiles.getEquipment();
      this.room.restoreEquipment(saved===undefined?(env.FAB_ENVIRONMENT==='production'?equipmentBootstrap:{version:1,broken:[]}):saved);
      if(saved===undefined)this.profiles.saveEquipment(this.room.equipmentState());
      const foups=await this.profiles.getFoups();
      if(foups!==undefined)this.room.restoreFoups(foups);else this.profiles.saveFoups(this.room.store.checkpoint());
      await this.checkpoint();
      await this.profiles.loadRanking();
      for(const p of [...this.room.residents.people,...this.room.safety.people])p.name=this.profiles.claimName(p.id,p.role.startsWith('safety-')?'safety':'visitor',p.name);
      // Finish any legacy duplicate-name migration before exposing profiles or rankings.
      await this.checkpoint();
      for(const ws of ctx.getWebSockets()) {
        const {id,order}=ws.deserializeAttachment()||{},saved=id?await this.profiles.get(id):null;
        if(id&&this.room.join(id,saved).ok){this.sockets.set(ws,{id,rate:0,at:Date.now()});this.connectionOrders.set(id,{order:order??0,at:Date.now()});this.welcome(ws,id);}
        else try{ws.close(1012,'다시 연결해 주세요');}catch{}
      }
      await this.checkpoint();if(this.sockets.size)this.start();
    });
  }
  send(ws,data){try{ws.send(typeof data==='string'?data:JSON.stringify(data));return true;}catch{return false;}}
  async checkpoint(){do{await this.profiles.flush();}while(this.profiles.hasPending);}
  welcome(ws,id){const p=this.room.players.get(id);this.send(ws,{type:'welcome',v:PROTOCOL,id,name:p.name,privileges:{unlimitedChips:Boolean(p.chipUnlimited)},wallet:this.room.wallet(id),nickname:this.room.nicknameState(id),titles:this.room.titleState(id),resume:p.hasEntered?p.groundPosition:null,roster:this.room.roster(),frame:this.room.snapshot(true)});}
  sendWallets(){for(const [ws,s] of this.sockets){const player=this.room.players.get(s.id);if(s.ready!==false&&player&&s.walletRevision!==player.wallet.revision){const wallet=this.room.wallet(s.id);this.send(ws,{type:'wallet',wallet});s.walletRevision=wallet.revision;}}}
  broadcastRoster(){const data=JSON.stringify({type:'roster',roster:this.room.roster(),count:this.room.players.size});for(const [ws,s] of this.sockets)if(s.ready!==false)this.send(ws,data);}
  async fetch(request) {
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
      if(!this.sockets.size){clearInterval(this.timer);this.timer=null;}
    }finally{this.ticking=false;}
  }
  async webSocketMessage(ws,message) {
    const session=this.sockets.get(ws);if(!session)return;
    const now=Date.now();if(now-session.at>=1000){session.rate=0;session.at=now;}
    if(typeof message!=='string'||message.length>2048||++session.rate>24){try{ws.close(1008,'Message limit');}catch{}this.close(ws);return;}
    let data;try{data=JSON.parse(message);}catch{return;}
    if(!data||typeof data!=='object'||Array.isArray(data))return;
    if(data.type==='pose'){this.room.pose(session.id,data.pose);return;}
    if(data.type==='command'&&Number.isSafeInteger(data.seq)&&typeof data.kind==='string') {
      if(data.pose)this.room.pose(session.id,data.pose);
      const result=data.kind==='nickname-reset'?await resetInappropriateNickname({actorId:session.id,targetName:data.data?.name,profiles:this.profiles,room:this.room}):this.room.command(session.id,data.kind,data.data);
      if(data.kind==='civilian'&&result.ok)this.broadcastRoster();
      try{await this.checkpoint();}catch{this.send(ws,{type:'ack',seq:data.seq,ok:false,message:'기록 저장이 지연되고 있어요. 잠시 후 다시 확인해 주세요.'});return;}
      if(result.ok&&['nickname-confirm','nickname-reset'].includes(data.kind)){this.broadcastRoster();for(const [peer,s] of this.sockets)this.send(peer,{type:'nickname',nickname:this.room.nicknameState(s.id)});}
      this.send(ws,{type:'ack',seq:data.seq,...result,wallet:this.room.wallet(session.id),titles:this.room.titleState(session.id),frame:this.room.snapshot(true)});
    }
  }
  close(ws){const s=this.sockets.get(ws);if(s){const ticket=this.connectionOrders.get(s.id);if(ticket)ticket.at=Date.now();this.room.remove(s.id);this.sockets.delete(ws);this.broadcastRoster();this.ctx.waitUntil(this.checkpoint());}if(!this.sockets.size&&this.timer){clearInterval(this.timer);this.timer=null;}}
  webSocketClose(ws,code,reason){
    // Hibernatable sockets may already have auto-replied. A peer that sends
    // an empty or abnormal close cannot have that synthetic code echoed.
    try{if(code===1005||code===1006||code===1015||!code)ws.close();else ws.close(code,reason);}catch{}
    this.close(ws);
  }
  webSocketError(ws){this.close(ws);}
}
