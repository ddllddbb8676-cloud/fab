import {newSessionToken,sessionCookie,sessionToken,sessionId} from './player-profiles.js';
import {deviceCookie,effectiveProfileId,privateHeaders} from './account-sessions.js';
import {googleVerifier,validClientId} from './google-identity.js';
import {AccountError} from './google-accounts.js';

const verify = googleVerifier();
const result = (status, data, headers) => Response.json(data,{status,headers:{...privateHeaders,...headers}});
const actions = new Set(['status','start','verify','preview','link','restore','unlink','leave']);
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
  if (response.ok && request.method === 'GET' && !sessionToken(request)) headers.append('Set-Cookie',sessionCookie(newSessionToken(),request.url));
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
    if (action === 'verify') {
      try { safe = await verifyCredential(input.credential,env.FAB_GOOGLE_CLIENT_ID); }
      catch { return result(401,{message:'구글 인증을 확인하지 못했어요. 다시 로그인해 주세요.'}); }
    } else if (['preview','link','restore','unlink'].includes(action)) safe = {code:input.code};
    // The caller cannot supply verified claims, internal paths or the identity header.
    const withBody = action === 'verify' || ['preview','link','restore','unlink'].includes(action);
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
    if (action === 'status') return result(200,{enabled:true,clientId:env.FAB_GOOGLE_CLIENT_ID,character:await accounts.view(current),linked:accounts.linked(current),restored:current !== device});
    if (action === 'start') return result(200,accounts.start(device));
    if (action === 'leave') {
      accounts.forgetDevice(device); retireDevice(device);
      return result(200,{ok:true},{'Set-Cookie':deviceCookie('',request.url)});
    }
    const input = await request.json();
    if (action === 'verify') return result(200,await accounts.verified(device,input));
    const output = await accounts.useCode({code:input.code,device,current,action});
    if (action === 'preview') return result(200,output);
    if (output.unlink) retireDevice(null,current);
    if (output.secret) retireDevice(device);
    const headers = output.secret || output.unlink ? {'Set-Cookie':deviceCookie(output.secret || '',request.url)} : {};
    return result(200,{ok:true},headers);
  } catch (error) {
    if (error instanceof AccountError) return result(error.status,{message:error.message});
    throw error;
  }
}
