import {newSessionToken} from './player-profiles.js';
import {deviceDays} from './account-sessions.js';
import {digest} from './google-identity.js';

const minutes = 5*60*1000;
export class AccountError extends Error {
  constructor(status,message) { super(message); this.status=status; }
}
const fail = (status,message) => { throw new AccountError(status,message); };
const invalidCode = () => fail(409,'사용했거나 만료된 코드예요. 구글 인증부터 다시 해 주세요.');
const changed = () => fail(409,'연결 상태가 바뀌었어요. 캐릭터 이름을 다시 확인해 주세요.');
const invalidCharacter = () => fail(409,'원래 기기에서 새 캐릭터 코드를 복사해 주세요. 코드는 5분 동안 한 번 쓸 수 있어요.');
async function ticketHash(code) {
  if (typeof code !== 'string' || !/^[A-F0-9]{24}$/.test(code)) invalidCode();
  return digest('ticket:'+code);
}
async function deviceKey() {
  const secret=newSessionToken();
  return {secret,hash:await digest('device:'+secret)};
}
export function createGoogleAccounts(storage, {profile, resetting = () => false, clock = Date.now}) {
  // These tables are independent of profile:*, score, equipment and wallet storage.
  const sql = storage.sql;
  let initialized = false, characterCodesReady = false;
  const row = (statement,...args) => sql.exec(statement,...args).toArray()[0];
  function exists() {
    if (!initialized && sql) initialized = Boolean(row("SELECT 1 FROM sqlite_master WHERE type='table' AND name='google_links'"));
    return initialized;
  }
  function init() {
    if (exists()) return;
    storage.transactionSync(() => {
      sql.exec('CREATE TABLE google_links(subject TEXT PRIMARY KEY, profile TEXT UNIQUE NOT NULL)');
      sql.exec('CREATE TABLE google_nonces(device TEXT PRIMARY KEY, nonce TEXT NOT NULL, expires INTEGER NOT NULL)');
      sql.exec('CREATE TABLE google_tickets(hash TEXT PRIMARY KEY, subject TEXT NOT NULL, hint TEXT NOT NULL, expires INTEGER NOT NULL, device TEXT, current_profile TEXT, target TEXT, action TEXT)');
      sql.exec('CREATE TABLE google_devices(hash TEXT PRIMARY KEY, device TEXT NOT NULL, profile TEXT NOT NULL, expires INTEGER NOT NULL)');
      for (const table of ['google_nonces','google_tickets','google_devices']) sql.exec('CREATE INDEX '+table+'_expiry ON '+table+'(expires)');
      sql.exec('CREATE INDEX google_devices_profile ON google_devices(profile)');
    });
    initialized = true;
  }
  function clean() {
    for (const table of ['google_nonces','google_tickets','google_devices']) sql.exec('DELETE FROM '+table+' WHERE expires <= ?',clock());
  }
  function linked(id) { return exists() && Boolean(row('SELECT 1 FROM google_links WHERE profile=?',id)); }
  function linkedProfile(subject) { return row('SELECT profile FROM google_links WHERE subject=?',subject)?.profile ?? null; }
  function prepareCharacterCodes() {
    init();
    if (characterCodesReady) return;
    sql.exec('CREATE TABLE IF NOT EXISTS google_character_codes(profile TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL, ticket TEXT, previous TEXT)');
    sql.exec('CREATE INDEX IF NOT EXISTS google_character_codes_expiry ON google_character_codes(expires)');
    characterCodesReady=true;
  }
  function discardCharacterCode(id) {
    if (characterCodesReady || (sql && row("SELECT 1 FROM sqlite_master WHERE type='table' AND name='google_character_codes'"))) {
      sql.exec('DELETE FROM google_character_codes WHERE profile=?',id);
    }
  }
  function installDevice(device,target,key) {
    sql.exec('DELETE FROM google_devices WHERE device=?',device);
    if (target===device) return {secret:'',setDevice:true};
    sql.exec('INSERT INTO google_devices VALUES (?,?,?,?)',key.hash,device,target,clock()+deviceDays*86400000);
    return {secret:key.secret,setDevice:true};
  }
  function restoredSession(hash, device) {
    return exists() && row('SELECT profile,expires FROM google_devices WHERE hash=? AND device=? AND expires>?', hash,device,clock());
  }
  async function view(id) {
    const p = await profile(id);
    return p ? {name:p.civilianName || p.name, broken:p.brokenCount || 0, repaired:p.repairedCount || 0} : null;
  }
  function start(device) {
    init(); clean();
    if (row('SELECT COUNT(*) AS n FROM google_nonces').n >= 2048) fail(429,'잠시 후 다시 시도해 주세요.');
    const nonce = newSessionToken();
    sql.exec('INSERT OR REPLACE INTO google_nonces VALUES (?,?,?)',device,nonce,clock()+minutes);
    return {nonce};
  }
  async function verified(device, {subject,nonce,hint}) {
    init();
    const code = newSessionToken().slice(0,24).toUpperCase(), hash = await digest('ticket:'+code);
    storage.transactionSync(() => {
      if (!row('DELETE FROM google_nonces WHERE device=? AND nonce=? AND expires>? RETURNING device',device,nonce,clock())) invalidCode();
      sql.exec('INSERT INTO google_tickets(hash,subject,hint,expires) VALUES (?,?,?,?)',hash,subject,hint,clock()+minutes);
    });
    return {code};
  }
  function ticket(hash,device,current) {
    const value = row('SELECT * FROM google_tickets WHERE hash=? AND expires>?',hash,clock());
    if (!value || (value.device && (value.device !== device || value.current_profile !== current))) invalidCode();
    return value;
  }
  function intent(subject,current) {
    const dest = linkedProfile(subject);
    if (dest) return {action:dest === current ? 'linked' : 'restore', dest};
    if (linked(current)) fail(409,'이 캐릭터에는 다른 구글 계정이 연결돼 있어요.');
    return {action:'link',dest:current};
  }
  async function useCode({code, device, current, action}) {
    init();
    const hash = await ticketHash(code);
    const initial = ticket(hash,device,current), plan = intent(initial.subject,current);
    const [here,there] = await Promise.all([view(current),plan.dest === current ? null : view(plan.dest)]);
    if (plan.action === 'link' && !here) fail(409,'저장할 캐릭터로 게임에 한 번 입장한 뒤 연결해 주세요.');
    const empty={name:'첫 입장 전 캐릭터',broken:0,repaired:0};
    const key = action === 'restore' ? await deviceKey() : null;
    return storage.transactionSync(() => {
      const value = ticket(hash,device,current), now = intent(value.subject,current);
      if (now.action !== plan.action || now.dest !== plan.dest || resetting(current) || resetting(now.dest)) changed();
      if (action === 'preview') {
        sql.exec('UPDATE google_tickets SET device=?, current_profile=?, target=?, action=? WHERE hash=?',device,current,plan.dest,plan.action,hash);
        return {action:plan.action, current:here, target:(plan.dest===current?here:there) || empty, hint:value.hint};
      }
      const unlink = action === 'unlink' && plan.action === 'linked';
      if (value.device !== device || value.current_profile !== current || value.target !== plan.dest || value.action !== plan.action ||
          (!unlink && (action !== plan.action || action === 'linked'))) fail(409,'캐릭터를 다시 확인해 주세요.');
      if (action === 'link') {
        sql.exec('INSERT INTO google_links VALUES (?,?)',value.subject,current);
        discardCharacterCode(current);
      }
      const login = action === 'restore' ? installDevice(device,now.dest,key) : {};
      if (unlink) {
        sql.exec('DELETE FROM google_devices WHERE profile=?',current);
        sql.exec('DELETE FROM google_links WHERE subject=?',value.subject);
        sql.exec('DELETE FROM google_tickets WHERE subject=?',value.subject);
        discardCharacterCode(current);
      }
      sql.exec('DELETE FROM google_tickets WHERE hash=?',hash);
      return {ok:true,...login,unlink};
    });
  }
  async function signIn({code,device,current,create}) {
    init();
    const hash=await ticketHash(code);
    const [key,here]=await Promise.all([deviceKey(),view(current)]);
    return storage.transactionSync(()=>{
      const proof=ticket(hash,device,current);
      if(proof.action) invalidCode();
      let target=linkedProfile(proof.subject);
      if (!target) {
        if (!create) fail(409,'이 구글 계정에 연결된 캐릭터가 없어요. 예전 기기의 게임 메뉴에서 먼저 연결해 주세요.');
        if (current!==device || here || linked(current)) fail(409,'이 기기에 캐릭터가 있어요. 내 캐릭터 메뉴에서 이름을 확인하고 구글에 연결해 주세요.');
        target=device;
        // Reserve the real guest ID. The ordinary first room join creates its name and wallet.
        sql.exec('INSERT INTO google_links VALUES (?,?)',proof.subject,target);
      }
      if (resetting(target) || resetting(current)) changed();
      sql.exec('DELETE FROM google_tickets WHERE hash=?',hash);
      return installDevice(device,target,key);
    });
  }
  async function issueCharacterCode(device,current) {
    if (device!==current || !await view(current)) fail(409,'원래 캐릭터가 보이는 기기에서 코드를 받아 주세요.');
    prepareCharacterCodes();
    const code='FAB-'+newSessionToken().slice(0,24).toUpperCase().match(/.{6}/g).join('-');
    const hash=await digest('character:'+code);
    if (linked(current) || resetting(current)) fail(409,'이미 구글에 연결한 캐릭터는 그 구글 계정으로 로그인해 주세요.');
    sql.exec('DELETE FROM google_character_codes WHERE expires<=?',clock());
    sql.exec('INSERT OR REPLACE INTO google_character_codes(profile,hash,expires) VALUES (?,?,?)',current,hash,clock()+minutes);
    return {code};
  }
  async function recover({code,characterCode,device,current,confirm}) {
    if (typeof characterCode!=='string' || !/^FAB-(?:[A-F0-9]{6}-){3}[A-F0-9]{6}$/.test(characterCode)) invalidCharacter();
    prepareCharacterCodes();
    const [hash,sourceHash]=await Promise.all([ticketHash(code),digest('character:'+characterCode)]);
    function readPair() {
      const proof=ticket(hash,device,current);
      if (proof.action && proof.action!=='recover') invalidCode();
      const source=row('SELECT * FROM google_character_codes WHERE hash=? AND expires>?',sourceHash,clock());
      if (!source || (source.ticket && source.ticket!==hash)) invalidCharacter();
      const previous=linkedProfile(proof.subject);
      if (linked(source.profile) || resetting(source.profile) || resetting(current) || (previous && resetting(previous))) changed();
      return {proof,source,previous};
    }
    const plan=readPair();
    const [target,old,key]=await Promise.all([view(plan.source.profile),plan.previous && view(plan.previous),confirm && deviceKey()]);
    if (!target) invalidCharacter();
    return storage.transactionSync(()=>{
      const {proof,source,previous}=readPair();
      if (previous!==plan.previous || source.profile!==plan.source.profile) changed();
      if (!confirm) {
        sql.exec('UPDATE google_character_codes SET ticket=?,previous=? WHERE hash=?',hash,previous,sourceHash);
        sql.exec("UPDATE google_tickets SET device=?,current_profile=?,target=?,action='recover' WHERE hash=?",device,current,source.profile,hash);
        return {target,previous:old || (previous?{name:'첫 입장 전 캐릭터',broken:0,repaired:0}:null),hint:proof.hint};
      }
      if (source.ticket!==hash || source.previous!==previous || proof.device!==device || proof.action!=='recover' || proof.target!==source.profile) changed();
      if (previous) {
        sql.exec('DELETE FROM google_devices WHERE profile=?',previous);
        sql.exec('UPDATE google_links SET profile=? WHERE subject=?',source.profile,proof.subject);
      } else sql.exec('INSERT INTO google_links VALUES (?,?)',proof.subject,source.profile);
      sql.exec('DELETE FROM google_character_codes WHERE hash=?',sourceHash);
      sql.exec('DELETE FROM google_tickets WHERE subject=?',proof.subject);
      return {...installDevice(device,source.profile,key),revokedProfile:previous};
    });
  }
  return {start,verified,linked,restoredSession,view,useCode,signIn,issueCharacterCode,recover,discardCharacterCode,
    forgetDevice(device) { if (exists()) sql.exec('DELETE FROM google_devices WHERE device=?',device); }
  };
}
