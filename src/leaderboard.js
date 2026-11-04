// Use the existing authoritative score packets; no additional polling or
// server broadcasts are needed. Visitors and resident characters share TOP 5.
export function rankVisitors(people,roster,limit=5){
  const names=new Map(roster.map(([id,name])=>[id,name]));
  return people.filter(p=>names.has(p[0])).map(p=>({id:p[0],name:names.get(p[0]),brokenCount:Math.max(0,Math.floor(Number(p[15])||0))}))
    .filter(p=>p.brokenCount>0).sort((a,b)=>b.brokenCount-a.brokenCount||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,limit);
}
export function rankScores(rows,limit=5){
  const unique=new Map();
  for(const row of rows){
    const brokenCount=Math.max(0,Math.floor(Number(row.brokenCount)||0));
    if(row.id&&row.name&&brokenCount)unique.set(row.id,{id:row.id,name:row.name,brokenCount});
  }
  return [...unique.values()].sort((a,b)=>b.brokenCount-a.brokenCount||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,limit);
}

const views=new WeakMap();
export function createLeaderboard(element){
  // Rebinding the same screen must not reset its choice or add a second toggle.
  if(views.has(element))return views.get(element);
  const document=element.ownerDocument||globalThis.document;
  const list=element.querySelector('ol'),empty=element.querySelector('.leaderboard-empty');
  const toggle=element.querySelector('button.leaderboard-heading');
  let collapsed=false,hasRows=false,pointer=null,dragged=false;
  function applyFold(){
    const expanded=String(!collapsed),label=`파괴 TOP 5 ${collapsed?'펼치기':'접기'}`,emptyHidden=collapsed||hasRows;
    if(toggle&&toggle.getAttribute('aria-expanded')!==expanded)toggle.setAttribute('aria-expanded',expanded);
    if(toggle&&toggle.getAttribute('aria-label')!==label)toggle.setAttribute('aria-label',label);
    if(element.classList.contains('leaderboard-collapsed')!==collapsed)element.classList.toggle('leaderboard-collapsed',collapsed);
    if(list.hidden!==collapsed)list.hidden=collapsed;if(empty.hidden!==emptyHidden)empty.hidden=emptyHidden;
  }
  function moved(event){if(pointer&&event.pointerId===pointer.id&&Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)>8)dragged=true;}
  toggle?.addEventListener('pointerdown',event=>{if(event.button!==undefined&&event.button!==0)return;pointer={id:event.pointerId,x:event.clientX,y:event.clientY};dragged=false;},{passive:true});
  document.addEventListener('pointermove',moved,{passive:true});
  document.addEventListener('pointerup',event=>{if(pointer?.id===event.pointerId){moved(event);pointer=null;}},{passive:true});
  document.addEventListener('pointercancel',event=>{if(pointer?.id===event.pointerId){dragged=true;pointer=null;}},{passive:true});
  toggle?.addEventListener('click',event=>{
    if(dragged&&event.detail!==0){event.preventDefault();event.stopImmediatePropagation();return;}
    collapsed=!collapsed;applyFold();
  });
  let roster=[],people=[],selfId=null,last='',cumulative=null;
  function render(){
    const rows=cumulative??rankVisitors(people,roster),key=JSON.stringify([selfId,rows]);if(key===last)return;last=key;hasRows=rows.length>0;applyFold();
    const fragment=document.createDocumentFragment();
    rows.forEach((row,i)=>{
      const li=document.createElement('li');li.classList.toggle('is-self',row.id===selfId);
      const rank=document.createElement('span'),name=document.createElement('span'),score=document.createElement('span');
      rank.className='leaderboard-rank';rank.textContent=String(i+1);name.className='leaderboard-name';name.textContent=row.name;
      score.className='leaderboard-score';score.textContent=String(row.brokenCount);li.setAttribute('aria-label',`${i+1}위 ${row.name}, 부순 장비 ${row.brokenCount}대`);
      li.append(rank,name,score);fragment.appendChild(li);
    });list.replaceChildren(fragment);
  }
  const view={setRoster(rows){roster=rows;render();},setPeople(rows){people=rows;render();},setRanking(rows){if(Array.isArray(rows)){cumulative=rankScores(rows);render();}},setSelf(id){selfId=id;render();},setOnline(online){element.hidden=!online;applyFold();}};
  applyFold();views.set(element,view);return view;
}
