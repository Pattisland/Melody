/* 应用外壳：迷你播放器 + 播放器抽屉 + 顶栏滚动 */
import { esc, icon, fmtTime, clamp } from '../core/util.js';
import { store } from '../core/store.js';
import { player } from '../player/player.js';
import { artworkFor } from '../sources/registry.js';
import { activeLineIndex } from '../player/lyrics.js';
import { openTrackMenu } from './track-menu.js';

let els = {};
let viewMode = 'cover';

function modeIcon(mode) {
  return mode === 'one' ? 'repeat_one' : 'repeat';
}

function blurEnabled() {
  const settings = store.state.settings || {};
  return settings['prefs.blurBg'] !== false;
}

function renderDock() {
  const state = store.state.player;
  const dock = els.dock;
  if (!state.track) { dock.hidden = true; dock.innerHTML = ''; return; }
  dock.hidden = false;
  const track = state.track;
  const art = artworkFor(track);
  dock.innerHTML =
    '<div class="dock__inner" data-dock-open role="button" tabindex="0" aria-label="展开播放器">' +
      '<div class="dock__progress"><span style="width:' + (state.duration ? (state.current / state.duration) * 100 : 0) + '%"></span></div>' +
      '<div class="dock__art">' + icon('music_note') + (art ? '<img data-cover src="' + esc(art) + '" alt="">' : '') + '</div>' +
      '<div class="dock__body"><div class="dock__title">' + esc(track.title) + '</div>' +
      '<div class="dock__artist">' + esc(track.artist || '未知歌手') + '</div></div>' +
      '<button class="icon-btn" data-dock-toggle aria-label="' + (state.playing ? '暂停' : '播放') + '">' + icon(state.playing ? 'pause' : 'play_arrow') + '</button>' +
      '<button class="icon-btn" data-dock-next aria-label="下一首">' + icon('skip_next') + '</button>' +
    '</div>';
}

function renderPlayer() {
  const node = els.player;
  if (!node) return;
  const state = store.state.player;
  if (!state.track) { node.setAttribute('aria-hidden', 'true'); return; }
  const track = state.track;
  const art = artworkFor(track, 640);
  const isOpen = state.mode !== 'mini';
  node.classList.toggle('is-open', isOpen);
  node.classList.toggle('player--half', state.mode === 'half');
  node.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  document.body.dataset.player = isOpen ? 'open' : 'closed';
  if (!isOpen) return;

  const lines = player.lyrics;
  const active = activeLineIndex(lines.lines, state.current);
  const from = Math.max(0, active - 2);
  const lyricsHtml = lines.loading
    ? '<div class="t-body-m muted">歌词加载中…</div>'
    : lines.lines.length
      ? lines.lines.slice(from, active + 3).map((line, index) =>
          '<div class="line' + (from + index === active ? ' is-active' : '') + '">' + esc(line.text || '·') + '</div>').join('')
      : '<div class="t-body-m muted">' + esc(lines.error || '暂无歌词') + '</div>';

  const showTabs = state.mode === 'full';

  node.innerHTML =
    (blurEnabled() && art ? '<div class="player__bg"><img src="' + esc(art) + '" alt="" data-cover></div>' : '<div class="player__bg player__bg--plain"></div>') +
    '<div class="player__inner">' +
      '<div class="player__top">' +
        '<button class="icon-btn" data-collapse aria-label="收起">' + icon('keyboard_arrow_down') + '</button>' +
        '<div class="player__top-title">正在播放</div>' +
        '<button class="icon-btn" data-more aria-label="更多">' + icon('more_vert') + '</button>' +
        '<button class="icon-btn" data-expand aria-label="' + (showTabs ? '半屏' : '全屏') + '">' +
          icon(showTabs ? 'fullscreen_exit' : 'fullscreen') + '</button>' +
      '</div>' +
      (showTabs
        ? '<div class="tabbar tabbar--center" role="tablist" aria-label="播放器视图">' +
            '<button class="tabbar__tab" role="tab" data-view="cover" aria-selected="' + (viewMode === 'cover') + '">封面</button>' +
            '<button class="tabbar__tab" role="tab" data-view="lyrics" aria-selected="' + (viewMode === 'lyrics') + '">歌词</button>' +
          '</div>'
        : '') +
      '<div class="player__stage" data-stage>' +
        (showTabs && viewMode === 'lyrics'
          ? '<div class="player__lyrics">' + lyricsHtml + '</div>'
          : '<div class="player__cover">' + icon('music_note', 'icon--72') + (art ? '<img src="' + esc(art) + '" alt="" data-cover>' : '') + '</div>') +
      '</div>' +
      '<div class="player__meta"><div class="player__title">' + esc(track.title) + '</div>' +
        '<div class="player__artist">' + esc(track.artist || '未知歌手') + '</div></div>' +
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
  node.querySelector('[data-expand]').addEventListener('click', () => setMode(state.mode === 'full' ? 'half' : 'full'));
  node.querySelector('[data-toggle]').addEventListener('click', () => player.toggle());
  node.querySelector('[data-next]').addEventListener('click', () => player.next());
  node.querySelector('[data-prev]').addEventListener('click', () => player.prev());
  node.querySelector('[data-shuffle]').addEventListener('click', () => { player.toggleShuffle(); renderPlayer(); });
  node.querySelector('[data-repeat]').addEventListener('click', () => { player.cycleRepeat(); renderPlayer(); });
  node.querySelector('[data-more]').addEventListener('click', () => openTrackMenu(track));
  node.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => { viewMode = button.dataset.view; renderPlayer(); });
  });
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
  if (state.mode === 'mini') return;
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
  if (viewMode === 'lyrics' && state.mode === 'full') {
    const holder = els.player.querySelector('.player__lyrics');
    if (holder) {
      const active = activeLineIndex(player.lyrics.lines, state.current);
      const from = Math.max(0, active - 2);
      holder.querySelectorAll('.line').forEach((node, index) => {
        node.classList.toggle('is-active', from + index === active);
      });
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
    if (!changed.includes('settings')) return;
    if (state.player.mode !== 'mini') renderPlayer();
  });

  els.dock.addEventListener('click', (event) => {
    if (!store.state.player.track) return;
    if (event.target.closest('[data-dock-toggle]')) { player.toggle(); return; }
    if (event.target.closest('[data-dock-next]')) { player.next(); return; }
    if (event.target.closest('[data-dock-open]')) setMode(store.state.player.mode === 'mini' ? 'half' : 'mini');
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
