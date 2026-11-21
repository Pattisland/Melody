(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  const row = document.querySelector('[data-subs] .album-row');
  if (!row) return { empty: true };
  const first = row.querySelector('.media');
  const art = first.querySelector('.media__art').getBoundingClientRect();
  const host = document.querySelector('[data-subs]');
  return { tile: host.style.getPropertyValue('--tile'), w: Math.round(art.width), h: Math.round(art.height), square: Math.abs(art.width - art.height) < 2 };
})()