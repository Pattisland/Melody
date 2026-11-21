(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  const tab = document.querySelector('[data-tab="albums"]');
  if (tab) tab.click();
  await new Promise((r) => setTimeout(r, 700));
  return { tabs: document.querySelectorAll('.tabbar__tab[data-tab]').length, albums: document.querySelectorAll('[data-album]').length, rows: document.querySelectorAll('[data-track-id]').length };
})()