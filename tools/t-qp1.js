(async () => {
  await new Promise((r) => setTimeout(r, 3200));
  const q = await import('./js/player/queue.js');
  q.pauseAll();
  const rows = Array.from(document.querySelectorAll('[data-track-id]')).slice(0, 2);
  for (const row of rows) {
    const more = row.querySelector('[data-more]');
    if (!more) continue;
    more.click();
    await new Promise((r) => setTimeout(r, 250));
    const item = Array.from(document.querySelectorAll('.menu__item')).find((b) => /缓存/.test(b.textContent));
    if (item) item.click();
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 900));
  const idb = await import('./js/data/db.js');
  const qRows = await idb.all('queue');
  return { paused: q.isPaused(), queueRows: qRows.length, statuses: qRows.map((r) => r.status) };
})()