import { ports } from './layout.js';
import { actorFromPacket,foupFromPacket } from './shared-protocol.js';

export function createSharedWorldView({fleet,store,destruction,onPeople,onCue,onCount}) {
  const portMap=new Map(ports.map(p=>[p.id,p])), targets=new Map();let selfId=null,lastTime=-1,totals={};
  function welcome(id){selfId=id;lastTime=-1;store.reset();destruction.resetAll();targets.clear();}
  function apply(frame,initial=false) {
    if(!frame||frame.t<lastTime)return;lastTime=frame.t;
    const wanted=new Set(frame.broken.map(r=>r[0]));
    for(const id of destruction.state.destroyedIds)if(!wanted.has(id))destruction.reset(id);
    for(const [id,age,progress,owner] of frame.broken) {
      if(!destruction.isDestroyed(id))destruction.trigger(id,{age,silent:initial||age>.4});
      if(progress!==null){destruction.beginRepair(id,owner??`remote:${id}`);destruction.setRepairProgress(id,progress);}
      else destruction.cancelRepair(id);
    }
    store.synchronize(frame.foups.map(foupFromPacket),selfId);
    for(const r of frame.fleet) {
      const v=fleet.vehicles[r[0]];if(!v)continue;
      const previous=v.state;
      v.currentPort=portMap.get(r[12]);v.destinationPort=portMap.get(r[13]);v.cargoDetached=r[14];v.passenger=r[15];v.boardingHold=r[16];
      v.residentId=r[17]?.startsWith('resident:')?r[17]:null;v.playerId=r[17]&&!v.residentId?r[17]:null;
      const state={car:{x:r[1],z:r[2],yaw:r[3]},foup:{x:r[4],y:r[5],z:r[6],yaw:r[7]},gripperY:r[8],phase:r[9],parked:r[10],lowered:r[11],
        target:v.currentPort,origin:v.currentPort,destination:v.destinationPort,hasCargo:!v.cargoDetached,passenger:v.passenger,travelling:r[9]===4||r[9]===8,waiting:r[18],delivered:r[19],label:v.passenger?'함께 FAB 산책':'FOUP 반송'};
      targets.set(v.id,state);v.state=initial?state:{...state,car:{...previous.car},foup:{...previous.foup},gripperY:previous.gripperY};
    }
    onPeople(frame.people.map(actorFromPacket).filter(p=>p.id!==selfId));onCount(frame.count);totals=frame.totals;
    if(!initial)for(const [kind,x,z] of frame.events)onCue(kind,{x,z});
  }
  function update(dt) {
    const f=1-Math.exp(-dt*16),angle=(a,b)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*f;
    for(const v of fleet.vehicles){const goal=targets.get(v.id);if(!goal)continue;for(const k of ['x','z'])v.state.car[k]+=(goal.car[k]-v.state.car[k])*f;
      v.state.car.yaw=angle(v.state.car.yaw,goal.car.yaw);for(const k of ['x','y','z'])v.state.foup[k]+=(goal.foup[k]-v.state.foup[k])*f;v.state.foup.yaw=angle(v.state.foup.yaw,goal.foup.yaw);v.state.gripperY+=(goal.gripperY-v.state.gripperY)*f;}
    store.interpolate(dt);
  }
  return {welcome,apply,update,get totals(){return totals;}};
}
