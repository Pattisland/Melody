/* 曲库：系统歌单 + 自定义歌单 + 详情 */
import { esc, icon, fmtBytes, fmtTime } from '../../core/util.js';
import { router } from '../../core/router.js';
import { store } from '../../core/store.js';
import { listHistory, listFavorites, listCached, listPlaylists, createPlaylist, getProfile } from '../../data/repo.js';
import { songList, attachSongList, emptyState, toast } from '../components.js';
import { openTrackMenu } from '../track-menu.js';
import { openTrackInfo } from '../track-info.js';
import { player } from '../../player/player.js';

const SYSTEM = [
  { key: 'recent', label: '最近播放', icon: 'history', hint: '听过的歌按时间倒序' },
  { key: 'favorites', label: '我的喜欢', icon: 'favorite', hint: '点星标收藏的曲目' },
];

async function renderLibrary(root) {
  const profileId = store.state.profileId;
  const [history, favorites, playlists] = await Promise.all([
    listHistory(profileId, 6),
    listFavorites(profileId),
    listPlaylists(profileId),
  ]);
  const stats = { recent: history.length, favorites: favorites.length };

  root.innerHTML =
    '<h1 class="page-title">曲库</h1>' +
    '<div class="section"><div class="list">' + SYSTEM.map((item) =>
      '<div class="list-item" data-sys="' + item.key + '" role="button" tabindex="0">' +
        '<div class="list-item__art list-item__art--icon">' + icon(item.icon) + '</div>' +
        '<div class="list-item__body"><div class="list-item__title">' + esc(item.label) + '</div>' +
        '<div class="list-item__sub">' + (stats[item.key] || 0) + ' 首 · ' + esc(item.hint) + '</div></div>' +
        '<div class="list-item__trail">' + icon('chevron_right') + '</div>' +
      '</div>').join('') + '</div></div>' +
    '<div class="section">' +
      '<div class="section__head"><h2 class="section__title">我的歌单</h2>' +
      '<button class="btn btn--text btn--sm" data-new-list>' + icon('add') + '新建</button></div>' +
      (playlists.length
        ? '<div class="list">' + playlists.map((list) =>
            '<div class="list-item" data-list="' + esc(list.id) + '" role="button" tabindex="0">' +
              '<div class="list-item__art">' + icon('queue_music') + '</div>' +
              '<div class="list-item__body"><div class="list-item__title">' + esc(list.name) + '</div>' +
              '<div class="list-item__sub">' + new Date(list.updatedAt || list.createdAt).toLocaleDateString() + '</div></div>' +
              '<div class="list-item__trail">' + icon('chevron_right') + '</div>' +
            '</div>').join('') + '</div>'
        : '<div class="state-hint">还没有自定义歌单</div>') +
    '</div>';

  root.querySelectorAll('[data-sys]').forEach((button) => {
    button.addEventListener('click', () => router.go('/library/' + button.dataset.sys));
  });
  root.querySelectorAll('[data-list]').forEach((row) => {
    row.addEventListener('click', () => router.go('/library/p/' + row.dataset.list));
  });
  const create = root.querySelector('[data-new-list]');
  create.addEventListener('click', async () => {
    const created = await createPlaylist(profileId, '新建歌单');
    router.go('/library/p/' + created.id);
  });
}

async function renderDetail(root, kind, playlistId) {
  const profileId = store.state.profileId;
  let tracks = [];
  let title = '';
  if (kind === 'recent') {
    title = '最近播放';
    tracks = (await listHistory(profileId, 200)).map((row) => row.track);
  } else if (kind === 'favorites') {
    title = '我的喜欢';
    tracks = (await listFavorites(profileId)).map((row) => row.track);
  } else if (kind === 'cache') {
    title = '我的缓存';
    const rows = await listCached(profileId);
    tracks = rows.map((row) => ({ ...row.track, duration: row.track.duration || 0 }));
    const bytes = rows.reduce((sum, row) => sum + (row.bytes || 0), 0);
    root.innerHTML = '<p class="t-body-m muted" style="padding:0 4px 12px">共 ' + rows.length + ' 首 · ' + fmtBytes(bytes) + '</p>';
  } else if (kind === 'playlist' && playlistId) {
    title = '歌单';
    const rows = await (await import('../../data/repo.js')).listPlaylistItems(playlistId);
    tracks = rows.map((row) => row.track);
  }

  const host = document.createElement('div');
  if (!tracks.length) {
    host.innerHTML = emptyState(kind === 'cache' ? 'download_done' : 'music_note', '这里还是空的', kind === 'favorites' ? '在曲目菜单里点「收藏」' : kind === 'cache' ? '缓存后可以离线播放与下载' : '听过的歌会自动出现在这里');
  } else {
    host.innerHTML = songList(tracks, { playingId: store.state.player.track ? store.state.player.track.id : '' });
  }
  root.appendChild(host);

  attachSongList(host, tracks, {
    onPlay: (track) => player.playTrack(track, { queue: tracks }),
    onMore: (track, anchor, event) => openTrackMenu(track, {
      anchor, point: event,
      onFavoriteChange: () => { if (kind === 'favorites') routeReload(); },
      onCacheChange: () => { if (kind === 'cache') routeReload(); },
    }),
    onInfo: (track) => openTrackInfo(track),
  });
}

function routeReload() {
  const hash = location.hash;
  location.hash = '#/library';
  requestAnimationFrame(() => { location.hash = hash; });
}

export const libraryRoutes = [
  {
    path: '/library',
    level: 1,
    title: '曲库',
    mount: renderLibrary,
  },
  {
    path: '/library/:kind',
    level: 2,
    title: (ctx) => ({ recent: '最近播放', favorites: '我的喜欢' }[ctx.params.kind] || '曲库'),
    cache: true,
    mount: (root, ctx) => renderDetail(root, ctx.params.kind, ''),
  },
  {
    path: '/library/p/:id',
    level: 2,
    title: '歌单',
    cache: true,
    mount: (root, ctx) => renderDetail(root, 'playlist', ctx.params.id),
  },
  {
    path: '/me/cache',
    level: 2,
    title: '缓存管理',
    dest: 'me',
    cache: true,
    mount: (root) => renderDetail(root, 'cache', ''),
  },
];
