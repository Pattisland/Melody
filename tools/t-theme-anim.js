(async () => {
  await new Promise((r) => setTimeout(r, 2500));
  const th = await import('./js/core/theme.js');
  const body = document.body;
  const before = getComputedStyle(body).backgroundColor;
  th.applyTheme({ seed: '#b3261e' });
  await new Promise((r) => setTimeout(r, 180));
  const mid = getComputedStyle(body).backgroundColor;
  await new Promise((r) => setTimeout(r, 700));
  const after = getComputedStyle(body).backgroundColor;
  return { before, mid, after, animated: mid !== before && mid !== after };
})()