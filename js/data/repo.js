/* 领域操作层：档案 / 收藏 / 历史 / 搜索词 / 缓存 / 歌单 / 设置 */
import * as idb from './db.js';
import { trackKey, uid, joinArtists, textOf } from '../core/util.js';

export const DEFAULT_SETTINGS = {
  'theme.seed': '#0f6b72',
  'theme.mode': 'system',
  'theme.variant': 'tonal',
  'theme.fromCover': false,
  'sources.order': ['gd-netease', 'qj-tencent', 'qj-kugou', 'qj-migu', 'audius'],
  // 酷狗的取流接口长期 403/CORS 失败，默认停用，用户可在设置里打开
  'sources.disabled': ['qj-kugou'],
  'profile.active': null,
  'prefs.historyLimit': 300,
  'prefs.autoCache': false,
  'prefs.reduceMotion': false,
  'prefs.blurBg': true,
  'prefs.density': 'comfortable',
  'prefs.notifyCache': true,
  'prefs.playerTint': true,
  // 全局跟随封面取色：开着时整个应用（不只是播放器）跟着当前封面换主色
  'prefs.tintGlobal': false,
  'prefs.lyricsSource': '',
  // 开始播放就自动展开全屏播放器（默认关）
  'prefs.autoFull': false,
  // 封面大小档位：small / normal / large
  'prefs.coverSize': 'normal',
  'prefs.cacheConcurrency': 2,
  'prefs.pageGutter': 154,
};

/**
 * 数据变更广播：页面订阅后可以立即刷新，而不是等用户手动刷新。
 * kind: favorite / cache / playlist / subscription / history / profile
 */
export function notifyData(kind, detail = {}) {
  if (typeof document === 'undefined') return;
  try {
    document.dispatchEvent(new CustomEvent('melody:data', { detail: { kind, ...detail } }));
  } catch (_) { /* 忽略 */ }
}

export async function loadSettings() {
  const rows = await idb.all('settings');
  const out = { ...DEFAULT_SETTINGS };
  for (const row of rows) if (row && row.key) out[row.key] = row.value;
  return out;
}

export async function saveSetting(key, value) {
  await idb.put('settings', { key, value });
  return value;
}

export async function saveSettings(patch) {
  const rows = Object.keys(patch).map((key) => ({ key, value: patch[key] }));
  await idb.putAll('settings', rows);
}

/* ------------------------------- 档案 ------------------------------- */

export async function listProfiles() {
  const rows = await idb.all('profiles');
  return rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function getProfile(id) {
  return idb.get('profiles', id);
}

export async function createProfile(name) {
  const now = Date.now();
  const profile = { id: uid('p'), name: String(name || '').trim() || '我的档案', avatar: '', createdAt: now, updatedAt: now };
  await idb.put('profiles', profile);
  return profile;
}

export async function updateProfile(id, patch) {
  const current = await idb.get('profiles', id);
  if (!current) return null;
  const next = { ...current, ...patch, id, updatedAt: Date.now() };
  await idb.put('profiles', next);
  return next;
}

export async function deleteProfile(id) {
  const favorites = await idb.byIndex('favorites', 'profileId', id);
  await idb.removeMany('favorites', favorites.map((row) => row.id));
  const history = await idb.byIndex('history', 'profileId', id);
  await idb.removeMany('history', history.map((row) => row.id));
  const searches = await idb.byIndex('searches', 'profileId', id);
  await idb.removeMany('searches', searches.map((row) => row.id));
  const cached = await idb.byIndex('cached', 'profileId', id);
  await idb.removeMany('blobs', cached.map((row) => row.id));
  await idb.removeMany('cached', cached.map((row) => row.id));
  const playlists = await idb.byIndex('playlists', 'profileId', id);
  for (const list of playlists) {
    const items = await idb.byIndex('playlistItems', 'playlistId', list.id);
    await idb.removeMany('playlistItems', items.map((row) => row.id));
  }
  await idb.removeMany('playlists', playlists.map((row) => row.id));
  await idb.remove('profiles', id);
}

/** 保证至少有一个档案，返回当前档案 */
export async function ensureActiveProfile() {
  const profiles = await listProfiles();
  if (!profiles.length) {
    const created = await createProfile('我的档案');
    await saveSetting('profile.active', created.id);
    return { profile: created, profiles: [created] };
  }
  const activeId = (await idb.get('settings', 'profile.active')) || {};
  const active = profiles.find((row) => row.id === activeId.value) || profiles[0];
  if (!activeId.value || activeId.value !== active.id) await saveSetting('profile.active', active.id);
  return { profile: active, profiles };
}

/* ------------------------------- 曲目 ------------------------------- */

export function toRecord(track) {
  const title = String(track.title || '').trim();
  const artist = joinArtists(track.artist);
  return {
    id: track.id || trackKey(title, artist),
    title,
    artist,
    album: textOf(track.album),
    duration: Number(track.duration) || 0,
    artwork: String(track.artwork || ''),
    sources: Array.isArray(track.sources) ? track.sources : [],
    updatedAt: Date.now(),
  };
}

export async function upsertTrack(track) {
  const record = toRecord(track);
  await idb.put('tracks', record);
  return record;
}

export async function getTrack(id) {
  return idb.get('tracks', id);
}

/* 封面取色结果缓存：同一首只算一次 */
export async function getTrackColor(trackId) {
  const row = await idb.get('colors', trackId);
  return row ? row.hex : '';
}

export async function saveTrackColor(trackId, hex) {
  if (!trackId || !hex) return;
  await idb.put('colors', { id: trackId, hex, at: Date.now() });
}

export async function getCachedTrack(profileId, trackId) {
  const row = await idb.get('cached', profileId + ':' + trackId);
  return row || null;
}

/* ------------------------------ 收藏 ------------------------------ */

export async function isFavorite(profileId, trackId) {
  if (!profileId) return false;
  return Boolean(await idb.get('favorites', profileId + ':' + trackId));
}

export async function toggleFavorite(profileId, track) {
  const record = toRecord(track);
  await idb.put('tracks', record);
  const id = profileId + ':' + record.id;
  const existing = await idb.get('favorites', id);
  if (existing) {
    await idb.remove('favorites', id);
    notifyData('favorite', { trackId: record.id, added: false });
    return false;
  }
  await idb.put('favorites', { id, profileId, trackId: record.id, track: record, addedAt: Date.now() });
  notifyData('favorite', { trackId: record.id, added: true });
  return true;
}

export async function removeFavorite(profileId, trackId) {
  if (!profileId || !trackId) return false;
  await idb.remove('favorites', profileId + ':' + trackId);
  notifyData('favorite', { trackId, added: false });
  return true;
}

export async function listFavorites(profileId) {
  const rows = await idb.byIndex('favorites', 'profileId', profileId);
  return rows.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

/* ------------------------------ 历史 ------------------------------ */

export async function recordPlay(profileId, track) {
  if (!profileId) return;
  const record = toRecord(track);
  await idb.put('tracks', record);
  const existing = await idb.byIndex('history', 'profileId', profileId);
  const same = existing.find((row) => row.trackId === record.id);
  if (same) {
    await idb.put('history', { ...same, playedAt: Date.now(), count: (same.count || 1) + 1 });
  } else {
    await idb.put('history', { profileId, trackId: record.id, track: record, playedAt: Date.now(), count: 1 });
  }
  const rows = await idb.byIndex('history', 'profileId', profileId);
  if (rows.length > 300) {
    const doomed = rows.sort((a, b) => a.playedAt - b.playedAt).slice(0, rows.length - 300);
    await idb.removeMany('history', doomed.map((row) => row.id));
  }
}

export async function listHistory(profileId, limit = 100) {
  const rows = await idb.byIndex('history', 'profileId', profileId);
  return rows.sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0)).slice(0, limit);
}

export async function clearHistory(profileId) {
  const rows = await idb.byIndex('history', 'profileId', profileId);
  await idb.removeMany('history', rows.map((row) => row.id));
}

/* ----------------------------- 搜索历史 ----------------------------- */

export async function recordSearch(profileId, term) {
  const clean = String(term || '').trim();
  if (!profileId || !clean) return;
  const id = profileId + ':' + clean.toLowerCase();
  const existing = await idb.get('searches', id);
  await idb.put('searches', {
    id, profileId, term: clean,
    count: ((existing && existing.count) || 0) + 1,
    lastAt: Date.now(),
  });
}

export async function listSearches(profileId, limit = 24) {
  const rows = await idb.byIndex('searches', 'profileId', profileId);
  return rows.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)).slice(0, limit);
}

export async function removeSearch(id) { await idb.remove('searches', id); }

export async function clearSearches(profileId) {
  const rows = await idb.byIndex('searches', 'profileId', profileId);
  await idb.removeMany('searches', rows.map((row) => row.id));
}

/* ------------------------------ 缓存 ------------------------------ */

export async function putCache(profileId, track, blob, meta = {}) {
  const record = toRecord(track);
  const id = profileId + ':' + record.id;
  await idb.put('blobs', { id, blob });
  await idb.put('cached', {
    id, profileId, trackId: record.id, track: record,
    bytes: blob.size, mime: blob.type || meta.mime || 'audio/mpeg',
    sourceKey: meta.sourceKey || '', quality: meta.quality || '',
    createdAt: Date.now(),
  });
  return id;
}

export async function getCacheEntry(profileId, trackId) {
  return idb.get('cached', profileId + ':' + trackId);
}

export async function getCacheBlob(profileId, trackId) {
  const row = await idb.get('blobs', profileId + ':' + trackId);
  return row ? row.blob : null;
}

export async function listCached(profileId) {
  const rows = await idb.byIndex('cached', 'profileId', profileId);
  return rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function removeCache(profileId, trackId) {
  await idb.remove('blobs', profileId + ':' + trackId);
  await idb.remove('cached', profileId + ':' + trackId);
  notifyData('cache', { trackId });
}

export async function cacheStats(profileId) {
  const rows = await idb.byIndex('cached', 'profileId', profileId);
  return { count: rows.length, bytes: rows.reduce((sum, row) => sum + (row.bytes || 0), 0) };
}

/* ------------------------------ 收听记录与统计 ------------------------------ */

const DAY = 86400000;

/** 每次开始播放记一条，用于统计与排行（不是历史列表） */
export async function recordListen(profileId, track) {
  if (!profileId || !track) return null;
  const record = toRecord(track);
  await idb.put('tracks', record);
  return idb.put('plays', {
    profileId, trackId: record.id, track: record,
    at: Date.now(), ms: 0,
  });
}

/** 播放过程中把真实收听时长写回当前这条播放记录 */
export async function updateListenMs(id, ms) {
  if (!id || !Number.isFinite(ms) || ms < 0) return;
  const row = await idb.get('plays', id);
  if (!row) return;
  row.ms = Math.round(ms);
  await idb.put('plays', row);
}

export async function listPlays(profileId, sinceMs) {
  const rows = await idb.byIndex('plays', 'profileId', profileId);
  const since = sinceMs || 0;
  return rows.filter((row) => (row.at || 0) >= since);
}

/** 总时长 + 最近 7 天逐日时长 + 曲目/歌手数 */
export async function listeningStats(profileId) {
  const rows = await idb.byIndex('plays', 'profileId', profileId);
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const dayStart = startOfToday.getTime() - i * DAY;
    const dayEnd = dayStart + DAY;
    const ms = rows.filter((row) => row.at >= dayStart && row.at < dayEnd).reduce((sum, row) => sum + (row.ms || 0), 0);
    days.push({ at: dayStart, ms });
  }
  const tracks = new Set(rows.map((row) => row.trackId));
  const artists = new Set(rows.map((row) => (row.track && row.track.artist) || '').filter(Boolean));
  return {
    totalMs: rows.reduce((sum, row) => sum + (row.ms || 0), 0),
    plays: rows.length,
    tracks: tracks.size,
    artists: artists.size,
    days,
    weekMs: days.reduce((sum, day) => sum + day.ms, 0),
  };
}

/** 排行榜：按播放次数聚合 */
export async function topTracks(profileId, range, limit = 5) {
  const since = range === 'week' ? Date.now() - 7 * DAY : range === 'month' ? Date.now() - 30 * DAY : 0;
  const rows = await listPlays(profileId, since);
  const map = new Map();
  for (const row of rows) {
    const entry = map.get(row.trackId) || { track: row.track, count: 0, ms: 0, lastAt: 0 };
    entry.count += 1;
    entry.ms += row.ms || 0;
    entry.lastAt = Math.max(entry.lastAt, row.at || 0);
    if (row.track) entry.track = row.track;
    map.set(row.trackId, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || b.lastAt - a.lastAt).slice(0, limit);
}

/* ------------------------------ 曲库与推荐 ------------------------------ */

/** 曲库 = 收藏 + 自定义歌单 + 缓存（按 id 去重） */
export async function libraryTracks(profileId) {
  const [favorites, cached, playlists] = await Promise.all([
    idb.byIndex('favorites', 'profileId', profileId),
    idb.byIndex('cached', 'profileId', profileId),
    idb.byIndex('playlists', 'profileId', profileId),
  ]);
  const items = await Promise.all(playlists.map((list) => idb.byIndex('playlistItems', 'playlistId', list.id)));
  const map = new Map();
  const add = (track) => { if (track && track.id && !map.has(track.id)) map.set(track.id, track); };
  favorites.forEach((row) => add(row.track));
  cached.forEach((row) => add(row.track));
  items.flat().forEach((row) => add(row.track));
  return Array.from(map.values());
}

/** 推荐：曲库里最近没听过的，最多 10 首 */
export async function recommendations(profileId, limit = 10) {
  const [library, recent] = await Promise.all([
    libraryTracks(profileId),
    listPlays(profileId, Date.now() - 14 * DAY),
  ]);
  const heard = new Set(recent.map((row) => row.trackId));
  const pool = library.filter((track) => !heard.has(track.id));
  const rest = library.filter((track) => heard.has(track.id));
  const shuffle = (list) => {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy;
  };
  return shuffle(pool).concat(shuffle(rest)).slice(0, limit);
}

/* ------------------------------ 订阅 ------------------------------ */

export async function listSubscriptions(profileId) {
  const rows = await idb.byIndex('subscriptions', 'profileId', profileId);
  return rows.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

export async function addSubscription(profileId, artist) {
  const name = String(artist || '').trim();
  if (!profileId || !name) return null;
  const id = profileId + ':' + name.toLowerCase();
  const existing = await idb.get('subscriptions', id);
  if (existing) return existing;
  const row = { id, profileId, artist: name, addedAt: Date.now() };
  await idb.put('subscriptions', row);
  notifyData('subscription', { artist: name });
  return row;
}

export async function removeSubscription(id) {
  await idb.remove('subscriptions', id);
  notifyData('subscription');
}

export async function isSubscribed(profileId, artist) {
  if (!profileId || !artist) return false;
  return Boolean(await idb.get('subscriptions', profileId + ':' + String(artist).toLowerCase()));
}

/* ------------------------------ 封面缩略图缓存 ------------------------------ */

export async function getThumb(key) {
  const row = await idb.get('thumbs', key);
  return row ? row.blob : null;
}

export async function putThumb(key, blob) {
  if (!key || !blob) return;
  await idb.put('thumbs', { id: key, blob, at: Date.now() });
}

export async function trimThumbs(max) {
  const rows = await idb.all('thumbs');
  if (rows.length <= max) return;
  const doomed = rows.sort((a, b) => a.at - b.at).slice(0, rows.length - max);
  await idb.removeMany('thumbs', doomed.map((row) => row.id));
}

/* ------------------------------ 歌单 ------------------------------ */

export async function createPlaylist(profileId, name) {
  const now = Date.now();
  const playlist = { id: uid('pl'), profileId, name: String(name || '').trim() || '新建歌单', createdAt: now, updatedAt: now };
  await idb.put('playlists', playlist);
  return playlist;
}

export async function listPlaylists(profileId) {
  const rows = await idb.byIndex('playlists', 'profileId', profileId);
  return rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function renamePlaylist(id, name) {
  const row = await idb.get('playlists', id);
  if (!row) return null;
  const next = { ...row, name: String(name || '').trim() || row.name, updatedAt: Date.now() };
  await idb.put('playlists', next);
  return next;
}

export async function updatePlaylist(id, patch) {
  const row = await idb.get('playlists', id);
  if (!row) return null;
  const next = { ...row, ...patch, updatedAt: Date.now() };
  await idb.put('playlists', next);
  notifyData('playlist', { playlistId: id });
  return next;
}

export async function deletePlaylist(id) {
  const items = await idb.byIndex('playlistItems', 'playlistId', id);
  await idb.removeMany('playlistItems', items.map((row) => row.id));
  await idb.remove('playlists', id);
  notifyData('playlist', { playlistId: id, deleted: true });
}

export async function addToPlaylist(playlistId, track) {
  const record = toRecord(track);
  await idb.put('tracks', record);
  const id = playlistId + ':' + record.id;
  const existing = await idb.get('playlistItems', id);
  if (existing) return false;
  const items = await idb.byIndex('playlistItems', 'playlistId', playlistId);
  await idb.put('playlistItems', {
    id, playlistId, trackId: record.id, track: record,
    position: items.length, addedAt: Date.now(),
  });
  notifyData('playlist', { playlistId });
  const list = await idb.get('playlists', playlistId);
  if (list) await idb.put('playlists', { ...list, updatedAt: Date.now() });
  return true;
}

export async function listPlaylistItems(playlistId) {
  const rows = await idb.byIndex('playlistItems', 'playlistId', playlistId);
  return rows.sort((a, b) => (a.position || 0) - (b.position || 0));
}

/** 歌单内上下移动一首（delta = -1 上移 / +1 下移） */
export async function movePlaylistItem(playlistId, trackId, delta) {
  const items = await listPlaylistItems(playlistId);
  const index = items.findIndex((row) => row.trackId === trackId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return false;
  const [moved] = items.splice(index, 1);
  items.splice(target, 0, moved);
  await Promise.all(items.map((row, position) => (
    row.position === position ? null : idb.put('playlistItems', { ...row, position })
  )));
  const list = await idb.get('playlists', playlistId);
  if (list) await idb.put('playlists', { ...list, updatedAt: Date.now() });
  notifyData('playlist', { playlistId });
  return true;
}

export async function removeFromPlaylist(playlistId, trackId) {
  await idb.remove('playlistItems', playlistId + ':' + trackId);
  notifyData('playlist', { playlistId });
}
