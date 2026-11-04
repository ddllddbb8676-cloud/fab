const seconds=(deadline,now)=>Math.max(0,Math.ceil((deadline-now)/1000));
const time=n=>`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
export function eventPresentation(data,at){
  const b=data?.bay,g=data?.golden;
  const golden=g&&at<g.endsAt?`황금 FOUP ${g.remaining}개 · ${time(seconds(g.endsAt,at))}`:'';
  if(!b||!['preparing','active'].includes(b.phase))return {golden,bay:'',detail:'',button:'',countdown:''};
  const preparing=b.phase==='preparing',left=seconds(preparing?b.startsAt:b.endsAt,at);
  return {golden,bay:preparing?`${b.bayId+1}번 BAY · ${time(left)} 후 시작`:`${b.bayId+1}번 BAY · 남은 ${b.remaining}대 · ${time(left)}`,
    detail:preparing?'장비 20대 · 60초 안에 전부 부수면 모두 +200칩':'안전팀 3명을 피해 함께 부숴요!',button:`${b.bayId+1}번 BAY로 가기`,
    countdown:preparing?(left>0&&left<=3?String(left):left===0?'시작 확인 중':''):(at-b.startsAt<1200?'시작!':'')};
}
export function createWorldEventsUI({document:doc=globalThis.document,root=doc.body,now=()=>performance.now(),command,onTravel,onVictory,toast=()=>{},ready=()=>true,canCelebrate=()=>true}){
  const card=doc.createElement('aside');card.id='world-event-card';card.className='world-event-card';card.hidden=true;
  card.innerHTML='<div class="event-golden" hidden><strong></strong><span>IN +200 · 파괴 +50 · 청소 +10칩</span></div><div class="event-bay" hidden><strong></strong><span></span><button type="button"></button></div>';
  const overlay=doc.createElement('div');overlay.id='world-event-result';overlay.className='world-event-result';overlay.hidden=true;overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');root.append(card,overlay);
  const gold=card.querySelector('.event-golden'),bay=card.querySelector('.event-bay'),button=bay.querySelector('button');
  let data=null,received=0,serverAt=0,wallet=null,resultUntil=0,lastRender='',pending=false,lastGold='',lastBay='',suppressSuccess=false;
  const shown=new Set();
  function celebrate(){
    const b=data?.bay;
    if(b?.phase!=='success'||shown.has(b.id)||suppressSuccess||wallet?.lastEventRewardId!==b.id||!ready()||!canCelebrate(b.bayId))return;
    shown.add(b.id);if(shown.size>8)shown.delete(shown.values().next().value);
    resultUntil=now()+3000;overlay.className='world-event-result victory';
    overlay.innerHTML='<span>베이 뿌시기 성공!</span><strong>+200<span>칩 적립</span></strong><small>접속 중인 모두에게 지급 완료</small>';overlay.hidden=false;
    onVictory(b.bayId);lastRender='';
  }
  function update(){
    celebrate();
    const at=serverAt+Math.max(0,now()-received),p=eventPresentation(data,at),key=JSON.stringify(p)+':'+ready();
    if(key!==lastRender){
      lastRender=key;gold.hidden=!p.golden;bay.hidden=!p.bay;card.hidden=!ready()||!p.golden&&!p.bay;
      gold.querySelector('strong').textContent=p.golden;bay.querySelector('strong').textContent=p.bay;bay.querySelector('span').textContent=p.detail;button.textContent=p.button;
    }
    if(now()<resultUntil){overlay.hidden=!ready();return;}
    overlay.className='world-event-result countdown';const label=ready()?p.countdown:'';
    if(overlay.textContent!==label)overlay.textContent=label;overlay.hidden=!label;
  }
  button.addEventListener('click',async()=>{
    if(pending||!data?.bay)return;pending=true;button.disabled=true;
    try{const response=await command('bay-travel',{eventId:data.bay.id});if(response?.ok&&response.eventTravel)onTravel(response.eventTravel);else toast(response?.message??'연결을 확인한 뒤 다시 눌러주세요');}
    catch{toast('연결을 확인한 뒤 다시 눌러주세요');}finally{pending=false;button.disabled=false;}
  });
  return {update,
    frame(next,initial=false){
      if(!next||!Number.isFinite(next.serverNow))return;
      if(!initial&&next.serverNow<serverAt)return;
      data=next;serverAt=next.serverNow;received=now();
      suppressSuccess=initial&&next.bay?.phase==='success';
      if(suppressSuccess)shown.add(next.bay.id);
      if(next.golden?.id&&lastGold!==next.golden.id){lastGold=next.golden.id;if(ready())toast('황금 FOUP 찾기! 제한시간 안에 스토커 IN으로 가져오면 +200칩',5000);}
      if(next.bay?.phase==='preparing'&&lastBay!==next.bay.id){lastBay=next.bay.id;const left=seconds(next.bay.startsAt,next.serverNow);if(ready())toast(`${next.bay.bayId+1}번 BAY 뿌시기! ${left===60?'1분':left+'초'} 뒤 시작 · 성공하면 모두 +200칩`,5000);}
      if(next.bay?.phase==='failed'&&!initial&&!shown.has(next.bay.id)){shown.add(next.bay.id);if(ready())toast('60초 종료! 아쉽지만 다음 베이에서 다시 도전해요',4000);}
      update();
    },
    wallet(next){wallet=next;celebrate();},
    disconnect(){data=null;resultUntil=0;lastRender='';update();},
    dispose(){card.remove();overlay.remove();}
  };
}
