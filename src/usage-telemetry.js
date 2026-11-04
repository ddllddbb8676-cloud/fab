const KINDS = new Set(['page_start', 'scene_ready', 'connected', 'reconnect', 'connect_error', 'page_end', 'shop_open', 'try_on', 'client_error']);
const IMPORTANT = new Set(['page_start', 'scene_ready', 'connected', 'connect_error', 'page_end']);
const MAX_EVENTS = 60, BATCH_SIZE = 12, MAX_BYTES = 8192;
const NOOP = Object.freeze({record() {}, sessionReady() {}, connected() {}, connectionStatus() {}, flush() {}, suppress() {}, dispose() {}});

function sourceLabel(location, document) {
  const slug = value => /^[a-z0-9_-]{1,48}$/i.test(value || '') ? value.toLowerCase() : '';
  const url = new URL(location.href);
  const source = slug(url.searchParams.get('utm_source'));
  const campaign = slug(url.searchParams.get('utm_campaign'));
  if (source || campaign) return [source, campaign].filter(Boolean).join('--').slice(0, 48);
  if (!document.referrer) return 'direct';
  try {
    const host = new URL(document.referrer).hostname.toLowerCase();
    for (const name of ['instagram', 'facebook', 'google', 'naver', 'youtube', 'kakao']) {
      if (host === name + '.com' || host.endsWith('.' + name + '.com')) return name;
    }
    return host === url.hostname ? 'direct' : 'external';
  } catch { return 'external'; }
}

// Each document has an independent queue. IDs survive request retries so the
// server can deduplicate an accepted request whose response never arrived.
export function createUsageTelemetry({window = globalThis.window, document = globalThis.document,
  location = globalThis.location, fetcher = (...args) => globalThis.fetch(...args),
  now = () => performance.now(), makePageId = () => crypto.randomUUID(),
  schedule = setTimeout, cancel = clearTimeout, build = 'unknown', entry} = {}) {
  try {
    const pageId = makePageId();
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(pageId)) return NOOP;
    const source = sourceLabel(location, document);
    if (entry) { try { build = new URL(entry, location.href).searchParams.get('v'); } catch {} }
    build = /^[a-f0-9]{12,64}$/i.test(build) ? build.toLowerCase() : 'unknown';
    let queue = [], flight = null, timer = null, timerAt = Infinity;
    let ready = false, stopped = false, sequence = 0, firstConnected = false;
    let lastStatus = '', connectionTrouble = false, ended = false, errors = 0;
    const once = new Set();

    function clearTimer() {
      if (timer !== null) cancel(timer);
      timer = null;
      timerAt = Infinity;
    }
    function later(delay) {
      if (stopped || !ready || flight || !queue.length) return;
      const due = now() + delay;
      if (timer !== null && timerAt <= due) return;
      clearTimer();
      timerAt = due;
      timer = schedule(() => { timer = null; timerAt = Infinity; safeFlush(); }, delay);
    }
    function record(kind, details = {}) {
      if (stopped || !KINDS.has(kind)) return;
      if (['page_start', 'scene_ready', 'connected', 'page_end'].includes(kind)) {
        if (once.has(kind)) return;
        once.add(kind);
      }
      if (kind === 'client_error' && errors++ >= 5) return;
      const elapsed = now();
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 86400000) return;
      const itemId = kind === 'try_on' && /^[a-z0-9-]{1,64}$/.test(details.itemId || '') ? details.itemId : undefined;
      if (kind === 'try_on' && !itemId) return;
      if (queue.length + (flight?.events.length || 0) >= MAX_EVENTS) {
        const replaceable = queue.findIndex(event => !IMPORTANT.has(event.kind));
        if (replaceable < 0) return;
        queue.splice(replaceable, 1);
      }
      queue.push({id:pageId + ':' + ++sequence, pageId, kind, elapsedMs:Math.round(elapsed),
        ...(itemId ? {itemId} : {}), source, build});
      later(IMPORTANT.has(kind) ? 1500 : 20000);
    }
    function finish(batch, failed) {
      if (stopped || flight !== batch) return;
      cancel(batch.timeout);
      if (failed && batch.attempts < 3) {
        batch.retry = schedule(() => { batch.retry = null; try { send(batch); } catch {} }, 1000 * batch.attempts);
        return;
      }
      flight = null;
      later(document.hidden ? 0 : queue.some(event => IMPORTANT.has(event.kind)) ? 1500 : 20000);
    }
    function send(batch) {
      if (stopped || flight !== batch) return;
      batch.attempts++;
      const controller = new AbortController();
      batch.controller = controller;
      let completed = false;
      const complete = failed => {
        if (completed) return;
        completed = true;
        try { finish(batch, failed); } catch { flight = null; }
      };
      // A telemetry request must release its queue even if a browser delays
      // fetch's own rejection. Its lifetime is independent of game startup.
      batch.timeout = schedule(() => { controller.abort(); complete(true); }, 6000);
      Promise.resolve().then(() => {
        if (stopped || controller.signal.aborted) return null;
        return fetcher('/api/telemetry', {method:'POST', credentials:'same-origin', cache:'no-store', keepalive:true,
          headers:{'Content-Type':'application/json'}, body:batch.body, signal:controller.signal});
      }).then(response => complete(!response?.ok), () => complete(true));
    }
    function flush() {
      if (stopped || !ready) return;
      clearTimer();
      if (flight) {
        if (flight.retry !== null) {
          cancel(flight.retry); flight.retry = null; send(flight);
        }
        return;
      }
      const events = [];
      while (queue.length && events.length < BATCH_SIZE) {
        const next = queue[0];
        // All accepted fields use ASCII, so string length equals UTF-8 bytes.
        if (JSON.stringify({events:[...events, next]}).length > MAX_BYTES) break;
        events.push(queue.shift());
      }
      if (!events.length) return;
      flight = {events, body:JSON.stringify({events}), attempts:0, retry:null, timeout:null, controller:null};
      send(flight);
    }
    function fromGameFile(value) {
      if (typeof value !== 'string') return false;
      try {
        const url = new URL(value, location.href);
        return url.origin === new URL(location.href).origin && /^\/(src|vendor|node_modules)\//.test(url.pathname);
      } catch { return false; }
    }
    const onStage = event => { if (event.detail === 'ready') safeRecord('scene_ready'); };
    const onStartupError = () => safeRecord('client_error');
    const onError = event => { if (fromGameFile(event.filename)) safeRecord('client_error'); };
    const onRejection = event => {
      try {
        const stack = event.reason?.stack;
        if (typeof stack === 'string' && stack.slice(0, 4000).split(/\s+/).some(part => fromGameFile(part.replace(/[()]/g, '')))) safeRecord('client_error');
      } catch {}
    };
    const onVisibility = () => { if (document.hidden) safeFlush(); };
    const onPageHide = () => {
      try {
        if (stopped || ended) return;
        ended = true; record('page_end');
        if (!ready) return;
        // A prior request may outlive this document. Send the exit immediately
        // with existing IDs; the server deduplicates any overlapping delivery.
        const pending = [...queue.filter(event => IMPORTANT.has(event.kind)), ...(flight?.events || []), ...queue];
        const events = [...new Map(pending.map(event => [event.id, event])).values()].slice(0, BATCH_SIZE)
          .sort((a, b) => Number(a.id.split(':')[1]) - Number(b.id.split(':')[1]));
        const body = JSON.stringify({events});
        if (body.length <= MAX_BYTES) {
          void Promise.resolve(fetcher('/api/telemetry', {method:'POST', credentials:'same-origin',
            cache:'no-store', keepalive:true, headers:{'Content-Type':'application/json'}, body})).catch(() => {});
        }
      } catch {}
    };
    function stop() {
      stopped = true;
      queue = [];
      clearTimer();
      if (flight) {
        cancel(flight.timeout); cancel(flight.retry); flight.controller?.abort(); flight = null;
      }
      document.removeEventListener('fab-startup', onStage);
      document.removeEventListener('fab-startup-error', onStartupError);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('pagehide', onPageHide);
    }
    function safeRecord(...args) { try { record(...args); } catch {} }
    function safeFlush() { try { flush(); } catch {} }
    const api = {
      record:safeRecord,
      sessionReady() { try { if (stopped || ready) return; ready = true; later(document.hidden ? 0 : 1500); } catch {} },
      connected(privileges) {
        try {
          if (privileges?.unlimitedChips === true) { stop(); return; }
          connectionTrouble = false;
          if (!firstConnected) { firstConnected = true; record('connected'); }
        } catch {}
      },
      connectionStatus(status) {
        try {
          if (stopped || status === lastStatus) return;
          lastStatus = status;
          if (status === 'connected') connectionTrouble = false;
          if (status === 'reconnecting') record('reconnect');
          if (['reconnecting', 'full', 'version'].includes(status) && !connectionTrouble) {
            connectionTrouble = true; record('connect_error');
          }
        } catch {}
      },
      flush:safeFlush, suppress() { try { stop(); } catch {} }, dispose() { try { stop(); } catch {} }
    };
    document.addEventListener('fab-startup', onStage);
    document.addEventListener('fab-startup-error', onStartupError);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('pagehide', onPageHide);
    safeRecord('page_start');
    return api;
  } catch { return NOOP; }
}

export function startUsageTelemetry(options = {}) {
  try { return window.__fabTelemetry ||= createUsageTelemetry(options); }
  catch { return NOOP; }
}

export function getUsageTelemetry() {
  try { return window.__fabTelemetry || NOOP; }
  catch { return NOOP; }
}
