import {newSessionToken} from './player-profiles.js';
import {deviceDays} from './account-sessions.js';
import {digest} from './google-identity.js';

const minutes = 5*60*1000;
export class AccountError extends Error {
  constructor(status,message) { super(message); this.status=status; }
}
const fail = (status,message) => { throw new AccountError(status,message); };
const invalidCode = () => fail(409,'사용했거나 만료된 코드예요. 구글 인증부터 다시 해 주세요.');
export function createGoogleAccounts(storage, {profile, resetting = () => false, clock = Date.now}) {
  // These tables are independent of profile:*, score, equipment and wallet storage.
  const sql = storage.sql;
  let initialized = false;
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
    const dest = row('SELECT profile FROM google_links WHERE subject=?',subject)?.profile;
    if (dest) return {action:dest === current ? 'linked' : 'restore', dest};
    if (linked(current)) fail(409,'이 캐릭터에는 다른 구글 계정이 연결돼 있어요.');
    return {action:'link',dest:current};
  }
  async function useCode({code, device, current, action}) {
    init();
    if (typeof code !== 'string' || !/^[A-F0-9]{24}$/.test(code)) invalidCode();
    const hash = await digest('ticket:'+code);
    const initial = ticket(hash,device,current), plan = intent(initial.subject,current);
    const [here,there] = await Promise.all([view(current),plan.dest === current ? null : view(plan.dest)]);
    if (plan.action === 'link' && !here) fail(409,'저장할 캐릭터로 게임에 한 번 입장한 뒤 연결해 주세요.');
    if (plan.action === 'restore' && !there) fail(409,'연결된 캐릭터를 확인하지 못했어요.');
    const secret = action === 'restore' ? newSessionToken() : null;
    const secretHash = secret && await digest('device:'+secret);
    return storage.transactionSync(() => {
      const value = ticket(hash,device,current), now = intent(value.subject,current);
      if (now.action !== plan.action || now.dest !== plan.dest || resetting(current) || resetting(now.dest)) fail(409,'캐릭터 상태가 바뀌었어요. 다시 확인해 주세요.');
      if (action === 'preview') {
        sql.exec('UPDATE google_tickets SET device=?, current_profile=?, target=?, action=? WHERE hash=?',device,current,plan.dest,plan.action,hash);
        return {action:plan.action, current:here, target:there || here, hint:value.hint};
      }
      const unlink = action === 'unlink' && plan.action === 'linked';
      if (value.device !== device || value.current_profile !== current || value.target !== plan.dest || value.action !== plan.action ||
          (!unlink && (action !== plan.action || action === 'linked'))) fail(409,'캐릭터를 다시 확인해 주세요.');
      if (action === 'link') sql.exec('INSERT INTO google_links VALUES (?,?)',value.subject,current);
      if (action === 'restore') {
        // One active restored identity for this browser. Its original guest cookie is retained.
        sql.exec('DELETE FROM google_devices WHERE device=?',device);
        sql.exec('INSERT INTO google_devices VALUES (?,?,?,?)',secretHash,device,now.dest,clock()+deviceDays*86400000);
      }
      if (unlink) {
        sql.exec('DELETE FROM google_devices WHERE profile=?',current);
        sql.exec('DELETE FROM google_links WHERE subject=?',value.subject);
      }
      sql.exec('DELETE FROM google_tickets WHERE hash=?',hash);
      return {ok:true, secret, unlink};
    });
  }
  return {start,verified,linked,restoredSession,view,useCode,
    forgetDevice(device) { if (exists()) sql.exec('DELETE FROM google_devices WHERE device=?',device); }
  };
}
