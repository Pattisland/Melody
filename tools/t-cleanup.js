(async () => {
  const idb = await import('./js/data/db.js');
  const rows = await idb.all('plays');
  const doomed = rows.filter((r) => r.trackId === 'test-listen');
  await idb.removeMany('plays', doomed.map((r) => r.id));
  await idb.remove('tracks', 'test-listen');
  const left = await idb.all('plays');
  return { removed: doomed.length, remaining: left.length };
})()