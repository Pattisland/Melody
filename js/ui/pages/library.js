/* 曲库：系统歌单 + 自定义歌单 + 详情 */
import { esc, icon, fmtBytes, fmtTime } from '../../core/util.js';
import { router } from '../../core/router.js';
import { store } from '../../core/store.js';
import { listHistory, listFavorites, listCached, listPlaylists, createPlaylist,
  listPlaylistItems, deletePlaylist, removeFromPlaylist, updatePlaylist,
  movePlaylistItem, removeFavorite, addToPlaylist } from '../../data/repo.js';
import { songList, attachSongList, emptyState, toast, askText, openDialog, openActionMenu } from '../components.js';
import { enqueue } from '../../player/queue.js';
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

/* 列表状态：排序、多选（切换页面或歌单时重置） */
let listSort = 'default';
let picking = false;
let picked = new Set();
let entries = [];
let detailKey = '';

function resetListState(kind, playlistId) {
  const key = kind + ':' + playlistId;
  if (detailKey === key) return;
  detailKey = key;
  listSort = 'default';
  picking = false;
  picked = new Set();
}

function sortEntries(list) {
  const rows = list.slice();
  if (listSort === 'name') return rows.sort((a, b) => String(a.track.title || '').localeCompare(String(b.track.title || ''), 'zh'));
  if (listSort === 'artist') return rows.sort((a, b) => String(a.track.artist || '').localeCompare(String(b.track.artist || ''), 'zh'));
  if (listSort === 'duration') return rows.sort((a, b) => (b.track.duration || 0) - (a.track.duration || 0));
  return rows;
}

function dayLabel(at) {
  const date = new Date(at);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  if (at >= startOfToday) return '今天';
  if (at >= startOfToday - day) return '昨天';
  if (at >= startOfToday - day * 7) return '本周';
  return (date.getMonth() + 1) + '月' + date.getDate() + '日';
}

/** 最近播放用时间线（按天分组），其余列表按排序键展示 */
function timelineGroups(list) {
  const groups = [];
  const index = new Map();
  list.forEach((entry) => {
    const label = dayLabel(entry.at || 0);
    let group = index.get(label);
    if (!group) { group = { label, rows: [] }; index.set(label, group); groups.push(group); }
    group.rows.push(entry);
  });
  groups.sort((a, b) => (b.rows[0].at || 0) - (a.rows[0].at || 0));
  return groups;
}

async function renderDetail(root, kind, playlistId) {
  resetListState(kind, playlistId);
  const profileId = store.state.profileId;
  entries = [];
  let tracks = [];
  let title = '';
  let playlist = null;
  let items = [];
  if (kind === 'recent') {
    title = '最近播放';
    const rows = await listHistory(profileId, 200);
    entries = rows.map((row) => ({ track: row.track, at: row.playedAt || 0 }));
    tracks = entries.map((entry) => entry.track);
  } else if (kind === 'favorites') {
    title = '我的喜欢';
    const rows = await listFavorites(profileId);
    entries = rows.map((row) => ({ track: row.track, at: row.addedAt || 0 }));
    tracks = entries.map((entry) => entry.track);
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
    entries = items.map((row) => ({ track: row.track, at: row.addedAt || 0 }));
    tracks = entries.map((row) => row.track);
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

  // 最近播放/我的喜欢没有头部块：重渲染前清空，避免列表叠加
  if (kind !== 'playlist') root.innerHTML = '';
  const sorted = sortEntries(entries);
  const shown = sorted.map((entry) => entry.track);
  const canRemove = kind === 'favorites' || (kind === 'playlist' && playlistId);
  const playingId = store.state.player.track ? store.state.player.track.id : '';
  const rerender = () => renderDetail(root, kind, playlistId);

  const host = document.createElement('div');
  if (!tracks.length) {
    host.innerHTML = emptyState(kind === 'cache' ? 'download_done' : 'music_note', '这里还是空的', kind === 'favorites' ? '在曲目菜单里点「收藏」' : kind === 'cache' ? '缓存后可以离线播放与下载' : '听过的歌会自动出现在这里');
    root.appendChild(host);
    return;
  }

  const toolbar = '<div class="lib-toolbar">' +
    (picking
      ? '<span class="lib-toolbar__count">已选 <b data-pick-count>' + picked.size + '</b> 首</span>' +
        '<div class="row gap-8">' +
          '<button class="btn btn--text btn--sm" data-bulk="cache">' + icon('download') + '缓存</button>' +
          '<button class="btn btn--text btn--sm" data-bulk="playlist">' + icon('playlist_add') + '加入歌单</button>' +
          (canRemove ? '<button class="btn btn--text btn--sm" data-bulk="remove">' + icon('delete') + '移除</button>' : '') +
          '<button class="btn btn--text btn--sm" data-bulk="exit">取消</button>' +
        '</div>'
      : '<div class="segmented segmented--sm" data-sort>' +
        [['default', '默认'], ['name', '名称'], ['artist', '歌手'], ['duration', '时长']].map(([key, label]) =>
          '<button class="segmented__item" data-value="' + key + '" aria-selected="' + (listSort === key) + '">' + label + '</button>').join('') +
        '</div>' +
        '<div class="row gap-8" style="margin-left:auto">' +
          '<button class="btn btn--text btn--sm" data-pick>' + icon('checklist') + '选择</button>' +
        '</div>') +
    '</div>';

  const body = kind === 'recent'
    ? '<div class="timeline">' + timelineGroups(sorted).map((group) =>
        '<div class="timeline__day">' + esc(group.label) + '<span>' + group.rows.length + ' 首</span></div>' +
        songList(group.rows.map((row) => row.track), { playingId })).join('') + '</div>'
    : songList(shown, { playingId });

  host.innerHTML = toolbar + body;
  root.appendChild(host);

  const paintPicked = () => {
    host.querySelectorAll('[data-track-id]').forEach((row) => {
      const on = picked.has(row.dataset.trackId);
      row.classList.toggle('is-picked', on);
      let mark = row.querySelector('.pick-mark');
      if (!on) { if (mark) mark.remove(); return; }
      if (!mark) {
        mark = document.createElement('span');
        mark.className = 'pick-mark icon';
        row.prepend(mark);
      }
      mark.textContent = 'check_circle';
    });
    const count = host.querySelector('[data-pick-count]');
    if (count) count.textContent = String(picked.size);
  };

  const togglePick = (id) => {
    if (picked.has(id)) picked.delete(id); else picked.add(id);
    paintPicked();
  };

  const attach = (listHost, listTracks) => attachSongList(listHost, listTracks, {
    onPlay: (track) => {
      if (picking) { togglePick(track.id); return; }
      player.playTrack(track, { queue: listTracks });
    },
    onMore: (track, anchor, event) => {
      const index = shown.findIndex((row) => row.id === track.id);
      const move = async (delta) => {
        const moved = await movePlaylistItem(playlistId, track.id, delta);
        if (!moved) { toast(delta < 0 ? '已经在最前面了' : '已经在最后面了'); return; }
        document.dispatchEvent(new CustomEvent('playlist:changed', { detail: { playlistId } }));
      };
      openTrackMenu(track, {
        anchor, point: event,
        extra: kind === 'playlist' && playlistId ? [
          { icon: 'arrow_upward', label: '上移', disabled: index <= 0, onSelect: () => move(-1) },
          { icon: 'arrow_downward', label: '下移', disabled: index < 0 || index >= shown.length - 1, onSelect: () => move(1) },
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

  if (kind === 'recent') {
    const groups = timelineGroups(sorted);
    host.querySelectorAll('[data-songlist]').forEach((list, index) => {
      const group = groups[index];
      attach(list, group ? group.rows.map((row) => row.track) : shown);
    });
  } else {
    attach(host, shown);
  }
  if (picking) paintPicked();

  host.querySelectorAll('[data-sort] .segmented__item').forEach((button) => {
    button.addEventListener('click', () => { listSort = button.dataset.value; rerender(); });
  });
  const pickButton = host.querySelector('[data-pick]');
  if (pickButton) pickButton.addEventListener('click', () => { picking = true; picked = new Set(); rerender(); });
  host.querySelectorAll('[data-bulk]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.bulk;
      const selected = entries.filter((row) => picked.has(row.track.id)).map((row) => row.track);
      if (action === 'exit') { picking = false; picked = new Set(); rerender(); return; }
      if (!selected.length) { toast('先选几首'); return; }
      if (action === 'cache') {
        await enqueue(selected);
        toast('已加入缓存队列 ' + selected.length + ' 首');
        picking = false; picked = new Set(); rerender();
        return;
      }
      if (action === 'remove') {
        if (kind === 'favorites') {
          for (const track of selected) await removeFavorite(profileId, track.id);
          toast('已取消收藏 ' + selected.length + ' 首');
        } else if (kind === 'playlist' && playlistId) {
          for (const track of selected) await removeFromPlaylist(playlistId, track.id);
          toast('已从歌单移除 ' + selected.length + ' 首');
        }
        picking = false; picked = new Set(); rerender();
        return;
      }
      if (action === 'playlist') {
        const lists = await listPlaylists(profileId);
        openActionMenu({
          title: '把 ' + selected.length + ' 首加入歌单',
          items: lists.map((list) => ({
            icon: 'queue_music',
            label: list.name,
            onSelect: async () => {
              for (const track of selected) await addToPlaylist(list.id, track);
              toast('已加入「' + list.name + '」');
              picking = false; picked = new Set(); rerender();
            },
          })).concat([{
            icon: 'add',
            label: '新建歌单',
            onSelect: async () => {
              const name = await askText({ title: '新建歌单', label: '歌单名称', placeholder: '例如：夜里开车', confirmText: '创建' });
              if (!name) return;
              const list = await createPlaylist(profileId, name);
              for (const track of selected) await addToPlaylist(list.id, track);
              toast('已加入「' + list.name + '」');
              picking = false; picked = new Set(); rerender();
            },
          }]),
        });
      }
    });
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
