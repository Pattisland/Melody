/* 缓存队列：并发上限、暂停、取消、失败重试一次 */
import { store } from '../core/store.js';
import { cacheTrack } from './cache.js';
import { getCacheEntry } from '../data/repo.js';
import * as idb from '../data/db.js';
import { refreshCacheState } from '../ui/cache-state.js';
import { toast } from '../ui/components.js';

const tasks = new Map();
const controllers = new Map();
let paused = false;
let persistTimer = 0;

/** 队列落库：只留未完成的，刷新页面后能接着跑 */
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      const rows = Array.from(tasks.values())
        .filter((task) => task.status === 'waiting' || task.status === 'failed' || task.status === 'running')
        .map((task) => ({
          id: task.id,
          track: task.track,
          status: task.status === 'running' ? 'waiting' : task.status,
          attempt: task.attempt || 0,
          error: task.error || '',
        }));
      await idb.clear('queue');
      if (rows.length) await idb.putAll('queue', rows);
    } catch (_) { /* 落库失败不影响本次会话 */ }
  }, 400);
}

/** 启动时恢复上次没跑完/失败的队列 */
export async function restoreQueue() {
  try {
    const rows = await idb.all('queue');
    for (const row of rows) {
      if (!row || !row.track || !row.id || tasks.has(row.id)) continue;
      tasks.set(row.id, {
        id: row.id,
        track: row.track,
        status: 'waiting',
        received: 0,
        total: 0,
        error: row.error || '',
        attempt: row.attempt || 0,
        startedAt: 0,
        finishedAt: 0,
      });
    }
  } catch (_) { /* 忽略 */ }
  publish();
  schedule();
}

function concurrency() {
  const raw = Number((store.state.settings || {})['prefs.cacheConcurrency'] || 2);
  return Math.max(1, Math.min(4, raw));
}

function notifyCacheEnabled() {
  const settings = store.state.settings || {};
  return settings['prefs.notifyCache'] !== false;
}

function publish() {
  const items = Array.from(tasks.values());
  store.patch('tasks', {
    items,
    active: items.filter((task) => task.status === 'running').length,
    waiting: items.filter((task) => task.status === 'waiting').length,
    done: items.filter((task) => task.status === 'done').length,
    failed: items.filter((task) => task.status === 'failed').length,
    paused,
  });
  persist();
}

export function listTasks() { return Array.from(tasks.values()); }
export function taskOf(trackId) { return tasks.get(trackId) || null; }
export function isPaused() { return paused; }

/** 加入队列；已缓存、已在队列中的会跳过 */
export async function enqueue(tracks) {
  const profileId = store.state.profileId;
  if (!profileId) return 0;
  const list = Array.isArray(tracks) ? tracks : [tracks];
  let added = 0;
  for (const track of list) {
    if (!track || !track.id) continue;
    const existing = tasks.get(track.id);
    if (existing && (existing.status === 'waiting' || existing.status === 'running')) continue;
    const cached = await getCacheEntry(profileId, track.id).catch(() => null);
    if (cached) continue;
    tasks.set(track.id, {
      id: track.id,
      track,
      status: 'waiting',
      received: 0,
      total: 0,
      error: '',
      attempt: 0,
      startedAt: 0,
      finishedAt: 0,
    });
    added += 1;
  }
  publish();
  schedule();
  return added;
}

export function pauseAll() {
  paused = true;
  publish();
}

export function resumeAll() {
  paused = false;
  publish();
  schedule();
}

export function cancelTask(id) {
  const task = tasks.get(id);
  if (!task) return;
  const controller = controllers.get(id);
  if (controller) { controller.abort(); controllers.delete(id); }
  if (task.status === 'waiting' || task.status === 'running') {
    task.status = 'cancelled';
    task.finishedAt = Date.now();
  }
  publish();
  schedule();
}

export function retryTask(id) {
  const task = tasks.get(id);
  if (!task) return;
  task.status = 'waiting';
  task.error = '';
  task.attempt = 0;
  task.received = 0;
  task.total = 0;
  publish();
  schedule();
}

export function removeTask(id) {
  const controller = controllers.get(id);
  if (controller) controller.abort();
  controllers.delete(id);
  tasks.delete(id);
  publish();
}

export function clearFinished() {
  for (const [id, task] of Array.from(tasks.entries())) {
    if (task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') tasks.delete(id);
  }
  publish();
}

async function runTask(task) {
  const profileId = store.state.profileId;
  if (!profileId) return;
  const controller = new AbortController();
  controllers.set(task.id, controller);
  task.status = 'running';
  task.startedAt = Date.now();
  task.received = 0;
  task.total = 0;
  task.error = '';
  publish();
  try {
    const result = await cacheTrack(profileId, task.track, {
      settings: store.state.settings,
      signal: controller.signal,
      onProgress: (received, total) => {
        task.received = received;
        task.total = total;
        publish();
      },
    });
    controllers.delete(task.id);
    task.received = (result && result.bytes) || task.received;
    task.total = task.received;
    task.status = 'done';
    task.finishedAt = Date.now();
    publish();
    await refreshCacheState(profileId);
    if (notifyCacheEnabled()) toast('已缓存：' + task.track.title);
  } catch (err) {
    controllers.delete(task.id);
    if (err && err.name === 'AbortError') {
      if (task.status !== 'cancelled') { task.status = 'cancelled'; task.finishedAt = Date.now(); }
      publish();
      return;
    }
    if (task.attempt < 1) {
      task.attempt += 1;
      task.status = 'waiting';
      task.error = err.message || '失败，正在重试';
      publish();
      schedule();
      return;
    }
    task.status = 'failed';
    task.error = err.message || '失败';
    task.finishedAt = Date.now();
    publish();
    if (notifyCacheEnabled()) toast('缓存失败：' + task.track.title);
  }
}

function schedule() {
  if (paused) return;
  const running = Array.from(tasks.values()).filter((task) => task.status === 'running').length;
  const slots = concurrency() - running;
  if (slots <= 0) return;
  const waiting = Array.from(tasks.values()).filter((task) => task.status === 'waiting').slice(0, slots);
  for (const task of waiting) {
    runTask(task).finally(() => schedule());
  }
}

/** 启动时把队列清空（缓存本身持久，任务不跨会话保留） */
export function resetQueue() {
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
  tasks.clear();
  paused = false;
  publish();
}
