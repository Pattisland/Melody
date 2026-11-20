/* 极简响应式状态：整快照 + 变更键 */
const state = {
  ready: false,
  profileId: null,
  profiles: [],
  theme: { seed: '#0f6b72', mode: 'system', variant: 'tonal', fromCover: false },
  sources: { order: [], disabled: [] },
  prefs: {},
  player: {
    track: null, playing: false, current: 0, duration: 0,
    queue: [], index: -1, mode: 'mini', loading: false, error: null, repeat: 'off', shuffle: false,
  },
  cache: { count: 0, bytes: 0 },
  tasks: { active: 0 },
};

const subs = new Set();

export const store = {
  get state() { return state; },
  get(key) { return state[key]; },
  set(patch, reason) {
    const changed = [];
    for (const key of Object.keys(patch)) {
      if (state[key] !== patch[key]) { state[key] = patch[key]; changed.push(key); }
    }
    if (!changed.length) return;
    for (const fn of Array.from(subs)) {
      try { fn(state, changed, reason); } catch (err) { console.error('[store]', err); }
    }
  },
  patch(key, part, reason) {
    store.set({ [key]: { ...state[key], ...part } }, reason);
  },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
};

export function on(keys, fn) {
  const wanted = Array.isArray(keys) ? keys : [keys];
  return store.subscribe((snapshot, changed) => {
    if (changed.some((key) => wanted.includes(key))) fn(snapshot, changed);
  });
}
