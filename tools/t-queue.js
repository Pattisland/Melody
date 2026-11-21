(async () => {
  await new Promise((r) => setTimeout(r, 3200));
  const rows = Array.from(document.querySelectorAll('[data-track-id]'));
  const withArt = rows.find((row) => row.querySelector('.list-item__art img')) || rows[0];
  withArt.click();
  await new Promise((r) => setTimeout(r, 2200));
  const more = withArt.querySelector('[data-more]');
  if (more) more.click();
  await new Promise((r) => setTimeout(r, 500));
  const items = Array.from(document.querySelectorAll('.menu__item'));
  const cacheItem = items.find((b) => /缓存/.test(b.textContent));
  if (cacheItem) cacheItem.click();
  await new Promise((r) => setTimeout(r, 4000));
  const { store } = await import('./js/core/store.js');
  const tasks = (store.state.tasks.items || []).map((t) => ({ id: t.id, status: t.status, got: t.received, total: t.total, err: t.error }));
  return { menuItems: items.length, found: !!cacheItem, tasks, badge: document.querySelector('[data-nav-badge]')?.textContent || null };
})()