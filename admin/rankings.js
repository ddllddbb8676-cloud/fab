export function createRankingDashboard(document,{fetcher=(...args)=>fetch(...args)}={}){
  const $=id=>document.getElementById(id),panel=$('ranking-panel'),rows=$('ranking-rows');
  const format=new Intl.NumberFormat('ko-KR'),time=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  let page=1,pages=1,loaded=false,active=null,epoch=0;
  const controls=()=>{ $('ranking-prev').disabled=Boolean(active)||page<=1;$('ranking-next').disabled=Boolean(active)||page>=pages;$('ranking-refresh').disabled=Boolean(active);};
  function clear(){epoch++;active?.abort();active=null;loaded=false;page=1;pages=1;rows.replaceChildren();$('ranking-total').textContent='—';$('ranking-page').textContent='';$('ranking-note').textContent='';$('ranking-status').textContent='운영자 계정으로 다시 열어 주세요.';controls();}
  async function refresh(target=page){
    if(!panel.open||document.hidden||active)return;
    const generation=epoch,controller=new AbortController();active=controller;controls();
    $('ranking-status').textContent='랭킹을 불러오는 중이에요.';
    const timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetcher('/api/admin/rankings?page='+Math.max(1,target),{credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
      if(generation!==epoch)return;
      if(response.status===401||response.status===403){clear();return;}
      if(!response.ok)throw Error('unavailable');
      const data=await response.json();if(generation!==epoch)return;
      if(!Array.isArray(data.rows)||data.rows.length>50||!Number.isSafeInteger(data.total)||!Number.isSafeInteger(data.page)||!Number.isSafeInteger(data.pages))throw Error('invalid');
      const fragment=document.createDocumentFragment();
      for(const value of data.rows){
        const tr=document.createElement('tr');
        const cells=[format.format(value.rank),value.name,format.format(value.brokenCount),format.format(value.repairedCount),value.joinedDate||'미확인',format.format(value.visitCount)+'회',value.googleLinked===true?'연동':value.googleLinked===false?'미연동':'확인 불가'];
        for(const value of cells){const td=document.createElement('td');td.textContent=value;tr.append(td);}fragment.append(tr);
      }
      rows.replaceChildren(fragment);page=data.page;pages=data.pages;loaded=true;
      $('ranking-total').textContent='전체 '+format.format(data.total)+'계정';
      $('ranking-page').textContent=page+' / '+pages+'페이지';
      $('ranking-status').textContent=data.total?`${(page-1)*50+1}–${(page-1)*50+data.rows.length}위 · ${time.format(new Date(data.generatedAt))} 갱신`:'저장된 이용자 기록이 아직 없어요.';
      const started=new Date(data.visitTrackingStartedAt);
      $('ranking-note').textContent=`가입일은 확인된 첫 접속일이며, 예전 기록이 없으면 ‘미확인’이에요. 접속 횟수는 ${Number.isFinite(started.getTime())?time.format(started):'이번 업데이트'}부터 집계하며 이전 횟수는 포함하지 않아요. 접속을 유지하거나 30분 안에 다시 연결하면 한 번으로 세요.${data.visitCountsLimited?' 최근 접속 통계 저장이 지연되어 일부 횟수가 누락될 수 있어요.':''}`;
      $('ranking-scroll').scrollTop=0;
    }catch{
      if(generation===epoch)$('ranking-status').textContent=loaded?'갱신이 늦어 이전 목록을 보여드려요. 다시 불러오기를 눌러 주세요.':'랭킹을 불러오지 못했어요. 다시 불러오기를 눌러 주세요.';
    }finally{clearTimeout(timer);if(generation===epoch){active=null;controls();}}
  }
  panel.addEventListener('toggle',()=>{if(panel.open)void refresh();});
  $('ranking-prev').addEventListener('click',()=>refresh(page-1));
  $('ranking-next').addEventListener('click',()=>refresh(page+1));
  $('ranking-refresh').addEventListener('click',()=>refresh());
  $('ranking-link').addEventListener('click',()=>{panel.open=true;});
  controls();
  return {refresh,clear};
}
