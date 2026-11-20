/* hash 路由：解析 -> 渲染 -> 顶栏/导航/层级 */
import { esc, icon } from './util.js';

const routes = [];
let currentRoute = null;
let currentCtx = null;
let topbarActions = '';
let afterRender = null;

export const router = {
  add(route) { routes.push(route); return router; },
  onAfterRender(fn) { afterRender = fn; },
  get current() { return { route: currentRoute, ctx: currentCtx }; },

  parse(hash) {
    const raw = String(hash || '').replace(/^#/, '') || '/search';
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
    topbarActions = html || '';
    const holder = document.querySelector('[data-topbar-actions]');
    if (holder) holder.innerHTML = topbarActions;
  },

  render() {
    const parsed = router.parse(location.hash || '#/search');
    const found = router.match(parsed.path);
    if (!found) { router.go('/search', { replace: true }); return; }

    const page = document.getElementById('page');
    const topbar = document.getElementById('topbar');
    const route = found.route;
    const ctx = { path: parsed.path, query: parsed.query, params: found.params, raw: parsed.raw };
    currentRoute = route;
    currentCtx = ctx;
    topbarActions = '';

    const level = typeof route.level === 'function' ? route.level(ctx) : (route.level || 1);
    const title = typeof route.title === 'function' ? route.title(ctx) : (route.title || '');

    document.body.dataset.level = String(level);
    document.body.dataset.detail = String(level > 1);
    const dest = parsed.path.split('/')[1] || 'search';
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

    page.innerHTML = '';
    page.classList.remove('page--in');
    void page.offsetWidth;
    page.classList.add('page--in');

    try {
      const result = route.mount(page, ctx);
      if (result && typeof result.then === 'function') {
        result.then(() => { if (afterRender) afterRender(ctx); }).catch((err) => router.fail(page, err));
      } else if (afterRender) {
        afterRender(ctx);
      }
    } catch (err) {
      router.fail(page, err);
    }

    window.scrollTo(0, 0);
  },

  fail(page, err) {
    console.error('[router]', err);
    page.innerHTML = '<div class="empty"><span class="icon">error_outline</span>' +
      '<div class="empty__title">页面加载失败</div><div class="t-body-m">' + esc(err && err.message) + '</div></div>';
  },

  back() {
    if (history.length > 1) history.back();
    else router.go('/search', { replace: true });
  },

  start() {
    window.addEventListener('hashchange', () => router.render());
    router.render();
  },
};
