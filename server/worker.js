import { DurableObject } from 'cloudflare:workers';
import { createRoom } from './room-engine.js';
import { PROTOCOL, MAX_VISITORS } from '../src/shared-protocol.js';

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/api/config')return Response.json({multiplayer:true,protocol:PROTOCOL,room:'FAB A',capacity:MAX_VISITORS,ws:'/api/room'},{headers:{'Cache-Control':'no-store'}});
    if(url.pathname==='/api/room') {
      if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
      const origin=request.headers.get('Origin');
      if(origin!==url.origin)return new Response('Origin not allowed',{status:403});
      return env.FAB_ROOM.getByName('FAB-A-v18').fetch(request);
    }
    if(url.pathname.startsWith('/api/'))return new Response('Not found',{status:404});
    return env.ASSETS.fetch(request);
  }
};

export class FabRoom extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);this.room=createRoom();this.sockets=new Map();this.timer=null;this.tickCount=0;this.previous=Date.now();
    for(const ws of ctx.getWebSockets()) {
      const id=ws.deserializeAttachment()?.id;
      if(id&&this.room.join(id).ok){this.sockets.set(ws,{id,rate:0,at:Date.now()});this.welcome(ws,id);}
      else try{ws.close(1012,'다시 연결해 주세요');}catch{}
    }
    if(this.sockets.size)this.start();
  }
  send(ws,data){try{ws.send(typeof data==='string'?data:JSON.stringify(data));return true;}catch{return false;}}
  welcome(ws,id){const p=this.room.players.get(id);this.send(ws,{type:'welcome',v:PROTOCOL,id,name:p.name,roster:this.room.roster(),frame:this.room.snapshot(true)});}
  broadcastRoster(){const data=JSON.stringify({type:'roster',roster:this.room.roster(),count:this.room.players.size});for(const ws of this.sockets.keys())this.send(ws,data);}
  async fetch(request) {
    if(new URL(request.url).searchParams.get('v')!==String(PROTOCOL))return new Response('새로고침 후 다시 입장해 주세요',{status:409});
    const [client,server]=Object.values(new WebSocketPair());
    const id=crypto.randomUUID(),joined=this.room.join(id);
    this.ctx.acceptWebSocket(server);
    if(!joined.ok){this.send(server,{type:'full',message:joined.message});server.close(1008,'Room full');return new Response(null,{status:101,webSocket:client});}
    server.serializeAttachment({id});this.sockets.set(server,{id,rate:0,at:Date.now()});this.welcome(server,id);this.broadcastRoster();this.start();
    return new Response(null,{status:101,webSocket:client});
  }
  start() {
    if(this.timer)return;this.previous=Date.now();
    this.timer=setInterval(()=>{
      const now=Date.now(),dt=Math.min(.1,(now-this.previous)/1000);this.previous=now;this.room.step(dt);
      let changed=false;
      for(const [ws,s] of this.sockets)if(!this.room.players.has(s.id)){try{ws.close(1001,'Idle connection');}catch{}this.sockets.delete(ws);changed=true;}
      if(changed)this.broadcastRoster();
      if(++this.tickCount%4===0){const data=JSON.stringify(this.room.snapshot());for(const [ws,s] of this.sockets)if(!this.send(ws,data)){this.room.remove(s.id);this.sockets.delete(ws);}}
      if(!this.sockets.size){clearInterval(this.timer);this.timer=null;}
    },50);
  }
  webSocketMessage(ws,message) {
    const session=this.sockets.get(ws);if(!session)return;
    const now=Date.now();if(now-session.at>=1000){session.rate=0;session.at=now;}
    if(typeof message!=='string'||message.length>2048||++session.rate>24){try{ws.close(1008,'Message limit');}catch{}this.close(ws);return;}
    let data;try{data=JSON.parse(message);}catch{return;}
    if(!data||typeof data!=='object'||Array.isArray(data))return;
    if(data.type==='pose'){this.room.pose(session.id,data.pose);return;}
    if(data.type==='command'&&Number.isSafeInteger(data.seq)&&typeof data.kind==='string') {
      if(data.pose)this.room.pose(session.id,data.pose);
      const result=this.room.command(session.id,data.kind,data.data);
      this.send(ws,{type:'ack',seq:data.seq,...result,frame:this.room.snapshot(true)});
    }
  }
  close(ws){const s=this.sockets.get(ws);if(s){this.room.remove(s.id);this.sockets.delete(ws);this.broadcastRoster();}if(!this.sockets.size&&this.timer){clearInterval(this.timer);this.timer=null;}}
  webSocketClose(ws){this.close(ws);}
  webSocketError(ws){this.close(ws);}
}
