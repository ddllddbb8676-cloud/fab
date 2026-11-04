import {restoreWallet} from './chip-wallet.js';
import {rankScores} from '../src/leaderboard.js';
import {createNicknameRegistry} from './nickname-registry.js';
import {isSafety} from '../src/safety-team.js';
import {configuredOwnerId,hasUnlimitedChips,OWNER_DISPLAY_NAME} from './owner-privileges.js';
const COOKIE='fab-session-v1';
const EQUIPMENT_KEY='world:equipment:v1';
const FOUP_KEY='world:foups:v1';
const EVENTS_KEY='world:events:v1';
export function sessionToken(request) {
  const value=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  return /^[a-f0-9]{64}$/.test(value||'')?value:null;
}
export const newSessionToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export const sessionCookie=(token,url)=>`${COOKIE}=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${new URL(url).protocol==='https:'?'; Secure':''}`;
export async function sessionId(token) {
  if(!token)return null;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('fab-profile-v1:'+token));
  return 'visitor:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export function createProfileStore(storage,{ownerId='',onProfileObserved=()=>{},onProfileRemoved=()=>{}}={}) {
  ownerId=configuredOwnerId(ownerId);
  const pending=new Map(),scores=new Map(),nicknames=createNicknameRegistry();let writes=Promise.resolve(),ranking=[],rankingDirty=true;
  if(ownerId)nicknames.reserve(ownerId,'visitor',OWNER_DISPLAY_NAME);
  // Optional read-only projections must never prevent a game profile from
  // being saved. Observers can mark their own data unavailable on failure.
  function observed(profile){try{onProfileObserved(profile);}catch{}}
  function named(profile) {
    if(!profile.name&&!profile.civilianName)return profile;
    const civilianName=nicknames.claim(profile.id,'visitor',profile.civilianName||(!isSafety(profile.role)?profile.name:''));
    const preferredSafety=profile.safetyName||(isSafety(profile.role)?profile.name:'');
    const safetyName=preferredSafety?nicknames.claim(profile.id,'safety',preferredSafety):undefined;
    const next={...profile,wallet:restoreWallet(profile),civilianName,...(safetyName?{safetyName}:{}),name:isSafety(profile.role)?safetyName:civilianName};
    if(hasUnlimitedChips(profile.id,ownerId))next.chipUnlimited=true;else delete next.chipUnlimited;
    return next;
  }
  function remember(profile){
    if(!profile.id?.startsWith('visitor:'))return;
    if(profile.brokenCount>0)scores.set(profile.id,{id:profile.id,name:profile.civilianName||profile.name,brokenCount:profile.brokenCount});
    else scores.delete(profile.id);
    rankingDirty=true;
  }
  return {
    claimName:(...args)=>nicknames.claim(...args),
    nicknameAvailable:(...args)=>nicknames.available(...args),
    replaceNickname:(...args)=>nicknames.replace(...args),
    nicknameVisitorId:name=>nicknames.visitorId(name),
    replacementNickname:(...args)=>nicknames.replacement(...args),
    async getEquipment(){await writes.catch(()=>{});return pending.has(EQUIPMENT_KEY)?structuredClone(pending.get(EQUIPMENT_KEY)):storage.get(EQUIPMENT_KEY);},
    saveEquipment(state){pending.set(EQUIPMENT_KEY,structuredClone(state));},
    async getFoups(){await writes.catch(()=>{});return pending.has(FOUP_KEY)?structuredClone(pending.get(FOUP_KEY)):storage.get(FOUP_KEY);},
    saveFoups(state){pending.set(FOUP_KEY,structuredClone(state));},
    async getEvents(){await writes.catch(()=>{});return pending.has(EVENTS_KEY)?structuredClone(pending.get(EVENTS_KEY)):storage.get(EVENTS_KEY);},
    saveEvents(state){pending.set(EVENTS_KEY,structuredClone(state));},
    get hasPending(){return pending.size>0;},
    async loadRanking(){
      let startAfter;const records=new Map();
      do{
        const page=await storage.list({prefix:'profile:',limit:500,...(startAfter?{startAfter}:{})});
        for(const value of page.values())records.set(value.id,value);
        if(page.size<500)break;startAfter=[...page.keys()].at(-1);
      }while(startAfter);
      for(const value of pending.values())if(value.id?.startsWith('visitor:'))records.set(value.id,value);
      // Deterministic migration: retain the leading existing record's spelling.
      // Reserve all original names first, so a suffix cannot steal another person's name.
      const ordered=[...records.values()].sort((a,b)=>(b.brokenCount||0)-(a.brokenCount||0)||(b.repairedCount||0)-(a.repairedCount||0)||a.id.localeCompare(b.id));
      for(const p of ordered){
        nicknames.reserve(p.id,'visitor',p.civilianName||(!isSafety(p.role)?p.name:''));
        nicknames.reserve(p.id,'safety',p.safetyName||(isSafety(p.role)?p.name:''));
      }
      for(const p of ordered){const next=named(p);remember(next);observed(next);if(JSON.stringify(next)!==JSON.stringify(p))pending.set('profile:'+p.id,next);}
    },
    ranking(){if(rankingDirty){ranking=rankScores([...scores.values()]);rankingDirty=false;}return ranking;},
    get rankedVisitorCount(){return scores.size;},
    async get(id){
      const key='profile:'+id;
      if(pending.has(key))return structuredClone(pending.get(key));
      await writes.catch(()=>{});
      return pending.has(key)?structuredClone(pending.get(key)):storage.get(key);
    },
    save(profile){if(profile.id.startsWith('visitor:')){const next=named(profile);pending.set('profile:'+profile.id,structuredClone(next));remember(next);observed(next);}},
    flush(){
      if(!pending.size)return writes;
      const batch=Object.fromEntries(pending);pending.clear();
      writes=writes.catch(()=>{}).then(async()=>{
        const entries=Object.entries(batch);
        // Normal room updates fit one atomic batch; one-time name migration can be larger.
        for(let i=0;i<entries.length;i+=128)await storage.put(Object.fromEntries(entries.slice(i,i+128)));
      }).catch(error=>{
        for(const [key,value] of Object.entries(batch))if(!pending.has(key))pending.set(key,value);
        throw error;
      });return writes;
    },
    async remove(id){const key='profile:'+id;pending.delete(key);await writes.catch(()=>{});pending.delete(key);await storage.delete(key);scores.delete(id);nicknames.forget(id);rankingDirty=true;try{onProfileRemoved(id);}catch{}}
  };
}
