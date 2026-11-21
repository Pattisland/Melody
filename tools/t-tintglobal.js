(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  const rows = Array.from(document.querySelectorAll('[data-track-id]'));
  const row = rows.find((r) => r.querySelector('.list-item__art img')) || rows[0];
  const before = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim();
  row.click();
  await new Promise((r) => setTimeout(r, 2800));
  document.querySelector('[data-dock-open]').click();
  await new Promise((r) => setTimeout(r, 3000));
  const during = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim();
  const menuBtn = document.querySelector('.player [data-more]');
  if (menuBtn) menuBtn.click();
  await new Promise((r) => setTimeout(r, 400));
  const menu = document.querySelector('.menu--popover');
  const menuBg = menu ? getComputedStyle(menu).backgroundColor : null;
  document.body.click();
  await new Promise((r) => setTimeout(r, 300));
  document.querySelector('.player [data-collapse]').click();
  await new Promise((r) => setTimeout(r, 1000));
  const after = getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim();
  return { before, during, after, changed: before !== during, restored: before === after, menuBg };
})()