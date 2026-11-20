/* node tools/shot.mjs <url> <out.png> [w] [h] [light|dark] [waitMs] */
const port = process.env.CDP_PORT || '9333';
const args = process.argv.slice(2);
const url = args[0];
const out = args[1];
const width = Number(args[2] || 390);
const height = Number(args[3] || 844);
const scheme = args[4] || 'light';
const wait = Number(args[5] || 3200);
const { writeFile } = await import('node:fs/promises');

async function target() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('CDP 未就绪');
}

const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const id = (seq += 1); pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 600 });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
await send('Runtime.evaluate', { expression: "(async () => { try { const rs = await navigator.serviceWorker.getRegistrations(); for (const r of rs) await r.unregister(); const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch (e) {} return 1; })()", awaitPromise: true });
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
const bust = url.indexOf('#') >= 0 ? url.replace('#', '?_ts=' + Date.now() + '#') : url + '?_ts=' + Date.now();
await send('Page.navigate', { url: bust });
await new Promise((r) => setTimeout(r, wait));
const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile(out, Buffer.from(res.result.data, 'base64'));
const errs = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__errors || [])', returnByValue: true });
console.log('shot ->', out, 'errors:', errs.result && errs.result.result ? errs.result.result.value : 'n/a');
ws.close();