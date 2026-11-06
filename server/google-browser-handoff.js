import {digest} from './google-identity.js';
import {newSessionToken} from './player-profiles.js';

const modes=new Set(['link','start','login','recover','unlink']);
const lifetime=5*60*1000;
const invalid='인증 시간이 지났어요. 팹뿌에서 구글 연결을 다시 눌러 주세요.';

// Safari and the in-app browser have separate cookie jars. The launch URL can
// verify a Google identity, but only the originating session can collect it.
export function createBrowserHandoff({sql,init,row,view,linked,linkedProfile,clock,fail,transaction,sourceForCode,resetting}) {
  let ready=false;
  function prepare() {
    if(ready)return;
    init();
    transaction(()=>{
      sql.exec('CREATE TABLE IF NOT EXISTS google_handoffs (origin TEXT NOT NULL, profile TEXT NOT NULL, launch TEXT UNIQUE NOT NULL, receipt TEXT UNIQUE NOT NULL, mode TEXT NOT NULL, source TEXT, label TEXT NOT NULL, expires INTEGER NOT NULL, browser TEXT, nonce TEXT, subject TEXT, hint TEXT, state TEXT NOT NULL, PRIMARY KEY(origin,mode))');
      sql.exec('CREATE INDEX IF NOT EXISTS google_handoffs_expiry ON google_handoffs(expires)');
      if(!sql.exec('PRAGMA table_info(google_tickets)').toArray().some(c=>c.name==='scope'))sql.exec('ALTER TABLE google_tickets ADD COLUMN scope TEXT');
    });
    ready=true;
  }
  function lookup(hash) {
    const job=row('SELECT * FROM google_handoffs WHERE launch=? AND expires>?',hash,clock());
    if(!job)fail(410,invalid);
    return job;
  }
  async function launchHash(key) {
    if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))fail(410,invalid);
    return digest('google-launch:'+key);
  }
  async function create(device,profile,{mode,characterCode}) {
    if(!modes.has(mode))fail(400,'이용할 구글 연결 방법을 다시 선택해 주세요.');
    prepare();
    let source=null, target=profile;
    if(mode==='recover'){
      source=await sourceForCode(characterCode);
      target=source.profile;
    }
    const character=await view(target);
    if(mode==='link' && (!character || linked(profile)))fail(409,'게임에서 연결할 캐릭터의 이름을 확인해 주세요.');
    if(mode==='unlink' && !linked(profile))fail(409,'연결된 구글 계정이 없어요.');
    if(resetting(profile)||resetting(target))fail(409,'잠시 후 다시 시도해 주세요.');
    const key=newSessionToken(),receipt=newSessionToken().slice(0,24).toUpperCase();
    const [launch,proof]=await Promise.all([launchHash(key),digest('ticket:'+receipt)]);
    const expires=clock()+lifetime;
    transaction(()=>{
      sql.exec('DELETE FROM google_handoffs WHERE expires<=?',clock());
      if(row('SELECT COUNT(*) AS n FROM google_handoffs').n>=2048)fail(429,'잠시 후 다시 눌러 주세요.');
      const previous=row('SELECT receipt FROM google_handoffs WHERE origin=? AND mode=?',device,mode);
      if(previous)sql.exec('DELETE FROM google_tickets WHERE hash=?',previous.receipt);
      sql.exec("INSERT OR REPLACE INTO google_handoffs(origin,profile,launch,receipt,mode,source,label,expires,state) VALUES(?,?,?,?,?,?,?,?,'waiting')",device,profile,launch,proof,mode,source?.hash??null,character?.name??'',expires);
    });
    return {key,receipt,expires};
  }
  async function open(browser,key) {
    prepare();
    const job=lookup(await launchHash(key));
    if(job.browser && job.browser!==browser)fail(409,'처음 연 브라우저에서 계속해 주세요.');
    const nonce=job.nonce || newSessionToken();
    if(job.state==='waiting')sql.exec('UPDATE google_handoffs SET browser=?,nonce=? WHERE launch=?',browser,nonce,job.launch);
    const target=job.state==='approve' && linkedProfile(job.subject);
    return {mode:job.mode,label:job.label,state:job.state,googleName:target?(await view(target))?.name:undefined,nonce:job.state==='waiting'?nonce:undefined};
  }
  async function verify(browser,key,{nonce,subject,hint}) {
    prepare();
    const job=lookup(await launchHash(key));
    if(job.state!=='waiting'||job.browser!==browser||job.nonce!==nonce)fail(409,invalid);
    // A link-only request must never sign its origin in to an already-linked
    // account. Disclose neither that character's name nor its records on conflict.
    const original=linkedProfile(subject);
    const conflict=(job.mode==='link' && original && original!==job.profile) || (job.mode==='unlink' && original!==job.profile);
    const state=conflict?'conflict':job.mode==='link'?'ready':'approve';
    sql.exec('UPDATE google_handoffs SET state=?,subject=?,hint=?,nonce=NULL WHERE launch=?',state,conflict?null:subject,conflict?'':hint,job.launch);
    return {state,googleName:state==='approve'&&original?(await view(original))?.name:undefined};
  }
  async function approve(browser,key) {
    prepare();
    const job=lookup(await launchHash(key));
    if(job.browser!==browser)fail(409,invalid);
    if(job.state==='ready'||job.state==='claimed')return {state:'ready'};
    if(job.state!=='approve')fail(409,invalid);
    sql.exec("UPDATE google_handoffs SET state='ready' WHERE launch=?",job.launch);
    return {state:'ready'};
  }
  async function pickup(device,profile,receipt) {
    if(typeof receipt!=='string'||!/^[A-F0-9]{24}$/.test(receipt))fail(410,invalid);
    prepare();
    const proof=await digest('ticket:'+receipt);
    return transaction(()=>{
      const job=row('SELECT * FROM google_handoffs WHERE receipt=? AND origin=? AND profile=? AND expires>?',proof,device,profile,clock());
      if(!job||resetting(profile))fail(410,invalid);
      if(job.state==='conflict')return {state:'conflict'};
      if(job.state!=='ready' && job.state!=='claimed')return {state:'waiting'};
      if(job.state==='ready'){
        const scope=job.mode==='recover'?'recover:'+job.source:job.mode;
        sql.exec('INSERT INTO google_tickets(hash,subject,hint,expires,device,current_profile,scope) VALUES(?,?,?,?,?,?,?)',proof,job.subject,job.hint,job.expires,device,profile,scope);
        sql.exec("UPDATE google_handoffs SET state='claimed',subject=NULL,hint=NULL WHERE receipt=?",proof);
      }
      return {state:'ready'};
    });
  }
  function revoke(profile,subject=null) {
    if(!ready && (!sql || !row("SELECT 1 FROM sqlite_master WHERE type='table' AND name='google_handoffs'")))return;
    sql.exec('DELETE FROM google_tickets WHERE hash IN (SELECT receipt FROM google_handoffs WHERE profile=? OR subject=?)',profile,subject);
    sql.exec('DELETE FROM google_handoffs WHERE profile=? OR subject=?',profile,subject);
  }
  return {create,open,verify,approve,pickup,revoke};
}
