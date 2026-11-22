/* 缓存管理：只在清理时用——按名称/作者筛选、排序、单条移除 */
import { esc, icon, fmtBytes, fmtTime } from '../../core/util.js';
import { store } from '../../core/store.js';
import { listCached, removeCache } from '../../data/repo.js';
import { coverMarkup } from '../cover.js';
import { emptyState, toast } from '../components.js';
import { refreshCacheState } from '../cache-state.js';
import { onDataChange } from '../live.js';

let sortMode = 'recent';
let query = '';

function match(row, keyword) {
  if (!keyword) return true;
  const track = row.track || {};
  const haystack = [track.title, track.artist, track.album].join(' ').toLowerCase();
  return haystack.includes(keyword);
}

function sortRows(rows) {
  const list = rows.slice();
  if (sortMode === 'size') return list.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  if (sortMode === 'name') return list.sort((a, b) => String(a.track && a.track.title || '').localeCompare(String(b.track && b.track.title || ''), 'zh'));
  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function rowHTML(row) {
  const track = row.track || {};
  const date = row.createdAt ? new Date(row.createdAt).toLocaleDateString('zh-CN') : '';
  const sub = [fmtBytes(row.bytes || 0), track.duration ? fmtTime(track.duration) : '', date, track.artist || ''].filter(Boolean).join(' · ');
  return '<div class="list-item cache-row" data-track-id="' + esc(track.id || '') + '">' +
    '<div class="list-item__art">' + icon('music_note') + coverMarkup(track, { size: 120 }) + '</div>' +
    '<div class="list-item__body"><div class="list-item__title">' + esc(track.title || '未知曲目') + '</div>' +
    '<div class="list-item__sub">' + esc(sub) + '</div></div>' +
    '<div class="list-item__trail">' +
      '<button class="icon-btn" data-remove="' + esc(track.id || '') + '" aria-label="移除缓存">' + icon('delete', 'icon--20') + '</button>' +
    '</div></div>';
}

async function render(root) {
  const profileId = store.state.profileId;
  if (!profileId) { root.innerHTML = emptyState('person', '正在准备档案…'); return; }
  const all = await listCached(profileId);
  const rows = sortRows(all.filter((row) => match(row, query)));

  root.innerHTML =
    '<div class="searchbar cache-search">' +
      '<span class="icon" aria-hidden="true" style="margin-left:8px">search</span>' +
      '<input class="searchbar__input" type="search" data-cache-search value="' + esc(query) + '" placeholder="按歌曲名或作者筛选" aria-label="筛选缓存">' +
    '</div>' +
    '<div class="row gap-8 cache-actions">' +
      '<div class="segmented segmented--sm" data-sort>' +
        [['recent', '最近'], ['name', '名称'], ['size', '大小']].map(([key, label]) =>
          '<button class="segmented__item" data-value="' + key + '" aria-selected="' + (sortMode === key) + '">' + label + '</button>').join('') +
      '</div>' +
      '<span class="cache-count">' + (query ? rows.length + ' / ' + all.length : all.length + ' 首') + '</span>' +
    '</div>' +
    (rows.length
      ? '<div class="list" data-cache-list>' + rows.map(rowHTML).join('') + '</div>'
      : all.length
        ? emptyState('search_off', '没有匹配的缓存', '换个关键词试试')
        : emptyState('download_done', '还没有缓存', '在曲目菜单里点「加入缓存队列」，缓存后可以离线播放与下载'));

  const input = root.querySelector('[data-cache-search]');
  if (input) {
    let timer = 0;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        query = input.value.trim().toLowerCase();
        const at = input.selectionStart;
        render(root);
        const next = root.querySelector('[data-cache-search]');
        if (next) { next.focus({ preventScroll: true }); next.setSelectionRange(at, at); }
      }, 220);
    });
  }
  root.querySelectorAll('[data-sort] .segmented__item').forEach((button) => {
    button.addEventListener('click', () => { sortMode = button.dataset.value; render(root); });
  });
  root.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', async () => {
      await removeCache(profileId, button.dataset.remove);
      await refreshCacheState(profileId);
      toast('已移除缓存');
    });
  });
}

export async function mountCache(root) {
  await render(root);
  onDataChange(root, () => { if (root.isConnected) render(root); }, { kinds: ['cache'] });
}

export const cacheRoute = { path: '/me/cache', level: 2, dest: 'me', title: '缓存管理', cache: true, mount: mountCache };
