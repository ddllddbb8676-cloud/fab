// Keep the scene clear: one menu, with the map shown only on request.
export function createViewControls({ onLock = () => {}, onOpen = () => {} } = {}) {
  const $ = id => document.getElementById(id);
  const toggle = $('controls-toggle'), panel = $('controls-panel'), map = $('map-panel');
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
