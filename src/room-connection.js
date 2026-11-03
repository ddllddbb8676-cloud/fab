import {PROTOCOL} from './shared-protocol.js';
export const WELCOME_TIMEOUT_MS=8000;
export function roomSocketURL(config,base=location.href){
  const url=new URL(config.ws,base);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('v',String(PROTOCOL));return url;
}

// Start the same cookie-authenticated room connection during module download.
// Until the scene is ready, keep ordered messages in memory, with strict limits.
// If loading fails or takes too long, release the connection and let the normal
// client open a fresh socket/full snapshot. No credentials or profiles are saved.
export function prepareRoomConnection(config,{Socket=globalThis.WebSocket,base=location.href,
  schedule=setTimeout,cancel=clearTimeout,enqueue=queueMicrotask,now=()=>performance.now()}={}){
  if(!config)return null;
  let socket;try{socket=new Socket(roomSocketURL(config,base));}catch{return null;}
  const started=now(),listeners=new Map();let queue=[],bytes=0,used=false,active=false,expired=false,receivedWelcome=false;
  function expire(){if(active||expired)return;expired=true;queue=[];bytes=0;cancel(timer);cancel(welcomeTimer);try{socket.close();}catch{}}
  const timer=schedule(expire,20000),welcomeTimer=schedule(()=>{if(!receivedWelcome)expire();},WELCOME_TIMEOUT_MS);
  function emit(type,event){for(const listener of listeners.get(type)||[])try{listener(event);}catch(error){schedule(()=>{throw error;},0);}}
  for(const type of ['message','close','error'])socket.addEventListener(type,event=>{
    if(expired)return;
    if(active){emit(type,event);return;}
    if(type==='message'){
      try{if(JSON.parse(event.data).type==='welcome'){receivedWelcome=true;cancel(welcomeTimer);}}catch{}
      bytes+=typeof event.data==='string'?event.data.length*2:0;
    }
    if(queue.length>=64||bytes>2*1024*1024){expire();return;}
    queue.push({type,event});
  });
  const proxy={
    get readyState(){return socket.readyState;},
    get welcomeTimeout(){return receivedWelcome?WELCOME_TIMEOUT_MS:Math.max(250,WELCOME_TIMEOUT_MS-(now()-started));},
    addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},
    send(data){socket.send(data);},close(){socket.close();},
    activate(){enqueue(()=>{
      if(active||expired)return;active=true;cancel(timer);cancel(welcomeTimer);
      const waiting=queue;queue=[];bytes=0;for(const {type,event} of waiting)emit(type,event);
    });}
  };
  return {take(){if(used||expired)return null;used=true;return proxy;},dispose:expire};
}
