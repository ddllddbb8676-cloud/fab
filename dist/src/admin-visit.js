import {canWalkSegment} from './walking.js?v=de3c32eddc76';

export const ADMIN_VISIT_STORAGE_KEY='fab-admin-visit-v1';
const INTENT_MS=120000,REPLAN_MS=1500,STALL_MS=3000,ARRIVAL_DISTANCE=1.1;
const visitorId=value=>typeof value==='string'&&/^visitor:[a-f0-9]{64}$/.test(value);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<58.8&&Math.abs(p.z)<88.5;

// The dashboard hands off one intention, not a position or an authorization.
// The existing room welcome still has to confirm the owner's privilege.
export function createAdminVisit({storage,now=Date.now,getWalker,walkTo,stopWalk,canTraverse=()=>true,canWalk=canWalkSegment,onToast=()=>{}}) {
  let intent=null,status='idle',targetName='',notice='',authorized=false,seenFrame=false,target=null,lastFrameAt=0,lastFrameTime=-Infinity;
  let ownedPath=null,plannedTarget=null,lastRouteAt=0,startedAt=0,lastProgressAt=0,lastPosition=null;
  try{
    const raw=storage?.getItem(ADMIN_VISIT_STORAGE_KEY);
    if(raw){
      // Refuse to start if consumption fails: a reload must not repeat a visit.
      storage.removeItem(ADMIN_VISIT_STORAGE_KEY);
      const value=JSON.parse(raw),t=now();
      if(visitorId(value?.target?.id)&&typeof value.target.name==='string'&&value.target.name.trim()&&value.target.name.length<=64&&
        Number.isFinite(value.expiresAt)&&value.expiresAt>t&&value.expiresAt-t<=INTENT_MS){
        intent={target:{id:value.target.id,name:value.target.name},expiresAt:value.expiresAt};targetName=value.target.name;status='pending';
      }else{status='expired';notice='이동 요청이 만료됐어요. 운영 현황에서 다시 선택해 주세요.';}
    }
  }catch{status='cancelled';notice='이동 요청을 확인하지 못했어요. 운영 현황에서 다시 선택해 주세요.';}

  function finish(next,message=''){
    const walker=getWalker(),owns=ownedPath&&walker.path===ownedPath;
    status=next;intent=null;target=null;ownedPath=null;plannedTarget=null;
    if(owns)stopWalk();
    if(message)onToast(message);
  }
  function routeTo(walker,t){
    const angle=Math.atan2(walker.position.z-target.z,walker.position.x-target.x);
    // Keep world-axis candidates: a 65 cm tool gap has very little side clearance.
    const angles=[angle,0,Math.PI/2,Math.PI,-Math.PI/2,angle+Math.PI/4,angle-Math.PI/4,angle+Math.PI];
    const seen=new Set(),destinations=angles.map(a=>({x:target.x+Math.cos(a)*.9,z:target.z+Math.sin(a)*.9}))
      .filter(p=>{const key=p.x.toFixed(6)+','+p.z.toFixed(6);if(seen.has(key))return false;seen.add(key);return true;})
      .sort((a,b)=>distance(walker.position,a)-distance(walker.position,b));
    for(const destination of destinations){
      if(!point(destination)||!canTraverse(destination,destination)||!canTraverse(destination,target)||!canWalk(destination,target))continue;
      if(!walkTo(destination))continue;
      ownedPath=getWalker().path;plannedTarget={x:target.x,z:target.z};lastRouteAt=t;
      return true;
    }
    return false;
  }
  return {
    welcome(data){
      if(!intent)return;
      authorized=data?.privileges?.unlimitedChips===true;
      if(!authorized){finish('cancelled','운영자 계정에서만 찾아갈 수 있어요.');return;}
      if(data.id===intent.target.id)finish('cancelled','본인에게는 이동할 수 없어요.');
    },
    frame(frame){
      if(!intent||!Array.isArray(frame?.people))return;
      if(Number.isFinite(frame.t)){
        if(frame.t<=lastFrameTime)return;
        lastFrameTime=frame.t;
      }
      const row=frame.people.find(p=>Array.isArray(p)&&p[0]===intent.target.id);
      seenFrame=true;lastFrameAt=now();
      target=row?{x:row[1],y:row[2],z:row[3],phase:row[7],hidden:row[12]}:null;
    },
    update(_dt,{connected=false,ready=false}={}){
      const t=now();
      if(notice&&ready){onToast(notice);notice='';}
      if(!intent)return;
      if(status==='pending'&&t>=intent.expiresAt){finish('expired','이동 요청이 만료됐어요. 운영 현황에서 다시 선택해 주세요.');return;}
      if(!connected){if(authorized)finish('cancelled','연결이 끊겨 걸어가기를 멈췄어요.');return;}
      if(!authorized||!ready)return;
      const walker=getWalker();
      if(status==='walking'&&walker.path!==ownedPath){finish('cancelled');return;}
      if(walker.locked||walker.joystickActive||walker.mode!=='walk'||walker.posture!=='stand'){
        finish('cancelled');return;
      }
      if(!seenFrame)return;
      if(t-lastFrameAt>5000){finish('unavailable','위치를 확인하지 못해 걸어가기를 멈췄어요.');return;}
      if(!target){finish('unavailable','그 이용자가 접속을 종료했어요.');return;}
      if(!point(target)||!Number.isFinite(target.y)||target.hidden||target.y>.3||['riding','climb','climbing'].includes(target.phase)){
        finish('unavailable','지금은 그 이용자에게 걸어갈 수 없어요. 잠시 뒤 다시 선택해 주세요.');return;
      }
      if(distance(walker.position,target)<=ARRIVAL_DISTANCE&&canTraverse(walker.position,target)&&canWalk(walker.position,target)){
        finish('arrived',`${targetName}님 가까이에 도착했어요.`);return;
      }
      if(status==='pending'){
        if(!routeTo(walker,t)){finish('unavailable','그 이용자 가까이까지 걸어갈 수 있는 통로가 없어요.');return;}
        status='walking';startedAt=lastProgressAt=t;lastPosition={x:walker.position.x,z:walker.position.z};
        onToast(`${targetName}님께 걸어가요. 조이스틱을 움직이면 멈춰요.`);return;
      }
      if(t-startedAt>=INTENT_MS){finish('cancelled','오래 걸려 이동을 멈췄어요. 운영 현황에서 다시 선택해 주세요.');return;}
      if(distance(walker.position,lastPosition)>.04){lastProgressAt=t;lastPosition={x:walker.position.x,z:walker.position.z};}
      if(t-lastProgressAt>=STALL_MS){finish('unavailable','통로가 막혀 걸어가기를 멈췄어요.');return;}
      if(t-lastRouteAt>=REPLAN_MS&&(!walker.path.length||distance(target,plannedTarget)>1.5)){
        if(!routeTo(walker,t))finish('unavailable','그 이용자 가까이까지 걸어갈 수 있는 통로가 없어요.');
      }
    },
    cancel(){if(intent)finish('cancelled');},
    get state(){return {status,targetName};}
  };
}
