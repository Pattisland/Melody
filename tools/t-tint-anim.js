(async () => {
  await new Promise((r) => setTimeout(r, 3200));
  const rows = Array.from(document.querySelectorAll('[data-track-id]'));
  const row = rows.find((r) => r.querySelector('.list-item__art img')) || rows[0];
  row.click();
  await new Promise((r) => setTimeout(r, 2600));
  const nav = document.querySelector('.nav');
  const before = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim();
  const navBefore = getComputedStyle(nav).backgroundColor;
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 200));
  const midNav = getComputedStyle(nav).backgroundColor;
  const midTransform = getComputedStyle(document.getElementById('player')).transform;
  await new Promise((r) => setTimeout(r, 900));
  const after = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim();
  const navAfter = getComputedStyle(nav).backgroundColor;
  return { before, after, navBefore, midNav, navAfter, midIsBetween: midNav !== navBefore && midNav !== navAfter, midTransform };
})()