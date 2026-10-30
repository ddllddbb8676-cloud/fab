// Functional names for this viewing model, not real vendor model numbers.
// The eight fabrication groups are an educational grouping; metrology,
// inspection and wafer sorting are separate supporting groups.
const type = (typeCode, typeName, description) => Object.freeze({ typeCode, typeName, description });
export const processCodes = Object.freeze({ PHOTO: 'PH', ETCH: 'ET', DEPO: 'CV', DIFF: 'DI', IMP: 'IM', METAL: 'ME', CMP: 'CM', CLEAN: 'CL', METRO: 'MT', INSP: 'IN', SORT: 'SO' });
export const processFamilies = [
  { key: 'PHOTO', name: '포토', short: 'LITHOGRAPHY', color: '#6a96b4', materialKey: 'blue',
    description: '감광막을 바르고 빛으로 패턴을 옮긴 뒤 현상합니다.', types: [
      type('EUV', 'EUV 노광기', '극자외선으로 마스크의 미세한 회로 패턴을 감광막에 옮깁니다.'),
      type('ARF', 'ArF 액침 노광기', 'ArF 광원과 액침 광학계를 사용해 감광막에 회로 패턴을 노광합니다.'),
      type('KRF', 'KrF 노광기', 'KrF 광원으로 해당 공정층에 필요한 패턴을 감광막에 옮깁니다.'),
      type('TRK', '코팅·현상 트랙', '감광액 도포, 베이크, 현상을 수행하며 노광 장비와 연계해 사용합니다.') ] },
  { key: 'ETCH', name: '식각', short: 'ETCH & STRIP', color: '#73a99f', materialKey: 'accent',
    description: '마스크로 보호되지 않은 부분을 제거해 패턴을 만듭니다.', types: [
      type('OX', '산화막 식각기', '산화막 등 절연막의 필요한 부분을 식각해 구멍이나 홈을 만듭니다.'),
      type('POL', '폴리실리콘 식각기', '폴리실리콘 막을 선택적으로 제거해 공정에 필요한 형상을 만듭니다.'),
      type('MET', '금속막 식각기', '식각 가능한 금속막을 패턴에 맞게 제거합니다. 금속 종류에 따라 공정이 달라집니다.'),
      type('ASH', '플라스마 애셔', '패턴 형성에 사용한 감광막과 잔류물을 플라스마를 이용해 제거합니다.') ] },
  { key: 'DEPO', name: '증착', short: 'THIN FILM DEPOSITION', color: '#a58daf', materialKey: 'purple',
    description: '공정에 필요한 얇은 막을 웨이퍼 위에 형성합니다.', types: [
      type('PEC', 'PECVD 증착기', '플라스마로 반응을 돕는 화학 기상 증착 방식으로 얇은 막을 형성합니다.'),
      type('LPC', 'LPCVD 증착로', '낮은 압력에서 반응 가스를 공급해 웨이퍼에 막을 형성합니다.'),
      type('ALD', 'ALD 증착기', '반응 물질을 순차적으로 공급해 표면 반응을 반복하며 막 두께를 제어합니다.'),
      type('EPI', '에피택시 성장기', '기판 결정과 이어지는 결정층을 웨이퍼 표면에 성장시킵니다.') ] },
  { key: 'DIFF', name: '확산·산화', short: 'THERMAL PROCESS', color: '#c09a76', materialKey: 'amber',
    description: '온도와 분위기를 제어해 산화, 확산, 열처리를 수행합니다.', types: [
      type('OXF', '산화로', '산화 분위기에서 실리콘 표면에 산화막을 성장시킵니다.'),
      type('DIF', '확산로', '고온에서 불순물의 확산을 이용해 웨이퍼 내부의 분포를 조절합니다.'),
      type('RTP', '급속 열처리기', '웨이퍼를 빠르게 가열하고 냉각하며 활성화나 어닐링 등 열처리를 수행합니다.') ] },
  { key: 'IMP', name: '이온주입', short: 'ION IMPLANTATION', color: '#8e86ac', materialKey: 'purple',
    description: '이온의 종류, 주입량, 에너지와 각도를 제어해 재료 특성을 바꿉니다.', types: [
      type('HC', '고전류 이온주입기', '높은 빔 전류를 사용하는 이온주입 장비로, 많은 주입량이 필요한 공정 등에 사용합니다.'),
      type('MC', '중전류 이온주입기', '주입량과 각도 등의 조건을 정밀하게 제어하는 중전류 이온주입 장비입니다.'),
      type('HE', '고에너지 이온주입기', '높은 에너지로 이온을 가속해 깊은 주입층이 필요한 공정 등에 사용합니다.') ] },
  { key: 'METAL', name: '금속배선', short: 'METALLIZATION', color: '#9b98ae', materialKey: 'edge',
    description: '전류가 흐를 금속층과 배선 구조에 필요한 막을 형성합니다.', types: [
      type('PVD', '금속 PVD 증착기', '스퍼터링 등 물리적 방법으로 금속 또는 금속계 얇은 막을 형성합니다.'),
      type('BAR', '배리어막 증착기', '금속 확산을 막는 배리어층 등 배선에 필요한 얇은 막을 형성합니다.'),
      type('ECP', '구리 전해도금기', '전기화학 반응으로 구리를 성장시켜 배선 홈이나 구멍을 채웁니다.') ] },
  { key: 'CMP', name: 'CMP', short: 'PLANARIZATION', color: '#b5a17b', materialKey: 'yellow',
    description: '화학 반응과 기계적 연마를 함께 사용해 표면을 평탄하게 만듭니다.', types: [
      type('OX', '산화막 CMP 연마기', '산화막을 연마해 표면 높이 차이를 줄이고 다음 공정에 필요한 평탄도를 만듭니다.'),
      type('CU', '구리 CMP 연마기', '배선 형성 후 표면의 과도한 구리와 관련 막을 제거하며 표면을 평탄화합니다.') ] },
  { key: 'CLEAN', name: '세정', short: 'WAFER CLEANING', color: '#7fa7bc', materialKey: 'blue',
    description: '여러 공정 사이에서 입자와 잔류물을 제거하고 표면을 준비합니다.', types: [
      type('SWF', '매엽 세정기', '웨이퍼를 한 장씩 처리하며 약액과 린스 등으로 표면을 세정합니다.'),
      type('BAT', '배치 세정기', '여러 장의 웨이퍼를 함께 처리하는 습식 세정 장비입니다.'),
      type('MEG', '메가소닉 세정기', '약액 또는 세정액에 고주파 음향 에너지를 더해 입자 제거를 돕습니다.'),
      type('SCR', '브러시 스크러버', '브러시와 세정액을 사용해 웨이퍼 표면의 입자와 잔류물 제거를 돕습니다.') ] },
  { key: 'METRO', name: '계측', short: 'METROLOGY', color: '#8a9cb7', materialKey: 'blue',
    description: '치수, 막 두께, 정렬 오차와 전기적 물성 등을 수치로 측정합니다.', types: [
      type('CDS', 'CD-SEM 계측기', '전자빔으로 패턴의 선폭과 홀 크기 등 주요 치수를 측정합니다.'),
      type('THK', '박막 두께 계측기', '빛의 반사 등 광학적 응답을 이용해 박막 두께와 관련 특성을 측정합니다.'),
      type('OVL', '오버레이 계측기', '위아래 공정층의 패턴이 얼마나 어긋났는지 정렬 오차를 측정합니다.'),
      type('RES', '면저항 계측기', '도전성 막의 면저항을 측정해 막의 균일도나 주입·열처리 결과 등을 확인합니다.') ] },
  { key: 'INSP', name: '검사', short: 'DEFECT INSPECTION', color: '#7eac96', materialKey: 'accent',
    description: '입자나 패턴 결함의 위치와 특성을 찾아 공정 상태를 확인합니다.', types: [
      type('OPT', '광학 결함 검사기', '빛을 이용해 웨이퍼의 입자나 패턴 이상을 검사하고 결함 위치를 찾습니다.'),
      type('EBM', '전자빔 결함 검사기', '전자빔을 이용해 미세한 결함을 검사합니다. 계측용 CD-SEM과 주된 역할을 구분합니다.'),
      type('MAC', '매크로 표면 검사기', '웨이퍼 표면을 넓게 관찰해 비교적 큰 패턴 이상이나 표면 결함을 확인합니다.') ] },
  { key: 'SORT', name: '소터', short: 'WAFER SORTING', color: '#6eaaa8', materialKey: 'accent',
    description: '웨이퍼를 지정한 캐리어와 슬롯으로 옮기고 ID와 방향을 확인합니다.', types: [
      type('WFR', '웨이퍼 소터', 'FOUP 사이로 웨이퍼를 옮기며 슬롯 배열, 웨이퍼 ID와 방향을 확인합니다. 여기서 소터는 칩의 전기적 양불량을 판정하는 테스터가 아닙니다.') ] }
].map(f => Object.freeze({ ...f, prefix: processCodes[f.key], processCode: processCodes[f.key], types: Object.freeze(f.types) }));
Object.freeze(processFamilies);

// 18 existing bays; equipment footprint and transport identities stay intact.
export const bayFamilyIndices = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1, 2, 5, 6, 7, 8, 9, 10]);
// Viewing-model bay uses and lighting, without renumbering physical locations.
export const bayPurposes = Object.freeze(bayFamilyIndices.map((familyIndex, bayId) => {
  const family = processFamilies[familyIndex];
  const cuDedicated = bayId === 14;
  const name = cuDedicated ? 'Cu 전용 세정' : family.key === 'CLEAN' ? '일반 세정' : family.key === 'METAL' ? '메탈' : family.name;
  return Object.freeze({ name, cuDedicated, yellowLight: family.key === 'PHOTO' || family.key === 'METAL' || cuDedicated });
}));
export const getBayPurpose = bayId => bayPurposes[bayId];
export const equipmentTypes = Object.freeze(processFamilies.flatMap(f => f.types.map(t => Object.freeze({ ...t, familyKey: f.key }))));

export function buildEquipmentCatalog(machines) {
  const byId = new Map();
  // Sorting by persistent layout identity makes naming independent of input order.
  for (const machine of [...machines].sort((a, b) => a.id - b.id)) {
    if (!Number.isInteger(machine.id) || byId.has(machine.id)) throw new Error('Equipment requires unique integer layout IDs');
    const family = processFamilies[machine.familyIndex];
    if (!family) throw new Error(`Unknown equipment family: ${machine.familyIndex}`);
    const row = machine.sign === 1 ? 0 : 1;
    const subtype = family.types[(machine.column + row * 10) % family.types.length];
    const ordinal = row * 10 + machine.column + 1, fabCode = 'A';
    if (!Number.isInteger(machine.bayId) || machine.bayId < 0 || machine.bayId >= 99 || !Number.isInteger(machine.column) || machine.column < 0 || machine.column > 9) throw new Error('Equipment code requires a two-digit bay and a column from 0 to 9');
    const code = `${family.processCode}${fabCode}${String(machine.bayId + 1).padStart(2, '0')}${String(ordinal).padStart(2, '0')}`;
    const purpose = getBayPurpose(machine.bayId) ?? { name: family.name, cuDedicated: false, yellowLight: false };
    const typeName = purpose.cuDedicated ? `Cu 전용 ${subtype.typeName}` : subtype.typeName;
    const description = purpose.cuDedicated ? `Cu(구리) 공정 웨이퍼 전용으로 배정한 세정 장비입니다. ${subtype.description} 이 관람 공간에서는 일반 세정 BAY와 구분해 운용합니다.` : subtype.description;
    byId.set(machine.id, Object.freeze({
      id: machine.id, code, fabCode, fabName: 'FAB A', ordinal, processCode: family.processCode,
      name: `${typeName} · ${code}`,
      typeName, typeCode: subtype.typeCode, familyKey: family.key, familyName: family.name,
      familyIndex: machine.familyIndex, bayId: machine.bayId, bayLabel: `BAY ${String(machine.bayId + 1).padStart(2, '0')}`,
      bayPurpose: purpose.name, cuDedicated: purpose.cuDedicated, yellowLight: purpose.yellowLight,
      rowLabel: row === 0 ? 'A' : 'B', column: machine.column,
      portCodes: Object.freeze(machine.ports.map((_, i) => `${code}L${i + 1}`)), description
    }));
  }
  return machines.map(machine => byId.get(machine.id));
}
