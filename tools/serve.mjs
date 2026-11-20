import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a)) || 5199);
const lan = args.includes('--lan');
const host = lan ? '0.0.0.0' : '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) { res.writeHead(404).end('not found'); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (err) { res.writeHead(500).end(String(err)); }
}).listen(port, host, async () => {
  console.log('serving ' + root);
  console.log('  http://127.0.0.1:' + port);
  if (lan) {
    const { networkInterfaces } = await import('node:os');
    for (const [name, addrs] of Object.entries(networkInterfaces())) {
      for (const addr of addrs || []) {
        if (addr.family === 'IPv4' && !addr.internal) console.log('  http://' + addr.address + ':' + port + '   (' + name + '，手机同网可访问)');
      }
    }
  }
});