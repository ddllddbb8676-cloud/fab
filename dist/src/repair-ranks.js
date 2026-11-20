// Derived from the existing lifetime repair count; never persisted as authority.
export const REPAIR_RANKS = Object.freeze([
  [0,'인턴'],[20,'사원'],[100,'선임'],[250,'대리'],[500,'책임'],
  [1000,'수석'],[2000,'팀장'],[4000,'상무'],[6000,'전무'],
  [10000,'부사장'],[20000,'사장'],
].map(([count,name])=>Object.freeze({count,name})));
export const CHAIRMAN_RANK = Object.freeze({name:'회장'});
export const repairCount = value=>Number.isSafeInteger(value)&&value>=0?value:0;
// operator must come from the server's authenticated title state, never a name.
export function repairRank(count,operator=false){
  return operator===true?CHAIRMAN_RANK:REPAIR_RANKS.findLast(rank=>rank.count<=repairCount(count));
}
export function nextRepairRank(count){return REPAIR_RANKS.find(rank=>rank.count>repairCount(count))??null;}
