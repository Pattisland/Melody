/* 搜索：顶部搜索框 + 历史列表；结果页分歌曲/歌手/专辑 */
import { esc, icon } from '../../core/util.js';
import { router } from '../../core/router.js';
import { store } from '../../core/store.js';
import { listSearches, recordSearch, removeSearch, clearSearches } from '../../data/repo.js';
import { searchAll } from '../../sources/registry.js';
import { groupAlbums } from '../../sources/merge.js';
import { songList, attachSongList, emptyState, toast, sectionHeader } from '../components.js';
import { coverMarkup } from '../cover.js';
import { openTrackMenu } from '../track-menu.js';
import { player } from '../../player/player.js';

let pageState = null;

function emptyStateFor() {
  return {
    q: '', tracks: [], artists: [], albums: [], page: 1, isEnd: true,
    tab: 'songs', filter: null, interacted: false, failed: [], loading: false, token: 0,
  };
}

function searchForm(value, variant) {
  return '<form class="searchbar ' + (variant === 'hero' ? 'searchbar--hero' : 'searchbar--bar') + '" role="search" data-search-form>' +
    '<span class="icon" aria-hidden="true" style="margin-left:8px">search</span>' +
    '<input class="searchbar__input" type="search" name="q" value="' + esc(value) + '" placeholder="搜索歌曲、歌手或专辑" autocomplete="off" enterkeyhint="search" aria-label="搜索">' +
    '<button class="icon-btn" type="submit" aria-label="搜索">' + icon('arrow_forward') + '</button>' +
  '</form>';
}

async function renderHome(root) {
  const profileId = store.state.profileId;
  const history = await listSearches(profileId, 40);
  root.innerHTML =
    '<div class="search-page">' +
      searchForm('', 'hero') +
      (history.length
        ? '<div class="section">' + sectionHeader('最近搜索',
            '<button class="btn btn--text btn--sm" data-clear>清除</button>') +
          '<div class="list" data-history>' + history.map((row) =>
            '<div class="list-item history-row" data-term="' + esc(row.term) + '" role="button" tabindex="0">' +
              '<div class="list-item__art list-item__art--icon">' + icon('history') + '</div>' +
              '<div class="list-item__body"><div class="list-item__title">' + esc(row.term) + '</div>' +
              '<div class="list-item__sub">' + new Date(row.lastAt).toLocaleDateString() + ' · ' + row.count + ' 次</div></div>' +
              '<div class="list-item__trail"><button class="icon-btn" data-remove="' + esc(row.id) + '" aria-label="删除这条记录">' +
                icon('close', 'icon--20') + '</button></div>' +
            '</div>').join('') + '</div></div>'
        : '<div class="state-hint" style="margin-top:24px">还没有搜索记录。点开听过的关键词会留在这里。</div>') +
    '</div>';

  const form = root.querySelector('[data-search-form]');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = form.querySelector('input').value.trim();
    if (value) router.go('/search', { query: { q: value } });
  });
  const input = form.querySelector('input');
  setTimeout(() => { if (window.matchMedia('(min-width: 840px)').matches) input.focus({ preventScroll: true }); }, 120);

  const historyBox = root.querySelector('[data-history]');
  if (historyBox) {
    historyBox.addEventListener('click', async (event) => {
      const remove = event.target.closest('[data-remove]');
      if (remove) {
        event.stopPropagation();
        await removeSearch(remove.dataset.remove);
        renderHome(root);
        return;
      }
      const row = event.target.closest('[data-term]');
      if (row) router.go('/search', { query: { q: row.dataset.term } });
    });
  }
  const clear = root.querySelector('[data-clear]');
  if (clear) clear.addEventListener('click', async () => { await clearSearches(profileId); renderHome(root); });
}

function resultsShell(root, q) {
  root.innerHTML =
    '<div class="results-page">' +
      searchForm(q, 'bar') +
      '<div class="results-head" data-results-head></div>' +
      '<div data-results-body><div class="stack gap-8">' +
        Array.from({ length: 6 }).map(() => '<div class="list-item"><div class="list-item__art skeleton"></div><div class="list-item__body"><div class="skeleton" style="height:14px;width:52%"></div><div class="skeleton mt-8" style="height:12px;width:34%"></div></div></div>').join('') +
      '</div></div>' +
    '</div>';

  const form = root.querySelector('[data-search-form]');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = form.querySelector('input').value.trim();
    if (value) router.go('/search', { query: { q: value } });
  });
}

function markInteracted() {
  if (!pageState || pageState.interacted) return;
  pageState.interacted = true;
  if (store.state.profileId && pageState.q) recordSearch(store.state.profileId, pageState.q).catch(() => {});
}

function tabsHTML() {
  const tabs = [['songs', '歌曲', 'music_note'], ['artists', '歌手', 'person'], ['albums', '专辑', 'album']];
  return '<div class="tabbar" data-tabs role="tablist" aria-label="结果分类">' + tabs.map(([key, label, ico]) =>
    '<button class="tabbar__tab" role="tab" data-tab="' + key + '" aria-selected="' + (pageState.tab === key) + '">' +
    icon(ico) + label + '</button>').join('') + '</div>';
}

function renderResults(root) {
  const head = root.querySelector('[data-results-head]');
  const body = root.querySelector('[data-results-body]');
  if (!head || !body) return;

  head.innerHTML =
    '<div class="results-head__row">' + tabsHTML() +
      (pageState.failed.length ? '<span class="t-body-s muted" data-failed title="' +
        esc(pageState.failed.map((f) => f.label + '：' + f.error).join(' / ')) + '">' +
        esc(pageState.failed.map((f) => f.label).join('、')) + ' 源不可用</span>' : '') +
    '</div>';

  head.querySelector('[data-tabs]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    pageState.tab = button.dataset.tab;
    renderResults(root);
  });

  if (!pageState.tracks.length) {
    body.innerHTML = emptyState('search_off', '没有找到「' + pageState.q + '」', pageState.failed.length ? '所有来源都不可用，稍后再试' : '换个关键词试试');
    return;
  }

  if (pageState.tab === 'artists') {
    body.innerHTML = '<div class="tile-grid">' + pageState.artists.map((artist) =>
      '<button class="tile" data-artist="' + esc(artist.name) + '">' +
        '<div class="tile__art">' + icon('person') + coverMarkup({ artwork: artist.artwork, sources: [] }, { size: 240 }) + '</div>' +
        '<div class="tile__title ellipsis">' + esc(artist.name) + '</div>' +
        '<div class="tile__sub">' + artist.count + ' 首</div>' +
      '</button>').join('') + '</div>';
    body.querySelectorAll('[data-artist]').forEach((button) => {
      button.addEventListener('click', () => {
        pageState.filter = { type: 'artist', value: button.dataset.artist };
        pageState.tab = 'songs';
        markInteracted();
        renderResults(root);
      });
    });
    return;
  }

  if (pageState.tab === 'albums') {
    body.innerHTML = '<div class="tile-grid">' + pageState.albums.map((album) =>
      '<button class="tile" data-album="' + esc(album.name) + '">' +
        '<div class="tile__art">' + icon('album') + coverMarkup(album.track, { size: 240 }) + '</div>' +
        '<div class="tile__title ellipsis">' + esc(album.name) + '</div>' +
        '<div class="tile__sub">' + esc(album.artist) + ' · ' + album.count + ' 首</div>' +
      '</button>').join('') + '</div>';
    body.querySelectorAll('[data-album]').forEach((button) => {
      button.addEventListener('click', () => {
        pageState.filter = { type: 'album', value: button.dataset.album };
        pageState.tab = 'songs';
        markInteracted();
        renderResults(root);
      });
    });
    return;
  }

  let list = pageState.tracks;
  if (pageState.filter) {
    const filter = pageState.filter;
    list = list.filter((track) => filter.type === 'artist'
      ? String(track.artist || '').includes(filter.value)
      : String(track.album || '') === filter.value);
  }

  const chip = pageState.filter
    ? '<div class="row gap-8" style="padding:0 0 8px"><button class="chip chip--selected" data-clear-filter>' +
      esc(pageState.filter.value) + icon('close', 'icon--18') + '</button></div>'
    : '';

  body.innerHTML = chip + songList(list, { playingId: store.state.player.track ? store.state.player.track.id : '' }) +
    (pageState.isEnd ? (list.length ? '<div class="state-hint">没有更多了</div>' : '') :
      '<div style="display:flex;justify-content:center;padding:16px 0"><button class="btn btn--outlined" data-more>' +
      (pageState.loading ? '加载中…' : '加载更多') + '</button></div>');

  const clearFilter = body.querySelector('[data-clear-filter]');
  if (clearFilter) clearFilter.addEventListener('click', () => { pageState.filter = null; renderResults(root); });

  attachSongList(body, list, {
    onPlay: (track, queue) => { markInteracted(); player.playTrack(track, { queue }); },
    onMore: (track, anchor, event) => { markInteracted(); openTrackMenu(track, { anchor, point: event }); },
  });

  const more = body.querySelector('[data-more]');
  if (more) more.addEventListener('click', () => loadMore(root));
}

async function loadResults(root) {
  const token = (pageState.token += 1);
  pageState.loading = true;
  try {
    const result = await searchAll(pageState.q, {
      settings: store.state.settings,
      page: 1,
      limit: 20,
      onProgress: (partial) => {
        if (token !== pageState.token) return;
        pageState.tracks = partial.tracks;
        pageState.artists = partial.artists;
        pageState.albums = groupAlbums(partial.tracks);
        pageState.failed = partial.failed;
        renderResults(root);
      },
    });
    if (token !== pageState.token) return;
    pageState.tracks = result.tracks;
    pageState.artists = result.artists;
    pageState.albums = groupAlbums(result.tracks);
    pageState.failed = result.failed;
    pageState.isEnd = result.isEnd;
    pageState.page = 1;
  } catch (err) {
    if (token !== pageState.token) return;
    pageState.tracks = [];
    pageState.albums = [];
    pageState.failed = [{ label: '全部来源', error: err.message }];
  } finally {
    pageState.loading = false;
    if (token === pageState.token) renderResults(root);
  }
}

async function loadMore(root) {
  pageState.loading = true;
  renderResults(root);
  const token = pageState.token;
  try {
    const result = await searchAll(pageState.q, { settings: store.state.settings, page: pageState.page + 1, limit: 20 });
    if (token !== pageState.token) return;
    const seen = new Set(pageState.tracks.map((track) => track.id));
    for (const track of result.tracks) if (!seen.has(track.id)) { pageState.tracks.push(track); seen.add(track.id); }
    pageState.albums = groupAlbums(pageState.tracks);
    if (result.artists.length) pageState.artists = result.artists;
    pageState.page += 1;
    pageState.isEnd = result.isEnd || result.tracks.length === 0;
  } catch (err) {
    toast('加载更多失败：' + err.message);
  } finally {
    pageState.loading = false;
    renderResults(root);
  }
}

export default {
  path: '/search',
  level: (ctx) => (ctx.query.q ? 2 : 1),
  title: (ctx) => (ctx.query.q ? '搜索结果' : '搜索'),
  dest: 'search',
  cache: (ctx) => Boolean(ctx.query.q),
  async mount(root, ctx) {
    const q = (ctx.query.q || '').trim();
    if (!q) {
      pageState = null;
      await renderHome(root);
      return;
    }
    pageState = emptyStateFor();
    pageState.q = q;
    resultsShell(root, q);
    await loadResults(root);
  },
};