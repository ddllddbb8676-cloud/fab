import {readSpeech, SPEECH_DURATION_MS, SPEECH_LIMIT} from './owner-speech.js?v=a1b1f19e3a26';

export function createSpeechComposer({button, command, canOpen, onToggle, toast, doc=document}) {
  let allowed=false, dialog, input, counter, submit, status, composing=false, pending=false, generation=0;
  function syncInput() {
    const parsed=readSpeech(input.value);
    counter.textContent=(parsed.length??Array.from(input.value).length)+' / '+SPEECH_LIMIT;
    submit.disabled=pending || !parsed.ok;
    return parsed;
  }
  function dismiss() {
    if (!dialog?.open) return;
    generation++;
    pending=false;composing=false;
    dialog.close();
    input.value='';
    onToggle(false);
    doc.getElementById('controls-toggle')?.focus({preventScroll:true});
  }
  function build() {
    dialog=doc.createElement('dialog');
    dialog.className='speech-dialog';
    dialog.setAttribute('aria-labelledby','speech-heading');
    dialog.innerHTML='<form><h2 id="speech-heading">말풍선 보내기</h2><p id="speech-help">세미 머리 위에 8초 동안 보여요.</p><label for="speech-input">내용</label><input id="speech-input" type="text" maxlength="512" autocomplete="off" enterkeyhint="send" aria-describedby="speech-help"><div class="speech-feedback"><span role="status"></span><small></small></div><div class="speech-actions"><button type="button">닫기</button><button type="submit">보내기</button></div></form>';
    doc.body.append(dialog);
    input=dialog.querySelector('input');
    counter=dialog.querySelector('small');
    status=dialog.querySelector('[role=status]');
    submit=dialog.querySelector('[type=submit]');
    input.addEventListener('input',()=>{
      const parsed=syncInput();
      status.textContent=input.value&&!parsed.ok?parsed.message:'';
    });
    input.addEventListener('compositionstart',()=>{composing=true;});
    input.addEventListener('compositionend',()=>{composing=false;syncInput();});
    dialog.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.key==='Enter'&&(composing||event.isComposing||event.keyCode===229))event.preventDefault();
    });
    dialog.addEventListener('keyup',event=>event.stopPropagation());
    dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
    dialog.querySelector('[type=button]').addEventListener('click',dismiss);
    dialog.querySelector('form').addEventListener('submit',async event=>{
      event.preventDefault();
      if(!allowed || pending || composing || !dialog.open)return;
      const parsed=syncInput();
      if(!parsed.ok){status.textContent=parsed.message;return;}
      const token=++generation;
      pending=true;submit.disabled=true;status.textContent='보내는 중…';
      try {
        const result=await command('owner-say',{text:parsed.text});
        if(token!==generation)return;
        if(result?.ok)dismiss();
        else status.textContent=result?.message??'연결을 확인하고 다시 보내 주세요.';
      } catch {
        if(token===generation)status.textContent='연결을 확인하고 다시 보내 주세요.';
      } finally {
        if(token===generation){pending=false;syncInput();}
      }
    });
  }
  button.addEventListener('click',()=>{
    if(!allowed)return;
    if(!canOpen()){toast('팹에 입장한 뒤 말풍선을 보내 주세요.');return;}
    if(!dialog)build();
    if(dialog.open)return;
    status.textContent='';syncInput();
    onToggle(true);dialog.showModal();input.focus();
  });
  return {setAllowed(value){
    allowed=value===true;
    button.hidden=!allowed;
    if(!allowed)dismiss();
  }};
}

export function createSpeechBubble({THREE, getAnchor, doc=document, now=()=>performance.now()}) {
  const point=new THREE.Vector3();
  let node, active, revision=0, until=0, width=0, height=0, viewportWidth=0;
  function hide() { if(node&&!node.hidden)node.hidden=true; }
  function clear() { active=null;hide();if(node)node.textContent=''; }
  function frame(data, initial=false) {
    if(initial){clear();revision=0;}
    const packet=data?.ownerSpeech, serverNow=data?.worldEvents?.serverNow;
    if(active && Number.isFinite(serverNow))until=Math.min(until,now()+active.expiresAt-serverNow);
    if(!packet || !Number.isSafeInteger(packet.revision) || packet.revision<=revision)return;
    revision=packet.revision;clear();
    if(typeof packet.text!=='string'||!packet.text||typeof packet.speaker!=='string'||!Number.isFinite(packet.expiresAt)||!Number.isFinite(serverNow))return;
    const left=Math.min(SPEECH_DURATION_MS,packet.expiresAt-serverNow);
    if(left<=0)return;
    active=packet;until=now()+left;width=0;
    if(!node){
      node=doc.createElement('div');
      node.className='owner-speech-bubble';node.hidden=true;node.setAttribute('role','status');
      node.setAttribute('dir','auto');doc.body.append(node);
    }
    node.textContent=packet.text;
  }
  function update(camera) {
    if(!active)return;
    if(now()>=until){clear();return;}
    const gap=getAnchor(active.speaker,point);
    if(gap==null||doc.hidden){hide();return;}
    point.project(camera);
    if(point.z < -1 || point.z > 1 || Math.abs(point.x)>1 || Math.abs(point.y)>1){hide();return;}
    if(node.hidden)node.hidden=false;
    const viewWidth=doc.documentElement.clientWidth,viewHeight=doc.documentElement.clientHeight;
    if(!width||viewportWidth!==viewWidth){
      viewportWidth=viewWidth;width=node.offsetWidth;height=node.offsetHeight;
    }
    const x=(point.x*.5+.5)*viewWidth, y=(-point.y*.5+.5)*viewHeight;
    const left=Math.max(6,Math.min(viewWidth-width-6,x-width/2));
    const above=y-gap-height, below=above<6;
    const top=below?Math.min(viewHeight-height-6,y+12):above;
    node.classList.toggle('speech-below',below);
    node.style.setProperty('--speech-tail',Math.max(10,Math.min(width-10,x-left))+'px');
    node.style.transform=`translate(${Math.round(left)}px,${Math.round(top)}px)`;
  }
  return {frame, update, reset(){clear();revision=0;}};
}
