(async () => {
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 3000));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 600));
  document.querySelector('[data-expand]').click();
  await new Promise((r) => setTimeout(r, 800));
  return { mode: document.getElementById('player').className, tabs: document.querySelectorAll('.player__tab').length };
})()