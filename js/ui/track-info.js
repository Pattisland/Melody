/* 曲目详情：来源、时长、缓存状态 */
import { esc, icon, fmtTime, fmtBytes } from '../core/util.js';
import { store } from '../core/store.js';
import { openDialog } from './components.js';
import { coverMarkup } from './cover.js';
import { getCacheEntry, isFavorite } from '../data/repo.js';
import { SOURCE_BY_KEY } from '../sources/registry.js';

export async function openTrackInfo(track) {
  const profileId = store.state.profileId;
  const [cached, favorited] = await Promise.all([
    getCacheEntry(profileId, track.id).catch(() => null),
    isFavorite(profileId, track.id).catch(() => false),
  ]);

  const sources = (track.sources || []).map((ref) => {
    const adapter = SOURCE_BY_KEY.get(ref.source);
    return '<div class="info-source">' + icon('album', 'icon--18') +
      '<b>' + esc(adapter ? adapter.label : ref.source) + '</b>' +
      '<code>' + esc(ref.source) + '</code>' +
      '<code>id ' + esc(ref.id || '—') + '</code></div>';
  }).join('') || '<div class="t-body-m muted">没有来源信息</div>';

  const body =
    '<div class="info-head">' +
      '<div class="info-head__art">' + icon('music_note') + coverMarkup(track, { size: 200 }) + '</div>' +
      '<div class="grow"><div class="t-title-m">' + esc(track.title) + '</div>' +
      '<div class="t-body-m muted">' + esc(track.artist || '未知歌手') + '</div></div>' +
    '</div>' +
    '<dl class="info-kv">' +
      '<dt>专辑</dt><dd>' + esc(track.album || '—') + '</dd>' +
      '<dt>时长</dt><dd>' + (track.duration ? fmtTime(track.duration) : '未知') + '</dd>' +
      '<dt>曲目 ID</dt><dd><code>' + esc(track.id) + '</code></dd>' +
      '<dt>收藏</dt><dd>' + (favorited ? '已收藏' : '未收藏') + '</dd>' +
      '<dt>缓存</dt><dd>' + (cached ? '已缓存 · ' + fmtBytes(cached.bytes) + ' · ' + esc(cached.mime || '') : '未缓存') + '</dd>' +
    '</dl>' +
    '<div class="divider"></div>' +
    '<div class="t-label-l muted">来源（' + (track.sources || []).length + '）</div>' +
    sources;

  openDialog({
    title: '曲目详细信息',
    body,
    actions: [{ label: '关闭', variant: 'text' }],
  });
}
