import {sessionToken, sessionId} from './player-profiles.js';
import {digest} from './google-identity.js';

const cookieName = 'fab-google-device-v1';
export const deviceDays = 30;
export const privateHeaders = {'Cache-Control':'private, no-store', Vary:'Cookie', 'X-Content-Type-Options':'nosniff'};
export function deviceCookie(secret, url) {
  return cookieName+'='+secret+'; Path=/; Max-Age='+(secret ? deviceDays*86400 : 0)+'; HttpOnly; SameSite=Lax'+(new URL(url).protocol === 'https:' ? '; Secure' : '');
}
function deviceSecret(request) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='));
  const secret = cookie?.slice(cookieName.length+1);
  return /^[a-f0-9]{64}$/.test(secret || '') ? secret : null;
}
export async function localSession(request,accounts,token=sessionToken(request)) {
  const device = await sessionId(token), secret = deviceSecret(request);
  if (device && secret) {
    const hash = await digest('device:'+secret), restored = accounts.restoredSession(hash,device);
    if (restored) return {id:restored.profile,auth:{device,hash,expires:restored.expires}};
    return {id:device,expired:true};
  }
  return {id:device};
}
export async function effectiveProfileId(request, env, accounts) {
  if (accounts) return (await localSession(request,accounts)).id;
  const token=sessionToken(request);
  if (!token || !deviceSecret(request)) return sessionId(token);
  const resolved = await env.FAB_ROOM.getByName('FAB-A-v20').fetch(new Request('https://fab-internal/account-session', {headers:{Cookie:request.headers.get('Cookie')}}));
  if (!resolved.ok) throw Error('Account session unavailable');
  return (await resolved.json()).id;
}
