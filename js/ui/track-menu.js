/* 曲目操作菜单 */
import { openSheet, toast, songRow } from './components.js';
import { esc, icon } from '../core/util.js';
import { isFavorite, toggleFavorite, listPlaylists, addToPlaylist, createPlaylist, getCacheEntry, removeCache } from '../data/repo.js';
import { cacheTrack } from '../player/cache.js';
import { downloadTrack } from '../download/download.js';
import { store } from '../core/store.js';
import { player } from '../player/player.js';

function actionRow(iconName, label, hint, action, disabled) {
  return '<div class="list-item" data-action="' + esc(action) + '" role="button" tabindex="0"' + (disabled ? ' aria-disabled="true"' : '') + '>' +
    '<div class="list-item__art list-item__art--icon">' + icon(iconName) + '</div>' +
    '<div class="list-item__body"><div class="list-item__title">' + esc(label) + '</div>' +
    (hint ? '<div class="list-item__sub">' + esc(hint) + '</div>' : '') + '</div></div>';
}

export async function openTrackMenu(track, options = {}) {
  const profileId = store.state.profileId;
  if (!profileId) { toast('还没有档案'); return; }
  const favorited = await isFavorite(profileId, track.id);
  const cached = await getCacheEntry(profileId, track.id);

  const body = '<div class="stack gap-8">' +
    '<div class="row gap-12" style="padding: 0 8px 8px">' +
      '<div class="list-item__art" style="width:56px;height:56px;border-radius:var(--shape-md)">' +
        (track.artwork ? '<img data-cover src="' + esc(track.artwork) + '" alt="">' : icon('music_note')) +
      '</div>' +
      '<div class="grow"><div class="t-title-m ellipsis">' + esc(track.title) + '</div>' +
      '<div class="t-body-m muted ellipsis">' + esc(track.artist || '未知歌手') + '</div></div>' +
    '</div>' +
    actionRow('play_arrow', '立即播放', '', 'play') +
    actionRow(favorited ? 'favorite' : 'favorite_border', favorited ? '取消收藏' : '收藏', '', 'fav') +
    actionRow('playlist_add', '加入歌单', '', 'playlist') +
    actionRow('download', cached ? '重新缓存' : '缓存到本地', cached ? '' : '缓存后即可下载', 'cache') +
    actionRow('save_alt', '下载到设备', cached ? '保留原始音质与标签' : '需要先缓存', 'download', !cached) +
    (cached ? actionRow('delete', '移除缓存', '', 'uncache') : '') +
    actionRow('queue_music', '加入播放队列', '', 'queue') +
  '</div>';

  const sheet = openSheet({ title: '曲目', body });
  const map = { play: 'play', fav: 'fav', playlist: 'playlist', cache: 'cache', download: 'download', uncache: 'uncache', queue: 'queue' };

  sheet.body.addEventListener('click', async (event) => {
    const row = event.target.closest('[data-action]');
    if (!row) return;
    const action = row.dataset.action;
    if (row.getAttribute('aria-disabled') === 'true') { toast('先缓存，再下载'); return; }
    if (action === 'play') { sheet.close(); player.playTrack(track); return; }
    if (action === 'fav') {
      const now = await toggleFavorite(profileId, track);
      toast(now ? '已加入我的喜欢' : '已取消收藏');
      if (options.onFavoriteChange) options.onFavoriteChange(track.id, now);
      sheet.close();
      return;
    }
    if (action === 'playlist') { sheet.close(); openPlaylistPicker(track); return; }
    if (action === 'cache') {
      sheet.close();
      const size = cacheTrack(profileId, track, { settings: store.state.settings, onProgress: (got, total) => {
        if (total) toast('缓存 ' + Math.round((got / total) * 100) + '%', { timeout: 1200 });
      }});
      toast('开始缓存…');
      try { await size; toast('缓存完成'); } catch (err) { toast('缓存失败：' + err.message); }
      if (options.onCacheChange) options.onCacheChange();
      return;
    }
    if (action === 'download') {
      sheet.close();
      try { await downloadTrack(profileId, track); } catch (err) { toast('下载失败：' + err.message); }
      return;
    }
    if (action === 'uncache') {
      await removeCache(profileId, track.id);
      toast('已移除缓存');
      if (options.onCacheChange) options.onCacheChange();
      sheet.close();
      return;
    }
    if (action === 'queue') {
      const queue = store.state.player.queue.slice();
      if (!queue.some((item) => item.id === track.id)) queue.push(track);
      store.patch('player', { queue });
      toast('已加入播放队列');
      sheet.close();
    }
  });
}

export async function openPlaylistPicker(track) {
  const profileId = store.state.profileId;
  const lists = await listPlaylists(profileId);
  const body = lists.map((list) =>
    '<div class="list-item" data-list="' + esc(list.id) + '" role="button" tabindex="0">' +
    '<div class="list-item__art list-item__art--icon">' + icon('queue_music') + '</div>' +
    '<div class="list-item__body"><div class="list-item__title">' + esc(list.name) + '</div></div></div>').join('') +
    '<div class="list-item" data-new role="button" tabindex="0"><div class="list-item__art list-item__art--icon">' + icon('add') + '</div>' +
    '<div class="list-item__body"><div class="list-item__title">新建歌单</div></div></div>';

  const sheet = openSheet({ title: '加入歌单', body });
  sheet.body.addEventListener('click', async (event) => {
    const row = event.target.closest('[data-list]');
    const createRow = event.target.closest('[data-new]');
    if (createRow) {
      const name = window.prompt('歌单名称', '新建歌单');
      if (!name) return;
      const list = await createPlaylist(profileId, name);
      await addToPlaylist(list.id, track);
      toast('已加入「' + list.name + '」');
      sheet.close();
      return;
    }
    if (!row) return;
    await addToPlaylist(row.dataset.list, track);
    toast('已加入歌单');
    sheet.close();
  });
}
