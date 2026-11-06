import { pendingRepairEquipment, startRepairRanking } from './repair-ranking.js?v=a73f61bfaf6e';
export { rankRepairEquipment } from './repair-ranking.js?v=a73f61bfaf6e';

const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]/gu, '');

export function filterEquipment(equipment, query = '', familyKey = '') {
  const bays = [];
  const remaining = String(query).normalize('NFKC').replace(/\bBAY\s*0*(\d+)\b/giu, (_, number) => {
    bays.push(Number(number)); return ' ';
  });
  const tokens = remaining.trim().split(/\s+/u).map(normalize).filter(Boolean);
  return equipment.filter(item => {
    if (familyKey && item.familyKey !== familyKey) return false;
    if (bays.some(bay => item.bayId + 1 !== bay)) return false;
    if (!tokens.length) return true;
    const haystack = normalize([item.code, item.name, item.typeName, item.typeCode, item.familyKey,
      item.familyName, item.bayPurpose, item.fabName, item.fabCode, item.bayLabel, `BAY ${item.bayId + 1}`, `${item.rowLabel}열`,
      `${item.column + 1}번`, ...(item.portCodes ?? [])].join(' '));
    return tokens.every(token => haystack.includes(token));
  });
}

export function createEquipmentDirectory({ equipment, families, getPosition = () => null, onSelect = () => {}, onToggle = () => {}, onError = () => {}, rankRepairs = startRepairRanking }) {
  const items = [...equipment].sort((a, b) => a.id - b.id);
  let allowedIds = null;
  let repairRanking = null;
  let rankingPending = false, cancelRanking = null, rankingGeneration = 0;
  const byId = new Map(items.map(item => [String(item.id), item]));
  const familyCounts = new Map();
  for (const item of items) familyCounts.set(item.familyKey, (familyCounts.get(item.familyKey) ?? 0) + 1);
  const dialog = document.createElement('dialog');
  dialog.id = 'equipment-directory'; dialog.className = 'equipment-directory';
  dialog.setAttribute('aria-labelledby', 'equipment-directory-title');
  dialog.innerHTML = `
    <div class="equipment-directory-head">
      <div><div class="equipment-directory-eyebrow">EQUIPMENT DIRECTORY</div><h2 id="equipment-directory-title">장비 목록</h2><p class="equipment-directory-summary"></p><p class="equipment-directory-code-help">공정 2자리 · FAB 1자리 · BAY 2자리 · 장비번호 2자리<br><span>PHA0101 = PH 포토 · A 팹 · 01 베이 · 01번 장비</span></p><a class="capacity-link" href="/docs/capacity-plan.html" target="_blank" rel="noopener">월 3만 장 기준 장비 용량 계산표 ↗</a></div>
      <button type="button" class="equipment-directory-close" aria-label="장비 목록 닫기">×</button>
    </div>
    <div class="equipment-directory-filters">
      <label class="equipment-directory-search"><span class="equipment-directory-sr">장비 검색</span><input type="search" placeholder="이름·7자리 코드·BAY 검색" autocomplete="off" spellcheck="false" enterkeyhint="search"></label>
      <label class="equipment-directory-family"><span class="equipment-directory-sr">공정 및 장비군</span><select aria-label="공정 및 장비군"><option value="">모든 장비군</option></select></label>
    </div>
    <div class="equipment-directory-results"><span class="equipment-directory-count" role="status" aria-live="polite"></span><span>장비를 선택하면 앞으로 이동해요 <span aria-hidden="true">↗</span></span></div>
    <ul class="equipment-directory-list" aria-label="장비 검색 결과"></ul>
    <div class="equipment-directory-empty" hidden><strong>일치하는 장비가 없어요.</strong><p>이름이나 코드의 일부로 다시 찾아보세요.</p><button type="button">검색 초기화</button></div>
  `;
  document.body.appendChild(dialog);
  const search = dialog.querySelector('input'), select = dialog.querySelector('select');
  const list = dialog.querySelector('.equipment-directory-list'), count = dialog.querySelector('.equipment-directory-count');
  const empty = dialog.querySelector('.equipment-directory-empty');
  dialog.querySelector('.equipment-directory-summary').textContent = `${items.length.toLocaleString('ko-KR')}대 · ${familyCounts.size}개 장비군`;
  for (const family of families) {
    if (!familyCounts.has(family.key)) continue;
    const option = document.createElement('option'); option.value = family.key;
    option.textContent = `${family.processCode} · ${family.name} (${familyCounts.get(family.key)})`; select.appendChild(option);
  }
  function span(className, text) {
    const node = document.createElement('span'); node.className = className; node.textContent = text; return node;
  }
  function render() {
    const available = repairRanking ? repairRanking.map(row => row.item) : allowedIds ? items.filter(item => allowedIds.has(item.id)) : items;
    const distances = new Map((repairRanking ?? []).map(row => [row.item.id, row.distance]));
    const result = filterEquipment(available, allowedIds ? '' : search.value, select.value);
    const fragment = document.createDocumentFragment();
    for (const item of result) {
      const li = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.className = 'equipment-directory-row'; button.dataset.equipmentId = item.id;
      const distance = distances.get(item.id);
      const distanceLabel = rankingPending ? '도보 거리 확인 중…' : distance === undefined ? '' : Number.isFinite(distance) ? `도보 약 ${Math.ceil(distance)}m` : '이동 경로 없음';
      button.disabled = rankingPending || distance === Infinity;
      const location = `${item.fabName} · ${item.bayLabel} · ${item.rowLabel}열 ${String(item.column + 1).padStart(2, '0')}번`;
      button.setAttribute('aria-label', allowedIds ? `${item.code} 수리하기${distanceLabel ? ', ' + distanceLabel : ''}` : `${item.code}, ${item.name}, ${location}으로 이동`);
      const identity = span('equipment-directory-identity', '');
      identity.append(span('equipment-directory-code', item.code), span('equipment-directory-name', item.typeName));
      const detail = span('equipment-directory-detail', '');
      detail.append(span('equipment-directory-kind', [distanceLabel, item.bayPurpose ?? item.familyName].filter(Boolean).join(' · ')), span('equipment-directory-location', location));
      const arrow = span('equipment-directory-arrow', allowedIds ? '🔧' : '↗'); arrow.setAttribute('aria-hidden', 'true');
      button.append(identity, detail, arrow); li.appendChild(button); fragment.appendChild(li);
    }
    list.replaceChildren(fragment); list.scrollTop = 0;
    count.textContent = `${result.length.toLocaleString('ko-KR')} / ${available.length.toLocaleString('ko-KR')}대`;
    empty.hidden = result.length !== 0; list.hidden = result.length === 0;
  }
  let previousFocus = null, announcedOpen = false;
  function finishClose() {
    rankingGeneration++; cancelRanking?.(); cancelRanking = null; rankingPending = false;
    if (!announcedOpen) return;
    announcedOpen = false; onToggle(false);
    if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll: true });
  }
  function close() { if (!dialog.open) return; dialog.close(); finishClose(); }
  function open({ ids = null } = {}) {
    if (dialog.open) return;
    allowedIds = ids ? new Set(ids) : null;
    const current = getPosition(), position = current ? {x:current.x,z:current.z} : null;
    const available = allowedIds ? items.filter(item => allowedIds.has(item.id)) : items;
    rankingPending = Boolean(allowedIds && position && available.length);
    repairRanking = rankingPending ? pendingRepairEquipment(available, position) : null;
    dialog.querySelector('#equipment-directory-title').textContent = allowedIds ? '수리할 장비 선택' : '장비 목록';
    const summary = dialog.querySelector('.equipment-directory-summary');
    summary.textContent = allowedIds ? `고장 난 장비 ${available.length}대 · ${rankingPending ? '도보 거리 확인 중…' : '한 대씩 수리해요'}` : `${items.length.toLocaleString('ko-KR')}대 · ${familyCounts.size}개 장비군`;
    dialog.querySelector('.equipment-directory-results > span:last-child').textContent = allowedIds ? '장비를 고르면 걸어가서 수리해요 🔧' : '장비를 선택하면 앞으로 이동해요 ↗';
    dialog.querySelector('.equipment-directory-search').hidden=Boolean(allowedIds);
    search.disabled=Boolean(allowedIds);
    list.setAttribute('aria-label',allowedIds?'가까운 순 수리 장비':'장비 검색 결과');
    empty.querySelector('strong').textContent=allowedIds?'수리할 장비가 없어요.':'일치하는 장비가 없어요.';
    empty.querySelector('p').textContent=allowedIds?'다른 장비군을 선택하거나 잠시 후 다시 열어주세요.':'이름이나 코드의 일부로 다시 찾아보세요.';
    empty.querySelector('button').hidden=Boolean(allowedIds);
    if (allowedIds) { search.value = ''; select.value = ''; }
    previousFocus = document.activeElement; render();
    try {
      // Never lock the game behind a dialog that failed to appear.
      dialog.showModal(); announcedOpen = true; onToggle(true);
      (allowedIds?dialog.querySelector('.equipment-directory-close'):search).focus({preventScroll:true});
    } catch (error) { if (dialog.open) dialog.close(); finishClose(); onError(error); return; }
    if (rankingPending) {
      const generation = ++rankingGeneration;
      cancelRanking = rankRepairs(available, position, {
        onProgress(completed) {
          if (dialog.open && generation === rankingGeneration) summary.textContent = `도보 거리 확인 중… ${completed} / ${available.length}대`;
        },
        onComplete(rows) {
          if (!dialog.open || generation !== rankingGeneration) return;
          repairRanking = rows; rankingPending = false; cancelRanking = null;
          summary.textContent = `고장 난 장비 ${available.length}대 · 가까운 순 · 실제 도보 거리`; render();
        },
        onError() {
          if (!dialog.open || generation !== rankingGeneration) return;
          rankingPending = false; cancelRanking = null;
          summary.textContent = `고장 난 장비 ${available.length}대 · 선택한 장비의 경로를 확인해요`; render();
        }
      });
    }
  }
  search.addEventListener('input', render); select.addEventListener('change', render);
  dialog.querySelector('.equipment-directory-close').addEventListener('click', close);
  empty.querySelector('button').addEventListener('click', () => { search.value = ''; select.value = ''; render(); search.focus(); });
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-equipment-id]');
    if (!button || button.disabled) return;
    const item = byId.get(button.dataset.equipmentId); if (!item) return;
    const repair = allowedIds !== null;
    close(); onSelect(item, { repair });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  });
  // Native modal focus containment keeps background FAB controls out of the tab order.
  // Stop keyboard bubbling so typing, arrows and Escape never reach walking controls.
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  dialog.addEventListener('keyup', event => event.stopPropagation());
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => { if (!dialog.open) finishClose(); });
  render();
  return { open, close, get isOpen() { return dialog.open; } };
}
