/* 播放队列面板：正在播放 + 接下来，可跳转、移除、清空 */
import { esc, icon } from '../core/util.js';
import { openDialog, openSheet, toast } from './components.js';
import { coverMarkup } from './cover.js';
import { player } from '../player/player.js';

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

function listMarkup() {
  const queue = player.queue || [];
  const index = player.index;
  const current = index >= 0 ? queue[index] : null;
  const upcoming = index >= 0 ? queue.slice(index + 1) : queue.slice();
  let html = '<div class="qlist">';
  if (!queue.length) {
    html += '<div class="qlist__empty">队列还是空的。在曲目菜单里点「立即播放」或「加入播放队列」。</div>';
    return html + '</div>';
  }
  if (current) {
    html += '<div class="qlist__head">正在播放</div>' + rowMarkup(current, { current: true, index });
  }
  html += '<div class="qlist__head">接下来 · ' + upcoming.length + ' 首' +
    (upcoming.length ? '<button class="btn btn--text btn--sm" data-q-clear>清空</button>' : '') + '</div>';
  html += upcoming.length
    ? upcoming.map((track, i) => rowMarkup(track, { index: index + 1 + i })).join('')
    : '<div class="qlist__empty">后面没有排队的曲目了</div>';
  return html + '</div>';
}

/** 桌面用对话框、移动端用底部抽屉，内容一致 */
export function openQueuePanel() {
  const desktop = window.matchMedia('(min-width: 840px)').matches;
  const panel = desktop
    ? openDialog({ title: '播放队列', body: '<div data-qlist></div>', actions: [{ label: '关闭', variant: 'text' }] })
    : openSheet({ title: '播放队列', body: '<div data-qlist></div>' });
  const host = panel.element.querySelector('[data-qlist]');
  if (!host) return panel;

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
    const row = event.target.closest('[data-q-index]');
    if (!row) return;
    const index = Number(row.dataset.qIndex);
    if (!Number.isFinite(index) || index === player.index) return;
    player.playAt(index);
    panel.close();
  });

  return panel;
}
