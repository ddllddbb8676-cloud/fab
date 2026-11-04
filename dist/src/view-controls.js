// Keep the scene clear: one menu, with the map shown only on request.
// Photo mode hides HUD only. The world/network keep running, and the tap that
// returns to play is consumed instead of also walking or pressing equipment.
export function createPhotoMode({button,onToggle=()=>{},canOpen=()=>true,document=globalThis.document}={}){
  const exit=document.createElement('button');exit.id='photo-exit';exit.type='button';exit.hidden=true;exit.setAttribute('aria-label','사진모드 종료: 화면 한 번 누르기 또는 Escape');
  const hint=document.createElement('div');hint.id='photo-hint';hint.hidden=true;hint.setAttribute('role','status');hint.textContent='사진모드 · 화면을 한 번 누르면 돌아와요';
  document.body.append(exit,hint);let active=false,timer,restore=[];
  function close(){if(!active)return;active=false;clearTimeout(timer);document.body.classList.remove('photo-mode');exit.hidden=hint.hidden=true;for(const [element,inert] of restore)element.inert=inert;restore=[];button.setAttribute('aria-pressed','false');onToggle(false);button.focus({preventScroll:true});}
  function open(){if(active||!canOpen())return false;onToggle(true);active=true;document.body.classList.add('photo-mode');restore=[...document.body.children].filter(el=>el!==exit&&el!==hint).map(el=>[el,el.inert]);for(const [el] of restore)el.inert=true;exit.hidden=hint.hidden=false;button.setAttribute('aria-pressed','true');exit.focus({preventScroll:true});timer=setTimeout(()=>{hint.hidden=true;},1600);return true;}
  button.addEventListener('click',()=>active?close():open());
  exit.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();close();});
  document.addEventListener('keydown',event=>{if(active&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)close();});
  return {open,close,get isOpen(){return active;}};
}
export function createViewControls({ onLock = () => {}, onOpen = () => {} } = {}) {
  const $ = id => document.getElementById(id);
  const toggle = $('controls-toggle'), panel = $('controls-panel'), map = $('map-panel');
  connectInstagramLink({link:document.querySelector('.semitoon-link')});
  let active = null;
  function show(next, returnFocus = true) {
    const wasOpen = active !== null;
    if (active === next) return;
    active = next;
    panel.classList.toggle('hidden', next !== 'controls');
    map.classList.toggle('hidden', next !== 'map');
    toggle.setAttribute('aria-expanded', String(next === 'controls'));
    toggle.setAttribute('aria-label', next === 'controls' ? '팹 메뉴 닫기' : '팹 메뉴 열기');
    $('map-toggle').setAttribute('aria-expanded', String(next === 'map'));
    if (wasOpen !== (next !== null)) onLock(next !== null);
    if (next) {
      onOpen();
      $(next === 'controls' ? 'controls-close' : 'map-close').focus({ preventScroll: true });
    } else if (returnFocus) toggle.focus({ preventScroll: true });
  }
  toggle.addEventListener('click', () => show(active === 'controls' ? null : 'controls'));
  $('controls-close').addEventListener('click', () => show(null));
  $('map-toggle').addEventListener('click', () => show('map'));
  $('map-close').addEventListener('click', () => show(null));
  // Unlock before the existing equipment/mode handlers run.
  panel.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || ['controls-close', 'map-toggle', 'sound'].includes(button.id)) return;
    show(null, true);
  }, true);
  document.addEventListener('pointerdown', event => {
    if (!active || toggle.contains(event.target) || panel.contains(event.target) || map.contains(event.target)) return;
    // The tap that dismisses a panel must not also start walking behind it.
    event.preventDefault(); event.stopImmediatePropagation(); show(null);
  }, true);
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); show(null); return;
    }
    if (event.key !== 'Tab') return;
    const surface = active === 'controls' ? panel : map;
    const buttons = [...surface.querySelectorAll('button,a[href]')].filter(el => !el.disabled && el.getClientRects().length);
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }, true);
  return {
    closeAll() { show(null, false); },
    get isOpen() { return active !== null; },
    get mapVisible() { return active === 'map'; }
  };
}

// Start an app hand-off only from the user's tap. Never navigate again after
// they return from the app, leave the page, or resume interacting with the game.
export function connectInstagramLink({link,window=globalThis.window,document=globalThis.document,navigator=globalThis.navigator,now=()=>Date.now()}={}){
  if(!link)return;
  const ua=navigator?.userAgent||'',android=/Android/i.test(ua),ios=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&navigator?.maxTouchPoints>1);
  if(!android&&!ios)return;
  const web=link.href,profile='semi.toon';
  const app=android?`intent://instagram.com/_u/${profile}/#Intent;scheme=https;package=com.instagram.android;S.browser_fallback_url=${encodeURIComponent(web)};end`:`instagram://user?username=${profile}`;
  let cancel=()=>{};
  link.addEventListener('click',event=>{
    if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||(event.button!=null&&event.button!==0))return;
    event.preventDefault();cancel();
    const started=now();let timer;
    const hidden=()=>{if(document.hidden)cleanup();};
    const cleanup=()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',hidden);document.removeEventListener('pointerdown',cleanup);document.removeEventListener('keydown',cleanup);window.removeEventListener('pagehide',cleanup);};
    cancel=cleanup;
    const fallback=()=>{cleanup();if(!document.hidden&&now()-started<4000)window.location.assign(web);};
    document.addEventListener('visibilitychange',hidden);document.addEventListener('pointerdown',cleanup);document.addEventListener('keydown',cleanup);window.addEventListener('pagehide',cleanup);
    timer=setTimeout(fallback,1600);
    try{window.location.assign(app);}catch{fallback();}
  });
}
