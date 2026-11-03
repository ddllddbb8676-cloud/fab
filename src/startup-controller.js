const LABELS = {
  files: '게임 파일을 불러오는 중',
  connection: '팹 연결을 준비하는 중',
  graphics: '3D 화면을 준비하는 중',
  lighting: '팹 조명을 준비하는 중',
  equipment: '장비를 배치하는 중',
  transport: 'OHT를 준비하는 중',
  batches: '팹 공간을 정리하는 중',
  people: '캐릭터를 준비하는 중',
  controls: '조작을 준비하는 중',
  room: '함께할 팹을 연결하는 중',
  render: '첫 화면을 그리는 중'
};

// Runs before the game import. A failed import/initialization must not leave an
// unexplained loading screen, and a slow import must never start a second game.
export function startGame({entry, document=globalThis.document, window=globalThis.window,
  loadModule=url=>import(url), schedule=setTimeout, cancel=clearTimeout,
  now=()=>performance.now()}={}) {
  const root=document.getElementById('loading'), status=root.querySelector('p');
  const detail=root.querySelector('[data-loading-detail]'), retry=root.querySelector('[data-loading-retry]');
  const copy=root.querySelector('[data-loading-copy]'), result=root.querySelector('[data-loading-result]');
  const entryUrl=new URL(entry,window.location.href), startedAt=now(), journal=[];
  let phase='files', ready=false, failed=false, disposed=false, timer=null, failure='';
  let hiddenDuringStartup=Boolean(document.hidden);
  function clearTimer(){if(timer!==null)cancel(timer);timer=null;}
  function tools(){detail.hidden=false;retry.hidden=false;copy.hidden=false;}
  function report(){return ['FAB 게임 시작 점검 20261103b',
    '상태: '+(ready?'정상':failed?'오류':'대기')+' · '+phase,
    ...journal.map(row=>row.stage+': '+row.ms+'ms'),
    ...(failure?['오류: '+failure]:[]),
    '점검 중 화면 전환: '+hiddenDuringStartup,
    window.navigator?.userAgent||''].join('\n');}
  function fail(error){
    if(ready||failed||disposed)return;
    failed=true;clearTimer();root.dataset.loadingState='failed';
    failure=String(error?.message||error||'연결 실패').slice(0,300);
    status.textContent='게임 시작을 마치지 못했어요';
    detail.textContent=LABELS[phase]+' · '+failure;tools();
  }
  function finish(){
    if(ready||failed||disposed)return;
    ready=true;clearTimer();root.dataset.loadingState='ready';root.classList.add('done');
    cleanup();schedule(()=>root.remove(),800);
  }
  function setStage(next){
    if(ready||failed||disposed)return;
    if(next==='ready'){journal.push({stage:next,ms:Math.round(now()-startedAt)});finish();return;}
    if(!Object.hasOwn(LABELS,next))return;
    phase=next;journal.push({stage:next,ms:Math.round(now()-startedAt)});
    root.dataset.loadingStage=next;root.dataset.loadingState='loading';
    status.textContent=LABELS[next];detail.hidden=true;retry.hidden=true;copy.hidden=true;clearTimer();
    timer=schedule(()=>{
      if(ready||failed||disposed)return;
      root.dataset.loadingState='slow';tools();
      detail.textContent='이 단계가 오래 걸리고 있어요. 다시 연결하거나 점검 결과를 복사해 주세요.';
    },12000);
  }
  function onStage(event){setStage(event.detail);}
  function onFailure(event){fail(event.detail);}
  function fromGame(filename){
    if(!/^(https?:\/\/|\/(src|vendor|node_modules)\/)/.test(filename))return false;
    try{const url=new URL(filename,entryUrl);return url.origin===entryUrl.origin&&/^\/(src|vendor|node_modules)\//.test(url.pathname);}catch{return false;}
  }
  function onError(event){if(event.filename&&fromGame(event.filename))fail(event.error||event.message);}
  function onRejection(event){
    // A top-level import failure is caught below; this handles game callbacks.
    // Unrelated rejected promises from Instagram's injected scripts are ignored.
    if(String(event.reason?.stack||'').split(/\s+/).some(part=>fromGame(part.replace(/[()]/g,''))))fail(event.reason);
  }
  function onVisibility(){if(document.hidden)hiddenDuringStartup=true;}
  function reload(){retry.disabled=true;window.location.reload();}
  async function copyResult(){
    result.value=report();result.hidden=false;
    try{await window.navigator.clipboard.writeText(result.value);copy.textContent='복사했어요';}
    catch{result.focus();result.select?.();copy.textContent='아래 내용을 복사해 주세요';}
  }
  function cleanup(){
    window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onRejection);
    document.removeEventListener('fab-startup',onStage);document.removeEventListener('fab-startup-error',onFailure);
    document.removeEventListener('visibilitychange',onVisibility);
    retry.removeEventListener('click',reload);copy.removeEventListener('click',copyResult);
  }
  retry.addEventListener('click',reload);copy.addEventListener('click',copyResult);
  document.addEventListener('fab-startup',onStage);document.addEventListener('fab-startup-error',onFailure);
  document.addEventListener('visibilitychange',onVisibility);
  window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onRejection);
  setStage('files');
  const started=Promise.resolve().then(()=>loadModule(entryUrl.href)).catch(fail);
  return {started,report,get stage(){return phase;},dispose(){disposed=true;clearTimer();cleanup();}};
}
