import {CONTEST_NAME, CONTEST_RULES, CONTEST_ZONES, contestRewards} from './foup-contest.js?v=a6e059616081';

// Two instanced floor decals, allocated only when a match is announced.
export function createContestZones(THREE, scene) {
  let group;
  function makeTeam(colour) {
    const white = colour === 'white';
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(128,128,124,0,2*Math.PI);
    ctx.fillStyle = white ? 'rgba(252,255,255,.85)' : 'rgba(33,43,49,.83)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = white ? '#5b727a' : '#eaf5f5';
    ctx.stroke();
    ctx.fillStyle = white ? '#344d57' : '#ffffff';
    ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(white?'백팀':'흑팀',128,128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const size = CONTEST_RULES.radius*2;
    const material = new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});
    const zones=CONTEST_ZONES.filter(zone=>zone.team===colour);
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(size,size),material,zones.length);
    const marker = new THREE.Object3D();
    marker.rotation.x = -Math.PI/2;
    zones.forEach((zone,i)=>{
      marker.position.set(zone.x,.037,zone.z);
      marker.updateMatrix();
      mesh.setMatrixAt(i,marker.matrix);
    });
    mesh.renderOrder=2;
    return mesh;
  }
  return visible=>{
    if (visible && !group) {
      group=new THREE.Group();
      group.name='foup-contest-zones';
      group.add(makeTeam('black'),makeTeam('white'));
      scene.add(group);
    }
    if(group && group.visible!==Boolean(visible))group.visible=Boolean(visible);
  };
}

const teamName = {black:'흑팀',white:'백팀',referee:'파란 심판'};
const teamGoal = {black:'검정 방진복 → 검정 원',white:'흰 방진복 → 흰 원'};
const clock = ms => {
  const seconds=Math.max(0,Math.ceil(ms/1000));
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
};
export function createContestUI({doc=document, now=()=>performance.now(), command, ready, getId, onGather, onTeam, setZones, toast, onResult=async()=>({}), cancelPhotos=()=>{}}) {
  const card=doc.createElement('aside');
  card.id='contest-card';card.className='world-event-card contest-card';card.hidden=true;
  card.innerHTML='<strong class="contest-title"></strong><div class="contest-score" hidden><b class="contest-black"></b><b class="contest-white"></b></div><span class="contest-detail"></span><button type="button">참여하기</button>';
  doc.body.append(card);
  const title=card.querySelector('.contest-title'),score=card.querySelector('.contest-score'),black=card.querySelector('.contest-black'),white=card.querySelector('.contest-white'),detail=card.querySelector('.contest-detail'),button=card.querySelector('button');
  score.setAttribute('aria-live','polite');
  const result=doc.createElement('section');result.id='contest-result';result.className='contest-result';result.hidden=true;
  result.setAttribute('aria-label','흑백 풉 쟁탈전 결과');
  result.innerHTML='<header><strong></strong><button type="button" aria-label="결과 닫기">×</button></header><div class="contest-results">'+['black','white'].map(t=>`<figure class="result-${t}"><figcaption>${teamName[t]}</figcaption><div class="contest-photo"><span>탑뷰 준비 중…</span></div><b class="contest-count"></b><strong class="contest-award"></strong></figure>`).join('')+'</div><p class="contest-receipt" aria-live="polite"></p>';
  doc.body.append(result);
  const resultTitle=result.querySelector('header strong'),receipt=result.querySelector('.contest-receipt');
  const figures=Object.fromEntries(['black','white'].map(t=>[t,result.querySelector('.result-'+t)]));
  let match=null,team=null,participantTeam=null,gather=null,gathered='',received=0,serverAt=0,pending=false,wallet=null,lastPaint='',lastResultPaint='',requested='',dismissed='';
  result.querySelector('button').addEventListener('click',()=>{dismissed=match?.id;result.hidden=true;cancelPhotos();});
  function clearResult(){result.hidden=true;lastResultPaint='';cancelPhotos();for(const figure of Object.values(figures))figure.querySelector('.contest-photo').replaceChildren();}
  function showResult(){
    const payouts=match.rewards??contestRewards(match);
    const hidden=dismissed===match.id||!ready();if(result.hidden!==hidden)result.hidden=hidden;
    if(result.hidden)return;
    const paid=wallet?.lastEventRewardId===match.id;
    const key=[match.id,match.black,match.white,match.winner,paid,participantTeam,wallet?.lastEventRewardAmount].join('|');
    if(key!==lastResultPaint){
      lastResultPaint=key;resultTitle.textContent=match.winner==='tie'?'흑백 쟁탈전 · 무승부!':`${teamName[match.winner]} 승리!`;
      for(const t of ['black','white']){
        figures[t].querySelector('.contest-count').textContent=`FOUP ${match[t]}개`;
        figures[t].querySelector('.contest-award').textContent=`1인당 +${payouts[t].toLocaleString()}칩`;
      }
      receipt.textContent=paid?`내 보상 +${wallet.lastEventRewardAmount.toLocaleString()}칩 적립 완료`:participantTeam?
        payouts[participantTeam]?`내 보상 +${payouts[participantTeam].toLocaleString()}칩 · 적립 확인 중…`:'내 보상 0칩':'관전 · 보상은 참가자에게 지급돼요';
    }
    if(requested===match.id)return;
    const id=match.id;requested=id;
    for(const figure of Object.values(figures))figure.querySelector('.contest-photo').textContent='탑뷰 준비 중…';
    Promise.resolve().then(()=>onResult(id)).then(photos=>{
      if(match?.id!==id||dismissed===id||requested!==id)return;
      for(const t of ['black','white']){
        const holder=figures[t].querySelector('.contest-photo');
        if(photos?.[t]){photos[t].setAttribute('aria-label',teamName[t]+' 영역 탑뷰');holder.replaceChildren(photos[t]);}
        else holder.textContent='탑뷰를 불러오지 못했어요';
      }
    }).catch(()=>{
      if(match?.id===id)for(const figure of Object.values(figures))figure.querySelector('.contest-photo').textContent='탑뷰를 불러오지 못했어요';
    });
  }
  function setTeam(next) {
    if(team===next)return;
    team=next;if(next==='white'||next==='black')participantTeam=next;onTeam(next);lastPaint='';
  }
  function update() {
    if(!match)return;
    const at=serverAt+Math.max(0,now()-received);
    const recruiting=match.phase==='recruiting',active=match.phase==='active',ended=!recruiting&&!active;
    if(ended&&at>=((match.phase==='finished'?match.endsAt:serverAt)+CONTEST_RULES.resultMs)){card.hidden=true;result.hidden=true;setZones(false,false);return;}
    if(match.phase==='finished'){card.hidden=true;showResult();return;}
    const hidden=!ready();
    if(card.hidden!==hidden)card.hidden=hidden;
    if(card.hidden)return;
    if(gather&&gathered!==gather.token&&onGather(gather))gathered=gather.token;
    const timer=clock((recruiting?match.startsAt:match.endsAt)-at);
    const amount=wallet?.lastEventRewardId===match.id?wallet.lastEventRewardAmount:0;
    const key=[match.id,match.phase,match.black,match.white,match.joined,team,pending,ended?'':timer,amount].join('|');
    if(key===lastPaint)return;
    lastPaint=key;
    title.textContent=recruiting?`${CONTEST_NAME} · 모집 ${timer}`:active?`${CONTEST_NAME} · ${timer}`:match.phase==='cancelled'?CONTEST_NAME:match.winner==='tie'?'쟁탈전 무승부!':`${teamName[match.winner]} 승리!`;
    score.hidden=recruiting||match.phase==='cancelled';
    black.textContent='● 흑팀 '+match.black;white.textContent='○ 백팀 '+match.white;
    if(recruiting){
      detail.textContent=(teamGoal[team]?teamGoal[team]+'! ':'내 방진복과 같은 색 원에 ')+`풉을 모으세요! 던져 넣기·상대 풉 뺏기도 가능 · 3분 대결 · ${match.joined}명 참가`;
    }else if(active){
      detail.textContent=team==='referee'?'파란 심판 · 관전 중':teamGoal[team]?teamGoal[team]+' · 던져 넣으세요! 바닥 풉 옆에선 ‘풉 줍기’':'관전 중';
    }else if(match.phase==='cancelled')detail.textContent=match.reason;
    else detail.textContent=amount?`내 보상 +${amount}칩 적립`:'최종 집계';
    const referee=team==='referee'&&(recruiting||active);
    button.hidden=!referee&&(!recruiting||Boolean(team));
    button.textContent=referee?'함께 이동하기':'참여하기';
    button.disabled=pending||(referee?at>=match.endsAt:at>=match.startsAt);
  }
  button.addEventListener('click',async()=>{
    if(pending||!match||!['recruiting','active'].includes(match.phase))return;
    pending=true;update();
    try{
      const response=await command(team==='referee'?'contest-visit':'contest-join',{eventId:match.id});
      if(response?.ok)setTeam(response.team);
      else toast(response?.message??'다시 연결한 뒤 참가해 주세요.');
    }catch{toast('연결을 확인하고 다시 눌러 주세요.');}finally{pending=false;update();}
  });
  return {
    update, get playing(){return match?.phase==='active'&&(team==='white'||team==='black');},
    get safetyPaused(){return Boolean(match&&['recruiting','active','finished'].includes(match.phase)&&serverAt+Math.max(0,now()-received)<match.endsAt+CONTEST_RULES.resultMs);},
    roster(rows){setTeam(rows.find(row=>row[0]===getId())?.[4]??null);},
    wallet(value){wallet=value;update();},
    frame(data){
      if(!data||!Number.isFinite(data.serverNow)||data.serverNow<serverAt)return;
      serverAt=data.serverNow;received=now();
      if(match?.id!==data.contest?.id){participantTeam=['black','white'].includes(team)?team:null;requested='';dismissed='';clearResult();}
      match=data.contest??null;
      gather=data.gather?.find(row=>row[0]===getId())?.[1]??null;
      const live=match?.phase==='active'||match?.phase==='recruiting';
      setZones(live||match?.phase==='finished',live);
      if(!live)setTeam(null);
      if(!match){if(!card.hidden)card.hidden=true;lastPaint='';return;}
      update();
    },
    disconnect(){match=null;gather=null;gathered='';serverAt=0;lastPaint='';requested='';participantTeam=null;clearResult();setTeam(null);setZones(false,false);card.hidden=true;}
  };
}
