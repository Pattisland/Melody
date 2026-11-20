/* 通用 UI：提示条 / 对话框 / 抽屉 / 歌曲列表 */
import { esc, icon, fmtTime, animate } from '../core/util.js';
import { artworkFor, artworkCandidates } from '../sources/registry.js';

/* ------------------------------ 提示条 ------------------------------ */

let snackTimer = 0;

export function toast(message, options = {}) {
  const host = document.getElementById('snackbar-host');
  if (!host) return;
  host.innerHTML = '';
  const node = document.createElement('div');
  node.className = 'snackbar';
  node.innerHTML = '<span>' + esc(message) + '</span>' +
    (options.actionLabel ? '<button class="snackbar__action">' + esc(options.actionLabel) + '</button>' : '');
  if (options.actionLabel && options.onAction) {
    node.querySelector('.snackbar__action').addEventListener('click', () => { options.onAction(); dismiss(); });
  }
  host.appendChild(node);
  clearTimeout(snackTimer);
  const timeout = options.timeout || (options.actionLabel ? 6000 : 3200);
  const dismiss = () => {
    clearTimeout(snackTimer);
    if (!node.isConnected) return;
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 220);
  };
  snackTimer = setTimeout(dismiss, timeout);
  return dismiss;
}

/* ------------------------------ 遮罩层 ------------------------------ */

function makeScrim(onClick) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.addEventListener('click', onClick);
  document.body.appendChild(scrim);
  requestAnimationFrame(() => scrim.classList.add('is-open'));
  return scrim;
}

function removeScrim(scrim) {
  if (!scrim) return;
  scrim.classList.remove('is-open');
  setTimeout(() => scrim.remove(), 220);
}

/* ------------------------------ 对话框 ------------------------------ */

export function openDialog(options = {}) {
  const root = document.getElementById('dialog-root');
  const scrim = makeScrim(() => close());
  const dialog = document.createElement('div');
  dialog.className = 'dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', options.title || '对话框');
  const actions = options.actions || [];
  dialog.innerHTML =
    '<div class="dialog__head"><h2 class="dialog__title">' + esc(options.title || '') + '</h2>' +
    (options.description ? '<p class="t-body-m muted">' + esc(options.description) + '</p>' : '') + '</div>' +
    '<div class="dialog__body">' + (options.body || '') + '</div>' +
    (actions.length ? '<div class="dialog__actions">' + actions.map((action, index) =>
      '<button class="btn ' + (action.variant === 'filled' ? 'btn--filled' : action.variant === 'danger' ? 'btn--danger' : 'btn--text') +
      '" data-action="' + index + '">' + esc(action.label) + '</button>').join('') + '</div>' : '');
  root.appendChild(dialog);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    dialog.classList.remove('is-open');
    removeScrim(scrim);
    setTimeout(() => dialog.remove(), 240);
    document.removeEventListener('keydown', onKey);
    if (options.onClose) options.onClose();
  }
  function onKey(event) { if (event.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);

  dialog.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = actions[Number(button.dataset.action)];
      if (!action) return;
      if (action.onClick) {
        const result = action.onClick(dialog, close);
        if (result !== false) close();
      } else close();
    });
  });

  requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('is-open')));
  const focusable = dialog.querySelector('input, textarea, button.btn--filled, button.btn--danger') || dialog.querySelector('button');
  if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 80);
  return { element: dialog, close, body: dialog.querySelector('.dialog__body') };
}

/* ------------------------------ 底部抽屉 ------------------------------ */

export function openSheet(options = {}) {
  const root = document.getElementById('sheet-root');
  const scrim = makeScrim(() => close());
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML =
    '<div class="sheet__handle"></div>' +
    '<div class="sheet__head"><h2 class="sheet__title">' + esc(options.title || '') + '</h2>' +
    '<button class="icon-btn" data-close aria-label="关闭">' + icon('close') + '</button></div>' +
    '<div class="sheet__body">' + (options.body || '') + '</div>';
  root.appendChild(sheet);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    sheet.classList.remove('is-open');
    removeScrim(scrim);
    setTimeout(() => sheet.remove(), 340);
    document.removeEventListener('keydown', onKey);
    if (options.onClose) options.onClose();
  }
  function onKey(event) { if (event.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  sheet.querySelector('[data-close]').addEventListener('click', close);
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('is-open')));
  return { element: sheet, close, body: sheet.querySelector('.sheet__body') };
}

/* ------------------------------ 歌曲列表 ------------------------------ */

export function sourceDots(track) {
  if (!track.sources || track.sources.length < 2) return '';
  const palette = { 'gd-netease': '#c62828', 'qj-tencent': '#31c27c', 'qj-kugou': '#2b7feb', 'qj-migu': '#e6421f', audius: '#7e57c2' };
  return '<span class="source-dots" title="' + track.sources.length + ' 个来源">' +
    track.sources.map((ref) => '<i style="background:' + (palette[ref.source] || 'currentColor') + '"></i>').join('') + '</span>';
}

export function songRow(track, options = {}) {
  const candidates = artworkCandidates(track);
  const artwork = candidates[0] || '';
  const fallbacks = candidates.slice(1).join('|');
  const playing = options.playingId === track.id;
  const sub = [track.artist, track.album].filter(Boolean).join(' · ');
  return '<div class="list-item' + (playing ? ' is-playing' : '') + '" data-track-id="' + esc(track.id) + '" role="button" tabindex="0">' +
    '<div class="list-item__art">' + icon('music_note') +
      (artwork ? '<img data-cover loading="lazy" decoding="async" referrerpolicy="no-referrer" src="' + esc(artwork) + '" data-fallbacks="' + esc(fallbacks) + '" alt="">' : '') +
    '</div>' +
    '<div class="list-item__body">' +
      '<div class="list-item__title">' + (playing ? '<span class="list-item__playing"><i></i><i></i><i></i></span>' : '') + esc(track.title) + '</div>' +
      '<div class="list-item__sub">' + esc(sub || '未知歌手') + '</div>' +
    '</div>' +
    '<div class="list-item__trail">' + sourceDots(track) +
      (track.duration ? '<span class="t-label-m">' + fmtTime(track.duration) + '</span>' : '') +
      '<button class="icon-btn" data-more aria-label="更多操作" tabindex="0">' + icon('more_vert') + '</button>' +
    '</div>' +
  '</div>';
}

export function songList(tracks, options = {}) {
  return '<div class="list" data-songlist>' + tracks.map((track) => songRow(track, options)).join('') + '</div>';
}

/**
 * 绑定列表的点击行为：整行播放，更多按钮弹菜单
 */
export function attachSongList(root, tracks, handlers = {}) {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const list = root.querySelector('[data-songlist]');
  if (!list) return;

  list.addEventListener('click', (event) => {
    const row = event.target.closest('[data-track-id]');
    if (!row) return;
    const track = byId.get(row.dataset.trackId);
    if (!track) return;
    if (event.target.closest('[data-more]')) {
      event.stopPropagation();
      if (handlers.onMore) handlers.onMore(track, row);
      return;
    }
    if (handlers.onPlay) handlers.onPlay(track, tracks);
  });

  list.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('[data-track-id]');
    if (!row) return;
    event.preventDefault();
    if (event.target.closest('[data-more]')) {
      if (handlers.onMore) handlers.onMore(byId.get(row.dataset.trackId), row);
    } else if (handlers.onPlay) {
      handlers.onPlay(byId.get(row.dataset.trackId), tracks);
    }
  });
}

/** 图片加载失败时移除，露出图标占位 */
export function installCoverFallback() {
  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-cover')) return;
    const rest = String(img.getAttribute('data-fallbacks') || '').split('|').filter(Boolean);
    if (rest.length) {
      img.setAttribute('data-fallbacks', rest.slice(1).join('|'));
      img.src = rest[0];
      return;
    }
    img.remove();
  }, true);
}

export function emptyState(iconName, title, hint) {
  return '<div class="empty">' + icon(iconName) + '<div class="empty__title">' + esc(title) + '</div>' +
    (hint ? '<div class="t-body-m">' + esc(hint) + '</div>' : '') + '</div>';
}

export function sectionHeader(title, actionHtml) {
  return '<div class="section__head"><h2 class="section__title">' + esc(title) + '</h2>' + (actionHtml || '') + '</div>';
}

export { animate, icon };
