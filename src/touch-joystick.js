import nipplejs from 'nipplejs';

// Only this small zone owns the movement finger. The scene keeps a separate
// pointer stream for looking around; a second finger must never stop movement.
export function createTouchJoystick({ zone, onStart, onMove, onEnd }) {
  let manager = null, active = false, enabled = false;
  function stop() {
    active = false; zone.classList.remove('active'); onEnd();
  }
  function setEnabled(value) {
    value = Boolean(value);
    if (enabled === value) return;
    enabled = value; zone.classList.toggle('hidden', !value);
    if (!value) { stop(); manager?.destroy(); manager = null; return; }
    manager = nipplejs.create({ zone, mode: 'dynamic', size: 96, threshold: .12,
      multitouch: false, fadeTime: 100, color: { front: '#568b91cc', back: '#eef8f680' } });
    manager.on('start', () => {
      active = onStart() !== false;
      zone.classList.toggle('active', active);
    });
    manager.on('move', event => { if (active) onMove(event.data.vector.x, event.data.vector.y); });
    manager.on('end', stop);
  }
  const suspend = () => setEnabled(false);
  window.addEventListener('blur', suspend);
  window.addEventListener('orientationchange', suspend);
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
  return { setEnabled, get active() { return active; } };
}
