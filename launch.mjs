import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const url = 'http://127.0.0.1:4173/';
async function running() {
  try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); return response.ok && (await response.text()).includes('FAB OBSERVATORY'); }
  catch { return false; }
}
if (!(await running())) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  let ready = false;
  for (let i = 0; i < 50; i++) {
    if (await running()) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) { console.error('Could not start FAB. Run npm.cmd start in this folder to see the error.'); process.exit(1); }
}
console.log('FAB is ready: ' + url);
if (process.env.FAB_LAUNCH_NO_OPEN !== '1') {
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const command = process.platform === 'win32' ? 'cmd.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const browser = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  browser.unref();
}
