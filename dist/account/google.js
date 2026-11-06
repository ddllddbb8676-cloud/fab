// A launch link and the origin's private receipt travel separately. Neither
// Google credentials nor the receipt belong in URLs, referrers or the clipboard.
function createGoogleBrowserFlow({api,el,panel,message,onResult,onConflict,onMode,google,run}) {
  const ua=navigator.userAgent;
  const embedded=/Instagram|FBAN|FBAV|KAKAOTALK|Line\/|; wv\)/i.test(ua);
  const storeKey='fab-google-origin-v1', browserKey='fab-google-browser-v1';
  const fragment=/^#open=([a-f0-9]{64})$/.exec(location.hash)?.[1];
  let pending,recipient,checking=false,timer,active=true;
  function read(key){try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}}
  function save(key,data){try{if(data)sessionStorage.setItem(key,JSON.stringify(data));else sessionStorage.removeItem(key);}catch{}}
  function urlFor(key){return location.origin+'/account?mode=browser#open='+key;}
  function externalUrl(url){
    if(/iPad|iPhone|iPod/i.test(ua))return url.replace(/^https:/,'x-safari-https:');
    if(/Android/i.test(ua))return url.replace(/^https:/,'intent:')+'#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(url)+';end';
    return url;
  }
  function replaceUrl(url){try{history.replaceState(null,'',url);}catch{}}
  function restart(text){
    clearTimeout(timer);save(storeKey,null);
    const previous=pending;pending=null;
    panel('external');message(text);el('open-browser').hidden=true;el('retry-handoff').hidden=false;
    el('retry-handoff').onclick=()=>location.replace('/account?mode='+(previous?.mode||'link'));
  }
  function schedule(){clearTimeout(timer);if(active && pending && !document.hidden)timer=setTimeout(pickup,2500);}
  async function pickup(){
    if(!pending||checking||!active||document.hidden)return;
    if(Date.now()>=pending.expires){restart('인증 시간이 지났어요. 다시 시작해 주세요.');return;}
    checking=true;
    const job=pending;
    try{
      const result=await api('handoff-pickup',{receipt:job.receipt});
      if(pending!==job)return;
      if(result.state==='conflict'){
        pending=null;save(storeKey,null);onConflict(job.mode);return;
      }
      if(result.state==='ready'){
        clearTimeout(timer);
        await onResult(job);
        pending=null;save(storeKey,null);
        replaceUrl('/account?mode='+job.mode);
      }
    }catch(error){
      if(error.status===410){
        if(job.mode==='link'){
          const status=await api('status').catch(()=>null);
          if(status?.linked && status.character?.name && status.character.name===job.label){
            pending=null;save(storeKey,null);location.replace('/');return;
          }
        }
        restart(error.message);return;
      }
      if(error.status===409){pending=null;save(storeKey,null);message(error.message);return;}
      message('인증 결과를 다시 확인하고 있어요.');
    }finally{checking=false;schedule();}
  }
  function waiting(job){
    pending=job;save(storeKey,job);
    replaceUrl(urlFor(job.key));
    panel('external');el('open-browser').hidden=false;el('retry-handoff').hidden=true;
    el('open-browser').href=externalUrl(urlFor(job.key));
    message(job.mode==='link'?'구글 계정을 선택한 뒤 돌아오면 이 캐릭터가 자동으로 연결돼요.':
      '브라우저에서 인증한 뒤 돌아오면 자동으로 이어져요. 요청 번호 '+job.key.slice(-4).toUpperCase());
    schedule();
  }
  async function prepare(mode,characterCode,label){
    const result=await api('handoff-create',{mode,characterCode});
    return {...result,mode,characterCode,label};
  }
  function launch(job){
    onMode(job.mode,job.characterCode);waiting(job);
    location.assign(el('open-browser').href);
  }
  async function prepareLink(anchor,mode,label){
    const job=await prepare(mode,undefined,label);
    const originalHref=anchor.href;
    anchor.href=externalUrl(urlFor(job.key));
    anchor.onclick=event=>{
      event.preventDefault();
      if(job.expires-Date.now()<15000){location.assign(originalHref);return;}
      launch(job);
    };
  }
  function browserState({state,googleName}){
    if(state==='approve'){
      panel('browser-approval');message('이 기기에서 시작한 요청인지 확인해 주세요.');
      const action={login:'원래 팹뿌에 로그인',start:'원래 팹뿌에서 게임 시작',recover:'구글 연결 바로잡기',unlink:'구글 연결 해제'}[recipient.mode];
      const target=googleName?'구글에 연결된 캐릭터는 ‘'+googleName+'’예요. ':'';
      el('approval-text').textContent=target+'원래 팹뿌 화면의 요청 번호가 '+recipient.key.slice(-4).toUpperCase()+'이면 계속해 주세요.';
      el('approve-browser').textContent=action;return;
    }
    panel('browser-done');
    message(state==='conflict'?'연결된 캐릭터가 달라요. 원래 화면에서 ‘현재 캐릭터 인증하기’를 이용해 주세요.':'구글 인증을 마쳤어요.');
  }
  async function receive(key){
    recipient={key};save(browserKey,{key,expires:Date.now()+300000});
    replaceUrl('/account?mode=browser');
    const job=await api('handoff-open',{key});
    recipient.mode=job.mode;
    el('heading').textContent={link:'현재 캐릭터를 구글에 연결',login:'구글로 로그인하기',start:'구글로 시작하기',recover:'현재 캐릭터 인증하기',unlink:'구글 연결 해제'}[job.mode];
    el('intro').textContent=job.mode==='link'?'구글 계정을 선택하면 ‘'+job.label+'’ 캐릭터에 연결돼요.':
      (job.label?'원래 팹뿌의 캐릭터는 ‘'+job.label+'’예요. ':'')+'내가 팹뿌에서 시작한 요청일 때만 계속해 주세요.';
    if(job.state!=='waiting'){browserState(job);return;}
    await google(job.nonce,async credential=>{
      const result=await api('handoff-verify',{key,credential});
      browserState(result);
    });
  }
  async function resume(){
    const savedOrigin=read(storeKey), savedBrowser=read(browserKey);
    if(embedded && savedOrigin && (!fragment || fragment===savedOrigin.key)){
      onMode(savedOrigin.mode,savedOrigin.characterCode);waiting(savedOrigin);await pickup();return;
    }
    const key=fragment || (savedBrowser?.expires>Date.now() && savedBrowser.key);
    if(!key){panel('finish');message('처음 열었던 팹뿌에서 구글 연결을 다시 눌러 주세요.');return;}
    if(embedded){
      panel('external');el('open-browser').href=externalUrl(urlFor(key));
      message('휴대폰 브라우저에서 구글 계정을 선택해 주세요.');return;
    }
    await receive(key);
  }
  el('approve-browser').onclick=()=>run(async()=>{
    const result=await api('handoff-approve',{key:recipient.key});
    browserState(result);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else void pickup();});
  window.addEventListener('focus',()=>void pickup());
  window.addEventListener('pagehide',()=>{active=false;clearTimeout(timer);});
  window.addEventListener('pageshow',()=>{active=true;void pickup();});
  return {embedded,resume,prepareLink,async start(mode,code,label){launch(await prepare(mode,code,label));}};
}

const el=id=>document.getElementById(id);
const routes={
  home:['내 캐릭터 · 구글 연동',''],
  start:['구글로 시작하기','전에 연결한 캐릭터가 있으면 바로 이어가요. 처음 쓰는 구글 계정이면 새 캐릭터로 시작해요.'],
  login:['구글로 로그인하기','전에 캐릭터를 연결한 구글 계정을 선택해 주세요. 그때 쓰던 닉네임과 칩을 불러와요.'],
  link:['현재 캐릭터를 구글에 연결','지금 보이는 닉네임을 저장할 구글 계정을 선택해 주세요.'],
  repair:['현재 캐릭터 인증하기','구글로 로그인했는데 다른 닉네임이 떴나요? 원래 키운 캐릭터가 어디에 보이는지 선택해 주세요.'],
  source:['캐릭터 코드 받기','구글을 다른 캐릭터에 연결했다면, 원래 키운 캐릭터의 코드를 여기서 받아요.'],
  recover:['원래 캐릭터 가져오기','구글로 로그인했는데 다른 닉네임이 떴을 때 사용해요.'],
  unlink:['구글 연결 해제','연결한 구글 계정으로 한 번 더 인증해 주세요.'],
  code:['구글 인증 코드 받기','이전에 열어 둔 팹뿌 화면에 쓸 코드를 받아요.'],
  browser:['구글 계정 확인','']
};
const requested=new URL(location.href).searchParams.get('mode');
let mode=location.hash==='#code'?'code':Object.hasOwn(routes,requested)&&requested!=='code'?requested:'home';
let current, ticket, characterCode, choice, googleScript, busy=false;
const message=text=>{el('message').textContent=text;};
const describe=p=>p.name+' (파괴 '+p.broken+'대 · 수리 '+p.repaired+'대)';
function panel(id){for(const section of document.querySelectorAll('[data-panel]'))section.hidden=section.id!==id;}
function finish(text){panel('finish');message(text);}
function enterGame(text){finish(text);setTimeout(()=>location.replace('/'),950);}
async function api(step,data){
  const options={credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)};
  if(data)Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const response=await fetch('/api/account/google/'+step,options);
  const value=await response.json();
  if(!response.ok){
    const error=Error(value.message||'요청을 마치지 못했어요. 다시 시도해 주세요.');
    error.status=response.status;throw error;
  }
  return value;
}
async function run(work){
  if(busy)return;
  busy=true;
  for(const b of document.querySelectorAll('button'))b.disabled=true;
  try{await work();}
  catch(error){message(error.name==='TimeoutError'||error instanceof TypeError?'연결이 늦어요. 잠시 후 다시 눌러 주세요.':error.message);}
  finally{busy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;}
}
async function copy(id){
  try{await navigator.clipboard.writeText(el(id).value);message('복사했어요.');}
  catch{el(id).focus();el(id).select();message('선택된 내용을 길게 눌러 복사해 주세요.');}
}
function showCode(code,label,hint){
  el('issued').value=code;el('issued-label').textContent=label;el('copy-code').textContent=label+' 복사';
  el('code-hint').textContent=hint;panel('transfer');message('');
}
function confirmStep(step,title,text,button){
  choice=step;
  el('choice-title').textContent=title;el('choice-text').textContent=text;el('apply').textContent=button;
  panel('choice');message('');
}
function loadGoogle(){
  if(!googleScript)googleScript=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const failed=()=>{clearTimeout(timer);script.onload=null;script.remove();googleScript=null;reject(Error('구글 버튼을 불러오지 못했어요. 다시 열거나 Safari 또는 Chrome에서 인증해 주세요.'));};
    const timer=setTimeout(failed,10000);
    script.src='https://accounts.google.com/gsi/client';script.async=true;
    script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=failed;document.head.append(script);
  });
  return googleScript;
}
async function accept(code){
  ticket=code;
  if(mode==='start'||mode==='login'){
    await api(mode==='start'?'register':'signin',{code});
    location.replace('/');return;
  }
  if(mode==='recover'){
    let result;
    try{result=await api('recover-preview',{code,characterCode});}
    catch(error){panel('recover');throw error;}
    const previous=result.previous?'지금 구글에는 '+describe(result.previous)+' 캐릭터가 연결돼 있어요.\n':'';
    const text=previous+'가져올 캐릭터는 '+describe(result.target)+'예요.\n다음 로그인부터 이 캐릭터로 들어가요. 기록은 캐릭터마다 따로 보관돼요.';
    confirmStep('recover-confirm','이 캐릭터를 가져올까요?',text,'확인 · '+result.target.name+' 가져오기');return;
  }
  const result=await api('preview',{code});
  const name=result.target.name, account=result.hint?'구글 계정 '+result.hint+'\n':'';
  if(mode==='unlink'){
    if(result.action!=='linked')throw Error('이 캐릭터에 연결했던 구글 계정을 선택해 주세요.');
    confirmStep('unlink','구글 연결을 해제할까요?',account+'다른 기기의 구글 로그인이 종료돼요. '+name+'의 기록은 처음 플레이한 기기에 남아요.','구글 연결 해제');return;
  }
  if(result.action==='linked'){enterGame(name+' 캐릭터로 돌아가요.');return;}
  if(result.action==='restore'){
    panel('finish');message(account+'이 구글 계정에는 '+name+' 캐릭터가 연결돼 있어요. 연결을 바꾸려면 ‘현재 캐릭터 인증하기’를 눌러 주세요.');
    el('recover-link').hidden=false;return;
  }
  if(!current.character || name!==current.character.name)throw Error('현재 닉네임이 바뀌었어요. 게임 메뉴에서 다시 연결해 주세요.');
  await api('link',{code});ticket=null;
  enterGame(name+' 구글 연결 완료! 게임으로 돌아가요.');
}
async function showGoogle(nonce,complete){
  panel('auth');message('');
  el('begin').hidden=false;
  message('구글 로그인 버튼을 준비하고 있어요.');
  await loadGoogle();
  const identity=window.google.accounts.id;
  identity.initialize({client_id:current.clientId,nonce,auto_select:false,itp_support:true,ux_mode:'popup',callback:reply=>run(async()=>{
    el('google-button').replaceChildren();el('begin').hidden=false;message('구글 계정을 확인하고 있어요.');
    await complete(reply.credential);
  })});
  el('google-button').replaceChildren();identity.renderButton(el('google-button'),{theme:'outline',size:'large',text:'continue_with',locale:'ko'});
  el('begin').hidden=true;message('');
  if(mode!=='code')try{identity.prompt();}catch{}
}
function selectMode(next,code) {
  mode=next;if(code)characterCode=code;
  el('heading').textContent=routes[mode][0];el('intro').textContent=routes[mode][1];
  el('character').hidden=!current?.character||['start','login'].includes(mode);
  if(!el('character').hidden){
    el('nickname').textContent=current.character.name;
    el('record').textContent='파괴 '+current.character.broken+'대 · 수리 '+current.character.repaired+'대';
  }
}
function conflict(){
  finish('이 구글 계정과 연결된 캐릭터가 달라요. 원래 닉네임으로 바꾸려면 ‘현재 캐릭터 인증하기’를 눌러 주세요.');
  el('recover-link').hidden=false;
}
const browserFlow=createGoogleBrowserFlow({api,el,panel,message,run,google:showGoogle,onMode:selectMode,onConflict:conflict,
  onResult:job=>{selectMode(job.mode,job.characterCode);return accept(job.receipt);}});
async function auth(){
  if(browserFlow.embedded && mode!=='code'){await browserFlow.start(mode,characterCode,current.character?.name);return;}
  if(browserFlow.embedded){finish('처음 열었던 팹뿌에서 구글 연결 버튼을 다시 눌러 주세요.');return;}
  const {nonce}=await api('start',{});
  await showGoogle(nonce,async credential=>{
    const {code}=await api('verify',{credential});
    if(mode==='code')showCode(code.match(/.{4}/g).join('-'),'구글 인증 코드','이전에 열어 둔 화면에서 5분 안에 사용해 주세요.');
    else await accept(code);
  });
}
async function home(){
  panel('home');message(current.linked?'구글에 연결된 캐릭터예요.':'');
  const link=el('link-current');
  if(current.linked || !current.character){
    link.removeAttribute('href');link.setAttribute('aria-disabled','true');
    el('link-caption').textContent=current.linked?'이미 구글에 연결했어요. 다른 기기에서는 2번을 눌러 주세요.':'먼저 게임에서 캐릭터를 만들면 여기에 연결할 수 있어요.';
  }else el('link-caption').textContent='지금 키우는 ‘'+current.character.name+'’의 닉네임, 칩, 아이템을 저장해요.';
  el('leave').hidden=!current.restored;el('manage-linked').hidden=!current.linked;
  if(browserFlow.embedded){
    const useLink=!!current.character&&!current.linked;
    // Give each external link a real user gesture, with a normal URL as fallback.
    const links=[browserFlow.prepareLink(el('login-saved'),'login')];
    if(useLink)links.push(browserFlow.prepareLink(link,'link',current.character.name));
    await Promise.allSettled(links);
  }
}
async function init(){
  const [title,intro]=routes[mode];
  el('heading').textContent=title;document.title=title+' · 팹뿌';el('intro').textContent=intro;
  el('guest').hidden=mode!=='start'&&mode!=='login';el('account-home').hidden=['home','code'].includes(mode);
  if(mode==='start'){el('back').href='/account/welcome';el('back').textContent='← 시작 화면';}
  else if(!['home','code'].includes(mode)){el('back').href='/account';el('back').textContent='← 내 캐릭터';el('account-home').hidden=true;}
  current=await api('status');
  if(!current.enabled){finish('구글 연결을 준비 중이에요. 게스트로 게임에 바로 들어갈 수 있어요.');return;}
  if(current.character && !['code','start','login','browser'].includes(mode)){
    el('character').hidden=false;el('nickname').textContent=current.character.name;
    el('record').textContent='파괴 '+current.character.broken+'대 · 수리 '+current.character.repaired+'대';
  }
  if(mode==='home'){await home();return;}
  if(mode==='browser'){await browserFlow.resume();return;}
  message('');
  if(mode==='repair'){
    const original=current.character&&!current.restored&&!current.linked;
    el('repair-here').hidden=!original;el('source-link').hidden=!original;
    if(original)el('repair-here').textContent='‘'+current.character.name+'’로 연결 바로잡기';
    if(current.restored && current.original){
      el('repair-original').hidden=false;el('repair-original').textContent='이 기기에서 처음 키운 ‘'+current.original+'’ 확인';
    }
    if(current.linked && !current.restored)message('지금 보이는 닉네임은 이미 구글에 연결돼 있어요. 다른 닉네임을 가져오려면 그 캐릭터가 보이는 기기를 선택해 주세요.');
    panel('repair');return;
  }
  if(mode==='source'){
    if(!current.character||current.restored||current.linked){
      let help='원래 캐릭터가 보이는 기기의 게임 메뉴에서 코드를 받아 주세요.';
      if(current.restored)help='지금은 구글로 불러온 캐릭터예요. 내 캐릭터 메뉴에서 ‘이 기기의 원래 캐릭터로 돌아가기’를 눌러 원래 닉네임을 확인해 주세요.';
      else if(current.linked)help='이 캐릭터는 이미 구글에 연결돼 있어요. 연결한 구글 계정으로 로그인해 주세요.';
      finish(help);
    }else panel('source');
    return;
  }
  if(mode==='recover'){panel('recover');return;}
  if(mode==='link'&&(!current.character||current.linked)){
    finish(current.linked?'이 캐릭터는 이미 구글에 연결돼 있어요.':'원래 닉네임이 보이는 게임에서 구글 연동을 열어 주세요.');return;
  }
  await auth();
}
el('begin').onclick=()=>run(mode==='browser'?browserFlow.resume:auth);el('copy-code').onclick=()=>copy('issued');
el('repair-here').onclick=()=>run(async()=>{
  const {code}=await api('character-code',{});
  selectMode('recover',code);await auth();
});
el('repair-original').onclick=()=>run(async()=>{await api('leave',{});location.replace('/account?mode=repair');});
el('issue').onclick=()=>run(async()=>{
  const {code}=await api('character-code',{});
  showCode(code,'캐릭터 코드','다른 기기의 ‘원래 캐릭터 가져오기’에 붙여넣어 주세요. 5분 동안 한 번 쓸 수 있어요. 이 코드는 다른 사람에게 보내지 마세요.');
});
el('recover-next').onclick=()=>run(async()=>{
  characterCode=el('character-code').value.trim().toUpperCase();
  if(!/^FAB-(?:[A-F0-9]{6}-){3}[A-F0-9]{6}$/.test(characterCode))throw Error('FAB-로 시작하는 캐릭터 코드를 통째로 붙여넣어 주세요.');
  await auth();
});
el('apply').onclick=()=>run(async()=>{
  try{await api(choice,{code:ticket,characterCode});}
  catch(error){if(choice==='recover-confirm' && error.status===409)panel('recover');throw error;}
  ticket=null;el('character').hidden=true;
  if(choice==='recover-confirm'){location.replace('/');return;}
  finish(choice==='link'?'연결했어요. 다른 기기에서 ‘구글로 시작하기’를 누르면 이 캐릭터로 바로 들어가요.':'구글 연결을 해제했어요.');
});
el('leave').onclick=()=>run(async()=>{await api('leave',{});location.replace('/');});
window.addEventListener('pageshow',event=>{if(event.persisted && new URL(location.href).searchParams.get('mode')!=='browser')location.reload();});
run(init);
