/* 首页：头部 + 波浪分割 + 推荐 / 订阅 / 统计 / 常听 */
import { esc, icon } from '../../core/util.js';
import { router } from '../../core/router.js';
import { store } from '../../core/store.js';
import {
  recommendations, listeningStats, topTracks, listSubscriptions,
} from '../../data/repo.js';
import { searchAll } from '../../sources/registry.js';
import { groupAlbums } from '../../sources/merge.js';
import { coverMarkup } from '../cover.js';
import { sectionHeader, emptyState, toast, openSheet, songList, attachSongList } from '../components.js';
import { openTrackMenu } from '../track-menu.js';
import { player } from '../../player/player.js';

const RANGES = [
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
];

const subFeed = new Map();

function fmtDuration(ms) {
  if (!ms || ms < 60000) return ms > 0 ? '不到 1 分钟' : '0 分钟';
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return minutes + ' 分钟';
  const rest = minutes % 60;
  return hours + ' 小时' + (rest ? ' ' + rest + ' 分' : '');
}

function waves() {
  return '<div class="waves" aria-hidden="true">' +
    '<span class="wave wave--1"></span><span class="wave wave--2"></span><span class="wave wave--3"></span>' +
  '</div>';
}

function tileGrid(tracks, options = {}) {
  return '<div class="media-grid" data-tiles>' + tracks.map((track) =>
    '<button class="media" data-track="' + esc(track.id) + '" type="button">' +
      '<span class="media__art">' + icon('music_note') + coverMarkup(track, { size: 240 }) + '</span>' +
      '<span class="media__title">' + esc(track.title) + '</span>' +
      '<span class="media__sub">' + esc(track.artist || '未知歌手') + '</span>' +
    '</button>').join('') + '</div>';
}

function statBlock(stats) {
  const max = Math.max.apply(null, stats.days.map((day) => day.ms).concat([1]));
  const bars = stats.days.map((day) => {
    const height = Math.max(2, Math.round((day.ms / max) * 100));
    const label = new Date(day.at).toLocaleDateString('zh-CN', { weekday: 'narrow' });
    return '<span class="bars__col"><span class="bars__bar" style="height:' + height + '%" title="' + Math.round(day.ms / 60000) + ' 分钟"></span>' +
      '<span class="bars__label">' + esc(label) + '</span></span>';
  }).join('');
  return '<div class="stats">' +
    '<div class="stats__hero"><span class="stats__num">' + esc(fmtDuration(stats.totalMs)) + '</span>' +
      '<span class="stats__cap">累计收听</span></div>' +
    '<div class="stats__row">' +
      '<span><b>' + stats.tracks + '</b><i>首曲目</i></span>' +
      '<span><b>' + stats.artists + '</b><i>位歌手</i></span>' +
      '<span><b>' + stats.plays + '</b><i>次播放</i></span>' +
    '</div>' +
    '<div class="bars" aria-label="最近七天收听时长">' + bars + '</div>' +
  '</div>';
}

function topBlock(rows, range) {
  if (!rows.length) {
    return emptyState('graphic_eq', '还没有排行', '多听几首，这里就会长出来');
  }
  return '<ol class="toplist">' + rows.map((row, index) =>
    '<li class="toplist__row" data-track="' + esc(row.track.id) + '">' +
      '<span class="toplist__rank' + (index < 3 ? ' is-top' : '') + '">' + (index + 1) + '</span>' +
      '<span class="toplist__art">' + icon('music_note') + coverMarkup(row.track, { size: 96 }) + '</span>' +
      '<span class="toplist__body"><span class="toplist__title">' + esc(row.track.title) + '</span>' +
      '<span class="toplist__sub">' + esc(row.track.artist || '未知歌手') + '</span></span>' +
      '<span class="toplist__count">' + row.count + ' 次</span>' +
    '</li>').join('') + '</ol>';
}

const albumIndex = new Map();

/* 桌面端：按板块可用宽高算出列数，让正方形封面正好铺满整行 */
let gridHosts = [];
let gridObserver = null;

function layoutTileGrids() {
  if (!gridHosts.length) return;
  const desktop = window.matchMedia('(min-width: 840px)').matches;
  gridHosts.forEach((host) => {
    const grid = host.querySelector('.media-grid');
    if (!grid) return;
    if (!desktop) {
      grid.style.gridTemplateColumns = '';
      grid.style.removeProperty('--tile');
      return;
    }
    const gap = 14;
    const availW = host.clientWidth - 8;
    const availH = host.clientHeight - 10;
    const maxSide = Math.max(88, Math.min(320, availH - 74));
    const cols = Math.max(1, Math.floor((availW + gap) / (maxSide + gap)));
    const colWidth = Math.floor((availW - (cols - 1) * gap) / cols);
    grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
    grid.style.setProperty('--tile', colWidth + 'px');
  });
}

function watchGrids(root) {
  gridHosts = Array.from(root.querySelectorAll('.home-card__scroll'));
  layoutTileGrids();
  if (gridObserver) gridObserver.disconnect();
  if (typeof ResizeObserver !== 'undefined') {
    gridObserver = new ResizeObserver(() => layoutTileGrids());
    gridHosts.forEach((host) => gridObserver.observe(host));
  }
  if (!watchGrids.bound) {
    window.addEventListener('resize', layoutTileGrids, { passive: true });
    watchGrids.bound = true;
  }
}

function albumGrid(albums) {
  return '<div class="album-row">' + albums.slice(0, 6).map((album) =>
    '<button class="media media--album" type="button" data-album-key="' + esc(album.name.toLowerCase()) + '">' +
      '<span class="media__art media__art--square">' + icon('album') + coverMarkup(album.track, { size: 240 }) + '</span>' +
      '<span class="media__title">' + esc(album.name) + '</span>' +
      '<span class="media__sub">' + album.count + ' 首</span>' +
    '</button>').join('') + '</div>';
}

function subBlock(subs, feeds) {
  if (!subs.length) {
    return emptyState('person_add', '还没有订阅', '在曲目菜单里点「订阅这位歌手」，首页会自动更新');
  }
  albumIndex.clear();
  return subs.slice(0, 3).map((row) => {
    const feed = feeds.get(row.artist);
    const body = !feed
      ? '<div class="state-hint">正在搜索「' + esc(row.artist) + '」…</div>'
      : feed.error
        ? '<div class="state-hint">没有拿到结果：' + esc(feed.error) + '</div>'
        : feed.albums && feed.albums.length
          ? albumGrid(feed.albums.slice(0, 6))
          : '<div class="state-hint">暂时没有新专辑</div>';
    if (feed && feed.albums) feed.albums.forEach((album) => albumIndex.set(album.name.toLowerCase(), album));
    return '<div class="sub-artist" data-artist="' + esc(row.artist) + '">' +
      '<div class="sub-artist__head"><span class="sub-artist__name">' + esc(row.artist) + '</span>' +
      '<span class="sub-artist__meta">订阅中</span></div>' + body + '</div>';
  }).join('');
}

function openAlbumSheet(album) {
  const sheet = openSheet({
    title: album.name,
    body: '<p class="t-body-m muted" style="padding:0 8px 12px">' + esc(album.artist || '') + ' · ' + album.tracks.length + ' 首</p>' +
      songList(album.tracks, { playingId: store.state.player.track ? store.state.player.track.id : '' }),
  });
  attachSongList(sheet.body, album.tracks, {
    onPlay: (track, queue) => { sheet.close(); player.playTrack(track, { queue }); },
    onMore: (track, anchor, event) => openTrackMenu(track, { anchor, point: event }),
  });
}

async function loadFeeds(profileId, subs, host) {
  const settings = store.state.settings;
  for (const row of subs.slice(0, 3)) {
    if (subFeed.has(row.artist)) continue;
    subFeed.set(row.artist, null);
    try {
      const result = await searchAll(row.artist, { settings, page: 1, limit: 20 });
      const albums = groupAlbums(result.tracks);
      subFeed.set(row.artist, { tracks: result.tracks, albums, at: Date.now() });
    } catch (err) {
      subFeed.set(row.artist, { tracks: [], error: err.message });
    }
    const block = host.querySelector('[data-subs]');
    if (block) {
      block.innerHTML = subBlock(subs, subFeed);
      wireTiles(block);
    }
  }
}

function wireTiles(root) {
  root.querySelectorAll('[data-album-key]').forEach((node) => {
    if (node.dataset.wired === '1') return;
    node.dataset.wired = '1';
    node.addEventListener('click', () => {
      const album = albumIndex.get(node.dataset.albumKey);
      if (album) openAlbumSheet(album);
    });
  });
  root.querySelectorAll('[data-tiles] [data-track], .toplist [data-track]').forEach((node) => {
    if (node.dataset.wired === '1') return;
    node.dataset.wired = '1';
    node.addEventListener('click', (event) => {
      const buttons = Array.from(root.querySelectorAll('[data-track]'));
      const id = node.dataset.track;
      const all = window.__melodyHomeTracks instanceof Map ? window.__melodyHomeTracks : new Map();
      const track = all.get(id);
      if (!track) return;
      if (event.shiftKey) { openTrackMenu(track, { anchor: node }); return; }
      player.playTrack(track, { queue: Array.from(all.values()) });
    });
    node.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const all = window.__melodyHomeTracks instanceof Map ? window.__melodyHomeTracks : new Map();
      const track = all.get(node.dataset.track);
      if (track) openTrackMenu(track, { anchor: node });
    });
  });
}

async function mountHome(root) {
  const profileId = store.state.profileId;
  if (!profileId) { root.innerHTML = emptyState('person', '正在准备档案…'); return; }

  const [stats, recs, subs] = await Promise.all([
    listeningStats(profileId),
    recommendations(profileId, 10),
    listSubscriptions(profileId),
  ]);
  const topRows = await topTracks(profileId, 'week', 5);
  const trackIndex = new Map();
  recs.forEach((track) => trackIndex.set(track.id, track));
  topRows.forEach((row) => trackIndex.set(row.track.id, row.track));
  window.__melodyHomeTracks = trackIndex;

  root.innerHTML =
    '<header class="home-head">' +
      '<div class="home-head__text">' +
        '<h1 class="home-head__title">MELODY</h1>' +
        '<p class="home-head__tagline">永不消逝的音声</p>' +
      '</div>' +
      '<div class="home-head__quick">' +
        '<button class="icon-btn icon-btn--tonal" data-quick="search" aria-label="搜索">' + icon('search') + '</button>' +
        '<button class="icon-btn icon-btn--tonal" data-quick="cache" aria-label="缓存">' + icon('download_done') + '</button>' +
        '<button class="icon-btn icon-btn--tonal" data-quick="theme" aria-label="主题">' + icon('palette') + '</button>' +
      '</div>' +
    '</header>' +
    waves() +
    '<div class="home-main">' +
      '<section class="home-card home-card--wide">' +
        sectionHeader('推荐', '<button class="btn btn--text btn--sm" data-refresh>' + icon('refresh') + '换一批</button>') +
        '<div class="home-card__scroll" data-recs>' + (recs.length ? tileGrid(recs) : emptyState('auto_awesome', '曲库还空着', '收藏或缓存一些歌，这里就会开始推荐')) + '</div>' +
      '</section>' +
      '<section class="home-card">' +
        sectionHeader('统计') +
        '<div class="home-card__scroll" data-stats>' + statBlock(stats) + '</div>' +
      '</section>' +
      '<section class="home-card home-card--wide">' +
        sectionHeader('订阅') +
        '<div class="home-card__scroll" data-subs>' + subBlock(subs, subFeed) + '</div>' +
      '</section>' +
      '<section class="home-card">' +
        sectionHeader('常听', '<div class="tabbar tabbar--sm" data-range></div>') +
        '<div class="home-card__scroll" data-top>' + topBlock(topRows, 'week') + '</div>' +
      '</section>' +
    '</div>';

  watchGrids(root);
  const rangeBar = root.querySelector('[data-range]');
  rangeBar.innerHTML = RANGES.map((range) =>
    '<button class="tabbar__tab" data-range-key="' + range.key + '" aria-selected="' + (range.key === 'week') + '">' + range.label + '</button>').join('');
  rangeBar.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-range-key]');
    if (!button) return;
    rangeBar.querySelectorAll('[data-range-key]').forEach((node) => node.setAttribute('aria-selected', String(node === button)));
    const rows = await topTracks(profileId, button.dataset.rangeKey, 5);
    root.querySelector('[data-top]').innerHTML = topBlock(rows, button.dataset.rangeKey);
    wireTiles(root);
  });

  root.querySelector('[data-refresh]').addEventListener('click', async () => {
    const next = await recommendations(profileId, 10);
    const host = root.querySelector('[data-recs]');
    host.innerHTML = next.length ? tileGrid(next) : emptyState('auto_awesome', '曲库还空着', '收藏或缓存一些歌，这里就会开始推荐');
    next.forEach((track) => trackIndex.set(track.id, track));
    wireTiles(host);
    const button = root.querySelector('[data-refresh]');
    button.classList.add('is-spinning');
    setTimeout(() => button.classList.remove('is-spinning'), 600);
  });

  root.querySelectorAll('[data-quick]').forEach((button) => {
    button.addEventListener('click', () => {
      const kind = button.dataset.quick;
      if (kind === 'search') router.go('/search');
      else if (kind === 'cache') router.go('/me/cache');
      else router.go('/me/theme');
    });
  });

  wireTiles(root);
  loadFeeds(profileId, subs, root);
}

export const homeRoute = {
  path: '/home',
  level: 1,
  title: '首页',
  dest: 'home',
  fixed: true,
  mount: mountHome,
};