(async () => {
  await new Promise((r) => setTimeout(r, 2600));
  const card = document.querySelector('[data-recs]');
  const media = card.querySelector('.media');
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; };
  return {
    card: box(card),
    media: box(media),
    art: box(media.querySelector('.media__art')),
    title: box(media.querySelector('.media__title')),
    sub: box(media.querySelector('.media__sub')),
    paddingBottom: getComputedStyle(card).paddingBottom,
    mediaGap: getComputedStyle(media).gap,
    scrollTop: card.scrollTop,
    cqSupport: CSS.supports('container-type: size'),
  };
})()