/* 封面：缩略图优先、缓存到 IndexedDB、失败逐级回退、播放器再加载全图 */
import { esc } from '../core/util.js';
import { artworkCandidates } from '../sources/registry.js';
import { getThumb, putThumb, trimThumbs } from '../data/repo.js';

const mem = new Map();
const inflight = new Set();
let thumbWrites = 0;
let engineInstalled = false;

export function sized(url, size) {
  if (!url) return '';
  if (/param=\d+y\d+/.test(url)) return url.replace(/param=\d+y\d+/, 'param=' + size + 'y' + size);
  return url;
}

export function coverSources(track, size) {
  return artworkCandidates(track, size).map((url) => sized(url, size)).slice(0, 3);
}

/** 生成占位 + img，src 由 hydrate 填，避免同步阻塞 */
export function coverMarkup(track, options = {}) {
  const size = options.size || 120;
  const list = coverSources(track, size);
  if (!list.length) return '';
  const full = options.full ? coverSources(track, options.full)[0] : '';
  return '<img data-cover data-src="' + esc(list[0]) + '" data-fallbacks="' + esc(list.slice(1).join('|')) + '"' +
    (full ? ' data-full="' + esc(full) + '"' : '') +
    (options.eager ? '' : ' loading="lazy"') +
    ' decoding="async" referrerpolicy="no-referrer" alt="">';
}

async function hydrateImg(img) {
  if (!img || img.dataset.ready === '1') return;
  img.dataset.ready = '1';
  const url = img.dataset.src;
  if (!url) return;
  if (mem.has(url)) { img.src = mem.get(url); return; }
  try {
    // 缓存读取不能拖住显示：最多等 300ms，超时直接用网络地址
    const blob = await Promise.race([
      getThumb(url),
      new Promise((resolve) => setTimeout(() => resolve(null), 300)),
    ]);
    if (blob) {
      const objectUrl = URL.createObjectURL(blob);
      mem.set(url, objectUrl);
      img.src = objectUrl;
      cacheRemote(url);
      return;
    }
  } catch (_) { /* 忽略缓存异常 */ }
  img.src = url;
  cacheRemote(url, img);
}

function cacheRemote(url, img) {
  // 只有带 ACAO 的封面才值得二次抓取；QQ/酷狗 CDN 会直接 CORS 失败
  if (!/server=netease|music\.126\.net|audius|doubanio|hdslb/i.test(url)) return;
  if (inflight.has(url)) return;
  inflight.add(url);
  fetch(url, { mode: 'cors', credentials: 'omit' })
    .then((res) => (res.ok ? res.blob() : null))
    .then(async (blob) => {
      if (!blob || blob.size < 200 || blob.size > 400 * 1024) return;
      await putThumb(url, blob);
      if (img && !img.src) img.src = url;
      thumbWrites += 1;
      if (thumbWrites % 25 === 0) trimThumbs(400).catch(() => {});
    })
    .catch(() => {})
    .finally(() => inflight.delete(url));
}

/** 缩略图加载完再拉全图，加载好再换，避免闪烁 */
function upgradeToFull(img) {
  const box = img.closest('[data-cover-full]');
  const full = (box && box.dataset.coverFull) || img.dataset.full;
  if (!full) return;
  const probe = new Image();
  probe.referrerPolicy = 'no-referrer';
  probe.onload = () => {
    if (!img.isConnected) return;
    img.classList.add('is-upgrading');
    img.src = full;
    img.addEventListener('load', () => img.classList.remove('is-upgrading'), { once: true });
  };
  probe.src = full;
}

function scan(root) {
  const scope = root && root.querySelectorAll ? root : document;
  if (scope.matches && scope.matches('img[data-cover]')) hydrateImg(scope);
  scope.querySelectorAll('img[data-cover]').forEach(hydrateImg);
}

export function installCoverEngine() {
  if (engineInstalled) return;
  engineInstalled = true;

  document.addEventListener('load', (event) => {
    const img = event.target;
    if (img && img.tagName === 'IMG' && img.hasAttribute('data-cover')) {
      img.classList.add('is-loaded');
      upgradeToFull(img);
    }
  }, true);

  document.addEventListener('error', (event) => {
    const img = event.target;
    if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-cover')) return;
    const rest = String(img.getAttribute('data-fallbacks') || '').split('|').filter(Boolean);
    if (rest.length) {
      img.setAttribute('data-fallbacks', rest.slice(1).join('|'));
      img.src = rest[0];
      return;
    }
    img.classList.add('is-missing');
    img.remove();
  }, true);

  new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node.nodeType === 1) scan(node);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
}

export function hydrateCovers(root) { scan(root); }
