/* 歌手 / 专辑详情页：按名字再搜一次，筛出对应曲目 */
import { esc } from '../../core/util.js';
import { store } from '../../core/store.js';
import { searchAll } from '../../sources/registry.js';
import { songList, attachSongList, emptyState } from '../components.js';
import { openTrackMenu } from '../track-menu.js';
import { player } from '../../player/player.js';

async function renderCollection(root, ctx, kind) {
  const name = decodeURIComponent(ctx.params.name || '');
  root.innerHTML =
    '<h1 class="page-title">' + esc(name) + '</h1>' +
    '<div class="state-hint" data-status>' + (kind === 'artist' ? '歌手' : '专辑') + ' · 正在搜索…</div>';

  let tracks = [];
  try {
    const result = await searchAll(name, { settings: store.state.settings, limit: 40 });
    const all = result.tracks || [];
    const key = name.toLowerCase();
    tracks = kind === 'artist'
      ? all.filter((track) => String(track.artist || '').toLowerCase().includes(key))
      : all.filter((track) => String(track.album || '').toLowerCase().includes(key));
    if (!tracks.length) tracks = all.slice(0, 30);
  } catch (err) {
    const status = root.querySelector('[data-status]');
    if (status) status.textContent = '搜索失败：' + (err && err.message);
    return;
  }

  const status = root.querySelector('[data-status]');
  if (!tracks.length) {
    if (status) status.outerHTML = emptyState('search_off', '没有找到', '换个关键词试试');
    return;
  }
  if (status) status.textContent = tracks.length + ' 首';

  const host = document.createElement('div');
  host.innerHTML = songList(tracks, { playingId: store.state.player.track ? store.state.player.track.id : '' });
  root.appendChild(host);
  attachSongList(host, tracks, {
    onPlay: (track) => player.playTrack(track, { queue: tracks }),
    onMore: (track, anchor, event) => openTrackMenu(track, { anchor, point: event }),
  });
}

export const collectionRoutes = [
  { path: '/artist/:name', level: 2, title: '歌手', mount: (root, ctx) => renderCollection(root, ctx, 'artist') },
  { path: '/album/:name', level: 2, title: '专辑', mount: (root, ctx) => renderCollection(root, ctx, 'album') },
];
