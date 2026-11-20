#!/usr/bin/env node
/* 从 MCU 生成 CSS 颜色令牌（一次性生成，产物入库）。用法：node tools/gen-tokens.mjs [seed] */
import { writeFile } from 'node:fs/promises';
import { Hct, MaterialDynamicColors, SchemeTonalSpot, SchemeFidelity, SchemeContent,
         hexFromArgb, argbFromHex } from '../vendor/mcu.js';

const ROLES = ['primary','onPrimary','primaryContainer','onPrimaryContainer','inversePrimary',
  'secondary','onSecondary','secondaryContainer','onSecondaryContainer',
  'tertiary','onTertiary','tertiaryContainer','onTertiaryContainer',
  'error','onError','errorContainer','onErrorContainer',
  'background','onBackground','surface','onSurface','surfaceVariant','onSurfaceVariant',
  'surfaceDim','surfaceBright','surfaceContainerLowest','surfaceContainerLow','surfaceContainer',
  'surfaceContainerHigh','surfaceContainerHighest','inverseSurface','inverseOnSurface',
  'outline','outlineVariant','shadow','scrim','surfaceTint'];

const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

export function schemeVars(seed, dark) {
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), !!dark, 0);
  const out = {};
  for (const role of ROLES) {
    const dc = MaterialDynamicColors[role];
    if (dc) out['--md-sys-color-' + kebab(role)] = hexFromArgb(dc.getArgb(scheme));
  }
  return out;
}

const block = (seed, dark) => Object.entries(schemeVars(seed, dark))
  .map(([k, v]) => '  ' + k + ': ' + v + ';').join('\n');

const SEED = process.argv[2] || '#0f6b72';
const css = [
  '/* 自动生成：node tools/gen-tokens.mjs ' + SEED + ' — 不要手改 */',
  ':root {',
  block(SEED, false),
  '}',
  '@media (prefers-color-scheme: dark) {',
  '  :root {',
  block(SEED, true),
  '  }',
  '}',
].join('\n');
await writeFile(new URL('../css/tokens.generated.css', import.meta.url), css + '\n');
console.log('wrote css/tokens.generated.css (' + SEED + ')');
