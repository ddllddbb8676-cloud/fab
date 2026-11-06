import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const [script,html,welcome]=await Promise.all(['account/google.js','account.html','account/welcome.html'].map(p=>readFile(new URL(p,root),'utf8')));
const googleCode='A'.repeat(24), fabCode='FAB-000000-111111-222222-333333';
const original={name:'원래팹',broken:20,repaired:5}, mistaken={name:'새캐릭터',broken:1,repaired:0};
async function screen(route,answers,{embedded=false}={}){
  const elements=new Map([...html.matchAll(/<([\w-]+)\b[^>]*?\bid="([^"]+)"[^>]*>/g)].map(m=>[m[2],{id:m[2],tag:m[1],panel:m[0].includes('data-panel'),hidden:/\bhidden\b/.test(m[0]),value:'',replaceChildren(){}}]));
  const el=id=>{const item=elements.get(id);assert.ok(item,id);return item;};
  const calls=[],visits=[];let callback;
  const document={getElementById:el,querySelectorAll(s){return [...elements.values()].filter(e=>s==='[data-panel]'?e.panel:e.tag==='button');},createElement:()=>({remove(){}}),head:{append(s){queueMicrotask(()=>s.onload());}}};
  const window={addEventListener(){},google:{accounts:{id:{initialize(o){callback=o.callback;},renderButton(){}}}}};
  const location=Object.assign(new URL('https://fab.test/account'+route),{replace(path){visits.push(path);}});
  const fetch=async(path,option)=>{
    const step=path.split('/').pop(), data=option.body && JSON.parse(option.body);
    calls.push({step,data});assert.ok(Object.hasOwn(answers,step),'unexpected '+step);return Response.json(answers[step]);
  };
  const context={document,location,navigator:{userAgent:embedded?'Instagram iPhone':'Safari'},window,URL,fetch,AbortSignal,setTimeout,clearTimeout};
  await vm.runInNewContext(script,context);
  return {el,visits,calls,google:()=>callback({credential:'locally-verified-fixture'})};
}
const status={enabled:true,linked:false,restored:false,character:original,clientId:'test'};
const google={status,start:{nonce:'nonce'},verify:{code:googleCode}};
test('first visit offers two labeled choices and an existing Google login enters without a second confirmation',async()=>{
  assert.match(welcome,/href="\/account\?mode=start"[^>]*><strong>구글로 시작하기/);
  assert.match(welcome,/href="\/\?play=guest"[^>]*><strong>구글 없이 바로 시작/);
  for(const [mode,step] of [['start','register'],['login','signin']]){
    const ui=await screen('?mode='+mode,{...google,[step]:{ok:true}});await ui.google();
    assert.equal(ui.el('choice').hidden,true);assert.deepEqual(ui.visits,['/']);
    assert.deepEqual(ui.calls.map(r=>r.step),['status','start','verify',step]);
  }
});
test('linking the original nickname is explicit and selecting a different linked Google never silently switches the game',async()=>{
  const initial={...google,preview:{action:'link',target:original},link:{ok:true}};
  const ui=await screen('?mode=link',initial);await ui.google();
  assert.equal(ui.el('choice').hidden,false);assert.match(ui.el('choice-title').textContent,/원래팹/);assert.deepEqual(ui.visits,[]);
  assert.equal(ui.calls.at(-1).step,'preview');await ui.el('apply').onclick();assert.equal(ui.calls.at(-1).step,'link');
  const conflict=await screen('?mode=link',{...google,preview:{action:'restore',target:mistaken}});await conflict.google();
  assert.equal(conflict.el('recover-link').hidden,false);assert.deepEqual(conflict.visits,[]);
});
test('a source character code and the Google verification code have different entry fields and recovery shows both names',async()=>{
  const src=await screen('?mode=source',{status,'character-code':{code:fabCode}});
  await src.el('issue').onclick();assert.equal(src.el('issued').value,fabCode);assert.equal(src.el('issued-label').textContent,'캐릭터 코드');
  const ui=await screen('?mode=recover',{status,'recover-preview':{previous:mistaken,target:original},'recover-confirm':{ok:true}},{embedded:true});
  ui.el('character-code').value=googleCode;await ui.el('recover-next').onclick();assert.match(ui.el('message').textContent,/FAB-/);
  ui.el('character-code').value=fabCode;await ui.el('recover-next').onclick();
  assert.equal(ui.el('external').hidden,false);assert.equal(ui.el('manual').open,true);
  ui.el('code').value=fabCode;await ui.el('check').onclick();assert.match(ui.el('message').textContent,/구글 인증 코드/);
  ui.el('code').value=googleCode;await ui.el('check').onclick();assert.equal(ui.el('choice').hidden,false);
  assert.match(ui.el('choice-text').textContent,/새캐릭터/);assert.match(ui.el('choice-text').textContent,/원래팹/);
  assert.deepEqual(ui.visits,[]);await ui.el('apply').onclick();assert.deepEqual(ui.visits,['/']);
  assert.equal(ui.calls.at(-1).data.characterCode,fabCode);
});
