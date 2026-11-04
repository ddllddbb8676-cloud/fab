import {createGrowthDashboard} from './growth.js';
import {createEventControls} from './events.js';
const $=id=>document.getElementById(id);
const growthDashboard=createGrowthDashboard(document);
const eventControls=createEventControls(document);
const integer=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0});
const decimal=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
const localHour=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'});
const localMinute=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const localTime=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
let inFlight=false,lastData=null,lastUpdated=0,selectedDay=null;
let activeVisit=null,visitButtons=[];
const VISIT_KEY='fab-admin-visit-v1';
const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const count=n=>valid(n)?integer.format(n):'—';
const date=value=>{if(value===null||value===undefined||value==='')return null;const result=new Date(value);return Number.isFinite(result.getTime())?result:null;};
const stamp=value=>{const parsed=date(value);return parsed?localTime.format(parsed):'확인 중';};
function text(id,value){$(id).textContent=value;}
function cell(row,value,tag='td'){const node=document.createElement(tag);node.textContent=value;row.append(node);return node;}
function emptyRow(body,message,columns){const row=document.createElement('tr'),node=cell(row,message);node.colSpan=columns;node.className='empty-row';body.replaceChildren(row);}
function showMessage(message){$('access-message').hidden=!message;text('access-message',message||'');}
function setStatus(message,state){text('connection-status',message);$('connection-status').dataset.state=state;}
function visitStatus(message,state='loading'){text('live-visit-status',message);$('live-visit-status').hidden=!message;$('live-visit-status').dataset.state=state;}
function visitBusy(){for(const button of visitButtons)button.disabled=Boolean(activeVisit);}
async function visit(user){
  if(activeVisit||user.role==='operator')return;
  const request={controller:new AbortController()};activeVisit=request;visitBusy();
  visitStatus(user.name+'님의 현재 위치를 확인하고 있어요.');
  const timeout=setTimeout(()=>request.controller.abort(),8000);
  let navigating=false,message='이동 준비가 늦어지고 있어요. 잠시 뒤 다시 눌러 주세요.';
  try{
    const response=await fetch('/api/admin/visit',{method:'POST',credentials:'same-origin',cache:'no-store',signal:request.controller.signal,headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({name:user.name})});
    const payload=await response.json();
    if(activeVisit!==request)return;
    if(request.controller.signal.aborted)throw new Error('Visit timed out');
    if(!response.ok){if(typeof payload?.message==='string'&&payload.message.trim())message=payload.message.slice(0,240);throw new Error('Visit rejected');}
    const remaining=payload?.expiresAt-Date.now();
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||!/^visitor:[a-f0-9]{64}$/.test(payload.target?.id||'')||typeof payload.target?.name!=='string'||!payload.target.name.trim()||!Number.isSafeInteger(payload.expiresAt)||remaining<=0||remaining>150000){message='이동 요청을 확인하지 못했어요. 닉네임을 다시 눌러 주세요.';throw new Error('Invalid visit');}
    const stored=JSON.stringify(payload);
    try{sessionStorage.setItem(VISIT_KEY,stored);if(sessionStorage.getItem(VISIT_KEY)!==stored)throw new Error('Storage unavailable');}
    catch{message='이 브라우저에서는 이동 요청을 저장할 수 없어요. 브라우저의 저장 공간 설정을 확인한 뒤 다시 눌러 주세요.';throw new Error('Storage unavailable');}
    visitStatus(payload.target.name+'님에게 걸어가도록 게임을 열고 있어요.');
    try{location.assign('/');navigating=true;}
    catch{try{sessionStorage.removeItem(VISIT_KEY);}catch{}message='게임을 열지 못했어요. 잠시 뒤 다시 눌러 주세요.';throw new Error('Navigation failed');}
  }catch{
    if(activeVisit===request)visitStatus(message,'error');
  }finally{
    clearTimeout(timeout);
    if(activeVisit===request&&!navigating){activeVisit=null;visitBusy();}
  }
}
function liveUsers(users){
  const list=$('live-users');list.replaceChildren();visitButtons=[];
  const known=Array.isArray(users)&&users.every(user=>user&&typeof user.name==='string'&&user.name.trim());
  if(!known){text('live-users-count','—');text('live-users-status','닉네임 목록을 확인하지 못했어요. 다음 갱신 때 다시 확인할게요.');return;}
  text('live-users-count',count(users.length)+'계정');
  text('live-users-status',users.length?'닉네임을 누르면 게임으로 돌아가 그 계정에게 걸어가요. NPC와 검증 계정은 제외했어요.':'지금 접속 중인 실제 계정이 없어요.');
  const fragment=document.createDocumentFragment();
  for(const user of users){
    const item=document.createElement('li'),name=document.createElement(user.role==='operator'?'span':'button');
    name.className='live-user-name';name.textContent=user.name;item.append(name);
    if(user.role!=='operator'){
      name.type='button';name.className+=' live-user-visit';name.setAttribute('aria-label',user.name+'님에게 걸어가기');name.disabled=Boolean(activeVisit);name.addEventListener('click',()=>visit(user));visitButtons.push(name);
    }
    if(user.role==='operator'||user.role==='safety'){
      const badge=document.createElement('span');badge.className='live-user-badge';badge.dataset.role=user.role;badge.textContent=user.role==='operator'?'운영자':'안전팀';item.append(badge);
    }
    fragment.append(item);
  }
  list.append(fragment);
}
function scaleFor(maximum){
  const raw=Math.max(1,maximum)/4,magnitude=10**Math.floor(Math.log10(raw));
  const step=Math.max(1,[1,2,5,10].find(value=>value*magnitude>=raw)*magnitude),top=Math.max(step,Math.ceil(maximum/step)*step);
  return {top,ticks:Array.from({length:Math.round(top/step)+1},(_,index)=>index*step)};
}
function shortDay(day){return day?Number(day.slice(5,7))+'/'+Number(day.slice(8,10)):'—';}
function dayTime(day){if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;const at=date(day+'T00:00:00+09:00');return at&&localDate.format(at)===day?at:null;}
function shiftedDay(day,offset){const at=dayTime(day);return at?localDate.format(new Date(at.getTime()+offset*86400000)):null;}
function svgNode(tag,attributes={},value){const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,val] of Object.entries(attributes))node.setAttribute(key,String(val));if(value!==undefined)node.textContent=value;return node;}
function daily(data){
  const generated=date(data.generatedAt)||new Date(),today=dayTime(data.today?.date)?data.today.date:localDate.format(generated),yesterday=shiftedDay(today,-1),oldest=shiftedDay(today,-29),start=date(data.startedAt),startDay=start?localDate.format(start):null;
  const records=new Map();
  for(const row of Array.isArray(data.daily)?data.daily:[])if(dayTime(row?.date)&&row.date>=oldest&&row.date<=today)records.set(row.date,row);
  function state(row,day){
    if(!row||!valid(row.uniqueAccounts))return '수집 기록 없음';
    const parts=[];
    if(row.ongoing||day===today)parts.push(day===today?'오늘 진행 중':'진행 중');
    if(row.partial){parts.push('부분 수집');if(start&&day===startDay)parts.push(localMinute.format(start)+'부터');}
    if(row.limited)parts.push('집계 한도 도달');
    return parts.length?parts.join(' · '):'집계 종료';
  }
  function summary(day,prefix,label){const row=records.get(day);text(prefix+'-label',label+' · '+shortDay(day));text(prefix+'-unique',(row?.limited?'≥ ':'')+count(row?.uniqueAccounts)+(valid(row?.uniqueAccounts)?'계정':''));text(prefix+'-state',state(row,day));}
  summary(yesterday,'yesterday','어제 접속 계정');summary(today,'daily-today','오늘 접속 계정');
  const days=[],firstRecord=[...records.keys()].sort()[0],first=firstRecord&&startDay&&startDay<=today?[oldest,[firstRecord,startDay].sort()[0]].sort().at(-1):firstRecord;
  if(first)for(let day=first;day<=today&&days.length<30;day=shiftedDay(day,1))days.push(day);
  const rows=days.map(day=>({day,row:records.get(day)})),known=rows.filter(({row})=>valid(row?.uniqueAccounts));
  const chart=$('daily-chart'),body=$('daily-rows');chart.replaceChildren();chart.hidden=!known.length;$('daily-empty').hidden=Boolean(known.length);
  const note=['한국 시간 0시부터 24시까지 같은 계정은 한 번만 세요. 동시 접속 수나 시간별 수치의 합이 아니에요.'];
  if(start)note.push('수집 시작: '+stamp(start)+' · 시작 전 기록은 없어요.');
  if(rows.some(({row})=>row?.partial))note.push('부분 수집 날짜는 하루 전체 수치가 아니에요.');
  if(rows.some(({row})=>row?.limited))note.push('≥는 집계 한도에 도달한 최소값이에요.');
  if(records.has(today))note.push('오늘은 진행 중이라 숫자가 더 늘 수 있어요.');
  note.push('미수집 날짜는 0으로 채우지 않고 선을 끊어 표시해요.');
  text('daily-note',note.join(' '));
  if(!rows.length)emptyRow(body,'일별 수집 기록이 아직 없어요.',3);
  else{const fragment=document.createDocumentFragment();for(const {day,row} of rows){const tr=document.createElement('tr');cell(tr,shortDay(day));cell(tr,(row?.limited?'≥ ':'')+count(row?.uniqueAccounts));cell(tr,state(row,day));fragment.append(tr);}body.replaceChildren(fragment);}
  if(!known.length)return;
  const width=Math.max(250,chart.clientWidth||320),height=220,left=44,right=18,top=28,bottom=178,span=width-left-right,maximum=Math.max(...known.map(({row})=>row.uniqueAccounts)),scale=scaleFor(maximum);
  chart.setAttribute('viewBox',`0 0 ${width} ${height}`);
  chart.setAttribute('aria-label',`${shortDay(first)}부터 ${shortDay(today)}까지 일별 고유 접속 계정 그래프. 기록이 있는 ${known.length}일. 각 점이나 아래 날짜별 숫자 보기에서 수치를 확인할 수 있어요.`);
  chart.append(svgNode('text',{x:0,y:13,class:'svg-unit','aria-hidden':'true'},'계정'));
  for(const tick of scale.ticks){const y=bottom-tick/scale.top*(bottom-top);chart.append(svgNode('line',{x1:left,x2:width-right,y1:y,y2:y,class:'daily-grid','aria-hidden':'true'}),svgNode('text',{x:left-8,y:y+4,'text-anchor':'end',class:'svg-axis','aria-hidden':'true','data-y-value':tick},count(tick)));}
  const point=(index,row)=>({x:rows.length===1?left+span/2:left+index/(rows.length-1)*span,y:bottom-row.uniqueAccounts/scale.top*(bottom-top)});
  let segment=[];const flush=()=>{if(segment.length>1)chart.append(svgNode('polyline',{points:segment.join(' '),class:'daily-line','aria-hidden':'true'}));segment=[];};
  rows.forEach(({row},index)=>{if(!valid(row?.uniqueAccounts)){flush();return;}const p=point(index,row);segment.push(p.x+','+p.y);});flush();
  const labelStep=Math.max(1,Math.ceil((rows.length-1)/4)),peakIndex=rows.findIndex(({row})=>row?.uniqueAccounts===maximum);
  rows.forEach(({day,row},index)=>{
    const x=rows.length===1?left+span/2:left+index/(rows.length-1)*span;
    if(index===0||index===rows.length-1||index%labelStep===0)chart.append(svgNode('text',{x,y:200,'text-anchor':index===0&&rows.length>1?'start':index===rows.length-1&&rows.length>1?'end':'middle',class:'svg-axis','aria-hidden':'true'},shortDay(day)));
    if(!valid(row?.uniqueAccounts))return;
    const p=point(index,row),value=(row.limited?'≥ ':'')+count(row.uniqueAccounts),description=`${day}, ${value}계정, ${state(row,day)}`;
    const dot=svgNode('circle',{cx:p.x,cy:p.y,r:4.5,class:'daily-point',tabindex:0,role:'img','aria-label':description,'data-day':day,'data-partial':Boolean(row.partial),'data-ongoing':Boolean(row.ongoing||day===today)});dot.append(svgNode('title',{},description));chart.append(dot);
    if(rows.length<=5||index===0||index===rows.length-1||index===peakIndex)chart.append(svgNode('text',{x:p.x+(index===0&&rows.length>1?5:index===rows.length-1&&rows.length>1?-5:0),y:p.y-11,'text-anchor':index===0&&rows.length>1?'start':index===rows.length-1&&rows.length>1?'end':'middle',class:'daily-value','aria-hidden':'true'},value));
  });
  chart.append(svgNode('text',{x:width-right,y:216,'text-anchor':'end',class:'svg-axis','aria-hidden':'true'},'날짜 · 한국 시간'));
}
function hourly(data){
  const now=date(data.generatedAt)||new Date(),today=data.today?.date||localDate.format(now),currentHour=Number(localHour.format(now));
  const records=Array.isArray(data.hourly)?data.hourly:[],days=new Set([today]);
  for(const row of records){const at=date(row.hour);if(at)days.add(localDate.format(at));}
  const available=[...days].sort().reverse().slice(0,30);
  if(!available.includes(selectedDay))selectedDay=today;
  const select=$('hourly-day'),options=document.createDocumentFragment();
  for(const value of available){const option=document.createElement('option');option.value=value;option.textContent=value+(value===today?' · 오늘':'');options.append(option);}
  select.replaceChildren(options);select.value=selectedDay;select.disabled=available.length<2;
  const day=selectedDay;
  const rows=new Map();
  for(const row of records){const at=date(row.hour);if(at&&localDate.format(at)===day)rows.set(Number(localHour.format(at)),row);}
  const peakMaximum=Math.max(0,...[...rows.values()].map(row=>valid(row.peakConcurrent)?row.peakConcurrent:0)),scale=scaleFor(peakMaximum);
  text('hourly-date',day+' · 한국 시간');
  text('hourly-caption',day+' 시간별 이용 현황, 한국 시간');
  const chart=document.createDocumentFragment(),table=document.createDocumentFragment();
  const axis=document.createDocumentFragment(),grid=document.createDocumentFragment();
  for(const tick of scale.ticks){const position=(1-tick/scale.top)*100,label=document.createElement('span'),line=document.createElement('span');label.className='chart-y-tick';label.style.top=position+'%';label.textContent=count(tick);label.dataset.value=String(tick);line.className='chart-grid-line';line.style.top=position+'%';axis.append(label);grid.append(line);}
  $('hourly-y-axis').replaceChildren(axis);$('hourly-grid').replaceChildren(grid);
  for(let hour=0;hour<24;hour++){
    const row=rows.get(hour),known=Boolean(row),peak=row?.peakConcurrent;
    const bar=document.createElement('div');bar.className='hour-bar';bar.dataset.unknown=String(!known);bar.dataset.current=String(day===today&&hour===currentHour);
    const height=valid(peak)?peak/scale.top*150:0;bar.style.setProperty('--bar-height',height+'px');
    const fill=document.createElement('span');fill.className='hour-bar-fill';
    const label=document.createElement('span');label.className='hour-label';label.textContent=hour%3===0||hour===23?String(hour).padStart(2,'0'):'';
    bar.title=`${hour}시 · 최고 동시 접속 ${count(peak)}계정${known?'':' · 수집 기록 없음'}`;
    if(known&&valid(peak)&&peak===peakMaximum&&peak>0){const value=document.createElement('span');value.className='hour-bar-value';value.textContent=count(peak);bar.append(value);}
    bar.append(fill,label);chart.append(bar);
    const tr=document.createElement('tr');cell(tr,String(hour).padStart(2,'0')+'시');cell(tr,(row?.limited?'≥ ':'')+count(row?.uniqueAccounts));cell(tr,count(peak));cell(tr,valid(row?.averageConcurrent)?decimal.format(row.averageConcurrent):'—');table.append(tr);
  }
  $('hourly-chart').replaceChildren(chart);$('hourly-rows').replaceChildren(table);
  $('hourly-chart').setAttribute('aria-label',`${day}, 각 시간 최고 동시 접속 계정 수. 세로축 0부터 ${count(scale.top)}계정. 하루 누적 접속 수가 아니에요. 자세한 값은 아래 시간별 숫자 보기에서 확인할 수 있어요.`);
  const limited=[...rows.values()].some(row=>row.limited);
  text('hourly-note',rows.size?'빈칸은 수집 기록이 없는 시간이에요. 평균 동접은 해당 시간대에서 실제로 수집한 시간 기준이에요. 시간별 계정 수의 합은 하루 고유 계정 수와 달라요.'+(limited?' ≥ 표시는 집계 한도에 도달한 값이에요.':''):'시간별 기록이 쌓이면 여기에 표시돼요. 수집 이전 시간은 알 수 없어요.');
}
function purchases(profiles){
  text('buyers',count(profiles?.buyers));text('paid-copies',count(profiles?.paidCopies));text('price-value',valid(profiles?.priceValue)?count(profiles.priceValue)+' C':'—');
  const body=$('item-rows');
  if(!profiles){emptyRow(body,'보유품 현황을 준비하고 있어요.',4);return;}
  const items=Array.isArray(profiles.items)?profiles.items.filter(item=>item&&typeof item.name==='string'&&valid(item.price)&&item.price>0).sort((a,b)=>a.price-b.price||a.name.localeCompare(b.name,'ko')):[];
  if(!items.length)emptyRow(body,'표시할 유료 아이템이 없어요.',4);
  else{const fragment=document.createDocumentFragment();for(const item of items){const row=document.createElement('tr');cell(row,item.name);cell(row,count(item.price)+' C');cell(row,count(item.owned));cell(row,count(item.equipped));fragment.append(row);}body.replaceChildren(fragment);}
  text('shop-note',`운영자·검증 계정·기본 무료템·시착은 제외해요. 보유 수는 거래 횟수가 아니며, 환산액은 현재 상점 가격 기준이에요. 이름 변경권 누적 구매 ${count(profiles.nicknamePurchases)}회는 별도예요.`);
}
function render(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||!data.live)throw new Error('통계 응답을 확인할 수 없어요.');
  const {live,today,profiles}=data;
  text('connected',count(live.connectedAccounts));text('active',count(live.activeAccounts5m));
  text('today-unique',(today?.limited?'≥ ':'')+count(today?.uniqueAccounts));text('today-peak',count(today?.peakConcurrent));
  text('live-note',`운영자와 안전팀 역할의 실제 이용자도 연결 계정에 포함돼요. 활동 계정은 현재 연결 중이며 최근 5분 안에 이동 또는 게임 행동을 한 계정이에요. NPC ${count(live.npcs)}명은 별도예요.`);
  text('today-destructions',count(today?.destructions));text('today-repairs',count(today?.repairs));text('today-purchases',count(today?.purchases));
  text('accounts',count(profiles?.accounts)+'계정');text('broken-accounts',count(profiles?.brokenAccounts)+'계정');
  text('lifetime-actions',count(profiles?.totalBroken)+' / '+count(profiles?.totalRepaired)+'대');
  text('connections',count(today?.connections)+'회');text('https-connections',count(today?.httpsConnections)+'회');
  text('collection-start','시간별 통계 수집 시작 · '+stamp(data.startedAt)+' (한국 시간)');
  $('report').hidden=false;
  liveUsers(live.users);daily(data);hourly(data);purchases(profiles);
  growthDashboard.render(data.growth,{today:data.today?.date,generatedAt:data.generatedAt});
  const notes=$('server-notes');notes.replaceChildren();
  for(const value of Array.isArray(data.notes)?data.notes:[]){if(typeof value!=='string')continue;const item=document.createElement('li');item.textContent=value;notes.append(item);}
  notes.hidden=!notes.childElementCount;
  $('report').hidden=false;
}
async function refresh(){
  if(inFlight)return;
  inFlight=true;$('refresh').disabled=true;
  setStatus(lastData?'최신 현황을 불러오고 있어요.':'운영자 권한을 확인하고 있어요.','loading');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  try{
    const response=await fetch('/api/admin/metrics',{credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
    if(response.status===401||response.status===403){
      lastData=null;lastUpdated=0;$('report').hidden=true;
      growthDashboard.clear();
      activeVisit?.controller.abort();activeVisit=null;visitButtons=[];visitStatus('');
      $('live-users').replaceChildren();text('live-users-count','—');text('live-users-status','');
      showMessage('운영자 계정으로만 볼 수 있어요.\nFAB짱 세미로 게임에 접속한 브라우저에서 이 주소를 열어 주세요. 인스타 앱과 Safari는 계정이 다를 수 있어요.');
      setStatus('운영자 계정 확인이 필요해요.','error');text('updated-at','계정 기록이나 칩은 변경하지 않아요.');return;
    }
    if(!response.ok)throw new Error('통계 서버가 잠시 응답하지 않아요.');
    const data=await response.json();render(data);lastData=data;lastUpdated=Date.now();showMessage('');setStatus('최신 현황이에요.','ready');text('updated-at',stamp(data.generatedAt)+' 갱신 · 화면을 보는 동안 1분마다');
  }catch(error){
    setStatus(lastData?'갱신이 늦어져 이전 수치를 보여드려요.':'통계를 불러오지 못했어요.','error');
    showMessage(lastData?'최신 수치가 아니에요. 잠시 뒤 자동으로 다시 확인할게요.':'잠시 뒤 다시 확인할게요. 새로고침 버튼으로도 시도할 수 있어요.');
    text('updated-at',lastData?'마지막 정상 갱신 · '+stamp(lastData.generatedAt):'게임 기록과 칩에는 영향을 주지 않아요.');
  }finally{clearTimeout(timeout);inFlight=false;$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',refresh);
$('refresh').addEventListener('click',()=>eventControls.refresh());
$('hourly-day').addEventListener('change',()=>{selectedDay=$('hourly-day').value;if(lastData)hourly(lastData);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastUpdated>=60000)refresh();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)eventControls.refresh();});
setInterval(()=>{if(!document.hidden)eventControls.refresh();},15000);
setInterval(()=>{if(!document.hidden)eventControls.paint();},1000);
setInterval(()=>{if(!document.hidden)refresh();},60000);
globalThis.addEventListener?.('resize',()=>{if(lastData&&!document.hidden)daily(lastData);});
refresh();
eventControls.refresh();
