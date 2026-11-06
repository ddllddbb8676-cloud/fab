import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGrowthDashboard} from '../admin/growth.js';

class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.events={};this.dataset={};this.hidden=false;this.value='';this._text='';}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  get childElementCount(){return this.children.length;}
  append(...nodes){for(const node of nodes)this.children.push(...(node.tagName==='#fragment'?node.children:[node]));}
  replaceChildren(...nodes){this._text='';this.children=[];this.append(...nodes);}
  addEventListener(type,fn){this.events[type]=fn;}
}
const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
function fixture(){
  const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(match=>[match[1],new Element()]));
  const document={getElementById(id){assert.ok(elements.has(id),'markup contains '+id);return elements.get(id);},createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('#fragment')};
  const ui=createGrowthDashboard(document),get=id=>elements.get(id),record=(id,label)=>get(id).children.find(row=>row.children[0].textContent===label)?.children[1].textContent;
  return {ui,get,record};
}
const context={today:'2026-11-10',generatedAt:'2026-11-10T03:00:00Z'};
const pending=cohortAccounts=>({status:'pending',cohortAccounts,returnedAccounts:0,rate:null});
const complete=(cohortAccounts,returnedAccounts)=>({status:'complete',cohortAccounts,returnedAccounts,rate:returnedAccounts/cohortAccounts});
function snapshot(){
  return {version:1,startedAt:'2026-11-02T05:00:00Z',generatedAt:context.generatedAt,timezone:'Asia/Seoul',limited:false,live:{activeAccounts30s:2,togetherAccounts:2},last7Days:{activeAccounts:20,repeatActiveAccounts:6},notes:['수집 이후의 기록이에요.'],daily:[
    {date:'2026-11-02',partial:true,ongoing:false,visits:{accounts:5},activity:{accounts:3},retention:{d1:complete(5,2),d7:complete(5,2)}},
    {date:'2026-11-03',partial:false,ongoing:false,visits:{accounts:20},activity:{accounts:12},retention:{d1:complete(15,3),d7:pending(15)}},
    {date:'2026-11-10',partial:false,ongoing:true,limited:false,visits:{accounts:8,newAccounts:3,legacyFirstObserved:1,returningAccounts:2,unknownHistoryAccounts:1,returnRate:.25},retention:{d1:pending(3),d7:pending(3)},activity:{accounts:4,observedSeconds:120,togetherSeconds:60,medianAccountSeconds:25,p95AccountSeconds:45,actions:{destroy:{accounts:2,count:5},move:{accounts:4,count:10}}},economy:{earnedChips:30,spentChips:350,purchases:3,nicknamePurchases:0,unattributedSpend:50,items:[{id:'pink',name:'<img src=x onerror=alert(1)>',price:500,copies:2,spentChips:300},{id:'unknown',name:'귀속 미확인 상품',price:100,copies:1,spentChips:null}]},funnel:{pageStarts:12,sceneReady:11,connected:10,firstAction:4,shopOpen:3,tryOn:2,purchased:1,insufficientChips:1},quality:{connectErrors:2,reconnects:3,clientErrors:1,sceneReadyMs:{count:3,p50:1200,p95:4000,approximate:true},connectMs:{count:0,p50:0,p95:0,approximate:true},firstActionMs:{count:4,p50:5000,p95:10000,approximate:true},platforms:[{label:'instagram-ios',pages:9,connected:8,connectErrors:2,clientErrors:1}],sources:[{label:'<script>alert(1)</script>',pages:4,connected:3,connectErrors:0,clientErrors:0}],builds:[{label:'constructor',pages:3,connected:3,connectErrors:0,clientErrors:0}]},safety:{assignments:2,penalties:3,afterAssignment:1,afterPenalty:1,departuresWithin60s:2}}
  ]};
}
test('missing analytics and missing fields stay unknown, while observed zero stays zero',()=>{
  const f=fixture();f.ui.render(null,context);assert.equal(f.get('growth-active').textContent,'—');assert.equal(f.get('growth-d1').textContent,'—');assert.equal(f.get('growth-status').textContent,'확인 대기');assert.match(f.get('growth-notice').textContent,/갱신이 늦어/);
  const data=snapshot();data.daily.at(-1).activity.accounts=0;data.daily.at(-1).activity.observedSeconds=0;data.daily.at(-1).funnel.shopOpen=undefined;
  f.ui.render(data,context);assert.equal(f.get('growth-active').textContent,'0계정');assert.equal(f.record('growth-activity','선택한 날 활동 추정 시간 합계'),'0초');assert.equal(f.record('growth-activity','활동 계정당 평균 추정 시간'),'—');
  assert.equal(f.get('growth-shop-rows').children[0].children[1].textContent,'—');assert.equal(f.get('growth-shop-rows').children[0].children[2].textContent,'—');assert.equal(f.get('growth-timing-rows').children[1].children[1].textContent,'—','zero samples cannot imply zero latency');
});
test('retention combines eligible cohort counts rather than averaging rates and excludes immature cohorts',()=>{
  const f=fixture();f.ui.render(snapshot(),context);assert.equal(f.get('growth-d1').textContent,'25%');assert.match(f.get('growth-d1-detail').textContent,/5 \/ 20계정/);
  const d7=f.get('growth-retention-rows').children[1];assert.equal(d7.children[1].textContent,'2 / 5');assert.equal(d7.children[2].textContent,'40%');assert.match(d7.children[3].textContent,/대기 18계정/);
  const data=snapshot();data.daily=[data.daily.at(-1)];f.ui.render(data,context);assert.equal(f.get('growth-d1').textContent,'—');assert.match(f.get('growth-d1-detail').textContent,/종료 대기/);assert.equal(f.get('growth-retention-rows').children[1].children[2].textContent,'—');
});
test('return and repeat percentages show the account numerator and denominator with unknown-history context',()=>{
  const f=fixture();f.ui.render(snapshot(),context);assert.equal(f.get('growth-return').textContent,'25%');assert.match(f.get('growth-return-detail').textContent,/접속 8계정 중 이전 날짜에도 온 2계정/);
  assert.equal(f.record('growth-visits','선택한 날 재방문율'),'25% (2 / 8계정)');assert.equal(f.record('growth-visits','그중 과거 방문 이력 미확인'),'1계정');
  assert.equal(f.get('growth-repeat').textContent,'6계정');assert.match(f.get('growth-repeat-detail').textContent,/30% \(6 \/ 20계정\)/);
  assert.equal(f.record('growth-visits','접속 계정 중 첫 행동 확인'),'50% (4 / 8계정)');
});
test('activity, page stages, errors and transaction spending retain their distinct units',()=>{
  const f=fixture();f.ui.render(snapshot(),context);assert.equal(f.record('growth-activity','활동 계정당 평균 추정 시간'),'30초');
  const destroy=f.get('growth-action-rows').children[2];assert.deepEqual(destroy.children.map(cell=>cell.textContent),['장비 파괴','2','5']);
  assert.deepEqual(f.get('growth-funnel-rows').children[0].children.map(cell=>cell.textContent),['화면 시작 보고','12']);
  assert.deepEqual(f.get('growth-item-rows').children[0].children.map(cell=>cell.textContent),['<img src=x onerror=alert(1)>','2','300 C'],'actual recorded spend is not current price times copies');
  assert.equal(f.get('growth-item-rows').children[1].children[2].textContent,'— · 귀속 미확인');assert.equal(f.record('growth-economy','상품별 귀속을 확인하지 못한 지출'),'50 C');
  assert.match(f.get('growth-timing-rows').children[2].children[0].textContent,/당일 첫 연결 → 첫 행동 · 서버/);assert.equal(f.get('growth-timing-rows').children[0].children[1].textContent,'약 1.2초');
  assert.deepEqual(f.get('growth-platform-rows').children[0].children.map(cell=>cell.textContent),['인스타 · iOS','9','8','2 / 1']);
});
test('all supplied labels and notes stay text, including keys present on Object.prototype',()=>{
  const f=fixture(),data=snapshot();data.notes=['<img src=x onerror=alert(1)>'];f.ui.render(data,context);
  for(const [id,expected] of [['growth-item-rows','<img src=x onerror=alert(1)>'],['growth-source-rows','<script>alert(1)</script>'],['growth-build-rows','constructor']]){const cell=f.get(id).children[0].children[0];assert.equal(cell.textContent,expected);assert.equal(cell.childElementCount,0);}
  assert.equal(f.get('growth-notes').children[0].textContent,data.notes[0]);assert.equal(f.get('growth-notes').children[0].childElementCount,0);
});
test('date selection survives updates, partial days are labelled, and expired selection falls back to today',()=>{
  const f=fixture(),data=snapshot();f.ui.render(data,context);f.get('growth-day').value='2026-11-02';f.get('growth-day').events.change();assert.equal(f.get('growth-active').textContent,'3계정');assert.match(f.get('growth-notice').textContent,/일부 시간/);
  assert.match(f.get('today-return-link').textContent,/25% \(2 \/ 8계정\)/);assert.equal(f.record('growth-visits','이날 신규 계정의 다음 날 재방문'),'40% (2 / 5계정)');
  data.daily[0].activity.accounts=6;f.ui.render(data,context);assert.equal(f.get('growth-day').value,'2026-11-02');assert.equal(f.get('growth-active').textContent,'6계정');
  data.daily.shift();f.ui.render(data,context);assert.equal(f.get('growth-day').value,'2026-11-10');assert.match(f.get('growth-notice').textContent,/진행 중/);
});
test('limits and delayed snapshots are distinguished, and clearing removes previous analysis',()=>{
  const f=fixture(),data=snapshot();data.limited=true;f.ui.render(data,context);assert.equal(f.get('growth-status').textContent,'일부 기록 누락 가능');assert.equal(f.get('growth-d1').textContent,'25%');assert.match(f.get('growth-d1-detail').textContent,/관측값/);assert.match(f.get('growth-return-detail').textContent,/관측값/);
  assert.match(f.get('growth-repeat-detail').textContent,/30% \(6 \/ 20계정\) · 관측값/);
  data.last7Days={activeAccounts:0,repeatActiveAccounts:0};f.ui.render(data,context);assert.equal(f.get('growth-repeat-detail').textContent,'최근 7일 활동 기록 없음');
  data.limited=false;data.generatedAt='2026-11-10T02:00:00Z';f.ui.render(data,context);assert.equal(f.get('growth-status').textContent,'갱신 지연');assert.match(f.get('growth-notice').textContent,/마지막 분석 갱신/);
  f.ui.clear();assert.equal(f.get('growth-active').textContent,'—');assert.equal(f.get('growth-item-rows').children[0].children.length,1);assert.equal(f.get('growth-notes').childElementCount,0);assert.equal(f.get('growth-day').disabled,true);
});
test('daily returning share stays visible independently of immature, missing and limited new cohorts',()=>{
  const f=fixture(),data=snapshot();
  data.daily=[data.daily.at(-1)];const row=data.daily[0];
  row.visits={accounts:164,returningAccounts:39,newAccounts:108,legacyFirstObserved:17,unknownHistoryAccounts:17};
  row.limited=true;row.retention={d1:pending(108),d7:pending(108)};
  f.ui.render(data,context);assert.equal(f.get('growth-return').textContent,'23.8%');
  assert.equal(f.record('growth-visits','선택한 날 재방문율'),'23.8% (39 / 164계정) · 관측값');
  const cohortRow=key=>f.get('growth-retention-rows').children[key].children.map(cell=>cell.textContent);
  assert.deepEqual(cohortRow(0),['D1','—','—','관찰 날짜 종료 대기 108계정 · 11/12 0시부터']);
  assert.match(f.record('growth-visits','이날 신규 계정의 다음 날 재방문'),/11\/12 0시부터/);
  assert.match(cohortRow(1)[3],/11\/18 0시부터/);
  row.retention.d1={status:'unobserved',cohortAccounts:108};f.ui.render(data,context);
  assert.deepEqual(cohortRow(0),['D1','—','—','일부 날짜 방문 기록 부족']);
  row.visits.returningAccounts=0;row.retention.d1=complete(108,0);f.ui.render(data,context);
  assert.equal(f.get('growth-return').textContent,'0%');assert.deepEqual(cohortRow(0).slice(1,3),['0 / 108','0%']);
  row.visits.accounts=0;f.ui.render(data,context);assert.equal(f.get('growth-return').textContent,'—');assert.equal(f.get('growth-return-detail').textContent,'접속 기록 없음');
});
