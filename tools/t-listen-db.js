(async () => {
  await new Promise((r) => setTimeout(r, 2500));
  const { store } = await import('./js/core/store.js');
  const repo = await import('./js/data/repo.js');
  const reg = await import('./js/sources/registry.js');
  const page = (await import('./js/core/router.js')).router.current;
  const track = { id: 'test-listen', title: '测试时长', artist: '测试', album: '', duration: 0, artwork: '', sources: [] };
  const id = await repo.recordListen(store.state.profileId, track);
  await repo.updateListenMs(id, 42000);
  const rows = await repo.listPlays(store.state.profileId, 0);
  const row = rows.find((r) => r.id === id);
  const stats = await repo.listeningStats(store.state.profileId);
  return { id, storedMs: row ? row.ms : null, totalMs: stats.totalMs };
})()