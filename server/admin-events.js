import {ADMIN_HEADERS,isAdmin} from './admin-access.js';
export const eventResponse=(status,data)=>Response.json(data,{status,headers:ADMIN_HEADERS});
export async function eventAccess(request,env){
  if(!await isAdmin(request,env))return eventResponse(403,{message:'운영자만 이벤트를 시작할 수 있어요.'});
  if(!['GET','POST'].includes(request.method))return eventResponse(405,{message:'지원하지 않는 요청이에요.'});
  if(request.method==='GET')return null;
  if(request.headers.get('Origin')!==new URL(request.url).origin)return eventResponse(403,{message:'FAB 관리자 페이지에서 시작해 주세요.'});
  if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return eventResponse(415,{message:'이벤트 요청 형식을 확인해 주세요.'});
  if(Number(request.headers.get('Content-Length'))>512)return eventResponse(413,{message:'요청이 너무 커요.'});
  return null;
}
export async function readEventRequest(request){
  const reader=request.body?.getReader();if(!reader)return null;
  let size=0,text='',timer,done=false;
  const decoder=new TextDecoder('utf-8',{fatal:true}),deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),3000);});
  try{
    for(;;){const result=await Promise.race([reader.read(),deadline]);if(result.done){done=true;break;}size+=result.value.byteLength;if(size>512)return null;text+=decoder.decode(result.value,{stream:true});}
    const value=JSON.parse(text+decoder.decode());
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['kind','requestId','bayCount'].includes(key)))return null;
    if(Object.hasOwn(value,'bayCount')&&(value.kind!=='bay'||![1,2].includes(value.bayCount)))return null;
    return ['bay','golden','contest'].includes(value.kind)&&typeof value.requestId==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.requestId)?value:null;
  }catch{return null;}
  finally{clearTimeout(timer);if(!done)void reader.cancel().catch(()=>{});reader.releaseLock();}
}
