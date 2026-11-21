(async () => {
  await new Promise((r) => setTimeout(r, 3200));
  const rows = document.querySelectorAll('[data-track-id]');
  rows[0].click();
  await new Promise((r) => setTimeout(r, 6500));
  const { store } = await import('./js/core/store.js');
  const repo = await import('./js/data/repo.js');
  const stats = await repo.listeningStats(store.state.profileId);
  const plays = await repo.listPlays(store.state.profileId, 0);
  return { totalMs: stats.totalMs, plays: stats.plays, lastMs: plays.length ? plays[plays.length - 1].ms : null };
})()