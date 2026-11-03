const PREFIX='metrics:v1:', HOUR=3600000, DAY=24*HOUR, KST=9*HOUR;
const RETENTION=30*DAY, MEMBER_LIMIT=4096, ACTIVE_WINDOW=5*60000;
const COUNTERS=['destructions','repairs','purchases','connections','httpsConnections'];
const hourStart=t=>Math.floor(t/HOUR)*HOUR;
const dayStart=t=>Math.floor((t+KST)/DAY)*DAY-KST;
const dayLabel=t=>new Date(t+KST).toISOString().slice(0,10);
const number=n=>Number.isFinite(n)&&n>=0?n:0;

// Only aggregate records are returned by snapshot. Short account fingerprints
// stay in the current hour/day checkpoints solely for reconnect deduplication.
export function createActivityMetrics({now=Date.now,excludedIds=[]}={}) {
  const excluded=new Set(excludedIds),buckets=new Map(),dirty=new Map(),active=new Map();
  let connected=new Set(),last=now(),startedAt=new Date(last).toISOString(),revision=0,writes=Promise.resolve(),prunedHour=null;
  const fingerprint=id=>typeof id==='string'&&/^visitor:[a-f0-9]{64}$/.test(id)&&!excluded.has(id)?id.slice(8,32):null;
  const key=(kind,start)=>PREFIX+kind+':'+start;
  const mark=k=>dirty.set(k,++revision);
  function bucket(kind,start) {
    const k=key(kind,start);let b=buckets.get(k);
    if(!b){b={version:1,kind,start,members:new Set(),uniqueAccounts:0,peakConcurrent:0,observedMs:0,connectionMs:0,limited:false};for(const c of COUNTERS)b[c]=0;buckets.set(k,b);mark(k);}
    return b;
  }
  function membership(b,ids) {
    if(!b.members)return;
    for(const id of ids){
      if(b.members.has(id))continue;
      if(b.members.size>=MEMBER_LIMIT){b.limited=true;continue;}
      b.members.add(id);
    }
    b.uniqueAccounts=Math.max(b.uniqueAccounts,b.members.size);
  }
  function current(t,ids=connected) {
    const rows=[bucket('hour',hourStart(t)),bucket('day',dayStart(t))];
    for(const b of rows){membership(b,ids);b.peakConcurrent=Math.max(b.peakConcurrent,connected.size);mark(key(b.kind,b.start));}
    return rows;
  }
  function prune(t) {
    if(prunedHour!==hourStart(t)){
      prunedHour=hourStart(t);const cutoff=dayStart(t)-RETENTION+DAY;
      for(const [k,b] of buckets){
        if(b.start<cutoff){buckets.delete(k);mark(k);continue;}
        const end=b.start+(b.kind==='hour'?HOUR:DAY);
        if(end<=t&&b.members){b.uniqueAccounts=Math.max(b.uniqueAccounts,b.members.size);b.members=null;mark(k);}
      }
    }
    for(const [id,at] of active)if(at<=t-ACTIVE_WINDOW||!connected.has(id))active.delete(id);
  }
  function advance() {
    const t=Math.max(last,now());
    // At most 30 retained days need to be integrated after a long quiet period.
    let from=Math.max(last,dayStart(t)-RETENTION+DAY);
    while(from<t){
      const end=Math.min(t,hourStart(from)+HOUR);
      for(const b of current(from)){b.observedMs+=end-from;b.connectionMs+=(end-from)*connected.size;}
      from=end;
    }
    last=t;current(t);prune(t);return t;
  }
  function serialized(b) {
    const {members,...value}=b;
    return {...value,...(members?{ids:[...members]}:{})};
  }
  function publicBucket(b) {
    const value={uniqueAccounts:b.uniqueAccounts,peakConcurrent:b.peakConcurrent,
      averageConcurrent:b.observedMs?Math.round(b.connectionMs/b.observedMs*100)/100:null,
      observedSeconds:Math.round(b.observedMs/1000),limited:Boolean(b.limited)};
    for(const c of COUNTERS)value[c]=b[c];
    return value;
  }
  function record(id,deltas) {
    const member=fingerprint(id);if(!member)return false;
    const t=advance();
    for(const b of current(t,[member]))for(const c of COUNTERS)b[c]+=number(deltas[c]);
    return true;
  }
  mark(PREFIX+'meta');
  return {
    restore(records) {
      buckets.clear();dirty.clear();active.clear();connected.clear();prunedHour=null;
      const t=now();last=t;
      const meta=records.get(PREFIX+'meta');
      if(meta?.version===1&&Number.isFinite(Date.parse(meta.startedAt)))startedAt=meta.startedAt;
      else{startedAt=new Date(t).toISOString();mark(PREFIX+'meta');}
      for(const [k,value] of records){
        if(!k.startsWith(PREFIX)||!['hour','day'].includes(value?.kind)||value.version!==1||!Number.isFinite(value.start)||k!==key(value.kind,value.start))continue;
        const b={version:1,kind:value.kind,start:value.start,uniqueAccounts:number(value.uniqueAccounts),peakConcurrent:number(value.peakConcurrent),observedMs:number(value.observedMs),connectionMs:number(value.connectionMs),limited:Boolean(value.limited),members:null};
        for(const c of COUNTERS)b[c]=number(value[c]);
        if(value.start===(value.kind==='hour'?hourStart(t):dayStart(t))){
          b.members=new Set((Array.isArray(value.ids)?value.ids:[]).filter(id=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id)).slice(0,MEMBER_LIMIT));
          if(b.members.size<b.uniqueAccounts)b.limited=true;
          b.uniqueAccounts=Math.max(b.uniqueAccounts,b.members.size);
        }
        buckets.set(k,b);
        if(value.ids&&!b.members)mark(k);
      }
      prune(t);current(t);
    },
    sync(ids) {
      const t=advance();connected=new Set([...ids].map(fingerprint).filter(Boolean));
      current(t);prune(t);
    },
    connect(id,transport='websocket') {return record(id,{connections:1,httpsConnections:transport==='https'?1:0});},
    activity(id) {const member=fingerprint(id);if(member)active.set(member,Math.max(last,now()));},
    action(id,deltas={}) {
      const values={};for(const c of ['destructions','repairs','purchases'])values[c]=Number.isSafeInteger(deltas[c])?number(deltas[c]):0;
      if(!Object.values(values).some(Boolean))return false;
      if(!record(id,values))return false;
      active.set(fingerprint(id),Math.max(last,now()));return true;
    },
    snapshot() {
      const t=advance(),today=bucket('day',dayStart(t)),started=Date.parse(startedAt);
      return {startedAt,live:{connectedAccounts:connected.size,activeAccounts5m:[...active.keys()].filter(id=>connected.has(id)).length},
        today:{date:dayLabel(t),...publicBucket(today)},
        // A daily unique count comes from its own deduplicated bucket. Missing
        // days stay absent; hourly counts cannot reconstruct daily membership.
        daily:[...buckets.values()].filter(b=>b.kind==='day'&&b.start>=today.start-RETENTION+DAY&&b.start<=today.start).sort((a,b)=>a.start-b.start)
          .map(b=>({date:dayLabel(b.start),...publicBucket(b),partial:b.start===dayStart(started)&&started>b.start,ongoing:b.start===today.start})),
        hourly:[...buckets.values()].filter(b=>b.kind==='hour').sort((a,b)=>a.start-b.start).map(b=>({hour:new Date(b.start).toISOString(),...publicBucket(b)}))};
    },
    flush(storage) {
      advance();
      if(!dirty.size)return writes;
      writes=writes.catch(()=>{}).then(async()=>{
        const entries=[...dirty].map(([k,version])=>[k,version,k===PREFIX+'meta'?{version:1,startedAt}:buckets.has(k)?serialized(buckets.get(k)):null]);
        for(let i=0;i<entries.length;i+=128){
          const batch=entries.slice(i,i+128),put=batch.filter(([, ,v])=>v!==null),remove=batch.filter(([, ,v])=>v===null);
          // Aggregate checkpoints can lag briefly without holding up game messages.
          // Profile and wallet checkpoints keep their existing durability gates.
          if(put.length)await storage.put(Object.fromEntries(put.map(([k,,v])=>[k,v])),{allowUnconfirmed:true});
          if(remove.length)await storage.delete(remove.map(([k])=>k),{allowUnconfirmed:true});
          for(const [k,version] of batch)if(dirty.get(k)===version)dirty.delete(k);
        }
      });return writes;
    }
  };
}
