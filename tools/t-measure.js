(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 2600));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 1500));
  const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), t: Math.round(r.top), b: Math.round(r.bottom) }; };
  return {
    vw: window.innerWidth,
    inner: pick('.player__inner'),
    body: pick('.player__body'),
    stage: pick('.player__stage'),
    panel: pick('.player__panel'),
    meta: pick('.player__meta'),
    seek: pick('.player__seek'),
    controls: pick('.player__controls'),
    cover: pick('.player__cover'),
    innerStyle: getComputedStyle(document.querySelector('.player__inner')).maxWidth,
  };
})()