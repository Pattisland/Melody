/* Audius：合法免费全曲源（api.audius.co，CORS 全开） */
import { trackKey } from '../core/util.js';

const BASE = 'https://api.audius.co/v1';
const APP = 'Melody';
const TIMEOUTS = 15000;

async function getJson(url, signal) {
  const res = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function artworkOf(track) {
  const art = track.artwork || {};
  return art['480x480'] || art['1000x1000'] || art['150x150'] || '';
}

function toItem(track) {
  const artist = (track.user && (track.user.name || track.user.handle)) || 'Audius';
  return {
    id: trackKey(track.title, artist),
    title: String(track.title || ''),
    artist,
    album: String(track.album_backlink || ''),
    duration: Number(track.duration) || 0,
    artwork: artworkOf(track),
    sources: [{ source: 'audius', id: track.id, artwork: artworkOf(track), genre: track.genre || '' }],
  };
}

export function createAudius() {
  return {
    key: 'audius',
    label: 'Audius',
    accent: '#7e57c2',

    async search(query, options = {}) {
      const limit = options.limit || 20;
      const offset = ((options.page || 1) - 1) * limit;
      const url = BASE + '/tracks/search?query=' + encodeURIComponent(query) +
        '&app_name=' + APP + '&limit=' + limit + (offset ? '&offset=' + offset : '');
      const data = await getJson(url, options.signal);
      const list = (data && data.data) || [];
      return { items: list.map(toItem), isEnd: list.length < limit };
    },

    async resolveUrl(ref) {
      return { url: BASE + '/tracks/' + encodeURIComponent(ref.id) + '/stream?app_name=' + APP, quality: 'high', direct: true };
    },

    async lyrics() { return ''; },
  };
}
