(async () => {
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 3000));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 700));
  const expand = document.querySelector('[data-expand]');
  if (expand) expand.click();
  await new Promise((r) => setTimeout(r, 800));
  const tab = document.querySelector('[data-view="lyrics"]');
  if (tab) tab.click();
  await new Promise((r) => setTimeout(r, 900));
  return { mode: document.getElementById('player').className, lines: document.querySelectorAll('.player__lyrics .line').length };
})()