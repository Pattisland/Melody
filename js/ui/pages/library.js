/* 曲库：系统歌单 + 自定义歌单 + 详情 */
import { esc, icon, fmtBytes, fmtTime } from '../../core/util.js';
import { router } from '../../core/router.js';
import { store } from '../../core/store.js';
import { listHistory, listFavorites, listCached, listPlaylists, createPlaylist,
  listPlaylistItems, deletePlaylist, removeFromPlaylist, updatePlaylist,
  movePlaylistItem } from '../../data/repo.js';
import { songList, attachSongList, emptyState, toast, askText, openDialog } from '../components.js';
import { coverMarkup } from '../cover.js';
import { openTrackMenu } from '../track-menu.js';
import { openTrackInfo } from '../track-info.js';
import { onDataChange } from '../live.js';
import { saveBlob } from '../../download/download.js';
import { player } from '../../player/player.js';

const SYSTEM = [
  { key: 'recent', label: '最近播放', icon: 'history', hint: '听过的歌按时间倒序' },
  { key: 'favorites', label: '我的喜欢', icon: 'favorite', hint: '点星标收藏的曲目' },
];

function safeName(text) {
  return String(text || '').replace(/[\\/:*?"<>|\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || '歌单';
}

function totalTime(tracks) {
  return fmtTime(tracks.reduce((sum, track) => sum + (track.duration || 0), 0));
}

async function renderLibrary(root) {
  const profileId = store.state.profileId;
  const [history, favorites, playlists] = await Promise.all([
    listHistory(profileId, 6),
    listFavorites(profileId),
    listPlaylists(profileId),
  ]);
  const stats = { recent: history.length, favorites: favorites.length };
  const details = await Promise.all(playlists.map(async (list) => {
    const items = await listPlaylistItems(list.id);
    return { list, first: items[0] ? items[0].track : null, count: items.length };
  }));

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
        ? '<div class="list">' + details.map(({ list, first, count }) =>
            '<div class="list-item" data-list="' + esc(list.id) + '" role="button" tabindex="0">' +
              '<div class="list-item__art">' + icon('queue_music') +
                (first ? coverMarkup(first, { size: 120 }) : '') + '</div>' +
              '<div class="list-item__body"><div class="list-item__title">' + esc(list.name) + '</div>' +
              '<div class="list-item__sub">' + count + ' 首' +
                (list.description ? ' · ' + esc(list.description) : ' · ' + new Date(list.updatedAt || list.createdAt).toLocaleDateString()) +
              '</div></div>' +
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
  onDataChange(root, () => router.render());
  const create = root.querySelector('[data-new-list]');
  create.addEventListener('click', async () => {
    const name = await askText({ title: '新建歌单', label: '歌单名称', placeholder: '例如：夜里开车', confirmText: '创建' });
    if (!name) return;
    const created = await createPlaylist(profileId, name);
    router.go('/library/p/' + created.id);
  });
}

function askDescription(current) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const dialog = openDialog({
      title: '歌单描述',
      body: '<label class="field"><span class="field__label">描述</span>' +
        '<textarea class="input textarea" data-desc rows="4" placeholder="这个歌单适合什么时候听">' + esc(current || '') + '</textarea></label>',
      actions: [
        { label: '取消', variant: 'text', onClick: () => done(null) },
        { label: '保存', variant: 'filled', onClick: () => {
          const box = dialog.element.querySelector('[data-desc]');
          done(box ? box.value.trim() : '');
        } },
      ],
      onClose: () => done(null),
    });
    const box = dialog.element.querySelector('[data-desc]');
    if (box) setTimeout(() => box.focus({ preventScroll: true }), 80);
  });
}

function exportPlaylist(list, tracks) {
  const data = {
    format: 'melody-playlist',
    version: 1,
    name: list.name,
    description: list.description || '',
    exportedAt: new Date().toISOString(),
    count: tracks.length,
    tracks: tracks.map((track) => ({
      title: track.title || '',
      artist: track.artist || '',
      album: track.album || '',
      duration: Math.round(track.duration || 0),
      sources: (track.sources || []).map((ref) => ({ key: ref.key, id: ref.id || '' })),
    })),
  };
  saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }), safeName(list.name) + '.json');
  toast('已导出「' + list.name + '」');
}

async function renderDetail(root, kind, playlistId) {
  const profileId = store.state.profileId;
  let tracks = [];
  let title = '';
  let playlist = null;
  let items = [];
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
    const lists = await listPlaylists(profileId);
    playlist = lists.find((row) => row.id === playlistId) || null;
    title = playlist ? playlist.name : '歌单';
    items = await listPlaylistItems(playlistId);
    tracks = items.map((row) => row.track);
    const rerender = () => {
      if (!root.isConnected) return;
      renderDetail(root, 'playlist', playlistId);
    };
    if (playlist) {
      const cover = tracks[0] ? coverMarkup(tracks[0], { size: 240 }) : '';
      root.innerHTML =
        '<div class="pl-head">' +
          '<div class="pl-head__art">' + icon('queue_music') + cover + '</div>' +
          '<div class="pl-head__body">' +
            '<div class="pl-head__name">' + esc(playlist.name) + '</div>' +
            '<div class="pl-head__meta">' + tracks.length + ' 首' + (totalTime(tracks) !== '0:00' ? ' · ' + totalTime(tracks) : '') + '</div>' +
            '<div class="pl-head__desc">' + (playlist.description ? esc(playlist.description) : '<span class="pl-head__hint">还没有描述</span>') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="pl-actions">' +
          '<button class="btn btn--text btn--sm" data-rename>' + icon('edit') + '重命名</button>' +
          '<button class="btn btn--text btn--sm" data-desc>' + icon('notes') + (playlist.description ? '改描述' : '写描述') + '</button>' +
          '<button class="btn btn--text btn--sm" data-export>' + icon('file_download') + '导出</button>' +
          '<button class="btn btn--text btn--sm" data-delete>' + icon('delete') + '删除</button>' +
        '</div>';

      root.querySelector('[data-rename]').addEventListener('click', async () => {
        const name = await askText({ title: '重命名歌单', label: '歌单名称', value: playlist.name, confirmText: '保存' });
        if (!name || name === playlist.name) return;
        await updatePlaylist(playlistId, { name });
        toast('已重命名为「' + name + '」');
        rerender();
      });
      root.querySelector('[data-desc]').addEventListener('click', async () => {
        const text = await askDescription(playlist.description || '');
        if (text == null) return;
        await updatePlaylist(playlistId, { description: text });
        toast(text ? '已保存描述' : '已清空描述');
        rerender();
      });
      root.querySelector('[data-export]').addEventListener('click', () => {
        if (!tracks.length) { toast('空歌单没有可导出的曲目'); return; }
        exportPlaylist(playlist, tracks);
      });
      root.querySelector('[data-delete]').addEventListener('click', () => {
        openDialog({
          title: '删除歌单？',
          description: '「' + playlist.name + '」会被删除，歌本身不受影响。',
          actions: [
            { label: '取消', variant: 'text' },
            { label: '删除', variant: 'danger', onClick: async () => {
              await deletePlaylist(playlistId);
              toast('已删除歌单');
              router.go('/library');
            } },
          ],
        });
      });
      onDataChange(root, () => { if (root.isConnected) rerender(); }, { kinds: ['favorite', 'cache', 'playlist'] });
    }
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
    onMore: (track, anchor, event) => {
      const index = tracks.findIndex((row) => row.id === track.id);
      const move = async (delta) => {
        const moved = await movePlaylistItem(playlistId, track.id, delta);
        if (!moved) { toast(delta < 0 ? '已经在最前面了' : '已经在最后面了'); return; }
        document.dispatchEvent(new CustomEvent('playlist:changed', { detail: { playlistId } }));
      };
      openTrackMenu(track, {
        anchor, point: event,
        extra: kind === 'playlist' && playlistId ? [
          { icon: 'arrow_upward', label: '上移', disabled: index <= 0, onSelect: () => move(-1) },
          { icon: 'arrow_downward', label: '下移', disabled: index < 0 || index >= tracks.length - 1, onSelect: () => move(1) },
          {
            icon: 'playlist_remove',
            label: '从歌单移除',
            onSelect: async () => {
              await removeFromPlaylist(playlistId, track.id);
              toast('已从歌单移除');
              document.dispatchEvent(new CustomEvent('playlist:changed', { detail: { playlistId } }));
            },
          },
        ] : [],
        onFavoriteChange: () => { if (kind === 'favorites') routeReload(); },
        onCacheChange: () => { if (kind === 'cache') routeReload(); },
      });
    },
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
];
