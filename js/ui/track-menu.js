/* 曲目操作菜单：移动端底部抽屉，桌面端贴着三点浮出 */
import { openActionMenu, openSheet, toast, askText } from './components.js';
import { esc, icon } from '../core/util.js';
import {
  isFavorite, toggleFavorite, listPlaylists, addToPlaylist, createPlaylist,
  getCacheEntry, removeCache, isSubscribed, addSubscription, removeSubscription,
} from '../data/repo.js';
import { enqueue, taskOf } from '../player/queue.js';
import { downloadTrack } from '../download/download.js';
import { refreshCacheState } from './cache-state.js';
import { openTrackInfo } from './track-info.js';
import { store } from '../core/store.js';
import { player } from '../player/player.js';

export async function openTrackMenu(track, options = {}) {
  const profileId = store.state.profileId;
  if (!profileId) { toast('还没有档案'); return; }
  const rect = options.anchor && options.anchor.getBoundingClientRect ? options.anchor.getBoundingClientRect() : null;
  const point = options.point ? { x: options.point.clientX, y: options.point.clientY } : null;
  const [favorited, cached, subscribed] = await Promise.all([
    isFavorite(profileId, track.id),
    getCacheEntry(profileId, track.id),
    isSubscribed(profileId, String(track.artist || '').split(' / ')[0]),
  ]);

  const items = [
    ...(options.extra || []),
    { icon: 'play_arrow', label: '立即播放', onSelect: () => player.playTrack(track) },
    {
      icon: favorited ? 'favorite' : 'favorite_border',
      label: favorited ? '取消收藏' : '收藏',
      onSelect: async () => {
        const now = await toggleFavorite(profileId, track);
        toast(now ? '已加入我的喜欢' : '已取消收藏');
        if (options.onFavoriteChange) options.onFavoriteChange(track.id, now);
      },
    },
    { icon: 'playlist_add', label: '加入歌单', onSelect: () => openPlaylistPicker(track) },
    {
      icon: subscribed ? 'person_remove' : 'person_add',
      label: subscribed ? '取消订阅这位歌手' : '订阅这位歌手',
      onSelect: async () => {
        const artist = String(track.artist || '').split(' / ')[0];
        if (!artist) { toast('这位曲目没有歌手信息'); return; }
        if (subscribed) {
          const subs = (store.state.subscriptions || []);
          const hit = subs.find((row) => row.artist === artist);
          await removeSubscription(hit ? hit.id : profileId + ':' + artist.toLowerCase());
          toast('已取消订阅「' + artist + '」');
        } else {
          await addSubscription(profileId, artist);
          toast('已订阅「' + artist + '」，首页会更新');
        }
      },
    },
    {
      icon: cached ? 'download_done' : 'download',
      label: cached ? '重新缓存' : '加入缓存队列',
      onSelect: async () => {
        if (cached) await removeCache(profileId, track.id);
        const added = await enqueue(track);
        await refreshCacheState(profileId);
        toast(added ? '已加入缓存队列' : '已在队列中');
        if (options.onCacheChange) options.onCacheChange();
      },
    },
    {
      icon: 'save_alt',
      label: '下载到设备',
      hint: cached ? '' : '未缓存，会先加入队列',
      onSelect: async () => {
        if (!cached) {
          const pending = taskOf(track.id);
          if (!pending) await enqueue(track);
          toast(pending ? '缓存进行中，完成后可在「任务进度」里下载' : '已加入缓存队列，完成后可在「任务进度」里下载');
          return;
        }
        try { await downloadTrack(profileId, track); } catch (err) { toast('下载失败：' + err.message); }
      },
    },
    cached ? {
      icon: 'delete',
      label: '移除缓存',
      onSelect: async () => {
        await removeCache(profileId, track.id);
        await refreshCacheState(profileId);
        toast('已移除缓存');
        if (options.onCacheChange) options.onCacheChange();
      },
    } : null,
    { icon: 'info', label: '查看详细信息', onSelect: () => openTrackInfo(track) },
    {
      icon: 'queue_music',
      label: '加入播放队列',
      onSelect: () => {
        const queue = store.state.player.queue.slice();
        if (!queue.some((item) => item.id === track.id)) queue.push(track);
        store.patch('player', { queue });
        toast('已加入播放队列');
      },
    },
  ].filter(Boolean);

  return openActionMenu({ title: track.title, anchor: options.anchor, rect, point, items });
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
      const name = await askText({ title: '新建歌单', label: '歌单名称', placeholder: '例如：夜里开车', confirmText: '创建' });
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
