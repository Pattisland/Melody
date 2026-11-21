/* 缓存摘要：列表要显示「已缓存」小标 */
import { listCached } from '../data/repo.js';
import { store } from '../core/store.js';

export async function refreshCacheState(profileId) {
  if (!profileId) return;
  const rows = await listCached(profileId);
  const ids = new Set(rows.map((row) => row.trackId));
  const bytes = rows.reduce((sum, row) => sum + (row.bytes || 0), 0);
  store.patch('cache', { ids, count: rows.length, bytes });
}
