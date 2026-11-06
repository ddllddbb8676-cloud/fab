import {PROTOCOL} from './shared-protocol.js?v=0aef8956b0b4';

export function embeddedRoomConfig(time){
  const serverTime=Number(time);
  return Number.isSafeInteger(serverTime)&&serverTime>0?{multiplayer:true,protocol:PROTOCOL,ws:'/api/room',serverTime}:null;
}
export async function multiplayerConfiguration(){
  try {const r=await fetch('/api/config',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(r.ok){const c=await r.json();if(c.multiplayer)return c;}}
  catch{}
  return location.hostname==='fab.semitoon.com'?{multiplayer:true,protocol:PROTOCOL,ws:'/api/room'}:null;
}
