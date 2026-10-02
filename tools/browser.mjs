// Minimal Chrome DevTools Protocol driver for automated checks: launches headless Chrome, opens URLs, evaluates JS
// (awaits promises, returns "ERROR: ..." on exceptions), moves/clicks the mouse, takes screenshots.
//   import { launch, sleep } from './browser.mjs';
//   const b = await launch(9301, '<profile dir>'); await b.goto(url); await b.eval('...'); await b.shot('x.png'); b.close();
// Pair with the dev-only hooks window.__runner and window.__game (see CLAUDE.md).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch(port, profile) {
  mkdirSync(profile, { recursive: true });
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--window-size=1400,900', ...(process.env.RESOLVE ? [`--host-resolver-rules=${process.env.RESOLVE}`] : []), 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {}
    await sleep(200);
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return {
    goto: (url) => send('Page.navigate', { url }),
    eval: async (expr) => { const r = (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result; return r?.exceptionDetails ? 'ERROR: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text) : r?.result?.value; },
    shot: async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.result.data, 'base64')); },
    move: (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }),
    click: async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); },
    close: () => { ws.close(); proc.kill(); },
  };
}
export { sleep };
