// Upgrade before serving HTML or creating a session. This retains the same
// hostname/path/cookie and prevents HTTP visits from starting another session.
export function canonicalRedirect(request){
  const url=new URL(request.url);
  if(url.hostname!=='fab.semitoon.com'||url.protocol!=='http:')return null;
  url.protocol='https:';
  return new Response(null,{status:308,headers:{Location:url.href,'Cache-Control':'public, max-age=3600'}});
}
