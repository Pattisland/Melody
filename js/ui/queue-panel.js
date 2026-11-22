/* 播放队列：桌面贴在按钮下方浮出，移动端从底部升起；含循环与随机开关 */
import { esc, icon } from '../core/util.js';
import { openDialog, openSheet, toast } from './components.js';
import { coverMarkup } from './cover.js';
import { player } from '../player/player.js';

const REPEAT_LABEL = { off: '顺序播放', all: '列表循环', one: '单曲循环' };

function rowMarkup(track, options) {
  return '<div class="qlist__row' + (options.current ? ' is-current' : '') + '" data-q-index="' + options.index + '" role="button" tabindex="0">' +
    '<div class="qlist__art">' + icon('music_note') + coverMarkup(track, { size: 64 }) + '</div>' +
    '<div class="qlist__body"><div class="qlist__title">' + esc(track.title) + '</div>' +
    '<div class="qlist__sub">' + esc(track.artist || '未知歌手') + '</div></div>' +
    (options.current
      ? '<span class="qlist__tag">正在播放</span>'
      : '<button class="icon-btn qlist__remove" data-q-remove="' + esc(track.id) + '" aria-label="从队列移除">' + icon('close', 'icon--20') + '</button>') +
    '</div>';
}

function modeMarkup() {
  return '<div class="qlist__modes">' +
    '<button class="chip qlist__mode" data-q-shuffle aria-pressed="' + player.shuffle + '">' +
      icon('shuffle', 'icon--18') + (player.shuffle ? '随机开' : '随机关') + '</button>' +
    '<button class="chip qlist__mode" data-q-repeat>' + icon(player.repeat === 'one' ? 'repeat_one' : 'repeat', 'icon--18') +
      (REPEAT_LABEL[player.repeat] || REPEAT_LABEL.off) + '</button>' +
    '</div>';
}

function listMarkup() {
  const queue = player.queue || [];
  const index = player.index;
  const current = index >= 0 ? queue[index] : null;
  const upcoming = index >= 0 ? queue.slice(index + 1) : queue.slice();
  let html = '<div class="qlist">' + modeMarkup();
  if (!queue.length) {
    html += '<div class="qlist__empty">队列还是空的。在曲目菜单里点「立即播放」或「加入播放队列」。</div>';
    return html + '</div>';
  }
  if (current) html += '<div class="qlist__head">正在播放</div>' + rowMarkup(current, { current: true, index });
  html += '<div class="qlist__head">接下来 · ' + upcoming.length + ' 首' +
    (upcoming.length ? '<button class="btn btn--text btn--sm" data-q-clear>清空</button>' : '') + '</div>';
  html += upcoming.length
    ? upcoming.map((track, i) => rowMarkup(track, { index: index + 1 + i })).join('')
    : '<div class="qlist__empty">后面没有排队的曲目了</div>';
  return html + '</div>';
}

function bind(host, onClose) {
  const render = () => { host.innerHTML = listMarkup(); };
  render();
  host.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-q-remove]');
    if (remove) {
      event.stopPropagation();
      player.removeFromQueue(remove.dataset.qRemove);
      render();
      return;
    }
    if (event.target.closest('[data-q-clear]')) {
      player.clearUpcoming();
      toast('已清空接下来的曲目');
      render();
      return;
    }
    if (event.target.closest('[data-q-shuffle]')) {
      player.toggleShuffle();
      render();
      return;
    }
    if (event.target.closest('[data-q-repeat]')) {
      player.cycleRepeat();
      render();
      return;
    }
    const row = event.target.closest('[data-q-index]');
    if (!row) return;
    const index = Number(row.dataset.qIndex);
    if (!Number.isFinite(index) || index === player.index) return;
    player.playAt(index);
    if (onClose) onClose();
  });
  return render;
}

/** 桌面端：贴着触发按钮往下弹 */
function openPopover(anchor) {
  const host = document.getElementById('dialog-root');
  const panel = document.createElement('div');
  panel.className = 'queue-popover';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '播放队列');
  panel.innerHTML = '<div class="queue-popover__head"><span>播放队列</span>' +
    '<button class="icon-btn" data-q-close aria-label="关闭">' + icon('close', 'icon--20') + '</button></div>' +
    '<div data-qlist></div>';
  host.appendChild(panel);
  // 先填内容再量尺寸，否则量到的是空列表的高度，会把浮窗放错位置
  bind(panel.querySelector('[data-qlist]'), () => close());
  const rect = anchor.getBoundingClientRect();
  // 用 offsetWidth/Height：入场动画有 scale，getBoundingClientRect 会偏小
  const box = { width: panel.offsetWidth, height: panel.offsetHeight };
  const left = Math.min(Math.max(8, rect.right - box.width), window.innerWidth - box.width - 8);
  const below = window.innerHeight - rect.bottom - 16;
  const above = rect.top - 16;
  let height = box.height;
  let top = rect.bottom + 6;
  // 迷你条贴着屏幕底部：下面放不下就整体翻到按钮上方，并把高度收进可视区
  if (height > below && above > below) {
    height = Math.min(height, above);
    top = Math.max(8, rect.top - height - 8);
    panel.classList.add('is-up');
  } else if (height > below) {
    height = Math.max(220, below);
  }
  if (height < box.height) {
    panel.style.maxHeight = height + 'px';
    panel.classList.add('is-scroll');
  }
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  requestAnimationFrame(() => panel.classList.add('is-open'));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    panel.classList.remove('is-open');
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => panel.remove(), 160);
  };
  const onDown = (event) => { if (!panel.contains(event.target) && !anchor.contains(event.target)) close(); };
  const onKey = (event) => { if (event.key === 'Escape') close(); };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  panel.querySelector('[data-q-close]').addEventListener('click', close);
  return { close, element: panel };
}

/**
 * @param {{anchor?: HTMLElement}} options 传 anchor 时桌面贴按钮浮出，否则用底部抽屉/对话框
 */
export function openQueuePanel(options = {}) {
  const desktop = window.matchMedia('(min-width: 840px)').matches;
  if (desktop && options.anchor) return openPopover(options.anchor);
  if (desktop) {
    const panel = openDialog({ title: '播放队列', body: '<div data-qlist></div>', actions: [{ label: '关闭', variant: 'text' }] });
    bind(panel.element.querySelector('[data-qlist]'), panel.close);
    return panel;
  }
  const sheet = openSheet({ title: '播放队列', body: '<div data-qlist></div>' });
  bind(sheet.element.querySelector('[data-qlist]'), sheet.close);
  return sheet;
}
