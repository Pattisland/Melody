/* 曲目操作菜单：移动端底部抽屉，桌面端贴着三点浮出 */
import { openActionMenu, openSheet, toast, askText } from './components.js';
import { esc, icon, splitArtists } from '../core/util.js';
import {
  isFavorite, toggleFavorite, listPlaylists, addToPlaylist, createPlaylist,
  getCacheEntry, removeCache, isSubscribed, addSubscription, removeSubscription, listSubscriptions,
} from '../data/repo.js';
import { enqueue, taskOf } from '../player/queue.js';
import { downloadTrack, saveLyrics } from '../download/download.js';
import { refreshCacheState } from './cache-state.js';
import { openTrackInfo } from './track-info.js';
import { store } from '../core/store.js';
import { player } from '../player/player.js';
import { router } from '../core/router.js';

export async function openTrackMenu(track, options = {}) {
  const profileId = store.state.profileId;
  if (!profileId) { toast('还没有档案'); return; }
  const rect = options.anchor && options.anchor.getBoundingClientRect ? options.anchor.getBoundingClientRect() : null;
  const point = options.point ? { x: options.point.clientX, y: options.point.clientY } : null;
  const artists = splitArtists(track.artist);
  const [favorited, cached, subscribedFlags] = await Promise.all([
    isFavorite(profileId, track.id),
    getCacheEntry(profileId, track.id),
    Promise.all(artists.map((name) => isSubscribed(profileId, name))),
  ]);
  const allSubscribed = artists.length > 0 && subscribedFlags.every(Boolean);

  const toggleArtistSubscription = async (name, subscribed) => {
    if (subscribed) {
      const subs = (store.state.subscriptions || []);
      const hit = subs.find((row) => row.artist === name);
      await removeSubscription(hit ? hit.id : profileId + ':' + name.toLowerCase());
      toast('已取消订阅「' + name + '」');
    } else {
      await addSubscription(profileId, name);
      toast('已订阅「' + name + '」，首页会更新');
    }
  };

  const downloadAudio = async (withLyrics) => {
    if (!cached) {
      const pending = taskOf(track.id);
      if (!pending) await enqueue(track);
      toast(pending ? '缓存进行中，完成后可在「任务进度」里下载' : '已加入缓存队列，完成后可在「任务进度」里下载');
      return;
    }
    try {
      await downloadTrack(profileId, track, { withLyrics });
    } catch (err) {
      toast('下载失败：' + err.message);
    }
  };

  const saveLyricFile = async () => {
    try {
      await saveLyrics(track);
      toast('歌词已保存为 .lrc');
    } catch (err) {
      toast(err && err.message === '没有找到歌词' ? '这首歌没有可用歌词' : '歌词下载失败：' + ((err && err.message) || '未知错误'));
    }
  };

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
    { icon: 'playlist_add', label: '加入歌单', submenu: () => playlistItems(track) },
    ...artists.slice(0, 3).map((name) => ({
      icon: 'person',
      label: (artists.length > 1 ? '查看歌手 · ' : '查看歌手 · ') + name,
      onSelect: () => router.go('/artist/' + encodeURIComponent(name)),
    })),
    ...(track.album ? [{
      icon: 'album',
      label: '查看专辑',
      onSelect: () => router.go('/album/' + encodeURIComponent(String(track.album))),
    }] : []),
    artists.length > 1
      ? {
        icon: allSubscribed ? 'person_remove' : 'person_add',
        label: '订阅歌手 · ' + artists.length + ' 位',
        submenu: () => artists.map((name, index) => ({
          icon: subscribedFlags[index] ? 'check_circle' : 'radio_button_unchecked',
          label: (subscribedFlags[index] ? '取消订阅 · ' : '订阅 · ') + name,
          onSelect: () => toggleArtistSubscription(name, subscribedFlags[index]),
        })),
      }
      : artists.length === 1
        ? {
          icon: subscribedFlags[0] ? 'person_remove' : 'person_add',
          label: subscribedFlags[0] ? '取消订阅这位歌手' : '订阅这位歌手',
          onSelect: () => toggleArtistSubscription(artists[0], subscribedFlags[0]),
        }
        : null,
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
      icon: 'download',
      label: '下载',
      submenu: async () => [
        { icon: 'save_alt', label: '下载歌曲', onSelect: () => downloadAudio(false) },
        { icon: 'subtitles', label: '下载歌词', onSelect: () => saveLyricFile() },
        { icon: 'download_for_offline', label: '下载歌词和歌曲', onSelect: () => { saveLyricFile(); downloadAudio(true); } },
      ],
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

/** 二级菜单内容：所有歌单 + 新建歌单 */
export async function playlistItems(track) {
  const profileId = store.state.profileId;
  const lists = await listPlaylists(profileId);
  const items = lists.map((list) => ({
    icon: 'queue_music',
    label: list.name,
    onSelect: async () => {
      await addToPlaylist(list.id, track);
      toast('已加入「' + list.name + '」');
      document.dispatchEvent(new CustomEvent('playlist:changed', { detail: { playlistId: list.id } }));
    },
  }));
  items.push({
    icon: 'add',
    label: '新建歌单',
    onSelect: async () => {
      const name = await askText({ title: '新建歌单', label: '歌单名称', placeholder: '例如：夜里开车', confirmText: '创建' });
      if (!name) return;
      const list = await createPlaylist(profileId, name);
      await addToPlaylist(list.id, track);
      toast('已加入「' + list.name + '」');
      document.dispatchEvent(new CustomEvent('playlist:changed', { detail: { playlistId: list.id } }));
    },
  });
  return items;
}

export async function openPlaylistPicker(track) {
  openActionMenu({ title: '加入歌单', items: await playlistItems(track) });
}
