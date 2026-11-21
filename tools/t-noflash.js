(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 2200));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 1800));
  const cover = document.querySelector('#player .player__cover img');
  const art = document.querySelector('#dock .dock__art img');
  if (cover) cover.dataset.probe = 'cover';
  if (art) art.dataset.probe = 'art';
  const iconBefore = (document.querySelector('#player [data-toggle] .icon') || {}).textContent;
  document.querySelector('#player [data-toggle]').click();
  await new Promise((r) => setTimeout(r, 700));
  const iconAfter = (document.querySelector('#player [data-toggle] .icon') || {}).textContent;
  const stillCover = !!document.querySelector('#player .player__cover img[data-probe="cover"]');
  const stillArt = !!document.querySelector('#dock .dock__art img[data-probe="art"]');
  document.querySelector('#player [data-toggle]').click();
  await new Promise((r) => setTimeout(r, 500));
  return { iconBefore, iconAfter, stillCover, stillArt };
})()