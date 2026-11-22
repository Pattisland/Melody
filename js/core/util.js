/* 通用工具 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESC[c]);
}

export function icon(name, extra = '') {
  return '<span class="icon ' + extra + '" aria-hidden="true">' + esc(name) + '</span>';
}

export function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return h + ':' + String(m % 60).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  return m + ':' + String(s).padStart(2, '0');
}

export function fmtBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return (n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)) + ' ' + units[i];
}

export function debounce(fn, wait = 250) {
  let timer = 0;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function uid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function widthFold(input) {
  return String(input == null ? '' : input)
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

/** 标题规范化：去括号补充、去标点与空白、小写 */
export function normalizeTitle(title) {
  let s = widthFold(title).toLowerCase();
  if (s.normalize) s = s.normalize('NFKC').toLowerCase();
  s = s.replace(/[\(\[]([^\)\]]*)[\)\]]/g, (whole, inner) => (inner ? ' ' + inner + ' ' : ' '));
  s = s.replace(/[\s\-_.,!?~·:;'"/\\+*&^%$#@!！？。，、；：""''《》<>【】（）]/g, '');
  return s.trim();
}

/** 歌手规范化：多歌手取第一位 */
export function normalizeArtist(artist) {
  const raw = Array.isArray(artist) ? artist.join('/') : String(artist || '');
  const first = raw.split(/\s*(?:\/|&|,|、|;|feat\.?|ft\.?|with)\s*/i)[0] || '';
  return widthFold(first).toLowerCase().replace(/[\s\-_.,!?·]/g, '').trim();
}

/** 多歌手拆分：/ 、 & , ; + feat. ft. with 等分隔，返回去重后的名字数组 */
export function splitArtists(artist) {
  const raw = Array.isArray(artist) ? artist.join(' / ') : String(artist || '');
  const parts = raw.split(/\s*(?:\/|、|&|,|;|\+|\bfeat\.?\b|\bft\.?\b|\bwith\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

export function hash32(input) {
  let h = 0x811c9dc5;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** 曲目稳定 id —— 跨来源合并的锚点 */
export function trackKey(title, artist) {
  return hash32(normalizeTitle(title) + '|' + normalizeArtist(artist));
}

/** 把可能是对象/数组的字段安全转成字符串（有些聚合接口把 album 返回成对象） */
export function textOf(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map((item) => textOf(item)).filter(Boolean).join(' / ');
  if (value && typeof value === 'object') return textOf(value.name || value.title || value.text || '');
  return '';
}

export function joinArtists(artist) {
  if (Array.isArray(artist)) return artist.filter(Boolean).join(' / ');
  return String(artist || '');
}

export function animate(el, keyframes, options = {}) {
  if (!el || prefersReducedMotion() || typeof el.animate !== 'function') return null;
  return el.animate(keyframes, { duration: 220, easing: 'cubic-bezier(.2,0,0,1)', ...options });
}

export async function requestPersistentStorage() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}

export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}
