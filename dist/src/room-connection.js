import {createRoomChannel,roomSocketURL} from './room-channel.js?v=3b5478afa86e';
export {roomSocketURL} from './room-channel.js?v=3b5478afa86e';
export const WELCOME_TIMEOUT_MS=8000;

// Start the same cookie-authenticated room connection before 3D construction.
// Until the scene is ready, keep ordered messages in memory, with strict limits.
// If loading fails or takes too long, release the connection and let the normal
// client open a fresh socket/full snapshot. No credentials or profiles are saved.
export function prepareRoomConnection(config,{Socket,base=location.href,
  schedule=setTimeout,cancel=clearTimeout,enqueue=queueMicrotask,now=()=>performance.now(),lifecycle=globalThis.window}={}){
  if(!config)return null;
  let socket;try{socket=Socket?new Socket(roomSocketURL(config,base)):createRoomChannel(config,base);}catch{return null;}
  const started=now(),listeners=new Map();let queue=[],bytes=0,used=false,active=false,expired=false,receivedWelcome=false;
  function expire(){if(active||expired)return;expired=true;queue=[];bytes=0;cancel(timer);cancel(welcomeTimer);lifecycle?.removeEventListener('pagehide',expire);try{socket.close();}catch{}}
  const timer=schedule(expire,20000),welcomeTimer=schedule(()=>{if(!receivedWelcome)expire();},WELCOME_TIMEOUT_MS);
  lifecycle?.addEventListener('pagehide',expire);
  function emit(type,event){for(const listener of listeners.get(type)||[])try{listener(event);}catch(error){schedule(()=>{throw error;},0);}}
  for(const type of ['message','close','error'])socket.addEventListener(type,event=>{
    if(expired)return;
    if(active){emit(type,event);return;}
    if(type==='error'&&!receivedWelcome){expire();return;}
    let data=null;
    if(type==='message'){
      try{data=JSON.parse(event.data);if(data.type==='welcome'){receivedWelcome=true;cancel(welcomeTimer);}}catch{}
      const previous=queue.at(-1);
      if(data?.type==='frame'&&previous?.data?.type==='frame'){
        // Keep the latest world frame plus every FOUP delta, instead of filling
        // the queue with old movement while a phone builds the scene.
        const foups=new Map([...(previous.data.foups||[]),...(data.foups||[])].map(row=>[row[0],row]));
        data={...previous.data,...data,foups:[...foups.values()],events:[]};
        bytes-=previous.event.data.length*2;queue.pop();event={data:JSON.stringify(data)};
      }
      bytes+=typeof event.data==='string'?event.data.length*2:0;
    }
    if(queue.length>=64||bytes>2*1024*1024){expire();return;}
    queue.push({type,event,data});
  });
  const proxy={
    get readyState(){return socket.readyState;},
    get transport(){return socket.transport??'websocket';},
    get welcomeTimeout(){return receivedWelcome?WELCOME_TIMEOUT_MS:Math.max(250,WELCOME_TIMEOUT_MS-(now()-started));},
    addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},
    send(data){socket.send(data);},close(){socket.close();},
    activate(){enqueue(()=>{
      if(active||expired)return;active=true;cancel(timer);cancel(welcomeTimer);lifecycle?.removeEventListener('pagehide',expire);
      const waiting=queue;queue=[];bytes=0;for(const {type,event} of waiting)emit(type,event);
    });}
  };
  return {take(){if(used||expired)return null;used=true;return proxy;},dispose:expire};
}
