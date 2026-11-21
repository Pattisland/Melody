/* 应用外壳：迷你播放器 + 全屏播放器 */
import { esc, icon, fmtTime, clamp } from '../core/util.js';
import { store } from '../core/store.js';
import { player } from '../player/player.js';
import { activeLineIndex } from '../player/lyrics.js';
import { coverSources } from './cover.js';
import { openTrackMenu } from './track-menu.js';
import { getTrackColor, isFavorite, toggleFavorite } from '../data/repo.js';
import { sourceColorFromUrl, colorFromImageElement, schemeVars, resolveDark } from '../core/theme.js';

let els = {};
let viewMode = 'cover';
let tintToken = 0;

function modeIcon(mode) {
  return mode === 'one' ? 'repeat_one' : 'repeat';
}

function blurEnabled() {
  const settings = store.state.settings || {};
  return settings['prefs.blurBg'] !== false;
}

function tintEnabled() {
  const settings = store.state.settings || {};
  return settings['prefs.playerTint'] !== false;
}

function artFor(track, size) {
  return coverSources(track, size)[0] || '';
}

function renderDock() {
  const state = store.state.player;
  const dock = els.dock;
  if (!state.track) { dock.hidden = true; dock.innerHTML = ''; return; }
  dock.hidden = false;
  const track = state.track;
  const art = artFor(track, 120);
  dock.innerHTML =
    '<div class="dock__inner" data-dock-open role="button" tabindex="0" aria-label="展开播放器">' +
      '<div class="dock__progress"><span style="width:' + (state.duration ? (state.current / state.duration) * 100 : 0) + '%"></span></div>' +
      '<div class="dock__art">' + icon('music_note') +
        (art ? '<img data-cover data-src="' + esc(art) + '" decoding="async" referrerpolicy="no-referrer" alt="">' : '') + '</div>' +
      '<div class="dock__body"><div class="dock__title">' + esc(track.title) + '</div>' +
      '<div class="dock__artist">' + esc(track.artist || '未知歌手') + '</div></div>' +
      '<button class="icon-btn" data-dock-toggle aria-label="' + (state.playing ? '暂停' : '播放') + '">' + icon(state.playing ? 'pause' : 'play_arrow') + '</button>' +
      '<button class="icon-btn" data-dock-next aria-label="下一首">' + icon('skip_next') + '</button>' +
    '</div>';
}

/** 五行固定歌词：替换文本而不是重建节点，才能过渡 */
function paintLyrics(holder, lines, active) {
  if (!holder) return;
  if (holder.childElementCount !== 5) {
    holder.innerHTML = '<div class="line"></div><div class="line"></div><div class="line"></div><div class="line"></div><div class="line"></div>';
  }
  const from = Math.max(0, active - 2);
  const rows = holder.children;
  for (let i = 0; i < 5; i += 1) {
    const line = lines[from + i];
    const text = line ? (line.text || '·') : '';
    if (rows[i].textContent !== text) rows[i].textContent = text;
    rows[i].classList.toggle('is-active', from + i === active);
  }
}

function lyricsEmpty(holder, text) {
  if (!holder) return;
  holder.innerHTML = '<div class="t-body-m muted">' + esc(text) + '</div>';
}

/** 播放器整套配色都从封面来：不仅按钮，背景、文字、控件一起换 */
async function applyTint(node, track) {
  const token = (tintToken += 1);
  const clear = () => {
    for (const key of node._tintKeys || []) node.style.removeProperty(key);
    node._tintKeys = [];
  };
  if (!tintEnabled() || !track) { clear(); return; }
  if (!coverSources(track, 200).length) { clear(); return; }
  let color = await getTrackColor(track.id).catch(() => '');
  if (token !== tintToken) return;
  if (!color) {
    const coverImg = node.querySelector('.player__cover img');
    if (coverImg) color = await colorFromImageElement(coverImg);
    if (token !== tintToken) return;
  }
  if (!color) {
    color = await sourceColorFromUrl(coverSources(track, 200));
    if (token !== tintToken) return;
  }
  if (!color) { clear(); return; }
  const vars = schemeVars(color, resolveDark(store.state.theme.mode), 'content');
  clear();
  node._tintKeys = Object.keys(vars);
  for (const key of node._tintKeys) node.style.setProperty(key, vars[key]);
  node.style.setProperty('--player-accent', vars['--md-sys-color-primary']);
  node.style.setProperty('--player-on-accent', vars['--md-sys-color-on-primary']);
}

function renderPlayer() {
  const node = els.player;
  if (!node) return;
  const state = store.state.player;
  if (!state.track) { node.setAttribute('aria-hidden', 'true'); return; }
  const track = state.track;
  const thumb = artFor(track, 200);
  const full = artFor(track, 640);
  const isOpen = state.mode === 'full';
  const desktop = window.matchMedia('(min-width: 900px)').matches;
  node.classList.toggle('is-open', isOpen);
  node.classList.add('player--full');
  node.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  document.body.dataset.player = isOpen ? 'open' : 'closed';
  if (!isOpen) return;

  const lyrics = player.lyrics;
  const active = activeLineIndex(lyrics.lines, state.current);

  node.innerHTML =
    (blurEnabled() && thumb ? '<div class="player__bg"><img data-cover data-src="' + esc(thumb) + '" alt=""></div>' : '<div class="player__bg player__bg--plain"></div>') +
    '<div class="player__inner">' +
      '<div class="player__top">' +
        '<button class="icon-btn" data-collapse aria-label="收起">' + icon('keyboard_arrow_down') + '</button>' +
        '<div class="player__top-title">正在播放</div>' +
        '<button class="icon-btn" data-more aria-label="更多">' + icon('more_vert') + '</button>' +
      '</div>' +
      (desktop ? '' : '<div class="tabbar tabbar--center" role="tablist" aria-label="播放器视图">' +
        '<button class="tabbar__tab" role="tab" data-view="cover" aria-selected="' + (viewMode === 'cover') + '">封面</button>' +
        '<button class="tabbar__tab" role="tab" data-view="lyrics" aria-selected="' + (viewMode === 'lyrics') + '">歌词</button>' +
      '</div>') +
      '<div class="player__body" data-mode="' + (desktop ? 'both' : viewMode) + '">' +
        '<div class="player__stage" data-stage>' +
          '<div class="player__cover" data-cover-full="' + esc(full) + '">' + icon('music_note', 'icon--72') +
          (thumb ? '<img data-cover data-src="' + esc(thumb) + '" data-full="' + esc(full) + '" decoding="async" referrerpolicy="no-referrer" alt="">' : '') +
          '</div>' +
        '</div>' +
        '<div class="player__panel"><div class="player__lyrics" data-lyrics>' +
          (lyrics.loading ? '<div class="t-body-m muted">歌词加载中…</div>'
            : lyrics.lines.length ? '' : '<div class="t-body-m muted">' + esc(lyrics.error || '暂无歌词') + '</div>') +
        '</div></div>' +
      '</div>' +
      '<div class="player__meta"><div class="player__title">' + esc(track.title) + '</div>' +
        '<div class="player__artist">' + esc(track.artist || '未知歌手') + '</div>' +
        '<button class="icon-btn player__fav" data-fav aria-label="收藏" aria-pressed="false">' + icon('favorite_border') + '</button>' +
      '</div>' +
      '<div class="player__seek">' +
        '<input class="slider" type="range" min="0" max="' + (state.duration || 0) + '" step="0.1" value="' + (state.current || 0) + '" data-seek aria-label="播放进度">' +
        '<div class="player__times"><span data-time-current>' + fmtTime(state.current) + '</span><span data-time-total>' + fmtTime(state.duration) + '</span></div>' +
      '</div>' +
      '<div class="player__controls">' +
        '<button class="icon-btn" data-shuffle aria-label="随机播放" aria-pressed="' + state.shuffle + '">' + icon('shuffle') + '</button>' +
        '<button class="icon-btn icon-btn--lg" data-prev aria-label="上一首">' + icon('skip_previous') + '</button>' +
        '<button class="icon-btn icon-btn--play" data-toggle aria-label="' + (state.playing ? '暂停' : '播放') + '">' + icon(state.playing ? 'pause' : 'play_arrow') + '</button>' +
        '<button class="icon-btn icon-btn--lg" data-next aria-label="下一首">' + icon('skip_next') + '</button>' +
        '<button class="icon-btn" data-repeat aria-label="循环模式">' + icon(modeIcon(state.repeat)) + '</button>' +
      '</div>' +
    '</div>';

  const holder = node.querySelector('[data-lyrics]');
  if (holder && lyrics.lines.length) paintLyrics(holder, lyrics.lines, active);

  const seek = node.querySelector('[data-seek]');
  seek.style.setProperty('--p', (state.duration ? (state.current / state.duration) * 100 : 0) + '%');
  seek.addEventListener('input', () => {
    const value = Number(seek.value);
    const current = node.querySelector('[data-time-current]');
    if (current) current.textContent = fmtTime(value);
    seek.style.setProperty('--p', (state.duration ? (value / state.duration) * 100 : 0) + '%');
  });
  seek.addEventListener('change', () => player.seekTo(Number(seek.value)));
  node.querySelector('[data-collapse]').addEventListener('click', () => setMode('mini'));
  node.querySelector('[data-toggle]').addEventListener('click', () => player.toggle());
  node.querySelector('[data-next]').addEventListener('click', () => player.next());
  node.querySelector('[data-prev]').addEventListener('click', () => player.prev());
  node.querySelector('[data-shuffle]').addEventListener('click', () => { player.toggleShuffle(); renderPlayer(); });
  node.querySelector('[data-repeat]').addEventListener('click', () => { player.cycleRepeat(); renderPlayer(); });
  node.querySelector('[data-more]').addEventListener('click', (event) => openTrackMenu(track, { anchor: event.currentTarget }));
  node.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => { viewMode = button.dataset.view; renderPlayer(); });
  });

  const favButton = node.querySelector('[data-fav]');
  const profileId = store.state.profileId;
  isFavorite(profileId, track.id).then((fav) => {
    if (!favButton.isConnected) return;
    favButton.setAttribute('aria-pressed', String(fav));
    favButton.innerHTML = icon(fav ? 'favorite' : 'favorite_border');
  }).catch(() => {});
  favButton.addEventListener('click', async () => {
    const now = await toggleFavorite(profileId, track);
    favButton.setAttribute('aria-pressed', String(now));
    favButton.innerHTML = icon(now ? 'favorite' : 'favorite_border');
  });

  applyTint(node, track);
}

function setMode(mode) {
  player.setMode(mode);
  if (mode === 'mini') document.body.removeAttribute('data-player');
  else document.body.dataset.player = 'open';
  renderPlayer();
  renderDock();
}

function updateProgress() {
  const state = store.state.player;
  if (!state.track) return;
  const bar = els.dock.querySelector('.dock__progress span');
  if (bar) bar.style.width = (state.duration ? clamp((state.current / state.duration) * 100, 0, 100) : 0) + '%';
  if (state.mode !== 'full') return;
  const seek = els.player.querySelector('[data-seek]');
  const current = els.player.querySelector('[data-time-current]');
  const total = els.player.querySelector('[data-time-total]');
  if (seek && document.activeElement !== seek) {
    seek.value = String(state.current || 0);
    seek.style.setProperty('--p', (state.duration ? (state.current / state.duration) * 100 : 0) + '%');
  }
  if (current) current.textContent = fmtTime(state.current);
  if (total) total.textContent = fmtTime(state.duration);
  if (seek && seek.max !== String(state.duration || 0)) seek.max = String(state.duration || 0);

  const holder = els.player.querySelector('[data-lyrics]');
  if (holder) {
    const active = activeLineIndex(player.lyrics.lines, state.current);
    if (holder.dataset.active !== String(active)) {
      holder.dataset.active = String(active);
      if (player.lyrics.lines.length) paintLyrics(holder, player.lyrics.lines, active);
    }
  }
}

export function mountShell() {
  els.dock = document.getElementById('dock');
  const playerEl = document.createElement('div');
  playerEl.id = 'player';
  playerEl.className = 'player';
  playerEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(playerEl);
  els.player = playerEl;

  let signature = '';
  let lastTrackId = '';
  store.subscribe((state, changed) => {
    if (!changed.includes('player')) return;
    const p = state.player;
    document.body.dataset.paused = String(!p.playing);
    const next = [
      p.track ? p.track.id : '',
      p.track ? p.track.title : '',
      p.playing, p.mode, p.loading, p.error, p.repeat, p.shuffle,
    ].join('|');
    if (next === signature) { updateProgress(); return; }
    signature = next;
    const trackId = p.track ? p.track.id : '';
    if (trackId !== lastTrackId) { lastTrackId = trackId; viewMode = 'cover'; }
    renderDock();
    renderPlayer();
    updateProgress();
  });

  store.subscribe((state, changed) => {
    if (changed.includes('settings') && state.player.mode === 'full') renderPlayer();
  });

  els.dock.addEventListener('click', (event) => {
    if (!store.state.player.track) return;
    if (event.target.closest('[data-dock-toggle]')) { player.toggle(); return; }
    if (event.target.closest('[data-dock-next]')) { player.next(); return; }
    if (event.target.closest('[data-dock-open]')) setMode('full');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && store.state.player.mode === 'full') setMode('mini');
  });

  const topbar = document.getElementById('topbar');
  window.addEventListener('scroll', () => {
    if (!topbar) return;
    topbar.classList.toggle('topbar--scrolled', window.scrollY > 4);
  }, { passive: true });

  renderDock();
  renderPlayer();
}

export { setMode };
