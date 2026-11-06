import {effectiveProfileId} from './account-sessions.js';
import {configuredOwnerId} from './owner-privileges.js';

export const ADMIN_HEADERS = {'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
export async function isAdmin(request,env,accounts) {
  const owner=configuredOwnerId(env.FAB_OWNER_VISITOR_ID);
  return Boolean(owner && await effectiveProfileId(request,env,accounts)===owner);
}
export function metricExclusions(env) {
  return (env.FAB_METRICS_EXCLUDED_IDS||'').split(',').map(value=>configuredOwnerId(value.trim())).filter(Boolean);
}
export function adminDenied() {
  return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FAB 운영자 전용</title><main style="max-width:36rem;margin:12vh auto;padding:24px;font-family:system-ui;color:#24535b"><h1>운영자 전용 페이지예요</h1><p>FAB짱 세미로 게임에 접속한 브라우저에서 다시 열어 주세요.</p><p>인스타 앱과 Safari의 계정은 서로 다를 수 있어요.</p><a href="/">게임으로 돌아가기</a></main></html>',{status:403,headers:{...ADMIN_HEADERS,'Content-Type':'text/html; charset=utf-8'}});
}
