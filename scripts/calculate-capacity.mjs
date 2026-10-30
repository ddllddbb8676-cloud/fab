import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { machines, HALL, bays } from '../src/layout.js';
import { processFamilies } from '../src/equipment-catalog.js';

const root = new URL('../', import.meta.url);
const sourcePath = new URL('data/dram-flow-2026-10-30.json', root);
export const assumptions = Object.freeze({ monthlyStarts: 30000, days: 30, hours: 720, availability: .85, loading: .80, productiveHours: 489.6, lotSize: 25, normalSampleFraction: .12, specialtySampleFraction: .04 });
export const sources = [
  ['flow', '세미툰 공부방 DRAM 공정 흐름 · 319공정 + 54계측', 'https://study.semitoon.com/flow/'],
  ['scanner', 'ASML 2018 DUV 제품 사양 · 건식 ArF/KrF 205 WPH 등', 'https://www.sec.gov/Archives/edgar/data/937966/000119312518323057/d650002dex996.htm'],
  ['track', 'TEL LITHIUS · 모델별 200–440 WPH', 'https://www.tel.com/product/lithius.html'],
  ['etch', 'TEL Tactras · 300 mm, 1–6 챔버 구성; 레시피 시간 미공개', 'https://www.tel.com/product/tactras.html'],
  ['ash', 'Mattson 2008 10-K · Suprema 400 WPH 초과 시연', 'https://www.sec.gov/Archives/edgar/data/928421/000113626109000108/form10k.htm'],
  ['furnace', 'TEL TELINDY · 125장 배치, EVAROS 200장', 'https://www.tel.com/product/telindy.html'],
  ['rtp', 'Mattson Helios XP · 2챔버 RTP', 'https://mattson.com/technology/rapid-thermal-processing/'],
  ['implant', 'Axcelis Purion · 최대 500 WPH 플랫폼; 에너지·도즈별 조건 필요', 'https://www.axcelis.com/products/purion-ion-implantation-equipment/'],
  ['pecvd', 'Applied Producer GT · 전체 시스템 150 WPH, 2006', 'https://ir.appliedmaterials.com/node/9856/pdf'],
  ['ald', 'ASM Stellar 3000 · 300 mm 고유전막 PEALD 40 WPH, 2반응로, 2006', 'https://www.sec.gov/Archives/edgar/data/351483/000119312506248965/dex991.htm'],
  ['batchald', 'ASM A412 PLUS · 150장, 2.5시간, 2반응로, 2012', 'https://www.asm.com/media/wtgffvzf/2012_semicon_west_technology_investor_presentation.pdf'],
  ['wcvd', 'Applied iSprint · 300 mm, 4챔버 전체 65 WPH 초과, 2003', 'https://ir.appliedmaterials.com/news-releases/news-release-details/applied-materials-advances-sub-90nm-contacts-new-ald-tungsten/'],
  ['pvd', 'Applied Endura TiN hardmask · 최대 85 WPH, 2007; 범용 300 mm 수치로 단정 불가', 'https://ir.appliedmaterials.com/node/9941/pdf'],
  ['ecp', 'Lam SABRE · Cu 도금 적용; 절대 처리량은 공개 페이지에 없음', 'https://www.lamresearch.com/product/sabre/'],
  ['cmp', 'Onto 기술글 · 당시 CMP 80–100 WPH, 2021', 'https://ontoinnovation.com/resources/reducing-rework-in-cmp-an-enhanced-machine-learning-based-hybrid-metrology-approach/'],
  ['screen', 'SCREEN 카탈로그 · 세정/스크러버 최대 1,000–1,200 WPH, VM3500 100 WPH', 'https://images-spe.screen.co.jp/3617/2319/1801/SPE_GeneralCatalog_Digital_CH_EN_240809.pdf'],
  ['cdsem', 'Hitachi S9380 · 300 mm, 20점 측정 시 33 WPH, 2005', 'https://www.hitachi.com/ICSFiles/afieldfile/2005/08/03/r2005_technology_el.pdf'],
  ['inspection', 'Hitachi IS3000 · 300 mm, PSL 표준 시료: 50 nm/5 WPH, 70 nm/20, 100 nm/35, 2006', 'https://www.hitachi.com/ICSFiles/afieldfile/2006/06/28/r2006_02_105.pdf'],
  ['ebeam', 'ASML 2023 · 전자빔 검사 면적/시간과 감도 관계', 'https://www.ebeam.org/docs/2023-02-28-ebeam-initiative-yu-cao-final.pdf'],
  ['sorter', 'JEL · 300 mm, 4포트 소터 400 WPH', 'https://www.jel-automation.com/en/system/detail/23']
].map(([id, title, url]) => ({ id, title, url }));

const definition = (id, family, name, steps, rates, sourceIds, note = '', extra = {}) => ({ id, family, name, steps, rates: { fast: rates[0], base: rates[1], slow: rates[2] }, sourceIds, note, extraVisits: [], miIndices: [], optionalSpares: 0, ...extra });
export const monthlyStartsLabel = value => value % 10000 === 0 ? `${value / 10000}만` : value.toLocaleString('ko-KR');
export function calculateCapacity(route, currentCounts = {}, { monthlyStarts = assumptions.monthlyStarts } = {}) {
  if (!Number.isSafeInteger(monthlyStarts) || monthlyStarts <= 0) throw new RangeError('monthlyStarts must be a positive safe integer');
  const modelAssumptions = { ...assumptions, monthlyStarts };
  const process = route.rows.filter(r => !r.mi);
  const mi = route.rows.filter(r => r.mi);
  const step = new Map(process.map(r => [+r.number, r]));
  const byTool = tool => process.filter(r => r.tool === tool).map(r => +r.number);
  const exclude = (values, ...groups) => values.filter(x => !groups.flat().includes(x));
  const p = [];
  const add = (...args) => { const pool = definition(...args); p.push(pool); return pool; };
  const fine = [10,22,83,140,157,167,210,231,247,278];
  const other = exclude(byTool('Scanner'), fine);
  add('ph-fine','PH','미세 패턴 DUV 노광',fine,[275,200,160],['scanner'],'노광 파장·도즈는 원문에 없어 2개 호환군으로 가정. EUV를 추가로 가정하지 않음.');
  add('ph-other','PH','나머지 패턴 DUV 노광',other,[240,200,160],['scanner'],'막으로 덮인 post-Cu 웨이퍼는 뒷면 오염 관리와 장비 적합성 확인 후 공용 가능하다고 가정.');
  add('ph-track-fine','PH','미세 패턴 연계 코팅·현상 트랙',[],[300,200,150],['track'],'36번 노광에 필요한 코팅·현상을 추가 자원으로 반영. 스캐너와 1:1 연계 배치.',{ extraVisits: fine.map(n => ({ kind:'implicit-track', processStep:n, count:1 })), pairedWith:'ph-fine' });
  add('ph-track-other','PH','나머지 노광 연계 코팅·현상 트랙',[],[300,200,150],['track'],'원문 공정번호를 다시 소비하지 않는 암묵적 트랙 방문.',{ extraVisits: other.map(n => ({ kind:'implicit-track', processStep:n, count:1 })), pairedWith:'ph-other' });
  add('ph-soc','PH','SOC 전용 트랙',[19],[300,200,150],['track'],'SOC와 일반 감광액 트랙의 호환을 가정하지 않아 별도 1대.');
  add('et-si','ET','Si·Poly 식각',[11,28,29,84,90,96,110,135,145,158,217],[120,80,40],['etch'],'4개 유효 챔버 × 3분 점유를 기준 80 WPH로 가정.');
  add('et-dielectric','ET','절연막·스페이서·마스크 식각',[15,23,24,27,88,93,148,162,168,192,248,259,263,316],[120,80,40],['etch'],'여러 레시피를 처리할 수 있는 챔버 구성 가정; Cu가 덮인 후기 Pad 공정은 적합성 확인 필요.');
  add('et-metal','ET','금속·도전막 식각',[104,171,232,271,311],[90,60,40],['etch'],'재료별 챔버 배정이 가능한 시스템 풀. 직접 Cu 식각을 가정하지 않음.');
  add('et-contact','ET','콘택·배선 절연막 식각',[141,211,220,279,289],[90,60,40],['etch'],'Cu 도입 이전 콘택·배선 절연막용. Cu 노출 후기 Via 식각은 별도 풀.');
  add('et-via-cu','ET','Cu 노출 후기 Via 식각',[301],[90,60,40],['etch'],'Via 바닥 Cu 노출 가능성 때문에 전체 시스템을 별도로 배정.',{contamination:'Cu'});
  add('et-harc','ET','커패시터 고종횡비 식각',[251],[45,30,15],['etch'],'기준은 4챔버 × 8분 점유의 이론 수준. 실제 레시피 시간이 공개된 값은 아님.',{optionalSpares:1});
  add('et-ash-implant','ET','이온주입 후 애싱',[36,51,55,59,63,67,71,117,175,179,183,187,196,200],[250,150,100],['ash'],'고도즈 PR 경화 가능성을 반영한 낮은 처리율 가정.');
  add('et-ash-metal','ET','금속·후기 공정 애싱',[233,272,280,290,302,312,317],[300,200,100],['ash'],'Cu 노출 공정은 전용 챔버/킷 자격 필요. 현 호환군은 공개 레시피가 아닌 설계 가정.');
  add('et-ash-other','ET','일반 PR·마스크 애싱',[12,17,25,85,94,121,129,136,142,149,159,164,169,212,221,249,252,260],[300,200,100],['ash']);
  add('di-oxide','DI','청정 산화로',[2,33,48,77,123,126],[62.5,31.25,125/6],['furnace'],'생산 웨이퍼 125장 / 점유 4시간 가정. 빠른/보수 경우 2/6시간. 더미·모니터 장수 제외 확인 필요.');
  add('di-clean-anneal','DI','청정 어닐·치밀화로',[41,74,206],[62.5,125/3,25],['furnace'],'125장 / 점유 3시간 가정.');
  add('di-cu-anneal','DI','Cu 전용 어닐로',[295],[125,125/1.5,125/3],['furnace'],'Cu 오염군 전용. Alloy anneal과 별도 시스템.',{optionalSpares:1, contamination:'Cu'});
  add('di-alloy-anneal','DI','Alloy 전용 어닐로',[319],[125,125/1.5,125/3],['furnace'],'Al/후기 BEOL 전용. Cu anneal의 도구 공유를 가정하지 않음.',{contamination:'post-Cu BEOL'});
  add('di-rtp-oxide','DI','청정 RTP 산화',[99,131],[120,60,40],['rtp'],'2챔버 / 챔버 점유 2분 가정.');
  add('di-rtp-activation','DI','주입 활성화 RTP',[203],[120,60,40],['rtp']);
  add('di-rtp-metal','DI','금속 호환 RTP',[106,224],[120,60,40],['rtp']);
  add('di-dpn-w','DI','W 노출 후 플라스마 질화',[107],[90,60,30],['rtp'],'원문은 RTP 표기지만 실제 이름은 Plasma Nitridation. 일반 램프 RTP와 구분; 처리율 순수 가정.');
  add('di-dpn-gate','DI','Gate DPN 플라스마 질화',[132],[90,60,30],['rtp'],'W 노출 DPN과 청정 gate DPN의 교차 사용을 가정하지 않음.');
  add('im-energy','IM','Well·STI 에너지 주입군',[35,50,54,58],[150,80,50],['implant']);
  add('im-precision','IM','Vt·Halo 정밀 주입군',[62,66,70,174],[250,150,80],['implant']);
  add('im-current','IM','S/D·Extension 전류 주입군',[116,178,182,186,195,199],[200,100,60],['implant'],'도즈·에너지 미공개. 구분과 속도는 설계 가정.');
  add('cv-oxide','CV','얇은 산화막 PECVD',[5,138,190],[150,100,60],['pecvd']);
  add('cv-nitride','CV','질화막·SiON PECVD',[8,20,112,153,155,235,239,241,243,245,286],[150,100,60],['pecvd'],'레시피별 챔버 배정 가정.');
  add('cv-carbon','CV','탄소 Hard Mask PECVD',[7,154,244],[150,100,60],['pecvd']);
  add('cv-fill','CV','Mold·두꺼운 막·Gap Fill',[39,204,240,242,255,274,287],[80,50,25],['pecvd'],'막 두께 미공개로 PECVD 일반막보다 느린 별도 가정.');
  add('cv-cu-cap','CV','Cu Cap 질화막',[298],[120,80,40],['pecvd'],'Cu-facing 전용 증착.',{contamination:'Cu'});
  add('cv-postcu','CV','후기 BEOL 절연막·보호막',[299,314],[120,80,40],['pecvd'],'Cu 도입 이후 이력을 가진 웨이퍼용.',{contamination:'post-Cu BEOL'});
  add('cv-lpc-nitride','CV','배치 LPCVD 질화막',[4,38,79],[120,80,40],['batchald'],'반응로 2개 전체 처리율. 150장/2.5시간은 공정만의 공개 예시이며 점유·배치 충전율은 별도 확인.');
  add('cv-lpc-poly','CV','배치 LPCVD Poly',[6,81,109,133,144,214],[120,80,40],['batchald']);
  add('cv-lpc-sige','CV','배치 SiGe',[268],[100,60,30],['batchald'],'SiGe와 Poly·질화막을 동일 호환군으로 보지 않음.');
  add('cv-ald-oxide','CV','Spacer 산화막 ALD',[14,87,161],[100,60,30],['ald']);
  add('cv-ald-nitride','CV','Spacer 질화막 ALD',[189,191],[100,60,30],['ald']);
  add('cv-ald-gate','CV','Gate 산화막 ALD',[98],[60,40,20],['ald']);
  add('cv-ald-wl','CV','WL TiN ALD',[100],[60,40,20],['ald']);
  add('cv-ald-bottom','CV','HAR 하부전극 TiN ALD',[254],[60,30,15],['ald'],'표면 포화·퍼지·깊은 구조 피복을 고려한 느린 가정.');
  add('cv-ald-highk','CV','HAR ZAZ 유전막 ALD',[266],[40,20,10],['ald'],'2006 공개 high-k 40 WPH를 단서로 현재 장비의 실제 레시피를 단정하지 않고 20 WPH 가정.',{optionalSpares:1});
  add('cv-ald-top','CV','HAR 상부전극 TiN ALD',[267],[60,30,15],['ald']);
  add('me-barrier','ME','Ti/TiN 배리어 PVD',[151,226,282],[100,70,40],['pvd']);
  add('me-wpvd','ME','W PVD',[152,269],[100,70,40],['pvd']);
  add('me-co','ME','Co PVD',[223],[100,70,40],['pvd'],'Co 재료 전용.');
  add('me-via-barrier','ME','후기 Via 배리어 PVD',[304],[100,70,40],['pvd'],'Cu 도입 이후 이력 관리.',{contamination:'post-Cu BEOL'});
  add('me-al','ME','Al 배선 Stack PVD',[309],[100,70,40],['pvd'],'막 하나가 아닌 전체 Al stack 처리율 가정.',{contamination:'post-Cu BEOL'});
  add('me-cu-stack','ME','Cu 배리어·Seed 통합 PVD',[292,293],[80,60,40],['pvd'],'연속 2개 교육 공정을 한 진공 클러스터 레시피로 처리. 스택 전체 WPH이므로 방문 1회.',{combinedVisit:1, contamination:'Cu'});
  add('me-wcvd','ME','W ALD/CVD Fill',[101,227,283],[80,60,40],['wcvd'],'4챔버 전체 장비 처리량 기준.');
  add('me-wcvd-post','ME','후기 Via W Fill',[305],[80,60,40],['wcvd'],'pre-Cu W 도구와 별도.',{contamination:'post-Cu BEOL'});
  add('me-ecp','ME','Cu 전해도금',[294],[100,60,30],['ecp'],'공식 절대 WPH가 없으므로 처리율은 명시적 가정.',{optionalSpares:1, contamination:'Cu'});
  add('cm-oxide','CM','산화막·ILD CMP',[42,207,275],[100,80,50],['cmp']);
  add('cm-nitride','CM','질화막 CMP',[113,236],[100,80,50],['cmp']);
  add('cm-poly','CM','Poly CMP',[215],[100,80,50],['cmp']);
  add('cm-node','CM','커패시터 Node 분리 CMP',[256],[100,60,40],['cmp']);
  add('cm-w','CM','W CMP',[102,228,284],[100,60,40],['cmp']);
  add('cm-w-post','CM','후기 Via W CMP',[306],[100,60,40],['cmp'],'후기 Cu 이력 관리.',{contamination:'post-Cu BEOL'});
  add('cm-cu','CM','Cu CMP',[296],[100,60,40],['cmp'],'Cu 전용. 본 모델의 WPH는 연마 시스템 서비스 기준이며 원문 별도 Scrub 자원을 별도로 둠.',{optionalSpares:1, contamination:'Cu'});
  add('cl-batch-clean','CL','청정 배치 세정',exclude(byTool('Wet Bench'),[45]),[800,400,200],['screen']);
  add('cl-batch-strip','CL','질화막 Strip 배치 세정',[45],[500,250,125],['screen'],'약액·온도 호환 차이로 청정 배치 세정과 분리.');
  const wetGroups = [
    ['cl-wet-cu','Cu 노출 Via 세정',[303],[300,150,75],'Cu가 노출될 수 있는 Via 식각 후 세정.','Cu'],
    ['cl-wet-beol','후기 BEOL·Al·Pad 세정',[308,313,318],[400,200,100],'Cu 도입 이후 W/Al/Pad 처리 이력.','post-Cu BEOL'],
    ['cl-wet-cap','Mold Dip-out·린스·건조',[262,264,265],[300,150,75],'약액 식각·구조 보호 건조 등 긴 레시피 가정.','specialty'],
    ['cl-wet-co','미반응 Co 제거',[225],[300,150,75],'Co 화학계 전용.','Co'],
    ['cl-wet-hf','산화막 제거·HF',[30,44,46,75,108,120,124,128,170],[500,250,125],'HF 계열 전용 챔버 구성.','non-Cu'],
    ['cl-wet-metal','금속 잔류물 세정',[105,172,234,273,281],[400,200,100],'Cu 이전 금속 잔류물·전처리 가정.','non-Cu metal'],
    ['cl-wet-pre','박막·열처리 전 세정',[3,78,80,130,205,238],[600,300,150],'전처리 전용 챔버 구성; 원문 레시피 미공개.','clean']
  ];
  for (const [id,name,steps,rates,note,contamination] of wetGroups) add(id,'CL',name,steps,rates,['screen'],note,{contamination});
  add('cl-wet-general','CL','일반 매엽 세정',exclude(byTool('Single Wet'),wetGroups.flatMap(g=>g[2])),[600,300,150],['screen'],'최대 1,200 WPH 사양을 그대로 사용하지 않고 긴 약액·린스 시퀀스를 반영한 300 WPH 가정.');
  add('cl-scrub-cu','CL','Cu CMP 후 전용 Scrub',[297],[800,400,200],['screen'],'별도 장비를 사용하는 보수적 구성. CMP에 통합하면 방문·설비를 중복 차감하지 않고 재계산.',{optionalSpares:1, contamination:'Cu'});
  add('cl-scrub-beol','CL','후기 W CMP Scrub',[307],[800,400,200],['screen'],'Cu 직접 연마 슬러리와 분리.',{contamination:'post-Cu BEOL'});
  add('cl-scrub-metal','CL','Cu 이전 W CMP Scrub',[103,229,285],[800,400,200],['screen']);
  add('cl-scrub-general','CL','일반 CMP·뒷면 Scrub',exclude(byTool('Scrubber'),[297,307,103,229,285]),[800,400,200],['screen']);
  const miGroups = new Map();
  for (const row of mi) {
    const n=row.name;
    const group = /CD-SAXS/.test(n)?'saxs':/e-beam/.test(n)?'ebeam':/Review/.test(n)?'review':/Leaning/.test(n)?'leaning':/OCD/.test(n)?'ocd':/Overlay/.test(n)?'overlay':/THK/.test(n)?'thickness':/ TW/.test(n)?'tw':/ Rs/.test(n)?(n==='M1 Rs'?'rs-cu':'rs'):/ CD/.test(n)?'cd':/Bow/.test(n)?'bow':/Incoming|Final/.test(n)?'macro':'optical';
    if (!miGroups.has(group)) miGroups.set(group,[]);
    miGroups.get(group).push(row.index);
  }
  const metrology = [
    ['cd','MT','CD-SEM',[60,40,25],.12,'cdsem','측정 점 수를 고정한 40 WPH 가정. 현대 DRAM 실제 측정 레시피 미공개.',1],
    ['ocd','MT','OCD·깊이·프로파일',[100,60,30],.12,'cdsem','광학 OCD 처리율은 공학 가정. CD-SEM과 별도 자원.',0],
    ['overlay','MT','Overlay',[150,100,60],.12,'scanner','정량 사양이 확보되지 않아 처리율은 공학 가정.',0],
    ['thickness','MT','막 두께 계측',[120,80,50],.12,'screen','VM3500의 SiO2 5점 100 WPH를 참고하되 다양한 막에 80 WPH 가정.',0],
    ['rs','MT','면저항·모니터',[120,80,40],.12,'screen','장비 사양 수치 미확보. Monitor 표시 2곳은 생산 wafer 대신 25장 lot당 monitor 1장 상당 추가 부하로 모델링.',0],
    ['rs-cu','MT','Cu 배선 저항',[120,80,40],.12,'screen','Cu 측정 프로브 오염 관리로 별도 계측기.',0],
    ['tw','MT','주입 Thermawave',[100,60,30],.04,'implant','25장 lot당 1장 상당 검증 가정. 실제 monitor 계획 필요.',0],
    ['saxs','MT','CD-SAXS 홀 프로파일',[20,10,5],.04,'ebeam','전문 계측. 6분/샘플의 계획 가정이며 실제 사양 아님.',0],
    ['bow','MT','Wafer Bow',[150,100,60],.12,'screen','곡률 계측 100 WPH 계획 가정.',0],
    ['macro','IN','입고·최종 Macro 검사',[200,120,60],1,'inspection','2개 지점을 전수 검사로 가정. 패턴 미세결함 검사의 20 WPH 가정과 구분.',0],
    ['optical','IN','패턴 광학 결함 검사',[35,20,5],.12,'inspection','5개 지점, 25장 lot당 3장 가정. 공개 IS3000 표는 PSL 표준 시료 50/70/100 nm에서 5/20/35 WPH. 이 시나리오는 민감도 차이의 영향을 보여주며 실제 현대 DRAM 패턴 감도/속도 조합은 미확인.',1],
    ['leaning','IN','커패시터 Leaning 검사',[20,10,5],.04,'ebeam','방법/면적 미공개. 별도 정밀 검사 슬롯 6분/샘플 가정.',0],
    ['review','IN','결함 SEM Review',[20,10,5],.04,'ebeam','위치 지정 결함 review. 전체 면적 e-beam 검사와 별도.',0],
    ['ebeam','IN','콘택 E-beam 검사',[4,2,1],.04,'ebeam','25장 lot당 1장, 지정 영역 샘플당 30분 가정. 웨이퍼 전면 검사 처리율이라는 뜻이 아님.',0]
  ];
  for (const [group,family,name,rates,sampleFraction,sourceId,note,optionalSpares] of metrology) {
    add(`mi-${group}`,family,name,[],rates,[sourceId],note,{miIndices:miGroups.get(group)||[],sampleFraction,optionalSpares, sampleOverrides:group==='rs'?Object.fromEntries(mi.filter(r=>r.name.includes('(Monitor)')).map(r=>[r.index,.04])):{}});
  }
  for (const [id,name,count,contamination] of [['so-clean','일반 FOUP·샘플 분류',4,'non-Cu'],['so-cu','Cu 취급 소터',1,'Cu'],['so-beol','후기 BEOL 소터',1,'post-Cu BEOL']]) add(id,'SO',name,[],[400,300,200],['sorter'],'공정 흐름에 없는 추가 물류 작업. 시작 wafer당 지정 횟수의 전체-wafer 이동 상당으로 가정.',{extraVisits:[{kind:'sorter',count}],contamination});

  const scenarios=['minimum','base','conservative'], rateKeys=['fast','base','slow'];
  for (const pool of p) {
    const miRows=pool.miIndices.map(i=>mi.find(r=>r.index===i));
    pool.visitsPerWafer = (pool.combinedVisit??pool.steps.length)+pool.extraVisits.reduce((s,v)=>s+v.count,0)+miRows.reduce((s,r)=>s+(pool.sampleOverrides?.[r.index]??pool.sampleFraction),0);
    pool.processRows=pool.steps.length;
    pool.checkpoints=pool.miIndices.length;
    pool.monthlyPasses=monthlyStarts*pool.visitsPerWafer;
    pool.scenarios={};
    for (let i=0;i<scenarios.length;i++) {
      const wph=pool.rates[rateKeys[i]], requiredHours=pool.monthlyPasses/wph;
      const rawTools=requiredHours/modelAssumptions.productiveHours;
      pool.scenarios[scenarios[i]]={wph,requiredHours,rawTools,capacityTools:Math.ceil(rawTools-1e-12),tools:Math.ceil(rawTools-1e-12)};
    }
    pool.outputIntervalMinutes=60/pool.rates.base;
    pool.coverage=pool.steps.map(n=>({number:n,name:step.get(n)?.name,tool:step.get(n)?.tool}));
    pool.measurements=miRows.map(r=>({index:r.index,name:r.name,sampleFraction:pool.sampleOverrides?.[r.index]??pool.sampleFraction,source:r.name.includes('(Monitor)')?'monitor-wafer-equivalent':'sampled-product-wafer'}));
  }
  for (const pool of p.filter(g=>g.pairedWith)) for (const s of scenarios) pool.scenarios[s].tools=Math.max(pool.scenarios[s].capacityTools,p.find(g=>g.id===pool.pairedWith).scenarios[s].tools);
  const familyMeta={PH:['PHOTO','포토'],ET:['ETCH','식각·애싱'],CV:['DEPO','CVD·ALD'],DI:['DIFF','산화·열처리'],IM:['IMP','이온주입'],ME:['METAL','금속 증착·도금'],CM:['CMP','CMP'],CL:['CLEAN','세정'],MT:['METRO','계측'],IN:['INSP','검사'],SO:['SORT','소터']};
  const families=Object.entries(familyMeta).map(([key,[familyKey,name]])=>{
    const pools=p.filter(g=>g.family===key), sum=fn=>pools.reduce((s,g)=>s+fn(g),0);
    const current = currentCounts[key]??0, recommended = sum(g=>g.scenarios.base.tools), optionalSpares = sum(g=>g.optionalSpares);
    const countDelta = current-recommended;
    return {key,familyKey,name,current,recommended,minimum:sum(g=>g.scenarios.minimum.tools),conservative:sum(g=>g.scenarios.conservative.tools),optionalSpares,rawCapacityTools:sum(g=>g.scenarios.base.rawTools),countDelta,countDeltaWithSpares:current-recommended-optionalSpares,countStatus:countDelta<0?'shortage':countDelta>0?'surplus':'balanced',routeSteps:sum(g=>g.steps.length),measurementCheckpoints:sum(g=>g.miIndices.length),visitsPerWafer:sum(g=>g.visitsPerWafer),detail:`${pools.length}개 호환군 · ${sum(g=>g.steps.length)}개 원문 공정 · ${sum(g=>g.miIndices.length)}개 계측/검사 지점`,poolIds:pools.map(g=>g.id),rateRange:[Math.min(...pools.map(g=>g.rates.base)),Math.max(...pools.map(g=>g.rates.base))]};
  });
  const processCoverage=p.flatMap(g=>g.steps.map(number=>({number,poolId:g.id}))).sort((a,b)=>a.number-b.number);
  const miCoverage=p.flatMap(g=>g.miIndices.map(index=>({index,poolId:g.id}))).sort((a,b)=>a.index-b.index);
  const totals=key=>families.reduce((s,f)=>s+f[key],0);
  return {schemaVersion:2,generatedOn:'2026-10-30',title:`월 ${monthlyStartsLabel(monthlyStarts)} 장 DRAM FAB 용량 검토`,monthlyStarts,currentTotal:totals('current'),totalTools:totals('recommended'),minimumTools:totals('minimum'),conservativeTools:totals('conservative'),optionalSpares:totals('optionalSpares'),totalWithOptionalSpares:totals('recommended')+totals('optionalSpares'),families,pools:p,assumptions:modelAssumptions,scene:{width:HALL.width,length:HALL.length,height:HALL.height,bayCount:bays.length,machineCount:machines.length,preserved:true},countComparison:{basis:'scene-count-only',currentMinusBase:totals('current')-totals('recommended'),shortageFamilies:families.filter(f=>f.countDelta<0).map(f=>({key:f.key,deficit:-f.countDelta}))},sources,coverage:{processCount:process.length,measurementCount:mi.length,processCoverage,miCoverage,implicitTrackVisits:p.flatMap(g=>g.extraVisits).filter(v=>v.kind==='implicit-track').length,sorterVisits:p.flatMap(g=>g.extraVisits).filter(v=>v.kind==='sorter').reduce((s,v)=>s+v.count,0),combinedSteps:[{poolId:'me-cu-stack',steps:[292,293],visits:1}]},limitations:['공개 실제 레시피 시간은 없어 장비 사양을 단서로 공정별 처리량·호환성·샘플링을 가정한 교육용 설계 추정입니다.','최소/기준/보수는 처리속도만 바꾼 시나리오이며 통계적 신뢰구간이나 공장 인수 성능 보증이 아닙니다.','표의 분/장은 전체 장비의 평균 출력 간격입니다. 한 웨이퍼의 체류시간이나 챔버 가공시간과 다릅니다.','기준 대수는 호환군별 용량을 올림한 값입니다. 선택 예비기는 별도로 표시하며 전체 N+1을 보장하지 않습니다.','319개 교육 공정은 실제 최신 DRAM 전체 공정 수를 뜻하지 않습니다. 수율·재작업·엔지니어링 wafer·FOUP 운반/OHT 정체 부하는 별도입니다.','360개 장면 장비는 이 계산으로 자동 증감하지 않습니다. 같은 공정군이라도 모든 장면 장비가 실제 레시피에 적합하다고 검증한 것은 아닙니다.']};
}

export function validateCapacity(plan, route) {
  if (!Number.isSafeInteger(plan.monthlyStarts) || plan.monthlyStarts<=0 || plan.monthlyStarts!==plan.assumptions.monthlyStarts) throw new Error('Inconsistent monthlyStarts');
  const productiveHours=plan.assumptions.hours*plan.assumptions.availability*plan.assumptions.loading;
  if (Math.abs(productiveHours-plan.assumptions.productiveHours)>1e-8) throw new Error('Inconsistent productive hours');
  const expected=route.rows.filter(r=>!r.mi).map(r=>+r.number).sort((a,b)=>a-b);
  const actual=plan.coverage.processCoverage.map(x=>x.number);
  if(expected.length!==319 || JSON.stringify(expected)!==JSON.stringify(Array.from({length:319},(_,i)=>i+1)) || JSON.stringify(expected)!==JSON.stringify(actual)) throw new Error('319 process steps must be assigned exactly once');
  const expectedMi=route.rows.filter(r=>r.mi).map(r=>r.index).sort((a,b)=>a-b);
  if(expectedMi.length!==54 || JSON.stringify(expectedMi)!==JSON.stringify(plan.coverage.miCoverage.map(x=>x.index))) throw new Error('54 MI checkpoints must be assigned exactly once');
  if(plan.coverage.implicitTrackVisits!==36) throw new Error('All 36 scanner visits need an implicit track visit');
  const knownSources=new Set(plan.sources.map(s=>s.id));
  for(const g of plan.pools) {
    if(!g.sourceIds.every(id=>knownSources.has(id))) throw new Error(`Unknown source for ${g.id}`);
    if(!Number.isFinite(g.monthlyPasses)||g.monthlyPasses<=0||Math.abs(g.monthlyPasses-plan.monthlyStarts*g.visitsPerWafer)>1e-6) throw new Error(`Invalid load for ${g.id}`);
    for(const s of ['minimum','base','conservative']) {
      const v=g.scenarios[s];
      if(v.tools*productiveHours*v.wph+1e-6<g.monthlyPasses) throw new Error(`Under-capacity pool ${g.id}/${s}`);
    }
  }
  if(plan.totalTools!==plan.families.reduce((s,f)=>s+f.recommended,0)) throw new Error('Family total mismatch');
  for (const f of plan.families) if(f.countDelta!==f.current-f.recommended || f.countDeltaWithSpares!==f.current-f.recommended-f.optionalSpares) throw new Error(`Count comparison mismatch: ${f.key}`);
  return true;
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n.toFixed(2)).toLocaleString('ko-KR');
export function renderReport(plan) {
  const summary=plan.families.map(f=>`<tr><th>${f.key} ${f.name}</th><td>${f.current}</td><td>${f.minimum}</td><td class="base">${f.recommended}</td><td>${f.conservative}</td><td>+${f.optionalSpares}</td><td>${fmt(f.rawCapacityTools)}</td><td class="${f.countStatus}">${f.countDelta<0?`${-f.countDelta}대 부족`:f.countDelta>0?`${f.countDelta}대 여유`:'동일'}</td><td>${fmt(f.rateRange[0])}–${fmt(f.rateRange[1])}</td></tr>`).join('');
  const poolSections=plan.families.map(f=>`<section><h2>${f.key} · ${f.name} <small>기준 ${f.recommended}대</small></h2><p>${f.detail}</p>${plan.pools.filter(g=>g.family===f.key).map(g=>`<article><h3>${esc(g.name)} <span>${g.scenarios.base.tools}대</span></h3><p>${esc(g.note||'처리량과 호환성은 공개 단서를 적용한 계획 가정입니다.')}</p><dl><div><dt>공정/측정 부하</dt><dd>${fmt(g.visitsPerWafer)}회/시작 wafer · 월 ${fmt(g.monthlyPasses)}회</dd></div><div><dt>기준 전체 장비 처리량</dt><dd>${fmt(g.rates.base)} WPH · 출력 간격 ${fmt(g.outputIntervalMinutes)}분/장</dd></div><div><dt>필요시간 / 489.6시간</dt><dd>${fmt(g.scenarios.base.requiredHours)} / 489.6 = ${fmt(g.scenarios.base.rawTools)}대 → ${g.scenarios.base.tools}대${g.pairedWith?' (스캐너 1:1 연계 포함)':''}</dd></div><div><dt>빠름 / 기준 / 느림 가정</dt><dd>${fmt(g.rates.fast)} / ${fmt(g.rates.base)} / ${fmt(g.rates.slow)} WPH → ${g.scenarios.minimum.tools} / ${g.scenarios.base.tools} / ${g.scenarios.conservative.tools}대</dd></div><div><dt>오염 이력 / 예비 선택</dt><dd>${esc(g.contamination||'공정·재료별 자격 확인')} / +${g.optionalSpares}대</dd></div></dl><details><summary>대응 공정과 샘플링 보기</summary><p>${g.coverage.map(r=>`#${r.number} ${esc(r.name)}`).join(' · ')||'원문 번호를 다시 세지 않는 보조 자원입니다.'}</p>${g.measurements.length?`<ul>${g.measurements.map(r=>`<li>원문 행 ${r.index}: ${esc(r.name)} · ${fmt(r.sampleFraction*100)}%${r.source==='monitor-wafer-equivalent'?' (monitor wafer 상당 부하)':''}</li>`).join('')}</ul>`:''}${g.extraVisits.length?`<p>추가 자원: ${esc(g.extraVisits.map(v=>v.kind==='implicit-track'?`노광 #${v.processStep} 트랙 1회`:`소터 ${v.count}회/시작 wafer`).join(' · '))}</p>`:''}</details><p class="refs">${g.sourceIds.map(id=>{const s=plan.sources.find(s=>s.id===id);return `<a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)}</a>`;}).join(' · ')}</p></article>`).join('')}</section>`).join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${plan.title}</title><style>*{box-sizing:border-box;min-width:0}body{overflow-wrap:anywhere;margin:0;background:#eef3f6;color:#182c3a;font:16px/1.65 system-ui,-apple-system,"Malgun Gothic",sans-serif}main{max-width:1100px;margin:auto;padding:32px 20px 80px}a{color:#06678a;overflow-wrap:anywhere}header{background:#123745;color:white;padding:30px;border-radius:22px}header a{color:#aee7f4}.tag{font-size:13px;letter-spacing:.08em;color:#70e1d0}h1{font-size:clamp(25px,5vw,42px);line-height:1.2}h2{margin-top:36px;font-size:24px}small{font-size:15px;color:#526978}h3{margin:0 0 10px;font-size:19px}h3 span{float:right;color:#087568}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}.card,article,.note{background:white;border:1px solid #d5e1e7;border-radius:14px;padding:20px}.card strong{display:block;font-size:30px}.card small{display:block}.note{border-left:5px solid #daab43}.scroll{max-width:100%;overflow-x:auto;background:white;border-radius:14px;border:1px solid #d5e1e7}table{border-collapse:collapse;width:100%;min-width:730px}th,td{padding:12px;text-align:right;border-bottom:1px solid #e3eaed;white-space:nowrap}th:first-child{text-align:left}thead{background:#dce9ed}.base{font-weight:800;color:#087568;background:#e8f5ef}article{margin:14px 0}article p{margin:8px 0}dl{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}dt{color:#607787;font-size:13px}dd{margin:2px 0;font-weight:600}.refs{font-size:12px}details{border-top:1px solid #e0e8ed;padding-top:10px}summary{cursor:pointer;font-weight:600}li{margin:7px 0}footer{margin-top:35px;color:#526978;font-size:13px}@media(max-width:650px){main{padding:18px 12px 50px}header{padding:22px}.cards{grid-template-columns:1fr 1fr;gap:8px}.card{padding:14px}.card strong{font-size:26px}dl{grid-template-columns:1fr}article{padding:16px}h3 span{float:none;display:block}.scroll::before{content:'표를 좌우로 밀어 볼 수 있습니다';display:block;padding:8px 12px;font-size:12px;color:#607787}}</style></head><body><main><header><div class="tag">SEMITOON FAB · CAPACITY REVIEW</div><h1>월 ${monthlyStartsLabel(plan.monthlyStarts)} 장 DRAM<br>장비 용량 검토</h1><p>공부방 319공정과 54계측 지점에 공개 장비 자료와 명시적 시간 가정을 적용했습니다. 실제 제조사의 레시피 실측값은 아닙니다.</p><a href="../index.html">← FAB 공간으로</a> · <a href="https://study.semitoon.com/flow/" target="_blank" rel="noreferrer">근거 공정 흐름 보기</a></header><div class="cards"><div class="card"><small>현재 장면</small><strong>${plan.currentTotal}대</strong><small>${plan.scene.width}×${plan.scene.length}×${plan.scene.height}m · ${plan.scene.bayCount}베이 유지</small></div><div class="card"><small>기준 용량</small><strong>${plan.totalTools}대</strong><small>호환군별 올림</small></div><div class="card"><small>속도 가정 범위</small><strong>${plan.minimumTools}–${plan.conservativeTools}</strong><small>빠름–보수 시나리오</small></div><div class="card"><small>선택 예비 포함</small><strong>${plan.totalWithOptionalSpares}대</strong><small>기준 + ${plan.optionalSpares}대</small></div></div><div class="note"><strong>이 표의 의미</strong><p>월 ${monthlyStartsLabel(plan.monthlyStarts)} 장은 300 mm 웨이퍼 신규 투입량입니다. 하루 24시간, 30일 × 가용률 85% × 목표 부하율 80% = <strong>489.6시간/장비·월</strong>을 사용합니다. 완성 양품 ${monthlyStartsLabel(plan.monthlyStarts)} 장이나 현재 장면의 양산 능력을 보증하는 계산이 아닙니다.</p><p>필요 장비 = ⌈Σ(월 투입량 × 방문수 × 샘플 비율 ÷ 전체 장비 WPH) ÷ 489.6⌉. 재료·오염·공정 호환군마다 각각 올림합니다. <strong>분/장은 장비 출력 간격</strong>으로, wafer 체류시간이나 챔버 가공시간을 뜻하지 않습니다.</p></div><h2>공정군별 비교</h2><p><strong>FAB 공간 ${plan.scene.width}×${plan.scene.length}m, 층고 ${plan.scene.height}m, ${plan.scene.bayCount}베이와 ${plan.currentTotal}대 물리 배치를 유지합니다.</strong> 기준 대수는 공정군별 처리량을 재계산한 값이며 장비를 제거하거나 공간을 축소하라는 뜻이 아닙니다.</p><p>수량 차이는 현재 장면 대수 − 기준 계산 대수입니다. 같은 공정군 안의 세부 장비 구성·레시피 자격이 확인되지 않아 여유 수량이 실제 생산 여력을 뜻하지 않으며, 다른 공정군의 남는 장비로 부족을 바로 보충할 수 없습니다. 소수값은 반올림 전 부하이고 실제 배치 계산은 호환군별 올림과 스캐너-트랙 연계를 적용합니다.</p><div class="scroll"><table><thead><tr><th>공정군</th><th>현재</th><th>빠름</th><th>기준</th><th>보수</th><th>예비 선택</th><th>반올림 전 부하</th><th>수량 차이</th><th>기준 WPH 범위</th></tr></thead><tbody>${summary}<tr><th>합계</th><td>${plan.currentTotal}</td><td>${plan.minimumTools}</td><td class="base">${plan.totalTools}</td><td>${plan.conservativeTools}</td><td>+${plan.optionalSpares}</td><td>${fmt(plan.families.reduce((s,f)=>s+f.rawCapacityTools,0))}</td><td>군별 비교 필요</td><td>풀별 계산</td></tr></tbody></table></div><h2>방문수와 오염 구분</h2><ul><li>319개 원문 공정번호를 중복·누락 없이 한 공정군에 배정했습니다. 계측/검사 54곳도 각각 한 번 배정했습니다.</li><li>노광 36번에는 원문에 생략된 코팅·현상 트랙 36회를 추가했습니다. PH 장비 수는 노광기와 트랙을 각각 세는 물리 시스템 수입니다.</li><li>#292 배리어 + #293 Cu Seed는 한 통합 클러스터의 전체 stack 처리율로 계산하여 2개 공정, 장비 방문 1회입니다.</li><li>Cu 어닐과 Alloy 어닐, Cu CMP와 W CMP, 직접 Cu 세정과 후기 W/Al 세정을 구분합니다. Cu가 덮인 후기 웨이퍼의 공용 처리는 뒷면 오염 관리와 장비 자격을 전제로 합니다.</li><li>CMP와 별도 Scrub을 모두 두는 구성을 가정했습니다. 통합 세정형 CMP를 도입하면 중복 자원을 빼고 처리율을 다시 맞춰야 합니다.</li><li>기본 계측은 lot당 3/25장(12%), 느린 전문 검사는 1/25장(4%) 가정입니다. 입고·최종 macro 검사는 전수로 가정했습니다. e-beam은 지정 영역 30분/샘플 기준이며 전면 검사 속도가 아닙니다.</li><li>소터는 일반4회 + Cu1회 + 후기1회 = 시작 wafer당 6회 상당의 추가 이송을 가정합니다. OHT 차량 수와 이송 시뮬레이션은 이 계산 범위에 포함하지 않습니다.</li></ul>${poolSections}<h2>공개 근거와 한계</h2><ul>${plan.limitations.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>개별 공정의 모든 처리율은 모델 입력입니다. 연결된 출처는 일부 수치·구조의 근거이며 표 전체의 실제 공정 시간을 입증하지 않습니다. 오래된 공개 사양은 그 연도의 장비 사례로만 사용했습니다.</p><footer>검토 기준 ${plan.generatedOn} · 300 mm · ${fmt(plan.monthlyStarts)} wafer starts/month · SHA256 ${plan.sourceSha256||''}<br>계산 스크립트 scripts/calculate-capacity.mjs · 재생성: node scripts/calculate-capacity.mjs</footer></main></body></html>`;
}

async function main() {
  const raw=await readFile(sourcePath,'utf8'), route=JSON.parse(raw);
  const currentCounts={};
  for(const m of machines) { const key=processFamilies[m.familyIndex].processCode; currentCounts[key]=(currentCounts[key]||0)+1; }
  const plan=calculateCapacity(route,currentCounts);
  plan.sourceSha256=createHash('sha256').update(raw).digest('hex');
  validateCapacity(plan,route);
  for(const dir of ['outputs/','docs/','src/']) await mkdir(new URL(dir,root),{recursive:true});
  await writeFile(new URL('outputs/capacity-plan.json',root),JSON.stringify(plan,null,2)+'\n');
  await writeFile(new URL('src/capacity-plan.js',root),'// Generated by scripts/calculate-capacity.mjs. Review assumptions before changing scene inventory.\nexport const capacityPlan = '+JSON.stringify(plan,null,2)+';\n');
  await writeFile(new URL('docs/capacity-plan.html',root),renderReport(plan));
  console.log(JSON.stringify({totalTools:plan.totalTools,range:[plan.minimumTools,plan.conservativeTools],optionalSpares:plan.optionalSpares,families:plan.families.map(({key,current,recommended})=>({key,current,recommended})),coverage:{process:plan.coverage.processCount,mi:plan.coverage.measurementCount,implicitTrack:plan.coverage.implicitTrackVisits}},null,2));
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) await main();
