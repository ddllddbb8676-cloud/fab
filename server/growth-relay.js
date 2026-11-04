// Game code only enqueues small observations. All analytics storage and queries
// live in another Durable Object; no game request awaits delivery.
const profile=p=>({id:p.id,brokenCount:p.brokenCount,repairedCount:p.repairedCount,wallet:p.wallet?{chips:p.wallet.chips,earnedChips:p.wallet.earnedChips,nicknamePurchases:p.wallet.nicknamePurchases,owned:p.wallet.owned?.slice(0,96)}:undefined});
export function createGrowthRelay({binding,waitUntil=()=>{},now=Date.now,ownerId='',excludedIds=[],timeoutMs=2000}={}){
  const excluded=new Set([ownerId,...excludedIds]),connected=new Set(),moves=new Map();
  let queue=[],bytes=0,lastSent=now(),inFlight=false,dropped=0,drainAfterFlight=false;
  const allowed=id=>/^visitor:[a-f0-9]{64}$/.test(id||'')&&!excluded.has(id);
  function add(method,args){
    if(!binding)return;
    const event={at:now(),method,args},size=JSON.stringify(event).length;
    if(queue.length>=512||bytes+size>110000){dropped++;return;}
    queue.push(event);bytes+=size;
  }
  function flush(force=false){
    if(inFlight){if(force)drainAfterFlight=true;return;}
    if(!binding||(!queue.length&&!dropped)||(!force&&now()-lastSent<5000))return;
    const events=queue;queue=[];bytes=0;const lost=dropped;dropped=0;lastSent=now();inFlight=true;
    // Retry once with the same batch ID. The receiver checkpoints batch IDs
    // with aggregate writes so a lost response cannot duplicate observations.
    const body=JSON.stringify({id:crypto.randomUUID(),events,dropped:lost}),controller=new AbortController();
    let timer;
    const work=(async()=>{
      try{
        for(let attempt=0;attempt<2;attempt++){
          const response=await Promise.race([
            binding.getByName('FAB-ANALYTICS-v1').fetch(new Request('https://fab-analytics.internal/ingest',{method:'POST',headers:{'Content-Type':'application/json'},body,signal:controller.signal})),
            new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Analytics timeout'));},timeoutMs);})
          ]).finally(()=>clearTimeout(timer));
          if(response.ok)return;
          if(response.status>=400&&response.status<500)break;
        }
        dropped+=events.length+lost;
      }catch{dropped+=events.length+lost;}
      finally{clearTimeout(timer);inFlight=false;if(drainAfterFlight){drainAfterFlight=false;if(queue.length)flush(true);}}
    })();
    try{waitUntil(work);}catch{void work.catch(()=>{});}
  }
  return {
    connect(id,options={}){if(!allowed(id))return;connected.add(id);if(options.profile)add('observeProfile',[profile(options.profile)]);const {existing=true,transport='websocket'}=options;add('connect',[id,{existing,transport}]);},
    observeProfile(p){if(allowed(p?.id)&&connected.has(p.id))add('observeProfile',[profile(p)]);},
    activity(id,kind){if(!allowed(id)||!connected.has(id))return;const t=now();if(kind==='move'&&moves.has(id)&&t-moves.get(id)<1000)return;if(kind==='move')moves.set(id,t);add('activity',[id,kind]);},
    reward(id,kind,amount){if(allowed(id)&&connected.has(id))add('reward',[id,kind,amount]);},
    purchaseRejected(id,itemId){if(allowed(id)&&connected.has(id))add('purchaseRejected',[id,itemId]);},
    presence(people){const rows=people.filter(p=>allowed(p.id));if(!rows.length&&!connected.size)return;add('presence',[rows]);const ids=new Set(rows.map(p=>p.id));for(const id of connected)if(!ids.has(id)){connected.delete(id);moves.delete(id);}},
    forget(id){connected.delete(id);moves.delete(id);if(allowed(id))add('forget',[id]);},
    flush,
  };
}
