/* node tools/offline-test.mjs — 验证 SW 离线壳 */
const port = process.env.CDP_PORT || '9333';
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
let seq = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const id = (seq += 1); pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result && r.result.result ? r.result.result.value : null;
};
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5199/?sw=1#/home' });
await new Promise((r) => setTimeout(r, 4500));
const registered = await evalJs("navigator.serviceWorker.getRegistrations().then(r => r.length)");
const controller = await evalJs("navigator.serviceWorker.controller ? 1 : 0");
const cacheKeys = await evalJs("caches.keys()");
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await send('Page.reload', { ignoreCache: false });
await new Promise((r) => setTimeout(r, 3500));
const offlineTitle = await evalJs("(document.querySelector('.home-head__title') || {}).textContent || null");
const offlineCards = await evalJs("document.querySelectorAll('.home-card').length");
const offlineHash = await evalJs("location.hash");
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
console.log(JSON.stringify({ registered, controller, cacheKeys, offlineTitle, offlineCards, offlineHash }, null, 2));
ws.close();
