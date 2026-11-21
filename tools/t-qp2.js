(async () => {
  const { store } = await import('./js/core/store.js');
  return { restored: (store.state.tasks.items || []).length, statuses: (store.state.tasks.items || []).map((t) => t.status) };
})()