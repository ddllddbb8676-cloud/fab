const whole=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0});
const decimal=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
const timeLabel=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const dayLabel=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
const numeric=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const number=value=>numeric(value)?whole.format(value):'—';
const unit=(value,suffix)=>numeric(value)?number(value)+suffix:'—';
const parseTime=value=>{if(value===null||value===undefined||value==='')return null;const result=new Date(value);return Number.isFinite(result.getTime())?result:null;};
const stamp=value=>{const time=parseTime(value);return time?timeLabel.format(time):'확인 중';};
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&parseTime(value+'T00:00:00Z')?.toISOString().slice(0,10)===value;
const shiftDay=(day,offset)=>new Date(new Date(day+'T00:00:00Z').getTime()+offset*86400000).toISOString().slice(0,10);
const fraction=(numerator,denominator)=>numeric(numerator)&&numeric(denominator)?`${number(numerator)} / ${number(denominator)}`:'—';
function percent(numerator,denominator,limited=false){return !limited&&numeric(numerator)&&numeric(denominator)&&denominator>0&&numerator<=denominator?decimal.format(numerator/denominator*100)+'%':'—';}
function rateDetail(numerator,denominator,limited=false){if(!numeric(numerator)||!numeric(denominator))return '—';return `${percent(numerator,denominator,limited)} (${fraction(numerator,denominator)}계정)${limited?' · 집계 한도':''}`;}
function observedRate(numerator,denominator,limited){
  if(!numeric(denominator)||!numeric(numerator)||numerator>denominator)return '—';
  if(denominator===0)return '접속 기록 없음';
  return rateDetail(numerator,denominator)+(limited?' · 관측값':'');
}
function duration(seconds){
  if(!numeric(seconds))return '—';
  if(seconds<60)return decimal.format(seconds)+'초';
  if(seconds<3600)return Math.floor(seconds/60)+'분 '+Math.floor(seconds%60)+'초';
  return number(Math.floor(seconds/3600))+'시간 '+Math.floor(seconds%3600/60)+'분';
}
function retention(rows,key,known,limited){
  let cohort=0,returned=0,completeDays=0,pendingAccounts=0,nextDate='',missing=0;
  let incomplete=limited;
  for(const row of rows){
    const record=row.retention?.[key];
    if(!record||!numeric(record.cohortAccounts)){missing++;continue;}
    if(!record.cohortAccounts)continue;
    if(record.status==='pending'){
      pendingAccounts+=record.cohortAccounts;
      const date=shiftDay(row.date,key==='d1'?2:8);
      if(!nextDate||date<nextDate)nextDate=date;
    }else if(record.status==='complete'&&numeric(record.returnedAccounts)&&record.returnedAccounts<=record.cohortAccounts){
      cohort+=record.cohortAccounts;returned+=record.returnedAccounts;completeDays++;
      incomplete ||= row.limited||record.limited;
    }else missing++;
  }
  const status=[];
  if(!known)status.push('미수집');
  else{
    if(completeDays)status.push(incomplete?'관측값 · 일부 기록 누락 가능':`집계 완료 ${completeDays}일`);
    if(pendingAccounts)status.push(`${completeDays?'대기':'관찰 날짜 종료 대기'} ${number(pendingAccounts)}계정${completeDays?'':' · '+nextDate.slice(5).replace('-','/')+' 0시부터'}`);
    if(missing)status.push('일부 날짜 방문 기록 부족');
    if(!status.length)status.push('판단 가능한 신규 계정 없음');
  }
  const counts=cohort?fraction(returned,cohort):'—',message=status.join(' · ');
  return {value:percent(returned,cohort),fraction:counts,status:message,detail:cohort?`${counts}계정 · ${message}`:message};
}
const ACTIONS=[['move','이동'],['emote','감정표현'],['destroy','장비 파괴'],['repair','장비 수리'],['throw','FOUP 던지기'],['clean','FOUP 청소'],['board','OHT 탑승'],['equip','아이템 착용']];
const SHOP=[['shopOpen','상점 열기'],['tryOn','시착'],['purchased','구매'],['insufficientChips','칩 부족']];
const PLATFORMS={'instagram-ios':'인스타 · iOS','instagram-android':'인스타 · Android',safari:'Safari',chrome:'Chrome',firefox:'Firefox',edge:'Edge',other:'기타',unknown:'확인되지 않음'};
const SOURCES={direct:'직접 접속·출처 없음',instagram:'인스타그램',semitoon:'세미툰 사이트',search:'검색',other:'기타',unknown:'확인되지 않음'};

export function createGrowthDashboard(document=globalThis.document){
  const $=id=>document.getElementById(id);let latest=null,context={},selectedDate=null;
  const text=(id,value)=>{$(id).textContent=value;};
  function table(id,rows,columns,empty='아직 기록이 없어요.'){
    const body=$(id),fragment=document.createDocumentFragment();
    if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=columns;td.className='empty-row';td.textContent=empty;tr.append(td);fragment.append(tr);}
    else for(const values of rows){const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}fragment.append(tr);}
    body.replaceChildren(fragment);
  }
  function records(id,rows){const fragment=document.createDocumentFragment();for(const [label,value] of rows){const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;div.append(dt,dd);fragment.append(div);}$(id).replaceChildren(fragment);}
  function render(snapshot,options={}){
    latest=snapshot?.version===1?snapshot:null;context=options;
    const data=latest,now=parseTime(options.generatedAt)||parseTime(data?.generatedAt)||new Date(),today=validDay(options.today)?options.today:dayLabel.format(now),oldest=shiftDay(today,-29);
    const daily=Array.isArray(data?.daily)?data.daily.filter(row=>row&&validDay(row.date)&&row.date>=oldest&&row.date<=today).sort((a,b)=>a.date.localeCompare(b.date)):[],dates=[...new Set(daily.map(row=>row.date))];
    if(!dates.includes(selectedDate))selectedDate=dates.includes(today)?today:dates.at(-1)||null;
    const select=$('growth-day'),fragment=document.createDocumentFragment();
    if(!dates.length){const option=document.createElement('option');option.value='';option.textContent='날짜별 기록 없음';fragment.append(option);}
    for(const day of [...dates].reverse()){const option=document.createElement('option');option.value=day;option.textContent=day+(day===today?' · 오늘':'');fragment.append(option);}
    select.replaceChildren(fragment);select.value=selectedDate||'';select.disabled=dates.length<2;
    const row=daily.find(day=>day.date===selectedDate),limited=Boolean(data?.limited||row?.limited),generated=parseTime(data?.generatedAt),delayed=Boolean(generated&&now-generated>120000),notices=[];
    const todayRow=daily.find(day=>day.date===today);
    const todayRate=observedRate(todayRow?.visits?.returningAccounts,todayRow?.visits?.accounts,data?.limited||todayRow?.limited);
    text('today-return-link','오늘 일반 계정 재방문율 '+todayRate+' · 자세히 보기 ↓');
    let status='기록 확인',statusKind='ready';
    if(!data){status='확인 대기';statusKind='unknown';notices.push('분석 데이터를 준비하고 있거나 갱신이 늦어지고 있어요. 확인되지 않은 수치는 —로 표시해요.');}
    else if(!row){status='수집 대기';statusKind='collecting';notices.push('수집을 시작했어요. 날짜별 기록이 쌓이면 여기에 표시돼요.');}
    if(row?.partial)notices.push('선택한 날짜는 일부 시간만 수집한 기록이에요. 하루 전체와 직접 비교하지 마세요.');
    if(row&&(row.ongoing||row.date===today)){status='수집 중';statusKind='collecting';notices.push('오늘 기록은 진행 중이라 계속 바뀔 수 있어요.');}
    if(limited){status='일부 기록 누락 가능';statusKind='limited';notices.push('일부 기록이 빠졌을 수 있어요. 관측값은 서버에 기록된 계정으로 계산해요.');}
    if(delayed){status='갱신 지연';statusKind='delayed';notices.push('분석 기록의 갱신이 늦어졌어요. 마지막 분석 갱신: '+stamp(data.generatedAt));}
    text('growth-status',status);$('growth-status').dataset.state=statusKind;
    text('growth-notice',notices.join(' '));$('growth-notice').hidden=!notices.length;
    text('growth-period',data?'수집 시작 '+stamp(data.startedAt)+' · '+(selectedDate||'날짜 기록 대기'):'새 분석 수집을 확인하고 있어요.');
    text('growth-active-label',(selectedDate===today?'오늘':'선택한 날')+' 플레이한 계정');text('growth-active',unit(row?.activity?.accounts,'계정'));
    const visits=row?.visits,activity=row?.activity,economy=row?.economy,funnel=row?.funnel,quality=row?.quality,safety=row?.safety;
    text('growth-return-label',(selectedDate===today?'오늘':'선택한 날')+' 재방문율');
    const returnRate=percent(visits?.returningAccounts,visits?.accounts);
    text('growth-return',returnRate);
    const returnDetail=returnRate==='—'?(visits?.accounts===0?'접속 기록 없음':'접속 기록 확인 대기'):`접속 ${number(visits.accounts)}계정 중 이전 날짜에도 온 ${number(visits.returningAccounts)}계정${limited?' · 관측값':''}`;
    const history=visits?.unknownHistoryAccounts;
    text('growth-return-detail',returnDetail+(returnRate!=='—'&&history>0?' · 과거 이력 미확인 '+number(history)+'계정':''));
    const d1=retention(daily,'d1',Boolean(data),Boolean(data?.limited)),d7=retention(daily,'d7',Boolean(data),Boolean(data?.limited));
    text('growth-d1',d1.value);text('growth-d1-detail',d1.detail);
    text('growth-repeat',unit(data?.last7Days?.repeatActiveAccounts,'계정'));
    const week=data?.last7Days;
    text('growth-repeat-detail',week?.activeAccounts===0?'최근 7일 활동 기록 없음':week?observedRate(week.repeatActiveAccounts,week.activeAccounts,data.limited)+' · 최근 7일 활동 계정 중':'오늘 기준 최근 7일 · 같은 날 여러 번 해도 하루예요.');
    text('growth-scope','이 분석 영역은 운영자·NPC·검증 계정을 제외해요. 계정 수는 사람 수와 달라요. D1과 최근 7일 카드는 날짜 선택과 별개로 최근 보관 기록을 보여줘요.');
    text('growth-retention-note','아래 표는 최근 30일의 신규 계정 전체가 기준이에요. 처음 만든 날짜의 정확히 다음 날(D1) 또는 7일 뒤(D7)가 끝난 계정만 합산해요.');
    table('growth-retention-rows',[['D1',d1.fraction,d1.value,d1.status],['D7',d7.fraction,d7.value,d7.status]],4);
    const selectedCohort=key=>{
      const result=retention(row?[row]:[],key,Boolean(row),limited);
      return result.value==='—'?result.status:result.value+' ('+result.fraction+'계정)'+(limited||row.retention?.[key]?.limited?' · 관측값':'');
    };
    records('growth-visits',[
      ['선택한 날 재방문율',observedRate(visits?.returningAccounts,visits?.accounts,limited)],
      ['선택한 날 접속 계정',unit(visits?.accounts,'계정')],['새로 만들어진 계정',unit(visits?.newAccounts,'계정')],
      ['기존 계정을 처음 관측',unit(visits?.legacyFirstObserved,'계정')],['그중 과거 방문 이력 미확인',unit(history,'계정')],
      ['당일 첫 행동이 확인된 계정',unit(funnel?.firstAction,'계정')],['접속 계정 중 첫 행동 확인',observedRate(funnel?.firstAction,visits?.accounts,limited)],
      ['이날 신규 계정의 다음 날 재방문',selectedCohort('d1')],['이날 신규 계정의 7일 뒤 재방문',selectedCohort('d7')]
    ]);
    records('growth-activity',[
      ['선택한 날 활동 추정 시간 합계',duration(activity?.observedSeconds)],['활동 계정당 평균 추정 시간',numeric(activity?.accounts)&&activity.accounts>0&&numeric(activity?.observedSeconds)?duration(activity.observedSeconds/activity.accounts):'—'],['계정별 활동 시간 중앙값 / 95% 지점',duration(activity?.medianAccountSeconds)+' / '+duration(activity?.p95AccountSeconds)],['지금 최근 30초 활동 계정',unit(data?.live?.activeAccounts30s,'계정')]
    ]);
    table('growth-action-rows',ACTIONS.map(([key,label])=>[label,number(activity?.actions?.[key]?.accounts),number(activity?.actions?.[key]?.count)]),3);
    text('growth-activity-note','활동 시간은 서버가 실제 움직임·행동을 관측한 구간의 추정값이에요. 켜 두기만 한 시간을 플레이 시간으로 더하지 않아요. 합계는 계정별 시간을 더한 값이며, 놀이별 계정 수에는 같은 계정이 겹칠 수 있어요.');
    records('growth-economy',[
      ['선택한 날 얻은 칩',unit(economy?.earnedChips,' C')],['선택한 날 사용한 칩',unit(economy?.spentChips,' C')],['아이템 구매',unit(economy?.purchases,'개')],['이름 변경권 구매',unit(economy?.nicknamePurchases,'회')],['상품별 귀속을 확인하지 못한 지출',unit(economy?.unattributedSpend,' C')]
    ]);
    table('growth-shop-rows',SHOP.map(([key,label])=>[label,number(funnel?.[key]),rateDetail(funnel?.[key],visits?.accounts,limited)]),3);
    const items=Array.isArray(economy?.items)?economy.items.filter(item=>item&&typeof item.name==='string').sort((a,b)=>(b.copies||0)-(a.copies||0)||a.name.localeCompare(b.name,'ko')):[];
    table('growth-item-rows',items.map(item=>[item.name,number(item.copies),numeric(item.spentChips)?unit(item.spentChips,' C'):'— · 귀속 미확인']),3,row?'선택한 날짜에 기록된 아이템 구매가 없어요.':'구매 기록을 아직 확인할 수 없어요.');
    table('growth-funnel-rows',[['화면 시작 보고',number(funnel?.pageStarts)],['3D 준비 완료 보고',number(funnel?.sceneReady)],['연결 완료 보고',number(funnel?.connected)]],2);
    records('growth-quality',[
      ['보고가 도착한 고유 페이지',unit(quality?.reportedPages,'개')],['연결 오류 보고',unit(quality?.connectErrors,'회')],['재연결 보고',unit(quality?.reconnects,'회')],['화면 오류 보고',unit(quality?.clientErrors,'회')]
    ]);
    table('growth-timing-rows',[
      ['3D 준비 · 화면 보고','sceneReadyMs'],['연결 준비 · 화면 보고','connectMs'],['당일 첫 연결 → 첫 행동 · 서버','firstActionMs']
    ].map(([label,key])=>{const value=quality?.[key],hasSamples=numeric(value?.count)&&value.count>0;return [label,hasSamples&&numeric(value.p50)?(value.approximate?'약 ':'')+duration(value.p50/1000):'—',hasSamples&&numeric(value.p95)?(value.approximate?'약 ':'')+duration(value.p95/1000):'—',unit(value?.count,'개')];}),4);
    records('growth-social',[
      ['지금 함께 활동 중인 계정',unit(data?.live?.togetherAccounts,'계정')],['선택한 날 함께 활동한 추정 시간 합계',duration(activity?.togetherSeconds)],['안전팀 배정',unit(safety?.assignments,'회')],['패널티 부여',unit(safety?.penalties,'회')],['안전팀 배정 뒤 종료 관측',unit(safety?.afterAssignment,'회')],['패널티 뒤 종료 관측',unit(safety?.afterPenalty,'회')],['사건 뒤 종료 관측 합계',unit(safety?.departuresWithin60s,'회')]
    ]);
    text('growth-safety-note','함께 활동한 시간도 계정별 추정 시간의 합계예요. 종료 관측은 안전팀 배정·패널티 후 60초 안에 연결이 끝나고, 이후 60초 동안 복귀하지 않은 경우예요. 확인 대기 중인 종료는 뒤늦게 반영될 수 있어요. 종료 원인이나 이용자의 의도를 뜻하지 않아요.');
    for(const [key,id,labels] of [['platforms','growth-platform-rows',PLATFORMS],['sources','growth-source-rows',SOURCES],['builds','growth-build-rows',{}]]){
      const segments=Array.isArray(quality?.[key])?quality[key].filter(item=>item&&typeof item.label==='string').sort((a,b)=>(b.pages||0)-(a.pages||0)):[];
      table(id,segments.map(item=>[Object.hasOwn(labels,item.label)?labels[item.label]:item.label,number(item.pages),number(item.connected),number(item.connectErrors)+' / '+number(item.clientErrors)]),4,row?'선택한 날짜의 환경 보고가 아직 없어요.':'환경 보고를 아직 확인할 수 없어요.');
    }
    const notes=$('growth-notes'),notesFragment=document.createDocumentFragment();
    for(const note of Array.isArray(data?.notes)?data.notes:[]){if(typeof note!=='string')continue;const li=document.createElement('li');li.textContent=note;notesFragment.append(li);}
    notes.replaceChildren(notesFragment);notes.hidden=!notes.childElementCount;
  }
  $('growth-day').addEventListener('change',()=>{selectedDate=$('growth-day').value;render(latest,context);});
  return {render,clear(){selectedDate=null;render(null);}};
}
