import {PROTOCOL} from './shared-protocol.js?v=4b21b3c206ef';

// A fallback for a browser that can reach the room over HTTPS but cannot
// sustain a WebSocket upgrade. The server still owns the session and wallet.
export class HttpRoomSocket extends EventTarget {
  constructor(config, order, {fetcher=globalThis.fetch.bind(globalThis), makeKey=()=>crypto.randomUUID(),
    schedule=setTimeout, cancel=clearTimeout, lifecycle=globalThis.window}={}) {
    super();
    if(!Number.isSafeInteger(order)||order<0)throw new TypeError('Invalid room attempt order');
    this.readyState=0;
    const url='/api/room-http?v='+PROTOCOL, key=makeKey();
    let closed=false, started=false, opened=false, welcomed=false, cursor=0, failures=0;
    let queued=[], batch=null, flight=null, timer=null;
    const post=(op, fields, options={})=>fetcher(url,{method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({op,key,order,...fields}),...options});
    const clearTimer=()=>{if(timer!==null)cancel(timer);timer=null;};
    const stop=(code, notifyServer)=>{
      if(closed)return;closed=true;this.readyState=3;clearTimer();flight?.abort();queued=[];batch=null;
      lifecycle?.removeEventListener('pagehide',this.close);
      // The random transport key is ephemeral. A late close must only retire
      // this transport, never another tab with the same identity cookie.
      if(started&&notifyServer)try{void post('close',{}, {keepalive:true}).catch(()=>{});}catch{}
      this.dispatchEvent(Object.assign(new Event('close'),{code,wasClean:code===1000}));
    };
    const later=(ms, replace=false)=>{
      if(closed||flight||(!replace&&timer!==null))return;
      clearTimer();timer=schedule(()=>{timer=null;void exchange();},ms);
    };
    this.send=raw=>{
      if(this.readyState!==1)throw new Error('Room connection is not open');
      const pose=JSON.parse(raw).type==='pose';
      // Preserve command ordering. A newer untransmitted pose supersedes only
      // the previous consecutive pose; an uncertain in-flight batch is frozen.
      if(pose&&queued.at(-1)?.pose)queued.pop();
      if(queued.length>=48){stop(1006,true);return;}
      queued.push({raw,pose});if(!pose&&!failures)later(0,true);
    };
    this.close=()=>stop(1000,true);
    lifecycle?.addEventListener('pagehide',this.close);
    const exchange=async()=>{
      if(closed||flight)return;
      const op=opened?'poll':'open', controller=new AbortController();flight=controller;started=true;
      const aborted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('Room request ended')),{once:true}));
      const deadline=schedule(()=>controller.abort(),4500);
      let delay=350;
      try {
        if(opened&&!batch)batch=queued.splice(0,8);
        const request=post(op,{cursor,messages:batch?.map(m=>m.raw)??[]},{signal:controller.signal})
          .then(async response=>({response,payload:response.ok?await response.json():null}));
        // Enforce the deadline even if the embedded browser is late delivering
        // its fetch rejection or the body stalls after headers have arrived.
        const {response,payload}=await Promise.race([request,aborted]);
        if(closed)return;
        if(response.status===409||response.status===410){stop(response.status===409?4001:1006,false);return;}
        if(!response.ok){if(response.status>=500||response.status===429||response.status===408)throw new Error('Retry room request');stop(1006,true);return;}
        const messages=payload?.messages;
        if(!Array.isArray(messages)||!messages.every(r=>Array.isArray(r)&&Number.isSafeInteger(r[0])&&r[0]>0&&typeof r[1]==='string')){stop(1006,true);return;}
        if(!opened){opened=true;this.readyState=1;this.dispatchEvent(new Event('open'));}
        failures=0;batch=null;
        for(const [next,raw] of messages){
          if(closed)return;if(next<=cursor)continue;cursor=next;
          let type;if(!welcomed){type=JSON.parse(raw).type;if(type==='welcome')welcomed=true;
            else if(!['full','replaced','resetting'].includes(type))continue;}
          this.dispatchEvent(new MessageEvent('message',{data:raw}));
          if(type==='full'){stop(1008,true);return;}
        }
        if(queued.some(m=>!m.pose))delay=0;
      } catch {
        if(closed)return;
        if(++failures>=3){stop(1006,true);return;}
        delay=250*2**(failures-1);
      } finally {
        cancel(deadline);flight=null;if(!closed)later(delay);
      }
    };
    later(0);
  }
}
