// Only the Google account screen needs Google's keys. Guest entry does no network I/O here.
const jwksUrl = 'https://www.googleapis.com/oauth2/v3/certs';
const encoder = new TextEncoder();
export const validClientId = value => typeof value === 'string' && /^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(value);
export const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');

function decode(value) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('token');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
}
export function googleVerifier({getKeys = () => fetch(jwksUrl, {signal:AbortSignal.timeout(5000)}), clock = Date.now} = {}) {
  let cache, inflight;
  async function fetchKeys() {
    const response = await getKeys();
    if (!response.ok) throw Error('keys');
    const {keys} = await response.json();
    if (!Array.isArray(keys) || !keys.length) throw Error('keys');
    const age = Number(response.headers.get('Age')) || 0;
    const maxAge = Number(response.headers.get('Cache-Control')?.match(/max-age=(\d+)/i)?.[1] ?? 300);
    cache = {keys, expires:clock() + Math.max(10, Math.min(86400, maxAge-age))*1000, refreshed:clock()};
    return cache;
  }
  function refresh() {
    return inflight ??= fetchKeys().finally(() => { inflight = null; });
  }
  return async function verify(token, clientId) {
    if (!validClientId(clientId) || typeof token !== 'string' || token.length > 8192) throw Error('token');
    const parts = token.split('.');
    if (parts.length !== 3) throw Error('token');
    const json = part => JSON.parse(new TextDecoder().decode(decode(part)));
    const header = json(parts[0]), claims = json(parts[1]), now = clock()/1000;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 128 ||
        !['accounts.google.com','https://accounts.google.com'].includes(claims.iss) ||
        claims.aud !== clientId || (claims.azp !== undefined && claims.azp !== clientId) ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= now || !Number.isSafeInteger(claims.iat) ||
        claims.iat > now+60 || claims.iat < now-3660 || claims.iat >= claims.exp ||
        typeof claims.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(claims.sub) ||
        typeof claims.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(claims.nonce)) throw Error('token');
    if (!cache || cache.expires <= clock()) await refresh();
    const find = () => cache.keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256'));
    if (!find() && clock()-cache.refreshed > 60000) await refresh();
    const jwk = find();
    if (!jwk) throw Error('token');
    const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), encoder.encode(parts[0]+'.'+parts[1]))) throw Error('token');
    const email = claims.email_verified === true && typeof claims.email === 'string' && claims.email.length <= 254 ? claims.email : '';
    const hint = email.replace(/^([^@])[^@]*(@[^@]+)$/, '$1•••$2');
    return {subject:await digest('google-sub-v1:'+claims.sub), nonce:claims.nonce, hint:hint !== email ? hint : ''};
  };
}
