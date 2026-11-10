const PREFIX='admin:visits:v1:',META=PREFIX+'meta',GAP=30*60*1000;
const visitor=id=>typeof id==='string'&&/^visitor:[a-f0-9]{64}$/.test(id);
const count=n=>Number.isSafeInteger(n)&&n>=0?n:0;
const date=t=>new Date(t+9*3600000).toISOString().slice(0,10);
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d));

// Small read-only profile projection plus independent visit metadata. Never
// rewrite a profile, read all profiles per page, or save on movement frames.
export function createAdminRanking({excludedIds=[],now=Date.now}={}){
  const excluded=new Set(excludedIds),profiles=new Map(),visits=new Map(),present=new Set(),pending=new Map();
  let startedAt=null,ready=false,dirty=true,ordered=[],writes=Promise.resolve(),flushing=false;
  const allowed=id=>visitor(id)&&!excluded.has(id);
  function save(id,row){visits.set(id,row);pending.set(PREFIX+id,{...row});}
  return {
    async load(storage){
      let startAfter;const records=new Map();
      do{const page=await storage.list({prefix:PREFIX,limit:500,...(startAfter?{startAfter}:{})});for(const [k,v] of page)records.set(k,v);if(page.size<500)break;startAfter=[...page.keys()].at(-1);}while(startAfter);
      for(const [key,v] of records){
        const id=key.slice(PREFIX.length);if(!allowed(id)||!v)continue;
        visits.set(id,{joinedDate:validDate(v.joinedDate)?v.joinedDate:null,count:count(v.count),lastSeen:count(v.lastSeen)});
      }
      const prior=records.get(META)?.startedAt;
      startedAt=typeof prior==='string'&&Number.isFinite(Date.parse(prior))?prior:new Date(now()).toISOString();
      if(prior!==startedAt)pending.set(META,{startedAt});ready=true;
    },
    observe(p){
      if(!allowed(p?.id))return;
      const next={id:p.id,name:p.civilianName||p.name||'닉네임 등록 전',brokenCount:count(p.brokenCount),repairedCount:count(p.repairedCount)};
      const previous=profiles.get(p.id);
      if(previous&&previous.name===next.name&&previous.brokenCount===next.brokenCount&&previous.repairedCount===next.repairedCount)return;
      profiles.set(p.id,next);dirty=true;
    },
    connect(id,{existing=true,restored=false}={}){
      if(!ready||!allowed(id))return;
      const t=now(),previous=visits.get(id),row=previous?{...previous}:{joinedDate:existing?null:date(t),count:0,lastSeen:0};
      if(!row.count||(!restored&&!present.has(id)&&t-row.lastSeen>=GAP))row.count=Math.min(Number.MAX_SAFE_INTEGER,row.count+1);
      row.lastSeen=t;save(id,row);present.add(id);
    },
    sync(ids){
      if(!ready)return;const current=new Set(ids),t=now();
      for(const id of present){const row=visits.get(id);if(row&&row.lastSeen!==t)save(id,{...row,lastSeen:t});if(!current.has(id))present.delete(id);}
    },
    remove(id){profiles.delete(id);visits.delete(id);present.delete(id);pending.set(PREFIX+id,null);dirty=true;},
    rememberDates(ids,dates){
      if(!ready||!Array.isArray(dates))return;
      ids.forEach((id,i)=>{if(!profiles.has(id)||!validDate(dates[i])||visits.get(id)?.joinedDate)return;
        save(id,{...(visits.get(id)||{count:0,lastSeen:0}),joinedDate:dates[i]});});
    },
    page(requested=1){
      if(!ready)throw Error('Ranking metadata unavailable');
      if(dirty){ordered=[...profiles.values()].sort((a,b)=>b.brokenCount-a.brokenCount||(a.id<b.id?-1:a.id>b.id?1:0));dirty=false;}
      const size=50,total=ordered.length,pages=Math.max(1,Math.ceil(total/size)),page=Math.min(pages,Math.max(1,Number.isSafeInteger(requested)?requested:1));
      return {total,page,pages,pageSize:size,visitTrackingStartedAt:startedAt,rows:ordered.slice((page-1)*size,page*size).map((p,i)=>({...p,rank:(page-1)*size+i+1,joinedDate:visits.get(p.id)?.joinedDate??null,visitCount:visits.get(p.id)?.count??0}))};
    },
    flush(storage){
      if(flushing)return writes.then(()=>this.flush(storage));
      if(!ready||!pending.size)return writes;
      const batch=new Map(pending);pending.clear();flushing=true;
      writes=writes.catch(()=>{}).then(async()=>{
        const puts=[...batch].filter(([,v])=>v!==null),deletes=[...batch].filter(([,v])=>v===null).map(([k])=>k);
        for(let i=0;i<puts.length;i+=128)await storage.put(Object.fromEntries(puts.slice(i,i+128)),{allowUnconfirmed:true});
        for(let i=0;i<deletes.length;i+=128)await storage.delete(deletes.slice(i,i+128));
      }).catch(error=>{for(const [k,v] of batch)if(!pending.has(k))pending.set(k,v);throw error;}).finally(()=>{flushing=false;});return writes;
    }
  };
}
