/* 缓存：先缓存才能下载；音频存 IndexedDB，持久保留 */
import { getCacheBlob, putCache, listCached, removeCache, cacheStats } from '../data/repo.js';
import { resolveTrack } from '../sources/registry.js';

export async function cacheGet(profileId, trackId) {
  try { return await getCacheBlob(profileId, trackId); } catch (_) { return null; }
}

/** 头几个字节是否像音频：防止把错误页/JSON 当成音频缓存下来 */
export async function looksLikeAudio(blob) {
  if (!blob || !blob.size || blob.size < 4096) return false;
  try {
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return true; // ID3
    if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return true; // MPEG
    if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return true; // ftyp
    if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) return true; // OggS
    if (head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43) return true; // fLaC
    if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46) return true; // RIFF
    return false;
  } catch (_) {
    return false;
  }
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
  // 有的源会用 200 返回 JSON/HTML 错误页，先按类型挡一道
  if (/^text\/|^application\/(json|xml|xhtml)/i.test(mime)) {
    throw new Error('这个来源返回的不是音频（' + mime + '）');
  }
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
  if (!(await looksLikeAudio(blob))) throw new Error('这个来源返回的数据不是可播放音频');
  await putCache(profileId, track, blob, { sourceKey: resolved.sourceKey, mime });
  return { blob, bytes: blob.size, mime, sourceKey: resolved.sourceKey };
}

export { listCached, removeCache, cacheStats };
