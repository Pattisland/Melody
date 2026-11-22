/* 来源注册表 + 搜索扇出 + 取流回退 */
import { createGdStudio, createMeting } from './meting.js';
import { createAudius } from './audius.js';
import { mergeResults, groupArtists } from './merge.js';

export const SOURCES = [
  createGdStudio({ key: 'gd-netease', server: 'netease', label: '网易云', accent: '#c62828' }),
  createMeting({ key: 'qj-tencent', server: 'tencent', label: 'QQ 音乐', accent: '#31c27c' }),
  createMeting({ key: 'qj-kugou', server: 'kugou', label: '酷狗', accent: '#2b7feb' }),
  createMeting({ key: 'qj-migu', server: 'migu', label: '咪咕', accent: '#e6421f' }),
  createAudius(),
];

export const SOURCE_BY_KEY = new Map(SOURCES.map((source) => [source.key, source]));
export const DEFAULT_ORDER = SOURCES.map((source) => source.key);
const SOURCE_TIMEOUT = 9000;

/* --------------------------------------------------------------------------
   来源健康度：失败过的来源往后排，彻底取不到流的曲目也往后排，
   避免「酷狗不可用却霸榜」这种情况。数据只存在本地。
   -------------------------------------------------------------------------- */
const HEALTH_KEY = 'melody.sourceHealth';
const DEAD_KEY = 'melody.deadTracks';
const health = new Map();
const deadTracks = new Map();

function loadHealth() {
  try {
    const raw = localStorage.getItem(HEALTH_KEY);
    if (raw) JSON.parse(raw).forEach((row) => { if (row && row.key) health.set(row.key, row); });
    const deadRaw = localStorage.getItem(DEAD_KEY);
    if (deadRaw) JSON.parse(deadRaw).forEach((row) => { if (row && row.id) deadTracks.set(row.id, row.at || 1); });
  } catch (_) { /* 忽略 */ }
}

function persistHealth() {
  try {
    localStorage.setItem(HEALTH_KEY, JSON.stringify(Array.from(health.entries()).map(([key, row]) => ({ key, ...row }))));
  } catch (_) { /* 忽略 */ }
  try {
    localStorage.setItem(DEAD_KEY, JSON.stringify(Array.from(deadTracks.entries()).slice(-400).map(([id, at]) => ({ id, at }))));
  } catch (_) { /* 忽略 */ }
}

loadHealth();

export function sourceHealth(key) {
  return health.get(key) || { ok: 0, fails: 0, at: 0 };
}

/** 0 = 正常，1 = 最近失败多于成功，2 = 基本不可用 */
export function sourcePenalty(key) {
  const row = health.get(key);
  if (!row) return 0;
  if (row.fails >= 3 && row.ok === 0) return 2;
  if (row.fails > row.ok) return 1;
  return 0;
}

function recordHealth(key, ok) {
  const row = health.get(key) || { ok: 0, fails: 0, at: 0 };
  if (ok) row.ok += 1; else row.fails += 1;
  row.at = Date.now();
  health.set(key, row);
  persistHealth();
}

export function markTrackDead(trackId) {
  if (!trackId) return;
  deadTracks.set(trackId, Date.now());
  persistHealth();
}

export function markTrackAlive(trackId) {
  if (trackId && deadTracks.delete(trackId)) persistHealth();
}

export function isTrackDead(trackId) {
  return deadTracks.has(trackId);
}

export function sourceLabelFor(key) {
  if (key === 'cache') return '本地缓存';
  const source = SOURCE_BY_KEY.get(key);
  return source ? source.label : (key || '未知来源');
}

export function orderedSources(settings) {
  const disabled = new Set((settings && settings['sources.disabled']) || []);
  const order = (settings && settings['sources.order']) || DEFAULT_ORDER;
  const seen = new Set();
  const list = [];
  for (const key of order) {
    const source = SOURCE_BY_KEY.get(key);
    if (source && !seen.has(key)) { seen.add(key); list.push(source); }
  }
  for (const source of SOURCES) if (!seen.has(source.key)) { seen.add(source.key); list.push(source); }
  const rank = new Map(list.map((source, index) => [source.key, index]));
  return list
    .filter((source) => !disabled.has(source.key))
    .sort((a, b) => {
      const diff = sourcePenalty(a.key) - sourcePenalty(b.key);
      if (diff !== 0) return diff;
      return (rank.get(a.key) || 0) - (rank.get(b.key) || 0);
    });
}

/**
 * 并行搜索所有启用的来源。
 * 每个来源独立超时；任何一路先回来就通过 onProgress 先把结果交出去。
 */
export async function searchAll(query, options = {}) {
  const settings = options.settings || {};
  const page = options.page || 1;
  const limit = options.limit || 20;
  const sources = orderedSources(settings);
  const batches = [];

  const emit = () => {
    if (!options.onProgress) return;
    const tracks = order(mergeResults(batches));
    options.onProgress({
      tracks,
      artists: groupArtists(tracks, query),
      failed: batches.filter((batch) => !batch.ok).map((batch) => ({ label: batch.source.label, error: batch.error })),
    });
  };

  const rank = new Map(sources.map((source, index) => [source.key, index]));
  /** 排序：还能播的在前，其次按来源优先级，最后才是彻底失效的曲目 */
  const order = (tracks) => {
    const minRank = (track) => {
      let best = 99;
      for (const ref of track.sources || []) {
        const value = rank.has(ref.source) ? rank.get(ref.source) : 99;
        if (value < best) best = value;
      }
      return best;
    };
    return tracks.sort((a, b) => {
      const dead = (deadTracks.has(a.id) ? 1 : 0) - (deadTracks.has(b.id) ? 1 : 0);
      if (dead !== 0) return dead;
      const diff = minRank(a) - minRank(b);
      if (diff !== 0) return diff;
      return sourcePenalty(a.sources && a.sources[0] ? a.sources[0].source : '') - sourcePenalty(b.sources && b.sources[0] ? b.sources[0].source : '');
    });
  };

  await Promise.all(sources.map(async (source) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || SOURCE_TIMEOUT);
    const cancel = () => controller.abort();
    if (options.signal) options.signal.addEventListener('abort', cancel);
    let batch;
    try {
      const result = await source.search(query, { page, limit, signal: controller.signal });
      batch = { source, items: result.items || [], isEnd: result.isEnd !== false, ok: true };
      recordHealth(source.key, true);
    } catch (err) {
      batch = { source, items: [], isEnd: true, ok: false, error: err && err.name === 'AbortError' ? '超时' : (err && err.message) || '失败' };
      recordHealth(source.key, false);
    } finally {
      clearTimeout(timer);
      if (options.signal) options.signal.removeEventListener('abort', cancel);
    }
    batches.push(batch);
    emit();
  }));

  const tracks = order(mergeResults(batches));
  const okCount = batches.filter((batch) => batch.ok).length;
  return {
    tracks,
    artists: groupArtists(tracks, query),
    batches,
    okCount,
    failed: batches.filter((batch) => !batch.ok).map((batch) => ({ label: batch.source.label, error: batch.error })),
    isEnd: batches.every((batch) => batch.isEnd),
  };
}

const urlCache = new Map();
const URL_TTL = 8 * 60 * 1000;

export function refsFor(track, settings) {
  const order = orderedSources(settings).map((source) => source.key);
  const refs = [];
  for (const key of order) {
    const ref = (track.sources || []).find((item) => item.source === key);
    if (ref) refs.push({ adapter: SOURCE_BY_KEY.get(key), ref });
  }
  return refs;
}

/** 按用户设置的来源顺序回退，返回第一个解析成功的地址 */
export async function resolveTrack(track, settings, options = {}) {
  const refs = refsFor(track, settings);
  if (!refs.length) throw new Error('该曲目没有启用的来源');
  let lastError = null;
  for (const item of refs) {
    const { adapter, ref } = item;
    const key = track.id + '|' + adapter.key;
    const hit = urlCache.get(key);
    if (hit && hit.expires > Date.now()) return { ...hit.value, sourceKey: adapter.key, ref };
    try {
      const value = await adapter.resolveUrl(ref, options);
      if (!value || !value.url) throw new Error('空地址');
      urlCache.set(key, { value, expires: Date.now() + URL_TTL });
      recordHealth(adapter.key, true);
      markTrackAlive(track.id);
      return { ...value, sourceKey: adapter.key, ref, attempt: refs.indexOf(item), label: adapter.label };
    } catch (err) {
      recordHealth(adapter.key, false);
      lastError = err;
    }
  }
  markTrackDead(track.id);
  throw lastError || new Error('所有来源都解析失败');
}

/** 该曲目能提供歌词的来源（用于「更换歌词源」） */
export function lyricSources(track, settings) {
  return refsFor(track, settings).filter((item) => item.adapter.lyrics);
}

export async function lyricsFor(track, settings, options = {}) {
  const refs = refsFor(track, settings);
  const preferred = settings && settings['prefs.lyricsSource'];
  if (preferred) {
    refs.sort((a, b) => (a.adapter.key === preferred ? -1 : 0) - (b.adapter.key === preferred ? -1 : 0));
  }
  for (const item of refs) {
    try {
      if (!item.adapter.lyrics) continue;
      const text = await item.adapter.lyrics(item.ref, options);
      if (text && text.trim()) return text;
    } catch (_) { /* 下一个来源 */ }
  }
  return '';
}

export function artworkCandidates(track, size) {
  const list = [];
  const push = (url) => {
    if (!url) return;
    const sized = size ? url.replace(/param=\d+y\d+/, 'param=' + size + 'y' + size) : url;
    if (list.indexOf(sized) < 0) list.push(sized);
  };
  push(track.artwork);
  for (const ref of track.sources || []) push(ref.artwork);
  return list;
}

export function artworkFor(track, size) {
  let url = track.artwork || '';
  if (!url) {
    for (const ref of track.sources || []) if (ref.artwork) { url = ref.artwork; break; }
  }
  if (url && size) url = url.replace(/param=\d+y\d+/, 'param=' + size + 'y' + size);
  return url;
}

export function clearUrlCache() { urlCache.clear(); }
