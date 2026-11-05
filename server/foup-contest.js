import {CONTEST_RULES as rules, contestZone} from '../src/foup-contest.js';

const visitor = /^visitor:[a-f0-9]{64}$/;
const carrier = /^(port:\d{1,3}:\d|vehicle:\d{1,2})$/;
const side = index => index % 2 ? 'black' : 'white';
const deny = message => ({ok:false, message});

export function createFoupContest({now, ownerId, ready, gather, rosterChanged, award, onChange}) {
  let match = null;
  const live = () => match?.phase === 'recruiting' || match?.phase === 'active';
  function team(id) {
    if (!live()) return null;
    const index = match.members.indexOf(id);
    if (index >= 0) return side(index);
    return ownerId && id === ownerId ? 'referee' : null;
  }
  function start(at) {
    const startsAt = at + rules.recruitMs;
    match = {id:'contest:'+at, phase:'recruiting', startsAt, endsAt:startsAt+rules.playMs,
      members:[], balls:{}, black:0, white:0};
    rosterChanged();
    return match;
  }
  function join(id, eventId) {
    if (!match || match.id !== eventId || match.phase !== 'recruiting' || now() >= match.startsAt)
      return deny('이번 경기의 참가 모집이 끝났어요.');
    if (!visitor.test(id) || !ready(id)) return deny('팹에 입장한 뒤 참가해 주세요.');
    if (id === ownerId) return deny('세미의 팀은 참가 모집이 끝나면 정해져요.');
    if (!match.members.includes(id)) {
      match.members.push(id);
      gather(id, match.members.length-1, match.id+':lobby');
      rosterChanged();
      onChange();
    }
    return {ok:true, team:team(id)};
  }
  function cancel(at, reason) {
    Object.assign(match, {phase:'cancelled', finishedAt:at, reason});
    rosterChanged(match.members);
    onChange();
  }
  function tick(at) {
    if (match?.phase === 'recruiting' && at >= match.startsAt) {
      if (at >= match.endsAt) return cancel(at, '모집 시간이 지나 이번 경기는 마쳤어요.');
      match.members = match.members.filter(ready);
      if (!match.members.length) return cancel(at, '참가자가 없어 이번 경기는 쉬어요.');
      if (match.members.length % 2) {
        if (!ownerId || !ready(ownerId)) return cancel(at, '홀수 팀을 맞추려면 세미가 팹 안에 있어야 해요.');
        match.members.push(ownerId);
      }
      match.phase = 'active';
      match.members.forEach((id, index) => gather(id, index, match.id+':start'));
      rosterChanged();
      onChange();
    }
    if (match?.phase === 'active' && at >= match.endsAt) {
      const winner = match.black === match.white ? 'tie' : match.black > match.white ? 'black' : 'white';
      Object.assign(match, {phase:'finished', finishedAt:match.endsAt, winner});
      match.members.forEach((id, index) => {
        const colour = side(index);
        const rate = winner === 'tie' ? rules.tie : winner === colour ? rules.win : rules.lose;
        award(id, match[colour] * rate, match.id);
      });
      rosterChanged(match.members);
      onChange();
    }
  }
  const playing = id => match?.phase === 'active' && now() < match.endsAt && match.members.includes(id);
  function track(id, record) {
    if (!playing(id) || record.gold) return false;
    if (!Object.hasOwn(match.balls, record.id)) {
      match.balls[record.id] = null;
      onChange();
    }
    return true;
  }
  function moved(record) {
    if (match?.phase !== 'active' || !Object.hasOwn(match.balls, record.id) || now() >= match.endsAt) return;
    const before = match.balls[record.id];
    const after = record.mode === 'ground' ? contestZone(record.x, record.z) : null;
    if (before === after) return;
    if (before) match[before]--;
    if (after) match[after]++;
    match.balls[record.id] = after;
    onChange();
  }
  function view(at) {
    if (!match || (!live() && at >= match.finishedAt+rules.resultMs)) return null;
    const {id, phase, startsAt, endsAt, black, white, winner, reason} = match;
    return {id, phase, startsAt, endsAt, black, white, winner, reason, joined:match.members.length};
  }
  function restore(saved) {
    if (!saved) { match = null; return; }
    const valid = saved.id === 'contest:'+(saved.startsAt-rules.recruitMs) &&
      Number.isFinite(saved.startsAt) && saved.endsAt-saved.startsAt === rules.playMs &&
      ['recruiting','active','finished','cancelled'].includes(saved.phase) &&
      Array.isArray(saved.members) && saved.members.length <= 101 && saved.members.every(id=>visitor.test(id)) &&
      new Set(saved.members).size === saved.members.length && saved.balls && typeof saved.balls === 'object' && !Array.isArray(saved.balls);
    if (!valid) throw Error('Invalid FOUP contest checkpoint');
    const entries = Object.entries(saved.balls);
    if (entries.length > 1200 || entries.some(([id,t])=>!carrier.test(id) || ![null,'black','white'].includes(t)) ||
        ['black','white'].some(t=>saved[t] !== entries.filter(([,v])=>v===t).length) ||
        (['finished','cancelled'].includes(saved.phase) && !Number.isFinite(saved.finishedAt)))
      throw Error('Invalid FOUP contest score');
    match = structuredClone(saved);
  }
  return {start, join, tick, live, team, playing, moved, track, view, restore,
    hasMember:id=>live() && match.members.includes(id),
    protects:id=>match?.phase === 'active' && Object.hasOwn(match.balls, id),
    reconcile:records=>{if(match?.phase==='active')for(const id of Object.keys(match.balls)){const r=records.get(id);if(r)moved(r);}},
    checkpoint:()=>match};
}
