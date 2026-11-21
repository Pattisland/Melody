(async () => {
  await new Promise((r) => setTimeout(r, 2600));
  const q = (s) => document.querySelector(s);
  const titleSize = getComputedStyle(q('.home-head__title')).fontSize;
  const stats = q('[data-stats] .stats');
  const statsBox = stats.getBoundingClientRect();
  const scroll = q('[data-stats]');
  const scrollBox = scroll.getBoundingClientRect();
  const bars = q('.bars');
  const media = q('[data-recs] .media');
  const sub = media.querySelector('.media__sub').getBoundingClientRect();
  const card = q('[data-recs]').getBoundingClientRect();
  const waves = q('.waves').getBoundingClientRect();
  const page = q('.page').getBoundingClientRect();
  return {
    titleSize,
    statsFits: Math.round(statsBox.bottom) <= Math.round(scrollBox.bottom) + 1,
    statsOverflow: scroll.scrollHeight - scroll.clientHeight,
    barsHeight: Math.round(bars.getBoundingClientRect().height),
    mediaArt: Math.round(media.querySelector('.media__art').getBoundingClientRect().width),
    captionVisible: sub.bottom <= card.bottom + 1,
    wavesFullBleed: Math.round(waves.width) >= Math.round(page.width) - 2,
    wavesLeft: Math.round(waves.left), pageLeft: Math.round(page.left),
  };
})()