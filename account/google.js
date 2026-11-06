const el = id => document.getElementById(id);
const codeOnly = location.hash === '#code';
const embedded = /Instagram|FBAN|FBAV|KAKAOTALK|Line\/|; wv\)/i.test(navigator.userAgent);
let current, ticket, action, googleScript, busy = false;
const message = text => { el('message').textContent = text; };
function show(section) {
  for (const id of ['actions','choice','transfer','return']) el(id).hidden = id !== section;
}
async function api(step, data) {
  const options = {credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)};
  if (data) Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const response = await fetch('/api/account/google/'+step,options);
  const value = await response.json();
  if (!response.ok) throw Error(value.message || '요청을 마치지 못했어요. 다시 시도해 주세요.');
  return value;
}
async function run(work) {
  if (busy) return;
  busy = true;
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try { await work(); }
  catch (error) { message(error.name === 'TimeoutError' || error instanceof TypeError ? '연결이 늦어요. 다시 시도해 주세요.' : error.message); }
  finally {
    busy = false;
    for (const button of document.querySelectorAll('button')) button.disabled = false;
  }
}
function showActions() {
  ticket = null; action = null; el('code').value = ''; show('actions');
  el('google-button').replaceChildren();
  el('begin').hidden = embedded;
  el('external').hidden = !embedded;
  el('manual').hidden = codeOnly;
  el('manual').open = embedded && !codeOnly;
  el('leave').hidden = codeOnly || !current?.restored;
  message(current?.linked && !codeOnly ? '이 캐릭터는 구글에 연결돼 있어요. 같은 계정으로 다시 인증하면 연결을 해제할 수 있어요.' : '');
}
function loadGoogle() {
  if (!googleScript) googleScript = new Promise((resolve,reject) => {
    const script = document.createElement('script');
    const failed = () => { clearTimeout(timer); script.remove(); googleScript = null; reject(Error('구글 로그인 버튼을 불러오지 못했어요. Safari나 Chrome에서 다시 시도해 주세요.')); };
    const timer = setTimeout(failed,10000);
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = () => { clearTimeout(timer); resolve(); }; script.onerror = failed;
    document.head.append(script);
  });
  return googleScript;
}
async function preview(code) {
  const result = await api('preview',{code});
  ticket = code; action = result.action; show('choice'); message('');
  const name = result.target.name;
  const account = result.hint ? '구글 계정 '+result.hint+' · ' : '';
  el('choice-title').textContent = {link:name+' 캐릭터를 연결할까요?',restore:name+' 캐릭터로 들어갈까요?',linked:name+' 캐릭터가 이미 연결돼 있어요.'}[action];
  el('choice-text').textContent = account+({
    link:'이 캐릭터의 칩, 아이템, 파괴·수리 기록을 다른 기기에서도 이어서 써요.',
    restore:'파괴 '+result.target.broken+'대 · 수리 '+result.target.repaired+'대. '+(result.current ? '현재 캐릭터 '+result.current.name+'의 기록은 따로 보관돼요.' : '이 기기에서 이 기록으로 이어가요.'),
    linked:'연결을 해제하면 다른 기기의 구글 로그인이 종료돼요. 처음 플레이한 브라우저에서 이 캐릭터를 계속 쓸 수 있어요.'
  })[action];
  el('apply').textContent = {link:'이 캐릭터 연결',restore:'이 캐릭터 불러오기',linked:'구글 연결 해제'}[action];
}
async function begin() {
  message('구글 로그인 버튼을 준비하고 있어요.');
  const [{nonce}] = await Promise.all([api('start',{}),loadGoogle()]);
  const identity = window.google.accounts.id;
  identity.initialize({client_id:current.clientId,nonce,auto_select:false,ux_mode:'popup',callback:reply=>run(async()=>{
    // A nonce can only be redeemed once. Make retry available even on dismiss/expiry.
    el('begin').hidden=false; el('google-button').replaceChildren(); message('구글 인증을 확인하고 있어요.');
    const {code} = await api('verify',{credential:reply.credential});
    if (codeOnly) { el('issued').value=code.match(/.{4}/g).join('-'); show('transfer'); message('원래 플레이하던 브라우저로 돌아가 주세요.'); }
    else await preview(code);
  })});
  el('google-button').replaceChildren();
  identity.renderButton(el('google-button'),{theme:'outline',size:'large',text:'continue_with',locale:'ko'});
  el('begin').textContent='로그인 버튼 다시 열기'; message('');
}
async function copy(id) {
  try { await navigator.clipboard.writeText(el(id).value); message('복사했어요.'); }
  catch { el(id).focus(); el(id).select(); message('선택된 내용을 길게 눌러 복사해 주세요.'); }
}
el('url').value = location.origin+'/account#code';
el('copy-url').onclick = ()=>copy('url'); el('copy-code').onclick = ()=>copy('issued');
el('begin').onclick = ()=>run(begin);
el('check').onclick = ()=>run(()=>preview(el('code').value.toUpperCase().replace(/[\s-]/g,'')));
el('cancel').onclick = showActions;
el('apply').onclick = ()=>run(async()=>{
  const step = action === 'linked' ? 'unlink' : action;
  await api(step,{code:ticket}); ticket = null; el('character').hidden = true; show('return');
  message({link:'연결했어요. 다른 기기에서도 같은 구글 계정으로 이 캐릭터를 불러올 수 있어요.',restore:'불러왔어요. 게임으로 돌아가면 이 캐릭터로 들어가요.',unlink:'구글 연결을 해제했어요.'}[step]);
});
el('leave').onclick = ()=>run(async()=>{
  await api('leave',{}); el('character').hidden=true; show('return'); message('이 기기의 원래 캐릭터로 돌아왔어요.');
});
async function init() {
  current = await api('status');
  if (!current.enabled) { show('return'); message('구글 연결을 준비 중이에요. 게임은 바로 이용할 수 있어요.'); return; }
  if (codeOnly) { el('heading').textContent='구글 인증 코드 받기'; el('intro').textContent='내 구글 계정을 확인하고 원래 팹뿌 화면에서 사용할 코드를 받아요.'; }
  else if (current.character) {
    el('character').hidden=false; el('nickname').textContent=current.character.name;
    el('record').textContent='파괴 '+current.character.broken+'대 · 수리 '+current.character.repaired+'대';
  }
  showActions();
}
// Do not revive an earlier code or character after a browser history restoration.
window.addEventListener('pageshow',event=>{if(event.persisted) location.reload();});
run(init);
