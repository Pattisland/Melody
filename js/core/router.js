/* hash 路由：解析 -> 渲染 -> 顶栏/导航/层级；带页面缓存 */
import { esc, icon } from './util.js';

const routes = [];
const cache = new Map();
const CACHE_LIMIT = 8;
let currentRoute = null;
let currentCtx = null;
let afterRender = null;

function cacheKeyOf(hash) { return String(hash || '').replace(/^#/, '') || '/home'; }

export const router = {
  add(route) { routes.push(route); return router; },
  onAfterRender(fn) { afterRender = fn; },
  get current() { return { route: currentRoute, ctx: currentCtx }; },

  parse(hash) {
    const raw = String(hash || '').replace(/^#/, '') || '/home';
    const parts = raw.split('?');
    const pathPart = parts[0];
    const path = pathPart.startsWith('/') ? pathPart : '/' + pathPart;
    const query = Object.fromEntries(new URLSearchParams(parts[1] || ''));
    return { path: path.replace(/\/+$/, '') || '/', query, raw };
  },

  match(path) {
    const segments = path.split('/').filter(Boolean);
    for (const route of routes) {
      const parts = route.path.split('/').filter(Boolean);
      if (parts.length !== segments.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < parts.length; i += 1) {
        if (parts[i].charAt(0) === ':') params[parts[i].slice(1)] = decodeURIComponent(segments[i]);
        else if (parts[i] !== segments[i]) { ok = false; break; }
      }
      if (ok) return { route, params };
    }
    return null;
  },

  go(path, options = {}) {
    const query = options.query ? '?' + new URLSearchParams(options.query).toString() : '';
    const hash = '#' + path + query;
    if (location.hash === hash) return;
    if (options.replace) {
      history.replaceState(null, '', hash);
      router.render();
    } else {
      location.hash = hash;
    }
  },

  setActions(html) {
    const holder = document.querySelector('[data-topbar-actions]');
    if (holder) holder.innerHTML = html || '';
  },

  render() {
    const parsed = router.parse(location.hash || '#/home');
    const found = router.match(parsed.path);
    if (!found) { router.go('/home', { replace: true }); return; }

    const page = document.getElementById('page');
    const topbar = document.getElementById('topbar');
    const route = found.route;
    const ctx = { path: parsed.path, query: parsed.query, params: found.params, raw: parsed.raw, hash: location.hash };
    currentRoute = route;
    currentCtx = ctx;

    const level = typeof route.level === 'function' ? route.level(ctx) : (route.level || 1);
    const title = typeof route.title === 'function' ? route.title(ctx) : (route.title || '');

    document.body.dataset.level = String(level);
    document.body.dataset.detail = String(level > 1);
    const dest = route.dest || parsed.path.split('/')[1] || 'home';
    document.body.dataset.dest = dest;
    document.querySelectorAll('.nav__item').forEach((item) => {
      if (item.dataset.dest === dest) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });

    if (level > 1) {
      topbar.innerHTML =
        '<button class="icon-btn" data-back aria-label="返回">' + icon('arrow_back') + '</button>' +
        '<h1 class="topbar__title">' + esc(title) + '</h1>' +
        '<div class="row gap-4" data-topbar-actions></div>';
      topbar.querySelector('[data-back]').addEventListener('click', () => router.back());
    } else {
      topbar.innerHTML = '';
    }

    document.title = title ? title + ' · Melody' : 'Melody';

    const key = cacheKeyOf(location.hash);
    const wantCache = typeof route.cache === 'function' ? route.cache(ctx) : Boolean(route.cache);
    const saved = wantCache ? cache.get(key) : null;
    if (saved) {
      page.replaceChildren(saved.node);
      page.dataset.view = key;
      if (route.onShow) route.onShow(saved.node, ctx, saved);
      if (afterRender) afterRender(ctx);
      window.scrollTo(0, saved.scroll || 0);
      return;
    }

    const node = document.createElement('div');
    node.className = 'page-view page--in';
    page.replaceChildren(node);
    page.dataset.view = key;

    try {
      const result = route.mount(node, ctx);
      if (result && typeof result.then === 'function') {
        result.then(() => {
          if (wantCache) router.remember(key, node);
          if (afterRender) afterRender(ctx);
        }).catch((err) => router.fail(node, err));
      } else {
        if (wantCache) router.remember(key, node);
        if (afterRender) afterRender(ctx);
      }
    } catch (err) {
      router.fail(node, err);
    }

    window.scrollTo(0, 0);
  },

  remember(key, node) {
    cache.set(key, { node, scroll: 0 });
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
  },

  saveScroll() {
    const hit = cache.get(cacheKeyOf(location.hash));
    if (hit) hit.scroll = window.scrollY;
  },

  fail(page, err) {
    console.error('[router]', err);
    page.innerHTML = '<div class="empty"><span class="icon">error_outline</span>' +
      '<div class="empty__title">页面加载失败</div><div class="t-body-m">' + esc(err && err.message) + '</div></div>';
  },

  back() {
    if (history.length > 1) history.back();
    else router.go('/home', { replace: true });
  },

  start() {
    window.addEventListener('hashchange', () => router.render());
    window.addEventListener('scroll', () => router.saveScroll(), { passive: true });
    router.render();
  },
};
