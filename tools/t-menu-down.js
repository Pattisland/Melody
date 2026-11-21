(async () => {
  await new Promise((r) => setTimeout(r, 3000));
  const rows = Array.from(document.querySelectorAll('[data-track-id]'));
  const last = rows[rows.length - 1];
  const rect = last.getBoundingClientRect();
  last.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: rect.left + 60, clientY: rect.bottom - 4 }));
  await new Promise((r) => setTimeout(r, 500));
  const menu = document.querySelector('.menu--popover');
  if (!menu) return { error: 'no menu' };
  const box = menu.getBoundingClientRect();
  return { clickY: Math.round(rect.bottom - 4), menuTop: Math.round(box.top), opensDownward: box.top >= rect.bottom - 8, menuBottom: Math.round(box.bottom), vh: window.innerHeight, scrollable: getComputedStyle(menu).overflowY };
})()