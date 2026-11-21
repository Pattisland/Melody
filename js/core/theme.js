/* MD3 动态配色：种子色 -> 全量颜色角色（MCU / HCT） */
import {
  Hct, MaterialDynamicColors, SchemeTonalSpot, SchemeContent, SchemeFidelity,
  hexFromArgb, argbFromHex, sourceColorFromImage,
} from '../../vendor/mcu.js';

const ROLES = ['primary','onPrimary','primaryContainer','onPrimaryContainer','inversePrimary',
  'secondary','onSecondary','secondaryContainer','onSecondaryContainer',
  'tertiary','onTertiary','tertiaryContainer','onTertiaryContainer',
  'error','onError','errorContainer','onErrorContainer',
  'background','onBackground','surface','onSurface','surfaceVariant','onSurfaceVariant',
  'surfaceDim','surfaceBright','surfaceContainerLowest','surfaceContainerLow','surfaceContainer',
  'surfaceContainerHigh','surfaceContainerHighest','inverseSurface','inverseOnSurface',
  'outline','outlineVariant','shadow','scrim','surfaceTint'];

export const DEFAULT_SEED = '#0f6b72';

export const SEED_PRESETS = [
  { hex: '#0f6b72', name: '湖青' },
  { hex: '#3f6b52', name: '苔绿' },
  { hex: '#43608c', name: '湖蓝' },
  { hex: '#5b5a92', name: '暮紫' },
  { hex: '#94506b', name: '绛梅' },
  { hex: '#8a6437', name: '琥珀' },
  { hex: '#4c5a6b', name: '石板' },
  { hex: '#a4472f', name: '赤陶' },
];

export const VARIANTS = [
  { key: 'tonal', name: '色调', desc: 'M3 默认，柔和均衡' },
  { key: 'content', name: '内容', desc: '贴近种子原色' },
  { key: 'fidelity', name: '保真', desc: '最大程度保留种子色' },
];

const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

export function normalizeSeed(input) {
  let s = String(input == null ? '' : input).trim().toLowerCase();
  if (s && s[0] !== '#') s = '#' + s;
  if (/^#[0-9a-f]{3}$/.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  if (!/^#[0-9a-f]{6}$/.test(s)) return DEFAULT_SEED;
  return s;
}

export function isValidSeed(input) {
  let s = String(input == null ? '' : input).trim().toLowerCase();
  if (s && s[0] !== '#') s = '#' + s;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s);
}

export function schemeVars(seed, dark, variant = 'tonal') {
  const Scheme = variant === 'content' ? SchemeContent : variant === 'fidelity' ? SchemeFidelity : SchemeTonalSpot;
  const scheme = new Scheme(Hct.fromInt(argbFromHex(normalizeSeed(seed))), !!dark, 0);
  const out = {};
  for (const role of ROLES) {
    const dc = MaterialDynamicColors[role];
    if (dc) out['--md-sys-color-' + kebab(role)] = hexFromArgb(dc.getArgb(scheme));
  }
  return out;
}

/** 判断一个颜色上应该用黑字还是白字 */
export function onColorFor(hex) {
  const seed = normalizeSeed(hex).slice(1);
  const r = parseInt(seed.slice(0, 2), 16) / 255;
  const g = parseInt(seed.slice(2, 4), 16) / 255;
  const b = parseInt(seed.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? '#000000' : '#ffffff';
}

export function systemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveDark(mode) {
  return mode === 'dark' || (mode !== 'light' && systemDark());
}

let current = { seed: DEFAULT_SEED, mode: 'system', variant: 'tonal' };
let mediaBound = false;

export function currentTheme() { return { ...current }; }

export function applyTheme(next = {}) {
  current = { ...current, ...next };
  current.seed = normalizeSeed(current.seed);
  const dark = resolveDark(current.mode);
  const root = document.documentElement;
  const vars = schemeVars(current.seed, dark, current.variant);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.colorScheme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && vars['--md-sys-color-surface']) meta.setAttribute('content', vars['--md-sys-color-surface']);

  if (!mediaBound) {
    mediaBound = true;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (current.mode === 'system') applyTheme({}); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
  return { dark, vars };
}

function loadImage(url, timeout) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const timer = setTimeout(() => done(null), timeout);
    img.onload = () => { clearTimeout(timer); done(img.naturalWidth ? img : null); };
    img.onerror = () => { clearTimeout(timer); done(null); };
    img.src = url;
  });
}

async function extractOnce(url, timeout) {
  if (!url) return null;
  const img = await loadImage(url, timeout);
  if (!img) return null;
  try {
    const argb = await sourceColorFromImage(img, { maxImageSize: 112 });
    return argb ? hexFromArgb(argb) : null;
  } catch { return null; }
}

/**
 * 从封面取主色（Monet 取色）。可传多个候选，按顺序试第一个能读到像素的。
 * 只有带 Access-Control-Allow-Origin 的封面才能取色（网易云可以，QQ 音乐 CDN 不行）。
 */
const IMAGE_PROXY = 'https://wsrv.nl/?url=';

function proxied(url) {
  return IMAGE_PROXY + encodeURIComponent(url) + '&w=64&h=64&fit=cover&output=jpg&we';
}

export async function sourceColorFromUrl(urls, options = {}) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean).slice(0, 4);
  for (const url of list) {
    const color = await extractOnce(url, 5000);
    if (color) return color;
  }
  // 自读失败（常见于 QQ 音乐 CDN：不带 ACAO）时，逐个借图片代理试，结果会缓存下来
  if (options.proxy !== false && list.length) {
    for (const url of list.slice(0, 3)) {
      const color = await extractOnce(proxied(url), 6000);
      if (color) return color;
    }
  }
  return null;
}
