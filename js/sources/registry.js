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
  return list.filter((source) => !disabled.has(source.key));
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
    const tracks = mergeResults(batches);
    options.onProgress({
      tracks,
      artists: groupArtists(tracks, query),
      failed: batches.filter((batch) => !batch.ok).map((batch) => ({ label: batch.source.label, error: batch.error })),
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
    } catch (err) {
      batch = { source, items: [], isEnd: true, ok: false, error: err && err.name === 'AbortError' ? '超时' : (err && err.message) || '失败' };
    } finally {
      clearTimeout(timer);
      if (options.signal) options.signal.removeEventListener('abort', cancel);
    }
    batches.push(batch);
    emit();
  }));

  const tracks = mergeResults(batches);
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
      return { ...value, sourceKey: adapter.key, ref };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('所有来源都解析失败');
}

export async function lyricsFor(track, settings, options = {}) {
  for (const item of refsFor(track, settings)) {
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
