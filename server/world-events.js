import {bays} from '../src/layout.js';

export const EVENT_RULES=Object.freeze({goldenHours:[8,12,16,20],goldenCount:20,goldenDuration:600000,bayPlayers:15,bayNotice:60000,bayDuration:60000,bayCooldown:7200000,bayReward:200,resultDuration:10000});
const HOUR=3600000,DAY=24*HOUR,KST=9*HOUR;
export function goldenSlot(at){
  const day=Math.floor((at+KST)/DAY)*DAY-KST;
  return EVENT_RULES.goldenHours.map(h=>day+h*HOUR).find(start=>at>=start&&at<start+EVENT_RULES.goldenDuration)??null;
}
export function nextGoldenSlot(at){
  const day=Math.floor((at+KST)/DAY)*DAY-KST;
  return EVENT_RULES.goldenHours.map(h=>day+h*HOUR).find(start=>start>at)??day+DAY+EVENT_RULES.goldenHours[0]*HOUR;
}

// Wall-clock deadlines survive hibernation/restarts. Persist transitions only;
// no new timer, storage read, or whole-fab path search is needed per frame.
export function createWorldEvents({now=Date.now,random=Math.random,connected=()=>[],isDestroyed,prepareBay,assignSafety,spawnGolden,expireGolden,goldenRemaining,reward,onChange=()=>{}}){
  let state={version:1,lastGoldenSlot:0,nextBayAt:0,bay:null,golden:null},reconcile=true,lastObservedAt=now();
  const save=()=>onChange(structuredClone(state));
  const idsFor=id=>bays[id]?.machines.map(m=>m.id)??[];
  const bayIds=()=>state.bay?idsFor(state.bay.bayId):[];
  const liveBay=()=>state.bay&&['preparing','active'].includes(state.bay.phase);
  const recentResult=()=>state.lastResult&&now()-state.lastResult.finishedAt<EVENT_RULES.resultDuration?state.lastResult:null;
  function safetyBays(){return [...new Set([...(liveBay()?[state.bay.bayId]:[]),...(recentResult()?[state.lastResult.bayId]:[])])];}
  function finish(at){
    const b=state.bay;b.phase='failed';b.finishedAt=at;
    assignSafety(safetyBays());save();
  }
  function clearBay(at){
    const b=state.bay,cleared=[...(b.clearedBayIds??[]),b.bayId],count=cleared.length;
    const choices=count<(b.bayLimit??1)?bays.filter(bay=>!cleared.includes(bay.id)):[],next=choices.length?choices[Math.min(choices.length-1,Math.floor(random()*choices.length))]:null;
    const awardId=count===1?b.id:b.id+':clear:'+count;
    state.lastResult={id:awardId,seriesId:b.id,bayId:b.bayId,phase:'success',finishedAt:at,endsAt:b.endsAt,clearedCount:count,totalReward:count*EVENT_RULES.bayReward,...(next?{next:{bayId:next.id}}:{chainEndReason:'complete'})};
    for(const id of connected())reward(id,EVENT_RULES.bayReward,awardId,b.id);
    b.clearedBayIds=cleared;b.clearedCount=count;
    if(next){b.bayId=next.id;b.round=count+1;b.roundStartedAt=at;prepareBay(next.id);}
    else{b.phase='success';b.finishedAt=at;}
    // The original start/deadline stays unchanged. Travel and the next bay
    // consume the same sixty seconds; every completed bay is credited once.
    assignSafety(safetyBays());save();
  }
  function remember(request,kind,event){
    if(!request)return;
    const receipt={requestId:request,kind,...(kind==='bay'?{bayCount:event.bayLimit??1}:{}),event:{id:event.id,bayId:event.bayId,startsAt:event.startsAt,endsAt:event.endsAt,...(kind==='bay'?{bayLimit:event.bayLimit??1}:{})}};
    state.manualRequests=[...(state.manualRequests||[]),receipt].slice(-32);
  }
  function beginBay(at,request,bayCount=1){
    const choices=bays.filter(bay=>bay.id!==state.bay?.bayId),bay=choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];
    const startsAt=at+EVENT_RULES.bayNotice;
    state.bay={id:'bay:'+startsAt,seriesId:'bay:'+startsAt,bayId:bay.id,bayLimit:bayCount,phase:'preparing',announcedAt:at,startsAt,endsAt:startsAt+EVENT_RULES.bayDuration,round:1,clearedCount:0,clearedBayIds:[]};
    state.lastResult=null;
    state.nextBayAt=startsAt+EVENT_RULES.bayCooldown;
    remember(request,'bay',state.bay);prepareBay(bay.id);assignSafety(bay.id);save();
  }
  function beginGolden(at,request){
    expireGolden(null,at);
    const event={id:'gold:'+at,startsAt:at,endsAt:at+EVENT_RULES.goldenDuration};
    event.recordIds=spawnGolden(event,EVENT_RULES.goldenCount);state.golden=event;
    remember(request,'golden',event);save();
  }
  function update(){
    const at=now();lastObservedAt=at;
    if(reconcile){expireGolden(state.golden?.id??null,at);assignSafety(safetyBays());reconcile=false;}
    if(state.golden&&at>=state.golden.endsAt){expireGolden(null,at);state.golden=null;save();}
    const slot=goldenSlot(at);
    if(slot!==null&&slot>state.lastGoldenSlot){
      state.lastGoldenSlot=slot;beginGolden(slot);
    }
    const b=state.bay;
    if(b?.phase==='preparing'&&at>=b.startsAt){
      if(at>=b.endsAt)finish(at);
      else{prepareBay(b.bayId);b.phase='active';save();}
    }
    if(b?.phase==='active'){
      if(at>=b.endsAt)finish(at);
      else if(bayIds().every(isDestroyed))clearBay(at);
    }
    assignSafety(safetyBays());
    if(!state.golden&&!liveBay()&&at>=state.nextBayAt&&nextGoldenSlot(at)>=at+EVENT_RULES.bayNotice+EVENT_RULES.bayDuration&&connected().length>=EVENT_RULES.bayPlayers){
      beginBay(at);
    }
  }
  function startManual(kind,requestId,bayCount=1){
    if(!['bay','golden'].includes(kind)||![1,2].includes(bayCount)||kind==='golden'&&bayCount!==1||typeof requestId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(requestId))return {ok:false,status:400,message:'이벤트 요청을 확인해 주세요.'};
    const previous=state.manualRequests?.find(r=>r.requestId===requestId);
    if(previous)return previous.kind===kind&&(previous.bayCount??1)===bayCount?{ok:true,replayed:true,event:previous.event}:{ok:false,status:409,message:'이미 사용한 요청이에요. 다시 눌러 주세요.'};
    update();const at=now();
    if(state.golden||liveBay())return {ok:false,status:409,message:'이미 진행 중인 이벤트가 있어요. 종료 후 시작해 주세요.'};
    const needed=kind==='bay'?EVENT_RULES.bayNotice+EVENT_RULES.bayDuration:EVENT_RULES.goldenDuration;
    if(nextGoldenSlot(at)<at+needed)return {ok:false,status:409,message:`정기 황금 FOUP까지 ${kind==='bay'?'2':'10'}분이 남지 않아 지금은 시작할 수 없어요.`};
    if(kind==='bay')beginBay(at,requestId,bayCount);else beginGolden(at,requestId);
    return {ok:true,replayed:false,event:state.manualRequests.at(-1).event};
  }
  function restore(saved){
    if(saved===undefined)return;
    if(saved?.version!==1||!Number.isFinite(saved.lastGoldenSlot)||!Number.isFinite(saved.nextBayAt))throw Error('Invalid world event checkpoint');
    const b=saved.bay,g=saved.golden;
    if(b&&(!bays[b.bayId]||!['preparing','active','success','failed'].includes(b.phase)||b.id!=='bay:'+b.startsAt||!Number.isFinite(b.announcedAt)||b.startsAt-b.announcedAt!==EVENT_RULES.bayNotice||b.endsAt-b.startsAt!==EVENT_RULES.bayDuration))throw Error('Invalid bay event checkpoint');
    if(b?.bayLimit!==undefined&&![1,2].includes(b.bayLimit))throw Error('Invalid bay count checkpoint');
    if(b?.clearedBayIds!==undefined&&(!Array.isArray(b.clearedBayIds)||b.clearedBayIds.length>(b.bayLimit??1)||new Set(b.clearedBayIds).size!==b.clearedBayIds.length||b.clearedBayIds.some(id=>!Number.isInteger(id)||!bays[id])||b.clearedCount!==b.clearedBayIds.length||b.phase!=='success'&&b.clearedBayIds.includes(b.bayId)))throw Error('Invalid cleared bay checkpoint');
    const r=saved.lastResult;
    if(r&&(!b||r.seriesId!==b.id||!bays[r.bayId]||r.phase!=='success'||!Number.isFinite(r.finishedAt)||!Number.isInteger(r.clearedCount)||r.clearedCount<1||r.clearedCount>(b.bayLimit??1)||r.id!==(r.clearedCount===1?b.id:b.id+':clear:'+r.clearedCount)))throw Error('Invalid bay reward checkpoint');
    if(g&&(g.id!=='gold:'+g.startsAt||g.endsAt-g.startsAt!==EVENT_RULES.goldenDuration||!Array.isArray(g.recordIds)||g.recordIds.length>EVENT_RULES.goldenCount||new Set(g.recordIds).size!==g.recordIds.length))throw Error('Invalid golden event checkpoint');
    if(saved.manualRequests!==undefined&&(!Array.isArray(saved.manualRequests)||saved.manualRequests.length>32||saved.manualRequests.some(r=>!r||!['bay','golden'].includes(r.kind)||typeof r.requestId!=='string'||!r.event||!Number.isFinite(r.event.startsAt)||!Number.isFinite(r.event.endsAt))))throw Error('Invalid manual event checkpoint');
    state=structuredClone(saved);reconcile=true;
  }
  function view(){
    const at=lastObservedAt,b=state.bay,g=state.golden;
    return {serverNow:at,bay:b&&(liveBay()||at-(b.finishedAt??0)<EVENT_RULES.resultDuration)?{...b,total:bays[b.bayId].machines.length,remaining:bayIds().filter(id=>!isDestroyed(id)).length,reward:EVENT_RULES.bayReward}:null,
      lastResult:recentResult()?structuredClone(state.lastResult):null,
      golden:g?{id:g.id,startsAt:g.startsAt,endsAt:g.endsAt,total:g.recordIds.length,remaining:goldenRemaining(g.id)}:null};
  }
  return {update,restore,view,startManual,controlState:()=>({...view(),serverNow:now(),nextGoldenAt:nextGoldenSlot(now())}),checkpoint:()=>structuredClone(state),
    preparing:id=>state.bay?.phase==='preparing'&&bays[state.bay.bayId].machines.some(m=>m.id===id),
    protectedIds:()=>[...new Set([...safetyBays().flatMap(idsFor),...(state.bay?.phase==='success'&&now()-state.bay.finishedAt<EVENT_RULES.resultDuration?bayIds():[])])],
    travel:id=>liveBay()&&id===state.bay.id?{x:Math.sign(bays[state.bay.bayId].x)*4,z:bays[state.bay.bayId].z,bayId:state.bay.bayId}:null,
    isGolden:r=>Boolean(r?.gold&&state.golden?.id===r.gold.eventId&&now()<state.golden.endsAt)};
}
