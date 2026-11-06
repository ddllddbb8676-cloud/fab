// Check only after the game is usable. A slow account service must never hold up entry.
export function createGoogleEntryNotice({dialog, enabled, onToggle}) {
  let state = 'done';
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.querySelector('a').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => onToggle(false));

  async function claim() {
    state = 'checking';
    try {
      const response = await fetch('/api/account/google/entry-notice', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'Content-Type': 'application/json'}, body: '{}', signal: AbortSignal.timeout(8000)
      });
      state = response.ok && (await response.json()).show === true ? 'show' : 'done';
    } catch { state = 'done'; }
  }

  return {
    enter() {
      if (enabled && state === 'done' && !dialog.open) state = 'check';
    },
    get pending() { return state === 'check' || state === 'show'; },
    update() {
      if (state === 'check') { void claim(); return; }
      if (state !== 'show') return;
      state = 'done';
      dialog.showModal();
      onToggle(true);
    }
  };
}
