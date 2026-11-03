import { PROTOCOL } from './shared-protocol.js';
import {WELCOME_TIMEOUT_MS} from './room-connection.js';
import {createRoomChannel} from './room-channel.js';
export {multiplayerConfiguration} from './room-config.js';
export {WELCOME_TIMEOUT_MS} from './room-connection.js';

export function createMultiplayer({config,prepared=null,getPose,onWelcome,onFrame,onRoster,onStatus,onError,onCatch,onWallet,onNickname,onTitles}) {
  let socket=null,status='connecting',id=null,seq=0,retry=0,closed=false,suspended=false,lastPose='',lastSent=0,connection=0,retryTimer=null,handshakeTimer=null;
  const pending=new Map();
  function setStatus(s){status=s;onStatus?.(s);}
  function send(data){if(socket?.readyState!==1)return false;socket.send(JSON.stringify(data));return true;}
  function clearPending(){for(const entry of pending.values()){clearTimeout(entry.timeout);entry.resolve({ok:false,message:'연결을 다시 확인해 주세요'});}pending.clear();}
  function clearHandshake(){clearTimeout(handshakeTimer);handshakeTimer=null;}
  function reconnect(delay){clearTimeout(retryTimer);retryTimer=setTimeout(connect,delay??Math.min(12000,1000*2**retry++)+Math.random()*500);}
  function retireSocket(){++connection;clearHandshake();clearTimeout(retryTimer);clearPending();const previous=socket;socket=null;try{previous?.close();}catch{}}
  function connect() {
    if(closed||suspended)return;clearTimeout(retryTimer);clearHandshake();const generation=++connection;
    setStatus('connecting');
    try{socket=prepared?.take()||createRoomChannel(config);prepared=null;}catch{setStatus('reconnecting');reconnect();return;}
    const openingSocket=socket;
    handshakeTimer=setTimeout(()=>{
      if(closed||generation!==connection||status==='connected')return;
      // Some in-app browsers leave a socket CONNECTING forever without close.
      // Retire it before closing so late events cannot overwrite the new session.
      ++connection;clearHandshake();clearPending();socket=null;
      setStatus('reconnecting');onError?.('팹 연결이 늦어져 다시 연결하고 있어요. 기록은 그대로예요.');
      try{openingSocket.close();}catch{}
      reconnect(250);
    },openingSocket.welcomeTimeout??WELCOME_TIMEOUT_MS);
    socket.addEventListener('message',event=>{
      if(generation!==connection)return;
      let data;try{data=JSON.parse(event.data);}catch{return;}
      if(data.type==='welcome') {
        if(data.v!==PROTOCOL){clearHandshake();setStatus('version');onError?.('새 버전이 있어요. 새로고침하면 기존 기록으로 연결돼요.');socket.close();return;}
        id=data.id;retry=0;onWelcome?.(data);if(data.wallet)onWallet?.(data.wallet);if(data.titles)onTitles?.(data.titles);onRoster?.(data.roster);onFrame?.(data.frame,true);clearHandshake();setStatus('connected');sendPose(true);
      } else if(data.type==='wallet')onWallet?.(data.wallet);
      else if(data.type==='nickname')onNickname?.(data.nickname);
      else if(data.type==='frame')onFrame?.(data,false);
      else if(data.type==='replaced'){clearHandshake();setStatus('replaced');onError?.('다른 탭에서 이어서 접속했어요. 이 탭은 쉬고 있어요.');socket.close();}
      else if(data.type==='resetting'){clearHandshake();setStatus('resetting');socket.close();}
      else if(data.type==='safety-catch'&&data.guardId===id)onCatch?.(data);
      else if(data.type==='roster')onRoster?.(data.roster);
      else if(data.type==='ack') {
        if(data.wallet)onWallet?.(data.wallet);
        if(data.nickname)onNickname?.(data.nickname);
        if(data.titles)onTitles?.(data.titles);
        if(data.frame)onFrame?.(data.frame,false);
        const entry=pending.get(data.seq);if(entry){clearTimeout(entry.timeout);pending.delete(data.seq);entry.resolve(data);}
        if(!data.ok)onError?.(data.message??'잠시 후 다시 시도해 주세요');
      } else if(data.type==='full'){clearHandshake();setStatus('full');onError?.(data.message);}
    });
    socket.addEventListener('close',event=>{
      if(generation!==connection||closed)return;clearHandshake();clearPending();
      if(status==='replaced'||status==='resetting')return;
      if(event.code===4001){setStatus('replaced');onError?.('다른 탭에서 이어서 접속했어요. 이 탭은 쉬고 있어요.');return;}
      if(event.code===4002){setStatus('resetting');return;}
      const wasFull=status==='full';if(status!=='version'&&!wasFull)setStatus('reconnecting');
      if(status!=='version')reconnect(wasFull?15000:undefined);
    });
    socket.addEventListener('error',()=>{
      if(generation!==connection||closed||status==='connected'||['full','version','replaced','resetting'].includes(status))return;
      retireSocket();setStatus('reconnecting');reconnect(Math.min(12000,250*2**retry++));
    });
    socket.activate?.();
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
  const hide=()=>{if(closed||['version','replaced','resetting'].includes(status))return;suspended=true;retireSocket();setStatus('suspended');};
  const show=()=>{if(!suspended||closed)return;suspended=false;connect();};
  globalThis.window?.addEventListener('pagehide',hide);globalThis.window?.addEventListener('pageshow',show);
  return {command,sendPose,update:sendPose,get id(){return id;},get connected(){return status==='connected';},get status(){return status;},get transport(){return socket?.transport??'websocket';},
    async resetProfile(){const r=await fetch('/api/session/reset',{method:'POST',credentials:'same-origin'});if(!r.ok)throw new Error('초기화하지 못했어요. 잠시 후 다시 눌러주세요.');this.dispose();},
    dispose(){closed=true;clearInterval(heartbeat);document.removeEventListener('visibilitychange',visible);globalThis.window?.removeEventListener('pagehide',hide);globalThis.window?.removeEventListener('pageshow',show);prepared?.dispose();retireSocket();}};
}
