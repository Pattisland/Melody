(async () => {
  await new Promise((r) => setTimeout(r, 3200));
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 4200));
  const audio = document.getElementById('audio');
  audio.pause();
  await new Promise((r) => setTimeout(r, 1200));
  const { store } = await import('./js/core/store.js');
  const repo = await import('./js/data/repo.js');
  const plays = await repo.listPlays(store.state.profileId, 0);
  const sorted = plays.sort((a, b) => (a.id || 0) - (b.id || 0));
  const last = sorted[sorted.length - 1];
  const stats = await repo.listeningStats(store.state.profileId);
  return { lastMs: last ? last.ms : null, totalMs: stats.totalMs };
})()