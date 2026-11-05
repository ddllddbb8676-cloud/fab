import {readSpeech, SPEECH_DURATION_MS, SPEECH_LIMIT} from './owner-speech.js?v=3b5478afa86e';

export function createSpeechComposer({button, menuButton, command, canOpen, onToggle, toast, doc=document}) {
  let allowed=false, dialog, input, counter, submit, status, opener, composing=false, pending=false, generation=0;
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
    const focusTarget=opener===button && !button.hidden ? button : doc.getElementById('controls-toggle');
    focusTarget?.focus({preventScroll:true});
  }
  function build() {
    dialog=doc.createElement('dialog');
    dialog.className='speech-dialog';
    dialog.setAttribute('aria-labelledby','speech-heading');
    dialog.innerHTML=`<form><h2 id="speech-heading">말풍선 보내기</h2><p id="speech-help">최대 ${SPEECH_LIMIT}자 · 내 캐릭터 위에 8초 동안 보여요.</p><label for="speech-input">내용</label><input id="speech-input" type="text" maxlength="512" autocomplete="off" enterkeyhint="send" aria-describedby="speech-help speech-count"><div class="speech-feedback"><span role="status"></span><small id="speech-count"></small></div><div class="speech-actions"><button type="button">닫기</button><button type="submit">보내기</button></div></form>`;
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
        const result=await command('say',{text:parsed.text});
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
  function open(event) {
    if(!allowed)return;
    if(!canOpen()){toast('팹에 입장한 뒤 말풍선을 보내 주세요.');return;}
    if(!dialog)build();
    if(dialog.open)return;
    opener=event.currentTarget;
    status.textContent='';syncInput();
    onToggle(true);dialog.showModal();input.focus();
  }
  button.addEventListener('click',open);
  menuButton.addEventListener('click',open);
  return {setAllowed(value){
    allowed=value===true;
    button.hidden=menuButton.hidden=!allowed;
    if(!allowed)dismiss();
  }};
}

// Place overlapping bubbles in vertical order, leaving their tails over the speakers.
function freeTop(boxes, left, right, top, height, below) {
  for (let i=0; i<boxes.length; i++) {
    const box=boxes[below ? i : boxes.length-1-i];
    if (right<=box.left || left>=box.right) continue;
    if (top<box.bottom+3 && top+height>box.top-3) top=below ? box.bottom+3 : box.top-height-3;
  }
  return top;
}

export function createSpeechBubbles({THREE, getAnchor, doc=document, now=()=>performance.now()}) {
  const point=new THREE.Vector3(), active=new Map();
  let revision=0;
  function remove(id) {
    active.get(id)?.node?.remove();
    active.delete(id);
  }
  function reset() {
    for (const id of active.keys()) remove(id);
    revision=0;
  }
  function frame(data, initial=false) {
    if (initial) reset();
    const serverNow=data?.worldEvents?.serverNow;
    if (!Number.isFinite(serverNow)) return;
    const local=now();
    for (const bubble of active.values()) {
      bubble.until=Math.min(bubble.until,local+bubble.expiresAt-serverNow);
    }
    const packet=data?.speech;
    if (!Array.isArray(packet?.bubbles) || !Number.isSafeInteger(packet.revision) || packet.revision<=revision) return;
    revision=packet.revision;
    const present=new Set();
    for (const row of packet.bubbles) {
      if (typeof row?.speaker!=='string' || typeof row.text!=='string' || !row.text || !Number.isFinite(row.expiresAt)) continue;
      const left=Math.min(SPEECH_DURATION_MS,row.expiresAt-serverNow);
      if (left<=0) continue;
      present.add(row.speaker);
      const bubble=active.get(row.speaker) ?? {};
      if (bubble.revision===row.revision) continue;
      Object.assign(bubble,{revision:row.revision,text:row.text,expiresAt:row.expiresAt,until:local+left,width:0});
      if (bubble.node) bubble.node.textContent=row.text;
      active.set(row.speaker,bubble);
    }
    for (const id of active.keys()) if (!present.has(id)) remove(id);
  }
  function update(camera) {
    if (!active.size) return;
    const local=now(), viewWidth=doc.documentElement.clientWidth, viewHeight=doc.documentElement.clientHeight;
    const boxes=[];
    for (const [id,bubble] of active) {
      if (local>=bubble.until) { remove(id); continue; }
      const gap=doc.hidden ? null : getAnchor(id,point);
      if (gap!=null) point.project(camera);
      if (gap==null || point.z < -1 || point.z > 1 || Math.abs(point.x)>1 || Math.abs(point.y)>1) {
        if (bubble.node) bubble.node.hidden=true;
        continue;
      }
      if (!bubble.node) {
        const node=doc.createElement('div');
        node.className='owner-speech-bubble';
        node.setAttribute('role','status');node.setAttribute('dir','auto');
        node.textContent=bubble.text;
        doc.body.append(node);
        bubble.node=node;
      }
      const node=bubble.node;
      node.hidden=false;
      if (!bubble.width || bubble.viewportWidth!==viewWidth) {
        bubble.viewportWidth=viewWidth;bubble.width=node.offsetWidth;bubble.height=node.offsetHeight;
      }
      const {width,height}=bubble;
      const x=(point.x*.5+.5)*viewWidth, y=(-point.y*.5+.5)*viewHeight;
      const left=Math.max(6,Math.min(viewWidth-width-6,x-width/2)), right=left+width;
      let top=freeTop(boxes,left,right,y-gap-height,height,false);
      const below=top<6;
      if (below) top=Math.min(viewHeight-height-6,freeTop(boxes,left,right,y+12,height,true));
      const insertAt=boxes.findIndex(box=>box.top>=top);
      boxes.splice(insertAt<0 ? boxes.length : insertAt,0,{left,right,top,bottom:top+height});
      node.classList.toggle('speech-below',below);
      node.style.setProperty('--speech-tail',Math.max(10,Math.min(width-10,x-left))+'px');
      node.style.transform=`translate(${Math.round(left)}px,${Math.round(top)}px)`;
    }
  }
  return {frame,update,reset};
}
