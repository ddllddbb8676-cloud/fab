// Small, same-origin, cookie-associated observations. Gameplay remains server-authoritative.
const KINDS=new Set(['page_start','scene_ready','connected','reconnect','connect_error','page_end','shop_open','try_on','client_error']);
const PAGE=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const TELEMETRY_LIMIT=8192;
export function telemetryAccess(request,hasSession){
  if(request.method!=='POST')return 405;
  if(request.headers.get('Origin')!==new URL(request.url).origin)return 403;
  if(!hasSession)return 401;
  if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return 415;
  const length=Number(request.headers.get('Content-Length'));
  if(!Number.isFinite(length)||length<0||length>TELEMETRY_LIMIT)return 413;
  return null;
}
export function telemetryPlatform(ua=''){
  const ios=/iPhone|iPad|iPod/i.test(ua),android=/Android/i.test(ua);
  if(/Instagram/i.test(ua))return ios?'ios-instagram':android?'android-instagram':'instagram';
  if(ios)return /CriOS/i.test(ua)?'ios-chrome':/Safari/i.test(ua)?'ios-safari':'ios-other';
  if(android)return /Chrome/i.test(ua)?'android-chrome':'android-other';
  return /Windows|Macintosh|Linux/i.test(ua)?'desktop':'other';
}
export function telemetryEvents(value,platform='other'){
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length!==1||!Array.isArray(value.events)||!value.events.length||value.events.length>12)return null;
  const events=[];
  for(const event of value.events){
    if(!event||Array.isArray(event)||typeof event!=='object'||Object.keys(event).some(k=>!['id','pageId','kind','elapsedMs','itemId','source','build'].includes(k)))return null;
    if(!PAGE.test(event.pageId||'')||typeof event.id!=='string'||!event.id.startsWith(event.pageId+':')||!/^\d{1,12}$/.test(event.id.slice(37))||Number(event.id.slice(37))<1||!KINDS.has(event.kind))return null;
    if(!Number.isFinite(event.elapsedMs)||event.elapsedMs<0||event.elapsedMs>86400000)return null;
    if(!/^[a-z0-9_-]{1,48}$/.test(event.source||'')||!(/^[a-f0-9]{12,64}$/.test(event.build||'')||event.build==='unknown'))return null;
    if(event.itemId!==undefined&&(event.kind!=='try_on'||typeof event.itemId!=='string'||!/^[a-z0-9-]{1,64}$/.test(event.itemId)))return null;
    if(event.kind==='try_on'&&!event.itemId)return null;
    events.push({...event,platform});
  }
  return events;
}
export async function readTelemetry(request){
  const reader=request.body?.getReader();if(!reader)return {status:400};
  let ended=false,bytes=0,timer,text='';
  const decoder=new TextDecoder('utf-8',{fatal:true}),deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('deadline')),3000);});
  try{
    for(;;){const {done,value}=await Promise.race([reader.read(),deadline]);if(done){ended=true;break;}bytes+=value.byteLength;if(bytes>TELEMETRY_LIMIT)return {status:413};text+=decoder.decode(value,{stream:true});}
    const events=telemetryEvents(JSON.parse(text+decoder.decode()),telemetryPlatform(request.headers.get('User-Agent')||''));
    return events?{events}:{status:400};
  }catch(error){return {status:error.message==='deadline'?408:400};}
  finally{clearTimeout(timer);if(!ended)void reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function createTelemetryLimiter({now=Date.now,capacity=1024,batchesPerMinute=12}={}){
  const records=new Map();
  return id=>{
    const time=now();let record=records.get(id);
    if(!record||time-record.at>=60000){
      if(!record&&records.size>=capacity){for(const [key,row] of records)if(time-row.at>=60000)records.delete(key);if(records.size>=capacity)return false;}
      record={at:time,count:0};records.set(id,record);
    }
    return ++record.count<=batchesPerMinute;
  };
}
