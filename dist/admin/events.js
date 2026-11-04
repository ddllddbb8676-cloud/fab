const minute=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function createEventControls(doc,{fetcher=globalThis.fetch,now=Date.now,newId=()=>crypto.randomUUID()}={}){
  const get=id=>doc.getElementById(id),bay=get('start-bay-event'),gold=get('start-golden-event'),status=get('event-status'),message=get('event-message');
  let state=null,busy=false,refreshing=false,request=null,offset=0,disposed=false;
  function paint(){
    const at=now()+offset,activeBay=state?.bay&&['preparing','active'].includes(state.bay.phase)&&state.bay.endsAt>at,activeGold=state?.golden&&state.golden.endsAt>at;
    bay.disabled=busy||!state||Boolean(activeBay||activeGold)||state.nextGoldenAt-at<120000;
    gold.disabled=busy||!state||Boolean(activeBay||activeGold)||state.nextGoldenAt-at<600000;
    if(!state){status.textContent='이벤트 상태 확인 중';return;}
    const remaining=end=>Math.max(0,Math.ceil((end-at)/1000));
    if(activeBay)status.textContent=`${state.bay.bayId+1}번 BAY · ${state.bay.phase==='preparing'?'시작까지 '+remaining(state.bay.startsAt)+'초':'도전 중 · '+remaining(state.bay.endsAt)+'초 남음'}`;
    else if(activeGold)status.textContent=`황금 FOUP · ${state.golden.remaining}/${state.golden.total}개 · ${Math.ceil(remaining(state.golden.endsAt)/60)}분 남음`;
    else status.textContent='진행 중인 이벤트 없음';
    get('event-next-golden').textContent='다음 정기 황금 FOUP · '+minute.format(state.nextGoldenAt)+' (한국 시간)';
    get('event-window-note').textContent=!activeBay&&!activeGold&&state.nextGoldenAt-at<600000?'정기 황금 FOUP과 겹치는 이벤트는 시작할 수 없어요.':'';
  }
  function render(next){
    if(!next||!Number.isFinite(next.serverNow)||!Number.isFinite(next.nextGoldenAt))throw Error('Invalid event status');
    state=next;offset=next.serverNow-now();paint();
  }
  async function refresh(){
    if(refreshing||disposed)return;refreshing=true;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
    try{const r=await fetcher('/api/admin/events',{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('Status unavailable');render((await r.json()).worldEvents);}
    catch{state=null;paint();status.textContent='이벤트 상태를 확인하지 못했어요. 잠시 뒤 다시 확인할게요.';}
    finally{clearTimeout(timer);refreshing=false;}
  }
  async function start(kind){
    if(busy||disposed||(kind==='bay'?bay:gold).disabled)return;
    if(!request||request.kind!==kind)request={kind,requestId:newId()};
    busy=true;paint();message.textContent='이벤트를 시작하고 있어요…';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{
      const r=await fetcher('/api/admin/events',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(request)});
      const data=await r.json();if(data.worldEvents)render(data.worldEvents);
      if(!r.ok||!data.ok){if(r.status<500)request=null;message.textContent=data.message||'지금은 시작하지 못했어요.';return;}
      request=null;
      message.textContent=data.replayed?'이미 접수된 시작 요청을 확인했어요.':kind==='bay'?`${data.event.bayId+1}번 BAY 예고 시작! 1분 뒤 도전해요.`:'황금 FOUP 찾기 시작! 10분 동안 20개를 찾아주세요.';
    }catch{message.textContent='응답이 늦어요. 다시 눌러도 같은 요청을 중복 실행하지 않아요.';}
    finally{clearTimeout(timer);busy=false;paint();}
  }
  bay.addEventListener('click',()=>start('bay'));gold.addEventListener('click',()=>start('golden'));
  paint();
  return {refresh,render,paint,dispose(){disposed=true;}};
}
