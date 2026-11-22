/* 启动：打开数据库 -> 读取设置 -> 应用主题 -> 挂载外壳 -> 注册路由 */
import { store, on } from './core/store.js';
import { router } from './core/router.js';
import { applyTheme, sourceColorFromUrl, colorFromImageElement } from './core/theme.js';
import { openDb } from './data/db.js';
import { loadSettings, ensureActiveProfile, getTrackColor, saveTrackColor } from './data/repo.js';
import { mountShell } from './ui/shell.js';
import { toast } from './ui/components.js';
import { installCoverEngine } from './ui/cover.js';
import { refreshCacheState } from './ui/cache-state.js';
import { player } from './player/player.js';
import { restoreQueue } from './player/queue.js';
import { artworkCandidates } from './sources/registry.js';
import { requestPersistentStorage } from './core/util.js';
import { homeRoute } from './ui/pages/home.js';
import searchPage from './ui/pages/search.js';
import { libraryRoutes } from './ui/pages/library.js';
import { meRoutes } from './ui/pages/me.js';
import { collectionRoutes } from './ui/pages/collection.js';
import { cacheRoute } from './ui/pages/cache.js';

let tintToken = 0;
let tintActive = false;

/** 播放器展开时，整套全局配色临时换成封面色；收起后恢复 */
async function syncPlayerTint() {
  const p = store.state.player;
  const theme = store.state.theme;
  const settings = store.state.settings || {};
  const track = p.track;
  const enabled = settings['prefs.playerTint'] !== false;
  const globalTint = Boolean(settings['prefs.tintGlobal']);
  // 全局取色开着时整个应用跟着封面走；否则只在播放器展开时取色
  const should = Boolean(track && artworkCandidates(track, 200).length && (globalTint || (p.mode === 'full' && enabled)));
  if (!should) {
    if (tintActive) {
      tintActive = false;
      applyTheme(theme);
    }
    return;
  }
  const token = (tintToken += 1);
  let color = await getTrackColor(track.id).catch(() => '');
  if (token !== tintToken) return;
  if (!color) {
    const img = document.querySelector('.player__cover img');
    if (img) color = await colorFromImageElement(img);
  }
  if (token !== tintToken) return;
  if (!color) color = await sourceColorFromUrl(artworkCandidates(track, 200));
  if (token !== tintToken) return;
  if (!color) {
    if (tintActive) { tintActive = false; applyTheme(theme); }
    return;
  }
  tintActive = true;
  saveTrackColor(track.id, color).catch(() => {});
  applyTheme({ ...theme, seed: color });
}

/** 偏好设置 -> 根元素 */
function applyPrefs(settings) {
  const root = document.documentElement;
  const density = settings['prefs.density'] || 'comfortable';
  root.style.setProperty('--row-h', density === 'compact' ? '56px' : '64px');
  root.style.setProperty('--art-md', density === 'compact' ? '40px' : '48px');
  // 封面大小档位：移动端列数 + 桌面端边长系数
  const coverSize = settings['prefs.coverSize'] || 'normal';
  const coverCols = coverSize === 'small' ? 5 : coverSize === 'large' ? 3 : 4;
  const coverScale = coverSize === 'small' ? 0.86 : coverSize === 'large' ? 1.2 : 1;
  root.style.setProperty('--cover-cols', String(coverCols));
  root.style.setProperty('--cover-scale', String(coverScale));
  document.body.classList.toggle('reduce-motion', Boolean(settings['prefs.reduceMotion']));
}

async function boot() {
  installCoverEngine();

  try { await openDb(); }
  catch (err) { toast('数据库不可用：' + err.message); }

  const settings = await loadSettings();
  const active = await ensureActiveProfile();

  const theme = {
    seed: settings['theme.seed'] || '#0f6b72',
    mode: settings['theme.mode'] || 'system',
    variant: settings['theme.variant'] || 'tonal',
    fromCover: Boolean(settings['theme.fromCover']),
  };

  store.set({
    settings,
    profileId: active.profile.id,
    profiles: active.profiles,
    theme,
    sources: {
      order: settings['sources.order'] || [],
      disabled: settings['sources.disabled'] || [],
    },
  });

  applyTheme(theme);
  mountShell();
  player.init({ settings, profileId: active.profile.id });

  router.add(homeRoute);
  router.add(searchPage);
  for (const route of libraryRoutes) router.add(route);
  for (const route of meRoutes) router.add(route);
  for (const route of collectionRoutes) router.add(route);
  router.add(cacheRoute);
  router.start();

  applyPrefs(settings);
  // 自定义边距只在桌面布局生效：移动端固定用设计基准，不读用户拖出来的值
  const gutterQuery = window.matchMedia('(min-width: 840px)');
  const applyGutter = () => {
    const root = document.documentElement;
    const value = Number((store.state.settings || {})['prefs.pageGutter'] || 154);
    if (gutterQuery.matches && value >= 12) root.style.setProperty('--gutter', value + 'px');
    else root.style.removeProperty('--gutter');
  };
  applyGutter();
  if (gutterQuery.addEventListener) gutterQuery.addEventListener('change', applyGutter);

  let lastTintKey = '';
  on(['player'], () => {
    const p = store.state.player;
    const key = (p.mode || '') + '|' + (p.track ? p.track.id : '');
    if (key === lastTintKey) return;
    lastTintKey = key;
    syncPlayerTint();
  });
  on(['settings'], () => {
    applyPrefs(store.state.settings);
    syncPlayerTint();
  });

  refreshCacheState(active.profile.id).catch(() => {});
  restoreQueue().then((restored) => {
    if (restored > 0) toast('已恢复上次的 ' + restored + ' 个缓存任务，可在任务进度里查看');
  }).catch(() => {});
  on(['profileId'], () => { refreshCacheState(store.state.profileId).catch(() => {}); });

  requestPersistentStorage().catch(() => {});

  const localHost = location.hostname === '127.0.0.1' || location.hostname === 'localhost' || location.hostname === '';
  const forceSw = new URLSearchParams(location.search).has('sw');
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && (!localHost || forceSw)) {
    const register = () => navigator.serviceWorker.register('./sw.js').catch(() => {});
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }

  // 键盘：空格切换播放（输入框内不拦截）
  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space') return;
    const tag = (event.target && event.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;
    if (document.body.dataset.player !== 'open') return;
    event.preventDefault();
    player.toggle();
  });
}

boot().catch((err) => {
  console.error(err);
  const page = document.getElementById('page');
  if (page) page.innerHTML = '<div class="empty"><span class="icon">error_outline</span><div class="empty__title">启动失败</div><div class="t-body-m">' + String(err && err.message) + '</div></div>';
});