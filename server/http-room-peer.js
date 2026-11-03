// A short-lived HTTP connection to the same room. Keep delivered messages until
// the client acknowledges their cursor, so a lost HTTP response can be retried.
const MAX_ROWS = 96, MAX_BYTES = 1024 * 1024;
export const HTTP_IDLE_MS = 18000;
export const validRoomKey = key => typeof key === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);

export function connectionOrder(value, now = Date.now()) {
  if (value == null) return null; // Existing WebSocket clients.
  if (typeof value !== 'number' && !(typeof value === 'string' && /^[0-9]{1,16}$/.test(value))) return NaN;
  const order = Number(value);
  return Number.isSafeInteger(order) && order > 0 && order <= (now + 120000) * 1000 ? order : NaN;
}

export async function readRoomBody(request) {
  const limit = 16384;
  if (Number(request.headers.get('content-length')) > limit) return {status:413};
  const reader = request.body?.getReader();
  if (!reader) return {status:400};
  let size = 0, text = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return {status:413}; }
      text += decoder.decode(value,{stream:true});
    }
    const body = JSON.parse(text + decoder.decode());
    if (!validRoomKey(body?.key) || !['open','poll','close'].includes(body.op)) return {status:400};
    const cursor = body.cursor ?? 0, messages = body.messages ?? [];
    if (!Number.isSafeInteger(cursor) || cursor < 0 || !Array.isArray(messages) || messages.length > 16) return {status:400};
    if (body.op !== 'poll' && messages.length) return {status:400};
    const order = connectionOrder(body.order);
    if (body.op === 'open' && !order) return {status:400};
    const inputs = [];
    for (const item of messages) {
      const raw = typeof item === 'string' ? item : JSON.stringify(item);
      if (raw.length > 2048) return {status:413};
      const message = JSON.parse(raw);
      if (message?.type === 'pose') {
        if (inputs.at(-1)?.type === 'pose') inputs.pop();
      } else if (!(message?.type === 'command' && Number.isSafeInteger(message.seq) && message.seq > 0 && typeof message.kind === 'string')) return {status:400};
      inputs.push({type:message.type,seq:message.seq,raw});
    }
    return {body:{op:body.op,key:body.key,cursor,order,inputs}};
  } catch { return {status:400}; }
}

function mergeFrames(first,second) {
  const older = JSON.parse(first), newer = JSON.parse(second);
  const foups = new Map();
  for (const row of [...(older.foups || []), ...(newer.foups || [])]) foups.set(row[0],row);
  return JSON.stringify({...older,...newer,foups:[...foups.values()],events:[...(older.events || []), ...(newer.events || [])].slice(-100)});
}

export class HttpRoomPeer {
  constructor() {
    this.rows = [];
    this.bytes = 0;
    this.cursor = 0;
    this.delivered = 0;
    this.acked = 0;
    this.lastCommand = 0;
    this.status = 0;
    this.lastPoll = this.windowStart = Date.now();
    this.polls = 0;
  }
  send(raw) {
    if (this.status) throw new Error('HTTP peer closed');
    const previous = this.rows.at(-1);
    // Only an undelivered frame can be changed. A lost response must replay
    // the exact same cursors and raw messages, including durable command acks.
    if (previous && previous[0] > this.delivered && previous[1].startsWith('{"type":"frame",') && raw.startsWith('{"type":"frame",')) {
      raw = mergeFrames(previous[1],raw);
      this.bytes -= previous[1].length * 2;
      this.rows.pop();
      this.cursor--;
    }
    this.rows.push([++this.cursor,raw]);
    this.bytes += raw.length * 2;
    if (this.rows.length > MAX_ROWS || this.bytes > MAX_BYTES) { this.close(1013); throw new Error('HTTP replay limit'); }
  }
  close(code) {
    if (this.status) return;
    this.status = code === 4001 ? 409 : 410;
    this.closedAt = Date.now();
    this.rows.length = 0;
    this.bytes = 0;
  }
  acknowledge(cursor) {
    if (cursor < this.acked || cursor > this.delivered) return false;
    this.acked = cursor;
    while (this.rows.length && this.rows[0][0] <= cursor) this.bytes -= this.rows.shift()[1].length * 2;
    return true;
  }
  delivery() {
    this.delivered = this.cursor;
    return {messages:this.rows.slice()};
  }
  allowPoll(now) {
    if (now - this.windowStart >= 1000) { this.windowStart = now; this.polls = 0; }
    this.lastPoll = now;
    return ++this.polls <= 16;
  }
}
