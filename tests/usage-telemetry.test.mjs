import test from 'node:test';
import assert from 'node:assert/strict';
import {createUsageTelemetry, getUsageTelemetry, startUsageTelemetry} from '../src/usage-telemetry.js';

const pageId = '12345678-1234-4234-8234-123456789abc';
const microtasks = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function harness({fetcher, href = 'https://fab.semitoon.com/?utm_source=Instagram&utm_campaign=reel_3', referrer = ''} = {}) {
  let time = 100, next = 0;
  const timers = new Map(), calls = [], window = new EventTarget(), document = new EventTarget();
  document.hidden = false;
  document.referrer = referrer;
  const schedule = (callback, delay) => { const id = ++next; timers.set(id, {callback, at:time + delay}); return id; };
  const cancel = id => timers.delete(id);
  const options = {window, document, location:{href}, now:() => time, schedule, cancel,
    makePageId:() => pageId, entry:'/src/main.js?v=abc123def456', fetcher:(url, request) => {
      calls.push({url, request, body:JSON.parse(request.body)});
      return fetcher ? fetcher(url, request, calls.length) : Promise.resolve({ok:true});
    }};
  const telemetry = createUsageTelemetry(options);
  const dispatch = (target, type, fields = {}) => target.dispatchEvent(Object.assign(new Event(type), fields));
  async function advance(ms) {
    await microtasks();
    const end = time + ms;
    for (;;) {
      const entry = [...timers].filter(([, timer]) => timer.at <= end).sort((a,b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      timers.delete(entry[0]); time = entry[1].at; entry[1].callback(); await microtasks();
    }
    time = end;
    await microtasks();
  }
  return {telemetry, options, calls, window, document, dispatch, advance, stop:() => telemetry.dispose()};
}

test('startup queues safely until the session is ready and sends only bounded attribution', async () => {
  const h = harness();
  try {
    h.dispatch(h.document, 'fab-startup', {detail:'ready'});
    h.telemetry.connected({unlimitedChips:false});
    await h.advance(5000); assert.equal(h.calls.length, 0);
    h.telemetry.sessionReady(); await h.advance(1500);
    assert.equal(h.calls.length, 1);
    const {body, request} = h.calls[0];
    assert.deepEqual(body.events.map(e => e.kind), ['page_start', 'scene_ready', 'connected']);
    assert.equal(request.keepalive, true); assert.equal(request.credentials, 'same-origin');
    for (const [index, event] of body.events.entries()) {
      assert.equal(event.id, pageId + ':' + (index + 1)); assert.equal(event.pageId, pageId);
      assert.equal(event.source, 'instagram--reel_3'); assert.equal(event.build, 'abc123def456');
      assert.equal(event.elapsedMs, 100);
      assert.deepEqual(Object.keys(event).sort(), ['build','elapsedMs','id','kind','pageId','source']);
    }
    h.telemetry.connected({}); h.dispatch(h.document, 'fab-startup', {detail:'ready'});
    await h.advance(20000); assert.equal(h.calls.length, 1, 'startup conversion events are once per document');
  } finally { h.stop(); }
});

test('offline event floods remain bounded and retain the initial page event', async () => {
  const h = harness();
  try {
    for (let i = 0; i < 1000; i++) h.telemetry.record('try_on', {itemId:'suit-blue'});
    h.telemetry.record('try_on', {itemId:'https://private.example/person'});
    h.telemetry.record('purchase', {itemId:'suit-green'});
    h.telemetry.sessionReady(); await h.advance(1500 + 20000 * 6);
    const events = h.calls.flatMap(call => call.body.events);
    assert.equal(events.length, 60); assert.equal(events[0].kind, 'page_start');
    assert.equal(new Set(events.map(e => e.id)).size, 60);
    for (const call of h.calls) {
      assert.ok(call.body.events.length <= 12);
      assert.ok(Buffer.byteLength(call.request.body, 'utf8') <= 8192);
    }
    assert.ok(events.slice(1).every(event => event.kind === 'try_on' && event.itemId === 'suit-blue'));
  } finally { h.stop(); }
});

test('a lost telemetry response retries the exact event IDs and stops after three failures', async () => {
  const h = harness({fetcher:() => Promise.reject(Error('network failed'))});
  try {
    h.telemetry.sessionReady(); await h.advance(1500 + 1000 + 2000 + 30000);
    assert.equal(h.calls.length, 3);
    assert.equal(h.calls[0].request.body, h.calls[1].request.body);
    assert.equal(h.calls[1].request.body, h.calls[2].request.body);
    h.telemetry.record('shop_open'); await h.advance(20000);
    assert.equal(h.calls.length, 4, 'later independent events still work after a dropped batch');
  } finally { h.stop(); }
});

test('a fetch that never settles times out and cannot hold the queue indefinitely', async () => {
  const h = harness({fetcher:() => new Promise(() => {})});
  try {
    h.telemetry.sessionReady(); await h.advance(24000);
    assert.equal(h.calls.length, 3);
    assert.ok(h.calls.every(call => call.request.signal.aborted));
    h.telemetry.record('shop_open'); h.telemetry.flush(); await microtasks();
    assert.equal(h.calls.length, 4);
  } finally { h.stop(); }
});

test('visibility flushes immediately and pagehide sends its exit even with another request pending', async () => {
  const h = harness({fetcher:() => new Promise(() => {})});
  try {
    h.telemetry.sessionReady(); h.document.hidden = true;
    h.dispatch(h.document, 'visibilitychange'); await microtasks();
    assert.equal(h.calls.length, 1);
    h.telemetry.record('shop_open'); h.dispatch(h.window, 'pagehide'); await microtasks();
    assert.equal(h.calls.length, 2);
    assert.ok(h.calls[1].body.events.some(event => event.kind === 'page_end'));
    assert.equal(h.calls[1].body.events.filter(e => e.kind === 'page_start')[0].id, h.calls[0].body.events[0].id);
    assert.equal(h.calls[1].request.keepalive, true);
    h.dispatch(h.window, 'pagehide'); await microtasks(); assert.equal(h.calls.length, 2);
  } finally { h.stop(); }
});

test('owner recognition drops queued events and cancels retries', async () => {
  const h = harness({fetcher:() => Promise.reject(Error('offline'))});
  try {
    h.telemetry.sessionReady(); await h.advance(1500);
    h.telemetry.connected({unlimitedChips:true});
    h.telemetry.record('shop_open'); h.dispatch(h.window, 'pagehide'); await h.advance(60000);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].request.signal.aborted, true);
  } finally { h.stop(); }
});

test('connection interruptions deduplicate repeated statuses and exclude ordinary tab retirement', async () => {
  const h = harness();
  try {
    for (const status of ['connecting','reconnecting','reconnecting','connecting','reconnecting','connected','replaced','suspended','resetting','connecting','reconnecting']) h.telemetry.connectionStatus(status);
    h.telemetry.connected({}); h.telemetry.connected({}); h.telemetry.sessionReady(); await h.advance(1500);
    const kinds = h.calls.flatMap(c => c.body.events.map(e => e.kind));
    assert.equal(kinds.filter(k => k === 'reconnect').length, 3);
    assert.equal(kinds.filter(k => k === 'connect_error').length, 2);
    assert.equal(kinds.filter(k => k === 'connected').length, 1);
  } finally { h.stop(); }
});

test('error reporting sends counts without messages, stacks, query strings or unknown referrers', async () => {
  const secret = 'PRIVATE-NAME-AND-TOKEN';
  const h = harness({href:'https://fab.semitoon.com/?utm_source=' + encodeURIComponent('https://private.example/' + secret), referrer:'https://private.example/' + secret});
  try {
    h.dispatch(h.window, 'error', {filename:'https://instagram.com/injected.js', message:secret});
    for (let i = 0; i < 15; i++) h.dispatch(h.window, 'error', {filename:'https://fab.semitoon.com/src/main.js?private=' + secret, message:secret});
    h.dispatch(h.window, 'unhandledrejection', {reason:{stack:secret + '\n at https://fab.semitoon.com/src/main.js:1:1'}});
    h.telemetry.sessionReady(); await h.advance(1500);
    const body = h.calls[0].request.body;
    assert.equal(body.includes(secret), false); assert.equal(body.includes('https:'), false);
    assert.equal(h.calls[0].body.events.filter(e => e.kind === 'client_error').length, 5);
    assert.ok(h.calls[0].body.events.every(e => e.source === 'external'));
  } finally { h.stop(); }
});

test('missing browser APIs, hostile event values and synchronous fetch failures never escape into the game', async () => {
  assert.doesNotThrow(() => getUsageTelemetry().record('page_start'));
  assert.doesNotThrow(() => startUsageTelemetry().sessionReady());
  const disabled = createUsageTelemetry({makePageId:() => { throw Error('crypto unavailable'); }});
  assert.doesNotThrow(() => disabled.record('scene_ready'));
  const h = harness({fetcher:() => { throw Error('fetch unavailable'); }});
  try {
    assert.doesNotThrow(() => h.telemetry.record('try_on', null));
    assert.doesNotThrow(() => h.telemetry.connected({get unlimitedChips() { throw Error('host getter'); }}));
    h.telemetry.sessionReady(); await h.advance(10000);
    assert.equal(h.calls.length, 3);
  } finally { h.stop(); }
});
