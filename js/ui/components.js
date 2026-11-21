/* 通用 UI：提示条 / 对话框 / 抽屉 / 悬浮菜单 / 歌曲列表 */
import { esc, icon, fmtTime, animate, textOf } from '../core/util.js';
import { store } from '../core/store.js';
import { coverMarkup } from './cover.js';

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

/** 把 Tab 焦点锁在容器内，关闭时把焦点还给原处 */
function trapFocus(container) {
  const previous = document.activeElement;
  const onKey = (event) => {
    if (event.key !== 'Tab') return;
    const items = Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((node) => !node.disabled && node.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('keydown', onKey);
    if (previous && previous.focus && previous.isConnected) previous.focus({ preventScroll: true });
  };
}

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
  const releaseFocus = trapFocus(dialog);
  function close() {
    if (closed) return;
    closed = true;
    dialog.classList.remove('is-open');
    removeScrim(scrim);
    setTimeout(() => dialog.remove(), 240);
    document.removeEventListener('keydown', onKey);
    releaseFocus();
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

/** 单行文本输入对话框，返回输入值或 null */
export function askText(options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const dialog = openDialog({
      title: options.title || '',
      description: options.description || '',
      body: '<label class="field"><span class="field__label">' + esc(options.label || '') + '</span>' +
        '<input class="input" data-ask value="' + esc(options.value || '') + '" placeholder="' + esc(options.placeholder || '') + '"></label>',
      actions: [
        { label: options.cancelText || '取消', variant: 'text', onClick: () => done(null) },
        { label: options.confirmText || '确定', variant: 'filled', onClick: () => {
          const input = dialog.element.querySelector('[data-ask]');
          done(input && input.value.trim() ? input.value.trim() : null);
        } },
      ],
      onClose: () => done(null),
    });
    const input = dialog.element.querySelector('[data-ask]');
    if (input) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          done(input.value.trim() || null);
          dialog.close();
        }
      });
    }
  });
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

/* ------------------------------ 动作菜单 ------------------------------ */

function menuItemHTML(item, index) {
  return '<button class="menu__item" role="menuitem" data-index="' + index + '"' +
    (item.disabled ? ' aria-disabled="true"' : '') +
    (item.submenu ? ' aria-haspopup="menu"' : '') + '>' +
    (item.icon ? icon(item.icon, 'menu__icon') : '') +
    '<span class="menu__label">' + esc(item.label) + '</span>' +
    (item.submenu ? '<span class="icon menu__chevron" aria-hidden="true">chevron_right</span>' : '') +
    '</button>';
}

/**
 * 动作菜单：桌面端贴着触发元素浮出，移动端统一底部抽屉。
 * @returns {{close:() => void}}
 */
export function openActionMenu(options = {}) {
  const items = (options.items || []).filter(Boolean);
  const anchor = options.anchor;
  const rect = options.rect || (anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null);
  // 桌面端一律用浮出菜单，绝不用底部抽屉（避免出现“上拉”菜单）
  const desktop = window.matchMedia('(min-width: 840px)').matches;

  if (!desktop) {
    const body = '<div class="menu menu--sheet">' + items.map(menuItemHTML).join('') + '</div>';
    const sheet = openSheet({ title: options.title || '', body });
    bindMenuItems(sheet.body, items, sheet.close, {
      // 移动端二级菜单：关掉抽屉后再开一层
      onSubmenu: async (button, item) => {
        sheet.close();
        await new Promise((resolve) => setTimeout(resolve, 140));
        const list = await item.submenu();
        openActionMenu({ title: item.label, items: list });
      },
    });
    return { close: sheet.close, element: sheet.element };
  }

  const host = document.getElementById('dialog-root');
  const menu = document.createElement('div');
  menu.className = 'menu menu--popover';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = (options.title ? '<div class="menu__title">' + esc(options.title) + '</div>' : '') +
    items.map(menuItemHTML).join('');
  host.appendChild(menu);

  const box = menu.getBoundingClientRect();
  const point = options.point || null;
  const validRect = rect && rect.width > 0 && rect.height > 0;
  const validPoint = point && (point.x || point.y);
  const anchorLeft = validPoint ? point.x : (validRect ? rect.right : window.innerWidth - 24);
  const anchorTop = validPoint ? point.y : (validRect ? rect.bottom : 80);
  let left = anchorLeft - box.width;
  left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8));
  // 桌面端一律向下展开：空间不够就压缩高度并内部滚动，绝不翻到触发点上方
  const top = Math.max(8, Math.min(anchorTop + 6, window.innerHeight - 240));
  const room = window.innerHeight - top - 10;
  if (box.height > room) {
    menu.style.maxHeight = Math.max(160, room) + 'px';
    menu.style.overflowY = 'auto';
  }
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  requestAnimationFrame(() => menu.classList.add('is-open'));

  let closed = false;
  const childMenus = [];
  let currentSub = null;
  const closeChildren = () => {
    while (childMenus.length) childMenus.pop().element.remove();
    menu.querySelectorAll('[data-sub-active]').forEach((node) => { delete node.dataset.subActive; });
    currentSub = null;
  };
  const close = () => {
    if (closed) return;
    closed = true;
    closeChildren();
    menu.classList.remove('is-open');
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => menu.remove(), 160);
    if (options.onClose) options.onClose();
  };
  const inside = (target) => menu.contains(target) || childMenus.some((child) => child.element.contains(target));
  function onDown(event) { if (!inside(event.target)) close(); }
  function onKey(event) { if (event.key === 'Escape') close(); }
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);

  // 二级菜单：贴着父项右侧展开，空间不足就翻到左侧
  function openSubmenu(button, item) {
    if (closed || currentSub === button) return;
    closeChildren();
    currentSub = button;
    button.dataset.subActive = '1';
    Promise.resolve(item.submenu())
      .then((list) => {
        if (closed || !list || !list.length) return;
        const child = document.createElement('div');
        child.className = 'menu menu--popover menu--submenu';
        child.setAttribute('role', 'menu');
        child.innerHTML = list.map(menuItemHTML).join('');
        host.appendChild(child);
        const box = child.getBoundingClientRect();
        const anchor = button.getBoundingClientRect();
        const parent = menu.getBoundingClientRect();
        let left = parent.right + 2;
        if (left + box.width > window.innerWidth - 8) left = Math.max(8, parent.left - box.width - 2);
        let top = Math.max(8, Math.min(anchor.top - 6, window.innerHeight - box.height - 8));
        if (box.height > window.innerHeight - 16) {
          child.style.maxHeight = Math.max(160, window.innerHeight - 16) + 'px';
          child.style.overflowY = 'auto';
          top = 8;
        }
        child.style.left = left + 'px';
        child.style.top = top + 'px';
        requestAnimationFrame(() => child.classList.add('is-open'));
        childMenus.push({ element: child });
        bindMenuItems(child, list, close);
      })
      .catch(() => { currentSub = null; });
  }

  menu.addEventListener('pointerover', (event) => {
    const button = event.target.closest('[data-index]');
    if (!button) return;
    const item = items[Number(button.dataset.index)];
    if (item && item.submenu) openSubmenu(button, item);
    else if (childMenus.length) closeChildren();
  });

  bindMenuItems(menu, items, close, { onSubmenu: openSubmenu });
  return { close, element: menu };
}

function bindMenuItems(root, items, close, hooks = {}) {
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-index]');
    if (!button) return;
    const item = items[Number(button.dataset.index)];
    if (!item || item.disabled) return;
    if (item.submenu && hooks.onSubmenu) { hooks.onSubmenu(button, item); return; }
    close();
    if (item.onSelect) item.onSelect();
  });
}

/* ------------------------------ 歌曲列表 ------------------------------ */

export function sourceDots(track) {
  if (!track.sources || track.sources.length < 2) return '';
  const palette = { 'gd-netease': '#c62828', 'qj-tencent': '#31c27c', 'qj-kugou': '#2b7feb', 'qj-migu': '#e6421f', audius: '#7e57c2' };
  return '<span class="source-dots" title="' + track.sources.length + ' 个来源">' +
    track.sources.map((ref) => '<i style="background:' + (palette[ref.source] || 'currentColor') + '"></i>').join('') + '</span>';
}

function cachedIds() {
  const cache = store.state.cache;
  return cache && cache.ids instanceof Set ? cache.ids : null;
}

export function songRow(track, options = {}) {
  const playing = options.playingId === track.id;
  const sub = [track.artist, textOf(track.album)].filter(Boolean).join(' · ');
  const ids = cachedIds();
  const cached = ids ? ids.has(track.id) : false;
  return '<div class="list-item' + (playing ? ' is-playing' : '') + '" data-track-id="' + esc(track.id) + '" role="button" tabindex="0">' +
    '<div class="list-item__art">' + icon('music_note') + coverMarkup(track, { size: 120 }) + '</div>' +
    '<div class="list-item__body">' +
      '<div class="list-item__title">' + (playing ? '<span class="list-item__playing"><i></i><i></i><i></i></span>' : '') + esc(track.title) + '</div>' +
      '<div class="list-item__sub">' + esc(sub || '未知歌手') + '</div>' +
    '</div>' +
    '<div class="list-item__trail">' + (cached ? '<span class="cache-dot" title="已缓存">' + icon('download_done', 'icon--18') + '</span>' : '') + sourceDots(track) +
      (track.duration ? '<span class="t-label-m">' + fmtTime(track.duration) + '</span>' : '') +
      '<button class="icon-btn" data-more aria-label="更多操作" tabindex="0">' + icon('more_vert') + '</button>' +
    '</div>' +
  '</div>';
}

export function songList(tracks, options = {}) {
  return '<div class="list" data-songlist>' + tracks.map((track) => songRow(track, options)).join('') + '</div>';
}

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
      if (handlers.onMore) handlers.onMore(track, row.querySelector('[data-more]'), event);
      return;
    }
    if (handlers.onPlay) handlers.onPlay(track, tracks);
  });

  list.addEventListener('contextmenu', (event) => {
    const row = event.target.closest('[data-track-id]');
    if (!row) return;
    event.preventDefault();
    const track = byId.get(row.dataset.trackId);
    if (!track) return;
    if (handlers.onMore) handlers.onMore(track, row.querySelector('[data-more]'), event);
    else if (handlers.onInfo) handlers.onInfo(track, row);
  });

  list.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('[data-track-id]');
    if (!row) return;
    event.preventDefault();
    if (event.target.closest('[data-more]')) {
      if (handlers.onMore) handlers.onMore(byId.get(row.dataset.trackId), row.querySelector('[data-more]'), event);
    } else if (handlers.onPlay) {
      handlers.onPlay(byId.get(row.dataset.trackId), tracks);
    }
  });
}

export function emptyState(iconName, title, hint) {
  return '<div class="empty">' + icon(iconName) + '<div class="empty__title">' + esc(title) + '</div>' +
    (hint ? '<div class="t-body-m">' + esc(hint) + '</div>' : '') + '</div>';
}

export function sectionHeader(title, actionHtml) {
  return '<div class="section__head"><h2 class="section__title">' + esc(title) + '</h2>' + (actionHtml || '') + '</div>';
}

export { animate, icon };
