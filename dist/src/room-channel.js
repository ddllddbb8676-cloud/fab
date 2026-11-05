import {PROTOCOL} from './shared-protocol.js?v=7b8510f06761';
import {HttpRoomSocket} from './http-room-socket.js?v=7b8510f06761';

const attempts=new WeakMap(),preferHttp=new WeakSet(),preferenceKey='fab-https-room-until-v1';
export const SWITCH_AFTER_MS=2200;
export const SILENT_AFTER_MS=6000;
export function roomSocketURL(config,base=location.href,order=null){
  const url=new URL(config.ws,base);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('v',String(PROTOCOL));
  if(order!==null)url.searchParams.set('o',String(order));return url;
}
function nextOrder(config){
  const attempt=Math.min(999,(attempts.get(config)||0)+1);attempts.set(config,attempt);return config.serverTime*1000+attempt;
}
function rememberedHttp(){try{return Number(sessionStorage.getItem(preferenceKey))>Date.now();}catch{return false;}}
function rememberHttp(value){try{if(value)sessionStorage.setItem(preferenceKey,String(Date.now()+600000));else sessionStorage.removeItem(preferenceKey);}catch{}}

// The game consumes one ordered message stream. Change transport only before
// a welcome; after a live stream fails, the normal reconnect path clears
// pending player actions and requests an authoritative fresh snapshot.
export function createRoomChannel(config,base=location.href,{
  Socket=globalThis.WebSocket,Http=HttpRoomSocket,schedule=setTimeout,cancel=clearTimeout,now=()=>performance.now(),
  hidden=()=>Boolean(globalThis.document?.hidden),defer=queueMicrotask
}={}){
  if(!Number.isSafeInteger(config.serverTime)||config.serverTime<=0)return new Socket(roomSocketURL(config,base));
  const channel=new EventTarget();
  let socket=null,kind=null,timer=null,finished=false,accepted=false,terminal=false,lastData=now();
  const stopTimer=()=>{cancel(timer);timer=null;};
  const retire=()=>{const old=socket;socket=null;stopTimer();try{old?.close();}catch{}};
  const end=code=>{if(finished)return;finished=true;retire();channel.dispatchEvent(Object.assign(new Event('close'),{code}));};
  const watch=()=>{
    if(finished||kind!=='websocket'||terminal)return;
    const remaining=SILENT_AFTER_MS-(now()-lastData);
    if(!hidden()&&remaining<=0){preferHttp.add(config);end(1006);return;}
    timer=schedule(watch,hidden()?SILENT_AFTER_MS:Math.max(1,remaining));
  };
  function start(type){
    if(finished)return;
    retire();kind=type;
    if(type==='https')preferHttp.add(config);
    const order=nextOrder(config);
    let current;
    try{current=type==='https'?new Http(config,order):new Socket(roomSocketURL(config,base,order));}
    catch{if(type==='websocket')defer(()=>start('https'));else{preferHttp.delete(config);rememberHttp(false);defer(()=>end(1006));}return;}
    socket=current;
    if(type==='websocket')timer=schedule(()=>start('https'),SWITCH_AFTER_MS);
    current.addEventListener('message',event=>{
      if(socket!==current||finished)return;
      lastData=now();
      if(!accepted&&!terminal){
        let message;try{message=JSON.parse(event.data);}catch{return;}
        if(message.type==='welcome'&&message.v===PROTOCOL){
          accepted=true;stopTimer();
          if(type==='https'){preferHttp.add(config);rememberHttp(true);}else timer=schedule(watch,SILENT_AFTER_MS);
        }else if(['welcome','full','replaced','resetting'].includes(message.type)){terminal=true;stopTimer();}
      }
      channel.dispatchEvent(new MessageEvent('message',{data:event.data}));
    });
    const failed=code=>{
      if(socket!==current||finished)return;
      if(!accepted&&!terminal&&type==='websocket'&&![4001,4002,1008].includes(code)){start('https');return;}
      if(type==='https'&&!accepted){preferHttp.delete(config);rememberHttp(false);}
      if(type==='websocket'&&accepted&&code===1006)preferHttp.add(config);
      end(code);
    };
    current.addEventListener('close',e=>failed(e.code));
    current.addEventListener('error',()=>failed(1006));
  }
  Object.defineProperties(channel,{readyState:{get:()=>finished?3:(socket?.readyState??0)},transport:{get:()=>kind}});
  channel.close=()=>end(1000);
  channel.send=value=>socket.send(value);
  start(preferHttp.has(config)||rememberedHttp()?'https':'websocket');
  return channel;
}
