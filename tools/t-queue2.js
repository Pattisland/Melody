(async () => {
  await new Promise((r) => setTimeout(r, 3200));
  const rows = Array.from(document.querySelectorAll('[data-track-id]')).slice(0, 3);
  for (const row of rows) {
    const more = row.querySelector('[data-more]');
    if (!more) continue;
    more.click();
    await new Promise((r) => setTimeout(r, 350));
    const item = Array.from(document.querySelectorAll('.menu__item')).find((b) => /缓存/.test(b.textContent));
    if (item) item.click();
    await new Promise((r) => setTimeout(r, 350));
  }
  await new Promise((r) => setTimeout(r, 600));
  const { store } = await import('./js/core/store.js');
  const summary = (store.state.tasks.items || []).map((t) => t.status);
  location.hash = '#/me/tasks';
  await new Promise((r) => setTimeout(r, 900));
  return { summary, badge: document.querySelector('[data-nav-badge]')?.textContent || null, rows: document.querySelectorAll('.task-row').length };
})()