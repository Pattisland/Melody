/* 聚合源适配器：GDStudio（JSON 取流）与 Meting 实例（302 直取） */
import { joinArtists, trackKey } from '../core/util.js';

const GD_BASE = 'https://music-api.gdstudio.xyz/api.php';
const METING_BASE = 'https://api.qijieya.cn/meting/';
const QUALITY_BR = { low: 128, standard: 192, high: 320, super: 999 };

export const SERVER_LABEL = {
  netease: '网易云',
  tencent: 'QQ 音乐',
  kugou: '酷狗',
  kuwo: '酷我',
  migu: '咪咕',
  joox: 'JOOX',
};

async function fetchJson(url, signal) {
  const res = await fetch(url, { signal, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function fetchText(url, signal) {
  const res = await fetch(url, { signal, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

function idFromUrl(link) {
  try { return new URL(link).searchParams.get('id') || ''; } catch (_) { return ''; }
}

/** 网易云封面走 Meting 的 302 代理：<img src> 可以直接用，且带 ACAO:* 便于取色 */
export function neteaseCover(picId) {
  if (!picId) return '';
  return METING_BASE + '?server=netease&type=pic&id=' + encodeURIComponent(picId);
}

export function metingCover(server, picId) {
  if (!picId) return '';
  return METING_BASE + '?server=' + encodeURIComponent(server) + '&type=pic&id=' + encodeURIComponent(picId);
}

/* ------------------------- GDStudio（网易云 / JOOX） ------------------------- */

export function createGdStudio(config) {
  const { key, server } = config;
  const base = config.base || GD_BASE;

  return {
    key,
    server,
    label: config.label || SERVER_LABEL[server] || server,
    accent: config.accent || '#c62828',

    async search(query, options = {}) {
      const limit = options.limit || 20;
      const page = options.page || 1;
      const url = base + '?types=search&source=' + encodeURIComponent(server) +
        '&name=' + encodeURIComponent(query) + '&count=' + limit + '&pages=' + page;
      const list = await fetchJson(url, options.signal);
      if (!Array.isArray(list)) throw new Error((list && list.detail) || '搜索失败');
      const items = list.map((row) => ({
        id: trackKey(row.name, row.artist),
        title: String(row.name || ''),
        artist: joinArtists(row.artist),
        album: String(row.album || ''),
        duration: 0,
        artwork: metingCover(server, row.pic_id),
        sources: [{
          source: key,
          id: String(row.url_id || row.id || ''),
          picId: row.pic_id || '',
          lyricId: row.lyric_id || row.id || '',
          album: row.album || '',
          artwork: metingCover(server, row.pic_id),
        }],
      }));
      return { items, isEnd: list.length < limit };
    },

    async resolveUrl(ref, options = {}) {
      const quality = options.quality || 'high';
      const br = QUALITY_BR[quality] || 320;
      const url = base + '?types=url&source=' + encodeURIComponent(server) +
        '&id=' + encodeURIComponent(ref.id) + '&br=' + br;
      const data = await fetchJson(url, options.signal);
      if (!data || !data.url) throw new Error('无法解析播放地址');
      return { url: data.url, quality, br: data.br || br, size: data.size || 0 };
    },

    async lyrics(ref, options = {}) {
      const url = base + '?types=lyric&source=' + encodeURIComponent(server) + '&id=' + encodeURIComponent(ref.lyricId || ref.id);
      const data = await fetchJson(url, options.signal);
      return (data && data.lyric) || '';
    },
  };
}

/* --------------------- Meting 兼容实例（QQ / 酷狗 / 咪咕） --------------------- */

export function createMeting(config) {
  const { key, server } = config;
  const base = config.base || METING_BASE;

  function endpoint(params) {
    const search = new URLSearchParams();
    search.set('server', server);
    for (const name of Object.keys(params)) {
      if (params[name] !== undefined && params[name] !== null && params[name] !== '') search.set(name, String(params[name]));
    }
    return base + '?' + search.toString();
  }

  return {
    key,
    server,
    label: config.label || SERVER_LABEL[server] || server,
    accent: config.accent || '#1e88a8',
    direct: true,

    async search(query, options = {}) {
      const limit = options.limit || 20;
      const page = options.page || 1;
      const url = endpoint({ type: 'search', id: query, page, limit });
      const list = await fetchJson(url, options.signal);
      if (!Array.isArray(list)) throw new Error((list && list.error) || '搜索失败');
      const items = list.map((row) => {
        const id = idFromUrl(row.url);
        return {
          id: trackKey(row.name, row.artist),
          title: String(row.name || ''),
          artist: String(row.artist || ''),
          album: String(row.album || ''),
          duration: 0,
          artwork: row.pic || '',
          sources: [{ source: key, id, picUrl: row.pic || '', lrcUrl: row.lrc || '', artwork: row.pic || '' }],
        };
      }).filter((item) => item.sources[0].id);
      return { items, isEnd: list.length < limit };
    },

    async resolveUrl(ref, options = {}) {
      const quality = options.quality || 'high';
      const br = QUALITY_BR[quality] || 320;
      // 该端点直接 302 到 CDN，<audio> 会自动跟随，不需要 fetch
      return { url: endpoint({ type: 'url', id: ref.id, br }), quality, br, redirect: true };
    },

    async lyrics(ref, options = {}) {
      const url = ref.lrcUrl || endpoint({ type: 'lrc', id: ref.id });
      return fetchText(url, options.signal);
    },
  };
}
