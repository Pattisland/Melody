(async () => {
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 3000));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 600));
  document.querySelector('[data-expand]').click();
  await new Promise((r) => setTimeout(r, 700));
  document.querySelector('[data-view="lyrics"]').click();
  await new Promise((r) => setTimeout(r, 800));
  return { selected: document.querySelector('.player__tab[aria-selected="true"]')?.textContent };
})()