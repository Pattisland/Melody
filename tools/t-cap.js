(async () => {
  await new Promise((r) => setTimeout(r, 2500));
  const card = document.querySelector('[data-recs]');
  const media = card && card.querySelector('.media');
  if (!media) return { error: 'no media' };
  const sub = media.querySelector('.media__sub');
  const cardRect = card.getBoundingClientRect();
  const subRect = sub.getBoundingClientRect();
  return {
    cardBottom: Math.round(cardRect.bottom),
    subBottom: Math.round(subRect.bottom),
    captionVisible: subRect.bottom <= cardRect.bottom,
    titleSize: getComputedStyle(document.querySelector('.home-head__title')).fontSize,
    artWidth: Math.round(media.querySelector('.media__art').getBoundingClientRect().width),
  };
})()