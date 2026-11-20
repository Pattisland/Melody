/* 缓存：先缓存才能下载；音频存 IndexedDB，持久保留 */
import { getCacheBlob, putCache, listCached, removeCache, cacheStats } from '../data/repo.js';
import { resolveTrack } from '../sources/registry.js';

export async function cacheGet(profileId, trackId) {
  try { return await getCacheBlob(profileId, trackId); } catch (_) { return null; }
}

/**
 * 下载整首音频到 IndexedDB
 * @returns {Promise<{blob: Blob, bytes: number, mime: string, sourceKey: string}>}
 */
export async function cacheTrack(profileId, track, options = {}) {
  const resolved = await resolveTrack(track, options.settings, { signal: options.signal });
  const response = await fetch(resolved.url, { signal: options.signal, mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error('下载失败 HTTP ' + response.status);
  const total = Number(response.headers.get('content-length')) || 0;
  const mime = (response.headers.get('content-type') || 'audio/mpeg').split(';')[0];
  let blob;
  if (response.body && response.body.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      chunks.push(step.value);
      received += step.value.length;
      if (options.onProgress) options.onProgress(received, total);
    }
    blob = new Blob(chunks, { type: mime });
  } else {
    blob = await response.blob();
    if (options.onProgress) options.onProgress(blob.size, blob.size);
  }
  await putCache(profileId, track, blob, { sourceKey: resolved.sourceKey, mime });
  return { blob, bytes: blob.size, mime, sourceKey: resolved.sourceKey };
}

export { listCached, removeCache, cacheStats };
