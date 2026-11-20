(async () => {
  const th = await import('./js/core/theme.js');
  const netease = 'https://api.qijieya.cn/meting/?server=netease&type=pic&id=109951166033212116';
  const qq = 'https://api.qijieya.cn/meting/?server=tencent&type=pic&id=001Qu4I30eVFYb';
  const a = await th.sourceColorFromUrl(netease);
  const b = await th.sourceColorFromUrl([qq, netease]);
  const c = await th.sourceColorFromUrl(qq);
  return { netease: a, mixed: b, qqOnly: c };
})()