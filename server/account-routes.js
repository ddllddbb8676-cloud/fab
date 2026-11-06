import {newSessionToken,sessionCookie,sessionToken,sessionId} from './player-profiles.js';
import {deviceCookie,effectiveProfileId,privateHeaders} from './account-sessions.js';
import {googleVerifier,validClientId} from './google-identity.js';
import {AccountError} from './google-accounts.js';
import {pendingFirstVisit,firstVisitCookie} from './entry-response.js';

const verify = googleVerifier();
const result = (status, data, headers) => Response.json(data,{status,headers:{...privateHeaders,...headers}});
const codeActions = new Set(['preview','link','restore','unlink','signin','register','recover-preview','recover-confirm']);
const handoffActions = new Set(['handoff-create','handoff-open','handoff-verify','handoff-approve','handoff-pickup']);
const actions = new Set(['status','start','verify','leave','character-code',...codeActions,...handoffActions]);
async function readJson(request) {
  const limit = 10000, reader = request.body?.getReader();
  if (!reader) throw new AccountError(400,'요청을 다시 열어 주세요.');
  let size = 0, body = '', done = false, timer;
  const decoder = new TextDecoder('utf-8',{fatal:true});
  const timeout = new Promise((_,reject) => { timer = setTimeout(()=>reject(new AccountError(408,'요청 시간이 지났어요. 다시 눌러 주세요.')),5000); });
  try {
    for (;;) {
      const part = await Promise.race([reader.read(),timeout]);
      if (part.done) { done=true; break; }
      size += part.value.byteLength;
      if (size > limit) throw new AccountError(413,'요청이 너무 커요.');
      body += decoder.decode(part.value,{stream:true});
    }
    const value = JSON.parse(body+decoder.decode());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('format');
    return value;
  } catch(error) {
    if (error instanceof AccountError) throw error;
    throw new AccountError(400,'요청 형식을 확인해 주세요.');
  } finally { clearTimeout(timer); if (!done) void reader.cancel().catch(()=>{}); reader.releaseLock(); }
}
export async function accountPage(request,env) {
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  for (const [key,value] of Object.entries(privateHeaders)) headers.set(key,value);
  headers.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');
  headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('X-Frame-Options','DENY');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' https://accounts.google.com/gsi/style 'unsafe-inline'; frame-src https://accounts.google.com/gsi/; connect-src 'self' https://accounts.google.com/gsi/; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if (response.ok && request.method === 'GET' && !sessionToken(request)) {
    headers.append('Set-Cookie',sessionCookie(newSessionToken(),request.url));
    headers.append('Set-Cookie',firstVisitCookie(request.url,true));
  }
  return new Response(response.body,{status:response.status,headers});
}
export async function googleRoute(request,env,verifyCredential=verify) {
  const url = new URL(request.url), action = url.pathname.slice('/api/account/google/'.length);
  if (!actions.has(action)) return result(404,{});
  if (request.method !== (action === 'status' ? 'GET' : 'POST')) return result(405,{});
  const enabled = validClientId(env.FAB_GOOGLE_CLIENT_ID);
  if (!enabled && action !== 'leave') return action === 'status' ? result(200,{enabled:false}) : result(503,{message:'구글 연결을 준비 중이에요.'});
  if (!sessionToken(request)) return result(401,{message:'게임을 연 브라우저에서 다시 시도해 주세요.'});
  if (action !== 'status' && request.headers.get('Origin') !== url.origin) return result(403,{});
  if (action !== 'status' && request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return result(415,{});
  try {
    const input = action === 'status' ? {} : await readJson(request);
    let safe = {};
    if (action === 'verify' || action === 'handoff-verify') {
      try { safe = await verifyCredential(input.credential,env.FAB_GOOGLE_CLIENT_ID); }
      catch { return result(401,{message:'구글 인증을 확인하지 못했어요. 다시 로그인해 주세요.'}); }
      if(action==='handoff-verify')safe.key=input.key;
    } else if(handoffActions.has(action)){
      safe={key:input.key,receipt:input.receipt,mode:input.mode,characterCode:input.characterCode};
    } else if (codeActions.has(action)) safe = {code:input.code,characterCode:input.characterCode};
    // The caller cannot supply verified claims, internal paths or the identity header.
    const withBody = action === 'verify' || codeActions.has(action) || handoffActions.has(action);
    const rpc = new Request(new URL('/_fab/account/'+action,request.url),{method:'POST',headers:{Cookie:request.headers.get('Cookie'),'Content-Type':'application/json'},body:withBody ? JSON.stringify(safe) : undefined});
    return await env.FAB_ROOM.getByName('FAB-A-v20').fetch(rpc);
  } catch (error) {
    return result(error instanceof AccountError ? error.status : 503,{message:error instanceof AccountError ? error.message : '연결이 늦어지고 있어요. 다시 눌러 주세요.'});
  }
}
export async function accountInRoom(request,env,accounts,retireDevice) {
  const device = await sessionId(sessionToken(request));
  if (!device) return result(401,{});
  const current = await effectiveProfileId(request,env,accounts), action = new URL(request.url).pathname.split('/').pop();
  try {
    if (action === 'status') {
      const restored=current!==device;
      const [character,original]=await Promise.all([accounts.view(current),restored?accounts.view(device):null]);
      return result(200,{enabled:true,clientId:env.FAB_GOOGLE_CLIENT_ID,character,linked:accounts.linked(current),restored,original:original?.name});
    }
    if (action === 'start') return result(200,accounts.start(device));
    if (action === 'character-code') return result(200,await accounts.issueCharacterCode(device,current));
    if (action === 'leave') {
      accounts.forgetDevice(device); retireDevice(device);
      return result(200,{ok:true},{'Set-Cookie':deviceCookie('',request.url)});
    }
    const input = await request.json();
    if (action === 'verify') return result(200,await accounts.verified(device,input));
    if(action==='handoff-create')return result(200,await accounts.handoff.create(device,current,input));
    if(action==='handoff-open')return result(200,await accounts.handoff.open(device,input.key));
    if(action==='handoff-verify')return result(200,await accounts.handoff.verify(device,current,input.key,input));
    if(action==='handoff-approve')return result(200,await accounts.handoff.approve(device,input.key));
    if(action==='handoff-pickup')return result(200,await accounts.handoff.pickup(device,current,input.receipt));
    const args={code:input.code,device,current};
    let output;
    if(action==='signin' || action==='register') output=await accounts.signIn({...args,create:action==='register'});
    else if(action==='recover-preview' || action==='recover-confirm') output=await accounts.recover({...args,characterCode:input.characterCode,confirm:action==='recover-confirm'});
    else output=await accounts.useCode({...args,action});
    if (action === 'preview' || action === 'recover-preview') return result(200,output);
    if (output.unlink) retireDevice(null,current);
    if (output.revokedProfile) retireDevice(null,output.revokedProfile);
    if (output.setDevice) retireDevice(device);
    const headers = output.setDevice || output.unlink ? {'Set-Cookie':deviceCookie(output.secret || '',request.url)} : {};
    const response=result(200,{ok:true},headers);
    if(pendingFirstVisit(request) && (output.setDevice || action==='link')) response.headers.append('Set-Cookie',firstVisitCookie(request.url,false));
    return response;
  } catch (error) {
    if (error instanceof AccountError) return result(error.status,{message:error.message,reason:error.reason});
    throw error;
  }
}
