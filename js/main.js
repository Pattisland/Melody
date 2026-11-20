/* 启动：打开数据库 -> 读取设置 -> 应用主题 -> 挂载外壳 -> 注册路由 */
import { store, on } from './core/store.js';
import { router } from './core/router.js';
import { applyTheme, sourceColorFromUrl } from './core/theme.js';
import { openDb } from './data/db.js';
import { loadSettings, ensureActiveProfile } from './data/repo.js';
import { mountShell } from './ui/shell.js';
import { installCoverFallback, toast } from './ui/components.js';
import { player } from './player/player.js';
import { artworkFor } from './sources/registry.js';
import { requestPersistentStorage } from './core/util.js';
import searchPage from './ui/pages/search.js';
import { libraryRoutes } from './ui/pages/library.js';
import { meRoutes } from './ui/pages/me.js';

let coverToken = 0;
let coverActive = false;

async function syncCoverTheme() {
  const theme = store.state.theme;
  if (!theme.fromCover) {
    if (coverActive) { coverActive = false; applyTheme(theme); }
    return;
  }
  const track = store.state.player.track;
  if (!track) {
    if (coverActive) { coverActive = false; applyTheme(theme); }
    return;
  }
  const token = (coverToken += 1);
  const color = await sourceColorFromUrl(artworkFor(track));
  if (token !== coverToken) return;
  coverActive = true;
  applyTheme({ ...theme, seed: color || theme.seed });
}

async function boot() {
  installCoverFallback();

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

  router.add(searchPage);
  for (const route of libraryRoutes) router.add(route);
  for (const route of meRoutes) router.add(route);
  router.start();

  on(['player'], () => { syncCoverTheme(); });
  on(['theme'], () => { syncCoverTheme(); });

  requestPersistentStorage().catch(() => {});

  const localHost = location.hostname === '127.0.0.1' || location.hostname === 'localhost' || location.hostname === '';
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !localHost) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
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