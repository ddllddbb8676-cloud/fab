import {checkNickname,NICKNAME_CHOICE_VERSION,NICKNAME_TICKET_PRICE} from '../src/nickname-policy.js';
import {nicknameKey} from '../src/visitor-name.js';
import {restoreWallet,grantChips,wardrobeCommand,walletView} from './chip-wallet.js';
import {npcOutfit} from '../src/npc-outfits.js';
import { machines, ports, isBlocked } from '../src/layout.js';
import { AIR_SHOWER } from '../src/air-shower.js';
import {stockerById} from '../src/stocker-layout.js';
import { createFleet, reservedPortIds } from '../src/network-transport.js';
import { createFoupStore, FOUP_CLEAN_SECONDS, FOUP_CLEAN_REWARD } from '../src/foup-play.js';
import { createResidentSimulation } from '../src/residents.js';
import { getEmoApproach } from '../src/emo-interaction.js';
import { boardingMachine,boardingApproach,NO_LOADPORT_MESSAGE } from '../src/play-actions.js';
import { createVisitorName } from '../src/visitor-name.js';
import { createSafetyPatrols, createSafetyName, canCatch, isSafety, SAFETY_CATCH_GOAL, SAFETY_NO_EMO_MESSAGE } from '../src/safety-team.js';
import { PROTOCOL,MAX_VISITORS,initialSharedPorts,actorPacket,foupPacket,round } from '../src/shared-protocol.js';
import { ROOM_CAPACITY } from '../src/room-population.js';
import {isEmote,EMOTE_SECONDS} from '../src/emotes.js';
import {rankScores} from '../src/leaderboard.js';
import {configuredOwnerId,hasUnlimitedChips} from './owner-privileges.js';
import {canSelectTitle,restoreTitlePreference,destructionTitle,npcDestructionTitle,OPERATOR_TITLE} from '../src/destruction-titles.js';
import {isRestArea,canSafetyTraverse,restAreaExit,SAFETY_CLEARANCE} from '../src/rest-area.js';
import {createWorldEvents} from './world-events.js';
import {contestOutfit, gatheringPoint} from '../src/foup-contest.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const finite=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
export const SAFETY_DUTY={warmup:300,handover:15,cooldown:600,goal:SAFETY_CATCH_GOAL};
const SAFETY_DUTY_VERSION=2,LEGACY_SAFETY_COOLDOWN=90;
export function createRoom({random=Math.random,onCatch=()=>{},onProfileChange=()=>{},onReward=()=>{},onRosterChange=()=>{},getHistoricalScores=()=>[],onEquipmentChange=()=>{},onFoupChange=()=>{},onEventsChange=()=>{},eventExcludedIds=[],claimName=(id,kind,preferred,excluded)=>(kind==='safety'?createSafetyName:createVisitorName)(random,excluded,preferred),now=Date.now,nicknameAvailable=null,replaceNickname=null,ownerId=''}={}) {
  ownerId=configuredOwnerId(ownerId);
  const players=new Map(), broken=new Map(), leases=new Map(), events=[], foupVersions=new Map();
  const fleet=createFleet(), byPort=new Map(ports.map(p=>[p.id,p]));
  const excludedEvents=new Set(eventExcludedIds);let worldEvents=null;
  const contestProfiles=new Map();
  let time=0, revision=0,joinOrder=0,nextSafetyAt=SAFETY_DUTY.handover,dutyColor=0,lastRanking='';
  function profile(p){return {id:p.id,name:p.name,civilianName:p.civilianName,safetyName:p.safetyName,role:p.role,brokenCount:p.brokenCount,repairedCount:p.repairedCount,penalty:p.penalty,
    titlePreference:p.titlePreference,nicknameChoiceVersion:p.nicknameChoiceVersion,nicknameChoiceKind:p.nicknameChoiceKind,wallet:structuredClone(p.wallet),activeSeconds:p.activeSeconds,safetyTurns:p.safetyTurns,safetyCaughtIds:[...p.safetyCaughtIds],eligibleAfter:p.eligibleAfter,safetyDutyVersion:SAFETY_DUTY_VERSION,optOut:p.optOut,hasEntered:p.hasEntered,groundPosition:p.groundPosition,...(p.chipUnlimited?{chipUnlimited:true}:{})};}
  function changed(p){p.lastSavedAt=time;onProfileChange(profile(p));}
  function credit(p,amount,kind,options){
    const before=p.wallet.chips,credited=grantChips(p,amount,options);
    if(credited)try{onReward({id:p.id,kind,amount:p.wallet.chips-before});}catch{}
    return credited;
  }
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
    trigger(id){if(broken.has(id)||!machines[id]||worldEvents?.preparing(id))return false;broken.set(id,{id,at:time,destroyedAt:now()});onEquipmentChange(equipmentState());return true;},
    beginRepair(id,owner='player'){const r=broken.get(id);if(!r||r.owner||[...broken.values()].some(b=>b.owner===owner))return false;r.owner=owner;r.progress=0;return true;},
    setRepairProgress(id,progress){const r=broken.get(id);if(!r?.owner)return false;r.progress=Math.min(1,Math.max(0,progress));return true;},
    cancelRepair(id){const r=broken.get(id);if(!r)return false;delete r.owner;delete r.progress;return true;},
    reset(id){const changed=broken.delete(id);if(changed)onEquipmentChange(equipmentState());return changed;}
  };
  let foupReady=false;
  const store=createFoupStore({ports,initialPortIds:initialSharedPorts,seedStockers:true,isDestroyed:destruction.isDestroyed,
    canPickup:(record,id)=>!worldEvents?.contest.protects(record.id)||worldEvents.contest.playing(id),
    canSupplyStocker:r=>{
      if(r.mode==='cleared')return true;
      if(leases.has(byPort.get(r.portId)?.machineId)||residents.people.some(p=>p.recordId===r.id))return false;
      for(const p of players.values())if(!p.hidden&&distance(p,r)<=20)return false;
      return true;
    },
    onImpact:r=>emit('bounce',r),onShatter:r=>emit('shatter',r),onStockerOut:p=>emit('stocker-out',p),onChange:record=>{
      if(record)worldEvents?.contest.moved(record);
      if(foupReady)onFoupChange(store.checkpoint());
    }});
  function restoreFoups(saved){
    if(time!==0||players.size)throw new Error('FOUP restore is only allowed before the room starts');
    store.restore(saved);
    for(const r of store.records.values())if(r.id.startsWith('vehicle:'))fleet.detachCargo(Number(r.id.slice(8)));
  }
  function detachCargo(v) {
    if(v.cargoDetached)return;
    const s=v.state,r=store.adopt(`vehicle:${v.id}`,{...s.foup},s.parked?s.target.id:null);
    fleet.detachCargo(v.id);
    if(!s.parked)store.launch(r,{...s.foup},{x:0,y:.6,z:(boardingMachine(s.car)?.sign??1)*2.2});
  }
  const residents=createResidentSimulation({fleet,store,destruction,detachCargo,random,getNeighbors:()=>safety.people,protectedIds:()=>[...leases.keys(),...(worldEvents?.protectedIds()??[])],onCue:emit});
  const safety=createSafetyPatrols({random,excludedNames:residents.people.map(p=>p.name)});
  function rememberContestProfile(saved) {
    if(worldEvents?.contest.hasMember(saved.id))contestProfiles.set(saved.id,saved);
  }
  function gatherContestant(id,index,token) {
    const p=players.get(id);
    if(!p)return;
    if(isSafety(p.role))finishDuty(p,p.optOut);
    const held=store.getCarried(id);
    if(held)store.launch(held,{x:p.x,y:.82,z:p.z,yaw:p.heading},{x:0,y:0,z:0});
    release(p);
    const point=gatheringPoint(index);
    Object.assign(p,point,{y:0,speed:0,posture:'stand',carrying:false,contestGather:{...point,token}});
    p.groundPosition={...point,y:0,heading:p.heading};
    changed(p);
  }
  function contestRosterChanged(finishedMembers=[]) {
    if(worldEvents?.contest.live()){
      const operator=players.get(ownerId);
      if(operator&&isSafety(operator.role))finishDuty(operator,operator.optOut);
    }else{
      contestProfiles.clear();
      for(const p of players.values())delete p.contestGather;
      // Let everyone see their own suit through the result, before a new safety shift.
      for(const id of [...finishedMembers,ownerId]){
        const p=players.get(id);
        if(p)p.assignAfter=Math.max(p.assignAfter,time+SAFETY_DUTY.handover);
      }
    }
    rosterChanged();
  }
  function awardContest(id,amount,eventId) {
    if(!amount)return;
    const online=players.get(id);
    const saved=online??contestProfiles.get(id);
    if(!saved)return; // An explicitly deleted account has no wallet to credit.
    const recipient=online??structuredClone(saved);
    if(credit(recipient,amount,'contest-event',{eventId})){
      if(online)changed(online);else onProfileChange(recipient);
    }
  }
  worldEvents=createWorldEvents({now,random,onChange:onEventsChange,
    contestOptions:{ownerId,gather:gatherContestant,rosterChanged:contestRosterChanged,award:awardContest,
      ready:id=>{const p=players.get(id);return Boolean(p&&!p.hidden&&!excludedEvents.has(id));}},
    onBayStart:()=>{for(const p of players.values())if(isSafety(p.role))finishDuty(p,p.optOut);},
    connected:()=>[...players.keys()].filter(id=>/^visitor:[a-f0-9]{64}$/.test(id)&&!excludedEvents.has(id)),isDestroyed:destruction.isDestroyed,
    prepareBay:bayId=>{for(const m of machines)if(m.bayId===bayId){const p=players.get(leases.get(m.id)?.owner);if(p)release(p);residents.yieldMachine(m.id);destruction.reset(m.id);}},
    assignSafety:bayId=>safety.setEventBay(bayId),spawnGolden:(event,count)=>store.spawnGolden(event,count),expireGolden:(id,at)=>store.expireGolden(id,at),
    goldenRemaining:id=>[...store.records.values()].filter(r=>r.gold?.eventId===id&&!r.gold.throwPaid&&!['broken','cleared'].includes(r.mode)).length,
    reward:(id,amount,eventId,seriesId)=>{const p=players.get(id);if(p&&credit(p,amount,'bay-event',{eventId,seriesId}))changed(p);}});
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
    if(worldEvents.bayRunning()||time<nextSafetyAt||[...players.values()].some(p=>isSafety(p.role)))return;
    const candidates=[...players.values()].filter(p=>!worldEvents.contest.team(p.id)&&!p.hidden&&!isRestArea(p,SAFETY_CLEARANCE)&&!p.optOut&&!p.penalty&&p.phase==='idle'&&p.targetId==null&&p.posture==='stand'&&!p.carrying&&time-p.lastSeen<12&&
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
    store.cancelCleanup(p.id);p.cleanTargetId=null;p.cleanBreakSeq=null;
    for(const [id,l] of leases)if(l.owner===p.id){if(l.kind==='repair')destruction.cancelRepair(id);leases.delete(id);}
    for(const v of fleet.vehicles)if(v.playerId===p.id){fleet.leavePassenger(v.id);delete v.playerId;}
    p.rideSeconds=0;p.targetId=null;p.vehicleId=null;p.phase='idle';p.time=0;
  }
  function remove(id) {
    const p=players.get(id);if(!p)return;
    const held=store.getCarried(id);
    if(held)store.launch(held,{x:p.x,y:Math.max(.5,p.y+.82),z:p.z,yaw:p.heading},{x:0,y:0,z:.5});
    release(p);changed(p);rememberContestProfile(profile(p));players.delete(id);revision++;
    if(isSafety(p.role))nextSafetyAt=time+SAFETY_DUTY.handover;
  }
  function join(id,saved=null) {
    if(players.has(id))return {ok:false,error:'duplicate'};
    // One extra seat belongs only to the configured owner, regardless of join
    // order, including socket restoration after a restart. No visitor is evicted.
    const ordinaryVisitors=players.size-(ownerId&&players.has(ownerId)?1:0);
    if(!(ownerId&&id===ownerId)&&ordinaryVisitors>=MAX_VISITORS)return {ok:false,error:'full',message:`자동 캐릭터를 포함해 팹 정원 ${ROOM_CAPACITY}명이 찼어요. 자리가 나면 다시 입장할게요.`};
    const excluded=[...players.values()].flatMap(p=>[p.name,p.civilianName]).concat(residents.people.map(p=>p.name),safety.people.map(p=>p.name));
    const civilianName=claimName(id,'visitor',saved?.civilianName||(!isSafety(saved?.role)?saved?.name:''),excluded,random);
    const caught=new Set(saved?.safetyCaughtIds??[]);
    const role=isSafety(saved?.role)&&caught.size<SAFETY_DUTY.goal&&![...players.values()].some(p=>isSafety(p.role))?saved.role:'visitor';
    const safetyName=(saved?.safetyName||isSafety(saved?.role))?claimName(id,'safety',saved?.safetyName||saved?.name,excluded,random):undefined;
    // Deadlines use accumulated play time, not wall time. Convert the old
    // 90-second deadline once; reconnects must neither erase nor restart rest.
    let eligibleAfter=saved?.eligibleAfter||0;
    if(eligibleAfter>0&&(saved?.safetyDutyVersion||0)<SAFETY_DUTY_VERSION)eligibleAfter+=SAFETY_DUTY.cooldown-LEGACY_SAFETY_COOLDOWN;
    const p={id,name:role==='visitor'?civilianName:safetyName,civilianName,safetyName,role,penalty:saved?.penalty||0,safeUntil:time+12,x:AIR_SHOWER.exit.x,y:0,z:AIR_SHOWER.exit.z,heading:Math.PI,speed:0,posture:'stand',phase:'idle',time:0,hidden:true,lastSeen:time,rate:0,rateAt:time,
      activeSeconds:saved?.activeSeconds||0,safetyTurns:saved?.safetyTurns||0,safetyCaughtIds:caught,eligibleAfter,optOut:saved?.optOut||false,joinOrder:joinOrder++,assignAfter:time+SAFETY_DUTY.handover,hasEntered:saved?.hasEntered||false,groundPosition:saved?.groundPosition??null,lastSavedAt:time};
    p.brokenCount=saved?.brokenCount||0;p.repairedCount=saved?.repairedCount||0;
    p.titlePreference=restoreTitlePreference(saved?.titlePreference,p.brokenCount);
    p.chipUnlimited=hasUnlimitedChips(id,ownerId);p.nicknameChoiceVersion=p.chipUnlimited?NICKNAME_CHOICE_VERSION:(saved?.nicknameChoiceVersion||0);p.nicknameChoiceKind=saved?.nicknameChoiceKind||(saved?'existing':'new');p.wallet=restoreWallet(saved||{});p.rideSeconds=0;
    if(p.groundPosition&&!isBlocked(p.groundPosition.x,p.groundPosition.z,.295))Object.assign(p,p.groundPosition);else p.groundPosition=null;
    const endDutyForEvent=isSafety(p.role)&&(worldEvents.bayRunning()||worldEvents.contest.team(id));
    if(!endDutyForEvent&&isSafety(p.role)&&isRestArea(p,SAFETY_CLEARANCE)){Object.assign(p,restAreaExit(p));p.groundPosition={x:p.x,y:0,z:p.z,heading:p.heading};}
    players.set(id,p);revision++;
    // Restored safety profiles must become visitors before the welcome packet,
    // including joins before the first event update after a room restart.
    if(endDutyForEvent)finishDuty(p,p.optOut);else changed(p);
    return {ok:true,id,name:p.name};
  }
  function pose(id,data) {
    const p=players.get(id);if(!p||!data||!finite(data.x,-58.8,58.8)||!finite(data.z,-88.5,88.5)||!finite(data.y,0,3.56)||!finite(data.heading,-1e5,1e5))return false;
    if(p.contestGather){
      if(distance(data,p.contestGather)<.8&&!data.hidden)delete p.contestGather;
      else data={...data,...p.contestGather,y:0,speed:0};
    }
    const v=p.vehicleId!==null&&p.vehicleId!==undefined?fleet.vehicles.find(v=>v.id===p.vehicleId&&v.playerId===id):null;
    if(isSafety(p.role)&&!v?.passenger){
      const position=isRestArea(p,SAFETY_CLEARANCE)?restAreaExit(p):p;
      if(!canSafetyTraverse(position,data))data={...data,x:position.x,y:0,z:position.z,speed:0};
    }
    Object.assign(p,{x:data.x,y:data.y,z:data.z,heading:data.heading,speed:finite(data.speed,0,5)?data.speed:0,
      posture:(!p.penalty||isRestArea(data))&&['stand','sit','lie'].includes(data.posture)?data.posture:'stand',hidden:Boolean(data.hidden),lastSeen:time});
    if(v?.passenger)Object.assign(p,{x:v.state.car.x,y:2.16,z:v.state.car.z,heading:v.state.car.yaw,phase:'riding'});
    else if(!['press','repair','climb','cleaning'].includes(p.phase))p.phase='idle';
    const l=leases.get(p.targetId);if(l?.owner===id)l.expires=time+30;
    if(p.phase==='repair'&&distance(p,getEmoApproach(machines[p.targetId]).destination)>1.2)release(p);
    if(p.phase==='cleaning'){const r=store.records.get(p.cleanTargetId);if(!r||p.hidden||p.posture!=='stand'||p.y>.15||distance(p,r)>1.65||distance(p,p.cleanPosition)>.18)release(p);}
    p.carrying=Boolean(store.getCarried(id));
    if(!p.hidden&&p.y<.1&&!isBlocked(p.x,p.z,.295)) {
      p.groundPosition={x:p.x,y:0,z:p.z,heading:p.heading};
      if(!p.hasEntered){p.hasEntered=true;changed(p);}
    }
    return true;
  }
  function titleState(id) {
    const p=players.get(id);if(!p)return null;
    const operator=hasUnlimitedChips(id,ownerId);
    return {preference:p.titlePreference,brokenCount:p.brokenCount,operator,titleId:(operator?OPERATOR_TITLE:destructionTitle(p.brokenCount,p.titlePreference))?.id??''};
  }
  function nicknameState(id) {
    const p=players.get(id);if(!p)return null;
    const freeChoice=p.nicknameChoiceVersion<NICKNAME_CHOICE_VERSION,ticketCount=p.wallet.nicknameTickets||0;
    return {canChoose:!p.chipUnlimited&&(freeChoice||ticketCount>0),freeChoice,ticketCount,purchaseCount:p.wallet.nicknamePurchases||0,kind:freeChoice?p.nicknameChoiceKind:'ticket',name:p.civilianName};
  }
  function nameAvailable(id,name) {
    if(nicknameAvailable)return nicknameAvailable(id,name);
    const key=nicknameKey(name);return ![...residents.people,...safety.people,...players.values()].some(p=>p.id!==id&&[p.name,p.civilianName,p.safetyName].some(n=>n&&nicknameKey(n)===key));
  }
  function applyNickname(id,name,{useTicket=false}={}) {
    const p=players.get(id);if(!p||(useTicket&&!(p.wallet.nicknameTickets>0))||!nameAvailable(id,name)||(replaceNickname&&!replaceNickname(id,name)))return false;
    p.civilianName=name;if(!isSafety(p.role))p.name=name;
    p.nicknameChoiceVersion=NICKNAME_CHOICE_VERSION;
    if(useTicket){p.wallet.nicknameTickets--;p.wallet.revision++;}
    changed(p);rosterChanged();return true;
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
    worldEvents.update();
    if(kind==='contest-join')return worldEvents.contest.join(id,data.eventId);
    if(kind==='bay-travel'){
      const destination=worldEvents.travel(data.eventId);
      if(!destination)return fail('지금은 진행 중인 베이 이벤트가 없어요');
      if(p.hidden)return fail('팹에 입장한 뒤 이동해 주세요');
      if(p.vehicleId!=null||p.y>.15||store.getCarried(id))return fail('OHT에서 내려 FOUP을 내려놓은 뒤 이동해 주세요');
      if(time<(p.nextEventTravel??0))return fail('잠시 후 다시 눌러주세요');
      release(p);Object.assign(p,{...destination,y:0,speed:0,posture:'stand'});p.nextEventTravel=time+2;
      p.groundPosition={x:p.x,y:0,z:p.z,heading:p.heading};changed(p);return {ok:true,eventTravel:destination};
    }
    if(kind==='title-select') {
      if(hasUnlimitedChips(id,ownerId))return fail('이 계정은 운영자 칭호로 표시돼요.');
      if(!canSelectTitle(data.preference,p.brokenCount))return fail('아직 획득하지 못한 칭호예요.');
      if(p.titlePreference!==data.preference){p.titlePreference=data.preference;changed(p);}
      return {ok:true,titles:titleState(id)};
    }
    if(kind==='nickname-ticket-buy') {
      if(p.chipUnlimited)return fail('이 계정의 지정 닉네임은 유지됩니다.');
      if(p.nicknameChoiceVersion<NICKNAME_CHOICE_VERSION)return fail('무료 닉네임 변경 기회를 먼저 사용해 주세요.');
      if(p.wallet.nicknameTickets>0)return {ok:true,nickname:nicknameState(id)};
      const purchases=p.wallet.nicknamePurchases||0;
      if(data.purchaseCount!==purchases)return fail('구매 내역이 바뀌었어요. 상점에서 다시 확인해 주세요.');
      if(p.wallet.chips<NICKNAME_TICKET_PRICE)return fail('칩이 부족해요. 닉네임 변경권은 1,000칩이에요.');
      p.wallet.chips-=NICKNAME_TICKET_PRICE;p.wallet.nicknameTickets=1;p.wallet.nicknamePurchases=purchases+1;p.wallet.revision++;
      changed(p);return {ok:true,nickname:nicknameState(id)};
    }
    if(kind==='nickname-check'||kind==='nickname-confirm') {
      if(p.chipUnlimited)return fail('이 계정의 지정 닉네임은 유지됩니다.');
      const result=checkNickname(data.name);if(!result.ok)return result;
      const freeChoice=p.nicknameChoiceVersion<NICKNAME_CHOICE_VERSION,useTicket=!freeChoice;
      if(!freeChoice&&!(p.wallet.nicknameTickets>0)){
        if(kind==='nickname-confirm'&&result.name===p.civilianName)return {ok:true,name:p.civilianName,nickname:nicknameState(id)};
        return fail('무료 변경 기회를 사용했어요. 상점에서 닉네임 변경권을 구매할 수 있어요.');
      }
      if(useTicket&&result.name===p.civilianName)return fail('현재 이름과 다른 닉네임을 입력해 주세요.');
      if(!nameAvailable(id,result.name))return fail('이미 사용 중인 닉네임이에요. 다른 이름을 골라 주세요.');
      if(kind==='nickname-check')return {ok:true,name:result.name};
      if(data.confirmed!==true)return fail('안내를 확인하고 확정하기를 눌러 주세요.');
      if(useTicket&&data.ticketPurchase!==p.wallet.nicknamePurchases)return fail('변경권 정보가 바뀌었어요. 상점에서 다시 열어 주세요.');
      if(!applyNickname(id,result.name,{useTicket}))return fail('이미 사용 중인 닉네임이에요. 다른 이름을 골라 주세요.');
      return {ok:true,name:p.civilianName,nickname:nicknameState(id)};
    }
    if(['purchase','equip','unequip'].includes(kind)){const result=wardrobeCommand(p,kind,data);if(result.ok){changed(p);rosterChanged();}return result;}
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
    const contestMove=worldEvents.contest.playing(id)&&['pickup','throw','place','stocker'].includes(kind);
    if(p.penalty && !contestMove && !(kind==='cancel'||['repair','finish'].includes(kind)||kind==='claim'&&data.kind==='repair'))return fail(`장비를 ${p.penalty}대 더 고쳐야 다시 팹뿌를 하실 수 있습니다.`);
    if(kind==='cancel'){release(p);return {ok:true};}
    if(kind==='clean') {
      const r=store.records.get(data.id);
      if(p.phase==='cleaning'&&p.cleanTargetId===data.id&&p.cleanBreakSeq===data.breakSeq)return {ok:true};
      if(!r||r.mode!=='broken'||r.breakSeq!==data.breakSeq)return fail('이미 치워진 잔해예요');
      if(p.hidden||p.posture!=='stand'||p.y>.15||distance(p,r)>1.65)return fail('잔해 가까이 다가가 주세요');
      if(store.getCarried(id)||p.vehicleId!=null)return fail('FOUP을 내려놓고 청소해 주세요');
      if(r.cleaner&&r.cleaner!==id)return fail('다른 사람이 청소하고 있어요');
      if(r.damageAge<1.4)return fail('웨이퍼가 바닥에 떨어진 뒤 치워주세요');
      release(p);
      if(!store.beginCleanup(r.id,id,data.breakSeq))return fail('잔해를 다시 눌러주세요');
      p.phase='cleaning';p.time=0;p.cleanTargetId=r.id;p.cleanBreakSeq=r.breakSeq;p.cleanPosition={x:p.x,z:p.z};p.heading=Math.atan2(r.x-p.x,r.z-p.z);p.speed=0;p.nextSweep=0;
      r.cleanHeading=p.heading;
      return {ok:true,duration:FOUP_CLEAN_SECONDS};
    }
    if(p.phase==='cleaning')return fail('청소를 끝내거나 움직여 멈춘 뒤 해주세요');
    if(kind==='claim') {
      const m=machines[data.id];
      if(!m||!['emo','repair'].includes(data.kind)||store.getCarried(id))return fail('FOUP을 내려놓고 다시 눌러주세요');
      if(worldEvents.preparing(m.id))return fail('이벤트 준비 중이에요. 3·2·1 시작 신호를 기다려주세요');
      if(destruction.isDestroyed(m.id)!==(data.kind==='repair'))return fail('장비 상태가 바뀌었어요');
      return claim(p,m,data.kind)?{ok:true}:fail();
    }
    if(['press','repair','finish','explode'].includes(kind)) {
      const m=machines[data.id],l=leases.get(data.id);
      if(!m||l?.owner!==id||distance(p,getEmoApproach(m).destination)>1.2)return fail('장비 앞으로 가까이 다가가 주세요');
      if(kind==='press'&&l.kind==='emo'){if(l.started===undefined)l.started=time;p.phase='press';p.time=0;emit('press',p);return {ok:true};}
      if(kind==='explode'&&l.kind==='emo'&&l.started!==undefined&&time-l.started>=.55){const ok=destruction.trigger(m.id);if(ok){p.brokenCount++;credit(p,5,'destroy',{destructionId:m.id});}release(p);if(ok){changed(p);worldEvents.update();}return {ok};}
      if(kind==='repair'&&l.kind==='repair'){if(!destruction.beginRepair(m.id,id))return fail();l.started=time;p.phase='repair';p.time=0;return {ok:true};}
      if(kind==='finish'&&l.kind==='repair'&&l.started!==undefined&&time-l.started>=4.7){if(!destruction.reset(m.id))return fail();p.repairedCount++;credit(p,3,'repair');p.penalty=Math.max(0,p.penalty-1);if(!p.penalty)p.safeUntil=time+12;emit('complete',p);release(p);changed(p);return {ok:true};}
      return fail('동작이 끝난 뒤 다시 눌러주세요');
    }
    if(kind==='stocker'){
      const s=stockerById.get(data.id),port=s?.ports.find(port=>port.kind===data.port);
      if(!port||p.hidden||p.y>.15||p.posture!=='stand'||p.vehicleId!=null||!['idle','approach'].includes(p.phase)||distance(p,port.approach)>1.2)return fail('스토커 로드포트 앞으로 가까이 와주세요');
      if(data.recordId!==undefined&&data.recordId!==null&&typeof data.recordId!=='string')return fail('FOUP을 다시 눌러주세요');
      const held=store.getCarried(id);
      if(data.port==='IN'&&worldEvents.isGolden(held)&&(!data.recordId||data.recordId===held.id)){
        if(!store.consumeGolden(held.id,id))return fail('들고 있는 황금 FOUP을 다시 확인해 주세요');
        credit(p,200,'golden-deposit');p.carrying=false;changed(p);emit('place',p);return {ok:true,phase:'golden-deposit',reward:200};
      }
      const result=data.port==='IN'?store.stockerPut(s.id,id,data.recordId):store.stockerGet(s.id,id,data.recordId);
      if(result.ok){p.carrying=Boolean(store.getCarried(id));emit(result.phase==='pickup'?'pickup':'place',p);}
      return result;
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
      const contestThrow=worldEvents.contest.track(id,r);
      const golden=!drop&&worldEvents.isGolden(r)&&!r.gold.throwPaid;
      if(golden)r.gold.throwPaid=true;
      store.launch(r,{x:p.x+Math.sin(p.heading)*.34,y:Math.max(.4,p.y+.82),z:p.z+Math.cos(p.heading)*.34,yaw:p.heading+Math.PI},
        {x:Math.sin(p.heading)*speed,y:drop?.2:3.1,z:Math.cos(p.heading)*speed},{shatter:!drop&&!contestThrow});p.carrying=false;emit(drop?'place':'throw',p);if(!drop){credit(p,golden?50:1,golden?'golden-throw':'throw');changed(p);}return {ok:true,...(contestThrow?{contestThrow:true}:{})};
    }
    if(kind==='board') {
      const v=fleet.vehicles[data.id],m=v&&boardingMachine(v.state.car);
      if(!v)return fail('탑승할 OHT를 다시 눌러주세요');
      if(!m)return fail(NO_LOADPORT_MESSAGE);
      if(destruction.isDestroyed(m.id))return fail('장비가 부셔져서 탈 수가 없어요');
      if(v.residentId||v.playerId||store.getCarried(id))return fail('다른 OHT를 누르거나 FOUP을 내려놓아 주세요');
      if(distance(p,v.state.car)>28||!claim(p,m,'board'))return fail();
      v.playerId=id;fleet.holdVehicle(v.id,true);p.vehicleId=v.id;return {ok:true,machineId:m.id,approach:boardingApproach(v.state.car,m),boardingCar:{...v.state.car}};
    }
    if(kind==='climb') {
      const v=fleet.vehicles[p.vehicleId],m=v&&boardingMachine(v.state.car);
      if(!v||v.playerId!==id)return fail('탑승할 OHT를 다시 눌러주세요');
      if(!m)return fail(NO_LOADPORT_MESSAGE);
      if(destruction.isDestroyed(m.id))return fail('장비가 부셔져서 탈 수가 없어요');
      if(distance(p,v.state.car)>1.6)return fail('로드포트 앞으로 조금 더 가까이 와 주세요');
      detachCargo(v);p.phase='climb';p.time=0;return {ok:true,boardingCar:{...v.state.car}};
    }
    if(kind==='ride') {
      const v=fleet.vehicles[p.vehicleId];if(!v||v.playerId!==id||p.phase!=='climb'||p.time<2.3)return fail();
      fleet.boardPassenger(v.id);leases.delete(p.targetId);p.targetId=null;p.phase='riding';p.time=0;p.rideSeconds=0;return {ok:true};
    }
    if(kind==='dismount'){if(p.vehicleId===null||p.vehicleId===undefined)return fail();release(p);return {ok:true};}
    return fail('알 수 없는 조작이에요');
  }
  function step(dt) {
    dt=Math.min(.1,Math.max(0,dt));time+=dt;
    for(const p of players.values())if(time-p.lastSeen>40)remove(p.id);
    worldEvents.update();fleet.step(dt);store.step(dt);residents.update(dt);
    for(const [id,l] of leases)if(time>l.expires){const p=players.get(l.owner);if(p)release(p);else leases.delete(id);}
    for(const p of players.values()) {
      if(time-p.lastSeen>40){remove(p.id);continue;}
      p.time+=dt;
      if(p.phase==='cleaning'){
        const r=store.records.get(p.cleanTargetId);
        if(!r||r.cleaner!==p.id||r.breakSeq!==p.cleanBreakSeq||p.hidden||p.posture!=='stand'||p.y>.15||distance(p,r)>1.65||distance(p,p.cleanPosition)>.18)release(p);
        else {
          r.cleanProgress=Math.min(1,p.time/FOUP_CLEAN_SECONDS);
          if(p.time>=(p.nextSweep||0)){emit('sweep',p);p.nextSweep=p.time+.52;}
          if(p.time+1e-8>=FOUP_CLEAN_SECONDS){r.cleanProgress=1;const golden=worldEvents.isGolden(r);if(store.finishCleanup(r.id,p.id,p.cleanBreakSeq)){if(r.gold){r.gold=null;store.notifyChange();}credit(p,golden?10:FOUP_CLEAN_REWARD,golden?'golden-clean':'clean');changed(p);}release(p);}
        }
      }
      p.emoteLeft=Math.max(0,(p.emoteUntil||0)-time);if(!p.emoteLeft)p.emote='';
      if(!p.hidden&&time-p.lastSeen<12&&(Math.abs(p.x)>6||p.z<70))p.activeSeconds+=dt;
      if(time-p.lastSavedAt>=30)changed(p);
      if(p.phase==='repair'){const l=leases.get(p.targetId);if(l?.owner===p.id)destruction.setRepairProgress(p.targetId,Math.min(.99,(time-l.started)/5));}
      const held=store.getCarried(p.id);p.carrying=Boolean(held);
      if(held)Object.assign(held,{x:p.x+Math.sin(p.heading)*.34,y:p.y+(p.posture==='sit'?.48:p.posture==='lie'?.62:.82),z:p.z+Math.cos(p.heading)*.34,yaw:p.heading+Math.PI});
      if(p.phase==='riding'){const v=fleet.vehicles[p.vehicleId];if(v?.playerId===p.id&&v.passenger){Object.assign(p,{x:v.state.car.x,y:2.16,z:v.state.car.z,heading:v.state.car.yaw});p.rideSeconds+=dt;const earned=Math.floor((p.rideSeconds+1e-8)/10);if(earned){p.rideSeconds=Math.max(0,p.rideSeconds-earned*10);credit(p,earned,'oht');changed(p);}}else p.rideSeconds=0;}else p.rideSeconds=0;
    }
    assignSafetyDuty();
    const visitors=[...players.values()],targets=[...visitors,...residents.people];safety.update(dt,targets,time);
    for(const guard of [...safety.people,...visitors.filter(p=>isSafety(p.role))])for(const p of targets)if(canCatch(guard,p,time)&&!worldEvents.contest.team(p.id)) {
      if(players.has(p.id))catchPlayer(p,guard);
      else if(residents.beginSafetyLap(p))recordCatch(guard,p,{penalty:3});
    }
  }
  function roster(){return [...residents.people,...safety.people,...players.values()].map(p=>{
    const team=worldEvents?.contest.team(p.id);
    const outfit=p.wallet?.equipped??npcOutfit(p.id);
    return team?[p.id,p.name,p.role,contestOutfit(outfit,team),team]:[p.id,p.name,p.role,outfit];
  });}
  function ranking(){return rankScores([...getHistoricalScores(),...residents.people,...safety.people,...[...players.values()].map(p=>({...p,name:p.civilianName||p.name}))]);}
  function snapshot(full=false) {
    const foups=[];
    for(const r of store.records.values())if(!r.original){const row=foupPacket(r),key=JSON.stringify(row);if(full||foupVersions.get(r.id)!==key)foups.push(row);if(!full)foupVersions.set(r.id,key);}
    const leaderboard=ranking(),rankingKey=JSON.stringify(leaderboard),includeRanking=full||rankingKey!==lastRanking;
    if(!full)lastRanking=rankingKey;
    return {type:'frame',v:PROTOCOL,t:round(time),rev:revision,count:players.size,...(includeRanking?{leaderboard}:{}),people:[...residents.people,...safety.people,...players.values()].map(p=>actorPacket({...p,carrying:Boolean(store.getCarried(p.id)),titleId:players.has(p.id)?titleState(p.id).titleId:npcDestructionTitle(p.id,p.role)?.id??''})),
      broken:[...broken.values()].map(r=>[r.id,round(time-r.at),r.progress??null,r.owner??null]),foups,
      fleet:fleet.vehicles.map(v=>{const s=v.state;return [v.id,round(s.car.x),round(s.car.z),round(s.car.yaw),round(s.foup.x),round(s.foup.y),round(s.foup.z),round(s.foup.yaw),round(s.gripperY),s.phase,s.parked,round(s.lowered),s.target.id,s.destination.id,Boolean(v.cargoDetached),Boolean(v.passenger),Boolean(v.boardingHold),v.residentId??v.playerId??null,s.waiting,s.delivered];}),
      events:full?[]:events.splice(0),totals:residents.state.actions,worldEvents:{...worldEvents.view(),...(worldEvents.contest.live()?{gather:[...players.values()].filter(p=>p.contestGather).map(p=>[p.id,p.contestGather])}:{})}};
  }
  store.initializeStockers();
  foupReady=true;
  return {titleState,nicknameState,applyNickname,wallet:id=>players.has(id)?walletView(players.get(id)):null,join,remove,pose,command,step,snapshot,roster,ranking,equipmentState,restoreEquipment,restoreFoups,worldEvents,rememberContestProfile,forgetContestProfile:id=>contestProfiles.delete(id),players,fleet,store,residents,safety,destruction,profile:id=>players.has(id)?profile(players.get(id)):null,get time(){return time;}};
}
