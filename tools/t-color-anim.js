(async () => {
  await new Promise((r) => setTimeout(r, 3200));
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 2600));
  const nav = document.querySelector('.nav');
  const before = getComputedStyle(nav).backgroundColor;
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 180));
  const mid = getComputedStyle(nav).backgroundColor;
  const midTransform = getComputedStyle(document.getElementById('player')).transform;
  await new Promise((r) => setTimeout(r, 900));
  const after = getComputedStyle(nav).backgroundColor;
  return { before, mid, after, midIsBetween: mid !== before && mid !== after, midTransform };
})()