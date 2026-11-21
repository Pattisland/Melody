(async () => {
  await new Promise((r) => setTimeout(r, 2800));
  const host = document.querySelector('[data-recs]');
  const tiles = Array.from(host.querySelectorAll('.media'));
  const firstRow = tiles.filter((t) => Math.abs(t.getBoundingClientRect().top - tiles[0].getBoundingClientRect().top) < 4);
  const gaps = [];
  for (let i = 1; i < firstRow.length; i += 1) gaps.push(Math.round(firstRow[i].getBoundingClientRect().left - firstRow[i - 1].getBoundingClientRect().right));
  const art = tiles[0].querySelector('.media__art').getBoundingClientRect();
  const sub = tiles[0].querySelector('.media__sub').getBoundingClientRect();
  const card = host.getBoundingClientRect();
  return {
    vw: window.innerWidth,
    perRow: firstRow.length,
    tile: Math.round(tiles[0].getBoundingClientRect().width),
    square: Math.abs(art.width - art.height) < 2,
    gaps,
    captionVisible: sub.bottom <= card.bottom + 1,
    rowUsed: Math.round(firstRow[firstRow.length - 1].getBoundingClientRect().right - card.left),
    cardW: Math.round(card.width),
  };
})()