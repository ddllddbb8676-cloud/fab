import {readSpeech, SPEECH_DURATION_MS} from '../src/owner-speech.js';

// Every published revision contains all current speakers so even a coalesced
// HTTP frame can replace the previous state. Nothing here belongs in a save.
export function createRoomSpeech(ownerId, now) {
  const active = new Map();
  let revision = 0, broadcastRevision = 0, ownerRevision = 0;
  function changed(id) {
    revision++;
    if (id === ownerId) ownerRevision = revision;
    return revision;
  }
  function leave(id) {
    if (active.delete(id)) changed(id);
  }
  function send(actor, value) {
    if (actor.hidden) return {ok:false, message:'팹에 입장한 뒤 말풍선을 보내 주세요.'};
    const parsed = readSpeech(value);
    if (!parsed.ok) return {ok:false, message:parsed.message};
    active.set(actor.id, {speaker:actor.id, text:parsed.text, expiresAt:now()+SPEECH_DURATION_MS, revision:changed(actor.id)});
    return {ok:true};
  }
  function snapshot(full) {
    const at = now();
    for (const [id, bubble] of active) if (at >= bubble.expiresAt) leave(id);
    if (!revision || (!full && broadcastRevision === revision)) return undefined;
    const packet = {speech:{revision, bubbles:[...active.values()]}};
    // Clients open before this release still understand the operator's bubble.
    if (ownerRevision && (full || ownerRevision > broadcastRevision)) {
      packet.ownerSpeech = active.get(ownerId) ?? {revision:ownerRevision};
    }
    if (!full) broadcastRevision = revision;
    return packet;
  }
  return {send, snapshot, leave};
}
