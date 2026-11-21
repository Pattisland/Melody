(async () => {
  await new Promise((r) => setTimeout(r, 2600));
  const card = document.querySelector('[data-recs]');
  const media = Array.from(card.querySelectorAll('.media'));
  const boxes = media.map((m) => { const r = m.getBoundingClientRect(); const a = m.querySelector('.media__art').getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width), artH: Math.round(a.height) }; });
  const cardRect = card.getBoundingClientRect();
  const last = media[media.length - 1].getBoundingClientRect();
  const sub = media[0].querySelector('.media__sub').getBoundingClientRect();
  return { cardW: Math.round(cardRect.width), boxes, fillRatio: Number(((last.right - cardRect.left) / (cardRect.right - cardRect.left)).toFixed(2)), captionVisible: sub.bottom <= cardRect.bottom + 1 };
})()