/* 领域操作层：档案 / 收藏 / 历史 / 搜索词 / 缓存 / 歌单 / 设置 */
import * as idb from './db.js';
import { trackKey, uid, joinArtists } from '../core/util.js';

export const DEFAULT_SETTINGS = {
  'theme.seed': '#0f6b72',
  'theme.mode': 'system',
  'theme.variant': 'tonal',
  'theme.fromCover': false,
  'sources.order': ['gd-netease', 'qj-tencent', 'qj-kugou', 'qj-migu', 'audius'],
  'sources.disabled': [],
  'profile.active': null,
  'prefs.historyLimit': 300,
  'prefs.autoCache': false,
  'prefs.reduceMotion': false,
};

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
    album: String(track.album || ''),
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
    return false;
  }
  await idb.put('favorites', { id, profileId, trackId: record.id, track: record, addedAt: Date.now() });
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
}

export async function cacheStats(profileId) {
  const rows = await idb.byIndex('cached', 'profileId', profileId);
  return { count: rows.length, bytes: rows.reduce((sum, row) => sum + (row.bytes || 0), 0) };
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

export async function deletePlaylist(id) {
  const items = await idb.byIndex('playlistItems', 'playlistId', id);
  await idb.removeMany('playlistItems', items.map((row) => row.id));
  await idb.remove('playlists', id);
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
  const list = await idb.get('playlists', playlistId);
  if (list) await idb.put('playlists', { ...list, updatedAt: Date.now() });
  return true;
}

export async function listPlaylistItems(playlistId) {
  const rows = await idb.byIndex('playlistItems', 'playlistId', playlistId);
  return rows.sort((a, b) => (a.position || 0) - (b.position || 0));
}

export async function removeFromPlaylist(playlistId, trackId) {
  await idb.remove('playlistItems', playlistId + ':' + trackId);
}
