(async () => {
  await new Promise((r) => setTimeout(r, 3200));
  document.querySelectorAll('[data-track-id]')[0].click();
  await new Promise((r) => setTimeout(r, 2500));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 120));
  const player = document.getElementById('player');
  const midTransform = getComputedStyle(player).transform;
  await new Promise((r) => setTimeout(r, 900));
  const endTransform = getComputedStyle(player).transform;
  const style = getComputedStyle(player);
  return { midTransform, endTransform, transition: style.transitionProperty + ' / ' + style.transitionDuration };
})()