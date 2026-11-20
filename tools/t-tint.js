(async () => {
  const { store } = await import('./js/core/store.js');
  const repo = await import('./js/data/repo.js');
  await repo.saveSettings({ 'theme.fromCover': true });
  store.set({ theme: { ...store.state.theme, fromCover: true } });
  const rows = document.querySelectorAll('[data-track-id]');
  rows[0].click();
  await new Promise((r) => setTimeout(r, 9000));
  const out = { seed: store.state.theme.coverSeed, primary: getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim(), track: store.state.player.track && store.state.player.track.title };
  const dock = document.querySelector('[data-dock-open]');
  if (dock) dock.click();
  await new Promise((r) => setTimeout(r, 700));
  const ex = document.querySelector('[data-expand]');
  if (ex) ex.click();
  await new Promise((r) => setTimeout(r, 900));
  return out;
})()