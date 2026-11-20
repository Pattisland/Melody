(async () => {
  const { store } = await import('./js/core/store.js');
  const reg = await import('./js/sources/registry.js');
  const th = await import('./js/core/theme.js');
  const repo = await import('./js/data/repo.js');
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 1500));
  const track = store.state.player.track;
  const out = { title: track && track.title, refs: track && track.sources.map((s) => s.source), artwork: track && track.artwork };
  const cands = reg.artworkCandidates(track, 300);
  out.candidates = cands;
  out.cached = await repo.getTrackColor(track.id);
  const t0 = Date.now();
  out.direct = await th.sourceColorFromUrl(cands, { proxy: false });
  out.directMs = Date.now() - t0;
  const t1 = Date.now();
  out.proxy = await th.sourceColorFromUrl(cands);
  out.proxyMs = Date.now() - t1;
  return out;
})()