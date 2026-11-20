/* 启动：打开数据库 -> 读取设置 -> 应用主题 -> 挂载外壳 -> 注册路由 */
import { store, on } from './core/store.js';
import { router } from './core/router.js';
import { applyTheme, sourceColorFromUrl } from './core/theme.js';
import { openDb } from './data/db.js';
import { loadSettings, ensureActiveProfile, getTrackColor, saveTrackColor } from './data/repo.js';
import { mountShell } from './ui/shell.js';
import { installCoverFallback, toast } from './ui/components.js';
import { player } from './player/player.js';
import { artworkCandidates } from './sources/registry.js';
import { requestPersistentStorage } from './core/util.js';
import searchPage from './ui/pages/search.js';
import { libraryRoutes } from './ui/pages/library.js';
import { meRoutes } from './ui/pages/me.js';

let coverToken = 0;
let coverActive = false;
let lastCoverTrack = '';
let internal = false;

/** 封面取色是全局的：整界面（导航、列表、弹窗）都跟着当前封面走 */
async function syncCoverTheme() {
  const theme = store.state.theme;
  if (!theme.fromCover) {
    if (coverActive) {
      coverActive = false;
      internal = true;
      store.patch('theme', { coverSeed: '' });
      internal = false;
      applyTheme(theme);
    }
    return;
  }
  const track = store.state.player.track;
  if (!track) return;
  const token = (coverToken += 1);
  const cached = await getTrackColor(track.id);
  if (token !== coverToken) return;
  let color = cached;
  if (!color) {
    // 能读到像素的封面优先：网易云的 CDN 带 ACAO，QQ/酷狗不带
    const rank = (url) => (/server=netease|music\.126\.net/i.test(url) ? 3 : (/audius|doubanio|hdslb/i.test(url) ? 2 : 1));
    const candidates = artworkCandidates(track, 300).sort((a, b) => rank(b) - rank(a));
    color = await sourceColorFromUrl(candidates);
    if (token !== coverToken) return;
    if (color) saveTrackColor(track.id, color).catch(() => {});
  }
  coverActive = true;
  internal = true;
  store.patch('theme', { coverSeed: color || '' });
  internal = false;
  applyTheme({ ...theme, seed: color || theme.seed });
}

/** 偏好设置 -> 根元素 */
function applyPrefs(settings) {
  const root = document.documentElement;
  const density = settings['prefs.density'] || 'comfortable';
  root.style.setProperty('--row-h', density === 'compact' ? '56px' : '64px');
  root.style.setProperty('--art-md', density === 'compact' ? '40px' : '48px');
  document.body.classList.toggle('reduce-motion', Boolean(settings['prefs.reduceMotion']));
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

  applyPrefs(settings);

  on(['player'], () => {
    const id = store.state.player.track ? store.state.player.track.id : '';
    if (id === lastCoverTrack) return;
    lastCoverTrack = id;
    syncCoverTheme();
  });
  on(['theme'], () => { if (!internal) syncCoverTheme(); });
  on(['settings'], () => { applyPrefs(store.state.settings); });

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