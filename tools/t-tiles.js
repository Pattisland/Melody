(async () => {
  await new Promise((r) => setTimeout(r, 2800));
  const host = document.querySelector('[data-recs]');
  const grid = host.querySelector('.media-grid');
  const tiles = Array.from(host.querySelectorAll('.media'));
  const gaps = [];
  for (let i = 1; i < tiles.length; i += 1) {
    gaps.push(Math.round(tiles[i].getBoundingClientRect().left - tiles[i - 1].getBoundingClientRect().right));
  }
  const art = tiles[0].querySelector('.media__art').getBoundingClientRect();
  return {
    vw: window.innerWidth,
    cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    tile: Math.round(tiles[0].getBoundingClientRect().width),
    artW: Math.round(art.width), artH: Math.round(art.height),
    square: Math.abs(art.width - art.height) < 2,
    gaps,
    hostW: Math.round(host.getBoundingClientRect().width),
    usedW: Math.round(tiles[tiles.length - 1].getBoundingClientRect().right - tiles[0].getBoundingClientRect().left),
  };
})()