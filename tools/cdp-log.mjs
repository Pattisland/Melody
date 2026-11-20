/* node tools/cdp-log.mjs <url> [waitMs] [w] [h] */
const port = process.env.CDP_PORT || '9333';
const url = process.argv[2];
const wait = Number(process.argv[3] || 5000);
const width = Number(process.argv[4] || 390);
const height = Number(process.argv[5] || 844);
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
let seq = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    logs.push('[' + m.params.type + '] ' + m.params.args.map((a) => a.value !== undefined ? a.value : (a.description || a.type)).join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    logs.push('[exception] ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text));
  }
  if (m.method === 'Log.entryAdded') {
    logs.push('[log:' + m.params.entry.level + '] ' + m.params.entry.text);
  }
};
const send = (method, params = {}) => new Promise((res) => { const id = (seq += 1); pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 600 });
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, wait));
const state = await send('Runtime.evaluate', { expression: "JSON.stringify({ hash: location.hash, rows: document.querySelectorAll('[data-track-id]').length, skel: document.querySelectorAll('.skeleton').length, pageLen: document.getElementById('page').innerHTML.length })", returnByValue: true });
console.log(logs.join('\n'));
console.log('STATE', state.result && state.result.result ? state.result.result.value : '');
ws.close();
