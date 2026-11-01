import { ports } from './layout.js';
import { reservedPortIds } from './network-transport.js';
export const PROTOCOL = 18;
export const MAX_VISITORS = 100;
export const initialSharedPorts = ports.filter(p => !reservedPortIds.has(p.id) && (p.machineId + p.index) % 4 !== 0).map(p => p.id);
export const round = n => Math.round(n * 1000) / 1000;
export function actorPacket(p) {
  return [p.id,round(p.x),round(p.y),round(p.z),round(p.heading),round(p.speed || 0),p.posture || 'stand',p.phase || 'idle',round(p.time || 0),p.targetId ?? null,p.vehicleId ?? null,Boolean(p.carrying),Boolean(p.hidden)];
}
export function actorFromPacket(p) {
  return {id:p[0],x:p[1],y:p[2],z:p[3],heading:p[4],speed:p[5],posture:p[6],phase:p[7],time:p[8],targetId:p[9],vehicleId:p[10],carrying:p[11],hidden:p[12]};
}
export function foupPacket(r) { return [r.id,r.mode,r.portId,r.owner ?? null,round(r.x),round(r.y),round(r.z),round(r.yaw || 0)]; }
export function foupFromPacket(r) { return {id:r[0],mode:r[1],portId:r[2],owner:r[3] || undefined,x:r[4],y:r[5],z:r[6],yaw:r[7],original:false}; }
