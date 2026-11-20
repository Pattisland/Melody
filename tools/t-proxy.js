(async () => {
  const th = await import('./js/core/theme.js');
  const urls = Array.from(document.querySelectorAll('.list-item__art img')).map((i) => i.src);
  const qq = urls.find((u) => u.includes('tencent')) || urls[0];
  const t0 = Date.now();
  const direct = await th.sourceColorFromUrl([qq], { proxy: false });
  const d = Date.now() - t0;
  const t1 = Date.now();
  const viaProxy = await th.sourceColorFromUrl([qq]);
  return { qq: qq.slice(0, 80), direct, directMs: d, viaProxy, proxyMs: Date.now() - t1 };
})()