(async () => {
  await new Promise((r) => setTimeout(r, 2600));
  const card = document.querySelector('[data-recs]');
  const tiles = Array.from(card.querySelectorAll('.media'));
  const xs = [...new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().left)))];
  return {
    vw: window.innerWidth,
    cardW: Math.round(card.getBoundingClientRect().width),
    tiles: tiles.length,
    columns: xs.length,
    pageW: Math.round(document.querySelector('.page').getBoundingClientRect().width),
    artW: Math.round(tiles[0].querySelector('.media__art').getBoundingClientRect().width),
    pageMaxWidth: getComputedStyle(document.querySelector('.page')).maxWidth,
    legacy: document.querySelector('.page').dataset.x || '',
  };
})()