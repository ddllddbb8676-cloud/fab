import {checkNickname,NICKNAME_WARNING} from './nickname-policy.js?v=e86319ae060b';
export function createNicknameUI({command,connected,onToggle}) {
  const dialog=document.createElement('dialog');dialog.className='nickname-dialog';dialog.setAttribute('aria-labelledby','nickname-title');
  dialog.innerHTML=`<h2 id="nickname-title">닉네임을 정해 주세요</h2><p class="nickname-intro"></p><p class="nickname-preserve">이름만 바뀌어요. 파괴·수리 기록, 칩, 구매 아이템은 그대로 유지돼요.</p><form><section class="nickname-edit"><label for="nickname-input">닉네임</label><input id="nickname-input" type="text" maxlength="7" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="nickname-rule nickname-error"><small id="nickname-rule">공백 포함 1~7자 · 한글/영문/숫자/띄어쓰기<br>“세미”가 포함된 이름은 사용할 수 없어요.</small><button class="nickname-next" type="submit">확인</button></section><section class="nickname-review" hidden><p>입력하신 닉네임은 <strong class="nickname-chosen"></strong> 입니다.</p><p class="nickname-warning"></p><p>이 닉네임으로 만드시겠습니까?</p><small class="nickname-use-hint"></small><div><button class="nickname-back" type="button">수정하기</button><button class="nickname-confirm" type="button">확정하기</button></div></section><p id="nickname-error" role="alert"></p><button class="nickname-later" type="button" hidden>나중에 사용하기</button></form>`;
  document.body.append(dialog);const $=s=>dialog.querySelector(s);$('.nickname-warning').textContent=NICKNAME_WARNING;
  let info=null,busy=false,step='edit',candidate='',candidateTicket=0,composing=false;
  function render(){const reviewing=step==='review';$('.nickname-edit').hidden=reviewing;$('.nickname-review').hidden=!reviewing;$('.nickname-next').disabled=busy||!connected();$('.nickname-confirm').disabled=busy||!connected();$('.nickname-back').disabled=busy;$('#nickname-input').disabled=busy;$('.nickname-confirm').textContent=busy?'저장 중…':'확정하기';$('.nickname-later').hidden=info?.kind!=='ticket';$('.nickname-later').disabled=busy;$('.nickname-use-hint').textContent=info?.kind==='ticket'?'확정하면 보유한 닉네임 변경권 1장을 사용합니다.':'확정하면 무료 1회 변경 기회를 사용합니다.';}
  function close(){if(!dialog.open)return;dialog.close();document.body.classList.remove('nickname-open');onToggle(false);}
  function sync(next,forceOpen=false){info=next;if(!next?.canChoose){close();return;}if(dialog.open){render();return;}if(next.kind==='ticket'&&!forceOpen)return;
    step='edit';busy=false;candidate='';$('#nickname-input').value=next.name||'';$('#nickname-error').textContent='';
    $('#nickname-title').textContent=next.kind==='ticket'?'닉네임 바꾸기':next.kind==='existing'?'닉네임 변경 기회가 생겼어요':'닉네임을 정해 주세요';
    $('.nickname-intro').textContent=next.kind==='ticket'?'변경권 1장을 보유하고 있어요. 새 이름을 확정하기 전까지는 사용되지 않아요.':next.kind==='existing'?'지금 이름을 그대로 사용하거나 한 번 바꿀 수 있어요.':'추천 이름을 준비했어요. 그대로 쓰거나 원하는 이름으로 바꿔 주세요.';
    onToggle(true);document.body.classList.add('nickname-open');dialog.showModal();render();$('.nickname-next').focus({preventScroll:true});
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(info?.kind==='ticket'&&!busy)close();});
  $('.nickname-later').addEventListener('click',()=>{if(!busy)close();});
  $('#nickname-input').addEventListener('compositionstart',()=>{composing=true;});$('#nickname-input').addEventListener('compositionend',()=>{composing=false;});
  $('#nickname-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.isComposing||composing))event.preventDefault();});
  $('form').addEventListener('submit',async event=>{event.preventDefault();if(busy||composing||step!=='edit')return;const local=checkNickname($('#nickname-input').value);if(!local.ok){$('#nickname-error').textContent=local.message;return;}
    busy=true;render();try{const result=await command('nickname-check',{name:local.name});if(!result.ok){$('#nickname-error').textContent=result.message;return;}candidate=result.name;candidateTicket=info?.purchaseCount||0;$('.nickname-chosen').textContent=`“${candidate}”`;step='review';$('#nickname-error').textContent='';}finally{busy=false;render();if(step==='review')$('.nickname-confirm').focus({preventScroll:true});}
  });
  $('.nickname-back').addEventListener('click',()=>{step='edit';$('#nickname-input').value=candidate;$('#nickname-error').textContent='';render();$('#nickname-input').focus();});
  $('.nickname-confirm').addEventListener('click',async()=>{if(busy||step!=='review')return;busy=true;render();try{const result=await command('nickname-confirm',{name:candidate,confirmed:true,ticketPurchase:candidateTicket});if(result.ok){info=result.nickname;close();}else{$('#nickname-error').textContent=result.message;}}finally{busy=false;render();}});
  return {sync,open:()=>sync(info,true),refresh:render,get isOpen(){return dialog.open;}};
}

export function createNicknameModeration({button,command,onToggle}) {
  const dialog=document.createElement('dialog');dialog.className='nickname-dialog';dialog.setAttribute('aria-label','닉네임 관리');
  dialog.innerHTML='<h2>닉네임 관리</h2><p>부적절한 닉네임만 추천 이름으로 바꿉니다. 기록·칩·구매 아이템은 유지됩니다.</p><form><label for="moderation-name">변경할 방문자의 일반 닉네임</label><input id="moderation-name" maxlength="7" autocomplete="off"><p class="moderation-result" role="status"></p><div class="nickname-admin-actions"><button type="button" class="moderation-close">닫기</button><button type="submit">추천 이름으로 변경</button></div></form>';document.body.append(dialog);
  const input=dialog.querySelector('input'),submit=dialog.querySelector('[type=submit]'),result=dialog.querySelector('.moderation-result');let busy=false;
  const close=()=>{if(busy)return;dialog.close();onToggle(false);button.focus();};
  button.addEventListener('click',()=>{result.textContent='';input.value='';onToggle(true);dialog.showModal();input.focus();});
  dialog.querySelector('.moderation-close').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();if(busy||!input.value.trim())return;if(!confirm(`“${input.value.trim()}” 닉네임만 추천 이름으로 바꿀까요? 기록·칩·아이템은 유지됩니다.`))return;busy=true;submit.disabled=true;try{const r=await command('nickname-reset',{name:input.value.trim()});result.textContent=r.ok?`“${r.name}”으로 변경했습니다. 기록과 칩은 유지됩니다.`:r.message;}finally{busy=false;submit.disabled=false;}});
  return {get isOpen(){return dialog.open;}};
}
