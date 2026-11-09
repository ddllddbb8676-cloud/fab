import { ports } from './layout.js?v=bb8913c38810';
import { actorFromPacket,foupFromPacket } from './shared-protocol.js?v=bb8913c38810';

export function createSharedWorldView({fleet,store,destruction,onPeople,onCue,onCount,onSelf=()=>{}}) {
  const portMap=new Map(ports.map(p=>[p.id,p])), targets=new Map();let selfId=null,lastTime=-1,renderTime=null,totals={},bufferDelay=.3;
  function welcome(id,{transport='websocket'}={}){selfId=id;lastTime=-1;renderTime=null;bufferDelay=transport==='https'?.9:.3;store.reset();targets.clear();}
  function apply(frame,initial=false) {
    if(!frame||frame.t<lastTime)return;
    // Resume a stale stream from recent samples, not an old, expired timeline.
    if(lastTime>=0&&frame.t-lastTime>3){renderTime=null;targets.clear();}
    lastTime=frame.t;
    if(renderTime===null)renderTime=frame.t-bufferDelay;
    const wanted=new Set(frame.broken.map(r=>r[0]));
    for(const id of destruction.state.destroyedIds)if(!wanted.has(id))destruction.reset(id);
    for(const [id,age,progress,owner] of frame.broken) {
      if(!destruction.isDestroyed(id))destruction.trigger(id,{age,silent:initial||age>.4});
      if(progress!==null){destruction.beginRepair(id,owner??`remote:${id}`);destruction.setRepairProgress(id,progress);}
      else destruction.cancelRepair(id);
    }
    store.synchronize(frame.foups.map(foupFromPacket),selfId,initial);
    for(const r of frame.fleet) {
      const v=fleet.vehicles[r[0]];if(!v)continue;
      const previous=v.state;
      v.currentPort=portMap.get(r[12]);v.destinationPort=portMap.get(r[13]);v.cargoDetached=r[14];v.passenger=r[15];v.boardingHold=r[16];
      v.residentId=r[17]?.startsWith('resident:')?r[17]:null;v.playerId=r[17]&&!v.residentId?r[17]:null;
      const state={car:{x:r[1],z:r[2],yaw:r[3]},foup:{x:r[4],y:r[5],z:r[6],yaw:r[7]},gripperY:r[8],phase:r[9],parked:r[10],lowered:r[11],
        target:v.currentPort,origin:v.currentPort,destination:v.destinationPort,hasCargo:!v.cargoDetached,passenger:v.passenger,travelling:r[9]===4||r[9]===8,waiting:r[18],delivered:r[19],label:v.passenger?'함께 FAB 산책':'FOUP 반송'};
      const samples=initial?[]:targets.get(v.id)??[];
      if(samples.at(-1)?.t===frame.t)samples.pop();
      samples.push({t:frame.t,state});if(samples.length>12)samples.shift();targets.set(v.id,samples);
      v.state={...state,car:{...(initial?state:previous).car},foup:{...(initial?state:previous).foup},gripperY:(initial?state:previous).gripperY};
    }
    const people=frame.people.map(actorFromPacket);onPeople(people.filter(p=>p.id!==selfId));onSelf(people.find(p=>p.id===selfId));onCount(frame.count,people.length);totals=frame.totals;
    if(!initial)for(const [kind,x,z] of frame.events)onCue(kind,{x,z});
  }
  function update(dt,elapsed=dt) {
    // Playback uses real frame time, not the bounded physics step. Otherwise
    // slow devices fall behind the retained samples and jump on every packet.
    // HTTP responses arrive in wider batches, so that connection buffers more.
    if(renderTime!==null)renderTime=Math.min(lastTime,renderTime+Math.max(0,Number.isFinite(elapsed)?elapsed:0));
    for(const v of fleet.vehicles){const samples=targets.get(v.id);if(!samples?.length)continue;
      while(samples.length>2&&samples[1].t<=renderTime)samples.shift();
      const a=samples[0],b=samples[1]??a,f=b.t>a.t?Math.max(0,Math.min(1,(renderTime-a.t)/(b.t-a.t))):0;
      const mix=(x,y)=>x+(y-x)*f,angle=(x,y)=>x+Math.atan2(Math.sin(y-x),Math.cos(y-x))*f;
      for(const k of ['x','z'])v.state.car[k]=mix(a.state.car[k],b.state.car[k]);
      v.state.car.yaw=angle(a.state.car.yaw,b.state.car.yaw);
      for(const k of ['x','y','z'])v.state.foup[k]=mix(a.state.foup[k],b.state.foup[k]);
      v.state.foup.yaw=angle(a.state.foup.yaw,b.state.foup.yaw);v.state.gripperY=mix(a.state.gripperY,b.state.gripperY);
    }
    store.interpolate(dt);
  }
  return {welcome,apply,update,get totals(){return totals;},get playbackTime(){return renderTime;},get playback(){return {bufferDelay,lag:renderTime===null?null:lastTime-renderTime};}};
}
