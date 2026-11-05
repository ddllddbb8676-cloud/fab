import {DESTRUCTION_TITLES,OPERATOR_TITLE,findTitle,destructionTitle,destructionCount} from './destruction-titles.js?v=9063703070a2';

export function createTitlePicker({root,command,connected,onChange=()=>{}}) {
  let state=null,busy=false,notice='';
  root.innerHTML='<p class="title-progress"></p><div class="title-options"></div><div class="title-choices"></div><p class="title-message" role="status"></p>';
  const $=selector=>root.querySelector(selector);
  const number=n=>n.toLocaleString('ko-KR');
  function refresh() {
    if(root.hidden)return;
    const ready=Boolean(state&&connected()),count=destructionCount(state?.brokenCount),next=DESTRUCTION_TITLES.find(t=>t.count>count);
    $('.title-progress').textContent=!state?'칭호 정보를 불러오는 중이에요.':state.operator?'FAB짱 세미 전용 칭호예요.':`누적 파괴 ${number(count)}대 · ${next?next.name+'까지 '+number(next.count-count)+'대':'모든 파괴 칭호를 모았어요!'}`;
    const disabled=busy||!ready?' disabled':'';
    const current=destructionTitle(count);
    $('.title-options').innerHTML=state?.operator?'':`<button type="button" data-title="auto" aria-pressed="${state?.preference==='auto'}"${disabled}>최고 칭호 자동 표시<small>${current?.name??'1대부터 첫 칭호 획득'}</small></button><button type="button" data-title="hidden" aria-pressed="${state?.preference==='hidden'}"${disabled}>칭호 숨기기<small>닉네임만 표시</small></button>`;
    const choices=state?.operator?[OPERATOR_TITLE]:DESTRUCTION_TITLES;
    $('.title-choices').innerHTML=choices.map(title=>{
      const unlocked=Boolean(state)&&(state.operator||count>=title.count),shown=state?.titleId===title.id;
      return `<button type="button" data-title="${title.id}" aria-pressed="${shown}"${busy||!ready||!unlocked||state?.operator?' disabled':''}><b style="color:${title.color}">〈${title.name}〉</b><small>${state?.operator?'표시 중':number(title.count)+'대 · '+(shown?'표시 중':unlocked?'획득':'미획득')}</small></button>`;
    }).join('');
    $('.title-message').textContent=busy?'칭호를 저장하고 있어요…':notice||(!connected()?'온라인 FAB에 연결되면 변경할 수 있어요.':state?.operator?'운영자 칭호는 항상 표시돼요.':'획득한 칭호를 누르면 바로 적용돼요. 칩은 들지 않아요.');
  }
  function setState(next) {
    if(!next)return;
    if(state&&state.preference===next.preference&&state.brokenCount===next.brokenCount&&state.titleId===next.titleId&&state.operator===next.operator)return;
    state={...next};notice='';onChange(state.titleId);refresh();
  }
  root.addEventListener('click',async event=>{
    const button=event.target.closest('[data-title]');
    if(!button||!root.contains(button)||button.disabled||busy||!state||!connected())return;
    const preference=button.dataset.title;
    if(preference===state.preference)return;
    busy=true;notice='';refresh();
    try {
      const result=await command('title-select',{preference});
      if(result.titles)setState(result.titles);
      notice=result.ok?(preference==='hidden'?'칭호를 숨겼어요.':preference==='auto'?'새 칭호를 얻으면 자동으로 바뀌어요.':`${findTitle(preference)?.name??'칭호'} 칭호를 달았어요.`):result.message||'잠시 후 다시 시도해 주세요.';
    } catch {notice='연결을 확인한 뒤 다시 골라 주세요.';}
    finally {busy=false;refresh();}
  });
  return {refresh,setState,setProgress(brokenCount,titleId){setState({...state,preference:state?.preference??'auto',operator:state?.operator??titleId==='operator',brokenCount,titleId:titleId||''});},get titleId(){return state?.titleId||'';}};
}
