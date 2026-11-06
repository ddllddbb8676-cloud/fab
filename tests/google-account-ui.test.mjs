import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const [script,html,welcome]=await Promise.all(['account/google.js','account.html','account/welcome.html'].map(p=>readFile(new URL(p,root),'utf8')));
const googleCode='A'.repeat(24), fabCode='FAB-000000-111111-222222-333333';
const original={name:'원래팹',broken:20,repaired:5}, mistaken={name:'새캐릭터',broken:1,repaired:0};
async function screen(route,answers,{embedded=false,store=new Map()}={}){
  const elements=new Map([...html.matchAll(/<([\w-]+)\b[^>]*?\bid="([^"]+)"[^>]*>/g)].map(m=>[m[2],{id:m[2],tag:m[1],href:/href="([^"]+)"/.exec(m[0])?.[1],panel:m[0].includes('data-panel'),hidden:/\bhidden\b/.test(m[0]),value:'',replaceChildren(){},removeAttribute(k){delete this[k];},setAttribute(k,v){this[k]=v;}}]));
  const el=id=>{const item=elements.get(id);assert.ok(item,id);return item;};
  const calls=[],visits=[];let callback;
  const document={addEventListener(){},getElementById:el,querySelectorAll(s){return [...elements.values()].filter(e=>s==='[data-panel]'?e.panel:e.tag==='button');},createElement:()=>({remove(){}}),head:{append(s){queueMicrotask(()=>s.onload());}}};
  const window={addEventListener(){},google:{accounts:{id:{initialize(o){callback=o.callback;},renderButton(){}}}}};
  const location=Object.assign(new URL('https://fab.test/account'+route),{replace(path){visits.push(path);},assign(path){visits.push(path);}});
  const history={replaceState(_a,_b,url){location.href=new URL(url,location).href;}};
  const sessionStorage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const fetch=async(path,option)=>{
    const step=path.split('/').pop(), data=option.body && JSON.parse(option.body);
    calls.push({step,data});assert.ok(Object.hasOwn(answers,step),'unexpected '+step);
    const answer=typeof answers[step]==='function'?answers[step](data):answers[step];
    return answer instanceof Response?answer:Response.json(answer);
  };
  const later=(fn,ms)=>{if(ms===950){queueMicrotask(fn);return;}return setTimeout(fn,ms).unref();};
  const context={document,location,history,sessionStorage,navigator:{userAgent:embedded?'Instagram iPhone':'Safari'},window,URL,fetch,AbortSignal,setTimeout:later,clearTimeout};
  await vm.runInNewContext(script,context);
  return {el,visits,calls,location,google:()=>callback({credential:'locally-verified-fixture'})};
}
const status={enabled:true,linked:false,restored:false,character:original,clientId:'test'};
const google={status,start:{nonce:'nonce'},verify:{code:googleCode}};
test('the game notice opens account selection for this character directly, including the Instagram handoff',async()=>{
  const game=await readFile(new URL('index.html',root),'utf8');
  const action=/<a href="\/account(\?mode=link)">바로 연동하러 가기<\/a>/.exec(game);
  assert.ok(action);assert.match(game,/<button type="button">다음에 하기<\/button>/);
  assert.match(game,/첫 구글 연동 보상 1,000칩/);
  const normal=await screen(action[1],google);
  assert.deepEqual(normal.calls.map(c=>c.step),['status','start']);assert.equal(normal.el('auth').hidden,false);
  const key='b'.repeat(64);
  const embedded=await screen(action[1],{status,'handoff-create':{key,receipt:googleCode,expires:Date.now()+300000}},{embedded:true});
  assert.equal(embedded.calls.at(-1).data.mode,'link');
  assert.deepEqual(embedded.visits,['x-safari-https://fab.test/account?mode=browser#open='+key]);
});
test('first visit offers two labeled choices and an existing Google login enters without a second confirmation',async()=>{
  assert.match(welcome,/href="\/account\?mode=start"[^>]*><strong>구글로 시작하기/);
  assert.match(welcome,/href="\/\?play=guest"[^>]*><strong>구글 없이 바로 시작/);
  for(const [mode,step] of [['start','register'],['login','signin']]){
    const ui=await screen('?mode='+mode,{...google,[step]:{ok:true}});await ui.google();
    assert.equal(ui.el('choice').hidden,true);assert.deepEqual(ui.visits,['/']);
    assert.deepEqual(ui.calls.map(r=>r.step),['status','start','verify',step]);
  }
});
test('selecting an unused Google links the displayed character automatically and a conflict offers case three',async()=>{
  const initial={...google,preview:{action:'link',target:original},link:{ok:true,rewardChips:1000}};
  const ui=await screen('?mode=link',initial);await ui.google();
  assert.equal(ui.el('choice').hidden,true);assert.deepEqual(ui.visits,['/']);assert.equal(ui.calls.at(-1).step,'link');
  assert.match(ui.el('message').textContent,/1,000칩을 받았어요/);
  const conflict=await screen('?mode=link',{...google,preview:{action:'restore',target:mistaken}});await conflict.google();
  assert.equal(conflict.el('recover-link').hidden,false);assert.deepEqual(conflict.visits,[]);
});
test('a Google login with no character points to the original game without creating or switching a profile',async()=>{
  const error=()=>Response.json({reason:'google_not_linked',message:'이 구글 계정에 연결된 캐릭터가 없어요.'},{status:409});
  for(const character of [null,original]){
    const ui=await screen('?mode=login',{...google,status:{...status,character},signin:error});
    await ui.google();assert.equal(ui.el('missing-link').hidden,false);assert.equal(ui.el('auth').hidden,true);
    assert.equal(ui.el('link-visible').hidden,!character);
    assert.deepEqual(ui.calls.map(r=>r.step),['status','start','verify','signin']);assert.deepEqual(ui.visits,[]);
  }
});
test('case three can authenticate the visible original automatically or accept its code from another device',async()=>{
  const src=await screen('?mode=source',{status,'character-code':{code:fabCode}});
  await src.el('issue').onclick();assert.equal(src.el('issued').value,fabCode);assert.equal(src.el('issued-label').textContent,'캐릭터 코드');
  for(const mode of ['repair','recover']){
    const ui=await screen('?mode='+mode,{...google,'character-code':{code:fabCode},'recover-preview':{previous:mistaken,target:original},'recover-confirm':{ok:true}});
    if(mode==='repair'){assert.match(ui.el('repair-here').textContent,/원래팹/);await ui.el('repair-here').onclick();}
    else{ui.el('character-code').value=fabCode;await ui.el('recover-next').onclick();}
    await ui.google();assert.equal(ui.el('choice').hidden,false);
    assert.match(ui.el('choice-text').textContent,/새캐릭터/);assert.match(ui.el('choice-text').textContent,/원래팹/);
    assert.deepEqual(ui.visits,[]);await ui.el('apply').onclick();assert.deepEqual(ui.visits,['/']);
    assert.equal(ui.calls.at(-1).data.characterCode,fabCode);
  }
});
test('Instagram sends a real tap to Safari, which authenticates, then the original tab collects without a code field',async()=>{
  const key='b'.repeat(64),job={key,receipt:googleCode,expires:Date.now()+200000},store=new Map();
  const hub=await screen('',{status,'handoff-create':job},{embedded:true,store});
  assert.match(html,/1\. 현재 캐릭터를 구글에 연결/);assert.match(html,/2\. 구글로 로그인하기/);assert.match(html,/3\. 현재 캐릭터 인증하기/);
  assert.doesNotMatch(html,/인증 주소 복사|구글 인증 코드 붙여넣기/);
  hub.el('link-current').onclick({preventDefault(){}});
  assert.ok(hub.visits[0].startsWith('x-safari-https://fab.test/account?mode=browser#open='));assert.ok(!hub.visits[0].includes(googleCode));
  const receiver=await screen('?mode=browser#open='+key,{status,'handoff-open':{mode:'link',label:original.name,state:'waiting',nonce:'sample'},'handoff-verify':{state:'ready'}});
  assert.equal(receiver.location.hash,'');await receiver.google();assert.equal(receiver.el('browser-done').hidden,false);
  const origin=await screen('?mode=browser#open='+key,{status,'handoff-pickup':{state:'ready'},preview:{action:'link',target:original},link:{ok:true}},{embedded:true,store});
  assert.deepEqual(origin.visits,['/']);assert.equal(store.size,0);
});

test('Safari names the saved character and can enter it without the original tab or another Google prompt',async()=>{
  const key='b'.repeat(64), open={mode:'link',label:original.name,state:'waiting',nonce:'test'};
  const saved={state:'ready',linked:true,label:original.name,signinCode:googleCode};
  const safari=await screen('?mode=browser#open='+key,{status,'handoff-open':open,'handoff-verify':saved,signin:{ok:true}});
  await safari.google();
  assert.equal(safari.el('heading').textContent,'구글 연결 완료');assert.match(safari.el('message').textContent,/원래팹/);
  assert.equal(safari.el('browser-linked').hidden,false);assert.equal(safari.el('browser-done').hidden,true);
  assert.deepEqual(safari.visits,[]);
  await safari.el('play-linked').onclick({preventDefault(){}});
  assert.deepEqual(safari.visits,['/']);assert.deepEqual(safari.calls.at(-1).data,{code:googleCode});
  const hub=await screen('?mode=browser#open='+key,{status,'handoff-pickup':{state:'ready',linked:true}},
    {embedded:true,store:new Map([['fab-google-origin-v1',JSON.stringify({key,receipt:googleCode,mode:'link',label:original.name,expires:Date.now()+1000})]])});
  assert.deepEqual(hub.visits,['/']);assert.deepEqual(hub.calls.map(c=>c.step),['status','handoff-pickup']);
});
