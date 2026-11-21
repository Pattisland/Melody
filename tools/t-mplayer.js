(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 2800));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 1500));
  return { mode: document.getElementById('player').className, tabs: document.querySelectorAll('.player .tabbar__tab').length };
})()