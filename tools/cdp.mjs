/* 极简 CDP 驱动：node tools/cdp.mjs <url> <exprFile> [width] [height] */
const port = process.env.CDP_PORT || '9333';
const url = process.argv[2];
const exprFile = process.argv[3];
const width = Number(process.argv[4] || 0);
const height = Number(process.argv[5] || 0);
const { readFile } = await import('node:fs/promises');

async function getTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (_) { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('CDP 未就绪');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = (seq += 1);
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
if (width && height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 600 });
}
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 3500));
const expr = exprFile ? await readFile(exprFile, 'utf8') : '1';
const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
const out = result.result;
console.log(JSON.stringify(out && out.result ? out.result.value : out, null, 2));
ws.close();
