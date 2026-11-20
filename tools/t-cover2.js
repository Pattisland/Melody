(async () => {
  const { store } = await import('./js/core/store.js');
  const reg = await import('./js/sources/registry.js');
  const th = await import('./js/core/theme.js');
  const repo = await import('./js/data/repo.js');
  await repo.saveSettings({ 'theme.fromCover': true });
  store.set({ theme: { ...store.state.theme, fromCover: true } });
  document.querySelectorAll('[data-track-id]')[1].click();
  await new Promise((r) => setTimeout(r, 2000));
  const track = store.state.player.track;
  const out = { fromCover: store.state.theme.fromCover, track: track && track.title };
  if (!track) return out;
  out.candidates = reg.artworkCandidates(track, 300);
  out.cached = await repo.getTrackColor(track.id);
  const t0 = Date.now();
  out.direct = await th.sourceColorFromUrl(out.candidates, { proxy: false });
  out.directMs = Date.now() - t0;
  const t1 = Date.now();
  out.withProxy = await th.sourceColorFromUrl(out.candidates);
  out.proxyMs = Date.now() - t1;
  const t2 = Date.now();
  out.secondCall = await th.sourceColorFromUrl(out.candidates);
  out.secondMs = Date.now() - t2;
  await new Promise((r) => setTimeout(r, 2500));
  out.coverSeed = store.state.theme.coverSeed;
  out.primary = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim();
  return out;
})()