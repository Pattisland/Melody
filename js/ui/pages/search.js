/* 搜索：首页（标题 + 搜索框 + 历史）与结果页 */
import { esc, icon, debounce } from '../../core/util.js';
import { router } from '../../core/router.js';
import { store } from '../../core/store.js';
import { listSearches, recordSearch, removeSearch, clearSearches } from '../../data/repo.js';
import { searchAll } from '../../sources/registry.js';
import { songList, attachSongList, emptyState, toast, sectionHeader } from '../components.js';
import { openTrackMenu } from '../track-menu.js';
import { player } from '../../player/player.js';

let pageState = { q: '', tracks: [], artists: [], page: 1, isEnd: true, tab: 'songs', artistFilter: '', interacted: false, failed: [], loading: false };

function searchForm(value, hero) {
  return '<form class="searchbar ' + (hero ? 'searchbar--hero hero__search' : 'searchbar--bar') + '" role="search" data-search-form>' +
    '<span class="icon" aria-hidden="true" style="margin-left:8px">search</span>' +
    '<input class="searchbar__input" type="search" name="q" value="' + esc(value) + '" placeholder="搜索歌曲、歌手或专辑" autocomplete="off" enterkeyhint="search" aria-label="搜索">' +
    '<button class="icon-btn" type="submit" aria-label="搜索">' + icon('arrow_forward') + '</button>' +
  '</form>';
}

async function renderHome(root) {
  const profileId = store.state.profileId;
  const history = await listSearches(profileId, 24);
  root.innerHTML =
    '<div class="hero">' +
      '<h1 class="hero__brand">Melody</h1>' +
      '<p class="hero__sub">搜索并播放你想要的音乐</p>' +
      searchForm('', true) +
    '</div>' +
    (history.length
      ? '<div class="section">' + sectionHeader('最近搜索',
          '<button class="btn btn--text btn--sm" data-clear>清除</button>') +
        '<div class="chip-row" data-history>' + history.map((row) =>
          '<span class="chip" data-term="' + esc(row.term) + '">' + icon('history') +
          '<span class="chip__text">' + esc(row.term) + '</span>' +
          '<button class="icon-btn" style="width:24px;height:24px" data-remove="' + esc(row.id) + '" aria-label="删除这条记录">' +
          icon('close', 'icon--18') + '</button></span>').join('') + '</div></div>'
      : '<div class="section"><div class="state-hint">还没有搜索记录。搜过并且点开听过的关键词会留在这里。</div></div>');

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
      const chip = event.target.closest('[data-term]');
      if (!chip) return;
      router.go('/search', { query: { q: chip.dataset.term } });
    });
  }
  const clear = root.querySelector('[data-clear]');
  if (clear) clear.addEventListener('click', async () => { await clearSearches(profileId); renderHome(root); });
}

function resultsShell(root, q) {
  root.innerHTML =
    '<div class="stack gap-16">' +
      searchForm(q, false) +
      '<div data-results-head></div>' +
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

function renderResults(root) {
  const head = root.querySelector('[data-results-head]');
  const body = root.querySelector('[data-results-body]');
  if (!head || !body) return;

  const hasArtists = pageState.artists.length > 0 && pageState.artists.some((a) => a.count > 0);
  const showTabs = hasArtists && pageState.tracks.length > 0;

  head.innerHTML =
    '<div class="row gap-8" style="justify-content:space-between;flex-wrap:wrap">' +
      (showTabs
        ? '<div class="segmented" data-tabs>' +
            '<button class="segmented__item" data-tab="songs" aria-selected="' + (pageState.tab === 'songs') + '">' + icon('music_note') + '歌曲</button>' +
            '<button class="segmented__item" data-tab="artists" aria-selected="' + (pageState.tab === 'artists') + '">' + icon('person') + '歌手</button>' +
          '</div>'
        : '<span class="t-label-l muted">' + (pageState.tracks.length ? '找到 ' + pageState.tracks.length + ' 首' : '') + '</span>') +
      (pageState.failed.length ? '<span class="t-body-s muted" data-failed title="' + esc(pageState.failed.map((f) => f.label + '：' + f.error).join(' / ')) + '">' +
        esc(pageState.failed.map((f) => f.label).join('、')) + ' 源不可用</span>' : '') +
    '</div>';

  const tabs = head.querySelector('[data-tabs]');
  if (tabs) {
    tabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tab]');
      if (!button) return;
      pageState.tab = button.dataset.tab;
      renderResults(root);
    });
  }

  if (!pageState.tracks.length) {
    body.innerHTML = emptyState('search_off', '没有找到「' + pageState.q + '」', pageState.failed.length ? '所有来源都不可用，稍后再试' : '换个关键词，或者检查来源设置');
    return;
  }

  if (pageState.tab === 'artists') {
    body.innerHTML = '<div class="tile-grid">' + pageState.artists.map((artist) =>
      '<button class="tile" data-artist="' + esc(artist.name) + '">' +
        '<div class="tile__art">' + (artist.artwork ? '<img data-cover loading="lazy" src="' + esc(artist.artwork) + '" alt="">' : icon('person')) + '</div>' +
        '<div class="tile__title ellipsis">' + esc(artist.name) + '</div>' +
        '<div class="tile__sub">' + artist.count + ' 首</div>' +
      '</button>').join('') + '</div>';

    body.querySelectorAll('[data-artist]').forEach((button) => {
      button.addEventListener('click', () => {
        pageState.artistFilter = button.dataset.artist;
        pageState.tab = 'songs';
        markInteracted();
        renderResults(root);
      });
    });
    return;
  }

  let list = pageState.tracks;
  if (pageState.artistFilter) {
    const key = pageState.artistFilter;
    list = list.filter((track) => String(track.artist || '').indexOf(key) >= 0);
  }

  body.innerHTML =
    (pageState.artistFilter ? '<div class="row gap-8" style="padding:0 0 8px"><span class="chip chip--selected" data-clear-artist>' + esc(pageState.artistFilter) + icon('close', 'icon--18') + '</span></div>' : '') +
    songList(list, { playingId: store.state.player.track ? store.state.player.track.id : '' }) +
    (pageState.isEnd ? (list.length ? '<div class="state-hint">没有更多了</div>' : '') :
      '<div style="display:flex;justify-content:center;padding:16px 0"><button class="btn btn--outlined" data-more>' +
      (pageState.loading ? '加载中…' : '加载更多') + '</button></div>');

  const clearArtist = body.querySelector('[data-clear-artist]');
  if (clearArtist) clearArtist.addEventListener('click', () => { pageState.artistFilter = ''; renderResults(root); });

  attachSongList(body, list, {
    onPlay: (track, queue) => {
      markInteracted();
      player.playTrack(track, { queue });
    },
    onMore: (track) => { markInteracted(); openTrackMenu(track); },
  });

  const more = body.querySelector('[data-more]');
  if (more) more.addEventListener('click', () => loadMore(root));
}

function markInteracted() {
  if (pageState.interacted) return;
  pageState.interacted = true;
  const profileId = store.state.profileId;
  if (profileId && pageState.q) recordSearch(profileId, pageState.q).catch(() => {});
}

async function loadResults(root) {
  const token = pageState.token = (pageState.token || 0) + 1;
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
        pageState.failed = partial.failed;
        renderResults(root);
      },
    });
    if (token !== pageState.token) return;
    pageState.tracks = result.tracks;
    pageState.artists = result.artists;
    pageState.failed = result.failed;
    pageState.isEnd = result.isEnd;
    pageState.page = 1;
    if (!result.okCount) {
      pageState.tracks = [];
      pageState.artists = [];
    }
  } catch (err) {
    if (token !== pageState.token) return;
    pageState.tracks = [];
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
    pageState.artists = result.artists.length ? result.artists : pageState.artists;
    pageState.page += 1;
    pageState.isEnd = result.isEnd || (result.tracks.length === 0);
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
  async mount(root, ctx) {
    const q = (ctx.query.q || '').trim();
    if (!q) {
      pageState = { q: '', tracks: [], artists: [], page: 1, isEnd: true, tab: 'songs', artistFilter: '', interacted: false, failed: [], loading: false };
      await renderHome(root);
      return;
    }
    pageState = { q, tracks: [], artists: [], page: 1, isEnd: true, tab: 'songs', artistFilter: '', interacted: false, failed: [], loading: false };
    resultsShell(root, q);
    await loadResults(root);
  },
};
