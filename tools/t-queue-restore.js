(async () => {
  const { store } = await import('./js/core/store.js');
  const idb = await import('./js/data/db.js');
  const rows = await idb.all('queue');
  return { restoredItems: (store.state.tasks.items || []).length, idbQueueRows: rows.length, statuses: (store.state.tasks.items || []).map((t) => t.status) };
})()