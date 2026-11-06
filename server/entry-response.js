import {sessionToken,newSessionToken,sessionCookie} from './player-profiles.js';

// A new browser can visit the external code helper before it has ever played.
// Its authentication cookie alone must not bypass the first-visit choices.
export const pendingFirstVisit=request=>/(?:^|;\s*)fab-first-visit=1(?:;|$)/.test(request.headers.get('Cookie')||'');
export const firstVisitCookie=(url,pending)=>'fab-first-visit='+(pending?'1':'')+'; Path=/; Max-Age='+(pending?31536000:0)+'; SameSite=Lax; HttpOnly'+(new URL(url).protocol==='https:'?'; Secure':'');

export function serveEntry(asset,request,googleEnabled=false) {
  const response=new Response(asset.body,asset);
  response.headers.set('Cache-Control','no-store');
  if(request.method!=='GET'||response.status!==200||!['/','/index','/index.html'].includes(new URL(request.url).pathname))return response;
  if(!sessionToken(request))response.headers.append('Set-Cookie',sessionCookie(newSessionToken(),request.url));
  if(pendingFirstVisit(request))response.headers.append('Set-Cookie',firstVisitCookie(request.url,false));
  response.headers.set('Vary','Cookie');
  response.headers.delete('ETag');
  response.headers.delete('Content-Length');
  const page=new HTMLRewriter();
  if(googleEnabled)page.on('#google-account-link',{element(element){element.removeAttribute('hidden');}});
  return page.on('script[data-fab-entry]',{
    element(element){element.setAttribute('data-room-time',String(Date.now()));}
  }).transform(response);
}
