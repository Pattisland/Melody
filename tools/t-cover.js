(async () => {
  const { store } = await import('./js/core/store.js');
  const repo = await import('./js/data/repo.js');
  const before = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim();
  await repo.saveSettings({ 'theme.fromCover': true });
  store.set({ theme: { ...store.state.theme, fromCover: true } });
  document.querySelectorAll('[data-track-id]')[1].click();
  await new Promise((r) => setTimeout(r, 7000));
  const after = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim();
  return { before, after, changed: before !== after, coverSeed: store.state.theme.coverSeed };
})()