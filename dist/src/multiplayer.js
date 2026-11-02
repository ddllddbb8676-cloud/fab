import { PROTOCOL } from './shared-protocol.js';

export async function multiplayerConfiguration() {
  try {const r=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(r.ok){const c=await r.json();if(c.multiplayer)return c;}}
  catch{}
  return location.hostname==='fab.semitoon.com'?{multiplayer:true,protocol:PROTOCOL,ws:'/api/room'}:null;
}
export function createMultiplayer({config,getPose,onWelcome,onFrame,onRoster,onStatus,onError,onCatch}) {
  let socket=null,status='connecting',id=null,seq=0,retry=0,closed=false,lastPose='',lastSent=0,connection=0,retryTimer=null;
  const pending=new Map();
  function setStatus(s){status=s;onStatus?.(s);}
  function send(data){if(socket?.readyState!==1)return false;socket.send(JSON.stringify(data));return true;}
  function clearPending(){for(const entry of pending.values()){clearTimeout(entry.timeout);entry.resolve({ok:false,message:'연결을 다시 확인해 주세요'});}pending.clear();}
  function connect() {
    if(closed)return;const generation=++connection;
    const url=new URL(config.ws,location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('v',String(PROTOCOL));
    setStatus('connecting');socket=new WebSocket(url);
    socket.addEventListener('message',event=>{
      if(generation!==connection)return;
      let data;try{data=JSON.parse(event.data);}catch{return;}
      if(data.type==='welcome') {
        if(data.v!==PROTOCOL){setStatus('version');socket.close();return;}
        id=data.id;retry=0;onWelcome?.(data);onRoster?.(data.roster);onFrame?.(data.frame,true);setStatus('connected');sendPose(true);
      } else if(data.type==='frame')onFrame?.(data,false);
      else if(data.type==='replaced'){setStatus('replaced');onError?.('다른 탭에서 이어서 접속했어요. 이 탭은 쉬고 있어요.');socket.close();}
      else if(data.type==='resetting'){setStatus('resetting');socket.close();}
      else if(data.type==='safety-catch'&&data.guardId===id)onCatch?.(data);
      else if(data.type==='roster')onRoster?.(data.roster);
      else if(data.type==='ack') {
        if(data.frame)onFrame?.(data.frame,false);
        const entry=pending.get(data.seq);if(entry){clearTimeout(entry.timeout);pending.delete(data.seq);entry.resolve(data);}
        if(!data.ok)onError?.(data.message??'잠시 후 다시 시도해 주세요');
      } else if(data.type==='full'){setStatus('full');onError?.(data.message);}
    });
    socket.addEventListener('close',event=>{
      if(generation!==connection||closed)return;clearPending();
      if(status==='replaced'||status==='resetting')return;
      if(event.code===4001){setStatus('replaced');onError?.('다른 탭에서 이어서 접속했어요. 이 탭은 쉬고 있어요.');return;}
      if(event.code===4002){setStatus('resetting');return;}
      const wasFull=status==='full';if(status!=='version'&&!wasFull)setStatus('reconnecting');
      if(status!=='version')retryTimer=setTimeout(connect,wasFull?15000:Math.min(12000,1000*2**retry++)+Math.random()*500);
    });
    socket.addEventListener('error',()=>{});
  }
  function sendPose(force=false){if(status!=='connected')return;const now=performance.now();if(!force&&now-lastSent<1000/6)return;
    const pose=getPose(),key=JSON.stringify(pose);if(!force&&key===lastPose&&now-lastSent<10000)return;
    if(send({type:'pose',pose})){lastPose=key;lastSent=now;}}
  function command(kind,data={}) {
    if(status!=='connected')return Promise.resolve({ok:false,message:'연결 중입니다. 잠시만 기다려 주세요'});
    const number=++seq;
    return new Promise(resolve=>{
      const timeout=setTimeout(()=>{pending.delete(number);resolve({ok:false,message:'응답이 늦어요. 다시 시도해 주세요'});},7000);
      pending.set(number,{resolve,timeout});send({type:'command',seq:number,kind,data,pose:getPose()});
    });
  }
  connect();
  const heartbeat=setInterval(()=>sendPose(),150);
  const visible=()=>sendPose(true);document.addEventListener('visibilitychange',visible);
  return {command,sendPose,update:sendPose,get id(){return id;},get connected(){return status==='connected';},get status(){return status;},
    async resetProfile(){const r=await fetch('/api/session/reset',{method:'POST',credentials:'same-origin'});if(!r.ok)throw new Error('초기화하지 못했어요. 잠시 후 다시 눌러주세요.');this.dispose();},
    dispose(){closed=true;clearInterval(heartbeat);clearTimeout(retryTimer);document.removeEventListener('visibilitychange',visible);clearPending();socket?.close();}};
}
