(async () => {
  await new Promise((r) => setTimeout(r, 3200));
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 3000));
  const dock = document.querySelector('[data-dock-open]');
  if (dock) dock.click();
  await new Promise((r) => setTimeout(r, 2000));
  const body = document.querySelector('.player__body');
  return { mode: document.getElementById('player').className, bodyMode: body ? body.dataset.mode : null, tint: getComputedStyle(document.getElementById('player')).getPropertyValue('--player-accent').trim(), fav: !!document.querySelector('[data-fav]') };
})()