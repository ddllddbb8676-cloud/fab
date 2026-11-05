import {CONTEST_NAME, CONTEST_RULES, CONTEST_ZONES} from './foup-contest.js?v=eeab61e402c0';

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
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(size,size),material,3);
    const marker = new THREE.Object3D();
    marker.rotation.x = -Math.PI/2;
    CONTEST_ZONES.filter(zone=>zone.team===colour).forEach((zone,i)=>{
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
const clock = ms => {
  const seconds=Math.max(0,Math.ceil(ms/1000));
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
};
export function createContestUI({doc=document, now=()=>performance.now(), command, ready, getId, onGather, onTeam, setZones, toast}) {
  const card=doc.createElement('aside');
  card.id='contest-card';card.className='world-event-card contest-card';card.hidden=true;
  card.innerHTML='<strong class="contest-title"></strong><div class="contest-score" hidden><b class="contest-black"></b><b class="contest-white"></b></div><span class="contest-detail"></span><button type="button">참여하기</button>';
  doc.body.append(card);
  const title=card.querySelector('.contest-title'),score=card.querySelector('.contest-score'),black=card.querySelector('.contest-black'),white=card.querySelector('.contest-white'),detail=card.querySelector('.contest-detail'),button=card.querySelector('button');
  score.setAttribute('aria-live','polite');
  let match=null,team=null,gather=null,gathered='',received=0,serverAt=0,pending=false,wallet=null,lastPaint='';
  function setTeam(next) {
    if(team===next)return;
    team=next;onTeam(next);lastPaint='';
  }
  function update() {
    if(!match)return;
    const at=serverAt+Math.max(0,now()-received);
    const recruiting=match.phase==='recruiting',active=match.phase==='active',ended=!recruiting&&!active;
    if(ended&&at>=((match.phase==='finished'?match.endsAt:serverAt)+CONTEST_RULES.resultMs)){card.hidden=true;return;}
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
      detail.textContent=(team?teamName[team]+' · ':'')+`로드포트의 풉을 우리 원에 던지세요! 상대 풉도 뺏을 수 있어요. 3분 뒤 더 많이 모은 팀이 승리! · ${match.joined}명 참가`;
    }else if(active){
      detail.textContent=team==='referee'?'파란 심판 · 관전 중':team?teamName[team]+' · 우리 원에 던져 넣으세요!':'관전 중';
    }else if(match.phase==='cancelled')detail.textContent=match.reason;
    else detail.textContent=amount?`내 보상 +${amount}칩 적립`:'최종 집계';
    button.hidden=!recruiting||Boolean(team);
    button.disabled=pending||at>=match.startsAt;
  }
  button.addEventListener('click',async()=>{
    if(pending||match?.phase!=='recruiting')return;
    pending=true;update();
    try{
      const response=await command('contest-join',{eventId:match.id});
      if(response?.ok)setTeam(response.team);
      else toast(response?.message??'다시 연결한 뒤 참가해 주세요.');
    }finally{pending=false;update();}
  });
  return {
    update, get playing(){return match?.phase==='active'&&(team==='white'||team==='black');},
    roster(rows){setTeam(rows.find(row=>row[0]===getId())?.[4]??null);},
    wallet(value){wallet=value;update();},
    frame(data){
      if(!data||!Number.isFinite(data.serverNow)||data.serverNow<serverAt)return;
      serverAt=data.serverNow;received=now();match=data.contest??null;
      gather=data.gather?.find(row=>row[0]===getId())?.[1]??null;
      const live=match?.phase==='active'||match?.phase==='recruiting';
      setZones(live);
      if(!live)setTeam(null);
      if(!match){if(!card.hidden)card.hidden=true;lastPaint='';return;}
      update();
    },
    disconnect(){match=null;gather=null;gathered='';serverAt=0;lastPaint='';setTeam(null);setZones(false);card.hidden=true;}
  };
}
