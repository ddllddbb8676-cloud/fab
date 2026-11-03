import {PROTOCOL} from '../src/shared-protocol.js';

// WebSocket clients cannot read an HTTP 409 response body. Old clients already
// recognize a welcome with a different protocol, so let them stop retrying and
// show the refresh notice without joining or touching a visitor profile.
export function rejectOutdatedRoom(request) {
  if(new URL(request.url).searchParams.get('v')===String(PROTOCOL))return null;
  const [client,server]=Object.values(new WebSocketPair());server.accept();
  server.send(JSON.stringify({type:'welcome',v:PROTOCOL,message:'새 버전이 있어요. 새로고침하면 기존 기록으로 연결돼요.'}));
  server.close(1008,'Client update required');
  return new Response(null,{status:101,webSocket:client,headers:{'Cache-Control':'no-store'}});
}
