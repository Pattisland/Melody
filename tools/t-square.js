(async () => {
  await new Promise((r) => setTimeout(r, 2600));
  const card = document.querySelector('[data-recs]');
  const media = Array.from(card.querySelectorAll('.media'));
  const rects = media.map((m) => {
    const art = m.querySelector('.media__art').getBoundingClientRect();
    const sub = m.querySelector('.media__sub').getBoundingClientRect();
    return { w: Math.round(art.width), h: Math.round(art.height), square: Math.abs(art.width - art.height) < 1.5, caption: sub.bottom <= card.getBoundingClientRect().bottom + 1 };
  });
  const cardRect = card.getBoundingClientRect();
  const last = media[media.length - 1].getBoundingClientRect();
  return { count: media.length, rects, cardW: Math.round(cardRect.width), rowUsed: Math.round(last.right - cardRect.left), cardsW: Math.round(cardRect.width) };
})()