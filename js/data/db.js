/* IndexedDB 封装：单库多表，所有操作返回 Promise */
const DB_NAME = 'melody';
const DB_VERSION = 4;

/** [表名, 主键, 索引[], 自增] */
const SCHEMA = [
  ['profiles', 'id', [], false],
  ['tracks', 'id', [], false],
  ['favorites', 'id', ['profileId'], false],
  ['playlists', 'id', ['profileId'], false],
  ['playlistItems', 'id', ['playlistId'], false],
  ['history', 'id', ['profileId'], true],
  ['searches', 'id', ['profileId'], false],
  ['cached', 'id', ['profileId'], false],
  ['blobs', 'id', [], false],
  ['settings', 'key', [], false],
  ['colors', 'id', [], false],
  ['plays', 'id', ['profileId'], true],
  ['subscriptions', 'id', ['profileId'], false],
  ['thumbs', 'id', [], false],
  ['queue', 'id', [], false],
];

let handle = null;

export function openDb() {
  if (handle) return Promise.resolve(handle);
  handle = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('浏览器不支持 IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      for (const [name, keyPath, indexes, autoIncrement] of SCHEMA) {
        if (database.objectStoreNames.contains(name)) continue;
        const objectStore = database.createObjectStore(name, { keyPath, autoIncrement });
        for (const index of indexes) objectStore.createIndex(index, index, { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('打开数据库失败'));
    req.onblocked = () => reject(new Error('数据库被其它标签页占用'));
  });
  return handle;
}

function requestDone(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function objectStore(name, mode) {
  const database = await openDb();
  const tx = database.transaction(name, mode || 'readonly');
  const store = tx.objectStore(name);
  const wait = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('事务被中止'));
  });
  return { store, wait, tx };
}

export async function get(name, key) {
  const { store } = await objectStore(name);
  return requestDone(store.get(key));
}

export async function all(name) {
  const { store } = await objectStore(name);
  return requestDone(store.getAll());
}

export async function count(name) {
  const { store } = await objectStore(name);
  return requestDone(store.count());
}

export async function byIndex(name, index, value) {
  const { store } = await objectStore(name);
  return requestDone(store.index(index).getAll(value));
}

export async function put(name, value) {
  const { store, wait } = await objectStore(name, 'readwrite');
  const request = store.put(value);
  await wait;
  return request.result;
}

export async function putAll(name, values) {
  if (!values || !values.length) return values;
  const { store, wait } = await objectStore(name, 'readwrite');
  for (const value of values) store.put(value);
  await wait;
  return values;
}

export async function remove(name, key) {
  const { store, wait } = await objectStore(name, 'readwrite');
  store.delete(key);
  await wait;
}

export async function removeMany(name, keys) {
  if (!keys || !keys.length) return;
  const { store, wait } = await objectStore(name, 'readwrite');
  for (const key of keys) store.delete(key);
  await wait;
}

export async function clear(name) {
  const { store, wait } = await objectStore(name, 'readwrite');
  store.clear();
  await wait;
}

/** 删除整个数据库（清空全部数据用） */
export async function destroyDb() {
  if (handle) {
    try { (await handle).close(); } catch (_) { /* ignore */ }
  }
  handle = null;
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(false);
  });
}

export const db = { openDb, get, all, count, byIndex, put, putAll, remove, removeMany, clear, destroyDb };
