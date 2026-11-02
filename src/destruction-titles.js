// Titles are earned from the existing lifetime equipment-destruction counter.
// Selection never spends chips or changes that counter.
export const DESTRUCTION_TITLES = Object.freeze([
  {id:'break-1', count:1, name:'새싹 파괴자', color:'#4b5963'},
  {id:'break-5', count:5, name:'꼬마 사고뭉치', color:'#277044'},
  {id:'break-20', count:20, name:'버튼 장인', color:'#205fa8'},
  {id:'break-50', count:50, name:'사고 대장', color:'#334a8b'},
  {id:'break-100', count:100, name:'장비의 천적', color:'#7442a6'},
  {id:'break-300', count:300, name:'라인 파괴자', color:'#b42c75'},
  {id:'break-500', count:500, name:'팹의 재앙', color:'#a64b17'},
  {id:'break-1000', count:1000, name:'전설의 파괴왕', color:'#886015'},
  {id:'break-3000', count:3000, name:'FAB 파괴신', color:'#b5253c'},
].map(Object.freeze));
export const OPERATOR_TITLE = Object.freeze({id:'operator', name:'운영자', color:'#b02d78'});
const titles = new Map([...DESTRUCTION_TITLES, OPERATOR_TITLE].map(title=>[title.id,title]));
export const findTitle = id => titles.get(id) ?? null;
export const destructionCount = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
export function canSelectTitle(preference, brokenCount) {
  if(preference==='auto'||preference==='hidden')return true;
  return DESTRUCTION_TITLES.some(title=>title.id===preference&&title.count<=destructionCount(brokenCount));
}
export const restoreTitlePreference = (preference, brokenCount) => canSelectTitle(preference,brokenCount)?preference:'auto';
export function destructionTitle(brokenCount, preference='auto') {
  preference=restoreTitlePreference(preference,brokenCount);
  if(preference==='hidden')return null;
  if(preference!=='auto')return findTitle(preference);
  return DESTRUCTION_TITLES.findLast(title=>title.count<=destructionCount(brokenCount))??null;
}

// NPCs wear one fixed, modest title. Their score/ranking is not modified.
export function npcDestructionTitle(id, role) {
  const match=/^(resident|safety):(\d+)$/.exec(id??'');if(!match)return null;
  const choices=role==='breaker'?[2,3,4]:role==='thrower'?[1,2]:role==='rider'?[0,2]:[0,1];
  return DESTRUCTION_TITLES[choices[Number(match[2])%choices.length]];
}
