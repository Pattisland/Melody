/* 下载：缓存 -> 写标签（含封面/歌词）-> 触发保存 */
import { getCacheEntry, getCacheBlob, getThumb } from '../data/repo.js';
import { writeId3 } from './id3.js';
import { lyricsFor, artworkCandidates } from '../sources/registry.js';
import { store } from '../core/store.js';
import { player } from '../player/player.js';
import { toast } from '../ui/components.js';

const COVER_SIZE = 600;
const COVER_PROXY = 'https://wsrv.nl/?url=';
const COVER_MAX = 3 * 1024 * 1024;
const COVER_MIN = 1024;

function safeName(text) {
  return String(text || '').replace(/[\\/:*?"<>|\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || '未命名';
}

function extFromMime(mime) {
  if (!mime) return 'mp3';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'mp3';
}

function httpsUrl(url) {
  return String(url || '').trim().replace(/^http:\/\//i, 'https://');
}

/** 有些 CDN 不给 content-type，直接看文件头 */
function sniffImage(bytes) {
  if (!bytes || bytes.length < 12) return '';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'image/avif';
  return '';
}

/** 带 CORS 的封面请求：超时 4s，过小/过大的都丢掉 */
async function fetchImage(url) {
  if (!url) return null;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 4000) : 0;
  try {
    const res = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res.ok) return null;
    const declared = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (declared && !/^image\//.test(declared) && !/octet-stream/.test(declared)) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < COVER_MIN || bytes.length > COVER_MAX) return null;
    const mime = sniffImage(bytes) || declared || 'image/jpeg';
    if (!/^image\//.test(mime)) return null;
    return { bytes, mime };
  } catch (_) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** webp/avif/gif 或超大图统一转成 JPEG，兼容老播放器 */
async function asJpeg(hit) {
  let objectUrl = '';
  try {
    objectUrl = URL.createObjectURL(new Blob([hit.bytes], { type: hit.mime }));
    const img = await new Promise((resolve, reject) => {
      const probe = new Image();
      probe.onload = () => resolve(probe);
      probe.onerror = () => reject(new Error('decode'));
      probe.src = objectUrl;
    });
    const longest = Math.max(img.naturalWidth || 0, img.naturalHeight || 0) || COVER_SIZE;
    const scale = Math.min(1, 800 / longest);
    const width = Math.max(1, Math.round((img.naturalWidth || longest) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || longest) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob || !blob.size) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg' };
  } catch (_) {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function normalizeCover(hit) {
  const needsConvert = !/^image\/(jpeg|png)$/.test(hit.mime) || hit.bytes.length > 1.6 * 1024 * 1024;
  if (!needsConvert) return hit;
  return (await asJpeg(hit)) || hit;
}

/**
 * 取封面原始数据：直连 -> CORS 代理 -> 界面已缓存的缩略图
 * @returns {Promise<{bytes: Uint8Array, mime: string}|null>}
 */
export async function coverFor(track) {
  const urls = artworkCandidates(track, COVER_SIZE).map(httpsUrl).filter(Boolean);
  for (const url of urls) {
    const hit = await fetchImage(url);
    if (hit) return normalizeCover(hit);
  }
  for (const url of urls.slice(0, 2)) {
    const hit = await fetchImage(COVER_PROXY + encodeURIComponent(url));
    if (hit) return normalizeCover(hit);
  }
  const cached = artworkCandidates(track, 120).map(httpsUrl)
    .concat(artworkCandidates(track).map(httpsUrl));
  for (const url of cached) {
    try {
      const blob = await getThumb(url);
      if (!blob || blob.size < 600) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return { bytes, mime: sniffImage(bytes) || blob.type || 'image/jpeg' };
    } catch (_) { /* 下一个 */ }
  }
  return null;
}

/** 歌词文件内容：缺头部信息时补上，便于播放器识别 */
function lrcText(text, track) {
  const body = String(text || '').replace(/^\uFEFF/, '').trim();
  const head = [];
  if (!/^\[ti:/im.test(body)) head.push('[ti:' + String(track.title || '').trim() + ']');
  if (!/^\[ar:/im.test(body)) head.push('[ar:' + String(track.artist || '').trim() + ']');
  if (track.album && !/^\[al:/im.test(body)) head.push('[al:' + String(track.album).trim() + ']');
  head.push('[by:Melody]');
  return head.join('\n') + '\n' + body + '\n';
}

async function lyricsText(track) {
  // 播放器已经抓过就直接用，省一次请求
  if (player && player.lyrics && player.lyrics.trackId === track.id && player.lyrics.text) return player.lyrics.text;
  try { return await lyricsFor(track, store.state.settings || {}); } catch (_) { return ''; }
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function fileName(track, ext) {
  return safeName(track.artist) + ' - ' + safeName(track.title) + '.' + ext;
}

/** 单独导出 .lrc */
export async function saveLyrics(track) {
  const text = await lyricsText(track);
  if (!text || !text.trim()) throw new Error('没有找到歌词');
  saveBlob(new Blob([lrcText(text, track)], { type: 'text/plain;charset=utf-8' }), fileName(track, 'lrc'));
  return text.length;
}

/**
 * 导出缓存中的曲目：写 ID3 标签 + 封面 + 可选歌词，并单独附一份 .lrc
 */
export async function downloadTrack(profileId, track, options = {}) {
  const entry = await getCacheEntry(profileId, track.id);
  if (!entry) throw new Error('尚未缓存，先缓存再下载');
  const blob = await getCacheBlob(profileId, track.id);
  if (!blob) throw new Error('缓存数据已丢失');

  const isMp3 = /mpeg|mp3/.test(entry.mime || '') || /\.mp3$/i.test(entry.sourceKey || '');
  const withCover = options.withCover !== false;
  const withLyrics = options.withLyrics !== false;
  const cover = withCover && isMp3 ? await coverFor(track) : null;
  const lyrics = withLyrics ? await lyricsText(track) : '';

  let output = blob;
  if (isMp3) {
    output = await writeId3(blob, {
      title: track.title,
      artist: track.artist,
      album: track.album,
      cover,
      lyrics: lyrics || '',
    });
  }

  saveBlob(output, fileName(track, extFromMime(entry.mime)));
  if (lyrics) {
    setTimeout(() => saveBlob(new Blob([lrcText(lyrics, track)], { type: 'text/plain;charset=utf-8' }), fileName(track, 'lrc')), 400);
  }

  if (!isMp3) toast('已导出原始文件');
  else {
    const bits = ['标签'];
    if (cover) bits.push('封面');
    if (lyrics) bits.push('歌词');
    toast('已导出（含' + bits.join('、') + '）');
  }
  return { bytes: output.size, tagged: isMp3, cover: Boolean(cover), lyrics: Boolean(lyrics) };
}
