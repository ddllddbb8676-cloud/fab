const seconds=(deadline,now)=>Math.max(0,Math.ceil((deadline-now)/1000));
const time=n=>`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
export function victoryPresentation(b,wallet){
  const count=Math.max(1,Math.min(2,Number(b.clearedCount)||1));
  const [theme,badge,title]=count===2?['legend','DOUBLE CLEAR','더블 클리어!']:['first','BAY CLEAR','베이 클리어!'];
  const personal=b.seriesId&&wallet?.lastEventSeriesId===b.seriesId&&Number.isSafeInteger(wallet?.eventSeriesChips)?wallet.eventSeriesChips:null;
  return {count,theme,badge,title,amount:wallet?.lastEventRewardAmount??200,total:count*200,personal};
}
export function eventPresentation(data,at){
  const b=data?.bay,g=data?.golden;
  const golden=g&&at<g.endsAt?`황금 FOUP ${g.remaining}개 · ${time(seconds(g.endsAt,at))}`:'';
  if(!b||!['preparing','active'].includes(b.phase))return {golden,bay:'',detail:'',button:'',countdown:''};
  const preparing=b.phase==='preparing',left=seconds(preparing?b.startsAt:b.endsAt,at);
  const round=b.round??1,progress=round>1?`${round-1}개 성공! · `:'';
  return {golden,bay:progress+(preparing?`${b.bayId+1}번 BAY · ${time(left)} 후 시작`:`${b.bayId+1}번 BAY · 남은 ${b.remaining}대 · ${time(left)}`),
    detail:preparing?`${b.bayLimit===2?'2개 베이 모드 · 전체 60초':'1개 베이 모드 · 60초'} · 베이당 +200칩`:round>1?`누적 ${(round-1)*200}칩 · 남은 시간에 추가 +200칩`:'함께 부숴요! · 성공하면 모두 +200칩',button:round>1?`다음 베이로 바로 가기 · ${b.bayId+1}번`:`${b.bayId+1}번 BAY로 가기`,
    countdown:preparing?(left>0&&left<=3?String(left):left===0?'시작 확인 중':''):(at-b.startsAt<1200?'시작!':'')};
}
export function createWorldEventsUI({document:doc=globalThis.document,root=doc.body,now=()=>performance.now(),command,onTravel,onVictory,toast=()=>{},ready=()=>true,canCelebrate=()=>true}){
  const card=doc.createElement('aside');card.id='world-event-card';card.className='world-event-card';card.hidden=true;
  card.innerHTML='<div class="event-golden" hidden><strong></strong><span>에어샤워실 앞 스토커 IN</span><span>IN +200 · 파괴 +50 · 청소 +10칩</span></div><div class="event-bay" hidden><strong></strong><span></span><button type="button"></button></div>';
  const overlay=doc.createElement('div');overlay.id='world-event-result';overlay.className='world-event-result';overlay.hidden=true;overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');root.append(card,overlay);
  const gold=card.querySelector('.event-golden'),bay=card.querySelector('.event-bay'),button=bay.querySelector('button');
  let data=null,received=0,serverAt=0,wallet=null,resultUntil=0,lastRender='',pending=false,lastGold='',lastBay='',suppressSuccess=false,displayedResult=null;
  const shown=new Set(),departed=new Set();
  const result=()=>data?.lastResult?.phase==='success'?data.lastResult:data?.bay?.phase==='success'?data.bay:null;
  function celebrate(){
    const b=result();
    if(b?.phase!=='success'||shown.has(b.id)||suppressSuccess||wallet?.lastEventRewardId!==b.id||!ready()||!canCelebrate(b.bayId))return;
    shown.add(b.id);if(shown.size>8)shown.delete(shown.values().next().value);
    const p=victoryPresentation(b,wallet),next=b.next;
    resultUntil=now()+3000;overlay.className=`world-event-result victory streak-${p.theme}`;
    const personal=p.personal!==null&&p.personal!==p.total?`<small>이번 도전 내 적립 ${p.personal}칩</small>`:'';
    const left=seconds(b.endsAt,serverAt+Math.max(0,now()-received));
    const ending=next&&left>0?`남은 시간에 다음 ${next.bayId+1}번 BAY로!`:'시간 내 성공한 베이 보상 지급 완료';
    const sparks=Array.from({length:p.count>=2?8:0},(_,i)=>`<i style="--spark:${i}" aria-hidden="true"></i>`).join('');
    displayedResult=b;
    overlay.innerHTML=`<div class="event-sparks">${sparks}</div><span class="event-streak-badge">${p.badge}</span><span class="event-victory-title">${p.title}</span><strong>+${p.amount}<span>칩 적립</span></strong><p class="event-series-total">${p.count}개 베이 성공 · 누적 <b>${p.total}칩</b></p>${personal}<small class="event-victory-followup">${ending}</small>`;overlay.hidden=false;
    onVictory(departed.has(b.id)?null:b.bayId);lastRender='';
  }
  function update(){
    celebrate();
    const at=serverAt+Math.max(0,now()-received),p=eventPresentation(data,at),key=JSON.stringify(p)+':'+ready();
    if(key!==lastRender){
      lastRender=key;gold.hidden=!p.golden;bay.hidden=!p.bay;card.hidden=!ready()||!p.golden&&!p.bay;
      gold.querySelector('strong').textContent=p.golden;bay.querySelector('strong').textContent=p.bay;bay.querySelector('span').textContent=p.detail;button.textContent=p.button;
    }
    if(now()<resultUntil){if(displayedResult&&at>=displayedResult.endsAt)overlay.querySelector('.event-victory-followup').textContent='시간 내 성공한 베이 보상 지급 완료';overlay.hidden=!ready();return;}
    overlay.className='world-event-result countdown';const label=ready()?p.countdown:'';
    if(overlay.textContent!==label)overlay.textContent=label;overlay.hidden=!label;
  }
  button.addEventListener('click',async()=>{
    if(pending||!data?.bay)return;pending=true;button.disabled=true;
    try{const response=await command('bay-travel',{eventId:data.bay.id});if(response?.ok&&response.eventTravel){const b=result();if(b){departed.add(b.id);if(departed.size>8)departed.delete(departed.values().next().value);}onTravel(response.eventTravel);}else toast(response?.message??'연결을 확인한 뒤 다시 눌러주세요');}
    catch{toast('연결을 확인한 뒤 다시 눌러주세요');}finally{pending=false;button.disabled=false;}
  });
  return {update,
    frame(next,initial=false){
      if(!next||!Number.isFinite(next.serverNow))return;
      if(!initial&&next.serverNow<serverAt)return;
      data=next;serverAt=next.serverNow;received=now();
      suppressSuccess=initial&&Boolean(result());
      if(suppressSuccess)shown.add(result().id);
      if(next.golden?.id&&lastGold!==next.golden.id){lastGold=next.golden.id;if(ready())toast('황금 FOUP 찾기! 10분 안에 에어샤워실 앞 스토커 IN으로 가져오면 +200칩',6000);}
      if(next.bay?.phase==='preparing'&&lastBay!==next.bay.id){lastBay=next.bay.id;const left=seconds(next.bay.startsAt,next.serverNow);if(ready())toast(`${next.bay.bayLimit??1}개 베이 뿌시기! ${next.bay.bayId+1}번 BAY · ${left===60?'1분':left+'초'} 뒤 시작 · 전체 60초`,5000);}
      if(next.bay?.phase==='failed'&&!initial&&!shown.has(next.bay.id)){shown.add(next.bay.id);const wins=next.bay.clearedCount??0;if(ready())toast(wins?`${wins}개 베이 성공으로 연속 도전 종료! 이미 받은 칩은 그대로예요`:'60초 종료! 다음에 다시 도전해요',5000);}
      update();
    },
    wallet(next){wallet=next;celebrate();},
    disconnect(){data=null;resultUntil=0;lastRender='';update();},
    dispose(){card.remove();overlay.remove();}
  };
}
