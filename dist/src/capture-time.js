// Loaded on request. This reads one already-rendered frame; it never changes
// renderer settings or keeps a second WebGL renderer alive.
export function captureImage(source,document=globalThis.document){
  if(!source?.width||!source?.height)throw Error('empty-frame');
  const scale=Math.min(1,1100/Math.max(source.width,source.height)),image=document.createElement('canvas');
  image.width=Math.max(1,Math.round(source.width*scale));image.height=Math.max(1,Math.round(source.height*scale));
  const ctx=image.getContext('2d');if(!ctx)throw Error('canvas-unavailable');
  ctx.drawImage(source,0,0,image.width,image.height);
  return image.toDataURL('image/jpeg',.86);
}
export function createCaptureTime({getRecord,capture,onToggle=()=>{},onError=()=>{},document=globalThis.document}={}){
  const sheet=document.createElement('dialog');sheet.className='capture-sheet';sheet.setAttribute('aria-labelledby','capture-title');
  sheet.innerHTML='<div class="capture-card"><header><h2 id="capture-title">캡쳐타임</h2><span>FAB@semitoon</span></header><img class="capture-image" alt="현재 팹 화면" hidden><p class="capture-status" role="status">화면 담는 중…</p><div class="capture-record"><span class="capture-title"></span><strong class="capture-name"></strong><div class="capture-counts"><span>누적 파괴 <b class="capture-broken"></b>대</span><span>누적 수리 <b class="capture-repaired"></b>대</span></div><small>fab.semitoon.com · Instagram @semi.toon</small></div></div><div class="capture-actions"><span>휴대폰으로 화면을 캡처해 주세요.</span><button type="button">게임으로</button></div>';
  const $=selector=>sheet.querySelector(selector),image=$('.capture-image'),status=$('.capture-status'),button=$('button');
  let active=false,generation=0,previousFocus=null;
  const count=value=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString('ko-KR'):'—';
  function close(){
    if(!active)return;active=false;generation++;if(sheet.open)sheet.close();image.removeAttribute('src');image.hidden=true;
    onToggle(false);previousFocus?.focus?.({preventScroll:true});
  }
  button.addEventListener('click',close);sheet.addEventListener('cancel',event=>{event.preventDefault();close();});sheet.addEventListener('close',close);
  document.body.append(sheet);
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./capture-time.css',import.meta.url).href;document.head.append(css);
  return {get isOpen(){return active;},close,async open(){
    if(active)return;const record=getRecord();previousFocus=document.activeElement;
    $('.capture-name').textContent=String(record.name??'');$('.capture-title').textContent=String(record.title??'');
    $('.capture-broken').textContent=count(record.brokenCount);$('.capture-repaired').textContent=count(record.repairedCount);
    image.hidden=true;status.hidden=false;active=true;const ticket=++generation;
    try{onToggle(true);sheet.showModal();button.focus({preventScroll:true});const data=await capture(source=>captureImage(source,document));if(!active||ticket!==generation)return;image.src=data;image.hidden=false;status.hidden=true;}
    catch{if(active&&ticket===generation){close();onError();}}
  }};
}
