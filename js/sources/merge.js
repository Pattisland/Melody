/* 跨源合并：同歌名+同歌手视为同一首，来源挂成多路 */
import { normalizeArtist } from '../core/util.js';

/**
 * @param {Array<{source: any, items: any[]}>} batches
 * @returns {any[]} 合并后的曲目
 */
export function mergeResults(batches) {
  const map = new Map();
  for (const batch of batches) {
    if (!batch || !batch.items) continue;
    for (const item of batch.items) {
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, { ...item, sources: item.sources.slice() });
        continue;
      }
      for (const ref of item.sources) {
        if (!existing.sources.some((s) => s.source === ref.source)) existing.sources.push(ref);
      }
      if (!existing.artwork && item.artwork) existing.artwork = item.artwork;
      if (!existing.album && item.album) existing.album = item.album;
      if (!existing.duration && item.duration) existing.duration = item.duration;
    }
  }
  return Array.from(map.values());
}

/** 按歌手聚合，用于搜索结果里的「歌手」分栏 */
export function groupArtists(tracks, query) {
  const q = String(query || '').toLowerCase().replace(/\s+/g, '');
  const map = new Map();
  for (const track of tracks) {
    const raw = String(track.artist || '').split(/\s*\/\s*/)[0] || '';
    if (!raw) continue;
    const key = normalizeArtist(raw);
    if (!key) continue;
    let entry = map.get(key);
    if (!entry) {
      entry = { key, name: raw, count: 0, tracks: [], artwork: '' };
      map.set(key, entry);
    }
    entry.count += 1;
    entry.tracks.push(track);
    if (!entry.artwork && track.artwork) entry.artwork = track.artwork;
  }
  const all = Array.from(map.values());
  const matched = all.filter((entry) => entry.key.includes(q) || q.includes(entry.key));
  return (matched.length ? matched : all).sort((a, b) => b.count - a.count);
}
