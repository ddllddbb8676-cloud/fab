import {sessionToken,newSessionToken,sessionCookie} from './player-profiles.js';

export function serveEntry(asset,request,googleEnabled=false) {
  const response=new Response(asset.body,asset);
  response.headers.set('Cache-Control','no-store');
  if(request.method!=='GET'||response.status!==200||!['/','/index','/index.html'].includes(new URL(request.url).pathname))return response;
  if(!sessionToken(request))response.headers.append('Set-Cookie',sessionCookie(newSessionToken(),request.url));
  response.headers.delete('ETag');
  response.headers.delete('Content-Length');
  const page=new HTMLRewriter();
  if(googleEnabled)page.on('#google-account-link',{element(element){element.removeAttribute('hidden');}});
  return page.on('script[data-fab-entry]',{
    element(element){element.setAttribute('data-room-time',String(Date.now()));}
  }).transform(response);
}
