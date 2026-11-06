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
