(async () => {
  await new Promise((r) => setTimeout(r, 5000));
  const tab = document.querySelector('[data-tab="albums"]');
  if (tab) tab.click();
  await new Promise((r) => setTimeout(r, 900));
  return { tabs: document.querySelectorAll('.tabbar__tab[data-tab]').length, albums: document.querySelectorAll('[data-album]').length };
})()