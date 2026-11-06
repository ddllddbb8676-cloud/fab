import {digest} from './google-identity.js';
import {newSessionToken} from './player-profiles.js';

const modes=new Set(['link','start','login','recover','unlink']);
const lifetime=5*60*1000;
const invalid='인증 시간이 지났어요. 팹뿌에서 구글 연결을 다시 눌러 주세요.';

// The origin chooses its own character. A verified browser can finish that link
// while the origin is suspended. Only the origin can redeem its private receipt.
export function createBrowserHandoff({sql,init,row,view,linked,linkedProfile,saveLink,newTicket,clock,fail,transaction,sourceForCode,resetting}) {
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
    if(mode==='link' && (profile!==device || !character || linked(profile)))fail(409,'게임에서 연결할 캐릭터의 이름을 확인해 주세요.');
    if(mode==='unlink' && !linked(profile))fail(409,'연결된 구글 계정이 없어요.');
    if(resetting(profile)||resetting(target))fail(409,'잠시 후 다시 시도해 주세요.');
    const key=newSessionToken(),receipt=newSessionToken().slice(0,24).toUpperCase();
    const [launch,proof]=await Promise.all([launchHash(key),digest('ticket:'+receipt)]);
    const expires=clock()+lifetime;
    transaction(()=>{
      sql.exec('DELETE FROM google_tickets WHERE expires<=?',clock());
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
    return {mode:job.mode,label:job.label,state:job.state,linked:savedLink(job),googleName:target?(await view(target))?.name:undefined,nonce:job.state==='waiting'?nonce:undefined};
  }
  function savedLink(job) {
    if(job.mode!=='link' || !['ready','claimed'].includes(job.state))return false;
    return job.subject ? linkedProfile(job.subject)===job.profile : linked(job.profile);
  }
  async function verify(browser,current,key,{nonce,subject,hint}) {
    prepare();
    const launch=await launchHash(key);
    const pending=lookup(launch);
    let play;
    if(pending.mode==='link'){
      if(pending.state!=='waiting'||pending.browser!==browser||pending.nonce!==nonce)fail(409,invalid);
      const character=await view(pending.profile);
      if(!character || character.name!==pending.label)fail(409,'캐릭터가 바뀌었어요. 원래 게임에서 닉네임을 확인하고 다시 연결해 주세요.');
      play=await newTicket();
    }
    const result=transaction(()=>{
      const job=lookup(launch);
      if(job.state!=='waiting'||job.browser!==browser||job.nonce!==nonce)fail(409,invalid);
      const original=linkedProfile(subject);
      if(job.mode==='link'){
        if(job.profile!==job.origin||resetting(job.profile))fail(409,invalid);
        // Never replace either side of an existing link or give a conflicting
        // request the name or login of the other Google account's character.
        if(original===job.profile || (!original && !linked(job.profile))){
          if(!original)saveLink(job.profile,subject,job.receipt);
          sql.exec("UPDATE google_handoffs SET state='ready',subject=?,hint=?,nonce=NULL WHERE launch=?",subject,hint,launch);
          // Only the browser that submitted Google's signed credential gets
          // this single-use login. Opening the URL or polling cannot issue one.
          sql.exec("INSERT INTO google_tickets(hash,subject,hint,expires,device,current_profile,scope) VALUES(?,?,?,?,?,?,'login')",play.hash,subject,hint,job.expires,browser,current);
          return {state:'ready',linked:true,label:job.label,signinCode:play.code};
        }
      }else if(job.mode!=='unlink'||original===job.profile){
        sql.exec("UPDATE google_handoffs SET state='approve',subject=?,hint=?,nonce=NULL WHERE launch=?",subject,hint,launch);
        return {state:'approve',target:original};
      }
      sql.exec("UPDATE google_handoffs SET state='conflict',nonce=NULL WHERE launch=?",launch);
      return {state:'conflict'};
    });
    if(result.state==='approve')return {state:'approve',googleName:result.target?(await view(result.target))?.name:undefined};
    return result;
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
      return {state:'ready',linked:savedLink(job)};
    });
  }
  function revoke(profile,subject=null,keepReceipt='') {
    if(!ready && (!sql || !row("SELECT 1 FROM sqlite_master WHERE type='table' AND name='google_handoffs'")))return;
    sql.exec('DELETE FROM google_tickets WHERE hash IN (SELECT receipt FROM google_handoffs WHERE (profile=? OR subject=?) AND receipt<>?)',profile,subject,keepReceipt);
    sql.exec('DELETE FROM google_handoffs WHERE (profile=? OR subject=?) AND receipt<>?',profile,subject,keepReceipt);
  }
  return {create,open,verify,approve,pickup,revoke};
}
