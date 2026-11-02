import { DurableObject } from 'cloudflare:workers';
import { createRoom } from './room-engine.js';
import { PROTOCOL, MAX_VISITORS } from '../src/shared-protocol.js';
import { ROOM_CAPACITY, AUTOMATED_COUNT } from '../src/room-population.js';
import {sessionToken,newSessionToken,sessionCookie,sessionId,createProfileStore} from './player-profiles.js';
import equipmentBootstrap from './equipment-bootstrap.json';

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/api/leaderboard'){
      if(request.method!=='GET')return new Response('Method not allowed',{status:405});
      return env.FAB_ROOM.getByName('FAB-A-v20').fetch(request);
    }
    if(url.pathname==='/api/config') {
      const headers={'Cache-Control':'no-store'};
      if(!sessionToken(request))headers['Set-Cookie']=sessionCookie(newSessionToken(),request.url);
      return Response.json({multiplayer:true,protocol:PROTOCOL,room:'FAB A',capacity:ROOM_CAPACITY,visitorCapacity:MAX_VISITORS,automatedCount:AUTOMATED_COUNT,ws:'/api/room',persistentProfile:true,persistentEquipment:true,uniqueNicknames:true},{headers});
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
      return env.FAB_ROOM.getByName('FAB-A-v20').fetch(request);
    }
    if(url.pathname.startsWith('/api/'))return new Response('Not found',{status:404});
    return env.ASSETS.fetch(request);
  }
};

export class FabRoom extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);this.sockets=new Map();this.profiles=createProfileStore(ctx.storage);this.rosterDirty=false;
    this.room=createRoom({claimName:(...args)=>this.profiles.claimName(...args),getHistoricalScores:()=>this.profiles.ranking(),onEquipmentChange:s=>this.profiles.saveEquipment(s),onProfileChange:p=>this.profiles.save(p),onRosterChange:()=>{this.rosterDirty=true;},onCatch:event=>{
      for(const [ws,s] of this.sockets)if(s.id===event.guardId)this.send(ws,{type:'safety-catch',...event});
    }});this.timer=null;this.tickCount=0;this.previous=Date.now();
    ctx.blockConcurrencyWhile(async()=>{
      const saved=await this.profiles.getEquipment();
      this.room.restoreEquipment(saved===undefined?(env.FAB_ENVIRONMENT==='production'?equipmentBootstrap:{version:1,broken:[]}):saved);
      if(saved===undefined)this.profiles.saveEquipment(this.room.equipmentState());
      await this.checkpoint();
      await this.profiles.loadRanking();
      for(const p of [...this.room.residents.people,...this.room.safety.people])p.name=this.profiles.claimName(p.id,p.role.startsWith('safety-')?'safety':'visitor',p.name);
      // Finish any legacy duplicate-name migration before exposing profiles or rankings.
      await this.checkpoint();
      for(const ws of ctx.getWebSockets()) {
        const id=ws.deserializeAttachment()?.id,saved=id?await this.profiles.get(id):null;
        if(id&&this.room.join(id,saved).ok){this.sockets.set(ws,{id,rate:0,at:Date.now()});this.welcome(ws,id);}
        else try{ws.close(1012,'다시 연결해 주세요');}catch{}
      }
      await this.checkpoint();if(this.sockets.size)this.start();
    });
  }
  send(ws,data){try{ws.send(typeof data==='string'?data:JSON.stringify(data));return true;}catch{return false;}}
  async checkpoint(){do{await this.profiles.flush();}while(this.profiles.hasPending);}
  welcome(ws,id){const p=this.room.players.get(id);this.send(ws,{type:'welcome',v:PROTOCOL,id,name:p.name,resume:p.hasEntered?p.groundPosition:null,roster:this.room.roster(),frame:this.room.snapshot(true)});}
  broadcastRoster(){const data=JSON.stringify({type:'roster',roster:this.room.roster(),count:this.room.players.size});for(const ws of this.sockets.keys())this.send(ws,data);}
  async fetch(request) {
    if(new URL(request.url).pathname==='/api/leaderboard')return Response.json({scope:'all-time',rows:this.room.ranking(),recordedVisitors:this.profiles.rankedVisitorCount,highestVisitorScore:this.profiles.ranking()[0]?.brokenCount??0},{headers:{'Cache-Control':'no-store'}});
    if(new URL(request.url).pathname==='/api/session/reset') {
      const id=await sessionId(sessionToken(request));
      if(id){
        for(const [ws,s] of this.sockets)if(s.id===id){ws.serializeAttachment({retired:true});this.send(ws,{type:'resetting'});this.sockets.delete(ws);try{ws.close(4002,'새로 시작하기');}catch{}}
        this.room.remove(id);await this.profiles.remove(id);this.broadcastRoster();
      }
      return Response.json({ok:true});
    }
    if(new URL(request.url).searchParams.get('v')!==String(PROTOCOL))return new Response('새로고침 후 다시 입장해 주세요',{status:409});
    const [client,server]=Object.values(new WebSocketPair());
    const incomingToken=sessionToken(request),token=incomingToken||newSessionToken();
    const id=await sessionId(token);
    const headers=incomingToken?undefined:{'Set-Cookie':sessionCookie(token,request.url)};
    const saved=this.room.profile(id)||await this.profiles.get(id);
    for(const [ws,s] of this.sockets)if(s.id===id){ws.serializeAttachment({retired:true});this.send(ws,{type:'replaced'});this.sockets.delete(ws);try{ws.close(4001,'다른 탭에서 이어서 접속했습니다');}catch{}}
    if(this.room.players.has(id))this.room.remove(id);
    const joined=this.room.join(id,saved);
    this.ctx.acceptWebSocket(server);
    if(!joined.ok){this.send(server,{type:'full',message:joined.message});server.close(1008,'Room full');return new Response(null,{status:101,headers,webSocket:client});}
    server.serializeAttachment({id});this.sockets.set(server,{id,rate:0,at:Date.now()});await this.checkpoint();this.welcome(server,id);this.broadcastRoster();this.start();
    return new Response(null,{status:101,headers,webSocket:client});
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
      for(const [ws,s] of this.sockets)if(!this.room.players.has(s.id)){try{ws.close(1001,'Idle connection');}catch{}this.sockets.delete(ws);changed=true;}
      // Persist damage and matching human scores in the same storage.put batch
      // before telling any client that a tool broke or finished being repaired.
      await this.checkpoint();
      if(changed||this.rosterDirty){this.rosterDirty=false;this.broadcastRoster();}
      if(++this.tickCount%4===0){const data=JSON.stringify(this.room.snapshot());for(const [ws,s] of this.sockets)if(!this.send(ws,data)){this.room.remove(s.id);this.sockets.delete(ws);}}
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
      const result=this.room.command(session.id,data.kind,data.data);
      if(data.kind==='civilian'&&result.ok)this.broadcastRoster();
      try{await this.checkpoint();}catch{this.send(ws,{type:'ack',seq:data.seq,ok:false,message:'기록 저장이 지연되고 있어요. 잠시 후 다시 확인해 주세요.'});return;}
      this.send(ws,{type:'ack',seq:data.seq,...result,frame:this.room.snapshot(true)});
    }
  }
  close(ws){const s=this.sockets.get(ws);if(s){this.room.remove(s.id);this.sockets.delete(ws);this.broadcastRoster();this.ctx.waitUntil(this.checkpoint());}if(!this.sockets.size&&this.timer){clearInterval(this.timer);this.timer=null;}}
  webSocketClose(ws){this.close(ws);}
  webSocketError(ws){this.close(ws);}
}
