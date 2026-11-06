import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createGoogleAccounts} from '../server/google-accounts.js';
import {googleVerifier,validClientId,digest} from '../server/google-identity.js';
import {googleRoute,accountInRoom} from '../server/account-routes.js';
import {effectiveProfileId} from '../server/account-sessions.js';
import {sessionId} from '../server/player-profiles.js';
import {isAdmin} from '../server/admin-access.js';

const origin='https://fab.test', clientId='123-unit.apps.googleusercontent.com';
const deviceA='a'.repeat(64), deviceB='b'.repeat(64), attacker='c'.repeat(64);
const primary=await sessionId(deviceA), secondary=await sessionId(deviceB);
const pairs=await Promise.all([0,1].map(()=>crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify'])));
const jwk={...await crypto.subtle.exportKey('jwk',pairs[0].publicKey), kid:'test-key',alg:'RS256'};
const as64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function sign(claims={}, header={}, key=pairs[0].privateKey) {
  const iat=Math.floor(Date.now()/1000);
  const body=as64({kid:'test-key',alg:'RS256',...header})+'.'+as64({iss:'https://accounts.google.com',aud:clientId,sub:'provider-id',email:'demo@example.test',email_verified:true,nonce:'d'.repeat(64),iat,exp:iat+3600,...claims});
  return body+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,Buffer.from(body))).toString('base64url');
}
const makeVerifier=()=>googleVerifier({getKeys:()=>Response.json({keys:[jwk]},{headers:{'Cache-Control':'public, max-age=3600'}})});
function fixture(t) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const storage={sql:{exec(query,...args){return {toArray:((rows)=>()=>rows)(db.prepare(query).all(...args))};}},transactionSync(fn){db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
  let now=Date.now();
  const profiles=new Map([[primary,{id:primary,name:'원래팹',brokenCount:7,repairedCount:3,wallet:{balance:155,owned:['helmet'],equipped:{head:'helmet'}}}],[secondary,{id:secondary,name:'새기기',brokenCount:2,repairedCount:5,wallet:{balance:25,owned:[]}}]]);
  const accounts=createGoogleAccounts(storage,{profile:key=>profiles.get(key),clock:()=>now});
  const verify=makeVerifier(), env={FAB_GOOGLE_CLIENT_ID:clientId,FAB_OWNER_VISITOR_ID:primary};
  const retired=[];
  env.FAB_ROOM={getByName:()=>({fetch:async req=>new URL(req.url).pathname==='/account-session' ? Response.json({id:await effectiveProfileId(req,env,accounts)}) : accountInRoom(req,env,accounts,(...args)=>retired.push(args))})};
  const cookie=(device,alias)=>'fab-session-v1='+device+(alias?'; '+alias:'');
  const req=(step,headers={},data)=>new Request(origin+'/api/account/google/'+step,{method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:data?JSON.stringify(data):undefined});
  const call=(step,device,data,alias)=>googleRoute(req(step,{Cookie:cookie(device,alias)},data),env,verify);
  async function code(device,sub='provider-id') {
    const {nonce}=await (await call('start',device,{})).json();
    const credential=await sign({nonce,sub});
    const reply=await call('verify',device,{credential});assert.equal(reply.status,200);
    return {code:(await reply.json()).code,credential};
  }
  return {env,accounts,profiles,db,storage,retired,req,call,code,cookie,advance:ms=>{now+=ms;}};
}
test('Google credentials require our audience, issuer, nonce, freshness and a valid RS256 signature',async()=>{
  const verify=makeVerifier();
  assert.deepEqual(await verify(await sign(),clientId),{subject:await digest('google-sub-v1:provider-id'),nonce:'d'.repeat(64),hint:'d•••@example.test'});
  for(const [claims,header,key] of [[{aud:'wrong'}],[{iss:'evil.test'}],[{exp:1}],[{iat:1}],[{iat:Date.now()}],[{azp:'other'}],[{sub:42}],[{nonce:'fake'}],[{},{alg:'none'}],[{},{kid:'missing'}],[{},{},pairs[1].privateKey]])
    await assert.rejects(verify(await sign(claims,header,key),clientId));
  assert.equal(validClientId(''),false);
});
test('Instagram guest links with a code from another browser then restores without duplicating scores, chips or items',async t=>{
  const f=fixture(t), before=structuredClone(f.profiles);
  const {code,credential}=await f.code(deviceB);
  assert.equal((await f.call('verify',deviceB,{credential})).status,409);
  assert.equal((await f.call('link',deviceA,{code})).status,409);
  const preview=await (await f.call('preview',deviceA,{code})).json();
  assert.equal(preview.target.name,'원래팹');assert.equal(preview.action,'link');
  assert.equal((await f.call('preview',deviceB,{code})).status,409);
  assert.equal((await f.call('link',deviceA,{code})).status,200);
  assert.equal((await f.call('link',deviceA,{code})).status,409);
  const next=await f.code(deviceB);
  const dest=await (await f.call('preview',deviceB,{code:next.code})).json();
  assert.equal(dest.action,'restore');assert.equal(dest.current.name,'새기기');assert.equal(dest.target.name,'원래팹');
  assert.equal((await f.call('link',deviceB,{code:next.code})).status,409);
  const res=await f.call('restore',deviceB,{code:next.code});assert.equal(res.status,200);
  const set=res.headers.get('Set-Cookie');assert.match(set,/HttpOnly; SameSite=Lax; Secure/);
  const alias=set.split(';')[0];
  assert.equal((await (await f.call('status',deviceB,undefined,alias)).json()).character.name,'원래팹');
  const restored=f.req('status',{Cookie:f.cookie(deviceB,alias)}), stolen=f.req('status',{Cookie:f.cookie(attacker,alias)});
  assert.equal(await isAdmin(restored,f.env),true);assert.equal(await isAdmin(stolen,f.env),false);
  assert.equal((await f.call('leave',deviceB,{},alias)).status,200);
  assert.equal(await isAdmin(restored,f.env),false);
  assert.equal((await (await f.call('status',deviceB,undefined,alias)).json()).character.name,'새기기');
  assert.deepEqual(f.profiles,before);
});
test('wrong nonce or browser, replay, concurrent or expired confirmations cannot steal a link',async t=>{
  const f=fixture(t);
  const {nonce}=await (await f.call('start',deviceA,{})).json();
  assert.equal((await f.call('verify',deviceB,{credential:await sign({nonce})})).status,409);
  const first=await f.code(deviceA), second=await f.code(deviceB,'different');
  for(const q of [first,second])assert.equal((await f.call('preview',deviceA,{code:q.code})).status,200);
  const attempts=await Promise.all([first,second].map(q=>f.call('link',deviceA,{code:q.code})));
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM google_links').get().n,1);
  const expired=await f.code(deviceA); f.advance(300001);
  assert.equal((await f.call('preview',deviceA,{code:expired.code})).status,409);
  assert.equal((await f.call('preview',deviceA,{code:'malformed'})).status,409);
});
test('fresh verification is required to unlink and all restored sessions lose access',async t=>{
  const f=fixture(t);
  async function act(device,action){const {code}=await f.code(device);await f.call('preview',device,{code});return f.call(action,device,{code});}
  await act(deviceA,'link');const restored=await act(deviceB,'restore'), alias=restored.headers.get('Set-Cookie').split(';')[0];
  const wrong=await f.code(deviceA,'other');assert.equal((await f.call('unlink',deviceA,{code:wrong.code})).status,409);
  assert.equal((await act(deviceA,'unlink')).status,200);
  assert.equal((await (await f.call('status',deviceB,undefined,alias)).json()).character.name,'새기기');
  assert.equal(f.accounts.linked(primary),false);assert.equal(f.retired.at(-1)[1],primary);
});
test('disabled, anonymous and foreign-origin requests fail before starting authentication',async t=>{
  const f=fixture(t);
  assert.equal((await googleRoute(f.req('start',{Cookie:f.cookie(deviceA),Origin:'https://bad.test'},{}),f.env)).status,403);
  assert.equal((await googleRoute(f.req('start',{},{}),f.env)).status,401);
  assert.equal((await googleRoute(f.req('status'),{...f.env,FAB_GOOGLE_CLIENT_ID:''})).status,200);
  assert.equal((await googleRoute(f.req('verify',{Cookie:f.cookie(deviceA)},{}),{...f.env,FAB_GOOGLE_CLIENT_ID:''})).status,503);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='google_links'").get().n,0);
});

async function existingLink(f,device,subject='provider-id'){
  const {code}=await f.code(device,subject);
  assert.equal((await f.call('preview',device,{code})).status,200);
  assert.equal((await f.call('link',device,{code})).status,200);
}
const aliasOf=response=>response.headers.get('Set-Cookie').split(';')[0];
test('first Google entry reserves an unused FAB identity, and subsequent Google login opens it directly',async t=>{
  const f=fixture(t), before=structuredClone(f.profiles), guest=await sessionId(attacker);
  let proof=await f.code(attacker);
  assert.equal((await f.call('signin',attacker,proof)).status,409);
  assert.equal((await f.call('register',deviceA,proof)).status,409);
  assert.equal((await f.call('register',attacker,proof)).status,200);
  assert.deepEqual(f.profiles,before);assert.equal(f.accounts.linked(guest),true);
  assert.equal((await f.call('signin',deviceB,proof)).status,409);
  proof=await f.code(deviceB);
  const restored=await f.call('signin',deviceB,proof);assert.equal(restored.status,200);
  const req=f.req('status',{Cookie:f.cookie(deviceB,aliasOf(restored))});
  assert.equal(await effectiveProfileId(req,f.env),guest);
  assert.equal((await f.call('signin',deviceB,proof)).status,409);
});
test('mislinked Google takes the proven original character only after showing both names, preserving both wallets',async t=>{
  const f=fixture(t), before=structuredClone(f.profiles);
  await existingLink(f,deviceB);
  const oldSession=await f.call('signin',attacker,await f.code(attacker));
  const oldAlias=aliasOf(oldSession);
  assert.equal((await f.call('character-code',attacker,{},oldAlias)).status,409);
  const source=await (await f.call('character-code',deviceA,{})).json();
  assert.match(source.code,/^FAB-(?:[A-F0-9]{6}-){3}[A-F0-9]{6}$/);
  const {code}=await f.code(deviceB), data={code,characterCode:source.code};
  assert.equal((await f.call('recover-confirm',deviceB,data)).status,409);
  assert.equal((await f.call('recover-preview',deviceB,{...data,code:'BAD'})).status,409);
  const preview=await (await f.call('recover-preview',deviceB,data)).json();
  assert.equal(preview.previous.name,'새기기');assert.equal(preview.target.name,'원래팹');
  assert.equal(f.accounts.linked(primary),false);assert.equal(f.accounts.linked(secondary),true);
  assert.equal((await f.call('recover-confirm',attacker,data)).status,409);
  const done=await f.call('recover-confirm',deviceB,data);assert.equal(done.status,200);
  const restored=f.req('status',{Cookie:f.cookie(deviceB,aliasOf(done))});
  assert.equal(await effectiveProfileId(restored,f.env),primary);
  assert.equal(await isAdmin(restored,f.env),true);
  const revoked=f.req('status',{Cookie:f.cookie(attacker,oldAlias)});
  assert.equal(await effectiveProfileId(revoked,f.env),await sessionId(attacker));
  assert.ok(f.retired.some(([,id])=>id===secondary));
  assert.equal((await f.call('recover-confirm',deviceB,data)).status,409);
  const later=await f.call('signin',attacker,await f.code(attacker));
  assert.equal((await (await f.call('status',attacker,undefined,aliasOf(later))).json()).character.name,'원래팹');
  assert.deepEqual(f.profiles,before);
});
test('replacement, expiry, a linked source, and a competing claim cannot reuse a character code',async t=>{
  const f=fixture(t), source=async()=>(await (await f.call('character-code',deviceA,{})).json()).code;
  const stale=await source(), valid=await source(), one=await f.code(deviceB), two=await f.code(attacker,'other');
  assert.equal((await f.call('recover-preview',deviceB,{code:one.code,characterCode:stale})).status,409);
  const attempts=await Promise.all([[deviceB,one],[attacker,two]].map(([dev,proof])=>f.call('recover-preview',dev,{code:proof.code,characterCode:valid})));
  assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
  f.advance(300001);
  assert.equal((await f.call('recover-confirm',deviceB,{code:one.code,characterCode:valid})).status,409);
  const beforeLink=await source();
  await existingLink(f,deviceA,'third');
  assert.equal((await f.call('character-code',deviceA,{})).status,409);
  const unbind=await f.code(deviceA,'third');await f.call('preview',deviceA,unbind);await f.call('unlink',deviceA,unbind);
  const fresh=await f.code(deviceB);
  assert.equal((await f.call('recover-preview',deviceB,{code:fresh.code,characterCode:beforeLink})).status,409);
  assert.equal((await f.call('recover-preview',deviceB,{code:fresh.code,characterCode:valid})).status,409);
});
async function browserVerification(f,job,browser,sub='browser-user'){
  const open=await f.call('handoff-open',browser,{key:job.key});
  assert.equal(open.status,200);
  const {nonce}=await open.json();
  const credential=await sign({nonce,sub});
  return {credential,response:await f.call('handoff-verify',browser,{key:job.key,credential})};
}

test('another browser can sign in after Google verifies the link even if Instagram never runs again',async t=>{
  const f=fixture(t), profiles=structuredClone(f.profiles);
  const job=await (await f.call('handoff-create',deviceA,{mode:'link'})).json();
  const {response}=await browserVerification(f,job,deviceB);
  assert.equal(response.status,200);
  // The original tab stays closed past the lifetime of the handoff.
  f.advance(300001);
  const fresh=await f.code(attacker,'browser-user');
  const login=await f.call('signin',attacker,{code:fresh.code});
  assert.equal(login.status,200);
  const alias=login.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await (await f.call('status',attacker,undefined,alias)).json()).character.name,'원래팹');
  assert.deepEqual(f.profiles,profiles);
});

test('browser link is bound to its origin, Google browser, nonce and single purpose, and preserves both profiles',async t=>{
  const f=fixture(t), original=structuredClone(f.profiles);
  const job=await (await f.call('handoff-create',deviceA,{mode:'link'})).json();
  const pickup=d=>f.call('handoff-pickup',d,{receipt:job.receipt});
  assert.equal((await (await pickup(deviceA)).json()).state,'waiting');
  const {credential,response}=await browserVerification(f,job,deviceB);
  const saved=await response.json();
  assert.equal(saved.state,'ready');assert.equal(saved.linked,true);assert.equal(saved.label,'원래팹');
  assert.equal((await f.call('handoff-open',attacker,{key:job.key})).status,409);
  assert.equal((await f.call('handoff-verify',deviceB,{key:job.key,credential})).status,409);
  assert.equal((await f.call('verify',deviceB,{credential})).status,409);
  assert.equal((await pickup(deviceB)).status,410);
  for(let i=0;i<2;i++)assert.deepEqual(await (await pickup(deviceA)).json(),{state:'ready',linked:true});
  const revisit=await (await f.call('handoff-open',deviceB,{key:job.key})).json();
  assert.equal(revisit.linked,true);assert.equal(revisit.signinCode,undefined);
  const proof={code:job.receipt};
  for(const action of ['signin','register','restore','unlink'])assert.equal((await f.call(action,deviceA,proof)).status,409);
  assert.equal((await f.call('preview',deviceB,proof)).status,409);
  const legacy=await (await f.call('preview',deviceA,proof)).json();
  assert.equal(legacy.target.name,'원래팹');assert.equal(legacy.action,'linked');
  assert.equal((await f.call('link',deviceA,proof)).status,409);
  assert.equal((await (await f.call('status',deviceA)).json()).linked,true);
  assert.equal((await (await f.call('status',deviceB)).json()).linked,false);
  const play={code:saved.signinCode};
  for(const other of [deviceA,attacker])assert.equal((await f.call('signin',other,play)).status,409);
  for(const action of ['register','preview','link','unlink'])assert.equal((await f.call(action,deviceB,play)).status,409);
  const login=await f.call('signin',deviceB,play);
  assert.equal(login.status,200);assert.equal((await f.call('signin',deviceB,play)).status,409);
  const alias=login.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await (await f.call('status',deviceB,undefined,alias)).json()).character.name,'원래팹');
  assert.deepEqual(f.profiles,original);
});

test('concurrent links keep one character per Google identity, and an old or reset target cannot take it',async t=>{
  const f=fixture(t);
  const create=async d=>(await f.call('handoff-create',d,{mode:'link'})).json();
  const [a,b]=await Promise.all([create(deviceA),create(deviceB)]);
  const attempts=await Promise.all([browserVerification(f,a,deviceB),browserVerification(f,b,attacker)]);
  const results=await Promise.all(attempts.map(x=>x.response.json()));
  assert.deepEqual(results.map(r=>r.state).sort(),['conflict','ready']);
  assert.deepEqual(results.find(r=>r.state==='conflict'),{state:'conflict'});
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM google_links').get().n,1);
  const other=results[0].linked?deviceB:deviceA, otherId=await sessionId(other);
  const orphan=await create(other);
  f.profiles.delete(otherId);
  const {response}=await browserVerification(f,orphan,attacker,'unused');
  assert.equal(response.status,409);
  assert.equal(f.accounts.linked(otherId),false);
});

test('a browser login requires the Google browser to approve the requesting screen and only the original cookie can sign in',async t=>{
  const f=fixture(t);
  const proof=await f.code(deviceA,'linked'), link={code:proof.code};
  await f.call('preview',deviceA,link);await f.call('link',deviceA,link);
  const create=async mode=>(await f.call('handoff-create',attacker,{mode})).json();
  const wrongLink=await (await f.call('handoff-create',deviceB,{mode:'link'})).json();
  assert.equal((await (await browserVerification(f,wrongLink,deviceA,'linked')).response.json()).state,'conflict');
  assert.equal((await f.call('signin',deviceB,{code:wrongLink.receipt})).status,409);
  const job=await create('login');
  const {response}=await browserVerification(f,job,deviceB,'linked');
  assert.equal((await response.json()).state,'approve');
  assert.equal((await (await f.call('handoff-pickup',attacker,{receipt:job.receipt})).json()).state,'waiting');
  assert.equal((await f.call('handoff-approve',attacker,{key:job.key})).status,409);
  assert.equal((await f.call('handoff-approve',deviceB,{key:job.key})).status,200);
  assert.equal((await f.call('handoff-pickup',attacker,{receipt:job.receipt})).status,200);
  assert.equal((await f.call('signin',deviceB,{code:job.receipt})).status,409);
  assert.equal((await f.call('register',attacker,{code:job.receipt})).status,409);
  const signin=await f.call('signin',attacker,{code:job.receipt});
  const alias=signin.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await f.call('status',attacker,undefined,alias)).json()).character.name,'원래팹');
  const expired=await create('start');f.advance(300001);
  assert.equal((await f.call('handoff-open',deviceB,{key:expired.key})).status,410);
  assert.equal((await f.call('handoff-pickup',attacker,{receipt:expired.receipt})).status,410);
});

test('browser recovery proof cannot change a different source or be used as an ordinary login',async t=>{
  const f=fixture(t), before=structuredClone(f.profiles);
  const proof=await f.code(deviceB,'old'), code={code:proof.code};
  await f.call('preview',deviceB,code);await f.call('link',deviceB,code);
  const characterCode=(await (await f.call('character-code',deviceA,{})).json()).code;
  const job=await (await f.call('handoff-create',deviceA,{mode:'recover',characterCode})).json();
  const {response}=await browserVerification(f,job,deviceB,'old');
  assert.equal((await response.json()).state,'approve');
  await f.call('handoff-approve',deviceB,{key:job.key});await f.call('handoff-pickup',deviceA,{receipt:job.receipt});
  const args={code:job.receipt,characterCode};
  assert.equal((await f.call('recover-confirm',deviceA,args)).status,409);
  assert.equal((await f.call('signin',deviceA,args)).status,409);
  const preview=await (await f.call('recover-preview',deviceA,args)).json();
  assert.equal(preview.target.name,'원래팹');assert.equal(preview.previous.name,'새기기');
  assert.equal((await f.call('recover-confirm',deviceA,args)).status,200);
  assert.deepEqual(f.profiles,before);
});
