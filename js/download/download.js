/* 下载：缓存 -> 写标签 -> 触发保存 */
import { getCacheEntry, getCacheBlob } from '../data/repo.js';
import { writeId3 } from './id3.js';
import { lyricsFor, artworkFor } from '../sources/registry.js';
import { store } from '../core/store.js';
import { toast } from '../ui/components.js';

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

async function fetchCover(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) return null;
    const buffer = new Uint8Array(await res.arrayBuffer());
    if (!buffer.length) return null;
    return { bytes: buffer, mime: (res.headers.get('content-type') || 'image/jpeg').split(';')[0] };
  } catch (_) { return null; }
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

/**
 * 导出缓存中的曲目：写 ID3 标签 + 封面 + 可选歌词，并单独附一份 .lrc
 */
export async function downloadTrack(profileId, track, options = {}) {
  const entry = await getCacheEntry(profileId, track.id);
  if (!entry) throw new Error('尚未缓存，先缓存再下载');
  const blob = await getCacheBlob(profileId, track.id);
  if (!blob) throw new Error('缓存数据已丢失');

  const isMp3 = /mpeg|mp3/.test(entry.mime || '') || /\.mp3$/i.test(entry.sourceKey || '');
  const cover = options.withCover === false ? null : await fetchCover(artworkFor(track));
  let lyrics = '';
  if (options.withLyrics !== false) {
    try { lyrics = await lyricsFor(track, store.state.settings || {}); } catch (_) { lyrics = ''; }
  }

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

  const base = safeName(track.artist) + ' - ' + safeName(track.title);
  saveBlob(output, base + '.' + extFromMime(entry.mime));
  if (lyrics && options.withLyrics !== false) {
    setTimeout(() => saveBlob(new Blob([lyrics], { type: 'text/plain;charset=utf-8' }), base + '.lrc'), 400);
  }
  toast(isMp3 ? '已导出（含标签与封面）' : '已导出原始文件');
  return { bytes: output.size, tagged: isMp3 };
}
