/* Melody service worker — 网络优先，离线回落缓存（离线首屏） */
const CACHE = 'melody-v3';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './assets/icon.svg',
  './css/tokens.css', './css/tokens.generated.css', './css/fonts.css', './css/icons.css', './css/app.css',
  './assets/fonts/roboto-latin-400.woff2', './assets/fonts/roboto-latin-500.woff2',
  './assets/fonts/roboto-latin-700.woff2', './assets/fonts/material-icons-round.woff2',
  './vendor/mcu.js',
  './js/main.js',
  './js/core/util.js', './js/core/store.js', './js/core/router.js', './js/core/theme.js',
  './js/data/db.js', './js/data/repo.js',
  './js/sources/registry.js', './js/sources/meting.js', './js/sources/audius.js', './js/sources/merge.js',
  './js/player/player.js', './js/player/lyrics.js', './js/player/cache.js', './js/player/queue.js',
  './js/ui/shell.js', './js/ui/components.js', './js/ui/cover.js', './js/ui/live.js',
  './js/ui/cache-state.js', './js/ui/track-menu.js', './js/ui/track-info.js',
  './js/ui/queue-panel.js', './js/ui/source-picker.js',
  './js/ui/pages/home.js', './js/ui/pages/search.js', './js/ui/pages/library.js',
  './js/ui/pages/collection.js', './js/ui/pages/me.js', './js/ui/pages/tasks.js', './js/ui/pages/cache.js',
  './js/download/id3.js', './js/download/download.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 单个文件失败不要拖垮整体安装
    await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      // 离线冷启动：导航请求一律回落到缓存的壳
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html') || await cache.match('./');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
