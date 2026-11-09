import {FOUP_CLEAN_SECONDS,floorSpot} from '../src/foup-play.js';
import {findWalkPath,canWalkSegment} from '../src/walking.js';
import {stepNpc} from '../src/npc-navigation.js';

export const FOUP_CLEANER_RULES=Object.freeze({workers:2,age:60,scan:2,nearby:3,speed:1.8,retry:20,timeout:180});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// Borrow existing idle breakers. Jobs and age tracking are transient; cleanup
// uses the same finite carriers and checkpoint as a player, without any reward.
export function createFoupCleaners({store,residents,players,now,canRun=()=>true,onCue=()=>{},rules=FOUP_CLEANER_RULES}){
  const jobs=new Map(),ages=new Map();let nextScan=now(),completed=0;
  const nearPlayer=r=>[...players.values()].some(p=>!p.hidden&&(p.y||0)<.5&&distance(p,r)<rules.nearby);
  const eligible=r=>r?.mode==='broken'&&!r.gold&&!r.owner&&!r.cleaner&&r.damageAge>=1.4&&!nearPlayer(r);
  function finish(job,done=false){
    store.cancelCleanup(job.actor.id);residents.releaseCleanup(job.actor);jobs.delete(job.actor.id);
    if(done){completed++;ages.delete(job.record.id);}
    else{const age=ages.get(job.record.id);if(age)age.retryAt=now()+rules.retry;}
  }
  function yieldRecord(id){for(const job of jobs.values())if(job.record.id===id)finish(job);}
  function scan(){
    for(const [id,age]of ages){const r=store.records.get(id);if(r?.mode!=='broken'||r.breakSeq!==age.seq)ages.delete(id);}
    for(const r of store.records.values())if(r.mode==='broken'&&!ages.has(r.id))ages.set(r.id,{seq:r.breakSeq,at:now(),retryAt:0});
    if(jobs.size>=rules.workers)return;
    const assigned=new Set([...jobs.values()].map(j=>j.record.id));
    const debris=[...store.records.values()].filter(r=>eligible(r)&&!assigned.has(r.id)&&now()-ages.get(r.id).at>=rules.age&&now()>=ages.get(r.id).retryAt);
    if(!debris.length)return;
    let choice=null;
    for(const actor of residents.people)if(residents.canCleanup(actor))for(const record of debris){
      const d=distance(actor,record);if(!choice||d<choice.distance)choice={actor,record,distance:d};
    }
    if(!choice)return;
    const {actor,record}=choice;
    const angle=Math.atan2(actor.x-record.x,actor.z-record.z);
    const target=floorSpot({x:record.x+Math.sin(angle)*.7,z:record.z+Math.cos(angle)*.7});
    // At most one path search per scan for the entire cleaning crew.
    const path=target&&distance(target,record)<=1.2&&canWalkSegment(target,record)?findWalkPath(actor,target):null;
    if(!path){ages.get(record.id).retryAt=now()+rules.retry;return;}
    if(!residents.reserveCleanup(actor))return;
    actor.path=path;actor.phase='clean-walk';actor.time=0;
    jobs.set(actor.id,{actor,record,seq:record.breakSeq,started:now(),stuck:0,nextSweep:0});
  }
  function update(dt){
    if(!canRun()){for(const job of [...jobs.values()])finish(job);return;}
    if(!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,.1);
    const neighbors=jobs.size?[...residents.people,...players.values()]:[];
    for(const job of [...jobs.values()]){
      const {actor,record:r}=job;actor.time+=dt;actor.speed=0;
      if(r.mode!=='broken'||r.breakSeq!==job.seq||r.gold||r.cleaner&&r.cleaner!==actor.id||nearPlayer(r)||actor.hidden||actor.caughtLeft>0||actor.dizzyLeft>0||!['clean-walk','cleaning'].includes(actor.phase)||now()-job.started>rules.timeout||job.stuck>5){finish(job);continue;}
      if(actor.phase==='clean-walk'){
        const target=actor.path[0];
        if(target){
          const next=stepNpc(actor,target,dt,rules.speed,neighbors),moved=distance(actor,next);
          if(moved>.0001)actor.heading=Math.atan2(next.x-actor.x,next.z-actor.z);
          Object.assign(actor,next);actor.speed=moved/dt;job.stuck=moved>.001?0:job.stuck+dt;
          actor.stepDistance=(actor.stepDistance||0)+moved;if(actor.stepDistance>.86){actor.stepDistance=0;onCue('step',actor);}
          if(distance(actor,target)<.02)actor.path.shift();
        }
        if(!actor.path.length){
          if(distance(actor,r)>1.2||!canWalkSegment(actor,r)||!store.beginCleanup(r.id,actor.id,job.seq)){finish(job);continue;}
          actor.phase='cleaning';actor.time=0;actor.speed=0;actor.heading=Math.atan2(r.x-actor.x,r.z-actor.z);r.cleanHeading=actor.heading;
        }
      }else{
        if(distance(actor,r)>1.65){finish(job);continue;}
        r.cleanProgress=Math.min(1,actor.time/FOUP_CLEAN_SECONDS);
        if(actor.time>=job.nextSweep){onCue('sweep',actor);job.nextSweep=actor.time+.52;}
        if(actor.time+1e-8>=FOUP_CLEAN_SECONDS){r.cleanProgress=1;finish(job,store.finishCleanup(r.id,actor.id,job.seq));}
      }
    }
    if(now()>=nextScan){nextScan=now()+rules.scan;scan();}
  }
  return {update,yieldRecord,get state(){return {active:jobs.size,completed,jobs:[...jobs.values()].map(j=>({actorId:j.actor.id,recordId:j.record.id,phase:j.actor.phase}))};}};
}
