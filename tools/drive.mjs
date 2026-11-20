/* node tools/drive.mjs <url> <scriptFile> <shotOut.png> [w] [h] [light|dark] */
const port = process.env.CDP_PORT || '9333';
const [url, scriptFile, out, w, h, scheme] = process.argv.slice(2);
const width = Number(w || 390); const height = Number(h || 844);
const { readFile, writeFile } = await import('node:fs/promises');
async function target() {
  for (let i = 0; i < 40; i += 1) {
    try { const l = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); const p = l.find((t) => t.type === 'page'); if (p) return p; } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('no cdp');
}
const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map(); const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
};
const send = (method, params = {}) => new Promise((res) => { const id = (seq += 1); pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 600 });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme || 'light' }] });
await send('Runtime.evaluate', { expression: "(async () => { try { const rs = await navigator.serviceWorker.getRegistrations(); for (const r of rs) await r.unregister(); const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch (e) {} return 1; })()", awaitPromise: true });
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
const bust = url.indexOf('#') >= 0 ? url.replace('#', '?_ts=' + Date.now() + '#') : url + '?_ts=' + Date.now();
await send('Page.navigate', { url: bust });
await new Promise((r) => setTimeout(r, 3000));
const expr = scriptFile && scriptFile !== '-' ? await readFile(scriptFile, 'utf8') : 'null';
const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
const out_val = result.result && result.result.result ? result.result.result.value : null;
console.log('EVAL ' + JSON.stringify(out_val));
if (logs.length) console.log(logs.join('\n'));
if (out && out !== '-') {
  await new Promise((r) => setTimeout(r, 1200));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(out, Buffer.from(shot.result.data, 'base64'));
  console.log('shot -> ' + out);
}
ws.close();