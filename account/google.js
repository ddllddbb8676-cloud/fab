const el=id=>document.getElementById(id);
const routes={
  home:['내 캐릭터 · 구글 연동',''],
  start:['구글로 시작하기','전에 연결한 캐릭터가 있으면 바로 이어가요. 처음 쓰는 구글 계정이면 새 캐릭터로 시작해요.'],
  login:['구글로 로그인','예전에 캐릭터를 연결한 구글 계정을 선택하면 그 캐릭터로 바로 들어가요.'],
  link:['이 캐릭터 구글에 연결','아래 닉네임이 맞으면 사용할 구글 계정을 선택해 주세요. 칩과 아이템도 함께 이어져요.'],
  source:['캐릭터 코드 받기','구글을 다른 캐릭터에 연결했다면, 원래 키운 캐릭터의 코드를 여기서 받아요.'],
  recover:['원래 캐릭터 가져오기','구글로 로그인했는데 다른 닉네임이 떴을 때 사용해요.'],
  unlink:['구글 연결 해제','연결한 구글 계정으로 한 번 더 인증해 주세요.'],
  code:['구글 인증 코드 받기','구글 계정을 선택하고, 원래 열어 둔 팹뿌 화면에서 쓸 코드를 받아요.']
};
const requested=new URL(location.href).searchParams.get('mode');
const mode=location.hash==='#code'?'code':Object.hasOwn(routes,requested)&&requested!=='code'?requested:'home';
const embedded=/Instagram|FBAN|FBAV|KAKAOTALK|Line\/|; wv\)/i.test(navigator.userAgent);
let current, ticket, characterCode, choice, googleScript, busy=false;
const message=text=>{el('message').textContent=text;};
const describe=p=>p.name+' (파괴 '+p.broken+'대 · 수리 '+p.repaired+'대)';
function panel(id){for(const section of document.querySelectorAll('[data-panel]'))section.hidden=section.id!==id;}
function finish(text){panel('finish');message(text);}
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
  if(result.action==='linked'){finish(name+' 캐릭터는 이미 이 구글 계정에 연결돼 있어요.');return;}
  if(result.action==='restore'){
    panel('finish');message(account+'이 구글 계정에는 '+name+' 캐릭터가 연결돼 있어요. 지금 보이는 캐릭터로 바꾸려면 ‘원래 캐릭터 가져오기’를 이용해 주세요.');
    el('recover-link').hidden=false;return;
  }
  confirmStep('link',name+' 캐릭터를 연결할까요?',account+describe(result.target)+'\n다른 기기에서 같은 구글 계정으로 로그인하면 이 캐릭터가 열려요.','이 캐릭터 연결');
}
async function auth(){
  panel('auth');message('');
  el('external').hidden=!embedded;el('manual').hidden=mode==='code';el('manual').open=embedded&&mode!=='code';
  el('begin').hidden=embedded;
  if(embedded)return;
  message('구글 로그인 버튼을 준비하고 있어요.');
  const [{nonce}]=await Promise.all([api('start',{}),loadGoogle()]);
  const identity=window.google.accounts.id;
  identity.initialize({client_id:current.clientId,nonce,auto_select:false,ux_mode:'popup',callback:reply=>run(async()=>{
    el('google-button').replaceChildren();el('begin').hidden=false;message('구글 계정을 확인하고 있어요.');
    const {code}=await api('verify',{credential:reply.credential});
    if(mode==='code')showCode(code.match(/.{4}/g).join('-'),'구글 인증 코드','원래 열어 둔 팹뿌 화면의 ‘구글 인증 코드 입력’에 붙여넣어 주세요. 5분 안에 본인만 사용해 주세요.');
    else await accept(code);
  })});
  el('google-button').replaceChildren();identity.renderButton(el('google-button'),{theme:'outline',size:'large',text:'continue_with',locale:'ko'});
  el('begin').hidden=true;message('');
}
function home(){
  panel('home');message(current.linked?'구글에 연결된 캐릭터예요.':'');
  el('start-new').hidden=!!current.character||current.linked;
  el('link-current').hidden=!current.character||current.linked;
  el('source-link').hidden=!current.character||current.restored||current.linked;
  el('leave').hidden=!current.restored;el('manage-linked').hidden=!current.linked;
}
async function init(){
  const [title,intro]=routes[mode];
  el('heading').textContent=title;document.title=title+' · 팹뿌';el('intro').textContent=intro;
  el('guest').hidden=mode!=='start'&&mode!=='login';el('account-home').hidden=['home','code'].includes(mode);
  if(mode==='start'){el('back').href='/account/welcome';el('back').textContent='← 시작 화면';}
  else if(!['home','code'].includes(mode)){el('back').href='/account';el('back').textContent='← 내 캐릭터';el('account-home').hidden=true;}
  current=await api('status');
  if(!current.enabled){finish('구글 연결을 준비 중이에요. 게스트로 게임에 바로 들어갈 수 있어요.');return;}
  if(current.character && !['code','start','login'].includes(mode)){
    el('character').hidden=false;el('nickname').textContent=current.character.name;
    el('record').textContent='파괴 '+current.character.broken+'대 · 수리 '+current.character.repaired+'대';
  }
  if(mode==='home'){home();return;}
  message('');
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
el('url').value=location.origin+'/account#code';
el('begin').onclick=()=>run(auth);el('copy-url').onclick=()=>copy('url');el('copy-code').onclick=()=>copy('issued');
el('check').onclick=()=>run(()=>{
  const code=el('code').value.trim().toUpperCase().replace(/[\s-]/g,'');
  if(!/^[A-F0-9]{24}$/.test(code))throw Error('여기에는 Safari나 Chrome에서 받은 구글 인증 코드를 붙여넣어 주세요.');
  return accept(code);
});
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
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
run(init);
