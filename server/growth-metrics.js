import {items as catalog} from '../src/cosmetics-catalog.js';
import {SAFETY_PASS_PRICE} from '../src/safety-pass.js';

// Public contract: daily visits/retention/activity/economy/funnel/quality/safety;
// action rows are {count,accounts}; ratios are 0..1. The first three funnel
// stages count pages, the remaining stages count accounts. Timings are bounded
// histogram estimates in milliseconds. No account or page identifiers escape.
export const GROWTH_LIMITS=Object.freeze({accounts:8000,pages:2048,eventsPerPage:128,baselines:512,days:30,activeGapMs:30000,relayLagMs:60000,valueBytes:100*1024});
const PREFIX='growth:v1:',DAY=86400000,KST=32400000,ACTIONS=['move','emote','destroy','repair','throw','clean','board','equip'];
const SOURCES=['destroy','repair','throw','clean','oht','golden-deposit','golden-throw','golden-clean','bay-event','contest-event','google-link'],CLIENT=['page_start','scene_ready','connected','reconnect','connect_error','page_end','shop_open','try_on','client_error'];
const BINS=[250,500,1000,2000,5000,10000,30000,60000,120000,300000,900000,3600000,86400000];
const FLAGS={visit:1,active:2,shop:4,try:8,purchase:16,insufficient:32,firstAction:64};
const day=t=>Math.floor((t+KST)/DAY),start=d=>d*DAY-KST,label=d=>new Date(start(d)+KST).toISOString().slice(0,10);
const safe=n=>Number.isSafeInteger(n)&&n>=0?n:0;
const tag=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,47}$/.test(value)?value:'unknown';
const paid=new Map(catalog.filter(item=>item.price>0).map(item=>[item.id,item]));
const safety=role=>role==='safety-red'||role==='safety-orange';
const sample=()=>({count:0,bins:BINS.map(()=>0)});
function addSample(s,ms){if(!Number.isFinite(ms)||ms<0||ms>86400000)return;s.count++;s.bins[Math.max(0,BINS.findIndex(edge=>ms<=edge))]++;}
function timing(s){const q=p=>{if(!s.count)return null;let seen=0;for(let i=0;i<BINS.length;i++)if((seen+=s.bins[i])>=Math.ceil(s.count*p))return BINS[i];return BINS.at(-1);};return {count:s.count,p50:q(.5),p95:q(.95),approximate:true};}
const quantile=(values,p)=>values.length?values.slice().sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)]/1000:null;
function shortHash(value){let a=2166136261,b=2246822519;for(const c of value){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b^c.charCodeAt(0),3266489917);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
function emptyDay(d){return {version:1,kind:'day',day:d,limited:false,visits:{accounts:0,newAccounts:0,legacyFirstObserved:0,returningAccounts:0,unknownHistoryAccounts:0},returned:{d1:0,d7:0},
  activity:{accounts:0,activeMs:0,togetherMs:0,actions:Object.fromEntries(ACTIONS.map(k=>[k,{count:0,accounts:0}]))},
  economy:{earnedChips:0,spentChips:0,purchases:0,nicknamePurchases:0,unattributedSpend:0,earnedBySource:Object.fromEntries(SOURCES.map(k=>[k,0])),items:{}},
  funnel:{pageStarts:0,sceneReady:0,connected:0,firstAction:0,shopOpen:0,tryOn:0,purchased:0,insufficientChips:0},
  quality:{reportedPages:0,connectErrors:0,reconnects:0,clientErrors:0,sceneReadyMs:sample(),connectMs:sample(),firstActionMs:sample(),platforms:{},sources:{},builds:{}},
  safety:{assignments:0,penalties:0,departuresWithin60s:0,afterAssignment:0,afterPenalty:0}};}

export function createGrowthMetrics({now=Date.now,ownerId='',excludedIds=[]}={}){
  const blocked=new Set([ownerId,...excludedIds]),blockedPrints=new Set([...blocked].filter(id=>/^visitor:[a-f0-9]{64}$/.test(id)).map(id=>id.slice(8,32)));
  const accounts=new Map(),days=new Map(),pages=new Map(),waitingPages=new Map(),baselines=new Map(),active=new Map(),present=new Map(),alerts=new Map(),leaves=new Map(),dirty=new Map(),reasons=new Set();
  let startedAt=new Date(now()).toISOString(),clock=now(),eventTime=null,rev=0,writes=Promise.resolve(),lastPruned=null,lastPagesPruned=0;
  const fp=id=>typeof id==='string'&&/^visitor:[a-f0-9]{64}$/.test(id)&&!blocked.has(id)?id.slice(8,32):null;
  const tick=()=>eventTime??(clock=Math.max(clock,now())),mark=key=>dirty.set(key,++rev),key=(kind,id)=>PREFIX+kind+':'+id;
  function limited(reason,d=day(tick())){reasons.add(reason);mark(PREFIX+'meta');const b=bucket(d);b.limited=true;mark(key('day',d));}
  function bucket(d){let b=days.get(d);if(!b){b=emptyDay(d);days.set(d,b);mark(key('day',d));}return b;}
  // Flat numeric rows avoid hundreds of thousands of per-day JS objects.
  // Each row is [KST day, flags, observed milliseconds, first connection ms].
  function accountIndex(a,d,create=true){for(let i=0;i<a.days.length;i+=4)if(a.days[i]===d)return i;if(!create)return -1;const i=a.days.length;a.days.push(d,0,0,0);return i;}
  function touched(a){a.lastSeen=Math.max(a.lastSeen,tick());mark(key('account',a.fp));}
  function once(a,d,flag,callback){const i=accountIndex(a,d);if(a.days[i+1]&flag)return false;a.days[i+1]|=flag;callback(bucket(d));touched(a);mark(key('day',d));return true;}
  function visit(a,t){
    const d=day(t);let before=false;for(let i=0;i<a.days.length;i+=4)if(a.days[i]<d&&(a.days[i+1]&FLAGS.visit)){before=true;break;}
    once(a,d,FLAGS.visit,b=>{
      b.visits.accounts++;a.days[accountIndex(a,d)+3]=t;
      if(before)b.visits.returningAccounts++;
      else if(a.firstConnected===d)b.visits.newAccounts++;
      else if(a.legacy){b.visits.legacyFirstObserved++;b.visits.unknownHistoryAccounts++;}
      if(a.firstConnected!==null){const delta=d-a.firstConnected;if(delta===1||delta===7){const cohort=days.get(a.firstConnected);if(cohort){cohort.returned[delta===1?'d1':'d7']++;mark(key('day',cohort.day));}}}
    });
  }
  function obtain(id){const f=fp(id);return f?accounts.get(f):null;}
  function waitForAccount(pageKey,page,d,kind){
    page.pending??=[];let entry=page.pending.find(row=>row.day===d);if(!entry){if(page.pending.length>=2)page.pending.shift();entry={day:d,shop:false,try:false};page.pending.push(entry);}entry[kind]=true;
    if(!waitingPages.has(page.account))waitingPages.set(page.account,new Set());waitingPages.get(page.account).add(pageKey);
  }
  function applyWaiting(a){
    for(const pageKey of waitingPages.get(a.fp)??[]){const page=pages.get(pageKey);if(!page)continue;for(const entry of page.pending??[]){if(entry.day<day(now())-29||entry.day>day(now()))continue;if(entry.shop)once(a,entry.day,FLAGS.shop,b=>b.funnel.shopOpen++);if(entry.try)once(a,entry.day,FLAGS.try,b=>b.funnel.tryOn++);}delete page.pending;mark(key('page',pageKey));}waitingPages.delete(a.fp);
  }
  function split(from,to,fn){let at=from;while(at<to){const d=day(at),end=Math.min(to,start(d+1));fn(d,end-at);at=end;}}
  function noteActivity(a,kind,count=1){
    const t=tick(),d=day(t),prior=active.get(a.fp),state=present.get(a.fp);
    if(state?.hidden)return false;
    visit(a,t);
    once(a,d,FLAGS.active,b=>b.activity.accounts++);
    once(a,d,FLAGS.firstAction,b=>{b.funnel.firstAction++;const at=a.days[accountIndex(a,d)+3];if(at>0)addSample(b.quality.firstActionMs,t-at);});
    if(prior&&t>prior.at&&t-prior.at<=GROWTH_LIMITS.activeGapMs){
      const together=[...present].some(([other,p])=>other!==a.fp&&!p.hidden&&active.has(other)&&active.get(other).at<=prior.at&&prior.at-active.get(other).at<=GROWTH_LIMITS.activeGapMs);
      split(prior.at,t,(date,ms)=>{const b=bucket(date);a.days[accountIndex(a,date)+2]+=ms;b.activity.activeMs+=ms;if(together)b.activity.togetherMs+=ms;mark(key('day',date));});
    }
    if(kind&&ACTIONS.includes(kind)){
      const b=bucket(d),index=ACTIONS.indexOf(kind),flag=1<<(index+8);
      once(a,d,flag,row=>row.activity.actions[kind].accounts++);
      if(kind!=='move'||!prior||!prior.moveAt||t-prior.moveAt>5000)b.activity.actions[kind].count+=count;
      mark(key('day',d));
    }
    if(!prior||prior.at<=t)active.set(a.fp,{at:t,moveAt:kind==='move'?t:prior?.moveAt??null});touched(a);return true;
  }
  function finishLeave(f,entry){if(accounts.has(f)){const b=bucket(day(entry.at));b.safety.departuresWithin60s++;if(entry.assignment)b.safety.afterAssignment++;if(entry.penalty)b.safety.afterPenalty++;mark(key('day',b.day));}leaves.delete(f);}
  function returned(f,t){const entry=leaves.get(f);if(entry&&t-entry.at>=60000)finishLeave(f,entry);else leaves.delete(f);}
  function settle(t){for(const [f,entry] of leaves)if(t-entry.at>=60000+GROWTH_LIMITS.relayLagMs){if(!present.has(f))finishLeave(f,entry);else leaves.delete(f);}}
  function prune(t){
    settle(t);if(t-lastPagesPruned>=60000){lastPagesPruned=t;for(const [k,p] of pages)if(t-p.at>=DAY){pages.delete(k);waitingPages.get(p.account)?.delete(k);if(waitingPages.get(p.account)?.size===0)waitingPages.delete(p.account);mark(key('page',k));}}
    const d=day(t);if(lastPruned===d)return;lastPruned=d;const cutoff=d-GROWTH_LIMITS.days+1;
    for(const [date] of days)if(date<cutoff){days.delete(date);mark(key('day',date));}
    for(const [f,a] of accounts){if(day(a.lastSeen)<cutoff&&!present.has(f)){accounts.delete(f);active.delete(f);alerts.delete(f);baselines.delete(f);mark(key('account',f));continue;}for(let i=a.days.length-4;i>=0;i-=4)if(a.days[i]<cutoff){a.days.splice(i,4);mark(key('account',f));}}
  }
  function profileValue(p){const w=p.wallet;if(!w||!Array.isArray(w.owned))return null;return {broken:safe(p.brokenCount),repaired:safe(p.repairedCount),earned:safe(w.earnedChips),chips:safe(w.chips),tickets:safe(w.nicknamePurchases),passes:safe(w.safetyPassPurchases),owned:new Set(w.owned.filter(id=>paid.has(id)).slice(0,96))};}
  function segment(b,group,labelValue){
    const values=b.quality[group];let name=tag(labelValue);
    if(!Object.hasOwn(values,name)&&Object.keys(values).length>=16){name='other';limited('segment-cap',b.day);}
    if(!Object.hasOwn(values,name))values[name]={label:name,pages:0,connected:0,connectErrors:0,clientErrors:0};
    return values[name];
  }
  function retention(b,offset,t){
    const total=b.visits.newAccounts,n=b.returned[offset===1?'d1':'d7'],followUp=days.get(b.day+offset);
    let status='empty';
    if(total){
      if(day(t)<=b.day+offset)status='pending';
      else status=followUp?.visits.accounts?'complete':'unobserved';
    }
    return {status,cohortAccounts:total,returnedAccounts:n,rate:status==='complete'?n/total:null,limited:Boolean(b.limited||followUp?.limited)};
  }
  function publicDay(b,t){
    const values=[];for(const a of accounts.values()){const i=accountIndex(a,b.day,false);if(i>=0&&(a.days[i+1]&FLAGS.active))values.push(a.days[i+2]);}const q=b.quality;
    return {date:label(b.day),partial:day(Date.parse(startedAt))===b.day&&Date.parse(startedAt)>start(b.day),ongoing:b.day===day(t),limited:b.limited,
      visits:{...b.visits,returnRate:b.visits.accounts?b.visits.returningAccounts/b.visits.accounts:null},retention:{d1:retention(b,1,t),d7:retention(b,7,t)},
      activity:{accounts:b.activity.accounts,observedSeconds:Math.round(b.activity.activeMs/1000),togetherSeconds:Math.round(b.activity.togetherMs/1000),medianAccountSeconds:quantile(values,.5),p95AccountSeconds:quantile(values,.95),actions:structuredClone(b.activity.actions)},
      economy:{...structuredClone(b.economy),items:Object.values(b.economy.items).map(row=>({...row})).sort((a,b)=>a.price-b.price||a.id.localeCompare(b.id))},funnel:{...b.funnel},
      quality:{reportedPages:q.reportedPages,connectErrors:q.connectErrors,reconnects:q.reconnects,clientErrors:q.clientErrors,sceneReadyMs:timing(q.sceneReadyMs),connectMs:timing(q.connectMs),firstActionMs:timing(q.firstActionMs),...Object.fromEntries(['platforms','sources','builds'].map(k=>[k,Object.values(q[k]).map(row=>({...row}))]))},safety:{...b.safety}};
  }
  function hydrate(records){
    const t=tick(),cutoff=day(t)-GROWTH_LIMITS.days+1,meta=records.get(PREFIX+'meta');
    if(meta?.version===1&&Number.isFinite(Date.parse(meta.startedAt))){startedAt=meta.startedAt;dirty.delete(PREFIX+'meta');for(const reason of meta.reasons??[])if(typeof reason==='string'&&reason.length<40)reasons.add(reason);}
    for(const [k,value] of records){
      if(!k.startsWith(PREFIX)||value?.version!==1)continue;
      if(k===key('day',value.day)&&value.kind==='day'&&Number.isSafeInteger(value.day)&&value.visits&&value.activity&&value.economy&&value.quality&&value.funnel&&value.safety){
        if(value.day<cutoff){mark(k);continue;}if(value.day<=day(t))days.set(value.day,structuredClone(value));
      }else if(k===key('account',value.fp)&&value.kind==='account'&&/^[a-f0-9]{24}$/.test(value.fp)&&!blockedPrints.has(value.fp)){
        if(accounts.size>=GROWTH_LIMITS.accounts&&!accounts.has(value.fp)){reasons.add('account-cap');continue;}
        if(!Number.isSafeInteger(value.firstObserved)||!Number.isFinite(value.lastSeen)||!value.days||typeof value.days!=='object')continue;
        if(day(value.lastSeen)<cutoff){mark(k);continue;}
        const compact=[];
        if(Array.isArray(value.days)){for(let i=0;i<Math.min(value.days.length,GROWTH_LIMITS.days*4);i+=4){const d=value.days[i];if(Number.isSafeInteger(d)&&d>=cutoff&&d<=day(t))compact.push(d,safe(value.days[i+1]),safe(value.days[i+2]),Number.isFinite(value.days[i+3])?value.days[i+3]:0);}}
        else for(const [d,row] of Object.entries(value.days).slice(-GROWTH_LIMITS.days))if(Number.isSafeInteger(Number(d))&&Number(d)>=cutoff&&Number(d)<=day(t))compact.push(Number(d),safe(row.flags),safe(row.activeMs),Number.isFinite(row.connectedAt)?row.connectedAt:0);
        accounts.set(value.fp,{version:1,kind:'account',fp:value.fp,firstObserved:value.firstObserved,firstConnected:Number.isSafeInteger(value.firstConnected)?value.firstConnected:null,legacy:Boolean(value.legacy),lastSeen:value.lastSeen,days:compact});
      }else if(k.startsWith(PREFIX+'page:')&&value.kind==='page'&&/^[a-f0-9]{24}$/.test(value.account)&&!blockedPrints.has(value.account)&&Number.isFinite(value.at)&&Array.isArray(value.seen)&&pages.size<GROWTH_LIMITS.pages){
        if(t-value.at>=DAY){mark(k);continue;}
        const pageKey=k.slice((PREFIX+'page:').length),page={version:1,kind:'page',account:value.account,day:value.day,at:value.at,seen:new Set(value.seen.filter(s=>typeof s==='string'&&/^[a-f0-9]{16}$/.test(s)).slice(0,GROWTH_LIMITS.eventsPerPage).map(s=>BigInt('0x'+s))),flags:safe(value.flags),platform:tag(value.platform),source:tag(value.source),build:tag(value.build)};
        pages.set(pageKey,page);for(const entry of Array.isArray(value.pending)?value.pending.slice(0,2):[])if(Number.isSafeInteger(entry.day)){if(entry.shop)waitForAccount(pageKey,page,entry.day,'shop');if(entry.try)waitForAccount(pageKey,page,entry.day,'try');}
      }
    }
  }
  mark(PREFIX+'meta');
  return {
    // Only trusted server timestamps belong here. Batched relay delivery must
    // not compress activity gaps or let a dashboard read advance event time.
    at(time,callback){
      if(!Number.isFinite(time)||time>now()||now()-time>GROWTH_LIMITS.relayLagMs||typeof callback!=='function')return false;
      const previous=eventTime;eventTime=time;
      if(time<Date.parse(startedAt)){startedAt=new Date(time).toISOString();mark(PREFIX+'meta');}
      try{return callback();}finally{eventTime=previous;}
    },
    restore(records){
      accounts.clear();days.clear();pages.clear();waitingPages.clear();baselines.clear();active.clear();present.clear();alerts.clear();leaves.clear();dirty.clear();reasons.clear();lastPruned=null;lastPagesPruned=0;clock=now();
      startedAt=new Date(clock).toISOString();mark(PREFIX+'meta');hydrate(records);prune(clock);
    },
    restorePage(records){hydrate(records);},
    connect(id,{existing=true,transport='websocket'}={}){
      const f=fp(id);if(!f)return false;const t=tick();prune(t);let a=accounts.get(f);
      if(!a){if(accounts.size>=GROWTH_LIMITS.accounts){limited('account-cap');return false;}a={version:1,kind:'account',fp:f,firstObserved:day(t),firstConnected:existing?null:day(t),legacy:Boolean(existing),lastSeen:t,days:[]};accounts.set(f,a);}
      visit(a,t);applyWaiting(a);active.delete(f);returned(f,t);present.set(f,{hidden:false,observed:false,transport});touched(a);return true;
    },
    activity(id,kind){const a=obtain(id);if(!a||!ACTIONS.includes(kind))return false;return noteActivity(a,kind,['destroy','repair','throw','clean'].includes(kind)?0:1);},
    reward(id,kind,amount){const a=obtain(id);if(!a||!SOURCES.includes(kind)||!Number.isSafeInteger(amount)||amount<=0)return false;const b=bucket(day(tick()));b.economy.earnedBySource[kind]=safe(b.economy.earnedBySource[kind])+amount;mark(key('day',b.day));const action=kind.replace(/^golden-/, '');if(action==='throw'||action==='clean')noteActivity(a,action);return true;},
    observeProfile(p){
      const f=fp(p?.id);if(!f)return false;const value=profileValue(p);if(!value)return false;const previous=baselines.get(f);
      baselines.delete(f);baselines.set(f,value);if(baselines.size>GROWTH_LIMITS.baselines)baselines.delete(baselines.keys().next().value);
      const a=accounts.get(f);if(!previous||!a)return false;
      const earned=Math.max(0,value.earned-previous.earned),added=[...value.owned].filter(id=>!previous.owned.has(id)),tickets=Math.max(0,value.tickets-previous.tickets);
      const passes=Math.max(0,value.passes-previous.passes);
      const spent=(added.length||tickets||passes)?Math.max(0,previous.chips+earned-value.chips):0,b=bucket(day(tick()));
      b.economy.earnedChips+=earned;b.economy.spentChips+=spent;b.economy.purchases+=added.length+passes;b.economy.nicknamePurchases+=tickets;
      for(const [kind,n] of [['destroy',Math.max(0,value.broken-previous.broken)],['repair',Math.max(0,value.repaired-previous.repaired)]])if(n)noteActivity(a,kind,n);
      if(added.length||passes){once(a,b.day,FLAGS.purchase,row=>row.funnel.purchased++);noteActivity(a,null,0);}
      for(const id of added){const item=paid.get(id),row=b.economy.items[id]??={id,name:item.name,price:item.price,copies:0,spentChips:0};row.copies++;if(added.length===1&&!tickets&&!passes&&row.spentChips!==null)row.spentChips+=spent;else row.spentChips=null;}
      if(passes){const row=b.economy.items['safety-pass']??={id:'safety-pass',name:'안전팀 패널티 해제 쿠폰',price:SAFETY_PASS_PRICE,copies:0,spentChips:0};row.copies+=passes;if(!added.length&&!tickets&&row.spentChips!==null)row.spentChips+=spent;else row.spentChips=null;}
      if(added.length>1||added.length&&(tickets||passes)||passes&&tickets)b.economy.unattributedSpend+=spent;
      mark(key('day',b.day));return true;
    },
    purchaseRejected(id,itemId){const a=obtain(id);if(!a||!paid.has(itemId))return false;once(a,day(tick()),FLAGS.insufficient,b=>b.funnel.insufficientChips++);return true;},
    forget(id){const f=fp(id);if(!f)return;baselines.delete(f);active.delete(f);present.delete(f);alerts.delete(f);leaves.delete(f);},
    presence(people){
      const t=tick();prune(t);const next=new Map();
      for(const p of Array.isArray(people)?people.slice(0,100):[]){const f=fp(p.id),a=f&&accounts.get(f);if(!a)continue;const current={hidden:Boolean(p.hidden),observed:true,phase:p.phase,role:p.role,penalty:safe(p.penalty)},previous=present.get(f);next.set(f,current);returned(f,t);visit(a,t);
        if(previous?.observed){const b=bucket(day(t)),alert=alerts.get(f)||{};if(!safety(previous.role)&&safety(current.role)){b.safety.assignments++;alert.assignment=t;mark(key('day',b.day));}if(!previous.penalty&&current.penalty){b.safety.penalties++;alert.penalty=t;mark(key('day',b.day));}alerts.set(f,alert);}
        if(current.hidden)active.delete(f);
      }
      for(const [f] of present)if(!next.has(f)){const alert=alerts.get(f)||{},assignment=Number.isFinite(alert.assignment)&&t-alert.assignment<=60000,penalty=Number.isFinite(alert.penalty)&&t-alert.penalty<=60000;if(assignment||penalty)leaves.set(f,{at:t,assignment,penalty});active.delete(f);}
      present.clear();for(const [f,p] of next)present.set(f,p);return true;
    },
    client(id,event){
      const f=fp(id);if(!f||!event||!CLIENT.includes(event.kind)||typeof event.id!=='string'||!/^[A-Za-z0-9_:-]{1,80}$/.test(event.id)||typeof event.pageId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(event.pageId)||!Number.isFinite(event.elapsedMs)||event.elapsedMs<0||event.elapsedMs>DAY)return false;
      const t=tick();prune(t);const pageKey=f+':'+shortHash(event.pageId),eventKey=BigInt('0x'+shortHash(event.id));let page=pages.get(pageKey);
      if(!page){if(pages.size>=GROWTH_LIMITS.pages){limited('page-cap');return false;}page={version:1,kind:'page',account:f,day:day(t),at:t,seen:new Set(),flags:0,platform:tag(event.platform),source:tag(event.source),build:tag(event.build)};pages.set(pageKey,page);bucket(page.day).quality.reportedPages++;mark(key('day',page.day));}
      if(page.seen.has(eventKey))return false;if(page.seen.size>=GROWTH_LIMITS.eventsPerPage){limited('event-cap');return false;}page.seen.add(eventKey);mark(key('page',pageKey));
      const b=bucket(page.day),segments=[segment(b,'platforms',page.platform),segment(b,'sources',page.source),segment(b,'builds',page.build)],oncePage=(flag,fn)=>{if(page.flags&flag)return;page.flags|=flag;fn();};
      if(event.kind==='page_start')oncePage(1,()=>{b.funnel.pageStarts++;segments.forEach(row=>row.pages++);});
      if(event.kind==='scene_ready')oncePage(2,()=>{b.funnel.sceneReady++;addSample(b.quality.sceneReadyMs,event.elapsedMs);});
      if(event.kind==='connected')oncePage(4,()=>{b.funnel.connected++;addSample(b.quality.connectMs,event.elapsedMs);segments.forEach(row=>row.connected++);});
      if(event.kind==='connect_error'){b.quality.connectErrors++;segments.forEach(row=>row.connectErrors++);}
      if(event.kind==='client_error'){b.quality.clientErrors++;segments.forEach(row=>row.clientErrors++);}
      if(event.kind==='reconnect')b.quality.reconnects++;
      const a=accounts.get(f);if(event.kind==='shop_open'){if(a)once(a,day(t),FLAGS.shop,row=>row.funnel.shopOpen++);else waitForAccount(pageKey,page,day(t),'shop');}if(event.kind==='try_on'&&paid.has(event.itemId)){if(a)once(a,day(t),FLAGS.try,row=>row.funnel.tryOn++);else waitForAccount(pageKey,page,day(t),'try');}
      mark(key('day',b.day));return true;
    },
    snapshot(){
      const t=tick();prune(t);const weekly=[...accounts.values()].map(a=>{let count=0;for(let i=0;i<a.days.length;i+=4)if(a.days[i]>=day(t)-6&&a.days[i]<=day(t)&&(a.days[i+1]&FLAGS.active))count++;return count;}),count=[...present].filter(([f,p])=>!p.hidden&&active.has(f)&&t-active.get(f).at<=GROWTH_LIMITS.activeGapMs).length;
      return {version:1,startedAt,generatedAt:t,timezone:'Asia/Seoul',limited:reasons.size>0,limits:{...GROWTH_LIMITS},live:{activeAccounts30s:count,togetherAccounts:count>=2?count:0},last7Days:{activeAccounts:weekly.filter(n=>n>0).length,repeatActiveAccounts:weekly.filter(n=>n>=2).length},
        daily:[...days.values()].filter(b=>b.day>=day(t)-29&&b.day<=day(t)).sort((a,b)=>a.day-b.day).map(b=>publicDay(b,t)),
        notes:['운영자·검증 계정·NPC는 제외한 게스트 계정 기준이에요.','재방문은 수집 이후 서로 다른 날짜 방문으로 확인해요. 과거 프로필만 있던 계정의 이전 방문일은 알 수 없어 재방문 비율은 하한일 수 있어요.','활동 시간은 연속 서버 행동 사이 30초 이내의 간격만 합산한 관측치예요. 재시작·재연결 공백과 장시간 방치는 더하지 않아요. 함께한 시간도 계정별 관측 시간의 합이에요.','이동 횟수는 5초 넘게 멈췄다가 다시 움직인 구간 기준이에요.','지연 시간 백분위는 구간 추정치이며 클라이언트가 보고한 페이지에 한정돼요. 첫 행동 시간은 당일 서버 연결부터 측정해요.','안전팀·패널티 후 이탈은 연결 종료 관측이며 원인을 뜻하지 않아요. 60초 내 재연결은 제외하고 전송 지연을 기다린 뒤 확정해요.','저장은 주기적이며 서버 재시작 시 마지막 저장 이후 일부 통계가 누락될 수 있어요.',...(reasons.size?['집계 한도에 도달한 구간이 있어 일부 수치는 하한이에요.']:[])]};
    },
    flush(storage){
      prune(tick());if(!dirty.size)return writes;
      writes=writes.catch(()=>{}).then(async()=>{
        const entries=[...dirty],checkpoint=([k,r])=>{let value=null;if(k===PREFIX+'meta')value={version:1,startedAt,reasons:[...reasons]};else if(k.startsWith(PREFIX+'account:'))value=accounts.get(k.slice((PREFIX+'account:').length))??null;else if(k.startsWith(PREFIX+'day:'))value=days.get(Number(k.slice((PREFIX+'day:').length)))??null;else{const p=pages.get(k.slice((PREFIX+'page:').length));if(p)value={...p,seen:[...p.seen].map(n=>n.toString(16).padStart(16,'0'))};}return [k,r,value===null?null:structuredClone(value)];};
        for(let i=0;i<entries.length;i+=128){const batch=entries.slice(i,i+128).map(checkpoint),put=batch.filter(([, ,v])=>v!==null),remove=batch.filter(([, ,v])=>v===null);for(const [,,value] of put)if(new TextEncoder().encode(JSON.stringify(value)).byteLength>GROWTH_LIMITS.valueBytes)throw Error('Growth checkpoint exceeds bounded value size');if(put.length)await storage.put(Object.fromEntries(put.map(([k,,v])=>[k,v])),{allowUnconfirmed:true});if(remove.length)await storage.delete(remove.map(([k])=>k),{allowUnconfirmed:true});for(const [k,r] of batch)if(dirty.get(k)===r)dirty.delete(k);}
      });return writes;
    }
  };
}
