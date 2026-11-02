import { machines, ports, isBlocked } from '../src/layout.js';
import { createFleet, reservedPortIds } from '../src/network-transport.js';
import { createFoupStore } from '../src/foup-play.js';
import { createResidentSimulation } from '../src/residents.js';
import { getEmoApproach } from '../src/emo-interaction.js';
import { boardingMachine } from '../src/play-actions.js';
import { createVisitorName } from '../src/visitor-name.js';
import { createSafetyPatrols, createSafetyName, canCatch, isSafety, SAFETY_CATCH_GOAL, SAFETY_NO_EMO_MESSAGE } from '../src/safety-team.js';
import { PROTOCOL,MAX_VISITORS,initialSharedPorts,actorPacket,foupPacket,round } from '../src/shared-protocol.js';
import { ROOM_CAPACITY } from '../src/room-population.js';
import {isEmote,EMOTE_SECONDS} from '../src/emotes.js';
import {rankScores} from '../src/leaderboard.js';
import {isRestArea,canSafetyTraverse,restAreaExit,SAFETY_CLEARANCE} from '../src/rest-area.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const finite=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
export const SAFETY_DUTY={warmup:60,handover:15,cooldown:90,goal:SAFETY_CATCH_GOAL};
export function createRoom({random=Math.random,onCatch=()=>{},onProfileChange=()=>{},onRosterChange=()=>{},getHistoricalScores=()=>[],onEquipmentChange=()=>{},claimName=(id,kind,preferred,excluded)=>(kind==='safety'?createSafetyName:createVisitorName)(random,excluded,preferred),now=Date.now}={}) {
  const players=new Map(), broken=new Map(), leases=new Map(), events=[], foupVersions=new Map();
  const fleet=createFleet(), byPort=new Map(ports.map(p=>[p.id,p]));
  let time=0, revision=0,joinOrder=0,nextSafetyAt=SAFETY_DUTY.handover,dutyColor=0,lastRanking='';
  function profile(p){return {id:p.id,name:p.name,civilianName:p.civilianName,safetyName:p.safetyName,role:p.role,brokenCount:p.brokenCount,repairedCount:p.repairedCount,penalty:p.penalty,
    activeSeconds:p.activeSeconds,safetyTurns:p.safetyTurns,safetyCaughtIds:[...p.safetyCaughtIds],eligibleAfter:p.eligibleAfter,optOut:p.optOut,hasEntered:p.hasEntered,groundPosition:p.groundPosition};}
  function changed(p){p.lastSavedAt=time;onProfileChange(profile(p));}
  function rosterChanged(){revision++;onRosterChange();}
  function emit(kind,point) { if(events.length<100) events.push([kind,round(point.x),round(point.z)]); }
  function equipmentState(){return {version:1,broken:[...broken.values()].map(r=>({id:r.id,destroyedAt:r.destroyedAt})).sort((a,b)=>a.id-b.id)};}
  function restoreEquipment(saved){
    // Reject an unreadable checkpoint rather than silently opening a repaired fab.
    if(saved?.version!==1||!Array.isArray(saved.broken)||saved.broken.length>machines.length)throw new Error('Invalid equipment checkpoint');
    const ids=new Set();
    for(const r of saved.broken){
      if(!Number.isInteger(r.id)||!machines[r.id]||ids.has(r.id)||!Number.isFinite(r.destroyedAt)||r.destroyedAt<0)throw new Error('Invalid equipment record');
      ids.add(r.id);
    }
    if(time!==0||players.size)throw new Error('Equipment restore is only allowed before the room starts');
    broken.clear();
    for(const r of saved.broken)broken.set(r.id,{id:r.id,destroyedAt:r.destroyedAt,at:-Math.max(6,(now()-r.destroyedAt)/1000)});
    // Repair leases/animations are interrupted by restart. The tool stays broken
    // and available to repair; restarting never grants a completion or score.
  }
  const destruction={
    get state(){return {destroyedIds:[...broken.keys()]};}, isDestroyed:id=>broken.has(id),
    trigger(id){if(broken.has(id)||!machines[id])return false;broken.set(id,{id,at:time,destroyedAt:now()});onEquipmentChange(equipmentState());return true;},
    beginRepair(id,owner='player'){const r=broken.get(id);if(!r||r.owner||[...broken.values()].some(b=>b.owner===owner))return false;r.owner=owner;r.progress=0;return true;},
    setRepairProgress(id,progress){const r=broken.get(id);if(!r?.owner)return false;r.progress=Math.min(1,Math.max(0,progress));return true;},
    cancelRepair(id){const r=broken.get(id);if(!r)return false;delete r.owner;delete r.progress;return true;},
    reset(id){const changed=broken.delete(id);if(changed)onEquipmentChange(equipmentState());return changed;}
  };
  const store=createFoupStore({ports,initialPortIds:initialSharedPorts,isDestroyed:destruction.isDestroyed,onImpact:r=>emit('bounce',r)});
  function detachCargo(v) {
    if(v.cargoDetached)return;
    const s=v.state,r=store.adopt(`vehicle:${v.id}`,{...s.foup},s.parked?s.target.id:null);
    fleet.detachCargo(v.id);
    if(!s.parked)store.launch(r,{...s.foup},{x:0,y:.6,z:(boardingMachine(s.car)?.sign??1)*2.2});
  }
  const residents=createResidentSimulation({fleet,store,destruction,detachCargo,random,getNeighbors:()=>safety.people,protectedIds:()=>[...leases.keys()],onCue:emit});
  const safety=createSafetyPatrols({random,excludedNames:residents.people.map(p=>p.name)});
  function finishDuty(p,optOut=false) {
    p.role='visitor';p.name=p.civilianName;p.optOut=optOut;p.safeUntil=time+12;
    p.eligibleAfter=p.activeSeconds+SAFETY_DUTY.cooldown;nextSafetyAt=time+SAFETY_DUTY.handover;
    changed(p);rosterChanged();
  }
  function recordCatch(guard,target,details) {
    if(!players.has(guard.id))return;
    guard.safetyCaughtIds.add(target.id);const caught=guard.safetyCaughtIds.size,completed=caught>=SAFETY_DUTY.goal;
    if(completed)finishDuty(guard);else changed(guard);
    onCatch({guardId:guard.id,targetId:target.id,targetName:target.name,...details,caught,goal:SAFETY_DUTY.goal,completed});
  }
  function assignSafetyDuty() {
    if(time<nextSafetyAt||[...players.values()].some(p=>isSafety(p.role)))return;
    const candidates=[...players.values()].filter(p=>!p.hidden&&!isRestArea(p,SAFETY_CLEARANCE)&&!p.optOut&&!p.penalty&&p.phase==='idle'&&p.targetId==null&&p.posture==='stand'&&!p.carrying&&time-p.lastSeen<12&&
      p.activeSeconds>=Math.max(SAFETY_DUTY.warmup,p.eligibleAfter)&&time>=p.assignAfter&&(Math.abs(p.x)>6||p.z<70));
    candidates.sort((a,b)=>a.safetyTurns-b.safetyTurns||a.joinOrder-b.joinOrder);
    const p=candidates[0];if(!p)return;
    p.role=['safety-orange','safety-orange','safety-red'][dutyColor++%3];p.safetyTurns++;p.safetyCaughtIds.clear();
    p.safetyName=claimName(p.id,'safety',p.safetyName,roster().map(r=>r[1]),random);p.name=p.safetyName;changed(p);rosterChanged();
  }
  function catchPlayer(p,guard) {
    const held=store.getCarried(p.id);if(held)store.launch(held,{x:p.x,y:.6,z:p.z},{x:0,y:0,z:0});
    release(p);p.carrying=false;p.posture='stand';p.penalty=3;
    changed(p);recordCatch(guard,p,{penalty:p.penalty});
  }
  function release(p) {
    for(const [id,l] of leases)if(l.owner===p.id){if(l.kind==='repair')destruction.cancelRepair(id);leases.delete(id);}
    for(const v of fleet.vehicles)if(v.playerId===p.id){fleet.leavePassenger(v.id);delete v.playerId;}
    p.targetId=null;p.vehicleId=null;p.phase='idle';p.time=0;
  }
  function remove(id) {
    const p=players.get(id);if(!p)return;
    const held=store.getCarried(id);
    if(held)store.launch(held,{x:p.x,y:Math.max(.5,p.y+.82),z:p.z,yaw:p.heading},{x:0,y:0,z:.5});
    release(p);changed(p);players.delete(id);revision++;
    if(isSafety(p.role))nextSafetyAt=time+SAFETY_DUTY.handover;
  }
  function join(id,saved=null) {
    if(players.has(id))return {ok:false,error:'duplicate'};
    if(players.size>=MAX_VISITORS)return {ok:false,error:'full',message:`자동 캐릭터를 포함해 팹 정원 ${ROOM_CAPACITY}명이 찼어요. 자리가 나면 다시 입장할게요.`};
    const excluded=[...players.values()].flatMap(p=>[p.name,p.civilianName]).concat(residents.people.map(p=>p.name),safety.people.map(p=>p.name));
    const civilianName=claimName(id,'visitor',saved?.civilianName||(!isSafety(saved?.role)?saved?.name:''),excluded,random);
    const caught=new Set(saved?.safetyCaughtIds??[]);
    const role=isSafety(saved?.role)&&caught.size<SAFETY_DUTY.goal&&![...players.values()].some(p=>isSafety(p.role))?saved.role:'visitor';
    const safetyName=(saved?.safetyName||isSafety(saved?.role))?claimName(id,'safety',saved?.safetyName||saved?.name,excluded,random):undefined;
    const p={id,name:role==='visitor'?civilianName:safetyName,civilianName,safetyName,role,penalty:saved?.penalty||0,safeUntil:time+12,x:0,y:0,z:78.8,heading:Math.PI,speed:0,posture:'stand',phase:'idle',time:0,hidden:true,lastSeen:time,rate:0,rateAt:time,
      activeSeconds:saved?.activeSeconds||0,safetyTurns:saved?.safetyTurns||0,safetyCaughtIds:caught,eligibleAfter:saved?.eligibleAfter||0,optOut:saved?.optOut||false,joinOrder:joinOrder++,assignAfter:time+SAFETY_DUTY.handover,hasEntered:saved?.hasEntered||false,groundPosition:saved?.groundPosition??null,lastSavedAt:time};
    p.brokenCount=saved?.brokenCount||0;p.repairedCount=saved?.repairedCount||0;
    if(p.groundPosition&&!isBlocked(p.groundPosition.x,p.groundPosition.z,.295))Object.assign(p,p.groundPosition);else p.groundPosition=null;
    if(isSafety(p.role)&&isRestArea(p,SAFETY_CLEARANCE)){Object.assign(p,restAreaExit(p));p.groundPosition={x:p.x,y:0,z:p.z,heading:p.heading};}
    changed(p);
    players.set(id,p);revision++;return {ok:true,id,name:p.name};
  }
  function pose(id,data) {
    const p=players.get(id);if(!p||!data||!finite(data.x,-58.8,58.8)||!finite(data.z,-88.5,88.5)||!finite(data.y,0,3.56)||!finite(data.heading,-1e5,1e5))return false;
    const v=p.vehicleId!==null&&p.vehicleId!==undefined?fleet.vehicles.find(v=>v.id===p.vehicleId&&v.playerId===id):null;
    if(isSafety(p.role)&&!v?.passenger){
      const position=isRestArea(p,SAFETY_CLEARANCE)?restAreaExit(p):p;
      if(!canSafetyTraverse(position,data))data={...data,x:position.x,y:0,z:position.z,speed:0};
    }
    Object.assign(p,{x:data.x,y:data.y,z:data.z,heading:data.heading,speed:finite(data.speed,0,5)?data.speed:0,
      posture:(!p.penalty||isRestArea(data))&&['stand','sit','lie'].includes(data.posture)?data.posture:'stand',hidden:Boolean(data.hidden),lastSeen:time});
    if(v?.passenger)Object.assign(p,{x:v.state.car.x,y:2.16,z:v.state.car.z,heading:v.state.car.yaw,phase:'riding'});
    else if(!['press','repair','climb'].includes(p.phase))p.phase='idle';
    const l=leases.get(p.targetId);if(l?.owner===id)l.expires=time+30;
    if(p.phase==='repair'&&distance(p,getEmoApproach(machines[p.targetId]).destination)>1.2)release(p);
    p.carrying=Boolean(store.getCarried(id));
    if(!p.hidden&&p.y<.1&&!isBlocked(p.x,p.z,.295)) {
      p.groundPosition={x:p.x,y:0,z:p.z,heading:p.heading};
      if(!p.hasEntered){p.hasEntered=true;changed(p);}
    }
    return true;
  }
  function fail(message='다른 사람이 먼저 사용 중이에요') {return {ok:false,message};}
  function claim(p,m,kind) {
    const existing=leases.get(m.id);
    if(existing&&existing.owner!==p.id)return false;
    release(p);residents.yieldMachine(m.id);leases.set(m.id,{owner:p.id,kind,expires:time+120});
    p.targetId=m.id;p.phase='approach';p.time=0;return true;
  }
  function reservedPort(p) {return reservedPortIds.has(p.id)&&fleet.vehicles.some(v=>!v.cargoDetached&&[v.homePort.id,v.currentPort.id,v.destinationPort.id].includes(p.id));}
  function command(id,kind,data={}) {
    const p=players.get(id);if(!p)return fail('다시 연결해 주세요');
    if(!data||typeof data!=='object'||Array.isArray(data))return fail('잘못된 조작이에요');
    if(['claim','press','repair','finish','explode','board'].includes(kind)&&!Number.isInteger(data.id))return fail('잘못된 대상이에요');
    if(data.vehicleId!==undefined&&!Number.isInteger(data.vehicleId))return fail('잘못된 대상이에요');
    if(time-p.rateAt>1){p.rate=0;p.rateAt=time;} if(++p.rate>12)return fail('잠시 후 다시 눌러주세요');
    p.lastSeen=time;
    if(kind==='emote'){
      if(!isEmote(data.id)||p.hidden)return fail('입장 후 감정을 표현해 주세요');
      if(time<(p.nextEmoteAt??0))return fail('잠시 후 다시 눌러주세요');
      p.emote=data.id;p.emoteSeq=(p.emoteSeq||0)+1;p.emoteUntil=time+EMOTE_SECONDS;p.emoteLeft=EMOTE_SECONDS;p.nextEmoteAt=time+.6;
      return {ok:true};
    }
    if(kind==='civilian') {
      if(!isSafety(p.role))return fail('이미 일반 방문자예요');
      finishDuty(p,true);return {ok:true};
    }
    if(isSafety(p.role)&&(kind==='press'||kind==='explode'||kind==='claim'&&data.kind==='emo'))return fail(SAFETY_NO_EMO_MESSAGE);
    if(p.penalty && !(kind==='cancel'||['repair','finish'].includes(kind)||kind==='claim'&&data.kind==='repair'))return fail(`장비를 ${p.penalty}대 더 고쳐야 다시 팹뿌를 하실 수 있습니다.`);
    if(kind==='cancel'){release(p);return {ok:true};}
    if(kind==='claim') {
      const m=machines[data.id];
      if(!m||!['emo','repair'].includes(data.kind)||store.getCarried(id))return fail('FOUP을 내려놓고 다시 눌러주세요');
      if(destruction.isDestroyed(m.id)!==(data.kind==='repair'))return fail('장비 상태가 바뀌었어요');
      return claim(p,m,data.kind)?{ok:true}:fail();
    }
    if(['press','repair','finish','explode'].includes(kind)) {
      const m=machines[data.id],l=leases.get(data.id);
      if(!m||l?.owner!==id||distance(p,getEmoApproach(m).destination)>1.2)return fail('장비 앞으로 가까이 다가가 주세요');
      if(kind==='press'&&l.kind==='emo'){if(l.started===undefined)l.started=time;p.phase='press';p.time=0;emit('press',p);return {ok:true};}
      if(kind==='explode'&&l.kind==='emo'&&l.started!==undefined&&time-l.started>=.55){const ok=destruction.trigger(m.id);if(ok)p.brokenCount++;release(p);if(ok)changed(p);return {ok};}
      if(kind==='repair'&&l.kind==='repair'){if(!destruction.beginRepair(m.id,id))return fail();l.started=time;p.phase='repair';p.time=0;return {ok:true};}
      if(kind==='finish'&&l.kind==='repair'&&l.started!==undefined&&time-l.started>=4.7){if(!destruction.reset(m.id))return fail();p.repairedCount++;p.penalty=Math.max(0,p.penalty-1);if(!p.penalty)p.safeUntil=time+12;emit('complete',p);release(p);changed(p);return {ok:true};}
      return fail('동작이 끝난 뒤 다시 눌러주세요');
    }
    if(kind==='pickup') {
      if(p.vehicleId!==null&&p.vehicleId!==undefined)return fail();
      let r=store.records.get(data.id);
      if(data.vehicleId!==undefined){const v=fleet.vehicles[data.vehicleId];if(!v||v.cargoDetached||!v.state.parked||v.currentPort.id!==data.portId)return fail('OHT가 FOUP을 가져갔어요');
        if(distance(p,v.state.foup)>2)return fail('FOUP 앞으로 가까이 가주세요');detachCargo(v);r=store.records.get(`vehicle:${v.id}`);}
      if(!r||r.portId&&destruction.isDestroyed(byPort.get(r.portId)?.machineId)||distance(p,r)>2||!store.pickup(r.id,id))return fail('다른 사람이 FOUP을 먼저 가져갔어요');
      p.carrying=true;emit('pickup',p);return {ok:true};
    }
    if(kind==='place') {
      const port=byPort.get(data.id);
      if(!port||distance(p,port)>2||reservedPort(port)||!store.place(port.id,id))return fail('비어 있는 로드포트를 눌러주세요');
      p.carrying=false;emit('place',p);return {ok:true};
    }
    if(kind==='throw') {
      const r=store.getCarried(id);if(!r||p.vehicleId!==null&&p.vehicleId!==undefined)return fail();
      const drop=Boolean(data.drop),speed=drop?.8:4.7;
      store.launch(r,{x:p.x+Math.sin(p.heading)*.34,y:Math.max(.4,p.y+.82),z:p.z+Math.cos(p.heading)*.34,yaw:p.heading+Math.PI},
        {x:Math.sin(p.heading)*speed,y:drop?.2:3.1,z:Math.cos(p.heading)*speed});p.carrying=false;emit(drop?'place':'throw',p);return {ok:true};
    }
    if(kind==='board') {
      const v=fleet.vehicles[data.id],m=v&&boardingMachine(v.state.car);
      if(!m||destruction.isDestroyed(m.id))return fail('장비가 부셔져서 탈 수가 없어요');
      if(v.residentId||v.playerId||store.getCarried(id))return fail('다른 OHT를 누르거나 FOUP을 내려놓아 주세요');
      if(distance(p,v.state.car)>28||!claim(p,m,'board'))return fail();
      v.playerId=id;fleet.holdVehicle(v.id,true);p.vehicleId=v.id;return {ok:true,machineId:m.id};
    }
    if(kind==='climb') {
      const v=fleet.vehicles[p.vehicleId],m=v&&boardingMachine(v.state.car);
      if(!v||v.playerId!==id||!m||destruction.isDestroyed(m.id)||distance(p,v.state.car)>1.6)return fail('장비 앞으로 다가가 주세요');
      detachCargo(v);p.phase='climb';p.time=0;return {ok:true};
    }
    if(kind==='ride') {
      const v=fleet.vehicles[p.vehicleId];if(!v||v.playerId!==id||p.phase!=='climb'||p.time<2.3)return fail();
      fleet.boardPassenger(v.id);leases.delete(p.targetId);p.targetId=null;p.phase='riding';p.time=0;return {ok:true};
    }
    if(kind==='dismount'){if(p.vehicleId===null||p.vehicleId===undefined)return fail();release(p);return {ok:true};}
    return fail('알 수 없는 조작이에요');
  }
  function step(dt) {
    dt=Math.min(.1,Math.max(0,dt));time+=dt;fleet.step(dt);store.step(dt);residents.update(dt);
    for(const [id,l] of leases)if(time>l.expires){const p=players.get(l.owner);if(p)release(p);else leases.delete(id);}
    for(const p of players.values()) {
      if(time-p.lastSeen>40){remove(p.id);continue;}
      p.time+=dt;
      p.emoteLeft=Math.max(0,(p.emoteUntil||0)-time);if(!p.emoteLeft)p.emote='';
      if(!p.hidden&&time-p.lastSeen<12&&(Math.abs(p.x)>6||p.z<70))p.activeSeconds+=dt;
      if(time-p.lastSavedAt>=30)changed(p);
      if(p.phase==='repair'){const l=leases.get(p.targetId);if(l?.owner===p.id)destruction.setRepairProgress(p.targetId,Math.min(.99,(time-l.started)/5));}
      const held=store.getCarried(p.id);p.carrying=Boolean(held);
      if(held)Object.assign(held,{x:p.x+Math.sin(p.heading)*.34,y:p.y+(p.posture==='sit'?.48:p.posture==='lie'?.62:.82),z:p.z+Math.cos(p.heading)*.34,yaw:p.heading+Math.PI});
      if(p.phase==='riding'){const v=fleet.vehicles[p.vehicleId];if(v?.playerId===p.id)Object.assign(p,{x:v.state.car.x,y:2.16,z:v.state.car.z,heading:v.state.car.yaw});}
    }
    assignSafetyDuty();
    const visitors=[...players.values()],targets=[...visitors,...residents.people];safety.update(dt,targets,time);
    for(const guard of [...safety.people,...visitors.filter(p=>isSafety(p.role))])for(const p of targets)if(canCatch(guard,p,time)) {
      if(players.has(p.id))catchPlayer(p,guard);
      else if(residents.beginSafetyLap(p))recordCatch(guard,p,{penalty:3});
    }
  }
  function roster(){return [...residents.people,...safety.people,...players.values()].map(p=>[p.id,p.name,p.role]);}
  function ranking(){return rankScores([...getHistoricalScores(),...residents.people,...safety.people,...[...players.values()].map(p=>({...p,name:p.civilianName||p.name}))]);}
  function snapshot(full=false) {
    const foups=[];
    for(const r of store.records.values())if(!r.original){const row=foupPacket(r),key=JSON.stringify(row);if(full||foupVersions.get(r.id)!==key)foups.push(row);if(!full)foupVersions.set(r.id,key);}
    const leaderboard=ranking(),rankingKey=JSON.stringify(leaderboard),includeRanking=full||rankingKey!==lastRanking;
    if(!full)lastRanking=rankingKey;
    return {type:'frame',v:PROTOCOL,t:round(time),rev:revision,count:players.size,...(includeRanking?{leaderboard}:{}),people:[...residents.people,...safety.people,...players.values()].map(p=>actorPacket({...p,carrying:Boolean(store.getCarried(p.id))})),
      broken:[...broken.values()].map(r=>[r.id,round(time-r.at),r.progress??null,r.owner??null]),foups,
      fleet:fleet.vehicles.map(v=>{const s=v.state;return [v.id,round(s.car.x),round(s.car.z),round(s.car.yaw),round(s.foup.x),round(s.foup.y),round(s.foup.z),round(s.foup.yaw),round(s.gripperY),s.phase,s.parked,round(s.lowered),s.target.id,s.destination.id,Boolean(v.cargoDetached),Boolean(v.passenger),Boolean(v.boardingHold),v.residentId??v.playerId??null,s.waiting,s.delivered];}),
      events:full?[]:events.splice(0),totals:residents.state.actions};
  }
  return {join,remove,pose,command,step,snapshot,roster,ranking,equipmentState,restoreEquipment,players,fleet,store,residents,safety,destruction,profile:id=>players.has(id)?profile(players.get(id)):null,get time(){return time;}};
}
