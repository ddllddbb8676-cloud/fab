import {hasUnlimitedChips} from './owner-privileges.js';
import {readSpeech, SPEECH_DURATION_MS} from '../src/owner-speech.js';

// Room memory only. Full snapshots include the current bubble; ordinary frames
// carry each change once and never consume a change meant for the other peers.
export function createOwnerSpeech(ownerId, now) {
  let active = null, revision = 0, broadcastRevision = 0;
  function clear() {
    if (active) { active = null; revision++; }
  }
  function send(actor, value) {
    if (!hasUnlimitedChips(actor.id, ownerId)) return {ok:false, message:'운영자만 말풍선을 보낼 수 있어요.'};
    if (actor.hidden) return {ok:false, message:'팹에 입장한 뒤 말풍선을 보내 주세요.'};
    const parsed = readSpeech(value);
    if (!parsed.ok) return {ok:false, message:parsed.message};
    active = {speaker:actor.id, text:parsed.text, expiresAt:now()+SPEECH_DURATION_MS, revision:++revision};
    return {ok:true};
  }
  function snapshot(full) {
    if (active && now() >= active.expiresAt) clear();
    if (!revision || (!full && broadcastRevision === revision)) return undefined;
    if (!full) broadcastRevision = revision;
    return active ? {...active} : {revision};
  }
  return {send, snapshot, leave(id){if(active?.speaker===id)clear();}};
}
