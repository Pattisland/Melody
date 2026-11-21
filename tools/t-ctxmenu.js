(async () => {
  await new Promise((r) => setTimeout(r, 3200));
  const row = document.querySelector('[data-track-id]');
  if (!row) return { error: 'no row' };
  const rect = row.getBoundingClientRect();
  const ev = new MouseEvent('contextmenu', { bubbles: true, clientX: rect.left + 240, clientY: rect.top + 20 });
  row.dispatchEvent(ev);
  await new Promise((r) => setTimeout(r, 500));
  const menu = document.querySelector('.menu--popover');
  return { popover: !!menu, items: menu ? Array.from(menu.querySelectorAll('.menu__label')).map((n) => n.textContent) : [], left: menu ? Math.round(menu.getBoundingClientRect().left) : null, top: menu ? Math.round(menu.getBoundingClientRect().top) : null };
})()