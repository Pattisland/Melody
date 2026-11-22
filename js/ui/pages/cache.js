/* 缓存管理：占用统计、排序、单条移除与批量清理 */
import { esc, icon, fmtBytes, fmtTime } from '../../core/util.js';
import { store } from '../../core/store.js';
import { listCached, removeCache } from '../../data/repo.js';
import { coverMarkup } from '../cover.js';
import { emptyState, toast, openDialog } from '../components.js';
import { refreshCacheState } from '../cache-state.js';
import { onDataChange } from '../live.js';
import { player } from '../../player/player.js';

let sortMode = 'recent';

function sortRows(rows) {
  const list = rows.slice();
  if (sortMode === 'size') return list.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  if (sortMode === 'name') return list.sort((a, b) => String(a.track.title || '').localeCompare(String(b.track.title || ''), 'zh'));
  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function rowHTML(row) {
  const track = row.track || {};
  const date = row.createdAt ? new Date(row.createdAt).toLocaleDateString('zh-CN') : '';
  const sub = [fmtBytes(row.bytes || 0), track.duration ? fmtTime(track.duration) : '', date].filter(Boolean).join(' · ');
  return '<div class="list-item cache-row" data-track-id="' + esc(track.id || '') + '" role="button" tabindex="0">' +
    '<div class="list-item__art">' + icon('music_note') + coverMarkup(track, { size: 120 }) + '</div>' +
    '<div class="list-item__body"><div class="list-item__title">' + esc(track.title || '未知曲目') + '</div>' +
    '<div class="list-item__sub">' + esc(sub) + '</div></div>' +
    '<div class="list-item__trail">' +
      '<button class="icon-btn" data-play="' + esc(track.id || '') + '" aria-label="播放">' + icon('play_arrow', 'icon--20') + '</button>' +
      '<button class="icon-btn" data-remove="' + esc(track.id || '') + '" aria-label="移除缓存">' + icon('delete', 'icon--20') + '</button>' +
    '</div></div>';
}

async function storageLine() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return '';
    const info = await navigator.storage.estimate();
    if (!info || !info.quota) return '';
    const used = fmtBytes(info.usage || 0);
    const quota = fmtBytes(info.quota);
    const percent = Math.min(100, Math.round(((info.usage || 0) / info.quota) * 100));
    return '<div class="cache-stats__meter" title="浏览器分配给你的存储配额">' +
      '<span style="width:' + Math.max(2, percent) + '%"></span></div>' +
      '<div class="cache-stats__hint">浏览器配额 ' + used + ' / ' + quota + '（' + percent + '%）</div>';
  } catch (_) {
    return '';
  }
}

async function render(root) {
  const profileId = store.state.profileId;
  if (!profileId) { root.innerHTML = emptyState('person', '正在准备档案…'); return; }
  const rows = sortRows(await listCached(profileId));
  const total = rows.reduce((sum, row) => sum + (row.bytes || 0), 0);
  const offlineReady = 'serviceWorker' in navigator && navigator.serviceWorker.controller
    ? '离线壳已就绪' : '离线壳还没接管（刷新一次即可）';

  root.innerHTML =
    '<div class="cache-stats">' +
      '<div class="cache-stats__row">' +
        '<div class="cache-stats__item"><b>' + rows.length + '</b><i>首已缓存</i></div>' +
        '<div class="cache-stats__item"><b>' + fmtBytes(total) + '</b><i>占用空间</i></div>' +
      '</div>' +
      '<!-- meter -->' +
      '<div class="cache-stats__offline">' + icon('cloud_done', 'icon--18') + offlineReady + '</div>' +
    '</div>' +
    '<div class="row gap-8 cache-actions">' +
      '<div class="segmented segmented--sm" data-sort>' +
        [['recent', '最近'], ['size', '大小'], ['name', '名称']].map(([key, label]) =>
          '<button class="segmented__item" data-value="' + key + '" aria-selected="' + (sortMode === key) + '">' + label + '</button>').join('') +
      '</div>' +
      '<div class="row gap-8" style="margin-left:auto">' +
        (rows.length ? '<button class="btn btn--text btn--sm" data-play-all>' + icon('play_arrow') + '顺序播放</button>' : '') +
        (rows.length ? '<button class="btn btn--text btn--sm" data-clear-cache>' + icon('delete_sweep') + '清空</button>' : '') +
      '</div>' +
    '</div>' +
    (rows.length ? '<div class="list" data-cache-list>' + rows.map(rowHTML).join('') + '</div>'
      : emptyState('download_done', '还没有缓存', '在曲目菜单里点「加入缓存队列」，缓存后可以离线播放与下载'));

  const meter = await storageLine();
  if (meter) {
    const host = root.querySelector('.cache-stats');
    if (host) host.insertAdjacentHTML('beforeend', meter);
  }

  const profile = profileId;
  root.querySelectorAll('[data-sort] .segmented__item').forEach((button) => {
    button.addEventListener('click', () => { sortMode = button.dataset.value; render(root); });
  });
  root.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await removeCache(profile, button.dataset.remove);
      await refreshCacheState(profile);
      toast('已移除缓存');
    });
  });
  root.querySelectorAll('[data-play]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const row = rows.find((item) => item.track && item.track.id === button.dataset.play);
      if (row) player.playTrack(row.track, { queue: rows.map((item) => item.track) });
    });
  });
  root.querySelectorAll('.cache-row').forEach((row) => {
    row.addEventListener('click', () => {
      const hit = rows.find((item) => item.track && item.track.id === row.dataset.trackId);
      if (hit) player.playTrack(hit.track, { queue: rows.map((item) => item.track) });
    });
  });
  const playAll = root.querySelector('[data-play-all]');
  if (playAll) playAll.addEventListener('click', () => {
    const queue = rows.map((item) => item.track);
    if (queue.length) player.playTrack(queue[0], { queue });
  });
  const clear = root.querySelector('[data-clear-cache]');
  if (clear) clear.addEventListener('click', () => {
    openDialog({
      title: '清空全部缓存？',
      description: '会删除 ' + rows.length + ' 首、共 ' + fmtBytes(total) + ' 的音频；收藏与歌单不受影响。',
      actions: [
        { label: '取消', variant: 'text' },
        { label: '清空', variant: 'danger', onClick: async () => {
          for (const row of rows) await removeCache(profile, row.track && row.track.id);
          await refreshCacheState(profile);
          toast('缓存已清空');
        } },
      ],
    });
  });
}

export async function mountCache(root) {
  await render(root);
  onDataChange(root, () => { if (root.isConnected) render(root); }, { kinds: ['cache'] });
}

export const cacheRoute = { path: '/me/cache', level: 2, dest: 'me', title: '缓存管理', cache: true, mount: mountCache };
