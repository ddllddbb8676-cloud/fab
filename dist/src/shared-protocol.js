import { ports } from './layout.js?v=35964c9802b1';
import { reservedPortIds } from './network-transport.js?v=35964c9802b1';
export const PROTOCOL = 20;
export { MAX_VISITORS } from './room-population.js?v=35964c9802b1';
export const initialSharedPorts = ports.filter(p => !reservedPortIds.has(p.id) && (p.machineId + p.index) % 4 !== 0).map(p => p.id);
export const round = n => Math.round(n * 1000) / 1000;
export function actorPacket(p) {
  return [p.id,round(p.x),round(p.y),round(p.z),round(p.heading),round(p.speed || 0),p.posture || 'stand',p.phase || 'idle',round(p.time || 0),p.targetId ?? null,p.vehicleId ?? null,Boolean(p.carrying),Boolean(p.hidden),p.role||'visitor',p.penalty||0,p.brokenCount||0,p.repairedCount||0,p.safetyCaughtIds?.size||0,p.emote||'',p.emoteSeq||0,round(p.emoteLeft||0),p.titleId||'',round(p.caughtLeft||0),round(p.catchLeft||0)];
}
export function actorFromPacket(p) {
  return {id:p[0],x:p[1],y:p[2],z:p[3],heading:p[4],speed:p[5],posture:p[6],phase:p[7],time:p[8],targetId:p[9],vehicleId:p[10],carrying:p[11],hidden:p[12],role:p[13]||'visitor',penalty:p[14]||0,brokenCount:p[15]||0,repairedCount:p[16]||0,safetyCatchCount:p[17]||0,emote:p[18]||'',emoteSeq:p[19]||0,emoteLeft:p[20]||0,titleId:p[21]||'',caughtLeft:p[22]||0,catchLeft:p[23]||0};
}
export function foupPacket(r) { return [r.id,r.mode,r.portId,r.owner ?? null,round(r.x),round(r.y),round(r.z),round(r.yaw || 0),r.breakSeq||0,round(r.damageAge||0),r.cleaner??null,round(r.cleanProgress||0),round(r.cleanHeading||0),r.stockerId??null,r.stockSlot??0,round(r.stockAge||0),r.gold?[r.gold.eventId,r.gold.expiresAt]:null,r.cartId??null,r.cartSlot??null]; }
export function foupFromPacket(r) { return {id:r[0],mode:r[1],portId:r[2],owner:r[3] || undefined,x:r[4],y:r[5],z:r[6],yaw:r[7],breakSeq:r[8]||0,damageAge:r[9]||0,cleaner:r[10]??null,cleanProgress:r[11]||0,cleanHeading:r[12]||0,stockerId:r[13]??null,stockSlot:r[14]??0,stockAge:r[15]??0,gold:r[16]?{eventId:r[16][0],expiresAt:r[16][1]}:null,cartId:r[17]??null,cartSlot:r[18]??null,original:false}; }
